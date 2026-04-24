import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAQ_KNOWLEDGE = `
- Contracts are typically renewed 30 days before expiration. Providers receive renewal notifications via the platform.
- Standard contracts include basic coverage terms. Premium contracts add priority support and extended SLAs. Enterprise contracts are fully customized.
- Providers can view their contracts, submit support tickets, and update their profile through the self-service dashboard.
- Payment terms are net-30 unless otherwise specified in the contract.
- Onboarding typically takes 5-10 business days depending on the provider type and required verifications.
- Technical issues with platform access should be reported via a support ticket with category "technical".
- Billing inquiries can be submitted as tickets with category "billing" and will be routed to the finance team.
- Contract modifications require approval from the account manager and cannot be made through the portal directly.
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { feature, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let userPrompt = "";

    switch (feature) {
      case "ticket_suggest": {
        const { ticket, messages, providerInfo, contractInfo } = context;
        systemPrompt = `You are a professional customer support agent for ContractPro, a provider contract management platform.

<role>
You help internal support agents craft helpful, professional responses to provider support tickets.
Your suggestions should be empathetic, specific, and actionable.
Always address the provider by name when available.
</role>

<provider_profile>
  <business_name>${providerInfo?.business_name || "Unknown"}</business_name>
  <status>${providerInfo?.status || "Unknown"}</status>
  <provider_type>${providerInfo?.provider_type || "Not specified"}</provider_type>
  <contact_name>${providerInfo?.contact_name || "Unknown"}</contact_name>
  <contact_email>${providerInfo?.contact_email || "Unknown"}</contact_email>
  <city>${providerInfo?.city || "Unknown"}</city>
  <state>${providerInfo?.state || "Unknown"}</state>
  <assigned_rep>${providerInfo?.assigned_rep || "Unassigned"}</assigned_rep>
</provider_profile>

<contracts>
${contractInfo || "No contract information available."}
</contracts>

<conversation_history>
${messages?.map((m: any, i: number) => `  <message index="${i}" sender="${m.is_ai_response ? "AI" : m.sender_name || "Agent"}" type="${m.is_ai_response ? "ai" : "human"}">
    ${m.message}
  </message>`).join("\n") || "  <no_messages>This is the first response to the ticket.</no_messages>"}
</conversation_history>

<faq_knowledge>
${FAQ_KNOWLEDGE}
</faq_knowledge>

<escalation_rules>
You MUST recommend escalation to a human agent when the issue involves:
- Contract modifications or amendments
- Billing disputes or payment disagreements
- Legal concerns or compliance questions
- Requests to change contract terms or pricing
- Threats of legal action
When escalating, use language like: "I'd recommend having your account manager review this directly. Let me connect you with the appropriate team."
</escalation_rules>

<response_guidelines>
- Be professional, warm, and solution-oriented
- Reference specific contract details or account information when relevant
- Provide clear next steps
- Keep responses concise (2-4 paragraphs)
- Do not make promises about timeline changes or policy exceptions
- If unsure, recommend the agent verify with the appropriate internal team
</response_guidelines>`;

        userPrompt = `Generate a suggested response for this support ticket:

Subject: "${ticket.subject}"
Category: ${ticket.category}
Priority: ${ticket.priority}
Description: ${ticket.description || "No description provided"}

Provide a professional, helpful response that the support agent can send to the provider.`;
        break;
      }

      case "provider_assistant": {
        const { question, contractDetails, providerName, providerProfile, history } = context;
        systemPrompt = `You are an AI assistant for providers on the ContractPro platform.

<role>
You help providers with questions about their contracts, account, billing, onboarding, and technical issues.
You are transparent about being an AI assistant.
You do NOT make promises about specific timelines, policy changes, or contract modifications.
</role>

<provider_profile>
  <name>${providerName || "Provider"}</name>
  <status>${providerProfile?.status || "Unknown"}</status>
  <provider_type>${providerProfile?.provider_type || "Not specified"}</provider_type>
  <city>${providerProfile?.city || "Unknown"}</city>
  <state>${providerProfile?.state || "Unknown"}</state>
</provider_profile>

<contracts>
${contractDetails || "No contract information available."}
</contracts>

<faq_knowledge>
${FAQ_KNOWLEDGE}
</faq_knowledge>

<escalation_rules>
You MUST suggest creating a support ticket and connecting with a human when the question involves:
- Contract modifications, amendments, or renegotiations
- Billing disputes, payment issues, or refund requests
- Legal concerns, compliance questions, or regulatory inquiries
- Requests to change pricing or contract terms
- Any issue you cannot confidently resolve with the information provided
Use language like: "This is something your account manager can best help with. Would you like me to create a support ticket so they can assist you directly?"
</escalation_rules>

<response_guidelines>
- Be friendly, concise, and helpful
- Reference their specific contract details when answering questions
- Keep responses to 1-3 short paragraphs
- Always be honest about what you can and cannot do
- Suggest specific next steps when possible
</response_guidelines>`;

        userPrompt = `${history?.length ? `Previous conversation:\n${history.map((h: any) => `${h.role === "user" ? "Provider" : "Assistant"}: ${h.content}`).join("\n")}\n\n` : ""}Provider asks: ${question}`;
        break;
      }

      case "coverage_outreach": {
        systemPrompt = `You are a strategic business analyst for ContractPro. You analyze market coverage data and create actionable outreach plans to expand provider networks. Be data-driven, specific, and prioritize by market potential.`;
        const { gaps, regionData, totalProviders, coveredStates } = context;
        userPrompt = `Analyze our coverage data and generate a strategic outreach plan.

