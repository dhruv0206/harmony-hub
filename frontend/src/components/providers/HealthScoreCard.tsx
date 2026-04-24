import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HealthScoreRing, getRiskLabel, getHealthColor } from "./HealthScoreBadge";
import { RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface HealthScoreCardProps {
  providerId: string;
  currentScore: number | null | undefined;
}

export function HealthScoreCard({ providerId, currentScore }: HealthScoreCardProps) {
  const queryClient = useQueryClient();

  const { data: latestHealth } = useQuery({
    queryKey: ["provider-health", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_health_scores")
        .select("*")
        .eq("provider_id", providerId)
        .order("calculated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const recalculate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-health-scores", {
        body: { provider_ids: [providerId] },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-health", providerId] });
      queryClient.invalidateQueries({ queryKey: ["provider", providerId] });
      toast.success("Health score recalculated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const score = latestHealth?.score ?? currentScore;
  const factors = latestHealth?.factors as Record<string, number> | null;
  const actions = (latestHealth?.recommended_actions ?? []) as string[];

  if (score == null && !latestHealth) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Health Score</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => recalculate.mutate()} disabled={recalculate.isPending}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${recalculate.isPending ? "animate-spin" : ""}`} />
              Calculate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No health score calculated yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Health Score</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => recalculate.mutate()} disabled={recalculate.isPending}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${recalculate.isPending ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          {score != null && <HealthScoreRing score={score} />}
          <div>
            <Badge variant="secondary" className={`${getHealthColor(score ?? 0)}`}>
              {getRiskLabel(score ?? 0)}
            </Badge>
            {latestHealth?.calculated_at && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Updated {new Date(latestHealth.calculated_at).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {latestHealth?.ai_summary && (
          <p className="text-sm text-muted-foreground">{latestHealth.ai_summary}</p>
        )}

        {factors && (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(factors).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/50">
                <span className="capitalize">{key.replace(/_/g, " ")}</span>
                <span className={`font-semibold ${getHealthColor(val)}`}>{val}</span>
              </div>
            ))}
          </div>
        )}

        {actions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Recommended Actions
            </p>
            {actions.map((action, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
                <span>{action}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
