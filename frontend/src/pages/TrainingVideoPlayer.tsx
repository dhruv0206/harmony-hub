import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle2, ChevronRight, Clock, Play } from "lucide-react";
import { toast } from "sonner";

function getEmbedUrl(url: string, type: string) {
  if (!url) return null;
  if (type === "youtube") {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
    return match ? `https://www.youtube.com/embed/${match[1]}` : null;
  }
  if (type === "vimeo") {
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  }
  if (type === "loom") {
    const match = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    return match ? `https://www.loom.com/embed/${match[1]}` : url;
  }
  return url;
}

export default function TrainingVideoPlayer() {
  const { videoId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: provider } = useQuery({
    queryKey: ["my-provider-for-training", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", user!.id).single();
      if (!profile?.email) return null;
      const { data } = await supabase.from("providers").select("id").eq("contact_email", profile.email).single();
      return data;
    },
  });

  const { data: video } = useQuery({
    queryKey: ["training-video", videoId],
    enabled: !!videoId,
    queryFn: async () => {
      const { data } = await supabase.from("training_videos").select("*").eq("id", videoId!).single();
      return data;
    },
  });

  const { data: allVideos = [] } = useQuery({
    queryKey: ["training-videos-provider"],
    queryFn: async () => {
      const { data } = await supabase.from("training_videos").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["my-video-progress-single", provider?.id, videoId],
    enabled: !!provider && !!videoId,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_video_progress")
        .select("*")
        .eq("provider_id", provider!.id)
        .eq("video_id", videoId!)
        .maybeSingle();
      return data;
    },
  });

  const { data: allProgress = [] } = useQuery({
    queryKey: ["my-video-progress", provider?.id],
    enabled: !!provider,
    queryFn: async () => {
      const { data } = await supabase.from("provider_video_progress").select("*").eq("provider_id", provider!.id);
      return data ?? [];
    },
  });

  // Mark in_progress on load
  useEffect(() => {
    if (!provider || !videoId || !video) return;
    if (progress?.status === "completed") return;

    const markInProgress = async () => {
      if (progress) {
        await supabase.from("provider_video_progress")
          .update({ status: "in_progress", started_at: progress.started_at || new Date().toISOString() } as any)
          .eq("id", progress.id);
      } else {
        await supabase.from("provider_video_progress")
          .insert({ provider_id: provider.id, video_id: videoId, status: "in_progress", started_at: new Date().toISOString() } as any);
      }
      qc.invalidateQueries({ queryKey: ["my-video-progress"] });
    };
    markInProgress();
  }, [provider?.id, videoId, video?.id]);

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!provider || !videoId) return;
      if (progress) {
        await supabase.from("provider_video_progress")
          .update({ status: "completed", completed_at: new Date().toISOString(), progress_percent: 100 } as any)
          .eq("id", progress.id);
      } else {
        await supabase.from("provider_video_progress")
          .insert({ provider_id: provider.id, video_id: videoId, status: "completed", completed_at: new Date().toISOString(), progress_percent: 100 } as any);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-video-progress"] });
      qc.invalidateQueries({ queryKey: ["my-video-progress-single"] });
      toast.success("Video marked as complete!");
    },
  });

  if (!video) return <div className="p-6">Loading...</div>;

  const embedUrl = getEmbedUrl(video.video_url || "", (video as any).video_type || "youtube");
  const isCompleted = progress?.status === "completed";

  // Find next unwatched video
  const currentIdx = allVideos.findIndex((v: any) => v.id === videoId);
  const nextVideo = allVideos.slice(currentIdx + 1).find((v: any) => {
    const p = allProgress.find((pr: any) => pr.video_id === v.id);
    return !p || p.status !== "completed";
  });

  const allDone = allVideos.filter((v: any) => v.is_required).every((v: any) => {
    const p = allProgress.find((pr: any) => pr.video_id === v.id);
    return p?.status === "completed" || v.id === videoId;
  });

  const catLabel: Record<string, string> = {
    platform_overview: "Platform", document_signing: "Documents", billing_portal: "Billing",
    support_system: "Support", ai_tools: "AI Tools", compliance: "Compliance", general: "General",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Button variant="ghost" size="sm" onClick={() => navigate("/training")}>
        <ArrowLeft className="h-4 w-4 mr-1" />Back to Training
      </Button>

      {/* Video Player */}
      <div className="aspect-video bg-black rounded-lg overflow-hidden">
        {embedUrl ? (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={video.title}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/60">
            <div className="text-center">
              <Play className="h-16 w-16 mx-auto mb-3 opacity-40" />
              <p>No video URL configured yet</p>
              <p className="text-sm opacity-60">The admin will add the video link soon</p>
            </div>
          </div>
        )}
      </div>

      {/* Video Info */}
      <div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{video.title}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline">{catLabel[(video as any).category] || (video as any).category}</Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />{video.duration_minutes} minutes
              </span>
              {video.is_required && <Badge className="bg-primary/10 text-primary border-0">Required</Badge>}
            </div>
          </div>
          {isCompleted && (
            <Badge className="bg-green-500/10 text-green-600 border-0">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Completed
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-3">{video.description}</p>
      </div>

      {/* Mark Complete / Next */}
      {!isCompleted ? (
        <Button size="lg" className="w-full bg-green-600 hover:bg-green-700" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending}>
          <CheckCircle2 className="h-5 w-5 mr-2" />Mark as Complete
        </Button>
      ) : allDone && isCompleted ? (
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-500/30">
          <CardContent className="p-6 text-center">
            <p className="text-xl font-bold text-green-700 dark:text-green-400">🎉 You've completed all training videos!</p>
            <p className="text-sm text-muted-foreground mt-1">Great work! You're all set.</p>
            <Button variant="outline" className="mt-3" onClick={() => navigate("/training")}>Back to Training</Button>
          </CardContent>
        </Card>
      ) : nextVideo ? (
        <Button size="lg" variant="outline" className="w-full" onClick={() => navigate(`/training/${nextVideo.id}`)}>
          Up next: {nextVideo.title} <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      ) : null}
    </div>
  );
}
