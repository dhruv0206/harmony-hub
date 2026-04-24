import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Download, Search, Eye, Shield } from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";
import { PaginationControls } from "@/components/PaginationControls";
import { usePagination } from "@/hooks/use-pagination";

const ENTITY_TYPES = ["all", "provider", "law_firm", "contract", "document", "invoice", "subscription", "ticket", "onboarding", "campaign", "lead", "user"];
const ACTION_GROUPS = ["all", "document", "provider", "law_firm", "contract", "invoice", "subscription", "ticket", "onboarding", "billing", "campaign", "lead", "user"];

const actionColors: Record<string, string> = {
  document: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  provider: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  law_firm: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  contract: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  invoice: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  subscription: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  ticket: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  onboarding: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
  billing: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  campaign: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
  lead: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
  user: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200",
};

function getActionGroup(action: string) {
  return action.split(".")[0] || "other";
}

interface Props {
  entityType?: string;
  entityId?: string;
  compact?: boolean;
  title?: string;
}

export default function AuditLogTable({ entityType, entityId, compact = false, title }: Props) {
  const [search, setSearch] = useState("");
  const [filterEntity, setFilterEntity] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<any>(null);
  const pg = usePagination(compact ? 10 : 25);

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-log", entityType, entityId, filterEntity, filterAction, search, pg.page],
    queryFn: async () => {
      let q = (supabase as any).from("audit_log").select("*, profiles:actor_id(full_name, email)", { count: "exact" });

      if (entityType && entityId) {
        q = q.eq("entity_type", entityType).eq("entity_id", entityId);
      }
      if (filterEntity !== "all") q = q.eq("entity_type", filterEntity);
      if (filterAction !== "all") q = q.like("action", `${filterAction}.%`);
      if (search) q = q.or(`action.ilike.%${search}%`);

      q = q.order("created_at", { ascending: false })
        .range(pg.from, pg.to);

      const { data, count } = await q;
      return { entries: data ?? [], total: count ?? 0 };
    },
  });

  const exportAudit = () => {
    if (!logs?.entries.length) return;
    const headers = ["Timestamp", "Actor", "Actor Type", "Action", "Entity Type", "Entity ID", "Details"];
    const rows = logs.entries.map((e: any) => [
      new Date(e.created_at).toISOString(),
      e.profiles?.full_name || e.actor_type || "System",
      e.actor_type,
      e.action,
      e.entity_type,
      e.entity_id,
      JSON.stringify(e.details),
    ]);
    downloadCSV("audit-log-export.csv", headers, rows);
  };

  const totalPages = Math.ceil((logs?.total ?? 0) / pg.pageSize);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5" />
          {title || "Audit Log"}
        </CardTitle>
        {!compact && (
          <Button size="sm" variant="outline" onClick={exportAudit} disabled={!logs?.entries.length}>
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!compact && (
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search actions..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            {!entityType && (
              <Select value={filterEntity} onValueChange={setFilterEntity}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Entity type" /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t === "all" ? "All Entities" : t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Action group" /></SelectTrigger>
              <SelectContent>
                {ACTION_GROUPS.map(g => (
                  <SelectItem key={g} value={g}>{g === "all" ? "All Actions" : g.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                {!entityType && <TableHead>Entity</TableHead>}
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : logs?.entries.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No audit entries found</TableCell></TableRow>
              ) : logs?.entries.map((entry: any) => {
                const group = getActionGroup(entry.action);
                return (
                  <TableRow key={entry.id} className="text-sm">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-medium">{entry.profiles?.full_name || "System"}</span>
                        <Badge variant="outline" className="ml-2 text-xs capitalize">{entry.actor_type}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={actionColors[group] || "bg-muted text-muted-foreground"}>{entry.action}</Badge>
                    </TableCell>
                    {!entityType && (
                      <TableCell>
                        <span className="capitalize text-muted-foreground">{entry.entity_type.replace(/_/g, " ")}</span>
                      </TableCell>
                    )}
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedEntry(entry)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <PaginationControls
            page={pg.page}
            pageSize={pg.pageSize}
            total={logs?.total ?? 0}
            onPrev={pg.prev}
            onNext={pg.next}
            onFirst={() => pg.goTo(0)}
            onLast={() => pg.goTo(totalPages - 1)}
          />
        )}
      </CardContent>

      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Audit Entry Details</DialogTitle></DialogHeader>
          {selectedEntry && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Time:</span> {new Date(selectedEntry.created_at).toLocaleString()}</div>
                <div><span className="text-muted-foreground">Actor:</span> {selectedEntry.profiles?.full_name || "System"}</div>
                <div><span className="text-muted-foreground">Actor Type:</span> <Badge variant="outline" className="capitalize">{selectedEntry.actor_type}</Badge></div>
                <div><span className="text-muted-foreground">Action:</span> <Badge>{selectedEntry.action}</Badge></div>
                <div><span className="text-muted-foreground">Entity:</span> {selectedEntry.entity_type}</div>
                <div><span className="text-muted-foreground">Entity ID:</span> <code className="text-xs">{selectedEntry.entity_id}</code></div>
              </div>
              {selectedEntry.details && Object.keys(selectedEntry.details).length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Details:</p>
                  <ScrollArea className="h-48">
                    <pre className="bg-muted p-3 rounded text-xs overflow-auto">{JSON.stringify(selectedEntry.details, null, 2)}</pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
