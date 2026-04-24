import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DollarSign, MapPin, Plus, X, Building, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { type DiscountTier, fetchDiscountTiers } from "@/lib/billing-calculator";

interface OnboardingBillingSetupProps {
  providerId: string;
  providerName: string;
  providerAddress?: { address_line1?: string; city?: string; state?: string; zip_code?: string };
  onComplete: () => void;
}

interface LocationDraft {
  id: string;
  location_name: string;
  address_line1: string;
  city: string;
  state: string;
  zip_code: string;
  market_id: string;
  is_primary: boolean;
}

export default function OnboardingBillingSetup({ providerId, providerName, providerAddress, onComplete }: OnboardingBillingSetupProps) {
  const { user } = useAuth();
  const [categoryId, setCategoryId] = useState("");
  const [tierId, setTierId] = useState("");
  const [isEnterprise, setIsEnterprise] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<LocationDraft[]>([]);
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [trialDays, setTrialDays] = useState(30);

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
      const { data } = await supabase.from("rate_cards").select("*").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: enterpriseRates } = useQuery({
    queryKey: ["enterprise-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("enterprise_rates").select("*").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: discountTiers } = useQuery({
    queryKey: ["discount-schedule"],
    queryFn: fetchDiscountTiers,
  });

  // Auto-populate primary location from provider address
  useEffect(() => {
    if (locations.length === 0 && providerAddress?.city) {
      // Suggest market based on city
      const suggestedMarket = markets?.find((m) => m.short_code === "MID_MARKET"); // default suggestion
      setLocations([{
        id: crypto.randomUUID(),
        location_name: "Main Office",
        address_line1: providerAddress.address_line1 ?? "",
        city: providerAddress.city ?? "",
        state: providerAddress.state ?? "",
        zip_code: providerAddress.zip_code ?? "",
        market_id: suggestedMarket?.id ?? "",
        is_primary: true,
      }]);
    }
  }, [providerAddress, markets]);

  const addLocation = () => {
    setLocations([...locations, {
      id: crypto.randomUUID(),
      location_name: "",
      address_line1: "",
      city: "",
      state: "",
      zip_code: "",
      market_id: "",
      is_primary: false,
    }]);
  };

  const removeLocation = (id: string) => {
    setLocations(locations.filter((l) => l.id !== id));
  };

  const updateLocation = (id: string, field: string, value: string) => {
    setLocations(locations.map((l) => l.id === id ? { ...l, [field]: value } : l));
  };

  // Calculate pricing in real-time
  const calculation = useMemo(() => {
    if (!categoryId || !tierId || !rateCards || !discountTiers || locations.length === 0) return null;

    const locationsWithRates = locations.filter((l) => l.market_id).map((loc) => {
      const rate = rateCards.find((r) => r.category_id === categoryId && r.tier_id === tierId && r.market_id === loc.market_id);
      return { ...loc, baseRate: rate ? Number(rate.monthly_rate) : 0 };
    });

    const sorted = [...locationsWithRates].sort((a, b) => b.baseRate - a.baseRate);

    const lines = sorted.map((loc, idx) => {
      const position = idx + 1;
      const tier = discountTiers.find(
        (t: DiscountTier) => position >= t.min_locations && (t.max_locations === null || position <= t.max_locations)
      );
      const discountPct = tier?.discount_percentage === 100 ? 55 : (tier?.discount_percentage ?? 0);
      return {
        ...loc,
        position,
        discountPct,
        lineTotal: Math.round(loc.baseRate * (1 - discountPct / 100) * 100) / 100,
      };
    });

    const perLocationTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const entRate = enterpriseRates?.find((r) => r.category_id === categoryId && r.tier_id === tierId);
    const enterpriseRate = entRate ? Number(entRate.monthly_rate) : 0;

    return {
      lines,
      total: isEnterprise ? enterpriseRate : perLocationTotal,
      enterpriseRate,
      perLocationTotal,
    };
  }, [categoryId, tierId, isEnterprise, locations, rateCards, enterpriseRates, discountTiers]);

  const handleSave = async () => {
    if (!categoryId || !tierId) {
      toast.error("Please select a category and tier");
      return;
    }
    setSaving(true);
    try {
      // Update provider
      await supabase.from("providers").update({
        specialty_category_id: categoryId,
        membership_tier_id: tierId,
        is_enterprise: isEnterprise,
      }).eq("id", providerId);

      // Create locations
      for (const loc of locations) {
        if (!loc.address_line1 || !loc.city || !loc.state) continue;
        await supabase.from("provider_locations").insert({
          provider_id: providerId,
          location_name: loc.location_name || null,
          address_line1: loc.address_line1,
          city: loc.city,
          state: loc.state,
          zip_code: loc.zip_code,
          market_id: loc.market_id || null,
          is_primary: loc.is_primary,
        } as any);
      }

      // Create subscription
      const trialEndsAt = trialEnabled && trialDays > 0
        ? new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
        : null;

      await supabase.from("provider_subscriptions").insert({
        provider_id: providerId,
        category_id: categoryId,
        tier_id: tierId,
        is_enterprise: isEnterprise,
        monthly_amount: calculation?.total ?? 0,
        billing_day: 1,
        status: "pending",
        trial_ends_at: trialEndsAt,
        created_by: user?.id,
      } as any);

      toast.success("Billing profile configured — subscription pending activation");
      onComplete();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-primary" />
          Set Billing Profile — {providerName}
        </CardTitle>
        <CardDescription>Configure specialty category, membership tier, and practice locations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Category & Tier */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Specialty Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div>
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-1">({c.short_code})</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Membership Tier</Label>
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
              <SelectContent>
                {tiers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Enterprise Account</Label>
            <div className="flex items-center gap-2 h-10">
              <Switch checked={isEnterprise} onCheckedChange={setIsEnterprise} />
              <span className="text-sm">{isEnterprise ? "Yes" : "No"}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Trial Period</Label>
            <div className="flex items-center gap-3 h-10">
              <Switch checked={trialEnabled} onCheckedChange={setTrialEnabled} />
              {trialEnabled && (
                <Select value={String(trialDays)} onValueChange={(v) => setTrialDays(parseInt(v))}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <span className="text-sm text-muted-foreground">{trialEnabled ? `${trialDays} day trial` : "No trial"}</span>
            </div>
          </div>
        </div>

        {/* Locations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <Label className="text-sm font-semibold">Practice Locations</Label>
            <Button size="sm" variant="outline" onClick={addLocation}>
              <Plus className="h-3.5 w-3.5 mr-1" />Add Location
            </Button>
          </div>
          <div className="space-y-3">
            {locations.map((loc) => (
              <div key={loc.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    {loc.is_primary && <Badge variant="outline" className="text-[10px]">Primary</Badge>}
                  </div>
                  {!loc.is_primary && (
                    <Button size="sm" variant="ghost" onClick={() => removeLocation(loc.id)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Input placeholder="Name" value={loc.location_name} onChange={(e) => updateLocation(loc.id, "location_name", e.target.value)} className="text-sm" />
                  <Input placeholder="Address" value={loc.address_line1} onChange={(e) => updateLocation(loc.id, "address_line1", e.target.value)} className="text-sm" />
                  <Input placeholder="City" value={loc.city} onChange={(e) => updateLocation(loc.id, "city", e.target.value)} className="text-sm" />
                  <Input placeholder="State" value={loc.state} onChange={(e) => updateLocation(loc.id, "state", e.target.value)} className="text-sm" />
                  <Select value={loc.market_id} onValueChange={(v) => updateLocation(loc.id, "market_id", v)}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Market" /></SelectTrigger>
                    <SelectContent>
                      {markets?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Preview */}
        {calculation && (
          <Alert className="border-primary/20 bg-primary/5">
            <DollarSign className="h-4 w-4 text-primary" />
            <AlertDescription>
              <div className="space-y-1">
                {calculation.lines.map((line) => (
                  <div key={line.id} className="flex justify-between text-sm">
                    <span>{line.location_name || "Location"} ({line.city}) — {discountTiers?.find((t: DiscountTier) => line.position >= t.min_locations && (t.max_locations === null || line.position <= t.max_locations))?.label}</span>
                    <span className="font-medium">${line.lineTotal.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold pt-1 border-t mt-1">
                  <span>Estimated Monthly Fee {isEnterprise ? "(Enterprise)" : ""}</span>
                  <span className="text-primary">${calculation.total.toFixed(2)}/mo</span>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Button className="w-full" onClick={handleSave} disabled={saving || !categoryId || !tierId}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Billing Profile & Create Subscription"}
        </Button>
      </CardContent>
    </Card>
  );
}
