import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Edit, RefreshCw, FileText, Plus, Phone, Mail, MapPin, Calendar, DollarSign, Clock, User, AlertTriangle, TrendingUp } from "lucide-react";
import ContractForm from "@/components/contracts/ContractForm";
import { ServicePackageCard } from "@/components/providers/ServicePackageCard";
import { HealthScoreCard } from "@/components/providers/HealthScoreCard";
import { ProviderDocumentsTab } from "@/components/providers/ProviderDocumentsTab";
import ProviderBillingTab from "@/components/providers/ProviderBillingTab";
import { toast } from "sonner";
import AuditLogTable from "@/components/audit/AuditLogTable";
import { Constants } from "@/integrations/supabase/types";
import { refreshProviderHealthScore, BackendError } from "@/lib/backend-api";

const statusColors: Record<string, string> = {
  prospect: "bg-muted text-muted-foreground",
  in_negotiation: "bg-warning/10 text-warning",
  contracted: "bg-primary/10 text-primary",
  active: "bg-success/10 text-success",
  churned: "bg-destructive/10 text-destructive",
  suspended: "bg-muted text-muted-foreground",
};

const contractStatusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-warning/10 text-warning",
  sent: "bg-primary/10 text-primary",
  negotiating: "bg-warning/10 text-warning",
  signed: "bg-success/10 text-success",
  active: "bg-success/10 text-success",
  expired: "bg-destructive/10 text-destructive",
  terminated: "bg-destructive/10 text-destructive",
};

const activityIcons: Record<string, string> = {
  call: "📞", email: "📧", meeting: "🤝", note: "📝", status_change: "🔄", contract_update: "📄",
};

