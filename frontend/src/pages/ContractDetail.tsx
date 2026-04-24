import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Edit, Send, RefreshCw, XCircle, Clock, FileText,
  AlertTriangle, Download, MessageSquare, Bot, PenTool, Eye,
  CheckCircle, Check, Lock, Package,
} from "lucide-react";
import { toast } from "sonner";
import ContractForm from "@/components/contracts/ContractForm";
import SendForSignatureModal from "@/components/signatures/SendForSignatureModal";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-warning/10 text-warning",
  sent: "bg-primary/10 text-primary",
  negotiating: "bg-warning/10 text-warning",
  signed: "bg-success/10 text-success",
  active: "bg-success/10 text-success",
  expired: "bg-destructive/10 text-destructive",
  terminated: "bg-destructive/10 text-destructive",
};

const docStatusConfig: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  pending: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Pending" },
  sent: { color: "bg-primary/10 text-primary", icon: Send, label: "Sent" },
  viewed: { color: "bg-warning/10 text-warning", icon: Eye, label: "Viewed" },
  signed: { color: "bg-primary/10 text-primary", icon: Check, label: "Provider Signed" },
  provider_signed: { color: "bg-primary/10 text-primary", icon: Check, label: "Provider Signed" },
  fully_executed: { color: "bg-success/10 text-success", icon: CheckCircle, label: "Fully Executed" },
  declined: { color: "bg-destructive/10 text-destructive", icon: XCircle, label: "Declined" },
  expired: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Expired" },
};

const statusFlow: ContractStatus[] = ["draft", "pending_review", "sent", "negotiating", "signed", "active"];

