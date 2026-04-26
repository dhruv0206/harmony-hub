import { useQuery } from "@tanstack/react-query";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import {
  Users, DollarSign, Headphones, TrendingUp, FileText, UserPlus,
  AlertTriangle, Clock, CalendarDays, Activity, ArrowRight, Scale, Building2,
} from "lucide-react";
import AIInsightsCard from "@/components/dashboard/AIInsightsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { formatDistanceToNow, isToday, format, subDays, differenceInHours, differenceInDays } from "date-fns";

/* ──────────────────── DATA HOOKS ──────────────────── */

function useAdminStats() {
  return useQuery({
    queryKey: ["admin-cmd-stats"],
    queryFn: async () => {
      const [
        provRes, lfRes, mrrRes, onbRes, sigReqRes, ticketRes, pipeRes, lfPipeRes,
      ] = await Promise.all([
        supabase.from("providers").select("id, status, created_at"),
        supabase.from("law_firms").select("id, status, created_at"),
        supabase.rpc("get_total_mrr"),
        supabase.from("onboarding_workflows").select("id, participant_type", { count: "exact" }).in("status", ["in_progress" as any, "not_started" as any]),
        supabase.from("signature_requests").select("id", { count: "exact", head: true }).in("status", ["pending", "viewed", "identity_verified"]),
        supabase.from("support_tickets").select("id", { count: "exact" }).in("status", ["open", "in_progress"]),
        supabase.from("sales_pipeline").select("id, estimated_value, stage"),
        supabase.from("law_firm_pipeline" as any).select("id, estimated_value, stage"),
      ]);

      const providers = provRes.data ?? [];
      const lawFirms = lfRes.data ?? [];
      const mrr = mrrRes.data?.[0] ?? { provider_mrr: 0, law_firm_mrr: 0, total_mrr: 0 };
      const pipeline = pipeRes.data ?? [];
      const lfPipeline = (lfPipeRes.data ?? []) as any[];

      return {
        providers,
        lawFirms,
        totalProviders: providers.length,
        totalLawFirms: lawFirms.length,
        totalNetwork: providers.length + lawFirms.length,
        mrr,
        activeOnboardings: onbRes.count ?? 0,
        providerOnboardings: (onbRes.data ?? []).filter(o => o.participant_type === "provider").length,
        lfOnboardings: (onbRes.data ?? []).filter(o => o.participant_type === "law_firm").length,
        pendingDocs: sigReqRes.count ?? 0,
        openTickets: ticketRes.count ?? 0,
        pipelineValue: pipeline.reduce((s, p) => s + (Number(p.estimated_value) || 0), 0),
        lfPipelineValue: lfPipeline.reduce((s: number, p: any) => s + (Number(p.estimated_value) || 0), 0),
        pipeline,
        lfPipeline,
      };
    },
    staleTime: 60_000,
  });
}

function useNetworkGrowth(providers: any[], lawFirms: any[]) {
  const months: { month: string; providers: number; lawFirms: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
    months.push({
      month: label,
      providers: providers.filter(p => p.created_at <= `${key}-31`).length,
      lawFirms: lawFirms.filter(f => f.created_at <= `${key}-31`).length,
    });
  }
  return months;
}

