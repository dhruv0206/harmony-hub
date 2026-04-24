import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Calendar, ChevronLeft, ChevronRight, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  format, addDays, startOfDay, isSameDay, isWeekend, isBefore,
  setHours, setMinutes, addMinutes,
} from "date-fns";

const SLOT_DURATION = 30; // minutes
const DAY_START = 9; // 9 AM
const DAY_END = 17; // 5 PM

export default function BookOnboardingCall() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<Date | null>(null);
  const [booked, setBooked] = useState(false);

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Get workflow + specialist info
  const { data: workflow } = useQuery({
    queryKey: ["book-workflow", workflowId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_workflows")
        .select("*, providers(id, business_name, contact_name), specialist:profiles!onboarding_workflows_specialist_id_fkey(id, full_name, email, avatar_url)")
        .eq("id", workflowId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!workflowId,
  });

  const specialist = (workflow as any)?.specialist as any;
  const provider = (workflow as any)?.providers as any;

  // Get specialist's existing events for next 2 weeks
  const { data: existingEvents } = useQuery({
    queryKey: ["specialist-events", specialist?.id, weekOffset],
    queryFn: async () => {
      const rangeStart = addDays(startOfDay(new Date()), weekOffset * 7);
      const rangeEnd = addDays(rangeStart, 14);
      const { data } = await supabase
        .from("calendar_events")
        .select("start_time, end_time")
        .eq("host_id", specialist.id)
        .gte("start_time", rangeStart.toISOString())
        .lte("start_time", rangeEnd.toISOString())
        .neq("status", "cancelled");
      return data ?? [];
    },
    enabled: !!specialist?.id,
  });

  // Generate available days (next 2 weeks, weekdays only)
  const days = useMemo(() => {
    const today = startOfDay(new Date());
    const result: Date[] = [];
    for (let i = 0; i < 14; i++) {
      const d = addDays(today, i + weekOffset * 7);
      if (!isWeekend(d) && !isBefore(d, today)) {
        result.push(d);
      }
    }
    return result.slice(0, 10); // max 10 weekdays
  }, [weekOffset]);

  // Generate slots for a given day, excluding conflicts
  const getSlotsForDay = (day: Date) => {
    const slots: Date[] = [];
    const now = new Date();
    for (let h = DAY_START; h < DAY_END; h++) {
      for (let m = 0; m < 60; m += SLOT_DURATION) {
        const slot = setMinutes(setHours(day, h), m);
        if (isBefore(slot, now)) continue;
        const slotEnd = addMinutes(slot, SLOT_DURATION);
        // Check conflicts
        const conflict = (existingEvents ?? []).some(ev => {
          const evStart = new Date(ev.start_time);
          const evEnd = new Date(ev.end_time);
          return slot < evEnd && slotEnd > evStart;
        });
        if (!conflict) slots.push(slot);
      }
    }
    return slots;
  };

  const bookSlot = useMutation({
    mutationFn: async () => {
      if (!selectedSlot || !workflow || !specialist || !provider) throw new Error("Missing data");
      const endTime = addMinutes(selectedSlot, SLOT_DURATION);

      // Create calendar event
      const { error } = await supabase.from("calendar_events").insert({
        title: `Onboarding Call — ${provider.business_name}`,
        event_type: "onboarding_call",
        start_time: selectedSlot.toISOString(),
        end_time: endTime.toISOString(),
        provider_id: provider.id,
        host_id: specialist.id,
        status: "confirmed",
        created_by: user?.id || specialist.id,
      });
      if (error) throw error;

      // Send notification to specialist
      await supabase.from("notifications").insert({
        user_id: specialist.id,
        title: "Onboarding call scheduled",
        message: `${provider.business_name} scheduled their onboarding call for ${format(selectedSlot, "MMM d, yyyy 'at' h:mm a")}`,
        type: "onboarding",
        link: `/onboarding/${workflowId}`,
      });
    },
    onSuccess: () => {
      setBooked(true);
      queryClient.invalidateQueries({ queryKey: ["specialist-events"] });
      toast.success("Your onboarding call is scheduled!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (booked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <h2 className="text-2xl font-bold">Your Call is Scheduled!</h2>
            <p className="text-muted-foreground">
              {selectedSlot && format(selectedSlot, "EEEE, MMMM d, yyyy 'at' h:mm a")}
            </p>
            <p className="text-sm text-muted-foreground">
              You'll meet with {specialist?.full_name}. We'll send you a reminder before the call.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!workflow) return null;

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Calendar className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Schedule Your Onboarding Call</h1>
          {specialist && (
            <div className="flex items-center justify-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {specialist.full_name?.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <p className="text-muted-foreground">
                You'll be meeting with <span className="font-medium text-foreground">{specialist.full_name}</span>, your onboarding specialist
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Clock className="h-3 w-3" />
            Times shown in {browserTz}
          </p>
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))} disabled={weekOffset === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" />Previous
          </Button>
          <span className="text-sm font-medium">
            {days.length > 0 && `${format(days[0], "MMM d")} — ${format(days[days.length - 1], "MMM d, yyyy")}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setWeekOffset(weekOffset + 1)} disabled={weekOffset >= 1}>
            Next<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>

        {/* Day columns */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {days.slice(0, 5).map(day => {
            const slots = getSlotsForDay(day);
            return (
              <Card key={day.toISOString()}>
                <CardHeader className="py-2 px-3">
                  <CardTitle className="text-xs text-center">
                    <div className="font-semibold">{format(day, "EEE")}</div>
                    <div className="text-muted-foreground">{format(day, "MMM d")}</div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-2 space-y-1 max-h-[300px] overflow-y-auto">
                  {slots.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground text-center py-4">No slots</p>
                  ) : (
                    slots.map(slot => {
                      const isSelected = selectedSlot && isSameDay(slot, selectedSlot) && slot.getTime() === selectedSlot.getTime();
                      return (
                        <Button
                          key={slot.toISOString()}
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          className="w-full text-xs h-8"
                          onClick={() => setSelectedSlot(slot)}
                        >
                          {format(slot, "h:mm a")}
                        </Button>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Second row for remaining days */}
        {days.length > 5 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {days.slice(5, 10).map(day => {
              const slots = getSlotsForDay(day);
              return (
                <Card key={day.toISOString()}>
                  <CardHeader className="py-2 px-3">
                    <CardTitle className="text-xs text-center">
                      <div className="font-semibold">{format(day, "EEE")}</div>
                      <div className="text-muted-foreground">{format(day, "MMM d")}</div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-2 pb-2 space-y-1 max-h-[300px] overflow-y-auto">
                    {slots.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground text-center py-4">No slots</p>
                    ) : (
                      slots.map(slot => {
                        const isSelected = selectedSlot && isSameDay(slot, selectedSlot) && slot.getTime() === selectedSlot.getTime();
                        return (
                          <Button
                            key={slot.toISOString()}
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            className="w-full text-xs h-8"
                            onClick={() => setSelectedSlot(slot)}
                          >
                            {format(slot, "h:mm a")}
                          </Button>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Confirmation panel */}
        {selectedSlot && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="py-4 flex items-center justify-between">
              <div>
                <p className="font-medium">
                  Confirm your onboarding call for{" "}
                  <span className="text-primary">{format(selectedSlot, "EEEE, MMMM d 'at' h:mm a")}</span>?
                </p>
                <p className="text-sm text-muted-foreground">30-minute call with {specialist?.full_name}</p>
              </div>
              <Button onClick={() => bookSlot.mutate()} disabled={bookSlot.isPending}>
                {bookSlot.isPending ? "Booking..." : "Confirm"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
