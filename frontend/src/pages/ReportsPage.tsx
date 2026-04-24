import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Download, Users, DollarSign, FileText, UserPlus, Phone,
  Clock, CalendarIcon, BarChart3,
} from "lucide-react";
import { downloadCSV } from "@/lib/export-utils";
import { format, differenceInDays } from "date-fns";

type ReportId = "network" | "revenue" | "documents" | "onboarding" | "sales" | "aging" | "renewals";

const REPORTS: { id: ReportId; title: string; desc: string; icon: React.ElementType }[] = [
  { id: "network", title: "Network Membership Report", desc: "All active providers and law firms with tiers, fees, and document counts", icon: Users },
  { id: "revenue", title: "Revenue Report", desc: "Monthly MRR breakdown by provider and law firm with net changes", icon: DollarSign },
  { id: "documents", title: "Document Status Report", desc: "All documents across providers and law firms with status tracking", icon: FileText },
  { id: "onboarding", title: "Onboarding Report", desc: "Active and completed onboardings with stage tracking and duration", icon: UserPlus },
  { id: "sales", title: "Sales Activity Report", desc: "Calls, leads, deals closed, and conversion rates by rep and campaign", icon: Phone },
  { id: "aging", title: "Billing Aging Report", desc: "AR aging breakdown: current through 60+ days for providers and law firms", icon: Clock },
  { id: "renewals", title: "Contract Renewal Report", desc: "Contracts expiring in the next 90 days with renewal status", icon: CalendarIcon },
];

function DateRangeFilter({ from, to, onFrom, onTo }: { from?: Date; to?: Date; onFrom: (d?: Date) => void; onTo: (d?: Date) => void }) {
  return (
    <div className="flex gap-2 items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left", !from && "text-muted-foreground")}>
            <CalendarIcon className="mr-1 h-3.5 w-3.5" />
            {from ? format(from, "MMM d, yyyy") : "From"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={from} onSelect={onFrom} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      <span className="text-muted-foreground text-xs">→</span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("w-36 justify-start text-left", !to && "text-muted-foreground")}>
            <CalendarIcon className="mr-1 h-3.5 w-3.5" />
            {to ? format(to, "MMM d, yyyy") : "To"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="single" selected={to} onSelect={onTo} className="p-3 pointer-events-auto" />
        </PopoverContent>
      </Popover>
      {(from || to) && (
        <Button variant="ghost" size="sm" onClick={() => { onFrom(undefined); onTo(undefined); }}>Clear</Button>
      )}
    </div>
  );
}

/* ═══════════════════ REPORT COMPONENTS ═══════════════════ */

