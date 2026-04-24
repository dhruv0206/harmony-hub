import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, Eye, CheckCircle2, XCircle, Phone, MessageSquare,
  Pause, Flag, Bot, User, Shield, TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-warning/10 text-warning",
  medium: "bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  high: "bg-destructive/10 text-destructive",
};

const FLAG_TYPE_LABELS: Record<string, string> = {
  adversarial_intent: "Adversarial Intent",
  legal_loophole: "Legal Loophole",
  termination_focused: "Termination Focused",
  competitive_mention: "Competitive Mention",
  suspicious_pattern: "Suspicious Pattern",
};

export default function AIReviewFlags() {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data: flaggedMessages } = useQuery({
    queryKey: ["flagged-review-messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_review_messages")
        .select("*, contract_review_sessions(id, contract_id, provider_id, flagged, reviewed_by_admin, flag_reason, messages_count, providers(business_name), contracts(contract_type, deal_value))")
        .eq("flagged", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sessions } = useQuery({
    queryKey: ["flagged-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_review_sessions")
        .select("*, providers(business_name), contracts(contract_type)")
        .eq("flagged", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: sessionMessages } = useQuery({
    queryKey: ["session-messages", selectedSession],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_review_messages")
        .select("*")
        .eq("session_id", selectedSession!)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedSession,
  });

  const dismissFlag = useMutation({
    mutationFn: async (sessionId: string) => {
      await supabase.from("contract_review_sessions").update({
        reviewed_by_admin: true,
        reviewed_at: new Date().toISOString(),
      }).eq("id", sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flagged-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["flagged-review-messages"] });
      toast.success("Flag dismissed");
    },
  });

  const escalate = useMutation({
    mutationFn: async (sessionId: string) => {
      const session = sessions?.find(s => s.id === sessionId);
      if (!session) return;
      // Create notification to call the provider
      await supabase.from("notifications").insert({
        user_id: (await supabase.auth.getUser()).data.user!.id,
        title: "Escalation: Provider Review Flag",
        message: `Provider ${(session.providers as any)?.business_name} has flagged contract review questions requiring follow-up. Recommend a personal call.`,
        type: "warning",
        link: `/contracts`,
      });
      await supabase.from("contract_review_sessions").update({
        reviewed_by_admin: true,
        reviewed_at: new Date().toISOString(),
        flag_reason: `${session.flag_reason || ""} [ESCALATED - Follow-up call recommended]`,
      }).eq("id", sessionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flagged-sessions"] });
      toast.success("Escalated — notification sent for follow-up call");
    },
  });

  // Stats
  const totalFlags = flaggedMessages?.length || 0;
  const thisMonth = flaggedMessages?.filter(m => {
    const d = new Date(m.created_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length || 0;

  const flagsByType = Object.entries(
    (flaggedMessages || []).reduce<Record<string, number>>((acc, m) => {
      const t = (m.flag_type as string) || "unknown";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name: FLAG_TYPE_LABELS[name] || name, value }));

  const severityData = Object.entries(
    (flaggedMessages || []).reduce<Record<string, number>>((acc, m) => {
      const s = (m.flag_severity as string) || "low";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  const SEV_CHART_COLORS = { low: "#f59e0b", medium: "#f97316", high: "#ef4444" };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="h-6 w-6 text-destructive" />AI Review Flags
        </h2>
        <p className="text-muted-foreground">Monitor suspicious provider questions during contract review</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Flags</p>
            <p className="text-2xl font-bold">{totalFlags}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="text-2xl font-bold">{thisMonth}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Unreviewed Sessions</p>
            <p className="text-2xl font-bold">{sessions?.filter(s => !s.reviewed_by_admin).length || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">High Severity</p>
            <p className="text-2xl font-bold text-destructive">
              {flaggedMessages?.filter(m => (m.flag_severity as string) === "high").length || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Flags by Type</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={flagsByType}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Flags by Severity</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={severityData} cx="50%" cy="50%" innerRadius={40} outerRadius={80} dataKey="value" nameKey="name" label>
                  {severityData.map((entry) => (
                    <Cell key={entry.name} fill={(SEV_CHART_COLORS as any)[entry.name] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Sessions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Flagged Sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Flag Reason</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{(s.providers as any)?.business_name}</TableCell>
                  <TableCell className="capitalize">{(s.contracts as any)?.contract_type}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm">{s.flag_reason || "—"}</TableCell>
                  <TableCell>{s.messages_count}</TableCell>
                  <TableCell>
                    {s.reviewed_by_admin ? (
                      <Badge className="bg-success/10 text-success"><CheckCircle2 className="h-3 w-3 mr-1" />Reviewed</Badge>
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive"><Flag className="h-3 w-3 mr-1" />Needs Review</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setSelectedSession(s.id)} title="View conversation">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {!s.reviewed_by_admin && (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => dismissFlag.mutate(s.id)} title="Dismiss">
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => escalate.mutate(s.id)} title="Escalate">
                            <Phone className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!sessions || sessions.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    No flagged sessions. All clear!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Conversation Viewer */}
      <Dialog open={!!selectedSession} onOpenChange={() => setSelectedSession(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader><DialogTitle>Conversation Review</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 p-1">
              {sessionMessages?.map((msg) => {
                const isProvider = (msg.role as string) === "provider";
                const isFlagged = msg.flagged;
                return (
                  <div key={msg.id} className={`flex gap-3 ${isProvider ? "justify-end" : ""}`}>
                    {!isProvider && (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      isFlagged ? "ring-2 ring-destructive bg-destructive/5" :
                      isProvider ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      {isFlagged && (
                        <div className="mt-2 flex items-center gap-2">
                          <Badge className={SEVERITY_COLORS[(msg.flag_severity as string) || "low"]}>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {FLAG_TYPE_LABELS[(msg.flag_type as string) || ""] || msg.flag_type}
                          </Badge>
                          <Badge variant="outline" className="text-xs capitalize">{(msg.flag_severity as string) || "low"}</Badge>
                        </div>
                      )}
                      <p className="text-xs opacity-60 mt-1">{new Date(msg.created_at).toLocaleString()}</p>
                    </div>
                    {isProvider && (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
