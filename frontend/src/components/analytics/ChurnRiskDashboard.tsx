import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { HealthScoreBadge } from "@/components/providers/HealthScoreBadge";
import {
  AlertTriangle, RefreshCw, Phone, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, Shield, TrendingDown, Users, ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const statusColors: Record<string, string> = {
  new: "bg-destructive/10 text-destructive",
  acknowledged: "bg-warning/10 text-warning",
  action_taken: "bg-primary/10 text-primary",
  resolved: "bg-success/10 text-success",
  churned: "bg-muted text-muted-foreground",
};

const severityColors: Record<string, string> = {
  critical: "text-destructive",
  high: "text-orange-500",
  medium: "text-warning",
  low: "text-muted-foreground",
};

export function ChurnRiskDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);

  const { data: predictions, isLoading } = useQuery({
    queryKey: ["churn-predictions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("churn_predictions")
        .select("*, providers(business_name, status, health_score, assigned_sales_rep, profiles(full_name))")
        .order("churn_probability", { ascending: false });
      return data ?? [];
    },
  });

  // Get latest prediction per provider (dedupe)
  const latestPredictions = useMemo(() => {
    const seen = new Map<string, typeof predictions extends (infer T)[] ? T : never>();
    (predictions ?? []).forEach(p => {
      if (!seen.has(p.provider_id) || new Date(p.created_at) > new Date(seen.get(p.provider_id)!.created_at)) {
        seen.set(p.provider_id, p);
      }
    });
    return Array.from(seen.values()).sort((a, b) => b.churn_probability - a.churn_probability);
  }, [predictions]);

  const atRiskCount = latestPredictions.filter(p => p.churn_probability > 50 && p.status !== "resolved" && p.status !== "churned").length;
  const avgProbability = latestPredictions.length > 0
    ? Math.round(latestPredictions.reduce((s, p) => s + p.churn_probability, 0) / latestPredictions.length)
    : 0;
  const savedCount = latestPredictions.filter(p => p.status === "resolved").length;
  const churnedCount = latestPredictions.filter(p => p.status === "churned").length;
  const churnRate = latestPredictions.length > 0
    ? Math.round((churnedCount / latestPredictions.length) * 100)
    : 0;

  const filteredPredictions = latestPredictions.filter(p => p.churn_probability > 30);

  const runChurnAnalysis = async () => {
    setIsRunning(true);
    setRunProgress(10);
    try {
      const { data, error } = await supabase.functions.invoke("predict-churn", { body: {} });
      if (error) throw error;
      setRunProgress(100);
      queryClient.invalidateQueries({ queryKey: ["churn-predictions"] });
      toast.success(`Analyzed ${data.processed} providers for churn risk`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTimeout(() => { setIsRunning(false); setRunProgress(0); }, 1500);
    }
  };

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, assignTo }: { id: string; status: string; assignTo?: boolean }) => {
      const updates: any = { status };
      if (assignTo) updates.assigned_to = user!.id;
      if (status === "resolved" || status === "churned") updates.resolved_at = new Date().toISOString();
      const { error } = await supabase.from("churn_predictions").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["churn-predictions"] });
      toast.success("Status updated");
    },
  });

  const scheduleCall = useMutation({
    mutationFn: async (prediction: any) => {
      const provider = prediction.providers;
      await supabase.from("activities").insert({
        provider_id: prediction.provider_id,
        user_id: user!.id,
        activity_type: "call" as any,
        description: `Retention call scheduled. Strategy: ${prediction.retention_strategy?.slice(0, 200) ?? "Review churn risk factors"}`,
      });
      await supabase.from("churn_predictions").update({
        status: "action_taken",
        assigned_to: user!.id,
      }).eq("id", prediction.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["churn-predictions"] });
      toast.success("Retention call scheduled and logged as activity");
    },
  });

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />Providers at Risk
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{atRiskCount}</p>
            <p className="text-xs text-muted-foreground">Churn probability &gt; 50%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />Avg Churn Probability
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgProbability}%</p>
            <p className="text-xs text-muted-foreground">Across all analyzed providers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-success" />Providers Saved
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{savedCount}</p>
            <p className="text-xs text-muted-foreground">Retained after intervention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />Churn Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{churnRate}%</p>
            <p className="text-xs text-muted-foreground">{churnedCount} churned this quarter</p>
          </CardContent>
        </Card>
      </div>

      {/* Run Analysis Button */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filteredPredictions.length} providers with churn probability &gt; 30%
        </p>
        <Button onClick={runChurnAnalysis} disabled={isRunning}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isRunning ? "animate-spin" : ""}`} />
          {isRunning ? "Analyzing..." : "Run Churn Analysis"}
        </Button>
      </div>
      {isRunning && <Progress value={runProgress} className="h-1.5" />}

      {/* Predictions Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading predictions...</div>
          ) : filteredPredictions.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No churn predictions yet. Click "Run Churn Analysis" to analyze your providers.
            </div>
          ) : (
            <div className="divide-y">
              {filteredPredictions.map(prediction => {
                const isExpanded = expandedId === prediction.id;
                const provider = prediction.providers as any;
                const riskFactors = (prediction.risk_factors ?? []) as Array<{ name: string; severity: string; description: string }>;
                const topFactor = riskFactors[0];

                return (
                  <div key={prediction.id}>
                    {/* Summary Row */}
                    <div
                      className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : prediction.id)}
                    >
                      <button className="shrink-0">
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="font-medium text-sm hover:text-primary cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); navigate(`/providers/${prediction.provider_id}`); }}
                          >
                            {provider?.business_name ?? "Unknown"}
                          </span>
                          <Badge className={`text-[10px] ${statusColors[prediction.status]}`}>
                            {prediction.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        {topFactor && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            Top risk: {topFactor.name}
                          </p>
                        )}
                      </div>

                      <HealthScoreBadge score={provider?.health_score} />

                      {/* Churn probability bar */}
                      <div className="w-32 shrink-0">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${prediction.churn_probability}%`,
                                background: prediction.churn_probability >= 70
                                  ? "hsl(0, 84%, 60%)"
                                  : prediction.churn_probability >= 50
                                    ? "hsl(24, 95%, 53%)"
                                    : "hsl(45, 93%, 47%)",
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold w-8 text-right">{prediction.churn_probability}%</span>
                        </div>
                      </div>

                      <div className="w-20 text-xs text-muted-foreground shrink-0 text-center">
                        {prediction.predicted_churn_timeframe}
                      </div>

                      <div className="w-24 text-xs text-muted-foreground shrink-0 truncate">
                        {provider?.profiles?.full_name ?? "Unassigned"}
                      </div>
                    </div>

                    {/* Expanded Detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pl-12 space-y-4 bg-muted/30">
                        <div className="grid gap-4 md:grid-cols-2">
                          {/* Risk Factors */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Factors</p>
                            {riskFactors.map((factor, i) => (
                              <div key={i} className="flex items-start gap-2 p-2 rounded bg-background border">
                                <Badge variant="outline" className={`text-[10px] shrink-0 ${severityColors[factor.severity]}`}>
                                  {factor.severity}
                                </Badge>
                                <div>
                                  <p className="text-xs font-medium">{factor.name}</p>
                                  <p className="text-xs text-muted-foreground">{factor.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Retention Strategy */}
                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Retention Strategy</p>
                            <div className="p-3 rounded bg-primary/5 border border-primary/20">
                              <p className="text-sm">{prediction.retention_strategy}</p>
                            </div>
                          </div>
                        </div>

                        <Separator />

                        {/* Action Buttons */}
                        <div className="flex flex-wrap gap-2">
                          {prediction.status === "new" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatus.mutate({ id: prediction.id, status: "acknowledged", assignTo: true })}
                            >
                              <Shield className="h-3.5 w-3.5 mr-1" />Acknowledge
                            </Button>
                          )}
                          {(prediction.status === "new" || prediction.status === "acknowledged") && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => scheduleCall.mutate(prediction)}
                            >
                              <Phone className="h-3.5 w-3.5 mr-1" />Schedule Retention Call
                            </Button>
                          )}
                          {prediction.status !== "resolved" && prediction.status !== "churned" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-success border-success hover:bg-success/10"
                                onClick={() => updateStatus.mutate({ id: prediction.id, status: "resolved" })}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark Resolved
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive border-destructive hover:bg-destructive/10"
                                onClick={() => updateStatus.mutate({ id: prediction.id, status: "churned" })}
                              >
                                <XCircle className="h-3.5 w-3.5 mr-1" />Lost
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
