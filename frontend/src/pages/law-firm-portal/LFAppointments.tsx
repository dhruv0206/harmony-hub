import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/use-law-firm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Clock, MapPin, Video } from "lucide-react";
import { format } from "date-fns";

const typeColors: Record<string, string> = {
  onboarding_call: "bg-blue-500/10 text-blue-700",
  training_session: "bg-purple-500/10 text-purple-700",
  follow_up: "bg-amber-500/10 text-amber-700",
  meeting: "bg-green-500/10 text-green-700",
};

export default function LFAppointments() {
  const { data: lawFirm } = useLawFirm();

  // For now calendar_events doesn't have law_firm_id, so we show empty state
  // This would need a migration to add law_firm_id to calendar_events
  const { data: events } = useQuery({
    queryKey: ["lf-appointments", lawFirm?.id],
    queryFn: async () => {
      // Attempt to find events. Calendar events may not have law_firm_id yet.
      return [] as any[];
    },
    enabled: !!lawFirm?.id,
  });

  const now = new Date();
  const upcoming = events?.filter(e => new Date(e.start_time) >= now).sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()) ?? [];
  const past = events?.filter(e => new Date(e.start_time) < now).sort((a: any, b: any) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()) ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">My Appointments</h1>
        <p className="text-sm text-muted-foreground mt-1">Your scheduled meetings and calls.</p>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <CalendarDays className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No appointments scheduled yet.</p>
          </CardContent>
        </Card>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming</h2>
          {upcoming.map((e: any) => (
            <Card key={e.id}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <CalendarDays className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{e.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {format(new Date(e.start_time), "MMM d, yyyy 'at' h:mm a")}
                    </div>
                  </div>
                </div>
                <Badge className={typeColors[e.event_type] || ""}>{e.event_type?.replace(/_/g, " ")}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
