import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MapPin, Save, Pencil, X } from "lucide-react";
import { toast } from "sonner";

export default function MarketDefinitionsSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCities, setEditCities] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: markets } = useQuery({
    queryKey: ["geographic-markets"],
    queryFn: async () => {
      const { data } = await supabase.from("geographic_markets").select("*").order("display_order");
      return data ?? [];
    },
  });

  const startEdit = (m: any) => {
    setEditingId(m.id);
    setEditDesc(m.description ?? "");
    setEditCities(m.example_cities ?? "");
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("geographic_markets")
        .update({ description: editDesc, example_cities: editCities })
        .eq("id", editingId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["geographic-markets"] });
      setEditingId(null);
      toast.success("Market updated");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <MapPin className="h-5 w-5" />
          Geographic Market Definitions
        </CardTitle>
        <CardDescription>Define market tiers and their rate multipliers</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {markets?.map((m) => {
            const isEditing = editingId === m.id;
            return (
              <div key={m.id} className="border rounded-lg p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{m.name}</h3>
                        <Badge variant="outline" className="text-xs">{Number(m.rate_multiplier).toFixed(2)}× multiplier</Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                          <Save className="h-3.5 w-3.5 mr-1" />Save
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Description</Label>
                      <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Example Cities</Label>
                      <Input value={editCities} onChange={(e) => setEditCities(e.target.value)} placeholder="City names, comma separated" />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{m.name}</h3>
                        <Badge variant="outline" className="text-xs">{m.short_code}</Badge>
                        <Badge variant="secondary" className="text-xs">{Number(m.rate_multiplier).toFixed(2)}×</Badge>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">{m.description || "No description"}</p>
                    {m.example_cities && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        <span className="font-medium">Examples:</span> {m.example_cities}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
