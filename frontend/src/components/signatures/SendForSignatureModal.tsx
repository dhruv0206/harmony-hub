import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { FileText, Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: any;
}

export default function SendForSignatureModal({ open, onOpenChange, contract }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expirationDays, setExpirationDays] = useState(7);
  const [message, setMessage] = useState("");

  const hasDocument = !!contract?.document_url;
  const isLawFirm = !!contract?.law_firm_id;
  const entityName = isLawFirm ? contract?.law_firms?.firm_name : contract?.providers?.business_name;
  const entityEmail = isLawFirm ? contract?.law_firms?.contact_email : contract?.providers?.contact_email;
  const entityLabel = isLawFirm ? "Law Firm" : "Provider";

  // Resolve a viewable URL — legacy http links (seeded) pass through; storage
  // paths in the private `contracts` bucket get a 1-hour signed URL.
  const { data: displayDocUrl } = useQuery({
    queryKey: ["contract-send-preview", contract?.document_url],
    queryFn: async () => {
      const raw = contract?.document_url;
      if (!raw) return null;
      if (raw.startsWith("http")) return raw;
      const { data } = await supabase.storage.from("contracts").createSignedUrl(raw, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!contract?.document_url && open,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!hasDocument) {
        throw new Error("Upload a contract PDF first — Edit contract → attach PDF.");
      }
      // Expiration sanity (UI clamps to 1-30 but type=number lets users paste anything).
      if (!expirationDays || expirationDays < 1 || expirationDays > 30) {
        throw new Error("Expiration must be between 1 and 30 days.");
      }
      // Make sure the recipient has an email — otherwise the signing link
      // has nowhere to go. (Once email delivery is wired up, this prevents
      // sending to nobody. For now it surfaces a clear "fix the profile" toast
      // instead of silently creating an unreachable signature_request.)
      const recipientEmail = isLawFirm
        ? (contract?.law_firms as any)?.contact_email
        : (contract?.providers as any)?.contact_email;
      if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
        throw new Error(`The ${isLawFirm ? "law firm" : "provider"} doesn't have a valid email on file. Add one on their profile first.`);
      }
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expirationDays);

      const { data: sigReq, error } = await supabase.from("signature_requests").insert({
        contract_id: contract.id,
        provider_id: isLawFirm ? null : contract.provider_id,
        law_firm_id: isLawFirm ? contract.law_firm_id : null,
        requested_by: user!.id,
        expires_at: expiresAt.toISOString(),
        message,
      }).select("*, signer_token").single();
      if (error) throw error;

      await supabase.from("signature_audit_log").insert({
        signature_request_id: sigReq.id,
        action: "request_created" as any,
        actor_id: user!.id,
        metadata: { expiration_days: expirationDays },
      });

      // Notify recipient (provider or law firm)
      if (entityEmail) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", entityEmail);

        if (profiles?.[0]) {
          await supabase.from("notifications").insert({
            user_id: profiles[0].id,
            title: "Action Required: Sign Your Contract",
            message: `Please review and sign your ${contract.contract_type} contract.`,
            type: "warning",
            link: `/sign/${sigReq.id}?token=${(sigReq as any).signer_token}`,
          });
        }
      }

      // Update contract status
      await supabase.from("contracts").update({ status: "sent" }).eq("id", contract.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract"] });
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
      onOpenChange(false);
      toast.success("Contract sent for e-signature!");
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
              <span className="font-medium capitalize">{contract.contract_type} Contract</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">{entityLabel}:</span> {entityName || "—"}</div>
              <div><span className="text-muted-foreground">Email:</span> {entityEmail || "—"}</div>
              <div><span className="text-muted-foreground">Value:</span> ${Number(contract.deal_value || 0).toLocaleString()}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge className="capitalize">{contract.status}</Badge></div>
            </div>
            {hasDocument ? (
              <div className="pt-2 border-t border-border/50">
                <a href={displayDocUrl || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{displayDocUrl ? "Preview attached PDF" : "Loading PDF..."}</span>
                </a>
              </div>
            ) : (
              <div className="pt-2 border-t border-border/50 text-sm text-destructive flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                No PDF attached. Edit contract → upload PDF first.
              </div>
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
          <Button className="w-full" onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending || !hasDocument}>
            <Send className="h-4 w-4 mr-2" />{sendMutation.isPending ? "Sending..." : "Send for Signature"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