function useNeedsAttention() {
  return useQuery({
    queryKey: ["admin-needs-attention"],
    queryFn: async () => {
      const items: { id: string; icon: string; label: string; entity: string; urgency: string; link: string; priority: number }[] = [];

      // Past due invoices. Provider invoices live in `invoices`, law-firm
      // invoices live in `law_firm_invoices` (different tables, different
      // FKs) — query both and merge.
      const [{ data: pastDue }, { data: pastDueLF }] = await Promise.all([
        supabase.from("invoices")
          .select("id, invoice_number, due_date, providers(business_name)")
          .eq("status", "past_due").order("due_date").limit(5),
        supabase.from("law_firm_invoices")
          .select("id, invoice_number, due_date, law_firms(firm_name)")
          .eq("status", "past_due").order("due_date").limit(5),
      ]);
      for (const inv of pastDue ?? []) {
        const days = differenceInDays(new Date(), new Date(inv.due_date));
        items.push({
          id: `inv-${inv.id}`, icon: "💰", label: `Invoice ${inv.invoice_number} past due`,
          entity: (inv.providers as any)?.business_name ?? "",
          urgency: `${days}d overdue`,
          link: `/billing/invoices/${inv.id}`, priority: days > 30 ? 1 : 2,
        });
      }
      for (const inv of pastDueLF ?? []) {
        const days = differenceInDays(new Date(), new Date(inv.due_date));
        items.push({
          id: `lfinv-${inv.id}`, icon: "💰", label: `Invoice ${inv.invoice_number} past due`,
          entity: (inv.law_firms as any)?.firm_name ?? "",
          urgency: `${days}d overdue`,
          link: `/billing/invoices/${inv.id}`, priority: days > 30 ? 1 : 2,
        });
      }

      // Stalled onboardings (no update in 5+ days)
      const fiveDaysAgo = subDays(new Date(), 5).toISOString();
      const { data: stalled } = await supabase.from("onboarding_workflows")
        .select("id, updated_at, providers(business_name), law_firms(firm_name)")
        .in("status", ["in_progress" as any, "not_started" as any])
        .lt("updated_at", fiveDaysAgo).limit(5);
      for (const ob of stalled ?? []) {
        const days = differenceInDays(new Date(), new Date(ob.updated_at));
        items.push({
          id: `onb-${ob.id}`, icon: "⏳", label: "Onboarding stalled",
          entity: (ob.providers as any)?.business_name || (ob.law_firms as any)?.firm_name || "",
          urgency: `${days}d no progress`, link: `/onboarding/${ob.id}`, priority: 1,
        });
      }

      // Documents pending counter-signature
      const { data: counterSign } = await supabase.from("provider_documents")
        .select("id, providers(business_name), document_templates(name)")
        .eq("status", "provider_signed").limit(5);
      for (const doc of counterSign ?? []) {
        items.push({
          id: `doc-${doc.id}`, icon: "✍️", label: `Needs counter-signature: ${(doc.document_templates as any)?.name ?? "Document"}`,
          entity: (doc.providers as any)?.business_name ?? "", urgency: "Pending",
          link: "/signatures", priority: 3,
        });
      }

      // Support tickets > 24h old
      const oneDayAgo = subDays(new Date(), 1).toISOString();
      const { data: oldTickets } = await supabase.from("support_tickets")
        .select("id, subject, created_at, profiles(full_name)")
        .in("status", ["open", "in_progress"]).lt("created_at", oneDayAgo).limit(5);
      for (const t of oldTickets ?? []) {
        const hrs = differenceInHours(new Date(), new Date(t.created_at));
        items.push({
          id: `tkt-${t.id}`, icon: "🎫", label: t.subject,
          entity: (t.profiles as any)?.full_name ?? "", urgency: `${hrs}h open`,
          link: `/helpdesk/${t.id}`, priority: hrs > 48 ? 1 : 3,
        });
      }

      // Expiring contracts in next 30 days
      const thirtyDays = new Date();
      thirtyDays.setDate(thirtyDays.getDate() + 30);
      const { data: expiring } = await supabase.from("contracts")
        .select("id, contract_type, end_date, providers(business_name), law_firms(firm_name)")
        .eq("status", "active").lte("end_date", thirtyDays.toISOString().split("T")[0])
        .gte("end_date", new Date().toISOString().split("T")[0]).limit(5);
      for (const c of expiring ?? []) {
        const days = differenceInDays(new Date(c.end_date!), new Date());
        items.push({
          id: `ctr-${c.id}`, icon: "📋", label: `${c.contract_type} contract expiring`,
          entity: (c.providers as any)?.business_name || (c.law_firms as any)?.firm_name || "",
          urgency: `${days}d left`,
          link: `/contracts/${c.id}`, priority: days < 7 ? 1 : 4,
        });
      }

      return items.sort((a, b) => a.priority - b.priority).slice(0, 10);
    },
    staleTime: 120_000,
  });
}

