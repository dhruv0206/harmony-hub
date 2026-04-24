import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, DollarSign, Pencil } from "lucide-react";
import OnboardingBillingSetup from "@/components/onboarding/OnboardingBillingSetup";
import { useState } from "react";

interface Props {
  workflowId: string;
  providerId: string;
  providerName: string;
  isActive: boolean;
  onComplete: () => void;
}

export default function OnboardingStageBilling({ workflowId, providerId, providerName, isActive, onComplete }: Props) {
  const [editing, setEditing] = useState(false);

  const { data: subscription, refetch } = useQuery({
    queryKey: ["onboarding-subscription", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("*, membership_tiers(name), specialty_categories(name, short_code)")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const hasSubscription = !!subscription;

  if (hasSubscription && !editing) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-500/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">Billing configured</span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm mt-2">
            <div>
              <p className="text-muted-foreground text-xs">Tier</p>
              <Badge variant="secondary">{(subscription as any)?.membership_tiers?.name || "—"}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Category</p>
              <Badge variant="secondary">{(subscription as any)?.specialty_categories?.short_code || "—"}</Badge>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Monthly</p>
              <span className="font-semibold">${Number(subscription.monthly_amount).toFixed(2)}/mo</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" />Edit
          </Button>
          {isActive && (
            <Button size="sm" onClick={onComplete}>Continue to Training →</Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <OnboardingBillingSetup
      providerId={providerId}
      providerName={providerName}
      onComplete={() => {
        refetch();
        setEditing(false);
        if (isActive) onComplete();
      }}
    />
  );
}
