import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Lock, Check, Eye, Send, XCircle, Clock, CheckCircle,
  Plus, Upload, Calendar, Shield, Loader2, Bell,
} from "lucide-react";
import { format, addDays, formatDistanceToNow } from "date-fns";
import SendToProviderModal from "@/components/signatures/SendToProviderModal";
import { toast } from "sonner";

const DOC_TYPE_COLORS: Record<string, string> = {
  agreement: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  addendum: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  exhibit: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  application: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  baa: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  acknowledgment: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  pending: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Pending" },
  sent: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Send, label: "Sent" },
  viewed: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", icon: Eye, label: "Viewed" },
  signed: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Clock, label: "Awaiting Counter-Sign" },
  fully_executed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: CheckCircle, label: "Fully Executed" },
  declined: { color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", icon: XCircle, label: "Declined" },
  expired: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Expired" },
  voided: { color: "bg-muted text-muted-foreground", icon: XCircle, label: "Voided" },
};

export function ProviderDocumentsTab({ providerId }: { providerId: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [sendDoc, setSendDoc] = useState<any>(null);
  const [sendNewOpen, setSendNewOpen] = useState(false);
  const [sendMode, setSendMode] = useState<"template" | "upload">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [expirationDays, setExpirationDays] = useState(14);
  const [requireVerification, setRequireVerification] = useState(true);

  const { data: provider } = useQuery({
    queryKey: ["provider-name", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("business_name, contact_email").eq("id", providerId).single();
      return data;
    },
  });

  const { data: providerDocs, isLoading } = useQuery({
    queryKey: ["provider-documents-tab", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_documents")
        .select("*, document_templates(name, short_code, document_type, file_url), signature_requests(expires_at, created_at)")
        .eq("provider_id", providerId)
        .order("signing_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: templates } = useQuery({
    queryKey: ["active-templates-for-send", "provider"],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_templates")
        .select("id, name, document_type, file_url, short_code")
        .eq("is_active", true)
        .eq("participant_type", "provider")
        .order("name");
      return data ?? [];
    },
    enabled: sendNewOpen,
  });

  const docs = providerDocs ?? [];
  const activeDocs = docs.filter(d => d.status !== "voided");

  const canSend = (doc: any) => {
    if (!doc.signing_order) return true;
    const prev = activeDocs.filter(d => d.signing_order != null && d.signing_order < doc.signing_order);
    return prev.every(d => d.status === "signed" || d.status === "fully_executed");
  };

  const resetSendForm = () => {
    setSendMode("template");
    setSelectedTemplateId("");
    setUploadFile(null);
    setSendMessage("");
    setExpirationDays(14);
    setRequireVerification(true);
  };

  // Send new document (template or one-off upload)
  const sendNewMutation = useMutation({
    mutationFn: async () => {
      const expiresAt = addDays(new Date(), expirationDays).toISOString();
      const now = new Date().toISOString();
      let fileUrl: string | null = null;
      let templateId: string | null = null;
      let docName = "Document";

      if (sendMode === "template") {
        if (!selectedTemplateId) throw new Error("Select a template");
        const tmpl = templates?.find(t => t.id === selectedTemplateId);
        if (!tmpl?.file_url) throw new Error("Selected template has no file uploaded");
        templateId = selectedTemplateId;
        fileUrl = tmpl.file_url;
        docName = tmpl.name;
      } else {
        if (!uploadFile) throw new Error("Select a file to upload");
        setUploading(true);
        const ext = uploadFile.name.split(".").pop() || "pdf";
        const path = `one-off/${providerId}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("documents")
          .upload(path, uploadFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("documents").getPublicUrl(path);
        fileUrl = urlData.publicUrl;
        docName = uploadFile.name.replace(/\.[^/.]+$/, "");
        setUploading(false);
      }

      // Create provider_document
      const { data: provDoc, error: docErr } = await supabase
        .from("provider_documents")
        .insert({
          provider_id: providerId,
          template_id: templateId,
          file_url: fileUrl,
          status: "sent",
          sent_at: now,
          notes: sendMessage || null,
        } as any)
        .select("id")
        .single();
      if (docErr) throw docErr;

      // Create signature_request — this is a provider_document flow, NOT a contract flow,
      // so contract_id stays null. The provider_document_id linkage is what ties it together.
      const { data: sigReq, error: sigErr } = await supabase
        .from("signature_requests")
        .insert({
          provider_id: providerId,
          requested_by: user!.id,
          expires_at: expiresAt,
          message: sendMessage || null,
          provider_document_id: provDoc.id,
          require_verification: requireVerification,
        } as any)
        .select()
        .single();
      if (sigErr) throw sigErr;

      // Link signature request
      await supabase.from("provider_documents").update({
        signature_request_id: sigReq.id,
      }).eq("id", provDoc.id);

      // Audit log
      await supabase.from("signature_audit_log").insert({
        signature_request_id: sigReq.id,
        action: "request_created" as any,
        actor_id: user!.id,
        metadata: {
          expiration_days: expirationDays,
          template_name: docName,
          require_verification: requireVerification,
          one_off: sendMode === "upload",
        },
      });

      // Notify provider
      if (provider?.contact_email) {
        const { data: prof } = await supabase.from("profiles").select("id").eq("email", provider.contact_email).maybeSingle();
        if (prof) {
          await supabase.from("notifications").insert({
            user_id: prof.id,
            title: `Action Required: Sign "${docName}"`,
            message: `You have a new document to review and sign: ${docName}.`,
            type: "warning",
            link: `/sign/${sigReq.id}`,
          });
        }
      }

      // Log activity
      await supabase.from("activities").insert({
        provider_id: providerId,
        user_id: user!.id,
        activity_type: "status_change" as any,
        description: `Document sent for signature: "${docName}"${sendMode === "upload" ? " (one-off upload)" : ""}`,
      });
    },
    onSuccess: () => {
      toast.success("Document sent for signature");
      queryClient.invalidateQueries({ queryKey: ["provider-documents-tab", providerId] });
      setSendNewOpen(false);
      resetSendForm();
    },
    onError: (e: any) => {
      setUploading(false);
      toast.error(e.message);
    },
  });

  // Resend reminder for a specific document
  const resendReminder = useMutation({
    mutationFn: async (doc: any) => {
      if (!provider?.contact_email) throw new Error("No provider email");
      const { data: prof } = await supabase.from("profiles").select("id").eq("email", provider.contact_email).maybeSingle();
      if (!prof) throw new Error("Provider profile not found");

      const tmpl = doc.document_templates;
      const docName = tmpl?.name || "Document";

      await supabase.from("notifications").insert({
        user_id: prof.id,
        title: `Reminder: Please sign "${docName}"`,
        message: `This is a reminder to review and sign your document: ${docName}.`,
        type: "warning",
        link: `/sign/${doc.signature_request_id}`,
      });

      await supabase.from("activities").insert({
        provider_id: providerId,
        user_id: user!.id,
        activity_type: "email" as any,
        description: `Signing reminder sent for: "${docName}"`,
      });
    },
    onSuccess: () => toast.success("Reminder sent"),
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Loading documents...</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Provider Documents</CardTitle>
          <Button size="sm" onClick={() => setSendNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Send New Document
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-3">No documents assigned yet.</p>
              <Button variant="outline" onClick={() => setSendNewOpen(true)}>
                <Send className="h-4 w-4 mr-1.5" /> Send First Document
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent / Signed</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map(doc => {
                  const tmpl = (doc as any).document_templates;
                  const statusCfg = STATUS_CONFIG[doc.status || "pending"] || STATUS_CONFIG.pending;
                  const StatusIcon = statusCfg.icon;
                  const isExcluded = doc.status === "voided";
                  const isSigned = doc.status === "signed" || doc.status === "fully_executed";
                  const sendable = !isExcluded && canSend(doc) && (doc.status === "pending" || doc.status === "declined");
                  const isLocked = !isExcluded && !canSend(doc) && !isSigned && doc.status !== "sent" && doc.status !== "viewed";
                  const canRemind = (doc.status === "sent" || doc.status === "viewed") && doc.signature_request_id;

                  return (
                    <TableRow key={doc.id} className={isExcluded ? "opacity-50" : ""}>
                      <TableCell className="font-mono text-center">{doc.signing_order || "—"}</TableCell>
                      <TableCell className="font-medium">{tmpl?.name || doc.file_url ? "One-off Document" : "Unknown"}</TableCell>
                      <TableCell>
                        {tmpl?.document_type && (
                          <Badge className={`text-[10px] capitalize ${DOC_TYPE_COLORS[tmpl.document_type] || ""}`}>{tmpl.document_type}</Badge>
                        )}
                        {!tmpl && doc.file_url && <Badge variant="outline" className="text-[10px]">One-off</Badge>}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${statusCfg.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />{statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {doc.sent_at && <div>Sent {format(new Date(doc.sent_at), "MMM d")}</div>}
                        {doc.signed_at && <div className="text-foreground font-medium">Signed {format(new Date(doc.signed_at), "MMM d")}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isSigned && doc.signature_request_id && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={`/sign/${doc.signature_request_id}`}>
                                <CheckCircle className="h-3.5 w-3.5 mr-1 text-emerald-600" /> View
                              </a>
                            </Button>
                          )}
                          {(doc.status === "sent" || doc.status === "viewed") && doc.signature_request_id && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={`/sign/${doc.signature_request_id}`}>Review</a>
                            </Button>
                          )}
                          {isLocked && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Lock className="h-3.5 w-3.5" /> Previous required
                            </span>
                          )}
                          {sendable && !isLocked && (
                            <Button variant="outline" size="sm" onClick={() => setSendDoc(doc)}>
                              <Send className="h-3.5 w-3.5 mr-1" />Send
                            </Button>
                          )}
                          {canRemind && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resendReminder.mutate(doc)}
                              disabled={resendReminder.isPending}
                              title="Send reminder"
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Send for signature modal (existing template doc) */}
      {sendDoc && (
        <SendToProviderModal
          open={!!sendDoc}
          onOpenChange={(v) => { if (!v) setSendDoc(null); }}
          templateId={(sendDoc as any).template_id}
          templateName={(sendDoc as any).document_templates?.name || "Document"}
          fileUrl={(sendDoc as any).document_templates?.file_url || (sendDoc as any).file_url || null}
          preselectedProviderId={providerId}
          preselectedProviderName={provider?.business_name || ""}
          providerDocumentId={sendDoc.id}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["provider-documents-tab", providerId] });
            setSendDoc(null);
          }}
        />
      )}

      {/* Send New Document Modal */}
      <Dialog open={sendNewOpen} onOpenChange={(v) => { if (!v) { setSendNewOpen(false); resetSendForm(); } else setSendNewOpen(true); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" /> Send New Document
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode toggle */}
            <Tabs value={sendMode} onValueChange={(v) => setSendMode(v as any)}>
              <TabsList className="w-full">
                <TabsTrigger value="template" className="flex-1">
                  <FileText className="h-3.5 w-3.5 mr-1.5" /> From Templates
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex-1">
                  <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload One-Off
                </TabsTrigger>
              </TabsList>

              <TabsContent value="template" className="mt-3 space-y-2">
                <Label>Select Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Choose a document template..." /></SelectTrigger>
                  <SelectContent>
                    {templates?.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex items-center gap-2">
                          <span>{t.name}</span>
                          <Badge variant="outline" className="text-[9px] capitalize">{t.document_type}</Badge>
                          {!t.file_url && <Badge variant="destructive" className="text-[9px]">No file</Badge>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>

              <TabsContent value="upload" className="mt-3 space-y-2">
                <Label>Upload Document (PDF or DOCX)</Label>
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => document.getElementById("oneoff-upload")?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files[0];
                    if (file && (file.type === "application/pdf" || file.name.endsWith(".docx"))) {
                      setUploadFile(file);
                    } else {
                      toast.error("Only PDF and DOCX files are supported");
                    }
                  }}
                >
                  <input
                    id="oneoff-upload"
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setUploadFile(file);
                    }}
                  />
                  {uploadFile ? (
                    <div className="flex items-center gap-2 justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">{uploadFile.name}</span>
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setUploadFile(null); }}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Drop a file here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF or DOCX only</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Personal message */}
            <div>
              <Label>Personal Message (optional)</Label>
              <Textarea
                value={sendMessage}
                onChange={e => setSendMessage(e.target.value)}
                placeholder="Add a note for the provider..."
                rows={2}
              />
            </div>

            {/* Settings row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="flex items-center gap-1.5 text-xs">
                  <Calendar className="h-3.5 w-3.5" /> Expiration (days)
                </Label>
                <Input
                  type="number" min={1} max={90}
                  value={expirationDays}
                  onChange={e => setExpirationDays(Number(e.target.value))}
                  className="mt-1"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Expires {format(addDays(new Date(), expirationDays), "MMM d, yyyy")}
                </p>
              </div>
              <div>
                <Label className="flex items-center gap-1.5 text-xs">
                  <Shield className="h-3.5 w-3.5" /> Identity Verification
                </Label>
                <div className="flex items-center gap-2 mt-2">
                  <Switch checked={requireVerification} onCheckedChange={setRequireVerification} />
                  <span className="text-xs text-muted-foreground">{requireVerification ? "Required" : "Skipped"}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSendNewOpen(false); resetSendForm(); }}>Cancel</Button>
            <Button
              onClick={() => sendNewMutation.mutate()}
              disabled={
                sendNewMutation.isPending || uploading ||
                (sendMode === "template" && !selectedTemplateId) ||
                (sendMode === "upload" && !uploadFile)
              }
            >
              {(sendNewMutation.isPending || uploading) ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Sending...</>
              ) : (
                <><Send className="h-4 w-4 mr-1.5" />Send to {provider?.business_name || "Provider"}</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
