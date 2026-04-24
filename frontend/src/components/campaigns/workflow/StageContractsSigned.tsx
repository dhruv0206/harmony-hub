import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Clock, Eye, Send, Phone } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { useWorkflowActions } from "./useWorkflowActions";

const STATUS_ICON: Record<string, React.ElementType> = {
  pending: Clock,
  sent: Send,
  viewed: Eye,
  signed: CheckCircle,
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  viewed: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  signed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

interface Props {
  lead: any;
  campaignId: string;
}

export default function StageContractsSigned({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const scraped = lead.scraped_leads;
  const providerId = lead.converted_provider_id;
  const [saving, setSaving] = useState(false);

  const { data: docs } = useQuery({
    queryKey: ["provider-docs-signing", providerId],
    queryFn: async () => {
      if (!providerId) return [];
      const { data } = await supabase
        .from("provider_documents")
        .select("*, document_templates(name, short_code)")
        .eq("provider_id", providerId)
        .neq("status", "voided")
        .order("signing_order");
      return data || [];
    },
    enabled: !!providerId,
  });

  const signedCount = docs?.filter((d: any) => d.status === "signed").length || 0;
  const totalDocs = docs?.length || 0;
  const allSigned = totalDocs > 0 && signedCount === totalDocs;
  const progressPct = totalDocs > 0 ? (signedCount / totalDocs) * 100 : 0;

  const handleAdvance = async () => {
    setSaving(true);
    await actions.updateLead({ workflow_stage: "converted" });
    await actions.logActivity("stage_change", "All contracts signed — ready to convert", "converted");
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Contract Progress for {scraped?.business_name}</h3>

      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span>{signedCount} of {totalDocs} documents signed</span>
          <span className="font-medium">{Math.round(progressPct)}%</span>
        </div>
        <Progress value={progressPct} className="h-2" />
      </div>

      <div className="space-y-2">
        {docs?.map((doc: any) => {
          const Icon = STATUS_ICON[doc.status] || Clock;
          return (
            <Card key={doc.id}>
              <CardContent className="pt-3 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-5">{doc.signing_order}</span>
                  <span className="text-sm font-medium">{doc.document_templates?.name || 'Document'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] ${STATUS_COLOR[doc.status] || ''}`}>
                    <Icon className="h-3 w-3 mr-1" />{doc.status}
                  </Badge>
                  {doc.signed_at && (
                    <span className="text-xs text-muted-foreground">{format(new Date(doc.signed_at), "MMM d")}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {!allSigned && (
        <Button variant="outline" className="w-full" disabled={saving}>
          <Phone className="h-4 w-4 mr-1" /> Follow Up on Unsigned Documents
        </Button>
      )}

      {allSigned && (
        <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={handleAdvance} disabled={saving}>
          <CheckCircle className="h-4 w-4 mr-1" /> All Signed — Convert to Provider
        </Button>
      )}

      {!allSigned && totalDocs > 0 && signedCount > 0 && (
        <Button variant="outline" className="w-full" onClick={handleAdvance} disabled={saving}>
          Skip to Conversion (Override)
        </Button>
      )}
    </div>
  );
}
