import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 4500) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeWebsite = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const firstToken = value.trim().split(/\s+/)[0];
  if (!firstToken) return null;

  const cleaned = firstToken
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/[),.;:!?]+$/g, "");

  if (!cleaned) return null;

  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.hostname.includes(".")) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
};

const checkWebsiteReachable = async (url: string): Promise<boolean> => {
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; LeadFinder/1.0; +https://lovable.dev)",
  };

  const tryRequest = async (target: string, method: "HEAD" | "GET") => {
    const response = await fetchWithTimeout(target, { method, headers });
    return response.ok;
  };

  try {
    if (await tryRequest(url, "HEAD")) return true;
  } catch {}

  try {
    if (await tryRequest(url, "GET")) return true;
  } catch {}

  if (url.startsWith("https://")) {
    const httpFallback = `http://${url.slice("https://".length)}`;
    try {
      if (await tryRequest(httpFallback, "HEAD")) return true;
    } catch {}
    try {
      if (await tryRequest(httpFallback, "GET")) return true;
    } catch {}
  }

  return false;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { category, city, state, zip, radius, action, leads, resultCount, excludeChains } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    if (action === "enrich") {
      const enrichPrompt = `You are a lead scoring and enrichment AI. Analyze these business leads and return enriched data.

For each lead, provide:
- ai_score: 1-100 score based on: likely independent/small business (higher), has website (higher), good ratings (higher), market fit
- business_size: "small", "medium", or "large"
- ai_summary: One sentence explaining why this is a good lead target

Return a JSON array with objects containing: business_name, ai_score, business_size, ai_summary

Leads to analyze:
${JSON.stringify(leads)}`;

      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: "You are a business lead enrichment AI. Return ONLY valid JSON arrays. No markdown, no explanation." },
            { role: "user", content: enrichPrompt }
          ],
          tools: [{
            type: "function",
            function: {
              name: "enrich_leads",
              description: "Return enriched lead data",
              parameters: {
                type: "object",
                properties: {
                  enriched: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        business_name: { type: "string" },
                        ai_score: { type: "integer" },
                        business_size: { type: "string", enum: ["small", "medium", "large"] },
                        ai_summary: { type: "string" }
                      },
                      required: ["business_name", "ai_score", "business_size", "ai_summary"]
                    }
                  }
                },
                required: ["enriched"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "enrich_leads" } }
        }),
      });

      if (!response.ok) {
        const t = await response.text();
        console.error("AI enrichment error:", response.status, t);
        if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (response.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        throw new Error("AI enrichment failed");
      }

      const data = await response.json();
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      let enriched = [];
      if (toolCall) {
        try { enriched = JSON.parse(toolCall.function.arguments).enriched; } catch {}
      }

      return new Response(JSON.stringify({ enriched }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const locationParts = [];
    if (city) locationParts.push(city);
    if (state) locationParts.push(state);
    if (zip) locationParts.push(zip);
    const locationStr = locationParts.join(", ") || "United States";

    const maxResults = resultCount || 20;
    const chainInstruction = excludeChains !== false
      ? "\nEXCLUDE large chain businesses, hospitals, and corporate practices. Focus on independent and small group practices only."
      : "";

    const searchPrompt = `Search for ${category} businesses in ${locationStr}${radius ? ` within ${radius} miles` : ''}.

I need EXACTLY ${maxResults} VERIFIED, real local businesses. This is the minimum target — do NOT stop early. Search thoroughly across the entire area. If the immediate area doesn't have enough, expand your search to nearby cities and surrounding areas until you reach ${maxResults} results.

CRITICAL VERIFICATION RULES — only include a business if ALL of the following are true:
1. You are CERTAIN the business exists and is currently operating (not permanently closed)
2. You can provide a REAL street address (not a P.O. box)
3. You can provide a REAL phone number (10-digit US format)
4. You have verified these details from reliable sources (Google Maps, Yelp, official directories, business listings)

Do NOT make up or guess business details. Do NOT fabricate phone numbers or addresses. Every single entry must be a real, verifiable business.

For each business, provide: business_name, phone, address, city, state, zip_code, website, category, accepts_personal_injury, accepts_paper_billing.

IMPORTANT: Always try to find and include the business website URL. Search for their website — most businesses have one. Only leave website empty if you genuinely cannot find one.

This is for the personal injury industry. For each business:
- accepts_personal_injury: set to "yes" if you are confident the business treats or accepts personal injury clients/patients (e.g. from car accidents, slip and fall, workers comp). Set to "no" if they clearly do not. Set to "unknown" if you're not sure.
- accepts_paper_billing: set to "yes" if you believe the business accepts paper billing / liens / letters of protection (LOP). Set to "no" if they clearly don't. Set to "unknown" if unsure.

Focus on finding real, currently operating local businesses.${chainInstruction}`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a business lead finder that ONLY returns verified, real businesses. Every business you return must have a real phone number, real street address, and be currently operating. Never fabricate or guess details. Return ONLY valid JSON." },
          { role: "user", content: searchPrompt }
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_businesses",
            description: "Return found business leads",
            parameters: {
              type: "object",
              properties: {
                businesses: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      business_name: { type: "string" },
                      phone: { type: "string" },
                      address: { type: "string" },
                      city: { type: "string" },
                      state: { type: "string" },
                      zip_code: { type: "string" },
                      website: { type: "string" },
                      category: { type: "string" },
                      accepts_personal_injury: { type: "string", enum: ["yes", "no", "unknown"] },
                      accepts_paper_billing: { type: "string", enum: ["yes", "no", "unknown"] }
                    },
                    required: ["business_name", "city", "state"]
                  }
                }
              },
              required: ["businesses"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "return_businesses" } }
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI search error:", response.status, t);
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again later" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI search failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let businesses: any[] = [];

    if (toolCall) {
      try {
        businesses = JSON.parse(toolCall.function.arguments).businesses;
      } catch {}
    }

    // Filter out businesses missing critical verification data
    const isValidPhone = (phone: string | null | undefined): boolean => {
      if (!phone) return false;
      const digits = phone.replace(/\D/g, "");
      return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
    };

    businesses = businesses.filter((b) => {
      if (!b.business_name || !b.city || !b.state) return false;
      if (!isValidPhone(b.phone)) return false;
      if (!b.address || b.address.trim().length < 5) return false;
      return true;
    });

    if (businesses.length > 0) {
      businesses = await Promise.all(
        businesses.map(async (business) => {
          const normalizedWebsite = normalizeWebsite(business.website);
          if (!normalizedWebsite) return { ...business, website: null };

          const reachable = await checkWebsiteReachable(normalizedWebsite);
          return {
            ...business,
            website: reachable ? normalizedWebsite : null,
          };
        }),
      );
    }

    return new Response(JSON.stringify({ businesses }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("lead-finder error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
