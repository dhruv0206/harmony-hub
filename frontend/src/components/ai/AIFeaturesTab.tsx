import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  HeartPulse, Brain, Pen, TrendingDown, MapPinned,
  Newspaper, MessageSquareText, Bot, Sparkles
} from "lucide-react";

interface AIConfig {
  id: string;
  feature_name: string;
  enabled: boolean;
  settings: Record<string, any>;
}

const FEATURES = [
  {
    name: "provider_health_score",
    label: "Provider Health Score",
    icon: HeartPulse,
    desc: "AI calculates a 0-100 health score for every provider based on contract status, support tickets, engagement, and activity.",
    category: "Intelligence",
  },
  {
    name: "deal_negotiation_coach",
    label: "Deal Negotiation Coach",
    icon: Brain,
    desc: "AI analyzes deals and generates negotiation talking points, suggested pricing, concession strategy, and walk-away thresholds.",
    category: "Sales",
  },
  {
    name: "smart_follow_up",
    label: "Smart Follow-Up Writer",
    icon: Pen,
    desc: "AI writes personalized follow-up emails and call scripts based on full provider history, pipeline stage, and open issues.",
    category: "Sales",
  },
  {
    name: "churn_prediction",
    label: "Churn Prediction Engine",
    icon: TrendingDown,
    desc: "AI predicts which providers are likely to churn in the next 30/60/90 days with retention strategies for each.",
    category: "Intelligence",
  },
  {
    name: "territory_optimizer",
    label: "Territory Optimizer",
    icon: MapPinned,
    desc: "AI analyzes coverage gaps, provider density, and rep workloads to recommend optimal territory assignments.",
    category: "Operations",
  },
  {
    name: "competitive_intelligence",
    label: "Competitive Intelligence",
    icon: Newspaper,
    desc: "AI monitors competitor activity, industry news, and market changes, generating weekly intelligence briefs.",
    category: "Intelligence",
  },
  {
    name: "conversation_analytics",
    label: "Conversation Analytics",
    icon: MessageSquareText,
    desc: "Aggregates insights from all AI interactions: common questions, complaint trends, sentiment analysis, and voice of provider.",
    category: "Analytics",
  },
  {
    name: "auto_responder",
    label: "AI Auto-Responder",
    icon: Bot,
    desc: "Automatically responds to support tickets based on category, with configurable confidence thresholds and review requirements.",
    category: "Operations",
  },
];

export function AIFeaturesTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: configs } = useQuery({
    queryKey: ["ai-configs"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("ai_config").select("*");
      return (data || []) as AIConfig[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ feature_name, enabled }: { feature_name: string; enabled: boolean }) => {
      const { error } = await (supabase as any).from("ai_config").update({
        enabled,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }).eq("feature_name", feature_name);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
      toast({ title: "Feature updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const getConfig = (name: string) => configs?.find(c => c.feature_name === name);
  const globalConfig = getConfig("global");
  const isKillSwitch = globalConfig?.settings?.kill_switch === true;

  const categories = [...new Set(FEATURES.map(f => f.category))];

  return (
    <div className="space-y-6 mt-4">
      {/* Global Kill Switch */}
      <Card className={isKillSwitch ? "border-destructive" : ""}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Sparkles className={`h-5 w-5 ${isKillSwitch ? "text-destructive" : "text-primary"}`} />
            <div>
              <p className="font-medium text-foreground">Global AI</p>
              <p className="text-xs text-muted-foreground">
                {isKillSwitch ? "All AI features are disabled" : "AI features are active across the platform"}
              </p>
            </div>
          </div>
          <Switch
            checked={!isKillSwitch}
            onCheckedChange={(checked) => {
              toggleMutation.mutate({
                feature_name: "global",
                enabled: checked,
              });
              // Also update the kill_switch setting
              (supabase as any).from("ai_config").update({
                settings: { kill_switch: !checked },
                updated_by: user?.id,
                updated_at: new Date().toISOString(),
              }).eq("feature_name", "global");
            }}
          />
        </CardContent>
      </Card>

      {isKillSwitch && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-center">
          <p className="text-sm text-destructive font-medium">⚠️ AI Kill Switch is active — all AI features are disabled</p>
        </div>
      )}

      {/* Feature Cards by Category */}
      {categories.map(cat => (
        <div key={cat}>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">{cat}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FEATURES.filter(f => f.category === cat).map(feature => {
              const cfg = getConfig(feature.name);
              const enabled = cfg?.enabled ?? true;
              return (
                <Card key={feature.name} className={`transition-all ${!enabled || isKillSwitch ? "opacity-60" : ""}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-lg ${enabled && !isKillSwitch ? "bg-primary/10" : "bg-muted"}`}>
                          <feature.icon className={`h-5 w-5 ${enabled && !isKillSwitch ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{feature.label}</p>
                            <Badge variant={enabled ? "default" : "secondary"} className="text-xs">
                              {enabled ? "On" : "Off"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{feature.desc}</p>
                        </div>
                      </div>
                      <Switch
                        checked={enabled && !isKillSwitch}
                        disabled={isKillSwitch}
                        onCheckedChange={(checked) => toggleMutation.mutate({ feature_name: feature.name, enabled: checked })}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
