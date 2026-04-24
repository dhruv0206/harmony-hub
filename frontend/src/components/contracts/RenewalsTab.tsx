import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StatCard } from "@/components/StatCard";
import {
  CalendarClock, AlertTriangle, RefreshCw, FileText, XCircle, CheckCircle2, Clock,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const RENEWAL_STATUS_COLORS: Record<string, string> = {
  not_due: "bg-muted text-muted-foreground",
  upcoming: "bg-warning/10 text-warning",
  in_renewal: "bg-primary/10 text-primary",
  renewed: "bg-success/10 text-success",
  expired: "bg-destructive/10 text-destructive",
  auto_renewed: "bg-success/10 text-success",
};

const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function RenewalsTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [renewalModal, setRenewalModal] = useState<any | null>(null);
  const [doNotRenewReason, setDoNotRenewReason] = useState("");

  const { data: contracts } = useQuery({
    queryKey: ["renewals-contracts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("*, providers(business_name, assigned_sales_rep, profiles(full_name))")
        .not("end_date", "is", null)
        .order("end_date", { ascending: true });
      return data ?? [];
    },
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["renewals-subscriptions"],
    queryFn: async () => {
      const { data } = await supabase.from("provider_subscriptions").select("provider_id, monthly_amount").eq("status", "active");
      return data ?? [];
    },
  });

  const subByProvider = useMemo(() => {
    const map: Record<string, number> = {};
    (subscriptions ?? []).forEach((s: any) => { map[s.provider_id] = Number(s.monthly_amount); });
    return map;
  }, [subscriptions]);

  const now = new Date();
  const nowMs = now.getTime();

  const enriched = useMemo(() => {
    return (contracts ?? []).map(c => {
      const endDate = new Date(c.end_date!);
      const daysUntil = Math.ceil((endDate.getTime() - nowMs) / (1000 * 60 * 60 * 24));
      return { ...c, daysUntil, monthlyFee: subByProvider[c.provider_id] ?? 0 };
    });
  }, [contracts, nowMs, subByProvider]);

  const renewalCandidates = useMemo(() => {
    return enriched.filter(c =>
      c.status === "active" || c.status === "signed" || c.renewal_status === "upcoming" || c.renewal_status === "in_renewal" || c.renewal_status === "expired"
    ).filter(c => c.daysUntil <= 90 || c.renewal_status === "expired" || c.renewal_status === "upcoming" || c.renewal_status === "in_renewal");
  }, [enriched]);

  // Stats
  const thisMonth = enriched.filter(c => {
    const end = new Date(c.end_date!);
    return end.getMonth() === now.getMonth() && end.getFullYear() === now.getFullYear() && (c.status === "active" || c.status === "signed");
  }).length;

  const next30 = enriched.filter(c => c.daysUntil > 0 && c.daysUntil <= 30 && (c.status === "active" || c.status === "signed")).length;
  const next60 = enriched.filter(c => c.daysUntil > 0 && c.daysUntil <= 60 && (c.status === "active" || c.status === "signed")).length;
  const expired = enriched.filter(c => c.renewal_status === "expired" || (c.daysUntil < 0 && c.status === "active")).length;
  const autoRenewCount = enriched.filter(c => c.auto_renew && (c.status === "active" || c.status === "signed")).length;

  // Analytics
  const renewalRate = useMemo(() => {
    const completed = enriched.filter(c => c.renewal_status === "renewed" || c.renewal_status === "auto_renewed").length;
    const expiredCount = enriched.filter(c => c.renewal_status === "expired").length;
    const total = completed + expiredCount;
    return total > 0 ? Math.round((completed / total) * 100) : 0;
  }, [enriched]);

  const revenueAtRisk = useMemo(() => {
    return enriched
      .filter(c => c.daysUntil > 0 && c.daysUntil <= 60 && (c.status === "active" || c.status === "signed"))
      .reduce((sum, c) => sum + c.monthlyFee, 0);
  }, [enriched]);

  const renewalTrend = useMemo(() => {
    const months: { month: string; renewed: number; expired: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleString("default", { month: "short" });
      const renewed = enriched.filter(c =>
        (c.renewal_status === "renewed" || c.renewal_status === "auto_renewed") &&
        c.updated_at.startsWith(key)
      ).length;
      const exp = enriched.filter(c =>
        c.renewal_status === "expired" && c.updated_at.startsWith(key)
      ).length;
      months.push({ month: label, renewed, expired: exp });
    }
    return months;
  }, [enriched]);

  const statusDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    enriched.forEach(c => { counts[c.renewal_status] = (counts[c.renewal_status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));
  }, [enriched]);

  const PIE_COLORS = ["#6b7280", "#eab308", "#3b82f6", "#22c55e", "#ef4444", "#16a34a"];

  // Mutations
  const autoRenewMutation = useMutation({
    mutationFn: async (contract: any) => {
      const startDate = new Date(contract.end_date!);
      const origStart = new Date(contract.start_date!);
      const origEnd = new Date(contract.end_date!);
      const termMs = origEnd.getTime() - origStart.getTime();
      const newEnd = new Date(startDate.getTime() + termMs);

      const { error } = await supabase.from("contracts").update({
        start_date: startDate.toISOString().split("T")[0],
        end_date: newEnd.toISOString().split("T")[0],
        renewal_date: new Date(newEnd.getTime() - (contract.renewal_notice_days ?? 60) * 86400000).toISOString().split("T")[0],
        renewal_status: "renewed",
        updated_at: new Date().toISOString(),
      }).eq("id", contract.id);
      if (error) throw error;

      await supabase.from("activities").insert({
        activity_type: "contract_update",
        description: `Contract auto-renewed through ${newEnd.toISOString().split("T")[0]}`,
        provider_id: contract.provider_id,
        user_id: user?.id,
      });
    },
    onSuccess: () => {
      toast.success("Contract renewed with same terms");
      queryClient.invalidateQueries({ queryKey: ["renewals-contracts"] });
      setRenewalModal(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const doNotRenewMutation = useMutation({
    mutationFn: async ({ contract, reason }: { contract: any; reason: string }) => {
      const { error } = await supabase.from("contracts").update({
        renewal_status: "expired",
        status: "expired",
        updated_at: new Date().toISOString(),
      }).eq("id", contract.id);
      if (error) throw error;

      await supabase.from("activities").insert({
        activity_type: "contract_update",
        description: `Contract not renewed. Reason: ${reason}`,
        provider_id: contract.provider_id,
        user_id: user?.id,
      });
    },
    onSuccess: () => {
      toast.success("Contract marked as expired");
      queryClient.invalidateQueries({ queryKey: ["renewals-contracts"] });
      setRenewalModal(null);
      setDoNotRenewReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startRenewalMutation = useMutation({
    mutationFn: async (contract: any) => {
      const { error } = await supabase.from("contracts").update({
        renewal_status: "in_renewal",
        updated_at: new Date().toISOString(),
      }).eq("id", contract.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["renewals-contracts"] });
    },
  });

  const toggleAutoRenew = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("contracts").update({ auto_renew: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["renewals-contracts"] });
    },
  });

  function getRowColor(daysUntil: number): string {
    if (daysUntil < 0) return "bg-destructive/5";
    if (daysUntil <= 30) return "bg-destructive/5";
    if (daysUntil <= 60) return "bg-orange-500/5";
    if (daysUntil <= 90) return "bg-yellow-500/5";
    return "";
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <StatCard title="Renewing This Month" value={thisMonth} icon={CalendarClock} />
        <StatCard title="Next 30 Days" value={next30} icon={Clock} />
        <StatCard title="Next 60 Days" value={next60} icon={Clock} />
        <StatCard title="Expired / Overdue" value={expired} icon={AlertTriangle} />
        <StatCard title="Auto-Renew Enabled" value={autoRenewCount} icon={RefreshCw} />
      </div>

      {/* Renewals Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contracts Approaching Renewal</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Contract Type</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Days Until Expiry</TableHead>
                <TableHead>Monthly Fee</TableHead>
                <TableHead>Renewal Status</TableHead>
                <TableHead>Auto-Renew</TableHead>
                <TableHead>Rep</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {renewalCandidates.length > 0 ? renewalCandidates.map(c => (
                <TableRow key={c.id} className={getRowColor(c.daysUntil)}>
                  <TableCell
                    className="font-medium cursor-pointer hover:underline"
                    onClick={() => navigate(`/providers/${c.provider_id}`)}
                  >
                    {(c.providers as any)?.business_name || "—"}
                  </TableCell>
                  <TableCell className="capitalize">{c.contract_type}</TableCell>
                  <TableCell>{c.end_date}</TableCell>
                  <TableCell>
                    <span className={c.daysUntil < 0 ? "text-destructive font-semibold" : c.daysUntil <= 30 ? "text-destructive font-medium" : ""}>
                      {c.daysUntil < 0 ? `${Math.abs(c.daysUntil)}d overdue` : `${c.daysUntil}d`}
                    </span>
                  </TableCell>
                  <TableCell>{c.monthlyFee > 0 ? fmt(c.monthlyFee) : "—"}</TableCell>
                  <TableCell>
                    <Badge className={`capitalize ${RENEWAL_STATUS_COLORS[c.renewal_status] || ""}`}>
                      {c.renewal_status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <Switch
                      checked={c.auto_renew}
                      onCheckedChange={(val) => toggleAutoRenew.mutate({ id: c.id, value: val })}
                    />
                  </TableCell>
                  <TableCell className="text-sm">{(c.providers as any)?.profiles?.full_name || "Unassigned"}</TableCell>
                  <TableCell>
                    {(c.renewal_status === "upcoming" || c.renewal_status === "not_due" || c.renewal_status === "in_renewal") && c.daysUntil <= 90 && (
                      <Button
                        size="sm"
                        variant={c.renewal_status === "in_renewal" ? "default" : "outline"}
                        onClick={() => {
                          if (c.renewal_status !== "in_renewal") {
                            startRenewalMutation.mutate(c);
                          }
                          setRenewalModal(c);
                        }}
                      >
                        {c.renewal_status === "in_renewal" ? "Continue Renewal" : "Start Renewal"}
                      </Button>
                    )}
                    {c.renewal_status === "expired" && (
                      <Badge variant="destructive">Expired</Badge>
                    )}
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No contracts approaching renewal
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Renewal Analytics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Renewal Rate</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{renewalRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">Renewed vs expired contracts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Revenue at Risk (60d)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{fmt(revenueAtRisk)}/mo</p>
            <p className="text-xs text-muted-foreground mt-1">Monthly fees from expiring contracts</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Status Distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={statusDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={50}>
                  {statusDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Renewal Trend (12 months)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={renewalTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="renewed" fill="#22c55e" name="Renewed" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expired" fill="#ef4444" name="Expired" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Renewal Modal */}
      <Dialog open={!!renewalModal} onOpenChange={(open) => { if (!open) { setRenewalModal(null); setDoNotRenewReason(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Renewal Options — {(renewalModal?.providers as any)?.business_name}</DialogTitle>
          </DialogHeader>
          {renewalModal && (
            <div className="space-y-4">
              <div className="text-sm space-y-1">
                <p><span className="text-muted-foreground">Contract Type:</span> <span className="capitalize font-medium">{renewalModal.contract_type}</span></p>
                <p><span className="text-muted-foreground">End Date:</span> <span className="font-medium">{renewalModal.end_date}</span></p>
                <p><span className="text-muted-foreground">Days Until Expiry:</span> <span className="font-medium">{renewalModal.daysUntil < 0 ? `${Math.abs(renewalModal.daysUntil)} days overdue` : `${renewalModal.daysUntil} days`}</span></p>
                <p><span className="text-muted-foreground">Deal Value:</span> <span className="font-medium">{fmt(Number(renewalModal.deal_value || 0))}</span></p>
              </div>

              <div className="space-y-3">
                <Button
                  className="w-full justify-start gap-3"
                  variant="outline"
                  onClick={() => autoRenewMutation.mutate(renewalModal)}
                  disabled={autoRenewMutation.isPending}
                >
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div className="text-left">
                    <p className="font-medium">Auto-Renew (Same Terms)</p>
                    <p className="text-xs text-muted-foreground">Extend contract with identical terms and notify provider</p>
                  </div>
                </Button>

                <Button
                  className="w-full justify-start gap-3"
                  variant="outline"
                  onClick={() => {
                    navigate(`/contracts/${renewalModal.id}`);
                    setRenewalModal(null);
                  }}
                >
                  <FileText className="h-5 w-5 text-blue-600" />
                  <div className="text-left">
                    <p className="font-medium">Send New Contract</p>
                    <p className="text-xs text-muted-foreground">Create a new version with updated terms for re-signing</p>
                  </div>
                </Button>

                <div className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-destructive" />
                    <p className="font-medium text-sm">Do Not Renew</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Reason for non-renewal</Label>
                    <Textarea
                      placeholder="Enter reason..."
                      value={doNotRenewReason}
                      onChange={(e) => setDoNotRenewReason(e.target.value)}
                      rows={2}
                    />
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={!doNotRenewReason.trim() || doNotRenewMutation.isPending}
                      onClick={() => doNotRenewMutation.mutate({ contract: renewalModal, reason: doNotRenewReason })}
                    >
                      Confirm Non-Renewal
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
