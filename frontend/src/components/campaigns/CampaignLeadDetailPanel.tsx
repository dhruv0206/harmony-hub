import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone, MapPin, Globe, Mail, Calendar, Clock, MessageSquare,
  ThumbsUp, ThumbsDown, UserPlus, PhoneOff, SkipForward, Star,
  ExternalLink, Building2
} from "lucide-react";
import { format, addDays } from "date-fns";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type CampaignLeadStatus = Database["public"]["Enums"]["campaign_lead_status"];

const statusLabels: Record<string, string> = {
  pending: "Pending", assigned: "Assigned", call_scheduled: "Call Scheduled",
  called: "Called", follow_up: "Follow Up", interested: "Interested",
  not_interested: "Not Interested", no_answer: "No Answer",
  wrong_number: "Wrong Number", converted: "Converted", disqualified: "Disqualified",
};

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  assigned: "bg-primary/10 text-primary",
  call_scheduled: "bg-primary/10 text-primary",
  called: "bg-primary/20 text-primary",
  follow_up: "bg-warning/10 text-warning",
  interested: "bg-success/10 text-success",
  not_interested: "bg-destructive/10 text-destructive",
  no_answer: "bg-muted text-muted-foreground",
  wrong_number: "bg-destructive/10 text-destructive",
  converted: "bg-success/20 text-success",
  disqualified: "bg-destructive/20 text-destructive",
};

const quickFollowUps = [
  { label: "Tomorrow", days: 1 },
  { label: "3 Days", days: 3 },
  { label: "1 Week", days: 7 },
  { label: "2 Weeks", days: 14 },
];

interface CampaignLeadDetailPanelProps {
  lead: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
}

