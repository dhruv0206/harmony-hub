import { useState, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Download, ArrowUpDown, Plus, ChevronDown, Filter, AlertTriangle, RefreshCw, FileWarning } from "lucide-react";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import ContractForm from "@/components/contracts/ContractForm";
import RenewalsTab from "@/components/contracts/RenewalsTab";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { TableSkeleton } from "@/components/Skeletons";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-warning/10 text-warning",
  sent: "bg-primary/10 text-primary",
  negotiating: "bg-warning/10 text-warning",
  signed: "bg-success/10 text-success",
  active: "bg-success/10 text-success",
  expired: "bg-destructive/10 text-destructive",
  terminated: "bg-destructive/10 text-destructive",
};

const typeColors: Record<string, string> = {
  standard: "bg-muted text-muted-foreground",
  premium: "bg-primary/10 text-primary",
  enterprise: "bg-accent text-accent-foreground",
  custom: "bg-warning/10 text-warning",
};

type SortField = "provider" | "contract_type" | "deal_value" | "start_date" | "end_date" | "status";
type SortDir = "asc" | "desc";

export default function Contracts() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const isProvider = role === "provider";
  const { searchInput: search, searchQuery: debouncedSearch, setSearchInput: setSearch } = useDebouncedSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dealTypeFilter, setDealTypeFilter] = useState("all");
  const [outdatedOnly, setOutdatedOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>("start_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const pagination = usePagination(20);

  const { data: contractsData, isLoading } = useQuery({
    queryKey: ["v-contract-list", statusFilter, typeFilter, debouncedSearch, sortField, sortDir, pagination.page],
    queryFn: async () => {
      const orderCol =
        sortField === "provider"
          ? "provider_business_name"
          : sortField === "contract_type"
          ? "contract_type"
          : sortField === "deal_value"
          ? "deal_value"
          : sortField === "start_date"
          ? "start_date"
          : sortField === "end_date"
          ? "end_date"
          : sortField === "status"
          ? "status"
          : "created_at";
      let q = supabase
        .from("v_contract_list" as any)
        .select("*", { count: "exact" })
        .order(orderCol, { ascending: sortDir === "asc" });
      if (statusFilter !== "all") q = q.eq("status", statusFilter as any);
      if (typeFilter !== "all") q = q.eq("contract_type", typeFilter as any);
      if (debouncedSearch) {
        q = q.or(
          `provider_business_name.ilike.%${debouncedSearch}%,contract_type.ilike.%${debouncedSearch}%,terms_summary.ilike.%${debouncedSearch}%`
        );
      }
      q = q.range(pagination.from, pagination.to);
      const { data, error, count } = await q;
      if (error) throw error;
      return { data: ((data as any[]) ?? []), count: count ?? 0 };
    },
  });

  const contracts = contractsData?.data;
  const totalContracts = contractsData?.count ?? 0;

  const { data: dealTypes } = useQuery({
    queryKey: ["deal_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deal_types").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Get deal type for each contract via pipeline
  const { data: pipelineDeals } = useQuery({
    queryKey: ["pipeline_deal_types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_pipeline")
        .select("provider_id, deal_type_id, deal_types(name, color)");
      if (error) throw error;
      return data;
    },
  });

  // Fetch provider IDs with outdated documents
  const { data: outdatedProviderIds } = useQuery({
    queryKey: ["outdated-doc-providers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("provider_id")
        .eq("is_current_version", false);
      return [...new Set((data ?? []).map(d => d.provider_id))];
    },
    enabled: !isProvider,
  });

  const dealTypeMap = useMemo(() => {
    const map: Record<string, { name: string; color: string }> = {};
    pipelineDeals?.forEach((d) => {
      if (d.provider_id && d.deal_types) {
        map[d.provider_id] = { name: (d.deal_types as any).name, color: (d.deal_types as any).color || "#888" };
      }
    });
    return map;
  }, [pipelineDeals]);

  // Server-side handles search, status, type filtering; client-side only for dealType and outdated
  const filtered = useMemo(() => {
    if (!contracts) return [];
    let list = [...contracts];
    if (dealTypeFilter !== "all") {
      list = list.filter(c => dealTypeMap[c.provider_id]?.name === dealTypeFilter);
    }
    if (outdatedOnly && outdatedProviderIds) {
      list = list.filter(c => outdatedProviderIds.includes(c.provider_id));
    }
    return list;
  }, [contracts, dealTypeFilter, dealTypeMap, outdatedOnly, outdatedProviderIds]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    pagination.reset();
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((c) => c.id)));
  };

  const exportCSV = () => {
    const rows = filtered.filter((c) => selectedIds.size === 0 || selectedIds.has(c.id));
    const header = "Provider,Type,Deal Value,Status,Start Date,End Date,Renewal Date\n";
    const csv = header + rows.map((c) =>
      `"${c.provider_business_name || ""}","${c.contract_type}","${c.deal_value || 0}","${c.status}","${c.start_date || ""}","${c.end_date || ""}","${c.renewal_date || ""}"`
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "contracts.csv"; a.click();
    toast.success("Exported contracts");
  };

  const isRenewalSoonDays = (days: number | null | undefined) => {
    if (days == null) return false;
    return days >= 0 && days <= 30;
  };

  const renewalCount = contracts?.filter((c) => isRenewalSoonDays(c.days_until_renewal)).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{isProvider ? "My Contracts" : "Contracts"}</h1>
          <p className="text-muted-foreground">{isProvider ? "View your contracts and agreements" : "Manage all provider contracts and agreements"}</p>
        </div>
        <div className="flex gap-2">
          {renewalCount > 0 && (
            <Badge variant="outline" className="bg-warning/10 text-warning gap-1 px-3 py-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {renewalCount} renewal{renewalCount > 1 ? "s" : ""} due soon
            </Badge>
          )}
          {!isProvider && (
            <Button onClick={() => navigate("/contracts/new")}>
              <Plus className="h-4 w-4 mr-2" />Create Contract
            </Button>
          )}
        </div>
      </div>

      {/* Provider card view */}
      {isProvider && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <p className="text-muted-foreground col-span-full text-center py-8">Loading...</p>
          ) : filtered.length > 0 ? (
            filtered.map((c) => {
              const daysLeft = c.end_date ? Math.ceil((new Date(c.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              return (
                <Card key={c.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/contracts/${c.id}`)}>
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold capitalize">{c.contract_type} Contract</span>
                      <Badge className={`capitalize ${statusColors[c.status]}`}>{c.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Value</span><span className="font-medium">${Number(c.deal_value || 0).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Start</span><span>{c.start_date || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">End</span><span>{c.end_date || "—"}</span></div>
                      {c.renewal_date && (
                        <div className="flex justify-between"><span className="text-muted-foreground">Renewal</span><span className={isRenewalSoonDays(c.days_until_renewal) ? "text-warning font-semibold" : ""}>{c.renewal_date}</span></div>
                      )}
                    </div>
                    {daysLeft !== null && daysLeft > 0 && (
                      <p className="text-xs text-muted-foreground">{daysLeft} days remaining</p>
                    )}
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <p className="text-muted-foreground col-span-full text-center py-8">No contracts found</p>
          )}
        </div>
      )}

      {/* Admin/Sales view with tabs */}
      {!isProvider && (
        <Tabs defaultValue="all">
          <TabsList>
            <TabsTrigger value="all">All Contracts</TabsTrigger>
            <TabsTrigger value="renewals"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Renewals</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-4">
            {/* Search & Filter Bar */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex gap-3 items-center">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search by provider or contract ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)}>
                    <Filter className="h-4 w-4 mr-2" />Filters
                  </Button>
                  {selectedIds.size > 0 && (
                    <Button variant="outline" size="sm" onClick={exportCSV}>
                      <Download className="h-4 w-4 mr-2" />Export ({selectedIds.size})
                    </Button>
                  )}
                  {selectedIds.size === 0 && (
                    <Button variant="outline" size="sm" onClick={exportCSV}>
                      <Download className="h-4 w-4 mr-2" />Export All
                    </Button>
                  )}
                </div>

                {showFilters && (
                  <div className="flex gap-3 flex-wrap">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        {Constants.public.Enums.contract_status.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {Constants.public.Enums.contract_type.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {dealTypes && dealTypes.length > 0 && (
                      <Select value={dealTypeFilter} onValueChange={setDealTypeFilter}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="Deal Type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Deal Types</SelectItem>
                          {dealTypes.map((d) => (
                            <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant={outdatedOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => setOutdatedOnly(!outdatedOnly)}
                      className="gap-1.5"
                    >
                      <FileWarning className="h-3.5 w-3.5" />
                      Outdated Documents
                      {outdatedOnly && outdatedProviderIds && (
                        <Badge variant="secondary" className="ml-1 text-[10px] px-1.5">{outdatedProviderIds.length}</Badge>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={toggleAll} />
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("provider")}>
                        <span className="flex items-center gap-1">Provider <ArrowUpDown className="h-3.5 w-3.5" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("contract_type")}>
                        <span className="flex items-center gap-1">Type <ArrowUpDown className="h-3.5 w-3.5" /></span>
                      </TableHead>
                      <TableHead>Deal Type</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("deal_value")}>
                        <span className="flex items-center gap-1">Value <ArrowUpDown className="h-3.5 w-3.5" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("start_date")}>
                        <span className="flex items-center gap-1">Start <ArrowUpDown className="h-3.5 w-3.5" /></span>
                      </TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("end_date")}>
                        <span className="flex items-center gap-1">End <ArrowUpDown className="h-3.5 w-3.5" /></span>
                      </TableHead>
                      <TableHead>Renewal</TableHead>
                      <TableHead className="cursor-pointer" onClick={() => toggleSort("status")}>
                        <span className="flex items-center gap-1">Status <ArrowUpDown className="h-3.5 w-3.5" /></span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={9} className="p-0"><TableSkeleton rows={10} cols={9} /></TableCell></TableRow>
                    ) : filtered.length > 0 ? (
                      filtered.map((c) => {
                        const dt = dealTypeMap[c.provider_id];
                        const renewSoon = isRenewalSoonDays(c.days_until_renewal);
                        return (
                          <TableRow
                            key={c.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/contracts/${c.id}`)}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
                            </TableCell>
                            <TableCell className="font-medium">{c.provider_business_name || "—"}</TableCell>
                            <TableCell>
                              <Badge className={`capitalize ${typeColors[c.contract_type] || ""}`}>{c.contract_type}</Badge>
                            </TableCell>
                            <TableCell>
                              {dt ? (
                                <Badge style={{ backgroundColor: `${dt.color}20`, color: dt.color, borderColor: dt.color }} variant="outline">
                                  {dt.name}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell>${Number(c.deal_value || 0).toLocaleString()}</TableCell>
                            <TableCell>{c.start_date || "—"}</TableCell>
                            <TableCell>{c.end_date || "—"}</TableCell>
                            <TableCell>
                              <span className={renewSoon ? "text-warning font-semibold" : ""}>
                                {c.renewal_date || "—"}
                                {renewSoon && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge className={`capitalize ${statusColors[c.status] || ""}`}>
                                {c.status.replace(/_/g, " ")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    ) : (
                      <TableRow><TableCell colSpan={9} className="p-0">
                        <EmptyState icon="contracts" title="No contracts found" description="No contracts match your filters. Create a new contract to get started." action={{ label: "New Contract", onClick: () => setShowForm(true) }} />
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
                <PaginationControls
                  page={pagination.page}
                  pageSize={pagination.pageSize}
                  total={totalContracts}
                  onPrev={pagination.prev}
                  onNext={pagination.next}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="renewals" className="mt-4">
            <RenewalsTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
