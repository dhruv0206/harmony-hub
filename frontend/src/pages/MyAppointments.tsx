import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, Link2, User, CheckCircle } from "lucide-react";
import { format, isPast } from "date-fns";
import { toast } from "sonner";

const TYPE_LABELS: Record<string, string> = {
  onboarding_call: "Onboarding Call",
  training_session: "Training Session",
  follow_up: "Follow-up",
  check_in: "Check-in",
  demo: "Demo",
  review: "Review",
  general: "General",
};

export default function MyAppointments() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Resolve the provider record for the current user so we can scope events
  // by provider_id (or attendee). Without this, anyone in `provider` role
  // could see every appointment in the system.
  const { data: myProvider } = useQuery({
    queryKey: ["my-provider-for-appointments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles").select("email").eq("id", user!.id).maybeSingle();
      if (!profile?.email) return null;
      const { data: providers } = await supabase
        .from("providers").select("id").eq("contact_email", profile.email).limit(1);
      return providers?.[0] || null;
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["my-appointments", user?.id, myProvider?.id],
    enabled: !!user && !!myProvider?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("calendar_events")
        .select("*, profiles!calendar_events_host_id_fkey(full_name)")
        .or(`provider_id.eq.${myProvider!.id},attendee_ids.cs.{${user!.id}}`)
        .order("start_time", { ascending: true });
      return data ?? [];
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.from("calendar_events").update({ status: "confirmed" }).eq("id", eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-appointments"] });
      toast.success("Appointment confirmed");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const upcoming = events.filter((e: any) => !isPast(new Date(e.end_time)) && e.status !== "cancelled");
  const past = events.filter((e: any) => isPast(new Date(e.end_time)) || e.status === "cancelled");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Appointments</h1>
        <p className="text-muted-foreground">Your scheduled meetings and calls</p>
      </div>

      {/* Upcoming */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Upcoming</h2>
        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map((e: any) => {
              const start = new Date(e.start_time);
              const end = new Date(e.end_time);
              return (
                <Card key={e.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{e.title}</h3>
                          <Badge variant="secondary">{TYPE_LABELS[e.event_type] || e.event_type}</Badge>
                          <Badge variant={e.status === "confirmed" ? "default" : "outline"} className="capitalize">{e.status}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{format(start, "EEEE, MMM d, yyyy")}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {e.all_day ? "All Day" : `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`}
                          </span>
                        </div>
                        {e.location && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />{e.location}
                          </div>
                        )}
                        {e.meeting_link && (
                          <a href={e.meeting_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-primary underline">
                            <Link2 className="h-3.5 w-3.5" />Join Meeting
                          </a>
                        )}
                        {(e.profiles as any)?.full_name && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <User className="h-3.5 w-3.5" />Host: {(e.profiles as any).full_name}
                          </div>
                        )}
                        {e.notes && <p className="text-sm text-muted-foreground mt-1">{e.notes}</p>}
                      </div>
                      {e.status === "scheduled" && (
                        <Button size="sm" onClick={() => confirmMutation.mutate(e.id)}>
                          <CheckCircle className="h-4 w-4 mr-1" />Confirm
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4">No upcoming appointments</p>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-muted-foreground">Past</h2>
          <div className="space-y-3 opacity-70">
            {past.slice(0, 10).map((e: any) => {
              const start = new Date(e.start_time);
              return (
                <Card key={e.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-sm">{e.title}</h3>
                        <p className="text-xs text-muted-foreground">{format(start, "MMM d, yyyy h:mm a")}</p>
                      </div>
                      <Badge variant={e.status === "completed" ? "default" : e.status === "cancelled" ? "destructive" : "outline"} className="capitalize text-xs">
                        {e.status?.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
