import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { StatCard } from "@/components/StatCard";
import { Building2, TrendingUp, FileText, DollarSign, Target, Phone, Plus, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { UpcomingEventsWidget } from "@/components/calendar/UpcomingEventsWidget";

export default function SalesRepDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: myProviders } = useQuery({
    queryKey: ["my-providers-count"],
    queryFn: async () => {
      const { count } = await supabase.from("providers").select("*", { count: "exact", head: true }).eq("assigned_sales_rep", user!.id);
      return count ?? 0;
    },
    enabled: !!user,
  });

  const { data: myPipeline } = useQuery({
    queryKey: ["my-pipeline"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_pipeline")
        .select("*, providers(business_name)")
        .eq("sales_rep_id", user!.id)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: myContracts } = useQuery({
    queryKey: ["my-contracts-month"],
    queryFn: async () => {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("contracts")
        .select("*, providers!inner(assigned_sales_rep)")
        .eq("providers.assigned_sales_rep", user!.id)
        .gte("created_at", startOfMonth.toISOString());
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: myActivities } = useQuery({
    queryKey: ["my-activities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activities")
        .select("*, providers(business_name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: renewals } = useQuery({
    queryKey: ["my-renewals"],
    queryFn: async () => {
      const future30 = new Date();
      future30.setDate(future30.getDate() + 30);
      const { data } = await supabase
        .from("contracts")
        .select("*, providers!inner(business_name, assigned_sales_rep)")
        .eq("providers.assigned_sales_rep", user!.id)
        .lte("renewal_date", future30.toISOString().split("T")[0])
        .gte("renewal_date", new Date().toISOString().split("T")[0])
        .order("renewal_date");
      return data ?? [];
    },
    enabled: !!user,
  });

  const totalValue = myPipeline?.reduce((s, d) => s + Number(d.estimated_value || 0), 0) ?? 0;
  const wonDeals = myPipeline?.filter((d) => d.stage === "closed_won") ?? [];
  const lostDeals = myPipeline?.filter((d) => d.stage === "closed_lost") ?? [];
  const winRate = wonDeals.length + lostDeals.length > 0
    ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100)
    : 0;

  // Performance chart data (last 6 months of won deals)
  const perfData = (() => {
    const months: { name: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const name = d.toLocaleString("default", { month: "short" });
      const monthWon = wonDeals.filter((deal) => {
        const created = new Date(deal.created_at);
        return created.getMonth() === d.getMonth() && created.getFullYear() === d.getFullYear();
      });
      months.push({ name, value: monthWon.reduce((s, d) => s + Number(d.estimated_value || 0), 0) });
    }
    return months;
  })();

  const activityTypeIcons: Record<string, string> = {
    call: "📞", email: "📧", meeting: "📅", note: "📝", status_change: "🔄", contract_update: "📄",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My Dashboard</h1>
          <p className="text-muted-foreground">Your sales performance overview</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => navigate("/pipeline")}>
            <Plus className="h-4 w-4 mr-1" />Add Lead
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate("/providers")}>
            <Eye className="h-4 w-4 mr-1" />My Providers
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="My Providers" value={myProviders ?? 0} icon={Building2} />
        <StatCard title="Pipeline Value" value={`$${totalValue.toLocaleString()}`} icon={DollarSign} />
        <StatCard title="Pipeline Deals" value={myPipeline?.length ?? 0} icon={TrendingUp} />
        <StatCard title="Win Rate" value={`${winRate}%`} icon={Target} />
        <StatCard title="Contracts This Month" value={myContracts?.length ?? 0} icon={FileText} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Performance Chart */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Closed Deals (Last 6 Months)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={perfData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `$${v.toLocaleString()}`} />
                <Line type="monotone" dataKey="value" className="stroke-primary" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Upcoming Renewals */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Upcoming Renewals</CardTitle></CardHeader>
          <CardContent>
            {renewals && renewals.length > 0 ? (
              <div className="space-y-3">
                {renewals.map((c) => (
                  <div key={c.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{(c.providers as any)?.business_name}</p>
                      <p className="text-xs text-muted-foreground">Renewal: {c.renewal_date}</p>
                    </div>
                    <Badge variant="outline" className="text-warning border-warning">${Number(c.deal_value || 0).toLocaleString()}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No upcoming renewals</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* My Pipeline Summary */}
        <Card>
          <CardHeader><CardTitle className="text-lg">My Pipeline</CardTitle></CardHeader>
          <CardContent>
            {myPipeline && myPipeline.length > 0 ? (
              <div className="space-y-3">
                {myPipeline.filter(d => d.stage !== "closed_won" && d.stage !== "closed_lost").slice(0, 6).map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">{deal.providers?.business_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{deal.stage.replace(/_/g, " ")}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">${Number(deal.estimated_value || 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{deal.probability}%</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No pipeline deals yet</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader><CardTitle className="text-lg">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            {myActivities && myActivities.length > 0 ? (
              <div className="space-y-3">
                {myActivities.map((a) => (
                  <div key={a.id} className="flex gap-2 items-start border-b pb-2 last:border-0">
                    <span className="text-sm">{activityTypeIcons[a.activity_type] || "📋"}</span>
                    <div className="min-w-0">
                      <p className="text-sm truncate">{a.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.providers?.business_name} · {new Date(a.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Events */}
      <UpcomingEventsWidget myEventsOnly />
    </div>
  );
}
