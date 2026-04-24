import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Users, Phone, TrendingUp, Target, CheckCircle, XCircle, Clock, Play, Pause, BarChart3, Search } from "lucide-react";
import { format, isBefore, isToday, startOfDay } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CampaignAnalytics } from "@/components/campaigns/CampaignAnalytics";
import LeadWorkflowPanel from "@/components/campaigns/workflow/LeadWorkflowPanel";
import { STAGE_BADGE_COLORS, INTEREST_ICONS, WORKFLOW_STAGES } from "@/components/campaigns/workflow/types";

const STAGE_LABELS: Record<string, string> = {};
WORKFLOW_STAGES.forEach(s => { STAGE_LABELS[s.key] = s.label; });
STAGE_LABELS['dead'] = 'Lost';

const INTEREST_ORDER: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
const STAGE_PRIORITY: Record<string, number> = {
  converted: 10, dead: 11,
  contracts_signed: 5, send_contracts: 4, terms_review: 3,
  send_terms: 3, pitch_deal: 2, qualification: 1, call_attempt: 0,
};

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLead, setSelectedLead] = useState<any>(null);

  // Filters
  const [stageFilter, setStageFilter] = useState("all");
  const [interestFilter, setInterestFilter] = useState("all");
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: campaign } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const { data: campaignLeads } = useQuery({
    queryKey: ["campaign-leads", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_leads")
        .select("*, scraped_leads(*), profiles:assigned_to(full_name, email)")
        .eq("campaign_id", id!)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: reps } = useQuery({
    queryKey: ["campaign-reps", id],
    queryFn: async () => {
      if (!campaign?.assigned_reps?.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", campaign.assigned_reps);
      return data || [];
    },
    enabled: !!campaign?.assigned_reps?.length,
  });

  // Filter and sort leads
  const filteredLeads = useMemo(() => {
    if (!campaignLeads) return [];
    let leads = [...campaignLeads];

    // Filters
    if (stageFilter !== "all") leads = leads.filter(l => (l as any).workflow_stage === stageFilter);
    if (interestFilter !== "all") leads = leads.filter(l => (l as any).interest_level === interestFilter);
    if (followUpOnly) {
      const today = startOfDay(new Date());
      leads = leads.filter(l => l.next_follow_up && isBefore(new Date(l.next_follow_up), new Date(today.getTime() + 86400000)));
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      leads = leads.filter(l => l.scraped_leads?.business_name?.toLowerCase().includes(term));
    }

    // Sort by priority
    leads.sort((a, b) => {
      const now = new Date();
      const aFollowUp = a.next_follow_up ? new Date(a.next_follow_up) : null;
      const bFollowUp = b.next_follow_up ? new Date(b.next_follow_up) : null;
      const aOverdue = aFollowUp && isBefore(aFollowUp, now) ? 1 : 0;
      const bOverdue = bFollowUp && isBefore(bFollowUp, now) ? 1 : 0;

      // Overdue first
      if (aOverdue !== bOverdue) return bOverdue - aOverdue;
      // Today's follow-ups
      const aToday = aFollowUp && isToday(aFollowUp) ? 1 : 0;
      const bToday = bFollowUp && isToday(bFollowUp) ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;

      // Interest level
      const aInterest = INTEREST_ORDER[(a as any).interest_level] ?? 3;
      const bInterest = INTEREST_ORDER[(b as any).interest_level] ?? 3;
      if (aInterest !== bInterest) return aInterest - bInterest;

      // Stage priority (dead last)
      const aStage = STAGE_PRIORITY[(a as any).workflow_stage] ?? 0;
      const bStage = STAGE_PRIORITY[(b as any).workflow_stage] ?? 0;
      return aStage - bStage;
    });

    return leads;
  }, [campaignLeads, stageFilter, interestFilter, followUpOnly, searchTerm]);

  const stats = useMemo(() => {
    if (!campaignLeads) return { total: 0, contacted: 0, interested: 0, converted: 0, notInterested: 0, remaining: 0 };
    const total = campaignLeads.length;
    const contacted = campaignLeads.filter(l => !["call_attempt"].includes((l as any).workflow_stage) && (l as any).workflow_stage !== "dead").length;
    const interested = campaignLeads.filter(l => ["pitch_deal", "send_terms", "terms_review", "send_contracts", "contracts_signed"].includes((l as any).workflow_stage)).length;
    const converted = campaignLeads.filter(l => (l as any).workflow_stage === "converted").length;
    const notInterested = campaignLeads.filter(l => (l as any).workflow_stage === "dead").length;
    const remaining = campaignLeads.filter(l => ["call_attempt", "qualification"].includes((l as any).workflow_stage)).length;
    return { total, contacted, interested, converted, notInterested, remaining };
  }, [campaignLeads]);

  const repStats = useMemo(() => {
    if (!campaignLeads || !reps) return [];
    return reps.map(rep => {
      const repLeads = campaignLeads.filter(l => l.assigned_to === rep.id);
      const called = repLeads.filter(l => (l as any).workflow_stage !== "call_attempt").length;
      const conv = repLeads.filter(l => (l as any).workflow_stage === "converted").length;
      return {
        name: rep.full_name || rep.email || "Unknown",
        assigned: repLeads.length, called, converted: conv,
        callRate: repLeads.length > 0 ? Math.round((called / repLeads.length) * 100) : 0,
        convRate: called > 0 ? Math.round((conv / called) * 100) : 0,
      };
    });
  }, [campaignLeads, reps]);

  const funnelData = [
    { name: "Total Leads", value: stats.total },
    { name: "Contacted", value: stats.contacted },
    { name: "Interested", value: stats.interested },
    { name: "Converted", value: stats.converted },
  ];

  const toggleStatus = async (newStatus: string) => {
    if (!id) return;
    await supabase.from("campaigns").update({ status: newStatus as any }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["campaign", id] });
    toast({ title: `Campaign ${newStatus}` });
  };

  const progress = stats.total > 0 ? Math.round(((stats.contacted + stats.converted + stats.notInterested) / stats.total) * 100) : 0;

  if (!campaign) return <div className="p-8 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="flex h-full">
      {/* Main content - shrinks when panel is open */}
      <div className={`${selectedLead ? 'w-[55%]' : 'w-full'} transition-all duration-300 overflow-y-auto`}>
        <div className="space-y-6 p-0">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/campaigns")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline">{campaign.campaign_type?.replace("_", " ")}</Badge>
                  <Badge className={campaign.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
                    {campaign.status}
                  </Badge>
                  {campaign.target_state && <span className="text-sm text-muted-foreground">{campaign.target_state}</span>}
                  {campaign.target_category && <span className="text-sm text-muted-foreground">· {campaign.target_category}</span>}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(`/leads?campaignId=${id}`)}>
                <Search className="h-4 w-4 mr-2" />Find Leads
              </Button>
              <Button variant="outline" onClick={() => navigate(`/campaigns/${id}/queue`)}>
                <Phone className="h-4 w-4 mr-2" />Call Queue
              </Button>
              {campaign.status === "draft" && <Button onClick={() => toggleStatus("active")}><Play className="h-4 w-4 mr-2" />Activate</Button>}
              {campaign.status === "active" && <Button variant="outline" onClick={() => toggleStatus("paused")}><Pause className="h-4 w-4 mr-2" />Pause</Button>}
              {campaign.status === "paused" && <Button onClick={() => toggleStatus("active")}><Play className="h-4 w-4 mr-2" />Resume</Button>}
            </div>
          </div>

          {/* Progress */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Campaign Progress</span>
                <span className="text-sm text-muted-foreground">{progress}% complete</span>
              </div>
              <Progress value={progress} className="h-3" />
            </CardContent>
          </Card>

          <Tabs defaultValue="overview" className="space-y-6">
            <TabsList>
              <TabsTrigger value="overview"><Users className="h-4 w-4 mr-2" /> Overview</TabsTrigger>
              <TabsTrigger value="analytics"><BarChart3 className="h-4 w-4 mr-2" /> Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                {[
                  { icon: Target, label: "Total Leads", value: stats.total, color: "text-primary" },
                  { icon: Phone, label: "Contacted", value: stats.contacted, color: "text-primary" },
                  { icon: TrendingUp, label: "Interested", value: stats.interested, color: "text-primary" },
                  { icon: CheckCircle, label: "Converted", value: stats.converted, color: "text-primary" },
                  { icon: XCircle, label: "Lost", value: stats.notInterested, color: "text-destructive" },
                  { icon: Clock, label: "Remaining", value: stats.remaining, color: "text-muted-foreground" },
                ].map(s => (
                  <Card key={s.label}>
                    <CardContent className="pt-4 text-center">
                      <s.icon className={`h-6 w-6 ${s.color} mx-auto`} />
                      <p className="text-2xl font-bold mt-1">{s.value}</p>
                      <p className="text-xs text-muted-foreground">{s.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Funnel + Rep Performance */}
              {!selectedLead && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader><CardTitle className="text-lg">Conversion Funnel</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={funnelData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis dataKey="name" type="category" width={100} />
                          <Tooltip />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle className="text-lg">Rep Performance</CardTitle></CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rep</TableHead>
                            <TableHead>Assigned</TableHead>
                            <TableHead>Called</TableHead>
                            <TableHead>Conv</TableHead>
                            <TableHead>%</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {repStats.map(r => (
                            <TableRow key={r.name}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              <TableCell>{r.assigned}</TableCell>
                              <TableCell>{r.called}</TableCell>
                              <TableCell>{r.converted}</TableCell>
                              <TableCell>{r.convRate}%</TableCell>
                            </TableRow>
                          ))}
                          {repStats.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No reps assigned</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Filters */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <Label className="text-xs">Stage</Label>
                      <Select value={stageFilter} onValueChange={setStageFilter}>
                        <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Stages</SelectItem>
                          {WORKFLOW_STAGES.map(s => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                          <SelectItem value="dead">Lost</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Interest</Label>
                      <Select value={interestFilter} onValueChange={setInterestFilter}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="hot">🔥 Hot</SelectItem>
                          <SelectItem value="warm">☀️ Warm</SelectItem>
                          <SelectItem value="cold">❄️ Cold</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch id="followup" checked={followUpOnly} onCheckedChange={setFollowUpOnly} />
                      <Label htmlFor="followup" className="text-xs">Due for follow-up</Label>
                    </div>
                    <Input
                      placeholder="Search business..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="h-8 w-48 text-xs"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Lead List */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Campaign Leads ({filteredLeads.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Interest</TableHead>
                        <TableHead>Follow-up</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLeads.map(cl => {
                        const ws = (cl as any).workflow_stage || "call_attempt";
                        const il = (cl as any).interest_level;
                        const fu = cl.next_follow_up ? new Date(cl.next_follow_up) : null;
                        const fuOverdue = fu && isBefore(fu, new Date());
                        const fuToday = fu && isToday(fu);
                        const isSelected = selectedLead?.id === cl.id;

                        return (
                          <TableRow
                            key={cl.id}
                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                            onClick={() => setSelectedLead(cl)}
                          >
                            <TableCell>
                              <p className="font-medium text-sm">{cl.scraped_leads?.business_name}</p>
                            </TableCell>
                            <TableCell className="text-xs">{[cl.scraped_leads?.city, cl.scraped_leads?.state].filter(Boolean).join(", ")}</TableCell>
                            <TableCell className="text-xs">{cl.scraped_leads?.phone}</TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] ${STAGE_BADGE_COLORS[ws] || ''}`}>
                                {ws === 'dead' ? '✕ Lost' : STAGE_LABELS[ws] || ws}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {il && <span className="text-sm">{INTEREST_ICONS[il]} {il}</span>}
                            </TableCell>
                            <TableCell>
                              {fu && (
                                <span className={`text-xs ${fuOverdue ? 'text-destructive font-medium' : fuToday ? 'text-orange-600 font-medium' : 'text-muted-foreground'}`}>
                                  {format(fu, "MMM d")}
                                  {fuOverdue && ' ⚠️'}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredLeads.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No leads match filters</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics">
              <CampaignAnalytics campaignId={id!} campaign={campaign} campaignLeads={campaignLeads || []} reps={reps || []} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Workflow Panel - 45% width */}
      {selectedLead && (
        <div className="w-[45%] border-l bg-background overflow-hidden">
          <LeadWorkflowPanel
            lead={selectedLead}
            campaignId={id!}
            onClose={() => setSelectedLead(null)}
          />
        </div>
      )}
    </div>
  );
}
