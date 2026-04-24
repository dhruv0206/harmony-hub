import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PORTAL_ITEMS = [
  { key: "logged_in", label: "Provider has logged into their portal at least once" },
  { key: "profile_complete", label: "Provider profile is 100% complete (name, NPI, tax ID, license, insurance, address)" },
  { key: "viewed_documents", label: "Provider has viewed their documents section" },
  { key: "market_assigned", label: "Provider's primary location has a market tier assigned" },
];

interface Props {
  workflowId: string;
  providerId: string;
  portalChecklist: Record<string, boolean>;
  isActive: boolean;
  onComplete: () => void;
}

export default function OnboardingStagePortal({ workflowId, providerId, portalChecklist, isActive, onComplete }: Props) {
  const queryClient = useQueryClient();
  const [checklist, setChecklist] = useState<Record<string, boolean>>(portalChecklist);

  const allChecked = PORTAL_ITEMS.every(item => checklist[item.key]);

  const saveChecklist = useMutation({
    mutationFn: async () => {
      await supabase.from("onboarding_workflows").update({
        portal_checklist: checklist,
      } as any).eq("id", workflowId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-detail"] });
      toast.success("Portal checklist saved");
    },
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Verify that the provider can access everything on their portal.</p>

      <div className="space-y-2">
        {PORTAL_ITEMS.map(item => (
          <div key={item.key} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
            <Checkbox
              checked={!!checklist[item.key]}
              onCheckedChange={(checked) => setChecklist({ ...checklist, [item.key]: !!checked })}
            />
            <span className="text-sm">{item.label}</span>
            {checklist[item.key] && <CheckCircle2 className="h-4 w-4 text-green-500 ml-auto" />}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => saveChecklist.mutate()}>Save</Button>
        {isActive && allChecked && (
          <Button size="sm" onClick={() => { saveChecklist.mutate(); onComplete(); }}>
            Continue to Go Live →
          </Button>
        )}
      </div>
    </div>
  );
}
