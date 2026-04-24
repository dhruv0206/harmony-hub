import { useState, useMemo, useCallback } from "react";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, Plus, Download, DollarSign, Building2, Briefcase } from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";
import { AIPipelineInsights } from "@/components/ai/AIPipelineInsights";
import LeadCaptureForm from "@/components/pipeline/LeadCaptureForm";
import KanbanColumn from "@/components/pipeline/KanbanColumn";
import KanbanCard from "@/components/pipeline/KanbanCard";
import ClosedLostModal from "@/components/pipeline/ClosedLostModal";
import DealDetailPanel from "@/components/pipeline/DealDetailPanel";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter,
  type DragStartEvent, type DragEndEvent,
} from "@dnd-kit/core";

type PipelineStage = Database["public"]["Enums"]["pipeline_stage"];

const stageLabels: Record<string, string> = {
  lead_identified: "Lead Identified", initial_contact: "Initial Contact", discovery: "Discovery",
  proposal_sent: "Proposal Sent", negotiation: "Negotiation", closed_won: "Closed Won", closed_lost: "Closed Lost",
};

const stageColors: Record<string, string> = {
  lead_identified: "border-t-muted-foreground", initial_contact: "border-t-primary", discovery: "border-t-primary",
  proposal_sent: "border-t-warning", negotiation: "border-t-warning", closed_won: "border-t-success", closed_lost: "border-t-destructive",
};

const LF_STAGES = ["lead_identified", "initial_contact", "discovery", "proposal_sent", "negotiation", "closed_won", "closed_lost"] as const;

