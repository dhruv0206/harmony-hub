import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, Loader2, Sparkles, Plus, Phone, Globe, MapPin, AlertTriangle, History, RefreshCw, Megaphone, UserCheck, FileText, ArrowUpDown, X, Ban } from "lucide-react";
import { US_STATES } from "@/lib/us-states";
import { format } from "date-fns";
import { searchLeads, BackendError } from "@/lib/backend-api";

const DEFAULT_CATEGORIES = [
  "Chiropractor", "Orthopedic Surgeon", "Pain Management", "Physical Therapy",
  "Neurologist", "MRI / Imaging Center", "General Practitioner", "Urgent Care",
  "Acupuncture", "Massage Therapy", "Podiatrist", "Oral Surgeon / Dental",
  "Ophthalmologist", "Dermatologist", "Mental Health / Psychiatry"
];

const LAW_FIRM_CATEGORIES = [
  "Personal Injury Attorney", "PI Law Firm", "Auto Accident Lawyer",
  "Medical Malpractice Attorney", "Workers Compensation Attorney",
  "Slip and Fall Attorney", "Wrongful Death Attorney", "Product Liability Attorney",
  "Trial Lawyer", "Plaintiff Attorney"
];

const RADIUS_OPTIONS = [10, 25, 50, 100];
const RESULT_COUNT_OPTIONS = [10, 20, 50];

type LeadResult = {
  business_name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  website?: string;
  category?: string;
  ai_score?: number;
  ai_summary?: string;
  business_size?: string;
  accepts_personal_injury?: string;
  accepts_paper_billing?: string;
  isDuplicate?: boolean;
  duplicateMatch?: string;
  duplicateLink?: string;
  isEnriching?: boolean;
};

type SortOption = "score" | "name" | "distance";

