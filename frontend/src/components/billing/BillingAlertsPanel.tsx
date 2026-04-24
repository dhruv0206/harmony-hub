import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Check, CheckCircle } from "lucide-react";
import { toast } from "sonner";

const alertTypeBadge: Record<string, string> = {
  past_due_1: "bg-yellow-500/10 text-yellow-700 border-yellow-300",
  past_due_7: "bg-orange-500/10 text-orange-700 border-orange-300",
  past_due_14: "bg-orange-600/10 text-orange-800 border-orange-400",
  past_due_30: "bg-destructive/10 text-destructive border-destructive/30",
  suspension_warning: "bg-red-700/10 text-red-800 border-red-400",
  suspended: "bg-red-900/10 text-red-900 border-red-600",
  payment_failed: "bg-yellow-500/10 text-yellow-700 border-yellow-300",
};

const statusColors: Record<string, string> = {
  active: "bg-destructive/10 text-destructive",
  acknowledged: "bg-yellow-500/10 text-yellow-700",
  resolved: "bg-green-500/10 text-green-700",
};

export default function BillingAlertsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("active");

  const { data: alerts } = useQuery({
    queryKey: ["billing-alerts", statusFilter],
    queryFn: async () => {
      let q = supabase
        .from("billing_alerts")
        .select("*, providers(business_name)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      const { data } = await q;
      return data ?? [];
    },
  });

  const updateAlert = useMutation({
    mutationFn: async ({ id, status, acknowledgedBy }: { id: string; status: string; acknowledgedBy?: string }) => {
      const update: any = { status };
      if (status === "acknowledged" && acknowledgedBy) update.acknowledged_by = acknowledgedBy;
      if (status === "resolved") update.resolved_at = new Date().toISOString();
      const { error } = await supabase.from("billing_alerts").update(update).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert updated");
      queryClient.invalidateQueries({ queryKey: ["billing-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["billing-alerts-count"] });
    },
  });

  const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5 text-destructive" />
          Billing Alerts
        </CardTitle>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {(alerts ?? []).length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(alerts ?? []).map((alert: any) => (
                <TableRow key={alert.id}>
                  <TableCell className="font-medium text-sm">
                    {(alert.providers as any)?.business_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-xs ${alertTypeBadge[alert.alert_type] ?? ""}`}>
                      {alert.alert_type.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={`text-xs ${statusColors[alert.status] ?? ""}`}>
                      {alert.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(alert.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {alert.status === "active" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => updateAlert.mutate({ id: alert.id, status: "acknowledged" })}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Ack
                        </Button>
                      )}
                      {alert.status !== "resolved" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => updateAlert.mutate({ id: alert.id, status: "resolved" })}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">No billing alerts.</p>
        )}
      </CardContent>
    </Card>
  );
}
