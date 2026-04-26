import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Play, CheckCircle2, Clock, ChevronRight, GraduationCap } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ProviderTraining() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: provider } = useQuery({
    queryKey: ["my-provider-for-training", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", user!.id).maybeSingle();
      if (!profile?.email) return null;
      const { data } = await supabase.from("providers").select("id").eq("contact_email", profile.email).maybeSingle();
      return data;
    },
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["training-videos-provider"],
    queryFn: async () => {
      const { data } = await supabase.from("training_videos").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: progress = [] } = useQuery({
    queryKey: ["my-video-progress", provider?.id],
    enabled: !!provider,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_video_progress")
        .select("*")
        .eq("provider_id", provider!.id);
      return data ?? [];
    },
  });

  const required = videos.filter((v: any) => v.is_required);
  const optional = videos.filter((v: any) => !v.is_required);
  const completedCount = required.filter((v: any) => progress.find((p: any) => p.video_id === v.id && p.status === "completed")).length;
  const pct = required.length > 0 ? Math.round((completedCount / required.length) * 100) : 0;

  const getStatus = (videoId: string) => {
    const p = progress.find((p: any) => p.video_id === videoId);
    return p?.status || "not_started";
  };

  const firstUnwatched = required.find((v: any) => getStatus(v.id) !== "completed");

  const catLabel: Record<string, string> = {
    platform_overview: "Platform", document_signing: "Documents", billing_portal: "Billing",
    support_system: "Support", ai_tools: "AI Tools", best_practices: "Best Practices",
    compliance: "Compliance", general: "General",
  };

  function VideoCard({ video, isNext }: { video: any; isNext: boolean }) {
    const status = getStatus(video.id);
    const borderClass = status === "completed" ? "border-green-500/50" : status === "in_progress" ? "border-primary/50" : isNext ? "border-primary/50 animate-pulse" : "";

    return (
      <Card className={`transition-all hover:shadow-md ${borderClass}`}>
        <CardContent className="p-4 flex items-center gap-4">
          <div className={`w-16 h-16 rounded-lg flex items-center justify-center shrink-0 ${
            status === "completed" ? "bg-green-500/10" : "bg-muted"
          }`}>
            {status === "completed" ? (
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            ) : (
              <Play className="h-8 w-8 text-muted-foreground/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`font-semibold text-sm ${status === "completed" ? "text-muted-foreground" : ""}`}>{video.title}</h3>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{video.description}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="text-[10px]">{catLabel[video.category] || video.category}</Badge>
              <span className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{video.duration_minutes} min</span>
            </div>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            {status === "completed" ? (
              <Badge className="bg-green-500/10 text-green-600 border-0 text-xs">Completed ✓</Badge>
            ) : status === "in_progress" ? (
              <Badge className="bg-primary/10 text-primary border-0 text-xs">In Progress</Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">Not Started</Badge>
            )}
            <Button size="sm" variant={status === "completed" ? "outline" : "default"} onClick={() => navigate(`/training/${video.id}`)}>
              {status === "completed" ? "Rewatch" : "Watch"}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <GraduationCap className="h-8 w-8" /> Your Training
          </h1>
          <p className="text-muted-foreground">{completedCount} of {required.length} required videos completed</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="relative w-16 h-16">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" className="stroke-muted" strokeWidth="4" />
              <circle cx="32" cy="32" r="28" fill="none" className="stroke-primary" strokeWidth="4"
                strokeDasharray={`${pct * 1.76} 176`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{pct}%</span>
          </div>
        </div>
      </div>

      {pct === 100 && (
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-500/30">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <p className="font-medium text-green-700 dark:text-green-400">🎉 You've completed all required training videos!</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Required Training</h2>
        {required.map((v: any) => (
          <VideoCard key={v.id} video={v} isNext={firstUnwatched?.id === v.id} />
        ))}
      </div>

      {optional.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Additional Resources</h2>
          {optional.map((v: any) => (
            <VideoCard key={v.id} video={v} isNext={false} />
          ))}
        </div>
      )}
    </div>
  );
}
