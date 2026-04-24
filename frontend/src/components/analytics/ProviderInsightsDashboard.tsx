import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import {
  MessageSquare, FileQuestion, TrendingUp, SmilePlus, Bot, FileText,
  Loader2, Copy, ChevronDown, ChevronUp, AlertTriangle,
} from "lucide-react";

// Uses supabase.functions.invoke so the caller's session JWT is passed to the
// Edge Function (anon key alone returns 401 when the function verifies JWT).
async function callAI(action: string, params: Record<string, any>) {
  const { data, error } = await supabase.functions.invoke("ai-features", {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message || "AI error");
  return data;
}

// ── Section Skeleton ──
function SectionSkeleton({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </CardContent>
    </Card>
  );
}

// ── 1. Topic Cloud ──
function TopicCloud() {
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: reviewMsgs } = await supabase
          .from("contract_review_messages")
          .select("message")
          .eq("role", "provider")
          .order("created_at", { ascending: false })
          .limit(150);

        const { data: ticketMsgs } = await supabase
          .from("ticket_messages")
          .select("message")
          .eq("is_ai_response", false)
          .order("created_at", { ascending: false })
          .limit(150);

        const allMsgs = [
          ...(reviewMsgs || []).map((m) => m.message),
          ...(ticketMsgs || []).map((m) => m.message),
        ];

        if (allMsgs.length === 0) {
          setTopics([]);
          setLoading(false);
          return;
        }

        const result = await callAI("extract_topics", { messages: allMsgs });
        setTopics(result.topics || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SectionSkeleton title="Topic Cloud" />;
  if (error) return <Card><CardHeader><CardTitle className="text-sm">Topic Cloud</CardTitle></CardHeader><CardContent><p className="text-sm text-destructive">{error}</p></CardContent></Card>;

  const maxFreq = Math.max(...topics.map((t) => t.frequency), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">Topic Cloud</CardTitle>
        </div>
        <CardDescription>Most common topics across all provider conversations</CardDescription>
      </CardHeader>
      <CardContent>
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No provider messages to analyze yet.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {topics.map((t) => {
                const size = 0.75 + (t.frequency / maxFreq) * 1;
                return (
                  <button
                    key={t.topic}
                    onClick={() => setExpanded(expanded === t.topic ? null : t.topic)}
                    className="rounded-full border px-3 py-1 transition-all hover:bg-primary/10 hover:border-primary"
                    style={{ fontSize: `${size}rem` }}
                  >
                    {t.topic}
                    <span className="ml-1 text-xs text-muted-foreground">({t.frequency})</span>
                  </button>
                );
              })}
            </div>
            {expanded && (
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-medium mb-2">Example questions about "{expanded}":</p>
                <ul className="space-y-1">
                  {topics
                    .find((t) => t.topic === expanded)
                    ?.examples?.map((ex: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground">• {ex}</li>
                    ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── 2. Confused Sections ──
function ConfusedSections() {
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: sessions } = await supabase
          .from("contract_review_sessions")
          .select("id, contract_id, provider_id, messages_count, contracts(contract_type)")
          .order("created_at", { ascending: false })
          .limit(100);

        const { data: msgs } = await supabase
          .from("contract_review_messages")
          .select("session_id, message, role")
          .eq("role", "provider")
          .order("created_at", { ascending: false })
          .limit(200);

        const sessionData = (sessions || []).map((s: any) => ({
          contract_type: s.contracts?.contract_type || "unknown",
          messages: (msgs || []).filter((m: any) => m.session_id === s.id).map((m: any) => m.message),
        }));

        if (sessionData.length === 0) {
          setDocuments([]);
          setLoading(false);
          return;
        }

        const result = await callAI("confused_sections", { sessions: sessionData });
        setDocuments(result.documents || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SectionSkeleton title="Most Confused Contract Sections" />;
  if (error) return <Card><CardHeader><CardTitle className="text-sm">Most Confused Sections</CardTitle></CardHeader><CardContent><p className="text-sm text-destructive">{error}</p></CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileQuestion className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-sm">Most Confused Contract Sections</CardTitle>
        </div>
        <CardDescription>Contract areas where providers need the most clarification</CardDescription>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No contract review data available yet.</p>
        ) : (
          <div className="space-y-4">
            {documents.map((doc) => (
              <div key={doc.document_name} className="space-y-2">
                <p className="text-sm font-semibold">{doc.document_name}</p>
                {doc.sections?.map((s: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                    <Badge variant="outline" className="text-xs shrink-0">#{i + 1}</Badge>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{s.section_name} <span className="text-muted-foreground">— asked by {s.percentage}% of providers</span></p>
                      <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-amber-500" />
                        {s.insight}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 3. Support Ticket Trends ──
function TicketTrends() {
  const { data: tickets, isLoading } = useQuery({
    queryKey: ["insight-tickets"],
    queryFn: async () => {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data } = await supabase
        .from("support_tickets")
        .select("category, created_at")
        .gte("created_at", sixMonthsAgo.toISOString());
      return data ?? [];
    },
  });

  if (isLoading) return <SectionSkeleton title="Support Ticket Trends" />;

  // Group by week and category
  const weekMap: Record<string, Record<string, number>> = {};
  (tickets || []).forEach((t) => {
    const d = new Date(t.created_at);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const key = weekStart.toISOString().slice(0, 10);
    if (!weekMap[key]) weekMap[key] = {};
    const cat = t.category || "general";
    weekMap[key][cat] = (weekMap[key][cat] || 0) + 1;
  });

  const categories = [...new Set((tickets || []).map((t) => t.category || "general"))];
  const chartData = Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, cats]) => ({
      week: new Date(week).toLocaleDateString("en", { month: "short", day: "numeric" }),
      ...cats,
    }));

  const COLORS = ["hsl(var(--primary))", "#f59e0b", "#ef4444", "#22c55e", "#8b5cf6", "#06b6d4"];

  // Detect spikes
  let spike = "";
  if (chartData.length >= 3) {
    const last = chartData[chartData.length - 1];
    const prev = chartData[chartData.length - 3];
    for (const cat of categories) {
      const lastVal = (last as any)[cat] || 0;
      const prevVal = (prev as any)[cat] || 0;
      if (prevVal > 0 && lastVal > prevVal * 1.3) {
        const pct = Math.round(((lastVal - prevVal) / prevVal) * 100);
        spike = `${cat} tickets increased ${pct}% in the last 2 weeks.`;
        break;
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">Support Ticket Trends</CardTitle>
        </div>
        <CardDescription>Ticket volume by category over time</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No ticket data available.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="week" className="text-xs" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                {categories.map((cat, i) => (
                  <Area key={cat} type="monotone" dataKey={cat} stackId="1" fill={COLORS[i % COLORS.length]} stroke={COLORS[i % COLORS.length]} fillOpacity={0.4} name={cat} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
            {spike && (
              <div className="mt-3 flex items-center gap-2 text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {spike}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── 4. Sentiment Trend ──
function SentimentTrend() {
  const [sentiment, setSentiment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const monthBuckets: Record<string, string[]> = {};
        for (let i = 5; i >= 0; i--) {
          const d = new Date();
          d.setMonth(d.getMonth() - i);
          const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
          monthBuckets[label] = [];

          const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString();
          const end = i === 0
            ? new Date().toISOString()
            : new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString();

          const { data: msgs } = await supabase
            .from("ticket_messages")
            .select("message")
            .eq("is_ai_response", false)
            .gte("created_at", start)
            .lt("created_at", end)
            .limit(30);

          monthBuckets[label] = (msgs || []).map((m) => m.message);
        }

        const nonEmpty = Object.entries(monthBuckets).filter(([, msgs]) => msgs.length > 0);
        if (nonEmpty.length === 0) {
          setSentiment({ monthly_scores: [], trend: "No data", current_vs_last: "N/A" });
          setLoading(false);
          return;
        }

        const result = await callAI("sentiment_analysis", {
          messages_by_month: Object.fromEntries(nonEmpty.map(([k, v]) => [k, v.slice(0, 20)])),
        });
        setSentiment(result);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <SectionSkeleton title="Provider Sentiment Trend" />;
  if (error) return <Card><CardHeader><CardTitle className="text-sm">Sentiment</CardTitle></CardHeader><CardContent><p className="text-sm text-destructive">{error}</p></CardContent></Card>;

  const chartData = (sentiment?.monthly_scores || []).map((s: any) => ({
    month: s.month,
    score: Number(s.score?.toFixed(2)),
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <SmilePlus className="h-5 w-5 text-emerald-500" />
          <CardTitle className="text-sm">Provider Sentiment Trend</CardTitle>
        </div>
        <CardDescription>{sentiment?.current_vs_last || ""}</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No sentiment data available.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" />
                <YAxis domain={[-1, 1]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} name="Sentiment" />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-muted-foreground mt-2">{sentiment?.trend}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── 5. AI Effectiveness ──
function AIEffectiveness() {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-effectiveness"],
    queryFn: async () => {
      const [ticketsRes, sessionsRes, logsRes] = await Promise.all([
        supabase.from("support_tickets").select("id, status, category").eq("category", "general"),
        supabase.from("contract_review_sessions").select("id, messages_count, flagged"),
        supabase.from("ai_logs").select("feature_name, rating, created_at"),
      ]);

      const tickets = ticketsRes.data ?? [];
      const sessions = sessionsRes.data ?? [];
      const logs = logsRes.data ?? [];

      // Ticket messages that are AI responses
      const { data: aiTicketMsgs } = await supabase
        .from("ticket_messages")
        .select("ticket_id")
        .eq("is_ai_response", true);

      const aiRespondedTicketIds = new Set((aiTicketMsgs || []).map((m) => m.ticket_id));
      const aiRespondedTickets = tickets.filter((t) => aiRespondedTicketIds.has(t.id));
      const resolvedWithoutHuman = aiRespondedTickets.filter((t) => t.status === "resolved").length;
      const autoResRate = aiRespondedTickets.length > 0 ? Math.round((resolvedWithoutHuman / aiRespondedTickets.length) * 100) : 0;

      const completedSessions = sessions.filter((s) => s.messages_count > 2).length;
      const completionRate = sessions.length > 0 ? Math.round((completedSessions / sessions.length) * 100) : 0;

      const avgQuestions = sessions.length > 0
        ? (sessions.reduce((sum, s) => sum + s.messages_count, 0) / sessions.length).toFixed(1)
        : "0";

      const rated = logs.filter((l) => l.rating != null);
      const avgRating = rated.length > 0
        ? (rated.reduce((sum, l) => sum + (l.rating || 0), 0) / rated.length).toFixed(1)
        : null;

      return { autoResRate, completionRate, avgQuestions, avgRating, totalLogs: logs.length };
    },
  });

  if (isLoading) return <SectionSkeleton title="AI Effectiveness Metrics" />;

  const metrics = [
    { label: "Auto-Response Resolution", value: `${data?.autoResRate ?? 0}%`, desc: "Tickets resolved without human intervention" },
    { label: "Review Completion Rate", value: `${data?.completionRate ?? 0}%`, desc: "Providers who completed AI-assisted review" },
    { label: "Avg Questions/Session", value: data?.avgQuestions ?? "0", desc: "Average questions per signing session" },
    { label: "AI Satisfaction", value: data?.avgRating ? `${data.avgRating}/5` : "N/A", desc: "Average provider rating of AI responses" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">AI Effectiveness Metrics</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-lg border p-4">
              <p className="text-2xl font-bold">{m.value}</p>
              <p className="text-sm font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.desc}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── 6. Monthly Report ──
function MonthlyReport({ topics, sentiment, effectiveness }: { topics?: any; sentiment?: any; effectiveness?: any }) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const result = await callAI("monthly_report", {
        topics: topics || [],
        sentiment: sentiment || {},
        effectiveness: effectiveness || {},
        ticket_trends: {},
        confused_sections: [],
      });
      setReport(result.report);
      toast.success("Monthly report generated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [topics, sentiment, effectiveness]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle className="text-sm">AI-Generated Monthly Report</CardTitle>
          </div>
          <Button onClick={generate} disabled={loading} size="sm">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" /> Generating...</> : "Generate Monthly Report"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {report ? (
          <div className="space-y-3">
            <div className="prose prose-sm dark:prose-invert max-w-none rounded-lg border bg-muted/20 p-4">
              <ReactMarkdown>{report}</ReactMarkdown>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(report);
                toast.success("Report copied to clipboard");
              }}
            >
              <Copy className="h-4 w-4 mr-1" /> Copy Report
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">
            Click "Generate Monthly Report" to create an AI-powered summary of all provider interaction analytics.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ──
export function ProviderInsightsDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <TopicCloud />
        <ConfusedSections />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <TicketTrends />
        <SentimentTrend />
      </div>
      <AIEffectiveness />
      <MonthlyReport />
    </div>
  );
}
