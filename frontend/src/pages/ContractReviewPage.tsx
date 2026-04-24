import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft, Send, Bot, User, FileText, Calendar, DollarSign,
  AlertTriangle, Clock, Shield, CheckCircle2, Star, Loader2, Lock, Check
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ProviderDoc {
  id: string;
  provider_id: string;
  template_id: string;
  package_id: string | null;
  signing_order: number | null;
  status: string | null;
  signed_at: string | null;
  document_templates: {
    id: string;
    name: string;
    document_type: string;
    description: string | null;
    short_code: string;
  };
}

// Document context descriptions keyed by common short_codes / document_type patterns
const DOCUMENT_CONTEXTS: Record<string, string> = {
  "contract_1": "This is the foundational Platform Participation Agreement. Every provider signs this. It covers what the platform is, your obligations, their obligations, clinical independence, HIPAA, and the rules of participation. This document is deliberately silent on fees and money.",
  "platform_participation": "This is the foundational Platform Participation Agreement. Every provider signs this. It covers what the platform is, your obligations, their obligations, clinical independence, HIPAA, and the rules of participation. This document is deliberately silent on fees and money.",
  "baa": "This is the Business Associate Agreement required under HIPAA. It covers how your patient health information is protected.",
  "hipaa": "This is the Business Associate Agreement required under HIPAA. It covers how your patient health information is protected.",
  "contract_2": "This is the Administrative Services Agreement with Medical Servicing LLC. It covers the specific services performed, the administrative services fee, and payment terms.",
  "admin_services": "This is the Administrative Services Agreement with Medical Servicing LLC. It covers the specific services performed, the administrative services fee, and payment terms.",
  "contract_3": "This is the Fee Schedule Funding Agreement. It covers purchasing of receivables based on a fee schedule.",
  "fee_schedule": "This is the Fee Schedule Funding Agreement. It covers purchasing of receivables based on a fee schedule.",
  "contract_4": "This is the Percentage-based Funding Agreement. It covers purchasing of receivables based on a percentage.",
  "percentage_funding": "This is the Percentage-based Funding Agreement. It covers purchasing of receivables based on a percentage.",
  "multi_state": "This addendum applies if you treat patients outside of Georgia and extends the agreement to cover those states.",
  "addendum": "This addendum applies if you treat patients outside of Georgia and extends the agreement to cover those states.",
};

function getDocumentContext(doc: ProviderDoc): string {
  const code = doc.document_templates.short_code?.toLowerCase();
  const type = doc.document_templates.document_type?.toLowerCase();
  return DOCUMENT_CONTEXTS[code] || DOCUMENT_CONTEXTS[type] || doc.document_templates.description || "Standard document in the provider's service package.";
}

