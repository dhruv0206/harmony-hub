import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bot, Loader2, Zap } from "lucide-react";
import { useAI } from "@/hooks/use-ai";
import ReactMarkdown from "react-markdown";

interface Props {
  gaps: any[];
  regionData: any[];
  totalProviders: number;
  coveredStates: number;
}

export function AICoverageOutreach({ gaps, regionData, totalProviders, coveredStates }: Props) {
  const { generate, loading, result, error } = useAI();

  const handleGenerate = () => {
    generate("coverage_outreach", {
      gaps: gaps.map(g => ({ name: g.name, abbr: g.abbr, population: g.population })),
      regionData: regionData.map(r => ({ region: r.region, providers: r.providers, gaps: r.gaps, value: r.value })),
      totalProviders,
      coveredStates,
    });
  };

  if (!result && !loading && !error) {
    return (
      <Button onClick={handleGenerate} disabled={loading}>
        <Zap className="mr-2 h-4 w-4" />Generate Outreach Plan
      </Button>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">AI Outreach Plan</CardTitle>
          <Badge variant="outline" className="text-[10px]">AI-Generated</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
          Regenerate
        </Button>
      </CardHeader>
      <CardContent>
        {loading && !result && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />Generating strategic outreach plan...
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
