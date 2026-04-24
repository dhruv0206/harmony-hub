import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Headphones, CheckCircle, CalendarClock, DollarSign,
  MessageSquare, Plus, User, Phone, Mail, ArrowRight, Clock, RefreshCw,
  PenTool, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import ProviderOnboardingProgress from "@/components/onboarding/ProviderOnboardingProgress";
import ProviderOnboardingDashboard from "@/components/onboarding/ProviderOnboardingDashboard";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-warning/10 text-warning",
  sent: "bg-primary/10 text-primary",
  negotiating: "bg-warning/10 text-warning",
  signed: "bg-success/10 text-success",
  active: "bg-success/10 text-success",
  expired: "bg-destructive/10 text-destructive",
  terminated: "bg-destructive/10 text-destructive",
};

const providerStatusColors: Record<string, string> = {
  prospect: "bg-muted text-muted-foreground",
  in_negotiation: "bg-warning/10 text-warning",
  contracted: "bg-primary/10 text-primary",
  active: "bg-success/10 text-success",
  churned: "bg-destructive/10 text-destructive",
  suspended: "bg-destructive/10 text-destructive",
};

const ticketStatusColors: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-warning/10 text-warning",
  waiting_on_provider: "bg-muted text-muted-foreground",
  resolved: "bg-success/10 text-success",
  closed: "bg-muted text-muted-foreground",
};

