import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLawFirm } from "@/hooks/use-law-firm";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Headphones, DollarSign, CalendarClock, Plus, User, Phone, Mail, ArrowRight, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import { format } from "date-fns";

export default function LawFirmDashboard() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: lawFirm } = useLawFirm();
  const [ticketOpen, setTicketOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ subject: "", description: "", category: "general", priority: "medium" });

  const { data: documents } = useQuery({
    queryKey: ["lf-my-documents", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase.from("law_firm_documents").select("*").eq("law_firm_id", lawFirm!.id);
      return data ?? [];
    },
    enabled: !!lawFirm?.id,
  });

  const { data: subscription } = useQuery({
    queryKey: ["lf-my-subscription", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase.from("law_firm_subscriptions").select("*").eq("law_firm_id", lawFirm!.id).eq("status", "active").maybeSingle();
      return data;
    },
    enabled: !!lawFirm?.id,
  });

  const { data: tickets } = useQuery({
    queryKey: ["lf-my-tickets", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase.from("support_tickets").select("*").eq("provider_id", lawFirm!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!lawFirm?.id,
  });

  const { data: activities } = useQuery({
    queryKey: ["lf-my-activities", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase.from("law_firm_activities").select("*").eq("law_firm_id", lawFirm!.id).order("created_at", { ascending: false }).limit(10);
      return data ?? [];
    },
    enabled: !!lawFirm?.id,
  });

  const { data: nextEvent } = useQuery({
    queryKey: ["lf-next-event", lawFirm?.id],
    queryFn: async () => {
      // Calendar events don't have law_firm_id yet, so skip for now
      return null;
    },
    enabled: !!lawFirm?.id,
  });

  const signedDocs = documents?.filter(d => d.status === "signed" || d.status === "fully_executed").length ?? 0;
  const openTickets = tickets?.filter(t => ["open", "in_progress"].includes(t.status)).length ?? 0;
  const monthlyFee = subscription?.monthly_amount ?? 0;

  const salesRep = lawFirm?.profiles as any;

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold">Welcome, {lawFirm?.firm_name || profile?.full_name || "Law Firm"}</h1>
        <p className="text-muted-foreground mt-1">Your law firm dashboard — everything at a glance</p>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Active Contracts" value={signedDocs} icon={FileText} />
        <StatCard title="Monthly Fee" value={`$${monthlyFee.toLocaleString()}`} icon={DollarSign} />
        <StatCard title="Open Support Tickets" value={openTickets} icon={Headphones} />
        <StatCard title="Next Appointment" value="—" icon={CalendarClock} />
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activities && activities.length > 0 ? (
            <div className="space-y-3">
              {activities.map(a => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">{a.activity_type.replace(/_/g, " ")}</p>
                    <p className="text-sm text-muted-foreground line-clamp-1">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{format(new Date(a.created_at), "MMM d, yyyy")}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No recent activity.</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/lf/documents")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">View Documents</p>
                <p className="text-xs text-muted-foreground">Review and sign your documents</p>
              </div>
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/lf/support")}>
            <CardContent className="p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">Submit Support Ticket</p>
                <p className="text-xs text-muted-foreground">Get help from our team</p>
              </div>
            </CardContent>
          </Card>

          {salesRep && (
            <Card>
              <CardContent className="p-5 space-y-2">
                <p className="font-medium text-sm">Contact My Rep</p>
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
    </div>
  );
}
