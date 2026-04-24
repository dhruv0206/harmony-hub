import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CalendarEventModal } from "@/components/calendar/CalendarEventModal";
import { CheckCircle2, Phone, Calendar, Clock, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const CHECKLIST_ITEMS = [
  { key: "portal_walkthrough", label: "Walked through provider portal dashboard" },
  { key: "documents_review", label: "Showed how to view and sign documents" },
  { key: "billing_explained", label: "Explained billing and subscription" },
  { key: "support_system", label: "Showed support ticket system" },
  { key: "ai_review", label: "Showed AI contract review tool" },
  { key: "questions_answered", label: "Answered provider questions" },
  { key: "provider_comfortable", label: "Provider confirmed they are comfortable with the platform" },
];

interface Props {
  workflowId: string;
  providerId: string;
  providerName: string;
  specialistId?: string;
  specialistName?: string;
  callChecklist: Record<string, boolean>;
  callNotes: string;
  callEventId?: string;
  isActive: boolean;
  onComplete: () => void;
}

export default function OnboardingStageCall({
  workflowId, providerId, providerName, specialistId, specialistName,
  callChecklist, callNotes, callEventId, isActive, onComplete,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(callChecklist);
  const [notes, setNotes] = useState(callNotes);

  const { data: callEvent } = useQuery({
    queryKey: ["onboarding-call-event", callEventId],
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("id", callEventId!)
        .single();
      return data;
    },
    enabled: !!callEventId,
  });

  // Also check for call events linked by provider
  const { data: providerCallEvent } = useQuery({
    queryKey: ["provider-call-event", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("*")
        .eq("provider_id", providerId)
        .eq("event_type", "onboarding_call")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !callEventId,
  });

  const event = callEvent || providerCallEvent;
  const callStatus = event ? (event.status ?? "scheduled") : "not_scheduled";
  const isCompleted = callStatus === "completed";

  const checkedCount = Object.values(checklist).filter(Boolean).length;
  const canComplete = isCompleted && checkedCount >= 4;

  const saveChecklist = useMutation({
    mutationFn: async () => {
      await supabase.from("onboarding_workflows").update({
        call_checklist: checklist,
        call_notes: notes,
        call_event_id: event?.id || null,
      } as any).eq("id", workflowId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-detail"] });
      toast.success("Checklist saved");
    },
  });

  const handleEventCreated = () => {
    setShowCalendarModal(false);
    queryClient.invalidateQueries({ queryKey: ["provider-call-event", providerId] });
    toast.success("Onboarding call scheduled!");
  };

  return (
    <div className="space-y-4">
      {/* Call Status */}
      {callStatus === "not_scheduled" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No onboarding call scheduled yet.</p>
          <div className="flex gap-2">
            <Button onClick={() => setShowCalendarModal(true)}>
              <Calendar className="h-4 w-4 mr-2" />Schedule Onboarding Call
            </Button>
            <Button variant="outline" onClick={async () => {
              // Find the provider's user ID via their email
              const { data: prov } = await supabase.from("providers").select("contact_email").eq("id", providerId).single();
              if (!prov?.contact_email) { toast.error("No provider email found"); return; }
              const { data: prof } = await supabase.from("profiles").select("id").eq("email", prov.contact_email).maybeSingle();
              if (!prof?.id) { toast.error("Provider has no portal account yet"); return; }
              await supabase.from("notifications").insert({
                user_id: prof.id,
                title: "Schedule your onboarding call",
                message: "Your onboarding specialist is ready! Click here to pick a time that works for you.",
                type: "onboarding",
                link: `/book/onboarding/${workflowId}`,
              });
              toast.success("Self-scheduling link sent to provider!");
            }}>
              <ExternalLink className="h-4 w-4 mr-2" />Let Provider Self-Schedule
            </Button>
          </div>
        </div>
      )}

      {event && !isCompleted && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Call Scheduled</span>
            <Badge variant="outline" className="text-[10px]">{format(new Date(event.start_time), "MMM d, yyyy h:mm a")}</Badge>
          </div>
          {event.meeting_link && (
            <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
              <ExternalLink className="h-3 w-3" />Join Meeting
            </a>
          )}
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => setShowCalendarModal(true)}>Reschedule</Button>
          </div>
        </div>
      )}

      {isCompleted && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-500/30 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            Call completed{event?.start_time ? ` on ${format(new Date(event.start_time), "MMM d")}` : ""}
          </span>
        </div>
      )}

      {/* Checklist */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Onboarding Call Checklist</Label>
        {CHECKLIST_ITEMS.map(item => (
          <div key={item.key} className="flex items-center gap-2 p-2 rounded border">
            <Checkbox
              checked={!!checklist[item.key]}
              onCheckedChange={(checked) => setChecklist({ ...checklist, [item.key]: !!checked })}
            />
            <span className="text-sm">{item.label}</span>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground">{checkedCount}/7 items checked (minimum 4 required)</p>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-sm">Call Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes from the onboarding call..." rows={3} />
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => saveChecklist.mutate()}>Save Checklist</Button>
        {isActive && canComplete && (
          <Button size="sm" onClick={() => { saveChecklist.mutate(); onComplete(); }}>
            Continue to Portal Setup →
          </Button>
        )}
      </div>

      {showCalendarModal && (
        <CalendarEventModal
          open={showCalendarModal}
          onClose={handleEventCreated}
          event={{
            title: `Onboarding Call — ${providerName}`,
            event_type: "onboarding_call",
            provider_id: providerId,
            host_id: specialistId || user?.id || "",
            start_time: new Date().toISOString(),
            end_time: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          }}
        />
      )}
    </div>
  );
}
