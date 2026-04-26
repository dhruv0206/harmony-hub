import { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PenTool, Trash2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface SavedSignatureCardProps {
  /** Existing data URL on the user's profile, if any. */
  current: string | null;
}

/**
 * Lets the user save a signature to their profile so they can apply it
 * with one click on every signing page (and admins can apply it
 * automatically when "I sign now" mode is picked at contract creation).
 */
export default function SavedSignatureCard({ current }: SavedSignatureCardProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const padRef = useRef<SignatureCanvas>(null);
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typedName, setTypedName] = useState("");
  const [typedPreview, setTypedPreview] = useState<string | null>(null);

  // Render the typed name to a canvas → data URL so it stores like a drawn sig.
  useEffect(() => {
    if (tab !== "type" || !typedName.trim()) {
      setTypedPreview(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 100;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a1a1a";
    ctx.font = '52px "Dancing Script", cursive';
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, 20, canvas.height / 2);
    setTypedPreview(canvas.toDataURL("image/png"));
  }, [typedName, tab]);

  const save = useMutation({
    mutationFn: async (dataUrl: string) => {
      const { error } = await supabase
        .from("profiles")
        .update({
          saved_signature_data: dataUrl,
          saved_signature_updated_at: new Date().toISOString(),
        })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-saved-signature"] });
      padRef.current?.clear();
      setTypedName("");
      setTypedPreview(null);
      toast.success("Signature saved");
    },
    onError: (e: any) => toast.error(e?.message || "Could not save signature"),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ saved_signature_data: null, saved_signature_updated_at: null })
        .eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-saved-signature"] });
      toast.success("Saved signature removed");
    },
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });

  const handleSaveDrawn = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Please draw a signature first.");
      return;
    }
    save.mutate(pad.toDataURL("image/png"));
  };

  const handleSaveTyped = () => {
    if (!typedPreview) {
      toast.error("Please type your signature first.");
      return;
    }
    save.mutate(typedPreview);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><PenTool className="h-5 w-5" /> Saved Signature</CardTitle>
        <CardDescription>
          Save a signature once and apply it with one click on every signing page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {current && (
          <div className="border rounded-lg p-3 bg-muted/30 flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-sm font-medium mb-2">
                <CheckCircle className="h-4 w-4 text-success" /> Current signature
              </div>
              <img src={current} alt="Saved signature" className="bg-white border rounded max-h-24" />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.confirm("Remove your saved signature?")) remove.mutate();
              }}
              disabled={remove.isPending}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-2">{current ? "Replace" : "Create"} your signature</p>
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full max-w-xs">
              <TabsTrigger value="draw">Draw</TabsTrigger>
              <TabsTrigger value="type">Type</TabsTrigger>
            </TabsList>
            <TabsContent value="draw" className="space-y-2 pt-3">
              <div className="border-2 border-dashed border-primary/30 rounded-lg bg-white flex items-center justify-center p-2">
                <SignatureCanvas
                  ref={padRef}
                  penColor="#1a1a1a"
                  canvasProps={{
                    className: "rounded touch-none",
                    width: 500,
                    height: 150,
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => padRef.current?.clear()}>Clear</Button>
                <Button size="sm" onClick={handleSaveDrawn} disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save signature"}
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="type" className="space-y-2 pt-3">
              <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet" />
              <Input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Your full name"
                maxLength={50}
              />
              {typedPreview && (
                <div className="border rounded-lg p-4 bg-white text-center">
                  <span style={{ fontFamily: "'Dancing Script', cursive", fontSize: 40, color: "#1a1a1a" }}>
                    {typedName}
                  </span>
                </div>
              )}
              <Button size="sm" onClick={handleSaveTyped} disabled={save.isPending || !typedPreview}>
                {save.isPending ? "Saving…" : "Save signature"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
}
