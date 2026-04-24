import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell, CheckCheck, FileText, Headphones, TrendingUp, UserPlus, Info,
  DollarSign, CalendarDays, ShieldAlert, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

const categoryIcons: Record<string, any> = {
  document: FileText,
  billing: DollarSign,
  onboarding: UserPlus,
  sales: TrendingUp,
  support: Headphones,
  system: Info,
  reminder: CalendarDays,
  alert: AlertTriangle,
};

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function groupNotifications(notifications: any[]) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  const groups: { label: string; items: any[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Earlier", items: [] },
  ];

  for (const n of notifications) {
    const t = new Date(n.created_at).getTime();
    if (t >= todayStart) groups[0].items.push(n);
    else if (t >= yesterdayStart) groups[1].items.push(n);
    else groups[2].items.push(n);
  }

  return groups.filter(g => g.items.length > 0);
}

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    enabled: !!user,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("notifications-realtime")
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const unreadCount = notifications?.filter((n) => !n.read).length ?? 0;
  const hasUrgent = notifications?.some((n: any) => !n.read && n.priority === "urgent") ?? false;

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("notifications").update({ read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase.from("notifications").update({ read: true }).eq("user_id", user!.id).eq("read", false);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleClick = (n: any) => {
    if (!n.read) markRead.mutate(n.id);
    if (n.link) { navigate(n.link); setOpen(false); }
  };

  const grouped = groupNotifications(notifications ?? []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className={cn(
              "absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]",
              hasUrgent ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-destructive text-destructive-foreground"
            )}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b">
          <p className="text-sm font-semibold">Notifications</p>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => markAllRead.mutate()}>
                <CheckCheck className="h-3.5 w-3.5 mr-1" />Mark all read
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-[450px]">
          {grouped.length > 0 ? (
            grouped.map(group => (
              <div key={group.label}>
                <div className="px-3 py-1.5 bg-muted/50 border-b">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{group.label}</p>
                </div>
                {group.items.map((n: any) => {
                  const Icon = categoryIcons[(n as any).category] || categoryIcons[n.type] || Info;
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex gap-3 p-3 cursor-pointer hover:bg-muted/50 border-b last:border-0 transition-colors",
                        !n.read && "bg-primary/5",
                        (n as any).priority === "urgent" && !n.read && "border-l-2 border-l-destructive"
                      )}
                      onClick={() => handleClick(n)}
                    >
                      <div className={cn(
                        "mt-0.5 p-1.5 rounded-md",
                        (n as any).priority === "urgent" ? "bg-destructive/10 text-destructive" :
                        (n as any).priority === "high" ? "bg-accent text-accent-foreground" :
                        "bg-muted text-muted-foreground"
                      )}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm truncate", !n.read && "font-medium")}>{n.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                          {(n as any).priority === "urgent" && (
                            <Badge variant="destructive" className="text-[9px] h-4 px-1">Urgent</Badge>
                          )}
                        </div>
                      </div>
                      {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No notifications yet
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { navigate("/notifications"); setOpen(false); }}>
            View All Notifications
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
