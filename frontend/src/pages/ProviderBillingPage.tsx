import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CreditCard, ChevronDown, ChevronUp, MapPin, Calendar, DollarSign,
  AlertTriangle, CheckCircle, ArrowUpRight, Star,
} from "lucide-react";
import { toast } from "sonner";

const tierBadge: Record<string, string> = {
  ASSOCIATE: "bg-blue-500/10 text-blue-700 border-blue-300",
  MEMBER: "bg-amber-500/10 text-amber-700 border-amber-300",
  PREMIER: "bg-purple-500/10 text-purple-700 border-purple-300",
};

const statusBadge: Record<string, string> = {
  active: "bg-green-500/10 text-green-700",
  past_due: "bg-destructive/10 text-destructive",
  suspended: "bg-orange-500/10 text-orange-700",
  pending: "bg-yellow-500/10 text-yellow-700",
  cancelled: "bg-muted text-muted-foreground",
  grace_period: "bg-yellow-500/10 text-yellow-700",
};

const invoiceStatusColor: Record<string, string> = {
  paid: "bg-green-500/10 text-green-700",
  sent: "bg-blue-500/10 text-blue-700",
  pending: "bg-yellow-500/10 text-yellow-700",
  past_due: "bg-orange-500/10 text-orange-700",
  void: "bg-muted text-muted-foreground",
  partial: "bg-purple-500/10 text-purple-700",
  draft: "bg-muted text-muted-foreground",
};

