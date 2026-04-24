import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Video, Play, CheckCircle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function LFTraining() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: videos } = useQuery({
    queryKey: ["lf-training-videos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_videos")
        .select("*")
        .in("target_audience", ["law_firms", "both"] as any[])
        .eq("is_active", true)
        .order("display_order");
      return data ?? [];
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["lf-video-progress", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_video_progress" as any)
        .select("*")
        .eq("user_id", user!.id);
      return (data ?? []) as any[];
    },
    enabled: !!user,
  });

  const completedCount = progress?.filter(p => p.status === "completed").length ?? 0;
  const totalCount = videos?.length ?? 0;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Training</h1>
        <p className="text-sm text-muted-foreground mt-1">Complete the training videos below to get up to speed.</p>
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Overall Progress</p>
            <p className="text-sm text-muted-foreground">{completedCount}/{totalCount} completed</p>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {/* Videos */}
      <div className="grid gap-4 md:grid-cols-2">
        {videos?.map(video => {
          const vp = progress?.find(p => p.video_id === video.id);
          const status = vp?.status || "not_started";
          return (
            <Card key={video.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/training/${video.id}`)}>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Video className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{video.title}</p>
                      <p className="text-xs text-muted-foreground">{video.duration_minutes} min • {video.category?.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  {status === "completed" ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <CheckCircle className="h-3 w-3 mr-1" /> Done
                    </Badge>
                  ) : status === "in_progress" ? (
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                      <Clock className="h-3 w-3 mr-1" /> In Progress
                    </Badge>
                  ) : (
                    <Badge variant="outline"><Play className="h-3 w-3 mr-1" /> Start</Badge>
                  )}
                </div>
                {video.description && <p className="text-xs text-muted-foreground line-clamp-2">{video.description}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(!videos || videos.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Video className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No training videos available yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
