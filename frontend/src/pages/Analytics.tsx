import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { US_STATES } from "@/lib/us-states";
import { AlertTriangle, Target, DollarSign, Scale } from "lucide-react";
import { AICoverageOutreach } from "@/components/ai/AICoverageOutreach";
import LawFirmAnalytics from "@/components/analytics/LawFirmAnalytics";
import { ChurnRiskDashboard } from "@/components/analytics/ChurnRiskDashboard";
import { ProviderInsightsDashboard } from "@/components/analytics/ProviderInsightsDashboard";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

interface StateData {
  abbr: string; name: string; providers: number; activeProviders: number;
  dealValue: number; population: number; area: number; coverageScore: number; isGap: boolean;
}

const REGIONS: Record<string, string[]> = {
  Northeast: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  Southeast: ["AL", "FL", "GA", "KY", "MS", "NC", "SC", "TN", "VA", "WV", "DC", "MD", "DE"],
  Midwest: ["IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"],
  Southwest: ["AZ", "NM", "OK", "TX"],
  West: ["AK", "CA", "CO", "HI", "ID", "MT", "NV", "OR", "UT", "WA", "WY"],
};

function getCoverageColor(score: number): string {
  if (score === 0) return "#ef4444";
  if (score < 0.3) return "#f97316";
  if (score < 0.6) return "#eab308";
  if (score < 0.8) return "#84cc16";
  return "#22c55e";
}

