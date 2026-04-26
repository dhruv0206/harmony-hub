import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PaginationControls } from "@/components/PaginationControls";
import { TableSkeleton } from "@/components/Skeletons";
import { useDebouncedSearch } from "@/hooks/use-debounced-search";
import { usePagination } from "@/hooks/use-pagination";
import { Plus, Search, Scale, Users, AlertTriangle, CheckCircle2, Download, ChevronDown, ChevronUp, ArrowUpDown, FileText, Bell, Send, Upload } from "lucide-react";
import { toast } from "sonner";
import { downloadCSV } from "@/lib/export-utils";
import { CSVImportWizard, FieldMapping } from "@/components/import/CSVImportWizard";
import { BulkUpdateWizard } from "@/components/import/BulkUpdateWizard";
import { geocodeAddress, importLawFirmsCsv, getJobStatus } from "@/lib/backend-api";

const statusColors: Record<string, string> = {
  prospect: "bg-muted text-muted-foreground",
  in_negotiation: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  contracted: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  suspended: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  churned: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const STATUSES = ["prospect", "in_negotiation", "contracted", "active", "suspended", "churned"];
const FIRM_SIZES = [
  { value: "solo", label: "Solo" },
  { value: "small_2_5", label: "Small (2-5)" },
  { value: "mid_6_20", label: "Mid (6-20)" },
  { value: "large_21_plus", label: "Large (21+)" },
];
const PRACTICE_AREAS = [
  "personal_injury", "auto_accident", "medical_malpractice", "workers_comp",
  "slip_and_fall", "wrongful_death", "product_liability", "other",
];
const SOURCES = ["Referral", "Cold Outreach", "Inbound", "Conference", "Other"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const LAW_FIRM_IMPORT_FIELDS: FieldMapping[] = [
  { key: "firm_name", label: "Firm Name", required: true },
  { key: "contact_name", label: "Contact Name", required: false },
  { key: "contact_email", label: "Email", required: false },
  { key: "contact_phone", label: "Phone", required: false },
  { key: "address_line1", label: "Address", required: false },
  { key: "city", label: "City", required: false },
  { key: "state", label: "State", required: false },
  { key: "zip_code", label: "Zip Code", required: false },
  { key: "website", label: "Website", required: false },
  { key: "firm_size", label: "Firm Size", required: false },
  { key: "practice_areas", label: "Practice Areas", required: false },
  { key: "notes", label: "Notes", required: false },
];

type SortField = "firm_name" | "city" | "status" | "created_at";
type SortDir = "asc" | "desc";

interface NewFirmForm {
  firm_name: string; dba_name: string; contact_name: string; contact_email: string; contact_phone: string;
  address_line1: string; address_line2: string; city: string; state: string; zip_code: string; website: string;
  firm_size: string; practice_areas: string[]; states_licensed: string[]; source: string;
  assigned_sales_rep: string; notes: string;
}

const emptyForm: NewFirmForm = {
  firm_name: "", dba_name: "", contact_name: "", contact_email: "", contact_phone: "",
  address_line1: "", address_line2: "", city: "", state: "", zip_code: "", website: "",
  firm_size: "", practice_areas: [], states_licensed: [], source: "",
  assigned_sales_rep: "", notes: "",
};

export default function LawFirms() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { searchInput, searchQuery, setSearchInput } = useDebouncedSearch();
  const pagination = usePagination(25);
  const { page, pageSize, setPage, setPageSize } = pagination;

  const [statusFilter, setStatusFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [practiceFilter, setPracticeFilter] = useState("all");
  const [repFilter, setRepFilter] = useState("all");

  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<NewFirmForm>({ ...emptyForm });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);

  // Queries
  const { data, isLoading } = useQuery({
    queryKey: ["v-law-firm-list", page, pageSize, searchQuery, statusFilter, stateFilter, sizeFilter, practiceFilter, repFilter, sortField, sortDir],
    queryFn: async () => {
      let query = (supabase.from("v_law_firm_list" as any).select("*", { count: "exact" }) as any);
      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (stateFilter !== "all") query = query.eq("state", stateFilter);
      if (sizeFilter !== "all") query = query.eq("firm_size", sizeFilter);
      if (repFilter !== "all") query = query.eq("assigned_sales_rep", repFilter);
      if (practiceFilter !== "all") query = query.contains("practice_areas", [practiceFilter]);
      if (searchQuery) query = query.or(`firm_name.ilike.%${searchQuery}%,contact_name.ilike.%${searchQuery}%,contact_email.ilike.%${searchQuery}%`);
      query = query.order(sortField, { ascending: sortDir === "asc" }).range(page * pageSize, (page + 1) * pageSize - 1);
      const { data, count, error } = await query;
      if (error) throw error;
      return { data: (data ?? []) as any[], totalCount: count ?? 0 };
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["law-firm-stats"],
    queryFn: async () => {
      const results = await Promise.all([
        (supabase.from("law_firms" as any).select("id", { count: "exact", head: true }) as any),
        (supabase.from("law_firms" as any).select("id", { count: "exact", head: true }).eq("status", "active") as any),
        (supabase.from("law_firms" as any).select("id", { count: "exact", head: true }).eq("status", "prospect") as any),
        (supabase.from("law_firms" as any).select("id", { count: "exact", head: true }).eq("status", "in_negotiation") as any),
      ]);
      return { total: results[0].count ?? 0, active: results[1].count ?? 0, prospects: results[2].count ?? 0, negotiating: results[3].count ?? 0 };
    },
    staleTime: 60000,
  });

  // Sales reps
  const { data: salesReps } = useQuery({
    queryKey: ["sales-reps"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name, user_roles(role)");
      return (data ?? []).filter((p: any) => (p.user_roles as any[])?.some((r: any) => r.role === "admin" || r.role === "sales_rep"));
    },
  });

  // Mutations
  const createFirm = useMutation({
    mutationFn: async () => {
      if (!form.firm_name?.trim()) throw new Error("Firm name is required.");
      if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
        throw new Error("Please enter a valid contact email or leave it blank.");
      }
      if (form.contact_phone && !/^[+()\-.\s\d]{7,}$/.test(form.contact_phone)) {
        throw new Error("Phone format isn't valid.");
      }
      const stateUpper = (form.state || "").trim().toUpperCase();
      if (stateUpper && !/^[A-Z]{2}$/.test(stateUpper)) {
        throw new Error("State must be a 2-letter US code (e.g. GA).");
      }
      if (form.zip_code && !/^\d{5}(-\d{4})?$/.test(form.zip_code)) {
        throw new Error("ZIP must be 5 digits or 5+4.");
      }
      if (form.website && !/^https?:\/\//.test(form.website)) {
        throw new Error("Website must start with http:// or https://.");
      }
      const addressParts = [form.address_line1, form.city, stateUpper, form.zip_code].filter(Boolean);
      let lat: number | null = null;
      let lng: number | null = null;
      if (addressParts.length >= 2) {
        try {
          const geo = await geocodeAddress(addressParts.join(", "));
          lat = geo.lat;
          lng = geo.lng;
        } catch {
          // geocoding is best-effort; continue without coordinates
        }
      }
      const payload: any = {
        firm_name: form.firm_name.trim(),
        dba_name: form.dba_name || null,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        address_line1: form.address_line1 || null,
        address_line2: form.address_line2 || null,
        city: form.city || null,
        state: (form.state || "").trim().toUpperCase() || null,
        zip_code: form.zip_code || null,
        website: form.website || null,
        firm_size: form.firm_size || null,
        practice_areas: form.practice_areas.length > 0 ? form.practice_areas : null,
        states_licensed: form.states_licensed.length > 0 ? form.states_licensed : null,
        source: form.source || null,
        assigned_sales_rep: form.assigned_sales_rep || user?.id || null,
        notes: form.notes || null,
        latitude: lat,
        longitude: lng,
      };
      const { error } = await (supabase.from("law_firms" as any).insert(payload) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v-law-firm-list"] });
      queryClient.invalidateQueries({ queryKey: ["law-firm-stats"] });
      setAddOpen(false);
      setForm({ ...emptyForm });
      toast.success("Law firm added");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const bulkAssignRep = useMutation({
    mutationFn: async (repId: string) => {
      const { error } = await (supabase.from("law_firms" as any).update({ assigned_sales_rep: repId }).in("id", Array.from(selectedIds)) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v-law-firm-list"] });
      setSelectedIds(new Set());
      toast.success("Sales rep assigned");
    },
  });

  const bulkChangeStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await (supabase.from("law_firms" as any).update({ status }).in("id", Array.from(selectedIds)) as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["v-law-firm-list"] });
      queryClient.invalidateQueries({ queryKey: ["law-firm-stats"] });
      setSelectedIds(new Set());
      toast.success("Status updated");
    },
  });

  // Helpers
  const firms = data?.data ?? [];
  const total = data?.totalCount ?? 0;

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
    pagination.reset();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    if (selectedIds.size === firms.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(firms.map((f: any) => f.id)));
  };

  const togglePracticeArea = (pa: string) => {
    setForm(prev => ({
      ...prev,
      practice_areas: prev.practice_areas.includes(pa)
        ? prev.practice_areas.filter(a => a !== pa)
        : [...prev.practice_areas, pa],
    }));
  };

  const toggleStateLicensed = (st: string) => {
    setForm(prev => ({
      ...prev,
      states_licensed: prev.states_licensed.includes(st)
        ? prev.states_licensed.filter(s => s !== st)
        : [...prev.states_licensed, st],
    }));
  };

  const exportCsv = () => {
    const headers = ["Firm Name", "City", "State", "Firm Size", "Status", "Assigned Rep", "Monthly Fee", "Practice Areas"];
    const rows = firms.map((f: any) => [
      f.firm_name, f.city || "", f.state || "", f.firm_size?.replace(/_/g, " ") || "",
      f.status?.replace(/_/g, " "), f.rep_name || "",
      f.monthly_amount != null ? `$${Number(f.monthly_amount).toFixed(2)}` : "",
      (f.practice_areas || []).map((p: string) => p.replace(/_/g, " ")).join("; "),
    ]);
    downloadCSV("law-firms.csv", headers, rows);
    toast.success("CSV exported");
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />;
  };

  const timeAgo = (d: string) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Law Firms</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} law firm{total !== 1 ? "s" : ""} in the network</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={exportCsv}>
            <Download className="mr-1.5 h-4 w-4" />Export
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"><Upload className="mr-1.5 h-4 w-4" />Import</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setImportOpen(true)}>Import Law Firms (CSV)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBulkUpdateOpen(true)}>Bulk Update (CSV)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add Law Firm</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add New Law Firm</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2"><Label>Firm Name *</Label><Input value={form.firm_name} onChange={e => setForm({ ...form, firm_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>DBA Name</Label><Input value={form.dba_name} onChange={e => setForm({ ...form, dba_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Website</Label><Input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://" /></div>
                <div className="space-y-2"><Label>Contact Name</Label><Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contact_email} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>Firm Size</Label>
                  <Select value={form.firm_size} onValueChange={v => setForm({ ...form, firm_size: v })}>
                    <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                    <SelectContent>{FIRM_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2"><Label>Address</Label><Input value={form.address_line1} onChange={e => setForm({ ...form, address_line1: e.target.value })} placeholder="Street address" /></div>
                <div className="space-y-2"><Label>Address Line 2</Label><Input value={form.address_line2} onChange={e => setForm({ ...form, address_line2: e.target.value })} /></div>
                <div className="space-y-2"><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Select value={form.state} onValueChange={v => setForm({ ...form, state: v })}>
                    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>{US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Zip Code</Label><Input value={form.zip_code} onChange={e => setForm({ ...form, zip_code: e.target.value })} /></div>
                <div className="space-y-2 col-span-2">
                  <Label>Practice Areas</Label>
                  <div className="flex flex-wrap gap-2">
                    {PRACTICE_AREAS.map(pa => (
                      <Badge
                        key={pa}
                        variant={form.practice_areas.includes(pa) ? "default" : "outline"}
                        className="cursor-pointer capitalize"
                        onClick={() => togglePracticeArea(pa)}
                      >
                        {pa.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>States Licensed</Label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {US_STATES.map(st => (
                      <Badge
                        key={st}
                        variant={form.states_licensed.includes(st) ? "default" : "outline"}
                        className="cursor-pointer text-xs"
                        onClick={() => toggleStateLicensed(st)}
                      >
                        {st}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                    <SelectTrigger><SelectValue placeholder="How found" /></SelectTrigger>
                    <SelectContent>{SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Assigned Rep</Label>
                  <Select value={form.assigned_sales_rep} onValueChange={v => setForm({ ...form, assigned_sales_rep: v })}>
                    <SelectTrigger><SelectValue placeholder="Select rep" /></SelectTrigger>
                    <SelectContent>{salesReps?.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name || r.id.slice(0, 8)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} /></div>
                <div className="col-span-2">
                  <Button className="w-full" onClick={() => createFirm.mutate()} disabled={!form.firm_name || createFirm.isPending}>
                    {createFirm.isPending ? "Adding..." : "Add Law Firm"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-4 flex items-center gap-3"><Scale className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{stats?.total ?? 0}</p><p className="text-xs text-muted-foreground">Total Firms</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><CheckCircle2 className="h-8 w-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.active ?? 0}</p><p className="text-xs text-muted-foreground">Active</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><Users className="h-8 w-8 text-primary" /><div><p className="text-2xl font-bold">{stats?.prospects ?? 0}</p><p className="text-xs text-muted-foreground">Prospects</p></div></CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-destructive" /><div><p className="text-2xl font-bold">{stats?.negotiating ?? 0}</p><p className="text-xs text-muted-foreground">In Negotiation</p></div></CardContent></Card>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input className="pl-8 h-9 text-sm" placeholder="Search firms..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stateFilter} onValueChange={v => { setStateFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[110px] h-9 text-sm"><SelectValue placeholder="State" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={sizeFilter} onValueChange={v => { setSizeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px] h-9 text-sm"><SelectValue placeholder="Firm Size" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sizes</SelectItem>
            {FIRM_SIZES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={practiceFilter} onValueChange={v => { setPracticeFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px] h-9 text-sm"><SelectValue placeholder="Practice Area" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Practice Areas</SelectItem>
            {PRACTICE_AREAS.map(pa => <SelectItem key={pa} value={pa} className="capitalize">{pa.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        {role === "admin" && (
          <Select value={repFilter} onValueChange={v => { setRepFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[140px] h-9 text-sm"><SelectValue placeholder="Rep" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reps</SelectItem>
              {salesReps?.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name || r.id.slice(0, 8)}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Bulk Actions */}
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
            <DropdownMenuContent>{STATUSES.map(s => (<DropdownMenuItem key={s} onClick={() => bulkChangeStatus.mutate(s)} className="capitalize">{s.replace(/_/g, " ")}</DropdownMenuItem>))}</DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate("/batch-send")}><FileText className="h-3 w-3 mr-1" />Send Document</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={async () => {
            const ids = Array.from(selectedIds);
            let count = 0;
            for (const lid of ids) {
              const { data: docs } = await (supabase.from("law_firm_documents" as any).select("id, status").eq("law_firm_id", lid).in("status", ["sent", "pending"]) as any);
              if (!docs || docs.length === 0) continue;
              const { data: firm } = await (supabase.from("law_firms" as any).select("contact_email").eq("id", lid).single() as any);
              if (!firm?.contact_email) continue;
              const { data: prof } = await supabase.from("profiles").select("id").eq("email", firm.contact_email).maybeSingle();
              if (!prof) continue;
              await supabase.from("notifications").insert({ user_id: prof.id, title: "Reminder: Documents awaiting your signature", message: `You have documents pending your signature.`, type: "warning", link: "/lf/documents" });
              count++;
            }
            toast.success(`Sent reminders to ${count} firm(s)`);
          }}><Bell className="h-3 w-3 mr-1" />Send Reminder</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
            const ids = Array.from(selectedIds);
            const selected = firms.filter((f: any) => ids.includes(f.id));
            const headers = ["Firm Name", "Contact Name", "Contact Email", "City", "State", "Status", "Firm Size", "Practice Areas", "Rep", "Monthly Fee"];
            const rows = selected.map((f: any) => [
              f.firm_name, f.contact_name || "", f.contact_email || "", f.city || "", f.state || "",
              f.status || "", f.firm_size?.replace(/_/g, " ") || "", (f.practice_areas || []).join("; "),
              f.rep_name || "", f.monthly_amount != null ? `$${Number(f.monthly_amount).toFixed(0)}` : "",
            ]);
            downloadCSV("selected-law-firms.csv", headers, rows);
            toast.success(`Exported ${selected.length} law firms`);
          }}><Download className="h-3 w-3 mr-1" />Export Selected</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground ml-auto" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-10"><Checkbox checked={firms.length > 0 && selectedIds.size === firms.length} onCheckedChange={toggleAll} /></TableHead>
              <TableHead className="cursor-pointer font-medium text-xs uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("firm_name")}><span className="flex items-center">Firm Name<SortIcon field="firm_name" /></span></TableHead>
              <TableHead className="cursor-pointer font-medium text-xs uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("city")}><span className="flex items-center">Location<SortIcon field="city" /></span></TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Size</TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Practice Areas</TableHead>
              <TableHead className="cursor-pointer font-medium text-xs uppercase tracking-wider text-muted-foreground" onClick={() => handleSort("status")}><span className="flex items-center">Status<SortIcon field="status" /></span></TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Rep</TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground text-center">Contracts</TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground text-right">Monthly Fee</TableHead>
              <TableHead className="font-medium text-xs uppercase tracking-wider text-muted-foreground">Last Activity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={10} className="p-0"><TableSkeleton rows={10} cols={10} /></TableCell></TableRow>
            ) : firms.length > 0 ? (
              firms.map((firm: any) => {
                const signedDocs = Number(firm.signed_docs ?? 0);
                return (
                  <TableRow key={firm.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/law-firms/${firm.id}`)}>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(firm.id)} onCheckedChange={() => toggleSelect(firm.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{firm.firm_name}</div>
                      {firm.contact_name && <div className="text-xs text-muted-foreground">{firm.contact_name}</div>}
                    </TableCell>
                    <TableCell className="text-sm">{[firm.city, firm.state].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell>
                      {firm.firm_size ? (
                        <Badge variant="outline" className="text-xs">{FIRM_SIZES.find(s => s.value === firm.firm_size)?.label || firm.firm_size}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(firm.practice_areas || []).slice(0, 2).map((pa: string) => (
                          <Badge key={pa} variant="outline" className="text-[10px] capitalize">{pa.replace(/_/g, " ")}</Badge>
                        ))}
                        {(firm.practice_areas || []).length > 2 && <Badge variant="outline" className="text-[10px]">+{firm.practice_areas.length - 2}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[firm.status] || ""} variant="secondary">{firm.status?.replace(/_/g, " ")}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{firm.rep_name || "—"}</TableCell>
                    <TableCell className="text-sm text-center">{signedDocs || "—"}</TableCell>
                    <TableCell className="text-sm text-right">{firm.monthly_amount != null ? `$${Number(firm.monthly_amount).toFixed(0)}` : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{firm.last_activity_at ? timeAgo(firm.last_activity_at) : "—"}</TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow><TableCell colSpan={10} className="p-0">
                <EmptyState icon="law-firms" title="No law firms found" description="No law firms match your filters. Add your first law firm partner to get started." compact />
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <PaginationControls
          page={page}
          pageSize={pageSize}
          total={total}
          onPrev={() => setPage(p => Math.max(0, p - 1))}
          onNext={() => setPage(p => p + 1)}
          onFirst={() => setPage(0)}
          onLast={() => setPage(Math.ceil(total / pageSize) - 1)}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Import Wizard */}
      <CSVImportWizard
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Law Firms"
        fields={LAW_FIRM_IMPORT_FIELDS}
        onImport={async (rows) => {
          if (rows.length === 0) return { imported: 0, skipped: 0 };
          // Rebuild mapped rows into a CSV file for the FastAPI bulk-import endpoint.
          const headers = Object.keys(rows[0]);
          const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
          const csv = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h] ?? "")).join(","))].join("\n");
          const file = new File([csv], "law-firms-import.csv", { type: "text/csv" });
          try {
            const job = await importLawFirmsCsv(file);
            // Poll until terminal status (capped at ~2 minutes).
            let status = job.status;
            let result: any = null;
            let errors: Array<{ row_index?: number; reason: string }> | undefined;
            let total = job.total_items ?? rows.length;
            for (let i = 0; i < 60 && status !== "completed" && status !== "failed"; i++) {
              await new Promise(r => setTimeout(r, 2000));
              const js = await getJobStatus(job.job_id);
              status = js.status;
              result = js.result ?? result;
              errors = js.errors ?? errors;
              if (js.total_items != null) total = js.total_items;
            }
            const imported = Number((result as any)?.imported ?? 0);
            const skipped = Number((result as any)?.skipped ?? (errors?.length ?? (status === "failed" ? total : 0)));
            queryClient.invalidateQueries({ queryKey: ["v-law-firm-list"] });
            queryClient.invalidateQueries({ queryKey: ["law-firm-stats"] });
            return { imported, skipped };
          } catch (e: any) {
            toast.error(e?.message || "Import failed");
            return { imported: 0, skipped: rows.length };
          }
        }}
      />

      {/* Bulk Update Wizard */}
      <BulkUpdateWizard
        open={bulkUpdateOpen}
        onOpenChange={setBulkUpdateOpen}
        title="Bulk Update Law Firms"
        matchFields={["id", "firm_name"]}
        onUpdate={async (rows) => {
          let updated = 0, notFound = 0;
          for (const row of rows) {
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
            const matchCol = Object.keys(row).find(k => normalize(k) === "id") || Object.keys(row).find(k => normalize(k) === "firmname");
            if (!matchCol) { notFound++; continue; }
            const matchVal = row[matchCol];
            const updateData: Record<string, any> = {};
            Object.entries(row).forEach(([k, v]) => {
              if (k === matchCol || !v) return;
              const nk = k.toLowerCase().replace(/[^a-z0-9_]/g, "");
              if (["status", "state", "city", "firm_size", "contact_name", "contact_email", "contact_phone", "notes", "assigned_sales_rep"].includes(nk)) {
                updateData[nk] = v;
              }
            });
            if (Object.keys(updateData).length === 0) { notFound++; continue; }
            let query;
            if (normalize(matchCol) === "id") {
              query = (supabase.from("law_firms" as any).update(updateData).eq("id", matchVal) as any);
            } else {
              query = (supabase.from("law_firms" as any).update(updateData).eq("firm_name", matchVal) as any);
            }
            const { error } = await query;
            if (error) notFound++; else updated++;
          }
          queryClient.invalidateQueries({ queryKey: ["v-law-firm-list"] });
          return { updated, notFound };
        }}
      />
    </div>
  );
}
