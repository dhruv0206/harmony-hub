import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { UserPlus, CheckCircle2, Clock, AlertTriangle, ChevronRight, Mail } from "lucide-react";
import { AIOnboardingAssistant } from "@/components/ai/AIOnboardingAssistant";
import { toast } from "sonner";

const DEFAULT_STEPS = [
  { step_order: 1, step_name: "Welcome Email Sent", description: "Send welcome email with onboarding information" },
  { step_order: 2, step_name: "Provider Account Created", description: "Create provider account in the system" },
  { step_order: 3, step_name: "Contract Signed", description: "Ensure contract is fully executed" },
  { step_order: 4, step_name: "Credentials Issued", description: "Issue login credentials and API keys" },
  { step_order: 5, step_name: "Training Scheduled", description: "Schedule product training session" },
  { step_order: 6, step_name: "Training Completed", description: "Complete training and verify understanding" },
  { step_order: 7, step_name: "Go Live", description: "Provider goes live on the platform" },
];

export default function Onboarding() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedChecklist, setSelectedChecklist] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: checklists, isLoading } = useQuery({
    queryKey: ["onboarding_checklists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_checklists")
        .select("*, providers(business_name, contact_name, contact_email), profiles(full_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: steps } = useQuery({
    queryKey: ["onboarding_steps", selectedChecklist],
    enabled: !!selectedChecklist,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_steps")
        .select("*, profiles(full_name)")
        .eq("checklist_id", selectedChecklist!)
        .order("step_order");
      if (error) throw error;
      return data;
    },
  });

  const selectedChecklistData = checklists?.find((c) => c.id === selectedChecklist);
  const selectedProviderId = selectedChecklistData?.provider_id;
  const selectedProviderName = (selectedChecklistData?.providers as any)?.business_name || "";

  const { data: emailLogs } = useQuery({
    queryKey: ["email_logs", selectedProviderId],
    enabled: !!selectedProviderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .eq("provider_id", selectedProviderId!)
        .order("sent_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Providers that won deals but have no onboarding yet
  const { data: eligibleProviders } = useQuery({
    queryKey: ["eligible_onboarding"],
    queryFn: async () => {
      const { data: wonDeals } = await supabase
        .from("sales_pipeline")
        .select("provider_id, providers(id, business_name)")
        .eq("stage", "closed_won");
      const { data: existingChecklists } = await supabase
        .from("onboarding_checklists")
        .select("provider_id");
      const existing = new Set(existingChecklists?.map((c) => c.provider_id) || []);
      const unique = new Map<string, string>();
      wonDeals?.forEach((d) => {
        if (d.provider_id && !existing.has(d.provider_id) && d.providers) {
          unique.set(d.provider_id, (d.providers as any).business_name);
        }
      });
      return Array.from(unique, ([id, name]) => ({ id, name }));
    },
  });

  const createChecklistMutation = useMutation({
    mutationFn: async (providerId: string) => {
      const { data: checklist, error: cErr } = await supabase
        .from("onboarding_checklists")
        .insert({ provider_id: providerId, assigned_to: user?.id })
        .select()
        .single();
      if (cErr) throw cErr;
      const stepsToInsert = DEFAULT_STEPS.map((s) => ({
        ...s,
        checklist_id: checklist.id,
        assigned_to: user?.id,
        due_date: (() => {
          const d = new Date();
          d.setDate(d.getDate() + s.step_order * 3);
          return d.toISOString().split("T")[0];
        })(),
      }));
      const { error: sErr } = await supabase.from("onboarding_steps").insert(stepsToInsert);
      if (sErr) throw sErr;
      return checklist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_checklists"] });
      queryClient.invalidateQueries({ queryKey: ["eligible_onboarding"] });
      toast.success("Onboarding checklist created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleStepMutation = useMutation({
    mutationFn: async ({ stepId, completed, stepName }: { stepId: string; completed: boolean; stepName: string }) => {
      const { error } = await supabase
        .from("onboarding_steps")
        .update({
          is_completed: completed,
          completed_at: completed ? new Date().toISOString() : null,
          completed_by: completed ? user?.id : null,
        })
        .eq("id", stepId);
      if (error) throw error;

      if (completed && selectedProviderId) {
        const subject = `${stepName} completed`;
        const { error: logErr } = await supabase.from("email_logs").insert({
          provider_id: selectedProviderId,
          template_name: "onboarding_step_completed",
          subject,
          status: "sent",
        });
        if (logErr) console.error("Failed to log email:", logErr);
        toast.success(`Email sent to ${selectedProviderName}: ${subject}`);
      } else if (completed) {
        toast.success("Step completed! 🎉");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_steps"] });
      queryClient.invalidateQueries({ queryKey: ["onboarding_checklists"] });
      queryClient.invalidateQueries({ queryKey: ["email_logs", selectedProviderId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStepNotesMutation = useMutation({
    mutationFn: async ({ stepId, notes }: { stepId: string; notes: string }) => {
      const { error } = await supabase.from("onboarding_steps").update({ notes }).eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_steps"] });
      toast.success("Notes saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const completeChecklistMutation = useMutation({
    mutationFn: async (checklistId: string) => {
      const { error } = await supabase
        .from("onboarding_checklists")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", checklistId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding_checklists"] });
      toast.success("Onboarding completed! Provider is now live 🚀");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openDetail = (checklistId: string) => {
    setSelectedChecklist(checklistId);
    setDetailOpen(true);
  };

  const filteredChecklists = checklists?.filter((c) => statusFilter === "all" || c.status === statusFilter) || [];

  const getProgress = (checklistId: string) => {
    if (!selectedChecklist || selectedChecklist !== checklistId || !steps) return null;
    const completed = steps.filter((s) => s.is_completed).length;
    return { completed, total: steps.length, pct: Math.round((completed / steps.length) * 100) };
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "in_progress": return <Badge className="bg-primary/10 text-primary">In Progress</Badge>;
      case "completed": return <Badge className="bg-success/10 text-success">Completed</Badge>;
      case "blocked": return <Badge className="bg-destructive/10 text-destructive">Blocked</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Onboarding</h1>
          <p className="text-muted-foreground">Manage provider onboarding workflows</p>
        </div>
      </div>

      {/* Eligible for onboarding */}
      {eligibleProviders && eligibleProviders.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Ready for Onboarding
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {eligibleProviders.map((p) => (
                <Button
                  key={p.id}
                  variant="outline"
                  size="sm"
                  onClick={() => createChecklistMutation.mutate(p.id)}
                  disabled={createChecklistMutation.isPending}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />{p.name}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Onboarding Queue */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : filteredChecklists.length > 0 ? (
                filteredChecklists.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(c.id)}>
                    <TableCell className="font-medium">{(c.providers as any)?.business_name}</TableCell>
                    <TableCell>{(c.profiles as any)?.full_name || "Unassigned"}</TableCell>
                    <TableCell>{statusBadge(c.status)}</TableCell>
                    <TableCell>{new Date(c.started_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon"><ChevronRight className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No onboarding checklists</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Onboarding: {checklists?.find((c) => c.id === selectedChecklist)?.providers
                ? (checklists.find((c) => c.id === selectedChecklist)?.providers as any)?.business_name
                : ""}
            </DialogTitle>
          </DialogHeader>

          {steps && (
            <div className="space-y-4">
              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">
                    {steps.filter((s) => s.is_completed).length} of {steps.length} steps completed
                  </span>
                  <span className="text-sm font-bold">
                    {Math.round((steps.filter((s) => s.is_completed).length / steps.length) * 100)}%
                  </span>
                </div>
                <Progress value={(steps.filter((s) => s.is_completed).length / steps.length) * 100} className="h-2" />
              </div>

              {/* Steps */}
              <div className="space-y-3">
                {steps.map((step, i) => {
                  const overdue = !step.is_completed && isOverdue(step.due_date);
                  return (
                    <Card key={step.id} className={`${step.is_completed ? "opacity-60" : ""} ${overdue ? "border-destructive/50" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={step.is_completed}
                            onCheckedChange={(checked) =>
                              toggleStepMutation.mutate({ stepId: step.id, completed: !!checked, stepName: step.step_name })
                            }
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${step.is_completed ? "line-through" : ""}`}>
                                {step.step_order}. {step.step_name}
                              </span>
                              {overdue && (
                                <Badge variant="outline" className="text-destructive border-destructive text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />Overdue
                                </Badge>
                              )}
                              {step.is_completed && (
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                            <div className="flex items-center gap-4 mt-1">
                              {step.due_date && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />Due: {step.due_date}
                                </span>
                              )}
                              {step.is_completed && step.completed_at && (
                                <span className="text-xs text-success">
                                  Completed: {new Date(step.completed_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            {/* Notes */}
                            <div className="mt-2">
                              <Textarea
                                placeholder="Add notes..."
                                defaultValue={step.notes || ""}
                                onBlur={(e) => {
                                  if (e.target.value !== (step.notes || "")) {
                                    updateStepNotesMutation.mutate({ stepId: step.id, notes: e.target.value });
                                  }
                                }}
                                rows={1}
                                className="text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Complete onboarding button */}
              {steps.every((s) => s.is_completed) && (
                <Button
                  className="w-full"
                  onClick={() => {
                    if (selectedChecklist) completeChecklistMutation.mutate(selectedChecklist);
                  }}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />Mark Onboarding Complete
                </Button>
              )}

              {/* Email History */}
              <Separator />
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
                  <Mail className="h-4 w-4" /> Email History
                </h3>
                {emailLogs && emailLogs.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subject</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emailLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm">{log.subject}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{log.template_name}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className="bg-success/10 text-success text-xs">{log.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(log.sent_at).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No emails sent yet.</p>
                )}
              </div>

              {/* AI Onboarding Assistant */}
              <AIOnboardingAssistant
                currentStep={steps?.filter(s => !s.is_completed).length ? steps.findIndex(s => !s.is_completed) + 1 : steps?.length}
                totalSteps={steps?.length}
                stepName={steps?.find(s => !s.is_completed)?.step_name || "Complete"}
                providerName={selectedProviderName}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
