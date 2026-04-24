import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock, Package } from "lucide-react";
import { addDays } from "date-fns";
import { useWorkflowActions } from "./useWorkflowActions";
import { INTEREST_ICONS } from "./types";

interface Props {
  lead: any;
  campaignId: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  cat_1: "Surgical/Procedural",
  cat_2: "Interventional/Diagnostic",
  cat_3: "Primary Treatment/Chiro/PT",
  cat_4: "Ancillary/Support",
};

export default function StagePitchDeal({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const scraped = lead.scraped_leads;
  const [selectedPkg, setSelectedPkg] = useState(lead.selected_package_id || "");
  const [saving, setSaving] = useState(false);

  const { data: packages } = useQuery({
    queryKey: ["service-packages-active"],
    queryFn: async () => {
      const { data } = await supabase.from("service_packages").select("*").eq("is_active", true).order("display_order");
      return data || [];
    },
  });

  const { data: packageDocs } = useQuery({
    queryKey: ["package-docs-all"],
    queryFn: async () => {
      const { data } = await supabase.from("package_documents").select("*, document_templates(name, short_code)").order("signing_order");
      return data || [];
    },
  });

  const { data: rateCards } = useQuery({
    queryKey: ["rate-cards-active"],
    queryFn: async () => {
      const { data } = await supabase.from("rate_cards").select("*, specialty_categories(name, short_code), membership_tiers(name, short_code), geographic_markets(name, short_code)").eq("is_active", true);
      return data || [];
    },
  });

  const { data: tiers } = useQuery({
    queryKey: ["membership-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("membership_tiers").select("*").eq("is_active", true).order("display_order");
      return data || [];
    },
  });

  const handleContinue = async () => {
    setSaving(true);
    const pkg = packages?.find((p: any) => p.id === selectedPkg);
    await actions.updateLead({
      workflow_stage: "send_terms",
      selected_package_id: selectedPkg,
      deal_type_interest: pkg?.name || null,
    });
    await actions.logActivity("deal_selected", `Selected package: ${pkg?.name || selectedPkg}`, "deal_selected");
    await actions.logActivity("stage_change", "Advanced to send term sheet", "send_terms");
    setSaving(false);
  };

  const handleFollowUp = async () => {
    setSaving(true);
    if (selectedPkg) {
      await actions.updateLead({ selected_package_id: selectedPkg });
    }
    const date = addDays(new Date(), 3);
    await actions.updateLead({ next_follow_up: date.toISOString() });
    await actions.logActivity("note", "Provider needs to think about it — follow-up scheduled");
    setSaving(false);
  };

  const docsForPackage = (pkgId: string) => {
    return (packageDocs || []).filter((pd: any) => pd.package_id === pkgId);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Select Deal for {scraped?.business_name}</h3>

      {/* Qualification summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-3 pb-3 flex flex-wrap gap-3 text-sm">
          {lead.qualification_category && (
            <Badge variant="secondary">{CATEGORY_LABELS[lead.qualification_category] || lead.qualification_category}</Badge>
          )}
          {lead.qualification_locations > 1 && (
            <Badge variant="secondary">{lead.qualification_locations} locations</Badge>
          )}
          {lead.interest_level && (
            <Badge variant="secondary">{INTEREST_ICONS[lead.interest_level]} {lead.interest_level}</Badge>
          )}
        </CardContent>
      </Card>

      {/* Package selector */}
      {packages && packages.length > 0 ? (
        <div className="space-y-2">
          {packages.map((pkg: any) => {
            const docs = docsForPackage(pkg.id);
            const isSelected = selectedPkg === pkg.id;
            return (
              <Card
                key={pkg.id}
                className={`cursor-pointer transition-all ${isSelected ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
                onClick={() => setSelectedPkg(pkg.id)}
              >
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{pkg.name}</span>
                  </div>
                  {pkg.description && <p className="text-xs text-muted-foreground mt-1">{pkg.description}</p>}
                  {docs.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {docs.map((d: any) => (
                        <Badge key={d.id} variant="outline" className="text-[10px]">
                          {d.document_templates?.short_code || d.document_templates?.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-4 text-sm text-muted-foreground">
            No service packages configured yet. You can still proceed — packages can be set up in Settings.
          </CardContent>
        </Card>
      )}

      {/* Pricing estimate */}
      {selectedPkg && rateCards && rateCards.length > 0 && lead.qualification_category && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-medium text-primary mb-2">Estimated Pricing</p>
            <div className="space-y-1">
              {tiers?.map((tier: any) => {
                const rate = rateCards.find((rc: any) =>
                  rc.specialty_categories?.short_code?.toLowerCase().includes(lead.qualification_category?.replace("cat_", "")) ||
                  rc.membership_tiers?.id === tier.id
                );
                return (
                  <div key={tier.id} className="flex justify-between text-sm">
                    <span>{tier.name}</span>
                    <span className="font-medium">{rate ? `$${rate.monthly_rate}/mo` : '—'}</span>
                  </div>
                );
              })}
            </div>
            {lead.qualification_locations > 1 && (
              <p className="text-xs text-muted-foreground mt-2">× {lead.qualification_locations} locations (multi-location discounts may apply)</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={handleContinue} disabled={!selectedPkg || saving}>
          Send Term Sheet <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
        <Button variant="outline" onClick={handleFollowUp} disabled={saving}>
          <Clock className="h-4 w-4 mr-1" /> They need time
        </Button>
      </div>
    </div>
  );
}
