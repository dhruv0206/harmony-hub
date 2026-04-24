import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, X, MessageSquare, Loader2, Ticket } from "lucide-react";
import { useAI } from "@/hooks/use-ai";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  providerName?: string;
  providerProfile?: {
    status?: string;
    provider_type?: string;
    city?: string;
    state?: string;
  };
  contractDetails?: string;
  onCreateTicket?: (subject: string, description: string) => void;
}

export function AIAssistantWidget({ providerName, providerProfile, contractDetails, onCreateTicket }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const { generate, loading } = useAI();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { role: "user", content: input };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");

    const result = await generate("provider_assistant", {
      question: input,
      providerName,
      providerProfile,
      contractDetails,
      history: newHistory,
    });

    if (result) {
      setMessages(prev => [...prev, { role: "assistant", content: result }]);
    }
  };

  const handleCreateTicket = () => {
    const conversationSummary = messages.map(m => `${m.role === "user" ? "Provider" : "AI"}: ${m.content}`).join("\n\n");
    onCreateTicket?.(
      "Issue from AI Assistant conversation",
      `Conversation context:\n\n${conversationSummary}`
    );
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50"
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 w-[380px] h-[520px] shadow-2xl z-50 flex flex-col">
      <CardHeader className="pb-2 flex flex-row items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">AI Assistant</CardTitle>
          <Badge variant="outline" className="text-[10px]">AI-Powered</Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-3 pt-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 mb-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <Bot className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Hi! I'm your AI assistant. Ask me about your contracts, account, or any questions you have.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted"
              }`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2 text-sm flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-muted-foreground">Thinking...</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 shrink-0">
          {messages.length > 2 && onCreateTicket && (
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={handleCreateTicket}>
              <Ticket className="h-3 w-3 mr-1" />Can't resolve? Create Support Ticket
            </Button>
          )}
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask a question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              rows={1}
              className="min-h-[36px] text-sm resize-none"
            />
            <Button size="icon" className="shrink-0 h-9 w-9" onClick={sendMessage} disabled={!input.trim() || loading}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
