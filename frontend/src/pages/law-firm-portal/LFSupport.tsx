import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/use-law-firm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import { format } from "date-fns";

const priorityColors: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-warning/10 text-warning",
  urgent: "bg-destructive/10 text-destructive",
};

const statusColors: Record<string, string> = {
  open: "bg-primary/10 text-primary",
  in_progress: "bg-warning/10 text-warning",
  waiting_on_provider: "bg-muted text-muted-foreground",
  resolved: "bg-success/10 text-success",
  closed: "bg-muted text-muted-foreground",
};

export default function LFSupport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: lawFirm } = useLawFirm();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", category: "general", priority: "medium" });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["lf-support-tickets", lawFirm?.id],
    queryFn: async () => {
      // Support tickets use provider_id - for law firms we query by law firm id
      const { data } = await supabase.from("support_tickets").select("*").eq("provider_id", lawFirm!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!lawFirm?.id,
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!lawFirm) throw new Error("No law firm record");
      const { error } = await supabase.from("support_tickets").insert({
        provider_id: lawFirm.id,
        subject: form.subject,
        description: form.description,
        category: form.category as any,
        priority: form.priority as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lf-support-tickets"] });
      setOpen(false);
      setForm({ subject: "", description: "", category: "general", priority: "medium" });
      toast.success("Ticket created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Support</h1>
          <p className="text-sm text-muted-foreground mt-1">Submit tickets and get help.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Ticket
        </Button>
      </div>

      <Card>
        <CardHeader><CardTitle>My Tickets</CardTitle></CardHeader>
        <CardContent>
          {tickets && tickets.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map(t => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => navigate(`/lf/support/${t.id}`)}>
                    <TableCell className="font-medium">{t.subject}</TableCell>
                    <TableCell className="capitalize">{t.category.replace(/_/g, " ")}</TableCell>
                    <TableCell><Badge className={priorityColors[t.priority]}>{t.priority}</Badge></TableCell>
                    <TableCell><Badge className={statusColors[t.status]}>{t.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-sm">{format(new Date(t.created_at), "MMM d, yyyy")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No support tickets yet.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create Support Ticket</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Subject *</Label>
              <Input value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Brief description" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.ticket_category.map(c => (
                      <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={v => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Constants.public.Enums.ticket_priority.map(p => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button className="w-full" disabled={!form.subject || createTicket.isPending} onClick={() => createTicket.mutate()}>
              {createTicket.isPending ? "Creating..." : "Submit Ticket"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
