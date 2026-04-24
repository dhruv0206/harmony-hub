import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Send, DollarSign, XCircle, Download, CreditCard } from "lucide-react";
import { toast } from "sonner";
import AuditLogTable from "@/components/audit/AuditLogTable";
import RecordPaymentModal from "@/components/billing/RecordPaymentModal";

const statusColor: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700",
  sent: "bg-blue-500/10 text-blue-700",
  pending: "bg-yellow-500/10 text-yellow-700",
  past_due: "bg-orange-500/10 text-orange-700",
  void: "bg-destructive/10 text-destructive",
  partial: "bg-purple-500/10 text-purple-700",
  draft: "bg-muted text-muted-foreground",
};

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [paymentOpen, setPaymentOpen] = useState(false);

  const { data: invoice } = useQuery({
    queryKey: ["invoice-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*, providers(business_name, contact_name, contact_email, city, state)")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: lineItems } = useQuery({
    queryKey: ["invoice-line-items", id],
    queryFn: async () => {
      const { data } = await supabase.from("invoice_line_items").select("*").eq("invoice_id", id!).order("created_at");
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: payments } = useQuery({
    queryKey: ["invoice-payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*, profiles(full_name)").eq("invoice_id", id!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoices").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice marked as sent");
      queryClient.invalidateQueries({ queryKey: ["invoice-detail", id] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("invoices").update({ status: "void" }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoice voided");
      queryClient.invalidateQueries({ queryKey: ["invoice-detail", id] });
    },
  });

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (!invoice) return null;

  const provider = invoice.providers as any;
  const remaining = Number(invoice.total_amount) - Number(invoice.paid_amount ?? 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/billing/invoices")}><ArrowLeft className="mr-1 h-4 w-4" />Back to Invoices</Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
          <p className="text-muted-foreground">{provider?.business_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`text-sm ${statusColor[invoice.status] ?? ""}`}>{invoice.status.replace("_", " ")}</Badge>
          {invoice.status !== "void" && invoice.status !== "paid" && (
            <>
              <Button size="sm" variant="outline" onClick={() => sendMutation.mutate()}><Send className="mr-1 h-3 w-3" />Send</Button>
              <Button size="sm" onClick={() => setPaymentOpen(true)}><DollarSign className="mr-1 h-3 w-3" />Record Payment</Button>
              <Button size="sm" variant="outline" onClick={() => voidMutation.mutate()}><XCircle className="mr-1 h-3 w-3" />Void</Button>
            </>
          )}
        </div>
      </div>

      {/* Invoice Preview */}
      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-primary">ContractPro</h2>
              <p className="text-sm text-muted-foreground">Network Management Platform</p>
            </div>
            <div className="text-right">
              <h3 className="text-xl font-semibold">INVOICE</h3>
              <p className="font-mono text-sm">{invoice.invoice_number}</p>
              <p className="text-sm text-muted-foreground">Date: {invoice.billing_period_start}</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Bill To</p>
              <p className="font-semibold">{provider?.business_name}</p>
              <p className="text-sm">{provider?.contact_name}</p>
              {provider?.city && <p className="text-sm text-muted-foreground">{provider.city}, {provider.state}</p>}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1">Details</p>
              <p className="text-sm">Period: {invoice.billing_period_start} – {invoice.billing_period_end}</p>
              <p className="text-sm">Due Date: <span className="font-semibold">{invoice.due_date}</span></p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems?.map((li: any) => (
                <TableRow key={li.id}>
                  <TableCell className="text-sm">{li.description}</TableCell>
                  <TableCell className="text-right">{li.quantity}</TableCell>
                  <TableCell className="text-right">{fmt(Number(li.unit_price))}</TableCell>
                  <TableCell className="text-right">{Number(li.discount_percentage) > 0 ? `${li.discount_percentage}%` : "—"}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(Number(li.line_total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex justify-end">
            <div className="w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{fmt(Number(invoice.subtotal))}</span></div>
              {Number(invoice.discount_amount) > 0 && (
                <div className="flex justify-between text-green-600"><span>Discounts/Credits</span><span>-{fmt(Number(invoice.discount_amount))}</span></div>
              )}
              {Number(invoice.tax_amount) > 0 && (
                <div className="flex justify-between"><span>Tax</span><span>{fmt(Number(invoice.tax_amount))}</span></div>
              )}
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmt(Number(invoice.total_amount))}</span></div>
              {Number(invoice.paid_amount) > 0 && (
                <div className="flex justify-between text-green-600"><span>Paid</span><span>-{fmt(Number(invoice.paid_amount))}</span></div>
              )}
              {remaining > 0 && Number(invoice.paid_amount) > 0 && (
                <div className="flex justify-between font-bold"><span>Balance Due</span><span>{fmt(remaining)}</span></div>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-4 p-3 rounded bg-muted text-sm"><strong>Notes:</strong> {invoice.notes}</div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      {payments && payments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Payment History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recorded By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.processed_at ? new Date(p.processed_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{p.payment_method?.replace("_", " ")}</TableCell>
                    <TableCell className="text-sm font-mono">{p.payment_reference ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(Number(p.amount))}</TableCell>
                    <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                    <TableCell className="text-sm">{(p.profiles as any)?.full_name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {id && <AuditLogTable entityType="invoice" entityId={id} compact title="Invoice Audit Trail" />}

      <RecordPaymentModal
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        invoiceId={invoice.id}
        providerId={invoice.provider_id}
        remainingBalance={remaining}
      />
    </div>
  );
}
