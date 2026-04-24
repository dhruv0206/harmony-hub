import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ThumbsDown, ArrowRight, Clock } from "lucide-react";
import { addDays } from "date-fns";
import { useWorkflowActions } from "./useWorkflowActions";

const CATEGORIES = [
  { value: "cat_1", label: "Cat 1 — Surgical/Procedural" },
  { value: "cat_2", label: "Cat 2 — Interventional/Diagnostic" },
  { value: "cat_3", label: "Cat 3 — Primary Treatment/Chiro/PT" },
  { value: "cat_4", label: "Cat 4 — Ancillary/Support" },
];

const OBJECTION_REASONS = [
  "Too expensive",
  "Already has a provider network",
  "Not doing PI cases",
  "Bad timing",
  "Other",
];

interface Props {
  lead: any;
  campaignId: string;
}

export default function StageQualification({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const scraped = lead.scraped_leads;
  const [interested, setInterested] = useState<boolean | null>(null);
  const [category, setCategory] = useState(lead.qualification_category || "");
  const [locations, setLocations] = useState(lead.qualification_locations || 1);
  const [interestLevel, setInterestLevel] = useState(lead.interest_level || "");
  const [objectionReason, setObjectionReason] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const canContinue = interested === true && category;

  const handleNotInterested = async () => {
    if (!objectionReason) return;
    setSaving(true);
    await actions.markDead(objectionReason, "qualification", notes);
    setSaving(false);
  };

  const handleContinue = async () => {
    setSaving(true);
    await actions.updateLead({
      workflow_stage: "pitch_deal",
      qualification_category: category,
      qualification_locations: locations,
      interest_level: interestLevel,
      status: "interested",
    });
    await actions.logActivity(
      "qualification",
      `Qualified: ${CATEGORIES.find(c => c.value === category)?.label}, ${locations} location(s), ${interestLevel} interest`,
      "qualified"
    );
    await actions.logActivity("stage_change", "Advanced to pitch & deal selection", "pitch_deal");
    setSaving(false);
  };

  const handleFollowUp = async () => {
    setSaving(true);
    const date = addDays(new Date(), 2);
    await actions.updateLead({
      next_follow_up: date.toISOString(),
      qualification_category: category || undefined,
      qualification_locations: locations,
      interest_level: interestLevel || undefined,
    });
    await actions.logActivity("note", "Scheduled follow-up for qualification callback");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Qualifying {scraped?.business_name}</h3>

      {/* Q1: Interested? */}
      {interested === null && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <Label className="text-sm font-medium">Are they interested in learning more?</Label>
            <div className="flex gap-2">
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => setInterested(true)}>
                Yes, interested
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => setInterested(false)}>
                <ThumbsDown className="h-4 w-4 mr-1" /> Not interested
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Not interested flow */}
      {interested === false && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 space-y-3">
            <Label className="text-sm font-medium text-destructive">Objection Reason</Label>
            <Select value={objectionReason} onValueChange={setObjectionReason}>
              <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
              <SelectContent>
                {OBJECTION_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea placeholder="Additional notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleNotInterested} disabled={!objectionReason || saving}>Mark Dead</Button>
              <Button variant="ghost" size="sm" onClick={() => setInterested(null)}>Go Back</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Interested flow — qualification questions */}
      {interested === true && (
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-4">
              <div>
                <Label className="text-sm">What type of provider are they?</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm">How many locations?</Label>
                <Input type="number" min={1} value={locations} onChange={e => setLocations(parseInt(e.target.value) || 1)} className="mt-1 w-24" />
              </div>

              <div>
                <Label className="text-sm">Interest level</Label>
                <div className="flex gap-2 mt-1">
                  {[
                    { value: "hot", label: "🔥 Hot", desc: "Ready now" },
                    { value: "warm", label: "☀️ Warm", desc: "Needs follow-up" },
                    { value: "cold", label: "❄️ Cold", desc: "Maybe later" },
                  ].map(il => (
                    <Button
                      key={il.value}
                      size="sm"
                      variant={interestLevel === il.value ? "default" : "outline"}
                      onClick={() => setInterestLevel(il.value)}
                      className="flex-1"
                    >
                      {il.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Textarea placeholder="Additional qualification notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={handleContinue}
              disabled={!canContinue || saving}
            >
              Continue to Pitch <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
            <Button variant="outline" onClick={handleFollowUp} disabled={saving}>
              <Clock className="h-4 w-4 mr-1" /> Follow-up
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
