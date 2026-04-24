import { useState, useRef, useEffect, useCallback } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import {
  ArrowLeft, Send, Bot, User, FileText, Loader2, Download, MessageSquare,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { PDFViewer } from "@/components/documents/PDFViewer";
import mammoth from "mammoth";
import "@/components/documents/docx-preview.css";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const QUICK_QUESTIONS = [
  "Summarize this document",
  "What are my main obligations?",
  "What happens if I want to cancel?",
  "What are the payment terms?",
  "Anything unusual I should know?",
];

async function extractTextFromUrl(fileUrl: string, fileType: string): Promise<string> {
  try {
    if (fileType === "docx") {
      const resp = await fetch(fileUrl);
      const arrayBuffer = await resp.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    if (fileType === "pdf") {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
      const resp = await fetch(fileUrl);
      const arrayBuffer = await resp.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let text = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(" ") + "\n\n";
      }
      return text;
    }
    return "";
  } catch (e) {
    console.error("Text extraction failed:", e);
    return "";
  }
}

export default function DocumentReviewPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch the provider_document with template info
  const { data: providerDoc } = useQuery({
    queryKey: ["doc-review", docId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_documents")
        .select("*, document_templates(id, name, document_type, description, short_code, file_url, file_type, extracted_text, version)")
        .eq("id", docId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!docId,
  });

  const template = providerDoc?.document_templates as any;
  const fileUrl = template?.file_url;
  const fileType = (template?.file_type || "pdf").toLowerCase();
  const isPdf = fileType === "pdf";
  const isDocx = fileType === "docx";

  // Extract text and cache it
  useEffect(() => {
    if (!template || extractedText !== null || extracting) return;

    // Check if already cached
    if (template.extracted_text) {
      setExtractedText(template.extracted_text);
      return;
    }

    if (!fileUrl) {
      setExtractedText("");
      return;
    }

    const extract = async () => {
      setExtracting(true);
      const text = await extractTextFromUrl(fileUrl, fileType);
      setExtractedText(text);

      // Cache to database
      if (text) {
        await supabase
          .from("document_templates")
          .update({ extracted_text: text } as any)
          .eq("id", template.id);
      }
      setExtracting(false);
    };
    extract();
  }, [template, extractedText, extracting, fileUrl, fileType]);

  // Convert DOCX to HTML for viewer
  useEffect(() => {
    if (!isDocx || !fileUrl || docxHtml !== null) return;
    const convert = async () => {
      try {
        const resp = await fetch(fileUrl);
        const arrayBuffer = await resp.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setDocxHtml(result.value);
      } catch {
        setDocxHtml("<p>Failed to render document.</p>");
      }
    };
    convert();
  }, [isDocx, fileUrl, docxHtml]);

  // Create session
  useEffect(() => {
    if (!providerDoc || !user || sessionId) return;
    const init = async () => {
      const docScopeTag = `doc:${providerDoc.id}`;

      // Try to find existing session
      const { data: existing } = await supabase
        .from("contract_review_sessions")
        .select("id")
        .eq("provider_id", providerDoc.provider_id)
        .is("ended_at", null)
        .ilike("flag_reason", `${docScopeTag}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        setSessionId(existing.id);
        const { data: msgs } = await supabase
          .from("contract_review_messages")
          .select("*")
          .eq("session_id", existing.id)
          .order("created_at");
        if (msgs && msgs.length > 0) {
          setMessages(msgs.map(m => ({
            role: (m.role as string) === "provider" ? "user" as const : "assistant" as const,
            content: m.message,
          })));
        }
      } else {
        // Need a contract_id — find any contract for this provider
        const { data: contracts } = await supabase
          .from("contracts")
          .select("id")
          .eq("provider_id", providerDoc.provider_id)
          .limit(1);

        const contractId = contracts?.[0]?.id;
        if (!contractId) return;

        const { data: newSession } = await supabase
          .from("contract_review_sessions")
          .insert({
            contract_id: contractId,
            provider_id: providerDoc.provider_id,
            flag_reason: docScopeTag,
          })
          .select()
          .single();
        if (newSession) setSessionId(newSession.id);
      }
    };
    init();
  }, [providerDoc, user, sessionId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming || !template) return;
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
    }

    let assistantText = "";
    const allMessages = [...messages, userMsg].map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contract-review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: allMessages,
          contractText: extractedText || template.description || "No document text available.",
          contractType: template.document_type,
          documentName: template.name,
          documentType: template.document_type,
          documentContext: template.description || `${template.document_type} document`,
          sessionId,
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

      // Save AI response and check for flags
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
          await supabase.from("contract_review_sessions").update({
            flagged: true,
            flag_reason: `doc:${providerDoc!.id} | ${flagMatch[1]}: ${text.slice(0, 100)}`,
          }).eq("id", sessionId);
        }
      }
    } catch (e) {
      console.error("Stream error:", e);
      toast.error("Failed to get response");
    } finally {
      setIsStreaming(false);
    }
  }, [isStreaming, messages, template, sessionId, extractedText, providerDoc]);

  if (!providerDoc || !template) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading document...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{template.name}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-[10px] capitalize">{template.document_type}</Badge>
              <Badge variant="secondary" className="text-[10px]">v{template.version || 1}</Badge>
              {extracting && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Extracting text...
                </span>
              )}
              {extractedText && !extracting && (
                <span className="text-[10px] text-emerald-600">✓ Document text loaded</span>
              )}
            </div>
          </div>
        </div>
        {fileUrl && (
          <Button variant="outline" size="sm" asChild>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" download>
              <Download className="h-4 w-4 mr-1.5" /> Download a Copy
            </a>
          </Button>
        )}
      </div>

      {/* Two-column layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* LEFT: Document Viewer */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="h-full overflow-auto bg-muted/30">
            {!fileUrl ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-16 w-16 mb-4 opacity-30" />
                <p>No document file uploaded yet.</p>
              </div>
            ) : isPdf ? (
              <PDFViewer fileUrl={fileUrl} fileName={template.name} maxHeight="100%" />
            ) : isDocx ? (
              <div className="overflow-auto h-full bg-muted/50">
                {docxHtml ? (
                  <div className="flex justify-center py-6 px-4">
                    <div
                      className="docx-preview bg-white rounded shadow-[0_4px_20px_rgba(0,0,0,0.15)]"
                      style={{
                        maxWidth: 816,
                        width: "100%",
                        padding: "72px",
                        fontFamily: "'Georgia', 'Times New Roman', serif",
                        fontSize: "12pt",
                        lineHeight: 1.6,
                        color: "#1a1a1a",
                      }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(docxHtml) }}
                    />
                  </div>
                ) : (
                  <div className="flex items-center gap-2 justify-center py-16 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Rendering document...
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-16 w-16 mb-4 opacity-30" />
                <p>Preview not available for this file type.</p>
                <Button variant="outline" size="sm" className="mt-2" asChild>
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" download>
                    <Download className="h-4 w-4 mr-1" /> Download to View
                  </a>
                </Button>
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: AI Chat */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="flex flex-col h-full">
            {/* Chat header */}
            <div className="px-4 py-3 border-b bg-card shrink-0">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span className="font-semibold text-foreground">AI Document Assistant</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ask anything about this document. Not legal advice.
              </p>
            </div>

            {/* Chat messages */}
            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                {messages.length === 0 && !isStreaming && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="text-sm mb-1">
                      I've read your <strong>{template.name}</strong> and I'm ready to help.
                    </p>
                    <p className="text-xs mb-4">Ask me anything or try one of these:</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {QUICK_QUESTIONS.map((q) => (
                        <Button
                          key={q}
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => sendMessage(q)}
                          disabled={!extractedText && !extracting}
                        >
                          <MessageSquare className="h-3 w-3 mr-1" />
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

            {/* Quick questions (shown when there are messages too) */}
            {messages.length > 0 && (
              <div className="px-3 py-2 border-t bg-card/50 shrink-0">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {QUICK_QUESTIONS.map((q) => (
                    <Button
                      key={q}
                      variant="ghost"
                      size="sm"
                      className="text-[10px] shrink-0 h-6 px-2"
                      onClick={() => sendMessage(q)}
                      disabled={isStreaming}
                    >
                      {q}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="border-t p-3 shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(inputText); }} className="flex gap-2">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={`Ask about ${template.name}...`}
                  disabled={isStreaming}
                  className="flex-1"
                />
                <Button type="submit" size="icon" disabled={isStreaming || !inputText.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </form>
              <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                AI-powered assistance — not legal advice
              </p>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
