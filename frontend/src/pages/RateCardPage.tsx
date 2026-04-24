import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Settings, DollarSign } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import RateTableSection from "@/components/billing/RateTableSection";
import EnterpriseRatesSection from "@/components/billing/EnterpriseRatesSection";
import DiscountScheduleSection from "@/components/billing/DiscountScheduleSection";
import TierFeaturesSection from "@/components/billing/TierFeaturesSection";
import CategoryDefinitionsSection from "@/components/billing/CategoryDefinitionsSection";
import MarketDefinitionsSection from "@/components/billing/MarketDefinitionsSection";
import PricingCalculator from "@/components/billing/PricingCalculator";

export default function RateCardPage() {
  const { role } = useAuth();

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Settings className="h-12 w-12 mb-4" />
        <p>Only administrators can access rate card settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-[1400px]">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <DollarSign className="h-8 w-8 text-primary" />
          Network Fee Rate Card
        </h1>
        <p className="text-muted-foreground mt-1">
          Manage membership pricing by specialty, tier, and market.
        </p>
      </div>

      <PricingCalculator />

      <Separator />

      <RateTableSection />

      <Separator />

      <EnterpriseRatesSection />

      <Separator />

      <DiscountScheduleSection />

      <Separator />

      <TierFeaturesSection />

      <Separator />

      <CategoryDefinitionsSection />

      <Separator />

      <MarketDefinitionsSection />
    </div>
  );
}
