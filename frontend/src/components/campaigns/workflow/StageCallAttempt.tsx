import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, PhoneOff, Voicemail, XCircle, Clock } from "lucide-react";
import { addHours, addDays } from "date-fns";
import { useWorkflowActions } from "./useWorkflowActions";

interface Props {
  lead: any;
  campaignId: string;
}

const DEAD_REASONS = ["Wrong number", "Business closed", "Not a fit", "Do not call"];

export default function StageCallAttempt({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const [notes, setNotes] = useState("");
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [showDead, setShowDead] = useState(false);
  const [deadReason, setDeadReason] = useState("");
  const [saving, setSaving] = useState(false);
  const scraped = lead.scraped_leads;
  const attemptNum = (lead.call_attempts || 0) + 1;

  const handleDisposition = async (disposition: string) => {
    setSaving(true);
    const data: Record<string, any> = {
      call_disposition: disposition,
      call_attempts: attemptNum,
      last_attempt_at: new Date().toISOString(),
    };

    if (disposition === "answered") {
      data.workflow_stage = "qualification";
      data.status = "called";
      await actions.updateLead(data);
      await actions.logActivity("call", `Called — answered (attempt #${attemptNum})${notes ? ': ' + notes : ''}`, "answered");
      if (notes) await actions.logActivity("note", notes);
      await actions.logActivity("stage_change", "Advanced to qualification", "qualification");
    } else {
      data.status = disposition === "no_answer" ? "no_answer" : "called";
      await actions.updateLead(data);
      await actions.logActivity("call", `Called — ${disposition} (attempt #${attemptNum})${notes ? ': ' + notes : ''}`, disposition);
      if (notes) await actions.logActivity("note", notes);
      setShowFollowUp(true);
    }
    actions.invalidate();
    setNotes("");
    setSaving(false);
  };

  const scheduleFollowUp = async (date: Date) => {
    setSaving(true);
    await actions.updateLead({ next_follow_up: date.toISOString() });
    await actions.logActivity("note", `Follow-up scheduled for ${date.toLocaleDateString()}`);
    setShowFollowUp(false);
    setSaving(false);
  };

  const handleDead = async () => {
    if (!deadReason) return;
    setSaving(true);
    await actions.markDead(deadReason, "call_attempt", notes);
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Call {scraped?.business_name}</h3>

      {/* Phone number large */}
      {scraped?.phone && (
        <a href={`tel:${scraped.phone}`} className="block text-2xl font-bold text-primary hover:underline">
          <Phone className="inline h-5 w-5 mr-2" />
          {scraped.phone}
        </a>
      )}

      <p className="text-sm text-muted-foreground">Attempt #{attemptNum}</p>

      {/* Previous notes */}
      {lead.notes && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-medium text-warning mb-1">Previous Notes</p>
            <p className="text-sm">{lead.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      {!showFollowUp && !showDead && (
        <div className="grid grid-cols-2 gap-2">
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleDisposition("answered")} disabled={saving}>
            <Phone className="h-4 w-4 mr-1" /> Answered
          </Button>
          <Button variant="outline" onClick={() => handleDisposition("no_answer")} disabled={saving}>
            <PhoneOff className="h-4 w-4 mr-1" /> No Answer
          </Button>
          <Button variant="outline" onClick={() => handleDisposition("voicemail")} disabled={saving}>
            <Voicemail className="h-4 w-4 mr-1" /> Left Voicemail
          </Button>
          <Button variant="outline" className="text-destructive border-destructive/30" onClick={() => setShowDead(true)} disabled={saving}>
            <XCircle className="h-4 w-4 mr-1" /> Dead Lead
          </Button>
        </div>
      )}

      {/* Follow-up scheduler */}
      {showFollowUp && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Schedule Follow-up</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => scheduleFollowUp(addHours(new Date(), 2))} disabled={saving}>2 Hours</Button>
              <Button size="sm" variant="secondary" onClick={() => scheduleFollowUp(addDays(new Date(), 1))} disabled={saving}>Tomorrow</Button>
              <Button size="sm" variant="secondary" onClick={() => scheduleFollowUp(addDays(new Date(), 3))} disabled={saving}>3 Days</Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowFollowUp(false)}>Cancel</Button>
          </CardContent>
        </Card>
      )}

      {/* Dead lead form */}
      {showDead && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-medium text-destructive">Mark as Dead</p>
            <Select value={deadReason} onValueChange={setDeadReason}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                {DEAD_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleDead} disabled={!deadReason || saving}>Confirm</Button>
              <Button size="sm" variant="ghost" onClick={() => setShowDead(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <div>
        <Textarea placeholder="Add call notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        {notes && (
          <Button size="sm" className="mt-2" onClick={async () => { await actions.saveNote(notes); setNotes(""); }} disabled={saving}>
            Save Note
          </Button>
        )}
      </div>
    </div>
  );
}
