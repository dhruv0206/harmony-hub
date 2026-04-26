import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  open: boolean;
  onClose: () => void;
  event?: any;
}

export function CalendarEventModal({ open, onClose, event }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isEdit = !!event;

  const [form, setForm] = useState({
    title: "",
    event_type: "general",
    start_date: format(new Date(), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "10:00",
    all_day: false,
    location: "",
    meeting_link: "",
    provider_id: "",
    description: "",
    notes: "",
    reminder: "none",
    recurrence: "",
    color: "",
  });

  useEffect(() => {
    if (event) {
      const s = new Date(event.start_time);
      const e = new Date(event.end_time);
      setForm({
        title: event.title || "",
        event_type: event.event_type || "general",
        start_date: format(s, "yyyy-MM-dd"),
        start_time: format(s, "HH:mm"),
        end_time: format(e, "HH:mm"),
        all_day: event.all_day || false,
        location: event.location || "",
        meeting_link: event.meeting_link || "",
        provider_id: event.provider_id || "",
        description: event.description || "",
        notes: event.notes || "",
        reminder: "none",
        recurrence: event.recurrence || "",
        color: event.color || "",
      });
    } else {
      setForm({
        title: "",
        event_type: "general",
        start_date: format(new Date(), "yyyy-MM-dd"),
        start_time: "09:00",
        end_time: "10:00",
        all_day: false,
        location: "",
        meeting_link: "",
        provider_id: "",
        description: "",
        notes: "",
        reminder: "none",
        recurrence: "",
        color: "",
      });
    }
  }, [event, open]);

  const { data: providers } = useQuery({
    queryKey: ["providers-list-calendar"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, business_name").order("business_name");
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error("Title is required.");
      const startTime = new Date(`${form.start_date}T${form.start_time}`);
      const endTime = new Date(`${form.start_date}T${form.end_time}`);
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        throw new Error("Please pick valid start and end times.");
      }
      if (endTime <= startTime) {
        throw new Error("End time must be after start time.");
      }

      const payload: any = {
        title: form.title,
        event_type: form.event_type,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        all_day: form.all_day,
        location: form.location || null,
        meeting_link: form.meeting_link || null,
        provider_id: form.provider_id || null,
        description: form.description || null,
        notes: form.notes || null,
        recurrence: form.recurrence || null,
        color: form.color || null,
        host_id: user!.id,
        created_by: user!.id,
      };

      if (isEdit) {
        const { error } = await supabase.from("calendar_events").update(payload).eq("id", event.id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from("calendar_events").insert(payload).select().single();
        if (error) throw error;

        // Create reminder if set
        if (form.reminder !== "none" && inserted) {
          const reminderMinutes: Record<string, number> = { "15_min": 15, "1_hour": 60, "1_day": 1440 };
          const mins = reminderMinutes[form.reminder];
          if (mins) {
            const remindAt = new Date(startTime.getTime() - mins * 60000);
            await supabase.from("calendar_reminders").insert({
              event_id: inserted.id,
              remind_at: remindAt.toISOString(),
              reminder_type: form.reminder,
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-events"] });
      toast.success(isEdit ? "Event updated" : "Event created");
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const update = (field: string, value: any) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label>Title *</Label>
            <Input maxLength={255} value={form.title} onChange={e => update("title", e.target.value)} placeholder="Event title" />
          </div>

          <div>
            <Label>Event Type</Label>
            <Select value={form.event_type} onValueChange={v => update("event_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="onboarding_call">Onboarding Call</SelectItem>
                <SelectItem value="training_session">Training Session</SelectItem>
                <SelectItem value="follow_up">Follow-up</SelectItem>
                <SelectItem value="check_in">Check-in</SelectItem>
                <SelectItem value="demo">Demo</SelectItem>
                <SelectItem value="review">Review</SelectItem>
                <SelectItem value="general">General</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label>Date *</Label>
              <Input type="date" value={form.start_date} onChange={e => update("start_date", e.target.value)} />
            </div>
            <div>
              <Label>Start Time</Label>
              <Input type="time" value={form.start_time} onChange={e => update("start_time", e.target.value)} disabled={form.all_day} />
            </div>
            <div>
              <Label>End Time</Label>
              <Input type="time" value={form.end_time} onChange={e => update("end_time", e.target.value)} disabled={form.all_day} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.all_day} onCheckedChange={v => update("all_day", v)} />
            <Label>All Day</Label>
          </div>

          <div>
            <Label>Location</Label>
            <Input value={form.location} onChange={e => update("location", e.target.value)} placeholder="Zoom, Phone, Google Meet, or address" />
          </div>

          <div>
            <Label>Meeting Link</Label>
            <Input value={form.meeting_link} onChange={e => update("meeting_link", e.target.value)} placeholder="https://..." />
          </div>

          <div>
            <Label>Provider (optional)</Label>
            <Select value={form.provider_id} onValueChange={v => update("provider_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select provider..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {providers?.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.business_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => update("description", e.target.value)} placeholder="Event details..." />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Reminder</Label>
              <Select value={form.reminder} onValueChange={v => update("reminder", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="15_min">15 minutes before</SelectItem>
                  <SelectItem value="1_hour">1 hour before</SelectItem>
                  <SelectItem value="1_day">1 day before</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recurrence</Label>
              <Select value={form.recurrence || "none"} onValueChange={v => update("recurrence", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.title || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : isEdit ? "Update Event" : "Create Event"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
