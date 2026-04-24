import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Star, Flag, Clock, Cpu } from "lucide-react";
import { format } from "date-fns";

interface AILog {
  id: string;
  feature_name: string;
  user_id: string | null;
  provider_id: string | null;
  input_summary: string | null;
  output_summary: string | null;
  tokens_used: number;
  response_time_ms: number;
  flagged: boolean;
  rating: number | null;
  created_at: string;
}

const FEATURE_NAMES = [
  "all", "tone_preview", "health_score", "follow_up_writer", "negotiation_coach",
  "churn_analysis", "contract_review", "support_chat", "onboarding_assistant", "auto_responder",
];

export function AILogsTab() {
  const [featureFilter, setFeatureFilter] = useState("all");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["ai-logs", featureFilter, flaggedOnly],
    queryFn: async () => {
      let query = (supabase as any).from("ai_logs").select("*").order("created_at", { ascending: false }).limit(100);
      if (featureFilter !== "all") query = query.eq("feature_name", featureFilter);
      if (flaggedOnly) query = query.eq("flagged", true);
      const { data } = await query;
      return (data || []) as AILog[];
    },
  });

  const renderRating = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground text-xs">—</span>;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(s => (
          <Star key={s} className={`h-3 w-3 ${s <= rating ? "fill-primary text-primary" : "text-muted-foreground/30"}`} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Filters */}
      <Card>
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label className="text-sm">Feature:</Label>
              <Select value={featureFilter} onValueChange={setFeatureFilter}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FEATURE_NAMES.map(f => (
                    <SelectItem key={f} value={f}>{f === "all" ? "All Features" : f.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={flaggedOnly} onCheckedChange={setFlaggedOnly} />
              <Label className="text-sm">Flagged only</Label>
            </div>
            <div className="ml-auto text-sm text-muted-foreground">
              {logs?.length || 0} results
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Interaction Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Feature</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Output</TableHead>
                <TableHead><Cpu className="h-3.5 w-3.5" /></TableHead>
                <TableHead><Clock className="h-3.5 w-3.5" /></TableHead>
                <TableHead>Rating</TableHead>
                <TableHead><Flag className="h-3.5 w-3.5" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs?.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(log.created_at), "MMM d, h:mm a")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs whitespace-nowrap">{log.feature_name.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-xs text-muted-foreground truncate">{log.input_summary || "—"}</p>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <p className="text-xs text-muted-foreground truncate">{log.output_summary || "—"}</p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.tokens_used.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{log.response_time_ms}ms</TableCell>
                  <TableCell>{renderRating(log.rating)}</TableCell>
                  <TableCell>
                    {log.flagged && <Flag className="h-3.5 w-3.5 text-destructive" />}
                  </TableCell>
                </TableRow>
              ))}
              {(!logs || logs.length === 0) && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    {isLoading ? "Loading..." : "No AI logs yet. Logs will appear as AI features are used across the platform."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
