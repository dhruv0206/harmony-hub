import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { X, Phone, MapPin, Globe, Mail, Star, ChevronDown, ExternalLink } from "lucide-react";
import WorkflowProgressBar from "./WorkflowProgressBar";
import StageCallAttempt from "./StageCallAttempt";
import StageQualification from "./StageQualification";
import StagePitchDeal from "./StagePitchDeal";
import StageSendTerms from "./StageSendTerms";
import StageTermsReview from "./StageTermsReview";
import StageSendContracts from "./StageSendContracts";
import StageContractsSigned from "./StageContractsSigned";
import StageConverted from "./StageConverted";
import StageDeadLead from "./StageDeadLead";
import ActivityLog from "./ActivityLog";
import { STAGE_BADGE_COLORS, WORKFLOW_STAGES } from "./types";
import type { WorkflowStage } from "./types";

interface Props {
  lead: any;
  campaignId: string;
  onClose: () => void;
}

export default function LeadWorkflowPanel({ lead, campaignId, onClose }: Props) {
  const [infoExpanded, setInfoExpanded] = useState(false);
  const scraped = lead.scraped_leads;
  const stage = (lead.workflow_stage || "call_attempt") as WorkflowStage;
  const stageLabel = stage === "dead"
    ? "Lost"
    : WORKFLOW_STAGES.find(s => s.key === stage)?.label || stage;

  const renderStageContent = () => {
    switch (stage) {
      case "call_attempt": return <StageCallAttempt lead={lead} campaignId={campaignId} />;
      case "qualification": return <StageQualification lead={lead} campaignId={campaignId} />;
      case "pitch_deal": return <StagePitchDeal lead={lead} campaignId={campaignId} />;
      case "send_terms": return <StageSendTerms lead={lead} campaignId={campaignId} />;
      case "terms_review": return <StageTermsReview lead={lead} campaignId={campaignId} />;
      case "send_contracts": return <StageSendContracts lead={lead} campaignId={campaignId} />;
      case "contracts_signed": return <StageContractsSigned lead={lead} campaignId={campaignId} />;
      case "converted": return <StageConverted lead={lead} campaignId={campaignId} />;
      case "dead": return <StageDeadLead lead={lead} campaignId={campaignId} />;
      default: return <StageCallAttempt lead={lead} campaignId={campaignId} />;
    }
  };

  return (
    <div className="h-full flex flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-start justify-between p-4 border-b">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{scraped?.business_name || "Unknown Lead"}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={STAGE_BADGE_COLORS[stage] || ''}>
              {stageLabel}
            </Badge>
            {scraped?.ai_score && (
              <Badge variant="outline" className="text-[10px]">
                <Star className="h-3 w-3 mr-1 text-yellow-500" />AI: {scraped.ai_score}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Progress bar */}
      <WorkflowProgressBar currentStage={stage} deadAtStage={lead.dead_at_stage} />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
        {/* Contact info - collapsible */}
        <Collapsible open={infoExpanded} onOpenChange={setInfoExpanded}>
          <div className="text-sm space-y-1">
            {scraped?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={`tel:${scraped.phone}`} className="text-primary hover:underline">{scraped.phone}</a>
              </div>
            )}
            {(scraped?.city || scraped?.state) && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{[scraped?.city, scraped?.state].filter(Boolean).join(", ")}</span>
              </div>
            )}
          </div>

          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs px-0 h-6 text-muted-foreground">
              {infoExpanded ? "Show less" : "Show more"} <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${infoExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent className="text-sm space-y-1 mt-1">
            {scraped?.email && (
              <div className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={`mailto:${scraped.email}`} className="text-primary hover:underline">{scraped.email}</a>
              </div>
            )}
            {scraped?.address && (
              <div className="flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{scraped.address}</span>
              </div>
            )}
            {scraped?.website && (
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <a href={scraped.website} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1">
                  Website <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {scraped?.ai_summary && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1">{scraped.ai_summary}</p>
            )}
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Stage-specific content */}
        {renderStageContent()}

        <Separator />

        {/* Activity log */}
        <ActivityLog leadId={lead.id} />
      </div>
    </div>
  );
}
