import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, FileText, DollarSign, GraduationCap, Phone,
  Monitor, Rocket, Clock, CheckCircle2,
  Calendar, SkipForward, UserCog, Building2
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import OnboardingStageDocuments from "@/components/onboarding/stages/OnboardingStageDocuments";
import OnboardingStageBilling from "@/components/onboarding/stages/OnboardingStageBilling";
import OnboardingStageTraining from "@/components/onboarding/stages/OnboardingStageTraining";
import OnboardingStageCall from "@/components/onboarding/stages/OnboardingStageCall";
import OnboardingStagePortal from "@/components/onboarding/stages/OnboardingStagePortal";
import OnboardingStageGoLive from "@/components/onboarding/stages/OnboardingStageGoLive";
import LawFirmOnboardingBilling from "@/components/onboarding/stages/LawFirmOnboardingBilling";
import LawFirmOnboardingCall from "@/components/onboarding/stages/LawFirmOnboardingCall";
import LawFirmOnboardingPortal from "@/components/onboarding/stages/LawFirmOnboardingPortal";
import LawFirmOnboardingGoLive from "@/components/onboarding/stages/LawFirmOnboardingGoLive";
import LawFirmOnboardingDocuments from "@/components/onboarding/stages/LawFirmOnboardingDocuments";

const STAGES = [
  { key: "documents", label: "Document Signing", icon: FileText, color: "text-blue-500" },
  { key: "billing_setup", label: "Billing Setup", icon: DollarSign, color: "text-emerald-500" },
  { key: "training", label: "Training Videos", icon: GraduationCap, color: "text-violet-500" },
  { key: "onboarding_call", label: "Onboarding Call", icon: Phone, color: "text-amber-500" },
  { key: "portal_setup", label: "Portal Setup", icon: Monitor, color: "text-cyan-500" },
  { key: "go_live", label: "Go Live", icon: Rocket, color: "text-green-500" },
];

const STAGE_INDEX: Record<string, number> = {};
STAGES.forEach((s, i) => { STAGE_INDEX[s.key] = i; });

