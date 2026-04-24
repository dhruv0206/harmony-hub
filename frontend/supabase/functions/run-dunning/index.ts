import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DunningRule {
  daysAfter: number;
  alertType: string;
  providerMsg: string;
  adminMsg: string;
  subscriptionAction?: string;
}

const DUNNING_RULES: DunningRule[] = [
  {
    daysAfter: 1,
    alertType: "past_due_1",
    providerMsg: "Your invoice {number} for ${amount} is past due. Please contact billing.",
    adminMsg: "Provider {provider} has a past due invoice ({number}, ${amount}).",
  },
  {
    daysAfter: 7,
    alertType: "past_due_7",
    providerMsg: "Reminder: Your invoice {number} for ${amount} is 7 days past due.",
    adminMsg: "Provider {provider} is 7 days past due on invoice {number} (${amount}).",
  },
  {
    daysAfter: 14,
    alertType: "past_due_14",
    providerMsg: "Your invoice {number} is 14 days past due. Please arrange payment promptly.",
    adminMsg: "Provider {provider} is 14 days past due (${amount}). Consider follow-up call.",
    subscriptionAction: "past_due",
  },
  {
    daysAfter: 30,
    alertType: "past_due_30",
    providerMsg: "Your account is 30 days past due. Services may be affected if payment is not received.",
    adminMsg: "Provider {provider} is 30 days past due (${amount}). Suspension recommended.",
  },
  {
    daysAfter: 45,
    alertType: "suspension_warning",
    providerMsg: "Your membership will be suspended in 15 days if payment is not received.",
    adminMsg: "Provider {provider} is 45 days past due (${amount}). Suspension warning sent.",
  },
  {
    daysAfter: 60,
    alertType: "suspended",
    providerMsg: "Your network membership has been suspended due to non-payment. Contact billing to reactivate.",
    adminMsg: "Provider {provider} has been suspended due to non-payment (${amount}).",
    subscriptionAction: "suspended",
  },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Find all past-due invoices
    const { data: invoices, error: invErr } = await sb
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_amount, due_date, provider_id, subscription_id, providers(business_name, assigned_sales_rep, contact_email)")
      .in("status", ["sent", "past_due", "pending", "partial"])
      .lt("due_date", todayStr);

    if (invErr) throw invErr;

    let alertsCreated = 0;
    const processed = invoices?.length ?? 0;

    for (const inv of invoices ?? []) {
      const dueDate = new Date(inv.due_date);
      const daysPast = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
      const owed = Number(inv.total_amount) - Number(inv.paid_amount ?? 0);
      if (owed <= 0) continue;

      const providerName = (inv.providers as any)?.business_name ?? "Unknown";
      const salesRepId = (inv.providers as any)?.assigned_sales_rep;

      // Find applicable rules (create alerts for all thresholds that have been crossed)
      for (const rule of DUNNING_RULES) {
        if (daysPast < rule.daysAfter) continue;

        // Check if alert already exists for this invoice + type
        const { count } = await sb
          .from("billing_alerts")
          .select("id", { count: "exact", head: true })
          .eq("provider_id", inv.provider_id)
          .eq("alert_type", rule.alertType)
          .eq("subscription_id", inv.subscription_id);

        if ((count ?? 0) > 0) continue;

        // Create alert
        await sb.from("billing_alerts").insert({
          provider_id: inv.provider_id,
          subscription_id: inv.subscription_id,
          alert_type: rule.alertType,
          message: rule.adminMsg
            .replace("{provider}", providerName)
            .replace("{number}", inv.invoice_number)
            .replace("{amount}", owed.toFixed(2)),
          status: "active",
        });
        alertsCreated++;

        // Update invoice status to past_due if not already
        if (inv.subscription_id) {
          await sb.from("invoices").update({ status: "past_due" }).eq("id", inv.id).neq("status", "past_due");
        }

        // Subscription status change if needed
        if (rule.subscriptionAction && inv.subscription_id) {
          await sb
            .from("provider_subscriptions")
            .update({ status: rule.subscriptionAction })
            .eq("id", inv.subscription_id);
        }

        // Get provider user id for notifications
        const providerEmail = (inv.providers as any)?.contact_email;
        let providerUserId: string | null = null;
        if (providerEmail) {
          const { data: prof } = await sb.from("profiles").select("id").eq("email", providerEmail).maybeSingle();
          providerUserId = prof?.id ?? null;
        }

        // Notify provider
        if (providerUserId) {
          await sb.from("notifications").insert({
            user_id: providerUserId,
            title: "Billing Alert",
            message: rule.providerMsg
              .replace("{number}", inv.invoice_number)
              .replace("{amount}", owed.toFixed(2)),
            type: "billing",
            link: "/billing/provider",
          });
        }

        // Notify sales rep
        if (salesRepId) {
          await sb.from("notifications").insert({
            user_id: salesRepId,
            title: "Past Due Invoice",
            message: `Provider ${providerName} has a past due invoice (${inv.invoice_number}).`,
            type: "billing",
            link: `/providers/${inv.provider_id}`,
          });
        }

        // Notify admins for escalations (7+ days)
        if (rule.daysAfter >= 7) {
          const { data: admins } = await sb.from("user_roles").select("user_id").eq("role", "admin");
          for (const admin of admins ?? []) {
            await sb.from("notifications").insert({
              user_id: admin.user_id,
              title: "Billing Escalation",
              message: rule.adminMsg
                .replace("{provider}", providerName)
                .replace("{number}", inv.invoice_number)
                .replace("{amount}", owed.toFixed(2)),
              type: "billing",
              link: "/billing",
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ message: `Processed ${processed} past due invoices. Created ${alertsCreated} new alerts.`, processed, alertsCreated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
