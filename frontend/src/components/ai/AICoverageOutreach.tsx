import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const { generate, loading, result, error, reset } = useAI();
  const [open, setOpen] = useState(false);

  const handleGenerate = () => {
    setOpen(true);
    generate("coverage_outreach", {
      gaps: gaps.map(g => ({ name: g.name, abbr: g.abbr, population: g.population })),
      regionData: regionData.map(r => ({ region: r.region, providers: r.providers, gaps: r.gaps, value: r.value })),
      totalProviders,
      coveredStates,
    });
  };

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <>
      <Button onClick={handleGenerate} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
        {result ? "View Outreach Plan" : "Generate Outreach Plan"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              AI Outreach Plan
              <Badge variant="outline" className="text-[10px] ml-1">AI-Generated</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
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
            {result && (
              <div className="flex justify-end pt-2 border-t">
                <Button variant="outline" size="sm" onClick={handleGenerate} disabled={loading}>
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                  Regenerate
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
