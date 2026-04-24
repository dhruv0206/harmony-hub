import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Brain, Sparkles, Shield, MessageSquareText, MapPinned,
  TrendingDown, Pen, Bot, BarChart3, Lightbulb, FileCheck,
  AlertTriangle, Headphones, Search, Zap, Settings2, Activity,
  DollarSign, Loader2,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";

// ─── Feature Definitions ────────────────────────────────────────────────────
interface FeatureDef {
  key: string;
  name: string;
  icon: React.ElementType;
  description: string;
}

const AI_FEATURES: FeatureDef[] = [
  {
    key: "contract_review",
    name: "AI Contract Review Assistant",
    icon: FileCheck,
    description: "Lets providers review documents with an AI assistant. Answers questions about contract terms, obligations, and protections in plain English.",
  },
  {
    key: "support_chat",
    name: "AI Help Desk Agent",
    icon: Headphones,
    description: "Suggests AI-powered responses to support tickets. Drafts replies based on ticket category, history, and knowledge base.",
  },
  {
    key: "provider_chat",
    name: "AI Provider Chat",
    icon: MessageSquareText,
    description: "Floating chat widget on the provider portal. Providers can ask questions about their account, contracts, and onboarding status.",
  },
  {
    key: "coverage_analyst",
    name: "AI Coverage Analyst",
    icon: Search,
    description: "Analyzes geographic coverage gaps and generates targeted outreach plans. Identifies underserved areas with high potential.",
  },
  {
    key: "sales_insights",
    name: "AI Sales Insights",
    icon: BarChart3,
    description: "Provides pipeline analysis, deal health scoring, and revenue forecasting. Surfaces at-risk deals and recommends actions.",
  },
  {
    key: "lead_enrichment",
    name: "AI Lead Enrichment",
    icon: Zap,
    description: "Scores and enriches scraped leads with AI analysis. Evaluates fit based on category, location, practice size, and competitive landscape.",
  },
  {
    key: "deal_negotiation_coach",
    name: "AI Negotiation Coach",
    icon: Brain,
    description: "Generates deal-specific negotiation talking points, suggested pricing, concession strategies, and walk-away thresholds.",
  },
  {
    key: "smart_follow_up",
    name: "AI Follow-Up Writer",
    icon: Pen,
    description: "Drafts personalized follow-up emails and call scripts based on provider history, pipeline stage, and interaction context.",
  },
  {
    key: "churn_prediction",
    name: "AI Churn Predictor",
    icon: TrendingDown,
    description: "Predicts which providers may leave in the next 30/60/90 days. Generates tailored retention strategies for each at-risk provider.",
  },
  {
    key: "territory_optimizer",
    name: "AI Territory Optimizer",
    icon: MapPinned,
    description: "Recommends optimal rep territory assignments based on coverage gaps, provider density, travel time, and workload balance.",
  },
  {
    key: "auto_responder",
    name: "AI Auto-Responder",
    icon: Bot,
    description: "Automatically replies to simple support tickets when confidence is high. Configurable thresholds and mandatory human review options.",
  },
  {
    key: "conversation_analytics",
    name: "AI Conversation Analytics",
    icon: Activity,
    description: "Analyzes all AI interactions across the platform. Surfaces common questions, complaint trends, sentiment shifts, and provider concerns.",
  },
  {
    key: "pre_signing_summary",
    name: "AI Pre-Signing Summary",
    icon: Lightbulb,
    description: "Generates plain-English summaries before providers sign documents. Highlights key commitments, protections, and important dates.",
  },
  {
    key: "question_flagger",
    name: "AI Question Flagger",
    icon: AlertTriangle,
    description: "Monitors provider questions during contract review for red flags. Alerts admins when providers express concerns about specific terms.",
  },
];

interface AIConfig {
  id: string;
  feature_name: string;
  enabled: boolean;
  settings: Record<string, any>;
  updated_at: string;
}

interface AILog {
  id: string;
  feature_name: string;
  tokens_used: number;
  response_time_ms: number;
  created_at: string;
}

