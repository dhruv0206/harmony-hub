import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, Send, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerDocument: {
    id: string;
    provider_id: string;
    template_id: string;
    signing_order: number | null;
  };
  template: {
    id: string;
    name: string;
    document_type: string;
    file_url: string | null;
    signing_instructions: string | null;
  };
  providerId: string;
  onSuccess: () => void;
}

export default function SendForDocSignatureModal({ open, onOpenChange, providerDocument, template, providerId, onSuccess }: Props) {
  const { user } = useAuth();
  const [expirationDays, setExpirationDays] = useState(7);
  const [message, setMessage] = useState("");

  const sendMutation = useMutation({
    mutationFn: async () => {
      // Get provider info
      const { data: provider } = await supabase.from("providers").select("business_name, contact_email").eq("id", providerId).single();
      if (!provider) throw new Error("Provider not found");

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      // Create signature request linked to provider_document
      const { data: sigReq, error } = await supabase.from("signature_requests").insert({
        contract_id: providerDocument.template_id, // We use template_id as reference
        provider_id: providerId,
        requested_by: user!.id,
        expires_at: expiresAt.toISOString(),
        message,
        provider_document_id: providerDocument.id,
      } as any).select().single();
      if (error) throw error;

      // Update provider_document status and link
      await supabase.from("provider_documents").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        signature_request_id: sigReq.id,
      }).eq("id", providerDocument.id);

      // Audit log
      await supabase.from("signature_audit_log").insert({
        signature_request_id: sigReq.id,
        action: "request_created" as any,
        actor_id: user!.id,
        metadata: { expiration_days: expirationDays, template_name: template.name, provider_document_id: providerDocument.id },
      });

      // Notify provider
      const { data: providerProfiles } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", provider.contact_email);

      if (providerProfiles?.[0]) {
        await supabase.from("notifications").insert({
          user_id: providerProfiles[0].id,
          title: `Action Required: Sign "${template.name}"`,
          message: `Please review and sign your ${template.document_type} document.`,
          type: "warning",
          link: `/sign/${sigReq.id}`,
        });
      }
    },
    onSuccess: () => {
      onOpenChange(false);
      onSuccess();
      toast.success(`"${template.name}" sent for e-signature!`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send for E-Signature</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium">{template.name}</span>
              <Badge className="text-[10px] capitalize">{template.document_type}</Badge>
            </div>
            {!template.file_url && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>No file uploaded for this template. The provider will see a placeholder.</span>
              </div>
            )}
            {template.signing_instructions && (
              <p className="text-xs text-muted-foreground">{template.signing_instructions}</p>
            )}
          </div>
          <div>
            <Label>Expiration (days)</Label>
            <Input type="number" min={1} max={30} value={expirationDays} onChange={e => setExpirationDays(Number(e.target.value))} />
            <p className="text-xs text-muted-foreground mt-1">
              Expires: {new Date(Date.now() + expirationDays * 86400000).toLocaleDateString()}
            </p>
          </div>
          <div>
            <Label>Personal Message (optional)</Label>
            <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Add a personal note to the provider..." rows={3} />
          </div>
          <Button className="w-full" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending}>
            <Send className="h-4 w-4 mr-2" />{sendMutation.isPending ? "Sending..." : "Send for Signature"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