export default function ProviderDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: "", description: "", category: "general", priority: "medium" });

  // Get the provider record linked to this user
  const { data: provider } = useQuery({
    queryKey: ["my-provider"],
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("email").eq("id", user!.id).single();
      if (!prof?.email) return null;
      const { data } = await supabase.from("providers").select("*, profiles!providers_assigned_sales_rep_fkey(full_name, email, phone)").eq("contact_email", prof.email).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: contracts } = useQuery({
    queryKey: ["my-contracts"],
    queryFn: async () => {
      const { data } = await supabase.from("contracts").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: tickets } = useQuery({
    queryKey: ["my-tickets"],
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: recentMessages } = useQuery({
    queryKey: ["my-recent-messages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ticket_messages")
        .select("*, support_tickets(subject), profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  const createTicket = useMutation({
    mutationFn: async (overrides?: { subject?: string; description?: string; category?: string }) => {
      if (!provider) throw new Error("No provider record found");
      const payload = { ...ticketForm, ...overrides };
      const { error } = await supabase.from("support_tickets").insert({
        provider_id: provider.id,
        subject: payload.subject,
        description: payload.description,
        category: payload.category as any,
        priority: payload.priority as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-tickets"] });
      setTicketOpen(false);
      setTicketForm({ subject: "", description: "", category: "general", priority: "medium" });
      toast.success("Ticket created successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activeContracts = contracts?.filter(c => c.status === "active") ?? [];
  const totalValue = activeContracts.reduce((sum, c) => sum + Number(c.deal_value || 0), 0);
  const openTickets = tickets?.filter(t => ["open", "in_progress"].includes(t.status)).length ?? 0;

  const now = Date.now();
  const renewalsIn60 = contracts?.filter(c => {
    if (!c.renewal_date) return false;
    const diff = (new Date(c.renewal_date).getTime() - now) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 60;
  }) ?? [];

  const nextRenewalDays = useMemo(() => {
    if (!contracts?.length) return null;
    let min = Infinity;
    contracts.forEach(c => {
      if (!c.renewal_date) return;
      const diff = (new Date(c.renewal_date).getTime() - now) / (1000 * 60 * 60 * 24);
      if (diff >= 0 && diff < min) min = diff;
    });
    return min === Infinity ? null : Math.ceil(min);
  }, [contracts]);

  const salesRep = provider?.profiles as any;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Welcome, {provider?.business_name || profile?.full_name || "Provider"}</h1>
            {provider?.status && (
              <Badge className={`capitalize ${providerStatusColors[provider.status] || ""}`}>
                {provider.status.replace(/_/g, " ")}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">Your provider dashboard — everything at a glance</p>
        </div>
      </div>

      {/* Provider Onboarding Dashboard — 6-stage card grid */}
      <ProviderOnboardingDashboard />

      {/* Pending Signature Banner — only show if NOT in active onboarding (onboarding has its own doc section) */}
      <PendingSignatureBanner />

      {/* Unified Onboarding Progress (documents + steps) */}
      <ProviderOnboardingProgress />

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Active Contracts" value={activeContracts.length} icon={CheckCircle} />
        <StatCard title="Total Contract Value" value={`$${totalValue.toLocaleString()}`} icon={DollarSign} />
        <StatCard title="Open Support Tickets" value={openTickets} icon={Headphones} />
        <StatCard title="Next Renewal" value={nextRenewalDays !== null ? `${nextRenewalDays} days` : "—"} icon={CalendarClock} />
      </div>

      {/* My Contracts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>My Contracts</CardTitle>
            <CardDescription>Your active and past contracts</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/contracts")}>
            View All <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {contracts && contracts.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {contracts.slice(0, 4).map((c) => {
                const daysLeft = c.end_date ? Math.ceil((new Date(c.end_date).getTime() - now) / (1000 * 60 * 60 * 24)) : null;
                return (
                  <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow border"
                    onClick={() => navigate(`/contracts/${c.id}`)}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold capitalize">{c.contract_type} Contract</span>
                        <Badge className={`capitalize ${statusColors[c.status]}`}>{c.status.replace(/_/g, " ")}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Value</span>
                        <span className="font-medium">${Number(c.deal_value || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Period</span>
                        <span>{c.start_date || "—"} → {c.end_date || "—"}</span>
                      </div>
                      {daysLeft !== null && daysLeft > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />{daysLeft} days remaining
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No contracts yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Upcoming Renewals */}
      {renewalsIn60.length > 0 && (
        <Card className="border-warning/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-warning">
              <RefreshCw className="h-5 w-5" /> Upcoming Renewals
            </CardTitle>
            <CardDescription>Contracts renewing in the next 60 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {renewalsIn60.map((c) => {
              const days = Math.ceil((new Date(c.renewal_date!).getTime() - now) / (1000 * 60 * 60 * 24));
              return (
                <div key={c.id} className="flex items-center justify-between p-3 bg-warning/5 rounded-lg border border-warning/20">
                  <div>
                    <p className="font-medium capitalize">{c.contract_type} Contract</p>
                    <p className="text-sm text-muted-foreground">Renews in {days} day{days !== 1 ? "s" : ""} ({c.renewal_date})</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    setTicketForm({
                      subject: `Renewal inquiry — ${c.contract_type} contract #${c.id.slice(0, 8)}`,
                      description: `I would like to discuss the upcoming renewal for my ${c.contract_type} contract (ID: ${c.id.slice(0, 8)}) renewing on ${c.renewal_date}.`,
                      category: "contract_question",
                      priority: "medium",
                    });
                    setTicketOpen(true);
                  }}>
                    Contact Us About Renewal
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recent Communications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Recent Communications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentMessages && recentMessages.length > 0 ? (
            <div className="space-y-3">
              {recentMessages.slice(0, 5).map((m) => (
                <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{(m as any).support_tickets?.subject || "Ticket"}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">{m.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(m as any).profiles?.full_name || "System"} · {new Date(m.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No recent messages.</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setTicketOpen(true)}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Submit a Support Ticket</p>
                <p className="text-xs text-muted-foreground">Get help from our team</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/contracts")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">View My Contracts</p>
                <p className="text-xs text-muted-foreground">See all contract details</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/profile")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Update My Profile</p>
                <p className="text-xs text-muted-foreground">Keep your info current</p>
              </div>
            </CardContent>
          </Card>

          {salesRep && (
            <Card>
              <CardContent className="p-5 space-y-2">
                <p className="font-medium text-sm">My Sales Representative</p>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{salesRep.full_name || "—"}</span>
                  </div>
                  {salesRep.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      <a href={`mailto:${salesRep.email}`} className="text-primary hover:underline">{salesRep.email}</a>
                    </div>
                  )}
                  {salesRep.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{salesRep.phone}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* New Ticket Dialog */}
      <Dialog open={ticketOpen} onOpenChange={setTicketOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Support Ticket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject *</Label>
              <Input value={ticketForm.subject} onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })} placeholder="Brief description of your issue" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={ticketForm.description} onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })} rows={4} placeholder="Provide details..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={ticketForm.category} onValueChange={(v) => setTicketForm({ ...ticketForm, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.ticket_category.map((c) => (
                      <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={ticketForm.priority} onValueChange={(v) => setTicketForm({ ...ticketForm, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.ticket_priority.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" onClick={() => createTicket.mutate(undefined)} disabled={!ticketForm.subject || createTicket.isPending}>
              {createTicket.isPending ? "Creating..." : "Submit Ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PendingSignatureBanner() {
  const navigate = useNavigate();
  const { data: pendingRequests } = useQuery({
    queryKey: ["my-pending-signatures"],
    queryFn: async () => {
      const { data } = await supabase
        .from("signature_requests")
        .select("id, status, contracts(contract_type, deal_value), providers(business_name)")
        .in("status", ["pending", "viewed", "identity_verified"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  if (!pendingRequests?.length) return null;

  return (
    <div className="space-y-3">
      {pendingRequests.map(req => (
        <div key={req.id} className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-center gap-3">
          <PenTool className="h-5 w-5 text-warning shrink-0" />
          <div className="flex-1">
            <p className="font-semibold text-warning">Action Required: Sign Your Contract</p>
            <p className="text-sm text-muted-foreground">
              Your {(req.contracts as any)?.contract_type} contract is ready for signature.
            </p>
          </div>
          <Button size="sm" onClick={() => navigate(`/sign/${req.id}`)}>
            <PenTool className="h-4 w-4 mr-2" />Sign Now
          </Button>
        </div>
      ))}
    </div>
  );
}
