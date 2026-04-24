import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AIAssistantWidget } from "@/components/ai/AIAssistantWidget";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";

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

const FAQ_ITEMS = [
  { q: "How do I update my business information?", a: "Navigate to your Profile page from the sidebar. You can update your contact info, address, and other details there. Changes are saved automatically." },
  { q: "When will I receive my first payment?", a: "Payments are processed according to your contract terms. Typically, the first payment is issued 30 days after your go-live date. Check your contract for specific terms." },
  { q: "How do I access my contract documents?", a: "Go to 'My Contracts' from the sidebar to view all your contracts, including terms, dates, and deal values." },
  { q: "What should I do if I'm experiencing technical issues?", a: "Submit a support ticket with the category 'Technical' and describe the issue in detail. Our team will investigate and respond within 24 hours for standard issues." },
  { q: "How do I escalate an urgent issue?", a: "When creating a ticket, set the priority to 'Urgent'. Urgent tickets are automatically escalated and monitored for faster resolution." },
  { q: "Can I change my contract type?", a: "Contract modifications require discussion with your assigned sales representative. Submit a ticket under 'Contract Question' and we'll coordinate the change." },
];

export default function Support() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", description: "", category: "general" as string, priority: "medium" as string });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["my-support-tickets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_tickets").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: myProvider } = useQuery({
    queryKey: ["my-provider-for-ai"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single();
      if (!profile?.email) return null;
      const { data: providers } = await supabase.from("providers").select("*").eq("contact_email", profile.email).limit(1);
      return providers?.[0] || null;
    },
  });

  const { data: myContracts } = useQuery({
    queryKey: ["my-contracts-for-ai", myProvider?.id],
    enabled: !!myProvider?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("contract_type, deal_value, status, start_date, end_date, renewal_date, terms_summary")
        .eq("provider_id", myProvider!.id);
      return data ?? [];
    },
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile } = await supabase.from("profiles").select("email").eq("id", user.id).single();
      const { data: providers } = await supabase.from("providers").select("id").eq("contact_email", profile?.email).limit(1);
      if (!providers?.length) throw new Error("No provider record found for your account");
      const { error } = await supabase.from("support_tickets").insert({
        provider_id: providers[0].id,
        subject: form.subject,
        description: form.description,
        category: form.category as any,
        priority: form.priority as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-support-tickets"] });
      setOpen(false);
      setForm({ subject: "", description: "", category: "general", priority: "medium" });
      toast.success("Ticket created successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Support</h1>
          <p className="text-muted-foreground">Get help and track your support requests</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />New Ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Support Ticket</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Subject *</Label>
                <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief description of your issue" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Provide details about your issue..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.ticket_category.map((c) => (
                        <SelectItem key={c} value={c} className="capitalize">{c.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Constants.public.Enums.ticket_priority.map((p) => (
                        <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="w-full" onClick={() => createTicket.mutate()} disabled={!form.subject || createTicket.isPending}>
                {createTicket.isPending ? "Creating..." : "Submit Ticket"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tickets */}
      <Card>
        <CardHeader><CardTitle>My Tickets</CardTitle></CardHeader>
        <CardContent className="p-0">
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
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : tickets && tickets.length > 0 ? (
                tickets.map((t) => (
                  <TableRow key={t.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/support/${t.id}`)}>
                    <TableCell className="font-medium">{t.subject}</TableCell>
                    <TableCell className="capitalize">{t.category.replace(/_/g, " ")}</TableCell>
                    <TableCell><Badge className={`capitalize ${priorityColors[t.priority]}`}>{t.priority}</Badge></TableCell>
                    <TableCell><Badge className={`capitalize ${statusColors[t.status]}`}>{t.status.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No tickets yet. Click "New Ticket" to get started.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Knowledge Base */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5" />Knowledge Base</CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple">
            {FAQ_ITEMS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* AI Assistant Widget */}
      <AIAssistantWidget
        providerName={myProvider?.business_name}
        providerProfile={{
          status: myProvider?.status,
          provider_type: myProvider?.provider_type,
          city: myProvider?.city,
          state: myProvider?.state,
        }}
        contractDetails={myContracts?.map(c =>
          `${c.contract_type} contract — $${Number(c.deal_value || 0).toLocaleString()} — Status: ${c.status} — Ends: ${c.end_date || "N/A"} — Renewal: ${c.renewal_date || "N/A"} — Terms: ${c.terms_summary || "None"}`
        ).join("\n") || undefined}
        onCreateTicket={(subject, description) => {
          setForm({ subject, description, category: "general", priority: "medium" });
          setOpen(true);
        }}
      />
    </div>
  );
}
