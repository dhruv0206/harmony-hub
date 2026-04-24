import { supabase } from "@/integrations/supabase/client";

export type NotificationCategory = 'document' | 'billing' | 'onboarding' | 'sales' | 'support' | 'system' | 'reminder' | 'alert';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

interface CreateNotificationParams {
  userId: string;
  title: string;
  message: string;
  category: NotificationCategory;
  priority?: NotificationPriority;
  link?: string;
  type?: string;
}

export async function createNotification({
  userId,
  title,
  message,
  category,
  priority = 'normal',
  link,
  type = 'info',
}: CreateNotificationParams) {
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    title,
    message,
    category,
    priority,
    link,
    type,
  } as any);
  if (error) console.error("Failed to create notification:", error);
}

/** Send same notification to multiple users */
export async function notifyUsers(
  userIds: string[],
  params: Omit<CreateNotificationParams, 'userId'>
) {
  if (!userIds.length) return;
  const rows = userIds.map(userId => ({
    user_id: userId,
    title: params.title,
    message: params.message,
    category: params.category,
    priority: params.priority || 'normal',
    link: params.link,
    type: params.type || 'info',
  }));
  const { error } = await supabase.from("notifications").insert(rows as any);
  if (error) console.error("Failed to send bulk notifications:", error);
}

/** Get admin user IDs for system notifications */
export async function getAdminUserIds(): Promise<string[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  return data?.map(r => r.user_id) ?? [];
}
