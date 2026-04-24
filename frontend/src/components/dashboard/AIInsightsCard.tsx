import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, RefreshCw, X, AlertCircle, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Insight {
  type: "alert" | "warning" | "win" | "opportunity";
  message: string;
}

const insightConfig = {
  alert: {
    icon: AlertCircle,
    emoji: "🔴",
    bg: "bg-destructive/5 border-destructive/20",
    iconColor: "text-destructive",
  },
  warning: {
    icon: AlertTriangle,
    emoji: "🟡",
    bg: "bg-accent/50 border-accent",
    iconColor: "text-foreground",
  },
  win: {
    icon: CheckCircle2,
    emoji: "🟢",
    bg: "bg-primary/5 border-primary/20",
    iconColor: "text-primary",
  },
  opportunity: {
    icon: Lightbulb,
    emoji: "💡",
    bg: "bg-secondary border-secondary",
    iconColor: "text-secondary-foreground",
  },
};

export default function AIInsightsCard() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ["dashboard-ai-insights"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dashboard-insights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      const result = await resp.json();
      return result.insights as Insight[];
    },
    staleTime: 60 * 60 * 1000, // 1 hour cache
    retry: 1,
  });

  const refresh = () => {
    setDismissed(new Set());
    queryClient.invalidateQueries({ queryKey: ["dashboard-ai-insights"] });
    toast.success("Refreshing insights...");
  };

  const dismiss = (idx: number) => {
    setDismissed(prev => new Set(prev).add(idx));
  };

  const visibleInsights = (data ?? []).filter((_, i) => !dismissed.has(i));

  return (
    <Card className="border-primary/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Insights
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={refresh}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 p-3 rounded-lg border">
                <Skeleton className="h-5 w-5 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground text-center">Analyzing platform data...</p>
          </div>
        ) : isError ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>Unable to generate insights right now.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={refresh}>
              Try Again
            </Button>
          </div>
        ) : visibleInsights.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <p>All insights dismissed.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={refresh}>
              Refresh Insights
            </Button>
          </div>
        ) : (
          visibleInsights.map((insight, displayIdx) => {
            const realIdx = (data ?? []).indexOf(insight);
            const config = insightConfig[insight.type] || insightConfig.opportunity;
            const Icon = config.icon;
            return (
              <div
                key={realIdx}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border transition-all",
                  config.bg
                )}
              >
                <span className="text-lg mt-0.5 shrink-0">{config.emoji}</span>
                <p className="text-sm flex-1 leading-relaxed">{insight.message}</p>
                <button
                  onClick={() => dismiss(realIdx)}
                  className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
