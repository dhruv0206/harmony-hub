import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

const statusColor: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700",
  sent: "bg-blue-500/10 text-blue-700",
  pending: "bg-yellow-500/10 text-yellow-700",
  past_due: "bg-orange-500/10 text-orange-700",
  void: "bg-muted text-muted-foreground",
  partial: "bg-purple-500/10 text-purple-700",
};

export default function ProviderInvoiceView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: invoice } = useQuery({
    queryKey: ["provider-invoice-detail", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*, providers(business_name, contact_name, contact_email, address, city, state, zip_code)")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: lineItems } = useQuery({
    queryKey: ["provider-invoice-lines", id],
    queryFn: async () => {
      const { data } = await supabase.from("invoice_line_items").select("*").eq("invoice_id", id!).order("created_at");
      return data ?? [];
    },
    enabled: !!id,
  });

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (!invoice) return null;
  const provider = invoice.providers as any;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => navigate("/billing")}>
        <ArrowLeft className="mr-1 h-4 w-4" />Back to Billing
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{invoice.invoice_number}</h1>
          <p className="text-muted-foreground">{provider?.business_name}</p>
        </div>
        <Badge variant="secondary" className={`text-sm ${statusColor[invoice.status] ?? ""}`}>
          {invoice.status.replace("_", " ")}
        </Badge>
      </div>

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
              {provider?.address && <p className="text-sm text-muted-foreground">{provider.address}</p>}
              {provider?.city && <p className="text-sm text-muted-foreground">{provider.city}, {provider.state} {provider.zip_code}</p>}
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
              <Separator />
              <div className="flex justify-between font-bold text-base"><span>Total</span><span>{fmt(Number(invoice.total_amount))}</span></div>
              {Number(invoice.paid_amount) > 0 && (
                <div className="flex justify-between text-green-600"><span>Paid</span><span>-{fmt(Number(invoice.paid_amount))}</span></div>
              )}
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-4 p-3 rounded bg-muted text-sm"><strong>Notes:</strong> {invoice.notes}</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
