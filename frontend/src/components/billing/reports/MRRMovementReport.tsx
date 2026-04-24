import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ReferenceLine } from "recharts";

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function MRRMovementReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-mrr-movement"],
    queryFn: async () => {
      const { data: subs } = await supabase
        .from("provider_subscriptions")
        .select("monthly_amount, started_at, cancelled_at, status")
        .in("status", ["active", "cancelled", "suspended", "past_due"]);

      const allSubs = subs ?? [];
      const months: { label: string; start: Date; end: Date }[] = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        months.push({ label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), start: d, end: e });
      }

      return months.map(({ label, start, end }, idx) => {
        const prevEnd = idx > 0 ? months[idx - 1].end : new Date(start.getFullYear(), start.getMonth() - 1, 28);

        // Beginning MRR = active at end of previous month
        const beginMrr = allSubs.filter(s => {
          const st = s.started_at ? new Date(s.started_at) : null;
          const ca = s.cancelled_at ? new Date(s.cancelled_at) : null;
          return st && st <= prevEnd && (!ca || ca > prevEnd);
        }).reduce((sum, s) => sum + Number(s.monthly_amount), 0);

        // New: started this month
        const newSubs = allSubs.filter(s => {
          const st = s.started_at ? new Date(s.started_at) : null;
          return st && st >= start && st <= end;
        });
        const newMrr = newSubs.reduce((sum, s) => sum + Number(s.monthly_amount), 0);

        // Churned: cancelled this month
        const churnedSubs = allSubs.filter(s => {
          const ca = s.cancelled_at ? new Date(s.cancelled_at) : null;
          return ca && ca >= start && ca <= end;
        });
        const churnedMrr = churnedSubs.reduce((sum, s) => sum + Number(s.monthly_amount), 0);

        const endMrr = beginMrr + newMrr - churnedMrr;

        return { month: label, beginMrr, newMrr, churnedMrr, expansionMrr: 0, contractionMrr: 0, endMrr };
      });
    },
  });

  // Waterfall for current month
  const currentMonth = data?.[data.length - 1];
  const waterfallData = currentMonth ? [
    { name: "Beginning", value: currentMonth.beginMrr, fill: "hsl(var(--primary))" },
    { name: "New", value: currentMonth.newMrr, fill: "hsl(150, 60%, 45%)" },
    { name: "Expansion", value: currentMonth.expansionMrr, fill: "hsl(170, 60%, 45%)" },
    { name: "Contraction", value: -currentMonth.contractionMrr, fill: "hsl(38, 80%, 55%)" },
    { name: "Churned", value: -currentMonth.churnedMrr, fill: "hsl(0, 70%, 55%)" },
    { name: "Ending", value: currentMonth.endMrr, fill: "hsl(var(--primary))" },
  ] : [];

  const handleExport = () => {
    if (!data) return;
    const headers = ["Month", "Beginning MRR", "+ New", "+ Expansion", "- Contraction", "- Churned", "= Ending MRR"];
    const rows = data.map(d => [d.month, fmt(d.beginMrr), fmt(d.newMrr), fmt(d.expansionMrr), fmt(d.contractionMrr), fmt(d.churnedMrr), fmt(d.endMrr)]);
    downloadCSV("mrr-movement-report.csv", headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">MRR Movement Report</h2>
        <Button variant="outline" onClick={handleExport} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />Export to CSV
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : data ? (
        <>
          {/* Waterfall Chart */}
          {waterfallData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-lg">Current Month Waterfall</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waterfallData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip formatter={(v: number) => fmt(Math.abs(v))} />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {waterfallData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 12-month Table */}
          <Card>
            <CardHeader><CardTitle className="text-lg">12-Month MRR Movement</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Beginning</TableHead>
                      <TableHead className="text-right text-green-600">+ New</TableHead>
                      <TableHead className="text-right text-green-600">+ Expansion</TableHead>
                      <TableHead className="text-right text-orange-600">- Contraction</TableHead>
                      <TableHead className="text-right text-destructive">- Churned</TableHead>
                      <TableHead className="text-right font-bold">= Ending</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map(d => (
                      <TableRow key={d.month}>
                        <TableCell className="font-medium">{d.month}</TableCell>
                        <TableCell className="text-right">{fmt(d.beginMrr)}</TableCell>
                        <TableCell className="text-right text-green-600">{d.newMrr > 0 ? `+${fmt(d.newMrr)}` : "—"}</TableCell>
                        <TableCell className="text-right text-green-600">{d.expansionMrr > 0 ? `+${fmt(d.expansionMrr)}` : "—"}</TableCell>
                        <TableCell className="text-right text-orange-600">{d.contractionMrr > 0 ? `-${fmt(d.contractionMrr)}` : "—"}</TableCell>
                        <TableCell className="text-right text-destructive">{d.churnedMrr > 0 ? `-${fmt(d.churnedMrr)}` : "—"}</TableCell>
                        <TableCell className="text-right font-bold">{fmt(d.endMrr)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
