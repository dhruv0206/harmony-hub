import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { Activity, Clock, ThumbsUp, DollarSign, Brain, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";

interface AILog {
  id: string;
  feature_name: string;
  tokens_used: number;
  response_time_ms: number;
  rating: number | null;
  flagged: boolean;
  created_at: string;
}

export function AIOverviewTab() {
  const { data: logs } = useQuery({
    queryKey: ["ai-logs-overview"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("ai_logs").select("*").order("created_at", { ascending: false }).limit(1000);
      return (data || []) as AILog[];
    },
  });

  const totalInteractions = logs?.length || 0;
  const avgResponseTime = totalInteractions > 0
    ? Math.round((logs?.reduce((a, l) => a + (l.response_time_ms || 0), 0) || 0) / totalInteractions)
    : 0;
  const ratedLogs = logs?.filter(l => l.rating) || [];
  const avgSatisfaction = ratedLogs.length > 0
    ? (ratedLogs.reduce((a, l) => a + (l.rating || 0), 0) / ratedLogs.length).toFixed(1)
    : "N/A";
  const totalTokens = logs?.reduce((a, l) => a + (l.tokens_used || 0), 0) || 0;
  const estimatedCost = (totalTokens / 1000000 * 0.15).toFixed(2);

  // Feature usage breakdown
  const featureUsage = logs?.reduce((acc, l) => {
    acc[l.feature_name] = (acc[l.feature_name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};
  const featureChartData = Object.entries(featureUsage)
    .map(([name, count]) => ({ name: name.replace(/_/g, " "), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Daily usage trend (last 14 days)
  const dailyUsage: Record<string, number> = {};
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dailyUsage[d.toISOString().split("T")[0]] = 0;
  }
  logs?.forEach(l => {
    const day = l.created_at.split("T")[0];
    if (dailyUsage[day] !== undefined) dailyUsage[day]++;
  });
  const trendData = Object.entries(dailyUsage).map(([date, count]) => ({
    date: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    interactions: count,
  }));

  // Satisfaction distribution
  const satisfactionDist = [1, 2, 3, 4, 5].map(r => ({
    name: `${r}★`,
    count: ratedLogs.filter(l => l.rating === r).length,
  }));
  const COLORS = ["hsl(var(--destructive))", "hsl(var(--destructive))", "hsl(var(--muted-foreground))", "hsl(var(--primary))", "hsl(var(--primary))"];

  // ROI estimate
  const ticketsHandled = featureUsage["auto_responder"] || featureUsage["support_chat"] || 0;
  const avgMinutesPerTicket = 15;
  const hoursSaved = Math.round((ticketsHandled * avgMinutesPerTicket) / 60);
  const costSaved = hoursSaved * 35; // $35/hr avg

  return (
    <div className="space-y-6 mt-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total AI Interactions" value={totalInteractions.toLocaleString()} icon={Activity} />
        <StatCard title="Avg Response Time" value={`${avgResponseTime}ms`} icon={Clock} />
        <StatCard title="User Satisfaction" value={String(avgSatisfaction)} description={`${ratedLogs.length} ratings`} icon={ThumbsUp} />
        <StatCard title="Est. Cost" value={`$${estimatedCost}`} description={`${(totalTokens / 1000).toFixed(0)}k tokens`} icon={DollarSign} />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Usage Trend (14 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" className="text-xs fill-muted-foreground" tick={{ fontSize: 11 }} />
                <YAxis className="fill-muted-foreground" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="interactions" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usage by Feature</CardTitle>
          </CardHeader>
          <CardContent>
            {featureChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={featureChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} className="fill-muted-foreground" />
                  <Tooltip />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                <div className="text-center">
                  <Brain className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No AI interactions yet</p>
                  <p className="text-xs">Data will appear as features are used</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ROI Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-primary" />AI ROI Estimate</CardTitle>
          <CardDescription>Estimated savings from AI-powered automation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-3xl font-bold text-foreground">{ticketsHandled}</p>
              <p className="text-sm text-muted-foreground">Interactions Handled</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-3xl font-bold text-foreground">{hoursSaved}h</p>
              <p className="text-sm text-muted-foreground">Hours Saved</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50">
              <p className="text-3xl font-bold text-primary">${costSaved.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">Estimated Savings</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
