import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Target, Users, TrendingUp, BarChart3 } from "lucide-react";
import { US_STATES } from "@/lib/us-states";
import { format } from "date-fns";

export default function Campaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterState, setFilterState] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [campaignType, setCampaignType] = useState("custom");
  const [participantType, setParticipantType] = useState("provider");
  const [targetState, setTargetState] = useState("");
  const [targetCategory, setTargetCategory] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedReps, setSelectedReps] = useState<string[]>([]);
  const [autoPopulateJob, setAutoPopulateJob] = useState("");
  const [autoAssign, setAutoAssign] = useState(false);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["campaigns-list", filterStatus, filterType, filterState],
    queryFn: async () => {
      let q = supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (filterStatus !== "all") q = q.eq("status", filterStatus as any);
      if (filterType !== "all") q = q.eq("campaign_type", filterType as any);
      if (filterState !== "all") q = q.eq("target_state", filterState);
      const { data } = await q;
      return data || [];
    },
  });

  const { data: reps } = useQuery({
    queryKey: ["sales-reps"],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["sales_rep", "admin"]);
      if (!roles || roles.length === 0) return [];
      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);
      return (profiles || []).map(p => ({ profiles: p }));
    },
  });

  const { data: scrapeJobs } = useQuery({
    queryKey: ["scrape-jobs-for-campaign"],
    queryFn: async () => {
      const { data } = await supabase
        .from("scrape_jobs")
        .select("*")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  });

  const handleCreate = async () => {
    if (!name) { toast({ title: "Name is required", variant: "destructive" }); return; }
    try {
      const { data: camp, error } = await supabase.from("campaigns").insert({
        name,
        description: description || null,
        campaign_type: campaignType as any,
        participant_type: participantType as any,
        target_state: targetState || null,
        target_category: targetCategory || null,
        start_date: startDate || null,
        end_date: endDate || null,
        created_by: user?.id,
        assigned_reps: selectedReps,
        status: "draft" as any,
      }).select().single();
      if (error) throw error;

      // Auto-populate from scrape job
      if (autoPopulateJob && autoPopulateJob !== "none" && camp) {
        const { data: leads } = await supabase
          .from("scraped_leads")
          .select("id")
          .eq("scrape_job_id", autoPopulateJob);

        if (leads && leads.length > 0) {
          const campaignLeads = leads.map((l, idx) => ({
            campaign_id: camp.id,
            lead_id: l.id,
            status: "pending" as any,
            assigned_to: autoAssign && selectedReps.length > 0
              ? selectedReps[idx % selectedReps.length]
              : null,
          }));
          await supabase.from("campaign_leads").insert(campaignLeads);
          await supabase.from("campaigns").update({ total_leads: leads.length }).eq("id", camp.id);

          // Update lead statuses
          await supabase.from("scraped_leads")
            .update({ status: "added_to_campaign" as any })
            .in("id", leads.map(l => l.id));
        }
      }

      queryClient.invalidateQueries({ queryKey: ["campaigns-list"] });
      setShowCreate(false);
      resetForm();
      toast({ title: "Campaign created" });
      navigate(`/campaigns/${camp.id}`);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setName(""); setDescription(""); setCampaignType("custom"); setParticipantType("provider");
    setTargetState(""); setTargetCategory(""); setStartDate("");
    setEndDate(""); setSelectedReps([]); setAutoPopulateJob(""); setAutoAssign(false);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: "bg-muted text-muted-foreground",
      active: "bg-primary/10 text-primary",
      paused: "bg-accent text-accent-foreground",
      completed: "bg-secondary text-secondary-foreground",
    };
    return <Badge className={styles[status] || ""}>{status}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    return <Badge variant="outline">{type?.replace("_", " ")}</Badge>;
  };

  const totalLeads = campaigns?.reduce((s, c) => s + (c.total_leads || 0), 0) || 0;
  const totalContacted = campaigns?.reduce((s, c) => s + (c.contacted_count || 0), 0) || 0;
  const totalConverted = campaigns?.reduce((s, c) => s + (c.converted_count || 0), 0) || 0;
  const activeCampaigns = campaigns?.filter(c => c.status === "active").length || 0;

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
            <p className="text-muted-foreground">Manage outreach campaigns and track conversions</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />Create Campaign
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Target className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{activeCampaigns}</p>
                  <p className="text-sm text-muted-foreground">Active Campaigns</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{totalLeads}</p>
                  <p className="text-sm text-muted-foreground">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{totalContacted}</p>
                  <p className="text-sm text-muted-foreground">Contacted</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{totalConverted}</p>
                  <p className="text-sm text-muted-foreground">Converted</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="state_outreach">State Outreach</SelectItem>
              <SelectItem value="category_blitz">Category Blitz</SelectItem>
              <SelectItem value="re_engagement">Re-engagement</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterState} onValueChange={setFilterState}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="State" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {US_STATES.map(s => <SelectItem key={s.abbr} value={s.abbr}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Campaign Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>For</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Leads</TableHead>
                  <TableHead>Contacted</TableHead>
                  <TableHead>Converted</TableHead>
                  <TableHead>Start</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns?.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/campaigns/${c.id}`)}>
                    <TableCell>
                      <p className="font-medium">{c.name}</p>
                      {c.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{c.description}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {(c as any).participant_type === "law_firm" ? "Law Firms" : "Providers"}
                      </Badge>
                    </TableCell>
                    <TableCell>{getTypeBadge(c.campaign_type)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {c.target_state && <span>{c.target_state}</span>}
                        {c.target_state && c.target_category && <span> · </span>}
                        {c.target_category && <span>{c.target_category}</span>}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(c.status)}</TableCell>
                    <TableCell>{c.total_leads}</TableCell>
                    <TableCell>
                      {c.total_leads > 0
                        ? `${Math.round((c.contacted_count / c.total_leads) * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {c.total_leads > 0
                        ? `${Math.round((c.converted_count / c.total_leads) * 100)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.start_date ? format(new Date(c.start_date), "MMM d") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(!campaigns || campaigns.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      No campaigns yet. Create your first campaign to start outreach.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create Campaign Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Campaign For</Label>
              <Select value={participantType} onValueChange={setParticipantType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="provider">Providers</SelectItem>
                  <SelectItem value="law_firm">Law Firms</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Campaign Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Texas Dentists Q1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Campaign goals..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={campaignType} onValueChange={setCampaignType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="state_outreach">State Outreach</SelectItem>
                    <SelectItem value="category_blitz">Category Blitz</SelectItem>
                    <SelectItem value="re_engagement">Re-engagement</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target State</Label>
                <Select value={targetState} onValueChange={setTargetState}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {US_STATES.map(s => <SelectItem key={s.abbr} value={s.abbr}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Target Category</Label>
              <Input value={targetCategory} onChange={e => setTargetCategory(e.target.value)} placeholder="e.g. Dentist" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Assign Sales Reps</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {reps?.map((r: any) => {
                  const profile = r.profiles;
                  if (!profile) return null;
                  const isSelected = selectedReps.includes(profile.id);
                  return (
                    <Badge
                      key={profile.id}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSelectedReps(prev =>
                        isSelected ? prev.filter(id => id !== profile.id) : [...prev, profile.id]
                      )}
                    >
                      {profile.full_name || profile.email}
                    </Badge>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Auto-populate from Scrape Job</Label>
              <Select value={autoPopulateJob} onValueChange={setAutoPopulateJob}>
                <SelectTrigger><SelectValue placeholder="None — add leads manually" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {scrapeJobs?.map(j => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.search_category} in {j.search_location} ({j.results_count} results)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {autoPopulateJob && selectedReps.length > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto-assign"
                  checked={autoAssign}
                  onChange={e => setAutoAssign(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="auto-assign">Auto-assign leads evenly among selected reps</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleCreate}>Create Campaign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
