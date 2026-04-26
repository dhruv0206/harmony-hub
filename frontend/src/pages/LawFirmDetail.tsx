import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Building2, Phone, Mail, Globe, MapPin, Plus, Clock, Users,
  Edit, RefreshCw, FileText, DollarSign, Calendar, User, AlertTriangle, TrendingUp, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import AuditLogTable from "@/components/audit/AuditLogTable";
import { LawFirmServicePackageCard } from "@/components/law-firms/LawFirmServicePackageCard";
import ContractForm from "@/components/contracts/ContractForm";

const statusColors: Record<string, string> = {
  prospect: "bg-muted text-muted-foreground",
  in_negotiation: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  contracted: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  suspended: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  churned: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const STATUSES = ["prospect", "in_negotiation", "contracted", "active", "suspended", "churned"];
const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "status_change", "contract_update", "stage_change", "document_sent", "document_signed"];
const activityIcons: Record<string, string> = {
  call: "📞", email: "📧", meeting: "🤝", note: "📝", status_change: "🔄",
  contract_update: "📄", stage_change: "🔀", document_sent: "📤", document_signed: "✅",
};

const docStatusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  viewed: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  provider_signed: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  fully_executed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  declined: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  expired: "bg-muted text-muted-foreground",
  voided: "bg-muted text-muted-foreground",
};

