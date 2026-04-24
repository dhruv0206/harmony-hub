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
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch all pending/viewed signature requests that haven't expired
    const { data: requests, error } = await supabase
      .from("signature_requests")
      .select("id, provider_id, created_at, expires_at, status, message, providers(business_name, contact_email), provider_document_id")
      .in("status", ["pending", "viewed"])
      .gt("expires_at", now.toISOString());

    if (error) throw error;

    let remindersSent = 0;
    let adminAlerts = 0;

    for (const req of requests || []) {
      const sentAt = new Date(req.created_at);
      const expiresAt = req.expires_at ? new Date(req.expires_at) : null;
      const daysSinceSent = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24);
      const daysUntilExpiry = expiresAt ? (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24) : Infinity;

      const email = (req.providers as any)?.contact_email;
      if (!email) continue;

      // Find provider's profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (!prof) continue;

      const providerName = (req.providers as any)?.business_name || "Provider";

      // Check existing reminders to avoid duplicates (via activity log)
      const { data: recentActivities } = await supabase
        .from("activities")
        .select("id, description, created_at")
        .eq("provider_id", req.provider_id)
        .ilike("description", `%reminder%${req.id.slice(0, 8)}%`)
        .gte("created_at", threeDaysAgo)
        .limit(1);

      const alreadyReminded = (recentActivities?.length || 0) > 0;

      // 3-day reminder
      if (daysSinceSent >= 3 && daysSinceSent < 7 && !alreadyReminded) {
        await supabase.from("notifications").insert({
          user_id: prof.id,
          title: "Reminder: Document awaiting your signature",
          message: `You have a document waiting for your review and signature. Please complete it at your earliest convenience.`,
          type: "warning",
          link: `/sign/${req.id}`,
        });

        await supabase.from("activities").insert({
          provider_id: req.provider_id,
          activity_type: "email",
          description: `Auto-reminder sent: 3-day follow-up for signature request ${req.id.slice(0, 8)}`,
        });

        remindersSent++;
      }

      // 7-day reminder + admin alert
      if (daysSinceSent >= 7 && !alreadyReminded) {
        await supabase.from("notifications").insert({
          user_id: prof.id,
          title: "Second Reminder: Document still awaiting signature",
          message: `This is your second reminder. Your document is still pending signature. Please complete it soon to avoid expiration.`,
          type: "warning",
          link: `/sign/${req.id}`,
        });

        // Notify all admins
        const { data: admins } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");

        for (const admin of admins || []) {
          await supabase.from("notifications").insert({
            user_id: admin.user_id,
            title: `${providerName} hasn't signed after 7 days`,
            message: `A document has been pending signature from ${providerName} for over 7 days.`,
            type: "warning",
            link: `/signatures`,
          });
          adminAlerts++;
        }

        await supabase.from("activities").insert({
          provider_id: req.provider_id,
          activity_type: "email",
          description: `Auto-reminder sent: 7-day follow-up + admin alerted for ${req.id.slice(0, 8)}`,
        });

        remindersSent++;
      }

      // 2 days before expiration
      if (daysUntilExpiry <= 2 && daysUntilExpiry > 0) {
        const { data: expiryActivities } = await supabase
          .from("activities")
          .select("id")
          .eq("provider_id", req.provider_id)
          .ilike("description", `%expiry warning%${req.id.slice(0, 8)}%`)
          .limit(1);

        if (!expiryActivities?.length) {
          await supabase.from("notifications").insert({
            user_id: prof.id,
            title: "Urgent: Document expiring soon",
            message: `Your document will expire in less than 2 days. Please sign it immediately.`,
            type: "warning",
            link: `/sign/${req.id}`,
          });

          // Notify admins
          const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "admin");
          for (const admin of admins || []) {
            await supabase.from("notifications").insert({
              user_id: admin.user_id,
              title: `${providerName}'s document expiring in 2 days`,
              message: `A signature request for ${providerName} will expire soon.`,
              type: "warning",
              link: `/signatures`,
            });
            adminAlerts++;
          }

          await supabase.from("activities").insert({
            provider_id: req.provider_id,
            activity_type: "email",
            description: `Auto-reminder sent: expiry warning for ${req.id.slice(0, 8)}`,
          });

          remindersSent++;
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, remindersSent, adminAlerts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("document-reminders error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
