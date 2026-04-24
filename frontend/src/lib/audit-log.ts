import { supabase } from "@/integrations/supabase/client";

export type AuditAction =
  | "document.sent" | "document.viewed" | "document.signed" | "document.counter_signed" | "document.voided"
  | "provider.status_changed" | "provider.created" | "provider.updated"
  | "law_firm.status_changed" | "law_firm.created" | "law_firm.updated"
  | "contract.created" | "contract.updated" | "contract.renewed" | "contract.expired"
  | "invoice.generated" | "invoice.sent" | "invoice.paid" | "invoice.voided"
  | "subscription.created" | "subscription.updated" | "subscription.suspended" | "subscription.reactivated"
  | "ticket.created" | "ticket.replied" | "ticket.resolved"
  | "onboarding.stage_changed" | "onboarding.completed"
  | "billing.tier_changed" | "billing.rate_changed" | "billing.payment_recorded"
  | "campaign.created" | "campaign.updated"
  | "lead.stage_changed" | "lead.converted" | "lead.marked_dead"
  | "user.login" | "user.role_changed"
  | string;

export type EntityType =
  | "provider" | "law_firm" | "contract" | "document" | "invoice"
  | "subscription" | "ticket" | "onboarding" | "campaign" | "lead" | "user"
  | string;

export type ActorType = "admin" | "sales_rep" | "provider" | "law_firm" | "system" | "ai";

interface AuditLogEntry {
  action: AuditAction;
  entity_type: EntityType;
  entity_id: string;
  actor_id?: string | null;
  actor_type?: ActorType;
  details?: Record<string, any>;
}

export async function logAudit(entry: AuditLogEntry) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log" as any).insert({
      actor_id: entry.actor_id ?? user?.id ?? null,
      actor_type: entry.actor_type ?? "admin",
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      details: entry.details ?? {},
    });
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}
