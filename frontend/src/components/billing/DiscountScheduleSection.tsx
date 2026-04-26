import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Percent } from "lucide-react";
import { toast } from "sonner";

interface DiscountTier {
  min_locations: number;
  max_locations: number | null;
  discount_percentage: number;
  label: string;
}

export default function DiscountScheduleSection() {
  const queryClient = useQueryClient();
  const [tiers, setTiers] = useState<DiscountTier[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["discount-schedule"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_config").select("*").eq("feature_name", "multi_location_discounts").maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (config) {
      setTiers((config.settings as any)?.tiers ?? []);
      setHasChanges(false);
    }
  }, [config]);

  const updateDiscount = (index: number, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) return;
    const next = [...tiers];
    next[index] = { ...next[index], discount_percentage: num };
    setTiers(next);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = { tiers } as any;
      if (config?.id) {
        await supabase.from("ai_config").update({ settings }).eq("id", config.id);
      } else {
        await supabase.from("ai_config").insert({ feature_name: "multi_location_discounts", settings, enabled: true } as any);
      }
      queryClient.invalidateQueries({ queryKey: ["discount-schedule"] });
      setHasChanges(false);
      toast.success("Discount schedule saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Percent className="h-5 w-5" />
              Multi-Location Discount Schedule
            </CardTitle>
            <CardDescription>Discount tiers applied when a provider has multiple locations</CardDescription>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || saving} size="sm">
            <Save className="h-4 w-4 mr-2" />Save Changes
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {tiers.map((tier, i) => (
            <div key={i} className="flex items-center gap-4 p-3 border rounded-lg bg-muted/20">
              <div className="flex-1">
                <p className="text-sm font-medium">{tier.label}</p>
                <p className="text-xs text-muted-foreground">
                  {tier.max_locations
                    ? `Locations ${tier.min_locations}–${tier.max_locations}`
                    : `Locations ${tier.min_locations}+`}
                </p>
              </div>
              {tier.discount_percentage === 100 ? (
                <Badge variant="secondary" className="text-xs">Enterprise Rate</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={tier.discount_percentage}
                    onChange={(e) => updateDiscount(i, e.target.value)}
                    className="w-20 text-center text-sm"
                  />
                  <span className="text-sm text-muted-foreground">% discount</span>
                  <Badge variant="outline" className="text-xs whitespace-nowrap">
                    Pays {100 - tier.discount_percentage}%
                  </Badge>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
