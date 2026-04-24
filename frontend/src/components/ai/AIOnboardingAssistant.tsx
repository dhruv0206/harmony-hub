import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Loader2 } from "lucide-react";
import { useAI } from "@/hooks/use-ai";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  currentStep?: number;
  totalSteps?: number;
  stepName?: string;
  providerName?: string;
}

export function AIOnboardingAssistant({ currentStep, totalSteps, stepName, providerName }: Props) {
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

    const result = await generate("onboarding_assistant", {
      question: input,
      currentStep,
      totalSteps,
      stepName,
      providerName,
      history: newHistory,
    });

    if (result) {
      setMessages(prev => [...prev, { role: "assistant", content: result }]);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">Onboarding AI Assistant</CardTitle>
          <Badge variant="outline" className="text-[10px]">AI-Powered</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div ref={scrollRef} className="max-h-[300px] overflow-y-auto space-y-3 mb-3">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Need help with onboarding? Ask me anything about the current step or what's coming next!
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
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
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask about onboarding..."
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
      </CardContent>
    </Card>
  );
}