Current coverage: ${coveredStates} states covered out of 50, ${totalProviders} total providers.

Coverage gaps (states with no providers):
${gaps?.map((g: any) => `- ${g.name} (${g.abbr}): Population ${(g.population / 1000000).toFixed(1)}M`).join("\n") || "None"}

Regional breakdown:
${regionData?.map((r: any) => `- ${r.region}: ${r.providers} providers, ${r.gaps} gaps, $${r.value.toLocaleString()} total value`).join("\n") || "No data"}

Generate a strategic outreach plan with:
1. **Priority Regions** - Top 5 states/regions to target, ranked by market potential
2. **Approach Strategy** - Recommended outreach methods for each priority area
3. **Market Potential** - Estimated opportunity per region
4. **Recruitment Targets** - Suggested number of providers to recruit per region
5. **Timeline** - Suggested 90-day action plan`;
        break;
      }

      case "pipeline_insights": {
        systemPrompt = `You are a sales analytics expert for ContractPro. Analyze sales pipeline data and provide actionable insights. Be specific about which deals need attention and why. Use data to support recommendations.`;
        const { deals, totalValue, weightedValue, winRate } = context;
        userPrompt = `Analyze this sales pipeline and provide insights.

Pipeline Summary: ${deals?.length || 0} deals, $${totalValue?.toLocaleString() || 0} total, $${Math.round(weightedValue || 0).toLocaleString()} weighted, ${winRate || 0}% win rate.

Active Deals:
${deals?.filter((d: any) => !["closed_won", "closed_lost"].includes(d.stage)).map((d: any) =>
  `- ${d.provider}: $${Number(d.value || 0).toLocaleString()}, Stage: ${d.stage.replace(/_/g, " ")}, Probability: ${d.probability}%, Close date: ${d.closeDate || "Not set"}, Deal type: ${d.dealType || "N/A"}`
).join("\n") || "No active deals"}

Provide:
1. **Pipeline Health Score** (1-100) with explanation
2. **Deals at Risk** - Low probability or overdue deals needing attention
3. **Suggested Actions** - Top 3-5 specific actions to improve pipeline
4. **Monthly Forecast** - Estimated closings this month
5. **Key Insights** - Patterns or concerns in the data`;
        break;
      }

      case "deal_suggestion": {
        systemPrompt = `You are a sales coach for ContractPro. Provide specific, actionable advice for progressing a deal through the pipeline. Be concise and practical.`;
        const { deal } = context;
        userPrompt = `Suggest next steps for this deal:

Provider: ${deal.provider}
Value: $${Number(deal.value || 0).toLocaleString()}
Stage: ${deal.stage.replace(/_/g, " ")}
Probability: ${deal.probability}%
Deal Type: ${deal.dealType || "N/A"}
Expected Close: ${deal.closeDate || "Not set"}
Notes: ${deal.notes || "None"}

Provide 3-5 specific, actionable next steps to advance this deal. Include timing suggestions.`;
        break;
      }

      case "contract_review": {
        systemPrompt = `You are a contract analyst for ContractPro. You review contract terms and provide risk analysis, clause comparisons, and renewal recommendations. Be thorough but concise. Flag any unusual or risky terms.`;
        const { contract } = context;
        userPrompt = `Review this contract and provide analysis:

Provider: ${contract.provider}
Type: ${contract.type}
Value: $${Number(contract.value || 0).toLocaleString()}
Status: ${contract.status}
Start: ${contract.startDate || "N/A"}
End: ${contract.endDate || "N/A"}
Renewal: ${contract.renewalDate || "N/A"}
Terms Summary: ${contract.terms || "No terms documented"}

Provide:
1. **Key Risks** - Any concerning terms or missing protections
2. **Unusual Clauses** - Terms that differ from standard ${contract.type} contracts
3. **Standard Comparison** - How this compares to typical ${contract.type} agreements
4. **Renewal Recommendations** - What to consider for renewal
5. **Overall Assessment** - Brief summary with a risk level (Low/Medium/High)`;
        break;
      }

      case "onboarding_assistant": {
        systemPrompt = `You are an onboarding assistant for providers joining the ContractPro platform. You guide providers through the onboarding process, explain each step, and answer questions about what to expect. Be encouraging, clear, and helpful. Keep responses concise.`;
        const { currentStep, totalSteps, stepName, providerName: onbName, history: onbHistory } = context;
        userPrompt = `${onbHistory?.length ? `Previous messages:\n${onbHistory.map((h: any) => `${h.role}: ${h.content}`).join("\n")}\n` : ""}
Provider "${onbName || "Provider"}" is on step ${currentStep || "?"} of ${totalSteps || "?"}: "${stepName || "Onboarding"}".

Provider asks: ${context.question}

Guide them helpfully. Explain what's needed for the current step and what comes next.`;
        break;
      }

      default:
        throw new Error(`Unknown feature: ${feature}`);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
