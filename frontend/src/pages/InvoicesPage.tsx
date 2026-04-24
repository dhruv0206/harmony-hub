import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { DollarSign, AlertTriangle, TrendingUp, Search, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { StatCard } from "@/components/StatCard";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { TableSkeleton } from "@/components/Skeletons";

const statusColor: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700",
  sent: "bg-blue-500/10 text-blue-700",
  pending: "bg-yellow-500/10 text-yellow-700",
  past_due: "bg-orange-500/10 text-orange-700",
  void: "bg-destructive/10 text-destructive",
  partial: "bg-purple-500/10 text-purple-700",
  draft: "bg-muted text-muted-foreground",
  refunded: "bg-muted text-muted-foreground",
  write_off: "bg-muted text-muted-foreground",
};

export default function InvoicesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { searchInput, searchQuery, setSearchInput } = useDebouncedSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pagination = usePagination(25);

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ["invoices-list", statusFilter, searchQuery, pagination.page, pagination.pageSize],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*, providers(business_name)", { count: "exact" })
        .order("created_at", { ascending: false });
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (searchQuery) q = q.or(`invoice_number.ilike.%${searchQuery}%`);
      q = q.range(pagination.from, pagination.to);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 30000,
  });

  const invoices = invoicesData?.data ?? [];
  const totalInvoices = invoicesData?.count ?? 0;

  const { data: summaryStats } = useQuery({
    queryKey: ["invoice-summary-stats"],
    queryFn: async () => {
      const now = new Date();
      const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0];
      const today = now.toISOString().split("T")[0];
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];

      const [outstanding, dueWeek, pastDue, collected] = await Promise.all([
        supabase.from("invoices").select("total_amount").in("status", ["pending", "sent", "partial", "past_due"]),
        supabase.from("invoices").select("total_amount").in("status", ["pending", "sent"]).lte("due_date", weekEnd).gte("due_date", today),
        supabase.from("invoices").select("total_amount").eq("status", "past_due"),
        supabase.from("payments").select("amount").eq("status", "completed").gte("processed_at", `${monthStart}T00:00:00`),
      ]);

      return {
        outstanding: outstanding.data?.reduce((s, i) => s + Number(i.total_amount), 0) ?? 0,
        dueThisWeek: dueWeek.data?.reduce((s, i) => s + Number(i.total_amount), 0) ?? 0,
        pastDue: pastDue.data?.reduce((s, i) => s + Number(i.total_amount), 0) ?? 0,
        collected: collected.data?.reduce((s, i) => s + Number(i.amount), 0) ?? 0,
      };
    },
    staleTime: 60000,
  });

  const bulkSendMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoices marked as sent");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["invoices-list"] });
    },
  });

  const bulkVoidMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("invoices").update({ status: "void" }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invoices voided");
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["invoices-list"] });
    },
  });

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === invoices.length) setSelected(new Set());
    else setSelected(new Set(invoices.map((i: any) => i.id)));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Invoices</h1>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title="Total Outstanding" value={fmt(summaryStats?.outstanding ?? 0)} icon={DollarSign} />
        <StatCard title="Due This Week" value={fmt(summaryStats?.dueThisWeek ?? 0)} icon={AlertTriangle} />
        <StatCard title="Past Due" value={fmt(summaryStats?.pastDue ?? 0)} icon={AlertTriangle} />
        <StatCard title="Collected This Month" value={fmt(summaryStats?.collected ?? 0)} icon={TrendingUp} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search invoice #…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); pagination.reset(); }}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="void">Void</SelectItem>
          </SelectContent>
        </Select>
        {selected.size > 0 && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkSendMutation.mutate(Array.from(selected))}><Send className="mr-1 h-3 w-3" />Send ({selected.size})</Button>
            <Button size="sm" variant="outline" onClick={() => bulkVoidMutation.mutate(Array.from(selected))}><XCircle className="mr-1 h-3 w-3" />Void ({selected.size})</Button>
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={10} cols={10} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={selected.size === invoices.length && invoices.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                  <TableHead className="text-right">Discounts</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Paid Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length > 0 ? invoices.map((inv: any) => (
                  <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/billing/invoices/${inv.id}`)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(inv.id)} onCheckedChange={() => toggleSelect(inv.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell>{(inv.providers as any)?.business_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{inv.billing_period_start} – {inv.billing_period_end}</TableCell>
                    <TableCell className="text-right">{fmt(Number(inv.subtotal))}</TableCell>
                    <TableCell className="text-right">{Number(inv.discount_amount) > 0 ? `-${fmt(Number(inv.discount_amount))}` : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(Number(inv.total_amount))}</TableCell>
                    <TableCell><Badge variant="secondary" className={statusColor[inv.status] ?? ""}>{inv.status.replace("_", " ")}</Badge></TableCell>
                    <TableCell className="text-xs">{inv.due_date}</TableCell>
                    <TableCell className="text-xs">{inv.paid_date ?? "—"}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={10} className="p-0">
                    <EmptyState icon="invoices" title="No invoices yet" description="No invoices have been generated. Set up a provider's billing profile to get started." compact />
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={totalInvoices}
            onPrev={pagination.prev}
            onNext={pagination.next}
            onFirst={() => pagination.goTo(0)}
            onLast={() => pagination.goTo(Math.ceil(totalInvoices / pagination.pageSize) - 1)}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
