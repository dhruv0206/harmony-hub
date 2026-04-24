import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Clock, Send, Bell, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  workflowId: string;
  providerId: string;
  packageId?: string;
  isActive: boolean;
  onComplete: () => void;
}

export default function OnboardingStageDocuments({ workflowId, providerId, packageId, isActive, onComplete }: Props) {
  const { data: docs } = useQuery({
    queryKey: ["onboarding-docs", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("*, document_templates(name, document_type)")
        .eq("provider_id", providerId)
        .neq("status", "voided")
        .order("signing_order");
      return data ?? [];
    },
  });

  const signed = docs?.filter(d => d.status === "signed" || d.status === "fully_executed").length ?? 0;
  const total = docs?.length ?? 0;
  const allDone = total > 0 && signed >= total;
  const pct = total > 0 ? (signed / total) * 100 : 0;

  const statusIcon = (status: string) => {
    if (status === "signed" || status === "fully_executed") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    if (status === "sent" || status === "viewed") return <Clock className="h-4 w-4 text-primary" />;
    return <Circle className="h-4 w-4 text-muted-foreground" />;
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      signed: "bg-green-500/10 text-green-600 border-green-500/30",
      fully_executed: "bg-green-500/10 text-green-600 border-green-500/30",
      sent: "bg-primary/10 text-primary border-primary/30",
      viewed: "bg-amber-500/10 text-amber-600 border-amber-500/30",
      pending: "bg-muted text-muted-foreground",
    };
    return <Badge variant="outline" className={`text-[10px] capitalize ${colors[status] || ""}`}>{status.replace(/_/g, " ")}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-2 w-32" />
          <span className="text-sm text-muted-foreground">{signed}/{total} signed</span>
        </div>
        {isActive && !allDone && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => toast.info("Reminder sent to provider")}>
              <Bell className="h-3.5 w-3.5 mr-1" />Send Reminder
            </Button>
            <Button size="sm" onClick={() => toast.info("Next document sent")}>
              <Send className="h-3.5 w-3.5 mr-1" />Send Next Doc
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {docs?.map(doc => {
          const tmpl = (doc as any).document_templates;
          return (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
              {statusIcon(doc.status ?? "pending")}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tmpl?.name || "Document"}</span>
                  <Badge variant="secondary" className="text-[10px]">{tmpl?.document_type || "doc"}</Badge>
                </div>
                {doc.signed_at && (
                  <p className="text-[10px] text-muted-foreground">Signed {format(new Date(doc.signed_at), "MMM d, yyyy")}</p>
                )}
              </div>
              {statusBadge(doc.status ?? "pending")}
            </div>
          );
        })}
        {total === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No documents assigned yet. Send documents from the Signatures page.</p>
        )}
      </div>

      {allDone && isActive && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-500/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">All documents signed!</span>
          </div>
          <Button size="sm" onClick={onComplete}>Continue to Billing →</Button>
        </div>
      )}
    </div>
  );
}
