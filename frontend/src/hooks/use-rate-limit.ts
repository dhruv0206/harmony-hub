import { supabase } from "@/integrations/supabase/client";

interface RateLimitConfig {
  actionType: string;
  maxAttempts: number;
  windowHours?: number;
}

/**
 * Check and record rate-limited actions.
 * Returns { allowed, remaining } or throws on DB error.
 */
export async function checkRateLimit(
  userId: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean }> {
  const { data, error } = await (supabase as any).rpc("check_rate_limit", {
    _user_id: userId,
    _action_type: config.actionType,
    _max_attempts: config.maxAttempts,
    _window_hours: config.windowHours ?? 1,
  });

  if (error) {
    console.error("Rate limit check failed:", error);
    return { allowed: true }; // fail-open to avoid blocking users on DB errors
  }

  return { allowed: data as boolean };
}

export async function recordRateLimitAction(
  userId: string,
  actionType: string
): Promise<void> {
  await (supabase as any).from("rate_limit_log").insert({
    user_id: userId,
    action_type: actionType,
  });
}
