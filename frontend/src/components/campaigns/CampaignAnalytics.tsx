import { useState, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import { Download, Sparkles, Loader2, MapPin, TrendingUp, Trophy, AlertTriangle } from "lucide-react";
import { format, parseISO, eachDayOfInterval, isSameDay, startOfDay } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAI } from "@/hooks/use-ai";

interface CampaignAnalyticsProps {
  campaignId: string;
  campaign: any;
  campaignLeads: any[];
  reps: any[];
}

const OUTCOME_COLORS: Record<string, string> = {
  interested: "hsl(var(--primary))",
  not_interested: "hsl(var(--destructive))",
  no_answer: "hsl(var(--muted-foreground))",
  voicemail: "hsl(210, 70%, 55%)",
  wrong_number: "hsl(30, 80%, 50%)",
  disqualified: "hsl(0, 0%, 40%)",
  converted: "hsl(142, 71%, 45%)",
  follow_up: "hsl(45, 93%, 47%)",
  pending: "hsl(var(--muted-foreground))",
};

const STATUS_LABELS: Record<string, string> = {
  interested: "Interested",
  not_interested: "Not Interested",
  no_answer: "No Answer",
  voicemail: "Voicemail",
  wrong_number: "Wrong Number",
  disqualified: "Disqualified",
  converted: "Converted",
  follow_up: "Follow Up",
  pending: "Pending",
  assigned: "Assigned",
  called: "Called",
  call_scheduled: "Scheduled",
};

