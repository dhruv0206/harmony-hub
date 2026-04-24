import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DiscountTier {
  min_locations: number;
  max_locations: number | null;
  discount_percentage: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().split("T")[0];

    // 1. Find eligible subscriptions
    const { data: subscriptions, error: subErr } = await supabase
      .from("provider_subscriptions")
      .select("*, providers(id, business_name, contact_name, contact_email, city, state)")
      .eq("status", "active")
      .lte("next_billing_date", today);

    if (subErr) throw subErr;
    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No invoices to generate.", count: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get discount tiers
    const { data: discountConfig } = await supabase
      .from("ai_config")
      .select("settings")
      .eq("feature_name", "multi_location_discounts")
      .single();

    const discountTiers: DiscountTier[] =
      (discountConfig?.settings as any)?.tiers ?? [];

    // Get latest invoice number
    const { data: lastInvoice } = await supabase
      .from("invoices")
      .select("invoice_number")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let seqNum = 1;
    if (lastInvoice?.invoice_number) {
      const match = lastInvoice.invoice_number.match(/INV-\d{4}-(\d{6})/);
      if (match) seqNum = parseInt(match[1], 10) + 1;
    }

    const year = new Date().getFullYear();
    let totalGenerated = 0;
    let totalAmount = 0;

    for (const sub of subscriptions) {
      const billingDate = new Date(sub.next_billing_date);
      const periodStart = new Date(billingDate.getFullYear(), billingDate.getMonth(), 1);
      const periodEnd = new Date(billingDate.getFullYear(), billingDate.getMonth() + 1, 0);

      const invoiceNumber = `INV-${year}-${String(seqNum).padStart(6, "0")}`;
      seqNum++;

      let lineItems: any[] = [];
      let subtotal = 0;

      if (sub.is_enterprise) {
        // Enterprise: single line item
        const { data: entRate } = await supabase
          .from("enterprise_rates")
          .select("monthly_rate")
          .eq("category_id", sub.category_id)
          .eq("tier_id", sub.tier_id)
          .eq("is_active", true)
          .order("effective_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { count: locCount } = await supabase
          .from("provider_locations")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", sub.provider_id)
          .eq("is_active", true);

        // Get tier name
        const { data: tier } = await supabase
          .from("membership_tiers")
          .select("name")
          .eq("id", sub.tier_id)
          .single();

        const rate = entRate ? Number(entRate.monthly_rate) : Number(sub.monthly_amount);
        subtotal = rate;
        lineItems.push({
          description: `${tier?.name ?? "Enterprise"} Enterprise Membership — All Locations (${locCount ?? 0} locations)`,
          quantity: 1,
          unit_price: rate,
          discount_percentage: 0,
          line_total: rate,
        });
      } else {
        // Per-location billing
        const { data: locations } = await supabase
          .from("provider_locations")
          .select("*, geographic_markets(name)")
          .eq("provider_id", sub.provider_id)
          .eq("is_active", true);

        const { data: rateCards } = await supabase
          .from("rate_cards")
          .select("*")
          .eq("category_id", sub.category_id)
          .eq("tier_id", sub.tier_id)
          .eq("is_active", true);

        const { data: tier } = await supabase
          .from("membership_tiers")
          .select("name")
          .eq("id", sub.tier_id)
          .single();

        const locs = (locations ?? []).map((loc: any) => {
          const rc = rateCards?.find((r: any) => r.market_id === loc.market_id);
          return { ...loc, baseRate: rc ? Number(rc.monthly_rate) : 0, marketName: loc.geographic_markets?.name ?? "Unknown" };
        });

        locs.sort((a: any, b: any) => b.baseRate - a.baseRate);

        locs.forEach((loc: any, idx: number) => {
          const position = idx + 1;
          const dt = discountTiers.find(
            (t) => position >= t.min_locations && (t.max_locations === null || position <= t.max_locations)
          );
          const discountPct = dt?.discount_percentage === 100 ? 55 : (dt?.discount_percentage ?? 0);
          const lineTotal = Math.round(loc.baseRate * (1 - discountPct / 100) * 100) / 100;

          let desc = `${tier?.name ?? ""} Membership — ${loc.location_name || `Location ${position}`} (${loc.city}, ${loc.marketName})`;
          if (discountPct > 0) {
            desc += ` — Multi-location discount (${discountPct}%)`;
          }

          lineItems.push({
            description: desc,
            location_id: loc.id,
            quantity: 1,
            unit_price: loc.baseRate,
            discount_percentage: discountPct,
            line_total: lineTotal,
          });

          subtotal += lineTotal;
        });
      }

      // Check for available credits
      const { data: credits } = await supabase
        .from("billing_credits")
        .select("*")
        .eq("provider_id", sub.provider_id)
        .eq("status", "available")
        .order("created_at", { ascending: true });

      let discountAmount = 0;
      let discountReason = "";
      const creditsToApply: string[] = [];

      if (credits && credits.length > 0) {
        let remaining = subtotal;
        for (const credit of credits) {
          if (remaining <= 0) break;
          const creditAmt = Number(credit.amount);
          const applied = Math.min(creditAmt, remaining);
          discountAmount += applied;
          remaining -= applied;
          creditsToApply.push(credit.id);
          discountReason += `Credit: ${credit.reason} (-$${applied.toFixed(2)}). `;
        }
      }

      const totalAmt = Math.round((subtotal - discountAmount) * 100) / 100;
      const dueDate = new Date(periodStart);
      dueDate.setDate(dueDate.getDate() + 15);

      // Create invoice
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          invoice_number: invoiceNumber,
          provider_id: sub.provider_id,
          subscription_id: sub.id,
          billing_period_start: periodStart.toISOString().split("T")[0],
          billing_period_end: periodEnd.toISOString().split("T")[0],
          subtotal,
          discount_amount: discountAmount,
          discount_reason: discountReason || null,
          total_amount: totalAmt,
          due_date: dueDate.toISOString().split("T")[0],
          status: "pending",
        })
        .select()
        .single();

      if (invErr) throw invErr;

      // Create line items
      const itemsWithInvoiceId = lineItems.map((li) => ({
        ...li,
        invoice_id: invoice.id,
      }));

      const { error: liErr } = await supabase
        .from("invoice_line_items")
        .insert(itemsWithInvoiceId);

      if (liErr) throw liErr;

      // Apply credits
      for (const creditId of creditsToApply) {
        await supabase
          .from("billing_credits")
          .update({ status: "applied", applied_to_invoice_id: invoice.id })
          .eq("id", creditId);
      }

      // Update next billing date
      const nextMonth = new Date(billingDate);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      await supabase
        .from("provider_subscriptions")
        .update({ next_billing_date: nextMonth.toISOString().split("T")[0] })
        .eq("id", sub.id);

      totalGenerated++;
      totalAmount += totalAmt;
    }

    return new Response(
      JSON.stringify({
        message: `${totalGenerated} invoices generated, total: $${totalAmount.toFixed(2)}.`,
        count: totalGenerated,
        total: totalAmount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
