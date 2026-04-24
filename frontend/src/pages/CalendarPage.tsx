import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, subWeeks, subMonths, isSameDay, isSameMonth, eachDayOfInterval, startOfDay, setHours, isWithinInterval } from "date-fns";
import { CalendarEventDetailPanel } from "@/components/calendar/CalendarEventDetailPanel";
import { CalendarEventModal } from "@/components/calendar/CalendarEventModal";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "week" | "month";

const EVENT_TYPE_COLORS: Record<string, string> = {
  onboarding_call: "bg-blue-500",
  training_session: "bg-purple-500",
  follow_up: "bg-orange-500",
  check_in: "bg-green-500",
  demo: "bg-teal-500",
  review: "bg-yellow-500",
  general: "bg-gray-500",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  onboarding_call: "Onboarding Call",
  training_session: "Training Session",
  follow_up: "Follow-up",
  check_in: "Check-in",
  demo: "Demo",
  review: "Review",
  general: "General",
};

export default function CalendarPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobileInit = typeof window !== "undefined" && window.innerWidth < 768;
  const [viewMode, setViewMode] = useState<ViewMode>(isMobileInit ? "day" : "week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filter, setFilter] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editEvent, setEditEvent] = useState<any>(null);

  // Calculate date range for query
  const dateRange = useMemo(() => {
    if (viewMode === "day") {
      return { start: startOfDay(currentDate), end: addDays(startOfDay(currentDate), 1) };
    } else if (viewMode === "week") {
      const s = startOfWeek(currentDate, { weekStartsOn: 0 });
      return { start: s, end: addDays(s, 7) };
    } else {
      const s = startOfMonth(currentDate);
      const e = endOfMonth(currentDate);
      // Include partial weeks
      return { start: startOfWeek(s, { weekStartsOn: 0 }), end: addDays(endOfWeek(e, { weekStartsOn: 0 }), 1) };
    }
  }, [viewMode, currentDate]);

  const { data: events = [] } = useQuery({
    queryKey: ["calendar-events", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("*, providers(business_name), profiles!calendar_events_host_id_fkey(full_name)")
        .gte("start_time", dateRange.start.toISOString())
        .lte("start_time", dateRange.end.toISOString())
        .order("start_time");
      return data ?? [];
    },
  });

  const filteredEvents = useMemo(() => {
    let filtered = events;
    if (filter === "my_events") {
      filtered = filtered.filter((e: any) => e.host_id === user?.id || (e.attendee_ids ?? []).includes(user?.id));
    } else if (filter !== "all") {
      filtered = filtered.filter((e: any) => e.event_type === filter);
    }
    return filtered;
  }, [events, filter, user]);

  const navigate = (dir: number) => {
    if (viewMode === "day") setCurrentDate(prev => addDays(prev, dir));
    else if (viewMode === "week") setCurrentDate(prev => addWeeks(prev, dir));
    else setCurrentDate(prev => addMonths(prev, dir));
  };

  const handleEventClick = (event: any) => {
    setSelectedEvent(event);
    setDetailOpen(true);
  };

  const handleEdit = (event: any) => {
    setEditEvent(event);
    setDetailOpen(false);
    setModalOpen(true);
  };

  const handleNewEvent = () => {
    setEditEvent(null);
    setModalOpen(true);
  };

  const headerLabel = useMemo(() => {
    if (viewMode === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    if (viewMode === "week") {
      const s = startOfWeek(currentDate, { weekStartsOn: 0 });
      const e = addDays(s, 6);
      return `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
    }
    return format(currentDate, "MMMM yyyy");
  }, [viewMode, currentDate]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="my_events">My Events Only</SelectItem>
              <SelectItem value="onboarding_call">Onboarding Calls</SelectItem>
              <SelectItem value="training_session">Training Sessions</SelectItem>
              <SelectItem value="follow_up">Follow-ups</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleNewEvent}><Plus className="h-4 w-4 mr-1" />New Event</Button>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigate(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => navigate(1)}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={() => setCurrentDate(new Date())}>Today</Button>
          <span className="text-lg font-semibold ml-2">{headerLabel}</span>
        </div>
        <div className="flex border rounded-md overflow-hidden">
          {(["day", "week", "month"] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setViewMode(v)}
              className={cn(
                "px-3 py-1.5 text-sm capitalize transition-colors",
                viewMode === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      {viewMode === "month" && <MonthView currentDate={currentDate} events={filteredEvents} onEventClick={handleEventClick} onDayClick={(d) => { setCurrentDate(d); setViewMode("day"); }} />}
      {viewMode === "week" && <WeekView currentDate={currentDate} events={filteredEvents} onEventClick={handleEventClick} />}
      {viewMode === "day" && <DayView currentDate={currentDate} events={filteredEvents} onEventClick={handleEventClick} />}

      {/* Detail panel */}
      <CalendarEventDetailPanel
        event={selectedEvent}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onEdit={handleEdit}
      />

      {/* Create/Edit modal */}
      <CalendarEventModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditEvent(null); }}
        event={editEvent}
      />
    </div>
  );
}

// ========== MONTH VIEW ==========
function MonthView({ currentDate, events, onEventClick, onDayClick }: { currentDate: Date; events: any[]; onEventClick: (e: any) => void; onDayClick: (d: Date) => void }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7 bg-muted">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
          <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = events.filter((e: any) => isSameDay(new Date(e.start_time), day));
          const isToday = isSameDay(day, new Date());
          const isCurrentMonth = isSameMonth(day, currentDate);
          return (
            <div
              key={i}
              className={cn(
                "min-h-[100px] border-t border-r p-1 cursor-pointer hover:bg-muted/50 transition-colors",
                !isCurrentMonth && "bg-muted/30 text-muted-foreground"
              )}
              onClick={() => onDayClick(day)}
            >
              <span className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                isToday && "bg-primary text-primary-foreground font-bold"
              )}>
                {format(day, "d")}
              </span>
              <div className="space-y-0.5 mt-1">
                {dayEvents.slice(0, 3).map((e: any) => (
                  <div
                    key={e.id}
                    className={cn("text-[10px] px-1 py-0.5 rounded truncate text-white cursor-pointer", EVENT_TYPE_COLORS[e.event_type] || "bg-gray-500")}
                    onClick={(ev) => { ev.stopPropagation(); onEventClick(e); }}
                  >
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ========== WEEK VIEW ==========
function WeekView({ currentDate, events, onEventClick }: { currentDate: Date; events: any[]; onEventClick: (e: any) => void }) {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8AM - 6PM

  return (
    <div className="border rounded-lg overflow-auto">
      {/* Header */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] bg-muted sticky top-0 z-10">
        <div className="p-2" />
        {days.map((day, i) => (
          <div key={i} className={cn("p-2 text-center border-l", isSameDay(day, new Date()) && "bg-primary/10")}>
            <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
            <div className={cn("text-sm font-semibold", isSameDay(day, new Date()) && "text-primary")}>{format(day, "d")}</div>
          </div>
        ))}
      </div>
      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)]">
        {hours.map(hour => (
          <div key={hour} className="contents">
            <div className="p-1 text-xs text-muted-foreground text-right pr-2 h-16 border-t">
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
            </div>
            {days.map((day, di) => {
              const slotStart = setHours(startOfDay(day), hour);
              const slotEnd = setHours(startOfDay(day), hour + 1);
              const slotEvents = events.filter((e: any) => {
                const eStart = new Date(e.start_time);
                return isSameDay(eStart, day) && eStart.getHours() === hour;
              });
              return (
                <div key={di} className={cn("border-t border-l h-16 relative", isSameDay(day, new Date()) && "bg-primary/5")}>
                  {slotEvents.map((e: any) => {
                    const eStart = new Date(e.start_time);
                    const eEnd = new Date(e.end_time);
                    const durationHours = Math.max(0.5, (eEnd.getTime() - eStart.getTime()) / 3600000);
                    const topOffset = (eStart.getMinutes() / 60) * 64;
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-white text-[10px] leading-tight cursor-pointer overflow-hidden z-10 hover:opacity-90",
                          EVENT_TYPE_COLORS[e.event_type] || "bg-gray-500"
                        )}
                        style={{ top: `${topOffset}px`, height: `${Math.min(durationHours * 64, 192)}px` }}
                        onClick={() => onEventClick(e)}
                        title={`${e.title}\n${format(eStart, "h:mm a")} – ${format(eEnd, "h:mm a")}`}
                      >
                        <div className="font-semibold truncate">{e.title}</div>
                        {durationHours >= 1 && <div className="truncate">{(e.providers as any)?.business_name || ""}</div>}
                        {durationHours >= 1 && <div className="truncate">{format(eStart, "h:mm a")}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ========== DAY VIEW ==========
function DayView({ currentDate, events, onEventClick }: { currentDate: Date; events: any[]; onEventClick: (e: any) => void }) {
  const hours = Array.from({ length: 11 }, (_, i) => i + 8);
  const dayEvents = events.filter((e: any) => isSameDay(new Date(e.start_time), currentDate));

  return (
    <div className="border rounded-lg overflow-auto">
      {hours.map(hour => {
        const slotEvents = dayEvents.filter((e: any) => new Date(e.start_time).getHours() === hour);
        return (
          <div key={hour} className="flex border-t min-h-[80px]">
            <div className="w-[70px] p-2 text-xs text-muted-foreground text-right shrink-0">
              {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
            </div>
            <div className="flex-1 p-1 relative">
              {slotEvents.map((e: any) => (
                <div
                  key={e.id}
                  className={cn(
                    "rounded px-2 py-1.5 mb-1 text-white cursor-pointer hover:opacity-90",
                    EVENT_TYPE_COLORS[e.event_type] || "bg-gray-500"
                  )}
                  onClick={() => onEventClick(e)}
                >
                  <div className="font-semibold text-sm">{e.title}</div>
                  <div className="text-xs">
                    {format(new Date(e.start_time), "h:mm a")} – {format(new Date(e.end_time), "h:mm a")}
                    {(e.providers as any)?.business_name && ` · ${(e.providers as any).business_name}`}
                  </div>
                  <div className="text-xs opacity-80">{(e.profiles as any)?.full_name && `Host: ${(e.profiles as any).full_name}`}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
