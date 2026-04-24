import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gather platform data using service role for full access
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [
      providersRes,
      lawFirmsRes,
      mrrRes,
      pastDueRes,
      stalledRes,
      ticketsRes,
      renewalsRes,
      pipelineRes,
      campaignRes,
      recentProvidersRes,
      lastMonthProvidersRes,
    ] = await Promise.all([
      adminClient.from("providers").select("id", { count: "exact", head: true }).eq("status", "active"),
      adminClient.from("law_firms").select("id", { count: "exact", head: true }).eq("status", "active"),
      adminClient.rpc("get_total_mrr"),
      adminClient.from("invoices").select("id, total_amount, paid_amount, due_date, providers(business_name, provider_subscriptions(membership_tiers(name)))").eq("status", "past_due"),
      adminClient.from("onboarding_workflows").select("id, updated_at, providers(business_name), law_firms(firm_name), current_stage").in("status", ["in_progress", "pending"]).lt("updated_at", new Date(Date.now() - 5 * 86400000).toISOString()),
      adminClient.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
      adminClient.from("contracts").select("id, auto_renew, end_date").eq("status", "active").lte("end_date", new Date(Date.now() + 60 * 86400000).toISOString().split("T")[0]).gte("end_date", new Date().toISOString().split("T")[0]),
      adminClient.from("sales_pipeline").select("id, stage, estimated_value"),
      adminClient.from("campaign_leads").select("id, status"),
      // Providers created this month
      adminClient.from("providers").select("id", { count: "exact", head: true }).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
      // Providers created last month
      adminClient.from("providers").select("id", { count: "exact", head: true }).gte("created_at", new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString()).lt("created_at", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
    ]);

    const pastDue = pastDueRes.data ?? [];
    const pastDue30 = pastDue.filter(inv => {
      const days = (Date.now() - new Date(inv.due_date).getTime()) / 86400000;
      return days > 30;
    });
    const totalPastDueAmount = pastDue.reduce((s, inv) => s + (inv.total_amount - (inv.paid_amount || 0)), 0);
    const pastDue30Amount = pastDue30.reduce((s, inv) => s + (inv.total_amount - (inv.paid_amount || 0)), 0);

    const stalled = stalledRes.data ?? [];
    const renewals = renewalsRes.data ?? [];
    const autoRenewOff = renewals.filter(c => !c.auto_renew);
    const pipeline = pipelineRes.data ?? [];
    const campaignLeads = campaignRes.data ?? [];
    const contacted = campaignLeads.filter((l: any) => l.status !== "new" && l.status !== "assigned");
    const converted = campaignLeads.filter((l: any) => l.status === "converted");

    const mrr = mrrRes.data?.[0] ?? { provider_mrr: 0, law_firm_mrr: 0, total_mrr: 0 };

    const summaryData = {
      active_providers: providersRes.count ?? 0,
      active_law_firms: lawFirmsRes.count ?? 0,
      total_mrr: Number(mrr.total_mrr),
      provider_mrr: Number(mrr.provider_mrr),
      law_firm_mrr: Number(mrr.law_firm_mrr),
      past_due_invoices: pastDue.length,
      past_due_total_amount: Math.round(totalPastDueAmount),
      past_due_over_30_days: pastDue30.length,
      past_due_over_30_amount: Math.round(pastDue30Amount),
      stalled_onboardings: stalled.length,
      stalled_details: stalled.slice(0, 5).map(s => ({
        name: (s.providers as any)?.business_name || (s.law_firms as any)?.firm_name || "Unknown",
        stage: s.current_stage,
        days_stalled: Math.floor((Date.now() - new Date(s.updated_at).getTime()) / 86400000),
      })),
      open_support_tickets: ticketsRes.count ?? 0,
      contracts_expiring_60_days: renewals.length,
      auto_renew_off_count: autoRenewOff.length,
      pipeline_deals: pipeline.length,
      pipeline_total_value: pipeline.reduce((s, p) => s + (Number(p.estimated_value) || 0), 0),
      campaign_leads_total: campaignLeads.length,
      campaign_contacted: contacted.length,
      campaign_converted: converted.length,
      campaign_conversion_rate: campaignLeads.length > 0 ? Math.round((converted.length / campaignLeads.length) * 100) : 0,
      new_providers_this_month: recentProvidersRes.count ?? 0,
      new_providers_last_month: lastMonthProvidersRes.count ?? 0,
    };

    const prompt = `You are an operations analyst for a provider network management platform. Based on the following data, give me 3-5 brief, actionable insights. Focus on things that need attention, opportunities to improve, and wins to celebrate. Be specific with numbers. Each insight should be 1-2 sentences max.

For each insight, classify it as one of: "alert" (needs immediate action), "warning" (something to monitor), "win" (something going well), "opportunity" (something to consider).

Platform Data:
${JSON.stringify(summaryData, null, 2)}`;

    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a business operations analyst. Return insights as a JSON array." },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_insights",
              description: "Return actionable business insights",
              parameters: {
                type: "object",
                properties: {
                  insights: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["alert", "warning", "win", "opportunity"] },
                        message: { type: "string", description: "1-2 sentence insight with specific numbers" },
                      },
                      required: ["type", "message"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["insights"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_insights" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errorText);
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let insights = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        insights = parsed.insights ?? [];
      } catch {
        insights = [{ type: "warning", message: "Unable to parse AI response. Please try again." }];
      }
    }

    return new Response(JSON.stringify({ insights }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dashboard-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
