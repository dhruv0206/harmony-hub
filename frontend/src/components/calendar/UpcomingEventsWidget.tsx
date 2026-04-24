import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

const TYPE_LABELS: Record<string, string> = {
  onboarding_call: "Onboarding",
  training_session: "Training",
  follow_up: "Follow-up",
  check_in: "Check-in",
  demo: "Demo",
  review: "Review",
  general: "General",
};

const TYPE_COLORS: Record<string, string> = {
  onboarding_call: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  training_session: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  follow_up: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  check_in: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  demo: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  general: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

interface Props {
  myEventsOnly?: boolean;
  limit?: number;
}

export function UpcomingEventsWidget({ myEventsOnly = false, limit = 5 }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: events = [] } = useQuery({
    queryKey: ["upcoming-events", myEventsOnly, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("calendar_events")
        .select("*, providers(business_name)")
        .gte("start_time", new Date().toISOString())
        .in("status", ["scheduled", "confirmed"])
        .order("start_time")
        .limit(limit);
      
      if (myEventsOnly && user) {
        q = q.or(`host_id.eq.${user.id},attendee_ids.cs.{${user.id}}`);
      }

      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Upcoming Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <div className="space-y-3">
            {events.map((e: any) => {
              const start = new Date(e.start_time);
              return (
                <div key={e.id} className="flex items-start justify-between border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{e.title}</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                      <Clock className="h-3 w-3" />
                      {format(start, "MMM d, h:mm a")}
                    </div>
                    {(e.providers as any)?.business_name && (
                      <p className="text-xs text-muted-foreground">{(e.providers as any).business_name}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className={`text-[10px] shrink-0 ${TYPE_COLORS[e.event_type] || ""}`}>
                    {TYPE_LABELS[e.event_type] || e.event_type}
                  </Badge>
                </div>
              );
            })}
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate("/calendar")}>
              View Calendar →
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">No upcoming events</p>
        )}
      </CardContent>
    </Card>
  );
}
