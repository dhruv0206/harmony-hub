import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, Clock, Send, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  workflowId: string;
  lawFirmId: string;
  packageId?: string;
  isActive: boolean;
  onComplete: () => void;
}

export default function LawFirmOnboardingDocuments({ workflowId, lawFirmId, packageId, isActive, onComplete }: Props) {
  const { data: docs } = useQuery({
    queryKey: ["onboarding-lf-docs", lawFirmId],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firm_documents")
        .select("*, document_templates(name, document_type)")
        .eq("law_firm_id", lawFirmId)
        .order("signing_order");
      return data ?? [];
    },
  });

  const signed = docs?.filter(d => d.status === "signed" || d.status === "fully_executed").length ?? 0;
  const total = docs?.length ?? 0;
  const allSigned = total > 0 && signed >= total;
  const pct = total > 0 ? (signed / total) * 100 : 0;

  const statusBadge = (status: string) => {
    switch (status) {
      case "signed": case "fully_executed": return <Badge className="bg-green-500/10 text-green-600 text-[10px]">Signed</Badge>;
      case "sent": return <Badge className="bg-blue-500/10 text-blue-600 text-[10px]">Sent</Badge>;
      case "viewed": return <Badge className="bg-amber-500/10 text-amber-600 text-[10px]">Viewed</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Progress value={pct} className="h-2 w-32" />
          <span className="text-sm text-muted-foreground">{signed}/{total} documents signed</span>
        </div>
      </div>
      <div className="space-y-2">
        {docs?.map((doc, i) => (
          <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              doc.status === "signed" || doc.status === "fully_executed" ? "bg-green-100 dark:bg-green-950/30 text-green-600" : "bg-muted text-muted-foreground"
            }`}>
              {doc.status === "signed" || doc.status === "fully_executed" ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{(doc as any).document_templates?.name || "Document"}</p>
              <p className="text-xs text-muted-foreground">Order #{doc.signing_order ?? i + 1}</p>
            </div>
            {statusBadge(doc.status)}
          </div>
        ))}
        {total === 0 && <p className="text-sm text-muted-foreground text-center py-4">No documents assigned. Assign a service package first.</p>}
      </div>
      {allSigned && isActive && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-500/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-700 dark:text-green-400">All documents signed!</span>
          </div>
          <Button size="sm" onClick={onComplete}>Continue to Billing Setup →</Button>
        </div>
      )}
    </div>
  );
}
