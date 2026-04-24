import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";
import { format } from "date-fns";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ProviderBillingDetail() {
  const [providerId, setProviderId] = useState<string>("");

  const { data: providers } = useQuery({
    queryKey: ["report-providers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, business_name").order("business_name");
      return data ?? [];
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["report-provider-billing", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const [invoicesRes, paymentsRes, creditsRes, subRes] = await Promise.all([
        supabase.from("invoices").select("*").eq("provider_id", providerId).order("billing_period_start", { ascending: false }),
        supabase.from("payments").select("*").eq("provider_id", providerId).order("created_at", { ascending: false }),
        supabase.from("billing_credits").select("*").eq("provider_id", providerId).order("created_at", { ascending: false }),
        supabase.from("provider_subscriptions").select("*, membership_tiers(name), specialty_categories(name)").eq("provider_id", providerId).limit(1).single(),
      ]);

      const invoices = invoicesRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const credits = creditsRes.data ?? [];
      const totalInvoiced = invoices.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalPaid = payments.filter(p => p.status === "completed").reduce((s, r) => s + Number(r.amount), 0);
      const totalCredits = credits.filter(c => c.status === "available").reduce((s, r) => s + Number(r.amount), 0);

      // Monthly chart data (last 12 months)
      const chartData: { month: string; invoiced: number; paid: number }[] = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        const mStart = d.toISOString().split("T")[0];
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split("T")[0];
        const mInvoiced = invoices.filter(inv => inv.billing_period_start >= mStart && inv.billing_period_start <= mEnd).reduce((s, r) => s + Number(r.total_amount), 0);
        const mPaid = payments.filter(p => p.status === "completed" && p.processed_at && p.processed_at >= `${mStart}T00:00:00` && p.processed_at <= `${mEnd}T23:59:59`).reduce((s, r) => s + Number(r.amount), 0);
        chartData.push({ month: label, invoiced: mInvoiced, paid: mPaid });
      }

      return { invoices, payments, credits, subscription: subRes.data, totalInvoiced, totalPaid, totalCredits, balance: totalInvoiced - totalPaid, chartData };
    },
  });

  const handleExport = () => {
    if (!data) return;
    const rows: string[][] = [];
    rows.push(["INVOICES"]);
    rows.push(["Invoice #", "Period", "Total", "Paid", "Status", "Due Date"]);
    data.invoices.forEach(inv => {
      rows.push([inv.invoice_number, `${inv.billing_period_start} to ${inv.billing_period_end}`, fmt(Number(inv.total_amount)), fmt(Number(inv.paid_amount ?? 0)), inv.status, inv.due_date]);
    });
    rows.push([]);
    rows.push(["PAYMENTS"]);
    rows.push(["Date", "Amount", "Method", "Reference", "Status"]);
    data.payments.forEach(p => {
      rows.push([p.processed_at ?? p.created_at ?? "", fmt(Number(p.amount)), p.payment_method, p.payment_reference ?? "", p.status]);
    });
    rows.push([]);
    rows.push(["CREDITS"]);
    rows.push(["Date", "Amount", "Reason", "Status"]);
    data.credits.forEach(c => {
      rows.push([c.created_at ?? "", fmt(Number(c.amount)), c.reason, c.status]);
    });
    const providerName = providers?.find(p => p.id === providerId)?.business_name ?? "provider";
    downloadCSV(`billing-detail-${providerName.replace(/\s+/g, "-").toLowerCase()}.csv`, ["Col1", "Col2", "Col3", "Col4", "Col5", "Col6"], rows);
  };

  const statusColor = (s: string) => {
    switch (s) { case "paid": return "default"; case "past_due": return "destructive"; case "sent": return "secondary"; default: return "outline" as any; }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Provider Billing Detail</h2>
          <Select value={providerId} onValueChange={setProviderId}>
            <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select a provider…" /></SelectTrigger>
            <SelectContent>
              {(providers ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.business_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />Export to CSV
        </Button>
      </div>

      {!providerId ? (
        <p className="text-muted-foreground text-center py-12">Select a provider to view their billing history.</p>
      ) : isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Invoiced</p><p className="text-2xl font-bold">{fmt(data.totalInvoiced)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Paid</p><p className="text-2xl font-bold text-green-600">{fmt(data.totalPaid)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Credits Available</p><p className="text-2xl font-bold text-blue-600">{fmt(data.totalCredits)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Balance</p><p className={`text-2xl font-bold ${data.balance > 0 ? "text-orange-600" : "text-green-600"}`}>{fmt(data.balance)}</p></CardContent></Card>
          </div>

          {/* Chart */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Monthly Billing & Payments</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={v => `$${v}`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="invoiced" fill="hsl(var(--primary))" name="Invoiced" />
                    <Bar dataKey="paid" fill="hsl(150, 60%, 45%)" name="Paid" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Invoices Table */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Invoices ({data.invoices.length})</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead><TableHead>Period</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right">Paid</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                      <TableCell className="text-sm">{inv.billing_period_start} — {inv.billing_period_end}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(Number(inv.total_amount))}</TableCell>
                      <TableCell className="text-right">{fmt(Number(inv.paid_amount ?? 0))}</TableCell>
                      <TableCell><Badge variant={statusColor(inv.status)}>{inv.status}</Badge></TableCell>
                      <TableCell className="text-sm">{inv.due_date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Payments Table */}
          {data.payments.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Payments ({data.payments.length})</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead><TableHead>Reference</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.payments.map(p => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{p.processed_at ? format(new Date(p.processed_at), "MMM d, yyyy") : "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(Number(p.amount))}</TableCell>
                        <TableCell className="capitalize">{p.payment_method?.replace("_", " ")}</TableCell>
                        <TableCell className="font-mono text-sm">{p.payment_reference ?? "—"}</TableCell>
                        <TableCell><Badge variant={p.status === "completed" ? "default" : "secondary"}>{p.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
