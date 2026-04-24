import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, SkipForward } from "lucide-react";
import { useWorkflowActions } from "./useWorkflowActions";

interface Props {
  lead: any;
  campaignId: string;
}

export default function StageSendTerms({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const scraped = lead.scraped_leads;
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(scraped?.email || "");
  const [saving, setSaving] = useState(false);

  const handleSend = async () => {
    setSaving(true);
    await actions.updateLead({
      workflow_stage: "terms_review",
      term_sheet_sent_at: new Date().toISOString(),
    });
    await actions.logActivity("term_sheet_sent", `Term sheet sent to ${email || 'provider'}`, "sent");
    await actions.logActivity("stage_change", "Advanced to terms review", "terms_review");
    setSaving(false);
  };

  const handleSkip = async () => {
    setSaving(true);
    await actions.updateLead({ workflow_stage: "send_contracts" });
    await actions.logActivity("stage_change", "Skipped term sheet — sending contracts directly", "send_contracts");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Send Term Sheet to {scraped?.business_name}</h3>

      <Card className="bg-muted/30">
        <CardContent className="pt-3 pb-3 space-y-1 text-sm">
          {lead.deal_type_interest && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Package</span>
              <Badge variant="secondary">{lead.deal_type_interest}</Badge>
            </div>
          )}
          {lead.qualification_category && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Category</span>
              <span>{lead.qualification_category.replace("cat_", "Category ")}</span>
            </div>
          )}
          {lead.qualification_locations > 1 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Locations</span>
              <span>{lead.qualification_locations}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <Label className="text-sm">Email</Label>
          <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="provider@email.com" className="mt-1" />
        </div>
        <div>
          <Label className="text-sm">Personal Message (optional)</Label>
          <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Hi, here's a summary of what we discussed..." rows={3} className="mt-1" />
        </div>
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={handleSend} disabled={saving}>
          <Send className="h-4 w-4 mr-1" /> Send Term Sheet
        </Button>
        <Button variant="outline" onClick={handleSkip} disabled={saving}>
          <SkipForward className="h-4 w-4 mr-1" /> Skip → Contracts
        </Button>
      </div>
    </div>
  );
}
