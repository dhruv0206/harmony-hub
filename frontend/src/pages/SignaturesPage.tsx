import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Search, CheckCircle, Eye, XCircle, Bell, AlertTriangle, LayoutGrid, PenTool, Trash2, Link as LinkIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import DocumentPipelineKanban from "@/components/signatures/DocumentPipelineKanban";
import AwaitingCounterSignTab from "@/components/signatures/AwaitingCounterSignTab";
import { PaginationControls } from "@/components/PaginationControls";

const statusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  viewed: "bg-primary/10 text-primary",
  identity_verified: "bg-accent text-accent-foreground",
  signed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  fully_executed: "bg-success/10 text-success",
  declined: "bg-destructive/10 text-destructive",
  expired: "bg-muted text-muted-foreground",
  voided: "bg-destructive/10 text-destructive",
};

export default function SignaturesPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [auditOpen, setAuditOpen] = useState<string | null>(null);
  const [tab, setTab] = useState("list");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  useRealtimeSubscription({ channelName: "sig-requests-admin", table: "signature_requests", queryKeys: [["signature-requests"]] });

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["signature-requests", statusFilter, search, page],
    queryFn: async () => {
      let q = supabase
        .from("signature_requests")
        .select("*, providers(business_name, contact_email), contracts(contract_type, deal_value), profiles!signature_requests_requested_by_fkey(full_name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (statusFilter !== "all" && statusFilter !== "expiring_soon") q = q.eq("status", statusFilter as any);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 15000,
  });

  const requests = requestsData?.data;
  const totalRequests = requestsData?.count ?? 0;

  const { data: providerDocsMap } = useQuery({
    queryKey: ["sig-provider-docs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("id, provider_id, template_id, package_id, signing_order, document_templates(name, document_type), service_packages(name, short_code)");
      const map: Record<string, any> = {};
      (data ?? []).forEach(d => { map[d.id] = d; });
      return map;
    },
  });

  const { data: providerDocCounts } = useQuery({
    queryKey: ["sig-provider-doc-counts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("provider_id, id")
        .neq("status", "voided");
      const counts: Record<string, number> = {};
      (data ?? []).forEach(d => { counts[d.provider_id] = (counts[d.provider_id] || 0) + 1; });
      return counts;
    },
  });

  const { data: auditLogs } = useQuery({
    queryKey: ["sig-audit", auditOpen],
    enabled: !!auditOpen,
    queryFn: async () => {
      const { data } = await supabase
        .from("signature_audit_log")
        .select("*, profiles(full_name)")
        .eq("signature_request_id", auditOpen!)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  const { data: signedDoc } = useQuery({
    queryKey: ["signed-doc-detail", auditOpen],
    enabled: !!auditOpen,
    queryFn: async () => {
      const { data } = await supabase.from("signed_documents").select("*").eq("signature_request_id", auditOpen!).maybeSingle();
      return data;
    },
  });

  const voidMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("signature_requests").update({ status: "voided" }).eq("id", id);
      await supabase.from("signature_audit_log").insert({ signature_request_id: id, action: "voided" as any });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["signature-requests"] }); toast.success("Request voided"); },
  });

  // Reset a locked-out signing session: clear failed verifications, set status
  // back to "pending", and copy a fresh link to clipboard so the admin can
  // re-share it with the signer.
  const resetMutation = useMutation({
    mutationFn: async (r: any) => {
      await supabase.from("signature_verifications").delete().eq("signature_request_id", r.id);
      await supabase.from("signature_requests").update({
        status: "pending",
        viewed_at: null,
      }).eq("id", r.id);
      await supabase.from("signature_audit_log").insert({
        signature_request_id: r.id,
        action: "request_created" as any,
        actor_id: user?.id,
        metadata: { type: "reset_after_lockout" },
      });
      return `${window.location.origin}/sign/${r.id}?token=${(r as any).signer_token}`;
    },
    onSuccess: async (link) => {
      try { await navigator.clipboard.writeText(link); } catch {}
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
      toast.success("Reset complete — fresh link copied to clipboard");
    },
    onError: (e: any) => toast.error(e?.message || "Could not reset"),
  });

  // Summary stats
  const stats = useMemo(() => {
    if (!requests) return { awaiting: 0, viewedUnsigned: 0, expiringSoon: 0 };
    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    return {
      awaiting: requests.filter(r => r.status === "pending" || r.status === "viewed" || r.status === "identity_verified").length,
      viewedUnsigned: requests.filter(r => r.status === "viewed" && r.viewed_at && (now - new Date(r.viewed_at).getTime()) > fortyEightHours).length,
      expiringSoon: requests.filter(r => {
        if (r.status === "signed" || r.status === "declined" || r.status === "voided" || r.status === "expired") return false;
        if (!r.expires_at) return false;
        const timeLeft = new Date(r.expires_at).getTime() - now;
        return timeLeft > 0 && timeLeft < fortyEightHours;
      }).length,
    };
  }, [requests]);

  // Bulk resend reminders
  const resendRemindersMutation = useMutation({
    mutationFn: async () => {
      if (!requests) return;
      const now = Date.now();
      const fortyEightHours = 48 * 60 * 60 * 1000;
      const targets = requests.filter(r =>
        r.status === "viewed" && r.viewed_at && (now - new Date(r.viewed_at).getTime()) > fortyEightHours
      );

      let count = 0;
      for (const r of targets) {
        const email = (r.providers as any)?.contact_email;
        if (!email) continue;
        const { data: prof } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
        if (!prof) continue;

        await supabase.from("notifications").insert({
          user_id: prof.id,
          title: "Reminder: Document awaiting your signature",
          message: `You viewed a document but haven't signed it yet. Please complete your signature.`,
          type: "warning",
          link: `/sign/${r.id}?token=${(r as any).signer_token}`,
        });
        count++;
      }
      return count;
    },
    onSuccess: (count) => {
      toast.success(`Sent reminders to ${count || 0} provider(s)`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!requests) return [];
    let list = [...requests];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r => r.providers?.business_name?.toLowerCase().includes(s));
    }
    if (statusFilter === "expiring_soon") {
      const now = Date.now();
      const fortyEightHours = 48 * 60 * 60 * 1000;
      list = list.filter(r => {
        if (r.status === "signed" || r.status === "declined" || r.status === "voided" || r.status === "expired") return false;
        if (!r.expires_at) return false;
        const timeLeft = new Date(r.expires_at).getTime() - now;
        return timeLeft > 0 && timeLeft < fortyEightHours;
      });
    }
    return list;
  }, [requests, search, statusFilter]);

  const auditRequest = auditOpen ? requests?.find(r => r.id === auditOpen) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">E-Signatures</h1>
        <p className="text-muted-foreground">Manage signature requests and view audit trails</p>
      </div>

      {/* Summary Row */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Awaiting Signature:</span>
              <span className="text-lg font-bold">{stats.awaiting}</span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Viewed but Unsigned:</span>
              <span className="text-lg font-bold text-warning">{stats.viewedUnsigned}</span>
            </div>
            <Separator orientation="vertical" className="h-6" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Expiring Soon (&lt;48h):</span>
              <span className="text-lg font-bold text-destructive">{stats.expiringSoon}</span>
            </div>
            <div className="ml-auto flex gap-2">
              {stats.expiringSoon > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!requests) return;
                    const expired = requests.filter(r => r.status === "pending" || r.status === "viewed").filter(r => r.expires_at && new Date(r.expires_at).getTime() < Date.now());
                    let count = 0;
                    for (const r of expired) {
                      await supabase.from("signature_requests").update({ status: "voided" }).eq("id", r.id);
                      await supabase.from("signature_audit_log").insert({ signature_request_id: r.id, action: "voided" as any });
                      count++;
                    }
                    if (count > 0) {
                      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
                      toast.success(`Voided ${count} expired request(s)`);
                    } else {
                      toast.info("No expired requests to void");
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Void Expired
                </Button>
              )}
              {stats.viewedUnsigned > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resendRemindersMutation.mutate()}
                  disabled={resendRemindersMutation.isPending}
                >
                  <Bell className="h-3.5 w-3.5 mr-1" />
                  {resendRemindersMutation.isPending ? "Sending..." : `Resend Reminders (${stats.viewedUnsigned})`}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="list">Signature Requests</TabsTrigger>
          <TabsTrigger value="counter_sign"><PenTool className="h-3.5 w-3.5 mr-1" />Awaiting My Signature</TabsTrigger>
          <TabsTrigger value="pipeline"><LayoutGrid className="h-3.5 w-3.5 mr-1" />Document Pipeline</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4 mt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {["pending", "viewed", "signed", "declined", "expired"].map(s => (
              <Card key={s}>
                <CardContent className="p-4 text-center">
                  <p className="text-2xl font-bold">{requests?.filter(r => r.status === s).length || 0}</p>
                  <p className="text-xs text-muted-foreground capitalize">{s}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-4 flex gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by provider..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {["pending", "viewed", "identity_verified", "signed", "declined", "expired", "voided"].map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                  <SelectItem value="expiring_soon">
                    <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Expiring Soon</span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Signed</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : filtered.length > 0 ? filtered.map(r => {
                    const pdId = (r as any).provider_document_id;
                    const pd = pdId && providerDocsMap ? providerDocsMap[pdId] : null;
                    const docTemplate = pd?.document_templates;
                    const pkg = pd?.service_packages;
                    const totalDocs = pd ? (providerDocCounts?.[r.provider_id] || 0) : 0;

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.providers?.business_name || "—"}</TableCell>
                        <TableCell>
                          {docTemplate ? (
                            <div>
                              <span className="text-sm">{docTemplate.name}</span>
                              <Badge className="ml-1 text-[10px] capitalize">{docTemplate.document_type}</Badge>
                            </div>
                          ) : (
                            <span className="capitalize text-sm">{r.contracts?.contract_type || "—"}</span>
                          )}
                        </TableCell>
                        <TableCell>{pkg ? <Badge variant="outline" className="text-[10px]">{pkg.name}</Badge> : "—"}</TableCell>
                        <TableCell>{pd?.signing_order ? `${pd.signing_order} of ${totalDocs}` : "—"}</TableCell>
                        <TableCell><Badge className={`capitalize ${statusColors[r.status]}`}>{r.status.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-sm">{r.sent_at ? new Date(r.sent_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-sm">{r.signed_at ? new Date(r.signed_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-sm">{r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setAuditOpen(r.id)}><Eye className="h-3.5 w-3.5" /></Button>
                            {(r.status === "pending" || r.status === "viewed") && (
                              <>
                                <Button variant="ghost" size="sm" title="Open signing link" asChild>
                                  <a
                                    href={`${window.location.origin}/sign/${r.id}?token=${(r as any).signer_token}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <LinkIcon className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                                <Button variant="ghost" size="sm" title="Reset / unlock — clears failed verifications and copies a fresh link" onClick={() => resetMutation.mutate(r)}><RotateCcw className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" title="Void this request" onClick={() => voidMutation.mutate(r.id)}><XCircle className="h-3.5 w-3.5 text-destructive" /></Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }) : (
                    <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No signature requests found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <PaginationControls
                page={page}
                pageSize={PAGE_SIZE}
                total={totalRequests}
                onPrev={() => setPage(p => Math.max(0, p - 1))}
                onNext={() => setPage(p => p + 1)}
                onFirst={() => setPage(0)}
                onLast={() => setPage(Math.ceil(totalRequests / PAGE_SIZE) - 1)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="counter_sign" className="mt-4">
          <AwaitingCounterSignTab />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-4">
          <DocumentPipelineKanban />
        </TabsContent>
      </Tabs>

      {/* Audit Trail Dialog */}
      <Dialog open={!!auditOpen} onOpenChange={() => setAuditOpen(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Trail — {auditRequest?.providers?.business_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {signedDoc && (
              <Card className="border-success/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-success" />
                    <span className="font-semibold">Signed Document</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Signer:</span> {(signedDoc.certificate_data as any)?.signer_name}</div>
                    <div><span className="text-muted-foreground">Signed:</span> {signedDoc.created_at ? new Date(signedDoc.created_at).toLocaleString() : "—"}</div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Document Hash</p>
                    <p className="font-mono text-xs bg-muted rounded p-2 break-all">{(signedDoc.certificate_data as any)?.document_hash}</p>
                  </div>
                </CardContent>
              </Card>
            )}
            <Separator />
            <h3 className="font-semibold">Event Log</h3>
            <div className="space-y-3">
              {auditLogs?.map(log => (
                <div key={log.id} className="flex gap-3 items-start">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div>
                    <p className="text-sm font-medium capitalize">{(log.action as string).replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground">
                      {log.profiles?.full_name || "System"} · {new Date(log.created_at).toLocaleString()}
                    </p>
                    {log.ip_address && <p className="text-xs text-muted-foreground">IP: {log.ip_address}</p>}
                  </div>
                </div>
              ))}
              {(!auditLogs || auditLogs.length === 0) && (
                <p className="text-sm text-muted-foreground">No events logged yet.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