export default function Pipeline() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pipelineType, setPipelineType] = useState<"providers" | "law_firms">("providers");
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [repFilter, setRepFilter] = useState("all");
  const [dealTypeFilter, setDealTypeFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [activeDeal, setActiveDeal] = useState<any>(null);
  const [closedLostPending, setClosedLostPending] = useState<{ dealId: string; dealName: string } | null>(null);

  const isMobileView = useIsMobile();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Provider pipeline
  const { data: deals } = useQuery({
    queryKey: ["pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_pipeline")
        .select("*, providers(business_name, contact_email, contact_phone, service_package_id), profiles(full_name, avatar_url), deal_types(name, color)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: pipelineType === "providers",
  });

  // Law firm pipeline
  const { data: lfDeals } = useQuery({
    queryKey: ["lf-pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("law_firm_pipeline")
        .select("*, law_firms(firm_name, contact_email, contact_phone, firm_size, practice_areas), profiles:sales_rep_id(full_name, avatar_url)")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: pipelineType === "law_firms",
  });

  const { data: subscriptions } = useQuery({
    queryKey: ["pipeline-subscriptions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("provider_id, monthly_amount, status")
        .in("status", ["active", "trial", "pending"]);
      return data ?? [];
    },
    enabled: pipelineType === "providers",
  });

  const { data: lfSubscriptions } = useQuery({
    queryKey: ["lf-pipeline-subscriptions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firm_subscriptions")
        .select("law_firm_id, monthly_amount, status")
        .in("status", ["active", "pending"]);
      return data ?? [];
    },
    enabled: pipelineType === "law_firms",
  });

  const { data: reps } = useQuery({
    queryKey: ["sales_reps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, profiles(full_name)").in("role", ["sales_rep", "admin"]);
      if (error) throw error;
      return data;
    },
  });

  useRealtimeSubscription({ channelName: "pipeline-realtime", table: "sales_pipeline", queryKeys: [["pipeline"]] });
  useRealtimeSubscription({ channelName: "lf-pipeline-realtime", table: "law_firm_pipeline", queryKeys: [["lf-pipeline"]] });

  const { data: dealTypes } = useQuery({
    queryKey: ["deal_types"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => { const { data, error } = await supabase.from("deal_types").select("*"); if (error) throw error; return data; },
  });

  // Provider stage mutation
  const stageMutation = useMutation({
    mutationFn: async ({ dealId, newStage, lossReason }: { dealId: string; newStage: PipelineStage; lossReason?: string }) => {
      const updateData: any = { stage: newStage };
      if (lossReason) updateData.notes = lossReason;
      const { error } = await supabase.from("sales_pipeline").update(updateData).eq("id", dealId);
      if (error) throw error;
      const deal = deals?.find(d => d.id === dealId);
      if (deal) {
        if (newStage === "closed_won") {
          await supabase.from("providers").update({ status: "active" as any }).eq("id", deal.provider_id);
        }
        const desc = newStage === "closed_lost" && lossReason ? `Pipeline stage changed to Closed Lost — Reason: ${lossReason}` : `Pipeline stage changed to ${stageLabels[newStage]}`;
        await supabase.from("activities").insert({ activity_type: "status_change", description: desc, provider_id: deal.provider_id, user_id: user?.id });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["pipeline"] }); queryClient.invalidateQueries({ queryKey: ["providers-list"] }); toast.success("Stage updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Law firm stage mutation
  const lfStageMutation = useMutation({
    mutationFn: async ({ dealId, newStage, lossReason }: { dealId: string; newStage: string; lossReason?: string }) => {
      const updateData: any = { stage: newStage };
      if (lossReason) updateData.notes = lossReason;
      const { error } = await supabase.from("law_firm_pipeline").update(updateData).eq("id", dealId);
      if (error) throw error;
      const deal = lfDeals?.find(d => d.id === dealId);
      if (deal) {
        if (newStage === "closed_won") {
          await supabase.from("law_firms").update({ status: "active" }).eq("id", deal.law_firm_id);
        }
        await supabase.from("law_firm_activities").insert({
          activity_type: "stage_change",
          description: newStage === "closed_lost" && lossReason ? `Pipeline: Closed Lost — ${lossReason}` : `Pipeline: ${stageLabels[newStage]}`,
          law_firm_id: deal.law_firm_id,
          user_id: user?.id,
        });
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["lf-pipeline"] }); toast.success("Stage updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  // Normalize deals for display
  const normalizedDeals = useMemo(() => {
    if (pipelineType === "providers") {
      if (!deals) return [];
      let list = [...deals];
      if (repFilter !== "all") list = list.filter(d => d.sales_rep_id === repFilter);
      if (dealTypeFilter !== "all") list = list.filter(d => d.deal_type_id === dealTypeFilter);
      return list.map(d => {
        const sub = subscriptions?.find(s => s.provider_id === d.provider_id);
        const monthlyFee = sub ? Number(sub.monthly_amount) : null;
        return {
          ...d,
          _displayName: d.providers?.business_name || "Unknown",
          _repName: d.profiles?.full_name,
          _repInitial: d.profiles?.full_name?.charAt(0) || "?",
          estimated_monthly_fee: monthlyFee,
          estimated_value: d.estimated_value || (monthlyFee ? monthlyFee * 12 : null),
          _type: "provider" as const,
          _badges: d.deal_types ? [{ label: (d.deal_types as any).name, color: (d.deal_types as any).color }] : [],
        };
      });
    } else {
      if (!lfDeals) return [];
      let list = [...lfDeals];
      if (repFilter !== "all") list = list.filter(d => d.sales_rep_id === repFilter);
      return list.map(d => {
        const sub = lfSubscriptions?.find(s => s.law_firm_id === d.law_firm_id);
        const monthlyFee = sub ? Number(sub.monthly_amount) : null;
        const firmSize = (d.law_firms as any)?.firm_size;
        const practiceAreas = (d.law_firms as any)?.practice_areas as string[] | null;
        const badges: { label: string; color?: string }[] = [];
        if (firmSize) badges.push({ label: firmSize.replace("_", " ") });
        practiceAreas?.slice(0, 2).forEach(pa => badges.push({ label: pa.replace("_", " ") }));
        return {
          ...d,
          _displayName: (d.law_firms as any)?.firm_name || "Unknown",
          _repName: (d.profiles as any)?.full_name,
          _repInitial: (d.profiles as any)?.full_name?.charAt(0) || "?",
          estimated_monthly_fee: monthlyFee,
          estimated_value: d.estimated_value || (monthlyFee ? monthlyFee * 12 : null),
          _type: "law_firm" as const,
          _badges: badges,
        };
      });
    }
  }, [pipelineType, deals, lfDeals, repFilter, dealTypeFilter, subscriptions, lfSubscriptions]);

  const currentStages = pipelineType === "providers" ? Constants.public.Enums.pipeline_stage : [...LF_STAGES];
  const totalValue = normalizedDeals.reduce((s, d) => s + Number(d.estimated_value || 0), 0);
  const weightedValue = normalizedDeals.reduce((s, d) => s + (Number(d.estimated_value || 0) * (d.probability || 0)) / 100, 0);
  const wonDeals = normalizedDeals.filter(d => d.stage === "closed_won");
  const lostDeals = normalizedDeals.filter(d => d.stage === "closed_lost");
  const winRate = wonDeals.length + lostDeals.length > 0 ? Math.round((wonDeals.length / (wonDeals.length + lostDeals.length)) * 100) : 0;
  const avgDealSize = normalizedDeals.length > 0 ? Math.round(totalValue / normalizedDeals.length) : 0;
  const projectedMRR = normalizedDeals
    .filter(d => !["closed_won", "closed_lost"].includes(d.stage))
    .reduce((s, d) => s + (d.estimated_monthly_fee ?? 0), 0);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const deal = normalizedDeals.find(d => d.id === event.active.id);
    setActiveDeal(deal || null);
  }, [normalizedDeals]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDeal(null);
    if (!over) return;
    const dealId = active.id as string;
    const deal = normalizedDeals.find(d => d.id === dealId);
    if (!deal) return;
    const newStage = over.id as string;
    const targetStage = currentStages.includes(newStage as any) ? newStage : normalizedDeals.find(d => d.id === over.id)?.stage;
    if (!targetStage || deal.stage === targetStage) return;
    if (targetStage === "closed_lost") {
      setClosedLostPending({ dealId, dealName: deal._displayName });
      return;
    }
    if (pipelineType === "providers") {
      stageMutation.mutate({ dealId, newStage: targetStage as PipelineStage });
    } else {
      lfStageMutation.mutate({ dealId, newStage: targetStage });
    }
  }, [normalizedDeals, currentStages, pipelineType, stageMutation, lfStageMutation]);

  const handleClosedLostConfirm = useCallback((reason: string, notes: string) => {
    if (!closedLostPending) return;
    const lossReason = notes ? `${reason} — ${notes}` : reason;
    if (pipelineType === "providers") {
      stageMutation.mutate({ dealId: closedLostPending.dealId, newStage: "closed_lost", lossReason });
    } else {
      lfStageMutation.mutate({ dealId: closedLostPending.dealId, newStage: "closed_lost", lossReason });
    }
    setClosedLostPending(null);
  }, [closedLostPending, pipelineType, stageMutation, lfStageMutation]);

  const openDeal = (deal: any) => { setSelectedDeal(deal); setSheetOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Sales Pipeline</h1>
          <p className="text-muted-foreground text-sm">{isMobileView ? "Tap a deal to view details" : "Drag deals between stages to update progress"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {pipelineType === "providers" && (
            <Dialog open={leadFormOpen} onOpenChange={setLeadFormOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />New Lead</Button></DialogTrigger>
              <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Capture New Lead</DialogTitle></DialogHeader><LeadCaptureForm onSuccess={() => setLeadFormOpen(false)} /></DialogContent>
            </Dialog>
          )}
          <Button variant="outline" size="sm" onClick={() => {
            const headers = [pipelineType === "providers" ? "Provider" : "Firm", "Stage", "Value", "Probability", "Close Date", "Rep"];
            const rows = normalizedDeals.map(d => [d._displayName, stageLabels[d.stage] || d.stage, String(d.estimated_value || 0), String(d.probability || 0), d.expected_close_date || "", d._repName || ""]);
            downloadCSV("pipeline-report.csv", headers, rows); toast.success("Pipeline exported");
          }}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}><Filter className="h-4 w-4 mr-2" />Filters</Button>
        </div>
      </div>

      {/* Pipeline Type Toggle */}
      <Tabs value={pipelineType} onValueChange={(v) => { setPipelineType(v as any); setRepFilter("all"); setDealTypeFilter("all"); }}>
        <TabsList>
          <TabsTrigger value="providers" className="gap-1.5"><Building2 className="h-4 w-4" />Providers</TabsTrigger>
          <TabsTrigger value="law_firms" className="gap-1.5"><Briefcase className="h-4 w-4" />Law Firms</TabsTrigger>
        </TabsList>
      </Tabs>

      {showFilters && (
        <div className="flex gap-3">
          <Select value={repFilter} onValueChange={setRepFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Sales Rep" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Reps</SelectItem>{reps?.map(r => (<SelectItem key={r.user_id} value={r.user_id}>{(r.profiles as any)?.full_name || "Unknown"}</SelectItem>))}</SelectContent>
          </Select>
          {pipelineType === "providers" && (
            <Select value={dealTypeFilter} onValueChange={setDealTypeFilter}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Deal Type" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Deal Types</SelectItem>{dealTypes?.map(d => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}</SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Pipeline</p><p className="text-lg font-bold">${totalValue.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Weighted Value</p><p className="text-lg font-bold">${Math.round(weightedValue).toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Deals</p><p className="text-lg font-bold">{normalizedDeals.length}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Avg Deal Size</p><p className="text-lg font-bold">${avgDealSize.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Win Rate</p><p className="text-lg font-bold">{winRate}%</p></CardContent></Card>
        <Card className="border-l-4 border-l-success">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Projected MRR</p>
            <p className="text-lg font-bold text-success">${projectedMRR.toLocaleString()}/mo</p>
          </CardContent>
        </Card>
      </div>

      {pipelineType === "providers" && <AIPipelineInsights deals={normalizedDeals} totalValue={totalValue} weightedValue={weightedValue} winRate={winRate} />}

      {/* Mobile: accordion list view; Desktop: Kanban */}
      {isMobileView ? (
        <div className="space-y-3">
          {currentStages.map(stage => {
            const stageDeals = normalizedDeals.filter(d => d.stage === stage);
            const stageValue = stageDeals.reduce((s, d) => s + Number(d.estimated_value || 0), 0);
            return (
              <Collapsible key={stage} defaultOpen={stageDeals.length > 0}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-t-4 bg-card p-3 text-left hover:bg-muted/50">
                  <div className={`border-t-0 ${stageColors[stage]}`}>
                    <h3 className="text-sm font-semibold">{stageLabels[stage]}</h3>
                    <p className="text-xs text-muted-foreground">{stageDeals.length} deals · ${stageValue.toLocaleString()}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2 px-1">
                  {stageDeals.map(deal => (
                    <KanbanCard key={deal.id} deal={deal} onClick={() => openDeal(deal)} />
                  ))}
                  {stageDeals.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No deals in this stage</p>}
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {currentStages.map(stage => {
              const stageDeals = normalizedDeals.filter(d => d.stage === stage);
              const stageValue = stageDeals.reduce((s, d) => s + Number(d.estimated_value || 0), 0);
              return (<KanbanColumn key={stage} stage={stage} label={stageLabels[stage]} colorClass={stageColors[stage]} deals={stageDeals} totalValue={stageValue} onDealClick={openDeal} />);
            })}
          </div>
          <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
            {activeDeal ? <KanbanCard deal={activeDeal} onClick={() => {}} overlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      <ClosedLostModal open={!!closedLostPending} onConfirm={handleClosedLostConfirm} onCancel={() => setClosedLostPending(null)} dealName={closedLostPending?.dealName} />

      {pipelineType === "providers" && (
        <DealDetailPanel
          deal={selectedDeal}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onStageChange={(dealId, newStage) => {
            if (newStage === "closed_lost") {
              const deal = deals?.find(d => d.id === dealId);
              setClosedLostPending({ dealId, dealName: deal?.providers?.business_name || "Unknown" });
            } else {
              stageMutation.mutate({ dealId, newStage });
            }
          }}
          dealTypes={dealTypes}
        />
      )}
    </div>
  );
}
