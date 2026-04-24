import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import { useAI } from "@/hooks/use-ai";
import ReactMarkdown from "react-markdown";

interface Props {
  contract: {
    provider?: string;
    type: string;
    value: number;
    status: string;
    startDate?: string;
    endDate?: string;
    renewalDate?: string;
    terms?: string;
  };
}

export function AIContractReview({ contract }: Props) {
  const { generate, loading, result, error, reset } = useAI();

  const handleGenerate = () => {
    generate("contract_review", { contract });
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">AI Contract Review</CardTitle>
          <Badge variant="outline" className="text-[10px]">AI-Powered</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          {result ? "Re-analyze" : "AI Review"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !result && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />Analyzing contract terms...
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        )}
        {!result && !loading && !error && (
          <p className="text-sm text-muted-foreground py-2">Click "AI Review" to get an AI analysis of this contract's terms, risks, and renewal recommendations.</p>
        )}
      </CardContent>
    </Card>
  );
}
