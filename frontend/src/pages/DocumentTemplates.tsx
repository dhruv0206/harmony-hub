import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FileText, Plus, AlertTriangle, Upload, Pencil, File, Download, ExternalLink,
  MoreVertical, Eye, Send, Copy, XCircle, CheckCircle2, Info,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// ─── Types ──────────────────────────────────────────────────────────────────

interface DocTemplate {
  id: string;
  name: string;
  short_code: string;
  description: string | null;
  document_type: string;
  file_url: string | null;
  file_type: string | null;
  version: number;
  is_active: boolean;
  requires_witness: boolean;
  requires_notary: boolean;
  signing_instructions: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
  participant_type: string;
}

interface ServicePackage {
  id: string;
  name: string;
  short_code: string;
  description: string | null;
  is_active: boolean;
  display_order: number;
  participant_type: string;
}

interface PackageDocument {
  id: string;
  package_id: string;
  template_id: string;
  signing_order: number;
  is_required: boolean;
  condition_description: string | null;
}

const DOC_TYPE_COLORS: Record<string, string> = {
  agreement: "bg-primary/10 text-primary",
  addendum: "bg-accent text-accent-foreground",
  exhibit: "bg-muted text-muted-foreground",
  application: "bg-secondary text-secondary-foreground",
  baa: "bg-primary/20 text-primary",
  acknowledgment: "bg-destructive/10 text-destructive",
};

const DOC_TYPES = ["agreement", "addendum", "exhibit", "application", "baa", "acknowledgment"] as const;

// ─── Hooks ──────────────────────────────────────────────────────────────────

function useTemplates() {
  return useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data as DocTemplate[];
    },
  });
}

function usePackages() {
  return useQuery({
    queryKey: ["service-packages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_packages")
        .select("*")
        .order("display_order");
      if (error) throw error;
      return data as ServicePackage[];
    },
  });
}

function usePackageDocuments() {
  return useQuery({
    queryKey: ["package-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("package_documents")
        .select("*")
        .order("signing_order");
      if (error) throw error;
      return data as PackageDocument[];
    },
  });
}

// ─── PDF Thumbnail ──────────────────────────────────────────────────────────

function PdfThumbnail({ fileUrl }: { fileUrl: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden bg-muted/30">
      <Document
        file={fileUrl}
        loading={<div className="w-full h-full bg-muted animate-pulse" />}
        error={<FileText className="h-10 w-10 text-muted-foreground" />}
      >
        <Page
          pageNumber={1}
          width={240}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </div>
  );
}

// ─── Template Card ──────────────────────────────────────────────────────────