const TIER_COLORS: Record<string, string> = { ASSOCIATE: "#3b82f6", MEMBER: "#f59e0b", PREMIER: "#8b5cf6" };
const REGION_COLORS = ["#3b82f6", "#8b5cf6", "#f59e0b", "#22c55e", "#ef4444"];
const CAT_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444"];

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function Analytics() {
  const { data: providers } = useQuery({
    queryKey: ["analytics-providers"],
    queryFn: async () => { const { data } = await supabase.from("providers").select("*"); return data ?? []; },
  });

  const { data: contracts } = useQuery({
    queryKey: ["analytics-contracts"],
    queryFn: async () => { const { data } = await supabase.from("contracts").select("*"); return data ?? []; },
  });

  // Revenue analytics data
  const { data: revenueData } = useQuery({
    queryKey: ["analytics-revenue"],
    queryFn: async () => {
      const [subsRes, catsRes, marketsRes, locsRes] = await Promise.all([
        supabase.from("provider_subscriptions").select("provider_id, monthly_amount, started_at, cancelled_at, status, membership_tiers(name, short_code), specialty_categories(name, short_code)").in("status", ["active", "cancelled"]),
        supabase.from("specialty_categories").select("name, short_code").order("display_order"),
        supabase.from("geographic_markets").select("name, short_code").order("display_order"),
        supabase.from("provider_locations").select("provider_id, market_id, geographic_markets(name), state").eq("is_active", true),
      ]);
      return { subs: subsRes.data ?? [], cats: catsRes.data ?? [], markets: marketsRes.data ?? [], locations: locsRes.data ?? [] };
    },
  });

  const stateData: StateData[] = useMemo(() => {
    const stateCounts: Record<string, { total: number; active: number; value: number }> = {};
    (providers ?? []).forEach(p => {
      const st = p.state; if (!st) return;
      if (!stateCounts[st]) stateCounts[st] = { total: 0, active: 0, value: 0 };
      stateCounts[st].total++;
      if (p.status === "active") stateCounts[st].active++;
    });
    (contracts ?? []).forEach(c => {
      const provider = (providers ?? []).find(p => p.id === c.provider_id);
      if (provider?.state && c.status === "active") {
        if (!stateCounts[provider.state]) stateCounts[provider.state] = { total: 0, active: 0, value: 0 };
        stateCounts[provider.state].value += Number(c.deal_value) || 0;
      }
    });
    const maxProviders = Math.max(...Object.values(stateCounts).map(v => v.total), 1);
    return US_STATES.map(s => {
      const counts = stateCounts[s.abbr] || stateCounts[s.name] || { total: 0, active: 0, value: 0 };
      const coverageScore = counts.total / maxProviders;
      return { abbr: s.abbr, name: s.name, providers: counts.total, activeProviders: counts.active, dealValue: counts.value, population: s.population, area: s.area_sq_mi, coverageScore, isGap: counts.total === 0 };
    }).sort((a, b) => b.providers - a.providers);
  }, [providers, contracts]);

  const regionData = useMemo(() => {
    return Object.entries(REGIONS).map(([region, states]) => {
      const statesInRegion = stateData.filter(s => states.includes(s.abbr));
      return { region, providers: statesInRegion.reduce((s, st) => s + st.providers, 0), value: statesInRegion.reduce((s, st) => s + st.dealValue, 0), gaps: statesInRegion.filter(s => s.isGap).length };
    });
  }, [stateData]);

  const monthlyGrowth = useMemo(() => {
    const months: { month: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleString("default", { month: "short" });
      months.push({ month: label, count: (providers ?? []).filter(p => p.created_at <= `${key}-31`).length });
    }
    return months;
  }, [providers]);

  // Revenue charts
  const mrrByState = useMemo(() => {
    if (!revenueData) return [];
    const stateRev: Record<string, number> = {};
    const activeSubs = revenueData.subs.filter((s: any) => s.status === "active");
    const locsByProvider: Record<string, string[]> = {};
    revenueData.locations.forEach((l: any) => {
      if (!locsByProvider[l.provider_id]) locsByProvider[l.provider_id] = [];
      if (l.state) locsByProvider[l.provider_id].push(l.state);
    });
    activeSubs.forEach((s: any) => {
      const states = locsByProvider[s.provider_id] ?? [];
      if (states.length === 0) return;
      const share = Number(s.monthly_amount) / states.length;
      states.forEach(st => { stateRev[st] = (stateRev[st] ?? 0) + share; });
    });
    return Object.entries(stateRev).map(([state, mrr]) => ({ state, mrr: Math.round(mrr) })).sort((a, b) => b.mrr - a.mrr).slice(0, 15);
  }, [revenueData]);

  const revByMarket = useMemo(() => {
    if (!revenueData) return [];
    const activeSubs = revenueData.subs.filter((s: any) => s.status === "active");
    const marketRev: Record<string, { name: string; rev: number; count: number }> = {};
    const locsByProvider: Record<string, string[]> = {};
    revenueData.locations.forEach((l: any) => {
      const mName = (l.geographic_markets as any)?.name ?? "Unknown";
      if (!locsByProvider[l.provider_id]) locsByProvider[l.provider_id] = [];
      locsByProvider[l.provider_id].push(mName);
    });
    activeSubs.forEach((s: any) => {
      const markets = locsByProvider[s.provider_id] ?? [];
      if (markets.length === 0) return;
      const share = Number(s.monthly_amount) / markets.length;
      markets.forEach(m => {
        if (!marketRev[m]) marketRev[m] = { name: m, rev: 0, count: 0 };
        marketRev[m].rev += share;
        marketRev[m].count++;
      });
    });
    return Object.values(marketRev).map(m => ({ ...m, rev: Math.round(m.rev), avg: m.count > 0 ? Math.round(m.rev / m.count) : 0 }));
  }, [revenueData]);

  const tierTrend = useMemo(() => {
    if (!revenueData) return [];
    const months: { label: string; date: Date }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), date: d });
    }
    return months.map(({ label, date }) => {
      const eom = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      const counts: Record<string, number> = { ASSOCIATE: 0, MEMBER: 0, PREMIER: 0 };
      revenueData.subs.forEach((s: any) => {
        const st = s.started_at ? new Date(s.started_at) : null;
        const ca = s.cancelled_at ? new Date(s.cancelled_at) : null;
        if (st && st <= eom && (!ca || ca > eom)) {
          const tc = (s.membership_tiers as any)?.short_code ?? "ASSOCIATE";
          counts[tc] = (counts[tc] ?? 0) + 1;
        }
      });
      return { month: label, ...counts };
    });
  }, [revenueData]);

  const avgRevByCategory = useMemo(() => {
    if (!revenueData) return [];
    const activeSubs = revenueData.subs.filter((s: any) => s.status === "active");
    const catRev: Record<string, { name: string; total: number; count: number }> = {};
    activeSubs.forEach((s: any) => {
      const catName = (s.specialty_categories as any)?.name ?? "Unknown";
      const catCode = (s.specialty_categories as any)?.short_code ?? "UNK";
      if (!catRev[catCode]) catRev[catCode] = { name: catName, total: 0, count: 0 };
      catRev[catCode].total += Number(s.monthly_amount);
      catRev[catCode].count++;
    });
    return Object.values(catRev).map(c => ({ name: c.name, avg: c.count > 0 ? Math.round(c.total / c.count) : 0 }));
  }, [revenueData]);

  const gaps = stateData.filter(s => s.isGap);
  const priorityList = useMemo(() => [...stateData].filter(s => s.providers <= 2).sort((a, b) => b.population - a.population).slice(0, 15), [stateData]);
  const totalProviders = providers?.length ?? 0;
  const coveredStates = stateData.filter(s => s.providers > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Coverage analytics, revenue insights, and churn risk</p>
        </div>
        <AICoverageOutreach gaps={gaps} regionData={regionData} totalProviders={totalProviders} coveredStates={coveredStates} />
      </div>

      <Tabs defaultValue="coverage">
        <TabsList>
          <TabsTrigger value="coverage">Coverage Analytics</TabsTrigger>
          <TabsTrigger value="revenue"><DollarSign className="mr-1 h-4 w-4" />Revenue</TabsTrigger>
          <TabsTrigger value="law-firms"><Scale className="mr-1 h-4 w-4" />Law Firms</TabsTrigger>
          <TabsTrigger value="churn">Churn Risk</TabsTrigger>
          <TabsTrigger value="insights">Provider Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="coverage" className="space-y-6 mt-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">States Covered</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{coveredStates} / {US_STATES.length}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Coverage Gaps</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-destructive">{gaps.length} states</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Providers</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{totalProviders}</p></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Avg Per State</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{coveredStates > 0 ? (totalProviders / coveredStates).toFixed(1) : 0}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-sm">US Coverage Map</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {stateData.map(s => (
                  <div key={s.abbr} className="relative group" title={`${s.name}: ${s.providers} providers, $${s.dealValue.toLocaleString()}`}>
                    <div className="w-10 h-10 rounded flex items-center justify-center text-xs font-bold transition-transform hover:scale-110 cursor-default" style={{ background: getCoverageColor(s.coverageScore), color: s.coverageScore > 0.3 ? "white" : s.isGap ? "white" : "#1a1a1a" }}>{s.abbr}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: "#22c55e" }} />High</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: "#84cc16" }} />Good</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: "#eab308" }} />Medium</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: "#f97316" }} />Low</div>
                <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: "#ef4444" }} />No Coverage</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-sm">Coverage by Region</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={250}><BarChart data={regionData}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="region" className="text-xs" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="providers" name="Providers" radius={[4, 4, 0, 0]}>{regionData.map((_, i) => <Cell key={i} fill={REGION_COLORS[i % REGION_COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-sm">Provider Growth Over Time</CardTitle></CardHeader><CardContent><ResponsiveContainer width="100%" height={250}><LineChart data={monthlyGrowth}><CartesianGrid strokeDasharray="3 3" className="stroke-border" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Line type="monotone" dataKey="count" stroke="hsl(217, 91%, 50%)" strokeWidth={2} dot={{ r: 4 }} name="Total Providers" /></LineChart></ResponsiveContainer></CardContent></Card>
          </div>

          <Card>
            <CardHeader><div className="flex items-center gap-2"><Target className="h-5 w-5 text-primary" /><CardTitle>Priority Call List</CardTitle></div><p className="text-sm text-muted-foreground">States with low or no coverage, ranked by market potential (population)</p></CardHeader>
            <CardContent>
              {priorityList.length > 0 ? (
                <div className="space-y-2">
                  {priorityList.map((s, i) => (
                    <div key={s.abbr} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                        <div><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-muted-foreground">Pop: {(s.population / 1000000).toFixed(1)}M · {s.providers} providers</p></div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.isGap ? <Badge variant="destructive" className="text-xs"><AlertTriangle className="mr-1 h-3 w-3" />No Coverage</Badge> : <Badge variant="secondary" className="text-xs">Low Coverage</Badge>}
                        <Badge variant="outline" className="text-xs">Target for Outreach</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">All states have adequate coverage!</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>State Rankings</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Rank</TableHead><TableHead>State</TableHead><TableHead>Providers</TableHead><TableHead>Active</TableHead><TableHead>Deal Value</TableHead><TableHead>Population</TableHead><TableHead>Coverage Score</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody>
                  {stateData.map((s, i) => (
                    <TableRow key={s.abbr} className={s.isGap ? "bg-destructive/5" : ""}>
                      <TableCell className="font-medium">{i + 1}</TableCell><TableCell className="font-medium">{s.name} ({s.abbr})</TableCell><TableCell>{s.providers}</TableCell><TableCell>{s.activeProviders}</TableCell><TableCell>${s.dealValue.toLocaleString()}</TableCell><TableCell>{(s.population / 1000000).toFixed(1)}M</TableCell>
                      <TableCell><div className="flex items-center gap-2"><div className="w-16 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.coverageScore * 100}%`, background: getCoverageColor(s.coverageScore) }} /></div><span className="text-xs">{(s.coverageScore * 100).toFixed(0)}%</span></div></TableCell>
                      <TableCell>{s.isGap ? <Badge variant="destructive" className="text-xs">Gap</Badge> : s.coverageScore < 0.3 ? <Badge variant="secondary" className="text-xs">Low</Badge> : <Badge className="text-xs bg-success/10 text-success">Covered</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-6 mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* MRR by State */}
            <Card>
              <CardHeader><CardTitle className="text-sm">MRR by State (Top 15)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={mrrByState} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tickFormatter={v => fmt(v)} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis type="category" dataKey="state" width={40} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="mrr" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="MRR" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue per provider by market */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Avg Revenue Per Provider by Market</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={revByMarket}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="avg" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} name="Avg Rev/Provider" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Tier Distribution Trend */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Tier Distribution Trend (12 months)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={tierTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="ASSOCIATE" stackId="1" stroke={TIER_COLORS.ASSOCIATE} fill={TIER_COLORS.ASSOCIATE} fillOpacity={0.6} name="Associate" />
                    <Area type="monotone" dataKey="MEMBER" stackId="1" stroke={TIER_COLORS.MEMBER} fill={TIER_COLORS.MEMBER} fillOpacity={0.6} name="Member" />
                    <Area type="monotone" dataKey="PREMIER" stackId="1" stroke={TIER_COLORS.PREMIER} fill={TIER_COLORS.PREMIER} fillOpacity={0.6} name="Premier" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Avg Revenue by Category */}
            <Card>
              <CardHeader><CardTitle className="text-sm">Avg Revenue Per Provider by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={avgRevByCategory}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tickFormatter={v => fmt(v)} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="avg" radius={[4, 4, 0, 0]} name="Avg Rev/Provider">
                      {avgRevByCategory.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="law-firms" className="mt-4"><LawFirmAnalytics /></TabsContent>
        <TabsContent value="churn" className="mt-4"><ChurnRiskDashboard /></TabsContent>
        <TabsContent value="insights" className="mt-4"><ProviderInsightsDashboard /></TabsContent>
      </Tabs>
    </div>
  );
}
