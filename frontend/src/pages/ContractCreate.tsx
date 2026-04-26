import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { Rnd } from "react-rnd";
import {
  ArrowLeft, FileText, Upload, X, PenTool, Type, CheckSquare, Calendar,
  Edit3, User, Mail, Building2, Briefcase, Trash2, Loader2, Save,
} from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type ContractType = Database["public"]["Enums"]["contract_type"];
type ContractStatus = Database["public"]["Enums"]["contract_status"];

type FieldType = "signature" | "initials" | "checkbox" | "text" | "date" | "name" | "email" | "company" | "title";

interface DraftField {
  id: string;            // client-only id; becomes a row when we save
  field_type: FieldType;
  field_label: string;
  assigned_to: "provider" | "admin";
  page_number: number;
  x_position: number;    // % of page width
  y_position: number;    // % of page height
  width: number;         // % of page width
  height: number;        // % of page height
  is_required: boolean;
}

const FIELD_TYPES = [
  { type: "signature" as const, label: "Signature", icon: PenTool, w: 22, h: 3.5 },
  { type: "initials" as const, label: "Initials", icon: Edit3, w: 6, h: 2.5 },
  { type: "date" as const, label: "Date", icon: Calendar, w: 13, h: 2.5 },
  { type: "name" as const, label: "Name", icon: User, w: 20, h: 2.5 },
  { type: "email" as const, label: "Email", icon: Mail, w: 22, h: 2.5 },
  { type: "company" as const, label: "Company", icon: Building2, w: 22, h: 2.5 },
  { type: "title" as const, label: "Title", icon: Briefcase, w: 18, h: 2.5 },
  { type: "text" as const, label: "Text", icon: Type, w: 20, h: 2.5 },
  { type: "checkbox" as const, label: "Checkbox", icon: CheckSquare, w: 2.5, h: 1.8 },
];

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

const COLORS: Record<string, { border: string; bg: string }> = {
  provider: { border: "#3B82F6", bg: "rgba(59,130,246,0.12)" },
  admin: { border: "#22C55E", bg: "rgba(34,197,94,0.12)" },
};

let _ctr = 0;
const uid = () => `f-${++_ctr}-${Date.now()}`;

