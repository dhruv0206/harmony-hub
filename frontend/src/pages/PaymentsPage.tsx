import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { TableSkeleton } from "@/components/Skeletons";

export default function PaymentsPage() {
  const navigate = useNavigate();
  const { searchInput, searchQuery, setSearchInput } = useDebouncedSearch();
  const pagination = usePagination(25);

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ["payments-list", searchQuery, pagination.page, pagination.pageSize],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("*, invoices(invoice_number), providers(business_name), profiles(full_name)", { count: "exact" })
        .order("created_at", { ascending: false });
      if (searchQuery) {
        q = q.or(`payment_reference.ilike.%${searchQuery}%`);
      }
      q = q.range(pagination.from, pagination.to);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: data ?? [], count: count ?? 0 };
    },
    staleTime: 30000,
  });

  const payments = paymentsData?.data ?? [];
  const totalPayments = paymentsData?.count ?? 0;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusColor: Record<string, string> = {
    completed: "bg-green-500/10 text-green-700",
    pending: "bg-yellow-500/10 text-yellow-700",
    failed: "bg-destructive/10 text-destructive",
    refunded: "bg-muted text-muted-foreground",
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Payments</h1>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search payments…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton rows={10} cols={8} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recorded By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length > 0 ? payments.map((p: any) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/billing/invoices/${p.invoice_id}`)}>
                    <TableCell className="text-sm">{p.processed_at ? new Date(p.processed_at).toLocaleDateString() : new Date(p.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="font-mono text-xs">{(p.invoices as any)?.invoice_number ?? "—"}</TableCell>
                    <TableCell>{(p.providers as any)?.business_name ?? "—"}</TableCell>
                    <TableCell className="capitalize text-sm">{p.payment_method?.replace("_", " ")}</TableCell>
                    <TableCell className="font-mono text-xs">{p.payment_reference ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(Number(p.amount))}</TableCell>
                    <TableCell><Badge variant="secondary" className={statusColor[p.status] ?? ""}>{p.status}</Badge></TableCell>
                    <TableCell className="text-sm">{(p.profiles as any)?.full_name ?? "—"}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No payments found.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <PaginationControls
            page={pagination.page}
            pageSize={pagination.pageSize}
            total={totalPayments}
            onPrev={pagination.prev}
            onNext={pagination.next}
            onFirst={() => pagination.goTo(0)}
            onLast={() => pagination.goTo(Math.ceil(totalPayments / pagination.pageSize) - 1)}
            onPageSizeChange={pagination.setPageSize}
            pageSizeOptions={pagination.pageSizeOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
