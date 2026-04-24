import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];

    // 1. Find contracts that need renewal_status updated to 'upcoming'
    const { data: upcomingContracts } = await supabase
      .from("contracts")
      .select("id, end_date, renewal_notice_days, provider_id, contract_type, providers(business_name, assigned_sales_rep)")
      .in("status", ["active", "signed"])
      .eq("renewal_status", "not_due")
      .not("end_date", "is", null);

    let updatedToUpcoming = 0;
    for (const contract of upcomingContracts ?? []) {
      const endDate = new Date(contract.end_date!);
      const noticeDays = contract.renewal_notice_days ?? 60;
      const daysUntil = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntil <= noticeDays && daysUntil > 0) {
        await supabase
          .from("contracts")
          .update({ renewal_status: "upcoming", updated_at: now.toISOString() })
          .eq("id", contract.id);

        // Log activity
        await supabase.from("activities").insert({
          activity_type: "contract_updated",
          description: `Contract renewal upcoming — expires in ${daysUntil} days (${contract.end_date})`,
          provider_id: contract.provider_id,
          user_id: (contract.providers as any)?.assigned_sales_rep || null,
        });

        updatedToUpcoming++;
      }
    }

    // 2. Auto-renew contracts past their end date with auto_renew = true
    const { data: autoRenewContracts } = await supabase
      .from("contracts")
      .select("id, start_date, end_date, renewal_notice_days, provider_id, contract_type, deal_value, auto_renew, providers(business_name)")
      .in("status", ["active", "signed"])
      .in("renewal_status", ["upcoming", "not_due"])
      .eq("auto_renew", true)
      .not("end_date", "is", null)
      .lte("end_date", todayStr);

    let autoRenewed = 0;
    for (const contract of autoRenewContracts ?? []) {
      const origStart = new Date(contract.start_date!);
      const origEnd = new Date(contract.end_date!);
      const termMs = origEnd.getTime() - origStart.getTime();
      const newStart = origEnd;
      const newEnd = new Date(newStart.getTime() + termMs);
      const noticeDays = contract.renewal_notice_days ?? 60;
      const newRenewalDate = new Date(newEnd.getTime() - noticeDays * 86400000);

      await supabase.from("contracts").update({
        start_date: newStart.toISOString().split("T")[0],
        end_date: newEnd.toISOString().split("T")[0],
        renewal_date: newRenewalDate.toISOString().split("T")[0],
        renewal_status: "auto_renewed",
        updated_at: now.toISOString(),
      }).eq("id", contract.id);

      await supabase.from("activities").insert({
        activity_type: "contract_updated",
        description: `Contract automatically renewed through ${newEnd.toISOString().split("T")[0]}`,
        provider_id: contract.provider_id,
      });

      autoRenewed++;
    }

    // 3. Mark expired contracts (past end date, auto_renew = false, still active)
    const { data: expiredContracts } = await supabase
      .from("contracts")
      .select("id, end_date, provider_id")
      .in("status", ["active", "signed"])
      .in("renewal_status", ["upcoming", "not_due", "in_renewal"])
      .eq("auto_renew", false)
      .not("end_date", "is", null)
      .lte("end_date", todayStr);

    let markedExpired = 0;
    for (const contract of expiredContracts ?? []) {
      await supabase.from("contracts").update({
        renewal_status: "expired",
        status: "expired",
        updated_at: now.toISOString(),
      }).eq("id", contract.id);

      await supabase.from("activities").insert({
        activity_type: "contract_updated",
        description: `Contract expired on ${contract.end_date}`,
        provider_id: contract.provider_id,
      });

      markedExpired++;
    }

    return new Response(
      JSON.stringify({
        message: `Renewal check complete: ${updatedToUpcoming} marked upcoming, ${autoRenewed} auto-renewed, ${markedExpired} expired`,
        updatedToUpcoming,
        autoRenewed,
        markedExpired,
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
