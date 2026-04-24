import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, LineChart, Line,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e", prospect: "#f97316", contracted: "#3b82f6",
  in_negotiation: "#eab308", churned: "#ef4444", suspended: "#6b7280",
};

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function LawFirmAnalytics() {
  const { data: lawFirms } = useQuery({
    queryKey: ["lf-analytics-firms"],
    queryFn: async () => { const { data } = await supabase.from("law_firms").select("*"); return data ?? []; },
  });

  const { data: lfSubs } = useQuery({
    queryKey: ["lf-analytics-subs"],
    queryFn: async () => {
      const { data } = await supabase.from("law_firm_subscriptions").select("*");
      return data ?? [];
    },
  });

  const { data: providerSubs } = useQuery({
    queryKey: ["lf-analytics-provider-subs"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_subscriptions").select("monthly_amount, status");
      return data ?? [];
    },
  });

  const { data: lfOnboarding } = useQuery({
    queryKey: ["lf-analytics-onboarding"],
    queryFn: async () => {
      const { data } = await supabase.from("onboarding_workflows").select("*").eq("participant_type", "law_firm");
      return data ?? [];
    },
  });

  const firmsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    (lawFirms ?? []).forEach(f => { counts[f.status] = (counts[f.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value, fill: STATUS_COLORS[name] || "#6b7280" }));
  }, [lawFirms]);

  const firmsByState = useMemo(() => {
    const counts: Record<string, number> = {};
    (lawFirms ?? []).forEach(f => { if (f.state) counts[f.state] = (counts[f.state] || 0) + 1; });
    return Object.entries(counts).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [lawFirms]);

  const lfMrr = useMemo(() => {
    return (lfSubs ?? []).filter((s: any) => s.status === "active").reduce((sum, s: any) => sum + Number(s.monthly_amount), 0);
  }, [lfSubs]);

  const providerMrr = useMemo(() => {
    return (providerSubs ?? []).filter((s: any) => s.status === "active").reduce((sum, s: any) => sum + Number(s.monthly_amount), 0);
  }, [providerSubs]);

  const revenueComparison = [
    { name: "Provider MRR", value: providerMrr, fill: "hsl(210, 70%, 55%)" },
    { name: "Law Firm MRR", value: lfMrr, fill: "hsl(270, 60%, 55%)" },
  ];

  const onboardingPipeline = useMemo(() => {
    const stages: Record<string, number> = { documents: 0, billing: 0, training: 0, call: 0, portal: 0, go_live: 0 };
    (lfOnboarding ?? []).filter((w: any) => w.status !== "completed").forEach((w: any) => {
      if (w.current_stage && stages[w.current_stage] !== undefined) stages[w.current_stage]++;
    });
    return Object.entries(stages).map(([stage, count]) => ({ stage: stage.replace(/_/g, " "), count }));
  }, [lfOnboarding]);

  const totalFirms = lawFirms?.length ?? 0;
  const activeFirms = (lawFirms ?? []).filter(f => f.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Law Firms</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{totalFirms}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Active Law Firms</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{activeFirms}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Law Firm MRR</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{fmt(lfMrr)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">In Onboarding</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{(lfOnboarding ?? []).filter((w: any) => w.status !== "completed").length}</p></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Law Firms by Status</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={firmsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} label={({ name, value }) => `${name} (${value})`}>
                  {firmsByStatus.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Law Firms by State</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={firmsByState}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="state" className="text-xs" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(270, 60%, 55%)" radius={[4, 4, 0, 0]} name="Law Firms" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Provider vs Law Firm Revenue</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={revenueComparison}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={v => fmt(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="MRR">
                  {revenueComparison.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm">Onboarding Pipeline</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={onboardingPipeline}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="stage" className="text-xs capitalize" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(38, 80%, 55%)" radius={[4, 4, 0, 0]} name="Firms" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
