import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { ToastAction } from "@/components/ui/toast";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CallQueueStats, CallLeaderboard, SessionStats } from "@/components/pipeline/CallQueueStats";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowLeft, ArrowRight, Phone, PhoneOff, Voicemail, X, SkipForward,
  UserPlus, ThumbsUp, ThumbsDown, MapPin, Globe, Sparkles, Clock, Calendar,
  Keyboard, ExternalLink, Mail, AlertCircle, Star, DollarSign, Package
} from "lucide-react";
import { format, addDays, addHours, isToday, isPast } from "date-fns";

const NOT_INTERESTED_REASONS = [
  "Too Expensive", "Already Has Provider", "Not a Fit", "Bad Timing",
  "Going with Competitor", "Going Out of Business", "Other"
];

export default function CallQueue() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showInterestedModal, setShowInterestedModal] = useState(false);
  const [showNotInterestedModal, setShowNotInterestedModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showExitSummary, setShowExitSummary] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("10:00");
  const [estimatedDealValue, setEstimatedDealValue] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [notInterestedReason, setNotInterestedReason] = useState("");
  const [notInterestedNotes, setNotInterestedNotes] = useState("");
  const [voicemailLeft, setVoicemailLeft] = useState(false);
  const exitHandledRef = useRef(false);

  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("*").eq("id", campaignId!).single();
      return data;
    },
    enabled: !!campaignId,
  });

  const { data: allCampaigns } = useQuery({
    queryKey: ["all-campaigns-for-switch"],
    queryFn: async () => {
      const { data } = await supabase.from("campaigns").select("id, name, status").in("status", ["active", "draft"]).order("name");
      return data || [];
    },
  });

  const { data: servicePackages } = useQuery({
    queryKey: ["service-packages"],
    queryFn: async () => {
      const { data } = await supabase.from("service_packages").select("*").eq("is_active", true).order("display_order");
      return data || [];
    },
  });

  const { data: allLeads, refetch } = useQuery({
    queryKey: ["call-queue", campaignId],
    queryFn: async () => {
      const { data } = await supabase
        .from("campaign_leads")
        .select("*, scraped_leads(*)")
        .eq("campaign_id", campaignId!)
        .not("status", "in", '("converted","disqualified","not_interested","wrong_number")')
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!campaignId,
  });

  const { data: activities } = useQuery({
    queryKey: ["lead-activities", allLeads?.[currentIndex]?.id],
    queryFn: async () => {
      if (!allLeads?.[currentIndex]) return [];
      const { data } = await supabase
        .from("campaign_activities")
        .select("*, profiles:performed_by(full_name)")
        .eq("campaign_lead_id", allLeads[currentIndex].id)
        .order("created_at", { ascending: false })
        .limit(10);
      return data || [];
    },
    enabled: !!allLeads?.[currentIndex],
  });

  // Nearby providers for mini-map context
  const currentLead = useMemo(() => {
    if (!allLeads) return undefined;
    // Sort leads by priority
    const sorted = [...allLeads].sort((a, b) => {
      const now = new Date();
      // 1. Scheduled follow-ups due today or overdue (oldest first)
      const aOverdue = a.next_follow_up && (isToday(new Date(a.next_follow_up)) || isPast(new Date(a.next_follow_up)));
      const bOverdue = b.next_follow_up && (isToday(new Date(b.next_follow_up)) || isPast(new Date(b.next_follow_up)));
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      if (aOverdue && bOverdue) return new Date(a.next_follow_up!).getTime() - new Date(b.next_follow_up!).getTime();

      // 2. Never-contacted leads with highest AI score
      const aNever = a.call_attempts === 0;
      const bNever = b.call_attempts === 0;
      if (aNever && !bNever) return -1;
      if (!aNever && bNever) return 1;
      if (aNever && bNever) return (b.scraped_leads?.ai_score || 0) - (a.scraped_leads?.ai_score || 0);

      // 3. Leads with 1-2 previous attempts sorted by AI score
      const aFew = a.call_attempts >= 1 && a.call_attempts <= 2;
      const bFew = b.call_attempts >= 1 && b.call_attempts <= 2;
      if (aFew && !bFew) return -1;
      if (!aFew && bFew) return 1;

      // 4. Everything else by AI score
      return (b.scraped_leads?.ai_score || 0) - (a.scraped_leads?.ai_score || 0);
    });
    return sorted[currentIndex];
  }, [allLeads, currentIndex]);

  const lead = currentLead?.scraped_leads;
  const sortedLeadsCount = allLeads?.length || 0;

  const { data: nearbyProviders } = useQuery({
    queryKey: ["nearby-providers", lead?.state],
    queryFn: async () => {
      if (!lead?.state) return [];
      const { data } = await supabase.from("providers").select("id, business_name, latitude, longitude, city").eq("state", lead.state).limit(20);
      return data || [];
    },
    enabled: !!lead?.state,
  });

  const isCoverageGap = (nearbyProviders?.length || 0) === 0;

  const logActivity = async (type: string, description: string, outcome?: string) => {
    if (!currentLead) return;
    await supabase.from("campaign_activities").insert({
      campaign_lead_id: currentLead.id,
      activity_type: type as any,
      description,
      outcome: outcome || null,
      performed_by: user?.id,
    });
  };

  const updateLeadStatus = async (status: string, extras: Record<string, any> = {}) => {
    if (!currentLead) return;
    await supabase.from("campaign_leads").update({ status: status as any, ...extras }).eq("id", currentLead.id);
  };

  const notifyCallLogged = (type: "call" | "voicemail" | "connect" | "interested" | "conversion") => {
    const fn = (window as any).__callQueueOnCallLogged;
    if (fn) fn(type);
  };

  const moveNext = () => {
    if (currentIndex < sortedLeadsCount - 1) setCurrentIndex(prev => prev + 1);
    queryClient.invalidateQueries({ queryKey: ["call-queue", campaignId] });
    queryClient.invalidateQueries({ queryKey: ["lead-activities"] });
  };

  const movePrev = () => {
    if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
  };

  // ── Interested ──
  const handleInterested = () => {
    setNoteText("");
    setFollowUpDate(format(addDays(new Date(), 3), "yyyy-MM-dd"));
    setFollowUpTime("10:00");
    setEstimatedDealValue("");
    setSelectedPackageId("");
    setShowInterestedModal(true);
  };

  const confirmInterested = async () => {
    const followUp = followUpDate ? new Date(`${followUpDate}T${followUpTime || "10:00"}`).toISOString() : null;
    await updateLeadStatus("interested", {
      notes: noteText,
      next_follow_up: followUp,
      call_attempts: (currentLead?.call_attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
    });
    await logActivity("call", "Called — Interested", noteText);
    setShowInterestedModal(false);
    notifyCallLogged("interested");
    toast({ title: "Marked as interested" });
    moveNext();
  };

  // ── Not Interested ──
  const handleNotInterested = () => {
    setNotInterestedReason("");
    setNotInterestedNotes("");
    setShowNotInterestedModal(true);
  };

  const confirmNotInterested = async () => {
    const desc = [notInterestedReason, notInterestedNotes].filter(Boolean).join(" — ");
    await updateLeadStatus("not_interested", {
      outcome: notInterestedReason,
      notes: notInterestedNotes || currentLead?.notes,
      call_attempts: (currentLead?.call_attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
    });
    await logActivity("call", "Called — Not Interested", desc);
    setShowNotInterestedModal(false);
    notifyCallLogged("call");
    toast({ title: "Marked as not interested" });
    moveNext();
  };

  // ── No Answer ──
  const handleNoAnswer = async () => {
    await updateLeadStatus("no_answer", {
      call_attempts: (currentLead?.call_attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      next_follow_up: addHours(new Date(), 48).toISOString(),
    });
    await logActivity("call", `Called — No Answer${voicemailLeft ? " (voicemail checkbox)" : ""}`);
    notifyCallLogged("call");
    toast({ title: "No answer — follow-up in 48 hours" });
    setVoicemailLeft(false);
    moveNext();
  };

  // ── Voicemail ──
  const handleVoicemail = async () => {
    await updateLeadStatus("follow_up", {
      call_attempts: (currentLead?.call_attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
      next_follow_up: addHours(new Date(), 72).toISOString(),
    });
    await logActivity("voicemail", "Left voicemail");
    notifyCallLogged("voicemail");
    toast({ title: "Voicemail logged — follow-up in 72 hours" });
    moveNext();
  };

  // ── Wrong Number ──
  const handleWrongNumber = async () => {
    await updateLeadStatus("wrong_number", {
      outcome: "Wrong number / Bad lead",
      call_attempts: (currentLead?.call_attempts || 0) + 1,
      last_attempt_at: new Date().toISOString(),
    });
    await logActivity("call", "Wrong Number / Bad Lead");
    await supabase.from("scraped_leads").update({ status: "disqualified" as any, disqualified_reason: "Wrong number" }).eq("id", lead?.id);
    notifyCallLogged("call");
    toast({ title: "Disqualified — wrong number" });
    moveNext();
  };

  // ── Convert ──
  const handleConvert = () => setShowConvertModal(true);

  const confirmConvert = async () => {
    if (!lead || !currentLead) return;

    const tags: string[] = [];
    if (isCoverageGap) tags.push("Coverage Gap Win");

    const { data: provider, error } = await supabase.from("providers").insert({
      business_name: lead.business_name,
      contact_name: lead.business_name,
      contact_phone: lead.phone || null,
      contact_email: lead.email || null,
      address_line1: lead.address || null,
      city: lead.city || null,
      state: lead.state || null,
      zip_code: lead.zip_code || null,
      latitude: lead.latitude || null,
      longitude: lead.longitude || null,
      provider_type: lead.category || null,
      status: "prospect" as any,
      assigned_sales_rep: user?.id,
      service_package_id: selectedPackageId || null,
      notes: [
        lead.ai_summary ? `AI Summary: ${lead.ai_summary}` : "",
        lead.ai_score ? `AI Score: ${lead.ai_score}` : "",
        lead.website ? `Website: ${lead.website}` : "",
        estimatedDealValue ? `Estimated Value: $${estimatedDealValue}` : "",
      ].filter(Boolean).join("\n"),
      tags,
    } as any).select().single();

    if (error) {
      toast({ title: "Failed to create provider", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("sales_pipeline").insert({
      provider_id: provider.id,
      sales_rep_id: user?.id!,
      stage: "initial_contact" as any,
      estimated_value: estimatedDealValue ? parseFloat(estimatedDealValue) : null,
      notes: `Converted from campaign "${campaign?.name || ""}". AI Score: ${lead.ai_score || "N/A"}${isCoverageGap ? " | 🏆 Coverage Gap Win" : ""}`,
    });

    if (activities && activities.length > 0) {
      const activityInserts = activities.map((a) => ({
        provider_id: provider.id,
        user_id: a.performed_by || user?.id,
        activity_type: (a.activity_type === "voicemail" ? "call" : a.activity_type === "status_change" ? "status_change" : "call") as any,
        description: `[Campaign] ${a.description || ""}${a.outcome ? ` — ${a.outcome}` : ""}`,
        created_at: a.created_at,
      }));
      await supabase.from("activities").insert(activityInserts);
    }

    await supabase.from("activities").insert({
      provider_id: provider.id, user_id: user?.id,
      activity_type: "status_change" as any,
      description: `Provider created from campaign lead conversion.${isCoverageGap ? " 🏆 Coverage Gap Win!" : ""}`,
    });

    await updateLeadStatus("converted");
    await logActivity("status_change", `Converted to provider (ID: ${provider.id})`);
    await supabase.from("scraped_leads").update({ status: "converted" as any }).eq("id", lead.id);

    if (campaignId) {
      await supabase.from("campaigns").update({
        converted_count: (campaign?.converted_count || 0) + 1,
      }).eq("id", campaignId);
    }

    setShowConvertModal(false);

    toast({
      title: isCoverageGap ? "🏆 Coverage Gap Win!" : "Lead converted to provider!",
      description: `${lead.business_name} has been added as a provider.`,
      action: <ToastAction altText="View" onClick={() => navigate(`/providers/${provider.id}`)}>View Provider</ToastAction>,
    });
    notifyCallLogged("conversion");
    moveNext();
  };

  // ── Keyboard Shortcuts ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (showInterestedModal || showNotInterestedModal || showConvertModal || showExitSummary) return;

      switch (e.key.toLowerCase()) {
        case "n": moveNext(); break;
        case "p": movePrev(); break;
        case "1": handleInterested(); break;
        case "2": handleNotInterested(); break;
        case "3": handleNoAnswer(); break;
        case "4": handleVoicemail(); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIndex, sortedLeadsCount, showInterestedModal, showNotInterestedModal, showConvertModal, showExitSummary]);

  // ── End-of-session on navigate away ──
  const handleEndSession = (stats: SessionStats) => {
    exitHandledRef.current = true;
    navigate(`/campaigns/${campaignId}`);
  };

  // Get the last call with notes for follow-up context
  const lastCallWithNotes = activities?.find(a => a.outcome || a.description?.includes("—"));
  const isFollowUp = currentLead?.next_follow_up && (isToday(new Date(currentLead.next_follow_up)) || isPast(new Date(currentLead.next_follow_up)));

  const scoreColor = (score?: number | null) => {
    if (!score) return "border-muted-foreground/30 text-muted-foreground";
    if (score >= 70) return "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400";
    if (score >= 40) return "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400";
    return "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400";
  };

  return (
    <>
      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          {/* Stats Bar */}
          {campaignId && (
            <CallQueueStats campaignId={campaignId} onEndSession={handleEndSession} />
          )}

          {/* Header with campaign switcher */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate(`/campaigns/${campaignId}`)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">Call Queue</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <Select value={campaignId || ""} onValueChange={v => navigate(`/call-queue/${v}`)}>
                    <SelectTrigger className="h-7 text-xs w-auto border-none p-0 shadow-none text-muted-foreground hover:text-foreground">
                      <SelectValue>{campaign?.name || "Select campaign"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {allCampaigns?.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground">· {sortedLeadsCount} leads</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">
                {sortedLeadsCount > 0 ? `${currentIndex + 1} / ${sortedLeadsCount}` : "0 leads"}
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Keyboard className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs space-y-1">
                    <p><kbd className="px-1 border rounded text-[10px]">N</kbd> Next lead</p>
                    <p><kbd className="px-1 border rounded text-[10px]">P</kbd> Previous lead</p>
                    <p><kbd className="px-1 border rounded text-[10px]">1</kbd> Interested</p>
                    <p><kbd className="px-1 border rounded text-[10px]">2</kbd> Not Interested</p>
                    <p><kbd className="px-1 border rounded text-[10px]">3</kbd> No Answer</p>
                    <p><kbd className="px-1 border rounded text-[10px]">4</kbd> Voicemail</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {sortedLeadsCount === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <Phone className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                <p className="text-lg text-muted-foreground">No leads in queue.</p>
                <Button variant="outline" className="mt-4" onClick={() => navigate(`/campaigns/${campaignId}`)}>Back to Campaign</Button>
              </CardContent>
            </Card>
          ) : currentLead && lead ? (
            <>
              {/* ═══ LEAD CARD ═══ */}
              <Card className="border-2 border-primary/20">
                <CardContent className="p-6">
                  {/* TOP SECTION */}
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-3xl font-bold text-foreground leading-tight truncate">{lead.business_name}</h2>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {lead.category && <Badge variant="secondary">{lead.category}</Badge>}
                        {lead.business_size && <Badge variant="outline">{lead.business_size}</Badge>}
                        {isFollowUp && <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300">Follow-up Due</Badge>}
                        {isCoverageGap && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-300">
                            <Star className="h-3 w-3 mr-1" />Coverage Gap — High Priority
                          </Badge>
                        )}
                      </div>
                    </div>
                    {/* AI Score Ring */}
                    <div className={`flex-shrink-0 w-16 h-16 rounded-full border-[3px] flex flex-col items-center justify-center ${scoreColor(lead.ai_score)}`}>
                      <span className="text-xl font-bold leading-none">{lead.ai_score || "—"}</span>
                      <span className="text-[9px] leading-none mt-0.5 opacity-70">AI</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* LEFT COLUMN: Contact + AI */}
                    <div className="lg:col-span-2 space-y-4">
                      {/* CONTACT SECTION */}
                      <div className="space-y-3">
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl hover:bg-primary/10 transition group">
                            <Phone className="h-6 w-6 text-primary" />
                            <span className="text-2xl font-bold text-foreground group-hover:text-primary transition">{lead.phone}</span>
                          </a>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {lead.website && (
                            <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg hover:bg-muted transition text-sm">
                              <Globe className="h-4 w-4 text-primary flex-shrink-0" />
                              <span className="text-primary underline truncate">{lead.website.replace(/^https?:\/\//, "")}</span>
                              <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" />
                            </a>
                          )}
                          {lead.email && (
                            <a href={`mailto:${lead.email}`} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg hover:bg-muted transition text-sm">
                              <Mail className="h-4 w-4 text-primary" />
                              <span className="truncate">{lead.email}</span>
                            </a>
                          )}
                          {(lead.address || lead.city) && (
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(", "))}`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg hover:bg-muted transition text-sm sm:col-span-1"
                            >
                              <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="truncate">{[lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(", ")}</span>
                              <ExternalLink className="h-3 w-3 text-muted-foreground ml-auto flex-shrink-0" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* AI SECTION */}
                      {lead.ai_summary && (
                        <div className="flex items-start gap-2.5 bg-primary/5 border border-primary/10 rounded-xl p-4">
                          <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-primary mb-1">Why Target This Lead</p>
                            <p className="text-sm text-foreground">{lead.ai_summary}</p>
                          </div>
                        </div>
                      )}

                      {/* FOLLOW-UP CONTEXT (yellow box) */}
                      {isFollowUp && lastCallWithNotes && (
                        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-1">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Follow-up Context</p>
                          </div>
                          <p className="text-sm text-amber-900 dark:text-amber-200">
                            Last: {lastCallWithNotes.description}
                            {lastCallWithNotes.outcome && ` — ${lastCallWithNotes.outcome}`}
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            {format(new Date(lastCallWithNotes.created_at), "MMM d 'at' h:mm a")}
                          </p>
                        </div>
                      )}

                      {/* HISTORY SECTION */}
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5" />
                          <span><strong className="text-foreground">{currentLead.call_attempts}</strong> attempts</span>
                        </div>
                        {currentLead.last_attempt_at && (
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>Last: {format(new Date(currentLead.last_attempt_at), "MMM d, h:mm a")}</span>
                          </div>
                        )}
                        {currentLead.next_follow_up && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            <span>Follow-up: {format(new Date(currentLead.next_follow_up), "MMM d")}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Call History + Map placeholder */}
                    <div className="space-y-4">
                      {/* Nearby providers info */}
                      <div className="bg-muted/30 rounded-lg p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />Nearby Providers ({nearbyProviders?.length || 0})
                        </p>
                        {nearbyProviders && nearbyProviders.length > 0 ? (
                          <div className="space-y-1 max-h-24 overflow-y-auto">
                            {nearbyProviders.slice(0, 5).map(p => (
                              <p key={p.id} className="text-xs text-muted-foreground truncate">• {p.business_name}{p.city ? `, ${p.city}` : ""}</p>
                            ))}
                            {nearbyProviders.length > 5 && <p className="text-xs text-muted-foreground">+{nearbyProviders.length - 5} more</p>}
                          </div>
                        ) : (
                          <p className="text-xs text-green-600 font-medium">No providers in this area — coverage gap!</p>
                        )}
                      </div>

                      {/* Call History */}
                      <div>
                        <h3 className="font-medium text-xs text-muted-foreground mb-2">Call History</h3>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {activities?.map(a => (
                            <div key={a.id} className="text-xs border-l-2 border-muted pl-2.5 py-1">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{a.activity_type}</Badge>
                                <span className="text-muted-foreground">{format(new Date(a.created_at), "M/d h:mma")}</span>
                              </div>
                              {a.description && <p className="mt-0.5 text-muted-foreground">{a.description}</p>}
                              {a.outcome && <p className="text-foreground font-medium">{a.outcome}</p>}
                            </div>
                          ))}
                          {(!activities || activities.length === 0) && (
                            <p className="text-xs text-muted-foreground italic">No previous activity</p>
                          )}
                        </div>
                      </div>

                      {currentLead.notes && !isFollowUp && (
                        <div className="bg-muted/30 rounded-lg p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
                          <p className="text-xs">{currentLead.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ═══ ACTION BUTTONS ═══ */}
              <Card>
                <CardContent className="py-4 px-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button size="lg" onClick={handleInterested} className="bg-green-600 hover:bg-green-700 text-white">
                      <ThumbsUp className="h-4 w-4 mr-1.5" />Interested <kbd className="ml-2 text-[10px] opacity-60 border border-white/20 rounded px-1">1</kbd>
                    </Button>
                    <Button size="lg" variant="destructive" onClick={handleNotInterested}>
                      <ThumbsDown className="h-4 w-4 mr-1.5" />Not Interested <kbd className="ml-2 text-[10px] opacity-60 border border-white/20 rounded px-1">2</kbd>
                    </Button>
                    <Button size="lg" variant="outline" onClick={handleNoAnswer}>
                      <PhoneOff className="h-4 w-4 mr-1.5" />No Answer <kbd className="ml-2 text-[10px] opacity-60 border rounded px-1">3</kbd>
                    </Button>
                    <Button size="lg" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/20" onClick={handleVoicemail}>
                      <Voicemail className="h-4 w-4 mr-1.5" />Voicemail <kbd className="ml-2 text-[10px] opacity-60 border rounded px-1">4</kbd>
                    </Button>
                    <Button size="lg" variant="outline" className="text-muted-foreground" onClick={handleWrongNumber}>
                      <X className="h-4 w-4 mr-1.5" />Wrong # / Bad Lead
                    </Button>
                    <Button size="lg" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleConvert}>
                      <UserPlus className="h-4 w-4 mr-1.5" />Convert to Provider
                    </Button>
                    <div className="ml-auto flex gap-1">
                      <Button variant="ghost" size="sm" disabled={currentIndex === 0} onClick={movePrev}>
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => { if (currentIndex < sortedLeadsCount - 1) setCurrentIndex(prev => prev + 1); }}>
                        <SkipForward className="h-4 w-4 mr-1" />Skip
                      </Button>
                      <Button variant="ghost" size="sm" disabled={currentIndex >= sortedLeadsCount - 1} onClick={moveNext}>
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>

        {/* Leaderboard Sidebar */}
        <div className="hidden xl:block w-64 shrink-0">
          <CallLeaderboard />
        </div>
      </div>

      {/* ═══ INTERESTED MODAL ═══ */}
      <Dialog open={showInterestedModal} onOpenChange={setShowInterestedModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-green-600"><ThumbsUp className="h-5 w-5" />Lead Interested</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Notes</Label>
              <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="What did they say? Key takeaways..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Follow-up Date</Label>
                <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
              </div>
              <div>
                <Label>Follow-up Time</Label>
                <Input type="time" value={followUpTime} onChange={e => setFollowUpTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Estimated Deal Value</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="number" className="pl-8" value={estimatedDealValue} onChange={e => setEstimatedDealValue(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div>
              <Label>Preferred Service Package</Label>
              <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                <SelectTrigger><SelectValue placeholder="Select package..." /></SelectTrigger>
                <SelectContent>
                  {servicePackages?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInterestedModal(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={confirmInterested}>Save & Next</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ NOT INTERESTED MODAL ═══ */}
      <Dialog open={showNotInterestedModal} onOpenChange={setShowNotInterestedModal}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><ThumbsDown className="h-5 w-5" />Not Interested</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason</Label>
              <Select value={notInterestedReason} onValueChange={setNotInterestedReason}>
                <SelectTrigger><SelectValue placeholder="Select reason..." /></SelectTrigger>
                <SelectContent>
                  {NOT_INTERESTED_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea value={notInterestedNotes} onChange={e => setNotInterestedNotes(e.target.value)} placeholder="Any additional context..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotInterestedModal(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmNotInterested}>Confirm & Next</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══ CONVERT MODAL ═══ */}
      <Dialog open={showConvertModal} onOpenChange={setShowConvertModal}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-amber-500" />Convert to Provider</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This will create a provider record for <strong>{lead?.business_name}</strong>, add to your pipeline, copy all call history, and assign to you.
            </p>
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p><strong>Business:</strong> {lead?.business_name}</p>
              <p><strong>Phone:</strong> {lead?.phone || "—"}</p>
              <p><strong>Email:</strong> {lead?.email || "—"}</p>
              <p><strong>Location:</strong> {[lead?.address, lead?.city, lead?.state, lead?.zip_code].filter(Boolean).join(", ") || "—"}</p>
              <p><strong>Category:</strong> {lead?.category || "—"}</p>
              {lead?.ai_score && <p><strong>AI Score:</strong> {lead.ai_score}</p>}
            </div>
            {selectedPackageId && (
              <div className="flex items-center gap-2 text-sm">
                <Package className="h-4 w-4 text-primary" />
                <span>Package: <strong>{servicePackages?.find(p => p.id === selectedPackageId)?.name || "Selected"}</strong></span>
              </div>
            )}
            {activities && activities.length > 0 && (
              <p className="text-xs text-muted-foreground">{activities.length} activity records will be copied.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertModal(false)}>Cancel</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={confirmConvert}><UserPlus className="h-4 w-4 mr-2" />Convert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
