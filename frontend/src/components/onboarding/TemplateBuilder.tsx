import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  GripVertical, Plus, Trash2, Copy, Mail, FileText, Upload,
  Shield, Bot, CheckSquare, GraduationCap, Pencil, Star
} from "lucide-react";
import { toast } from "sonner";

const STEP_TYPES = [
  { value: "auto_email", label: "Auto Email", icon: Mail },
  { value: "manual_task", label: "Manual Task", icon: CheckSquare },
  { value: "document_upload", label: "Document Upload", icon: Upload },
  { value: "contract_review", label: "Contract Review", icon: FileText },
  { value: "e_signature", label: "E-Signature", icon: Pencil },
  { value: "ai_verification", label: "AI Verification", icon: Bot },
  { value: "approval", label: "Approval", icon: Shield },
  { value: "training", label: "Training", icon: GraduationCap },
];

const STEP_TYPE_COLORS: Record<string, string> = {
  auto_email: "bg-primary/10 text-primary",
  manual_task: "bg-warning/10 text-warning",
  document_upload: "bg-accent/50 text-accent-foreground",
  contract_review: "bg-secondary text-secondary-foreground",
  e_signature: "bg-success/10 text-success",
  ai_verification: "bg-primary/10 text-primary",
  approval: "bg-destructive/10 text-destructive",
  training: "bg-muted text-muted-foreground",
};

interface TemplateStep {
  step_number: number;
  step_name: string;
  step_type: string;
  description: string;
  default_assignee_role: string;
  auto_trigger: boolean;
  trigger_delay_hours: number;
}

const DEFAULT_TEMPLATE_STEPS: TemplateStep[] = [
  { step_number: 1, step_name: "Welcome Email", step_type: "auto_email", description: "Send welcome email with onboarding information", default_assignee_role: "system", auto_trigger: true, trigger_delay_hours: 0 },
  { step_number: 2, step_name: "Provider Portal Account Created", step_type: "auto_email", description: "Auto-create provider portal account", default_assignee_role: "system", auto_trigger: true, trigger_delay_hours: 0 },
  { step_number: 3, step_name: "Contract Sent for Review", step_type: "contract_review", description: "Send contract to provider for review", default_assignee_role: "system", auto_trigger: true, trigger_delay_hours: 1 },
  { step_number: 4, step_name: "AI Contract Review Available", step_type: "ai_verification", description: "AI reviews contract and provides summary", default_assignee_role: "system", auto_trigger: true, trigger_delay_hours: 0 },
  { step_number: 5, step_name: "Provider Reviews Contract with AI Assistant", step_type: "manual_task", description: "Provider reviews contract using AI assistant", default_assignee_role: "provider", auto_trigger: false, trigger_delay_hours: 0 },
  { step_number: 6, step_name: "Contract E-Signed", step_type: "e_signature", description: "Provider signs contract electronically", default_assignee_role: "provider", auto_trigger: false, trigger_delay_hours: 0 },
  { step_number: 7, step_name: "Admin Verifies Signature & Identity", step_type: "approval", description: "Admin verifies signature authenticity and provider identity", default_assignee_role: "admin", auto_trigger: false, trigger_delay_hours: 0 },
  { step_number: 8, step_name: "Credentials & Login Issued", step_type: "auto_email", description: "Issue login credentials after approval", default_assignee_role: "system", auto_trigger: true, trigger_delay_hours: 0 },
  { step_number: 9, step_name: "Training Materials Sent", step_type: "auto_email", description: "Send training materials and documentation", default_assignee_role: "system", auto_trigger: true, trigger_delay_hours: 24 },
  { step_number: 10, step_name: "Welcome Call Scheduled", step_type: "manual_task", description: "Schedule and conduct welcome call with provider", default_assignee_role: "sales_rep", auto_trigger: false, trigger_delay_hours: 0 },
  { step_number: 11, step_name: "Training Completed", step_type: "training", description: "Confirm training completion by rep or provider", default_assignee_role: "sales_rep", auto_trigger: false, trigger_delay_hours: 0 },
  { step_number: 12, step_name: "Go Live — Provider Activated", step_type: "approval", description: "Admin confirms provider is ready to go live", default_assignee_role: "admin", auto_trigger: false, trigger_delay_hours: 0 },
];

