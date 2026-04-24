import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Phone, Mail, Calendar, StickyNote, Bot, DollarSign, Target, Clock,
  User, Building2, FileText, ArrowRight, Check, X, Edit2, Save, ExternalLink,
  ChevronRight, MessageSquare, History,
} from "lucide-react";
import { AIDealSuggestion } from "@/components/ai/AIPipelineInsights";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type PipelineStage = Database["public"]["Enums"]["pipeline_stage"];

const stageLabels: Record<string, string> = {
  lead_identified: "Lead Identified", initial_contact: "Initial Contact", discovery: "Discovery",
  proposal_sent: "Proposal Sent", negotiation: "Negotiation", closed_won: "Closed Won", closed_lost: "Closed Lost",
};

const stageColors: Record<string, string> = {
  lead_identified: "bg-muted text-muted-foreground",
  initial_contact: "bg-primary/10 text-primary",
  discovery: "bg-primary/20 text-primary",
  proposal_sent: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  negotiation: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  closed_won: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed_lost: "bg-destructive/10 text-destructive",
};

interface DealDetailPanelProps {
  deal: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStageChange: (dealId: string, newStage: PipelineStage, lossReason?: string) => void;
  dealTypes: any[] | undefined;
}

export default function DealDetailPanel({ deal, open, onOpenChange, onStageChange, dealTypes }: DealDetailPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const stages = Constants.public.Enums.pipeline_stage;

  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({ estimated_value: "", probability: "", expected_close_date: "", notes: "", deal_type_id: "" });
  const [activityNote, setActivityNote] = useState("");
  const [activityType, setActivityType] = useState<string>("note");
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    if (deal) {
      setEditValues({
        estimated_value: String(deal.estimated_value || ""),
        probability: String(deal.probability || ""),
        expected_close_date: deal.expected_close_date || "",
        notes: deal.notes || "",
        deal_type_id: deal.deal_type_id || "",
      });
      setEditing(false);
      setShowAI(false);
    }
  }, [deal?.id]);

  // Fetch activity history for this provider
  const { data: activities } = useQuery({
    queryKey: ["deal-activities", deal?.provider_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("activities")
        .select("*, profiles:user_id(full_name)")
        .eq("provider_id", deal!.provider_id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!deal?.provider_id && open,
  });

  // Fetch contracts for this provider
  const { data: contracts } = useQuery({
    queryKey: ["deal-contracts", deal?.provider_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, contract_type, status, deal_value, start_date, end_date")
        .eq("provider_id", deal!.provider_id)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!deal?.provider_id && open,
  });

  // Fetch subscription info
  const { data: subscription } = useQuery({
    queryKey: ["deal-subscription", deal?.provider_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("*, membership_tiers(name), specialty_categories(name)")
        .eq("provider_id", deal!.provider_id)
        .in("status", ["active", "trial", "pending"])
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!deal?.provider_id && open,
  });

  const updateDealMutation = useMutation({
    mutationFn: async (values: typeof editValues) => {
      const { error } = await supabase.from("sales_pipeline").update({
        estimated_value: values.estimated_value ? Number(values.estimated_value) : null,
        probability: values.probability ? Number(values.probability) : null,
        expected_close_date: values.expected_close_date || null,
        notes: values.notes || null,
        deal_type_id: values.deal_type_id || null,
      }).eq("id", deal.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      toast.success("Deal updated");
      setEditing(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const logActivityMutation = useMutation({
    mutationFn: async ({ type, note }: { type: string; note: string }) => {
      await supabase.from("activities").insert({
        activity_type: type as any,
        description: note || `${type} logged`,
        provider_id: deal.provider_id,
        user_id: user?.id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal-activities", deal?.provider_id] });
      toast.success("Activity logged");
      setActivityNote("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const activityIcons: Record<string, string> = {
    call: "📞", email: "📧", meeting: "📅", note: "📝", status_change: "🔄", contract_update: "📄",
  };

  if (!deal) return null;

  const currentStageIndex = stages.indexOf(deal.stage);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[520px] sm:w-[580px] overflow-y-auto p-0">
        {/* Header */}
        <div className="p-6 pb-4 border-b bg-muted/30">
          <SheetHeader className="mb-3">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                {deal.providers?.business_name}
              </SheetTitle>
              <Badge className={stageColors[deal.stage]}>
                {stageLabels[deal.stage]}
              </Badge>
            </div>
          </SheetHeader>

          {/* Stage Progress */}
          <div className="flex items-center gap-1 mt-3">
            {stages.filter(s => s !== "closed_lost").map((stage, i) => {
              const isActive = stage === deal.stage;
              const isPast = stages.indexOf(stage) < currentStageIndex && deal.stage !== "closed_lost";
              return (
                <button
                  key={stage}
                  onClick={() => {
                    if (stage !== deal.stage) {
                      if (stage === "closed_won") { onStageChange(deal.id, "closed_won"); return; }
                      onStageChange(deal.id, stage);
                    }
                  }}
                  className={`flex-1 h-2 rounded-full transition-all cursor-pointer hover:opacity-80 ${
                    isActive ? "bg-primary h-3" : isPast ? "bg-primary/40" : "bg-muted-foreground/20"
                  }`}
                  title={stageLabels[stage]}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1 px-0.5">
            <span>Lead</span>
            <span>Won</span>
          </div>

          {/* Move Stage Buttons */}
          <div className="flex gap-2 mt-3">
            {deal.stage !== "closed_won" && deal.stage !== "closed_lost" && (
              <>
                {currentStageIndex > 0 && (
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => onStageChange(deal.id, stages[currentStageIndex - 1])}>
                    ← {stageLabels[stages[currentStageIndex - 1]]}
                  </Button>
                )}
                {currentStageIndex < stages.length - 2 && (
                  <Button size="sm" className="text-xs" onClick={() => onStageChange(deal.id, stages[currentStageIndex + 1])}>
                    {stageLabels[stages[currentStageIndex + 1]]} →
                  </Button>
                )}
                <Button size="sm" variant="default" className="text-xs ml-auto" onClick={() => onStageChange(deal.id, "closed_won")}>
                  <Check className="h-3 w-3 mr-1" />Won
                </Button>
                <Button size="sm" variant="destructive" className="text-xs" onClick={() => onStageChange(deal.id, "closed_lost")}>
                  <X className="h-3 w-3 mr-1" />Lost
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Body Tabs */}
        <Tabs defaultValue="details" className="p-4">
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
            <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
            <TabsTrigger value="related" className="text-xs">Related</TabsTrigger>
          </TabsList>

          {/* DETAILS TAB */}
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Deal Information</p>
              <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
                {editing ? <X className="h-3.5 w-3.5 mr-1" /> : <Edit2 className="h-3.5 w-3.5 mr-1" />}
                {editing ? "Cancel" : "Edit"}
              </Button>
            </div>

            {editing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Deal Value ($)</Label>
                    <Input type="number" value={editValues.estimated_value} onChange={e => setEditValues(v => ({ ...v, estimated_value: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Probability (%)</Label>
                    <Input type="number" min={0} max={100} value={editValues.probability} onChange={e => setEditValues(v => ({ ...v, probability: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Expected Close Date</Label>
                    <Input type="date" value={editValues.expected_close_date} onChange={e => setEditValues(v => ({ ...v, expected_close_date: e.target.value }))} />
                  </div>
                  <div>
                    <Label className="text-xs">Deal Type</Label>
                    <Select value={editValues.deal_type_id} onValueChange={v => setEditValues(prev => ({ ...prev, deal_type_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        {dealTypes?.map(dt => <SelectItem key={dt.id} value={dt.id}>{dt.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={editValues.notes} onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))} rows={3} />
                </div>
                <Button className="w-full" size="sm" onClick={() => updateDealMutation.mutate(editValues)} disabled={updateDealMutation.isPending}>
                  <Save className="h-3.5 w-3.5 mr-1" />Save Changes
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><DollarSign className="h-3 w-3" />Deal Value</div>
                  <p className="font-bold text-lg">${Number(deal.estimated_value || 0).toLocaleString()}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Target className="h-3 w-3" />Probability</div>
                  <p className="font-bold text-lg">{deal.probability || 0}%</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><Calendar className="h-3 w-3" />Close Date</div>
                  <p className="font-semibold text-sm">{deal.expected_close_date || "Not set"}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><User className="h-3 w-3" />Rep</div>
                  <p className="font-semibold text-sm">{deal.profiles?.full_name || "Unassigned"}</p>
                </CardContent></Card>
              </div>
            )}

            {deal.deal_types && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Deal Type:</span>
                <Badge variant="outline" style={{ borderColor: deal.deal_types.color, color: deal.deal_types.color }}>
                  {deal.deal_types.name}
                </Badge>
              </div>
            )}

            <Separator />

            {/* Contact Info */}
            <div>
              <p className="text-sm font-semibold mb-2">Contact</p>
              <div className="space-y-2">
                {deal.providers?.contact_email && (
                  <a href={`mailto:${deal.providers.contact_email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Mail className="h-4 w-4" />{deal.providers.contact_email}
                  </a>
                )}
                {deal.providers?.contact_phone && (
                  <a href={`tel:${deal.providers.contact_phone}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                    <Phone className="h-4 w-4" />{deal.providers.contact_phone}
                  </a>
                )}
              </div>
            </div>

            <Separator />

            {/* Subscription Info */}
            {subscription && (
              <div>
                <p className="text-sm font-semibold mb-2">Subscription</p>
                <Card><CardContent className="p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">{(subscription.membership_tiers as any)?.name} – {(subscription.specialty_categories as any)?.name}</span>
                    <Badge variant="outline" className="capitalize">{subscription.status}</Badge>
                  </div>
                  <p className="text-lg font-bold text-primary">${Number(subscription.monthly_amount).toLocaleString()}/mo</p>
                </CardContent></Card>
              </div>
            )}

            {deal.notes && !editing && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-semibold mb-1">Deal Notes</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/50 rounded p-3">{deal.notes}</p>
                </div>
              </>
            )}

            {/* AI Assist */}
            <Separator />
            <Button variant="outline" className="w-full" onClick={() => setShowAI(!showAI)}>
              <Bot className="h-4 w-4 mr-2" />{showAI ? "Hide AI Assistant" : "AI Deal Assistant"}
            </Button>
            {showAI && <AIDealSuggestion deal={deal} onClose={() => setShowAI(false)} />}
          </TabsContent>

          {/* ACTIVITY TAB */}
          <TabsContent value="activity" className="space-y-4 mt-4">
            <p className="text-sm font-semibold flex items-center gap-2"><History className="h-4 w-4" />Activity History</p>
            {activities && activities.length > 0 ? (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {activities.map(a => (
                  <div key={a.id} className="flex gap-3 items-start p-2.5 rounded-md border bg-background hover:bg-muted/30 transition-colors">
                    <span className="text-base mt-0.5">{activityIcons[a.activity_type] || "📋"}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{a.description}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{(a.profiles as any)?.full_name || "System"}</span>
                        <span>·</span>
                        <span>{new Date(a.created_at).toLocaleDateString()} {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
            )}
          </TabsContent>

          {/* NOTES TAB */}
          <TabsContent value="notes" className="space-y-4 mt-4">
            <p className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4" />Log Activity</p>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <Button size="sm" variant={activityType === "call" ? "default" : "outline"} className="text-xs" onClick={() => setActivityType("call")}>
                <Phone className="h-3.5 w-3.5 mr-1" />Call
              </Button>
              <Button size="sm" variant={activityType === "email" ? "default" : "outline"} className="text-xs" onClick={() => setActivityType("email")}>
                <Mail className="h-3.5 w-3.5 mr-1" />Email
              </Button>
              <Button size="sm" variant={activityType === "meeting" ? "default" : "outline"} className="text-xs" onClick={() => setActivityType("meeting")}>
                <Calendar className="h-3.5 w-3.5 mr-1" />Meeting
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">
                {activityType === "call" ? "Call notes" : activityType === "email" ? "Email summary" : activityType === "meeting" ? "Meeting notes" : "Note"}
              </Label>
              <Textarea
                value={activityNote}
                onChange={e => setActivityNote(e.target.value)}
                placeholder={`What happened during this ${activityType}?`}
                rows={4}
              />
              <Button
                className="w-full"
                size="sm"
                onClick={() => logActivityMutation.mutate({ type: activityType, note: activityNote || `${activityType} logged` })}
                disabled={logActivityMutation.isPending}
              >
                <StickyNote className="h-3.5 w-3.5 mr-1" />
                Log {activityType.charAt(0).toUpperCase() + activityType.slice(1)}
              </Button>
            </div>

            {/* Quick note shortcut */}
            <Separator />
            <div className="space-y-2">
              <Label className="text-xs">Quick Note</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a quick note..."
                  value={activityType === "note" ? activityNote : ""}
                  onChange={e => { setActivityType("note"); setActivityNote(e.target.value); }}
                  onKeyDown={e => {
                    if (e.key === "Enter" && activityNote) {
                      logActivityMutation.mutate({ type: "note", note: activityNote });
                    }
                  }}
                />
                <Button size="sm" variant="secondary" onClick={() => { setActivityType("note"); logActivityMutation.mutate({ type: "note", note: activityNote }); }} disabled={!activityNote}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* RELATED TAB */}
          <TabsContent value="related" className="space-y-4 mt-4">
            {/* Contracts */}
            <div>
              <p className="text-sm font-semibold flex items-center gap-2 mb-2"><FileText className="h-4 w-4" />Contracts</p>
              {contracts && contracts.length > 0 ? (
                <div className="space-y-2">
                  {contracts.map(c => (
                    <Card key={c.id} className="cursor-pointer hover:bg-muted/30 transition-colors">
                      <CardContent className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium capitalize">{c.contract_type.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.start_date || "No date"} {c.deal_value ? `· $${Number(c.deal_value).toLocaleString()}` : ""}
                          </p>
                        </div>
                        <Badge variant="outline" className="capitalize text-xs">{c.status}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No contracts yet</p>
              )}
            </div>

            <Separator />

            {/* Provider Link */}
            <div>
              <p className="text-sm font-semibold mb-2">Quick Links</p>
              <div className="space-y-2">
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={`/providers/${deal.provider_id}`}>
                    <Building2 className="h-3.5 w-3.5 mr-2" />View Provider Profile
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </a>
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start" asChild>
                  <a href={`/contracts?provider=${deal.provider_id}`}>
                    <FileText className="h-3.5 w-3.5 mr-2" />View All Contracts
                    <ExternalLink className="h-3 w-3 ml-auto" />
                  </a>
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