export default function ContractReviewPage() {
  const { id: contractId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedDocId, setSelectedDocId] = useState<string | null>(searchParams.get("docId"));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch the contract with provider info
  const { data: contract } = useQuery({
    queryKey: ["contract-for-review", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("*, providers(id, business_name, contact_name, contact_email, service_package_id)")
        .eq("id", contractId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!contractId,
  });

  const providerId = (contract?.providers as any)?.id;
  const packageId = (contract?.providers as any)?.service_package_id;

  // Fetch all provider_documents for this provider's package
  const { data: providerDocs } = useQuery({
    queryKey: ["provider-docs-for-review", providerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_documents")
        .select("id, provider_id, template_id, package_id, signing_order, status, signed_at, document_templates(id, name, document_type, description, short_code)")
        .eq("provider_id", providerId!)
        .order("signing_order", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as ProviderDoc[];
    },
    enabled: !!providerId,
  });

  // Auto-select first doc if none selected
  useEffect(() => {
    if (providerDocs && providerDocs.length > 0 && !selectedDocId) {
      setSelectedDocId(providerDocs[0].id);
    }
  }, [providerDocs, selectedDocId]);

  const selectedDoc = providerDocs?.find(d => d.id === selectedDocId);
  const selectedDocIndex = providerDocs?.findIndex(d => d.id === selectedDocId) ?? 0;

  // Build list of all document names for cross-document awareness
  const allDocNames = providerDocs?.map((d, i) => `${i + 1}. ${d.document_templates.name} (${d.status === "signed" ? "signed" : "unsigned"})`).join("\n") || "";

  // Reset chat state when switching documents
  const switchDocument = useCallback((docId: string) => {
    if (docId === selectedDocId) return;
    setSelectedDocId(docId);
    setMessages([]);
    setSessionId(null);
    setSummaryData(null);
    setSummaryLoading(false);
  }, [selectedDocId]);

  // Create or fetch session for currently selected document
  useEffect(() => {
    if (!contract || !user || !selectedDoc || sessionId) return;
    const init = async () => {
      if (!providerId) return;

      // Use the contract_id tied to this provider document's review. We use the main contractId for all.
      const { data: existing } = await supabase
        .from("contract_review_sessions")
        .select("id")
        .eq("contract_id", contract.id)
        .eq("provider_id", providerId)
        .is("ended_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // For multi-doc, we check for a session scoped to this specific document template
      // We'll store template_id in flag_reason prefix for scoping — or just create per doc
      // Simplest: use the existing session model but create one per provider_document
      const docScopeTag = `doc:${selectedDoc.id}`;
      const { data: scopedSession } = await supabase
        .from("contract_review_sessions")
        .select("id")
        .eq("contract_id", contract.id)
        .eq("provider_id", providerId)
        .is("ended_at", null)
        .ilike("flag_reason", `${docScopeTag}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (scopedSession) {
        setSessionId(scopedSession.id);
        const { data: msgs } = await supabase
          .from("contract_review_messages")
          .select("*")
          .eq("session_id", scopedSession.id)
          .order("created_at");
        if (msgs && msgs.length > 0) {
          setMessages(msgs.map(m => ({
            role: (m.role as string) === "provider" ? "user" as const : "assistant" as const,
            content: m.message,
          })));
        }
      } else {
        const { data: newSession } = await supabase
          .from("contract_review_sessions")
          .insert({
            contract_id: contract.id,
            provider_id: providerId,
            flag_reason: docScopeTag,
          })
          .select()
          .single();
        if (newSession) setSessionId(newSession.id);
      }

      // Auto-mark contract_review onboarding step as in_progress
      const { data: workflows } = await supabase
        .from("onboarding_workflows")
        .select("id")
        .eq("provider_id", providerId)
        .in("status", ["in_progress", "not_started"])
        .limit(1);

      if (workflows && workflows.length > 0) {
        const workflowId = workflows[0].id;
        const { data: reviewSteps } = await supabase
          .from("workflow_steps")
          .select("id, status")
          .eq("workflow_id", workflowId)
          .eq("step_type", "contract_review")
          .in("status", ["pending"]);

        if (reviewSteps && reviewSteps.length > 0) {
          await supabase.from("workflow_steps").update({
            status: "in_progress" as any,
            notes: `AI Contract Review opened for ${selectedDoc.document_templates.name} on ${new Date().toLocaleDateString()}.`,
          }).eq("id", reviewSteps[0].id);
        }
      }
    };
    init();
  }, [contract, user, selectedDoc, sessionId, providerId]);

  // Generate document-specific summary
  useEffect(() => {
    if (!contract || !selectedDoc || summaryData || summaryLoading) return;
    const cacheKey = `doc-summary-${selectedDoc.id}-${contract.updated_at}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { setSummaryData(JSON.parse(cached)); return; } catch {}
    }
    generateSummary();
  }, [contract, selectedDoc]);

  const generateSummary = async () => {
    if (!contract || !selectedDoc) return;
    setSummaryLoading(true);
    try {
      const docContext = getDocumentContext(selectedDoc);
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Generate a structured JSON summary of this specific document with the following fields:
{
  "summary": "3-4 sentence plain English summary of what this document covers",
  "keyTerms": ["term1", "term2", "term3"],
  "yourObligations": ["bullet1", "bullet2"],
  "theirObligations": ["bullet1", "bullet2"],
  "readinessScore": 7,
  "readinessNote": "Brief note on how standard this document is"
}
Return ONLY the JSON, no markdown or explanation.` }],
          contractText: contract.terms_summary || "Standard contract terms apply.",
          contractType: contract.contract_type,
          dealTypeInfo: docContext,
          documentName: selectedDoc.document_templates.name,
          documentType: selectedDoc.document_templates.document_type,
        }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed");

      let fullText = "";
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) fullText += content;
          } catch {}
        }
      }

      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setSummaryData(parsed);
        localStorage.setItem(`doc-summary-${selectedDoc.id}-${contract.updated_at}`, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error("Summary generation failed:", e);
    } finally {
      setSummaryLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming || !selectedDoc) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setIsStreaming(true);

    if (sessionId) {
      await supabase.from("contract_review_messages").insert({
        session_id: sessionId,
        role: "provider" as any,
        message: text,
      });
      await supabase.from("contract_review_sessions")
        .update({ messages_count: (messages.length + 1) })
        .eq("id", sessionId);
    }

    let assistantText = "";
    const allMessages = [...messages, userMsg].map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    const docContext = getDocumentContext(selectedDoc);

    // Build cross-document context
    const otherDocs = providerDocs?.filter(d => d.id !== selectedDoc.id).map(d =>
      `- ${d.document_templates.name}: ${getDocumentContext(d)}`
    ).join("\n") || "";

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          contractText: contract?.terms_summary || "Standard contract terms apply.",
          contractType: contract?.contract_type,
          dealTypeInfo: docContext,
          sessionId,
          documentName: selectedDoc.document_templates.name,
          documentType: selectedDoc.document_templates.document_type,
          documentContext: docContext,
          otherDocuments: otherDocs,
          allDocumentsList: allDocNames,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "AI error" }));
        toast.error(err.error || "Failed to get AI response");
        setIsStreaming(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantText += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantText } : m);
                }
                return [...prev, { role: "assistant", content: assistantText }];
              });
            }
          } catch {}
        }
      }

      if (sessionId && assistantText) {
        const flagMatch = assistantText.match(/\[FLAG:(\w+):(\w+)\]/);
        const cleanText = assistantText.replace(/\[FLAG:\w+:\w+\]/g, "").trim();

        if (flagMatch) {
          setMessages(prev => prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: cleanText } : m
          ));
        }

        await supabase.from("contract_review_messages").insert({
          session_id: sessionId,
          role: "ai" as any,
          message: cleanText,
          flagged: !!flagMatch,
          flag_type: flagMatch ? flagMatch[1] as any : null,
          flag_severity: flagMatch ? flagMatch[2] as any : null,
        });

        if (flagMatch) {
          const existingReason = `doc:${selectedDoc.id}`;
          await supabase.from("contract_review_sessions").update({
            flagged: true,
            flag_reason: `${existingReason} | ${flagMatch[1]}: ${text.slice(0, 100)}`,
          }).eq("id", sessionId);
        }
      }
    } catch (e) {
      console.error("Stream error:", e);
      toast.error("Failed to get response");
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, messages, contract, selectedDoc, sessionId, providerDocs, allDocNames]);

  if (!contract) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  const scoreColor = (summaryData?.readinessScore || 0) >= 7 ? "text-primary" :
    (summaryData?.readinessScore || 0) >= 4 ? "text-accent-foreground" : "text-destructive";

  const hasMultipleDocs = (providerDocs?.length || 0) > 1;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />Back
      </Button>

      {/* Document Tab Bar */}
      {hasMultipleDocs && providerDocs && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Documents:</span>
              {providerDocs.map((doc, idx) => {
                const isSelected = doc.id === selectedDocId;
                const isSigned = doc.status === "signed";
                return (
                  <Button
                    key={doc.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => switchDocument(doc.id)}
                  >
                    {isSigned ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    <span className="max-w-[180px] truncate">
                      {idx + 1}. {doc.document_templates.name}
                    </span>
                    {isSigned && <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1 border-primary/50 text-primary">Signed</Badge>}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document-Specific Summary Card */}
      {selectedDoc && (
        <Card className="bg-gradient-to-r from-primary/5 to-transparent border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {selectedDoc.document_templates.name}
              </CardTitle>
              {summaryData?.readinessScore && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Readiness Score</span>
                  <Badge className={`text-lg font-bold ${scoreColor} bg-transparent border-2`}>
                    <Star className="h-4 w-4 mr-1" />{summaryData.readinessScore}/10
                  </Badge>
                </div>
              )}
            </div>
            <CardDescription>
              {getDocumentContext(selectedDoc)}
              {hasMultipleDocs && (
                <span className="block mt-1 text-xs">
                  Document {selectedDocIndex + 1} of {providerDocs?.length} in your package
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />Generating AI summary for this document...
              </div>
            ) : summaryData ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold mb-1">Summary</p>
                    <p className="text-sm text-muted-foreground">{summaryData.summary}</p>
                  </div>
                  {summaryData.keyTerms && (
                    <div>
                      <p className="text-sm font-semibold mb-1">Key Terms</p>
                      <div className="flex flex-wrap gap-1">
                        {summaryData.keyTerms.map((t: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {summaryData.readinessNote && (
                    <div>
                      <p className="text-sm font-semibold mb-1">Standardness</p>
                      <p className="text-sm text-muted-foreground">{summaryData.readinessNote}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold mb-1">Your Obligations</p>
                    <ul className="text-sm text-muted-foreground space-y-0.5">
                      {summaryData.yourObligations?.map((o: string, i: number) => (
                        <li key={i} className="flex gap-1"><span>•</span><span>{o}</span></li>
                      )) || <li>—</li>}
                    </ul>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">Their Obligations</p>
                    <ul className="text-sm text-muted-foreground space-y-0.5">
                      {summaryData.theirObligations?.map((o: string, i: number) => (
                        <li key={i} className="flex gap-1"><span>•</span><span>{o}</span></li>
                      )) || <li>—</li>}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Summary unavailable.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: "600px" }}>
        {/* LEFT: Document Viewer (60%) */}
        <Card className="lg:col-span-3 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              {selectedDoc?.document_templates.name || "Contract Document"}
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              {[
                { label: "Overview", icon: FileText },
                { label: "Key Terms", icon: Shield },
                { label: "Your Obligations", icon: CheckCircle2 },
                { label: "Termination Clauses", icon: AlertTriangle },
                { label: "Payment Terms", icon: DollarSign },
              ].map((s) => (
                <Button key={s.label} variant="outline" size="sm" className="text-xs" onClick={() => sendMessage(`Please explain the "${s.label}" section of this document in plain English.`)}>
                  <s.icon className="h-3 w-3 mr-1" />{s.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden">
            <ScrollArea className="h-[500px]">
              <div className="prose prose-sm max-w-none dark:prose-invert space-y-6 pr-4">
                <div>
                  <h3 className="text-primary border-b border-primary/20 pb-2">Document Overview</h3>
                  <p className="text-sm"><strong>Document:</strong> {selectedDoc?.document_templates.name}</p>
                  <p className="text-sm"><strong>Type:</strong> {selectedDoc?.document_templates.document_type}</p>
                  <p className="text-sm"><strong>Provider:</strong> {(contract.providers as any)?.business_name}</p>
                  <p className="text-sm"><strong>Status:</strong>{" "}
                    <Badge variant={selectedDoc?.status === "signed" ? "default" : "secondary"} className="text-xs">
                      {selectedDoc?.status === "signed" ? "Signed" : "Pending Review"}
                    </Badge>
                  </p>
                  {selectedDoc?.signed_at && (
                    <p className="text-sm"><strong>Signed:</strong> {new Date(selectedDoc.signed_at).toLocaleDateString()}</p>
                  )}
                </div>

                <div>
                  <h3 className="text-primary border-b border-primary/20 pb-2">
                    <Shield className="inline h-4 w-4 mr-1" />What This Document Covers
                  </h3>
                  <p className="text-sm">{selectedDoc ? getDocumentContext(selectedDoc) : "—"}</p>
                </div>

                <div>
                  <h3 className="text-primary border-b border-primary/20 pb-2">
                    <FileText className="inline h-4 w-4 mr-1" />Contract Terms
                  </h3>
                  <div className="text-sm whitespace-pre-wrap">
                    {contract.terms_summary || "No detailed terms have been documented for this contract. Use the AI assistant to ask specific questions about this document."}
                  </div>
                </div>

                {hasMultipleDocs && (
                  <div>
                    <h3 className="text-primary border-b border-primary/20 pb-2">
                      <FileText className="inline h-4 w-4 mr-1" />Other Documents in Your Package
                    </h3>
                    <ul className="text-sm space-y-1">
                      {providerDocs?.filter(d => d.id !== selectedDocId).map((d, i) => (
                        <li key={d.id} className="flex items-center gap-2">
                          {d.status === "signed" ? (
                            <Check className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          <button
                            className="text-primary hover:underline text-left"
                            onClick={() => switchDocument(d.id)}
                          >
                            {d.document_templates.name}
                          </button>
                          <Badge variant="outline" className="text-[9px]">{d.status === "signed" ? "Signed" : "Pending"}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* RIGHT: AI Chat (40%) */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />AI Document Assistant
            </CardTitle>
            <CardDescription>
              Reviewing: {selectedDoc?.document_templates.name || "Select a document"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
            <ScrollArea className="flex-1 px-4">
              <div className="space-y-4 py-4">
                {messages.length === 0 && !isStreaming && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">Ask me anything about <strong>{selectedDoc?.document_templates.name}</strong>.</p>
                    <div className="flex flex-wrap gap-2 justify-center mt-4">
                      {[
                        "Summarize this document",
                        "What are my obligations?",
                        "How does this relate to other docs?",
                        "Any unusual terms?",
                      ].map((q) => (
                        <Button key={q} variant="outline" size="sm" className="text-xs" onClick={() => sendMessage(q)}>
                          {q}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {isStreaming && messages[messages.length - 1]?.role !== "assistant" && (
                  <div className="flex gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary animate-pulse" />
                    </div>
                    <div className="bg-muted rounded-lg px-3 py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </ScrollArea>
            <div className="border-t p-3">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(inputText); }} className="flex gap-2">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Ask about ${selectedDoc?.document_templates.name || "your document"}...`}
                  disabled={isStreaming}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={isStreaming || !inputText.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                AI-powered summary — not legal advice. Consult an attorney for legal questions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