export default function AISettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [configureFeature, setConfigureFeature] = useState<FeatureDef | null>(null);
  const [budgetLimit, setBudgetLimit] = useState(100);
  const [alertThreshold, setAlertThreshold] = useState(80);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: configs } = useQuery({
    queryKey: ["ai-configs"],
    queryFn: async () => {
      const { data } = await supabase.from("ai_config").select("*");
      return (data || []) as AIConfig[];
    },
  });

  const { data: logs } = useQuery({
    queryKey: ["ai-logs-30d"],
    queryFn: async () => {
      const since = subDays(new Date(), 30).toISOString();
      const { data } = await supabase
        .from("ai_logs")
        .select("id, feature_name, tokens_used, response_time_ms, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true });
      return (data || []) as AILog[];
    },
  });

  // Load budget settings
  useEffect(() => {
    const budgetCfg = configs?.find(c => c.feature_name === "budget");
    if (budgetCfg?.settings) {
      setBudgetLimit(budgetCfg.settings.monthly_limit_usd || 100);
      setAlertThreshold(budgetCfg.settings.alert_threshold_pct || 80);
    }
  }, [configs]);

  // ─── Mutations ────────────────────────────────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async ({ feature_name, enabled }: { feature_name: string; enabled: boolean }) => {
      // Upsert — if the config row doesn't exist yet, insert it
      const existing = configs?.find(c => c.feature_name === feature_name);
      if (existing) {
        const { error } = await supabase
          .from("ai_config")
          .update({ enabled, updated_by: user?.id, updated_at: new Date().toISOString() } as any)
          .eq("feature_name", feature_name);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ai_config")
          .insert({ feature_name, enabled, updated_by: user?.id, settings: {} } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
      toast({ title: "Feature updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const saveBudgetMutation = useMutation({
    mutationFn: async () => {
      const existing = configs?.find(c => c.feature_name === "budget");
      const settings = { monthly_limit_usd: budgetLimit, alert_threshold_pct: alertThreshold };
      if (existing) {
        await supabase
          .from("ai_config")
          .update({ settings, updated_by: user?.id, updated_at: new Date().toISOString() } as any)
          .eq("feature_name", "budget");
      } else {
        await supabase
          .from("ai_config")
          .insert({ feature_name: "budget", enabled: true, settings, updated_by: user?.id } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
      toast({ title: "Budget settings saved" });
    },
  });

  // ─── Derived data ─────────────────────────────────────────────────────────
  const getConfig = (key: string) => configs?.find(c => c.feature_name === key);
  const globalConfig = getConfig("global");
  const isGlobalOff = globalConfig?.enabled === false || globalConfig?.settings?.kill_switch === true;

  const isFeatureEnabled = (key: string) => {
    if (isGlobalOff) return false;
    const cfg = getConfig(key);
    return cfg ? cfg.enabled : true; // default on if no config row
  };

  const featureUsageThisMonth = useMemo(() => {
    const counts: Record<string, number> = {};
    const lastUsed: Record<string, string> = {};
    logs?.forEach(l => {
      counts[l.feature_name] = (counts[l.feature_name] || 0) + 1;
      if (!lastUsed[l.feature_name] || l.created_at > lastUsed[l.feature_name]) {
        lastUsed[l.feature_name] = l.created_at;
      }
    });
    return { counts, lastUsed };
  }, [logs]);

  const totalInteractions = logs?.length || 0;
  const totalTokens = logs?.reduce((s, l) => s + (l.tokens_used || 0), 0) || 0;
  const estimatedCost = parseFloat((totalTokens / 1_000_000 * 0.15).toFixed(2));
  const usagePct = budgetLimit > 0 ? Math.min(100, Math.round((estimatedCost / budgetLimit) * 100)) : 0;

  // Daily usage chart (last 30 days)
  const dailyUsage = useMemo(() => {
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = subDays(new Date(), i);
      days[format(d, "yyyy-MM-dd")] = 0;
    }
    logs?.forEach(l => {
      const day = l.created_at.split("T")[0];
      if (days[day] !== undefined) days[day]++;
    });
    return Object.entries(days).map(([date, count]) => ({
      date: format(new Date(date), "MMM d"),
      interactions: count,
    }));
  }, [logs]);

  const getStatusDot = (key: string): { color: string; label: string } => {
    if (isGlobalOff) return { color: "bg-muted-foreground", label: "Disabled (global off)" };
    const cfg = getConfig(key);
    if (!cfg || cfg.enabled) {
      // Check for warnings (e.g., high usage)
      const usage = featureUsageThisMonth.counts[key] || 0;
      if (usage > 200) return { color: "bg-yellow-500", label: "Active (high usage)" };
      return { color: "bg-emerald-500", label: "Active" };
    }
    return { color: "bg-muted-foreground", label: "Disabled" };
  };

  // ─── Global toggle handler ────────────────────────────────────────────────
  const handleGlobalToggle = async (checked: boolean) => {
    const existing = getConfig("global");
    if (existing) {
      await supabase
        .from("ai_config")
        .update({
          enabled: checked,
          settings: { kill_switch: !checked },
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("feature_name", "global");
    } else {
      await supabase
        .from("ai_config")
        .insert({
          feature_name: "global",
          enabled: checked,
          settings: { kill_switch: !checked },
          updated_by: user?.id,
        } as any);
    }
    queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
    toast({ title: checked ? "AI features enabled" : "All AI features disabled" });
  };

  return (
    <>
      <div className="space-y-8">
        {/* ─── HERO SECTION ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/5 via-background to-accent/5 p-8">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10">
                  <Brain className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">AI Command Center</h1>
                  <p className="text-muted-foreground">Manage all AI-powered features across ContractPro</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-card border rounded-lg px-4 py-3 shadow-sm">
              <div className="text-right">
                <p className="text-sm font-semibold text-foreground">All AI Features</p>
                <p className="text-xs text-muted-foreground">
                  {isGlobalOff ? "Disabled" : "Enabled"}
                </p>
              </div>
              <Switch
                checked={!isGlobalOff}
                onCheckedChange={handleGlobalToggle}
                className="scale-125"
              />
            </div>
          </div>

          {isGlobalOff && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive font-medium flex items-center gap-2">
                <Shield className="h-4 w-4" />
                AI features are currently disabled across the entire platform
              </p>
            </div>
          )}
        </div>

        {/* ─── FEATURE CARDS GRID ────────────────────────────────────────── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">AI Features ({AI_FEATURES.length})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AI_FEATURES.map(feature => {
              const enabled = isFeatureEnabled(feature.key);
              const status = getStatusDot(feature.key);
              const usage = featureUsageThisMonth.counts[feature.key] || 0;
              const lastUsed = featureUsageThisMonth.lastUsed[feature.key];

              return (
                <Card
                  key={feature.key}
                  className={`transition-all duration-200 ${
                    !enabled ? "opacity-60" : "hover:shadow-md"
                  }`}
                >
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`p-2 rounded-lg shrink-0 ${enabled ? "bg-primary/10" : "bg-muted"}`}>
                        <feature.icon className={`h-5 w-5 ${enabled ? "text-primary" : "text-muted-foreground"}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground text-sm">{feature.name}</h3>
                          <div className={`h-2 w-2 rounded-full shrink-0 ${status.color}`} title={status.label} />
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                          {feature.description}
                        </p>

                        {/* Stats + Actions */}
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {usage > 0
                              ? `Used ${usage} times this month`
                              : lastUsed
                                ? `Last used: ${format(new Date(lastUsed), "MMM d")}`
                                : "Not used yet"
                            }
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setConfigureFeature(feature)}
                            >
                              <Settings2 className="h-3.5 w-3.5 mr-1" /> Configure
                            </Button>
                            <Switch
                              checked={enabled}
                              disabled={isGlobalOff}
                              onCheckedChange={(checked) =>
                                toggleMutation.mutate({ feature_name: feature.key, enabled: checked })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* ─── AI USAGE & COST SECTION ───────────────────────────────────── */}
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-foreground">AI Usage & Cost</h2>

          {/* Summary Bar */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-xs text-muted-foreground">This Month</p>
                    <p className="text-lg font-bold text-foreground">{totalInteractions.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">interactions</span></p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div>
                    <p className="text-xs text-muted-foreground">Estimated Cost</p>
                    <p className="text-lg font-bold text-foreground">${estimatedCost.toFixed(2)}</p>
                  </div>
                  <div className="h-8 w-px bg-border" />
                  <div>
                    <p className="text-xs text-muted-foreground">Budget</p>
                    <p className="text-lg font-bold text-foreground">${budgetLimit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 min-w-[200px]">
                  <Progress value={usagePct} className="h-2 flex-1" />
                  <span className={`text-sm font-medium ${usagePct >= alertThreshold ? "text-destructive" : "text-muted-foreground"}`}>
                    {usagePct}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Daily Usage Chart + Budget Settings */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">AI Usage (Last 30 Days)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={dailyUsage}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      stroke="hsl(var(--muted-foreground))"
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--background))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                        fontSize: "0.75rem",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="interactions"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      name="Interactions"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Budget Settings
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label className="text-xs">Monthly Budget</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <Input
                      type="number"
                      value={budgetLimit}
                      onChange={e => setBudgetLimit(Number(e.target.value))}
                      className="h-8"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Alert Threshold: {alertThreshold}%</Label>
                  <Slider
                    value={[alertThreshold]}
                    onValueChange={([v]) => setAlertThreshold(v)}
                    min={50}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Warning notification at {alertThreshold}% of budget
                  </p>
                </div>

                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => saveBudgetMutation.mutate()}
                  disabled={saveBudgetMutation.isPending}
                >
                  {saveBudgetMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  Save Budget
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* ─── CONFIGURE DRAWER ──────────────────────────────────────────────── */}
      <Sheet open={!!configureFeature} onOpenChange={(open) => !open && setConfigureFeature(null)}>
        <SheetContent className="sm:max-w-lg">
          {configureFeature && (
            <FeatureConfigDrawer
              feature={configureFeature}
              configs={configs || []}
              userId={user?.id}
              onSave={() => {
                queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
                toast({ title: "Configuration saved" });
                setConfigureFeature(null);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Feature Config Drawer ────────────────────────────────────────────────────
function FeatureConfigDrawer({
  feature,
  configs,
  userId,
  onSave,
}: {
  feature: FeatureDef;
  configs: AIConfig[];
  userId?: string;
  onSave: () => void;
}) {
  const cfg = configs.find(c => c.feature_name === feature.key);
  const [settings, setSettings] = useState<Record<string, any>>(cfg?.settings || {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (cfg) {
        await supabase
          .from("ai_config")
          .update({ settings, updated_by: userId, updated_at: new Date().toISOString() } as any)
          .eq("feature_name", feature.key);
      } else {
        await supabase
          .from("ai_config")
          .insert({ feature_name: feature.key, enabled: true, settings, updated_by: userId } as any);
      }
      onSave();
    } catch {
      // handled by caller
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <feature.icon className="h-5 w-5 text-primary" />
          {feature.name}
        </SheetTitle>
        <SheetDescription>{feature.description}</SheetDescription>
      </SheetHeader>

      <div className="space-y-6 mt-6">
        {/* Common settings all features can have */}
        <div>
          <Label className="text-xs">Model Temperature</Label>
          <p className="text-xs text-muted-foreground mb-2">Controls creativity vs. precision (0 = precise, 1 = creative)</p>
          <Slider
            value={[settings.temperature ?? 0.3]}
            onValueChange={([v]) => updateSetting("temperature", v)}
            min={0}
            max={1}
            step={0.1}
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">{settings.temperature ?? 0.3}</p>
        </div>

        <div>
          <Label className="text-xs">Max Response Length (tokens)</Label>
          <Input
            type="number"
            value={settings.max_tokens ?? 1024}
            onChange={e => updateSetting("max_tokens", Number(e.target.value))}
            className="mt-1"
          />
        </div>

        {/* Feature-specific settings */}
        {feature.key === "auto_responder" && (
          <>
            <div>
              <Label className="text-xs">Confidence Threshold: {settings.confidence_threshold ?? 85}%</Label>
              <Slider
                value={[settings.confidence_threshold ?? 85]}
                onValueChange={([v]) => updateSetting("confidence_threshold", v)}
                min={50}
                max={100}
                step={5}
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">Only auto-respond above this confidence level</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Require Human Review</p>
                <p className="text-xs text-muted-foreground">Draft first, human approves</p>
              </div>
              <Switch
                checked={settings.require_review !== false}
                onCheckedChange={v => updateSetting("require_review", v)}
              />
            </div>
          </>
        )}

        {feature.key === "churn_prediction" && (
          <div>
            <Label className="text-xs">Prediction Windows</Label>
            <div className="flex gap-2 mt-2">
              {[30, 60, 90].map(d => (
                <Badge
                  key={d}
                  variant={settings.prediction_windows?.includes(d) !== false ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => {
                    const current = settings.prediction_windows || [30, 60, 90];
                    const updated = current.includes(d) ? current.filter((w: number) => w !== d) : [...current, d];
                    updateSetting("prediction_windows", updated);
                  }}
                >
                  {d} days
                </Badge>
              ))}
            </div>
          </div>
        )}

        {feature.key === "question_flagger" && (
          <div>
            <Label className="text-xs">Sensitivity Level</Label>
            <Slider
              value={[settings.sensitivity ?? 70]}
              onValueChange={([v]) => updateSetting("sensitivity", v)}
              min={30}
              max={100}
              step={10}
              className="mt-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Low (fewer alerts)</span>
              <span>High (more alerts)</span>
            </div>
          </div>
        )}

        <div className="pt-4 border-t">
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Configuration
          </Button>
        </div>
      </div>
    </>
  );
}
