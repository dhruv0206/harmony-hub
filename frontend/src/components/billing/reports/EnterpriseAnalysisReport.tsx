import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function EnterpriseAnalysisReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-enterprise-analysis"],
    queryFn: async () => {
      // Get per-location (non-enterprise) active subs with 4+ locations
      const { data: subs } = await supabase
        .from("provider_subscriptions")
        .select("id, provider_id, monthly_amount, category_id, tier_id, is_enterprise, providers(business_name), membership_tiers(name, short_code), specialty_categories(name, short_code)")
        .eq("status", "active")
        .eq("is_enterprise", false);

      const { data: entRates } = await supabase
        .from("enterprise_rates")
        .select("category_id, tier_id, monthly_rate, min_locations")
        .eq("is_active", true);

      const results: any[] = [];

      for (const sub of subs ?? []) {
        const { count } = await supabase
          .from("provider_locations")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", sub.provider_id)
          .eq("is_active", true);

        const locCount = count ?? 0;
        if (locCount < 4) continue;

        const entRate = (entRates ?? []).find(
          r => r.category_id === sub.category_id && r.tier_id === sub.tier_id && locCount >= (r.min_locations ?? 0)
        );

        const currentMonthly = Number(sub.monthly_amount);
        const enterpriseMonthly = entRate ? Number(entRate.monthly_rate) : null;

        results.push({
          providerId: sub.provider_id,
          providerName: (sub.providers as any)?.business_name ?? "Unknown",
          tier: (sub.membership_tiers as any)?.name ?? "—",
          category: (sub.specialty_categories as any)?.name ?? "—",
          locationCount: locCount,
          currentMonthly,
          enterpriseMonthly,
          difference: enterpriseMonthly != null ? currentMonthly - enterpriseMonthly : null,
          cheaperForProvider: enterpriseMonthly != null ? enterpriseMonthly < currentMonthly : false,
          moreProfitable: enterpriseMonthly != null ? currentMonthly > enterpriseMonthly : false,
        });
      }

      results.sort((a, b) => (b.difference ?? 0) - (a.difference ?? 0));

      const conversionOpportunities = results.filter(r => r.cheaperForProvider);
      const totalCurrentIfConverted = conversionOpportunities.reduce((s, r) => s + r.currentMonthly, 0);
      const totalEnterpriseIfConverted = conversionOpportunities.reduce((s, r) => s + (r.enterpriseMonthly ?? 0), 0);

      return {
        providers: results,
        totalProviders: results.length,
        conversionCount: conversionOpportunities.length,
        keepCount: results.length - conversionOpportunities.length,
        revenueImpact: totalEnterpriseIfConverted - totalCurrentIfConverted,
      };
    },
  });

  const handleExport = () => {
    if (!data) return;
    const headers = ["Provider", "Tier", "Category", "Locations", "Current Monthly", "Enterprise Monthly", "Difference", "Recommendation"];
    const rows = data.providers.map(p => [
      p.providerName, p.tier, p.category, String(p.locationCount),
      fmt(p.currentMonthly), p.enterpriseMonthly != null ? fmt(p.enterpriseMonthly) : "N/A",
      p.difference != null ? fmt(p.difference) : "N/A",
      p.cheaperForProvider ? "Convert (saves provider money, locks commitment)" : "Keep per-location (more profitable)",
    ]);
    downloadCSV("enterprise-analysis.csv", headers, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Enterprise vs Per-Location Analysis</h2>
        <Button variant="outline" onClick={handleExport} disabled={!data}>
          <Download className="mr-2 h-4 w-4" />Export to CSV
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : data ? (
        <>
          {/* Summary */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Eligible Providers (4+ locations)</p><p className="text-2xl font-bold">{data.totalProviders}</p></CardContent></Card>
            <Card className="border-l-4 border-l-green-500"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Conversion Opportunities</p><p className="text-2xl font-bold text-green-600">{data.conversionCount}</p><p className="text-xs text-muted-foreground">Enterprise cheaper for provider</p></CardContent></Card>
            <Card className="border-l-4 border-l-blue-500"><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Keep Per-Location</p><p className="text-2xl font-bold text-blue-600">{data.keepCount}</p><p className="text-xs text-muted-foreground">More profitable on current plan</p></CardContent></Card>
            <Card><CardContent className="pt-4"><p className="text-sm text-muted-foreground">Revenue Impact if All Convert</p><p className={`text-2xl font-bold ${data.revenueImpact >= 0 ? "text-green-600" : "text-orange-600"}`}>{data.revenueImpact >= 0 ? "+" : ""}{fmt(data.revenueImpact)}/mo</p></CardContent></Card>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="pt-6">
              {data.providers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider</TableHead>
                      <TableHead>Tier</TableHead>
                      <TableHead className="text-right">Locations</TableHead>
                      <TableHead className="text-right">Current/mo</TableHead>
                      <TableHead className="text-right">Enterprise/mo</TableHead>
                      <TableHead className="text-right">Difference</TableHead>
                      <TableHead>Recommendation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.providers.map(p => (
                      <TableRow key={p.providerId}>
                        <TableCell className="font-medium">{p.providerName}</TableCell>
                        <TableCell>{p.tier}</TableCell>
                        <TableCell className="text-right">{p.locationCount}</TableCell>
                        <TableCell className="text-right font-semibold">{fmt(p.currentMonthly)}</TableCell>
                        <TableCell className="text-right">{p.enterpriseMonthly != null ? fmt(p.enterpriseMonthly) : "—"}</TableCell>
                        <TableCell className="text-right">
                          {p.difference != null ? (
                            <span className={p.difference > 0 ? "text-green-600" : "text-orange-600"}>{p.difference > 0 ? "+" : ""}{fmt(p.difference)}</span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {p.cheaperForProvider ? (
                            <Badge className="bg-green-500/10 text-green-700 border-green-500/20">
                              <ArrowDownRight className="h-3 w-3 mr-1" />Convert
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <ArrowUpRight className="h-3 w-3 mr-1" />Keep
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No providers with 4+ locations on per-location billing.</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
