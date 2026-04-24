import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Phone, Zap, Timer, Target, Trophy, LogOut } from "lucide-react";

// Tiny inline success beep using Web Audio API
function playSuccessSound() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {}
}

interface CallQueueStatsProps {
  campaignId: string;
  dailyGoal?: number;
  onEndSession: (stats: SessionStats) => void;
}

export interface SessionStats {
  sessionCalls: number;
  connects: number;
  interested: number;
  conversions: number;
  duration: string;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function CallQueueStats({ campaignId, dailyGoal = 50, onEndSession }: CallQueueStatsProps) {
  const { user } = useAuth();
  const [sessionStart] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [sessionCalls, setSessionCalls] = useState(0);
  const [sessionConnects, setSessionConnects] = useState(0);
  const [sessionInterested, setSessionInterested] = useState(0);
  const [sessionConversions, setSessionConversions] = useState(0);
  const [flash, setFlash] = useState(false);
  const [showSummary, setShowSummary] = useState(false);

  // Session timer
  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - sessionStart) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [sessionStart]);

  // Today's calls for this rep
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayCalls = 0, refetch: refetchToday } = useQuery({
    queryKey: ["today-calls", user?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("campaign_activities")
        .select("id", { count: "exact", head: true })
        .eq("performed_by", user!.id)
        .in("activity_type", ["call", "voicemail"])
        .gte("created_at", todayStart.toISOString());
      return count || 0;
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Subscribe to real-time campaign_activities changes
  useRealtimeSubscription({
    channelName: `call-stats-${user?.id}`,
    table: "campaign_activities",
    event: "INSERT",
    queryKeys: [["today-calls", user?.id || ""]],
    enabled: !!user,
  });

  // Called externally when a call is logged
  const onCallLogged = useCallback((type: "call" | "voicemail" | "connect" | "interested" | "conversion") => {
    setSessionCalls(p => p + 1);
    if (type === "connect" || type === "interested" || type === "conversion") {
      setSessionConnects(p => p + 1);
    }
    if (type === "interested") setSessionInterested(p => p + 1);
    if (type === "conversion") setSessionConversions(p => p + 1);

    // Flash + sound
    playSuccessSound();
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
    refetchToday();
  }, [refetchToday]);

  // Expose onCallLogged via ref
  useEffect(() => {
    (window as any).__callQueueOnCallLogged = onCallLogged;
    return () => { delete (window as any).__callQueueOnCallLogged; };
  }, [onCallLogged]);

  const handleEndSession = () => {
    setShowSummary(true);
  };

  const confirmEnd = () => {
    setShowSummary(false);
    onEndSession({
      sessionCalls,
      connects: sessionConnects,
      interested: sessionInterested,
      conversions: sessionConversions,
      duration: formatDuration(elapsed),
    });
  };

  const progress = Math.min((todayCalls / dailyGoal) * 100, 100);
  const circumference = 2 * Math.PI * 18;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <>
      <Card className={`transition-colors duration-300 ${flash ? "border-green-500 bg-green-500/5" : ""}`}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Counters */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <Phone className="h-4 w-4 text-primary" />
                <span className="text-muted-foreground">Today:</span>
                <span className="font-bold text-foreground">{todayCalls}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-muted-foreground">Session:</span>
                <span className="font-bold text-foreground">{sessionCalls}</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Connects:</span>
                <span className="font-bold text-green-600">{sessionConnects}</span>
              </div>
            </div>

            {/* Timer + Goal Ring */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-sm">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-foreground">{formatDuration(elapsed)}</span>
              </div>

              {/* Progress Ring */}
              <div className="relative h-10 w-10">
                <svg className="h-10 w-10 -rotate-90" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="18" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
                  <circle
                    cx="20" cy="20" r="18" fill="none"
                    stroke={progress >= 100 ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.7)"}
                    strokeWidth="3"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[10px] font-bold">{todayCalls}</span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground">/ {dailyGoal}</span>

              <Button variant="outline" size="sm" onClick={handleEndSession}>
                <LogOut className="h-3.5 w-3.5 mr-1" />End
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session Summary Modal */}
      <Dialog open={showSummary} onOpenChange={setShowSummary}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-primary" />Session Summary</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-foreground">{sessionCalls}</p>
              <p className="text-sm text-muted-foreground">Calls Made</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-green-600">{sessionConnects}</p>
              <p className="text-sm text-muted-foreground">Connects</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-primary">{sessionInterested}</p>
              <p className="text-sm text-muted-foreground">Interested</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-amber-500">{sessionConversions}</p>
              <p className="text-sm text-muted-foreground">Conversions</p>
            </div>
          </div>
          <div className="text-center text-sm text-muted-foreground">
            Session Duration: <span className="font-mono font-medium text-foreground">{formatDuration(elapsed)}</span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSummary(false)}>Continue Calling</Button>
            <Button onClick={confirmEnd}>End Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Leaderboard Component
export function CallLeaderboard() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: leaderboard = [] } = useQuery({
    queryKey: ["call-leaderboard"],
    queryFn: async () => {
      // Get today's call activities grouped by rep
      const { data } = await supabase
        .from("campaign_activities")
        .select("performed_by, profiles:performed_by(full_name)")
        .in("activity_type", ["call", "voicemail"])
        .gte("created_at", todayStart.toISOString());

      if (!data) return [];

      const counts: Record<string, { name: string; calls: number }> = {};
      data.forEach((a: any) => {
        const id = a.performed_by;
        if (!id) return;
        if (!counts[id]) counts[id] = { name: a.profiles?.full_name || "Unknown", calls: 0 };
        counts[id].calls++;
      });

      return Object.entries(counts)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.calls - a.calls);
    },
    refetchInterval: 15000,
  });

  useRealtimeSubscription({
    channelName: "leaderboard-realtime",
    table: "campaign_activities",
    event: "INSERT",
    queryKeys: [["call-leaderboard"]],
  });

  if (leaderboard.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />Today's Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {leaderboard.map((rep, i) => (
          <div key={rep.id} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className={`font-bold ${i === 0 ? "text-amber-500" : i === 1 ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                #{i + 1}
              </span>
              <span className="truncate max-w-[120px]">{rep.name}</span>
            </div>
            <Badge variant={i === 0 ? "default" : "secondary"}>{rep.calls}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
