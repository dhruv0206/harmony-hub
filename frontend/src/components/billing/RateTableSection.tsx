import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Save, CalendarIcon, History } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function RateTableSection() {
  const queryClient = useQueryClient();
  const [changes, setChanges] = useState<Record<string, number>>({});
  const [effectiveDate, setEffectiveDate] = useState<Date>(new Date());
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["specialty-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("specialty_categories").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: tiers } = useQuery({
    queryKey: ["membership-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("membership_tiers").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: markets } = useQuery({
    queryKey: ["geographic-markets"],
    queryFn: async () => {
      const { data } = await supabase.from("geographic_markets").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: rateCards } = useQuery({
    queryKey: ["rate-cards"],
    queryFn: async () => {
      const { data } = await supabase.from("rate_cards").select("*").eq("is_active", true).order("effective_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: allRateCards } = useQuery({
    queryKey: ["rate-cards-history"],
    queryFn: async () => {
      const { data } = await supabase.from("rate_cards").select("*").order("effective_date", { ascending: false });
      return data ?? [];
    },
  });

  const getRate = useCallback(
    (catId: string, tierId: string, mktId: string) => {
      return rateCards?.find(
        (r) => r.category_id === catId && r.tier_id === tierId && r.market_id === mktId
      );
    },
    [rateCards]
  );

  const cellKey = (catId: string, tierId: string, mktId: string) => `${catId}|${tierId}|${mktId}`;

  const handleCellChange = (catId: string, tierId: string, mktId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    const key = cellKey(catId, tierId, mktId);
    const existing = getRate(catId, tierId, mktId);
    if (existing && Number(existing.monthly_rate) === num) {
      const next = { ...changes };
      delete next[key];
      setChanges(next);
    } else {
      setChanges((prev) => ({ ...prev, [key]: num }));
    }
  };

  const handleSave = async () => {
    if (Object.keys(changes).length === 0) return;
    setSaving(true);
    try {
      const dateStr = format(effectiveDate, "yyyy-MM-dd");
      const rows = Object.entries(changes).map(([key, rate]) => {
        const [category_id, tier_id, market_id] = key.split("|");
        return { category_id, tier_id, market_id, monthly_rate: rate, effective_date: dateStr, is_active: true };
      });

      // Deactivate old rates for these combos
      for (const row of rows) {
        await supabase
          .from("rate_cards")
          .update({ is_active: false })
          .eq("category_id", row.category_id)
          .eq("tier_id", row.tier_id)
          .eq("market_id", row.market_id)
          .eq("is_active", true);
      }

      const { error } = await supabase.from("rate_cards").insert(rows as any);
      if (error) throw error;

      setChanges({});
      queryClient.invalidateQueries({ queryKey: ["rate-cards"] });
      queryClient.invalidateQueries({ queryKey: ["rate-cards-history"] });
      toast.success(`${rows.length} rate(s) updated effective ${dateStr}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const getRateHistory = (catId: string, tierId: string, mktId: string) => {
    return (allRateCards ?? []).filter(
      (r) => r.category_id === catId && r.tier_id === tierId && r.market_id === mktId
    );
  };

  const changeCount = Object.keys(changes).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-xl">Per-Location Rate Table</CardTitle>
            <CardDescription>Monthly fees by specialty category, membership tier, and geographic market</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {changeCount > 0 && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                {changeCount} unsaved change{changeCount > 1 ? "s" : ""}
              </Badge>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  Effective: {format(effectiveDate, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={effectiveDate}
                  onSelect={(d) => d && setEffectiveDate(d)}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button onClick={handleSave} disabled={changeCount === 0 || saving} size="sm">
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium text-muted-foreground" rowSpan={2}>
                Specialty Category
              </th>
              {tiers?.map((tier) => (
                <th
                  key={tier.id}
                  colSpan={markets?.length ?? 0}
                  className="text-center p-2 font-semibold border-l"
                >
                  {tier.name}
                </th>
              ))}
            </tr>
            <tr className="border-b bg-muted/30">
              {tiers?.map((tier) =>
                markets?.map((market) => (
                  <th key={`${tier.id}-${market.id}`} className="text-center p-2 text-xs font-medium text-muted-foreground border-l whitespace-nowrap">
                    {market.name}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {categories?.map((cat) => (
              <tr key={cat.id} className="border-b hover:bg-muted/20">
                <td className="p-2 font-medium whitespace-nowrap">
                  <div>{cat.name}</div>
                  <div className="text-xs text-muted-foreground">{cat.short_code}</div>
                </td>
                {tiers?.map((tier) =>
                  markets?.map((market) => {
                    const key = cellKey(cat.id, tier.id, market.id);
                    const existing = getRate(cat.id, tier.id, market.id);
                    const currentValue = changes[key] ?? (existing ? Number(existing.monthly_rate) : 0);
                    const isChanged = key in changes;
                    const history = getRateHistory(cat.id, tier.id, market.id);

                    return (
                      <td key={key} className="p-1 border-l text-center relative group">
                        <div className="flex items-center justify-center gap-0.5">
                          <span className="text-muted-foreground text-xs">$</span>
                          <input
                            type="number"
                            value={currentValue}
                            onChange={(e) => handleCellChange(cat.id, tier.id, market.id, e.target.value)}
                            className={cn(
                              "w-16 text-center text-sm border rounded px-1 py-0.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary",
                              isChanged && "bg-warning/15 border-warning/40 font-semibold"
                            )}
                          />
                          {history.length > 1 && (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5">
                                  <History className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-48 p-2" align="start">
                                <p className="text-xs font-semibold mb-1.5">Rate History</p>
                                <div className="space-y-1">
                                  {history.slice(0, 8).map((h, i) => (
                                    <div key={h.id} className="flex justify-between text-xs">
                                      <span className={cn(i === 0 && h.is_active && "font-semibold text-primary")}>
                                        ${Number(h.monthly_rate).toFixed(0)}
                                      </span>
                                      <span className="text-muted-foreground">{h.effective_date}</span>
                                    </div>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          )}
                        </div>
                      </td>
                    );
                  })
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
