import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ExternalLink, PartyPopper } from "lucide-react";
import { useWorkflowActions } from "./useWorkflowActions";

interface Props {
  lead: any;
  campaignId: string;
}

export default function StageConverted({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const navigate = useNavigate();
  const { user } = useAuth();
  const scraped = lead.scraped_leads;
  const [saving, setSaving] = useState(false);
  const [converted, setConverted] = useState(lead.status === "converted");

  const handleConvert = async () => {
    setSaving(true);
    try {
      const providerId = lead.converted_provider_id;

      if (providerId) {
        // Activate provider
        await supabase.from("providers").update({ status: "active" as any }).eq("id", providerId);

        // Start onboarding workflow
        await supabase.from("onboarding_workflows").insert({
          provider_id: providerId,
          initiated_by: user?.id,
          status: "not_started",
          total_steps: 5,
        });
      }

      await actions.updateLead({
        status: "converted",
        workflow_stage: "converted",
      });
      await actions.logActivity("converted", `Lead converted to active provider`, "converted");
      setConverted(true);
    } catch (e: any) {
      // handled
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      {converted ? (
        <>
          <div className="text-center py-6 space-y-3">
            <PartyPopper className="h-12 w-12 text-green-500 mx-auto" />
            <h3 className="text-xl font-bold text-green-600">Provider Activated!</h3>
            <p className="text-sm text-muted-foreground">{scraped?.business_name} is now an active provider</p>
          </div>

          {lead.converted_provider_id && (
            <Button
              className="w-full"
              onClick={() => navigate(`/providers/${lead.converted_provider_id}`)}
            >
              View Provider <ExternalLink className="h-4 w-4 ml-1" />
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="text-center py-4">
            <CheckCircle className="h-10 w-10 text-green-500 mx-auto mb-2" />
            <h3 className="text-lg font-bold">Ready to Activate {scraped?.business_name}</h3>
          </div>

          <Card className="bg-green-500/5 border-green-500/20">
            <CardContent className="pt-4 space-y-2 text-sm">
              {lead.deal_type_interest && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Package</span>
                  <Badge variant="secondary">{lead.deal_type_interest}</Badge>
                </div>
              )}
              {lead.qualification_category && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Category</span>
                  <span>{lead.qualification_category.replace("cat_", "Category ")}</span>
                </div>
              )}
              {lead.qualification_locations > 1 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Locations</span>
                  <span>{lead.qualification_locations}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p>This will:</p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Set provider status to active</li>
              <li>Start the onboarding workflow</li>
              <li>Mark this campaign lead as converted</li>
            </ul>
          </div>

          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            onClick={handleConvert}
            disabled={saving}
          >
            <CheckCircle className="h-4 w-4 mr-1" /> Convert to Active Provider
          </Button>
        </>
      )}
    </div>
  );
}