export default function CampaignLeadDetailPanel({ lead, open, onOpenChange, campaignId }: CampaignLeadDetailPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [noteText, setNoteText] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);

  if (!lead) return null;

  const scraped = lead.scraped_leads;
  const statuses = Constants.public.Enums.campaign_lead_status;

  const updateStatus = async (newStatus: CampaignLeadStatus, extraData?: Record<string, any>) => {
    setSaving(true);
    try {
      const updatePayload: any = { status: newStatus, ...extraData };
      if (["called", "no_answer", "follow_up", "interested", "not_interested", "wrong_number"].includes(newStatus)) {
        updatePayload.call_attempts = (lead.call_attempts || 0) + 1;
        updatePayload.last_attempt_at = new Date().toISOString();
      }
      await supabase.from("campaign_leads").update(updatePayload).eq("id", lead.id);

      // Log activity
      await supabase.from("campaign_activities").insert({
        campaign_lead_id: lead.id,
        activity_type: newStatus === "called" || newStatus === "no_answer" ? "call" : "status_change",
        description: `Status changed to ${statusLabels[newStatus]}${noteText ? ` — ${noteText}` : ""}`,
        outcome: newStatus,
        performed_by: user?.id,
      });

      queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
      toast({ title: `Lead updated to ${statusLabels[newStatus]}` });
      setNoteText("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const saveNote = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await supabase.from("campaign_leads").update({ notes: noteText }).eq("id", lead.id);
      await supabase.from("campaign_activities").insert({
        campaign_lead_id: lead.id,
        activity_type: "note",
        description: noteText,
        performed_by: user?.id,
      });
      queryClient.invalidateQueries({ queryKey: ["campaign-leads", campaignId] });
      toast({ title: "Note saved" });
      setNoteText("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const scheduleFollowUp = async (days: number) => {
    const date = addDays(new Date(), days).toISOString();
    await updateStatus("follow_up", { next_follow_up: date });
  };

  const setCustomFollowUp = async () => {
    if (!followUpDate) return;
    await updateStatus("follow_up", { next_follow_up: new Date(followUpDate).toISOString() });
    setFollowUpDate("");
  };

  // Determine workflow stage position
  const stageFlow: CampaignLeadStatus[] = ["pending", "assigned", "call_scheduled", "called", "follow_up", "interested", "converted"];
  const currentStageIndex = stageFlow.indexOf(lead.status);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {scraped?.business_name || "Unknown Lead"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 mt-4">
          {/* Current Status */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Badge className={statusColors[lead.status] || ""}>
              {statusLabels[lead.status] || lead.status}
            </Badge>
            {lead.call_attempts > 0 && (
              <span className="text-xs text-muted-foreground">· {lead.call_attempts} attempt{lead.call_attempts !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Progress Pipeline */}
          <div className="flex gap-1">
            {stageFlow.map((stage, i) => (
              <div
                key={stage}
                className={`h-2 flex-1 rounded-full ${
                  i <= currentStageIndex && currentStageIndex >= 0
                    ? "bg-primary"
                    : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Contact Info */}
          <Card>
            <CardContent className="pt-4 space-y-2">
              {scraped?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <a href={`tel:${scraped.phone}`} className="text-primary hover:underline">{scraped.phone}</a>
                </div>
              )}
              {scraped?.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${scraped.email}`} className="text-primary hover:underline">{scraped.email}</a>
                </div>
              )}
              {(scraped?.city || scraped?.state) && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{[scraped?.address, scraped?.city, scraped?.state].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {scraped?.website && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <a href={scraped.website} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                    Website <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {scraped?.ai_score && (
                <div className="flex items-center gap-2 text-sm">
                  <Star className="h-4 w-4 text-warning" />
                  <span>AI Score: <strong>{scraped.ai_score}</strong></span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Summary */}
          {scraped?.ai_summary && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">AI Summary</p>
              {scraped.ai_summary}
            </div>
          )}

          {/* Existing Notes */}
          {lead.notes && (
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">Notes</p>
              {lead.notes}
            </div>
          )}

          {/* Next Follow-up */}
          {lead.next_follow_up && (
            <div className="flex items-center gap-2 text-sm bg-warning/10 rounded-lg p-3">
              <Calendar className="h-4 w-4 text-warning" />
              <span>Follow-up: <strong>{format(new Date(lead.next_follow_up), "MMM d, yyyy h:mm a")}</strong></span>
            </div>
          )}

          <Separator />

          {/* Quick Actions */}
          <div>
            <p className="text-sm font-medium mb-3">Quick Actions</p>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => updateStatus("called")} disabled={saving}>
                <Phone className="h-4 w-4 mr-1" /> Log Call
              </Button>
              <Button size="sm" variant="outline" onClick={() => updateStatus("no_answer")} disabled={saving}>
                <PhoneOff className="h-4 w-4 mr-1" /> No Answer
              </Button>
              <Button size="sm" variant="outline" className="text-success border-success/30" onClick={() => updateStatus("interested")} disabled={saving}>
                <ThumbsUp className="h-4 w-4 mr-1" /> Interested
              </Button>
              <Button size="sm" variant="outline" className="text-destructive border-destructive/30" onClick={() => updateStatus("not_interested")} disabled={saving}>
                <ThumbsDown className="h-4 w-4 mr-1" /> Not Interested
              </Button>
              <Button size="sm" className="col-span-2 bg-success hover:bg-success/90" onClick={() => updateStatus("converted")} disabled={saving}>
                <UserPlus className="h-4 w-4 mr-1" /> Convert to Provider
              </Button>
            </div>
          </div>

          <Separator />

          {/* Schedule Follow-up */}
          <div>
            <p className="text-sm font-medium mb-2">Schedule Follow-up</p>
            <div className="flex gap-2 flex-wrap mb-2">
              {quickFollowUps.map(q => (
                <Button key={q.days} size="sm" variant="secondary" onClick={() => scheduleFollowUp(q.days)} disabled={saving}>
                  <Clock className="h-3 w-3 mr-1" />{q.label}
                </Button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input type="datetime-local" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} className="flex-1" />
              <Button size="sm" onClick={setCustomFollowUp} disabled={!followUpDate || saving}>Set</Button>
            </div>
          </div>

          <Separator />

          {/* Add Note */}
          <div>
            <Label className="text-sm font-medium">Add Note</Label>
            <Textarea
              placeholder="Enter call notes, observations..."
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="mt-1"
              rows={3}
            />
            <Button size="sm" className="mt-2" onClick={saveNote} disabled={!noteText.trim() || saving}>
              <MessageSquare className="h-4 w-4 mr-1" /> Save Note
            </Button>
          </div>

          <Separator />

          {/* Update Status Directly */}
          <div>
            <Label className="text-sm font-medium">Change Status</Label>
            <Select value={lead.status} onValueChange={(val) => updateStatus(val as CampaignLeadStatus)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statuses.map(s => (
                  <SelectItem key={s} value={s}>{statusLabels[s] || s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
