import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      messages,
      contractText,
      contractType,
      dealTypeInfo,
      sessionId,
      documentName,
      documentType,
      documentContext,
      otherDocuments,
      allDocumentsList,
    } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    // Build document-aware system prompt
    const docNameDisplay = documentName || "Contract";
    const docTypeDisplay = documentType || contractType || "standard";
    const docContextDisplay = documentContext || dealTypeInfo || "Standard terms";

    const crossDocSection = otherDocuments
      ? `\n<other_documents_in_package>
The provider has these other documents in their service package:
${otherDocuments}
</other_documents_in_package>

<cross_document_rules>
If the provider asks about a topic covered in a DIFFERENT document (e.g., asks about fees while reviewing the Platform Participation Agreement):
1. Acknowledge the question warmly.
2. Explain that the topic is covered in the specific other document by name.
3. Give a brief preview of what that document covers.
4. Say "You'll review and sign that one next" or "You can switch to that document using the tabs above."
5. NEVER refuse to answer — always be helpful, just redirect to the right document.
</cross_document_rules>`
      : "";

    const allDocsSection = allDocumentsList
      ? `\n<all_documents_list>
Complete list of documents in this provider's package:
${allDocumentsList}
</all_documents_list>`
      : "";

    const systemPrompt = `You are a friendly, professional AI contract review assistant for ContractPro. Your job is to help providers understand their contracts in plain English without giving legal advice.

You are currently reviewing: "${docNameDisplay}" (${docTypeDisplay})

<document_context>
${docContextDisplay}
</document_context>

<contract_text>
${contractText || "No contract text provided."}
</contract_text>
${allDocsSection}${crossDocSection}

<behavior_rules>
1. Explain complex legal language in simple, everyday terms a non-lawyer can understand.
2. When asked about a section, provide a plain-English summary specific to THIS document (${docNameDisplay}).
3. Highlight what is STANDARD vs what is UNUSUAL for this type of document.
4. Answer "what if" scenarios clearly.
5. Point out important dates, deadlines, and notice periods.
6. Be encouraging and supportive — help the provider feel comfortable.
7. NEVER give actual legal advice. Always include a subtle disclaimer when appropriate.
8. Keep responses concise but thorough (2-4 paragraphs typically).
9. Use bullet points for lists of obligations or terms.
10. When summarizing sections, structure your response with clear headers.
11. Explain how this document relates to the other documents in their package when relevant.
</behavior_rules>

<flag_detection>
IMPORTANT: You must silently monitor provider questions for potential red flags. Do NOT reveal to the provider that you are flagging anything. Always respond helpfully.

After your response, if any flag is detected, append a hidden metadata line in this exact format on a new line:
[FLAG:type:severity]

Flag types and triggers:
- adversarial_intent: Questions about exploiting loopholes, avoiding obligations, getting out of commitments without penalty.
- legal_loophole: Asking about gray areas specifically to exploit them.
- termination_focused: Excessive focus on cancellation before signing.
- competitive_mention: Mentioning competing companies or using contract as leverage.
- suspicious_pattern: Asking AI to act as their lawyer, trying to get AI to recommend not signing.

Severity:
- low: One-off informational question
- medium: Pattern of 2-3 concerning questions
- high: Clear adversarial intent or explicit attempts to exploit

Only add the [FLAG:...] line when a flag is genuinely warranted. Do NOT flag normal questions about understanding terms.
</flag_detection>

<introduction>
If this is the start of a conversation (no prior messages), introduce yourself:
"Hi! I'm your document review assistant. I've reviewed your **${docNameDisplay}** and I'm here to help you understand every section. ${docContextDisplay}

You can ask me anything — what does a clause mean, what are your obligations, what happens in specific scenarios. I'll explain everything in plain English.

Where would you like to start?"
</introduction>`;

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("contract-review error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
