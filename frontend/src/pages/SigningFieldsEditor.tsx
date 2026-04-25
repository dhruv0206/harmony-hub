import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { downloadStorageFile } from "@/lib/download-storage-file";
import { sanitizeHtml } from "@/lib/sanitize";
import { toast } from "sonner";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { Rnd } from "react-rnd";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Save, Trash2, PenTool, Type, CheckSquare, Calendar, Edit3,
  X, Loader2, AlertTriangle, Sparkles, User, Mail, Building2, Briefcase,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/* ─── Types ──────────────────────────────────────────────────────────────── */

type FieldType = "signature" | "initials" | "checkbox" | "text" | "date" | "name" | "email" | "company" | "title";

interface SigningField {
  id: string;
  field_type: FieldType;
  field_label: string;
  assigned_to: "provider" | "admin";
  page_number: number;
  x_position: number;   // % of content width
  y_position: number;   // % of container height
  width: number;        // % of content width  (DB column name)
  height: number;       // % of container height (DB column name)
  is_required: boolean;
  placeholder_text: string;
  validation_rule: string;
  display_order: number;
}

type EntityKind = "template" | "contract";

interface AISuggestion {
  field_type: string;
  field_label: string;
  assigned_to: string;
  section?: string;
}

const FIELD_TYPES = [
  { type: "signature" as const, label: "Signature", icon: PenTool, w: 22, h: 3 },
  { type: "initials" as const, label: "Initials", icon: Edit3, w: 6, h: 2 },
  { type: "date" as const, label: "Date Signed", icon: Calendar, w: 13, h: 2 },
  { type: "name" as const, label: "Name", icon: User, w: 20, h: 2 },
  { type: "email" as const, label: "Email", icon: Mail, w: 22, h: 2 },
  { type: "company" as const, label: "Company", icon: Building2, w: 22, h: 2 },
  { type: "title" as const, label: "Title", icon: Briefcase, w: 18, h: 2 },
  { type: "text" as const, label: "Text", icon: Type, w: 20, h: 2 },
  { type: "checkbox" as const, label: "Checkbox", icon: CheckSquare, w: 2.5, h: 1.5 },
];

