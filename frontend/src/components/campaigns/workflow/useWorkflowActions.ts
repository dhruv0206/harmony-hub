import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/audit-log";
import type { WorkflowStage } from "./types";

export function useWorkflowActions(leadId: string, campaignId: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
  };

  const updateLead = async (data: Record<string, any>) => {
    const { error } = await supabase
      .from("campaign_leads")
      .update(data as any)
      .eq("id", leadId);
    if (error) throw error;
    invalidate();
  };

  const logActivity = async (
    activityType: string,
    description: string,
    outcome?: string
  ) => {
    await supabase.from("campaign_activities").insert({
      campaign_lead_id: leadId,
      activity_type: activityType as any,
      description,
      outcome,
      performed_by: user?.id,
    });
  };

  const advanceStage = async (
    newStage: WorkflowStage,
    extraData?: Record<string, any>,
    activityDesc?: string
  ) => {
    try {
      await updateLead({ workflow_stage: newStage, ...extraData });
      await logActivity("stage_change", activityDesc || `Advanced to ${newStage}`, newStage);
      logAudit({ action: "lead.stage_changed", entity_type: "lead", entity_id: leadId, details: { new_stage: newStage, campaign_id: campaignId } });
      toast({ title: `Moved to ${newStage.replace(/_/g, " ")}` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const markDead = async (reason: string, currentStage: string, notes?: string) => {
    try {
      await updateLead({
        workflow_stage: "dead",
        dead_reason: reason,
        dead_at_stage: currentStage,
        objection_notes: notes || undefined,
        status: "disqualified" as any,
      });
      await logActivity("marked_dead", `Marked dead: ${reason}`, "dead");
      logAudit({ action: "lead.marked_dead", entity_type: "lead", entity_id: leadId, details: { reason, stage: currentStage } });
      toast({ title: "Lead marked as lost" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const reviveLead = async (previousStage: string) => {
    try {
      await updateLead({
        workflow_stage: previousStage,
        dead_reason: null,
        dead_at_stage: null,
        status: "assigned" as any,
      });
      await logActivity("revived", `Lead revived to ${previousStage}`);
      toast({ title: "Lead revived" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const saveNote = async (noteText: string) => {
    try {
      await updateLead({ notes: noteText });
      await logActivity("note", noteText);
      toast({ title: "Note saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return { updateLead, logActivity, advanceStage, markDead, reviveLead, saveNote, invalidate };
}
