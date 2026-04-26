import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { Plus, Search, Download, ChevronDown, ChevronUp, ArrowUpDown, Send, FileText, Settings2, Bell, Receipt, Upload, RefreshCw } from "lucide-react";
import { HealthScoreBadge } from "@/components/providers/HealthScoreBadge";
import { useState, useMemo, useEffect } from "react";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { TableSkeleton } from "@/components/Skeletons";
import { CSVImportWizard, FieldMapping } from "@/components/import/CSVImportWizard";
import { BulkUpdateWizard } from "@/components/import/BulkUpdateWizard";
import {
  geocodeAddress as backendGeocode,
  importProvidersCsv,
  getJobStatus,
} from "@/lib/backend-api";


const PROVIDER_IMPORT_FIELDS: FieldMapping[] = [
  { key: "business_name", label: "Business Name", required: true },
  { key: "contact_name", label: "Contact Name", required: false },
  { key: "contact_email", label: "Email", required: false },
  { key: "contact_phone", label: "Phone", required: false },
  { key: "address_line1", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip_code", label: "Zip Code", required: false },
  { key: "provider_type", label: "Provider Type", required: false },
  { key: "npi_number", label: "NPI", required: false, validate: (v) => /^\d{10}$/.test(v) },
  { key: "tax_id", label: "Tax ID", required: false },
  { key: "website", label: "Website", required: false },
  { key: "notes", label: "Notes", required: false },
];


const statusColors: Record<string, string> = {
  prospect: "bg-muted text-muted-foreground",
  in_negotiation: "bg-warning/10 text-warning",
  contracted: "bg-primary/10 text-primary",
  active: "bg-success/10 text-success",
  churned: "bg-destructive/10 text-destructive",
  suspended: "bg-muted text-muted-foreground",
};

const TIER_BADGE_COLORS: Record<string, string> = {
  ASSOCIATE: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  MEMBER: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  PREMIER: "bg-purple-500/10 text-purple-700 border-purple-500/20",
};

const BILLING_STATUS_COLORS: Record<string, string> = {
  active: "bg-success/10 text-success",
  pending: "bg-muted text-muted-foreground",
  past_due: "bg-destructive/10 text-destructive",
  suspended: "bg-orange-500/10 text-orange-700",
  cancelled: "bg-muted text-muted-foreground",
  trial: "bg-primary/10 text-primary",
};

type SortField = "business_name" | "city" | "status" | "created_at";
type SortDir = "asc" | "desc";

interface ProviderForm {
  business_name: string; contact_name: string; contact_email: string; contact_phone: string;
  address_line1: string; address_line2: string; city: string; state: string; zip_code: string;
  provider_type: string; status: string; notes: string;
}

const emptyForm: ProviderForm = {
  business_name: "", contact_name: "", contact_email: "", contact_phone: "",
  address_line1: "", address_line2: "", city: "", state: "", zip_code: "",
  provider_type: "", status: "prospect", notes: "",
};

const DEFAULT_COLUMNS = {
  health: true, documents: true, type: true, package: true, rep: true, contracts: true, lastActivity: true,
  tier: true, category: false, monthlyFee: false, billingStatus: false,
};

export default function Providers() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchInput: search, searchQuery: debouncedSearch, setSearchInput: setSearch } = useDebouncedSearch();
  const [open, setOpen] = useState(searchParams.get("add") === "true");
  const [form, setForm] = useState<ProviderForm>({ ...emptyForm });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [bulkSendOpen, setBulkSendOpen] = useState(false);
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  const [bulkTemplateId, setBulkTemplateId] = useState("");
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRep, setFilterRep] = useState<string>("all");
  const [filterDocStatus, setFilterDocStatus] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterBillingStatus, setFilterBillingStatus] = useState<string>("all");

  useEffect(() => {
    if (searchParams.get("add") === "true") {
      setOpen(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  const pagination = usePagination(20);

  const { data: providersData, isLoading } = useQuery({
    queryKey: ["v-provider-list", filterStatus, filterState, filterType, filterRep, sortField, sortDir, debouncedSearch, pagination.page],
    queryFn: async () => {
      let q = supabase.from("v_provider_list" as any).select("*", { count: "exact" });

      // FTS replaces the ilike OR-chain
      if (debouncedSearch) q = q.textSearch("search_vector", debouncedSearch, { type: "websearch", config: "english" });

      if (filterStatus !== "all") q = q.eq("status", filterStatus);
      if (filterState !== "all") q = q.eq("state", filterState);
      if (filterType !== "all") q = q.eq("provider_type", filterType);
      if (filterRep !== "all") q = q.eq("assigned_sales_rep", filterRep);

      q = q.order(sortField === "status" ? "status" : sortField, { ascending: sortDir === "asc" });
      q = q.range(pagination.from, pagination.to);

      const { data, error, count } = await q;
      if (error) throw error;
      return { data: (data as any[]) ?? [], count: count ?? 0 };
    },
  });

  const providers = providersData?.data as any[] | undefined;
  const totalProviders = providersData?.count ?? 0;

  // Fetch provider_documents only for bulk "send next doc" workflow (not for row rendering).
  // Row-level doc counts come from the v_provider_list view.
  const { data: allProviderDocs } = useQuery({
    queryKey: ["provider-docs-for-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("id, provider_id, template_id, signing_order, status, document_templates(name)")
        .neq("status", "voided")
        .order("signing_order");
      return data ?? [];
    },
  });

  // Compute "next doc to send" per provider (used only by the bulk-send flow).
  const nextDocByProvider = useMemo(() => {
    const map: Record<string, { id: string; templateId: string; name: string; signingOrder: number } | null> = {};
    if (!allProviderDocs) return map;
    const grouped: Record<string, typeof allProviderDocs> = {};
    allProviderDocs.forEach(d => {
      if (!grouped[d.provider_id]) grouped[d.provider_id] = [];
      grouped[d.provider_id].push(d);
    });
    for (const [pid, docs] of Object.entries(grouped)) {
      const sorted = [...docs].sort((a, b) => (a.signing_order ?? 0) - (b.signing_order ?? 0));
      let nextDoc: typeof map[string] = null;
      for (const d of sorted) {
        if (d.status === "signed") continue;
        const prevAll = sorted.filter(p => (p.signing_order ?? 0) < (d.signing_order ?? 0));
        if (prevAll.every(p => p.status === "signed")) {
          nextDoc = { id: d.id, templateId: d.template_id, name: (d.document_templates as any)?.name || "Document", signingOrder: d.signing_order ?? 0 };
          break;
        }
        break;
      }
      map[pid] = nextDoc;
    }
    return map;
  }, [allProviderDocs]);

  const { data: salesReps } = useQuery({
    queryKey: ["sales-reps"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, user_roles(role)");
      return (data ?? []).filter((p: any) => {
        const roles = p.user_roles as any[];
        return roles?.some((r: any) => r.role === "admin" || r.role === "sales_rep");
      });
    },
  });

  const uniqueStates = useMemo(() => [...new Set((providers ?? []).map(p => p.state).filter(Boolean))].sort(), [providers]);
  const uniqueTypes = useMemo(() => [...new Set((providers ?? []).map(p => p.provider_type).filter(Boolean))].sort(), [providers]);

  const createProvider = useMutation({
    mutationFn: async () => {
      // Validate before hitting the DB so we surface friendly errors instead of
      // letting a malformed email/phone/zip silently land in the row.
      if (!form.business_name?.trim()) throw new Error("Business name is required.");
      if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
        throw new Error("Contact email is not a valid email address.");
      }
      if (form.contact_phone && !/^[\d\s\-\(\)\+]{7,}$/.test(form.contact_phone)) {
        throw new Error("Contact phone looks invalid. Use digits, dashes, parens, or +.");
      }
      if (form.zip_code && !/^\d{5}(-\d{4})?$/.test(form.zip_code)) {
        throw new Error("ZIP code must be 5 digits or 5+4 (e.g. 30309 or 30309-1234).");
      }
      if (form.state && form.state.trim().length !== 2) {
        throw new Error("State must be a 2-letter abbreviation (e.g. GA, TX).");
      }

      const addressParts = [form.address_line1, form.city, form.state, form.zip_code].filter(Boolean);
      const geo = addressParts.length >= 2 ? await backendGeocode(addressParts.join(", ")).catch(() => null) : null;
      const { error } = await supabase.from("providers").insert({
        business_name: form.business_name, contact_name: form.contact_name || null, contact_email: form.contact_email || null, contact_phone: form.contact_phone || null,
        address_line1: form.address_line1 || null, address_line2: form.address_line2 || null, city: form.city || null, state: form.state ? form.state.toUpperCase() : null, zip_code: form.zip_code || null,
        provider_type: form.provider_type || null, status: form.status as any, notes: form.notes || null,
        latitude: geo?.lat ?? null, longitude: geo?.lng ?? null, assigned_sales_rep: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["v-provider-list"] }); setOpen(false); setForm({ ...emptyForm }); toast.success("Provider created successfully"); },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkAssignRep = useMutation({
    mutationFn: async (repId: string) => { const { error } = await supabase.from("providers").update({ assigned_sales_rep: repId }).in("id", Array.from(selectedIds)); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["v-provider-list"] }); setSelectedIds(new Set()); toast.success("Sales rep assigned"); },
  });

  const bulkChangeStatus = useMutation({
    mutationFn: async (status: string) => { const { error } = await supabase.from("providers").update({ status: status as any }).in("id", Array.from(selectedIds)); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["v-provider-list"] }); setSelectedIds(new Set()); toast.success("Status updated"); },
  });

  const eligibleForBulkSend = useMemo(() => {
    const ids = Array.from(selectedIds);
    return ids.map(id => {
      const nextDoc = nextDocByProvider[id];
      const prov = providers?.find(p => p.id === id);
      if (!nextDoc || !prov) return null;
      const doc = allProviderDocs?.find(d => d.id === nextDoc.id);
      if (doc?.status !== "pending") return null;
      return { providerId: id, providerName: prov.business_name, doc: nextDoc };
    }).filter(Boolean) as { providerId: string; providerName: string; doc: { id: string; templateId: string; name: string; signingOrder: number } }[];
  }, [selectedIds, nextDocByProvider, providers, allProviderDocs]);

  const bulkSendMutation = useMutation({
    mutationFn: async () => {
      if (eligibleForBulkSend.length === 0) return;
      // Group providers by the templateId they will receive next. When all eligible providers
      // share the same next-template, this is a single RPC; otherwise we issue one RPC per template.
      const uniqueTemplates = new Set(eligibleForBulkSend.map(x => x.doc.templateId));
      if (uniqueTemplates.size === 1) {
        const templateId = eligibleForBulkSend[0].doc.templateId;
        const providerIds = eligibleForBulkSend.map(x => x.providerId);
        const { data, error } = await supabase.rpc("rpc_provider_bulk_send_document" as any, {
          p_provider_ids: providerIds,
          p_template_id: templateId,
        });
        if (error) throw error;
        const rows = (data as any[]) ?? [];
        const errorRows = rows.filter(r => r.status !== "sent");
        if (errorRows.length) throw new Error(`Sent ${rows.length - errorRows.length} of ${rows.length}, ${errorRows.length} failed`);
      } else {
        const byTemplate = new Map<string, string[]>();
        for (const item of eligibleForBulkSend) {
          const ids = byTemplate.get(item.doc.templateId) ?? [];
          ids.push(item.providerId);
          byTemplate.set(item.doc.templateId, ids);
        }
        for (const [tmplId, ids] of byTemplate) {
          const { error } = await supabase.rpc("rpc_provider_bulk_send_document" as any, {
            p_provider_ids: ids,
            p_template_id: tmplId,
          });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v-provider-list"] }); queryClient.invalidateQueries({ queryKey: ["provider-docs-for-list"] }); queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
      setSelectedIds(new Set()); setBulkSendOpen(false); toast.success(`Sent ${eligibleForBulkSend.length} documents for signature`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Templates for bulk send by template
  const { data: bulkTemplates } = useQuery({
    queryKey: ["templates-for-bulk-send"],
    queryFn: async () => {
      const { data } = await supabase
        .from("document_templates")
        .select("id, name, document_type, file_url")
        .eq("is_active", true)
        .order("name");
      return data ?? [];
    },
    enabled: bulkTemplateOpen,
  });

  const bulkTemplateSendMutation = useMutation({
    mutationFn: async () => {
      if (!bulkTemplateId) throw new Error("Select a template");
      const tmpl = bulkTemplates?.find(t => t.id === bulkTemplateId);
      if (!tmpl?.file_url) throw new Error("Template has no file uploaded");
      const providerIds = Array.from(selectedIds);
      const { data, error } = await supabase.rpc("rpc_provider_bulk_send_document" as any, {
        p_provider_ids: providerIds,
        p_template_id: bulkTemplateId,
      });
      if (error) throw error;
      const rows = (data as any[]) ?? [];
      const errorRows = rows.filter(r => r.status !== "sent");
      if (errorRows.length) throw new Error(`Sent ${rows.length - errorRows.length} of ${rows.length}, ${errorRows.length} failed`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v-provider-list"] });
      queryClient.invalidateQueries({ queryKey: ["provider-docs-for-list"] });
      setSelectedIds(new Set()); setBulkTemplateOpen(false); setBulkTemplateId("");
      toast.success(`Sent to ${selectedIds.size} providers`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Apply client-side filters against columns on the v_provider_list view.
  const filtered = useMemo(() => {
    let list = providers ?? [];
    if (filterDocStatus !== "all") {
      list = list.filter(p => {
        const total = Number(p.total_docs ?? 0);
        const signed = Number(p.signed_docs ?? 0);
        switch (filterDocStatus) {
          case "no_package": return !p.service_package_id;
          case "pending": return signed === 0 && total > 0;
          case "partial": return signed > 0 && signed < total;
          case "fully_signed": return total > 0 && signed === total;
          default: return true;
        }
      });
    }
    if (filterTier !== "all") {
      list = list.filter(p => p.tier_code === filterTier);
    }
    if (filterCategory !== "all") {
      list = list.filter(p => p.category_code === filterCategory);
    }
    if (filterBillingStatus !== "all") {
      list = list.filter(p => p.billing_status === filterBillingStatus);
    }
    return list;
  }, [providers, filterDocStatus, filterTier, filterCategory, filterBillingStatus]);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    pagination.reset();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(p => p.id)));
  };

  const exportCSV = () => {
    const headers = ["Business Name", "Contact Name", "Contact Email", "City", "State", "Status", "Type", "Assigned Rep", "Tier", "Category", "Monthly Fee", "Billing Status"];
    const rows = filtered.map(p => {
      return [p.business_name, p.contact_name || "", p.contact_email || "", p.city || "", p.state || "", p.status, p.provider_type || "", p.rep_name || "",
        p.tier_name || "", p.category_name || "",
        p.monthly_amount != null ? `$${Number(p.monthly_amount).toFixed(2)}` : "", p.billing_status || ""];
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "providers.csv"; a.click(); URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const toggleColumn = (key: keyof typeof columns) => setColumns(prev => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Providers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalProviders} provider{totalProviders !== 1 ? "s" : ""} in your network
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <Settings2 className="mr-1.5 h-4 w-4" />Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Toggle Columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={columns.tier} onCheckedChange={() => toggleColumn("tier")}>Tier</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.category} onCheckedChange={() => toggleColumn("category")}>Category</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.monthlyFee} onCheckedChange={() => toggleColumn("monthlyFee")}>Monthly Fee</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.billingStatus} onCheckedChange={() => toggleColumn("billingStatus")}>Billing Status</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem checked={columns.health} onCheckedChange={() => toggleColumn("health")}>Health</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.documents} onCheckedChange={() => toggleColumn("documents")}>Documents</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.type} onCheckedChange={() => toggleColumn("type")}>Type</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.package} onCheckedChange={() => toggleColumn("package")}>Package</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.rep} onCheckedChange={() => toggleColumn("rep")}>Assigned Rep</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.contracts} onCheckedChange={() => toggleColumn("contracts")}>Contracts</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={columns.lastActivity} onCheckedChange={() => toggleColumn("lastActivity")}>Last Activity</DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={exportCSV}>
            <Download className="mr-1.5 h-4 w-4" />Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Upload className="mr-1.5 h-4 w-4" />Import</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImportOpen(true)}>Import Providers (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkUpdateOpen(true)}>Bulk Update (CSV)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add Provider</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto sm:max-w-2xl w-[95vw]">
              <DialogHeader><DialogTitle>New Provider</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2"><Label>Business Name *</Label><Input value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Contact Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
                <div className="space-y-2"><Label>Contact Phone</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
                <div className="space-y-2"><Label>Provider Type</Label><Input value={form.provider_type} onChange={e => setForm({ ...form, provider_type: e.target.value })} placeholder="e.g., Healthcare" /></div>
                <div className="space-y-2 col-span-2"><Label>Address Line 1</Label><Input value={form.address_line1} onChange={e => setForm({ ...form, address_line1: e.target.value })} /></div>
                <div className="space-y-2 col-span-2"><Label>Address Line 2</Label><Input value={form.address_line2} onChange={e => setForm({ ...form, address_line2: e.target.value })} /></div>
                <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                <div className="space-y-2"><Label>State</Label><Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} /></div>
                <div className="space-y-2"><Label>Zip Code</Label><Input value={form.zip_code} onChange={e => setForm({ ...form, zip_code: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Constants.public.Enums.provider_status.map(s => (<SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>))}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-3">Address will be auto-geocoded for map placement.</p>
                  <Button className="w-full" onClick={() => createProvider.mutate()} disabled={!form.business_name || createProvider.isPending}>{createProvider.isPending ? "Creating..." : "Create Provider"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search + Filters — compact single row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-9 text-sm" placeholder="Search providers..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Constants.public.Enums.provider_status.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterTier} onValueChange={setFilterTier}>
          <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            <SelectItem value="ASSOCIATE">Associate</SelectItem>
            <SelectItem value="MEMBER">Member</SelectItem>
            <SelectItem value="PREMIER">Premier</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterBillingStatus} onValueChange={setFilterBillingStatus}>
          <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Billing" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Billing</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="past_due">Past Due</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDocStatus} onValueChange={setFilterDocStatus}>
          <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Docs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Docs</SelectItem>
            <SelectItem value="no_package">No Package</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="fully_signed">Signed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterState} onValueChange={setFilterState}>
          <SelectTrigger className="w-[120px] h-9 text-sm"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {uniqueStates.map(s => <SelectItem key={s} value={s!}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {uniqueTypes.map(t => <SelectItem key={t} value={t!}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {role === "admin" && (
          <Select value={filterRep} onValueChange={setFilterRep}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Rep" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reps</SelectItem>
              {salesReps?.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name || r.id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/10 rounded-lg text-sm flex-wrap">
          <span className="font-medium text-primary">{selectedIds.size} selected</span>
          <span className="text-muted-foreground">·</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-7 text-xs">Assign Rep <ChevronDown className="ml-1 h-3 w-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>{salesReps?.map(r => (<DropdownMenuItem key={r.id} onClick={() => bulkAssignRep.mutate(r.id)}>{r.full_name || r.id.slice(0, 8)}</DropdownMenuItem>))}</DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="h-7 text-xs">Change Status <ChevronDown className="ml-1 h-3 w-3" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent>{Constants.public.Enums.provider_status.map(s => (<DropdownMenuItem key={s} onClick={() => bulkChangeStatus.mutate(s)} className="capitalize">{s.replace(/_/g, " ")}</DropdownMenuItem>))}</DropdownMenuContent>
          </DropdownMenu>
          {eligibleForBulkSend.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setBulkSendOpen(true)}><Send className="h-3 w-3 mr-1" />Send Next Doc ({eligibleForBulkSend.length})</Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setBulkTemplateOpen(true)}><FileText className="h-3 w-3 mr-1" />Send Document</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => {
            // Send reminder to all selected with pending signatures
            const ids = Array.from(selectedIds);
            let count = 0;
            for (const pid of ids) {
              const docs = allProviderDocs?.filter(d => d.provider_id === pid && (d.status === "sent" || d.status === "pending"));
              if (!docs || docs.length === 0) continue;
              const { data: prov } = await supabase.from("providers").select("contact_email").eq("id", pid).single();
              if (!prov?.contact_email) continue;
              const { data: prof } = await supabase.from("profiles").select("id").eq("email", prov.contact_email).maybeSingle();
              if (!prof) continue;
              await supabase.from("notifications").insert({ user_id: prof.id, title: "Reminder: Documents awaiting your signature", message: `You have ${docs.length} document(s) pending your signature.`, type: "warning", link: "/my-documents" });
              count++;
            }
            toast.success(`Sent reminders to ${count} provider(s)`);
          }}><Bell className="h-3 w-3 mr-1" />Send Reminder</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => {
            navigate("/batch-send");
          }}><Receipt className="h-3 w-3 mr-1" />Generate Invoices</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
            const ids = Array.from(selectedIds);
            const selected = filtered.filter(p => ids.includes(p.id));
            const headers = ["Business Name", "Contact Name", "Contact Email", "Contact Phone", "City", "State", "Status", "Type", "Assigned Rep"];
            const rows = selected.map(p => [p.business_name, p.contact_name || "", p.contact_email || "", p.contact_phone || "", p.city || "", p.state || "", p.status, p.provider_type || "", p.rep_name || ""]);
            const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "selected-providers.csv"; a.click(); URL.revokeObjectURL(url);
            toast.success(`Exported ${selected.length} providers`);
          }}><Download className="h-3 w-3 mr-1" />Export Selected</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground ml-auto" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-10"><Checkbox checked={filtered.length > 0 && selectedIds.size === filtered.length} onCheckedChange={toggleAll} /></TableHead>
              <TableHead className="cursor-pointer font-medium text-xs uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("business_name")}><span className="flex items-center">Name<SortIcon field="business_name" /></span></TableHead>
              <TableHead className="cursor-pointer font-medium text-xs uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("city")}><span className="flex items-center">Location<SortIcon field="city" /></span></TableHead>
              <TableHead className="cursor-pointer font-medium text-xs uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("status")}><span className="flex items-center">Status<SortIcon field="status" /></span></TableHead>
              {columns.tier && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Tier</TableHead>}
              {columns.category && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Category</TableHead>}
              {columns.monthlyFee && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground text-right">Fee</TableHead>}
              {columns.billingStatus && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Billing</TableHead>}
              {columns.health && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Health</TableHead>}
              {columns.documents && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Docs</TableHead>}
              {columns.type && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Type</TableHead>}
              {columns.package && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Package</TableHead>}
              {columns.rep && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Rep</TableHead>}
              {columns.contracts && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground text-center">Contracts</TableHead>}
              {columns.lastActivity && <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Activity</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={15} className="p-0"><TableSkeleton rows={10} cols={15} /></TableCell></TableRow>
            ) : filtered.length > 0 ? (
              filtered.map(p => {
                const totalDocs = Number(p.total_docs ?? 0);
                const signedDocs = Number(p.signed_docs ?? 0);
                const tierCode = p.tier_code as string | null;
                const tierName = p.tier_name as string | null;
                const catName = p.category_code as string | null;
                return (
                  <TableRow key={p.id} className="cursor-pointer group transition-colors" onClick={() => navigate(`/providers/${p.id}`)}>
                    <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selectedIds.has(p.id)} onCheckedChange={() => toggleSelect(p.id)} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                          {p.business_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.business_name}</p>
                          {p.contact_email && <p className="text-xs text-muted-foreground truncate">{p.contact_email}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{[p.city, p.state].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[11px] font-medium capitalize ${statusColors[p.status] || ""}`}>
                        {p.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    {columns.tier && (
                      <TableCell>
                        {tierCode ? (
                          <Badge variant="outline" className={`text-[11px] font-medium ${TIER_BADGE_COLORS[tierCode] || ""}`}>{tierName}</Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {columns.category && (
                      <TableCell>
                        {catName ? <span className="text-sm">{catName}</span> : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {columns.monthlyFee && (
                      <TableCell className="text-right text-sm font-medium">
                        {p.monthly_amount != null ? `$${Number(p.monthly_amount).toLocaleString()}` : <span className="text-muted-foreground font-normal">—</span>}
                      </TableCell>
                    )}
                    {columns.billingStatus && (
                      <TableCell>
                        {p.billing_status ? (
                          <Badge variant="secondary" className={`text-[11px] capitalize ${BILLING_STATUS_COLORS[p.billing_status] || ""}`}>{String(p.billing_status).replace(/_/g, " ")}</Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {columns.health && <TableCell><HealthScoreBadge score={p.health_score} /></TableCell>}
                    {columns.documents && (
                      <TableCell>
                        {totalDocs > 0 ? (
                          <div className="flex items-center gap-2">
                            <Progress value={(signedDocs / totalDocs) * 100} className="h-1.5 w-12" />
                            <span className="text-xs text-muted-foreground">{signedDocs}/{totalDocs}</span>
                          </div>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {columns.type && <TableCell className="text-sm text-muted-foreground">{p.provider_type || "—"}</TableCell>}
                    {columns.package && (
                      <TableCell>
                        {p.package_name
                          ? <span className="text-xs font-medium bg-muted px-2 py-0.5 rounded-md">{p.package_name}</span>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </TableCell>
                    )}
                    {columns.rep && (
                      <TableCell className="text-sm text-muted-foreground">{p.rep_name || "—"}</TableCell>
                    )}
                    {columns.contracts && <TableCell className="text-center text-sm">{Number(p.active_contract_count ?? 0)}</TableCell>}
                    {columns.lastActivity && (
                      <TableCell className="text-xs text-muted-foreground">
                        {p.last_activity_at ? new Date(p.last_activity_at).toLocaleDateString() : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            ) : (
              <TableRow><TableCell colSpan={15} className="p-0">
                <EmptyState
                  icon="providers"
                  title="No providers found"
                  description={debouncedSearch ? "No providers match your search or filters. Try adjusting your criteria." : "Start by adding your first provider or finding leads to grow your network."}
                  action={!debouncedSearch ? { label: "Find Leads", onClick: () => navigate("/leads") } : undefined}
                />
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        <div className="border-t">
          <PaginationControls page={pagination.page} pageSize={pagination.pageSize} total={totalProviders} onPrev={pagination.prev} onNext={pagination.next} />
        </div>
      </div>

      {/* Bulk Send Confirmation Dialog */}
      <Dialog open={bulkSendOpen} onOpenChange={setBulkSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Next Document</DialogTitle>
            <DialogDescription>Send the next unsigned document to {eligibleForBulkSend.length} provider{eligibleForBulkSend.length !== 1 ? "s" : ""}?</DialogDescription>
          </DialogHeader>
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {eligibleForBulkSend.map(item => (
              <div key={item.providerId} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                <span className="text-sm font-medium">{item.providerName}</span>
                <div className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-primary" /><span className="text-xs text-muted-foreground">{item.doc.name}</span></div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSendOpen(false)}>Cancel</Button>
            <Button onClick={() => bulkSendMutation.mutate()} disabled={bulkSendMutation.isPending}>
              <Send className="h-4 w-4 mr-2" />{bulkSendMutation.isPending ? "Sending..." : `Send ${eligibleForBulkSend.length} Documents`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Send by Template Dialog */}
      <Dialog open={bulkTemplateOpen} onOpenChange={setBulkTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Document to {selectedIds.size} Provider{selectedIds.size !== 1 ? "s" : ""}</DialogTitle>
            <DialogDescription>Select a document template to send to all selected providers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Document Template</Label>
            <Select value={bulkTemplateId} onValueChange={setBulkTemplateId}>
              <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
              <SelectContent>
                {bulkTemplates?.map(t => (
                  <SelectItem key={t.id} value={t.id} disabled={!t.file_url}>
                    {t.name} {!t.file_url ? "(no file)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTemplateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => bulkTemplateSendMutation.mutate()}
              disabled={bulkTemplateSendMutation.isPending || !bulkTemplateId}
            >
              <Send className="h-4 w-4 mr-2" />
              {bulkTemplateSendMutation.isPending ? "Sending..." : `Send to ${selectedIds.size} Providers`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Wizard */}
      <CSVImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Providers"
        fields={PROVIDER_IMPORT_FIELDS}
        onImport={async (rows) => {
          if (rows.length === 0) {
            return { imported: 0, skipped: 0 };
          }
          // Re-serialize rows to CSV for the FastAPI importer (which expects a File).
          const headers = Object.keys(rows[0] ?? {});
          const csv = [
            headers.join(","),
            ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
          ].join("\n");
          const file = new File([csv], "providers.csv", { type: "text/csv" });

          const job = await importProvidersCsv(file);
          // Poll for completion (every 2s, up to 2 min).
          let imported = 0, skipped = 0;
          let done = false;
          for (let i = 0; i < 60; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await getJobStatus(job.job_id);
            if (status.status === "completed") {
              imported = Number((status.result as any)?.imported ?? 0);
              skipped = Number((status.result as any)?.skipped ?? 0);
              done = true;
              break;
            }
            if (status.status === "failed") {
              throw new Error(status.error_message ?? "Import failed");
            }
          }
          if (!done) {
            throw new Error("Import is still running. Check the Jobs page for progress.");
          }
          queryClient.invalidateQueries({ queryKey: ["v-provider-list"] });
          return { imported, skipped };
        }}
      />

      {/* Bulk Update Wizard */}
      <BulkUpdateWizard
        open={bulkUpdateOpen}
        onOpenChange={setBulkUpdateOpen}
        title="Bulk Update Providers"
        matchFields={["id", "business_name"]}
        onUpdate={async (rows) => {
          let updated = 0, notFound = 0;
          for (const row of rows) {
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const matchCol = Object.keys(row).find(k => normalize(k) === "id") || Object.keys(row).find(k => normalize(k) === "businessname");
            if (!matchCol) { notFound++; continue; }
            const matchVal = row[matchCol];
            const updateData: Record<string, any> = {};
            Object.entries(row).forEach(([k, v]) => {
              if (k === matchCol || !v) return;
              const nk = k.toLowerCase().replace(/[^a-z0-9_]/g, "");
              if (["status", "state", "city", "provider_type", "contact_name", "contact_email", "contact_phone", "notes", "assigned_sales_rep"].includes(nk)) {
                updateData[nk] = v;
              }
            });
            if (Object.keys(updateData).length === 0) { notFound++; continue; }
            let query;
            if (normalize(matchCol) === "id") {
              query = supabase.from("providers").update(updateData as any).eq("id", matchVal);
            } else {
              const state = row[Object.keys(row).find(k => normalize(k) === "state") || ""] || "";
              query = supabase.from("providers").update(updateData as any).eq("business_name", matchVal);
              if (state) query = query.eq("state", state);
            }
            const { error, count } = await query;
            if (error || count === 0) notFound++; else updated++;
          }
          queryClient.invalidateQueries({ queryKey: ["v-provider-list"] });
          return { updated, notFound };
        }}
      />
    </div>
  );
}