export default function OnboardingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignTo, setReassignTo] = useState("");

  useRealtimeSubscription({
    channelName: `onboarding-detail-${id}`,
    table: "onboarding_workflows",
    filter: `id=eq.${id}`,
    queryKeys: [["onboarding-detail", id!]],
    enabled: !!id,
  });

  const { data: workflow } = useQuery({
    queryKey: ["onboarding-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_workflows")
        .select("*, providers(id, business_name, contact_name, contact_email, contact_phone, status), profiles!onboarding_workflows_initiated_by_fkey(full_name, email), specialist:profiles!onboarding_workflows_specialist_id_fkey(id, full_name, email, phone), service_packages(id, name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const isLawFirm = (workflow as any)?.participant_type === "law_firm";
  const lawFirmId = (workflow as any)?.law_firm_id;

  const { data: lawFirm } = useQuery({
    queryKey: ["onboarding-law-firm", lawFirmId],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firms")
        .select("id, firm_name, contact_name, contact_email, contact_phone, status")
        .eq("id", lawFirmId!)
        .single();
      return data;
    },
    enabled: !!lawFirmId,
  });

  const entityId = isLawFirm ? lawFirmId : workflow?.provider_id;
  const entityName = isLawFirm ? lawFirm?.firm_name : (workflow?.providers as any)?.business_name;
  const entityContact = isLawFirm ? lawFirm : (workflow?.providers as any);

  const { data: activityLog } = useQuery({
    queryKey: ["onboarding-activity-log", entityId, isLawFirm],
    queryFn: async () => {
      if (isLawFirm) {
        const { data } = await supabase
          .from("law_firm_activities")
          .select("*, profiles:user_id(full_name)")
          .eq("law_firm_id", entityId!)
          .order("created_at", { ascending: false })
          .limit(50);
        return data ?? [];
      }
      const { data } = await supabase
        .from("activities")
        .select("*, profiles:user_id(full_name)")
        .eq("provider_id", entityId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!entityId,
  });

  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-reassign"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, email");
      return data ?? [];
    },
  });

  const currentStage = (workflow as any)?.onboarding_stage || "documents";
  const currentIdx = STAGE_INDEX[currentStage] ?? 0;
  const isCompleted = (workflow?.status as string) === "completed";
  const specialist = (workflow as any)?.specialist as any;
  const daysIn = workflow ? Math.ceil((Date.now() - new Date(workflow.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const advanceStage = useMutation({
    mutationFn: async (nextStage: string) => {
      await supabase.from("onboarding_workflows").update({ onboarding_stage: nextStage } as any).eq("id", id!);
      if (isLawFirm && entityId) {
        await supabase.from("law_firm_activities").insert({
          law_firm_id: entityId,
          user_id: user?.id,
          activity_type: "stage_change",
          description: `Onboarding advanced to: ${STAGES.find(s => s.key === nextStage)?.label}`,
        });
      } else if (entityId) {
        await supabase.from("activities").insert({
          provider_id: entityId,
          user_id: user?.id,
          activity_type: "status_change" as any,
          description: `Onboarding advanced to: ${STAGES.find(s => s.key === nextStage)?.label}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["onboarding-activity-log"] });
      toast.success("Stage advanced");
    },
  });

  const reassignSpecialist = useMutation({
    mutationFn: async () => {
      await supabase.from("onboarding_workflows").update({ specialist_id: reassignTo } as any).eq("id", id!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-detail", id] });
      setReassignOpen(false);
      toast.success("Specialist reassigned");
    },
  });

  const skipToGoLive = useMutation({
    mutationFn: async () => {
      await supabase.from("onboarding_workflows").update({ onboarding_stage: "go_live" } as any).eq("id", id!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-detail", id] });
      toast.success("Skipped to Go Live");
    },
  });

  if (!workflow) return null;

  const nextStage = currentIdx < STAGES.length - 1 ? STAGES[currentIdx + 1].key : null;

  const renderStageContent = (stageKey: string, active: boolean) => {
    if (isLawFirm) {
      switch (stageKey) {
        case "documents":
          return (
            <LawFirmOnboardingDocuments
              workflowId={id!}
              lawFirmId={entityId!}
              packageId={(workflow as any)?.service_package_id}
              isActive={active}
              onComplete={() => nextStage && advanceStage.mutate(nextStage)}
            />
          );
        case "billing_setup":
          return (
            <LawFirmOnboardingBilling
              workflowId={id!}
              lawFirmId={entityId!}
              lawFirmName={entityName || ""}
              isActive={active}
              onComplete={() => nextStage && advanceStage.mutate(nextStage)}
            />
          );
        case "training":
          return (
            <OnboardingStageTraining
              workflowId={id!}
              providerId={entityId!}
              isActive={active}
              onComplete={() => nextStage && advanceStage.mutate(nextStage)}
            />
          );
        case "onboarding_call":
          return (
            <LawFirmOnboardingCall
              workflowId={id!}
              lawFirmId={entityId!}
              lawFirmName={entityName || ""}
              specialistId={specialist?.id}
              specialistName={specialist?.full_name}
              callChecklist={(workflow as any)?.call_checklist || {}}
              callNotes={(workflow as any)?.call_notes || ""}
              callEventId={(workflow as any)?.call_event_id}
              isActive={active}
              onComplete={() => nextStage && advanceStage.mutate(nextStage)}
            />
          );
        case "portal_setup":
          return (
            <LawFirmOnboardingPortal
              workflowId={id!}
              lawFirmId={entityId!}
              portalChecklist={(workflow as any)?.portal_checklist || {}}
              isActive={active}
              onComplete={() => nextStage && advanceStage.mutate(nextStage)}
            />
          );
        case "go_live":
          return (
            <LawFirmOnboardingGoLive
              workflowId={id!}
              lawFirmId={entityId!}
              lawFirmName={entityName || ""}
              isActive={active}
            />
          );
      }
    }

    // Provider stages (existing)
    switch (stageKey) {
      case "documents":
        return (
          <OnboardingStageDocuments
            workflowId={id!}
            providerId={workflow.provider_id!}
            packageId={(workflow as any)?.service_package_id}
            isActive={active}
            onComplete={() => nextStage && advanceStage.mutate(nextStage)}
          />
        );
      case "billing_setup":
        return (
          <OnboardingStageBilling
            workflowId={id!}
            providerId={workflow.provider_id!}
            providerName={entityName || ""}
            isActive={active}
            onComplete={() => nextStage && advanceStage.mutate(nextStage)}
          />
        );
      case "training":
        return (
          <OnboardingStageTraining
            workflowId={id!}
            providerId={workflow.provider_id!}
            isActive={active}
            onComplete={() => nextStage && advanceStage.mutate(nextStage)}
          />
        );
      case "onboarding_call":
        return (
          <OnboardingStageCall
            workflowId={id!}
            providerId={workflow.provider_id!}
            providerName={entityName || ""}
            specialistId={specialist?.id}
            specialistName={specialist?.full_name}
            callChecklist={(workflow as any)?.call_checklist || {}}
            callNotes={(workflow as any)?.call_notes || ""}
            callEventId={(workflow as any)?.call_event_id}
            isActive={active}
            onComplete={() => nextStage && advanceStage.mutate(nextStage)}
          />
        );
      case "portal_setup":
        return (
          <OnboardingStagePortal
            workflowId={id!}
            providerId={workflow.provider_id!}
            portalChecklist={(workflow as any)?.portal_checklist || {}}
            isActive={active}
            onComplete={() => nextStage && advanceStage.mutate(nextStage)}
          />
        );
      case "go_live":
        return (
          <OnboardingStageGoLive
            workflowId={id!}
            providerId={workflow.provider_id!}
            providerName={entityName || ""}
            isActive={active}
          />
        );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate("/onboarding")} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" />Back to Onboarding
      </Button>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            {isLawFirm && <Building2 className="h-6 w-6 text-muted-foreground" />}
            <h1 className="text-3xl font-bold">{entityName}</h1>
            <Badge className={`capitalize ${isCompleted ? "bg-green-500/10 text-green-600" : "bg-primary/10 text-primary"}`}>
              {isCompleted ? "Completed" : currentStage.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {isLawFirm ? "Law Firm" : "Provider"}
            </Badge>
            {(workflow as any)?.service_packages?.name && (
              <Badge variant="secondary">{(workflow as any).service_packages.name}</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            {specialist && (
              <div className="flex items-center gap-1.5">
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[8px]">
                    {specialist.full_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <span>{specialist.full_name}</span>
              </div>
            )}
            <span className={`flex items-center gap-1 ${daysIn > 14 ? "text-destructive" : ""}`}>
              <Clock className="h-3.5 w-3.5" />{daysIn} days
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(`/calendar`)}>
            <Calendar className="h-4 w-4 mr-1" />Schedule Call
          </Button>
          <Button variant="outline" size="sm" onClick={() => skipToGoLive.mutate()}>
            <SkipForward className="h-4 w-4 mr-1" />Skip to Go-Live
          </Button>
        </div>
      </div>

      {/* Stage Progress Bar */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            {STAGES.map((stage, i) => {
              const done = i < currentIdx || isCompleted;
              const active = i === currentIdx && !isCompleted;
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                      done ? "bg-green-500 border-green-500 text-white" :
                      active ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/20" :
                      "border-muted bg-muted text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <span className={`text-[10px] mt-1.5 text-center leading-tight max-w-[70px] ${
                      done ? "text-green-600 font-medium" : active ? "text-primary font-semibold" : "text-muted-foreground"
                    }`}>{stage.label}</span>
                  </div>
                  {i < STAGES.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 ${done ? "bg-green-500" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main Content: Stages + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
        {/* Left: Stages */}
        <div className="lg:col-span-7 space-y-3">
          {STAGES.map((stage, i) => {
            const done = i < currentIdx || isCompleted;
            const active = i === currentIdx && !isCompleted;
            const Icon = stage.icon;

            return (
              <Card key={stage.key} className={`transition-all ${
                active ? "ring-2 ring-primary/30 border-primary/50" :
                done ? "border-green-500/30" : "opacity-60"
              }`}>
                <CardHeader className={`py-3 cursor-pointer ${done ? "bg-green-50 dark:bg-green-950/20" : active ? "bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      done ? "bg-green-500 text-white" :
                      active ? "bg-primary text-primary-foreground" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <div className="flex-1">
                      <CardTitle className="text-sm">{stage.label}</CardTitle>
                    </div>
                    {done && <Badge className="bg-green-500/10 text-green-600 text-[10px]">Complete</Badge>}
                    {active && <Badge className="bg-primary/10 text-primary text-[10px]">In Progress</Badge>}
                  </div>
                </CardHeader>
                {(active || done) && (
                  <CardContent className="pt-4">
                    {renderStageContent(stage.key, active)}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Right: Sidebar */}
        <div className="lg:col-span-3 space-y-4">
          {/* Entity Info */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{isLawFirm ? "Law Firm Info" : "Provider Info"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {entityContact?.contact_name && <p><span className="text-muted-foreground">Contact:</span> {entityContact.contact_name}</p>}
              {entityContact?.contact_email && (
                <p><a href={`mailto:${entityContact.contact_email}`} className="text-primary hover:underline">{entityContact.contact_email}</a></p>
              )}
              {entityContact?.contact_phone && (
                <p><a href={`tel:${entityContact.contact_phone}`} className="text-primary hover:underline">{entityContact.contact_phone}</a></p>
              )}
            </CardContent>
          </Card>

          {/* Specialist */}
          <Card>
            <CardHeader className="py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Specialist</CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setReassignOpen(true)}>
                  <UserCog className="h-3 w-3 mr-1" />Reassign
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {specialist ? (
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {specialist.full_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{specialist.full_name}</p>
                    <p className="text-xs text-muted-foreground">{specialist.email}</p>
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground">Not assigned</p>}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <div className="px-4 pb-4 space-y-3">
                  {activityLog?.map((act: any) => (
                    <div key={act.id} className="flex gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
                      <div>
                        <p className="text-xs">{act.description}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(act.created_at), { addSuffix: true })}
                          {act.profiles?.full_name && ` · ${act.profiles.full_name}`}
                        </p>
                      </div>
                    </div>
                  ))}
                  {(!activityLog || activityLog.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reassign Dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reassign Specialist</DialogTitle></DialogHeader>
          <Select value={reassignTo} onValueChange={setReassignTo}>
            <SelectTrigger><SelectValue placeholder="Select team member" /></SelectTrigger>
            <SelectContent>
              {teamMembers?.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.full_name || m.email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => reassignSpecialist.mutate()} disabled={!reassignTo}>Reassign</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
