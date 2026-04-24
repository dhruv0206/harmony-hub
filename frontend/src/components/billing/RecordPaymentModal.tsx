import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit-log";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoiceId: string;
  providerId: string;
  remainingBalance: number;
}

export default function RecordPaymentModal({ open, onOpenChange, invoiceId, providerId, remainingBalance }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(remainingBalance.toFixed(2));
  const [method, setMethod] = useState("credit_card");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const paymentAmt = parseFloat(amount);
      if (isNaN(paymentAmt) || paymentAmt <= 0) throw new Error("Invalid amount");

      const { error: pErr } = await supabase.from("payments").insert({
        invoice_id: invoiceId,
        provider_id: providerId,
        amount: paymentAmt,
        payment_method: method,
        payment_reference: reference || null,
        notes: notes || null,
        status: "completed",
        processed_at: new Date().toISOString(),
        recorded_by: user?.id ?? null,
      });
      if (pErr) throw pErr;

      // Update invoice
      const { data: inv } = await supabase.from("invoices").select("total_amount, paid_amount").eq("id", invoiceId).single();
      if (inv) {
        const newPaid = Number(inv.paid_amount ?? 0) + paymentAmt;
        const total = Number(inv.total_amount);
        const newStatus = newPaid >= total ? "paid" : "partial";
        await supabase.from("invoices").update({
          paid_amount: newPaid,
          status: newStatus,
          paid_date: newPaid >= total ? new Date().toISOString().split("T")[0] : null,
        }).eq("id", invoiceId);

        // If fully paid, check for reactivation
        if (newPaid >= total) {
          // Check if there are other past_due invoices for this provider
          const { count: otherPastDue } = await supabase
            .from("invoices")
            .select("id", { count: "exact", head: true })
            .eq("provider_id", providerId)
            .in("status", ["past_due", "sent", "partial"])
            .neq("id", invoiceId);

          if ((otherPastDue ?? 0) === 0) {
            // Reactivate subscription if suspended or past_due
            const { data: subs } = await supabase
              .from("provider_subscriptions")
              .select("id, status")
              .eq("provider_id", providerId)
              .in("status", ["suspended", "past_due"]);

            for (const sub of subs ?? []) {
              await supabase
                .from("provider_subscriptions")
                .update({ status: "active" })
                .eq("id", sub.id);
            }

            // Resolve all active billing alerts
            await supabase
              .from("billing_alerts")
              .update({ status: "resolved", resolved_at: new Date().toISOString() })
              .eq("provider_id", providerId)
              .eq("status", "active");

            // Also resolve acknowledged alerts
            await supabase
              .from("billing_alerts")
              .update({ status: "resolved", resolved_at: new Date().toISOString() })
              .eq("provider_id", providerId)
              .eq("status", "acknowledged");

            // Log activity
            await supabase.from("activities").insert({
              provider_id: providerId,
              user_id: user?.id ?? null,
              activity_type: "status_change",
              description: "Subscription reactivated — payment received.",
            });
            logAudit({ action: "subscription.reactivated", entity_type: "subscription", entity_id: providerId, details: { reason: "payment_received" } });

            // Notify provider
            const { data: prov } = await supabase.from("providers").select("contact_email").eq("id", providerId).single();
            if (prov?.contact_email) {
              const { data: prof } = await supabase.from("profiles").select("id").eq("email", prov.contact_email).maybeSingle();
              if (prof) {
                await supabase.from("notifications").insert({
                  user_id: prof.id,
                  title: "Membership Reactivated",
                  message: "Your membership has been reactivated. Welcome back!",
                  type: "billing",
                  link: "/billing/provider",
                });
              }
            }
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("Payment recorded");
      queryClient.invalidateQueries({ queryKey: ["invoice-detail", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoice-payments", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["invoices-list"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Amount</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Remaining balance: ${remainingBalance.toFixed(2)}</p>
          </div>
          <div>
            <Label>Payment Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="ach">ACH</SelectItem>
                <SelectItem value="wire">Wire</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Payment Reference</Label>
            <Input placeholder="Transaction ID, check number…" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Recording…" : "Record Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
