import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, TrendingUp, Users, BarChart3, Zap, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Building2, ShieldAlert, Sparkles,
  Send, Phone, Gavel, FileText,
} from "lucide-react";
import BillingAlertsPanel from "@/components/billing/BillingAlertsPanel";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import MonthlyRevenueReport from "@/components/billing/reports/MonthlyRevenueReport";
import ARAgingReport from "@/components/billing/reports/ARAgingReport";
import ProviderBillingDetail from "@/components/billing/reports/ProviderBillingDetail";
import MRRMovementReport from "@/components/billing/reports/MRRMovementReport";
import EnterpriseAnalysisReport from "@/components/billing/reports/EnterpriseAnalysisReport";

const TIER_COLORS: Record<string, string> = {
  ASSOCIATE: "hsl(210, 70%, 55%)",
  MEMBER: "hsl(38, 80%, 55%)",
  PREMIER: "hsl(270, 60%, 55%)",
};

const CAT_COLORS = ["hsl(210, 70%, 55%)", "hsl(150, 60%, 45%)", "hsl(38, 80%, 55%)", "hsl(340, 65%, 55%)"];
const MARKET_COLORS = ["hsl(210, 70%, 55%)", "hsl(150, 60%, 45%)", "hsl(38, 80%, 55%)", "hsl(340, 65%, 55%)"];

const DONUT_COLORS = [
  "hsl(210, 70%, 55%)",
  "hsl(38, 80%, 55%)",
  "hsl(270, 60%, 55%)",
  "hsl(150, 60%, 45%)",
];

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtFull = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const REPORT_OPTIONS = [
  { value: "monthly-revenue", label: "Monthly Revenue Report" },
  { value: "ar-aging", label: "Accounts Receivable Aging" },
  { value: "provider-detail", label: "Provider Billing Detail" },
  { value: "mrr-movement", label: "MRR Movement Report" },
  { value: "enterprise-analysis", label: "Enterprise vs Per-Location" },
];

