import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, ArrowRight, AlertTriangle, Phone, Rocket, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, isToday } from "date-fns";

const STAGE_LABELS: Record<string, string> = {
  documents: "Documents",
  billing_setup: "Billing",
  training: "Training",
  onboarding_call: "Call",
  portal_setup: "Portal",
  go_live: "Go Live",
};

export default function OnboardingQueueWidget() {
  const navigate = useNavigate();

  const { data: workflows } = useQuery({
    queryKey: ["admin-onboarding-queue-widget"],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_workflows")
        .select("*, providers(business_name), specialist:profiles!onboarding_workflows_specialist_id_fkey(full_name)")
        .in("status", ["in_progress", "not_started"])
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  // Get today's onboarding calls
  const { data: todayCalls } = useQuery({
    queryKey: ["admin-today-onboarding-calls"],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const { data } = await supabase
        .from("calendar_events")
        .select("provider_id, start_time")
        .eq("event_type", "onboarding_call")
        .gte("start_time", todayStart.toISOString())
        .lte("start_time", todayEnd.toISOString())
        .neq("status", "cancelled");
      return data ?? [];
    },
  });

  if (!workflows || workflows.length === 0) return null;

  // Categorize
  const now = Date.now();
  const items = workflows.map(w => {
    const daysIn = Math.ceil((now - new Date(w.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const stage = (w as any).onboarding_stage || "documents";
    const isStalled = daysIn > 5;
    const isReadyForGoLive = stage === "go_live";
    const hasCallToday = todayCalls?.some(c => c.provider_id === w.provider_id);

    let priority = 4; // waiting
    let statusLabel = "Waiting on provider";
    let statusColor = "text-muted-foreground";
    let StatusIcon = Clock;

    if (isStalled && !isReadyForGoLive) {
      priority = 1;
      statusLabel = `Stalled ${daysIn}d`;
      statusColor = "text-destructive";
      StatusIcon = AlertTriangle;
    } else if (hasCallToday) {
      priority = 2;
      statusLabel = "Call today";
      statusColor = "text-primary";
      StatusIcon = Phone;
    } else if (isReadyForGoLive) {
      priority = 3;
      statusLabel = "Ready for go-live";
      statusColor = "text-green-600";
      StatusIcon = Rocket;
    }

    return { ...w, daysIn, stage, priority, statusLabel, statusColor, StatusIcon };
  });

  items.sort((a, b) => a.priority - b.priority);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" />
            Onboarding Queue ({items.length})
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/onboarding")}>
            View All <ArrowRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.slice(0, 8).map(item => (
          <div
            key={item.id}
            className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
            onClick={() => navigate(`/onboarding/${item.id}`)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <item.StatusIcon className={`h-3.5 w-3.5 shrink-0 ${item.statusColor}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{(item as any).providers?.business_name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {STAGE_LABELS[item.stage] || item.stage} · {item.daysIn}d
                </p>
              </div>
            </div>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${item.statusColor}`}>
              {item.statusLabel}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
