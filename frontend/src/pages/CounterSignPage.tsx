import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, CheckCircle, PenTool, FileText, Loader2,
  Shield, Hash, Clock, User, Globe
} from "lucide-react";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/sanitize";
import SignatureCanvas from "react-signature-canvas";
import { PDFViewer } from "@/components/documents/PDFViewer";
import { format } from "date-fns";

export default function CounterSignPage() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  const [confirmed, setConfirmed] = useState(false);
  const [adminTitle, setAdminTitle] = useState("Authorized Representative");
  const sigCanvas = useRef<SignatureCanvas>(null);

  // Fetch signature request
  const { data: sigRequest, isLoading } = useQuery({
    queryKey: ["counter-sign-request", requestId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select("*, providers(business_name, contact_email)")
        .eq("id", requestId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const providerDocumentId = (sigRequest as any)?.provider_document_id;

  // Fetch provider document + template
  const { data: providerDocument } = useQuery({
    queryKey: ["counter-sign-provider-doc", providerDocumentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_documents")
        .select("*, document_templates(id, name, document_type, file_url, file_type)")
        .eq("id", providerDocumentId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!providerDocumentId,
  });

  // Fetch provider's signed document (signature image + cert data)
  const { data: signedDoc } = useQuery({
    queryKey: ["counter-sign-signed-doc", requestId],
    queryFn: async () => {
      const { data } = await supabase
        .from("signed_documents")
        .select("*")
        .eq("signature_request_id", requestId!)
        .maybeSingle();
      return data;
    },
    enabled: !!requestId,
  });

  // Get signed URL for provider's signature image
  const { data: providerSigUrl } = useQuery({
    queryKey: ["provider-sig-url", signedDoc?.signature_image_url],
    queryFn: async () => {
      if (!signedDoc?.signature_image_url) return null;
      const { data } = await supabase.storage.from("signatures").createSignedUrl(signedDoc.signature_image_url, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!signedDoc?.signature_image_url,
  });

  // Get signed URL for the template file
  const template = (providerDocument as any)?.document_templates;
  const { data: templateFileUrl } = useQuery({
    queryKey: ["counter-sign-file-url", template?.file_url],
    queryFn: async () => {
      if (!template?.file_url) return null;
      if (template.file_url.startsWith("http")) return template.file_url;
      const { data } = await supabase.storage.from("document-templates").createSignedUrl(template.file_url, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!template?.file_url,
  });

  // Fallback: when this signature request is for a directly-uploaded contract
  // (no document_template), pull the PDF off the contracts row.
  const contractId = (sigRequest as any)?.contract_id;
  const { data: contractDoc } = useQuery({
    queryKey: ["counter-sign-contract", contractId],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("document_url, contract_type")
        .eq("id", contractId!)
        .maybeSingle();
      return data;
    },
    enabled: !!contractId && !providerDocumentId,
  });

  const { data: contractFileUrl } = useQuery({
    queryKey: ["counter-sign-contract-url", contractDoc?.document_url],
    queryFn: async () => {
      if (!contractDoc?.document_url) return null;
      if (contractDoc.document_url.startsWith("http")) return contractDoc.document_url;
      const { data } = await supabase.storage.from("contracts").createSignedUrl(contractDoc.document_url, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!contractDoc?.document_url,
  });

  // Show the recipient-signed PDF (baked at signing time) instead of the
  // blank original — the admin needs to see what they're countersigning.
  const finalDocPath = (sigRequest as any)?.final_document_url as string | null | undefined;
  const { data: signedPdfUrl } = useQuery({
    queryKey: ["counter-sign-final-pdf", finalDocPath],
    queryFn: async () => {
      if (!finalDocPath) return null;
      if (finalDocPath.startsWith("http")) return finalDocPath;
      const { data } = await supabase.storage.from("signatures").createSignedUrl(finalDocPath, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!finalDocPath,
  });

  const documentFileUrl = signedPdfUrl || templateFileUrl || contractFileUrl;
  const documentFileType = signedPdfUrl
    ? "pdf"
    : template?.file_type || (contractDoc?.document_url?.toLowerCase().endsWith(".docx") ? "docx" : "pdf");
  const showingSignedVersion = !!signedPdfUrl;

  // Fetch audit log for verification methods
  const { data: auditLogs } = useQuery({
    queryKey: ["counter-sign-audit", requestId],
    queryFn: async () => {
      const { data } = await supabase
        .from("signature_audit_log")
        .select("action, created_at, ip_address, user_agent")
        .eq("signature_request_id", requestId!)
        .order("created_at");
      return data ?? [];
    },
    enabled: !!requestId,
  });

  const certData = signedDoc?.certificate_data as any;
  const providerName = (sigRequest as any)?.providers?.business_name || "Provider";
  const documentName = template?.name
    || (contractDoc?.contract_type ? `${contractDoc.contract_type} Contract` : "Document");

  // Counter-sign mutation
  const counterSignMutation = useMutation({
    mutationFn: async () => {
      if (!sigCanvas.current || sigCanvas.current.isEmpty()) throw new Error("Please draw your signature");
      if (!confirmed) throw new Error("Please confirm the declaration");

      const sigDataUrl = sigCanvas.current.toDataURL("image/png");
      const { compressSignatureImage } = await import("@/lib/compress-image");
      const compressedBlob = await compressSignatureImage(sigDataUrl);
      const filePath = `${requestId}/counter-signature-${Date.now()}.png`;
      const { error: uploadErr } = await supabase.storage.from("signatures").upload(filePath, compressedBlob);
      if (uploadErr) throw uploadErr;

      const now = new Date().toISOString();

      // Update signature_request
      await supabase.from("signature_requests").update({
        status: "fully_executed" as any,
        counter_signed_by: user!.id,
        counter_signed_at: now,
        counter_signature_url: filePath,
      }).eq("id", requestId!);

      // Update provider_document
      if (providerDocumentId) {
        await supabase.from("provider_documents").update({
          status: "fully_executed",
        }).eq("id", providerDocumentId);
      }

      // Audit log
      await supabase.from("signature_audit_log").insert({
        signature_request_id: requestId!,
        action: "counter_signed" as any,
        actor_id: user!.id,
        ip_address: "client",
        user_agent: navigator.userAgent,
        metadata: { admin_name: profile?.full_name, admin_title: adminTitle },
      });

      // Also flip the parent contract to active so reporting/UI reflects it.
      if (sigRequest!.contract_id) {
        await supabase.from("contracts")
          .update({ status: "active" as any })
          .eq("id", sigRequest!.contract_id);
      }

      // Notify recipient — provider OR law firm.
      const isLawFirm = !!(sigRequest as any)?.law_firm_id;
      const recipientEmail = (sigRequest as any)?.providers?.contact_email
        || (sigRequest as any)?.law_firms?.contact_email;
      const recipientLink = isLawFirm ? "/lf/documents" : "/my-documents";
      if (recipientEmail) {
        const { data: recipProfile } = await supabase.from("profiles").select("id").eq("email", recipientEmail).maybeSingle();
        if (recipProfile) {
          await supabase.from("notifications").insert({
            user_id: recipProfile.id,
            title: `${documentName} is fully executed`,
            message: `Your document "${documentName}" has been counter-signed and is now fully executed. Download it from your portal.`,
            type: "info",
            link: recipientLink,
          });
        }
      }

      // Activity log — write to the right activities table.
      if (isLawFirm) {
        await supabase.from("law_firm_activities").insert({
          law_firm_id: (sigRequest as any).law_firm_id,
          user_id: user!.id,
          activity_type: "status_change",
          description: `Admin counter-signed "${documentName}" — now fully executed`,
        });
      } else {
        await supabase.from("activities").insert({
          provider_id: sigRequest!.provider_id,
          user_id: user!.id,
          activity_type: "status_change" as any,
          description: `Admin counter-signed "${documentName}" — now fully executed`,
        });
      }

      // Check if part of package — unlock next doc
      if (providerDocumentId) {
        const { data: allDocs } = await supabase
          .from("provider_documents")
          .select("*, document_templates(name)")
          .eq("provider_id", sigRequest!.provider_id)
          .neq("status", "voided")
          .order("signing_order");
        if (allDocs) {
          const currentOrder = providerDocument?.signing_order;
          const nextDoc = allDocs.find(d =>
            d.signing_order != null && d.signing_order > (currentOrder || 0) && d.status === "pending"
          );
          if (nextDoc && recipientEmail) {
            const { data: pp } = await supabase.from("profiles").select("id").eq("email", recipientEmail).maybeSingle();
            if (pp) {
              await supabase.from("notifications").insert({
                user_id: pp.id,
                title: "Next Document Ready",
                message: `Your next document "${(nextDoc as any).document_templates?.name}" is ready for review.`,
                type: "info",
                link: "/my-documents",
              });
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
      toast.success("Document counter-signed and fully executed!");
      navigate("/signatures");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading...
      </div>
    );
  }

  if (!sigRequest || sigRequest.status !== "signed") {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
        <FileText className="h-16 w-16 text-muted-foreground mx-auto" />
        <h1 className="text-2xl font-bold">Not Ready for Counter-Signature</h1>
        <p className="text-muted-foreground">This document must be signed by the provider first.</p>
        <Button variant="outline" onClick={() => navigate("/signatures")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to E-Signatures
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/signatures")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Counter-Sign: {documentName}</h1>
          <p className="text-sm text-muted-foreground">Provider: {providerName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Viewer — 2/3 width */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="h-4 w-4" />
                {showingSignedVersion ? "Recipient-Signed Document" : "Original Document"}
                {showingSignedVersion && (
                  <Badge variant="outline" className="text-[10px] border-emerald-600/40 text-emerald-600">
                    Recipient signed
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {documentFileUrl ? (
                documentFileType === "docx" ? (
                  <DocxViewer url={documentFileUrl} />
                ) : (
                  <PDFViewer fileUrl={documentFileUrl} />
                )
              ) : (
                <div className="py-12 text-center text-muted-foreground">No document file available</div>
              )}
            </CardContent>
          </Card>

          {/* Provider Signing Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-600" /> Provider's Signing Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Signer Name:</span>
                  <p className="font-medium">{certData?.signer_name || "—"}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Business:</span>
                  <p className="font-medium">{certData?.business_name || providerName}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Signed:</span>
                  <span className="font-medium">{certData?.signed_at ? format(new Date(certData.signed_at), "MMM d, yyyy h:mm a") : "—"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">IP:</span>
                  <span className="font-mono text-xs">{certData?.ip_address || "—"}</span>
                </div>
              </div>

              {/* Verification methods */}
              {certData?.verification_methods && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Verification Methods:</p>
                  <div className="flex gap-2">
                    {(certData.verification_methods as string[]).map((m: string) => (
                      <Badge key={m} variant="outline" className="text-[10px] capitalize">{m.replace(/_/g, " ")}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Provider's drawn signature */}
              {providerSigUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Provider's Signature:</p>
                  <div className="border rounded-lg p-3 bg-background inline-block">
                    <img src={providerSigUrl} alt="Provider Signature" className="h-16 max-w-[300px] object-contain" />
                  </div>
                </div>
              )}

              {certData?.document_hash && (
                <div>
                  <p className="text-xs text-muted-foreground">Document Hash:</p>
                  <p className="font-mono text-xs bg-muted rounded p-2 break-all">{certData.document_hash}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Admin Signature Section — 1/3 width */}
        <div className="space-y-4">
          <Card className="border-primary/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <PenTool className="h-4 w-4" /> Your Counter-Signature
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Your Name</Label>
                <Input value={profile?.full_name || ""} disabled className="bg-muted" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Title</Label>
                <Input value={adminTitle} onChange={e => setAdminTitle(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input value={format(new Date(), "MMMM d, yyyy")} disabled className="bg-muted" />
              </div>

              <Separator />

              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">Draw Your Signature</Label>
                <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-white flex items-center justify-center p-2">
                  <SignatureCanvas
                    ref={sigCanvas}
                    canvasProps={{ className: "rounded touch-none", width: 500, height: 128 }}
                    penColor="#1a1a1a"
                  />
                </div>
                <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => sigCanvas.current?.clear()}>
                  Clear
                </Button>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox checked={confirmed} onCheckedChange={v => setConfirmed(v === true)} id="confirm-counter" />
                <label htmlFor="confirm-counter" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                  I, {profile?.full_name || "Admin"}, confirm that I am authorized to counter-sign this document on behalf of the organization and that the provider's signing is valid and accepted.
                </label>
              </div>

              <Button
                className="w-full"
                disabled={!confirmed || counterSignMutation.isPending}
                onClick={() => counterSignMutation.mutate()}
              >
                {counterSignMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-1" />Processing...</>
                ) : (
                  <><CheckCircle className="h-4 w-4 mr-1" />Complete Counter-Signature</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Simple DOCX viewer using mammoth
function DocxViewer({ url }: { url: string }) {
  const { data: html, isLoading } = useQuery({
    queryKey: ["docx-html", url],
    queryFn: async () => {
      const resp = await fetch(url);
      const arrayBuffer = await resp.arrayBuffer();
      const mammoth = await import("mammoth");
      const result = await mammoth.convertToHtml({ arrayBuffer });
      return result.value;
    },
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading document...</div>;

  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert p-6 border rounded-lg bg-background max-h-[600px] overflow-y-auto"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || "") }}
    />
  );
}