export default function BillingOverview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedReport, setSelectedReport] = useState("monthly-revenue");

  // ── Core Stats ──
  const { data: coreStats } = useQuery({
    queryKey: ["billing-core-stats"],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0];

      const [activeSubs, invoicesUnpaid, paymentsThisMonth, invoicesDueThisMonth, prevSubs, newSubsThisMonth, lfActiveSubs, mrrResult] = await Promise.all([
        supabase.from("provider_subscriptions").select("monthly_amount").in("status", ["active", "past_due"]),
        supabase.from("invoices").select("total_amount, paid_amount").in("status", ["pending", "sent", "partial", "past_due"]),
        supabase.from("payments").select("amount").eq("status", "completed").gte("processed_at", `${monthStart}T00:00:00`).lte("processed_at", `${new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0]}T23:59:59`),
        supabase.from("invoices").select("total_amount").lte("due_date", now.toISOString().split("T")[0]).gte("due_date", monthStart),
        supabase.from("provider_subscriptions").select("monthly_amount").in("status", ["active", "past_due"]).lte("created_at", prevMonthEnd),
        supabase.from("provider_subscriptions").select("monthly_amount").in("status", ["active", "past_due"]).gte("started_at", monthStart),
        supabase.from("law_firm_subscriptions").select("monthly_amount").in("status", ["active", "past_due"]),
        supabase.rpc("get_total_mrr"),
      ]);

      const providerMrr = activeSubs.data?.reduce((s, r) => s + Number(r.monthly_amount), 0) ?? 0;
      const lawFirmMrr = lfActiveSubs.data?.reduce((s, r) => s + Number(r.monthly_amount), 0) ?? 0;
      const mrr = providerMrr + lawFirmMrr;
      const prevMrr = prevSubs.data?.reduce((s, r) => s + Number(r.monthly_amount), 0) ?? 0;
      const activeCount = (activeSubs.data?.length ?? 0) + (lfActiveSubs.data?.length ?? 0);
      const prevCount = prevSubs.data?.length ?? 0;
      const outstanding = invoicesUnpaid.data?.reduce((s, r) => s + Number(r.total_amount) - Number(r.paid_amount ?? 0), 0) ?? 0;
      const collectedThisMonth = paymentsThisMonth.data?.reduce((s, r) => s + Number(r.amount), 0) ?? 0;
      const dueThisMonth = invoicesDueThisMonth.data?.reduce((s, r) => s + Number(r.total_amount), 0) ?? 0;

      return {
        mrr, prevMrr, providerMrr, lawFirmMrr,
        mrrChange: prevMrr > 0 ? ((mrr - prevMrr) / prevMrr) * 100 : 0,
        arr: mrr * 12, activeCount, prevCount,
        subChange: prevCount > 0 ? ((activeCount - prevCount) / prevCount) * 100 : 0,
        arpp: activeCount > 0 ? mrr / activeCount : 0,
        outstanding, collectionRate: dueThisMonth > 0 ? (collectedThisMonth / dueThisMonth) * 100 : 0,
        collectedThisMonth,
        newSubsCount: newSubsThisMonth.data?.length ?? 0,
        newSubsMrr: newSubsThisMonth.data?.reduce((s, r) => s + Number(r.monthly_amount), 0) ?? 0,
      };
    },
  });

  const { data: mrrTrend } = useQuery({
    queryKey: ["billing-mrr-trend"],
    queryFn: async () => {
      const { data: subs } = await supabase
        .from("provider_subscriptions")
        .select("monthly_amount, started_at, cancelled_at, membership_tiers(short_code)")
        .in("status", ["active", "cancelled", "past_due"]);
      const months: { label: string; date: Date }[] = [];
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), date: d });
      }
      return months.map(({ label, date }) => {
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const active = (subs ?? []).filter((s: any) => {
          const start = s.started_at ? new Date(s.started_at) : null;
          const cancel = s.cancelled_at ? new Date(s.cancelled_at) : null;
          return start && start <= endOfMonth && (!cancel || cancel > endOfMonth);
        });
        const byTier: Record<string, number> = { ASSOCIATE: 0, MEMBER: 0, PREMIER: 0 };
        let total = 0;
        active.forEach((s: any) => {
          const amt = Number(s.monthly_amount);
          total += amt;
          const tc = (s.membership_tiers as any)?.short_code ?? "ASSOCIATE";
          byTier[tc] = (byTier[tc] ?? 0) + amt;
        });
        return { month: label, total, ...byTier };
      });
    },
  });

  const { data: revByCategory } = useQuery({
    queryKey: ["billing-rev-by-category"],
    queryFn: async () => {
      const { data: subs } = await supabase
        .from("provider_subscriptions")
        .select("monthly_amount, started_at, cancelled_at, specialty_categories(name, short_code)")
        .in("status", ["active", "cancelled", "past_due"]);
      const { data: cats } = await supabase.from("specialty_categories").select("short_code, name").order("display_order");
      const catNames = (cats ?? []).map((c: any) => c.short_code);
      const months: { label: string; date: Date }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ label: d.toLocaleDateString("en-US", { month: "short" }), date: d });
      }
      return months.map(({ label, date }) => {
        const endOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        const active = (subs ?? []).filter((s: any) => {
          const start = s.started_at ? new Date(s.started_at) : null;
          const cancel = s.cancelled_at ? new Date(s.cancelled_at) : null;
          return start && start <= endOfMonth && (!cancel || cancel > endOfMonth);
        });
        const byCat: Record<string, number> = {};
        catNames.forEach((c) => (byCat[c] = 0));
        active.forEach((s: any) => {
          const cc = (s.specialty_categories as any)?.short_code ?? "CAT_4";
          byCat[cc] = (byCat[cc] ?? 0) + Number(s.monthly_amount);
        });
        return { month: label, ...byCat };
      });
    },
  });

  const { data: tierDist } = useQuery({
    queryKey: ["billing-tier-distribution"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_subscriptions").select("membership_tiers(name, short_code)").in("status", ["active", "past_due"]);
      const counts: Record<string, { name: string; count: number }> = {};
      (data ?? []).forEach((s: any) => {
        const code = (s.membership_tiers as any)?.short_code ?? "ASSOCIATE";
        const name = (s.membership_tiers as any)?.name ?? "Associate";
        if (!counts[code]) counts[code] = { name, count: 0 };
        counts[code].count++;
      });
      const total = Object.values(counts).reduce((s, c) => s + c.count, 0);
      return Object.entries(counts).map(([code, { name, count }]) => ({
        name, code, value: count, pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }));
    },
  });

  const { data: marketDist } = useQuery({
    queryKey: ["billing-market-distribution"],
    queryFn: async () => {
      const { data: subs } = await supabase.from("provider_subscriptions").select("provider_id, monthly_amount").in("status", ["active", "past_due"]);
      const providerIds = [...new Set((subs ?? []).map((s: any) => s.provider_id))];
      if (providerIds.length === 0) return [];
      const { data: locations } = await supabase.from("provider_locations").select("provider_id, market_id, geographic_markets(name)").eq("is_active", true).in("provider_id", providerIds);
      const marketRev: Record<string, { name: string; value: number }> = {};
      (locations ?? []).forEach((loc: any) => {
        const mName = (loc.geographic_markets as any)?.name ?? "Unknown";
        const sub = (subs ?? []).find((s: any) => s.provider_id === loc.provider_id);
        if (!marketRev[mName]) marketRev[mName] = { name: mName, value: 0 };
        marketRev[mName].value += sub ? Number(sub.monthly_amount) / ((locations ?? []).filter((l: any) => l.provider_id === loc.provider_id).length || 1) : 0;
      });
      return Object.values(marketRev).map((m) => ({ ...m, value: Math.round(m.value) }));
    },
  });

  const { data: pastDueAccounts } = useQuery({
    queryKey: ["billing-past-due"],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, total_amount, paid_amount, due_date, provider_id, providers(business_name, assigned_sales_rep, profiles(full_name))")
        .eq("status", "past_due")
        .order("due_date", { ascending: true });
      return (data ?? []).map((inv: any) => {
        const daysPast = Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000);
        return { ...inv, daysPast, owed: Number(inv.total_amount) - Number(inv.paid_amount ?? 0) };
      }).sort((a, b) => b.daysPast - a.daysPast);
    },
  });

  const { data: recentPayments } = useQuery({
    queryKey: ["billing-recent-payments"],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*, invoices(invoice_number), providers(business_name)").eq("status", "completed").order("processed_at", { ascending: false }).limit(10);
      return data ?? [];
    },
  });

  const { data: insights } = useQuery({
    queryKey: ["billing-revenue-insights"],
    queryFn: async () => {
      const [associateSubs, enterpriseCandidates, atRiskSubs] = await Promise.all([
        supabase.from("provider_subscriptions").select("monthly_amount, membership_tiers(short_code)").eq("status", "active").filter("membership_tiers.short_code", "eq", "ASSOCIATE"),
        supabase.from("provider_subscriptions").select("provider_id, monthly_amount").eq("status", "active").eq("is_enterprise", false),
        supabase.from("provider_subscriptions").select("monthly_amount").in("status", ["past_due", "suspended"]),
      ]);
      const assocSubs = (associateSubs.data ?? []).filter((s: any) => (s.membership_tiers as any)?.short_code === "ASSOCIATE");
      const upgradeEstimate = assocSubs.reduce((s, r) => s + Number(r.monthly_amount) * 0.4, 0);
      const entProviderIds = [...new Set((enterpriseCandidates.data ?? []).map((s: any) => s.provider_id))];
      let entCount = 0;
      if (entProviderIds.length > 0) {
        for (const pid of entProviderIds.slice(0, 50)) {
          const { count } = await supabase.from("provider_locations").select("id", { count: "exact", head: true }).eq("provider_id", pid).eq("is_active", true);
          if ((count ?? 0) >= 5) entCount++;
        }
      }
      const atRiskTotal = (atRiskSubs.data ?? []).reduce((s, r) => s + Number(r.monthly_amount), 0);
      return { upgradeCount: assocSubs.length, upgradeEstimate: Math.round(upgradeEstimate), entCandidates: entCount, churnRiskCount: atRiskSubs.data?.length ?? 0, churnRiskRevenue: atRiskTotal };
    },
  });

  const dunningMutation = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.functions.invoke("run-dunning"); if (error) throw error; return data; },
    onSuccess: (data) => { toast.success(data.message || "Dunning check complete!"); queryClient.invalidateQueries({ queryKey: ["billing-alerts"] }); queryClient.invalidateQueries({ queryKey: ["billing-alerts-count"] }); queryClient.invalidateQueries({ queryKey: ["billing-past-due"] }); queryClient.invalidateQueries({ queryKey: ["billing-core-stats"] }); },
    onError: (err: any) => toast.error(err.message || "Dunning check failed"),
  });

  const generateMutation = useMutation({
    mutationFn: async () => { const { data, error } = await supabase.functions.invoke("generate-invoices"); if (error) throw error; return data; },
    onSuccess: (data) => { toast.success(data.message || "Invoices generated!"); queryClient.invalidateQueries({ queryKey: ["billing-core-stats"] }); },
    onError: (err: any) => toast.error(err.message || "Failed to generate invoices"),
  });

  const pastDueTotal = pastDueAccounts?.reduce((s, a) => s + a.owed, 0) ?? 0;
  const monthPaymentsTotal = recentPayments?.reduce((s, p: any) => s + Number(p.amount), 0) ?? 0;

  const daysBadgeColor = (days: number) => {
    if (days >= 60) return "bg-red-900/20 text-red-900";
    if (days >= 30) return "bg-destructive/10 text-destructive";
    if (days >= 14) return "bg-orange-500/10 text-orange-700";
    return "bg-yellow-500/10 text-yellow-700";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Billing Overview</h1>
          <p className="text-muted-foreground">Revenue metrics, collection status, and billing insights.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => dunningMutation.mutate()} disabled={dunningMutation.isPending}>
            <Gavel className="mr-2 h-4 w-4" />
            {dunningMutation.isPending ? "Running…" : "Run Dunning Check"}
          </Button>
          <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            <Zap className="mr-2 h-4 w-4" />
            {generateMutation.isPending ? "Generating…" : "Generate Monthly Invoices"}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard"><DollarSign className="mr-2 h-4 w-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="reports"><FileText className="mr-2 h-4 w-4" />Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6 mt-4">
          {/* ── Stat Cards ── */}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-8">
            <StatCard title="Total MRR" value={fmt(coreStats?.mrr ?? 0)} icon={DollarSign} trend={coreStats?.mrrChange ? { value: Math.round(coreStats.mrrChange * 10) / 10, positive: coreStats.mrrChange >= 0 } : undefined} />
            <StatCard title="Provider MRR" value={fmt(coreStats?.providerMrr ?? 0)} icon={Building2} />
            <StatCard title="Law Firm MRR" value={fmt(coreStats?.lawFirmMrr ?? 0)} icon={Gavel} />
            <StatCard title="ARR" value={fmt(coreStats?.arr ?? 0)} icon={TrendingUp} />
            <StatCard title="Active Subscribers" value={coreStats?.activeCount ?? 0} icon={Users} trend={coreStats?.subChange ? { value: Math.round(coreStats.subChange * 10) / 10, positive: coreStats.subChange >= 0 } : undefined} />
            <StatCard title="Avg Rev / Subscriber" value={fmt(coreStats?.arpp ?? 0)} icon={BarChart3} />
            <StatCard title="Outstanding" value={fmt(coreStats?.outstanding ?? 0)} icon={AlertTriangle} />
            <StatCard title="Collection Rate" value={`${Math.round(coreStats?.collectionRate ?? 0)}%`} icon={DollarSign} description={`${fmtFull(coreStats?.collectedThisMonth ?? 0)} collected this month`} />
          </div>

          {/* ── Charts Row 1 ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">MRR Trend (12 months)</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={mrrTrend ?? []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip formatter={(v: number) => fmtFull(v)} />
                      <Legend />
                      <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={3} name="Total MRR" dot={false} />
                      <Line type="monotone" dataKey="ASSOCIATE" stroke={TIER_COLORS.ASSOCIATE} strokeWidth={1.5} strokeDasharray="4 2" name="Associate" dot={false} />
                      <Line type="monotone" dataKey="MEMBER" stroke={TIER_COLORS.MEMBER} strokeWidth={1.5} strokeDasharray="4 2" name="Member" dot={false} />
                      <Line type="monotone" dataKey="PREMIER" stroke={TIER_COLORS.PREMIER} strokeWidth={1.5} strokeDasharray="4 2" name="Premier" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Revenue by Specialty Category</CardTitle></CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revByCategory ?? []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip formatter={(v: number) => fmtFull(v)} />
                      <Legend />
                      <Bar dataKey="CAT_1" stackId="a" fill={CAT_COLORS[0]} name="Surgical" />
                      <Bar dataKey="CAT_2" stackId="a" fill={CAT_COLORS[1]} name="Interventional" />
                      <Bar dataKey="CAT_3" stackId="a" fill={CAT_COLORS[2]} name="Primary Treatment" />
                      <Bar dataKey="CAT_4" stackId="a" fill={CAT_COLORS[3]} name="Ancillary" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Charts Row 2: Donuts ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-lg">Tier Distribution</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 flex items-center">
                  <div className="w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={tierDist ?? []} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {(tierDist ?? []).map((entry, i) => (<Cell key={entry.code} fill={TIER_COLORS[entry.code] ?? DONUT_COLORS[i % DONUT_COLORS.length]} />))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-1/2 space-y-2">
                    {(tierDist ?? []).map((t) => (
                      <div key={t.code} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: TIER_COLORS[t.code] }} /><span>{t.name}</span></div>
                        <span className="font-semibold">{t.value} <span className="text-muted-foreground font-normal">({t.pct}%)</span></span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-lg">Revenue by Market</CardTitle></CardHeader>
              <CardContent>
                <div className="h-64 flex items-center">
                  <div className="w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={marketDist ?? []} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                          {(marketDist ?? []).map((_, i) => (<Cell key={i} fill={MARKET_COLORS[i % MARKET_COLORS.length]} />))}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmt(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-1/2 space-y-2">
                    {(marketDist ?? []).map((m, i) => (
                      <div key={m.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2"><div className="h-3 w-3 rounded-full" style={{ backgroundColor: MARKET_COLORS[i % MARKET_COLORS.length] }} /><span>{m.name}</span></div>
                        <span className="font-semibold">{fmt(m.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Tables Row ── */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-destructive" />Past Due Accounts</CardTitle>
                {pastDueTotal > 0 && <Badge variant="destructive">{fmtFull(pastDueTotal)} total</Badge>}
              </CardHeader>
              <CardContent>
                {(pastDueAccounts ?? []).length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="text-right">Owed</TableHead><TableHead>Days</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(pastDueAccounts ?? []).slice(0, 10).map((acct) => (
                        <TableRow key={acct.id}>
                          <TableCell className="font-medium cursor-pointer hover:underline" onClick={() => navigate(`/providers/${acct.provider_id}`)}>{(acct.providers as any)?.business_name ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtFull(acct.owed)}</TableCell>
                          <TableCell><Badge variant="secondary" className={daysBadgeColor(acct.daysPast)}>{acct.daysPast}d</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Send Reminder"><Send className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Call" onClick={() => navigate(`/providers/${acct.provider_id}`)}><Phone className="h-3 w-3" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No past due accounts — great job!</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Recent Payments</CardTitle>
                <span className="text-sm text-muted-foreground">This month: <strong>{fmtFull(monthPaymentsTotal)}</strong></span>
              </CardHeader>
              <CardContent>
                {(recentPayments ?? []).length > 0 ? (
                  <Table>
                    <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Method</TableHead><TableHead>Invoice</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(recentPayments ?? []).map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-sm">{(p.providers as any)?.business_name ?? "—"}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtFull(Number(p.amount))}</TableCell>
                          <TableCell className="capitalize text-xs">{p.payment_method?.replace("_", " ")}</TableCell>
                          <TableCell className="font-mono text-xs">{(p.invoices as any)?.invoice_number ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No payments yet this month.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <BillingAlertsPanel />

          {/* ── Revenue Insights ── */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><ArrowUpRight className="h-4 w-4 text-blue-500" /><p className="text-sm font-medium">Upgrade Opportunity</p></div>
                <p className="text-2xl font-bold">{insights?.upgradeCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Associate providers — est. {fmt(insights?.upgradeEstimate ?? 0)}/mo MRR uplift</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><Building2 className="h-4 w-4 text-amber-500" /><p className="text-sm font-medium">Enterprise Candidates</p></div>
                <p className="text-2xl font-bold">{insights?.entCandidates ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Providers with 5+ locations on per-location billing</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-destructive">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><ShieldAlert className="h-4 w-4 text-destructive" /><p className="text-sm font-medium">Churn Risk</p></div>
                <p className="text-2xl font-bold">{insights?.churnRiskCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{fmt(insights?.churnRiskRevenue ?? 0)}/mo revenue at risk</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-green-500">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2"><Sparkles className="h-4 w-4 text-green-500" /><p className="text-sm font-medium">Growth This Month</p></div>
                <p className="text-2xl font-bold">{coreStats?.newSubsCount ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">New subscriptions — {fmt(coreStats?.newSubsMrr ?? 0)}/mo added</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="reports" className="space-y-6 mt-4">
          <div className="flex items-center gap-4">
            <Select value={selectedReport} onValueChange={setSelectedReport}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select a report…" />
              </SelectTrigger>
              <SelectContent>
                {REPORT_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedReport === "monthly-revenue" && <MonthlyRevenueReport />}
          {selectedReport === "ar-aging" && <ARAgingReport />}
          {selectedReport === "provider-detail" && <ProviderBillingDetail />}
          {selectedReport === "mrr-movement" && <MRRMovementReport />}
          {selectedReport === "enterprise-analysis" && <EnterpriseAnalysisReport />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