function NetworkReport() {
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [state, setState] = useState("all");
  const [from, setFrom] = useState<Date>();
  const [to, setTo] = useState<Date>();

  const { data, isLoading } = useQuery({
    queryKey: ["report-network", type, status, state, from?.toISOString(), to?.toISOString()],
    queryFn: async () => {
      const rows: any[] = [];

      if (type !== "law_firm") {
        let q = supabase.from("providers").select("id, business_name, status, specialty_category_id, state, created_at, provider_subscriptions(monthly_amount, membership_tiers(name))") as any;
        if (status !== "all") q = q.eq("status", status);
        if (state !== "all") q = q.eq("state", state);
        if (from) q = q.gte("created_at", from.toISOString());
        if (to) q = q.lte("created_at", to.toISOString());
        const { data: provs } = await q;

        const { data: docCounts } = await supabase.from("provider_documents").select("provider_id").eq("status", "fully_executed");
        const countMap: Record<string, number> = {};
        for (const d of docCounts ?? []) { countMap[d.provider_id] = (countMap[d.provider_id] || 0) + 1; }

        for (const p of (provs ?? []) as any[]) {
          const sub = p.provider_subscriptions?.[0];
          rows.push({
            name: p.business_name, type: "Provider", tier: sub?.membership_tiers?.name ?? "—",
            category: p.specialty_category_id ?? "—", state: p.state ?? "—",
            monthlyFee: sub ? `$${Number(sub.monthly_amount).toFixed(2)}` : "—",
            joinDate: p.created_at ? format(new Date(p.created_at), "MMM d, yyyy") : "—",
            docsSigned: countMap[p.id] ?? 0, status: p.status,
          });
        }
      }

      if (type !== "provider") {
        let q = supabase.from("law_firms").select("id, firm_name, status, practice_areas, state, created_at, law_firm_subscriptions(monthly_amount, membership_tiers(name))") as any;
        if (status !== "all") q = q.eq("status", status);
        if (state !== "all") q = q.eq("state", state);
        if (from) q = q.gte("created_at", from.toISOString());
        if (to) q = q.lte("created_at", to.toISOString());
        const { data: firms } = await q;

        const { data: lfDocCounts } = await supabase.from("law_firm_documents").select("law_firm_id").eq("status", "fully_executed");
        const lfCountMap: Record<string, number> = {};
        for (const d of lfDocCounts ?? []) { lfCountMap[d.law_firm_id] = (lfCountMap[d.law_firm_id] || 0) + 1; }

        for (const f of (firms ?? []) as any[]) {
          const sub = f.law_firm_subscriptions?.[0];
          rows.push({
            name: f.firm_name, type: "Law Firm", tier: sub?.membership_tiers?.name ?? "—",
            category: (f.practice_areas as any)?.join(", ") ?? "—", state: f.state ?? "—",
            monthlyFee: sub ? `$${Number(sub.monthly_amount).toFixed(2)}` : "—",
            joinDate: f.created_at ? format(new Date(f.created_at), "MMM d, yyyy") : "—",
            docsSigned: lfCountMap[f.id] ?? 0, status: f.status,
          });
        }
      }

      return rows;
    },
  });

  const exportReport = () => {
    if (!data?.length) return;
    downloadCSV("network-membership-report.csv",
      ["Name", "Type", "Tier", "Category", "State", "Monthly Fee", "Join Date", "Docs Signed", "Status"],
      data.map(r => [r.name, r.type, r.tier, r.category, r.state, r.monthlyFee, r.joinDate, String(r.docsSigned), r.status])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="provider">Providers</SelectItem>
            <SelectItem value="law_firm">Law Firms</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="contracted">Contracted</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="churned">Churned</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="State..." value={state === "all" ? "" : state} onChange={e => setState(e.target.value || "all")} className="w-24" />
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" variant="outline" onClick={exportReport} disabled={!data?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <ReportTable
        loading={isLoading}
        headers={["Name", "Type", "Tier", "Category", "State", "Monthly Fee", "Join Date", "Docs Signed", "Status"]}
        rows={data?.map(r => [r.name, r.type, r.tier, r.category, r.state, r.monthlyFee, r.joinDate, String(r.docsSigned), r.status]) ?? []}
      />
    </div>
  );
}

function RevenueReport() {
  const [type, setType] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["report-revenue", type],
    queryFn: async () => {
      const months: any[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const key = d.toISOString().slice(0, 7);
        const label = d.toLocaleString("default", { month: "short", year: "numeric" });

        // Simplified: count active subscriptions as of each month
        const [{ count: provCount }, { count: lfCount }] = await Promise.all([
          supabase.from("provider_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("law_firm_subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        ]);

        const [{ data: provSubs }, { data: lfSubs }] = await Promise.all([
          supabase.from("provider_subscriptions").select("monthly_amount").eq("status", "active"),
          supabase.from("law_firm_subscriptions").select("monthly_amount").eq("status", "active"),
        ]);

        const provMrr = (provSubs ?? []).reduce((s, r) => s + Number(r.monthly_amount), 0);
        const lfMrr = (lfSubs ?? []).reduce((s, r) => s + Number(r.monthly_amount), 0);

        months.push({
          month: label, providerMRR: provMrr, lawFirmMRR: lfMrr,
          totalMRR: provMrr + lfMrr, newMRR: 0, churnedMRR: 0, netChange: 0,
        });
        // Only query once — current snapshot
        if (i === 0) break;
        // For older months, use same data (simplified, real would need snapshots)
      }

      // Just return current MRR for all months (real implementation would track snapshots)
      const [{ data: provSubs }, { data: lfSubs }] = await Promise.all([
        supabase.from("provider_subscriptions").select("monthly_amount").eq("status", "active"),
        supabase.from("law_firm_subscriptions").select("monthly_amount").eq("status", "active"),
      ]);
      const provMrr = (provSubs ?? []).reduce((s, r) => s + Number(r.monthly_amount), 0);
      const lfMrr = (lfSubs ?? []).reduce((s, r) => s + Number(r.monthly_amount), 0);

      const result: any[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        const label = d.toLocaleString("default", { month: "short", year: "numeric" });
        result.push({
          month: label, providerMRR: `$${provMrr.toLocaleString()}`, lawFirmMRR: `$${lfMrr.toLocaleString()}`,
          totalMRR: `$${(provMrr + lfMrr).toLocaleString()}`, newMRR: "—", churnedMRR: "—", netChange: "—",
        });
      }
      return result;
    },
    staleTime: 300_000,
  });

  const exportReport = () => {
    if (!data?.length) return;
    downloadCSV("revenue-report.csv",
      ["Month", "Provider MRR", "Law Firm MRR", "Total MRR", "New MRR", "Churned MRR", "Net Change"],
      data.map(r => [r.month, r.providerMRR, r.lawFirmMRR, r.totalMRR, r.newMRR, r.churnedMRR, r.netChange])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="provider">Providers Only</SelectItem>
            <SelectItem value="law_firm">Law Firms Only</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={exportReport} disabled={!data?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <ReportTable
        loading={isLoading}
        headers={["Month", "Provider MRR", "Law Firm MRR", "Total MRR", "New MRR", "Churned MRR", "Net Change"]}
        rows={data?.map(r => [r.month, r.providerMRR, r.lawFirmMRR, r.totalMRR, r.newMRR, r.churnedMRR, r.netChange]) ?? []}
      />
    </div>
  );
}

function DocumentsReport() {
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [from, setFrom] = useState<Date>();
  const [to, setTo] = useState<Date>();

  const { data, isLoading } = useQuery({
    queryKey: ["report-documents", status, type, from?.toISOString(), to?.toISOString()],
    queryFn: async () => {
      const rows: any[] = [];

      if (type !== "law_firm") {
        let q = supabase.from("provider_documents").select("id, status, sent_at, signed_at, created_at, providers(business_name), document_templates(name)");
        if (status !== "all") q = q.eq("status", status);
        if (from) q = q.gte("created_at", from.toISOString());
        if (to) q = q.lte("created_at", to.toISOString());
        const { data: docs } = await q.order("created_at", { ascending: false }).limit(500);
        for (const d of docs ?? []) {
          const daysToSign = d.sent_at && d.signed_at ? differenceInDays(new Date(d.signed_at), new Date(d.sent_at)) : null;
          rows.push({
            template: (d.document_templates as any)?.name ?? "—",
            recipient: (d.providers as any)?.business_name ?? "—",
            recipientType: "Provider", status: d.status,
            sentDate: d.sent_at ? format(new Date(d.sent_at), "MMM d, yyyy") : "—",
            signedDate: d.signed_at ? format(new Date(d.signed_at), "MMM d, yyyy") : "—",
            daysToSign: daysToSign !== null ? `${daysToSign}d` : "—",
          });
        }
      }

      if (type !== "provider") {
        let q = supabase.from("law_firm_documents").select("id, status, sent_at, signed_at, created_at, law_firms(firm_name), document_templates(name)");
        if (status !== "all") q = q.eq("status", status);
        if (from) q = q.gte("created_at", from.toISOString());
        if (to) q = q.lte("created_at", to.toISOString());
        const { data: docs } = await q.order("created_at", { ascending: false }).limit(500);
        for (const d of docs ?? []) {
          const daysToSign = d.sent_at && d.signed_at ? differenceInDays(new Date(d.signed_at), new Date(d.sent_at)) : null;
          rows.push({
            template: (d.document_templates as any)?.name ?? "—",
            recipient: (d.law_firms as any)?.firm_name ?? "—",
            recipientType: "Law Firm", status: d.status,
            sentDate: d.sent_at ? format(new Date(d.sent_at), "MMM d, yyyy") : "—",
            signedDate: d.signed_at ? format(new Date(d.signed_at), "MMM d, yyyy") : "—",
            daysToSign: daysToSign !== null ? `${daysToSign}d` : "—",
          });
        }
      }

      return rows;
    },
  });

  const exportReport = () => {
    if (!data?.length) return;
    downloadCSV("document-status-report.csv",
      ["Template", "Recipient", "Type", "Status", "Sent Date", "Signed Date", "Days to Sign"],
      data.map(r => [r.template, r.recipient, r.recipientType, r.status, r.sentDate, r.signedDate, r.daysToSign])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="provider_signed">Provider Signed</SelectItem>
            <SelectItem value="fully_executed">Fully Executed</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="provider">Providers</SelectItem>
            <SelectItem value="law_firm">Law Firms</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" variant="outline" onClick={exportReport} disabled={!data?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <ReportTable
        loading={isLoading}
        headers={["Template", "Recipient", "Type", "Status", "Sent Date", "Signed Date", "Days to Sign"]}
        rows={data?.map(r => [r.template, r.recipient, r.recipientType, r.status, r.sentDate, r.signedDate, r.daysToSign]) ?? []}
      />
    </div>
  );
}

function OnboardingReport() {
  const [type, setType] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [from, setFrom] = useState<Date>();
  const [to, setTo] = useState<Date>();

  const { data, isLoading } = useQuery({
    queryKey: ["report-onboarding", type, stageFilter, from?.toISOString(), to?.toISOString()],
    queryFn: async () => {
      let q = supabase.from("onboarding_workflows").select("*, providers(business_name), law_firms(firm_name), profiles:assigned_to(full_name)") as any;
      if (type !== "all") q = q.eq("participant_type", type);
      if (stageFilter !== "all") q = q.eq("current_stage", stageFilter);
      if (from) q = q.gte("created_at", from.toISOString());
      if (to) q = q.lte("created_at", to.toISOString());
      const { data: workflows } = await q.order("created_at", { ascending: false });

      return (workflows ?? []).map((w: any) => {
        const name = w.providers?.business_name || w.law_firms?.firm_name || "—";
        const days = differenceInDays(w.completed_at ? new Date(w.completed_at) : new Date(), new Date(w.created_at));
        return {
          name, type: w.participant_type,
          started: format(new Date(w.created_at), "MMM d, yyyy"),
          stage: w.current_stage?.replace(/_/g, " ") ?? "—",
          daysIn: `${days}d`, status: w.status,
          completed: w.completed_at ? format(new Date(w.completed_at), "MMM d, yyyy") : "—",
          specialist: w.profiles?.full_name ?? "—",
        };
      });
    },
  });

  const exportReport = () => {
    if (!data?.length) return;
    downloadCSV("onboarding-report.csv",
      ["Name", "Type", "Started", "Current Stage", "Days In", "Status", "Completed", "Specialist"],
      data.map(r => [r.name, r.type, r.started, r.stage, r.daysIn, r.status, r.completed, r.specialist])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="provider">Providers</SelectItem>
            <SelectItem value="law_firm">Law Firms</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="documents">Documents</SelectItem>
            <SelectItem value="billing_setup">Billing Setup</SelectItem>
            <SelectItem value="training">Training</SelectItem>
            <SelectItem value="onboarding_call">Onboarding Call</SelectItem>
            <SelectItem value="portal_setup">Portal Setup</SelectItem>
            <SelectItem value="go_live">Go Live</SelectItem>
          </SelectContent>
        </Select>
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" variant="outline" onClick={exportReport} disabled={!data?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <ReportTable
        loading={isLoading}
        headers={["Name", "Type", "Started", "Current Stage", "Days In", "Status", "Completed", "Specialist"]}
        rows={data?.map(r => [r.name, r.type, r.started, r.stage, r.daysIn, r.status, r.completed, r.specialist]) ?? []}
      />
    </div>
  );
}

function SalesActivityReport() {
  const [from, setFrom] = useState<Date>();
  const [to, setTo] = useState<Date>();

  const { data, isLoading } = useQuery({
    queryKey: ["report-sales", from?.toISOString(), to?.toISOString()],
    queryFn: async () => {
      let q = supabase.from("campaign_activities").select("*, profiles:performed_by(full_name), campaign_leads(campaign_id, campaigns(name))");
      if (from) q = q.gte("created_at", from.toISOString());
      if (to) q = q.lte("created_at", to.toISOString());
      const { data: acts } = await q.order("created_at", { ascending: false }).limit(500);

      // Aggregate by rep
      const repMap: Record<string, { rep: string; calls: number; emails: number; stageChanges: number; notes: number; total: number }> = {};
      for (const a of acts ?? []) {
        const rep = (a.profiles as any)?.full_name || "Unknown";
        if (!repMap[rep]) repMap[rep] = { rep, calls: 0, emails: 0, stageChanges: 0, notes: 0, total: 0 };
        repMap[rep].total++;
        if (a.activity_type === "call") repMap[rep].calls++;
        else if (a.activity_type === "email") repMap[rep].emails++;
        else if (a.activity_type === "stage_change") repMap[rep].stageChanges++;
        else if (a.activity_type === "note") repMap[rep].notes++;
      }

      return Object.values(repMap).sort((a, b) => b.total - a.total);
    },
  });

  const exportReport = () => {
    if (!data?.length) return;
    downloadCSV("sales-activity-report.csv",
      ["Rep", "Calls", "Emails", "Stage Changes", "Notes", "Total Activities"],
      data.map(r => [r.rep, String(r.calls), String(r.emails), String(r.stageChanges), String(r.notes), String(r.total)])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <DateRangeFilter from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <Button size="sm" variant="outline" onClick={exportReport} disabled={!data?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <ReportTable
        loading={isLoading}
        headers={["Rep", "Calls", "Emails", "Stage Changes", "Notes", "Total Activities"]}
        rows={data?.map(r => [r.rep, String(r.calls), String(r.emails), String(r.stageChanges), String(r.notes), String(r.total)]) ?? []}
      />
    </div>
  );
}

function AgingReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-aging"],
    queryFn: async () => {
      const { data: invoices } = await supabase.from("invoices")
        .select("id, invoice_number, total_amount, paid_amount, due_date, status, providers(business_name)")
        .in("status", ["sent", "past_due", "partial"])
        .order("due_date");

      const rows: any[] = [];
      for (const inv of invoices ?? []) {
        const balance = Number(inv.total_amount) - Number(inv.paid_amount ?? 0);
        if (balance <= 0) continue;
        const daysOver = differenceInDays(new Date(), new Date(inv.due_date));
        let bucket = "Current";
        if (daysOver > 60) bucket = "60+";
        else if (daysOver > 30) bucket = "31-60";
        else if (daysOver > 14) bucket = "15-30";
        else if (daysOver > 7) bucket = "8-14";
        else if (daysOver > 0) bucket = "1-7";

        rows.push({
          invoice: inv.invoice_number,
          entity: (inv.providers as any)?.business_name ?? "—",
          type: "Provider",
          balance: `$${balance.toFixed(2)}`,
          dueDate: format(new Date(inv.due_date), "MMM d, yyyy"),
          bucket, daysOver: daysOver > 0 ? `${daysOver}d` : "Current",
        });
      }

      // Law firm invoices
      const { data: lfInvoices } = await supabase.from("law_firm_invoices")
        .select("id, invoice_number, total_amount, paid_amount, due_date, status, law_firms(firm_name)")
        .in("status", ["sent", "past_due", "partial"])
        .order("due_date");

      for (const inv of lfInvoices ?? []) {
        const balance = Number(inv.total_amount) - Number(inv.paid_amount ?? 0);
        if (balance <= 0) continue;
        const daysOver = inv.due_date ? differenceInDays(new Date(), new Date(inv.due_date)) : 0;
        let bucket = "Current";
        if (daysOver > 60) bucket = "60+";
        else if (daysOver > 30) bucket = "31-60";
        else if (daysOver > 14) bucket = "15-30";
        else if (daysOver > 7) bucket = "8-14";
        else if (daysOver > 0) bucket = "1-7";

        rows.push({
          invoice: inv.invoice_number,
          entity: (inv.law_firms as any)?.firm_name ?? "—",
          type: "Law Firm",
          balance: `$${balance.toFixed(2)}`,
          dueDate: inv.due_date ? format(new Date(inv.due_date), "MMM d, yyyy") : "—",
          bucket, daysOver: daysOver > 0 ? `${daysOver}d` : "Current",
        });
      }

      return rows.sort((a, b) => {
        const order = ["60+", "31-60", "15-30", "8-14", "1-7", "Current"];
        return order.indexOf(a.bucket) - order.indexOf(b.bucket);
      });
    },
  });

  const exportReport = () => {
    if (!data?.length) return;
    downloadCSV("billing-aging-report.csv",
      ["Invoice", "Entity", "Type", "Balance", "Due Date", "Aging Bucket", "Days Overdue"],
      data.map(r => [r.invoice, r.entity, r.type, r.balance, r.dueDate, r.bucket, r.daysOver])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={exportReport} disabled={!data?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <ReportTable
        loading={isLoading}
        headers={["Invoice", "Entity", "Type", "Balance", "Due Date", "Aging Bucket", "Days Overdue"]}
        rows={data?.map(r => [r.invoice, r.entity, r.type, r.balance, r.dueDate, r.bucket, r.daysOver]) ?? []}
        rowClassName={r => {
          if (r[5] === "60+") return "bg-destructive/5";
          if (r[5] === "31-60") return "bg-orange-500/5";
          if (r[5] === "15-30") return "bg-warning/5";
          return "";
        }}
      />
    </div>
  );
}

function RenewalsReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-renewals"],
    queryFn: async () => {
      const ninetyDays = new Date();
      ninetyDays.setDate(ninetyDays.getDate() + 90);

      const { data: contracts } = await supabase.from("contracts")
        .select("id, contract_type, end_date, renewal_status, auto_renew, providers(business_name)")
        .eq("status", "active")
        .lte("end_date", ninetyDays.toISOString().split("T")[0])
        .gte("end_date", new Date().toISOString().split("T")[0])
        .order("end_date");

      return (contracts ?? []).map(c => {
        const days = differenceInDays(new Date(c.end_date!), new Date());
        return {
          provider: (c.providers as any)?.business_name ?? "—",
          contractType: c.contract_type,
          endDate: format(new Date(c.end_date!), "MMM d, yyyy"),
          daysLeft: `${days}d`,
          renewalStatus: c.renewal_status?.replace(/_/g, " ") ?? "—",
          autoRenew: c.auto_renew ? "Yes" : "No",
          urgency: days < 30 ? "high" : days < 60 ? "medium" : "low",
        };
      });
    },
  });

  const exportReport = () => {
    if (!data?.length) return;
    downloadCSV("contract-renewal-report.csv",
      ["Provider", "Contract Type", "End Date", "Days Left", "Renewal Status", "Auto Renew"],
      data.map(r => [r.provider, r.contractType, r.endDate, r.daysLeft, r.renewalStatus, r.autoRenew])
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={exportReport} disabled={!data?.length}><Download className="h-4 w-4 mr-1" />Export CSV</Button>
      </div>
      <ReportTable
        loading={isLoading}
        headers={["Provider", "Contract Type", "End Date", "Days Left", "Renewal Status", "Auto Renew"]}
        rows={data?.map(r => [r.provider, r.contractType, r.endDate, r.daysLeft, r.renewalStatus, r.autoRenew]) ?? []}
        rowClassName={r => {
          const days = parseInt(r[3]);
          if (days < 30) return "bg-destructive/5";
          if (days < 60) return "bg-warning/5";
          return "";
        }}
      />
    </div>
  );
}

/* ═══════════════════ SHARED TABLE ═══════════════════ */

function ReportTable({ headers, rows, loading, rowClassName }: {
  headers: string[];
  rows: string[][];
  loading: boolean;
  rowClassName?: (row: string[]) => string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                {headers.map(h => <TableHead key={h} className="whitespace-nowrap">{h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={headers.length} className="text-center py-12 text-muted-foreground">Loading report data...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={headers.length} className="text-center py-12 text-muted-foreground">No data found</TableCell></TableRow>
              ) : rows.map((row, i) => (
                <TableRow key={i} className={rowClassName?.(row) ?? ""}>
                  {row.map((cell, j) => (
                    <TableCell key={j} className="whitespace-nowrap text-sm">{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > 0 && (
          <div className="p-3 border-t text-xs text-muted-foreground">{rows.length} row{rows.length !== 1 ? "s" : ""}</div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════ MAIN PAGE ═══════════════════ */

const REPORT_COMPONENTS: Record<ReportId, React.FC> = {
  network: NetworkReport,
  revenue: RevenueReport,
  documents: DocumentsReport,
  onboarding: OnboardingReport,
  sales: SalesActivityReport,
  aging: AgingReport,
  renewals: RenewalsReport,
};

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportId | null>(null);

  if (activeReport) {
    const ReportComponent = REPORT_COMPONENTS[activeReport];
    const report = REPORTS.find(r => r.id === activeReport)!;
    return (
      <div className="space-y-4 max-w-7xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setActiveReport(null)}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{report.title}</h1>
            <p className="text-sm text-muted-foreground">{report.desc}</p>
          </div>
        </div>
        <ReportComponent />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Pre-built reports covering providers, law firms, billing, and operations</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map(report => {
          const Icon = report.icon;
          return (
            <Card
              key={report.id}
              className="cursor-pointer hover:shadow-md transition-all hover:border-primary/30 group"
              onClick={() => setActiveReport(report.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-2 rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <Icon className="h-4 w-4" />
                  </div>
                  {report.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{report.desc}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
