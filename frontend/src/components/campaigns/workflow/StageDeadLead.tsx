import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, XCircle } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useWorkflowActions } from "./useWorkflowActions";
import { WORKFLOW_STAGES } from "./types";

interface Props {
  lead: any;
  campaignId: string;
}

export default function StageDeadLead({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const scraped = lead.scraped_leads;
  const [saving, setSaving] = useState(false);

  const droppedStage = WORKFLOW_STAGES.find(s => s.key === lead.dead_at_stage);

  const handleRevive = async () => {
    setSaving(true);
    await actions.reviveLead(lead.dead_at_stage || "call_attempt");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <XCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
        <h3 className="text-lg font-bold text-destructive">Lead Lost</h3>
        <p className="text-sm text-muted-foreground">{scraped?.business_name}</p>
      </div>

      <Card className="border-destructive/20 bg-destructive/5">
        <CardContent className="pt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Dropped at</span>
            <Badge variant="outline">{droppedStage?.label || lead.dead_at_stage || 'Unknown'}</Badge>
          </div>
          {lead.dead_reason && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reason</span>
              <span>{lead.dead_reason}</span>
            </div>
          )}
          {lead.objection_notes && (
            <div>
              <span className="text-muted-foreground">Notes</span>
              <p className="mt-1">{lead.objection_notes}</p>
            </div>
          )}
          {lead.updated_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{format(new Date(lead.updated_at), "MMM d, yyyy")}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Button className="w-full" variant="outline" onClick={handleRevive} disabled={saving}>
        <RefreshCw className="h-4 w-4 mr-1" /> Revive Lead
      </Button>
    </div>
  );
}
