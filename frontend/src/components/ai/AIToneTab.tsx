import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Briefcase, Smile, GraduationCap, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AIConfig {
  id: string;
  feature_name: string;
  enabled: boolean;
  settings: Record<string, any>;
}

const TONE_OPTIONS = [
  { value: "professional", label: "Professional", icon: Briefcase, desc: "Formal, authoritative, business-appropriate" },
  { value: "friendly", label: "Friendly & Approachable", icon: Smile, desc: "Warm, conversational, encouraging" },
  { value: "expert", label: "Industry Expert", icon: GraduationCap, desc: "Deep expertise, references regulations" },
  { value: "concise", label: "Concise & Direct", icon: Zap, desc: "Short sentences, no filler, bullet points" },
];

export function AIToneTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedTone, setSelectedTone] = useState("professional");
  const [customPersona, setCustomPersona] = useState("");
  const [sampleQuestion, setSampleQuestion] = useState("What happens when my contract expires?");
  const [previewResponse, setPreviewResponse] = useState("");
  const [isPreviewing, setIsPreviewing] = useState(false);

  const { data: config } = useQuery({
    queryKey: ["ai-config-tone"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("ai_config").select("*").eq("feature_name", "tone_personality").single();
      if (data) {
        setSelectedTone(data.settings?.style || "professional");
        setCustomPersona(data.settings?.custom_persona || "");
      }
      return data as AIConfig | null;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("ai_config").update({
        settings: { style: selectedTone, custom_persona: customPersona },
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }).eq("feature_name", "tone_personality");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-config-tone"] });
      toast({ title: "Tone settings saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const handlePreview = async () => {
    setIsPreviewing(true);
    setPreviewResponse("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-features", {
        body: { action: "tone_preview", style: selectedTone, custom_persona: customPersona, sample_question: sampleQuestion },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreviewResponse(data.response || "No response");
    } catch (e: any) {
      toast({ title: "Preview failed", description: e.message, variant: "destructive" });
    } finally {
      setIsPreviewing(false);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader>
          <CardTitle>AI Tone & Personality</CardTitle>
          <CardDescription>Choose how the AI communicates across all platform features. This tone is injected into every AI interaction.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Tone Selection Grid */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Communication Style</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TONE_OPTIONS.map(tone => (
                <button
                  key={tone.value}
                  onClick={() => setSelectedTone(tone.value)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    selectedTone === tone.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <tone.icon className={`h-4 w-4 ${selectedTone === tone.value ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-medium text-foreground">{tone.label}</span>
                    {selectedTone === tone.value && <Badge className="ml-auto text-xs">Active</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{tone.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Persona */}
          <div>
            <Label>Custom Persona Instructions (Optional)</Label>
            <Textarea
              value={customPersona}
              onChange={e => setCustomPersona(e.target.value)}
              placeholder="e.g., Always mention our 24/7 support. Never reference competitor names. Focus on personal injury industry specifics..."
              className="mt-1"
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">These instructions are added to every AI prompt across the platform.</p>
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Tone Settings
          </Button>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Live Preview</CardTitle>
          <CardDescription>Test how the AI responds with your selected tone and persona</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={sampleQuestion}
              onChange={e => setSampleQuestion(e.target.value)}
              placeholder="Type a question to preview..."
              className="flex-1"
              onKeyDown={e => e.key === "Enter" && handlePreview()}
            />
            <Button onClick={handlePreview} disabled={isPreviewing}>
              {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>

          {previewResponse && (
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="text-xs">{TONE_OPTIONS.find(t => t.value === selectedTone)?.label}</Badge>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                <ReactMarkdown>{previewResponse}</ReactMarkdown>
              </div>
            </div>
          )}

          {!previewResponse && !isPreviewing && (
            <div className="p-8 text-center text-muted-foreground border border-dashed rounded-lg">
              <p className="text-sm">Click the send button to preview the AI response</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
