import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Rocket, PartyPopper, Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  workflowId: string;
  providerId: string;
  providerName: string;
  isActive: boolean;
}

export default function OnboardingStageGoLive({ workflowId, providerId, providerName, isActive }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: subscription } = useQuery({
    queryKey: ["golive-subscription", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("*, membership_tiers(name)")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const activate = useMutation({
    mutationFn: async () => {
      // 1. Update provider status
      await supabase.from("providers").update({ status: "active" as any }).eq("id", providerId);

      // 2. Activate subscription
      if (subscription) {
        await supabase.from("provider_subscriptions").update({
          status: "active",
          started_at: new Date().toISOString(),
        }).eq("id", subscription.id);
      }

      // 3. Complete workflow
      await supabase.from("onboarding_workflows").update({
        status: "completed" as any,
        completed_at: new Date().toISOString(),
        go_live_date: new Date().toISOString(),
      } as any).eq("id", workflowId);

      // 4. Log activity
      await supabase.from("activities").insert({
        provider_id: providerId,
        user_id: user?.id,
        activity_type: "status_change" as any,
        description: `🚀 Provider activated — onboarding complete! Welcome to the network, ${providerName}.`,
      });

      // 5. Send notification
      await supabase.from("notifications").insert({
        user_id: user?.id ?? providerId, // will need provider's user_id in production
        title: "Welcome to the Network!",
        message: `${providerName} is now an active provider. Onboarding is complete.`,
        type: "success",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-detail"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-queue"] });
      toast.success(`🎉 ${providerName} is now an active provider!`, {
        action: {
          label: "View Provider",
          onClick: () => navigate(`/providers/${providerId}`),
        },
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card className="border-green-500/30 bg-green-50 dark:bg-green-950/20">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-green-500" />
            <span className="text-lg font-bold text-green-700 dark:text-green-400">Ready to Activate {providerName}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Documents signed</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Billing configured</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Training completed</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Onboarding call done</div>
            <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Portal verified</div>
          </div>
          {subscription && (
            <div className="text-sm pt-2 border-t border-green-500/20">
              <span className="text-muted-foreground">Subscription: </span>
              <Badge variant="secondary">{(subscription as any)?.membership_tiers?.name}</Badge>
              <span className="ml-2 font-semibold">${Number(subscription.monthly_amount).toFixed(2)}/mo</span>
            </div>
          )}
        </CardContent>
      </Card>

      {isActive && (
        <div className="flex gap-3">
          <Button size="lg" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => activate.mutate()} disabled={activate.isPending}>
            <Rocket className="h-5 w-5 mr-2" />
            {activate.isPending ? "Activating..." : "🚀 Activate Provider"}
          </Button>
          <Button size="lg" variant="outline" onClick={() => toast.info("Welcome kit sent!")}>
            <Send className="h-4 w-4 mr-2" />Welcome Kit
          </Button>
        </div>
      )}
    </div>
  );
}
