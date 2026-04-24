import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, XCircle, Phone, Clock, AlertTriangle } from "lucide-react";
import { differenceInDays, format } from "date-fns";
import { useWorkflowActions } from "./useWorkflowActions";

interface Props {
  lead: any;
  campaignId: string;
}

export default function StageTermsReview({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const scraped = lead.scraped_leads;
  const [showDecline, setShowDecline] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const sentAt = lead.term_sheet_sent_at ? new Date(lead.term_sheet_sent_at) : null;
  const daysWaiting = sentAt ? differenceInDays(new Date(), sentAt) : 0;

  const handleAccepted = async () => {
    setSaving(true);
    await actions.updateLead({ workflow_stage: "send_contracts" });
    await actions.logActivity("term_sheet_accepted", "Term sheet accepted — sending contracts", "accepted");
    await actions.logActivity("stage_change", "Advanced to send contracts", "send_contracts");
    setSaving(false);
  };

  const handleDeclined = async () => {
    setSaving(true);
    await actions.markDead("Term sheet declined", "terms_review", notes);
    setSaving(false);
  };

  const handleFollowUp = async () => {
    setSaving(true);
    await actions.logActivity("call", `Follow-up call about term sheet${notes ? ': ' + notes : ''}`);
    if (notes) setNotes("");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Waiting for {scraped?.business_name}</h3>

      {sentAt && (
        <Card className="bg-muted/30">
          <CardContent className="pt-3 pb-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sent</span>
              <span>{format(sentAt, "MMM d, yyyy h:mm a")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Days waiting</span>
              <span className="font-medium">{daysWaiting}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {daysWaiting >= 7 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4" /> Follow up urgently — 7+ days since term sheet was sent
        </div>
      )}
      {daysWaiting >= 3 && daysWaiting < 7 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 text-warning text-sm">
          <Clock className="h-4 w-4" /> Consider following up — {daysWaiting} days since sent
        </div>
      )}

      {!showDecline && (
        <div className="grid grid-cols-2 gap-2">
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleAccepted} disabled={saving}>
            <CheckCircle className="h-4 w-4 mr-1" /> Accepted
          </Button>
          <Button variant="outline" className="text-destructive" onClick={() => setShowDecline(true)} disabled={saving}>
            <XCircle className="h-4 w-4 mr-1" /> Declined
          </Button>
          <Button variant="outline" className="col-span-2" onClick={handleFollowUp} disabled={saving}>
            <Phone className="h-4 w-4 mr-1" /> Log Follow-up
          </Button>
        </div>
      )}

      {showDecline && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 space-y-3">
            <Textarea placeholder="Why did they decline?" value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleDeclined} disabled={saving}>Confirm Declined</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowDecline(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Textarea placeholder="Add notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
    </div>
  );
}
