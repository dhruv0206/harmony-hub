import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Download } from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BUCKETS = [
  { key: "current", label: "Current", min: -Infinity, max: 0 },
  { key: "d1_7", label: "1-7 days", min: 1, max: 7 },
  { key: "d8_14", label: "8-14 days", min: 8, max: 14 },
  { key: "d15_30", label: "15-30 days", min: 15, max: 30 },
  { key: "d31_60", label: "31-60 days", min: 31, max: 60 },
  { key: "d60plus", label: "60+ days", min: 61, max: Infinity },
] as const;

const bucketColor = (key: string) => {
  switch (key) {
    case "current": return "text-green-600";
    case "d1_7": case "d8_14": return "text-yellow-600";
    case "d15_30": return "text-orange-600";
    case "d31_60": return "text-destructive";
    case "d60plus": return "text-red-900";
    default: return "";
  }
};

export default function ARAgingReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-ar-aging"],
    queryFn: async () => {
      const { data: invoices } = await supabase
        .from("invoices")
        .select("id, total_amount, paid_amount, due_date, provider_id, providers(business_name)")
        .in("status", ["sent", "past_due", "partial", "pending"]);

      const now = Date.now();
      const providerMap: Record<string, { name: string; buckets: Record<string, number>; total: number }> = {};

      (invoices ?? []).forEach((inv: any) => {
        const owed = Number(inv.total_amount) - Number(inv.paid_amount ?? 0);
        if (owed <= 0) return;
        const daysPast = Math.floor((now - new Date(inv.due_date).getTime()) / 86400000);
        const bucket = BUCKETS.find(b => daysPast >= b.min && daysPast <= b.max) ?? BUCKETS[0];
        const pid = inv.provider_id;

        if (!providerMap[pid]) {
          providerMap[pid] = { name: (inv.providers as any)?.business_name ?? "Unknown", buckets: {}, total: 0 };
          BUCKETS.forEach(b => (providerMap[pid].buckets[b.key] = 0));
        }
        providerMap[pid].buckets[bucket.key] += owed;
        providerMap[pid].total += owed;
      });

      const rows = Object.values(providerMap).sort((a, b) => b.total - a.total);
      const totals: Record<string, number> = {};
      BUCKETS.forEach(b => (totals[b.key] = 0));
      let grandTotal = 0;
      rows.forEach(r => {
        BUCKETS.forEach(b => (totals[b.key] += r.buckets[b.key]));
        grandTotal += r.total;
      });

      return { rows, totals, grandTotal };
    },
  });

  const handleExport = () => {
    if (!data) return;
    const headers = ["Provider", ...BUCKETS.map(b => b.label), "Total"];
    const csvRows = data.rows.map(r => [r.name, ...BUCKETS.map(b => fmt(r.buckets[b.key])), fmt(r.total)]);
    csvRows.push(["TOTALS", ...BUCKETS.map(b => fmt(data.totals[b.key])), fmt(data.grandTotal)]);
    downloadCSV("ar-aging-report.csv", headers, csvRows);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Accounts Receivable Aging</h2>
        <Button variant="outline" onClick={handleExport} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />Export to CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : data && data.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    {BUCKETS.map(b => <TableHead key={b.key} className="text-right">{b.label}</TableHead>)}
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      {BUCKETS.map(b => (
                        <TableCell key={b.key} className={`text-right ${r.buckets[b.key] > 0 ? bucketColor(b.key) + " font-semibold" : "text-muted-foreground"}`}>
                          {r.buckets[b.key] > 0 ? fmt(r.buckets[b.key]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold">{fmt(r.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTALS</TableCell>
                    {BUCKETS.map(b => (
                      <TableCell key={b.key} className={`text-right ${bucketColor(b.key)}`}>{fmt(data.totals[b.key])}</TableCell>
                    ))}
                    <TableCell className="text-right">{fmt(data.grandTotal)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No outstanding receivables — all clear!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
