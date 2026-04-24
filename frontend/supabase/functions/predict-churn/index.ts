import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiKey = Deno.env.get("GEMINI_API_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { provider_ids } = await req.json().catch(() => ({ provider_ids: null }));

    // Fetch active providers
    let providerQuery = supabase.from("providers").select("*, profiles(full_name, email)");
    if (provider_ids?.length > 0) {
      providerQuery = providerQuery.in("id", provider_ids);
    } else {
      providerQuery = providerQuery.in("status", ["active", "contracted", "in_negotiation"]);
    }
    const { data: providers, error: provErr } = await providerQuery;
    if (provErr) throw provErr;
    if (!providers || providers.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const pIds = providers.map(p => p.id);

    const [ticketsRes, activitiesRes, contractsRes, docsRes, healthRes, reviewSessionsRes] = await Promise.all([
      supabase.from("support_tickets").select("id, provider_id, status, priority, category, created_at").in("provider_id", pIds).gte("created_at", ninetyDaysAgo),
      supabase.from("activities").select("id, provider_id, activity_type, created_at").in("provider_id", pIds).order("created_at", { ascending: false }),
      supabase.from("contracts").select("id, provider_id, status, end_date, renewal_date, deal_value").in("provider_id", pIds),
      supabase.from("provider_documents").select("id, provider_id, status, sent_at, signed_at").in("provider_id", pIds),
      supabase.from("provider_health_scores").select("provider_id, score, factors, calculated_at").in("provider_id", pIds).order("calculated_at", { ascending: false }),
      supabase.from("contract_review_sessions").select("id, provider_id, flagged, flag_reason").in("provider_id", pIds).eq("flagged", true),
    ]);

    const tickets = ticketsRes.data ?? [];
    const activities = activitiesRes.data ?? [];
    const contracts = contractsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const healthScores = healthRes.data ?? [];
    const flaggedSessions = reviewSessionsRes.data ?? [];

    const results: any[] = [];

    for (const provider of providers) {
      const pTickets = tickets.filter(t => t.provider_id === provider.id);
      const pTickets30 = pTickets.filter(t => new Date(t.created_at) >= new Date(thirtyDaysAgo));
      const pActivities = activities.filter(a => a.provider_id === provider.id);
      const pContracts = contracts.filter(c => c.provider_id === provider.id);
      const pDocs = docs.filter(d => d.provider_id === provider.id);
      const pHealth = healthScores.find(h => h.provider_id === provider.id);
      const pFlagged = flaggedSessions.filter(s => s.provider_id === provider.id);

      const lastActivity = pActivities[0]?.created_at;
      const daysSinceActivity = lastActivity
        ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      const activeContracts = pContracts.filter(c => ["active", "signed"].includes(c.status));
      const nearestRenewal = activeContracts
        .filter(c => c.renewal_date || c.end_date)
        .map(c => new Date(c.renewal_date || c.end_date!))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const daysToRenewal = nearestRenewal
        ? Math.floor((nearestRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      const pendingDocs = pDocs.filter(d => d.status === "sent" || d.status === "pending");
      const delayedDocs = pendingDocs.filter(d => {
        if (!d.sent_at) return false;
        const daysSinceSent = Math.floor((now.getTime() - new Date(d.sent_at).getTime()) / (1000 * 60 * 60 * 24));
        return daysSinceSent > 7;
      });

      const totalDealValue = pContracts.reduce((s, c) => s + (Number(c.deal_value) || 0), 0);

      const signalData = {
        business_name: provider.business_name,
        provider_status: provider.status,
        health_score: pHealth?.score ?? null,
        health_factors: pHealth?.factors ?? null,
        tickets_last_30_days: pTickets30.length,
        tickets_last_90_days: pTickets.length,
        high_priority_tickets: pTickets.filter(t => ["high", "urgent"].includes(t.priority)).length,
        unresolved_tickets: pTickets.filter(t => ["open", "in_progress"].includes(t.status)).length,
        days_since_last_contact: daysSinceActivity,
        days_to_nearest_renewal: daysToRenewal,
        active_contracts: activeContracts.length,
        total_deal_value: totalDealValue,
        documents_pending: pendingDocs.length,
        documents_delayed: delayedDocs.length,
        flagged_review_sessions: pFlagged.length,
        flagged_reasons: pFlagged.map(f => f.flag_reason).filter(Boolean),
        days_as_provider: Math.floor((now.getTime() - new Date(provider.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      };

      try {
        const aiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: "You are an expert at predicting customer churn. Analyze provider data and return structured predictions. Return ONLY valid JSON via the tool call.",
              },
              {
                role: "user",
                content: `Analyze this provider's data and predict their churn risk. Consider: support ticket volume and severity, contract renewal proximity, engagement recency, document signing delays, flagged AI review sessions, and overall health score.

Provider data: ${JSON.stringify(signalData)}

Provide a churn prediction with probability, timeframe, specific risk factors, and a detailed retention strategy.`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "churn_prediction",
                description: "Return churn prediction analysis",
                parameters: {
                  type: "object",
                  properties: {
                    churn_probability: { type: "integer", minimum: 0, maximum: 100, description: "Probability of churning 0-100" },
                    predicted_churn_timeframe: { type: "string", enum: ["30 days", "60 days", "90 days"], description: "When churn is likely" },
                    risk_factors: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
                          description: { type: "string" },
                        },
                        required: ["name", "severity", "description"],
                      },
                      description: "Key risk factors driving churn",
                    },
                    retention_strategy: { type: "string", description: "2-4 sentence retention plan with specific actions" },
                  },
                  required: ["churn_probability", "predicted_churn_timeframe", "risk_factors", "retention_strategy"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "churn_prediction" } },
          }),
        });

        if (!aiRes.ok) {
          console.error(`AI error for ${provider.id}: ${aiRes.status}`);
          continue;
        }

        const aiData = await aiRes.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        if (!toolCall) continue;

        const result = JSON.parse(toolCall.function.arguments);

        // Save prediction
        const { data: prediction } = await supabase.from("churn_predictions").insert({
          provider_id: provider.id,
          churn_probability: result.churn_probability,
          predicted_churn_timeframe: result.predicted_churn_timeframe,
          risk_factors: result.risk_factors,
          retention_strategy: result.retention_strategy,
          assigned_to: provider.assigned_sales_rep,
        }).select().single();

        // If high churn risk, create notification for assigned rep
        if (result.churn_probability > 70 && provider.assigned_sales_rep) {
          await supabase.from("notifications").insert({
            user_id: provider.assigned_sales_rep,
            title: `⚠️ High churn risk: ${provider.business_name}`,
            message: `${provider.business_name} has a ${result.churn_probability}% probability of churning in the next ${result.predicted_churn_timeframe}. Review the retention strategy and take action.`,
            type: "warning",
            link: "/analytics",
          });
        }

        results.push({
          provider_id: provider.id,
          churn_probability: result.churn_probability,
          timeframe: result.predicted_churn_timeframe,
        });
      } catch (e) {
        console.error(`Error processing ${provider.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Churn prediction error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
