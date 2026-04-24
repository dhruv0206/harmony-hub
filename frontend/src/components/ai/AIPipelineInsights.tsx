import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, RefreshCw } from "lucide-react";
import { useAI } from "@/hooks/use-ai";
import ReactMarkdown from "react-markdown";

interface Props {
  deals: any[];
  totalValue: number;
  weightedValue: number;
  winRate: number;
}

export function AIPipelineInsights({ deals, totalValue, weightedValue, winRate }: Props) {
  const { generate, loading, result, error, reset } = useAI();

  const handleGenerate = () => {
    generate("pipeline_insights", {
      deals: deals.map(d => ({
        name: d._displayName || d.providers?.business_name || (d.law_firms as any)?.firm_name || "Unknown",
        type: d._type || (d.law_firm_id ? "law_firm" : "provider"),
        value: d.estimated_value,
        stage: d.stage,
        probability: d.probability,
        closeDate: d.expected_close_date,
        dealType: (d.deal_types as any)?.name,
      })),
      totalValue,
      weightedValue,
      winRate,
    });
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">AI Pipeline Insights</CardTitle>
          <Badge variant="outline" className="text-[10px]">AI-Powered</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          {result ? "Refresh" : "Analyze"}
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !result && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />Analyzing pipeline...
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        )}
        {!result && !loading && !error && (
          <p className="text-sm text-muted-foreground py-2">Click "Analyze" to get AI insights on your pipeline health, at-risk deals, and suggested actions.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AIDealSuggestion({ deal, onClose }: { deal: any; onClose: () => void }) {
  const { generate, loading, result, error } = useAI();

  const handleGenerate = () => {
    generate("deal_suggestion", {
      deal: {
        provider: deal.providers?.business_name || "Unknown",
        value: deal.estimated_value,
        stage: deal.stage,
        probability: deal.probability,
        closeDate: deal.expected_close_date,
        dealType: (deal.deal_types as any)?.name,
        notes: deal.notes,
      },
    });
  };

  return (
    <div className="space-y-3 mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">AI Deal Suggestion</span>
          <Badge variant="outline" className="text-[10px]">AI</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">Close</Button>
      </div>
      {!result && !loading && (
        <Button size="sm" onClick={handleGenerate}>Get AI Suggestion</Button>
      )}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />Analyzing deal...
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown>{result}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
