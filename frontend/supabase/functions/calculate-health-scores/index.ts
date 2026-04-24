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
    let providerQuery = supabase.from("providers").select("*");
    if (provider_ids && provider_ids.length > 0) {
      providerQuery = providerQuery.in("id", provider_ids);
    } else {
      providerQuery = providerQuery.in("status", ["active", "contracted", "in_negotiation"]);
    }
    const { data: providers, error: provErr } = await providerQuery;
    if (provErr) throw provErr;
    if (!providers || providers.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all supporting data
    const pIds = providers.map(p => p.id);

    const [ticketsRes, activitiesRes, contractsRes, docsRes, workflowsRes] = await Promise.all([
      supabase.from("support_tickets").select("id, provider_id, status, priority, created_at").in("provider_id", pIds).gte("created_at", thirtyDaysAgo),
      supabase.from("activities").select("id, provider_id, created_at").in("provider_id", pIds).order("created_at", { ascending: false }),
      supabase.from("contracts").select("id, provider_id, status, end_date, renewal_date").in("provider_id", pIds),
      supabase.from("provider_documents").select("id, provider_id, status").in("provider_id", pIds),
      supabase.from("onboarding_workflows").select("id, provider_id, status").in("provider_id", pIds),
    ]);

    const tickets = ticketsRes.data ?? [];
    const activities = activitiesRes.data ?? [];
    const contracts = contractsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const workflows = workflowsRes.data ?? [];

    const results: any[] = [];

    for (const provider of providers) {
      const pTickets = tickets.filter(t => t.provider_id === provider.id);
      const pActivities = activities.filter(a => a.provider_id === provider.id);
      const pContracts = contracts.filter(c => c.provider_id === provider.id);
      const pDocs = docs.filter(d => d.provider_id === provider.id);
      const pWorkflows = workflows.filter(w => w.provider_id === provider.id);

      const lastActivity = pActivities[0]?.created_at;
      const daysSinceActivity = lastActivity ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)) : 999;

      const activeContracts = pContracts.filter(c => ["active", "signed"].includes(c.status));
      const nearestRenewal = activeContracts
        .filter(c => c.renewal_date || c.end_date)
        .map(c => new Date(c.renewal_date || c.end_date!))
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const daysToRenewal = nearestRenewal ? Math.floor((nearestRenewal.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;

      const signedDocs = pDocs.filter(d => d.status === "signed").length;
      const totalDocs = pDocs.length;
      const isOnboarding = pWorkflows.some(w => ["in_progress", "not_started"].includes(w.status));

      const signalData = {
        business_name: provider.business_name,
        status: provider.status,
        tickets_last_30_days: pTickets.length,
        high_priority_tickets: pTickets.filter(t => ["high", "urgent"].includes(t.priority)).length,
        days_since_last_contact: daysSinceActivity,
        days_to_nearest_renewal: daysToRenewal,
        signed_documents: signedDocs,
        total_documents: totalDocs,
        is_onboarding: isOnboarding,
        active_contracts: activeContracts.length,
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
                content: "You analyze provider health data and return ONLY valid JSON. No markdown, no explanation.",
              },
              {
                role: "user",
                content: `Analyze this provider's health data and return a JSON object with:
- score (0-100, where 100 is perfectly healthy)
- risk_level ('healthy' for 80-100, 'monitor' for 60-79, 'at_risk' for 40-59, 'critical' for 0-39)
- factors: object with category scores 0-100 (engagement, support_health, contract_status, relationship_recency)
- summary: 2-3 sentence explanation of the score
- recommended_actions: array of 1-3 specific actions the team should take

Provider data: ${JSON.stringify(signalData)}

Return ONLY valid JSON.`,
              },
            ],
            tools: [{
              type: "function",
              function: {
                name: "health_score_result",
                description: "Return the health score analysis",
                parameters: {
                  type: "object",
                  properties: {
                    score: { type: "integer", minimum: 0, maximum: 100 },
                    risk_level: { type: "string", enum: ["healthy", "monitor", "at_risk", "critical"] },
                    factors: {
                      type: "object",
                      properties: {
                        engagement: { type: "integer" },
                        support_health: { type: "integer" },
                        contract_status: { type: "integer" },
                        relationship_recency: { type: "integer" },
                      },
                      required: ["engagement", "support_health", "contract_status", "relationship_recency"],
                    },
                    summary: { type: "string" },
                    recommended_actions: { type: "array", items: { type: "string" } },
                  },
                  required: ["score", "risk_level", "factors", "summary", "recommended_actions"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "health_score_result" } },
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

        // Save to provider_health_scores
        await supabase.from("provider_health_scores").insert({
          provider_id: provider.id,
          score: result.score,
          factors: result.factors,
          risk_level: result.risk_level,
          ai_summary: result.summary,
          recommended_actions: result.recommended_actions,
        });

        // Update provider
        await supabase.from("providers").update({
          health_score: result.score,
          health_score_updated_at: new Date().toISOString(),
        }).eq("id", provider.id);

        results.push({ provider_id: provider.id, score: result.score, risk_level: result.risk_level });
      } catch (e) {
        console.error(`Error processing ${provider.id}:`, e);
      }
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Health score error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
