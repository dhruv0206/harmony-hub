import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Play, Plus, Pencil, Trash2, Clock, GraduationCap, Video } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = [
  { value: "platform_overview", label: "Platform Overview" },
  { value: "document_signing", label: "Document Signing" },
  { value: "billing_portal", label: "Billing Portal" },
  { value: "support_system", label: "Support System" },
  { value: "ai_tools", label: "AI Tools" },
  { value: "best_practices", label: "Best Practices" },
  { value: "compliance", label: "Compliance" },
  { value: "general", label: "General" },
];

const AUDIENCES = [
  { value: "all_providers", label: "All Providers" },
  { value: "new_providers", label: "New Providers" },
  { value: "specific_tier", label: "Specific Tier" },
  { value: "specific_category", label: "Specific Category" },
];

function detectVideoType(url: string) {
  if (!url) return "youtube";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  if (url.includes("loom.com")) return "loom";
  return "direct";
}

const defaultForm = {
  title: "", description: "", video_url: "", video_type: "youtube",
  thumbnail_url: "", duration_minutes: 5, category: "general",
  is_required: true, display_order: 0, target_audience: "new_providers",
  is_active: true,
};

export default function TrainingVideoManager() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: videos = [] } = useQuery({
    queryKey: ["training-videos-admin"],
    queryFn: async () => {
      const { data } = await supabase
        .from("training_videos")
        .select("*")
        .order("display_order");
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: typeof form & { id?: string }) => {
      const { id, ...rest } = values;
      if (id) {
        const { error } = await supabase.from("training_videos").update(rest as any).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("training_videos").insert(rest as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-videos-admin"] });
      toast.success(editId ? "Video updated" : "Video added");
      closeModal();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("training_videos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["training-videos-admin"] });
      toast.success("Video deleted");
    },
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      await supabase.from("training_videos").update({ is_active: active } as any).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["training-videos-admin"] }),
  });

  function openAdd() {
    setEditId(null);
    setForm({ ...defaultForm, display_order: videos.length + 1 });
    setModalOpen(true);
  }

  function openEdit(v: any) {
    setEditId(v.id);
    setForm({
      title: v.title, description: v.description || "", video_url: v.video_url || "",
      video_type: v.video_type || "youtube", thumbnail_url: v.thumbnail_url || "",
      duration_minutes: v.duration_minutes, category: v.category || "general",
      is_required: v.is_required, display_order: v.display_order,
      target_audience: v.target_audience || "new_providers", is_active: v.is_active,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditId(null);
    setForm(defaultForm);
  }

  function handleUrlChange(url: string) {
    setForm(f => ({ ...f, video_url: url, video_type: detectVideoType(url) }));
  }

  const catLabel = (val: string) => CATEGORIES.find(c => c.value === val)?.label || val;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Training Video Library</h1>
          <p className="text-muted-foreground">Manage videos providers watch during onboarding</p>
        </div>
        <Button onClick={openAdd}><Plus className="h-4 w-4 mr-2" />Add Video</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {videos.map((v: any) => (
          <Card key={v.id} className={`overflow-hidden ${!v.is_active ? "opacity-60" : ""}`}>
            <div className="aspect-video bg-muted flex items-center justify-center relative">
              {v.thumbnail_url ? (
                <img src={v.thumbnail_url} alt={v.title} className="w-full h-full object-cover" />
              ) : (
                <Play className="h-12 w-12 text-muted-foreground/40" />
              )}
              <div className="absolute top-2 right-2 flex gap-1">
                <Badge variant="secondary" className="text-[10px]"><Clock className="h-3 w-3 mr-1" />{v.duration_minutes}m</Badge>
              </div>
            </div>
            <CardContent className="p-4 space-y-3">
              <div>
                <h3 className="font-semibold text-sm leading-tight">{v.title}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{v.description}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px]">{catLabel(v.category)}</Badge>
                {v.is_required && <Badge className="text-[10px] bg-primary/10 text-primary border-0">Required</Badge>}
                <Badge variant="secondary" className="text-[10px] capitalize">{(v.target_audience || "").replace("_", " ")}</Badge>
              </div>
              <div className="flex items-center justify-between pt-1 border-t">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={v.is_active}
                    onCheckedChange={(checked) => toggleActive.mutate({ id: v.id, active: checked })}
                  />
                  <span className="text-xs text-muted-foreground">{v.is_active ? "Active" : "Inactive"}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(v)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteMutation.mutate(v.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {videos.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Video className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No training videos yet. Add your first one.</p>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Video" : "Add Training Video"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Video URL</Label>
              <Input value={form.video_url} onChange={e => handleUrlChange(e.target.value)} placeholder="Paste YouTube, Vimeo, or Loom URL" />
              <p className="text-xs text-muted-foreground">Auto-detected type: <Badge variant="outline" className="text-[10px]">{form.video_type}</Badge></p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Video Type</Label>
                <Select value={form.video_type} onValueChange={v => setForm(f => ({ ...f, video_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="vimeo">Vimeo</SelectItem>
                    <SelectItem value="loom">Loom</SelectItem>
                    <SelectItem value="direct">Direct/Embed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (min)</Label>
                <Input type="number" value={form.duration_minutes} onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <Select value={form.target_audience} onValueChange={v => setForm(f => ({ ...f, target_audience: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCES.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Thumbnail URL (optional)</Label>
              <Input value={form.thumbnail_url} onChange={e => setForm(f => ({ ...f, thumbnail_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label>Display Order</Label>
              <Input type="number" value={form.display_order} onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.is_required} onCheckedChange={v => setForm(f => ({ ...f, is_required: v }))} />
                <Label>Required for onboarding</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
                <Label>Active</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={closeModal}>Cancel</Button>
              <Button
                onClick={() => saveMutation.mutate(editId ? { ...form, id: editId } : form)}
                disabled={!form.title || saveMutation.isPending}
              >
                {editId ? "Save Changes" : "Add Video"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
