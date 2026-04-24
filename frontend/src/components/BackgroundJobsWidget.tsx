import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useRealtimeSubscription } from "@/hooks/use-realtime";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<string, { icon: any; color: string; label: string }> = {
  queued: { icon: Clock, color: "text-muted-foreground", label: "Queued" },
  processing: { icon: Loader2, color: "text-primary", label: "Processing" },
  completed: { icon: CheckCircle2, color: "text-green-500", label: "Completed" },
  failed: { icon: XCircle, color: "text-destructive", label: "Failed" },
};

const jobLabels: Record<string, string> = {
  invoice_generation: "Invoice Generation",
  dunning_check: "Dunning Check",
  bulk_document_send: "Bulk Document Send",
  health_score_calculation: "Health Score Calculation",
  bulk_reminder: "Bulk Reminders",
  churn_analysis: "Churn Analysis",
};

export function BackgroundJobsWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const { data: jobs } = useQuery({
    queryKey: ["background-jobs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("background_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      return (data ?? []) as any[];
    },
    enabled: !!user,
    refetchInterval: 5000,
  });

  useRealtimeSubscription({
    channelName: "bg-jobs-realtime",
    table: "background_jobs",
    event: "*",
    queryKeys: [["background-jobs"]],
    enabled: !!user,
  });

  const activeJobs = jobs?.filter((j) => j.status === "queued" || j.status === "processing") ?? [];
  const hasActive = activeJobs.length > 0;

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {hasActive ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <Clock className="h-5 w-5 text-muted-foreground" />
          )}
          {hasActive && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
              {activeJobs.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <p className="text-sm font-semibold">Background Jobs</p>
        </div>
        <ScrollArea className="max-h-[350px]">
          {jobs && jobs.length > 0 ? (
            jobs.map((job) => {
              const cfg = statusConfig[job.status] || statusConfig.queued;
              const Icon = cfg.icon;
              return (
                <div key={job.id} className="p-3 border-b last:border-0 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{jobLabels[job.job_type] || job.job_type}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      <Icon className={cn("h-3 w-3 mr-1", cfg.color, job.status === "processing" && "animate-spin")} />
                      {cfg.label}
                    </Badge>
                  </div>
                  {(job.status === "processing" || job.status === "queued") && (
                    <Progress value={job.progress ?? 0} className="h-1.5" />
                  )}
                  {job.total_items != null && (
                    <p className="text-[10px] text-muted-foreground">
                      {job.processed_items ?? 0} / {job.total_items} items
                    </p>
                  )}
                  {job.status === "failed" && job.error_message && (
                    <p className="text-[10px] text-destructive">{job.error_message}</p>
                  )}
                  {job.status === "completed" && job.result && (
                    <p className="text-[10px] text-muted-foreground">
                      {(job.result as any)?.message || `Processed ${(job.result as any)?.count ?? 0} items`}
                    </p>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">No recent jobs</div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
