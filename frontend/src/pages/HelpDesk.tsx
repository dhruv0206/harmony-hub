import { useState, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Inbox, Clock, AlertTriangle, Filter, Search, ArrowUpDown } from "lucide-react";
import { Constants } from "@/integrations/supabase/types";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { TableSkeleton } from "@/components/Skeletons";

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

const statusColors: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-warning/10 text-warning",
  waiting_on_provider: "bg-muted text-muted-foreground",
  resolved: "bg-success/10 text-success",
  closed: "bg-muted text-muted-foreground",
};

const priorityChartColors: Record<string, string> = {
  low: "hsl(var(--muted-foreground))",
  medium: "hsl(var(--primary))",
  high: "hsl(var(--warning))",
  urgent: "hsl(var(--destructive))",
};

type SortField = "subject" | "priority" | "status" | "created_at" | "updated_at";
type SortDir = "asc" | "desc";

export default function HelpDesk() {
  const navigate = useNavigate();
  const { searchInput, searchQuery, setSearchInput } = useDebouncedSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assignedFilter, setAssignedFilter] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const pagination = usePagination(25);

  // Server-side paginated query
  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ["tickets", statusFilter, priorityFilter, categoryFilter, assignedFilter, searchQuery, sortField, sortDir, pagination.page, pagination.pageSize],
    queryFn: async () => {
      let q = supabase
        .from("support_tickets")
        .select("*, providers(business_name), law_firms(firm_name), profiles(full_name)", { count: "exact" })
        .order(sortField, { ascending: sortDir === "asc" });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      if (priorityFilter !== "all") q = q.eq("priority", priorityFilter as any);
      if (categoryFilter !== "all") q = q.eq("category", categoryFilter as any);
      if (assignedFilter !== "all") q = q.eq("assigned_to", assignedFilter);
      if (searchQuery) q = q.or(`subject.ilike.%${searchQuery}%`);
      q = q.range(pagination.from, pagination.to);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 15000,
  });

  const tickets = ticketsData?.data ?? [];
  const totalTickets = ticketsData?.count ?? 0;

  // Stat counts via separate lightweight queries
  const { data: statCounts } = useQuery({
    queryKey: ["ticket-stat-counts"],
    queryFn: async () => {
      const [openRes, inProgRes, escalatedRes] = await Promise.all([
        supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("support_tickets").select("*", { count: "exact", head: true }).eq("status", "in_progress"),
        supabase.from("support_tickets").select("id, priority, created_at").in("status", ["open", "in_progress"]).in("priority", ["high", "urgent"]),
      ]);
      const escalatedCount = (escalatedRes.data ?? []).filter(t => {
        return (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60) > 24;
      }).length;
      return { open: openRes.count ?? 0, inProgress: inProgRes.count ?? 0, escalated: escalatedCount };
    },
    staleTime: 30000,
  });

  const { data: reps } = useQuery({
    queryKey: ["support_reps"],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("user_id, profiles(full_name)")
        .in("role", ["admin", "sales_rep"]);
      return data ?? [];
    },
    staleTime: 600000,
  });

  const priorityData = Constants.public.Enums.ticket_priority.map((p) => ({
    name: p,
    value: 0, // will be approximate from current page
    color: priorityChartColors[p],
  }));

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    pagination.reset();
  };

  const isEscalated = (t: any) => {
    if (t.priority !== "high" && t.priority !== "urgent") return false;
    if (t.status === "resolved" || t.status === "closed") return false;
    return (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60) > 24;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Help Desk</h1>
        <p className="text-muted-foreground">Manage and resolve provider support tickets</p>
      </div>

      {(statCounts?.escalated ?? 0) > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-semibold text-destructive">{statCounts!.escalated} Escalated Ticket{statCounts!.escalated > 1 ? "s" : ""}</p>
            <p className="text-sm text-muted-foreground">High/urgent tickets unresolved for 24+ hours require immediate attention.</p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Open Tickets" value={statCounts?.open ?? 0} icon={Inbox} />
        <StatCard title="In Progress" value={statCounts?.inProgress ?? 0} icon={Clock} />
        <StatCard title="Escalated" value={statCounts?.escalated ?? 0} icon={AlertTriangle} />
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">By Priority</p>
            <ResponsiveContainer width="100%" height={60}>
              <BarChart data={priorityData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={50} tick={{ fontSize: 10 }} className="capitalize" />
                <Tooltip />
                <Bar dataKey="value" radius={2}>
                  {priorityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search tickets..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-4 w-4 mr-2" />Filters
            </Button>
          </div>
          {showFilters && (
            <div className="flex gap-3 flex-wrap">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pagination.reset(); }}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {Constants.public.Enums.ticket_status.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); pagination.reset(); }}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  {Constants.public.Enums.ticket_priority.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); pagination.reset(); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Constants.public.Enums.ticket_category.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={assignedFilter} onValueChange={(v) => { setAssignedFilter(v); pagination.reset(); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Assigned To" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reps</SelectItem>
                  {reps?.map((r) => (
                    <SelectItem key={r.user_id} value={r.user_id}>{(r.profiles as any)?.full_name || "Unknown"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={10} cols={9} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("subject")}>
                    <span className="flex items-center gap-1">Subject <ArrowUpDown className="h-3.5 w-3.5" /></span>
                  </TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("priority")}>
                    <span className="flex items-center gap-1">Priority <ArrowUpDown className="h-3.5 w-3.5" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("status")}>
                    <span className="flex items-center gap-1">Status <ArrowUpDown className="h-3.5 w-3.5" /></span>
                  </TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("created_at")}>
                    <span className="flex items-center gap-1">Created <ArrowUpDown className="h-3.5 w-3.5" /></span>
                  </TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("updated_at")}>
                    <span className="flex items-center gap-1">Updated <ArrowUpDown className="h-3.5 w-3.5" /></span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.length > 0 ? (
                  tickets.map((t: any) => (
                    <TableRow
                      key={t.id}
                      className={`cursor-pointer hover:bg-muted/50 ${isEscalated(t) ? "bg-destructive/5" : ""}`}
                      onClick={() => navigate(`/helpdesk/${t.id}`)}
                    >
                      <TableCell className="text-xs text-muted-foreground font-mono">{t.id.slice(0, 8)}</TableCell>
                      <TableCell className="font-medium">
                        {t.subject}
                        {isEscalated(t) && <AlertTriangle className="inline h-3.5 w-3.5 text-destructive ml-1" />}
                      </TableCell>
                      <TableCell>{t.providers?.business_name || (t as any).law_firms?.firm_name || "—"}</TableCell>
                      <TableCell className="capitalize">{t.category.replace(/_/g, " ")}</TableCell>
                      <TableCell><Badge className={`capitalize ${priorityColors[t.priority]}`}>{t.priority}</Badge></TableCell>
                      <TableCell><Badge className={`capitalize ${statusColors[t.status]}`}>{t.status.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell>{t.profiles?.full_name || "Unassigned"}</TableCell>
                      <TableCell className="text-sm">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{new Date(t.updated_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={9} className="p-0">
                    <EmptyState icon="tickets" title="No support tickets" description="All clear! No tickets match your current filters." compact />
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={totalTickets}
            onPrev={pagination.prev}
            onNext={pagination.next}
            onFirst={() => pagination.goTo(0)}
            onLast={() => pagination.goTo(Math.ceil(totalTickets / pagination.pageSize) - 1)}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
