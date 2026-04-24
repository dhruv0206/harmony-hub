import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Award, Plus, X, GripVertical, Save } from "lucide-react";
import { toast } from "sonner";

export default function TierFeaturesSection() {
  const queryClient = useQueryClient();
  const [editingTier, setEditingTier] = useState<string | null>(null);
  const [features, setFeatures] = useState<string[]>([]);
  const [newFeature, setNewFeature] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: tiers } = useQuery({
    queryKey: ["membership-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("membership_tiers").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const startEdit = (tierId: string, currentFeatures: string[]) => {
    setEditingTier(tierId);
    setFeatures([...currentFeatures]);
    setNewFeature("");
  };

  const cancelEdit = () => {
    setEditingTier(null);
    setFeatures([]);
  };

  const addFeature = () => {
    const trimmed = newFeature.trim();
    if (!trimmed || features.includes(trimmed)) return;
    setFeatures([...features, trimmed]);
    setNewFeature("");
  };

  const removeFeature = (index: number) => {
    setFeatures(features.filter((_, i) => i !== index));
  };

  const moveFeature = (from: number, to: number) => {
    if (to < 0 || to >= features.length) return;
    const next = [...features];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setFeatures(next);
  };

  const saveTierFeatures = async () => {
    if (!editingTier) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("membership_tiers")
        .update({ features: features as any })
        .eq("id", editingTier);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["membership-tiers"] });
      setEditingTier(null);
      toast.success("Tier features updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const tierColors = ["border-muted", "border-primary/30", "border-primary"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Award className="h-5 w-5" />
          Tier Features
        </CardTitle>
        <CardDescription>Manage features included in each membership tier</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {tiers?.map((tier, idx) => {
            const tierFeatures = (tier.features as string[]) ?? [];
            const isEditing = editingTier === tier.id;

            return (
              <div key={tier.id} className={`border-2 rounded-lg p-4 ${tierColors[idx] ?? "border-muted"}`}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-semibold">{tier.name}</h3>
                    <p className="text-xs text-muted-foreground">{tier.short_code}</p>
                  </div>
                  {!isEditing ? (
                    <Button size="sm" variant="ghost" onClick={() => startEdit(tier.id, tierFeatures)}>
                      Edit
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancel</Button>
                      <Button size="sm" onClick={saveTierFeatures} disabled={saving}>
                        <Save className="h-3.5 w-3.5 mr-1" />Save
                      </Button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    {features.map((f, i) => (
                      <div key={i} className="flex items-center gap-1 text-sm bg-muted/30 rounded px-2 py-1">
                        <div className="flex flex-col">
                          <button onClick={() => moveFeature(i, i - 1)} className="text-muted-foreground hover:text-foreground text-[10px] leading-none">▲</button>
                          <button onClick={() => moveFeature(i, i + 1)} className="text-muted-foreground hover:text-foreground text-[10px] leading-none">▼</button>
                        </div>
                        <span className="flex-1 truncate">{f}</span>
                        <button onClick={() => removeFeature(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-1 mt-2">
                      <Input
                        placeholder="Add feature..."
                        value={newFeature}
                        onChange={(e) => setNewFeature(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addFeature()}
                        className="text-sm h-8"
                      />
                      <Button size="sm" variant="outline" className="h-8" onClick={addFeature} disabled={!newFeature.trim()}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {tierFeatures.map((f, i) => (
                      <li key={i} className="text-sm flex items-start gap-1.5">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