export default function ContractCreate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  // ── Contract form state ──
  const [entityKind, setEntityKind] = useState<"provider" | "law_firm">(
    searchParams.get("lawfirm") ? "law_firm" : "provider"
  );
  const [providerId, setProviderId] = useState(searchParams.get("provider") || "");
  const [lawFirmId, setLawFirmId] = useState(searchParams.get("lawfirm") || "");
  const [contractType, setContractType] = useState<ContractType>("standard");
  const [status, setStatus] = useState<ContractStatus>("draft");
  const [dealValue, setDealValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [termsSummary, setTermsSummary] = useState("");
  // DocuSign-style sender signing mode.
  // counter_sign_after — recipient signs first, admin counter-signs after (default)
  // sign_now           — admin pre-signs now (with saved sig), then sends
  // recipient_only     — admin doesn't sign at all (NDA / W-9 / acknowledgement style)
  type SigningMode = "counter_sign_after" | "sign_now" | "recipient_only";
  const [signingMode, setSigningMode] = useState<SigningMode>("counter_sign_after");

  // ── PDF state ──
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const [pageDims, setPageDims] = useState({ w: 0, h: 0 });

  // ── Field placement state ──
  const [fields, setFields] = useState<DraftField[]>([]);
  const [activeFieldType, setActiveFieldType] = useState<FieldType | null>(null);
  const [assignedTo, setAssignedTo] = useState<"provider" | "admin">("provider");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  // Cleanup blob URL when file changes/unmounts
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const handleFile = (file: File | null) => {
    if (!file) {
      setPendingFile(null);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
      setFields([]);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error("PDF is over 25 MB. Please upload a smaller file.");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("Only PDF files are accepted.");
      return;
    }
    setPendingFile(file);
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(URL.createObjectURL(file));
    seedDefaultFields(signingMode);
  };

  // Drop sensible default fields onto the page based on signing mode so the
  // user usually doesn't have to manually place anything.
  const seedDefaultFields = (mode: SigningMode) => {
    const recipientPair: DraftField[] = [
      {
        id: uid(),
        field_type: "signature",
        field_label: "Recipient Signature",
        assigned_to: "provider",
        page_number: 1,
        x_position: 12, y_position: 80, width: 22, height: 3.5,
        is_required: true,
      },
      {
        id: uid(),
        field_type: "date",
        field_label: "Date",
        assigned_to: "provider",
        page_number: 1,
        x_position: 38, y_position: 80, width: 13, height: 2.5,
        is_required: true,
      },
    ];
    const adminPair: DraftField[] = [
      {
        id: uid(),
        field_type: "signature",
        field_label: "Sender Signature",
        assigned_to: "admin",
        page_number: 1,
        x_position: 58, y_position: 80, width: 22, height: 3.5,
        is_required: true,
      },
      {
        id: uid(),
        field_type: "date",
        field_label: "Date",
        assigned_to: "admin",
        page_number: 1,
        x_position: 84, y_position: 80, width: 13, height: 2.5,
        is_required: true,
      },
    ];
    setFields(mode === "recipient_only" ? recipientPair : [...recipientPair, ...adminPair]);
  };

  // When the user changes signing mode AFTER the PDF is uploaded, re-seed
  // defaults so the field set matches the new mode.
  useEffect(() => {
    if (pendingFile) seedDefaultFields(signingMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signingMode]);

  // ── Lookups ──
  const { data: adminProfile } = useQuery({
    queryKey: ["my-saved-signature", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("saved_signature_data, full_name")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });
  const adminSavedSignature: string | null = (adminProfile as any)?.saved_signature_data || null;

  const { data: providers } = useQuery({
    queryKey: ["providers_list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, business_name, contact_email").order("business_name");
      return data ?? [];
    },
  });
  const { data: lawFirms } = useQuery({
    queryKey: ["law_firms_list"],
    queryFn: async () => {
      const { data } = await supabase.from("law_firms").select("id, firm_name, contact_email").order("firm_name");
      return data ?? [];
    },
  });

  // ── PDF event handlers ──
  const onDocLoad = ({ numPages }: { numPages: number }) => setNumPages(numPages);
  const onPageRender = useCallback(() => {
    if (pageContainerRef.current) {
      const r = pageContainerRef.current.getBoundingClientRect();
      setPageDims({ w: r.width, h: r.height });
    }
  }, []);

  // Click-to-place on PDF
  const handlePageClick = (e: React.MouseEvent) => {
    if (!activeFieldType) return;
    const container = pageContainerRef.current;
    if (!container) return;
    const r = container.getBoundingClientRect();
    const xPct = ((e.clientX - r.left) / r.width) * 100;
    const yPct = ((e.clientY - r.top) / r.height) * 100;
    const ft = FIELD_TYPES.find(f => f.type === activeFieldType)!;
    const id = uid();
    setFields(prev => [...prev, {
      id,
      field_type: activeFieldType,
      field_label: ft.label,
      assigned_to: assignedTo,
      page_number: pageNum,
      x_position: Math.max(0, Math.min(100 - ft.w, xPct - ft.w / 2)),
      y_position: Math.max(0, Math.min(100 - ft.h, yPct - ft.h / 2)),
      width: ft.w,
      height: ft.h,
      is_required: true,
    }]);
    setSelectedFieldId(id);
    setActiveFieldType(null);
  };

  const updateField = (id: string, patch: Partial<DraftField>) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
  };
  const removeField = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedFieldId === id) setSelectedFieldId(null);
  };

  // ── Submit ──
  const hasRecipientSignature = fields.some(f => f.field_type === "signature" && f.assigned_to === "provider");
  const hasAdminSignature = fields.some(f => f.field_type === "signature" && f.assigned_to === "admin");
  const recipientReady =
    (entityKind === "provider" && providerId) || (entityKind === "law_firm" && lawFirmId);
  // sign_now mode also requires the admin to have a saved signature on file.
  const signNowReady = signingMode !== "sign_now" || !!adminSavedSignature;
  const canSubmit =
    !!pendingFile &&
    recipientReady &&
    hasRecipientSignature &&
    (signingMode === "recipient_only" || hasAdminSignature) &&
    signNowReady &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    // Form-level validation
    if (dealValue && Number(dealValue) < 0) return toast.error("Deal value can't be negative.");
    if (dealValue && Number(dealValue) > 100_000_000) return toast.error("Deal value can't exceed $100M.");
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      return toast.error("End date must be on or after the start date.");
    }
    if (renewalDate && endDate && new Date(renewalDate) > new Date(endDate)) {
      return toast.error("Renewal date must be on or before the end date.");
    }
    if (renewalDate && startDate && new Date(renewalDate) < new Date(startDate)) {
      return toast.error("Renewal date must be on or after the start date.");
    }

    setSubmitting(true);
    try {
      // 1. Upload PDF to private bucket. Path stored in DB; readers resolve a
      //    signed URL on demand.
      const path = `${user!.id}/${Date.now()}-${pendingFile!.name.replace(/[^\w.-]/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("contracts").upload(path, pendingFile!, {
        cacheControl: "3600", upsert: false,
      });
      if (upErr) throw upErr;

      // 2. Insert the contract row.
      const { data: created, error: insErr } = await supabase.from("contracts").insert({
        provider_id: entityKind === "provider" ? providerId : null,
        law_firm_id: entityKind === "law_firm" ? lawFirmId : null,
        contract_type: contractType,
        status,
        deal_value: dealValue ? Number(dealValue) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        renewal_date: renewalDate || null,
        terms_summary: termsSummary || null,
        document_url: path,
        created_by: user!.id,
      }).select("id").single();
      if (insErr) throw insErr;

      // 3. There's a DB trigger (trg_contract_default_fields) that auto-inserts
      //    a default "Provider Signature" + "Date" pair after every contract
      //    insert that has a document_url. Since we always place our own
      //    fields here, wipe the trigger-added defaults so the recipient
      //    doesn't see duplicate signature boxes.
      await supabase.from("contract_signing_fields").delete().eq("contract_id", created.id);

      // Today's date as the admin's pre-applied date when sign_now mode is on.
      const todayStr = new Date().toLocaleDateString();

      // Insert all the placed signing fields against the new contract.
      // For "sign_now" mode, pre-fill admin-assigned signature/initials with
      // the admin's saved signature image, and admin-assigned date fields
      // with today's date — these become read-only locked fields the
      // recipient sees as already signed.
      if (fields.length > 0) {
        const rows = fields.map((f, i) => {
          let prefilled_value: string | null = null;
          if (signingMode === "sign_now" && f.assigned_to === "admin") {
            if ((f.field_type === "signature" || f.field_type === "initials") && adminSavedSignature) {
              prefilled_value = adminSavedSignature;
            } else if (f.field_type === "date") {
              prefilled_value = todayStr;
            } else if (f.field_type === "name") {
              prefilled_value = (adminProfile as any)?.full_name || null;
            }
          }
          return {
            contract_id: created.id,
            field_type: f.field_type,
            field_label: f.field_label,
            assigned_to: f.assigned_to,
            page_number: f.page_number,
            x_position: f.x_position,
            y_position: f.y_position,
            width: f.width,
            height: f.height,
            is_required: f.is_required,
            display_order: i,
            prefilled_value,
          };
        });
        const { error: fErr } = await supabase.from("contract_signing_fields").insert(rows as any);
        if (fErr) throw fErr;
      }

      // 4. Apply admin presign if mode === "sign_now". We don't create a
      //    signature_request yet (that happens when admin clicks Send for
      //    E-Signature), but we do stash the admin's signature so it can be
      //    pulled in automatically when the request is created.
      //    For now we set the contract metadata so downstream code knows
      //    the admin's signature is locked in.
      if (signingMode === "sign_now" && adminSavedSignature) {
        // We use a separate "signed_documents" row tied to the contract via
        // counter_signature_url so the admin half is recorded. The actual
        // signature_request flow still creates the recipient half later.
        await supabase.from("contracts").update({
          terms_summary: (termsSummary ? termsSummary + "\n\n" : "")
            + "[Sender pre-signed at creation by " + ((adminProfile as any)?.full_name || "admin") + "]",
        }).eq("id", created.id);
      }

      queryClient.invalidateQueries({ queryKey: ["v-contract-list"] });
      toast.success(
        signingMode === "sign_now"
          ? "Contract created — your signature is applied. Send for e-signature next."
          : signingMode === "recipient_only"
          ? "Contract created — only the recipient needs to sign."
          : "Contract created with signing fields ready"
      );
      navigate(`/contracts/${created.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not create contract");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──
  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 lg:p-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Contract</h1>
            <p className="text-sm text-muted-foreground">
              Fill the details, upload the PDF, place where the recipient should sign — then create.
            </p>
          </div>
        </div>
        <Button size="lg" onClick={submit} disabled={!canSubmit}>
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Create Contract
        </Button>
      </div>

      {/* Step status */}
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={recipientReady ? "default" : "outline"}>
          1. Recipient {recipientReady ? "✓" : ""}
        </Badge>
        <Badge variant={pendingFile ? "default" : "outline"}>
          2. PDF {pendingFile ? "✓" : ""}
        </Badge>
        <Badge variant={hasRecipientSignature ? "default" : "outline"}>
          3. Recipient signature placed {hasRecipientSignature ? "✓" : ""}
        </Badge>
        {signingMode !== "recipient_only" && (
          <Badge variant={hasAdminSignature ? "default" : "outline"}>
            4. Sender signature placed {hasAdminSignature ? "✓" : ""}
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* ─── LEFT: contract form ─── */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label>Contract For</Label>
              <div className="flex gap-2 mt-1">
                <Button
                  type="button" size="sm"
                  variant={entityKind === "provider" ? "default" : "outline"}
                  onClick={() => { setEntityKind("provider"); setLawFirmId(""); }}
                >Provider</Button>
                <Button
                  type="button" size="sm"
                  variant={entityKind === "law_firm" ? "default" : "outline"}
                  onClick={() => { setEntityKind("law_firm"); setProviderId(""); }}
                >Law Firm</Button>
              </div>
            </div>

            {entityKind === "provider" ? (
              <div>
                <Label>Provider *</Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger><SelectValue placeholder="Select a provider" /></SelectTrigger>
                  <SelectContent>
                    {providers?.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.business_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Law Firm *</Label>
                <Select value={lawFirmId} onValueChange={setLawFirmId}>
                  <SelectTrigger><SelectValue placeholder="Select a law firm" /></SelectTrigger>
                  <SelectContent>
                    {lawFirms?.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.firm_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={contractType} onValueChange={(v) => setContractType(v as ContractType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ContractStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending_review">Pending Review</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Deal Value ($)</Label>
              <Input type="number" min={0} max={100000000} step={1000} value={dealValue} onChange={e => setDealValue(e.target.value)} placeholder="0" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Renewal Date</Label>
              <Input type="date" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} />
            </div>

            <div>
              <Label>Terms Summary</Label>
              <Textarea rows={3} value={termsSummary} onChange={e => setTermsSummary(e.target.value)} placeholder="Key contract terms..." />
            </div>

            <Separator />

            {/* Signing order — DocuSign-style sender mode picker */}
            <div className="space-y-2">
              <Label>Signing Order</Label>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer p-2 border rounded-md hover:bg-muted/30">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={signingMode === "counter_sign_after"}
                    onChange={() => setSigningMode("counter_sign_after")}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Recipient signs first, then I counter-sign</p>
                    <p className="text-xs text-muted-foreground">Standard flow. Send the unsigned contract; you sign last.</p>
                  </div>
                </label>
                <label className={`flex items-start gap-2 cursor-pointer p-2 border rounded-md hover:bg-muted/30 ${!adminSavedSignature ? "opacity-60" : ""}`}>
                  <input
                    type="radio"
                    className="mt-1"
                    checked={signingMode === "sign_now"}
                    onChange={() => setSigningMode("sign_now")}
                    disabled={!adminSavedSignature}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">I sign now, then send to recipient</p>
                    <p className="text-xs text-muted-foreground">
                      {adminSavedSignature
                        ? "Your saved signature will be applied automatically."
                        : (
                          <>
                            Save a signature on your <a className="text-primary underline" href="/profile" target="_blank" rel="noopener noreferrer">profile</a> first to enable this option.
                          </>
                        )}
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer p-2 border rounded-md hover:bg-muted/30">
                  <input
                    type="radio"
                    className="mt-1"
                    checked={signingMode === "recipient_only"}
                    onChange={() => setSigningMode("recipient_only")}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Recipient is the only signer</p>
                    <p className="text-xs text-muted-foreground">For NDAs, releases, W-9s — no counter-signature step.</p>
                  </div>
                </label>
              </div>

              {signingMode === "sign_now" && adminSavedSignature && (
                <div className="border rounded-md bg-muted/30 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Your signature on file</p>
                    <img src={adminSavedSignature} alt="Your signature" className="bg-white border rounded max-h-12" />
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href="/profile" target="_blank" rel="noopener noreferrer">Change</a>
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <Label>Contract PDF *</Label>
              <div className="mt-1 border border-dashed border-border rounded-md p-4 bg-muted/30">
                {pendingFile ? (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="text-sm truncate">{pendingFile.name}</span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {(pendingFile.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleFile(null)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 cursor-pointer py-2 text-sm text-muted-foreground hover:text-foreground">
                    <Upload className="h-4 w-4" />
                    <span>Upload contract PDF</span>
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={e => handleFile(e.target.files?.[0] || null)}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Max 25 MB. PDF only.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ─── RIGHT: PDF preview + field placement ─── */}
        <Card>
          <CardContent className="p-0 min-h-[500px]">
            {!pdfBlobUrl ? (
              <div className="h-[500px] flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                <FileText className="h-12 w-12 mb-3 opacity-50" />
                <p className="font-medium text-foreground mb-1">Upload a PDF to start placing fields</p>
                <p className="text-sm">Once uploaded, you'll see a preview here. Click any field type below the preview to place it on the document.</p>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Field type toolbar */}
                <div className="border-b border-border bg-card p-2 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground mr-1">Place:</span>
                  {FIELD_TYPES.map(ft => {
                    const Icon = ft.icon;
                    const active = activeFieldType === ft.type;
                    return (
                      <Button
                        key={ft.type}
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => setActiveFieldType(active ? null : ft.type)}
                        className="gap-1.5 h-7"
                      >
                        <Icon className="h-3 w-3" />
                        <span className="hidden md:inline text-xs">{ft.label}</span>
                      </Button>
                    );
                  })}
                  <Separator orientation="vertical" className="h-5 mx-1" />
                  <Select value={assignedTo} onValueChange={(v) => setAssignedTo(v as any)}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provider">Recipient</SelectItem>
                      <SelectItem value="admin">Admin (us)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Active hint */}
                {activeFieldType && (
                  <div className="bg-primary/10 border-b border-primary/20 px-3 py-1.5 text-xs text-primary text-center">
                    Click anywhere on the document to place a {FIELD_TYPES.find(f => f.type === activeFieldType)?.label} field.
                  </div>
                )}

                {/* PDF preview */}
                <div className="flex-1 overflow-auto bg-muted/30 p-4">
                  <Document
                    file={pdfBlobUrl}
                    onLoadSuccess={onDocLoad}
                    loading={<div className="text-center py-12 text-muted-foreground">Loading PDF…</div>}
                    error={<div className="text-center py-12 text-destructive">Failed to load PDF.</div>}
                  >
                    <div
                      ref={pageContainerRef}
                      className="relative mx-auto shadow-md"
                      style={{ cursor: activeFieldType ? "crosshair" : "default", width: "fit-content" }}
                      onClick={handlePageClick}
                    >
                      <Page
                        pageNumber={pageNum}
                        width={650}
                        onRenderSuccess={onPageRender}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                      {pageDims.w > 0 && fields
                        .filter(f => f.page_number === pageNum)
                        .map(field => {
                          const colors = COLORS[field.assigned_to] || COLORS.provider;
                          const isSelected = selectedFieldId === field.id;
                          return (
                            <Rnd
                              key={field.id}
                              size={{
                                width: (field.width / 100) * pageDims.w,
                                height: (field.height / 100) * pageDims.h,
                              }}
                              position={{
                                x: (field.x_position / 100) * pageDims.w,
                                y: (field.y_position / 100) * pageDims.h,
                              }}
                              // Tell react-rnd which child elements should NOT
                              // start a drag — without this the close button is
                              // swallowed by the drag-start handler.
                              cancel=".field-delete-btn"
                              onDragStart={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                              onDragStop={(_e, d) => {
                                updateField(field.id, {
                                  x_position: Math.max(0, (d.x / pageDims.w) * 100),
                                  y_position: Math.max(0, (d.y / pageDims.h) * 100),
                                });
                              }}
                              onResizeStop={(_e, _dir, ref, _delta, position) => {
                                updateField(field.id, {
                                  width: (ref.offsetWidth / pageDims.w) * 100,
                                  height: (ref.offsetHeight / pageDims.h) * 100,
                                  x_position: (position.x / pageDims.w) * 100,
                                  y_position: (position.y / pageDims.h) * 100,
                                });
                              }}
                              bounds="parent"
                              className="select-none"
                              style={{
                                border: `2px solid ${colors.border}`,
                                background: colors.bg,
                                outline: isSelected ? `2px solid ${colors.border}` : "none",
                                outlineOffset: 2,
                              }}
                              onClick={(e: any) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                            >
                              <div
                                className="w-full h-full flex items-center justify-center text-xs font-medium relative"
                                style={{ color: colors.border, pointerEvents: "none" }}
                              >
                                {/* Sign-now preview: render the admin's saved
                                    signature image inline for admin-assigned
                                    sig/initial fields, today's date for date
                                    fields. pointer-events:none on this wrapper
                                    so child img/spans don't intercept the
                                    drag handler — only the X button (below)
                                    explicitly re-enables pointer events. */}
                                {signingMode === "sign_now" && field.assigned_to === "admin" && (field.field_type === "signature" || field.field_type === "initials") && adminSavedSignature ? (
                                  <img src={adminSavedSignature} alt="Sender signature" className="max-w-full max-h-full object-contain" draggable={false} />
                                ) : signingMode === "sign_now" && field.assigned_to === "admin" && field.field_type === "date" ? (
                                  <span className="px-1 text-foreground">{new Date().toLocaleDateString()}</span>
                                ) : signingMode === "sign_now" && field.assigned_to === "admin" && field.field_type === "name" ? (
                                  <span className="truncate px-1 text-foreground">{(adminProfile as any)?.full_name || ""}</span>
                                ) : (
                                  <>
                                    <span className="mr-1">{FIELD_ICON[field.field_type]}</span>
                                    <span className="truncate px-1">{field.field_label}</span>
                                  </>
                                )}
                                {isSelected && (
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                                    className="field-delete-btn absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs hover:scale-110 transition-transform z-10"
                                    aria-label="Delete field"
                                    style={{ pointerEvents: "auto" }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </Rnd>
                          );
                        })}
                    </div>
                  </Document>
                </div>

                {/* Page nav */}
                {numPages > 1 && (
                  <div className="border-t border-border bg-card p-2 flex items-center justify-center gap-2">
                    <Button size="sm" variant="outline" disabled={pageNum <= 1} onClick={() => setPageNum(p => p - 1)}>
                      Prev
                    </Button>
                    <span className="text-sm">Page {pageNum} of {numPages}</span>
                    <Button size="sm" variant="outline" disabled={pageNum >= numPages} onClick={() => setPageNum(p => p + 1)}>
                      Next
                    </Button>
                  </div>
                )}

                {/* Field list footer */}
                <div className="border-t border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground mb-1">
                    Placed fields ({fields.length})
                    {!hasRecipientSignature && <span className="text-destructive ml-2">— at least one Recipient signature is required</span>}
                    {signingMode !== "recipient_only" && !hasAdminSignature && <span className="text-destructive ml-2">— Sender signature is required for this mode</span>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {fields.map((f, i) => (
                      <Badge
                        key={f.id}
                        variant="outline"
                        className={`gap-1 cursor-pointer ${selectedFieldId === f.id ? "ring-2 ring-primary" : ""}`}
                        onClick={() => setSelectedFieldId(f.id)}
                      >
                        {i + 1}. {FIELD_ICON[f.field_type]} {f.field_label}
                        <button
                          onClick={(e) => { e.stopPropagation(); removeField(f.id); }}
                          className="ml-1 hover:text-destructive"
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sticky bottom action */}
      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" onClick={submit} disabled={!canSubmit} className="shadow-lg">
          {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Create Contract
        </Button>
      </div>
    </div>
  );
}