function TemplateCard({
  template,
  packageCount,
  onEdit,
  onToggleActive,
  onUploadFile,
}: {
  template: DocTemplate;
  packageCount: number;
  onEdit: () => void;
  onToggleActive: (active: boolean) => void;
  onUploadFile: (file: File) => void;
}) {
  const navigate = useNavigate();
  const isPdf = template.file_type === "pdf";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleCardClick = () => {
    navigate(`/document-templates/${template.id}`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".docx"))) {
      onUploadFile(f);
    } else {
      toast.error("Only PDF and DOCX files are accepted");
    }
  };

  const hasFile = !!template.file_url;
  const leftBorder = hasFile
    ? "border-l-2 border-l-green-500"
    : "border-l-2 border-l-yellow-500";

  return (
    <Card
      className={`group relative cursor-pointer overflow-hidden transition-all duration-200
        hover:-translate-y-0.5 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)]
        ${leftBorder}
        ${!template.is_active ? "opacity-60" : ""}
        ${dragOver ? "ring-2 ring-primary" : ""}`}
      onClick={handleCardClick}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Thumbnail area — taller */}
      <div className="relative h-[120px] bg-muted/20 border-b border-border overflow-hidden">
        {hasFile ? (
          <>
            {isPdf ? (
              <PdfThumbnail fileUrl={template.file_url!} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary/5">
                <File className="h-14 w-14 text-primary/30" />
                <span className="absolute bottom-2 left-2 text-[10px] font-mono text-muted-foreground bg-background/80 rounded px-1.5 py-0.5">
                  DOCX
                </span>
              </div>
            )}
            <div className="absolute top-2 left-2 bg-background/90 rounded-full p-0.5">
              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <AlertTriangle className="h-8 w-8 text-yellow-500/70" />
            <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">No file uploaded</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadFile(f);
              }}
            />
          </div>
        )}

        {/* Hover 3-dot menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-7 w-7 shadow-sm" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={() => navigate(`/document-templates/${template.id}`)}>
                <Eye className="h-3.5 w-3.5 mr-2" />View Document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5 mr-2" />Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (fileInputRef.current) fileInputRef.current.click(); }}>
                <Upload className="h-3.5 w-3.5 mr-2" />Upload New Version
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/document-templates/${template.id}`)}>
                <Send className="h-3.5 w-3.5 mr-2" />Send to Provider
              </DropdownMenuItem>
              {template.file_url && (
                <DropdownMenuItem onClick={() => window.open(template.file_url!, "_blank")}>
                  <Download className="h-3.5 w-3.5 mr-2" />Download
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onToggleActive(!template.is_active)}>
                <XCircle className="h-3.5 w-3.5 mr-2" />{template.is_active ? "Deactivate" : "Activate"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Card body — more padding */}
      <CardContent className="p-5 space-y-2.5">
        <h3 className="font-semibold text-sm leading-tight truncate">{template.name}</h3>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 rounded">{template.short_code}</Badge>
          <Badge className={`text-xs px-2 py-0.5 rounded ${DOC_TYPE_COLORS[template.document_type] || "bg-muted text-muted-foreground"}`}>
            {template.document_type}
          </Badge>
          <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded">v{template.version}</Badge>
          {packageCount > 0 && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded">{packageCount} pkg</Badge>
          )}
        </div>

        <div className="flex items-center justify-end gap-1 pt-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Edit details">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {template.file_url && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); window.open(template.file_url!, "_blank"); }} title="Download file">
              <Download className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Quick Upload Modal (Simplified for new templates) ──────────────────────

function QuickUploadModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [docType, setDocType] = useState("agreement");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleNameChange = (val: string) => {
    setName(val);
    setShortCode(val.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""));
  };

  const reset = () => {
    setName("");
    setShortCode("");
    setDocType("agreement");
    setFile(null);
  };

  const handleSave = async () => {
    if (!name || !shortCode) { toast.error("Name is required"); return; }
    if (!file) { toast.error("Please upload a file"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${shortCode.toLowerCase()}_v1.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("document-templates")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      // Store the storage path (not a public URL). Readers resolve a signed
      // URL on demand — works whether the bucket is public or private.
      const { data, error } = await supabase
        .from("document_templates")
        .insert({
          name,
          short_code: shortCode,
          document_type: docType,
          file_url: path,
          file_type: ext === "docx" ? "docx" : "pdf",
          version: 1,
          is_active: true,
          created_by: user?.id,
        } as any)
        .select("id")
        .single();
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast.success("Template created");
      onOpenChange(false);
      reset();
      if (data?.id) navigate(`/document-templates/${data.id}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to create template");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload New Template</DialogTitle>
          <DialogDescription>Add a new document template. You can configure advanced settings later.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Document Name *</Label>
            <Input value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g., Provider Network Agreement" />
          </div>

          <div className="space-y-1.5">
            <Label>Document Type *</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>File (PDF or DOCX) *</Label>
            <label
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f && (f.name.endsWith(".pdf") || f.name.endsWith(".docx"))) setFile(f);
                else toast.error("Only PDF and DOCX files are accepted");
              }}
            >
              {file ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Drag & drop or click to upload</span>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }}
              />
            </label>
          </div>

          <div className="space-y-1.5">
            <Label>Short Code</Label>
            <Input
              value={shortCode}
              onChange={(e) => setShortCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
              placeholder="AUTO_GENERATED"
              className="font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground">Auto-generated from name. Edit if needed.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleSave} disabled={uploading || !name || !file}>
            {uploading ? "Uploading..." : "Create Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Template Modal (full fields, for editing existing) ────────────────

function EditTemplateModal({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: DocTemplate | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!template;

  const [form, setForm] = useState({
    name: "",
    short_code: "",
    description: "",
    document_type: "agreement" as string,
    signing_instructions: "",
    display_order: 0,
    requires_witness: false,
    requires_notary: false,
    is_active: true,
  });
  const [uploading, setUploading] = useState(false);

  const handleOpen = useCallback(
    (v: boolean) => {
      if (v && template) {
        setForm({
          name: template.name,
          short_code: template.short_code,
          description: template.description || "",
          document_type: template.document_type,
          signing_instructions: template.signing_instructions || "",
          display_order: template.display_order,
          requires_witness: template.requires_witness,
          requires_notary: template.requires_notary,
          is_active: template.is_active,
        });
      }
      onOpenChange(v);
    },
    [template, onOpenChange]
  );

  const handleSave = async () => {
    if (!form.name || !form.short_code) { toast.error("Name and short code are required"); return; }
    if (!template) return;
    setUploading(true);
    try {
      const { error } = await supabase
        .from("document_templates")
        .update({
          name: form.name,
          short_code: form.short_code,
          description: form.description || null,
          document_type: form.document_type,
          signing_instructions: form.signing_instructions || null,
          display_order: form.display_order,
          requires_witness: form.requires_witness,
          requires_notary: form.requires_notary,
          is_active: form.is_active,
        })
        .eq("id", template.id);
      if (error) throw error;
      toast.success("Template updated");
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to update template");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Template Details</DialogTitle>
          <DialogDescription>Update template metadata and settings.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Short Code *</Label>
            <Input
              value={form.short_code}
              onChange={(e) => setForm(f => ({ ...f, short_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Document Type *</Label>
            <Select value={form.document_type} onValueChange={(v) => setForm(f => ({ ...f, document_type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DOC_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Signing Instructions</Label>
            <Textarea
              value={form.signing_instructions}
              onChange={(e) => setForm(f => ({ ...f, signing_instructions: e.target.value }))}
              rows={2}
              placeholder="Instructions shown to providers before signing."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Display Order</Label>
            <Input type="number" value={form.display_order} onChange={(e) => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={form.requires_witness} onCheckedChange={(v) => setForm(f => ({ ...f, requires_witness: v }))} />
              <Label className="text-sm">Requires Witness</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.requires_notary} onCheckedChange={(v) => setForm(f => ({ ...f, requires_notary: v }))} />
              <Label className="text-sm">Requires Notary</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm(f => ({ ...f, is_active: v }))} />
              <Label className="text-sm">Active</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={uploading}>
            {uploading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Package Modal ─────────────────────────────────────────────────────

function EditPackageModal({
  open,
  onOpenChange,
  pkg,
  templates,
  existingDocs,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pkg: ServicePackage | null;
  templates: DocTemplate[];
  existingDocs: PackageDocument[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [checklist, setChecklist] = useState<
    Record<string, { checked: boolean; signing_order: number; condition: string }>
  >({});
  const [saving, setSaving] = useState(false);

  const handleOpen = useCallback(
    (v: boolean) => {
      if (v && pkg) {
        setName(pkg.name);
        setDescription(pkg.description || "");
        const map: typeof checklist = {};
        templates.forEach((t) => {
          const existing = existingDocs.find((d) => d.template_id === t.id && d.package_id === pkg.id);
          map[t.id] = {
            checked: !!existing,
            signing_order: existing?.signing_order ?? 0,
            condition: existing?.condition_description || "",
          };
        });
        setChecklist(map);
      }
      onOpenChange(v);
    },
    [pkg, templates, existingDocs, onOpenChange]
  );

  const handleSave = async () => {
    if (!pkg) return;
    setSaving(true);
    try {
      const { error: pkgErr } = await supabase
        .from("service_packages")
        .update({ name, description: description || null })
        .eq("id", pkg.id);
      if (pkgErr) throw pkgErr;

      const { error: delErr } = await supabase
        .from("package_documents")
        .delete()
        .eq("package_id", pkg.id);
      if (delErr) throw delErr;

      const inserts = Object.entries(checklist)
        .filter(([, v]) => v.checked)
        .map(([templateId, v]) => ({
          package_id: pkg.id,
          template_id: templateId,
          signing_order: v.signing_order,
          is_required: !v.condition,
          condition_description: v.condition || null,
        }));

      if (inserts.length > 0) {
        const { error: insErr } = await supabase.from("package_documents").insert(inserts);
        if (insErr) throw insErr;
      }

      queryClient.invalidateQueries({ queryKey: ["service-packages"] });
      queryClient.invalidateQueries({ queryKey: ["package-documents"] });
      toast.success("Package updated");
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save package");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Package</DialogTitle>
          <DialogDescription>Configure the documents included in this service package.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Package Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <Separator />
          <Label className="text-sm font-semibold">Document Checklist</Label>

          <div className="space-y-3">
            {templates
              .filter((t) => t.is_active)
              .map((t) => {
                const item = checklist[t.id] || { checked: false, signing_order: 0, condition: "" };
                return (
                  <div key={t.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={(v) =>
                          setChecklist((c) => ({ ...c, [t.id]: { ...item, checked: !!v } }))
                        }
                      />
                      <span className="text-sm font-medium flex-1">{t.name}</span>
                      <Badge className={`text-[10px] ${DOC_TYPE_COLORS[t.document_type]}`}>{t.document_type}</Badge>
                    </div>
                    {item.checked && (
                      <div className="ml-6 space-y-2">
                        <div className="flex gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Signing Order</Label>
                            <Input
                              type="number"
                              className="w-20 h-8 text-sm"
                              value={item.signing_order}
                              onChange={(e) =>
                                setChecklist((c) => ({
                                  ...c,
                                  [t.id]: { ...item, signing_order: parseInt(e.target.value) || 0 },
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-1 flex-1">
                            <Label className="text-xs">Condition (optional)</Label>
                            <Input
                              className="h-8 text-sm"
                              placeholder="e.g., Only if multi-state"
                              value={item.condition}
                              onChange={(e) =>
                                setChecklist((c) => ({
                                  ...c,
                                  [t.id]: { ...item, condition: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                        {item.condition && (
                          <div className="flex items-start gap-1.5 bg-muted/50 rounded p-2">
                            <Info className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                            <p className="text-[11px] text-muted-foreground">
                              This document is <span className="font-medium">conditional</span> — it will only be included when: "{item.condition}".
                              Providers won't see it unless this condition applies.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function DocumentTemplates() {
  const { data: templates, isLoading: loadingTemplates } = useTemplates();
  const { data: packages, isLoading: loadingPackages } = usePackages();
  const { data: packageDocs, isLoading: loadingPkgDocs } = usePackageDocuments();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DocTemplate | null>(null);
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<ServicePackage | null>(null);
  const [participantFilter, setParticipantFilter] = useState<string>("all");

  // Handle ?edit=ID from detail page
  const editId = searchParams.get("edit");
  useEffect(() => {
    if (editId && templates) {
      const tmpl = templates.find(t => t.id === editId);
      if (tmpl) {
        setEditingTemplate(tmpl);
        setEditModalOpen(true);
        setSearchParams({}, { replace: true });
      }
    }
  }, [editId, templates, setSearchParams]);

  const toggleTemplateActive = async (template: DocTemplate, active: boolean) => {
    await supabase.from("document_templates").update({ is_active: active }).eq("id", template.id);
    queryClient.invalidateQueries({ queryKey: ["document-templates"] });
    toast.success(active ? "Template activated" : "Template deactivated");
  };

  const togglePackageActive = async (pkg: ServicePackage, active: boolean) => {
    await supabase.from("service_packages").update({ is_active: active }).eq("id", pkg.id);
    queryClient.invalidateQueries({ queryKey: ["service-packages"] });
  };

  const uploadFileToTemplate = async (template: DocTemplate, file: File) => {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const newVersion = (template.version || 1) + 1;
      const path = `${template.short_code.toLowerCase()}_v${newVersion}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("document-templates")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("document-templates").getPublicUrl(path);

      const { error } = await supabase.from("document_templates").update({
        file_url: urlData.publicUrl,
        file_type: ext === "docx" ? "docx" : "pdf",
        version: newVersion,
      }).eq("id", template.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast.success(`File uploaded (v${newVersion})`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const getPackageCountForTemplate = (templateId: string) =>
    packageDocs?.filter((pd) => pd.template_id === templateId).length ?? 0;

  const getDocsForPackage = (packageId: string) =>
    (packageDocs ?? [])
      .filter((pd) => pd.package_id === packageId)
      .sort((a, b) => a.signing_order - b.signing_order);

  const filteredTemplates = (templates ?? []).filter(t => {
    if (participantFilter === "all") return true;
    return t.participant_type === participantFilter || t.participant_type === "both";
  });

  const filteredPackages = (packages ?? []).filter(p => {
    if (participantFilter === "all") return true;
    return p.participant_type === participantFilter;
  });

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Templates</h1>
          <p className="text-muted-foreground">Manage contract templates and service packages.</p>
        </div>
        <Button onClick={() => setUploadModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Upload New Template
        </Button>
      </div>

      {/* Participant type filter */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {[
          { value: "all", label: "All" },
          { value: "provider", label: "Provider Documents" },
          { value: "law_firm", label: "Law Firm Documents" },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setParticipantFilter(opt.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              participantFilter === opt.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Template Cards */}
      {loadingTemplates ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-lg border border-border overflow-hidden">
              <Skeleton className="h-[120px] rounded-none" />
              <div className="p-5 space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16 rounded" />
                  <Skeleton className="h-5 w-20 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTemplates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              packageCount={getPackageCountForTemplate(t.id)}
              onEdit={() => {
                setEditingTemplate(t);
                setEditModalOpen(true);
              }}
              onToggleActive={(v) => toggleTemplateActive(t, v)}
              onUploadFile={(file) => uploadFileToTemplate(t, file)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <QuickUploadModal open={uploadModalOpen} onOpenChange={setUploadModalOpen} />
      <EditTemplateModal open={editModalOpen} onOpenChange={setEditModalOpen} template={editingTemplate} />

      {/* Service Packages */}
      <Separator />

      <div>
        <h2 className="text-xl font-semibold mb-4">Service Packages</h2>
        {loadingPackages || loadingPkgDocs ? (
          <Skeleton className="h-48" />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Package</TableHead>
                  <TableHead>Short Code</TableHead>
                  <TableHead>Included Documents</TableHead>
                  <TableHead className="w-20">Active</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPackages.map((pkg) => {
                  const docs = getDocsForPackage(pkg.id);
                  return (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">{pkg.short_code}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {docs.map((pd) => {
                            const tmpl = templates?.find((t) => t.id === pd.template_id);
                            if (!tmpl) return null;
                            return (
                              <Badge
                                key={pd.id}
                                className={`text-[10px] ${DOC_TYPE_COLORS[tmpl.document_type]}`}
                                title={pd.condition_description ? `Conditional: ${pd.condition_description}` : undefined}
                              >
                                {tmpl.short_code}
                                {!pd.is_required && " ⚡"}
                              </Badge>
                            );
                          })}
                          {docs.length === 0 && (
                            <span className="text-xs text-muted-foreground">No documents</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Switch checked={pkg.is_active} onCheckedChange={(v) => togglePackageActive(pkg, v)} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingPackage(pkg);
                            setPackageModalOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-2">⚡ = conditional document (included only when condition applies)</p>
      </div>

      <EditPackageModal
        open={packageModalOpen}
        onOpenChange={setPackageModalOpen}
        pkg={editingPackage}
        templates={templates ?? []}
        existingDocs={packageDocs ?? []}
      />
    </div>
  );
}
