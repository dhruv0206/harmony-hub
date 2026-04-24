import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, Play, Clock, Send } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  workflowId: string;
  providerId: string;
  isActive: boolean;
  onComplete: () => void;
}

export default function OnboardingStageTraining({ workflowId, providerId, isActive, onComplete }: Props) {
  const queryClient = useQueryClient();

  const { data: progress } = useQuery({
    queryKey: ["training-progress", workflowId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_training_progress")
        .select("*, training_videos(title, description, duration_minutes, display_order)")
        .eq("workflow_id", workflowId)
        .order("created_at");
      return data ?? [];
    },
  });

  const watched = progress?.filter(p => p.watched).length ?? 0;
  const total = progress?.length ?? 0;
  const allDone = total > 0 && watched >= total;
  const pct = total > 0 ? (watched / total) * 100 : 0;

  const toggleWatch = useMutation({
    mutationFn: async ({ id, watched: w }: { id: string; watched: boolean }) => {
      await supabase.from("provider_training_progress").update({
        watched: w,
        watched_at: w ? new Date().toISOString() : null,
      }).eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-progress", workflowId] });
    },
  });

  const sorted = [...(progress ?? [])].sort((a, b) =>
    ((a as any).training_videos?.display_order ?? 0) - ((b as any).training_videos?.display_order ?? 0)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-2 w-32" />
          <span className="text-sm text-muted-foreground">{watched}/{total} videos completed</span>
        </div>
        {isActive && (
          <Button size="sm" variant="outline" onClick={() => toast.info("Training invitation sent to provider")}>
            <Send className="h-3.5 w-3.5 mr-1" />Send Training Invite
          </Button>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map(item => {
          const video = (item as any).training_videos;
          return (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              <Checkbox
                checked={item.watched}
                onCheckedChange={(checked) => toggleWatch.mutate({ id: item.id, watched: !!checked })}
              />
              <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 ${item.watched ? "text-green-500" : "text-muted-foreground"}`}>
                {item.watched ? <CheckCircle2 className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${item.watched ? "line-through text-muted-foreground" : ""}`}>
                  {video?.title || "Video"}
                </p>
                <p className="text-xs text-muted-foreground">{video?.description}</p>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />{video?.duration_minutes || 0}m
                </div>
                {item.watched && item.watched_at && (
                  <p className="text-[10px] text-green-600">{format(new Date(item.watched_at), "MMM d")}</p>
                )}
              </div>
            </div>
          );
        })}
        {total === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No training videos configured.</p>
        )}
      </div>

      {allDone && isActive && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-500/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">All training videos completed!</span>
          </div>
          <Button size="sm" onClick={onComplete}>Continue to Onboarding Call →</Button>
        </div>
      )}
    </div>
  );
}