export default function LeadFinder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignIdFromUrl = searchParams.get("campaignId");
  const [finderMode, setFinderMode] = useState<"providers" | "law_firms">("providers");

  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [locationTab, setLocationTab] = useState("city");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [radius, setRadius] = useState("25");
  const [resultCount, setResultCount] = useState("20");
  const [excludeChains, setExcludeChains] = useState(true);
  const [results, setResults] = useState<LeadResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDesc, setCampaignDesc] = useState("");
  const [campaignType, setCampaignType] = useState("custom");
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaignIdFromUrl || "");
  const [activeTab, setActiveTab] = useState("search");
  const [sortBy, setSortBy] = useState<SortOption>("score");
  const [searchingLabel, setSearchingLabel] = useState("");

  // Fetch admin-configured categories from ai_config
  const { data: categoryConfig } = useQuery({
    queryKey: ["lead-finder-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_config")
        .select("settings")
        .eq("feature_name", "lead_finder_categories")
        .maybeSingle();
      return (data?.settings as any)?.categories as string[] | undefined;
    },
  });

  const categories = finderMode === "law_firms" ? LAW_FIRM_CATEGORIES : (categoryConfig || DEFAULT_CATEGORIES);

  const { data: existingProviders } = useQuery({
    queryKey: ["providers-for-dedup"],
    queryFn: async () => {
      const { data } = await supabase.from("providers").select("id, business_name, state, contact_phone, address_line1");
      return data || [];
    },
  });

  const { data: existingLeads } = useQuery({
    queryKey: ["scraped-leads-dedup"],
    queryFn: async () => {
      const { data } = await supabase.from("scraped_leads").select("id, business_name, state, phone");
      return data || [];
    },
  });

  const { data: scrapeHistory } = useQuery({
    queryKey: ["scrape-history"],
    queryFn: async () => {
      const { data } = await supabase.from("scrape_jobs").select("*").order("created_at", { ascending: false }).limit(50);
      return data || [];
    },
  });

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: savedLeads } = useQuery({
    queryKey: ["scraped-leads"],
    queryFn: async () => {
      const { data } = await supabase.from("scraped_leads").select("*, scrape_jobs(search_category, search_location)").order("created_at", { ascending: false }).limit(200);
      return data || [];
    },
  });

  const checkDuplicate = (lead: LeadResult): { isDuplicate: boolean; match?: string; link?: string } => {
    if (existingProviders) {
      for (const p of existingProviders) {
        if (p.business_name?.toLowerCase() === lead.business_name?.toLowerCase() && p.state === lead.state) {
          return { isDuplicate: true, match: `Provider: ${p.business_name}`, link: `/providers/${p.id}` };
        }
        if (lead.phone && p.contact_phone && p.contact_phone.replace(/\D/g, '') === lead.phone.replace(/\D/g, '')) {
          return { isDuplicate: true, match: `Phone match: ${p.business_name}`, link: `/providers/${p.id}` };
        }
      }
    }
    if (existingLeads) {
      for (const l of existingLeads) {
        if (l.business_name?.toLowerCase() === lead.business_name?.toLowerCase() && l.state === lead.state) {
          return { isDuplicate: true, match: `Existing lead: ${l.business_name}` };
        }
      }
    }
    return { isDuplicate: false };
  };

  // AI enrichment (ai_score, ai_summary, business_size) is temporarily disabled
  // because the old `lead-finder` Edge Function isn't deployed and we haven't
  // built a FastAPI equivalent yet. Google Places already gives us phone +
  // website + rating from the main search, so the core data is complete.
  // To restore AI scoring, add POST /api/v1/lead-finder/enrich on the backend.
  const runEnrichment = useCallback(async (_businessResults: LeadResult[]) => {
    setResults(prev => prev.map(r => ({ ...r, isEnriching: false })));
  }, []);

  const handleSearch = async () => {
    const searchCat = category === "custom" ? customCategory : category;
    if (!searchCat) { toast({ title: "Select a category", variant: "destructive" }); return; }

    const hasLocation = (locationTab === "city" && (city || state)) ||
                        (locationTab === "zip" && zip) ||
                        (locationTab === "state" && state);
    if (!hasLocation) { toast({ title: "Enter a location", variant: "destructive" }); return; }

    const locationLabel = locationTab === "city" ? [city, state].filter(Boolean).join(", ")
      : locationTab === "zip" ? `${zip} (${radius} mi radius)`
      : US_STATES.find(s => s.abbr === state)?.name || state;

    setSearchingLabel(`Searching for ${searchCat} in ${locationLabel}...`);
    setIsSearching(true);
    setResults([]);
    setSelectedIds(new Set());

    try {
      const { data: job } = await supabase.from("scrape_jobs").insert({
        created_by: user?.id,
        search_category: searchCat,
        search_location: locationLabel,
        search_state: state || null,
        search_zip: locationTab === "zip" ? zip : null,
        search_radius_miles: locationTab === "zip" ? parseInt(radius) : 25,
        status: "in_progress" as any,
        started_at: new Date().toISOString(),
      }).select().single();

      const data = await searchLeads({
        category: searchCat,
        city: locationTab === "city" ? city || undefined : undefined,
        state: state || undefined,
        zip: locationTab === "zip" ? zip || undefined : undefined,
        result_count: parseInt(resultCount),
        exclude_chains: excludeChains,
        enrich: true,
      });

      const businesses: LeadResult[] = (data.leads || []).map(l => {
        const mapped: LeadResult = {
          business_name: l.name,
          phone: l.phone || undefined,
          address: l.address || undefined,
          city: l.city || undefined,
          state: l.state || undefined,
          zip_code: l.zip || undefined,
          website: l.website || undefined,
          category: searchCat,
        };
        const dup = checkDuplicate(mapped);
        return { ...mapped, isDuplicate: dup.isDuplicate, duplicateMatch: dup.match, duplicateLink: dup.link };
      });

      setResults(businesses);

      if (job) {
        await supabase.from("scrape_jobs").update({
          status: "completed" as any,
          results_count: businesses.length,
          completed_at: new Date().toISOString(),
        }).eq("id", job.id);
      }

      queryClient.invalidateQueries({ queryKey: ["scrape-history"] });
      toast({ title: `Found ${businesses.length} businesses` });

      // Auto-enrich in background
      if (businesses.length > 0) {
        runEnrichment(businesses);
      }
    } catch (e: any) {
      const description = e instanceof BackendError ? e.message : (e?.message ?? String(e));
      toast({ title: "Search failed", description, variant: "destructive" });
    } finally {
      setIsSearching(false);
      setSearchingLabel("");
    }
  };

  const handleSaveAll = async () => {
    const leadsToSave = results.filter((_, i) => selectedIds.size === 0 || selectedIds.has(i));
    if (leadsToSave.length === 0) return;

    try {
      const { data: latestJob } = await supabase.from("scrape_jobs").select("id").order("created_at", { ascending: false }).limit(1).single();
      const inserts = leadsToSave.map(l => ({
        scrape_job_id: latestJob?.id,
        business_name: l.business_name,
        phone: l.phone || null, website: l.website || null, address: l.address || null,
        city: l.city || null, state: l.state || null, zip_code: l.zip_code || null,
        category: l.category || null, ai_score: l.ai_score || null,
        ai_summary: l.ai_summary || null, business_size: l.business_size || null,
        status: (l.isDuplicate ? "duplicate" : "new") as any,
      }));
      const { error } = await supabase.from("scraped_leads").insert(inserts);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["scraped-leads"] });
      toast({ title: `${leadsToSave.length} leads saved` });
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    }
  };

  const handleAddToCampaign = () => {
    if (selectedIds.size === 0) { toast({ title: "Select leads first", variant: "destructive" }); return; }
    setShowCampaignModal(true);
  };

  const handleDisqualifySelected = async () => {
    const leadsToDisqualify = results.filter((_, i) => selectedIds.has(i));
    setResults(prev => prev.filter((_, i) => !selectedIds.has(i)));
    setSelectedIds(new Set());
    toast({ title: `${leadsToDisqualify.length} leads disqualified` });
  };

  const handleCreateCampaignAndAdd = async () => {
    try {
      let campId = selectedCampaignId;
      if (!campId || campId === "new") {
        if (!campaignName) { toast({ title: "Enter campaign name", variant: "destructive" }); return; }
        const { data: camp, error } = await supabase.from("campaigns").insert({
          name: campaignName, description: campaignDesc || null,
          campaign_type: campaignType as any, target_state: state || null,
          target_category: category === "custom" ? customCategory : category || null,
          created_by: user?.id, status: "draft" as any,
          participant_type: finderMode === "law_firms" ? "law_firm" : "provider",
        }).select().single();
        if (error) throw error;
        campId = camp.id;
      }

      const leadsToAdd = results.filter((_, i) => selectedIds.has(i));
      const { data: saved } = await supabase.from("scraped_leads").insert(
        leadsToAdd.map(l => ({
          business_name: l.business_name, phone: l.phone || null, website: l.website || null,
          address: l.address || null, city: l.city || null, state: l.state || null,
          zip_code: l.zip_code || null, category: l.category || null,
          ai_score: l.ai_score || null, ai_summary: l.ai_summary || null,
          business_size: l.business_size || null, status: "added_to_campaign" as any,
        }))
      ).select();

      if (saved) {
        await supabase.from("campaign_leads").insert(
          saved.map(s => ({ campaign_id: campId, lead_id: s.id, status: "pending" as any }))
        );
        await supabase.from("campaigns").update({
          total_leads: (campaigns?.find(c => c.id === campId)?.total_leads || 0) + saved.length,
        }).eq("id", campId);
      }

      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["scraped-leads"] });
      setShowCampaignModal(false);
      setCampaignName("");
      setCampaignDesc("");
      toast({ title: `${leadsToAdd.length} leads added to campaign` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const handleCreateCampaignFromJob = async (job: any) => {
    try {
      const dateStr = format(new Date(job.created_at), "MMM d, yyyy");
      const campName = `${job.search_category} in ${job.search_state || job.search_location} — ${dateStr}`;
      const { data: camp, error } = await supabase.from("campaigns").insert({
        name: campName,
        campaign_type: job.search_state ? "state_outreach" as any : "category_blitz" as any,
        target_state: job.search_state || null, target_category: job.search_category || null,
        created_by: user?.id, status: "draft" as any,
        participant_type: finderMode === "law_firms" ? "law_firm" : "provider",
      }).select().single();
      if (error) throw error;

      const { data: leads } = await supabase.from("scraped_leads").select("id").eq("scrape_job_id", job.id);
      if (leads && leads.length > 0) {
        await supabase.from("campaign_leads").insert(leads.map(l => ({ campaign_id: camp.id, lead_id: l.id, status: "pending" as any })));
        await supabase.from("campaigns").update({ total_leads: leads.length }).eq("id", camp.id);
        await supabase.from("scraped_leads").update({ status: "added_to_campaign" as any }).in("id", leads.map(l => l.id));
      }
      toast({ title: `Campaign "${campName}" created with ${leads?.length || 0} leads` });
      navigate(`/campaigns/${camp.id}`);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const handleRerun = async (job: any) => {
    setCategory(categories.includes(job.search_category) ? job.search_category : "custom");
    setCustomCategory(categories.includes(job.search_category) ? "" : job.search_category);
    setState(job.search_state || "");
    setZip(job.search_zip || "");
    setRadius(String(job.search_radius_miles || 25));
    setActiveTab("search");
  };

  const toggleSelect = (idx: number) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(idx) ? next.delete(idx) : next.add(idx); return next; });
  };

  const toggleAll = () => {
    if (selectedIds.size === sortedResults.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(sortedResults.map((_, i) => i)));
  };

  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === "score") return (b.ai_score || 0) - (a.ai_score || 0);
    if (sortBy === "name") return a.business_name.localeCompare(b.business_name);
    return 0;
  });

  const getScoreColor = (score?: number) => {
    if (!score) return "border-muted-foreground/30 text-muted-foreground";
    if (score >= 70) return "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400";
    if (score >= 40) return "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400";
    return "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400";
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
      assigned: "bg-purple-100 text-purple-800",
      contacted: "bg-indigo-100 text-indigo-800",
      converted: "bg-green-100 text-green-800",
      disqualified: "bg-red-100 text-red-800",
      duplicate: "bg-yellow-100 text-yellow-800",
    };
    return <Badge className={colors[status] || ""}>{status.replace("_", " ")}</Badge>;
  };

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Lead Finder</h1>
          <p className="text-muted-foreground">AI-powered discovery — find new leads by category and location</p>
        </div>

        {/* Finder Mode Toggle */}
        <Tabs value={finderMode} onValueChange={(v) => { setFinderMode(v as any); setCategory(""); setCustomCategory(""); setResults([]); }}>
          <TabsList className="mb-4">
            <TabsTrigger value="providers">Find Providers</TabsTrigger>
            <TabsTrigger value="law_firms">Find Law Firms</TabsTrigger>
          </TabsList>
        </Tabs>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="search"><Search className="h-4 w-4 mr-1" />Search</TabsTrigger>
            <TabsTrigger value="saved">Saved Leads ({savedLeads?.length || 0})</TabsTrigger>
            <TabsTrigger value="history"><History className="h-4 w-4 mr-1" />History</TabsTrigger>
            <TabsTrigger value="campaigns">Campaigns ({campaigns?.length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="search" className="space-y-4">
            {/* Search Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />{finderMode === "law_firms" ? "Find Law Firms" : "Find Providers"}</CardTitle>
                <CardDescription>Search for {finderMode === "law_firms" ? "law firms" : "businesses"} by category and location using AI-powered discovery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Category Picker */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>{finderMode === "law_firms" ? "Practice Area / Type" : "Category / Specialty"}</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        <SelectItem value="custom">Other (custom)...</SelectItem>
                      </SelectContent>
                    </Select>
                    {category === "custom" && (
                      <Input className="mt-2" placeholder="Enter custom category..." value={customCategory} onChange={e => setCustomCategory(e.target.value)} />
                    )}
                  </div>
                  <div>
                    <Label>Number of Results</Label>
                    <Select value={resultCount} onValueChange={setResultCount}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RESULT_COUNT_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n} results</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Location Section */}
                <div>
                  <Label className="mb-2 block">Location</Label>
                  <Tabs value={locationTab} onValueChange={setLocationTab}>
                    <TabsList className="mb-3">
                      <TabsTrigger value="city">By City</TabsTrigger>
                      <TabsTrigger value="zip">By Zip Code</TabsTrigger>
                      <TabsTrigger value="state">By State</TabsTrigger>
                    </TabsList>
                    <TabsContent value="city">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>City</Label>
                          <Input placeholder="e.g. Austin" value={city} onChange={e => setCity(e.target.value)} />
                        </div>
                        <div>
                          <Label>State</Label>
                          <Select value={state} onValueChange={setState}>
                            <SelectTrigger><SelectValue placeholder="Select state..." /></SelectTrigger>
                            <SelectContent>
                              {US_STATES.map(s => <SelectItem key={s.abbr} value={s.abbr}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="zip">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Zip Code</Label>
                          <Input placeholder="e.g. 78701" value={zip} onChange={e => setZip(e.target.value)} />
                        </div>
                        <div>
                          <Label>Radius</Label>
                          <Select value={radius} onValueChange={setRadius}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {RADIUS_OPTIONS.map(r => <SelectItem key={r} value={String(r)}>{r} miles</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent value="state">
                      <div className="max-w-xs">
                        <Label>State</Label>
                        <Select value={state} onValueChange={setState}>
                          <SelectTrigger><SelectValue placeholder="Select state..." /></SelectTrigger>
                          <SelectContent>
                            {US_STATES.map(s => <SelectItem key={s.abbr} value={s.abbr}>{s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Exclude Chains Toggle */}
                <div className="flex items-center gap-3">
                  <Switch checked={excludeChains} onCheckedChange={setExcludeChains} id="exclude-chains" />
                  <Label htmlFor="exclude-chains" className="cursor-pointer">
                    Exclude large chains — focus on independent practices
                  </Label>
                </div>

                {/* Search Button */}
                <Button onClick={handleSearch} disabled={isSearching} size="lg">
                  {isSearching ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{searchingLabel}</>
                  ) : (
                    <><Search className="h-4 w-4 mr-2" />{finderMode === "law_firms" ? "Find Law Firms" : "Find Providers"}</>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Bulk Actions Bar */}
            {results.length > 0 && selectedIds.size > 0 && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="py-3 flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <Button size="sm" variant="default" onClick={handleAddToCampaign}>
                    <Megaphone className="h-3.5 w-3.5 mr-1.5" />Add to Campaign
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSaveAll}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Save Selected
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDisqualifySelected}>
                    <Ban className="h-3.5 w-3.5 mr-1.5" />Disqualify
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
                    <X className="h-3.5 w-3.5 mr-1" />Clear
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Results as Cards */}
            {results.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{results.length} Results</h2>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedIds.size === sortedResults.length && sortedResults.length > 0}
                      onCheckedChange={toggleAll}
                    />
                    <span className="text-sm text-muted-foreground mr-3">Select all</span>
                    <Label className="text-sm text-muted-foreground">Sort:</Label>
                    <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                      <SelectTrigger className="w-36 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="score">AI Score</SelectItem>
                        <SelectItem value="name">Name</SelectItem>
                      </SelectContent>
                    </Select>
                    {results.length > 0 && selectedIds.size === 0 && (
                      <Button variant="outline" size="sm" onClick={handleSaveAll}>
                        Save All
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {sortedResults.map((lead, idx) => (
                    <Card
                      key={idx}
                      className={`relative transition-shadow hover:shadow-md ${selectedIds.has(idx) ? "ring-2 ring-primary" : ""} ${lead.isDuplicate ? "border-yellow-400/50" : ""}`}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <Checkbox
                              checked={selectedIds.has(idx)}
                              onCheckedChange={() => toggleSelect(idx)}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <h3 className="font-semibold text-foreground leading-tight truncate">{lead.business_name}</h3>
                              {lead.category && <Badge variant="secondary" className="mt-1 text-xs">{lead.category}</Badge>}
                            </div>
                          </div>
                          {/* Score badge */}
                          <div className={`flex-shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center text-sm font-bold ${getScoreColor(lead.ai_score)}`}>
                            {lead.isEnriching ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              lead.ai_score || "—"
                            )}
                          </div>
                        </div>

                        {/* AI summary */}
                        {lead.ai_summary && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{lead.ai_summary}</p>
                        )}
                        {lead.isEnriching && !lead.ai_summary && (
                          <p className="text-xs text-muted-foreground italic">Analyzing lead...</p>
                        )}

                        {/* Details */}
                        <div className="space-y-1.5 text-sm">
                          {(lead.address || lead.city) && (
                            <div className="flex items-start gap-1.5 text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                              <span>{[lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(", ")}</span>
                            </div>
                          )}
                          {lead.phone && (
                            <a href={`tel:${lead.phone}`} className="flex items-center gap-1.5 text-primary hover:underline">
                              <Phone className="h-3.5 w-3.5" />{lead.phone}
                            </a>
                          )}
                          {lead.website ? (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline truncate">
                              <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                            </a>
                          ) : (
                            <span className="flex items-center gap-1.5 text-muted-foreground/60 text-xs">
                              <Globe className="h-3.5 w-3.5" />No verified website
                            </span>
                          )}
                        </div>

                        {/* PI / Billing badges */}
                        <div className="flex gap-2 flex-wrap">
                          <Badge variant="outline" className={
                            lead.accepts_personal_injury === "yes" ? "border-green-500 text-green-700 dark:text-green-400" :
                            lead.accepts_personal_injury === "no" ? "border-red-500 text-red-700 dark:text-red-400" :
                            "border-muted-foreground/30 text-muted-foreground"
                          }>
                            <UserCheck className="h-3 w-3 mr-1" />
                            PI: {lead.accepts_personal_injury === "yes" ? "Yes" : lead.accepts_personal_injury === "no" ? "No" : "?"}
                          </Badge>
                          <Badge variant="outline" className={
                            lead.accepts_paper_billing === "yes" ? "border-green-500 text-green-700 dark:text-green-400" :
                            lead.accepts_paper_billing === "no" ? "border-red-500 text-red-700 dark:text-red-400" :
                            "border-muted-foreground/30 text-muted-foreground"
                          }>
                            <FileText className="h-3 w-3 mr-1" />
                            Paper: {lead.accepts_paper_billing === "yes" ? "Yes" : lead.accepts_paper_billing === "no" ? "No" : "?"}
                          </Badge>
                        </div>

                        {/* Duplicate indicator */}
                        {lead.isDuplicate && (
                          <div className="flex items-center gap-1.5 p-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800">
                            <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />
                            <span className="text-xs text-yellow-700 dark:text-yellow-400">
                              Possible Duplicate: {lead.duplicateMatch}
                            </span>
                            {lead.duplicateLink && (
                              <Button variant="link" size="sm" className="h-auto p-0 text-xs ml-auto" onClick={() => navigate(lead.duplicateLink!)}>
                                View
                              </Button>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Saved Leads Tab */}
          <TabsContent value="saved" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Saved Leads</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Business</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Added</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {savedLeads?.map(lead => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <p className="font-medium">{lead.business_name}</p>
                          {lead.ai_summary && <p className="text-xs text-muted-foreground">{lead.ai_summary}</p>}
                        </TableCell>
                        <TableCell>{lead.category}</TableCell>
                        <TableCell>{[lead.city, lead.state].filter(Boolean).join(", ")}</TableCell>
                        <TableCell>
                          {lead.website ? (
                            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-primary hover:underline truncate max-w-[180px]">
                              <Globe className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground/60 text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>{lead.phone}</TableCell>
                        <TableCell>
                          {lead.ai_score ? <Badge className={getScoreColor(lead.ai_score)}>{lead.ai_score}</Badge> : null}
                        </TableCell>
                        <TableCell>{getStatusBadge(lead.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(lead.created_at), "MMM d")}</TableCell>
                      </TableRow>
                    ))}
                    {(!savedLeads || savedLeads.length === 0) && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No saved leads yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Search History</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Results</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scrapeHistory?.map(job => (
                      <TableRow key={job.id}>
                        <TableCell className="text-sm">{format(new Date(job.created_at), "MMM d, yyyy h:mm a")}</TableCell>
                        <TableCell className="font-medium">{job.search_category}</TableCell>
                        <TableCell>{job.search_location}</TableCell>
                        <TableCell>{job.results_count}</TableCell>
                        <TableCell>
                          <Badge variant={job.status === "completed" ? "default" : job.status === "failed" ? "destructive" : "secondary"}>{job.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleRerun(job)}><RefreshCw className="h-3 w-3 mr-1" />Re-run</Button>
                            {job.results_count > 0 && (
                              <Button variant="ghost" size="sm" onClick={() => handleCreateCampaignFromJob(job)}><Megaphone className="h-3 w-3 mr-1" />Campaign</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {(!scrapeHistory || scrapeHistory.length === 0) && (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No search history</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Campaigns</CardTitle>
                <Button size="sm" onClick={() => { setShowCampaignModal(true); setSelectedCampaignId(""); }}>
                  <Plus className="h-4 w-4 mr-1" />New Campaign
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Leads</TableHead>
                      <TableHead>Contacted</TableHead>
                      <TableHead>Converted</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns?.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell><Badge variant="outline">{c.campaign_type?.replace("_", " ")}</Badge></TableCell>
                        <TableCell>
                          <Badge variant={c.status === "active" ? "default" : c.status === "completed" ? "secondary" : "outline"}>{c.status}</Badge>
                        </TableCell>
                        <TableCell>{c.total_leads}</TableCell>
                        <TableCell>{c.contacted_count}</TableCell>
                        <TableCell>{c.converted_count}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), "MMM d")}</TableCell>
                      </TableRow>
                    ))}
                    {(!campaigns || campaigns.length === 0) && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No campaigns yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Campaign Modal */}
      <Dialog open={showCampaignModal} onOpenChange={setShowCampaignModal}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add to Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {campaigns && campaigns.length > 0 && (
              <div>
                <Label>Existing Campaign</Label>
                <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
                  <SelectTrigger><SelectValue placeholder="Select campaign or create new..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Create New</SelectItem>
                    {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(!selectedCampaignId || selectedCampaignId === "new") && (
              <>
                <div>
                  <Label>Campaign Name</Label>
                  <Input value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g. Texas Chiropractors Q1" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={campaignDesc} onChange={e => setCampaignDesc(e.target.value)} placeholder="Campaign goals..." />
                </div>
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
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCampaignModal(false)}>Cancel</Button>
            <Button onClick={handleCreateCampaignAndAdd}>{selectedCampaignId ? "Add to Campaign" : "Create & Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
