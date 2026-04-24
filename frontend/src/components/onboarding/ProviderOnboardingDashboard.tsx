import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  FileText, CreditCard, Play, Phone, User, Rocket,
  CheckCircle2, Lock, ArrowRight, ExternalLink,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

const STAGES = [
  { key: "documents", label: "Sign Documents", icon: FileText },
  { key: "billing_setup", label: "Billing Setup", icon: CreditCard },
  { key: "training", label: "Watch Training", icon: Play },
  { key: "onboarding_call", label: "Onboarding Call", icon: Phone },
  { key: "portal_setup", label: "Portal Setup", icon: User },
  { key: "go_live", label: "Go Live", icon: Rocket },
];

const STAGE_INDEX: Record<string, number> = {};
STAGES.forEach((s, i) => { STAGE_INDEX[s.key] = i; });

export default function ProviderOnboardingDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: provider } = useQuery({
    queryKey: ["my-provider-onboard-dash"],
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("email").eq("id", user!.id).single();
      if (!prof?.email) return null;
      const { data } = await supabase.from("providers").select("id, business_name").eq("contact_email", prof.email).single();
      return data;
    },
    enabled: !!user,
  });

  const { data: workflow } = useQuery({
    queryKey: ["my-onboard-workflow-dash", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_workflows")
        .select("*, specialist:profiles!onboarding_workflows_specialist_id_fkey(full_name), provider_subscriptions:providers!inner(provider_subscriptions(monthly_amount, status, membership_tiers(name)))")
        .eq("provider_id", provider!.id)
        .in("status", ["in_progress", "not_started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!provider?.id,
  });

  // Documents progress
  const { data: docs } = useQuery({
    queryKey: ["my-onboard-docs", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("status")
        .eq("provider_id", provider!.id)
        .neq("status", "voided");
      return data ?? [];
    },
    enabled: !!provider?.id,
  });

  // Training progress
  const { data: trainingProgress } = useQuery({
    queryKey: ["my-training-progress-dash", provider?.id],
    queryFn: async () => {
      const [videos, progress] = await Promise.all([
        supabase.from("training_videos").select("id").eq("is_required", true).eq("is_active", true),
        supabase.from("provider_video_progress").select("video_id, status").eq("provider_id", provider!.id),
      ]);
      const total = videos.data?.length ?? 0;
      const completed = (progress.data ?? []).filter(p => p.status === "completed").length;
      return { total, completed };
    },
    enabled: !!provider?.id,
  });

  // Call event
  const { data: callEvent } = useQuery({
    queryKey: ["my-onboard-call", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("provider_id", provider!.id)
        .eq("event_type", "onboarding_call")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!provider?.id,
  });

  // Subscription info
  const { data: subscription } = useQuery({
    queryKey: ["my-subscription-dash", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("monthly_amount, status, membership_tiers(name)")
        .eq("provider_id", provider!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!provider?.id,
  });

  if (!workflow) return null;

  const currentStage = (workflow as any)?.onboarding_stage || "documents";
  const currentIdx = STAGE_INDEX[currentStage] ?? 0;
  const totalStages = STAGES.length;
  const progressPct = ((currentIdx) / totalStages) * 100;

  const signedDocs = docs?.filter(d => d.status === "signed").length ?? 0;
  const totalDocs = docs?.length ?? 0;
  const docsComplete = totalDocs > 0 && signedDocs >= totalDocs;

  const trainingComplete = (trainingProgress?.total ?? 0) > 0 && (trainingProgress?.completed ?? 0) >= (trainingProgress?.total ?? 0);
  const callStatus = callEvent ? (callEvent.status ?? "scheduled") : "not_scheduled";
  const callComplete = callStatus === "completed";

  const billingConfigured = subscription?.status === "active";

  const getCardState = (stageIdx: number) => {
    if (stageIdx < currentIdx) return "complete";
    if (stageIdx === currentIdx) return "current";
    return "future";
  };

  const stageCards = STAGES.map((stage, i) => {
    const state = getCardState(i);
    const Icon = stage.icon;

    let status = "";
    let action: { label: string; link: string } | null = null;

    switch (stage.key) {
      case "documents":
        status = docsComplete ? "✓ Complete" : `${signedDocs} of ${totalDocs} signed`;
        if (!docsComplete) action = { label: "Review & Sign →", link: "/my-documents" };
        break;
      case "billing_setup":
        if (billingConfigured) {
          const tierName = (subscription as any)?.membership_tiers?.name || "Active";
          status = `✓ Active — $${Number(subscription?.monthly_amount || 0).toLocaleString()}/mo`;
        } else {
          status = "Pending Setup";
        }
        break;
      case "training":
        status = trainingComplete
          ? "✓ Complete"
          : `${trainingProgress?.completed ?? 0} of ${trainingProgress?.total ?? 0} videos watched`;
        if (!trainingComplete) action = { label: "Continue Training →", link: "/training" };
        break;
      case "onboarding_call":
        if (callComplete) {
          status = `✓ Completed${callEvent?.start_time ? ` ${format(new Date(callEvent.start_time), "MMM d")}` : ""}`;
        } else if (callStatus !== "not_scheduled") {
          status = `Scheduled: ${callEvent?.start_time ? format(new Date(callEvent.start_time), "MMM d 'at' h:mm a") : "TBD"}`;
        } else {
          status = "Not yet scheduled";
          action = { label: "Schedule Your Call →", link: `/book/onboarding/${workflow.id}` };
        }
        break;
      case "portal_setup":
        status = state === "complete" ? "✓ Complete" : "Profile verification";
        if (state === "current") action = { label: "Complete Your Profile →", link: "/profile" };
        break;
      case "go_live":
        if (state === "complete" || (workflow as any)?.status === "completed") {
          status = "🎉 You're live!";
        } else if (currentIdx >= 5) {
          status = "🎉 You're all set! Your account is being activated.";
        } else {
          status = "Complete the steps above first";
        }
        break;
    }

    return { ...stage, state, status, action, Icon };
  });

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Your Onboarding Progress
          </CardTitle>
          <Badge variant="outline" className="text-xs">
            Step {currentIdx + 1} of {totalStages} — {STAGES[currentIdx]?.label}
          </Badge>
        </div>
        <Progress value={progressPct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stageCards.map((card) => (
            <Card
              key={card.key}
              className={`transition-all ${
                card.state === "complete"
                  ? "border-l-4 border-l-green-500 opacity-80"
                  : card.state === "current"
                  ? "border-l-4 border-l-primary ring-1 ring-primary/20"
                  : "border-l-4 border-l-muted opacity-50"
              }`}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    card.state === "complete" ? "bg-green-100 dark:bg-green-950/30 text-green-600" :
                    card.state === "current" ? "bg-primary/10 text-primary" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {card.state === "complete" ? <CheckCircle2 className="h-4 w-4" /> :
                     card.state === "future" ? <Lock className="h-4 w-4" /> :
                     <card.Icon className="h-4 w-4" />}
                  </div>
                  <span className="text-sm font-medium">{card.label}</span>
                </div>
                <p className={`text-xs ${card.state === "complete" ? "text-green-600" : "text-muted-foreground"}`}>
                  {card.status}
                </p>
                {card.state === "current" && card.action && (
                  <Button size="sm" className="w-full mt-1" onClick={() => navigate(card.action!.link)}>
                    {card.action.label}
                  </Button>
                )}
                {card.state === "current" && card.key === "onboarding_call" && callStatus !== "not_scheduled" && !callComplete && callEvent?.meeting_link && (
                  <a href={callEvent.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                    <ExternalLink className="h-3 w-3" />Join Meeting
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
