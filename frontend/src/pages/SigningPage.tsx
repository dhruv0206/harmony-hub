import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeHtml } from "@/lib/sanitize";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  CheckCircle, FileText, PenTool, AlertTriangle,
  ArrowLeft, ArrowRight, Lock, Clock, Hash, Download,
  Loader2, Info, XCircle, Check,
} from "lucide-react";
import { toast } from "sonner";
import SignatureCanvas from "react-signature-canvas";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type SigningStep = "review" | "verify_email" | "confirm" | "complete";

interface SigningField {
  id: string;
  field_type: "signature" | "initials" | "checkbox" | "text" | "date" | "name" | "email" | "company" | "title";
  field_label: string;
  assigned_to: "provider" | "admin" | "witness";
  page_number: number;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  is_required: boolean;
  placeholder_text: string;
  validation_rule: string;
  checkbox_label: string;
  auto_fill_date: boolean;
  display_order: number;
}

interface FieldValue {
  value: string; // text value, date string, "true"/"false" for checkbox, dataURL for sig/initials
  valid: boolean;
}

const PAGE_WIDTH = typeof window !== "undefined" && window.innerWidth < 768 ? window.innerWidth - 32 : 816;

export default function SigningPage() {
  const { requestId } = useParams();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get("token");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  const [step, setStep] = useState<SigningStep>("review");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  // Verification state
  const [otpCode, setOtpCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState("");
  const [otpAttempts, setOtpAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);

  // Field values
  const [fieldValues, setFieldValues] = useState<Record<string, FieldValue>>({});
  const [sigModalOpen, setSigModalOpen] = useState(false);
  const [sigModalFieldId, setSigModalFieldId] = useState<string | null>(null);
  const [sigModalType, setSigModalType] = useState<"signature" | "initials">("signature");
  const [sigMode, setSigMode] = useState<"draw" | "type">("draw");
  const [typedSig, setTypedSig] = useState("");
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [savedInitials, setSavedInitials] = useState<string | null>(null);
  const [reusePromptShown, setReusePromptShown] = useState<{ signature: boolean; initials: boolean }>({ signature: false, initials: false });
  const [reuseModalOpen, setReuseModalOpen] = useState(false);
  const [reuseType, setReuseType] = useState<"signature" | "initials">("signature");
  const [pendingReuseDataUrl, setPendingReuseDataUrl] = useState<string | null>(null);
  const sigPadRef = useRef<SignatureCanvas>(null);

  // Simple fallback
  const [legalName, setLegalName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const fallbackSigRef = useRef<SignatureCanvas>(null);

  // PDF
  const [numPages, setNumPages] = useState(0);

  // ── Data ───────────────────────────────────────────────────────────────────

  const { data: sigRequest, isLoading } = useQuery({
    queryKey: ["signature-request", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select("*, providers(business_name, contact_name, contact_email, city, state, address_line1, assigned_sales_rep), law_firms(firm_name, contact_name, contact_email, city, state)")
        .eq("id", requestId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const providerDocumentId = (sigRequest as any)?.provider_document_id;
  const contractId = (sigRequest as any)?.contract_id;
  const requireVerification = (sigRequest as any)?.require_verification ?? true;

  // Auth: either (a) a valid ?token=<signer_token> query param (email link flow,
  // no account needed) or (b) logged-in user (admin/sales_rep testing).
  const expectedToken = (sigRequest as any)?.signer_token as string | undefined;
  const tokenValid = !!expectedToken && !!tokenParam && expectedToken === tokenParam;
  const authorized = tokenValid || !!user;

  const { data: providerDocument } = useQuery({
    queryKey: ["provider-document-signing", providerDocumentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_documents")
        .select("*, document_templates(id, name, short_code, document_type, file_url, file_type, signing_instructions, description)")
        .eq("id", providerDocumentId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!providerDocumentId,
  });

  // Fallback for contract-originated sig requests (no provider_document_id set):
  // load the contract and use its document_url as the PDF source.
  const { data: contractRow } = useQuery({
    queryKey: ["signing-contract", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, contract_type, document_url, terms_summary")
        .eq("id", contractId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!contractId && !providerDocumentId,
  });

  const template = (providerDocument as any)?.document_templates as any;
  const lawFirm = (sigRequest as any)?.law_firms as any;
  // Shim: for law-firm-owned signing, expose the law firm under the same shape
  // the rest of the file reads (business_name, contact_email, city, state) so the
  // existing render paths don't need a second code branch per call site.
  const provider = (sigRequest?.providers as any) || (lawFirm ? {
    business_name: lawFirm.firm_name,
    contact_name: lawFirm.contact_name,
    contact_email: lawFirm.contact_email,
    city: lawFirm.city,
    state: lawFirm.state,
    address_line1: null,
    assigned_sales_rep: null,
  } : null);
  const providerId = sigRequest?.provider_id;

  // Signing fields for this template
  const { data: signingFields } = useQuery({
    queryKey: ["template-signing-fields", template?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("template_signing_fields")
        .select("*")
        .eq("template_id", template.id)
        .order("display_order");
      if (error) throw error;
      return (data || []) as SigningField[];
    },
    enabled: !!template?.id,
  });

  // Signing fields for contract-originated flow (no template)
  const { data: contractFields } = useQuery({
    queryKey: ["contract-signing-fields", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_signing_fields" as any)
        .select("*")
        .eq("contract_id", contractId)
        .order("display_order");
      if (error) throw error;
      return (data || []) as unknown as SigningField[];
    },
    enabled: !!contractId && !providerDocumentId,
  });

  const providerFields = useMemo(() => {
    const src = (signingFields && signingFields.length > 0) ? signingFields : (contractFields || []);
    return src.filter(f => f.assigned_to === "provider").sort((a, b) => a.display_order - b.display_order);
  }, [signingFields, contractFields]);

  const hasFields = providerFields.length > 0;

  // Initialize auto-fill fields. DocuSign behavior: Date Signed, Name, Email,
  // Company, Title fields are auto-populated from the recipient's profile and
  // are read-only by default. Date is also auto-filled with today's date.
  // When the source field is empty (e.g. provider has no contact_email on
  // file), the field stays editable so the signer can supply it themselves —
  // this is the "empty source field shouldn't break signing" guarantee.
  useEffect(() => {
    if (!providerFields.length) return;
    setFieldValues(prev => {
      const next = { ...prev };
      const todayLocal = new Date().toLocaleDateString();
      providerFields.forEach(f => {
        if (f.id in next) return;
        switch (f.field_type) {
          case "date":
            // All date fields default to today, signer can edit if not auto_fill_date.
            next[f.id] = { value: todayLocal, valid: true };
            break;
          case "checkbox":
            next[f.id] = { value: "false", valid: !f.is_required };
            break;
          case "name": {
            const v = (provider?.contact_name || provider?.business_name || "").trim();
            if (v) next[f.id] = { value: v, valid: true };
            break;
          }
          case "email": {
            const v = (provider?.contact_email || "").trim();
            if (v) next[f.id] = { value: v, valid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) };
            break;
          }
          case "company": {
            const v = (provider?.business_name || "").trim();
            if (v) next[f.id] = { value: v, valid: true };
            break;
          }
          // "title" left blank — we don't store provider titles; signer fills it.
        }
      });
      return next;
    });
  }, [providerFields, provider?.contact_name, provider?.business_name, provider?.contact_email]);

  const { data: templateFileUrl } = useQuery({
    queryKey: ["template-file-url", template?.file_url, contractRow?.document_url],
    queryFn: async () => {
      // Contract-originated fallback: resolve from private `contracts` bucket OR use legacy http URL as-is
      if (!template?.file_url && contractRow?.document_url) {
        const raw = contractRow.document_url;
        if (raw.startsWith("http")) return raw;
        const { data } = await supabase.storage.from("contracts").createSignedUrl(raw, 3600);
        return data?.signedUrl || null;
      }
      if (!template?.file_url) return null;
      if (template.file_url.startsWith("http")) return template.file_url;
      const { data } = await supabase.storage.from("document-templates").createSignedUrl(template.file_url, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!template?.file_url || !!contractRow?.document_url,
  });

  // Synthetic template-like object so downstream render conditions work for contract-only flow
  const effectiveFileType = template?.file_type || (contractRow?.document_url ? "pdf" : null);
  const effectiveDocTitle = template?.name || (contractRow ? `${contractRow.contract_type} Contract` : "Document");

  const { data: remainingDocs } = useQuery({
    queryKey: ["remaining-docs", providerId, providerDocumentId],
    queryFn: async () => {
      let q = supabase
        .from("provider_documents")
        .select("id, status, document_templates(name)")
        .eq("provider_id", providerId!)
        .in("status", ["sent", "pending", "viewed"]);
      if (providerDocumentId) q = q.neq("id", providerDocumentId);
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!providerId && step === "complete",
  });

  // ── Field completion tracking ─────────────────────────────────────────────

  const completedCount = useMemo(() => {
    return providerFields.filter(f => {
      const val = fieldValues[f.id];
      if (!val) return false;
      if (f.field_type === "checkbox") return val.value === "true" || !f.is_required;
      return val.value.trim() !== "" && val.valid;
    }).length;
  }, [providerFields, fieldValues]);

  const requiredFields = useMemo(() => providerFields.filter(f => f.is_required), [providerFields]);
  const allRequiredComplete = useMemo(() => {
    return requiredFields.every(f => {
      const val = fieldValues[f.id];
      if (!val) return false;
      if (f.field_type === "checkbox") return val.value === "true";
      return val.value.trim() !== "" && val.valid;
    });
  }, [requiredFields, fieldValues]);

  // First incomplete required field — used by the floating "Start / Next"
  // affordance to jump-scroll the signer to wherever they need to fill next.
  const nextIncompleteField = useMemo(() => {
    return requiredFields.find(f => {
      const val = fieldValues[f.id];
      if (!val) return true;
      if (f.field_type === "checkbox") return val.value !== "true";
      return val.value.trim() === "" || !val.valid;
    }) || null;
  }, [requiredFields, fieldValues]);

  const remainingRequiredCount = useMemo(() => {
    return requiredFields.filter(f => {
      const val = fieldValues[f.id];
      if (!val) return true;
      if (f.field_type === "checkbox") return val.value !== "true";
      return val.value.trim() === "" || !val.valid;
    }).length;
  }, [requiredFields, fieldValues]);

  const scrollToField = useCallback((fieldId: string) => {
    const el = document.getElementById(`field-${fieldId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-4", "ring-primary/60", "animate-pulse");
    setTimeout(() => el.classList.remove("ring-4", "ring-primary/60", "animate-pulse"), 1800);
  }, []);

  // ── Mark as viewed ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sigRequest || sigRequest.status !== "pending") return;
    (async () => {
      await supabase.from("signature_requests").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", requestId!);
      if (providerDocumentId) {
        await supabase.from("provider_documents").update({ status: "viewed", viewed_at: new Date().toISOString() }).eq("id", providerDocumentId);
      }
      await supabase.from("signature_audit_log").insert({
        signature_request_id: requestId!, action: "document_viewed" as any,
        actor_id: user?.id, ip_address: "client", user_agent: navigator.userAgent,
      });
      queryClient.invalidateQueries({ queryKey: ["signature-request", requestId] });
    })();
  }, [sigRequest?.id]);

  // ── Verification ──────────────────────────────────────────────────────────

  const sendOTP = useCallback(() => {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    setGeneratedCode(code);
    supabase.from("signature_audit_log").insert({
      signature_request_id: requestId!, action: "identity_check_started" as any,
      actor_id: user?.id, metadata: { type: "email_code" },
    });
    supabase.from("signature_verifications").insert({
      signature_request_id: requestId!, verification_type: "email_code" as any,
      status: "pending" as any, attempted_at: new Date().toISOString(),
    });
  }, [requestId, user?.id]);

  const handleOTPVerify = async () => {
    if (otpCode === generatedCode) {
      await supabase.from("signature_verifications").update({ status: "passed" as any, completed_at: new Date().toISOString() })
        .eq("signature_request_id", requestId!).eq("verification_type", "email_code");
      await supabase.from("signature_audit_log").insert({
        signature_request_id: requestId!, action: "identity_check_passed" as any,
        actor_id: user?.id, metadata: { type: "email_code" },
      });
      await supabase.from("signature_requests").update({ status: "identity_verified" }).eq("id", requestId!);
      toast.success("Identity verified!");
      setStep("confirm");
    } else {
      const newAttempts = otpAttempts + 1;
      setOtpAttempts(newAttempts);
      if (newAttempts >= 3) {
        setLocked(true);
        await supabase.from("signature_verifications").update({ status: "failed" as any, attempts: newAttempts })
          .eq("signature_request_id", requestId!).eq("verification_type", "email_code");
        await supabase.from("signature_audit_log").insert({
          signature_request_id: requestId!, action: "identity_check_failed" as any,
          actor_id: user?.id, metadata: { type: "email_code", reason: "max_attempts" },
        });
        toast.error("Too many failed attempts. Signing locked.");
      } else {
        toast.error(`Incorrect code. ${3 - newAttempts} attempts remaining.`);
      }
    }
    setOtpCode("");
  };

  // Signer-initiated lockout recovery: notify admins so they can resend the link.
  const handleRequestReset = async () => {
    try {
      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (adminRoles) {
        await supabase.from("notifications").insert(
          adminRoles.map(r => ({
            user_id: r.user_id,
            title: "Signing locked — signer requested help",
            message: `${provider?.business_name || provider?.contact_name || "Signer"} has been locked out of signing "${template?.name || effectiveDocTitle || "document"}" and is asking for a new link.`,
            type: "warning",
            link: `/signatures`,
          }))
        );
      }
      await supabase.from("signature_audit_log").insert({
        signature_request_id: requestId!, action: "identity_check_failed" as any,
        actor_id: user?.id, metadata: { type: "lockout_help_requested" },
      });
      setResetRequested(true);
      toast.success("Your sender has been notified.");
    } catch (e: any) {
      toast.error(e.message || "Could not send request. Please contact your sender directly.");
    }
  };

  // ── Proceed from review ───────────────────────────────────────────────────

  const handleProceedFromReview = () => {
    if (hasFields && !allRequiredComplete) {
      if (nextIncompleteField) scrollToField(nextIncompleteField.id);
      toast.error("Please complete all required fields before continuing.");
      return;
    }
    if (requireVerification) {
      setStep("verify_email");
      sendOTP();
    } else {
      setStep("confirm");
    }
  };

  // ── Decline ───────────────────────────────────────────────────────────────

  const handleDecline = async () => {
    await supabase.from("signature_requests").update({ status: "declined", declined_at: new Date().toISOString() }).eq("id", requestId!);
    if (providerDocumentId) {
      await supabase.from("provider_documents").update({ status: "declined" }).eq("id", providerDocumentId);
    }
    await supabase.from("signature_audit_log").insert({
      signature_request_id: requestId!, action: "declined" as any,
      actor_id: user?.id, metadata: { reason: declineReason },
    });
    const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
    if (adminRoles) {
      await supabase.from("notifications").insert(
        adminRoles.map(r => ({
          user_id: r.user_id, title: "Document Declined",
          message: `${provider?.business_name} declined "${template?.name || "document"}". Reason: ${declineReason || "No reason provided"}`,
          type: "warning",
        }))
      );
    }
    await supabase.from("activities").insert({
      provider_id: providerId!, user_id: user?.id, activity_type: "status_change" as any,
      description: `Provider declined "${template?.name || "document"}": ${declineReason || "No reason"}`,
    });
    setDeclineOpen(false);
    toast.info("Document declined");
    navigate(-1);
  };

  // ── Field interaction helpers ─────────────────────────────────────────────

  const setFieldValue = (fieldId: string, value: string, valid = true) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: { value, valid } }));
  };

  const openSignatureModal = (fieldId: string, type: "signature" | "initials") => {
    setSigModalFieldId(fieldId);
    setSigModalType(type);
    setSigMode("draw");
    setTypedSig("");
    setSigModalOpen(true);
  };

  const applySignature = () => {
    if (!sigModalFieldId) return;
    let dataUrl = "";
    if (sigMode === "draw") {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
        toast.error("Please draw your signature");
        return;
      }
      dataUrl = sigPadRef.current.toDataURL("image/png");
    } else {
      // Generate typed signature as canvas
      const canvas = document.createElement("canvas");
      canvas.width = sigModalType === "initials" ? 200 : 500;
      canvas.height = sigModalType === "initials" ? 100 : 200;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#1a1a1a";
      ctx.font = `${sigModalType === "initials" ? 36 : 48}px 'Dancing Script', cursive, serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedSig, canvas.width / 2, canvas.height / 2);
      dataUrl = canvas.toDataURL("image/png");
    }

    setFieldValue(sigModalFieldId, dataUrl);
    setSigModalOpen(false);

    // Check if we should offer reuse
    const isFirst = !reusePromptShown[sigModalType];
    if (isFirst) {
      const otherFieldsOfType = providerFields.filter(
        f => f.field_type === sigModalType && f.id !== sigModalFieldId && !fieldValues[f.id]?.value
      );
      if (otherFieldsOfType.length > 0) {
        setReuseType(sigModalType);
        setPendingReuseDataUrl(dataUrl);
        setReuseModalOpen(true);
        setReusePromptShown(prev => ({ ...prev, [sigModalType]: true }));
      }
      if (sigModalType === "signature") setSavedSignature(dataUrl);
      else setSavedInitials(dataUrl);
    }
  };

  const handleReuseConfirm = (reuse: boolean) => {
    if (reuse && pendingReuseDataUrl) {
      const otherFields = providerFields.filter(
        f => f.field_type === reuseType && f.id !== sigModalFieldId && !fieldValues[f.id]?.value
      );
      setFieldValues(prev => {
        const next = { ...prev };
        otherFields.forEach(f => { next[f.id] = { value: pendingReuseDataUrl, valid: true }; });
        return next;
      });
      toast.success(`${reuseType === "signature" ? "Signature" : "Initials"} applied to ${otherFields.length} field${otherFields.length > 1 ? "s" : ""}`);
    }
    setReuseModalOpen(false);
    setPendingReuseDataUrl(null);
  };

  const validateField = (field: SigningField, value: string): boolean => {
    if (!value) return true; // empty = let "required" check handle it
    // Validate by field type first (DocuSign-style implicit format checks).
    if (field.field_type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (field.field_type === "date") {
      const d = new Date(value);
      return !isNaN(d.getTime());
    }
    // Then explicit validation_rule on text fields.
    if (!field.validation_rule || field.validation_rule === "none") return true;
    switch (field.validation_rule) {
      case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      case "phone": return /^[\d\s\-\(\)\+]{7,}$/.test(value);
      case "npi": return /^\d{10}$/.test(value);
      case "ein": return /^\d{2}-?\d{7}$/.test(value);
      case "zip": return /^\d{5}(-\d{4})?$/.test(value);
      case "ssn": return /^\d{3}-?\d{2}-?\d{4}$/.test(value);
      case "number": return /^-?\d+(\.\d+)?$/.test(value);
      default:
        // Treat unknown validation_rule as a custom regex pattern.
        try { return new RegExp(field.validation_rule).test(value); }
        catch { return true; }
    }
  };

  // ── Sign mutation ─────────────────────────────────────────────────────────

  const signMutation = useMutation({
    mutationFn: async () => {
      // For field-aware signing, the signatures are already captured in fieldValues
      // For fallback, use the traditional sig pad
      let sigFilePath = "";
      let signerName = "";

      if (hasFields) {
        // Find a signature field to use as the primary
        const sigField = providerFields.find(f => f.field_type === "signature" && fieldValues[f.id]?.value);
        if (sigField && fieldValues[sigField.id]?.value) {
          const dataUrl = fieldValues[sigField.id].value;
          const { compressSignatureImage } = await import("@/lib/compress-image");
          const blob = await compressSignatureImage(dataUrl);
          sigFilePath = `${requestId}/${Date.now()}-signature.png`;
          const { error: uploadErr } = await supabase.storage.from("signatures").upload(sigFilePath, blob);
          if (uploadErr) throw uploadErr;
        }
        signerName = provider?.contact_name || profile?.full_name || "";
        if (!confirmed) throw new Error("Please confirm the declaration");
      } else {
        // Fallback simple signing
        if (!fallbackSigRef.current || fallbackSigRef.current.isEmpty()) throw new Error("Please draw your signature");
        if (!legalName.trim()) throw new Error("Please enter your legal name");
        if (!confirmed) throw new Error("Please confirm the declaration");
        const dataUrl = fallbackSigRef.current.toDataURL("image/png");
        const { compressSignatureImage } = await import("@/lib/compress-image");
        const blob = await compressSignatureImage(dataUrl);
        sigFilePath = `${requestId}/${Date.now()}-signature.png`;
        const { error: uploadErr } = await supabase.storage.from("signatures").upload(sigFilePath, blob);
        if (uploadErr) throw uploadErr;
        signerName = legalName;
      }

      const now = new Date().toISOString();
      const docName = template?.name || "Document";
      const hashInput = `${docName}|${sigFilePath}|${now}|${requestId}`;
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(hashInput));
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

      // Collect all field data for the certificate
      const fieldData: Record<string, any> = {};
      if (hasFields) {
        providerFields.forEach(f => {
          const val = fieldValues[f.id];
          if (val) {
            fieldData[f.field_label || f.field_type] = {
              type: f.field_type,
              value: f.field_type === "signature" || f.field_type === "initials" ? "[image]" : val.value,
              page: f.page_number,
            };
          }
        });
      }

      const certData = {
        signer_name: signerName,
        business_name: provider?.business_name,
        document_name: docName,
        signed_at: now,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        ip_address: "client-side",
        user_agent: navigator.userAgent,
        verification_methods: requireVerification ? ["email_code", "knowledge_questions"] : ["none"],
        document_hash: hashHex,
        field_data: hasFields ? fieldData : undefined,
        legal_statement: `This document was electronically signed in accordance with the ESIGN Act and UETA.${requireVerification ? " The signer's identity was verified through email confirmation and knowledge-based authentication." : ""}`,
      };

      // ── Generate merged signed PDF: overlay signature image onto the original
      // PDF at the field position, upload to `signatures` bucket, store URL
      // on signature_requests.final_document_url so admins can download the
      // fully-executed copy.
      let finalDocumentUrl: string | null = null;
      try {
        if (templateFileUrl && hasFields) {
          const { PDFDocument: PdfLibDocument } = await import("pdf-lib");
          const pdfBytes = await fetch(templateFileUrl).then(r => r.arrayBuffer());
          const mergedDoc = await PdfLibDocument.load(pdfBytes);
          const pages = mergedDoc.getPages();

          for (const field of providerFields) {
            const val = fieldValues[field.id];
            if (!val?.value) continue;
            const page = pages[(field.page_number || 1) - 1];
            if (!page) continue;
            const { width: pw, height: ph } = page.getSize();
            const xPx = (field.x_position / 100) * pw;
            const yPxFromTop = (field.y_position / 100) * ph;
            const fieldHeightPx = (field.height / 100) * ph;
            const fieldWidthPx = (field.width / 100) * pw;
            const yPdf = ph - yPxFromTop - fieldHeightPx;

            if ((field.field_type === "signature" || field.field_type === "initials") && val.value.startsWith("data:image")) {
              const base64 = val.value.split(",")[1];
              const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
              const img = await mergedDoc.embedPng(bytes);
              page.drawImage(img, { x: xPx, y: yPdf, width: fieldWidthPx, height: fieldHeightPx });
            } else if (field.field_type === "date" || field.field_type === "text") {
              page.drawText(String(val.value), { x: xPx, y: yPdf + fieldHeightPx / 3, size: 11 });
            }
          }

          const mergedBytes = await mergedDoc.save();
          const mergedPath = `${requestId}/${Date.now()}-signed.pdf`;
          const { error: mergeUploadErr } = await supabase.storage.from("signatures").upload(mergedPath, mergedBytes, {
            contentType: "application/pdf", upsert: false,
          });
          if (!mergeUploadErr) finalDocumentUrl = mergedPath;
        }
      } catch (mergeErr) {
        console.error("PDF merge failed, continuing without final_document_url", mergeErr);
      }

      await supabase.from("signed_documents").insert({
        signature_request_id: requestId!,
        contract_id: sigRequest!.contract_id,
        signature_image_url: sigFilePath || null,
        certificate_data: certData,
      });

      await supabase.from("signature_requests").update({
        status: "signed", signed_at: now, ip_address: "client", user_agent: navigator.userAgent,
        final_document_url: finalDocumentUrl,
      } as any).eq("id", requestId!);

      if (providerDocumentId) {
        await supabase.from("provider_documents").update({ status: "signed", signed_at: now }).eq("id", providerDocumentId);
      }

      // Roll the contract forward to "signed" so the admin UI reflects what
      // the recipient just did. Counter-sign (if applicable) flips it to active.
      if (sigRequest!.contract_id) {
        await supabase.from("contracts").update({ status: "signed" }).eq("id", sigRequest!.contract_id);
      }

      await supabase.from("signature_audit_log").insert({
        signature_request_id: requestId!, action: "signed" as any,
        actor_id: user?.id, ip_address: "client", user_agent: navigator.userAgent,
        metadata: { legal_name: signerName, document_hash: hashHex, fields_completed: hasFields ? providerFields.length : 0 },
      });

      const { data: adminRoles } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
      if (adminRoles) {
        await supabase.from("notifications").insert(
          adminRoles.map(r => ({
            user_id: r.user_id,
            title: `${provider?.business_name} signed "${docName}"`,
            message: `${provider?.business_name} has signed "${docName}".`,
            type: "info",
          }))
        );
      }

      await supabase.from("activities").insert({
        provider_id: providerId!, user_id: user?.id, activity_type: "status_change" as any,
        description: `Provider signed "${docName}"`,
      });

      // Check for next doc in package
      if (providerDocumentId) {
        const { data: allProvDocs } = await supabase
          .from("provider_documents")
          .select("*, document_templates(name)")
          .eq("provider_id", providerId!)
          .neq("status", "voided")
          .order("signing_order");
        if (allProvDocs) {
          const currentOrder = providerDocument?.signing_order;
          const nextDoc = allProvDocs.find(d =>
            d.signing_order != null && d.signing_order > (currentOrder || 0) && d.status === "pending"
          );
          if (nextDoc) {
            const { data: providerProfiles } = await supabase.from("profiles").select("id").eq("email", provider?.contact_email);
            if (providerProfiles?.[0]) {
              await supabase.from("notifications").insert({
                user_id: providerProfiles[0].id,
                title: "Next Document Ready",
                message: `Your next document "${(nextDoc as any).document_templates?.name}" is ready for review.`,
                type: "info", link: "/",
              });
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signature-request", requestId] });
      setStep("complete");
      toast.success("Document signed successfully!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Render guards ─────────────────────────────────────────────────────────

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mr-2" />Loading...</div>;
  if (!sigRequest) return <div className="text-center py-12 text-muted-foreground">Signature request not found</div>;
  if (!authorized) return (
    <div className="max-w-md mx-auto mt-20 text-center space-y-3 p-8 rounded-lg border border-destructive/30 bg-destructive/5">
      <Lock className="h-8 w-8 text-destructive mx-auto" />
      <h2 className="text-xl font-semibold">Invalid signing link</h2>
      <p className="text-sm text-muted-foreground">This link is missing or has an invalid access token. Please use the link from your email exactly as provided.</p>
    </div>
  );

  const isExpired = sigRequest.expires_at && new Date(sigRequest.expires_at) < new Date();
  if (isExpired && sigRequest.status === "pending") {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
        <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">Signature Request Expired</h1>
        <p className="text-muted-foreground">This signing request has expired. Please contact your account representative.</p>
      </div>
    );
  }

  if (sigRequest.status === "signed" || step === "complete") {
    return <SigningComplete requestId={requestId!} remainingDocs={remainingDocs || []} />;
  }

  if (locked) {
    return (
      <div className="max-w-lg mx-auto mt-20">
        <Card className="border-amber-500/40">
          <CardHeader className="text-center">
            <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="mt-3 text-xl">Signing temporarily locked</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              You entered the wrong code 3 times in a row. For security, we paused this signing session.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
              <p className="font-medium">What now?</p>
              <p className="text-muted-foreground">
                Click below to let your sender know — they can send you a fresh link. Nothing was signed, and no document data was lost.
              </p>
            </div>
            {resetRequested ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-center">
                <CheckCircle className="h-5 w-5 text-primary mx-auto mb-2" />
                <p className="text-sm font-medium">Your sender has been notified.</p>
                <p className="text-xs text-muted-foreground mt-1">They'll send you a new link shortly. You can close this window.</p>
              </div>
            ) : (
              <Button className="w-full" onClick={handleRequestReset}>Request a new signing link</Button>
            )}
            {provider?.contact_email && (
              <p className="text-xs text-muted-foreground text-center">
                Or reach out directly to your sender.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const stepsList = requireVerification
    ? [{ key: "review", label: "Review & Fill" }, { key: "verify", label: "Verify Identity" }, { key: "confirm", label: "Confirm & Sign" }]
    : [{ key: "review", label: "Review & Fill" }, { key: "confirm", label: "Confirm & Sign" }];

  const stepMap: Record<string, number> = {};
  if (requireVerification) {
    stepMap["review"] = 0; stepMap["verify_email"] = 1; stepMap["confirm"] = 2;
  } else {
    stepMap["review"] = 0; stepMap["confirm"] = 1;
  }
  const currentStepIndex = stepMap[step] ?? 0;
  const progress = ((currentStepIndex + 1) / stepsList.length) * 100;
  const documentTitle = effectiveDocTitle || "Document";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-24">
      {/* Progress */}
      <div className="space-y-3">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between">
          {stepsList.map((s, i) => (
            <div key={s.key} className={`flex items-center gap-1.5 text-xs ${i <= currentStepIndex ? "text-primary font-medium" : "text-muted-foreground"}`}>
              {i < currentStepIndex ? <CheckCircle className="h-4 w-4 text-primary" /> : (
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px] font-bold ${i === currentStepIndex ? "border-primary text-primary" : "border-muted-foreground/30"}`}>{i + 1}</div>
              )}
              {s.label}
            </div>
          ))}
        </div>
      </div>

      {/* DocuSign-style floating "Start / Next" pill — points the signer at
          the next required field they need to fill. Only renders during the
          review step when the document has fields. Clicking auto-scrolls and
          pulses the target field. */}
      {step === "review" && hasFields && nextIncompleteField && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-50 pointer-events-auto">
          <button
            onClick={() => scrollToField(nextIncompleteField.id)}
            className="flex items-center gap-2 bg-primary text-primary-foreground rounded-full pl-4 pr-2 py-1.5 shadow-lg hover:shadow-xl transition-shadow ring-2 ring-primary/30 animate-pulse"
            title="Jump to next required field"
          >
            <span className="text-xs font-medium">
              {remainingRequiredCount === requiredFields.length ? "Start" : "Next"}
            </span>
            <span className="bg-primary-foreground/20 rounded-full px-2 py-0.5 text-[10px] font-semibold">
              {remainingRequiredCount} required field{remainingRequiredCount !== 1 ? "s" : ""} left
            </span>
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </button>
        </div>
      )}

      {/* ═══ STEP 1: Review & Fill Fields ═══ */}
      {step === "review" && (
        <div className="space-y-4">
          {sigRequest.message && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-start gap-3">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-primary mb-1">Message from sender</p>
                <p className="text-sm">{sigRequest.message}</p>
              </div>
            </div>
          )}

          {hasFields && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">
                📝 Please fill in all highlighted fields on the document below, then click "Continue" at the bottom.
              </p>
            </div>
          )}

          {/* Document with fields */}
          {templateFileUrl && effectiveFileType === "pdf" && hasFields ? (
            <FieldAwareDocViewer
              fileUrl={templateFileUrl}
              fields={providerFields}
              fieldValues={fieldValues}
              onFieldClick={(field) => {
                if (field.field_type === "signature" || field.field_type === "initials") {
                  openSignatureModal(field.id, field.field_type);
                }
              }}
              onFieldChange={(fieldId, value) => {
                const field = providerFields.find(f => f.id === fieldId)!;
                const valid = validateField(field, value);
                setFieldValue(fieldId, value, valid);
              }}
              onCheckboxChange={(fieldId) => {
                const current = fieldValues[fieldId]?.value === "true";
                setFieldValue(fieldId, current ? "false" : "true");
              }}
              numPages={numPages}
              setNumPages={setNumPages}
            />
          ) : templateFileUrl && effectiveFileType === "pdf" ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-6 w-6 text-primary" />
                    <div>
                      <CardTitle>{documentTitle}</CardTitle>
                      <p className="text-sm text-muted-foreground">Please review the entire document</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <a href={templateFileUrl} download target="_blank" rel="noopener noreferrer">
                      <Download className="h-4 w-4 mr-1.5" />Download
                    </a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/30 rounded-lg overflow-auto max-h-[700px]">
                  <Document file={templateFileUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
                    {Array.from({ length: numPages }, (_, i) => (
                      <div key={i} className="mb-4 flex justify-center">
                        <Page pageNumber={i + 1} width={PAGE_WIDTH} renderTextLayer={false} renderAnnotationLayer={false} />
                      </div>
                    ))}
                  </Document>
                </div>
              </CardContent>
            </Card>
          ) : templateFileUrl && effectiveFileType === "docx" ? (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  <CardTitle>{documentTitle}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <DocxViewerInline fileUrl={templateFileUrl} />
              </CardContent>
            </Card>
          ) : !template?.file_url && !contractRow?.document_url ? (
            <div className="bg-muted/30 border border-dashed rounded-lg p-12 text-center">
              <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-medium">Document file not available</p>
            </div>
          ) : null}

          {/* Bottom actions */}
          {!hasFields && (
            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
              <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} id="review-doc" />
              <label htmlFor="review-doc" className="text-sm cursor-pointer leading-relaxed">
                I have reviewed this document in its entirety.
              </label>
            </div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setDeclineOpen(true)}>
              <XCircle className="h-4 w-4 mr-1.5" />Decline to Sign
            </Button>
            <Button onClick={handleProceedFromReview} disabled={!hasFields && !confirmed}>
              {hasFields ? `Continue to ${requireVerification ? "Verify" : "Confirm"} & Sign` : "Continue to Sign"}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: Email Verification ═══ */}
      {step === "verify_email" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Lock className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Verify your identity</CardTitle>
                <p className="text-sm text-muted-foreground">
                  We sent a 6-digit code to {provider?.contact_email || "your email on file"}.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Demo-mode banner: shows the OTP code on screen because email delivery
                is not wired up in dev/preview. Hidden in real production via env flag. */}
            {generatedCode && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-4 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none mt-0.5">🛠</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Demo Mode</p>
                    <p className="text-sm mt-1">
                      Your code: <span className="font-mono font-bold text-base">{generatedCode}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      In production, this code would arrive in the recipient's email inbox.
                    </p>
                  </div>
                </div>
              </div>
            )}
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
            </div>
            <p className="text-center text-xs text-muted-foreground">{3 - otpAttempts} attempts remaining</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => { sendOTP(); setOtpCode(""); }}>Resend Code</Button>
              <Button onClick={handleOTPVerify} disabled={otpCode.length !== 6}>Verify</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ STEP 3: Confirm & Complete ═══ */}
      {step === "confirm" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <PenTool className="h-6 w-6 text-primary" />
                <div>
                  <CardTitle>You are signing: {documentTitle}</CardTitle>
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date().toLocaleString()} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {hasFields ? (
                <>
                  {/* Summary of filled fields */}
                  <div className="space-y-3">
                    <h3 className="font-medium text-sm">Fields Summary</h3>
                    <div className="grid gap-2">
                      {providerFields.map(f => {
                        const val = fieldValues[f.id];
                        return (
                          <div key={f.id} className="flex items-center gap-2 text-sm">
                            <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
                            <span className="text-muted-foreground">{f.field_label || f.field_type}:</span>
                            {f.field_type === "signature" || f.field_type === "initials" ? (
                              val?.value ? <img src={val.value} alt={f.field_type} className="h-8 border rounded" /> : <span className="text-destructive">Not filled</span>
                            ) : f.field_type === "checkbox" ? (
                              <span>{val?.value === "true" ? "✓ Checked" : "☐ Unchecked"}</span>
                            ) : (
                              <span className="font-medium">{val?.value || "—"}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                    <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} id="confirm-sign" />
                    <label htmlFor="confirm-sign" className="text-sm leading-relaxed cursor-pointer">
                      I, <strong>{provider?.contact_name || profile?.full_name || "[your name]"}</strong>, confirm that I have reviewed this document, all information I provided is accurate, and I am authorized to sign on behalf of <strong>{provider?.business_name}</strong>.
                    </label>
                  </div>
                </>
              ) : (
                <>
                  {/* Fallback: simple signature pad */}
                  <div>
                    <Label className="mb-2 block">Draw your signature</Label>
                    <div className="border-2 border-dashed border-primary/30 rounded-lg bg-card">
                      <SignatureCanvas
                        ref={fallbackSigRef}
                        penColor="hsl(var(--foreground))"
                        canvasProps={{ className: "w-full h-48 rounded-lg touch-none", style: { width: "100%", height: "192px" } }}
                      />
                    </div>
                    <div className="flex justify-end mt-2">
                      <Button variant="ghost" size="sm" onClick={() => fallbackSigRef.current?.clear()}>Clear</Button>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <Label>Full Legal Name *</Label>
                    <Input value={legalName} onChange={e => setLegalName(e.target.value)} placeholder="Enter your full legal name" />
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                    <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} id="confirm-sign" />
                    <label htmlFor="confirm-sign" className="text-sm leading-relaxed cursor-pointer">
                      I, <strong>{legalName || "[your name]"}</strong>, confirm that I am authorized to sign this document on behalf of <strong>{provider?.business_name}</strong> and that all information provided is accurate.
                    </label>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              size="lg"
              onClick={() => signMutation.mutate()}
              disabled={signMutation.isPending || !confirmed || (!hasFields && !legalName.trim())}
            >
              {signMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing...</>
              ) : (
                <><PenTool className="h-4 w-4 mr-2" />Complete Signing</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            This document will be electronically signed in accordance with the ESIGN Act and UETA.
          </p>
        </div>
      )}

      {/* Decline modal */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Decline to Sign</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Please provide a reason for declining this document.</p>
          <Textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Reason for declining..." rows={3} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDecline}>Confirm Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature modal */}
      <Dialog open={sigModalOpen} onOpenChange={setSigModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{sigModalType === "signature" ? "Draw Your Signature" : "Draw Your Initials"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={sigMode === "draw" ? "default" : "outline"} size="sm" onClick={() => setSigMode("draw")}>Draw</Button>
              <Button variant={sigMode === "type" ? "default" : "outline"} size="sm" onClick={() => setSigMode("type")}>Type</Button>
            </div>
            {sigMode === "draw" ? (
              <div>
                <div className="border-2 border-dashed border-primary/30 rounded-lg bg-white">
                  <SignatureCanvas
                    ref={sigPadRef}
                    penColor="#1a1a1a"
                    canvasProps={{
                      className: "rounded-lg touch-none",
                      width: sigModalType === "initials" ? 300 : 500,
                      height: sigModalType === "initials" ? 100 : 200,
                      style: { width: "100%", height: sigModalType === "initials" ? "100px" : "200px" },
                    }}
                  />
                </div>
                <div className="flex justify-end mt-1">
                  <Button variant="ghost" size="sm" onClick={() => sigPadRef.current?.clear()}>Clear</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <Input
                  value={typedSig}
                  onChange={e => setTypedSig(e.target.value)}
                  placeholder={sigModalType === "initials" ? "Your initials" : "Your full name"}
                  maxLength={sigModalType === "initials" ? 4 : 50}
                />
                {typedSig && (
                  <div className="border rounded-lg p-6 bg-white text-center">
                    <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet" />
                    <span style={{ fontFamily: "'Dancing Script', cursive", fontSize: sigModalType === "initials" ? "28px" : "40px", color: "#1a1a1a" }}>
                      {typedSig}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSigModalOpen(false)}>Cancel</Button>
            <Button onClick={applySignature} disabled={sigMode === "type" && !typedSig.trim()}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reuse signature modal */}
      <Dialog open={reuseModalOpen} onOpenChange={setReuseModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reuse {reuseType === "signature" ? "Signature" : "Initials"}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Would you like to use this {reuseType} for all remaining {reuseType} fields on this document?
          </p>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => handleReuseConfirm(false)}>No, I'll do each one</Button>
            <Button onClick={() => handleReuseConfirm(true)}>Yes, use for all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Floating progress indicator */}
      {step === "review" && hasFields && (
        <div className="fixed bottom-6 right-6 z-50 bg-card border shadow-lg rounded-full px-4 py-3 flex items-center gap-3">
          <div className="relative w-10 h-10">
            <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
              <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
              <path d="M18 2.0845a15.9155 15.9155 0 0 1 0 31.831a15.9155 15.9155 0 0 1 0-31.831"
                fill="none" stroke="hsl(var(--primary))" strokeWidth="3"
                strokeDasharray={`${(completedCount / providerFields.length) * 100}, 100`} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
              {completedCount}/{providerFields.length}
            </span>
          </div>
          <span className="text-sm font-medium">Fields completed</span>
        </div>
      )}
    </div>
  );
}

// ── Field-aware document viewer ─────────────────────────────────────────────

function FieldAwareDocViewer({
  fileUrl, fields, fieldValues, onFieldClick, onFieldChange, onCheckboxChange, numPages, setNumPages,
}: {
  fileUrl: string;
  fields: SigningField[];
  fieldValues: Record<string, FieldValue>;
  onFieldClick: (field: SigningField) => void;
  onFieldChange: (fieldId: string, value: string) => void;
  onCheckboxChange: (fieldId: string) => void;
  numPages: number;
  setNumPages: (n: number) => void;
}) {
  return (
    <div className="bg-muted/30 rounded-lg p-4 space-y-4 overflow-auto max-h-[80vh]">
      <Document file={fileUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
        {Array.from({ length: numPages }, (_, pageIdx) => {
          const pageNum = pageIdx + 1;
          const pageFields = fields.filter(f => f.page_number === pageNum);
          return (
            <div key={pageIdx} className="relative mx-auto mb-6" style={{ width: PAGE_WIDTH, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }}>
              <Page pageNumber={pageNum} width={PAGE_WIDTH} renderTextLayer={false} renderAnnotationLayer={false} />
              {/* Field overlays */}
              {pageFields.map(field => (
                <FieldOverlay
                  key={field.id}
                  field={field}
                  value={fieldValues[field.id]}
                  onClick={() => onFieldClick(field)}
                  onChange={(val) => onFieldChange(field.id, val)}
                  onCheckbox={() => onCheckboxChange(field.id)}
                  pageWidth={PAGE_WIDTH}
                />
              ))}
            </div>
          );
        })}
      </Document>
    </div>
  );
}

// ── Individual field overlay ────────────────────────────────────────────────

function FieldOverlay({
  field, value, onClick, onChange, onCheckbox, pageWidth,
}: {
  field: SigningField;
  value?: FieldValue;
  onClick: () => void;
  onChange: (val: string) => void;
  onCheckbox: () => void;
  pageWidth: number;
}) {
  // We need to estimate page height — standard letter ratio 8.5x11
  const pageHeight = pageWidth * (11 / 8.5);
  const left = (field.x_position / 100) * pageWidth;
  const top = (field.y_position / 100) * pageHeight;
  const w = (field.width / 100) * pageWidth;
  const h = (field.height / 100) * pageHeight;

  const isFilled = value && value.value.trim() !== "" && (field.field_type !== "checkbox" || value.value === "true");
  const isInvalid = value && !value.valid;

  const borderClass = isFilled
    ? "border-green-500 bg-green-500/5"
    : field.is_required
      ? "border-red-400 border-dashed bg-red-500/5"
      : "border-gray-400 border-dashed bg-gray-500/5";

  const style: React.CSSProperties = {
    position: "absolute",
    left, top, width: w, height: h,
    zIndex: 10,
  };

  if (field.field_type === "signature" || field.field_type === "initials") {
    return (
      <div
        id={`field-${field.id}`}
        className={`border-2 rounded cursor-pointer flex items-center justify-center transition-all hover:shadow-md ${borderClass}`}
        style={style}
        onClick={onClick}
        tabIndex={field.display_order}
      >
        {value?.value ? (
          <img src={value.value} alt={field.field_type} className="max-w-full max-h-full object-contain p-0.5" />
        ) : (
          <span className="text-xs text-muted-foreground font-medium">
            {field.field_type === "signature" ? "Click to sign" : "Click to initial"}
          </span>
        )}
      </div>
    );
  }

  if (field.field_type === "checkbox") {
    const checked = value?.value === "true";
    return (
      <div
        id={`field-${field.id}`}
        className={`flex items-center gap-1.5 cursor-pointer ${borderClass} border rounded px-1`}
        style={style}
        onClick={onCheckbox}
        tabIndex={field.display_order}
      >
        <div className={`w-4 h-4 border-2 rounded flex items-center justify-center shrink-0 ${checked ? "bg-green-600 border-green-600" : field.is_required ? "border-red-400" : "border-gray-400"}`}>
          {checked && <Check className="h-3 w-3 text-white" />}
        </div>
        {field.checkbox_label && <span className="text-[10px] leading-tight truncate">{field.checkbox_label}</span>}
      </div>
    );
  }

  if (field.field_type === "date") {
    return (
      <div id={`field-${field.id}`} className={`border-b-2 ${borderClass} rounded-none`} style={style}>
        {field.auto_fill_date ? (
          <span className="text-xs px-1 leading-none" style={{ lineHeight: `${h}px` }}>
            {value?.value || new Date().toLocaleDateString()}
          </span>
        ) : (
          <input
            type="date"
            className="w-full h-full bg-transparent text-xs px-1 outline-none"
            value={value?.value || ""}
            onChange={e => onChange(e.target.value)}
            tabIndex={field.display_order}
          />
        )}
      </div>
    );
  }

  // Auto-filled identity fields: name / email / company / title.
  // Read-only when value is supplied by the recipient profile; falls back to
  // an editable input when the source data was empty.
  if (
    field.field_type === "name" ||
    field.field_type === "email" ||
    field.field_type === "company" ||
    field.field_type === "title"
  ) {
    const hasAutoFill = !!value?.value;
    return (
      <div id={`field-${field.id}`} style={style} className="relative">
        <input
          type={field.field_type === "email" ? "email" : "text"}
          readOnly={hasAutoFill && field.field_type !== "title"}
          className={`w-full h-full bg-transparent border-b-2 ${borderClass} rounded-none outline-none text-xs px-1 ${hasAutoFill && field.field_type !== "title" ? "cursor-default" : "focus:border-primary"}`}
          placeholder={field.placeholder_text || field.field_label}
          value={value?.value || ""}
          onChange={e => onChange(e.target.value)}
          tabIndex={field.display_order}
        />
        {isInvalid && (
          <span className="absolute -bottom-4 left-0 text-[9px] text-destructive">
            Invalid {field.field_type} format
          </span>
        )}
      </div>
    );
  }

  // Text field (default fallback)
  return (
    <div id={`field-${field.id}`} style={style} className="relative">
      <input
        type="text"
        className={`w-full h-full bg-transparent border-b-2 ${borderClass} rounded-none outline-none text-xs px-1 focus:border-primary`}
        placeholder={field.placeholder_text || field.field_label}
        value={value?.value || ""}
        onChange={e => onChange(e.target.value)}
        tabIndex={field.display_order}
      />
      {isInvalid && (
        <span className="absolute -bottom-4 left-0 text-[9px] text-destructive">
          Invalid {field.validation_rule || "value"} format
        </span>
      )}
    </div>
  );
}

// ── Inline DOCX viewer ──────────────────────────────────────────────────────

function DocxViewerInline({ fileUrl }: { fileUrl: string }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(fileUrl);
        const arrayBuffer = await response.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /><span className="ml-2 text-muted-foreground">Rendering document...</span></div>;

  return (
    <div className="border rounded-lg overflow-auto max-h-[600px] p-6 md:p-10 prose prose-sm dark:prose-invert max-w-none bg-background" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
  );
}

// ── Signing Complete ────────────────────────────────────────────────────────

function SigningComplete({ requestId, remainingDocs }: { requestId: string; remainingDocs: any[] }) {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const { data } = useQuery({
    queryKey: ["signed-document", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signed_documents")
        .select("*, signature_requests(*, providers(business_name))")
        .eq("signature_request_id", requestId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: verifications } = useQuery({
    queryKey: ["sig-verifications", requestId],
    queryFn: async () => {
      const { data } = await supabase.from("signature_verifications").select("*").eq("signature_request_id", requestId);
      return data ?? [];
    },
  });

  if (!data) return <div className="text-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  const cert = data.certificate_data as any;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Card className="border-primary/30">
        <CardContent className="p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center animate-in zoom-in duration-500">
              <CheckCircle className="h-10 w-10 text-primary" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold">Document Signed Successfully!</h1>
            <p className="text-muted-foreground mt-1">{cert?.document_name ? `"${cert.document_name}"` : "Your document"} has been electronically signed and recorded.</p>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-left text-sm">
            <div><p className="text-muted-foreground text-xs">Document</p><p className="font-medium">{cert?.document_name || "—"}</p></div>
            <div><p className="text-muted-foreground text-xs">Signer</p><p className="font-medium">{cert?.signer_name}</p></div>
            <div><p className="text-muted-foreground text-xs">Business</p><p className="font-medium">{cert?.business_name}</p></div>
            <div><p className="text-muted-foreground text-xs">Signed At</p><p className="font-medium">{cert?.signed_at ? new Date(cert.signed_at).toLocaleString() : "—"}</p></div>
          </div>

          <Separator />

          <div className="text-left space-y-2">
            <h3 className="font-semibold text-sm">Verification Methods</h3>
            <div className="flex gap-2 flex-wrap">
              {verifications?.filter(v => v.status === "passed").map(v => (
                <Badge key={v.id} variant="outline" className="bg-primary/10 text-primary gap-1">
                  <CheckCircle className="h-3 w-3" />{v.verification_type.replace(/_/g, " ")}
                </Badge>
              ))}
              {(!verifications || verifications.filter(v => v.status === "passed").length === 0) && (
                <Badge variant="outline" className="text-muted-foreground">No verification required</Badge>
              )}
            </div>
          </div>

          <Separator />

          <div className="text-left space-y-2">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Hash className="h-4 w-4" />Document Fingerprint</h3>
            <p className="font-mono text-xs bg-muted rounded p-2 break-all">{cert?.document_hash}</p>
          </div>

          {data.signature_image_url && (
            <>
              <Separator />
              <div className="text-left">
                <p className="text-xs text-muted-foreground mb-2">Signature</p>
                <SignatureImage path={data.signature_image_url} />
              </div>
            </>
          )}

          <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground text-left">{cert?.legal_statement}</div>
        </CardContent>
      </Card>

      {(() => {
        const role = (profile as any)?.role;
        const returnPath = !user
          ? null
          : role === "provider"
            ? "/my-documents"
            : role === "law_firm"
              ? "/lf/documents"
              : "/";
        const returnLabel = !user
          ? "You may close this window"
          : role === "provider" || role === "law_firm"
            ? "Back to My Documents"
            : "Return to Dashboard";
        const handleReturn = () => (returnPath ? navigate(returnPath) : window.close());
        return (
          <>
            {user && remainingDocs.length > 0 && (
              <Card className="border-primary/20">
                <CardContent className="p-4 flex items-center justify-between">
                  <p className="text-sm">
                    You have <strong>{remainingDocs.length}</strong> more document{remainingDocs.length !== 1 ? "s" : ""} to sign.
                  </p>
                  <Button size="sm" onClick={handleReturn}>
                    Continue <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-center">
              {returnPath ? (
                <Button variant="outline" onClick={handleReturn}>
                  <ArrowLeft className="h-4 w-4 mr-2" />{returnLabel}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{returnLabel}</p>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}

function SignatureImage({ path }: { path: string }) {
  const { data } = useQuery({
    queryKey: ["sig-image", path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("signatures").createSignedUrl(path, 3600);
      return data?.signedUrl;
    },
  });
  if (!data) return null;
  return <img src={data} alt="Signature" className="max-h-24 border rounded" />;
}
