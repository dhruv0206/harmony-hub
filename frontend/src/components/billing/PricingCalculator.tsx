import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calculator, MapPin } from "lucide-react";

interface DiscountTier {
  min_locations: number;
  max_locations: number | null;
  discount_percentage: number;
  label: string;
}

export default function PricingCalculator() {
  const [categoryId, setCategoryId] = useState("");
  const [tierId, setTierId] = useState("");
  const [marketId, setMarketId] = useState("");
  const [locationCount, setLocationCount] = useState(1);

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

  const { data: enterpriseRates } = useQuery({
    queryKey: ["enterprise-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("enterprise_rates").select("*").eq("is_active", true).order("effective_date", { ascending: false });
      return data ?? [];
    },
  });

  const { data: discountConfig } = useQuery({
    queryKey: ["discount-schedule"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_config").select("*").eq("feature_name", "multi_location_discounts").maybeSingle();
      return data ?? null;
    },
  });

  const discountTiers: DiscountTier[] = (discountConfig?.settings as any)?.tiers ?? [];

  const calculation = useMemo(() => {
    if (!categoryId || !tierId || !marketId || locationCount < 1) return null;

    const baseRate = rateCards?.find(
      (r) => r.category_id === categoryId && r.tier_id === tierId && r.market_id === marketId
    );
    if (!baseRate) return null;

    const entRate = enterpriseRates?.find(
      (r) => r.category_id === categoryId && r.tier_id === tierId
    );

    const lines: { location: number; rate: number; discount: number; net: number; label: string }[] = [];
    let total = 0;

    for (let i = 1; i <= locationCount; i++) {
      const tier = discountTiers.find(
        (t) => i >= t.min_locations && (t.max_locations === null || i <= t.max_locations)
      );
      const discountPct = tier?.discount_percentage ?? 0;

      // If enterprise tier (100% discount marker) and enterprise rate exists
      if (discountPct === 100 && entRate) {
        // Enterprise: flat rate for all locations from this point
        return {
          lines: lines,
          isEnterprise: true,
          enterpriseRate: Number(entRate.monthly_rate),
          baseRate: Number(baseRate.monthly_rate),
          total: Number(entRate.monthly_rate),
          locationCount,
        };
      }

      const rate = Number(baseRate.monthly_rate);
      const net = rate * (1 - discountPct / 100);
      lines.push({
        location: i,
        rate,
        discount: discountPct,
        net: Math.round(net * 100) / 100,
        label: tier?.label ?? "",
      });
      total += net;
    }

    return {
      lines,
      isEnterprise: false,
      enterpriseRate: 0,
      baseRate: Number(baseRate.monthly_rate),
      total: Math.round(total * 100) / 100,
      locationCount,
    };
  }, [categoryId, tierId, marketId, locationCount, rateCards, enterpriseRates, discountTiers]);

  const selectedCategory = categories?.find((c) => c.id === categoryId);
  const selectedTier = tiers?.find((t) => t.id === tierId);
  const selectedMarket = markets?.find((m) => m.id === marketId);

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Calculator className="h-5 w-5 text-primary" />
          Preview Provider Pricing
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Specialty Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Membership Tier</Label>
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
              <SelectContent>
                {tiers?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Geographic Market</Label>
            <Select value={marketId} onValueChange={setMarketId}>
              <SelectTrigger><SelectValue placeholder="Select market" /></SelectTrigger>
              <SelectContent>
                {markets?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Number of Locations</Label>
            <Input
              type="number"
              min={1}
              max={50}
              value={locationCount}
              onChange={(e) => setLocationCount(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
        </div>

        {calculation && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 flex items-center justify-between text-sm font-medium">
              <span>
                {selectedCategory?.name} · {selectedTier?.name} · {selectedMarket?.name} · {calculation.locationCount} location{calculation.locationCount > 1 ? "s" : ""}
              </span>
              {calculation.isEnterprise && (
                <Badge variant="secondary" className="bg-primary/10 text-primary">Enterprise Rate Applied</Badge>
              )}
            </div>
            {!calculation.isEnterprise ? (
              <div className="divide-y">
                {calculation.lines.map((line) => (
                  <div key={line.location} className="flex items-center justify-between px-4 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Location {line.location}</span>
                      {line.discount > 0 && (
                        <Badge variant="outline" className="text-xs">{line.discount}% discount</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {line.discount > 0 && (
                        <span className="text-muted-foreground line-through text-xs">${line.rate.toFixed(2)}</span>
                      )}
                      <span className="font-medium">${line.net.toFixed(2)}/mo</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-3 text-sm">
                <p className="text-muted-foreground">
                  With {calculation.locationCount} locations, this provider qualifies for the enterprise flat rate
                  instead of per-location pricing.
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">Per-location rate would be:</span>{" "}
                  <span className="line-through">${calculation.baseRate.toFixed(2)}/mo × {calculation.locationCount} = ${(calculation.baseRate * calculation.locationCount).toFixed(2)}/mo</span>
                </p>
              </div>
            )}
            <div className="bg-muted/50 px-4 py-3 flex justify-between items-center font-semibold">
              <span>Total Monthly Fee</span>
              <span className="text-lg text-primary">${calculation.total.toFixed(2)}/mo</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
