import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { key: "document", label: "Documents", desc: "Sent, signed, expired, declined" },
  { key: "billing", label: "Billing", desc: "Invoices, payments, past due, subscriptions" },
  { key: "onboarding", label: "Onboarding", desc: "Started, stage changes, go-live" },
  { key: "sales", label: "Sales", desc: "New leads, stage changes, deals closed" },
  { key: "support", label: "Support", desc: "Tickets created, replies, resolved" },
  { key: "reminder", label: "Calendar Reminders", desc: "Event reminders and schedule changes" },
  { key: "alert", label: "Alerts", desc: "Urgent system alerts and warnings" },
  { key: "system", label: "System", desc: "Profile, licenses, general updates" },
];

export default function NotificationPreferences() {
  const queryClient = useQueryClient();

  const { data: config } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_config")
        .select("*")
        .eq("feature_name", "notification_preferences")
        .single();
      return data;
    },
  });

  const prefs: Record<string, boolean> = (config?.settings as any) || {};
  const isEnabled = (key: string) => prefs[key] !== false; // default enabled

  const savePrefs = useMutation({
    mutationFn: async (newPrefs: Record<string, boolean>) => {
      if (config?.id) {
        await supabase.from("ai_config").update({ settings: newPrefs as any }).eq("id", config.id);
      } else {
        await supabase.from("ai_config").insert({
          feature_name: "notification_preferences",
          settings: newPrefs as any,
          enabled: true,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Preferences saved");
    },
  });

  const toggle = (key: string) => {
    const current = { ...prefs };
    current[key] = !isEnabled(key);
    savePrefs.mutate(current);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notification Preferences</CardTitle>
        <CardDescription>Control which notification categories are enabled platform-wide</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CATEGORIES.map(cat => (
          <div key={cat.key} className="flex items-center justify-between py-2">
            <div>
              <Label className="text-sm font-medium">{cat.label}</Label>
              <p className="text-xs text-muted-foreground">{cat.desc}</p>
            </div>
            <Switch checked={isEnabled(cat.key)} onCheckedChange={() => toggle(cat.key)} />
          </div>
        ))}
        <div className="pt-3 border-t">
          <div className="flex items-center justify-between py-2 opacity-50">
            <div>
              <Label className="text-sm font-medium">Email Notifications</Label>
              <p className="text-xs text-muted-foreground">Send email for each notification (coming soon)</p>
            </div>
            <Switch disabled />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
