import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function getMonthOptions() {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    });
  }
  return options;
}

export default function MonthlyRevenueReport() {
  const monthOptions = getMonthOptions();
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);

  const { data, isLoading } = useQuery({
    queryKey: ["report-monthly-revenue", selectedMonth],
    queryFn: async () => {
      const [year, month] = selectedMonth.split("-").map(Number);
      const start = new Date(year, month - 1, 1).toISOString().split("T")[0];
      const end = new Date(year, month, 0).toISOString().split("T")[0];
      const endOfMonth = new Date(year, month, 0);

      const [invoicesRes, paymentsRes, subsRes, newSubsRes, cancelledRes, catsRes, tiersRes, marketsRes] = await Promise.all([
        supabase.from("invoices").select("total_amount, paid_amount, status, subscription_id").gte("billing_period_start", start).lte("billing_period_start", end),
        supabase.from("payments").select("amount").eq("status", "completed").gte("processed_at", `${start}T00:00:00`).lte("processed_at", `${end}T23:59:59`),
        supabase.from("provider_subscriptions").select("monthly_amount, started_at, cancelled_at, membership_tiers(name, short_code), specialty_categories(name, short_code)").in("status", ["active", "cancelled", "suspended", "past_due"]),
        supabase.from("provider_subscriptions").select("monthly_amount").gte("started_at", `${start}T00:00:00`).lte("started_at", `${end}T23:59:59`),
        supabase.from("provider_subscriptions").select("monthly_amount").gte("cancelled_at", `${start}T00:00:00`).lte("cancelled_at", `${end}T23:59:59`),
        supabase.from("specialty_categories").select("name, short_code").order("display_order"),
        supabase.from("membership_tiers").select("name, short_code").order("display_order"),
        supabase.from("geographic_markets").select("name, short_code").order("display_order"),
      ]);

      const invoices = invoicesRes.data ?? [];
      const totalInvoiced = invoices.reduce((s, r) => s + Number(r.total_amount), 0);
      const totalCollected = paymentsRes.data?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;
      const totalOutstanding = invoices.filter(i => ["sent", "past_due", "partial"].includes(i.status)).reduce((s, r) => s + Number(r.total_amount) - Number(r.paid_amount ?? 0), 0);

      // Active subs at end of month
      const activeSubs = (subsRes.data ?? []).filter((s: any) => {
        const st = s.started_at ? new Date(s.started_at) : null;
        const ca = s.cancelled_at ? new Date(s.cancelled_at) : null;
        return st && st <= endOfMonth && (!ca || ca > endOfMonth);
      });

      // By category
      const byCategory = (catsRes.data ?? []).map((cat: any) => {
        const catSubs = activeSubs.filter((s: any) => (s.specialty_categories as any)?.short_code === cat.short_code);
        const rev = catSubs.reduce((s: number, r: any) => s + Number(r.monthly_amount), 0);
        return { name: cat.name, code: cat.short_code, revenue: rev, count: catSubs.length };
      });

      // By tier
      const byTier = (tiersRes.data ?? []).map((tier: any) => {
        const tierSubs = activeSubs.filter((s: any) => (s.membership_tiers as any)?.short_code === tier.short_code);
        const rev = tierSubs.reduce((s: number, r: any) => s + Number(r.monthly_amount), 0);
        return { name: tier.name, code: tier.short_code, revenue: rev, count: tierSubs.length };
      });

      const newMrr = newSubsRes.data?.reduce((s, r) => s + Number(r.monthly_amount), 0) ?? 0;
      const churnedMrr = cancelledRes.data?.reduce((s, r) => s + Number(r.monthly_amount), 0) ?? 0;

      return {
        totalInvoiced, totalCollected, totalOutstanding,
        collectionRate: totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0,
        byCategory, byTier,
        newCount: newSubsRes.data?.length ?? 0, newMrr,
        cancelledCount: cancelledRes.data?.length ?? 0, churnedMrr,
        netMrrChange: newMrr - churnedMrr,
      };
    },
  });

  const handleExport = () => {
    if (!data) return;
    const rows: string[][] = [
      ["Summary"],
      ["Total Invoiced", fmt(data.totalInvoiced)],
      ["Total Collected", fmt(data.totalCollected)],
      ["Total Outstanding", fmt(data.totalOutstanding)],
      ["Collection Rate", `${data.collectionRate.toFixed(1)}%`],
      [],
      ["By Specialty Category", "Count", "Revenue"],
      ...data.byCategory.map(c => [c.name, String(c.count), fmt(c.revenue)]),
      [],
      ["By Membership Tier", "Count", "Revenue"],
      ...data.byTier.map(t => [t.name, String(t.count), fmt(t.revenue)]),
      [],
      ["MRR Movement"],
      ["New Subscriptions", String(data.newCount), fmt(data.newMrr)],
      ["Cancelled Subscriptions", String(data.cancelledCount), fmt(data.churnedMrr)],
      ["Net MRR Change", "", fmt(data.netMrrChange)],
    ];
    downloadCSV(`monthly-revenue-${selectedMonth}.csv`, ["Metric", "Value", "Detail"], rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Monthly Revenue Report</h2>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={handleExport} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />Export to CSV
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading report…</p>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Invoiced</p><p className="text-2xl font-bold">{fmt(data.totalInvoiced)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Total Collected</p><p className="text-2xl font-bold text-green-600">{fmt(data.totalCollected)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-2xl font-bold text-orange-600">{fmt(data.totalOutstanding)}</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Collection Rate</p><p className="text-2xl font-bold">{data.collectionRate.toFixed(1)}%</p></CardContent></Card>
          </div>

          {/* Breakdowns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">By Specialty Category</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Category</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.byCategory.map(c => (
                      <TableRow key={c.code}><TableCell>{c.name}</TableCell><TableCell className="text-right">{c.count}</TableCell><TableCell className="text-right font-semibold">{fmt(c.revenue)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">By Membership Tier</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Tier</TableHead><TableHead className="text-right">Count</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.byTier.map(t => (
                      <TableRow key={t.code}><TableCell>{t.name}</TableCell><TableCell className="text-right">{t.count}</TableCell><TableCell className="text-right font-semibold">{fmt(t.revenue)}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* MRR Movement */}
          <Card>
            <CardHeader><CardTitle className="text-lg">MRR Movement</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/10">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-muted-foreground">New MRR ({data.newCount} subs)</p>
                    <p className="text-lg font-bold text-green-600">+{fmt(data.newMrr)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10">
                  <TrendingDown className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-sm text-muted-foreground">Churned MRR ({data.cancelledCount} subs)</p>
                    <p className="text-lg font-bold text-destructive">-{fmt(data.churnedMrr)}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-3 p-3 rounded-lg ${data.netMrrChange >= 0 ? "bg-green-500/10" : "bg-destructive/10"}`}>
                  {data.netMrrChange >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
                  <div>
                    <p className="text-sm text-muted-foreground">Net MRR Change</p>
                    <p className={`text-lg font-bold ${data.netMrrChange >= 0 ? "text-green-600" : "text-destructive"}`}>{data.netMrrChange >= 0 ? "+" : ""}{fmt(data.netMrrChange)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