export default function ProviderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [activityForm, setActivityForm] = useState({ type: "note" as string, description: "" });
  const [editForm, setEditForm] = useState<any>(null);

  const { data: provider, isLoading } = useQuery({
    queryKey: ["provider", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("*, profiles(full_name, email)").eq("id", id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: providerContracts } = useQuery({
    queryKey: ["provider-contracts", id],
    queryFn: async () => {
      const { data } = await supabase.from("contracts").select("*").eq("provider_id", id!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: providerActivities } = useQuery({
    queryKey: ["provider-activities", id],
    queryFn: async () => {
      const { data } = await supabase.from("activities").select("*, profiles(full_name)").eq("provider_id", id!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: providerTickets } = useQuery({
    queryKey: ["provider-tickets", id],
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets").select("*, profiles(full_name)").eq("provider_id", id!).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: billingOverview } = useQuery({
    queryKey: ["provider-billing-overview", id],
    queryFn: async () => {
      const [subsRes, invoicesRes, paymentsRes] = await Promise.all([
        supabase.from("provider_subscriptions").select("monthly_amount, status").eq("provider_id", id!).in("status", ["active", "past_due"]),
        supabase.from("invoices").select("total_amount, paid_amount, status, due_date").eq("provider_id", id!),
        supabase.from("payments").select("amount").eq("provider_id", id!).eq("status", "completed"),
      ]);
      const subs = subsRes.data ?? [];
      const invoices = invoicesRes.data ?? [];
      const payments = paymentsRes.data ?? [];
      const mrr = subs.reduce((s, r) => s + Number(r.monthly_amount), 0);
      const overdueInvoices = invoices.filter(i => i.status === "past_due");
      const overdueAmount = overdueInvoices.reduce((s, i) => s + Number(i.total_amount) - Number(i.paid_amount ?? 0), 0);
      const totalPaid = payments.reduce((s, r) => s + Number(r.amount), 0);
      return { mrr, overdueAmount, overdueCount: overdueInvoices.length, totalPaid, subStatus: subs[0]?.status ?? null };
    },
    enabled: !!id,
  });

  const { data: salesReps } = useQuery({
    queryKey: ["sales-reps-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, user_roles(role)");
      return (data ?? []).filter((p: any) => (p.user_roles as any[])?.some((r: any) => r.role === "admin" || r.role === "sales_rep"));
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from("providers").update({ status: status as any }).eq("id", id!);
      if (error) throw error;
      // Log activity
      await supabase.from("activities").insert({
        provider_id: id!, user_id: user!.id, activity_type: "status_change",
        description: `Status changed to ${status.replace(/_/g, " ")}`,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider", id] });
      queryClient.invalidateQueries({ queryKey: ["provider-activities", id] });
      setStatusOpen(false);
      toast.success("Status updated");
    },
  });

  const addActivity = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("activities").insert({
        provider_id: id!, user_id: user!.id,
        activity_type: activityForm.type as any,
        description: activityForm.description,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider-activities", id] });
      setActivityOpen(false);
      setActivityForm({ type: "note", description: "" });
      toast.success("Activity logged");
    },
  });

  const reassignRep = useMutation({
    mutationFn: async (repId: string) => {
      const { error } = await supabase.from("providers").update({ assigned_sales_rep: repId }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider", id] });
      setReassignOpen(false);
      toast.success("Sales rep reassigned");
    },
  });

  const refreshHealth = useMutation({
    mutationFn: () => refreshProviderHealthScore(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider", id] });
      queryClient.invalidateQueries({ queryKey: ["provider-health", id] });
      toast.success("Health score refreshed");
    },
    onError: (e: any) => {
      if (e instanceof BackendError && e.code === "FUNCTION_NOT_DEPLOYED") {
        toast.error("Health-score service not deployed");
      } else {
        toast.error(e.message);
      }
    },
  });

  const updateProvider = useMutation({
    mutationFn: async () => {
      if (!editForm) return;
      const { error } = await supabase.from("providers").update({
        business_name: editForm.business_name,
        contact_name: editForm.contact_name,
        contact_email: editForm.contact_email,
        contact_phone: editForm.contact_phone,
        address_line1: editForm.address_line1,
        city: editForm.city,
        state: editForm.state,
        zip_code: editForm.zip_code,
        provider_type: editForm.provider_type,
        notes: editForm.notes,
      }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider", id] });
      setEditOpen(false);
      toast.success("Provider updated");
    },
  });

  if (isLoading) return <div className="flex items-center justify-center py-16 text-muted-foreground">Loading...</div>;
  if (!provider) return <div className="flex items-center justify-center py-16 text-muted-foreground">Provider not found</div>;

  const totalDealValue = providerContracts?.reduce((s, c) => s + (Number(c.deal_value) || 0), 0) ?? 0;
  const contractCount = providerContracts?.length ?? 0;
  const daysAsCustomer = Math.floor((Date.now() - new Date(provider.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const lastContactDate = providerActivities?.[0]?.created_at;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/providers")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{provider.business_name}</h1>
              <Badge className={`capitalize ${statusColors[provider.status]}`}>{provider.status.replace(/_/g, " ")}</Badge>
              {((provider as any).tags as string[] | undefined)?.includes("Coverage Gap Win") && (
                <Badge className="bg-success/10 text-success border-success">🏆 Coverage Gap Win</Badge>
              )}
            </div>
            <p className="text-muted-foreground">{provider.provider_type || "No type set"} · {[provider.city, provider.state].filter(Boolean).join(", ") || "No location"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditForm({ ...provider }); setEditOpen(true); }}>
            <Edit className="mr-2 h-4 w-4" />Edit
          </Button>
          <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><RefreshCw className="mr-2 h-4 w-4" />Change Status</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Change Provider Status</DialogTitle></DialogHeader>
              <Select value={newStatus || provider.status} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.provider_status.map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => updateStatus.mutate(newStatus)} disabled={!newStatus || newStatus === provider.status}>Update Status</Button>
            </DialogContent>
          </Dialog>
          <Dialog open={contractFormOpen} onOpenChange={setContractFormOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><FileText className="mr-2 h-4 w-4" />Create Contract</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Contract</DialogTitle></DialogHeader>
              <ContractForm
                defaultProviderId={id!}
                onSuccess={(newId) => {
                  setContractFormOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["provider-contracts", id] });
                  queryClient.invalidateQueries({ queryKey: ["v-contract-list"] });
                  if (newId) navigate(`/contracts/${newId}`);
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="mr-2 h-4 w-4" />Log Activity</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={activityForm.type} onValueChange={v => setActivityForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.activity_type.map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={activityForm.description} onChange={e => setActivityForm(f => ({ ...f, description: e.target.value }))} rows={3} />
                </div>
                <Button className="w-full" onClick={() => addActivity.mutate()} disabled={!activityForm.description || addActivity.isPending}>
                  {addActivity.isPending ? "Saving..." : "Log Activity"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="contracts">Contracts ({contractCount})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({providerActivities?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="support">Support ({providerTickets?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Monthly Rate</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{billingOverview?.mrr ? `$${billingOverview.mrr.toLocaleString()}` : "$0"}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Total Deal Value</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">${totalDealValue.toLocaleString()}</p></CardContent>
            </Card>
            <Card className={billingOverview?.overdueCount ? "border-destructive/50" : ""}>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${billingOverview?.overdueCount ? "text-destructive" : ""}`} />Overdue</CardTitle></CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${billingOverview?.overdueCount ? "text-destructive" : ""}`}>
                  {billingOverview?.overdueCount ? `$${billingOverview.overdueAmount.toLocaleString()}` : "None"}
                </p>
                {billingOverview?.overdueCount ? <p className="text-xs text-muted-foreground">{billingOverview.overdueCount} invoice{billingOverview.overdueCount > 1 ? "s" : ""}</p> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" />Total Paid</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-green-600">${(billingOverview?.totalPaid ?? 0).toLocaleString()}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" />Days as Customer</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{daysAsCustomer}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" />Last Contact</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{lastContactDate ? new Date(lastContactDate).toLocaleDateString() : "Never"}</p></CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refreshHealth.mutate()}
                  disabled={refreshHealth.isPending}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshHealth.isPending ? "animate-spin" : ""}`} />
                  Refresh Health Score
                </Button>
              </div>
              <HealthScoreCard providerId={id!} currentScore={(provider as any).health_score} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Contact Information</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" />{provider.contact_name || "No contact name"}</div>
                <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{provider.contact_email || "No email"}</div>
                <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{provider.contact_phone || "No phone"}</div>
                <Separator />
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    {provider.address_line1 && <p>{provider.address_line1}</p>}
                    {provider.address_line2 && <p>{provider.address_line2}</p>}
                    <p>{[provider.city, provider.state, provider.zip_code].filter(Boolean).join(", ") || "No address"}</p>
                  </div>
                </div>
                {provider.latitude && provider.longitude && (
                  <p className="text-xs text-muted-foreground">📍 {provider.latitude.toFixed(4)}, {provider.longitude.toFixed(4)}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Assigned Sales Rep</CardTitle>
                  <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
                    <DialogTrigger asChild><Button variant="ghost" size="sm">Reassign</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Reassign Sales Rep</DialogTitle></DialogHeader>
                      <div className="space-y-2">
                        {salesReps?.map(r => (
                          <Button key={r.id} variant="outline" className="w-full justify-start" onClick={() => reassignRep.mutate(r.id)}>
                            {r.full_name || r.id.slice(0, 8)}
                          </Button>
                        ))}
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-medium">{provider.profiles?.full_name || "Unassigned"}</p>
                {provider.profiles?.email && <p className="text-sm text-muted-foreground">{provider.profiles.email}</p>}
              </CardContent>
              {provider.notes && (
                <>
                  <Separator />
                  <CardContent className="pt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{provider.notes}</p>
                  </CardContent>
                </>
              )}
            </Card>
          </div>

          {/* Service Package & Documents */}
          <ServicePackageCard providerId={id!} currentPackageId={(provider as any).service_package_id} />
        </TabsContent>


        <TabsContent value="billing">
          <ProviderBillingTab providerId={id!} provider={provider} />
        </TabsContent>

        <TabsContent value="contracts" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Renewal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerContracts && providerContracts.length > 0 ? providerContracts.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="capitalize font-medium">{c.contract_type}</TableCell>
                      <TableCell>${Number(c.deal_value || 0).toLocaleString()}</TableCell>
                      <TableCell><Badge className={`capitalize ${contractStatusColors[c.status] || ""}`}>{c.status.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{c.start_date || "—"}</TableCell>
                      <TableCell>{c.end_date || "—"}</TableCell>
                      <TableCell>{c.renewal_date || "—"}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No contracts</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Activity Timeline</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}><Plus className="mr-2 h-4 w-4" />Add</Button>
            </CardHeader>
            <CardContent>
              {providerActivities && providerActivities.length > 0 ? (
                <div className="space-y-4">
                  {providerActivities.map(a => (
                    <div key={a.id} className="flex gap-3 border-l-2 border-border pl-4 pb-4 last:pb-0 relative">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-card border-2 border-primary flex items-center justify-center text-xs">
                        {activityIcons[a.activity_type] || "📌"}
                      </div>
                      <div className="flex-1 ml-2">
                        <p className="text-sm font-medium">{a.description || "Activity logged"}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.profiles?.full_name || "System"} · <span className="capitalize">{a.activity_type.replace(/_/g, " ")}</span> · {new Date(a.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No activities logged yet</p>
              )}
            </CardContent>
          </Card>
          {id && <AuditLogTable entityType="provider" entityId={id} compact title="Audit Trail" />}
        </TabsContent>

        <TabsContent value="support" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {providerTickets && providerTickets.length > 0 ? providerTickets.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.subject}</TableCell>
                      <TableCell className="capitalize">{t.category.replace(/_/g, " ")}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{t.priority}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{t.status.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No support tickets</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <ProviderDocumentsTab providerId={id!} />
        </TabsContent>
      </Tabs>

      {/* Edit Provider Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Provider</DialogTitle></DialogHeader>
          {editForm && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Business Name</Label>
                <Input value={editForm.business_name} onChange={e => setEditForm({ ...editForm, business_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input value={editForm.contact_name || ""} onChange={e => setEditForm({ ...editForm, contact_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input value={editForm.contact_email || ""} onChange={e => setEditForm({ ...editForm, contact_email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input value={editForm.contact_phone || ""} onChange={e => setEditForm({ ...editForm, contact_phone: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Provider Type</Label>
                <Input value={editForm.provider_type || ""} onChange={e => setEditForm({ ...editForm, provider_type: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input value={editForm.city || ""} onChange={e => setEditForm({ ...editForm, city: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input value={editForm.state || ""} onChange={e => setEditForm({ ...editForm, state: e.target.value })} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Notes</Label>
                <Textarea value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={3} />
              </div>
              <div className="col-span-2">
                <Button className="w-full" onClick={() => updateProvider.mutate()} disabled={updateProvider.isPending}>
                  {updateProvider.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
