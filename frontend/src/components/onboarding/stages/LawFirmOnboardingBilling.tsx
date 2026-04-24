import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, DollarSign } from "lucide-react";
import { toast } from "sonner";

interface Props {
  workflowId: string;
  lawFirmId: string;
  lawFirmName: string;
  isActive: boolean;
  onComplete: () => void;
}

export default function LawFirmOnboardingBilling({ workflowId, lawFirmId, lawFirmName, isActive, onComplete }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [billingDay, setBillingDay] = useState("1");
  const [editing, setEditing] = useState(false);

  const { data: subscription, refetch } = useQuery({
    queryKey: ["onboarding-lf-subscription", lawFirmId],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firm_subscriptions")
        .select("*, membership_tiers(name)")
        .eq("law_firm_id", lawFirmId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const createSubscription = useMutation({
    mutationFn: async () => {
      const amount = parseFloat(monthlyAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Enter a valid monthly amount");
      const day = parseInt(billingDay) || 1;
      const { error } = await supabase.from("law_firm_subscriptions").insert({
        law_firm_id: lawFirmId,
        monthly_amount: amount,
        billing_day: day,
        status: "pending",
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      refetch();
      setEditing(false);
      toast.success("Billing configured");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const isConfigured = !!subscription;

  return (
    <div className="space-y-4">
      {isConfigured && !editing ? (
        <div className="space-y-3">
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-green-700 dark:text-green-400">Billing Configured</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Monthly Amount:</span> ${Number(subscription.monthly_amount).toFixed(2)}</div>
              <div><span className="text-muted-foreground">Billing Day:</span> {subscription.billing_day || 1}</div>
              <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className="capitalize text-[10px]">{subscription.status}</Badge></div>
              {(subscription as any).membership_tiers?.name && (
                <div><span className="text-muted-foreground">Tier:</span> {(subscription as any).membership_tiers.name}</div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Edit</Button>
            {isActive && (
              <Button size="sm" onClick={onComplete}>Continue to Training →</Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Set up the monthly billing for {lawFirmName}.</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Monthly Amount ($)</Label>
              <Input
                type="number"
                placeholder="e.g. 1500"
                value={monthlyAmount}
                onChange={e => setMonthlyAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Billing Day</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={billingDay}
                onChange={e => setBillingDay(e.target.value)}
              />
            </div>
          </div>
          <Button onClick={() => createSubscription.mutate()} disabled={createSubscription.isPending}>
            <DollarSign className="h-4 w-4 mr-2" />
            {createSubscription.isPending ? "Saving..." : "Save Billing Configuration"}
          </Button>
        </div>
      )}
    </div>
  );
}
