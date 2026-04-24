import { useState } from "react";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Send, Bot, User, Building2, AlertTriangle, StickyNote } from "lucide-react";
import { AISuggestResponse } from "@/components/ai/AISuggestResponse";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type TicketStatus = Database["public"]["Enums"]["ticket_status"];
type TicketPriority = Database["public"]["Enums"]["ticket_priority"];
type TicketCategory = Database["public"]["Enums"]["ticket_category"];

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

const statusColors: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-warning/10 text-warning",
  waiting_on_provider: "bg-muted text-muted-foreground",
  resolved: "bg-success/10 text-success",
  closed: "bg-muted text-muted-foreground",
};

export default function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const isProvider = role === "provider";

  const { data: ticket } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*, providers(id, business_name, contact_name, contact_email), profiles(full_name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["ticket_messages", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("*, profiles(full_name)")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: providerContracts } = useQuery({
    queryKey: ["ticket-provider-contracts", ticket?.providers?.id],
    enabled: !!ticket?.providers?.id && !isProvider,
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("contract_type, deal_value, status, start_date, end_date, renewal_date, terms_summary")
        .eq("provider_id", ticket!.providers!.id);
      return data ?? [];
    },
  });

  const { data: providerDetail } = useQuery({
    queryKey: ["ticket-provider-detail", ticket?.providers?.id],
    enabled: !!ticket?.providers?.id && !isProvider,
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("*, profiles(full_name)")
        .eq("id", ticket!.providers!.id)
        .single();
      return data;
    },
  });

  const { data: reps } = useQuery({
    queryKey: ["support_reps"],
    enabled: !isProvider,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id, profiles(full_name)").in("role", ["admin", "sales_rep"]);
      return data ?? [];
    },
  });

  // Realtime: auto-refresh messages when new ones arrive
  useRealtimeSubscription({
    channelName: `ticket-messages-${id}`,
    table: "ticket_messages",
    filter: `ticket_id=eq.${id}`,
    queryKeys: [["ticket_messages", id!]],
    enabled: !!id,
  });

  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: id!,
        sender_id: user!.id,
        message: replyText,
        is_ai_response: false,
      });
      if (error) throw error;
      // Auto-update status to in_progress if currently open
      if (ticket?.status === "open") {
        await supabase.from("support_tickets").update({ status: "in_progress" as TicketStatus }).eq("id", id!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_messages", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      setReplyText("");
      toast.success("Reply sent");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateTicketMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from("support_tickets").update(updates).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("Ticket updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addInternalNoteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: id!,
        sender_id: user!.id,
        message: `[INTERNAL NOTE] ${internalNote}`,
        is_ai_response: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket_messages", id] });
      setInternalNote("");
      toast.success("Internal note added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!ticket) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const isEscalated = (ticket.priority === "high" || ticket.priority === "urgent") &&
    ticket.status !== "resolved" && ticket.status !== "closed" &&
    (Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60) > 24;

  // Filter internal notes for providers
  const visibleMessages = isProvider
    ? messages?.filter((m) => !m.message.startsWith("[INTERNAL NOTE]"))
    : messages;

  const internalNotes = messages?.filter((m) => m.message.startsWith("[INTERNAL NOTE]")) ?? [];

  return (
    <div className="space-y-4">
      {/* Escalation Banner */}
      {isEscalated && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">Escalated Ticket</p>
            <p className="text-sm text-muted-foreground">This high-priority ticket has been unresolved for over 24 hours.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(isProvider ? "/support" : "/helpdesk")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{ticket.subject}</h1>
              <Badge className={`capitalize ${priorityColors[ticket.priority]}`}>{ticket.priority}</Badge>
              <Badge className={`capitalize ${statusColors[ticket.status]}`}>{ticket.status.replace(/_/g, " ")}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">#{ticket.id.slice(0, 8)} · Created {new Date(ticket.created_at).toLocaleDateString()}</p>
          </div>
        </div>
      </div>

      <div className={`grid gap-4 ${isProvider ? "" : "md:grid-cols-[1fr_280px]"}`}>
        {/* Main Content */}
        <div className="space-y-4">
          {/* Provider Info */}
          {!isProvider && ticket.providers && (
            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{(ticket.providers as any).business_name}</p>
                  <p className="text-xs text-muted-foreground">{(ticket.providers as any).contact_email}</p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/providers/${(ticket.providers as any).id}`}>View Provider</Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          {ticket.description && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Conversation Thread */}
          <Card>
            <CardHeader><CardTitle className="text-lg">Conversation</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {visibleMessages && visibleMessages.length > 0 ? (
                visibleMessages.filter((m) => !m.message.startsWith("[INTERNAL NOTE]")).map((msg) => (
                  <div key={msg.id} className={`flex gap-3 ${msg.is_ai_response ? "bg-accent/50 rounded-lg p-3" : ""}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${msg.is_ai_response ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {msg.is_ai_response ? <Bot className="h-4 w-4" /> : (msg.profiles?.full_name?.charAt(0) || <User className="h-4 w-4" />)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{msg.profiles?.full_name || "System"}</span>
                        {msg.is_ai_response && <Badge variant="outline" className="text-xs">AI</Badge>}
                        <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{msg.message}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No messages yet</p>
              )}

              <Separator />

              {/* Reply Box */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Type your reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2">
                  <Button onClick={() => sendReplyMutation.mutate()} disabled={!replyText.trim() || sendReplyMutation.isPending}>
                    <Send className="h-4 w-4 mr-2" />{sendReplyMutation.isPending ? "Sending..." : "Send Reply"}
                  </Button>
                </div>
              </div>

              {/* AI Suggest Response (admin/rep only) */}
              {!isProvider && (
                <AISuggestResponse
                  ticket={ticket}
                  messages={visibleMessages ?? []}
                  providerInfo={{
                    ...ticket.providers,
                    status: providerDetail?.status,
                    provider_type: providerDetail?.provider_type,
                    city: providerDetail?.city,
                    state: providerDetail?.state,
                    assigned_rep: providerDetail?.profiles?.full_name || "Unassigned",
                  }}
                  contractInfo={providerContracts?.map(c =>
                    `${c.contract_type} contract — $${Number(c.deal_value || 0).toLocaleString()} — Status: ${c.status} — Ends: ${c.end_date || "N/A"} — Renewal: ${c.renewal_date || "N/A"} — Terms: ${c.terms_summary || "None"}`
                  ).join("\n") || undefined}
                  onUseResponse={(text) => setReplyText(text)}
                />
              )}
            </CardContent>
          </Card>

          {/* Internal Notes (admin/rep only) */}
          {!isProvider && (
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><StickyNote className="h-5 w-5" />Internal Notes</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {internalNotes.length > 0 ? (
                  internalNotes.map((n) => (
                    <div key={n.id} className="bg-warning/5 border border-warning/20 rounded-md p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{n.profiles?.full_name || "System"}</span>
                        <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-sm">{n.message.replace("[INTERNAL NOTE] ", "")}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No internal notes.</p>
                )}
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add internal note (not visible to provider)..."
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    rows={2}
                    className="flex-1"
                  />
                  <Button variant="outline" size="sm" onClick={() => addInternalNoteMutation.mutate()} disabled={!internalNote.trim()}>
                    Add Note
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar (admin/rep only) */}
        {!isProvider && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Ticket Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <Select value={ticket.status} onValueChange={(v) => updateTicketMutation.mutate({ status: v, ...(v === "resolved" ? { resolved_at: new Date().toISOString() } : {}) })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.ticket_status.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Priority</p>
                  <Select value={ticket.priority} onValueChange={(v) => updateTicketMutation.mutate({ priority: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.ticket_priority.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Category</p>
                  <Select value={ticket.category} onValueChange={(v) => updateTicketMutation.mutate({ category: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.ticket_category.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Assigned To</p>
                  <Select value={ticket.assigned_to || "unassigned"} onValueChange={(v) => updateTicketMutation.mutate({ assigned_to: v === "unassigned" ? null : v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {reps?.map((r) => (
                        <SelectItem key={r.user_id} value={r.user_id}>{(r.profiles as any)?.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(ticket.created_at).toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span>{new Date(ticket.updated_at).toLocaleString()}</span></div>
                  {ticket.resolved_at && <div className="flex justify-between"><span className="text-muted-foreground">Resolved</span><span>{new Date(ticket.resolved_at).toLocaleString()}</span></div>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
