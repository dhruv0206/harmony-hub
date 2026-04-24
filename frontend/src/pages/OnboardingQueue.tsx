import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus, Search, FileText, DollarSign, GraduationCap, Phone,
  Monitor, Rocket, ChevronRight, AlertTriangle, Clock, CheckCircle2,
  Users, Timer, FileSignature, UserPlus, Building2
} from "lucide-react";
import { toast } from "sonner";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import { formatDistanceToNow } from "date-fns";

const STAGES = [
  { key: "documents", label: "Docs", icon: FileText, color: "text-blue-500" },
  { key: "billing_setup", label: "Billing", icon: DollarSign, color: "text-emerald-500" },
  { key: "training", label: "Training", icon: GraduationCap, color: "text-violet-500" },
  { key: "onboarding_call", label: "Call", icon: Phone, color: "text-amber-500" },
  { key: "portal_setup", label: "Portal", icon: Monitor, color: "text-cyan-500" },
  { key: "go_live", label: "Go Live", icon: Rocket, color: "text-green-500" },
];

const STAGE_INDEX: Record<string, number> = {};
STAGES.forEach((s, i) => { STAGE_INDEX[s.key] = i; });

export default function OnboardingQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [participantFilter, setParticipantFilter] = useState<"all" | "provider" | "law_firm">("all");
  const [initOpen, setInitOpen] = useState(false);
  const [initType, setInitType] = useState<"provider" | "law_firm">("provider");
  const [selectedProvider, setSelectedProvider] = useState("");
  const [selectedLawFirm, setSelectedLawFirm] = useState("");
  const [selectedPackage, setSelectedPackage] = useState("");
  const [selectedSpecialist, setSelectedSpecialist] = useState("");

  useRealtimeSubscription({
    channelName: "onboarding-workflows-realtime",
    table: "onboarding_workflows",
    queryKeys: [["onboarding-queue"]],
  });

  const { data: workflows, isLoading } = useQuery({
    queryKey: ["onboarding-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_workflows")
        .select("*, providers(id, business_name, contact_name, contact_email), profiles!onboarding_workflows_initiated_by_fkey(full_name), specialist:profiles!onboarding_workflows_specialist_id_fkey(full_name), service_packages(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Fetch law firm names for law_firm workflows
      const lawFirmIds = (data ?? []).filter(w => (w as any).law_firm_id).map(w => (w as any).law_firm_id);
      let lawFirmMap: Record<string, any> = {};
      if (lawFirmIds.length > 0) {
        const { data: firms } = await supabase.from("law_firms").select("id, firm_name, contact_name, contact_email").in("id", lawFirmIds);
        firms?.forEach(f => { lawFirmMap[f.id] = f; });
      }
      return (data ?? []).map(w => ({ ...w, _lawFirm: (w as any).law_firm_id ? lawFirmMap[(w as any).law_firm_id] : null }));
    },
  });

  const { data: allProviderDocs } = useQuery({
    queryKey: ["onboarding-provider-docs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("id, provider_id, status")
        .neq("status", "voided");
      return data ?? [];
    },
  });

  const { data: allLawFirmDocs } = useQuery({
    queryKey: ["onboarding-law-firm-docs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firm_documents")
        .select("id, law_firm_id, status");
      return data ?? [];
    },
  });

  const { data: trainingVideos } = useQuery({
    queryKey: ["training-videos"],
    queryFn: async () => {
      const { data } = await supabase.from("training_videos").select("id, target_audience").eq("is_required", true).eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: calendarEvents } = useQuery({
    queryKey: ["onboarding-call-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("id, provider_id, status, start_time")
        .eq("event_type", "onboarding_call");
      return data ?? [];
    },
  });

  const { data: activities } = useQuery({
    queryKey: ["onboarding-last-activities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("activities")
        .select("provider_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
  });

  const { data: providers } = useQuery({
    queryKey: ["providers-for-onboarding-init"],
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, business_name, status")
        .in("status", ["prospect", "contracted", "in_negotiation"])
        .order("business_name");
      return data ?? [];
    },
  });

  const { data: lawFirms } = useQuery({
    queryKey: ["law-firms-for-onboarding-init"],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firms")
        .select("id, firm_name, status")
        .in("status", ["prospect", "contracted", "in_negotiation"])
        .order("firm_name");
      return data ?? [];
    },
  });

  const { data: packages } = useQuery({
    queryKey: ["service-packages-list"],
    queryFn: async () => {
      const { data } = await supabase.from("service_packages").select("id, name, participant_type").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });

  // Compute doc summary per provider
  const docSummary = useMemo(() => {
    const map: Record<string, { total: number; signed: number }> = {};
    allProviderDocs?.forEach(d => {
      if (!map[d.provider_id]) map[d.provider_id] = { total: 0, signed: 0 };
      map[d.provider_id].total++;
      if (d.status === "signed" || d.status === "fully_executed") map[d.provider_id].signed++;
    });
    return map;
  }, [allProviderDocs]);

  const lawFirmDocSummary = useMemo(() => {
    const map: Record<string, { total: number; signed: number }> = {};
    allLawFirmDocs?.forEach(d => {
      if (!map[d.law_firm_id]) map[d.law_firm_id] = { total: 0, signed: 0 };
      map[d.law_firm_id].total++;
      if (d.status === "signed" || d.status === "fully_executed") map[d.law_firm_id].signed++;
    });
    return map;
  }, [allLawFirmDocs]);

  // Call events per provider
  const callByProvider = useMemo(() => {
    const map: Record<string, { status: string; start_time: string }> = {};
    calendarEvents?.forEach(e => {
      if (e.provider_id) map[e.provider_id] = { status: e.status ?? "scheduled", start_time: e.start_time };
    });
    return map;
  }, [calendarEvents]);

  // Last activity per provider
  const lastActivityByProvider = useMemo(() => {
    const map: Record<string, string> = {};
    activities?.forEach(a => {
      if (a.provider_id && !map[a.provider_id]) map[a.provider_id] = a.created_at;
    });
    return map;
  }, [activities]);

  const enriched = useMemo(() => {
    if (!workflows) return [];
    const now = Date.now();
    const providerVideoCount = trainingVideos?.filter(v => (v as any).target_audience === 'providers' || (v as any).target_audience === 'both').length ?? 0;
    const lawFirmVideoCount = trainingVideos?.filter(v => (v as any).target_audience === 'law_firms' || (v as any).target_audience === 'both').length ?? 0;

    return workflows.map(wf => {
      const pType = (wf as any).participant_type || "provider";
      const isLF = pType === "law_firm";
      const entityId = isLF ? (wf as any).law_firm_id : (wf.providers as any)?.id;
      const entityName = isLF ? (wf as any)._lawFirm?.firm_name : (wf.providers as any)?.business_name;
      const docs = isLF ? (entityId ? lawFirmDocSummary[entityId] : null) : (entityId ? docSummary[entityId] : null);
      const totalVideos = isLF ? lawFirmVideoCount : providerVideoCount;
      const call = !isLF && entityId ? callByProvider[entityId] : null;
      const lastAct = !isLF && entityId ? lastActivityByProvider[entityId] : null;
      const daysIn = Math.ceil((now - new Date(wf.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const hoursSinceActivity = lastAct
        ? (now - new Date(lastAct).getTime()) / (1000 * 60 * 60)
        : (now - new Date(wf.created_at).getTime()) / (1000 * 60 * 60);
      const isStalled = (wf.status as string) !== "completed" && hoursSinceActivity > 120;
      const stage = (wf as any).onboarding_stage || "documents";
      const stageIdx = STAGE_INDEX[stage] ?? 0;

      let currentStep = "";
      if (stage === "documents") {
        currentStep = docs ? `${docs.signed}/${docs.total} documents signed` : "Awaiting documents";
      } else if (stage === "billing_setup") {
        currentStep = "Setting up billing";
      } else if (stage === "training") {
        currentStep = "Watching training videos";
      } else if (stage === "onboarding_call") {
        currentStep = call ? (call.status === "completed" ? "Call completed" : "Call scheduled") : "Call not scheduled";
      } else if (stage === "portal_setup") {
        currentStep = "Verifying portal access";
      } else if (stage === "go_live") {
        currentStep = "Ready for activation";
      }

      return {
        ...wf,
        participantType: pType,
        entityId,
        entityName,
        docs,
        totalVideos,
        call,
        lastActivity: lastAct,
        daysIn,
        isStalled,
        stage,
        stageIdx,
        currentStep,
      };
    });
  }, [workflows, docSummary, lawFirmDocSummary, callByProvider, lastActivityByProvider, trainingVideos]);

  // Stats
  const stats = useMemo(() => {
    const active = enriched.filter(w => (w.status as string) !== "completed");
    const totalDays = enriched.filter(w => (w.status as string) === "completed").map(w => w.daysIn);
    const avgDays = totalDays.length > 0 ? Math.round(totalDays.reduce((a, b) => a + b, 0) / totalDays.length) : 0;
    return {
      active: active.length,
      avgDays,
      waitingDocs: active.filter(w => w.stage === "documents").length,
      waitingTraining: active.filter(w => w.stage === "training").length,
      readyGoLive: active.filter(w => w.stage === "go_live").length,
      stalled: active.filter(w => w.isStalled).length,
    };
  }, [enriched]);

  // Filter
  const filtered = useMemo(() => {
    return enriched.filter(wf => {
      if (participantFilter !== "all" && wf.participantType !== participantFilter) return false;
      if (tab === "active" && ((wf.status as string) === "completed" || wf.isStalled)) return false;
      if (tab === "completed" && (wf.status as string) !== "completed") return false;
      if (tab === "stalled" && !wf.isStalled) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = (wf.entityName || "").toLowerCase();
        if (!name.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, tab, search, participantFilter]);

  // Exclude already onboarded entities
  const availableProviders = useMemo(() => {
    const onboardedIds = new Set(workflows?.filter(w => (w as any).participant_type !== "law_firm").map(w => (w.providers as any)?.id).filter(Boolean));
    return providers?.filter(p => !onboardedIds.has(p.id)) ?? [];
  }, [providers, workflows]);

  const availableLawFirms = useMemo(() => {
    const onboardedIds = new Set(workflows?.filter(w => (w as any).participant_type === "law_firm").map(w => (w as any).law_firm_id).filter(Boolean));
    return lawFirms?.filter(f => !onboardedIds.has(f.id)) ?? [];
  }, [lawFirms, workflows]);

  const filteredPackages = useMemo(() => {
    return packages?.filter(p => (p as any).participant_type === initType) ?? [];
  }, [packages, initType]);

  const initWorkflow = useMutation({
    mutationFn: async () => {
      const isLF = initType === "law_firm";
      const entityId = isLF ? selectedLawFirm : selectedProvider;
      if (!entityId) throw new Error(`Select a ${isLF ? "law firm" : "provider"}`);

      const insertData: any = {
        participant_type: initType,
        initiated_by: user?.id,
        total_steps: 6,
        status: "in_progress",
        started_at: new Date().toISOString(),
        onboarding_stage: "documents",
        specialist_id: selectedSpecialist || user?.id || null,
        service_package_id: selectedPackage || null,
      };

      if (isLF) {
        insertData.law_firm_id = entityId;
        // provider_id is nullable now but supabase type expects it – set a dummy or null
        insertData.provider_id = null;
      } else {
        insertData.provider_id = entityId;
      }

      const { data: wf, error } = await supabase
        .from("onboarding_workflows")
        .insert(insertData)
        .select()
        .single();
      if (error) throw error;

      // Create training progress records
      const audience = isLF ? "law_firms" : "providers";
      const { data: videos } = await supabase
        .from("training_videos")
        .select("id")
        .eq("is_required", true)
        .eq("is_active", true)
        .in("target_audience", [audience, "both"]);

      if (videos && videos.length > 0) {
        await supabase.from("provider_training_progress").insert(
          videos.map(v => ({
            workflow_id: wf.id,
            provider_id: entityId, // reuse column for tracking
            video_id: v.id,
          }))
        );
      }

      if (!isLF) {
        await supabase.from("activities").insert({
          provider_id: entityId,
          user_id: user?.id,
          activity_type: "status_change" as any,
          description: "Onboarding workflow started",
        });
      } else {
        await supabase.from("law_firm_activities").insert({
          law_firm_id: entityId,
          user_id: user?.id,
          activity_type: "status_change",
          description: "Onboarding workflow started",
        });
      }

      return wf;
    },
    onSuccess: (wf) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-queue"] });
      toast.success("Onboarding started!");
      setInitOpen(false);
      setSelectedProvider("");
      setSelectedLawFirm("");
      setSelectedPackage("");
      setSelectedSpecialist("");
      navigate(`/onboarding/${wf.id}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Onboarding Command Center</h1>
          <p className="text-muted-foreground">Manage provider and law firm onboarding from documents to go-live</p>
        </div>
        <Button onClick={() => setInitOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />Start Onboarding
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatMini icon={Users} label="Active" value={stats.active} color="text-primary" />
        <StatMini icon={Timer} label="Avg Days" value={`${stats.avgDays}d`} color="text-muted-foreground" />
        <StatMini icon={FileSignature} label="Waiting Docs" value={stats.waitingDocs} color="text-blue-500" />
        <StatMini icon={GraduationCap} label="Waiting Training" value={stats.waitingTraining} color="text-violet-500" />
        <StatMini icon={Rocket} label="Ready Go-Live" value={stats.readyGoLive} color="text-green-500" />
        <StatMini icon={AlertTriangle} label="Stalled" value={stats.stalled} color="text-destructive" />
      </div>

      {/* Participant Type Toggle + Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Tabs value={participantFilter} onValueChange={v => setParticipantFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="provider">Providers</TabsTrigger>
            <TabsTrigger value="law_firm">Law Firms</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="stalled">Stalled</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-9" />
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Package</TableHead>
                <TableHead className="min-w-[260px]">Onboarding Stage</TableHead>
                <TableHead>Current Step</TableHead>
                <TableHead>Docs</TableHead>
                <TableHead>Call</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Specialist</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(wf => (
                <TableRow
                  key={wf.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/onboarding/${wf.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{wf.entityName || "Unknown"}</span>
                      {wf.isStalled && (
                        <Badge className="bg-destructive/10 text-destructive text-[10px] px-1.5">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />Stalled
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {wf.participantType === "law_firm" ? "Law Firm" : "Provider"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(wf as any).service_packages?.name ? (
                      <Badge variant="secondary" className="text-[10px]">{(wf as any).service_packages.name}</Badge>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <StagePipeline currentStage={wf.stage} isCompleted={(wf.status as string) === "completed"} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">{wf.currentStep}</TableCell>
                  <TableCell>
                    {wf.docs && wf.docs.total > 0 ? (
                      <div className="flex items-center gap-1.5">
                        <Progress value={(wf.docs.signed / wf.docs.total) * 100} className="h-1.5 w-10" />
                        <span className="text-[10px] text-muted-foreground">{wf.docs.signed}/{wf.docs.total}</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {wf.call ? (
                      <Badge variant="outline" className={`text-[10px] capitalize ${wf.call.status === "completed" ? "text-green-600 border-green-600" : "text-amber-500 border-amber-500"}`}>
                        {wf.call.status === "completed" ? "Done" : "Scheduled"}
                      </Badge>
                    ) : <span className="text-[10px] text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className={`text-sm font-medium ${wf.daysIn > 14 ? "text-destructive" : "text-muted-foreground"}`}>
                      {wf.daysIn}d
                    </span>
                  </TableCell>
                  <TableCell>
                    {(wf as any).specialist?.full_name ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-[8px]">
                            {((wf as any).specialist.full_name as string).split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs truncate max-w-[80px]">{(wf as any).specialist.full_name}</span>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {wf.lastActivity ? formatDistanceToNow(new Date(wf.lastActivity), { addSuffix: true }) : "—"}
                  </TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              ))}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No onboarding workflows found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Init Dialog */}
      <Dialog open={initOpen} onOpenChange={setInitOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Start New Onboarding</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Participant Type</Label>
              <Tabs value={initType} onValueChange={v => { setInitType(v as any); setSelectedProvider(""); setSelectedLawFirm(""); setSelectedPackage(""); }}>
                <TabsList className="w-full">
                  <TabsTrigger value="provider" className="flex-1">Provider</TabsTrigger>
                  <TabsTrigger value="law_firm" className="flex-1">Law Firm</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {initType === "provider" ? (
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                  <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
                  <SelectContent>
                    {availableProviders.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.business_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Law Firm</Label>
                <Select value={selectedLawFirm} onValueChange={setSelectedLawFirm}>
                  <SelectTrigger><SelectValue placeholder="Select law firm" /></SelectTrigger>
                  <SelectContent>
                    {availableLawFirms.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.firm_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Service Package (optional)</Label>
              <Select value={selectedPackage} onValueChange={setSelectedPackage}>
                <SelectTrigger><SelectValue placeholder="Select package" /></SelectTrigger>
                <SelectContent>
                  {filteredPackages.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Onboarding Specialist</Label>
              <Select value={selectedSpecialist} onValueChange={setSelectedSpecialist}>
                <SelectTrigger><SelectValue placeholder="Select specialist" /></SelectTrigger>
                <SelectContent>
                  {teamMembers?.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => initWorkflow.mutate()}
              disabled={initWorkflow.isPending || (initType === "provider" ? !selectedProvider : !selectedLawFirm)}
            >
              {initWorkflow.isPending ? "Starting..." : `Start ${initType === "law_firm" ? "Law Firm" : "Provider"} Onboarding`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatMini({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg bg-muted flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xl font-bold leading-none">{value}</p>
          <p className="text-[11px] text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StagePipeline({ currentStage, isCompleted }: { currentStage: string; isCompleted: boolean }) {
  const currentIdx = isCompleted ? STAGES.length : (STAGE_INDEX[currentStage] ?? 0);
  return (
    <div className="flex items-center gap-0.5">
      {STAGES.map((stage, i) => {
        const done = i < currentIdx || isCompleted;
        const active = i === currentIdx && !isCompleted;
        return (
          <div key={stage.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                done ? "bg-green-500 text-white" :
                active ? "bg-primary text-primary-foreground ring-2 ring-primary/30" :
                "bg-muted text-muted-foreground"
              }`}>
                {done ? <CheckCircle2 className="h-2.5 w-2.5" /> :
                 active ? <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground animate-pulse" /> :
                 <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />}
              </div>
              <span className={`text-[8px] mt-0.5 leading-none whitespace-nowrap ${
                done ? "text-green-600" : active ? "text-primary font-semibold" : "text-muted-foreground"
              }`}>{stage.label}</span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={`w-3 h-0.5 mx-0.5 ${done ? "bg-green-500" : "bg-muted"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