function useTodayEvents() {
  return useQuery({
    queryKey: ["admin-today-events"],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      // calendar_events only has provider_id (no law_firm_id), so
      // law-firm events show their host name without an entity label.
      const { data } = await supabase.from("calendar_events")
        .select("id, title, start_time, event_type, providers(business_name), status")
        .gte("start_time", start.toISOString())
        .lte("start_time", end.toISOString())
        .order("start_time");
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

function useRecentActivity() {
  return useQuery({
    queryKey: ["admin-recent-activities"],
    queryFn: async () => {
      const { data } = await supabase.from("activities")
        .select("*, profiles(full_name), providers(business_name)")
        .order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });
}

/* ──────────────────── COMPONENT ──────────────────── */

const EVENT_TYPE_COLORS: Record<string, string> = {
  onboarding_call: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  follow_up: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  training_session: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  meeting: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

const ACTIVITY_ICONS: Record<string, string> = {
  call: "📞", email: "📧", meeting: "🤝", note: "📝", status_change: "🔄",
  contract_update: "📄", stage_change: "🔀", document_sent: "📤", document_signed: "✅",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { data: stats } = useAdminStats();
  const { data: attention } = useNeedsAttention();
  const { data: todayEvents } = useTodayEvents();
  const { data: recentActivities } = useRecentActivity();

  useRealtimeSubscription({
    channelName: "admin-activities-realtime",
    table: "activities",
    event: "INSERT",
    queryKeys: [["admin-recent-activities"]],
  });

  const growthData = useNetworkGrowth(stats?.providers ?? [], stats?.lawFirms ?? []);

  // Revenue trend — use provider/LF subscription created_at as proxy
  const revenueTrend = (() => {
    const months: { month: string; providers: number; lawFirms: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      // Simplified: show current MRR spread across months (real implementation would query monthly snapshots)
      const provMrr = Number(stats?.mrr?.provider_mrr ?? 0);
      const lfMrr = Number(stats?.mrr?.law_firm_mrr ?? 0);
      months.push({ month: label, providers: provMrr, lawFirms: lfMrr });
    }
    return months;
  })();

  // Pipeline stage aggregation
  const aggregatePipeline = (data: any[]) => {
    const stages: Record<string, { count: number; value: number }> = {};
    for (const d of data) {
      const stage = d.stage ?? "unknown";
      if (!stages[stage]) stages[stage] = { count: 0, value: 0 };
      stages[stage].count++;
      stages[stage].value += Number(d.estimated_value) || 0;
    }
    return Object.entries(stages).map(([name, s]) => ({ name: name.replace(/_/g, " "), ...s }));
  };

  const providerPipeline = aggregatePipeline(stats?.pipeline ?? []);
  const lfPipeline = aggregatePipeline(stats?.lfPipeline ?? []);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Command Center</h1>
          <p className="text-muted-foreground text-sm">
            {format(new Date(), "EEEE, MMMM d, yyyy")} — Your complete business overview
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => navigate("/providers?add=true")}>
            <Building2 className="mr-1 h-4 w-4" />Add Provider
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/pipeline")}>
            <TrendingUp className="mr-1 h-4 w-4" />Pipeline
          </Button>
        </div>
      </div>

      {/* ROW 1 — KEY METRICS */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          title="Network Members"
          value={stats?.totalNetwork ?? 0}
          icon={Users}
          description={`${stats?.totalProviders ?? 0} providers · ${stats?.totalLawFirms ?? 0} law firms`}
        />
        <StatCard
          title="Monthly Revenue"
          value={`$${Number(stats?.mrr?.total_mrr ?? 0).toLocaleString()}`}
          icon={DollarSign}
          description={`P: $${Number(stats?.mrr?.provider_mrr ?? 0).toLocaleString()} · LF: $${Number(stats?.mrr?.law_firm_mrr ?? 0).toLocaleString()}`}
        />
        <StatCard
          title="Active Onboardings"
          value={stats?.activeOnboardings ?? 0}
          icon={UserPlus}
          description={`${stats?.providerOnboardings ?? 0} providers · ${stats?.lfOnboardings ?? 0} law firms`}
        />
        <StatCard
          title="Pending Signatures"
          value={stats?.pendingDocs ?? 0}
          icon={FileText}
          description="Awaiting signature"
        />
        <StatCard
          title="Open Tickets"
          value={stats?.openTickets ?? 0}
          icon={Headphones}
          description="Needs response"
        />
        <StatCard
          title="Pipeline Value"
          value={`$${((stats?.pipelineValue ?? 0) + (stats?.lfPipelineValue ?? 0)).toLocaleString()}`}
          icon={TrendingUp}
          description={`P: $${(stats?.pipelineValue ?? 0).toLocaleString()} · LF: $${(stats?.lfPipelineValue ?? 0).toLocaleString()}`}
        />
      </div>


      {/* AI INSIGHTS */}
      <AIInsightsCard />

      {/* ROW 2 — CHARTS */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Network Growth (12 months)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={growthData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="providers" name="Providers" stroke="hsl(217, 91%, 50%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="lawFirms" name="Law Firms" stroke="hsl(280, 70%, 50%)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revenue Breakdown (MRR)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Legend />
                <Area type="monotone" dataKey="providers" name="Provider MRR" stackId="1" stroke="hsl(217, 91%, 50%)" fill="hsl(217, 91%, 50%)" fillOpacity={0.3} />
                <Area type="monotone" dataKey="lawFirms" name="Law Firm MRR" stackId="1" stroke="hsl(280, 70%, 50%)" fill="hsl(280, 70%, 50%)" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ROW 3 — ACTION WIDGETS */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        {/* NEEDS ATTENTION */}
        <Card className="border-destructive/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Needs Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[400px] overflow-auto">
            {attention && attention.length > 0 ? attention.map(item => (
              <Link
                key={item.id}
                to={item.link}
                className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors group text-sm"
              >
                <span className="text-lg mt-0.5 shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{item.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{item.entity}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <Badge variant="outline" className="text-xs whitespace-nowrap">{item.urgency}</Badge>
                  <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity mt-1">
                    Action →
                  </span>
                </div>
              </Link>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                🎉 All clear! Nothing needs immediate attention.
              </p>
            )}
          </CardContent>
        </Card>

        {/* TODAY'S SCHEDULE */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              Today's Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[400px] overflow-auto">
            {todayEvents && todayEvents.length > 0 ? todayEvents.map((ev: any) => (
              <div key={ev.id} className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 text-sm">
                <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">
                  {format(new Date(ev.start_time), "h:mm a")}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{ev.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{(ev.providers as any)?.business_name ?? ""}</p>
                </div>
                <Badge className={`text-xs shrink-0 ${EVENT_TYPE_COLORS[ev.event_type] || "bg-muted text-muted-foreground"}`}>
                  {ev.event_type?.replace(/_/g, " ")}
                </Badge>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-8">No events scheduled today</p>
            )}
            <div className="pt-2 border-t">
              <Button variant="ghost" size="sm" className="w-full text-primary" onClick={() => navigate("/calendar")}>
                View Calendar <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RECENT ACTIVITY */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 max-h-[400px] overflow-auto">
            {recentActivities && recentActivities.length > 0 ? recentActivities.map((a: any) => (
              <div key={a.id} className="flex items-start gap-2 p-2 text-sm">
                <span className="text-base mt-0.5">{ACTIVITY_ICONS[a.activity_type] || "📌"}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{a.description || "Activity logged"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.profiles?.full_name || "System"} · {a.providers?.business_name || ""} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ROW 4 — PIPELINE SNAPSHOT */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/pipeline")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Provider Pipeline
              <Badge variant="secondary" className="ml-auto">
                ${(stats?.pipelineValue ?? 0).toLocaleString()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {providerPipeline.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {providerPipeline.map(s => (
                  <div key={s.name} className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-xs">
                    <span className="font-medium capitalize">{s.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5">{s.count}</Badge>
                    <span className="text-muted-foreground">${s.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No active deals</p>
            )}
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/pipeline")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Law Firm Pipeline
              <Badge variant="secondary" className="ml-auto">
                ${(stats?.lfPipelineValue ?? 0).toLocaleString()}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lfPipeline.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {lfPipeline.map(s => (
                  <div key={s.name} className="flex items-center gap-1.5 bg-muted rounded-full px-3 py-1 text-xs">
                    <span className="font-medium capitalize">{s.name}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5">{s.count}</Badge>
                    <span className="text-muted-foreground">${s.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No active law firm deals</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
