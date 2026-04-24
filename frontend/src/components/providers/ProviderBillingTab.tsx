import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DollarSign, MapPin, Save, Plus, Building, AlertTriangle, CreditCard, 
  Play, Pause, XCircle, Gift, Clock, Calendar, CheckCircle2, AlertCircle,
  FileText, Receipt
} from "lucide-react";
import { toast } from "sonner";
import { calculateProviderBilling, type BillingCalculation, type DiscountTier, fetchDiscountTiers } from "@/lib/billing-calculator";

interface ProviderBillingTabProps {
  providerId: string;
  provider: any;
}

const subscriptionStatusColors: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  active: "bg-success/10 text-success",
  past_due: "bg-destructive/10 text-destructive",
  suspended: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/10 text-destructive",
  grace_period: "bg-warning/10 text-warning",
};

export default function ProviderBillingTab({ providerId, provider }: ProviderBillingTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Form state
  const [categoryId, setCategoryId] = useState(provider.specialty_category_id ?? "");
  const [tierId, setTierId] = useState(provider.membership_tier_id ?? "");
  const [isEnterprise, setIsEnterprise] = useState(provider.is_enterprise ?? false);
  const [billingDay, setBillingDay] = useState(1);
  const [saving, setSaving] = useState(false);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelNotes, setCancelNotes] = useState("");
  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");

  // New location form
  const [newLoc, setNewLoc] = useState({ location_name: "", address_line1: "", city: "", state: "", zip_code: "", market_id: "" });

  // Reference data queries
  const { data: categories } = useQuery({
    queryKey: ["specialty-categories"],
    queryFn: async () => {
      const { data } = await supabase.from("specialty_categories").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: tiers } = useQuery({
    queryKey: ["membership-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("membership_tiers").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: markets } = useQuery({
    queryKey: ["geographic-markets"],
    queryFn: async () => {
      const { data } = await supabase.from("geographic_markets").select("*").eq("is_active", true).order("display_order");
      return data ?? [];
    },
  });

  const { data: locations, refetch: refetchLocations } = useQuery({
    queryKey: ["provider-locations", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_locations")
        .select("*, geographic_markets(name, short_code)")
        .eq("provider_id", providerId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false });
      return data ?? [];
    },
  });

  const { data: subscription, refetch: refetchSub } = useQuery({
    queryKey: ["provider-subscription", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_subscriptions")
        .select("*")
        .eq("provider_id", providerId)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const { data: rateCards } = useQuery({
    queryKey: ["rate-cards"],
    queryFn: async () => {
      const { data } = await supabase.from("rate_cards").select("*").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: enterpriseRates } = useQuery({
    queryKey: ["enterprise-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("enterprise_rates").select("*").eq("is_active", true);
      return data ?? [];
    },
  });

  const { data: discountTiers } = useQuery({
    queryKey: ["discount-schedule"],
    queryFn: fetchDiscountTiers,
  });

  const { data: payments } = useQuery({
    queryKey: ["provider-payments", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("provider_id", providerId).eq("status", "completed");
      return data ?? [];
    },
  });

  const { data: credits } = useQuery({
    queryKey: ["provider-credits", providerId],
    queryFn: async () => {
      const { data } = await supabase.from("billing_credits").select("*").eq("provider_id", providerId).eq("status", "available");
      return data ?? [];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["provider-invoices", providerId],
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("*")
        .eq("provider_id", providerId)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  // Sync form from provider on load
  useEffect(() => {
    if (subscription) {
      setBillingDay(subscription.billing_day ?? 1);
      setCategoryId(subscription.category_id);
      setTierId(subscription.tier_id);
      setIsEnterprise(subscription.is_enterprise ?? false);
    } else if (provider) {
      setCategoryId(provider.specialty_category_id ?? "");
      setTierId(provider.membership_tier_id ?? "");
      setIsEnterprise(provider.is_enterprise ?? false);
    }
  }, [subscription, provider]);

  // Billing calculation
  const calculation = useMemo((): BillingCalculation | null => {
    if (!categoryId || !tierId || !locations || !rateCards || !discountTiers) return null;

    const locationsWithRates = locations.map((loc) => {
      const rate = rateCards.find((r) => r.category_id === categoryId && r.tier_id === tierId && r.market_id === loc.market_id);
      return {
        locationId: loc.id,
        locationName: loc.location_name || "Unnamed",
        city: loc.city,
        state: loc.state,
        marketName: (loc.geographic_markets as any)?.name ?? "Unassigned",
        marketId: loc.market_id ?? "",
        baseRate: rate ? Number(rate.monthly_rate) : 0,
      };
    });

    const sorted = [...locationsWithRates].sort((a, b) => b.baseRate - a.baseRate);

    const lines = sorted.map((loc, idx) => {
      const position = idx + 1;
      const tier = discountTiers.find(
        (t: DiscountTier) => position >= t.min_locations && (t.max_locations === null || position <= t.max_locations)
      );
      const discountPct = tier?.discount_percentage === 100 ? 55 : (tier?.discount_percentage ?? 0);
      const lineTotal = Math.round(loc.baseRate * (1 - discountPct / 100) * 100) / 100;
      return { ...loc, position, discountPercentage: discountPct, lineTotal };
    });

    const perLocationTotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const entRate = enterpriseRates?.find((r) => r.category_id === categoryId && r.tier_id === tierId);
    const enterpriseRate = entRate ? Number(entRate.monthly_rate) : 0;
    const enterpriseSavings = perLocationTotal - enterpriseRate;

    return {
      lines,
      subtotal: isEnterprise ? enterpriseRate : perLocationTotal,
      isEnterprise,
      enterpriseRate,
      perLocationTotal,
      enterpriseSavings,
      shouldSuggestEnterprise: !isEnterprise && locations.length >= 5 && enterpriseSavings > 0,
    };
  }, [categoryId, tierId, isEnterprise, locations, rateCards, enterpriseRates, discountTiers]);

  // Previous amount for comparison
  const previousAmount = subscription ? Number(subscription.monthly_amount) : 0;
  const newAmount = calculation?.subtotal ?? 0;
  const amountChanged = previousAmount > 0 && Math.abs(previousAmount - newAmount) > 0.01;

  // Save billing profile with upgrade/downgrade logic
  const saveBillingProfile = async () => {
    setSaving(true);
    try {
      // Update provider
      await supabase.from("providers").update({
        specialty_category_id: categoryId || null,
        membership_tier_id: tierId || null,
        is_enterprise: isEnterprise,
      }).eq("id", providerId);

      if (subscription) {
        const oldTierId = subscription.tier_id;
        const isUpgrade = tierId !== oldTierId && newAmount > previousAmount;
        const isDowngrade = tierId !== oldTierId && newAmount < previousAmount;

        if (isUpgrade && subscription.status === "active" && subscription.next_billing_date) {
          // Calculate prorated difference
          const nextBilling = new Date(subscription.next_billing_date);
          const now = new Date();
          const daysRemaining = Math.max(0, Math.ceil((nextBilling.getTime() - now.getTime()) / 86400000));
          const dailyDiff = (newAmount - previousAmount) / 30;
          const proratedAmount = Math.round(dailyDiff * daysRemaining * 100) / 100;

          if (proratedAmount > 0) {
            // Generate prorated invoice
            const invNumber = `INV-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;
            await supabase.from("invoices").insert({
              provider_id: providerId,
              subscription_id: subscription.id,
              invoice_number: invNumber,
              billing_period_start: now.toISOString().split("T")[0],
              billing_period_end: subscription.next_billing_date,
              subtotal: proratedAmount,
              total_amount: proratedAmount,
              due_date: new Date(now.getTime() + 15 * 86400000).toISOString().split("T")[0],
              status: "pending",
            } as any);
            toast.info(`Prorated upgrade invoice created: $${proratedAmount.toFixed(2)}`);
          }

          // Update subscription immediately
          await supabase.from("provider_subscriptions").update({
            category_id: categoryId,
            tier_id: tierId,
            is_enterprise: isEnterprise,
            monthly_amount: newAmount,
            billing_day: billingDay,
          }).eq("id", subscription.id);

          // Notify provider
          const newTierName = tiers?.find(t => t.id === tierId)?.name ?? "Unknown";
          const { data: prov } = await supabase.from("providers").select("contact_email").eq("id", providerId).single();
          if (prov?.contact_email) {
            const { data: prof } = await supabase.from("profiles").select("id").eq("email", prov.contact_email).maybeSingle();
            if (prof) {
              await supabase.from("notifications").insert({
                user_id: prof.id,
                title: "Membership Upgraded!",
                message: `Your membership has been upgraded to ${newTierName}!`,
                type: "billing",
                link: "/billing/provider",
              });
            }
          }

          await supabase.from("activities").insert({
            provider_id: providerId,
            user_id: user?.id,
            activity_type: "status_change",
            description: `Tier upgraded to ${newTierName} — $${newAmount.toFixed(2)}/mo (prorated: $${proratedAmount.toFixed(2)})`,
          });
        } else if (isDowngrade) {
          // Downgrade takes effect next billing cycle — just update amount for future
          await supabase.from("provider_subscriptions").update({
            category_id: categoryId,
            tier_id: tierId,
            is_enterprise: isEnterprise,
            monthly_amount: newAmount,
            billing_day: billingDay,
          }).eq("id", subscription.id);

          const newTierName = tiers?.find(t => t.id === tierId)?.name ?? "Unknown";
          toast.info(`Downgrade to ${newTierName} will take effect on ${subscription.next_billing_date ?? "next billing cycle"}`);

          const { data: prov } = await supabase.from("providers").select("contact_email").eq("id", providerId).single();
          if (prov?.contact_email) {
            const { data: prof } = await supabase.from("profiles").select("id").eq("email", prov.contact_email).maybeSingle();
            if (prof) {
              await supabase.from("notifications").insert({
                user_id: prof.id,
                title: "Membership Change",
                message: `Your membership will be changed to ${newTierName} effective ${subscription.next_billing_date ?? "next billing cycle"}.`,
                type: "billing",
                link: "/billing/provider",
              });
            }
          }
        } else {
          // Same tier or no sub change — just update
          await supabase.from("provider_subscriptions").update({
            category_id: categoryId,
            tier_id: tierId,
            is_enterprise: isEnterprise,
            monthly_amount: newAmount,
            billing_day: billingDay,
          }).eq("id", subscription.id);
        }
      } else if (categoryId && tierId) {
        await supabase.from("provider_subscriptions").insert({
          provider_id: providerId,
          category_id: categoryId,
          tier_id: tierId,
          is_enterprise: isEnterprise,
          monthly_amount: newAmount,
          billing_day: billingDay,
          status: "pending",
          created_by: user?.id,
        } as any);
      }

      queryClient.invalidateQueries({ queryKey: ["provider", providerId] });
      queryClient.invalidateQueries({ queryKey: ["provider-subscription", providerId] });
      toast.success("Billing profile saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Location management
  const addLocation = async () => {
    try {
      const { error } = await supabase.from("provider_locations").insert({
        provider_id: providerId,
        location_name: newLoc.location_name || null,
        address_line1: newLoc.address_line1,
        city: newLoc.city,
        state: newLoc.state,
        zip_code: newLoc.zip_code,
        market_id: newLoc.market_id || null,
        is_primary: (locations?.length ?? 0) === 0,
      } as any);
      if (error) throw error;
      refetchLocations();
      setAddLocationOpen(false);
      setNewLoc({ location_name: "", address_line1: "", city: "", state: "", zip_code: "", market_id: "" });
      toast.success("Location added");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const updateLocationMarket = async (locationId: string, marketId: string) => {
    await supabase.from("provider_locations").update({ market_id: marketId }).eq("id", locationId);
    refetchLocations();
  };

  // Subscription actions
  const updateSubStatus = async (status: string, extra?: Record<string, any>) => {
    if (!subscription) return;
    try {
      await supabase.from("provider_subscriptions").update({
        status,
        ...extra,
      }).eq("id", subscription.id);
      refetchSub();
      toast.success(`Subscription ${status.replace(/_/g, " ")}`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const applyCredit = async () => {
    const amt = parseFloat(creditAmount);
    if (isNaN(amt) || amt <= 0 || !creditReason.trim()) return;
    try {
      await supabase.from("billing_credits").insert({
        provider_id: providerId,
        amount: amt,
        reason: creditReason,
        created_by: user?.id,
      } as any);
      queryClient.invalidateQueries({ queryKey: ["provider-credits", providerId] });
      setCreditOpen(false);
      setCreditAmount("");
      setCreditReason("");
      toast.success("Credit applied");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) ?? 0;
  const totalCredits = credits?.reduce((sum, c) => sum + Number(c.amount), 0) ?? 0;

  const daysPastDue = subscription?.status === "past_due" && subscription.next_billing_date
    ? Math.floor((Date.now() - new Date(subscription.next_billing_date).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  const selectedCategory = categories?.find((c) => c.id === categoryId);
  const selectedTier = tiers?.find((t) => t.id === tierId);

  return (
    <div className="space-y-6 mt-4">
      {/* Past Due Alert */}
      {subscription?.status === "past_due" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            This subscription is <strong>{daysPastDue} days past due</strong>. Outstanding amount: <strong>${Number(subscription.monthly_amount).toFixed(2)}</strong>
          </AlertDescription>
        </Alert>
      )}

      {/* SECTION 1: Billing Profile */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Billing Profile
              </CardTitle>
              <CardDescription>Configure specialty, membership tier, and billing preferences</CardDescription>
            </div>
            <Button onClick={saveBillingProfile} disabled={saving} size="sm">
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Specialty Category</Label>
              {categoryId ? (
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div>
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 mb-1">Not Assigned</Badge>
                  <Select value="" onValueChange={setCategoryId}>
                    <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Membership Tier</Label>
              {tierId ? (
                <Select value={tierId} onValueChange={setTierId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {tiers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div>
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 mb-1">Not Assigned</Badge>
                  <Select value="" onValueChange={setTierId}>
                    <SelectTrigger><SelectValue placeholder="Select tier" /></SelectTrigger>
                    <SelectContent>
                      {tiers?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Enterprise Account</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={isEnterprise} onCheckedChange={setIsEnterprise} />
                <span className="text-sm">{isEnterprise ? "Yes" : "No"}</span>
              </div>
              {(locations?.length ?? 0) >= 5 && !isEnterprise && (
                <p className="text-xs text-primary">5+ locations — consider enterprise</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Billing Day</Label>
              <Select value={String(billingDay)} onValueChange={(v) => setBillingDay(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}{d === 1 ? "st" : d === 2 ? "nd" : d === 3 ? "rd" : "th"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {amountChanged && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This change will update the monthly fee from <strong>${previousAmount.toFixed(2)}</strong> to{" "}
                <strong>${newAmount.toFixed(2)}</strong> effective next billing cycle.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: Locations & Pricing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Locations & Pricing
              </CardTitle>
              <CardDescription>
                {locations?.length ?? 0} active location{(locations?.length ?? 0) !== 1 ? "s" : ""} ·{" "}
                {selectedCategory?.name ?? "No category"} · {selectedTier?.name ?? "No tier"}
              </CardDescription>
            </div>
            <Dialog open={addLocationOpen} onOpenChange={setAddLocationOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="h-4 w-4 mr-2" />Add Location</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Practice Location</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Location Name</Label>
                    <Input placeholder="e.g., Main Office" value={newLoc.location_name} onChange={(e) => setNewLoc({ ...newLoc, location_name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Address</Label>
                    <Input placeholder="Street address" value={newLoc.address_line1} onChange={(e) => setNewLoc({ ...newLoc, address_line1: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label>City</Label>
                      <Input value={newLoc.city} onChange={(e) => setNewLoc({ ...newLoc, city: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>State</Label>
                      <Input value={newLoc.state} onChange={(e) => setNewLoc({ ...newLoc, state: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>ZIP</Label>
                      <Input value={newLoc.zip_code} onChange={(e) => setNewLoc({ ...newLoc, zip_code: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Market Tier</Label>
                    <Select value={newLoc.market_id} onValueChange={(v) => setNewLoc({ ...newLoc, market_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Select market" /></SelectTrigger>
                      <SelectContent>
                        {markets?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={addLocation} disabled={!newLoc.address_line1 || !newLoc.city || !newLoc.state}>
                    Add Location
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Market Tier</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculation?.lines.map((line) => (
                <TableRow key={line.locationId}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {line.position === 1 && <Badge variant="outline" className="text-[10px] px-1">Primary</Badge>}
                      {line.locationName}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {line.city}, {line.state}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={line.marketId}
                      onValueChange={(v) => updateLocationMarket(line.locationId, v)}
                    >
                      <SelectTrigger className="w-36 h-8 text-xs">
                        <SelectValue placeholder="Assign market" />
                      </SelectTrigger>
                      <SelectContent>
                        {markets?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">${line.baseRate.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    {line.discountPercentage > 0 ? (
                      <Badge variant="outline" className="text-xs">{line.discountPercentage}%</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">${line.lineTotal.toFixed(2)}</TableCell>
                </TableRow>
              ))}
              {(!calculation || calculation.lines.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No locations configured. Add a location to calculate pricing.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {calculation && calculation.lines.length > 0 && (
            <div className="border-t px-4 py-3 space-y-2">
              {calculation.isEnterprise ? (
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-semibold">Enterprise Rate</span>
                    <span className="text-sm text-muted-foreground ml-2">(flat rate for all {calculation.lines.length} locations)</span>
                  </div>
                  <span className="text-xl font-bold text-primary">${calculation.subtotal.toFixed(2)}/mo</span>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total Monthly Fee</span>
                  <span className="text-xl font-bold text-primary">${calculation.subtotal.toFixed(2)}/mo</span>
                </div>
              )}

              {calculation.shouldSuggestEnterprise && (
                <Alert className="border-primary/20 bg-primary/5">
                  <Building className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-sm">
                    <strong>Enterprise rate available:</strong> ${calculation.enterpriseRate.toFixed(2)}/mo vs. per-location total: ${calculation.perLocationTotal.toFixed(2)}/mo.
                    Save <strong>${calculation.enterpriseSavings.toFixed(2)}/mo</strong> by switching to enterprise.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 3: Subscription Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Subscription Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {subscription ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge className={`capitalize mt-1 ${subscriptionStatusColors[subscription.status] ?? ""}`}>
                    {subscription.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Monthly Amount</p>
                  <p className="text-lg font-bold">${Number(subscription.monthly_amount).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Start Date</p>
                  <p className="text-sm font-medium">{subscription.started_at ? new Date(subscription.started_at).toLocaleDateString() : "Not started"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Next Billing</p>
                  <p className="text-sm font-medium">{subscription.next_billing_date ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lifetime Paid</p>
                  <p className="text-sm font-medium">${totalPaid.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Available Credits</p>
                  <p className="text-sm font-medium">${totalCredits.toFixed(2)}</p>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                {subscription.status === "pending" && (
                  <Button size="sm" onClick={() => updateSubStatus("active", { started_at: new Date().toISOString() })}>
                    <Play className="h-4 w-4 mr-1" />Activate Subscription
                  </Button>
                )}
                {subscription.status === "active" && (
                  <Button size="sm" variant="outline" onClick={() => updateSubStatus("suspended")}>
                    <Pause className="h-4 w-4 mr-1" />Suspend
                  </Button>
                )}
                {subscription.status === "suspended" && (
                  <Button size="sm" onClick={() => updateSubStatus("active")}>
                    <Play className="h-4 w-4 mr-1" />Reactivate
                  </Button>
                )}
                {subscription.status === "past_due" && (
                  <Button size="sm" onClick={() => updateSubStatus("active")}>
                    <CheckCircle2 className="h-4 w-4 mr-1" />Mark Current
                  </Button>
                )}
                {["active", "past_due", "suspended"].includes(subscription.status) && (
                  <>
                    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="destructive">
                          <XCircle className="h-4 w-4 mr-1" />Cancel
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Cancel Subscription</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            <Label>Cancellation Reason</Label>
                            <Select value={cancelReason} onValueChange={setCancelReason}>
                              <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="non_payment">Non-payment</SelectItem>
                                <SelectItem value="provider_request">Provider request</SelectItem>
                                <SelectItem value="contract_terminated">Contract terminated</SelectItem>
                                <SelectItem value="business_closed">Business closed</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Notes</Label>
                            <Textarea value={cancelNotes} onChange={(e) => setCancelNotes(e.target.value)} rows={3} placeholder="Additional details..." />
                          </div>
                          <Button
                            variant="destructive"
                            className="w-full"
                            onClick={async () => {
                              await updateSubStatus("cancelled", {
                                cancelled_at: new Date().toISOString(),
                                cancellation_reason: `${cancelReason}${cancelNotes ? `: ${cancelNotes}` : ""}`,
                              });

                              // Generate prorated final invoice
                              if (subscription?.next_billing_date && subscription.started_at) {
                                const now = new Date();
                                const periodStart = new Date(subscription.next_billing_date);
                                periodStart.setMonth(periodStart.getMonth() - 1);
                                const daysInCycle = 30;
                                const daysUsed = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / 86400000));
                                const proratedAmt = Math.round((Number(subscription.monthly_amount) / daysInCycle) * Math.min(daysUsed, daysInCycle) * 100) / 100;

                                if (proratedAmt > 0) {
                                  const invNum = `INV-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;
                                  await supabase.from("invoices").insert({
                                    provider_id: providerId,
                                    subscription_id: subscription.id,
                                    invoice_number: invNum,
                                    billing_period_start: periodStart.toISOString().split("T")[0],
                                    billing_period_end: now.toISOString().split("T")[0],
                                    subtotal: proratedAmt,
                                    total_amount: proratedAmt,
                                    due_date: new Date(now.getTime() + 15 * 86400000).toISOString().split("T")[0],
                                    status: "pending",
                                    notes: `Final prorated invoice — cancellation (${cancelReason})`,
                                  } as any);
                                }
                              }

                              // Notify provider
                              const { data: prov } = await supabase.from("providers").select("contact_email").eq("id", providerId).single();
                              if (prov?.contact_email) {
                                const { data: prof } = await supabase.from("profiles").select("id").eq("email", prov.contact_email).maybeSingle();
                                if (prof) {
                                  await supabase.from("notifications").insert({
                                    user_id: prof.id,
                                    title: "Membership Cancelled",
                                    message: `Your network membership has been cancelled effective ${new Date().toLocaleDateString()}.`,
                                    type: "billing",
                                    link: "/billing/provider",
                                  });
                                }
                              }

                              // Log activity
                              await supabase.from("activities").insert({
                                provider_id: providerId,
                                user_id: user?.id,
                                activity_type: "status_change",
                                description: `Subscription cancelled — ${cancelReason.replace(/_/g, " ")}.`,
                              });

                              setCancelOpen(false);
                              setCancelReason("");
                              setCancelNotes("");
                              refetchSub();
                            }}
                            disabled={!cancelReason}
                          >
                            Confirm Cancellation
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
                <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Gift className="h-4 w-4 mr-1" />Apply Credit
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Apply Billing Credit</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Amount ($)</Label>
                        <Input type="number" min="0.01" step="0.01" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Reason</Label>
                        <Input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} placeholder="e.g., Goodwill credit" />
                      </div>
                      <Button className="w-full" onClick={applyCredit} disabled={!creditAmount || !creditReason.trim()}>
                        Apply Credit
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active subscription. Configure the billing profile above and save to create one.</p>
            </div>
          )}
        </CardContent>
      </Card>
      {/* SECTION 4: Rate Card Matrix */}
      {categoryId && tierId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Rate Card — {selectedCategory?.name ?? "—"} · {selectedTier?.name ?? "—"}
            </CardTitle>
            <CardDescription>Monthly rates by market for current category &amp; tier</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead className="text-right">Monthly Rate</TableHead>
                  <TableHead className="text-right">Multiplier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markets?.map((m) => {
                  const rate = rateCards?.find(
                    (r) => r.category_id === categoryId && r.tier_id === tierId && r.market_id === m.id
                  );
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.name}
                        {m.example_cities && (
                          <span className="text-xs text-muted-foreground ml-2">({m.example_cities})</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {rate ? `$${Number(rate.monthly_rate).toFixed(2)}` : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{m.rate_multiplier}×</TableCell>
                    </TableRow>
                  );
                })}
                {(!markets || markets.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-6 text-muted-foreground">No markets configured</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* SECTION 5: Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice History
          </CardTitle>
          <CardDescription>{invoices?.length ?? 0} invoice{(invoices?.length ?? 0) !== 1 ? "s" : ""}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices && invoices.length > 0 ? invoices.map((inv) => (
                <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => window.open(`/invoices/${inv.id}`, '_blank')}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(inv.billing_period_start).toLocaleDateString()} – {new Date(inv.billing_period_end).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-sm">{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right font-medium">${Number(inv.total_amount).toFixed(2)}</TableCell>
                  <TableCell className="text-right">${Number(inv.paid_amount ?? 0).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge className={`capitalize ${
                      inv.status === "paid" ? "bg-success/10 text-success" :
                      inv.status === "past_due" ? "bg-destructive/10 text-destructive" :
                      inv.status === "pending" ? "bg-warning/10 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>{inv.status.replace(/_/g, " ")}</Badge>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No invoices yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
