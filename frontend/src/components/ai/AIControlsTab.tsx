import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, DollarSign, ShieldAlert, X, Plus } from "lucide-react";

interface AIConfig {
  id: string;
  feature_name: string;
  enabled: boolean;
  settings: Record<string, any>;
}

export function AIControlsTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Budget state
  const [monthlyLimit, setMonthlyLimit] = useState(100);
  const [alertThreshold, setAlertThreshold] = useState(80);
  const [autoDisable, setAutoDisable] = useState(100);

  // Content policy state
  const [excludedTopics, setExcludedTopics] = useState<string[]>([]);
  const [blockedPhrases, setBlockedPhrases] = useState<string[]>([]);
  const [allowedPhrases, setAllowedPhrases] = useState<string[]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [newBlocked, setNewBlocked] = useState("");
  const [newAllowed, setNewAllowed] = useState("");
  const [dataRetention, setDataRetention] = useState("90");

  // Auto-responder state
  const [autoResponderEnabled, setAutoResponderEnabled] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [requireReview, setRequireReview] = useState(true);

  const { data: configs } = useQuery({
    queryKey: ["ai-configs-controls"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("ai_config").select("*");
      return (data || []) as AIConfig[];
    },
  });

  useEffect(() => {
    if (!configs) return;
    const budget = configs.find(c => c.feature_name === "budget");
    if (budget?.settings) {
      setMonthlyLimit(budget.settings.monthly_limit_usd || 100);
      setAlertThreshold(budget.settings.alert_threshold_pct || 80);
      setAutoDisable(budget.settings.auto_disable_pct || 100);
      setDataRetention(String(budget.settings.data_retention_days || 90));
    }
    const policy = configs.find(c => c.feature_name === "content_policy");
    if (policy?.settings) {
      setExcludedTopics(policy.settings.excluded_topics || []);
      setBlockedPhrases(policy.settings.blocked_phrases || []);
      setAllowedPhrases(policy.settings.allowed_phrases || []);
    }
    const autoResp = configs.find(c => c.feature_name === "auto_responder");
    if (autoResp) {
      setAutoResponderEnabled(autoResp.enabled);
      setConfidenceThreshold(autoResp.settings?.confidence_threshold || 85);
      setRequireReview(autoResp.settings?.require_review !== false);
    }
  }, [configs]);

  const saveMutation = useMutation({
    mutationFn: async (updates: { feature_name: string; settings?: any; enabled?: boolean }[]) => {
      for (const u of updates) {
        const updateData: any = { updated_by: user?.id, updated_at: new Date().toISOString() };
        if (u.settings !== undefined) updateData.settings = u.settings;
        if (u.enabled !== undefined) updateData.enabled = u.enabled;
        const { error } = await (supabase as any).from("ai_config").update(updateData).eq("feature_name", u.feature_name);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs-controls"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handleSaveAll = () => {
    saveMutation.mutate([
      {
        feature_name: "budget",
        settings: { monthly_limit_usd: monthlyLimit, alert_threshold_pct: alertThreshold, auto_disable_pct: autoDisable, data_retention_days: parseInt(dataRetention) },
      },
      {
        feature_name: "content_policy",
        settings: { excluded_topics: excludedTopics, blocked_phrases: blockedPhrases, allowed_phrases: allowedPhrases },
      },
      {
        feature_name: "auto_responder",
        enabled: autoResponderEnabled,
        settings: { confidence_threshold: confidenceThreshold, require_review: requireReview },
      },
    ]);
  };

  // Simulated current usage
  const currentUsage = 0;
  const usagePct = monthlyLimit > 0 ? Math.min(100, (currentUsage / monthlyLimit) * 100) : 0;

  const addItem = (list: string[], setList: (v: string[]) => void, value: string, setValue: (v: string) => void) => {
    if (value.trim() && !list.includes(value.trim())) {
      setList([...list, value.trim()]);
      setValue("");
    }
  };

  const removeItem = (list: string[], setList: (v: string[]) => void, idx: number) => {
    setList(list.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Budget */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />API Cost Budget</CardTitle>
          <CardDescription>Set spending limits and alerts for AI usage</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="flex justify-between mb-2">
              <Label>Current Usage</Label>
              <span className="text-sm text-muted-foreground">${currentUsage.toFixed(2)} / ${monthlyLimit}</span>
            </div>
            <Progress value={usagePct} className="h-3" />
          </div>

          <div>
            <Label>Monthly Budget: ${monthlyLimit}</Label>
            <Slider value={[monthlyLimit]} onValueChange={([v]) => setMonthlyLimit(v)} min={10} max={500} step={10} className="mt-2" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Alert at: {alertThreshold}%</Label>
              <Slider value={[alertThreshold]} onValueChange={([v]) => setAlertThreshold(v)} min={50} max={100} step={5} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">Send notification when usage hits this level</p>
            </div>
            <div>
              <Label>Auto-disable at: {autoDisable}%</Label>
              <Slider value={[autoDisable]} onValueChange={([v]) => setAutoDisable(v)} min={80} max={150} step={5} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-1">Disable non-critical features at this level</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Responder Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary" />Auto-Responder Configuration</CardTitle>
          <CardDescription>Configure AI to automatically respond to support tickets</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">Enable Auto-Responder</p>
              <p className="text-xs text-muted-foreground">AI will auto-respond to qualifying tickets</p>
            </div>
            <Switch checked={autoResponderEnabled} onCheckedChange={setAutoResponderEnabled} />
          </div>

          {autoResponderEnabled && (
            <>
              <div>
                <Label>Confidence Threshold: {confidenceThreshold}%</Label>
                <Slider value={[confidenceThreshold]} onValueChange={([v]) => setConfidenceThreshold(v)} min={50} max={100} step={5} className="mt-2" />
                <p className="text-xs text-muted-foreground mt-1">Only auto-respond when AI confidence exceeds this threshold</p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Require Human Review</p>
                  <p className="text-xs text-muted-foreground">AI drafts response, human approves before sending</p>
                </div>
                <Switch checked={requireReview} onCheckedChange={setRequireReview} />
              </div>

              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Auto-Escalation Rules:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Provider responds negatively → escalate to human</li>
                  <li>Provider asks to speak to a person → escalate immediately</li>
                  <li>Questions about billing, legal, or cancellation → always escalate</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Content Policy */}
      <Card>
        <CardHeader>
          <CardTitle>Content Policy</CardTitle>
          <CardDescription>Define what the AI should and shouldn't discuss</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Excluded Topics */}
          <div>
            <Label>Excluded Topics</Label>
            <p className="text-xs text-muted-foreground mb-2">The AI will avoid discussing these topics</p>
            <div className="flex gap-2 mb-2">
              <Input value={newTopic} onChange={e => setNewTopic(e.target.value)} placeholder="e.g., competitor names" onKeyDown={e => e.key === "Enter" && addItem(excludedTopics, setExcludedTopics, newTopic, setNewTopic)} />
              <Button size="sm" variant="outline" onClick={() => addItem(excludedTopics, setExcludedTopics, newTopic, setNewTopic)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {excludedTopics.map((t, i) => (
                <Badge key={i} variant="secondary" className="gap-1">{t}<X className="h-3 w-3 cursor-pointer" onClick={() => removeItem(excludedTopics, setExcludedTopics, i)} /></Badge>
              ))}
            </div>
          </div>

          {/* Blocked Phrases */}
          <div>
            <Label>Blocked Phrases</Label>
            <p className="text-xs text-muted-foreground mb-2">Phrases the AI must never use</p>
            <div className="flex gap-2 mb-2">
              <Input value={newBlocked} onChange={e => setNewBlocked(e.target.value)} placeholder="e.g., guaranteed results" onKeyDown={e => e.key === "Enter" && addItem(blockedPhrases, setBlockedPhrases, newBlocked, setNewBlocked)} />
              <Button size="sm" variant="outline" onClick={() => addItem(blockedPhrases, setBlockedPhrases, newBlocked, setNewBlocked)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {blockedPhrases.map((t, i) => (
                <Badge key={i} variant="destructive" className="gap-1">{t}<X className="h-3 w-3 cursor-pointer" onClick={() => removeItem(blockedPhrases, setBlockedPhrases, i)} /></Badge>
              ))}
            </div>
          </div>

          {/* Allowed Phrases */}
          <div>
            <Label>Preferred Phrases</Label>
            <p className="text-xs text-muted-foreground mb-2">Phrases the AI should prefer to use</p>
            <div className="flex gap-2 mb-2">
              <Input value={newAllowed} onChange={e => setNewAllowed(e.target.value)} placeholder="e.g., paper billing friendly" onKeyDown={e => e.key === "Enter" && addItem(allowedPhrases, setAllowedPhrases, newAllowed, setNewAllowed)} />
              <Button size="sm" variant="outline" onClick={() => addItem(allowedPhrases, setAllowedPhrases, newAllowed, setNewAllowed)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {allowedPhrases.map((t, i) => (
                <Badge key={i} variant="outline" className="gap-1 border-primary/50">{t}<X className="h-3 w-3 cursor-pointer" onClick={() => removeItem(allowedPhrases, setAllowedPhrases, i)} /></Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Retention */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">AI Log Retention</p>
              <p className="text-xs text-muted-foreground">How long to keep AI conversation logs</p>
            </div>
            <Select value={dataRetention} onValueChange={setDataRetention}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
                <SelectItem value="180">180 days</SelectItem>
                <SelectItem value="365">1 year</SelectItem>
                <SelectItem value="0">Forever</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSaveAll} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save All Controls
      </Button>
    </div>
  );
}
