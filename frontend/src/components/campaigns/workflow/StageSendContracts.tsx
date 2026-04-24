import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Send, AlertTriangle, UserPlus } from "lucide-react";
import { useWorkflowActions } from "./useWorkflowActions";

interface Props {
  lead: any;
  campaignId: string;
}

export default function StageSendContracts({ lead, campaignId }: Props) {
  const actions = useWorkflowActions(lead.id, campaignId);
  const scraped = lead.scraped_leads;
  const [saving, setSaving] = useState(false);
  const [excludedDocs, setExcludedDocs] = useState<Set<string>>(new Set());

  const { data: packageDocs } = useQuery({
    queryKey: ["pkg-docs-for-send", lead.selected_package_id],
    queryFn: async () => {
      if (!lead.selected_package_id) return [];
      const { data } = await supabase
        .from("package_documents")
        .select("*, document_templates(id, name, short_code, document_type)")
        .eq("package_id", lead.selected_package_id)
        .order("signing_order");
      return data || [];
    },
    enabled: !!lead.selected_package_id,
  });

  // Check if provider exists
  const { data: existingProvider } = useQuery({
    queryKey: ["provider-for-lead", scraped?.id],
    queryFn: async () => {
      if (!scraped?.business_name) return null;
      const { data } = await supabase
        .from("providers")
        .select("id, business_name, status")
        .ilike("business_name", scraped.business_name)
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!scraped?.business_name,
  });

  const toggleDoc = (docId: string) => {
    const next = new Set(excludedDocs);
    if (next.has(docId)) next.delete(docId); else next.add(docId);
    setExcludedDocs(next);
  };

  const handleCreateProvider = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.from("providers").insert({
        business_name: scraped?.business_name || "Unknown",
        contact_email: scraped?.email || null,
        phone: scraped?.phone || null,
        address: scraped?.address || null,
        city: scraped?.city || null,
        state: scraped?.state || null,
        zip_code: scraped?.zip_code || null,
        website: scraped?.website || null,
        status: "prospect",
        specialty: lead.qualification_category || null,
        service_package_id: lead.selected_package_id || null,
      } as any).select().single();
      if (error) throw error;
      await actions.updateLead({ converted_provider_id: data.id });
      await actions.logActivity("note", `Provider account created: ${data.business_name}`);
    } catch (e: any) {
      actions.invalidate();
    }
    setSaving(false);
  };

  const handleSendContracts = async () => {
    setSaving(true);
    const providerId = existingProvider?.id || lead.converted_provider_id;
    if (!providerId) return;

    try {
      const docsToSend = (packageDocs || []).filter((d: any) => !excludedDocs.has(d.id));
      const inserts = docsToSend.map((pd: any) => ({
        provider_id: providerId,
        template_id: pd.template_id,
        package_id: lead.selected_package_id,
        signing_order: pd.signing_order,
        status: "pending",
      }));

      if (inserts.length > 0) {
        await supabase.from("provider_documents").insert(inserts);
      }

      await actions.updateLead({
        workflow_stage: "contracts_signed",
        contracts_sent_at: new Date().toISOString(),
        converted_provider_id: providerId,
      });
      await actions.logActivity("contracts_sent", `${inserts.length} contracts sent for signature`, "sent");
      await actions.logActivity("stage_change", "Advanced to contracts tracking", "contracts_signed");
    } catch (e: any) {
      // error handled by toast in actions
    }
    setSaving(false);
  };

  const providerId = existingProvider?.id || lead.converted_provider_id;
  const needsProvider = !providerId;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Send Contracts to {scraped?.business_name}</h3>

      {/* Provider check */}
      {needsProvider && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="pt-3 pb-3 space-y-2">
            <div className="flex items-center gap-2 text-sm text-warning">
              <AlertTriangle className="h-4 w-4" />
              A provider account needs to be created first
            </div>
            <Button size="sm" onClick={handleCreateProvider} disabled={saving}>
              <UserPlus className="h-4 w-4 mr-1" /> Create Provider Account
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Document list */}
      {packageDocs && packageDocs.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Documents to send</p>
          {packageDocs.map((pd: any) => {
            const tmpl = pd.document_templates;
            const isExcluded = excludedDocs.has(pd.id);
            return (
              <div key={pd.id} className={`flex items-center gap-3 p-2 border rounded-lg ${isExcluded ? 'opacity-50' : ''}`}>
                <Checkbox
                  checked={!isExcluded}
                  onCheckedChange={() => toggleDoc(pd.id)}
                />
                <div className="flex-1">
                  <span className="text-sm font-medium">{tmpl?.name || 'Document'}</span>
                  <Badge variant="outline" className="ml-2 text-[10px]">{tmpl?.document_type}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">Order {pd.signing_order}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No package documents configured. You can still advance this lead.</p>
      )}

      <Button
        className="w-full"
        onClick={handleSendContracts}
        disabled={saving || needsProvider}
      >
        <Send className="h-4 w-4 mr-1" /> Send All Documents for Signature
      </Button>
    </div>
  );
}
