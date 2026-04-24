import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Bot, RefreshCw, Check, Edit, Loader2 } from "lucide-react";
import { useAI } from "@/hooks/use-ai";
import ReactMarkdown from "react-markdown";

interface Props {
  ticket: any;
  messages: any[];
  providerInfo?: any;
  contractInfo?: string;
  onUseResponse: (text: string) => void;
}

export function AISuggestResponse({ ticket, messages, providerInfo, contractInfo, onUseResponse }: Props) {
  const { generate, loading, result, error, reset } = useAI();
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");

  const handleGenerate = () => {
    generate("ticket_suggest", {
      ticket: {
        subject: ticket.subject,
        description: ticket.description,
        category: ticket.category,
        priority: ticket.priority,
      },
      messages: messages?.map((m: any) => ({
        message: m.message,
        sender_name: m.profiles?.full_name || "Unknown",
        is_ai_response: m.is_ai_response,
      })),
      providerInfo,
      contractInfo,
    });
  };

  if (!result && !loading && !error) {
    return (
      <Button variant="outline" onClick={handleGenerate} disabled={loading}>
        <Bot className="h-4 w-4 mr-2" />AI Suggest Response
      </Button>
    );
  }

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">AI Suggested Response</CardTitle>
          <Badge variant="outline" className="text-[10px]">AI-Generated</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating response...
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive">{error}</div>
        )}

        {result && !editing && (
          <div className="prose prose-sm max-w-none dark:prose-invert bg-background rounded-lg p-3 border">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        )}

        {editing && (
          <Textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            rows={6}
            className="text-sm"
          />
        )}

        {(result || error) && (
          <div className="flex gap-2 flex-wrap">
            {result && !editing && (
              <>
                <Button size="sm" onClick={() => onUseResponse(result)}>
                  <Check className="h-3.5 w-3.5 mr-1" />Use This Response
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setEditedText(result); setEditing(true); }}>
                  <Edit className="h-3.5 w-3.5 mr-1" />Edit
                </Button>
              </>
            )}
            {editing && (
              <>
                <Button size="sm" onClick={() => { onUseResponse(editedText); setEditing(false); }}>
                  <Check className="h-3.5 w-3.5 mr-1" />Use Edited
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={handleGenerate} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Regenerate
            </Button>
            <Button size="sm" variant="ghost" onClick={reset}>Dismiss</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