const COLORS: Record<string, { border: string; bg: string }> = {
  provider: { border: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  admin: { border: "#22C55E", bg: "rgba(34,197,94,0.12)" },
};

const FIELD_ICON: Record<string, string> = {
  signature: "✍",
  initials: "AB",
  checkbox: "☐",
  text: "Abc",
  date: "📅",
  name: "👤",
  email: "✉",
  company: "🏢",
  title: "💼",
};

let _ctr = 0;
const uid = () => `f-${++_ctr}-${Date.now()}`;

/* ═══════════════════════════════════════════════════════════════════════════ */

export default function SigningFieldsEditor() {
  const { id: entityId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  // URL-based mode detection: /document-templates/:id/fields vs /contracts/:id/fields.
  // Each branch hits a different table and back-link, but the editor UI is identical.
  const entity: EntityKind = location.pathname.startsWith("/contracts/") ? "contract" : "template";
  const entityTable = entity === "contract" ? "contracts" : "document_templates";
  const fieldsTable = entity === "contract" ? "contract_signing_fields" : "template_signing_fields";
  const fkColumn = entity === "contract" ? "contract_id" : "template_id";
  const backLink = entity === "contract" ? `/contracts/${entityId}` : `/document-templates/${entityId}`;
  const entityQueryKey = entity === "contract" ? ["contract-for-fields", entityId] : ["document-template", entityId];
  const fieldsQueryKey = entity === "contract" ? ["contract-signing-fields", entityId] : ["template-signing-fields", entityId];

  // ── Core state ──
  const [fields, setFields] = useState<SigningField[]>([]);
  const [activeFieldType, setActiveFieldType] = useState<string | null>(null);
  const [assignedTo, setAssignedTo] = useState<"provider" | "admin">("provider");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Document state ──
  const [docHtml, setDocHtml] = useState("");
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const documentRef = useRef<HTMLDivElement>(null);
  const [documentHeight, setDocumentHeight] = useState(1056);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // ── AI suggestions ──
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  const CONTENT_WIDTH = 672; // 816 - 144 padding

  /* ── Queries ── */
  const { data: entityRow, isLoading: tplLoading } = useQuery({
    queryKey: entityQueryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(entityTable).select("*").eq("id", entityId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!entityId,
  });

  // For contracts the document URL is `document_url`; for templates it's `file_url`.
  // Normalize so the rest of this component reads `template.file_url` regardless.
  const template = useMemo(() => {
    if (!entityRow) return null;
    if (entity === "contract") {
      const url: string | null = entityRow.document_url ?? null;
      const fileType = url?.toLowerCase().endsWith(".pdf") ? "pdf" : "docx";
      return {
        ...entityRow,
        name: `${entityRow.contract_type || "Contract"} contract`,
        file_url: url,
        file_type: fileType,
      };
    }
    return entityRow;
  }, [entityRow, entity]);

  // Contracts store the PDF as a storage path in `document_url`; resolve to a
  // signed URL so react-pdf can fetch it. Templates already use full URLs.
  const { data: resolvedPdfUrl } = useQuery({
    queryKey: ["pdf-file-url", entity, template?.file_url],
    enabled: !!template?.file_url,
    queryFn: async () => {
      const raw = template!.file_url!;
      if (raw.startsWith("http")) return raw;
      const bucket = entity === "contract" ? "contracts" : "document-templates";
      const { data } = await supabase.storage.from(bucket).createSignedUrl(raw, 3600);
      return data?.signedUrl || raw;
    },
  });

  const { data: existingFields } = useQuery({
    queryKey: fieldsQueryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from(fieldsTable).select("*").eq(fkColumn, entityId!).order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!entityId,
  });

  // Load saved fields
  useEffect(() => {
    if (existingFields && existingFields.length > 0 && fields.length === 0 && !dirty) {
      setFields(existingFields.map((f: any) => ({
        id: f.id,
        field_type: f.field_type,
        field_label: f.field_label || "",
        assigned_to: f.assigned_to || "provider",
        page_number: f.page_number,
        x_position: Number(f.x_position),
        y_position: Number(f.y_position),
        width: Number(f.width),
        height: Number(f.height),
        is_required: f.is_required ?? true,
        placeholder_text: f.placeholder_text || "",
        validation_rule: f.validation_rule || "",
        display_order: f.display_order ?? 0,
      })));
    }
  }, [existingFields]);

  /* ── Load DOCX via mammoth ── */
  const fileIsPdf = template?.file_type === "pdf" || (!template?.file_type && template?.file_url?.toLowerCase().endsWith(".pdf"));

  useEffect(() => {
    if (!template?.file_url || fileIsPdf) return;
    let cancelled = false;
    (async () => {
      try {
        setDocLoading(true);
        const ab = await downloadStorageFile(template.file_url!);
        const mammoth = await import("mammoth");
        const result = await (mammoth as any).convertToHtml({ arrayBuffer: ab }, {
          styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "b => strong", "i => em", "u => u",
          ],
        });
        if (!cancelled) { setDocHtml(result.value); setDocError(null); }
      } catch (err: any) {
        if (!cancelled) setDocError(err.message || "Failed to load document");
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [template?.file_url, fileIsPdf]);

  // Measure document height after HTML renders
  useEffect(() => {
    if (!docHtml || !documentRef.current) return;
    const t = setTimeout(() => {
      if (documentRef.current) {
        const h = documentRef.current.scrollHeight;
        setDocumentHeight(h > 100 ? h : 1056);
        setNumPages(1);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [docHtml]);

  /* ── Helpers ── */
  const updateField = useCallback((id: string, u: Partial<SigningField>) => {
    setFields(p => p.map(f => f.id === id ? { ...f, ...u } : f));
    setDirty(true);
  }, []);

  const removeField = useCallback((id: string) => {
    setFields(p => p.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
    setDirty(true);
  }, [selectedFieldId]);

  const selectedField = fields.find(f => f.id === selectedFieldId);

  /* ── Place field on click ── */
  const handleDocumentClick = useCallback((e: React.MouseEvent, pageNum: number, containerEl: HTMLDivElement | null) => {
    if (!activeFieldType) {
      setSelectedFieldId(null);
      return;
    }
    if ((e.target as HTMLElement).closest("[data-rnd]")) return;
    if (!containerEl) return;

    const rect = containerEl.getBoundingClientRect();
    const pw = containerEl.offsetWidth;
    const ph = containerEl.offsetHeight;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const xPct = Math.max(0, Math.min(90, (x / pw) * 100));
    const yPct = Math.max(0, Math.min(95, (y / ph) * 100));

    const ft = FIELD_TYPES.find(t => t.type === activeFieldType)!;
    const newField: SigningField = {
      id: uid(),
      field_type: ft.type,
      field_label: ft.label,
      assigned_to: assignedTo,
      page_number: pageNum,
      x_position: xPct,
      y_position: yPct,
      width: ft.w,
      height: ft.h,
      is_required: true,
      placeholder_text: "",
      validation_rule: "",
      display_order: fields.length,
    };
    setFields(p => [...p, newField]);
    setSelectedFieldId(newField.id);
    setDirty(true);
  }, [activeFieldType, assignedTo, fields.length]);

  /* ── Save ── */
  const handleSave = async () => {
    if (!entityId) return;
    setSaving(true);
    try {
      await (supabase as any).from(fieldsTable).delete().eq(fkColumn, entityId);
      if (fields.length > 0) {
        const rows = fields.map((f, i) => ({
          [fkColumn]: entityId,
          field_type: f.field_type,
          field_label: f.field_label,
          assigned_to: f.assigned_to,
          page_number: f.page_number,
          x_position: f.x_position,
          y_position: f.y_position,
          width: f.width,
          height: f.height,
          is_required: f.is_required,
          placeholder_text: f.placeholder_text || null,
          validation_rule: f.validation_rule || null,
          display_order: i,
        }));
        const { error } = await (supabase as any).from(fieldsTable).insert(rows);
        if (error) throw error;
      }
      toast.success(`Saved ${fields.length} signing field(s)`);
      setDirty(false);
      qc.invalidateQueries({ queryKey: fieldsQueryKey });
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  /* ── AI Suggest ── */
  const handleAiSuggest = async () => {
    if (!template?.file_url) return;
    setAiLoading(true);
    try {
      let documentText = "";
      if (docHtml) {
        const div = document.createElement("div");
        div.innerHTML = docHtml;
        documentText = div.textContent || div.innerText || "";
      } else if (template.extracted_text) {
        documentText = template.extracted_text;
      } else {
        const els = document.querySelectorAll(".react-pdf__Page__textContent");
        els.forEach(el => { documentText += (el as HTMLElement).innerText + "\n"; });
      }
      if (!documentText.trim()) {
        toast.error("Could not extract document text.");
        return;
      }

      const { data, error } = await supabase.functions.invoke("ai-features", {
        body: {
          action: "suggest_signing_fields",
          document_text: documentText.substring(0, 10000),
          document_name: template.name,
        },
      });
      if (error) throw error;
      const result = data?.suggestions || data?.fields || [];
      if (result.length === 0) {
        toast.info("AI could not identify fields. Place them manually.");
        return;
      }
      setSuggestions(result);
      toast.success(`AI suggested ${result.length} fields. Click to add them.`);
    } catch (err: any) {
      toast.error(err.message || "AI suggestion failed");
    } finally {
      setAiLoading(false);
    }
  };

  const addSuggestedField = (s: AISuggestion, idx: number) => {
    const ft = FIELD_TYPES.find(t => t.type === s.field_type) || FIELD_TYPES[7];
    const newField: SigningField = {
      id: uid(),
      field_type: ft.type,
      field_label: s.field_label,
      assigned_to: (s.assigned_to === "admin" ? "admin" : "provider") as any,
      page_number: 1,
      x_position: 5,
      y_position: 2 + (fields.length * 4) % 80,
      width: ft.w,
      height: ft.h,
      is_required: true,
      placeholder_text: "",
      validation_rule: "",
      display_order: fields.length,
    };
    setFields(p => [...p, newField]);
    setSuggestions(p => p.filter((_, i) => i !== idx));
    setSelectedFieldId(newField.id);
    setDirty(true);
  };

  const addAllSuggestions = () => {
    const newFields: SigningField[] = suggestions.map((s, i) => {
      const ft = FIELD_TYPES.find(t => t.type === s.field_type) || FIELD_TYPES[7];
      return {
        id: uid(),
        field_type: ft.type,
        field_label: s.field_label,
        assigned_to: (s.assigned_to === "admin" ? "admin" : "provider"),
        page_number: 1,
        x_position: 5,
        y_position: 2 + ((fields.length + i) * 4) % 80,
        width: ft.w,
        height: ft.h,
        is_required: true,
        placeholder_text: "",
        validation_rule: "",
        display_order: fields.length + i,
      };
    });
    setFields(p => [...p, ...newFields]);
    setSuggestions([]);
    setDirty(true);
  };

  /* ── Keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setSelectedFieldId(null); setActiveFieldType(null); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFieldId) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        removeField(selectedFieldId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedFieldId, removeField]);

  /* ── Render field overlays (for a given page) ── */
  const renderOverlays = (pageNum: number, containerEl: HTMLDivElement | null) => {
    if (!containerEl) return null;
    const pw = containerEl.offsetWidth;
    const ph = containerEl.offsetHeight;
    if (!pw || !ph) return null;

    return fields
      .filter(f => f.page_number === pageNum)
      .map(field => {
        const colors = COLORS[field.assigned_to] || COLORS.provider;
        const isSelected = selectedFieldId === field.id;

        return (
          <Rnd
            key={field.id}
            size={{
              width: (field.width / 100) * pw,
              height: (field.height / 100) * ph,
            }}
            position={{
              x: (field.x_position / 100) * pw,
              y: (field.y_position / 100) * ph,
            }}
            onDragStart={() => setSelectedFieldId(field.id)}
            onDragStop={(_e, d) => {
              updateField(field.id, {
                x_position: Math.max(0, (d.x / pw) * 100),
                y_position: Math.max(0, (d.y / ph) * 100),
              });
            }}
            onResizeStop={(_e, _dir, ref, _delta, position) => {
              updateField(field.id, {
                width: (ref.offsetWidth / pw) * 100,
                height: (ref.offsetHeight / ph) * 100,
                x_position: (position.x / pw) * 100,
                y_position: (position.y / ph) * 100,
              });
            }}
            bounds="parent"
            minWidth={15}
            minHeight={12}
            enableResizing={{
              top: true, right: true, bottom: true, left: true,
              topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
            }}
            resizeHandleStyles={{
              bottomRight: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, bottom: -5, right: -5, cursor: "se-resize", zIndex: 999 },
              bottomLeft: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, bottom: -5, left: -5, cursor: "sw-resize", zIndex: 999 },
              topRight: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, top: -5, right: -5, cursor: "ne-resize", zIndex: 999 },
              topLeft: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, top: -5, left: -5, cursor: "nw-resize", zIndex: 999 },
              right: { width: 6, right: -3, cursor: "e-resize", zIndex: 999 },
              left: { width: 6, left: -3, cursor: "w-resize", zIndex: 999 },
              top: { height: 6, top: -3, cursor: "n-resize", zIndex: 999 },
              bottom: { height: 6, bottom: -3, cursor: "s-resize", zIndex: 999 },
            }}
            style={{
              border: `2px ${isSelected ? "solid" : "dashed"} ${colors.border}`,
              backgroundColor: colors.bg,
              borderRadius: 3,
              zIndex: isSelected ? 100 : 40,
              boxShadow: isSelected ? `0 0 0 3px ${colors.border}40` : "none",
            }}
            data-rnd
            onClick={(e: any) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
          >
            {/* Label pill */}
            <div style={{
              position: "absolute", top: -18, left: 0,
              background: colors.border, color: "#fff",
              fontSize: 9, fontWeight: 600, padding: "1px 6px",
              borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 999,
            }}>
              {field.field_label}
            </div>
            {/* Icon */}
            <div style={{
              width: "100%", height: "100%",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: `${colors.border}66`, fontSize: 11,
              pointerEvents: "none", userSelect: "none",
            }}>
              {FIELD_ICON[field.field_type] || "T"}
            </div>
            {/* Delete */}
            <div
              style={{
                position: "absolute", top: -8, right: -8,
                width: 18, height: 18, borderRadius: "50%",
                background: "#EF4444", color: "#fff",
                display: isSelected ? "flex" : "none",
                alignItems: "center", justifyContent: "center",
                fontSize: 12, cursor: "pointer", zIndex: 999, lineHeight: 1,
              }}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); removeField(field.id); }}
            >
              ×
            </div>
          </Rnd>
        );
      });
  };

  /* ── Loading / error states ── */
  if (tplLoading) {
    return <div className="p-6"><Skeleton className="h-10 w-64 mb-4" /><Skeleton className="h-[600px]" /></div>;
  }
  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">{entity === "contract" ? "Contract" : "Template"} not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(entity === "contract" ? "/contracts" : "/document-templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
      </div>
    );
  }
  if (!template.file_url) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <p>No file uploaded. Upload a document first.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate(backLink)}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back
        </Button>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════════════ */
  /* RENDER                                                                 */
  /* ═══════════════════════════════════════════════════════════════════════ */

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* ─── TOOLBAR ─── */}
      <div className="border-b border-border bg-card px-4 py-2 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate(backLink)}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Back to {template.name}</span>
            <span className="sm:hidden">Back</span>
          </Button>
          <Separator orientation="vertical" className="h-6" />

          {/* Field type buttons */}
          {FIELD_TYPES.map(ft => {
            const Icon = ft.icon;
            const active = activeFieldType === ft.type;
            return (
              <Button
                key={ft.type}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveFieldType(active ? null : ft.type)}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden md:inline">{ft.label}</span>
              </Button>
            );
          })}

          <Separator orientation="vertical" className="h-6" />

          {/* Assigned to */}
          <Select value={assignedTo} onValueChange={v => setAssignedTo(v as any)}>
            <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="provider">Provider</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>

          <Separator orientation="vertical" className="h-6" />

          {/* AI Suggest */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAiSuggest}
            disabled={aiLoading}
            className="gap-1.5 border-purple-500/30 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden lg:inline">{aiLoading ? "Analyzing…" : "✨ Suggest Fields"}</span>
          </Button>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden lg:inline">
              {fields.length} field{fields.length !== 1 ? "s" : ""}
            </span>
            {fields.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive"><Trash2 className="h-3.5 w-3.5 mr-1" />Clear</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all fields?</AlertDialogTitle>
                    <AlertDialogDescription>Remove all {fields.length} fields.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { setFields([]); setSelectedFieldId(null); setDirty(true); }}>Clear All</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button size="sm" onClick={handleSave} disabled={saving || !dirty}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save Fields
            </Button>
          </div>
        </div>
      </div>

      {/* Placement mode banner */}
      {activeFieldType && (
        <div className="bg-primary/10 border-b border-primary/20 px-4 py-1.5 text-xs text-primary text-center shrink-0">
          Click on the document to place a <strong>{FIELD_TYPES.find(f => f.type === activeFieldType)?.label}</strong>.
          Press <kbd className="px-1 py-0.5 bg-primary/20 rounded text-[10px]">Esc</kbd> to cancel.
        </div>
      )}

      {/* ─── MAIN AREA ─── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Document */}
        <div
          className="flex-1 overflow-auto"
          style={{ background: "var(--color-muted, #f5f5f5)", cursor: activeFieldType ? "crosshair" : "default" }}
        >
          {fileIsPdf ? (
            <Document
              file={resolvedPdfUrl || template.file_url}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              loading={<div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
              error={<div className="flex flex-col items-center py-20 text-destructive"><AlertTriangle className="h-8 w-8 mb-2" /><p>Failed to load PDF</p></div>}
            >
              <div className="flex flex-col items-center gap-6 py-6 px-4">
                {Array.from({ length: numPages }, (_, i) => {
                  const pn = i + 1;
                  return (
                    <div key={pn} className="flex flex-col items-center">
                      <PageContainer
                        pageNum={pn}
                        pageRefs={pageRefs}
                        activeFieldType={activeFieldType}
                        onClick={(e, el) => handleDocumentClick(e, pn, el)}
                      >
                        <Page pageNumber={pn} width={816} renderTextLayer={false} renderAnnotationLayer={false} />
                        <OverlayRenderer fields={fields} pageNum={pn} pageRefs={pageRefs} selectedFieldId={selectedFieldId}
                          setSelectedFieldId={setSelectedFieldId} updateField={updateField} removeField={removeField} />
                      </PageContainer>
                      <span className="text-[11px] text-muted-foreground mt-2">Page {pn} of {numPages}</span>
                    </div>
                  );
                })}
              </div>
            </Document>
          ) : (
            <div className="flex flex-col items-center py-6 px-4">
              {docLoading ? (
                <div className="bg-white rounded shadow-lg flex items-center justify-center" style={{ width: 816, minHeight: 600 }}>
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : docError ? (
                <div className="bg-white rounded shadow-lg flex flex-col items-center justify-center p-10" style={{ width: 816, minHeight: 400 }}>
                  <AlertTriangle className="h-8 w-8 text-destructive mb-2" />
                  <p className="text-sm text-destructive">{docError}</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div
                    ref={el => { if (el) pageRefs.current.set(1, el); (documentRef as any).current = el; }}
                    className="relative bg-white rounded shadow-[0_2px_12px_rgba(0,0,0,0.25)] docx-preview"
                    style={{
                      width: 816, minHeight: 600, padding: 72,
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      fontSize: "12pt", lineHeight: 1.6, color: "#1a1a1a",
                      overflow: "visible",
                    }}
                    onClick={e => handleDocumentClick(e, 1, pageRefs.current.get(1) || null)}
                  >
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(docHtml) }} />
                    <OverlayRenderer fields={fields} pageNum={1} pageRefs={pageRefs} selectedFieldId={selectedFieldId}
                      setSelectedFieldId={setSelectedFieldId} updateField={updateField} removeField={removeField} />
                  </div>
                  <span className="text-[11px] text-muted-foreground mt-2">Page 1 of 1</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Sidebar */}
        <div className="w-[300px] border-l border-border bg-card shrink-0 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            {/* Placed fields list */}
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-3">Placed Fields ({fields.length})</h3>
              {fields.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-6">
                  <PenTool className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p>No fields yet.</p>
                  <p className="text-xs mt-1">Select a field type and click the document.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {fields.map((field, idx) => (
                    <div
                      key={field.id}
                      onClick={() => setSelectedFieldId(field.id)}
                      className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer text-sm transition-colors ${
                        selectedFieldId === field.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                        <span className="text-xs">{FIELD_ICON[field.field_type]}</span>
                        <span className="truncate text-sm">{field.field_label}</span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] px-1.5 shrink-0 ${
                        field.assigned_to === "admin" ? "border-green-500 text-green-600" : "border-blue-500 text-blue-600"
                      }`}>{field.assigned_to}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Edit panel */}
            {selectedField && (
              <div className="border-t border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Edit Field</h4>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedFieldId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Label</label>
                  <Input
                    value={selectedField.field_label}
                    onChange={e => updateField(selectedField.id, { field_label: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Type</label>
                  <Select value={selectedField.field_type} onValueChange={v => updateField(selectedField.id, { field_type: v as any })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map(ft => <SelectItem key={ft.type} value={ft.type}>{ft.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Filled by</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant={selectedField.assigned_to === "provider" ? "default" : "outline"}
                      onClick={() => updateField(selectedField.id, { assigned_to: "provider" })}
                      className="text-xs"
                    >Provider</Button>
                    <Button
                      size="sm"
                      variant={selectedField.assigned_to === "admin" ? "default" : "outline"}
                      onClick={() => updateField(selectedField.id, { assigned_to: "admin" })}
                      className="text-xs"
                    >Admin</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Required</span>
                  <button
                    onClick={() => updateField(selectedField.id, { is_required: !selectedField.is_required })}
                    className={`relative w-11 h-6 rounded-full transition-colors ${selectedField.is_required ? "bg-primary" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${selectedField.is_required ? "translate-x-5" : ""}`} />
                  </button>
                </div>

                {selectedField.field_type === "text" && (
                  <>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Placeholder</label>
                      <Input
                        value={selectedField.placeholder_text || ""}
                        onChange={e => updateField(selectedField.id, { placeholder_text: e.target.value })}
                        className="h-8 text-sm"
                        placeholder="e.g. Enter NPI number"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Validation</label>
                      <Select
                        value={selectedField.validation_rule || "none"}
                        onValueChange={v => updateField(selectedField.id, { validation_rule: v === "none" ? "" : v })}
                      >
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No validation</SelectItem>
                          <SelectItem value="email">Email format</SelectItem>
                          <SelectItem value="phone">Phone number</SelectItem>
                          <SelectItem value="zip">ZIP code (US)</SelectItem>
                          <SelectItem value="ssn">SSN</SelectItem>
                          <SelectItem value="number">Number only</SelectItem>
                          <SelectItem value="npi">NPI (10 digits)</SelectItem>
                          <SelectItem value="ein">EIN</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <Button variant="destructive" size="sm" className="w-full" onClick={() => { removeField(selectedField.id); }}>
                  <Trash2 className="h-3 w-3 mr-1" />Delete Field
                </Button>
              </div>
            )}

            {/* AI Suggestions */}
            {suggestions.length > 0 && (
              <div className="border-t border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-purple-600 dark:text-purple-400">✨ AI Suggestions ({suggestions.length})</h4>
                  <button onClick={() => setSuggestions([])} className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Click to add, then drag to position.</p>
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {suggestions.map((s, idx) => (
                    <div
                      key={idx}
                      onClick={() => addSuggestedField(s, idx)}
                      className="flex items-center justify-between px-3 py-2 rounded cursor-pointer hover:bg-purple-500/10 border border-transparent hover:border-purple-500/20 transition group text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-muted-foreground text-xs">{FIELD_ICON[s.field_type] || "T"}</span>
                        <span className="truncate">{s.field_label}</span>
                      </div>
                      <span className="text-[10px] text-purple-500 opacity-0 group-hover:opacity-100 transition shrink-0">+ Add</span>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 border-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                  onClick={addAllSuggestions}
                >
                  Add All Suggestions
                </Button>
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

/* ─── Helper: Page Container (ensures ref is set before overlays render) ── */

function PageContainer({
  pageNum,
  pageRefs,
  activeFieldType,
  onClick,
  children,
}: {
  pageNum: number;
  pageRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  activeFieldType: string | null;
  onClick: (e: React.MouseEvent, el: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) pageRefs.current.set(pageNum, ref.current);
  }, [pageNum, pageRefs]);

  return (
    <div
      ref={ref}
      className="relative bg-white shadow-[0_2px_12px_rgba(0,0,0,0.25)] rounded"
      style={{ overflow: "visible" }}
      onClick={e => onClick(e, ref.current)}
    >
      {children}
    </div>
  );
}

/* ─── Helper: Overlay Renderer ── */

function OverlayRenderer({
  fields,
  pageNum,
  pageRefs,
  selectedFieldId,
  setSelectedFieldId,
  updateField,
  removeField,
}: {
  fields: SigningField[];
  pageNum: number;
  pageRefs: React.MutableRefObject<Map<number, HTMLDivElement>>;
  selectedFieldId: string | null;
  setSelectedFieldId: (id: string | null) => void;
  updateField: (id: string, u: Partial<SigningField>) => void;
  removeField: (id: string) => void;
}) {
  const container = pageRefs.current.get(pageNum);
  if (!container) return null;
  const pw = container.offsetWidth;
  const ph = container.offsetHeight;
  if (!pw || ph < 50) return null;

  return (
    <>
      {fields
        .filter(f => f.page_number === pageNum)
        .map(field => {
          const colors = COLORS[field.assigned_to] || COLORS.provider;
          const isSelected = selectedFieldId === field.id;

          return (
            <Rnd
              key={field.id}
              size={{
                width: (field.width_pct / 100) * pw,
                height: (field.height_pct / 100) * ph,
              }}
              position={{
                x: (field.x_position / 100) * pw,
                y: (field.y_position / 100) * ph,
              }}
              onDragStart={() => setSelectedFieldId(field.id)}
              onDragStop={(_e, d) => {
                updateField(field.id, {
                  x_position: Math.max(0, (d.x / pw) * 100),
                  y_position: Math.max(0, (d.y / ph) * 100),
                });
              }}
              onResizeStop={(_e, _dir, ref, _delta, position) => {
                updateField(field.id, {
                  width_pct: (ref.offsetWidth / pw) * 100,
                  height_pct: (ref.offsetHeight / ph) * 100,
                  x_position: (position.x / pw) * 100,
                  y_position: (position.y / ph) * 100,
                });
              }}
              bounds="parent"
              minWidth={15}
              minHeight={12}
              enableResizing={{
                top: true, right: true, bottom: true, left: true,
                topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
              }}
              resizeHandleStyles={{
                bottomRight: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, bottom: -5, right: -5, cursor: "se-resize", zIndex: 999 },
                bottomLeft: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, bottom: -5, left: -5, cursor: "sw-resize", zIndex: 999 },
                topRight: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, top: -5, right: -5, cursor: "ne-resize", zIndex: 999 },
                topLeft: { width: 10, height: 10, background: "#fff", border: `2px solid ${colors.border}`, borderRadius: 2, top: -5, left: -5, cursor: "nw-resize", zIndex: 999 },
                right: { width: 6, right: -3, cursor: "e-resize", zIndex: 999 },
                left: { width: 6, left: -3, cursor: "w-resize", zIndex: 999 },
                top: { height: 6, top: -3, cursor: "n-resize", zIndex: 999 },
                bottom: { height: 6, bottom: -3, cursor: "s-resize", zIndex: 999 },
              }}
              style={{
                border: `2px ${isSelected ? "solid" : "dashed"} ${colors.border}`,
                backgroundColor: colors.bg,
                borderRadius: 3,
                zIndex: isSelected ? 100 : 40,
                boxShadow: isSelected ? `0 0 0 3px ${colors.border}40` : "none",
              }}
              data-rnd
              onClick={(e: any) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
            >
              <div style={{
                position: "absolute", top: -18, left: 0,
                background: colors.border, color: "#fff",
                fontSize: 9, fontWeight: 600, padding: "1px 6px",
                borderRadius: 3, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 999,
              }}>
                {field.field_label}
              </div>
              <div style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: `${colors.border}66`, fontSize: 11,
                pointerEvents: "none", userSelect: "none",
              }}>
                {FIELD_ICON[field.field_type] || "T"}
              </div>
              <div
                style={{
                  position: "absolute", top: -8, right: -8,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#EF4444", color: "#fff",
                  display: isSelected ? "flex" : "none",
                  alignItems: "center", justifyContent: "center",
                  fontSize: 12, cursor: "pointer", zIndex: 999, lineHeight: 1,
                }}
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); removeField(field.id); }}
              >
                ×
              </div>
            </Rnd>
          );
        })}
    </>
  );
}
