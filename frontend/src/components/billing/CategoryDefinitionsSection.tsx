import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Layers, Save, Pencil, X } from "lucide-react";
import { toast } from "sonner";

export default function CategoryDefinitionsSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["specialty-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("specialty_categories").select("*").order("display_order");
      return data ?? [];
    },
  });

  const startEdit = (cat: any) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setEditDesc(cat.description ?? "");
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("specialty_categories")
        .update({ name: editName, description: editDesc })
        .eq("id", editingId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["specialty-categories"] });
      setEditingId(null);
      toast.success("Category updated");
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
          <Layers className="h-5 w-5" />
          Specialty Category Definitions
        </CardTitle>
        <CardDescription>Define provider types within each specialty category</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {categories?.map((cat) => {
            const isEditing = editingId === cat.id;
            return (
              <div key={cat.id} className="border rounded-lg p-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground">{cat.short_code}</Label>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                          <Save className="h-3.5 w-3.5 mr-1" />Save
                        </Button>
                      </div>
                    </div>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Category name" />
                    <Textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Description — list provider types that belong in this category"
                      rows={3}
                    />
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{cat.name}</h3>
                        <span className="text-xs text-muted-foreground">({cat.short_code})</span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{cat.description || "No description"}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => startEdit(cat)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
