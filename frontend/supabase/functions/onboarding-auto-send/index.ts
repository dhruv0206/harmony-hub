import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Auto-send documents during onboarding.
 * Called after a provider signs a document to check if the next one in the
 * service package should be sent automatically.
 * 
 * Body: { provider_id: string, signed_document_id?: string }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { provider_id, signed_document_id } = await req.json();
    if (!provider_id) throw new Error("provider_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Get all provider documents ordered by signing_order
    const { data: docs, error } = await supabase
      .from("provider_documents")
      .select("id, template_id, signing_order, status, package_id, file_url, document_templates(name, file_url, document_type)")
      .eq("provider_id", provider_id)
      .neq("status", "voided")
      .order("signing_order");

    if (error) throw error;
    if (!docs || docs.length === 0) {
      return new Response(JSON.stringify({ message: "No documents found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find the next document that needs to be sent
    let nextDoc = null;
    for (const doc of docs) {
      // Skip already sent/signed/executed docs
      if (["sent", "viewed", "signed", "fully_executed"].includes(doc.status || "")) continue;
      // Skip declined (admin will manually re-send)
      if (doc.status === "declined") continue;

      // Check if all previous docs in the package are signed
      const prevDocs = docs.filter(d =>
        d.signing_order != null && doc.signing_order != null &&
        d.signing_order < doc.signing_order &&
        d.package_id === doc.package_id
      );
      const allPrevSigned = prevDocs.every(d =>
        d.status === "signed" || d.status === "fully_executed"
      );

      if (allPrevSigned && doc.status === "pending") {
        nextDoc = doc;
        break;
      }
    }

    if (!nextDoc) {
      return new Response(JSON.stringify({ message: "No next document to send" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tmpl = nextDoc.document_templates as any;
    const fileUrl = tmpl?.file_url || nextDoc.file_url;
    const docName = tmpl?.name || "Document";

    if (!fileUrl) {
      return new Response(JSON.stringify({ message: "Next document has no file uploaded" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send the document
    const now = new Date().toISOString();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 14);

    // Create signature request
    const { data: sigReq, error: sigErr } = await supabase
      .from("signature_requests")
      .insert({
        contract_id: nextDoc.template_id || nextDoc.id,
        provider_id,
        expires_at: expiresAt.toISOString(),
        provider_document_id: nextDoc.id,
        message: `This is the next document in your signing sequence. Please review and sign.`,
      })
      .select()
      .single();

    if (sigErr) throw sigErr;

    // Update provider_document
    await supabase.from("provider_documents").update({
      status: "sent",
      sent_at: now,
      signature_request_id: sigReq.id,
    }).eq("id", nextDoc.id);

    // Notify provider
    const { data: provider } = await supabase
      .from("providers")
      .select("contact_email, business_name")
      .eq("id", provider_id)
      .single();

    if (provider?.contact_email) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", provider.contact_email)
        .maybeSingle();

      if (prof) {
        await supabase.from("notifications").insert({
          user_id: prof.id,
          title: `Next Document Ready: "${docName}"`,
          message: `Your next document is ready for review and signing: ${docName}.`,
          type: "warning",
          link: `/sign/${sigReq.id}`,
        });
      }
    }

    // Log activity
    await supabase.from("activities").insert({
      provider_id,
      activity_type: "status_change",
      description: `Auto-sent next document for signature: "${docName}" (signing order: ${nextDoc.signing_order})`,
    });

    // Check if onboarding workflow needs updating
    const { data: workflows } = await supabase
      .from("onboarding_workflows")
      .select("id")
      .eq("provider_id", provider_id)
      .in("status", ["in_progress", "not_started"])
      .limit(1);

    if (workflows?.length) {
      const { data: sigSteps } = await supabase
        .from("workflow_steps")
        .select("id, status")
        .eq("workflow_id", workflows[0].id)
        .eq("step_type", "e_signature")
        .in("status", ["pending"]);

      if (sigSteps?.length) {
        await supabase.from("workflow_steps").update({
          status: "in_progress" as any,
          notes: `Auto-sent "${docName}" on ${new Date().toLocaleDateString()}.`,
        }).eq("id", sigSteps[0].id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentSent: docName,
        signatureRequestId: sigReq.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("onboarding-auto-send error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
