import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribe to Supabase Realtime postgres_changes and invalidate
 * the given query keys whenever a matching event fires.
 */
export function useRealtimeSubscription({
  channelName,
  table,
  schema = "public",
  event = "*",
  filter,
  queryKeys,
  enabled = true,
}: {
  channelName: string;
  table: string;
  schema?: string;
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  filter?: string;
  queryKeys: string[][];
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;

    const channelConfig: any = { event, schema, table };
    if (filter) channelConfig.filter = filter;

    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", channelConfig, () => {
        queryKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, table, schema, event, filter, enabled, queryClient, ...queryKeys.map(k => k.join(","))]);
}
