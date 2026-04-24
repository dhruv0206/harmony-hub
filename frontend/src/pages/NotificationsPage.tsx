import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Bell, FileText, DollarSign, UserPlus, TrendingUp, Headphones,
  Info, CalendarDays, AlertTriangle, CheckCheck, Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

const categoryIcons: Record<string, any> = {
  document: FileText, billing: DollarSign, onboarding: UserPlus,
  sales: TrendingUp, support: Headphones, system: Info,
  reminder: CalendarDays, alert: AlertTriangle,
};

const CATEGORIES = ['all', 'document', 'billing', 'onboarding', 'sales', 'support', 'system', 'reminder', 'alert'];
const PRIORITIES = ['all', 'low', 'normal', 'high', 'urgent'];
const READ_FILTERS = ['all', 'unread', 'read'];

function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [category, setCategory] = useState("all");
  const [priority, setPriority] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: notifications } = useQuery({
    queryKey: ["all-notifications", category, priority, readFilter],
    queryFn: async () => {
      let q = supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (category !== "all") q = q.eq("category", category);
      if (priority !== "all") q = q.eq("priority", priority);
      if (readFilter === "unread") q = q.eq("read", false);
      if (readFilter === "read") q = q.eq("read", true);

      const { data } = await q;
      return data ?? [];
    },
    enabled: !!user,
  });

  const filtered = (notifications ?? []).filter(n => {
    if (!search) return true;
    const s = search.toLowerCase();
    return n.title.toLowerCase().includes(s) || n.message.toLowerCase().includes(s);
  });

  const markBulkRead = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      if (!ids.length) return;
      await supabase.from("notifications").update({ read: true }).in("id", ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      setSelected(new Set());
    },
  });

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(n => n.id)));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-7 w-7" /> Notifications
          </h1>
          <p className="text-muted-foreground">All your notifications in one place</p>
        </div>
        {selected.size > 0 && (
          <Button onClick={() => markBulkRead.mutate()} disabled={markBulkRead.isPending}>
            <CheckCheck className="h-4 w-4 mr-2" />
            Mark {selected.size} as Read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search notifications..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c === 'all' ? 'All Categories' : c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p === 'all' ? 'All Priorities' : p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            {READ_FILTERS.map(r => <SelectItem key={r} value={r} className="capitalize">{r === 'all' ? 'All' : r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Notifications list */}
      <Card>
        <CardHeader className="py-3 px-4 border-b">
          <div className="flex items-center gap-3">
            <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={selectAll} />
            <CardTitle className="text-sm font-medium">{filtered.length} notification{filtered.length !== 1 ? 's' : ''}</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No notifications found</div>
          ) : (
            filtered.map(n => {
              const Icon = categoryIcons[(n as any).category] || Info;
              return (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 p-4 border-b last:border-0 hover:bg-muted/30 transition-colors",
                    !n.read && "bg-primary/5",
                    (n as any).priority === "urgent" && !n.read && "border-l-2 border-l-destructive"
                  )}
                >
                  <Checkbox
                    checked={selected.has(n.id)}
                    onCheckedChange={() => toggleSelect(n.id)}
                    className="mt-1"
                  />
                  <div
                    className={cn(
                      "p-2 rounded-md shrink-0",
                      (n as any).priority === "urgent" ? "bg-destructive/10 text-destructive" :
                      (n as any).priority === "high" ? "bg-accent text-accent-foreground" :
                      "bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => { if (n.link) navigate(n.link); }}
                  >
                    <div className="flex items-center gap-2">
                      <p className={cn("text-sm", !n.read && "font-semibold")}>{n.title}</p>
                      {(n as any).priority === "urgent" && <Badge variant="destructive" className="text-[10px] h-4">Urgent</Badge>}
                      {(n as any).priority === "high" && <Badge className="text-[10px] h-4 bg-accent text-accent-foreground">High</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] capitalize">{(n as any).category || n.type}</Badge>
                      <span className="text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </div>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