export default function ContractDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { role, user } = useAuth();
  const isProvider = role === "provider";

  const [editOpen, setEditOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ subject: "", description: "", priority: "medium" });
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [aiPickerOpen, setAiPickerOpen] = useState(false);

  const { data: pendingSigRequest } = useQuery({
    queryKey: ["pending-sig-request", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("signature_requests")
        .select("id, status")
        .eq("contract_id", id!)
        .in("status", ["pending", "viewed", "identity_verified"])
        .order("created_at", { ascending: false })
        .limit(1);
      return data?.[0] || null;
    },
  });

  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, providers(business_name, contact_name, contact_email, contact_phone, id), profiles(full_name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const providerId = (contract?.providers as any)?.id || contract?.provider_id;

  // Fetch provider documents
  const { data: providerDocs } = useQuery({
    queryKey: ["provider-docs-contract", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_documents")
        .select("*, document_templates(name, document_type, file_url, file_type, short_code), service_packages:package_id(name)")
        .eq("provider_id", providerId!)
        .order("signing_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Fetch subscription for monthly fee
  const { data: subscription } = useQuery({
    queryKey: ["provider-subscription", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("*, membership_tiers:tier_id(name, short_code), specialty_categories:category_id(name)")
        .eq("provider_id", providerId!)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  // Fetch service package
  const { data: servicePackage } = useQuery({
    queryKey: ["provider-service-package", providerId],
    enabled: !!providerId,
    queryFn: async () => {
      // Check if provider has docs with a package_id
      const { data } = await supabase
        .from("provider_documents")
        .select("package_id, service_packages:package_id(id, name)")
        .eq("provider_id", providerId!)
        .not("package_id", "is", null)
        .limit(1);
      return (data?.[0]?.service_packages as any) || null;
    },
  });

  const { data: activities } = useQuery({
    queryKey: ["contract_activities", providerId],
    enabled: !!providerId && !isProvider,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*, profiles(full_name)")
        .eq("provider_id", providerId!)
        .eq("activity_type", "contract_update")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (newStatus: ContractStatus) => {
      const { error } = await supabase.from("contracts").update({ status: newStatus }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      queryClient.invalidateQueries({ queryKey: ["v-contract-list"] });
      toast.success("Status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const notesMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("contracts").update({ terms_summary: notesText }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      setEditingNotes(false);
      toast.success("Notes updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const requestChangesMutation = useMutation({
    mutationFn: async () => {
      if (!providerId) throw new Error("No provider record");
      const { error } = await supabase.from("support_tickets").insert({
        provider_id: providerId,
        subject: requestForm.subject || `Change request — Contract #${contract!.id.slice(0, 8)}`,
        description: requestForm.description,
        category: "contract_question" as any,
        priority: requestForm.priority as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setRequestOpen(false);
      setRequestForm({ subject: "", description: "", priority: "medium" });
      toast.success("Change request submitted as a support ticket");
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  if (!contract) return <div className="text-center py-12 text-muted-foreground">Contract not found</div>;

  const daysUntilRenewal = contract.renewal_date
    ? Math.ceil((new Date(contract.renewal_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const renewalSoon = daysUntilRenewal !== null && daysUntilRenewal >= 0 && daysUntilRenewal <= 30;
  const daysUntilEnd = contract.end_date
    ? Math.ceil((new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const totalDocs = providerDocs?.length || 0;
  const signedDocs = providerDocs?.filter(d => ["signed", "provider_signed", "fully_executed"].includes(d.status || "")).length || 0;
  const docsWithTemplates = providerDocs?.filter(d => d.document_templates) || [];

  const handleAiReview = () => {
    if (docsWithTemplates.length === 0) {
      toast.error("No documents available for AI review");
      return;
    }
    if (docsWithTemplates.length === 1) {
      const templateId = (docsWithTemplates[0].document_templates as any)?.id || docsWithTemplates[0].template_id;
      navigate(`/document-review/${templateId}`);
    } else {
      setAiPickerOpen(true);
    }
  };

  const tierName = (subscription as any)?.membership_tiers?.name;
  const monthlyFee = subscription?.monthly_amount;

  return (
    <div className="space-y-6">
      {/* Renewal Banner */}
      {renewalSoon && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <div>
            <p className="font-semibold text-warning">Renewal Due Soon</p>
            <p className="text-sm text-muted-foreground">
              This contract renewal is in {daysUntilRenewal} day{daysUntilRenewal !== 1 ? "s" : ""} ({contract.renewal_date}).
            </p>
          </div>
          {!isProvider && (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => statusMutation.mutate("active")}>
              <RefreshCw className="h-4 w-4 mr-2" />Renew
            </Button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/contracts")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{(contract.providers as any)?.business_name || "Unknown"}</h1>
              <Badge className={`capitalize ${statusColors[contract.status]}`}>{contract.status.replace(/_/g, " ")}</Badge>
              {tierName && <Badge variant="outline">{tierName}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              Contract #{contract.id.slice(0, 8)}
              {servicePackage && <> · <Package className="inline h-3 w-3 mb-0.5" /> {servicePackage.name}</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isProvider ? (
            <div className="flex gap-2 flex-wrap">
              {pendingSigRequest && (
                <Button size="sm" onClick={() => navigate(`/sign/${pendingSigRequest.id}`)}>
                  <PenTool className="h-4 w-4 mr-2" />Sign Contract
                </Button>
              )}
              <Button variant="default" size="sm" onClick={handleAiReview}>
                <Bot className="h-4 w-4 mr-2" />Review with AI
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                setRequestForm({
                  subject: `Change request — Contract #${contract.id.slice(0, 8)}`,
                  description: `I would like to request changes to my ${contract.contract_type} contract (ID: ${contract.id.slice(0, 8)}).`,
                  priority: "medium",
                });
                setRequestOpen(true);
              }}>
                <MessageSquare className="h-4 w-4 mr-2" />Request Changes
              </Button>
            </div>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Edit className="h-4 w-4 mr-2" />Edit
              </Button>
              {["draft", "pending_review", "sent", "negotiating"].includes(contract.status) && (
                <Button size="sm" onClick={() => setSignatureModalOpen(true)}>
                  <PenTool className="h-4 w-4 mr-2" />Send for E-Signature
                </Button>
              )}
              {(contract.status === "draft" || contract.status === "pending_review") && (
                <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("sent")}>
                  <Send className="h-4 w-4 mr-2" />Send
                </Button>
              )}
              {contract.status === "signed" && (
                <Button variant="outline" size="sm" onClick={() => statusMutation.mutate("active")}>
                  <RefreshCw className="h-4 w-4 mr-2" />Activate
                </Button>
              )}
              {contract.status !== "terminated" && contract.status !== "expired" && (
                <Button variant="destructive" size="sm" onClick={() => statusMutation.mutate("terminated")}>
                  <XCircle className="h-4 w-4 mr-2" />Terminate
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Key Metrics - Updated */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Monthly Fee</p>
          <p className="text-xl font-bold">
            {monthlyFee != null ? `$${Number(monthlyFee).toLocaleString()}` : `$${Number(contract.deal_value || 0).toLocaleString()}`}
          </p>
          {monthlyFee != null && <p className="text-[10px] text-muted-foreground">Active subscription</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Start</p>
          <p className="text-xl font-bold">{contract.start_date || "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">End</p>
          <p className="text-xl font-bold">{contract.end_date || "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Days Remaining</p>
          <p className="text-xl font-bold">{daysUntilEnd !== null ? (daysUntilEnd > 0 ? daysUntilEnd : "Expired") : "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Documents</p>
          <p className="text-xl font-bold">{totalDocs > 0 ? `${signedDocs} of ${totalDocs}` : "—"}</p>
          {totalDocs > 0 && (
            <Progress value={(signedDocs / totalDocs) * 100} className="h-1.5 mt-1" />
          )}
        </CardContent></Card>
      </div>

      {/* Document Download */}
      {contract.document_url && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium text-sm">Contract Document</p>
                <p className="text-xs text-muted-foreground">Download the signed contract</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <a href={contract.document_url} target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-2" />Download
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Documents Section */}
      {totalDocs > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Provider Documents
              <Badge variant="secondary" className="text-xs">{signedDocs}/{totalDocs} signed</Badge>
            </CardTitle>
            {!isProvider && docsWithTemplates.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleAiReview}>
                <Bot className="h-4 w-4 mr-2" />AI Review
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {/* Signing progress bar for service packages */}
            {servicePackage && (
              <div className="mb-4">
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {providerDocs?.map((doc, i) => {
                    const isSigned = ["signed", "provider_signed", "fully_executed"].includes(doc.status || "");
                    const template = doc.document_templates as any;
                    return (
                      <div key={doc.id} className="flex items-center gap-1">
                        <div className="flex flex-col items-center min-w-[60px]">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isSigned ? "bg-success/20 text-success" : doc.status === "sent" || doc.status === "viewed" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                          }`}>
                            {isSigned ? <Check className="h-3.5 w-3.5" /> : doc.status === "pending" ? <Lock className="h-3 w-3" /> : i + 1}
                          </div>
                          <span className="text-[9px] mt-0.5 text-muted-foreground text-center truncate max-w-[60px]">
                            {template?.short_code || `Doc ${i + 1}`}
                          </span>
                        </div>
                        {i < (providerDocs?.length || 0) - 1 && (
                          <div className={`w-6 h-0.5 ${isSigned ? "bg-success" : "bg-muted"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerDocs?.map(doc => {
                  const template = doc.document_templates as any;
                  const pkg = doc.service_packages as any;
                  const status = docStatusConfig[doc.status || "pending"] || docStatusConfig.pending;
                  const StatusIcon = status.icon;
                  const fileUrl = doc.file_url || template?.file_url;

                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{template?.name || "One-off Document"}</p>
                          {pkg && <p className="text-[10px] text-muted-foreground">{pkg.name}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {template?.document_type && (
                          <Badge variant="outline" className="text-[10px] capitalize">{template.document_type}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${status.color} text-[10px]`}>
                          <StatusIcon className="h-3 w-3 mr-1" />{status.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {doc.signed_at ? new Date(doc.signed_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {fileUrl && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                  <Eye className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
                                <a href={fileUrl} download>
                                  <Download className="h-3.5 w-3.5" />
                                </a>
                              </Button>
                            </>
                          )}
                          {template && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => navigate(`/document-review/${template.id || doc.template_id}`)}
                            >
                              <Bot className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue={!isProvider ? "timeline" : "documents"}>
        <TabsList>
          {!isProvider && <TabsTrigger value="timeline">Timeline</TabsTrigger>}
          <TabsTrigger value="documents">Signed Documents</TabsTrigger>
          {!isProvider && <TabsTrigger value="notes">Admin Notes</TabsTrigger>}
          {!isProvider && <TabsTrigger value="activity">Activity</TabsTrigger>}
        </TabsList>

        {!isProvider && (
          <TabsContent value="timeline" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">Contract Status Timeline</CardTitle></CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {statusFlow.map((s, i) => {
                    const current = statusFlow.indexOf(contract.status as any);
                    const isActive = i <= current;
                    const isCurrent = s === contract.status;
                    return (
                      <div key={s} className="flex items-center gap-2">
                        <div className="flex flex-col items-center min-w-[80px]">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isCurrent ? "bg-primary text-primary-foreground" : isActive ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                            {i + 1}
                          </div>
                          <span className={`text-xs mt-1 capitalize ${isCurrent ? "font-bold text-primary" : "text-muted-foreground"}`}>
                            {s.replace(/_/g, " ")}
                          </span>
                        </div>
                        {i < statusFlow.length - 1 && (
                          <div className={`w-8 h-0.5 ${isActive && i < current ? "bg-success" : "bg-muted"}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="documents" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle className="text-lg">Signed & Executed Documents</CardTitle></CardHeader>
            <CardContent>
              {providerDocs && providerDocs.filter(d => ["signed", "provider_signed", "fully_executed"].includes(d.status || "")).length > 0 ? (
                <div className="space-y-3">
                  {providerDocs.filter(d => ["signed", "provider_signed", "fully_executed"].includes(d.status || "")).map(doc => {
                    const template = doc.document_templates as any;
                    const fileUrl = doc.file_url || template?.file_url;
                    return (
                      <div key={doc.id} className="flex items-center justify-between border rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-success" />
                          <div>
                            <p className="font-medium text-sm">{template?.name || "Document"}</p>
                            <p className="text-xs text-muted-foreground">
                              Signed {doc.signed_at ? new Date(doc.signed_at).toLocaleDateString() : ""}
                              {doc.status === "fully_executed" && " · Fully Executed"}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {fileUrl && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                                  <Eye className="h-4 w-4 mr-1" />View
                                </a>
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                <a href={fileUrl} download>
                                  <Download className="h-4 w-4 mr-1" />Download
                                </a>
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No signed documents yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {!isProvider && (
          <TabsContent value="notes" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Admin Notes</CardTitle>
                {!editingNotes ? (
                  <Button variant="outline" size="sm" onClick={() => { setNotesText(contract.terms_summary || ""); setEditingNotes(true); }}>
                    <Edit className="h-4 w-4 mr-2" />Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => notesMutation.mutate()} disabled={notesMutation.isPending}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingNotes(false)}>Cancel</Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {editingNotes ? (
                  <Textarea value={notesText} onChange={(e) => setNotesText(e.target.value)} rows={10} placeholder="Internal notes about this contract..." />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{contract.terms_summary || "No admin notes."}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {!isProvider && (
          <TabsContent value="activity" className="space-y-4 mt-4">
            <Card>
              <CardHeader><CardTitle className="text-lg">Related Activity</CardTitle></CardHeader>
              <CardContent>
                {activities && activities.length > 0 ? (
                  <div className="space-y-3">
                    {activities.map((a) => (
                      <div key={a.id} className="flex gap-3 items-start">
                        <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                        <div>
                          <p className="text-sm">{a.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.profiles?.full_name || "System"} · {new Date(a.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No activity logged.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Edit Dialog (admin/sales only) */}
      {!isProvider && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Contract</DialogTitle></DialogHeader>
            <ContractForm contractId={contract.id} defaultProviderId={contract.provider_id} onSuccess={() => setEditOpen(false)} />
          </DialogContent>
        </Dialog>
      )}

      {/* Request Changes Dialog (provider only) */}
      {isProvider && (
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Request Contract Changes</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Subject</Label>
                <Input value={requestForm.subject} onChange={(e) => setRequestForm({ ...requestForm, subject: e.target.value })} />
              </div>
              <div>
                <Label>Describe the changes you'd like</Label>
                <Textarea value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} rows={4} placeholder="What changes would you like to make to this contract?" />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={requestForm.priority} onValueChange={(v) => setRequestForm({ ...requestForm, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.ticket_priority.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => requestChangesMutation.mutate()} disabled={!requestForm.description || requestChangesMutation.isPending}>
                {requestChangesMutation.isPending ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* AI Review Picker Dialog */}
      <Dialog open={aiPickerOpen} onOpenChange={setAiPickerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Select a Document to Review</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {docsWithTemplates.map(doc => {
              const template = doc.document_templates as any;
              return (
                <Button
                  key={doc.id}
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => {
                    setAiPickerOpen(false);
                    navigate(`/document-review/${template?.id || doc.template_id}`);
                  }}
                >
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <div className="text-left">
                    <p className="font-medium text-sm">{template?.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{template?.document_type}</p>
                  </div>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Send for E-Signature Modal */}
      {!isProvider && (
        <SendForSignatureModal
          open={signatureModalOpen}
          onOpenChange={setSignatureModalOpen}
          contract={contract}
        />
      )}
    </div>
  );
}
