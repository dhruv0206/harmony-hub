import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { toast } from "sonner";

interface DealTypeForm {
  name: string;
  description: string;
  default_terms: string;
  commission_rate: string;
  color: string;
}

const emptyForm: DealTypeForm = { name: "", description: "", default_terms: "", commission_rate: "", color: "#3b82f6" };

export default function DealTypes() {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<DealTypeForm>(emptyForm);

  const { data: dealTypes, isLoading } = useQuery({
    queryKey: ["deal_types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deal_types").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Contract stats per deal type (via pipeline)
  const { data: contractStats } = useQuery({
    queryKey: ["deal_type_stats"],
    queryFn: async () => {
      const { data: pipeline, error: pErr } = await supabase
        .from("sales_pipeline")
        .select("deal_type_id, provider_id, estimated_value");
      if (pErr) throw pErr;

      const { data: contracts, error: cErr } = await supabase
        .from("contracts")
        .select("provider_id, deal_value, status");
      if (cErr) throw cErr;

      // Map provider->deal_type from pipeline
      const providerDealType: Record<string, string> = {};
      pipeline?.forEach((p) => { if (p.deal_type_id && p.provider_id) providerDealType[p.provider_id] = p.deal_type_id; });

      // Aggregate by deal_type
      const stats: Record<string, { active: number; total: number; value: number }> = {};
      contracts?.forEach((c) => {
        const dtId = providerDealType[c.provider_id];
        if (!dtId) return;
        if (!stats[dtId]) stats[dtId] = { active: 0, total: 0, value: 0 };
        stats[dtId].total++;
        if (c.status === "active" || c.status === "signed") stats[dtId].active++;
        stats[dtId].value += Number(c.deal_value || 0);
      });
      return stats;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        description: form.description || null,
        default_terms: form.default_terms || null,
        commission_rate: form.commission_rate ? Number(form.commission_rate) : null,
        color: form.color,
      };
      if (editId) {
        const { error } = await supabase.from("deal_types").update(payload).eq("id", editId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("deal_types").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal_types"] });
      queryClient.invalidateQueries({ queryKey: ["deal_type_stats"] });
      toast.success(editId ? "Deal type updated" : "Deal type created");
      setFormOpen(false);
      setEditId(null);
      setForm(emptyForm);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deal_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deal_types"] });
      toast.success("Deal type deleted");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openEdit = (dt: any) => {
    setEditId(dt.id);
    setForm({
      name: dt.name,
      description: dt.description || "",
      default_terms: dt.default_terms || "",
      commission_rate: dt.commission_rate ? String(dt.commission_rate) : "",
      color: dt.color || "#3b82f6",
    });
    setFormOpen(true);
  };

  const openNew = () => {
    setEditId(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const pieData = dealTypes?.map((dt) => ({
    name: dt.name,
    value: contractStats?.[dt.id]?.total || 0,
    color: dt.color || "#888",
  })).filter((d) => d.value > 0) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Deal Types</h1>
          <p className="text-muted-foreground">Configure and track deal type categories</p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Add Deal Type</Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Commission</TableHead>
                  <TableHead>Active Contracts</TableHead>
                  <TableHead>Total Value</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : dealTypes && dealTypes.length > 0 ? (
                  dealTypes.map((dt) => {
                    const stats = contractStats?.[dt.id] || { active: 0, total: 0, value: 0 };
                    return (
                      <TableRow key={dt.id}>
                        <TableCell>
                          <Badge style={{ backgroundColor: `${dt.color || "#888"}20`, color: dt.color || "#888", borderColor: dt.color || "#888" }} variant="outline">
                            {dt.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{dt.description || "—"}</TableCell>
                        <TableCell>{dt.commission_rate ? `${dt.commission_rate}%` : "—"}</TableCell>
                        <TableCell>{stats.active}</TableCell>
                        <TableCell>${stats.value.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => openEdit(dt)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(dt.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No deal types configured</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Distribution</CardTitle></CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No contract data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit" : "Create"} Deal Type</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Revenue Share" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Default Terms</Label>
              <Textarea value={form.default_terms} onChange={(e) => setForm({ ...form, default_terms: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Commission Rate (%)</Label>
                <Input type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} placeholder="0" />
              </div>
              <div>
                <Label>Badge Color</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-10 h-10 rounded border cursor-pointer" />
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="flex-1" />
                </div>
              </div>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={!form.name || saveMutation.isPending} className="w-full">
              {saveMutation.isPending ? "Saving..." : editId ? "Update" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
