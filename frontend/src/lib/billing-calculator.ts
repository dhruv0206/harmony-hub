import { supabase } from "@/integrations/supabase/client";

export interface LocationLineItem {
  locationId: string;
  locationName: string;
  city: string;
  state: string;
  marketName: string;
  marketId: string;
  position: number;
  baseRate: number;
  discountPercentage: number;
  lineTotal: number;
}

export interface BillingCalculation {
  lines: LocationLineItem[];
  subtotal: number;
  isEnterprise: boolean;
  enterpriseRate: number;
  perLocationTotal: number;
  enterpriseSavings: number;
  shouldSuggestEnterprise: boolean;
}

export interface DiscountTier {
  min_locations: number;
  max_locations: number | null;
  discount_percentage: number;
  label: string;
}

export async function fetchDiscountTiers(): Promise<DiscountTier[]> {
  const { data } = await supabase
    .from("ai_config")
    .select("settings")
    .eq("feature_name", "multi_location_discounts")
    .single();
  return (data?.settings as any)?.tiers ?? [];
}

export async function calculateProviderBilling(
  providerId: string,
  categoryId: string,
  tierId: string,
  isEnterprise: boolean
): Promise<BillingCalculation> {
  // Fetch all active locations
  const { data: locations } = await supabase
    .from("provider_locations")
    .select("*, geographic_markets(name, short_code)")
    .eq("provider_id", providerId)
    .eq("is_active", true);

  // Fetch rate cards for this category+tier
  const { data: rateCards } = await supabase
    .from("rate_cards")
    .select("*")
    .eq("category_id", categoryId)
    .eq("tier_id", tierId)
    .eq("is_active", true);

  // Fetch enterprise rate
  const { data: entRate } = await supabase
    .from("enterprise_rates")
    .select("*")
    .eq("category_id", categoryId)
    .eq("tier_id", tierId)
    .eq("is_active", true)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const discountTiers = await fetchDiscountTiers();

  // Map locations to rates
  const locationsWithRates = (locations ?? []).map((loc) => {
    const rate = rateCards?.find((r) => r.market_id === loc.market_id);
    return {
      ...loc,
      marketName: (loc.geographic_markets as any)?.name ?? "Unassigned",
      baseRate: rate ? Number(rate.monthly_rate) : 0,
    };
  });

  // Sort by rate descending (highest rate first → full-price slots)
  locationsWithRates.sort((a, b) => b.baseRate - a.baseRate);

  // Calculate per-location totals with discount schedule
  const lines: LocationLineItem[] = locationsWithRates.map((loc, idx) => {
    const position = idx + 1;
    const tier = discountTiers.find(
      (t) => position >= t.min_locations && (t.max_locations === null || position <= t.max_locations)
    );
    const discountPct = tier?.discount_percentage === 100 ? 55 : (tier?.discount_percentage ?? 0); // 100% = enterprise marker, fallback to 55% for per-location calc
    const lineTotal = Math.round(loc.baseRate * (1 - discountPct / 100) * 100) / 100;

    return {
      locationId: loc.id,
      locationName: loc.location_name || `Location ${position}`,
      city: loc.city,
      state: loc.state,
      marketName: loc.marketName,
      marketId: loc.market_id ?? "",
      position,
      baseRate: loc.baseRate,
      discountPercentage: discountPct,
      lineTotal,
    };
  });

  const perLocationTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const enterpriseRate = entRate ? Number(entRate.monthly_rate) : 0;
  const enterpriseSavings = perLocationTotal - enterpriseRate;
  const shouldSuggestEnterprise = !isEnterprise && locationsWithRates.length >= 5 && enterpriseSavings > 0;

  return {
    lines,
    subtotal: isEnterprise ? enterpriseRate : perLocationTotal,
    isEnterprise,
    enterpriseRate,
    perLocationTotal,
    enterpriseSavings,
    shouldSuggestEnterprise,
  };
}

export function calculatePreviewBilling(
  locations: { baseRate: number; marketName: string; locationName: string; city: string; state: string; marketId: string; locationId: string }[],
  discountTiers: DiscountTier[],
  isEnterprise: boolean,
  enterpriseRate: number
): BillingCalculation {
  const sorted = [...locations].sort((a, b) => b.baseRate - a.baseRate);

  const lines: LocationLineItem[] = sorted.map((loc, idx) => {
    const position = idx + 1;
    const tier = discountTiers.find(
      (t) => position >= t.min_locations && (t.max_locations === null || position <= t.max_locations)
    );
    const discountPct = tier?.discount_percentage === 100 ? 55 : (tier?.discount_percentage ?? 0);
    const lineTotal = Math.round(loc.baseRate * (1 - discountPct / 100) * 100) / 100;

    return {
      locationId: loc.locationId,
      locationName: loc.locationName,
      city: loc.city,
      state: loc.state,
      marketName: loc.marketName,
      marketId: loc.marketId,
      position,
      baseRate: loc.baseRate,
      discountPercentage: discountPct,
      lineTotal,
    };
  });

  const perLocationTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const enterpriseSavings = perLocationTotal - enterpriseRate;
  const shouldSuggestEnterprise = !isEnterprise && sorted.length >= 5 && enterpriseSavings > 0;

  return {
    lines,
    subtotal: isEnterprise ? enterpriseRate : perLocationTotal,
    isEnterprise,
    enterpriseRate,
    perLocationTotal,
    enterpriseSavings,
    shouldSuggestEnterprise,
  };
}