export default function TemplateBuilder() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateDesc, setTemplateDesc] = useState("");
  const [templateDealType, setTemplateDealType] = useState<string>("");
  const [steps, setSteps] = useState<TemplateStep[]>([]);
  const [editStepIdx, setEditStepIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const { data: templates, isLoading } = useQuery({
    queryKey: ["onboarding-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_templates")
        .select("*, deal_types(name, color), profiles(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: dealTypes } = useQuery({
    queryKey: ["deal-types"],
    queryFn: async () => {
      const { data } = await supabase.from("deal_types").select("*");
      return data ?? [];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!templateName.trim()) throw new Error("Template name is required");
      if (steps.length === 0) throw new Error("Add at least one step");
      const payload = {
        name: templateName,
        description: templateDesc || null,
        deal_type_id: templateDealType || null,
        steps_json: JSON.parse(JSON.stringify(steps)),
        created_by: user?.id,
      };
      if (editingTemplate) {
        const { error } = await supabase.from("onboarding_templates").update(payload).eq("id", editingTemplate);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("onboarding_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      toast.success(editingTemplate ? "Template updated" : "Template created");
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("onboarding_templates").update({ is_default: false }).neq("id", id);
      const { error } = await supabase.from("onboarding_templates").update({ is_default: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      toast.success("Default template updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("onboarding_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-templates"] });
      toast.success("Template deleted");
    },
  });

  const resetForm = () => {
    setCreateOpen(false);
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDesc("");
    setTemplateDealType("");
    setSteps([]);
    setEditStepIdx(null);
  };

  const openCreate = () => {
    resetForm();
    setSteps([...DEFAULT_TEMPLATE_STEPS]);
    setTemplateName("Standard Onboarding");
    setTemplateDesc("Default 12-step onboarding workflow");
    setCreateOpen(true);
  };

  const openEdit = (template: any) => {
    setEditingTemplate(template.id);
    setTemplateName(template.name);
    setTemplateDesc(template.description || "");
    setTemplateDealType(template.deal_type_id || "");
    setSteps((template.steps_json as unknown as TemplateStep[]) || []);
    setCreateOpen(true);
  };

  const addStep = () => {
    setSteps([...steps, {
      step_number: steps.length + 1,
      step_name: "",
      step_type: "manual_task",
      description: "",
      default_assignee_role: "admin",
      auto_trigger: false,
      trigger_delay_hours: 0,
    }]);
    setEditStepIdx(steps.length);
  };

  const removeStep = (idx: number) => {
    const updated = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 }));
    setSteps(updated);
    setEditStepIdx(null);
  };

  const updateStep = (idx: number, updates: Partial<TemplateStep>) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, ...updates } : s));
  };

  const moveStep = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= steps.length) return;
    const updated = [...steps];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    setSteps(updated.map((s, i) => ({ ...s, step_number: i + 1 })));
    setDragIdx(null);
  };

  const getStepIcon = (type: string) => {
    const found = STEP_TYPES.find(t => t.value === type);
    return found ? found.icon : CheckSquare;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Onboarding Templates</h2>
          <p className="text-muted-foreground">Create and manage automated onboarding workflows</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New Template</Button>
      </div>

      {/* Template List */}
      <div className="grid gap-4 md:grid-cols-2">
        {templates?.map((t) => (
          <Card key={t.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {t.name}
                    {t.is_default && <Badge className="bg-primary/10 text-primary"><Star className="h-3 w-3 mr-1" />Default</Badge>}
                  </CardTitle>
                  <CardDescription>{t.description}</CardDescription>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {(t.deal_types as any)?.name && (
                  <Badge variant="outline" style={{ borderColor: (t.deal_types as any)?.color || undefined }}>
                    {(t.deal_types as any).name}
                  </Badge>
                )}
                <Badge variant="secondary">{(t.steps_json as any[])?.length || 0} steps</Badge>
              </div>
              <div className="flex flex-wrap gap-1">
                {(t.steps_json as unknown as TemplateStep[])?.slice(0, 5).map((s, i) => (
                  <Badge key={i} variant="outline" className={`text-xs ${STEP_TYPE_COLORS[s.step_type] || ""}`}>
                    {s.step_name}
                  </Badge>
                ))}
                {(t.steps_json as any[])?.length > 5 && (
                  <Badge variant="outline" className="text-xs">+{(t.steps_json as any[]).length - 5} more</Badge>
                )}
              </div>
              {!t.is_default && (
                <Button size="sm" variant="outline" onClick={() => setDefaultMutation.mutate(t.id)}>
                  <Star className="h-3 w-3 mr-1" />Set as Default
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {!isLoading && (!templates || templates.length === 0) && (
          <Card className="col-span-full">
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>No templates yet. Create one to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) resetForm(); else setCreateOpen(v); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Onboarding Template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="e.g. Standard Onboarding" />
              </div>
              <div className="space-y-2">
                <Label>Deal Type</Label>
                <Select value={templateDealType} onValueChange={setTemplateDealType}>
                  <SelectTrigger><SelectValue placeholder="Any deal type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any deal type</SelectItem>
                    {dealTypes?.map((dt) => (
                      <SelectItem key={dt.id} value={dt.id}>{dt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={templateDesc} onChange={(e) => setTemplateDesc(e.target.value)} placeholder="Brief description" />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Steps ({steps.length})</h3>
                <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-4 w-4 mr-1" />Add Step</Button>
              </div>

              {steps.map((step, idx) => {
                const Icon = getStepIcon(step.step_type);
                const isEditing = editStepIdx === idx;
                return (
                  <div
                    key={idx}
                    className={`border rounded-lg transition-all ${isEditing ? "ring-2 ring-primary" : "hover:shadow-sm"} ${dragIdx === idx ? "opacity-50" : ""}`}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={() => { if (dragIdx !== null) moveStep(dragIdx, idx); }}
                  >
                    <div
                      className="flex items-center gap-3 p-3 cursor-pointer"
                      onClick={() => setEditStepIdx(isEditing ? null : idx)}
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {step.step_number}
                      </div>
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{step.step_name || "Untitled Step"}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${STEP_TYPE_COLORS[step.step_type] || ""}`}>
                            {STEP_TYPES.find(t => t.value === step.step_type)?.label}
                          </Badge>
                          {step.auto_trigger && <Badge variant="secondary" className="text-xs">Auto</Badge>}
                          {step.trigger_delay_hours > 0 && <Badge variant="outline" className="text-xs">{step.trigger_delay_hours}h delay</Badge>}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); removeStep(idx); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    {isEditing && (
                      <div className="px-3 pb-3 pt-0 space-y-3 border-t">
                        <div className="grid gap-3 md:grid-cols-2 pt-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Step Name</Label>
                            <Input value={step.step_name} onChange={(e) => updateStep(idx, { step_name: e.target.value })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Step Type</Label>
                            <Select value={step.step_type} onValueChange={(v) => updateStep(idx, { step_type: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {STEP_TYPES.map((t) => (
                                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Textarea value={step.description} onChange={(e) => updateStep(idx, { description: e.target.value })} rows={2} />
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Default Assignee</Label>
                            <Select value={step.default_assignee_role} onValueChange={(v) => updateStep(idx, { default_assignee_role: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="system">System (Auto)</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="sales_rep">Sales Rep</SelectItem>
                                <SelectItem value="provider">Provider</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Auto-Trigger</Label>
                            <div className="flex items-center gap-2 pt-1">
                              <Switch checked={step.auto_trigger} onCheckedChange={(v) => updateStep(idx, { auto_trigger: v })} />
                              <span className="text-xs text-muted-foreground">{step.auto_trigger ? "Yes" : "No"}</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Delay (hours)</Label>
                            <Input type="number" min={0} value={step.trigger_delay_hours} onChange={(e) => updateStep(idx, { trigger_delay_hours: parseInt(e.target.value) || 0 })} disabled={!step.auto_trigger} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
