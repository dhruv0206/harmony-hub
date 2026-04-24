import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/use-law-firm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Calendar, CreditCard } from "lucide-react";
import { format } from "date-fns";

const statusBadge: Record<string, string> = {
  active: "bg-green-500/10 text-green-700",
  past_due: "bg-destructive/10 text-destructive",
  pending: "bg-yellow-500/10 text-yellow-700",
  cancelled: "bg-muted text-muted-foreground",
};

const invoiceStatus: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700",
  sent: "bg-blue-500/10 text-blue-700",
  pending: "bg-yellow-500/10 text-yellow-700",
  past_due: "bg-orange-500/10 text-orange-700",
  draft: "bg-muted text-muted-foreground",
};

export default function LFBilling() {
  const { data: lawFirm } = useLawFirm();

  const { data: subscription } = useQuery({
    queryKey: ["lf-billing-sub", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase.from("law_firm_subscriptions").select("*").eq("law_firm_id", lawFirm!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
    enabled: !!lawFirm?.id,
  });

  const { data: invoices } = useQuery({
    queryKey: ["lf-billing-invoices", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase.from("law_firm_invoices").select("*").eq("law_firm_id", lawFirm!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!lawFirm?.id,
  });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Your subscription and invoice history.</p>
      </div>

      {/* Subscription Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" /> Subscription</CardTitle>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={statusBadge[subscription.status] || ""}>{subscription.status}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Monthly Amount</p>
                <p className="text-xl font-bold">${subscription.monthly_amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Next Billing</p>
                <p className="font-medium">{subscription.next_billing_date ? format(new Date(subscription.next_billing_date), "MMM d, yyyy") : "—"}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active subscription.</p>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>Your billing history</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices && invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                    <TableCell className="text-sm">
                      {inv.billing_period_start && inv.billing_period_end
                        ? `${format(new Date(inv.billing_period_start), "MMM d")} - ${format(new Date(inv.billing_period_end), "MMM d, yyyy")}`
                        : "—"}
                    </TableCell>
                    <TableCell>${inv.total_amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={invoiceStatus[inv.status] || ""} variant="outline">{inv.status}</Badge>
                    </TableCell>
                    <TableCell>{inv.due_date ? format(new Date(inv.due_date), "MMM d, yyyy") : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No invoices yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
