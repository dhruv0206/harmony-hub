import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Rocket, PartyPopper, Send } from "lucide-react";
import { toast } from "sonner";
import { logAudit } from "@/lib/audit-log";

interface Props {
  workflowId: string;
  lawFirmId: string;
  lawFirmName: string;
  isActive: boolean;
}

export default function LawFirmOnboardingGoLive({ workflowId, lawFirmId, lawFirmName, isActive }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: subscription } = useQuery({
    queryKey: ["golive-lf-subscription", lawFirmId],
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

  const activate = useMutation({
    mutationFn: async () => {
      // 1. Update law firm status
      await supabase.from("law_firms").update({ status: "active" }).eq("id", lawFirmId);

      // 2. Activate subscription
      if (subscription) {
        await supabase.from("law_firm_subscriptions").update({
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
      await supabase.from("law_firm_activities").insert({
        law_firm_id: lawFirmId,
        user_id: user?.id,
        activity_type: "status_change",
        description: `🚀 Law firm activated — onboarding complete! Welcome to the network, ${lawFirmName}.`,
      });

      // 5. Send notification
      if (user?.id) {
        await supabase.from("notifications").insert({
          user_id: user.id,
          title: "Law Firm Activated!",
          message: `${lawFirmName} is now an active law firm. Onboarding is complete.`,
          type: "success",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-detail"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-queue"] });
      logAudit({ action: "law_firm.status_changed", entity_type: "law_firm", entity_id: lawFirmId, details: { new_status: "active", onboarding: "completed" } });
      logAudit({ action: "onboarding.completed", entity_type: "onboarding", entity_id: workflowId, details: { law_firm: lawFirmName } });
      toast.success(`🎉 ${lawFirmName} is now an active law firm!`, {
        action: {
          label: "View Firm",
          onClick: () => navigate(`/law-firms/${lawFirmId}`),
        },
      });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="border-green-500/30 bg-green-50 dark:bg-green-950/20">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-green-500" />
            <span className="text-lg font-bold text-green-700 dark:text-green-400">Ready to Activate {lawFirmName}</span>
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
              {(subscription as any)?.membership_tiers?.name && <Badge variant="secondary">{(subscription as any).membership_tiers.name}</Badge>}
              <span className="ml-2 font-semibold">${Number(subscription.monthly_amount).toFixed(2)}/mo</span>
            </div>
          )}
        </CardContent>
      </Card>

      {isActive && (
        <div className="flex gap-3">
          <Button size="lg" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => activate.mutate()} disabled={activate.isPending}>
            <Rocket className="h-5 w-5 mr-2" />
            {activate.isPending ? "Activating..." : "🚀 Activate Law Firm"}
          </Button>
          <Button size="lg" variant="outline" onClick={() => toast.info("Welcome kit sent!")}>
            <Send className="h-4 w-4 mr-2" />Welcome Kit
          </Button>
        </div>
      )}
    </div>
  );
}
