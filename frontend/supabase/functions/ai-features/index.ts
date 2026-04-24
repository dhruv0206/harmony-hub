import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const callAI = async (apiKey: string, messages: any[], tools?: any[], tool_choice?: any) => {
  const body: any = { model: "gemini-2.5-flash", messages };
  if (tools) { body.tools = tools; body.tool_choice = tool_choice; }

  const response = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const t = await response.text();
    console.error("AI error:", response.status, t);
    if (response.status === 429) return { _error: true, status: 429, message: "Rate limited, try again later" };
    if (response.status === 402) return { _error: true, status: 402, message: "Credits exhausted" };
    throw new Error(`AI error ${response.status}`);
  }
  return await response.json();
};

const jsonRes = (data: any, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...params } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    switch (action) {
      // ─── TONE PREVIEW ────────────────────────────────────────
      case "tone_preview": {
        const { style, custom_persona, sample_question } = params;
        const tonePrompts: Record<string, string> = {
          professional: "You are a professional business advisor. Communicate clearly, formally, and with authority. Use industry terminology appropriately.",
          friendly: "You are warm, friendly, and approachable. Use conversational language, occasional emojis, and make people feel comfortable. Be encouraging.",
          expert: "You are a deep industry expert in healthcare provider networks and personal injury law. Reference specific regulations, best practices, and provide authoritative insights.",
          concise: "You are extremely concise and direct. Use short sentences. No filler words. Get to the point immediately. Bullet points when possible.",
        };
        const systemPrompt = `${tonePrompts[style] || tonePrompts.professional}\n\nYou work for a healthcare provider network management platform focused on the personal injury industry. Answer questions helpfully.${custom_persona ? `\n\nAdditional instructions: ${custom_persona}` : ''}`;

        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: systemPrompt },
          { role: "user", content: sample_question || "What happens when my contract expires?" },
        ]);
        if (data._error) return jsonRes({ error: data.message }, data.status);

        return jsonRes({
          response: data.choices?.[0]?.message?.content || "No response generated",
          tokens: data.usage?.total_tokens || 0,
        });
      }

      // ─── PROVIDER HEALTH SCORE ────────────────────────────────
      case "health_score": {
        const { provider } = params;
        const prompt = `Analyze this provider's health and give a score 0-100 with detailed reasoning.

Provider data:
- Name: ${provider.business_name}
- Status: ${provider.status}
- Contract status: ${provider.contract_status || 'unknown'}
- Contract end date: ${provider.contract_end_date || 'unknown'}
- Support tickets (last 30 days): ${provider.recent_tickets || 0}
- Last activity: ${provider.last_activity || 'unknown'}
- Days since last contact: ${provider.days_since_contact || 'unknown'}

Score factors:
- Contract renewal proximity (closer = lower score if no renewal discussion)
- Support ticket frequency (more tickets = lower score)
- Activity recency (less recent = lower score)
- Engagement level

Return a health score, risk level, key factors, and recommended actions.`;

        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a provider health analyst. Score providers on a 0-100 scale. Return structured data." },
          { role: "user", content: prompt },
        ], [{
          type: "function",
          function: {
            name: "return_health_score",
            description: "Return the provider health analysis",
            parameters: {
              type: "object",
              properties: {
                score: { type: "integer", description: "0-100 health score" },
                risk_level: { type: "string", enum: ["healthy", "monitor", "at_risk", "critical"] },
                factors: { type: "array", items: { type: "object", properties: { factor: { type: "string" }, impact: { type: "string", enum: ["positive", "negative", "neutral"] }, detail: { type: "string" } }, required: ["factor", "impact", "detail"] } },
                recommendations: { type: "array", items: { type: "string" } },
                summary: { type: "string" }
              },
              required: ["score", "risk_level", "factors", "recommendations", "summary"]
            }
          }
        }], { type: "function", function: { name: "return_health_score" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = { score: 50, risk_level: "monitor", factors: [], recommendations: [], summary: "Unable to analyze" };
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ health: result, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── SMART FOLLOW-UP WRITER ───────────────────────────────
      case "follow_up_writer": {
        const { provider, pipeline_stage, last_contact, activities, open_issues } = params;
        const prompt = `Write personalized follow-up content for this provider:

Provider: ${provider.business_name} (${provider.contact_name || 'unknown contact'})
Pipeline Stage: ${pipeline_stage || 'unknown'}
Last Contact: ${last_contact || 'unknown'}
Recent Activities: ${JSON.stringify(activities || [])}
Open Issues: ${JSON.stringify(open_issues || [])}

Generate:
1. A ready-to-send follow-up email (professional, personal injury industry context)
2. A call script with talking points
3. Suggested next steps`;

        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a sales communication expert specializing in healthcare provider networks for the personal injury industry. Write compelling, personalized follow-up content." },
          { role: "user", content: prompt },
        ], [{
          type: "function",
          function: {
            name: "return_follow_up",
            description: "Return follow-up content",
            parameters: {
              type: "object",
              properties: {
                email_subject: { type: "string" },
                email_body: { type: "string" },
                call_script: { type: "string" },
                talking_points: { type: "array", items: { type: "string" } },
                next_steps: { type: "array", items: { type: "string" } }
              },
              required: ["email_subject", "email_body", "call_script", "talking_points", "next_steps"]
            }
          }
        }], { type: "function", function: { name: "return_follow_up" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = {};
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ follow_up: result, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── NEGOTIATION COACH ────────────────────────────────────
      case "negotiation_coach": {
        const { deal, provider, comparable_deals, coverage_area } = params;
        const prompt = `Provide negotiation coaching for this deal:

Deal: ${deal.stage} stage, estimated value $${deal.estimated_value || 'TBD'}
Deal Type: ${deal.deal_type || 'standard'}
Provider: ${provider.business_name} in ${provider.city}, ${provider.state}
Provider Type: ${provider.provider_type || 'unknown'}
Coverage Area: ${coverage_area || 'standard'}
Comparable Deals: ${JSON.stringify(comparable_deals || [])}

Analyze leverage, suggest pricing, concession strategy, and walk-away threshold.
Consider personal injury industry specifics: lien-based billing, paper billing capabilities, patient volume potential.`;

        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are an expert deal negotiation coach for healthcare provider networks in the personal injury industry. Provide specific, actionable negotiation advice." },
          { role: "user", content: prompt },
        ], [{
          type: "function",
          function: {
            name: "return_coaching",
            description: "Return negotiation coaching",
            parameters: {
              type: "object",
              properties: {
                leverage_points: { type: "array", items: { type: "string" } },
                suggested_pricing: { type: "string" },
                concession_strategy: { type: "string" },
                walk_away_threshold: { type: "string" },
                talking_points: { type: "array", items: { type: "string" } },
                risks: { type: "array", items: { type: "string" } },
                summary: { type: "string" }
              },
              required: ["leverage_points", "suggested_pricing", "concession_strategy", "walk_away_threshold", "talking_points", "summary"]
            }
          }
        }], { type: "function", function: { name: "return_coaching" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = {};
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ coaching: result, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── CHURN ANALYSIS ───────────────────────────────────────
      case "churn_analysis": {
        const { providers } = params;
        const prompt = `Analyze these providers for churn risk. For each, estimate churn probability (0-100%) for next 30, 60, and 90 days.

Providers:
${JSON.stringify(providers)}

Consider: ticket sentiment, activity recency, contract expiry, engagement patterns.`;

        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a churn prediction expert. Analyze provider data and predict churn risk with specific retention strategies." },
          { role: "user", content: prompt },
        ], [{
          type: "function",
          function: {
            name: "return_churn_analysis",
            description: "Return churn predictions",
            parameters: {
              type: "object",
              properties: {
                predictions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      provider_name: { type: "string" },
                      churn_30d: { type: "integer" },
                      churn_60d: { type: "integer" },
                      churn_90d: { type: "integer" },
                      key_risk_factors: { type: "array", items: { type: "string" } },
                      retention_strategy: { type: "string" }
                    },
                    required: ["provider_name", "churn_30d", "churn_60d", "churn_90d", "key_risk_factors", "retention_strategy"]
                  }
                }
              },
              required: ["predictions"]
            }
          }
        }], { type: "function", function: { name: "return_churn_analysis" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = { predictions: [] };
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ churn: result, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── TOPIC EXTRACTION ────────────────────────────────────
      case "extract_topics": {
        const { messages } = params;
        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a text analysis expert. Extract common topics/themes from provider messages." },
          { role: "user", content: `Analyze these provider messages and extract the top 20 topics/themes. Group similar topics together. For each topic, provide a frequency count and 2-3 example paraphrased questions.\n\nMessages:\n${JSON.stringify(messages.slice(0, 200))}` },
        ], [{
          type: "function",
          function: {
            name: "return_topics",
            description: "Return extracted topics",
            parameters: {
              type: "object",
              properties: {
                topics: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      topic: { type: "string" },
                      frequency: { type: "integer" },
                      examples: { type: "array", items: { type: "string" } }
                    },
                    required: ["topic", "frequency", "examples"]
                  }
                }
              },
              required: ["topics"]
            }
          }
        }], { type: "function", function: { name: "return_topics" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = { topics: [] };
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ ...result, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── CONFUSED SECTIONS ───────────────────────────────────
      case "confused_sections": {
        const { sessions } = params;
        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a contract analysis expert. Identify which contract sections confuse providers most." },
          { role: "user", content: `Analyze these contract review sessions. Identify the top 3 most-asked-about contract sections per document, with percentage estimates and actionable insights.\n\nSessions:\n${JSON.stringify(sessions.slice(0, 100))}` },
        ], [{
          type: "function",
          function: {
            name: "return_confused_sections",
            description: "Return confused sections analysis",
            parameters: {
              type: "object",
              properties: {
                documents: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      document_name: { type: "string" },
                      sections: { type: "array", items: { type: "object", properties: { section_name: { type: "string" }, percentage: { type: "integer" }, insight: { type: "string" } }, required: ["section_name", "percentage", "insight"] } }
                    },
                    required: ["document_name", "sections"]
                  }
                }
              },
              required: ["documents"]
            }
          }
        }], { type: "function", function: { name: "return_confused_sections" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = { documents: [] };
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ ...result, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── SENTIMENT ANALYSIS ──────────────────────────────────
      case "sentiment_analysis": {
        const { messages_by_month } = params;
        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a sentiment analysis expert. Score provider message sentiment." },
          { role: "user", content: `Score the average sentiment for each month's messages on a scale of -1 (very negative) to +1 (very positive). Also give a current trend assessment.\n\nMessages by month:\n${JSON.stringify(messages_by_month)}` },
        ], [{
          type: "function",
          function: {
            name: "return_sentiment",
            description: "Return sentiment scores",
            parameters: {
              type: "object",
              properties: {
                monthly_scores: { type: "array", items: { type: "object", properties: { month: { type: "string" }, score: { type: "number" }, label: { type: "string", enum: ["positive", "neutral", "negative"] } }, required: ["month", "score", "label"] } },
                trend: { type: "string" },
                current_vs_last: { type: "string" }
              },
              required: ["monthly_scores", "trend", "current_vs_last"]
            }
          }
        }], { type: "function", function: { name: "return_sentiment" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = { monthly_scores: [], trend: "", current_vs_last: "" };
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ ...result, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── MONTHLY REPORT ──────────────────────────────────────
      case "monthly_report": {
        const { topics, sentiment, effectiveness, ticket_trends, confused_sections } = params;
        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a business analyst. Write a concise, insightful monthly report on AI-powered provider interactions." },
          { role: "user", content: `Generate a monthly analytics report based on this data:\n\nTop Topics: ${JSON.stringify(topics)}\nSentiment: ${JSON.stringify(sentiment)}\nAI Effectiveness: ${JSON.stringify(effectiveness)}\nTicket Trends: ${JSON.stringify(ticket_trends)}\nConfused Sections: ${JSON.stringify(confused_sections)}\n\nWrite sections: Key Trends, Provider Pain Points, Process Improvements, Month-over-Month Comparison. Use markdown formatting.` },
        ]);

        if (data._error) return jsonRes({ error: data.message }, data.status);
        return jsonRes({ report: data.choices?.[0]?.message?.content || "Unable to generate report", tokens: data.usage?.total_tokens || 0 });
      }

      // ─── AUTO-PLACE SIGNING FIELDS ─────────────────────────
      case "auto_place_fields": {
        const { document_text, document_name, total_pages } = params;
        const prompt = `Analyze this document and identify every place where someone needs to sign, initial, fill in text, check a checkbox, or enter a date.

Document name: ${document_name}
Total pages: ${total_pages}

Document text:
${(document_text || "").slice(0, 12000)}

For each field, return:
- field_type: "signature", "initials", "checkbox", "text", or "date"
- field_label: descriptive label (e.g. "Provider Signature", "NPI Number")
- assigned_to: "provider" or "admin"
- page_number: which page (1-${total_pages})
- x_position: percentage from left (0-100). For right-column table cells use 50-75, for full-width fields use 5-10, for fields after a label use 35-50.
- y_position: percentage from top of that page (0-100). Distribute evenly based on position in document.
- width_pct: width as % of page. Signature=25, text=30, checkbox=2.5, initials=6, date=15.
- height_pct: height as % of page. Signature=4, text=2.5, checkbox=2, initials=2.5, date=2.5.
- is_required: boolean
- placeholder_text: hint text for text fields

Rules:
- Look for blank lines after labels like "Name:", "NPI:", "Date:", "Signature:"
- Look for signature blocks (Printed Name, Title, Signature, Date)
- Look for checkbox lists like "[ ] Yes [ ] No"
- Look for initial lines next to paragraphs
- "FOR OFFICE USE ONLY" sections are assigned_to: "admin"
- Most fields are assigned_to: "provider"`;

        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a document analysis expert. Identify all form fields in legal/business documents. Return structured data only." },
          { role: "user", content: prompt },
        ], [{
          type: "function",
          function: {
            name: "return_fields",
            description: "Return identified signing fields",
            parameters: {
              type: "object",
              properties: {
                fields: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field_type: { type: "string", enum: ["signature", "initials", "checkbox", "text", "date"] },
                      field_label: { type: "string" },
                      assigned_to: { type: "string", enum: ["provider", "admin"] },
                      page_number: { type: "integer" },
                      x_position: { type: "number" },
                      y_position: { type: "number" },
                      width_pct: { type: "number" },
                      height_pct: { type: "number" },
                      is_required: { type: "boolean" },
                      placeholder_text: { type: "string" },
                      checkbox_label: { type: "string" }
                    },
                    required: ["field_type", "field_label", "assigned_to", "page_number", "x_position", "y_position", "width_pct", "height_pct"]
                  }
                }
              },
              required: ["fields"]
            }
          }
        }], { type: "function", function: { name: "return_fields" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = { fields: [] };
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ fields: result.fields, tokens: data.usage?.total_tokens || 0 });
      }

      // ─── SUGGEST SIGNING FIELDS (no positions) ─────────────
      case "suggest_signing_fields": {
        const { document_text, document_name } = params;
        const prompt = `Analyze this document and list every field that needs to be filled in or signed.

Document name: ${document_name}

Document text:
${(document_text || "").slice(0, 10000)}

For each field, return:
- field_type: "signature", "initials", "checkbox", "text", or "date"
- field_label: a descriptive name (e.g., "Provider Legal Name", "NPI Number", "Provider Signature")
- assigned_to: "provider" if the provider/signer fills it, "admin" if for internal office use
- section: which section of the document this belongs to

Rules:
- Look for blank lines after labels like "Name:", "NPI:", "Date:", "Signature:"
- Look for signature blocks (Printed Name, Title, Signature, Date)
- Look for checkbox lists
- Look for initial lines next to paragraphs
- "FOR OFFICE USE ONLY" sections are assigned_to: "admin"
- Most fields are assigned_to: "provider"
- Do NOT guess positions — only identify WHAT fields exist.`;

        const data = await callAI(GEMINI_API_KEY, [
          { role: "system", content: "You are a document analysis expert. Identify all form fields in legal/business documents." },
          { role: "user", content: prompt },
        ], [{
          type: "function",
          function: {
            name: "return_suggestions",
            description: "Return identified field suggestions",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      field_type: { type: "string", enum: ["signature", "initials", "checkbox", "text", "date"] },
                      field_label: { type: "string" },
                      assigned_to: { type: "string", enum: ["provider", "admin"] },
                      section: { type: "string" },
                    },
                    required: ["field_type", "field_label", "assigned_to"]
                  }
                }
              },
              required: ["suggestions"]
            }
          }
        }], { type: "function", function: { name: "return_suggestions" } });

        if (data._error) return jsonRes({ error: data.message }, data.status);
        const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
        let result = { suggestions: [] };
        if (toolCall) { try { result = JSON.parse(toolCall.function.arguments); } catch {} }
        return jsonRes({ suggestions: result.suggestions, tokens: data.usage?.total_tokens || 0 });
      }

      default:
        return jsonRes({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    console.error("ai-features error:", e);
    return jsonRes({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