export function CampaignAnalytics({ campaignId, campaign, campaignLeads, reps }: CampaignAnalyticsProps) {
  const { generate, loading: aiLoading, result: aiResult } = useAI();
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Fetch campaign activities for daily chart & reason analysis
  const { data: activities } = useQuery({
    queryKey: ["campaign-activities-analytics", campaignId],
    queryFn: async () => {
      const leadIds = campaignLeads.map(l => l.id);
      if (!leadIds.length) return [];
      const { data } = await supabase
        .from("campaign_activities")
        .select("*")
        .in("campaign_lead_id", leadIds)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: campaignLeads.length > 0,
  });

  // === FUNNEL ===
  const funnel = useMemo(() => {
    const total = campaignLeads.length;
    const contacted = campaignLeads.filter(l =>
      !["pending", "assigned", "call_scheduled"].includes(l.status)
    ).length;
    const connected = campaignLeads.filter(l =>
      ["interested", "not_interested", "converted", "follow_up", "called"].includes(l.status)
    ).length;
    const interested = campaignLeads.filter(l =>
      ["interested", "follow_up", "converted"].includes(l.status)
    ).length;
    const converted = campaignLeads.filter(l => l.status === "converted").length;

    const stages = [
      { name: "Total Leads", value: total },
      { name: "Contacted", value: contacted },
      { name: "Connected", value: connected },
      { name: "Interested", value: interested },
      { name: "Converted", value: converted },
    ];

    return stages.map((s, i) => ({
      ...s,
      pct: total > 0 ? Math.round((s.value / total) * 100) : 0,
      dropOff: i > 0 && stages[i - 1].value > 0
        ? Math.round(((stages[i - 1].value - s.value) / stages[i - 1].value) * 100)
        : 0,
    }));
  }, [campaignLeads]);

  // === REP PERFORMANCE ===
  const repPerformance = useMemo(() => {
    if (!reps?.length) return [];
    const rows = reps.map(rep => {
      const repLeads = campaignLeads.filter(l => l.assigned_to === rep.id);
      const assigned = repLeads.length;
      const calls = repLeads.reduce((s, l) => s + (l.call_attempts || 0), 0);
      const connects = repLeads.filter(l =>
        ["interested", "not_interested", "converted", "follow_up", "called"].includes(l.status)
      ).length;
      const interested = repLeads.filter(l =>
        ["interested", "follow_up", "converted"].includes(l.status)
      ).length;
      const converted = repLeads.filter(l => l.status === "converted").length;
      const convRate = connects > 0 ? Math.round((converted / connects) * 100) : 0;
      const avgCallsPerConversion = converted > 0 ? Math.round(calls / converted * 10) / 10 : 0;
      return {
        id: rep.id,
        name: rep.full_name || rep.email || "Unknown",
        assigned, calls, connects, interested, converted, convRate, avgCallsPerConversion,
      };
    }).sort((a, b) => b.convRate - a.convRate);
    return rows;
  }, [campaignLeads, reps]);

  const topRepId = repPerformance.length > 0 ? repPerformance[0].id : null;
  const lowestRepId = repPerformance.length > 1 ? repPerformance[repPerformance.length - 1].id : null;

  // === OUTCOME DONUT ===
  const outcomeData = useMemo(() => {
    const counts: Record<string, number> = {};
    campaignLeads.forEach(l => {
      if (["pending", "assigned", "call_scheduled"].includes(l.status)) return;
      const key = l.status || "unknown";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: STATUS_LABELS[name] || name,
      value,
      color: OUTCOME_COLORS[name] || "hsl(var(--muted))",
    }));
  }, [campaignLeads]);

  // === DAILY ACTIVITY ===
  const dailyData = useMemo(() => {
    if (!activities?.length) return [];
    const start = campaign.start_date ? parseISO(campaign.start_date) : parseISO(activities[0].created_at);
    const end = campaign.end_date ? parseISO(campaign.end_date) : new Date();
    const days = eachDayOfInterval({ start, end });

    return days.map(day => {
      const dayCalls = activities.filter(a =>
        a.activity_type === "call" && isSameDay(parseISO(a.created_at), day)
      ).length;
      const dayConversions = campaignLeads.filter(l =>
        l.status === "converted" && l.updated_at && isSameDay(parseISO(l.updated_at), day)
      ).length;
      return {
        date: format(day, "MMM d"),
        calls: dayCalls,
        conversions: dayConversions,
      };
    });
  }, [activities, campaign, campaignLeads]);

  // === NOT INTERESTED REASONS ===
  const notInterestedReasons = useMemo(() => {
    const reasons: Record<string, number> = {};
    campaignLeads
      .filter(l => l.status === "not_interested")
      .forEach(l => {
        const reason = l.outcome || "No Reason Given";
        reasons[reason] = (reasons[reason] || 0) + 1;
      });
    return Object.entries(reasons)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [campaignLeads]);

  // === GEO DATA ===
  const geoLeads = useMemo(() => {
    return campaignLeads
      .filter(l => l.scraped_leads?.latitude && l.scraped_leads?.longitude)
      .map(l => ({
        lat: l.scraped_leads.latitude,
        lng: l.scraped_leads.longitude,
        status: l.status,
        name: l.scraped_leads.business_name,
      }));
  }, [campaignLeads]);

  const convertedCount = campaignLeads.filter(l => l.status === "converted").length;

  // === AI INSIGHTS ===
  const generateInsights = async () => {
    const summary = {
      campaign_name: campaign.name,
      total_leads: campaignLeads.length,
      funnel,
      outcome_distribution: outcomeData,
      not_interested_reasons: notInterestedReasons,
      rep_performance: repPerformance.map(r => ({ name: r.name, calls: r.calls, connects: r.connects, converted: r.converted })),
      target_state: campaign.target_state,
      target_category: campaign.target_category,
      interested_not_converted: campaignLeads.filter(l => ["interested", "follow_up"].includes(l.status)).length,
    };
    const result = await generate("campaign_insights", {
      prompt: `Analyze this sales campaign data and provide insights. Return a structured analysis with:
1. "Best time to call" analysis
2. "Top converting categories"
3. "Recommended next steps" — especially for leads marked 'Bad Timing' or 'Not Interested'
4. "Estimated pipeline value" from interested leads not yet converted
Keep it concise and actionable.`,
      data: JSON.stringify(summary),
    });
    setAiInsights(result);
  };

  // === PRINT ===
  const handlePrint = () => {
    window.print();
  };

  const FUNNEL_COLORS = [
    "hsl(var(--primary))",
    "hsl(210, 70%, 55%)",
    "hsl(45, 93%, 47%)",
    "hsl(142, 71%, 45%)",
    "hsl(142, 71%, 35%)",
  ];

  return (
    <div ref={printRef} className="space-y-6 print:space-y-4">
      {/* Export button */}
      <div className="flex justify-end print:hidden">
        <Button variant="outline" onClick={handlePrint}>
          <Download className="h-4 w-4 mr-2" /> Campaign Summary
        </Button>
      </div>

      {/* 1. FUNNEL CHART */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Conversion Funnel</CardTitle>
          <CardDescription>Lead progression from scrape to converted provider</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnel.map((stage, i) => (
              <div key={stage.name} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{stage.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">{stage.value}</span>
                    <span className="text-xs text-muted-foreground">({stage.pct}%)</span>
                    {i > 0 && stage.dropOff > 0 && (
                      <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                        -{stage.dropOff}% drop
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="h-8 bg-muted rounded-md overflow-hidden">
                  <div
                    className="h-full rounded-md transition-all duration-500"
                    style={{
                      width: `${stage.pct}%`,
                      backgroundColor: FUNNEL_COLORS[i],
                      minWidth: stage.value > 0 ? "2rem" : "0",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. REP PERFORMANCE */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5" /> Rep Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rep</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Connects</TableHead>
                  <TableHead className="text-right">Interested</TableHead>
                  <TableHead className="text-right">Converted</TableHead>
                  <TableHead className="text-right">Conv %</TableHead>
                  <TableHead className="text-right">Calls/Conv</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repPerformance.map(r => (
                  <TableRow
                    key={r.id}
                    className={
                      r.id === topRepId
                        ? "bg-primary/5"
                        : r.id === lowestRepId && repPerformance.length > 1
                          ? "bg-yellow-500/5"
                          : ""
                    }
                  >
                    <TableCell className="font-medium">
                      {r.name}
                      {r.id === topRepId && <Badge className="ml-2 bg-primary/10 text-primary text-xs">Top</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{r.assigned}</TableCell>
                    <TableCell className="text-right">{r.calls}</TableCell>
                    <TableCell className="text-right">{r.connects}</TableCell>
                    <TableCell className="text-right">{r.interested}</TableCell>
                    <TableCell className="text-right font-semibold">{r.converted}</TableCell>
                    <TableCell className="text-right">{r.convRate}%</TableCell>
                    <TableCell className="text-right">{r.avgCallsPerConversion || "—"}</TableCell>
                  </TableRow>
                ))}
                {repPerformance.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground">No reps assigned</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* 3. OUTCOME DONUT */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Call Outcome Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {outcomeData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie
                      data={outcomeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      stroke="none"
                    >
                      {outcomeData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {outcomeData.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span>{item.name}</span>
                      </div>
                      <span className="font-medium">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">No outcomes recorded yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. DAILY ACTIVITY */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Daily Activity</CardTitle>
          <CardDescription>Calls and conversions over the campaign period</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="calls" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Calls" />
                <Line type="monotone" dataKey="conversions" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={false} name="Conversions" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No activity data yet</p>
          )}
        </CardContent>
      </Card>

      {/* 5. NOT INTERESTED REASONS */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> "Not Interested" Reason Analysis
          </CardTitle>
          <CardDescription>Identify top objections to refine your approach</CardDescription>
        </CardHeader>
        <CardContent>
          {notInterestedReasons.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, notInterestedReasons.length * 40)}>
              <BarChart data={notInterestedReasons} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "0.5rem",
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} name="Count" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No "Not Interested" outcomes recorded yet</p>
          )}
        </CardContent>
      </Card>

      {/* 6. GEOGRAPHIC VIEW */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5" /> Geographic View
          </CardTitle>
          <CardDescription>
            {convertedCount > 0
              ? `This campaign has added ${convertedCount} provider${convertedCount !== 1 ? "s" : ""} in ${campaign.target_state || "the target area"}.`
              : "Lead distribution across the campaign area"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { label: "Converted", color: "hsl(142, 71%, 45%)", count: geoLeads.filter(l => l.status === "converted").length },
              { label: "Interested", color: "hsl(var(--primary))", count: geoLeads.filter(l => ["interested", "follow_up"].includes(l.status)).length },
              { label: "Not Contacted", color: "hsl(var(--muted-foreground))", count: geoLeads.filter(l => ["pending", "assigned", "call_scheduled"].includes(l.status)).length },
              { label: "Not Interested", color: "hsl(var(--destructive))", count: geoLeads.filter(l => l.status === "not_interested").length },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-semibold ml-auto">{item.count}</span>
              </div>
            ))}
          </div>
          {geoLeads.length > 0 ? (
            <div className="h-[300px] rounded-lg border bg-muted/30 flex items-center justify-center">
              <p className="text-muted-foreground text-sm">
                {geoLeads.length} leads with location data · Open Map View for full geographic visualization
              </p>
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">No leads with location data</p>
          )}
        </CardContent>
      </Card>

      {/* 7. AI CAMPAIGN INSIGHTS */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5" /> AI Campaign Insights
              </CardTitle>
              <CardDescription>AI-powered analysis of campaign performance and recommendations</CardDescription>
            </div>
            <Button
              onClick={generateInsights}
              disabled={aiLoading || campaignLeads.length === 0}
              className="print:hidden"
            >
              {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              {aiLoading ? "Analyzing..." : "Generate Insights"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {aiResult || aiInsights ? (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {aiResult || aiInsights}
            </div>
          ) : (
            <p className="text-center py-8 text-muted-foreground">
              Click "Generate Insights" to get AI-powered analysis of this campaign
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