export default function ProviderBillingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [planOpen, setPlanOpen] = useState(false);
  const [invoiceFilter, setInvoiceFilter] = useState("all");

  // Get provider record for current user
  const { data: provider } = useQuery({
    queryKey: ["my-provider-record"],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user!.id)
        .maybeSingle();
      if (!profile?.email) return null;
      const { data } = await supabase
        .from("providers")
        .select("*")
        .eq("contact_email", profile.email)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Subscription
  const { data: subscription } = useQuery({
    queryKey: ["my-subscription", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("*, specialty_categories(name, short_code), membership_tiers(name, short_code, features)")
        .eq("provider_id", provider!.id)
        .in("status", ["active", "past_due", "grace_period", "pending", "suspended"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!provider?.id,
  });

  // Locations
  const { data: locations } = useQuery({
    queryKey: ["my-locations", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_locations")
        .select("*, geographic_markets(name)")
        .eq("provider_id", provider!.id)
        .eq("is_active", true)
        .order("is_primary", { ascending: false });
      return data ?? [];
    },
    enabled: !!provider?.id,
  });

  // Location rates
  const { data: locationRates } = useQuery({
    queryKey: ["my-location-rates", provider?.id, subscription?.category_id, subscription?.tier_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("rate_cards")
        .select("*")
        .eq("category_id", subscription!.category_id)
        .eq("tier_id", subscription!.tier_id)
        .eq("is_active", true);
      return data ?? [];
    },
    enabled: !!subscription?.category_id && !!subscription?.tier_id,
  });

  // Discount tiers
  const { data: discountConfig } = useQuery({
    queryKey: ["discount-tiers-provider"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_config")
        .select("settings")
        .eq("feature_name", "multi_location_discounts")
        .maybeSingle();
      return (data?.settings as any)?.tiers ?? [];
    },
  });

  // Invoices
  const { data: invoices } = useQuery({
    queryKey: ["my-invoices", provider?.id, invoiceFilter],
    queryFn: async () => {
      let q = supabase
        .from("invoices")
        .select("*")
        .eq("provider_id", provider!.id)
        .order("created_at", { ascending: false });
      if (invoiceFilter === "unpaid") q = q.in("status", ["pending", "sent", "past_due", "partial"]);
      if (invoiceFilter === "paid") q = q.eq("status", "paid");
      const { data } = await q;
      return data ?? [];
    },
    enabled: !!provider?.id,
  });

  // Payments
  const { data: payments } = useQuery({
    queryKey: ["my-payments", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("*, invoices(invoice_number)")
        .eq("provider_id", provider!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!provider?.id,
  });

  // Credits
  const { data: credits } = useQuery({
    queryKey: ["my-credits", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("billing_credits")
        .select("*")
        .eq("provider_id", provider!.id)
        .eq("status", "available");
      return data ?? [];
    },
    enabled: !!provider?.id,
  });

  // Upgrade mutation
  const upgradeMutation = useMutation({
    mutationFn: async (nextTier: string) => {
      const { error } = await supabase.from("support_tickets").insert({
        provider_id: provider!.id,
        subject: `Membership Upgrade Request — ${nextTier}`,
        description: `Provider is requesting an upgrade to ${nextTier} tier.`,
        category: "billing",
        priority: "medium",
      });
      if (error) throw error;
    },
    onSuccess: () => toast.success("Upgrade request submitted! Your account representative will be in touch."),
    onError: () => toast.error("Failed to submit upgrade request"),
  });

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const tier = subscription?.membership_tiers as any;
  const category = subscription?.specialty_categories as any;
  const features: string[] = tier?.features ?? [];
  const tierCode = tier?.short_code ?? "";
  const nextTierName = tierCode === "ASSOCIATE" ? "Member" : tierCode === "MEMBER" ? "Premier" : null;

  const pastDueInvoices = (invoices ?? []).filter((i: any) => i.status === "past_due");
  const pastDueTotal = pastDueInvoices.reduce((s: number, i: any) => s + Number(i.total_amount), 0);

  const totalCredits = (credits ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);

  // Calculate location breakdown
  const locationBreakdown = (locations ?? []).map((loc: any, idx: number) => {
    const rate = locationRates?.find((r: any) => r.market_id === loc.market_id);
    const baseRate = rate ? Number(rate.monthly_rate) : 0;
    const position = idx + 1;
    const dt = (discountConfig ?? []).find(
      (t: any) => position >= t.min_locations && (t.max_locations === null || position <= t.max_locations)
    );
    const discountPct = dt?.discount_percentage === 100 ? 55 : (dt?.discount_percentage ?? 0);
    const lineTotal = Math.round(baseRate * (1 - discountPct / 100) * 100) / 100;
    return {
      ...loc,
      marketName: (loc.geographic_markets as any)?.name ?? "—",
      baseRate,
      discountPct,
      lineTotal,
    };
  }).sort((a: any, b: any) => b.baseRate - a.baseRate);

  const locTotal = locationBreakdown.reduce((s: number, l: any) => s + l.lineTotal, 0);

  if (!provider) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <p>Loading billing information…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold">Billing</h1>

      {/* Suspension Banner */}
      {subscription?.status === "suspended" && (
        <Alert variant="destructive" className="border-destructive bg-destructive/5">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="font-medium">
            Your membership is currently suspended due to an outstanding balance. Please contact billing to restore access.
          </AlertDescription>
        </Alert>
      )}

      {/* Past Due Alert */}
      {pastDueTotal > 0 && subscription?.status !== "suspended" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You have an outstanding balance of <strong>{fmt(pastDueTotal)}</strong>. Please contact billing to resolve.
          </AlertDescription>
        </Alert>
      )}

      {/* Credits Banner */}
      {totalCredits > 0 && (
        <Alert>
          <CreditCard className="h-4 w-4" />
          <AlertDescription>
            You have <strong>{fmt(totalCredits)}</strong> in account credits that will be applied to your next invoice.
          </AlertDescription>
        </Alert>
      )}

      {/* SECTION 1 — Membership Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            Your Network Membership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Membership Tier</p>
                  <Badge className={`mt-1 ${tierBadge[tierCode] ?? ""}`}>{tier?.name ?? "—"}</Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Specialty</p>
                  <p className="font-medium mt-1">{category?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Monthly Fee</p>
                  <p className="text-xl font-bold mt-1">{fmt(Number(subscription.monthly_amount))}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Status</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Badge variant="secondary" className={`${statusBadge[subscription.status] ?? ""}`}>
                      {subscription.status.replace("_", " ")}
                    </Badge>
                    {subscription.trial_ends_at && new Date(subscription.trial_ends_at) > new Date() && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-300 text-xs">
                        Trial ends {new Date(subscription.trial_ends_at).toLocaleDateString()}
                      </Badge>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Next Billing Date</p>
                  <p className="font-medium mt-1 flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {subscription.next_billing_date ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-medium">Member Since</p>
                  <p className="font-medium mt-1">
                    {subscription.started_at ? new Date(subscription.started_at).toLocaleDateString() : "—"}
                  </p>
                </div>
                {(locations?.length ?? 0) > 1 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase font-medium">Locations</p>
                    <p className="font-medium mt-1 flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {locations?.length} Locations
                    </p>
                  </div>
                )}
              </div>

              {/* Plan Details */}
              <Collapsible open={planOpen} onOpenChange={setPlanOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full justify-between mt-2">
                    View Plan Details
                    {planOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  <p className="text-sm font-medium">Features included in {tier?.name}:</p>
                  <ul className="space-y-1.5">
                    {features.map((f: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {nextTierName && (
                    <Button
                      variant="link"
                      size="sm"
                      className="p-0 h-auto text-primary"
                      onClick={() => upgradeMutation.mutate(nextTierName)}
                      disabled={upgradeMutation.isPending}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                      Upgrade to {nextTierName}
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </>
          ) : (
            <p className="text-muted-foreground">No active membership found. Contact your account representative for details.</p>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2 — Location Breakdown */}
      {locationBreakdown.length > 1 && !subscription?.is_enterprise && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5" />Location Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Location</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                  <TableHead className="text-right">Monthly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationBreakdown.map((loc: any) => (
                  <TableRow key={loc.id}>
                    <TableCell className="font-medium">{loc.location_name || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{loc.city}, {loc.state}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{loc.marketName}</Badge></TableCell>
                    <TableCell className="text-right">{fmt(loc.baseRate)}</TableCell>
                    <TableCell className="text-right">{loc.discountPct > 0 ? `${loc.discountPct}%` : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(loc.lineTotal)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell colSpan={5} className="font-bold text-right">Total</TableCell>
                  <TableCell className="text-right font-bold">{fmt(locTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground mt-3">To update your locations or billing, contact your account representative.</p>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3 — Invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2"><DollarSign className="h-5 w-5" />Invoices</CardTitle>
          <Select value={invoiceFilter} onValueChange={setInvoiceFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Paid Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).map((inv: any) => (
                <TableRow
                  key={inv.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/billing/${inv.id}`)}
                >
                  <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                  <TableCell className="text-xs">{inv.billing_period_start} – {inv.billing_period_end}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(Number(inv.total_amount))}</TableCell>
                  <TableCell><Badge variant="secondary" className={invoiceStatusColor[inv.status] ?? ""}>{inv.status.replace("_", " ")}</Badge></TableCell>
                  <TableCell className="text-xs">{inv.due_date}</TableCell>
                  <TableCell className="text-xs">{inv.paid_date ?? "—"}</TableCell>
                </TableRow>
              ))}
              {(invoices ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No invoices yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* SECTION 4 — Payment History */}
      {(payments ?? []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5" />Payment History</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(payments ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{p.processed_at ? new Date(p.processed_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(Number(p.amount))}</TableCell>
                    <TableCell className="capitalize text-sm">{p.payment_method?.replace("_", " ")}</TableCell>
                    <TableCell className="font-mono text-xs">{p.payment_reference ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{(p.invoices as any)?.invoice_number ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
