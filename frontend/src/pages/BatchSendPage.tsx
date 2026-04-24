import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, ArrowRight, FileText, Users, Send, CheckCircle, AlertTriangle, XCircle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4;

interface Recipient {
  id: string;
  name: string;
  email: string | null;
  type: "provider" | "law_firm";
  status: string;
  state: string | null;
  warning?: string;
  alreadyHas?: boolean;
  alreadySigned?: boolean;
}

interface SendResult {
  id: string;
  name: string;
  status: "sent" | "failed" | "skipped";
  reason?: string;
}

export default function BatchSendPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [participantType, setParticipantType] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState(0);
  const [results, setResults] = useState<SendResult[]>([]);

  const { data: templates } = useQuery({
    queryKey: ["batch-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("document_templates").select("id, name, document_type, file_url, version, short_code, participant_type").eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const selectedTemplate = templates?.find(t => t.id === selectedTemplateId);

  const { data: providers } = useQuery({
    queryKey: ["batch-providers"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, business_name, contact_email, status, state").order("business_name");
      return data ?? [];
    },
    enabled: step >= 2,
  });

  const { data: lawFirms } = useQuery({
    queryKey: ["batch-law-firms"],
    queryFn: async () => {
      const { data } = await (supabase.from("law_firms" as any).select("id, firm_name, contact_email, status, state").order("firm_name") as any);
      return (data ?? []) as any[];
    },
    enabled: step >= 2,
  });

  const { data: existingProviderDocs } = useQuery({
    queryKey: ["batch-existing-provider-docs", selectedTemplateId],
    queryFn: async () => {
      const { data } = await supabase.from("provider_documents").select("provider_id, status").eq("template_id", selectedTemplateId);
      return data ?? [];
    },
    enabled: !!selectedTemplateId && step >= 2,
  });

  const { data: existingLfDocs } = useQuery({
    queryKey: ["batch-existing-lf-docs", selectedTemplateId],
    queryFn: async () => {
      const { data } = await (supabase.from("law_firm_documents" as any).select("law_firm_id, status").eq("template_id", selectedTemplateId) as any);
      return (data ?? []) as any[];
    },
    enabled: !!selectedTemplateId && step >= 2,
  });

  const allRecipients = useMemo(() => {
    const list: Recipient[] = [];
    if (participantType !== "law_firm") {
      (providers ?? []).forEach(p => {
        const existing = existingProviderDocs?.find(d => d.provider_id === p.id);
        list.push({
          id: p.id, name: p.business_name, email: p.contact_email, type: "provider",
          status: p.status, state: p.state,
          warning: !p.contact_email ? "Missing email" : undefined,
          alreadyHas: !!existing && existing.status !== "voided",
          alreadySigned: existing?.status === "signed" || existing?.status === "fully_executed",
        });
      });
    }
    if (participantType !== "provider") {
      (lawFirms ?? []).forEach((f: any) => {
        const existing = existingLfDocs?.find((d: any) => d.law_firm_id === f.id);
        list.push({
          id: f.id, name: f.firm_name, email: f.contact_email, type: "law_firm",
          status: f.status, state: f.state,
          warning: !f.contact_email ? "Missing email" : undefined,
          alreadyHas: !!existing && existing.status !== "voided",
          alreadySigned: existing?.status === "signed" || existing?.status === "fully_executed",
        });
      });
    }
    return list;
  }, [providers, lawFirms, participantType, existingProviderDocs, existingLfDocs]);

  const filteredRecipients = useMemo(() => {
    let list = allRecipients;
    if (statusFilter !== "all") list = list.filter(r => r.status === statusFilter);
    if (stateFilter !== "all") list = list.filter(r => r.state === stateFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(s));
    }
    return list;
  }, [allRecipients, statusFilter, stateFilter, search]);

  const uniqueStates = useMemo(() => [...new Set(allRecipients.map(r => r.state).filter(Boolean))].sort() as string[], [allRecipients]);

  const selectedRecipients = allRecipients.filter(r => selectedIds.has(`${r.type}-${r.id}`));
  const warnings = selectedRecipients.filter(r => r.warning);
  const alreadyHave = selectedRecipients.filter(r => r.alreadyHas && !r.alreadySigned);
  const alreadySigned = selectedRecipients.filter(r => r.alreadySigned);

  const toggleRecipient = (r: Recipient) => {
    const key = `${r.type}-${r.id}`;
    setSelectedIds(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredRecipients.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredRecipients.map(r => `${r.type}-${r.id}`)));
  };

  const handleSend = async () => {
    if (!selectedTemplate?.file_url || !user) return;
    setSending(true);
    const newResults: SendResult[] = [];
    const total = selectedRecipients.length;

    for (let i = 0; i < selectedRecipients.length; i++) {
      const r = selectedRecipients[i];
      setSendProgress(Math.round(((i + 1) / total) * 100));

      if (!r.email) {
        newResults.push({ id: r.id, name: r.name, status: "failed", reason: "Missing email" });
        continue;
      }
      if (r.alreadySigned) {
        newResults.push({ id: r.id, name: r.name, status: "skipped", reason: "Already signed" });
        continue;
      }

      try {
        const now = new Date().toISOString();
        const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + 14);

        if (r.type === "provider") {
          await supabase.from("provider_documents").update({ is_current_version: false }).eq("provider_id", r.id).eq("template_id", selectedTemplateId);
          const { data: provDoc } = await supabase.from("provider_documents").insert({
            provider_id: r.id, template_id: selectedTemplateId, status: "sent", sent_at: now,
            template_version: selectedTemplate.version || 1, is_current_version: true, file_url: selectedTemplate.file_url,
          }).select("id").single();
          if (!provDoc) throw new Error("Failed to create document");

          const { data: sigReq } = await supabase.from("signature_requests").insert({
            contract_id: selectedTemplateId, provider_id: r.id, requested_by: user.id,
            expires_at: expiresAt.toISOString(), provider_document_id: provDoc.id,
          } as any).select().single();

          if (sigReq) {
            await supabase.from("provider_documents").update({ signature_request_id: sigReq.id }).eq("id", provDoc.id);
            const { data: prof } = await supabase.from("profiles").select("id").eq("email", r.email).maybeSingle();
            if (prof) {
              await supabase.from("notifications").insert({ user_id: prof.id, title: `Action Required: Sign "${selectedTemplate.name}"`, message: `Please review and sign: ${selectedTemplate.name}.`, type: "warning", link: `/sign/${sigReq.id}` });
            }
          }
        } else {
          await (supabase.from("law_firm_documents" as any).update({ is_current_version: false }).eq("law_firm_id", r.id).eq("template_id", selectedTemplateId) as any);
          await (supabase.from("law_firm_documents" as any).insert({
            law_firm_id: r.id, template_id: selectedTemplateId, status: "sent", sent_at: now,
            template_version: selectedTemplate.version || 1, is_current_version: true, file_url: selectedTemplate.file_url,
          }) as any);
        }

        newResults.push({ id: r.id, name: r.name, status: "sent" });
      } catch (err: any) {
        newResults.push({ id: r.id, name: r.name, status: "failed", reason: err.message });
      }
    }

    setResults(newResults);
    setSending(false);
    setStep(4);
    toast.success(`Batch send complete: ${newResults.filter(r => r.status === "sent").length} sent`);
  };

  const sentCount = results.filter(r => r.status === "sent").length;
  const failedCount = results.filter(r => r.status === "failed").length;
  const skippedCount = results.filter(r => r.status === "skipped").length;

  const stepLabels = ["Select Template", "Select Recipients", "Preview & Confirm", "Results"];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
          <h1 className="text-2xl font-semibold">Batch Document Send</h1>
          <p className="text-sm text-muted-foreground">Send a document template to multiple recipients at once</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step >= s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{s}</div>
            <span className={`text-sm hidden md:inline ${step >= s ? "text-foreground font-medium" : "text-muted-foreground"}`}>{stepLabels[s - 1]}</span>
            {s < 4 && <div className={`w-8 h-0.5 ${step > s ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Select Document Template</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {templates?.map(t => (
                <div
                  key={t.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${selectedTemplateId === t.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"}`}
                  onClick={() => setSelectedTemplateId(t.id)}
                >
                  <div className="flex items-start justify-between">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <Badge variant="secondary" className="text-[10px]">v{t.version}</Badge>
                  </div>
                  <h3 className="font-medium mt-2">{t.name}</h3>
                  <div className="flex gap-1.5 mt-1.5">
                    <Badge variant="outline" className="text-[10px]">{t.document_type}</Badge>
                    <Badge variant="outline" className="text-[10px]">{t.participant_type}</Badge>
                  </div>
                  {!t.file_url && <p className="text-xs text-destructive mt-1">⚠ No file uploaded</p>}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!selectedTemplateId || !selectedTemplate?.file_url}>
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Select Recipients</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Select value={participantType} onValueChange={setParticipantType}>
                <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="provider">Providers</SelectItem>
                  <SelectItem value="law_firm">Law Firms</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="contracted">Contracted</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                </SelectContent>
              </Select>
              <Select value={stateFilter} onValueChange={setStateFilter}>
                <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All States</SelectItem>
                  {uniqueStates.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8 h-9 text-sm" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox checked={filteredRecipients.length > 0 && selectedIds.size === filteredRecipients.length} onCheckedChange={toggleAll} />
              <span>Select all ({filteredRecipients.length})</span>
              {selectedIds.size > 0 && <Badge variant="secondary">{selectedIds.size} selected</Badge>}
            </div>

            <ScrollArea className="h-[400px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Doc Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecipients.map(r => {
                    const key = `${r.type}-${r.id}`;
                    return (
                      <TableRow key={key} className={r.warning ? "bg-destructive/5" : ""}>
                        <TableCell><Checkbox checked={selectedIds.has(key)} onCheckedChange={() => toggleRecipient(r)} /></TableCell>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{r.type === "provider" ? "Provider" : "Law Firm"}</Badge></TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px] capitalize">{r.status?.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-sm">{r.state || "—"}</TableCell>
                        <TableCell className="text-sm">{r.email || <span className="text-destructive text-xs">Missing</span>}</TableCell>
                        <TableCell>
                          {r.alreadySigned ? <Badge className="bg-green-500/10 text-green-700 dark:text-green-400 text-[10px]">Signed</Badge>
                            : r.alreadyHas ? <Badge className="bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[10px]">Has Doc</Badge>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
              <Button onClick={() => setStep(3)} disabled={selectedIds.size === 0}>
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Preview & Confirm</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card><CardContent className="pt-4 text-center"><FileText className="h-8 w-8 mx-auto text-primary" /><p className="font-medium mt-2">{selectedTemplate?.name}</p><Badge variant="secondary" className="mt-1">v{selectedTemplate?.version}</Badge></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><Users className="h-8 w-8 mx-auto text-primary" /><p className="text-2xl font-bold mt-2">{selectedRecipients.length}</p><p className="text-xs text-muted-foreground">Recipients</p></CardContent></Card>
              <Card><CardContent className="pt-4 text-center"><Send className="h-8 w-8 mx-auto text-primary" /><p className="text-2xl font-bold mt-2">{selectedRecipients.length - warnings.length - alreadySigned.length}</p><p className="text-xs text-muted-foreground">Will Send</p></CardContent></Card>
            </div>

            {warnings.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" />{warnings.length} recipient(s) with issues</div>
                <ul className="mt-1.5 space-y-0.5">
                  {warnings.slice(0, 5).map(w => <li key={w.id} className="text-xs text-destructive">{w.name}: {w.warning}</li>)}
                  {warnings.length > 5 && <li className="text-xs text-muted-foreground">...and {warnings.length - 5} more</li>}
                </ul>
              </div>
            )}

            {alreadySigned.length > 0 && (
              <div className="bg-muted border rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CheckCircle className="h-4 w-4" />{alreadySigned.length} will be skipped (already signed)</div>
              </div>
            )}

            {alreadyHave.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400"><FileText className="h-4 w-4" />{alreadyHave.length} already have this document (will be re-sent as update)</div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="h-4 w-4 mr-1.5" />Back</Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Sending...</> : <><Send className="h-4 w-4 mr-1.5" />Send to {selectedRecipients.length - alreadySigned.length} Recipients</>}
              </Button>
            </div>

            {sending && (
              <div className="space-y-2">
                <Progress value={sendProgress} className="h-2" />
                <p className="text-sm text-muted-foreground text-center">{sendProgress}% complete</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Send Complete</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-green-500/30"><CardContent className="pt-4 text-center"><CheckCircle className="h-8 w-8 mx-auto text-green-600 dark:text-green-400" /><p className="text-2xl font-bold mt-2 text-green-600 dark:text-green-400">{sentCount}</p><p className="text-xs text-muted-foreground">Sent</p></CardContent></Card>
              <Card className="border-destructive/30"><CardContent className="pt-4 text-center"><XCircle className="h-8 w-8 mx-auto text-destructive" /><p className="text-2xl font-bold mt-2 text-destructive">{failedCount}</p><p className="text-xs text-muted-foreground">Failed</p></CardContent></Card>
              <Card className="border-muted"><CardContent className="pt-4 text-center"><AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground" /><p className="text-2xl font-bold mt-2 text-muted-foreground">{skippedCount}</p><p className="text-xs text-muted-foreground">Skipped</p></CardContent></Card>
            </div>

            <ScrollArea className="h-[300px] rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        {r.status === "sent" && <Badge className="bg-green-500/10 text-green-700 dark:text-green-400">Sent</Badge>}
                        {r.status === "failed" && <Badge className="bg-destructive/10 text-destructive">Failed</Badge>}
                        {r.status === "skipped" && <Badge variant="secondary">Skipped</Badge>}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.reason || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Contracts</Button>
              <Button onClick={() => { setStep(1); setSelectedTemplateId(""); setSelectedIds(new Set()); setResults([]); setSendProgress(0); }}>Send Another Batch</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
