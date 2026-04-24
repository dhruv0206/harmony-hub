import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const LF_PORTAL_ITEMS = [
  { key: "logged_in", label: "Firm has logged into their portal at least once" },
  { key: "profile_complete", label: "Firm profile is complete (name, address, website)" },
  { key: "contacts_configured", label: "Primary signer and contacts are configured" },
  { key: "practice_areas_set", label: "Practice areas and licensed states are set" },
];

interface Props {
  workflowId: string;
  lawFirmId: string;
  portalChecklist: Record<string, boolean>;
  isActive: boolean;
  onComplete: () => void;
}

export default function LawFirmOnboardingPortal({ workflowId, lawFirmId, portalChecklist, isActive, onComplete }: Props) {
  const queryClient = useQueryClient();
  const [checklist, setChecklist] = useState<Record<string, boolean>>(portalChecklist);

  const allChecked = LF_PORTAL_ITEMS.every(item => checklist[item.key]);

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
      <p className="text-sm text-muted-foreground">Verify that the law firm can access everything on their portal.</p>

      <div className="space-y-2">
        {LF_PORTAL_ITEMS.map(item => (
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