export default function LawFirmDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<any>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: "note", description: "" });
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", title: "", email: "", phone: "", is_primary: false, is_signer: false });
  const [reassignOpen, setReassignOpen] = useState(false);
  const [createContractOpen, setCreateContractOpen] = useState(false);

  // --- Queries ---
  const { data: firm, isLoading } = useQuery({
    queryKey: ["law-firm", id],
    queryFn: async () => {
      const { data, error } = await (supabase.from("law_firms" as any).select("*, profiles:assigned_sales_rep(full_name, email)") as any).eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: contacts } = useQuery({
    queryKey: ["law-firm-contacts", id],
    queryFn: async () => {
      const { data } = await (supabase.from("law_firm_contacts" as any).select("*").eq("law_firm_id", id!).order("is_primary", { ascending: false }) as any);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const { data: documents } = useQuery({
    queryKey: ["law-firm-documents", id],
    queryFn: async () => {
      const { data } = await (supabase.from("law_firm_documents" as any).select("*, document_templates(name, short_code)").eq("law_firm_id", id!).order("signing_order") as any);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["law-firm-subscriptions", id],
    queryFn: async () => {
      const { data } = await (supabase.from("law_firm_subscriptions" as any).select("*, membership_tiers(name)").eq("law_firm_id", id!).order("created_at", { ascending: false }) as any);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const { data: invoices } = useQuery({
    queryKey: ["law-firm-invoices", id],
    queryFn: async () => {
      const { data } = await (supabase.from("law_firm_invoices" as any).select("*").eq("law_firm_id", id!).order("created_at", { ascending: false }).limit(25) as any);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const { data: activities } = useQuery({
    queryKey: ["law-firm-activities", id],
    queryFn: async () => {
      const { data } = await (supabase.from("law_firm_activities" as any).select("*, profiles:user_id(full_name)").eq("law_firm_id", id!).order("created_at", { ascending: false }).limit(100) as any);
      return (data ?? []) as any[];
    },
    enabled: !!id,
  });

  const { data: tickets } = useQuery({
    queryKey: ["law-firm-tickets", id],
    queryFn: async () => {
      // Support tickets related to this firm — use notes/subject to filter; or if there's a law_firm_id column
      // For now, return empty — law firm tickets would need a law_firm_id FK on support_tickets
      return [] as any[];
    },
    enabled: !!id,
  });

  const { data: billingOverview } = useQuery({
    queryKey: ["law-firm-billing-overview", id],
    queryFn: async () => {
      const subs = subscriptions ?? [];
      const invs = invoices ?? [];
      const mrr = subs.filter((s: any) => s.status === "active").reduce((sum: number, s: any) => sum + Number(s.monthly_amount), 0);
      const overdueInvs = invs.filter((i: any) => i.status === "past_due");
      const overdueAmount = overdueInvs.reduce((sum: number, i: any) => sum + Number(i.total_amount) - Number(i.paid_amount ?? 0), 0);
      const totalPaid = invs.filter((i: any) => i.status === "paid").reduce((sum: number, i: any) => sum + Number(i.total_amount), 0);
      return { mrr, overdueAmount, overdueCount: overdueInvs.length, totalPaid };
    },
    enabled: !!subscriptions && !!invoices,
  });

  const { data: salesReps } = useQuery({
    queryKey: ["sales-reps-list"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, user_roles(role)");
      return (data ?? []).filter((p: any) => (p.user_roles as any[])?.some((r: any) => r.role === "admin" || r.role === "sales_rep"));
    },
  });

  // --- Mutations ---
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await (supabase.from("law_firms" as any).update({ status }).eq("id", id!) as any);
      if (error) throw error;
      await (supabase.from("law_firm_activities" as any).insert({
        law_firm_id: id!, user_id: user!.id, activity_type: "status_change",
        description: `Status changed to ${status.replace(/_/g, " ")}`,
      }) as any);

      // When a firm becomes contracted, kick off an onboarding workflow if
      // they don't already have one — same as the provider side.
      if (status === "contracted") {
        const { data: existing } = await supabase
          .from("onboarding_workflows")
          .select("id")
          .eq("law_firm_id", id!)
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from("onboarding_workflows").insert({
            law_firm_id: id!,
            participant_type: "law_firm",
            current_step: 1,
            total_steps: 5,
            status: "in_progress" as any,
            started_at: new Date().toISOString(),
            onboarding_stage: "documents",
            initiated_by: user!.id,
          });
        }
      }

      // Churn cascade — match the provider side.
      if (status === "churned") {
        await supabase.from("law_firm_subscriptions")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("law_firm_id", id!)
          .eq("status", "active");
        await supabase.from("contracts")
          .update({ status: "terminated" as any })
          .eq("law_firm_id", id!)
          .in("status", ["active", "signed", "sent", "negotiating"] as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law-firm", id] });
      queryClient.invalidateQueries({ queryKey: ["law-firm-activities", id] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-workflows"] });
      queryClient.invalidateQueries({ queryKey: ["v-contract-list"] });
      setStatusOpen(false);
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e?.message || "Could not update status"),
  });

  const addActivity = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from("law_firm_activities" as any).insert({
        law_firm_id: id!, user_id: user!.id,
        activity_type: activityForm.type,
        description: activityForm.description,
      }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law-firm-activities", id] });
      setActivityOpen(false);
      setActivityForm({ type: "note", description: "" });
      toast.success("Activity logged");
    },
  });

  const addContact = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from("law_firm_contacts" as any).insert({
        ...newContact, law_firm_id: id!,
      }) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law-firm-contacts", id] });
      setAddContactOpen(false);
      setNewContact({ name: "", title: "", email: "", phone: "", is_primary: false, is_signer: false });
      toast.success("Contact added");
    },
  });

  const deleteContact = useMutation({
    mutationFn: async (contactId: string) => {
      const { error } = await (supabase.from("law_firm_contacts" as any).delete().eq("id", contactId) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law-firm-contacts", id] });
      toast.success("Contact removed");
    },
  });

  const reassignRep = useMutation({
    mutationFn: async (repId: string) => {
      const { error } = await (supabase.from("law_firms" as any).update({ assigned_sales_rep: repId }).eq("id", id!) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law-firm", id] });
      setReassignOpen(false);
      toast.success("Sales rep reassigned");
    },
  });

  const updateFirm = useMutation({
    mutationFn: async () => {
      if (!editForm) return;
      const { error } = await (supabase.from("law_firms" as any).update({
        firm_name: editForm.firm_name,
        dba_name: editForm.dba_name,
        contact_name: editForm.contact_name,
        contact_email: editForm.contact_email,
        contact_phone: editForm.contact_phone,
        address_line1: editForm.address_line1,
        city: editForm.city,
        state: editForm.state,
        zip_code: editForm.zip_code,
        website: editForm.website,
        firm_size: editForm.firm_size,
        notes: editForm.notes,
      }).eq("id", id!) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["law-firm", id] });
      setEditOpen(false);
      toast.success("Firm updated");
    },
  });

  // --- Helpers ---
  const timeAgo = (d: string) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!firm) return <div className="flex items-center justify-center py-16 text-muted-foreground">Law firm not found</div>;

  const daysAsMember = Math.floor((Date.now() - new Date(firm.created_at).getTime()) / (1000 * 60 * 60 * 24));
  const lastContactDate = activities?.[0]?.created_at;
  const docsSigned = (documents ?? []).filter((d: any) => d.status === "fully_executed" || d.status === "provider_signed").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/law-firms")}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold">{firm.firm_name}</h1>
              <Badge className={statusColors[firm.status] || ""}>{firm.status?.replace(/_/g, " ")}</Badge>
              {firm.firm_size && <Badge variant="outline" className="capitalize">{firm.firm_size.replace(/_/g, " ")}</Badge>}
            </div>
            {firm.dba_name && <p className="text-sm text-muted-foreground">DBA: {firm.dba_name}</p>}
            <p className="text-muted-foreground text-sm">{[firm.city, firm.state].filter(Boolean).join(", ") || "No location"}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => { setEditForm({ ...firm }); setEditOpen(true); }}>
            <Edit className="mr-2 h-4 w-4" />Edit
          </Button>
          <Button size="sm" onClick={() => setCreateContractOpen(true)}>
            <FileText className="mr-2 h-4 w-4" />Create Contract
          </Button>
          <Dialog open={createContractOpen} onOpenChange={setCreateContractOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Contract for {firm.firm_name}</DialogTitle></DialogHeader>
              <ContractForm
                defaultLawFirmId={firm.id}
                onSuccess={(newId) => {
                  setCreateContractOpen(false);
                  // Drop straight into the field editor — that's the
                  // next step the user actually has to do.
                  if (newId) navigate(`/contracts/${newId}/fields?new=1`);
                }}
              />
            </DialogContent>
          </Dialog>
          <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm"><RefreshCw className="mr-2 h-4 w-4" />Change Status</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Change Law Firm Status</DialogTitle></DialogHeader>
              <Select value={newStatus || firm.status} onValueChange={setNewStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
              <Button onClick={() => updateStatus.mutate(newStatus)} disabled={!newStatus || newStatus === firm.status}>Update Status</Button>
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
                      {["call", "email", "meeting", "note"].map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
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
          <TabsTrigger value="documents">Documents ({documents?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="activity">Activity ({activities?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="support">Support ({tickets?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="contacts">Contacts ({contacts?.length ?? 0})</TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          {/* Metrics row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />Monthly Fee</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{billingOverview?.mrr ? `$${billingOverview.mrr.toLocaleString()}` : "$0"}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" />Contracts Signed</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{docsSigned}</p></CardContent>
            </Card>
            <Card className={billingOverview?.overdueCount ? "border-destructive/50" : ""}>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><AlertTriangle className={`h-4 w-4 ${billingOverview?.overdueCount ? "text-destructive" : ""}`} />Overdue</CardTitle></CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${billingOverview?.overdueCount ? "text-destructive" : ""}`}>
                  {billingOverview?.overdueCount ? `$${billingOverview.overdueAmount.toLocaleString()}` : "None"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" />Total Paid</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">${(billingOverview?.totalPaid ?? 0).toLocaleString()}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Calendar className="h-4 w-4" />Days as Member</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{daysAsMember}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground flex items-center gap-2"><Clock className="h-4 w-4" />Last Contact</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{lastContactDate ? new Date(lastContactDate).toLocaleDateString() : "Never"}</p></CardContent>
            </Card>
          </div>

          {/* Contact info + Rep + Practice Areas */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Firm Information</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {firm.contact_name && <div className="flex items-center gap-2 text-sm"><User className="h-4 w-4 text-muted-foreground" />{firm.contact_name}</div>}
                {firm.contact_email && <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${firm.contact_email}`} className="text-primary hover:underline">{firm.contact_email}</a></div>}
                {firm.contact_phone && <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /><a href={`tel:${firm.contact_phone}`} className="text-primary hover:underline">{firm.contact_phone}</a></div>}
                <Separator />
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    {firm.address_line1 && <p>{firm.address_line1}</p>}
                    {firm.address_line2 && <p>{firm.address_line2}</p>}
                    <p>{[firm.city, firm.state, firm.zip_code].filter(Boolean).join(", ") || "No address"}</p>
                  </div>
                </div>
                {firm.website && (
                  <div className="flex items-center gap-2 text-sm"><Globe className="h-4 w-4 text-muted-foreground" /><a href={firm.website} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate">{firm.website}</a></div>
                )}
                {firm.firm_size && <div className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" />Size: {firm.firm_size.replace(/_/g, " ")}</div>}
                {firm.source && <div className="text-sm text-muted-foreground">Source: {firm.source}</div>}
              </CardContent>
              {firm.notes && (
                <>
                  <Separator />
                  <CardContent className="pt-4">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm">{firm.notes}</p>
                  </CardContent>
                </>
              )}
            </Card>

            <div className="space-y-4">
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
                  <p className="text-lg font-medium">{firm.profiles?.full_name || "Unassigned"}</p>
                  {firm.profiles?.email && <p className="text-sm text-muted-foreground">{firm.profiles.email}</p>}
                </CardContent>
              </Card>

              {firm.practice_areas && firm.practice_areas.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Practice Areas</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {firm.practice_areas.map((pa: string) => <Badge key={pa} variant="outline" className="capitalize">{pa.replace(/_/g, " ")}</Badge>)}
                  </CardContent>
                </Card>
              )}

              {firm.states_licensed && firm.states_licensed.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">States Licensed</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {firm.states_licensed.map((st: string) => <Badge key={st} variant="secondary" className="text-xs">{st}</Badge>)}
                  </CardContent>
                </Card>
              )}

              {firm.health_score != null && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Health Score</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-3">
                      <span className={`text-3xl font-bold ${firm.health_score >= 70 ? "text-green-600" : firm.health_score >= 40 ? "text-amber-600" : "text-destructive"}`}>
                        {firm.health_score}
                      </span>
                      <span className="text-sm text-muted-foreground">/ 100</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick contacts preview */}
              {contacts && contacts.length > 0 && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Key Contacts</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {contacts.slice(0, 3).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium">{c.name}</span>
                          {c.title && <span className="text-muted-foreground ml-1">· {c.title}</span>}
                        </div>
                        <div className="flex gap-1">
                          {c.is_primary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
                          {c.is_signer && <Badge variant="outline" className="text-[10px]">Signer</Badge>}
                        </div>
                      </div>
                    ))}
                    {contacts.length > 3 && <p className="text-xs text-muted-foreground">+{contacts.length - 3} more</p>}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* DOCUMENTS TAB */}
        <TabsContent value="documents" className="mt-4 space-y-4">
          <LawFirmServicePackageCard lawFirmId={id!} currentPackageId={firm.service_package_id || null} />

          {/* Additional standalone documents */}
          {documents && documents.filter((d: any) => !d.signing_order).length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Other Documents</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Signed</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.filter((d: any) => !d.signing_order).map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">{doc.document_templates?.name || "Document"}</TableCell>
                        <TableCell><Badge className={docStatusColors[doc.status] || ""} variant="secondary">{doc.status?.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{doc.sent_at ? new Date(doc.sent_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{doc.signed_at ? new Date(doc.signed_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          {doc.file_url && <Button variant="ghost" size="sm" className="text-xs">View</Button>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* BILLING TAB */}
        <TabsContent value="billing" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Subscriptions</CardTitle></CardHeader>
            <CardContent>
              {subscriptions && subscriptions.length > 0 ? subscriptions.map((sub: any) => (
                <div key={sub.id} className="flex items-center justify-between p-3 rounded border mb-2">
                  <div>
                    <p className="font-medium text-sm">{sub.membership_tiers?.name || "Custom"}</p>
                    <p className="text-xs text-muted-foreground">${Number(sub.monthly_amount).toFixed(2)}/mo · Billing day: {sub.billing_day}</p>
                    {sub.next_billing_date && <p className="text-xs text-muted-foreground">Next billing: {new Date(sub.next_billing_date).toLocaleDateString()}</p>}
                  </div>
                  <Badge variant="secondary" className="capitalize">{sub.status}</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground py-4 text-center">No subscriptions</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Invoices</CardTitle></CardHeader>
            <CardContent className="p-0">
              {invoices && invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium text-sm">{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {inv.billing_period_start && inv.billing_period_end
                            ? `${new Date(inv.billing_period_start).toLocaleDateString()} – ${new Date(inv.billing_period_end).toLocaleDateString()}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium">${Number(inv.total_amount).toFixed(2)}</TableCell>
                        <TableCell><Badge variant="secondary" className="capitalize">{inv.status}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{inv.paid_date ? new Date(inv.paid_date).toLocaleDateString() : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="text-sm text-muted-foreground py-4 text-center">No invoices</p>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACTIVITY TAB */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Activity Timeline</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setActivityOpen(true)}><Plus className="mr-2 h-4 w-4" />Add</Button>
            </CardHeader>
            <CardContent>
              {activities && activities.length > 0 ? (
                <div className="space-y-4">
                  {activities.map((act: any) => (
                    <div key={act.id} className="flex gap-3 border-l-2 border-border pl-4 pb-4 last:pb-0 relative">
                      <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-card border-2 border-primary flex items-center justify-center text-xs">
                        {activityIcons[act.activity_type] || "📌"}
                      </div>
                      <div className="flex-1 ml-2">
                        <p className="text-sm font-medium">{act.description || "Activity logged"}</p>
                        <p className="text-xs text-muted-foreground">
                          {act.profiles?.full_name || "System"} · <span className="capitalize">{act.activity_type?.replace(/_/g, " ")}</span> · {timeAgo(act.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground py-4 text-center">No activity recorded</p>}
            </CardContent>
          </Card>
          {id && <AuditLogTable entityType="law_firm" entityId={id} compact title="Audit Trail" />}
        </TabsContent>

        {/* SUPPORT TAB */}
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
                  {tickets && tickets.length > 0 ? tickets.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.subject}</TableCell>
                      <TableCell className="capitalize">{t.category?.replace(/_/g, " ")}</TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{t.priority}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{t.status?.replace(/_/g, " ")}</Badge></TableCell>
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

        {/* CONTACTS TAB */}
        <TabsContent value="contacts" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Firm Contacts</CardTitle>
              <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
                <DialogTrigger asChild><Button size="sm"><Plus className="h-3.5 w-3.5 mr-1" />Add Contact</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Contact</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Name *</Label><Input value={newContact.name} onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))} /></div>
                    <div><Label>Title</Label><Input value={newContact.title} onChange={e => setNewContact(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Managing Partner, Paralegal, Office Manager" /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Email</Label><Input value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} /></div>
                      <div><Label>Phone</Label><Input value={newContact.phone} onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))} /></div>
                    </div>
                    <div className="flex gap-6">
                      <div className="flex items-center gap-2">
                        <Checkbox id="is_primary" checked={newContact.is_primary} onCheckedChange={v => setNewContact(p => ({ ...p, is_primary: !!v }))} />
                        <Label htmlFor="is_primary" className="text-sm">Primary Contact</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="is_signer" checked={newContact.is_signer} onCheckedChange={v => setNewContact(p => ({ ...p, is_signer: !!v }))} />
                        <Label htmlFor="is_signer" className="text-sm">Authorized Signer</Label>
                      </div>
                    </div>
                    <Button onClick={() => addContact.mutate()} className="w-full" disabled={!newContact.name || addContact.isPending}>
                      {addContact.isPending ? "Adding..." : "Add Contact"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent className="p-0">
              {contacts && contacts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-sm">{c.title || "—"}</TableCell>
                        <TableCell className="text-sm">{c.email ? <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a> : "—"}</TableCell>
                        <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {c.is_primary && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
                            {c.is_signer && <Badge variant="outline" className="text-[10px]">Signer</Badge>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (window.confirm(`Remove "${c.name}" from this firm?`)) {
                                deleteContact.mutate(c.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : <p className="text-sm text-muted-foreground py-8 text-center">No contacts added yet. Add partners, paralegals, and office staff.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Firm Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Law Firm</DialogTitle></DialogHeader>
          {editForm && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2"><Label>Firm Name</Label><Input value={editForm.firm_name || ""} onChange={e => setEditForm({ ...editForm, firm_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>DBA Name</Label><Input value={editForm.dba_name || ""} onChange={e => setEditForm({ ...editForm, dba_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Website</Label><Input value={editForm.website || ""} onChange={e => setEditForm({ ...editForm, website: e.target.value })} /></div>
              <div className="space-y-2"><Label>Contact Name</Label><Input value={editForm.contact_name || ""} onChange={e => setEditForm({ ...editForm, contact_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Email</Label><Input value={editForm.contact_email || ""} onChange={e => setEditForm({ ...editForm, contact_email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={editForm.contact_phone || ""} onChange={e => setEditForm({ ...editForm, contact_phone: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Firm Size</Label>
                <Select value={editForm.firm_size || ""} onValueChange={v => setEditForm({ ...editForm, firm_size: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {[{ value: "solo", label: "Solo" }, { value: "small_2_5", label: "Small (2-5)" }, { value: "mid_6_20", label: "Mid (6-20)" }, { value: "large_21_plus", label: "Large (21+)" }].map(s =>
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Address</Label><Input value={editForm.address_line1 || ""} onChange={e => setEditForm({ ...editForm, address_line1: e.target.value })} /></div>
              <div className="space-y-2"><Label>City</Label><Input value={editForm.city || ""} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /></div>
              <div className="space-y-2"><Label>State</Label><Input value={editForm.state || ""} onChange={e => setEditForm({ ...editForm, state: e.target.value })} /></div>
              <div className="space-y-2"><Label>Zip</Label><Input value={editForm.zip_code || ""} onChange={e => setEditForm({ ...editForm, zip_code: e.target.value })} /></div>
              <div className="space-y-2 col-span-2"><Label>Notes</Label><Textarea value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} rows={3} /></div>
              <div className="col-span-2">
                <Button className="w-full" onClick={() => updateFirm.mutate()} disabled={updateFirm.isPending}>
                  {updateFirm.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
