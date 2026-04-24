import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Calendar, Clock, MapPin, Link2, User, CheckCircle, XCircle, Edit, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "outline",
  confirmed: "default",
  in_progress: "secondary",
  completed: "default",
  cancelled: "destructive",
  no_show: "destructive",
};

const TYPE_LABELS: Record<string, string> = {
  onboarding_call: "Onboarding Call",
  training_session: "Training Session",
  follow_up: "Follow-up",
  check_in: "Check-in",
  demo: "Demo",
  review: "Review",
  general: "General",
};

interface Props {
  event: any;
  open: boolean;
  onClose: () => void;
  onEdit: (event: any) => void;
}

export function CalendarEventDetailPanel({ event, open, onClose, onEdit }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState("");
  const [showOutcome, setShowOutcome] = useState(false);

  const updateStatus = useMutation({
    mutationFn: async ({ status, outcomeText }: { status: string; outcomeText?: string }) => {
      const updates: any = { status };
      if (outcomeText) updates.outcome = outcomeText;
      const { error } = await supabase
        .from("calendar_events")
        .update(updates)
        .eq("id", event.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-events"] });
      toast.success("Event updated");
      setShowOutcome(false);
      setOutcome("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!event) return null;

  const start = new Date(event.start_time);
  const end = new Date(event.end_time);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-[420px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-xl">{event.title}</SheetTitle>
          <div className="flex gap-2 flex-wrap">
            <Badge variant="secondary">{TYPE_LABELS[event.event_type] || event.event_type}</Badge>
            <Badge variant={STATUS_VARIANTS[event.status] || "outline"} className="capitalize">{event.status?.replace(/_/g, " ")}</Badge>
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          {/* Date & Time */}
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{format(start, "EEEE, MMMM d, yyyy")}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{event.all_day ? "All Day" : `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`}</span>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{event.location}</span>
            </div>
          )}

          {/* Meeting link */}
          {event.meeting_link && (
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              <a href={event.meeting_link} target="_blank" rel="noopener noreferrer" className="text-primary underline truncate">
                Join Meeting
              </a>
            </div>
          )}

          {/* Provider */}
          {(event.providers as any)?.business_name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <button
                className="text-primary underline"
                onClick={() => { onClose(); navigate(`/providers/${event.provider_id}`); }}
              >
                {(event.providers as any).business_name}
              </button>
            </div>
          )}

          {/* Host */}
          {(event.profiles as any)?.full_name && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span>Host: {(event.profiles as any).full_name}</span>
            </div>
          )}

          <Separator />

          {/* Description */}
          {event.description && (
            <div>
              <p className="text-sm font-medium mb-1">Description</p>
              <p className="text-sm text-muted-foreground">{event.description}</p>
            </div>
          )}

          {/* Notes */}
          {event.notes && (
            <div>
              <p className="text-sm font-medium mb-1">Notes</p>
              <p className="text-sm text-muted-foreground">{event.notes}</p>
            </div>
          )}

          {/* Outcome */}
          {event.outcome && (
            <div>
              <p className="text-sm font-medium mb-1">Outcome</p>
              <p className="text-sm text-muted-foreground">{event.outcome}</p>
            </div>
          )}

          <Separator />

          {/* Actions */}
          {event.status !== "completed" && event.status !== "cancelled" && (
            <div className="space-y-2">
              {showOutcome ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="What was the outcome of this event?"
                    value={outcome}
                    onChange={e => setOutcome(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => updateStatus.mutate({ status: "completed", outcomeText: outcome })}>
                      Save & Complete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowOutcome(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="default" onClick={() => setShowOutcome(true)}>
                    <CheckCircle className="h-4 w-4 mr-1" />Mark Completed
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate({ status: "no_show" })}>
                    <AlertTriangle className="h-4 w-4 mr-1" />No-Show
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ status: "cancelled" })}>
                    <XCircle className="h-4 w-4 mr-1" />Cancel
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onEdit(event)}>
                    <Edit className="h-4 w-4 mr-1" />Edit
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
