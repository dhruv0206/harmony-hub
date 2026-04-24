import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Save, CalendarIcon, Building } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function EnterpriseRatesSection() {
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

  const { data: enterpriseRates } = useQuery({
    queryKey: ["enterprise-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("enterprise_rates").select("*").eq("is_active", true).order("effective_date", { ascending: false });
      return data ?? [];
    },
  });

  const getRate = (catId: string, tierId: string) => {
    return enterpriseRates?.find((r) => r.category_id === catId && r.tier_id === tierId);
  };

  const cellKey = (catId: string, tierId: string) => `${catId}|${tierId}`;

  const handleCellChange = (catId: string, tierId: string, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    const key = cellKey(catId, tierId);
    const existing = getRate(catId, tierId);
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
        const [category_id, tier_id] = key.split("|");
        return { category_id, tier_id, monthly_rate: rate, effective_date: dateStr, is_active: true };
      });

      for (const row of rows) {
        await supabase
          .from("enterprise_rates")
          .update({ is_active: false })
          .eq("category_id", row.category_id)
          .eq("tier_id", row.tier_id)
          .eq("is_active", true);
      }

      const { error } = await supabase.from("enterprise_rates").insert(rows as any);
      if (error) throw error;

      setChanges({});
      queryClient.invalidateQueries({ queryKey: ["enterprise-rates"] });
      toast.success(`${rows.length} enterprise rate(s) updated effective ${dateStr}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const changeCount = Object.keys(changes).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Building className="h-5 w-5" />
              Enterprise Rates (5+ Locations)
            </CardTitle>
            <CardDescription>Flat monthly fee for providers with 5 or more locations</CardDescription>
          </div>
          <div className="flex items-center gap-3">
            {changeCount > 0 && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                {changeCount} unsaved
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
              <Save className="h-4 w-4 mr-2" />Save Changes
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 font-medium text-muted-foreground">Specialty Category</th>
              {tiers?.map((t) => (
                <th key={t.id} className="text-center p-2 font-semibold border-l">{t.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories?.map((cat) => (
              <tr key={cat.id} className="border-b hover:bg-muted/20">
                <td className="p-2 font-medium">
                  <div>{cat.name}</div>
                  <div className="text-xs text-muted-foreground">{cat.short_code}</div>
                </td>
                {tiers?.map((tier) => {
                  const key = cellKey(cat.id, tier.id);
                  const existing = getRate(cat.id, tier.id);
                  const currentValue = changes[key] ?? (existing ? Number(existing.monthly_rate) : 0);
                  const isChanged = key in changes;

                  return (
                    <td key={key} className="p-1 border-l text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="text-muted-foreground text-xs">$</span>
                        <input
                          type="number"
                          value={currentValue}
                          onChange={(e) => handleCellChange(cat.id, tier.id, e.target.value)}
                          className={cn(
                            "w-20 text-center text-sm border rounded px-1 py-0.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary",
                            isChanged && "bg-warning/15 border-warning/40 font-semibold"
                          )}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
