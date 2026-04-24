import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/use-law-firm";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, User, Check, Building2 } from "lucide-react";
import { toast } from "sonner";
import { US_STATES } from "@/lib/us-states";

const PRACTICE_AREAS = [
  "Personal Injury", "Auto Accident", "Medical Malpractice", "Workers Comp",
  "Slip & Fall", "Wrongful Death", "Product Liability", "Other",
];

export default function LFProfile() {
  const queryClient = useQueryClient();
  const { data: lawFirm } = useLawFirm();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState<any>({ name: "", title: "", email: "", phone: "", is_primary: false, is_signer: false });
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  useEffect(() => {
    if (lawFirm) {
      setForm({
        firm_name: lawFirm.firm_name,
        dba_name: lawFirm.dba_name || "",
        address_line1: lawFirm.address_line1 || "",
        city: lawFirm.city || "",
        state: lawFirm.state || "",
        zip_code: lawFirm.zip_code || "",
        website: lawFirm.website || "",
        contact_email: lawFirm.contact_email || "",
        contact_phone: lawFirm.contact_phone || "",
        practice_areas: lawFirm.practice_areas || [],
        states_licensed: lawFirm.states_licensed || [],
      });
    }
  }, [lawFirm]);

  const { data: contacts } = useQuery({
    queryKey: ["lf-contacts", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase.from("law_firm_contacts").select("*").eq("law_firm_id", lawFirm!.id).order("is_primary", { ascending: false });
      return data ?? [];
    },
    enabled: !!lawFirm?.id,
  });

  const updateFirm = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("law_firms").update(form).eq("id", lawFirm!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-law-firm"] });
      setEditing(false);
      toast.success("Profile updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const saveContact = useMutation({
    mutationFn: async () => {
      if (editingContactId) {
        const { error } = await supabase.from("law_firm_contacts").update(contactForm).eq("id", editingContactId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("law_firm_contacts").insert({ ...contactForm, law_firm_id: lawFirm!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lf-contacts"] });
      setContactOpen(false);
      setEditingContactId(null);
      setContactForm({ name: "", title: "", email: "", phone: "", is_primary: false, is_signer: false });
      toast.success("Contact saved");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteContact = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("law_firm_contacts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lf-contacts"] });
      toast.success("Contact deleted");
    },
  });

  // Profile completeness
  const fields = ["firm_name", "contact_email", "contact_phone", "address_line1", "city", "state", "zip_code", "website"];
  const filled = fields.filter(f => form[f]).length;
  const hasPractice = (form.practice_areas?.length || 0) > 0;
  const hasStates = (form.states_licensed?.length || 0) > 0;
  const total = fields.length + 2;
  const complete = filled + (hasPractice ? 1 : 0) + (hasStates ? 1 : 0);
  const pct = Math.round((complete / total) * 100);

  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item];

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Firm Profile</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your firm information and contacts.</p>
        </div>
        {!editing && <Button onClick={() => setEditing(true)}><Pencil className="h-4 w-4 mr-1" /> Edit</Button>}
      </div>

      {/* Completeness */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Profile Completeness</p>
            <p className="text-sm text-muted-foreground">{pct}%</p>
          </div>
          <Progress value={pct} className="h-2" />
        </CardContent>
      </Card>

      {/* Firm Info */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Firm Information</CardTitle></CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Firm Name</Label><Input value={form.firm_name || ""} onChange={e => setForm({ ...form, firm_name: e.target.value })} /></div>
                <div><Label>DBA</Label><Input value={form.dba_name || ""} onChange={e => setForm({ ...form, dba_name: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Email</Label><Input value={form.contact_email || ""} onChange={e => setForm({ ...form, contact_email: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.contact_phone || ""} onChange={e => setForm({ ...form, contact_phone: e.target.value })} /></div>
              </div>
              <div><Label>Address</Label><Input value={form.address_line1 || ""} onChange={e => setForm({ ...form, address_line1: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label>City</Label><Input value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                <div>
                  <Label>State</Label>
                  <Select value={form.state || ""} onValueChange={v => setForm({ ...form, state: v })}>
                    <SelectTrigger><SelectValue placeholder="State" /></SelectTrigger>
                    <SelectContent>{US_STATES.map(s => <SelectItem key={s.abbr} value={s.abbr}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>ZIP</Label><Input value={form.zip_code || ""} onChange={e => setForm({ ...form, zip_code: e.target.value })} /></div>
              </div>
              <div><Label>Website</Label><Input value={form.website || ""} onChange={e => setForm({ ...form, website: e.target.value })} /></div>

              <div>
                <Label>Practice Areas</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {PRACTICE_AREAS.map(pa => (
                    <Badge
                      key={pa}
                      variant={form.practice_areas?.includes(pa) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setForm({ ...form, practice_areas: toggleArrayItem(form.practice_areas || [], pa) })}
                    >
                      {pa}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label>States Licensed</Label>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {US_STATES.map(s => (
                    <Badge
                      key={s.abbr}
                      variant={form.states_licensed?.includes(s.abbr) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={() => setForm({ ...form, states_licensed: toggleArrayItem(form.states_licensed || [], s.abbr) })}
                    >
                      {s.abbr}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={() => updateFirm.mutate()} disabled={updateFirm.isPending}>Save</Button>
                <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground">Firm Name:</span> <span className="font-medium ml-1">{form.firm_name}</span></div>
                <div><span className="text-muted-foreground">DBA:</span> <span className="ml-1">{form.dba_name || "—"}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><span className="text-muted-foreground">Email:</span> <span className="ml-1">{form.contact_email || "—"}</span></div>
                <div><span className="text-muted-foreground">Phone:</span> <span className="ml-1">{form.contact_phone || "—"}</span></div>
              </div>
              <div><span className="text-muted-foreground">Address:</span> <span className="ml-1">{[form.address_line1, form.city, form.state, form.zip_code].filter(Boolean).join(", ") || "—"}</span></div>
              <div><span className="text-muted-foreground">Website:</span> <span className="ml-1">{form.website || "—"}</span></div>
              <div>
                <span className="text-muted-foreground">Practice Areas:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.practice_areas?.map((pa: string) => <Badge key={pa} variant="outline" className="text-xs">{pa}</Badge>)}
                  {(!form.practice_areas || form.practice_areas.length === 0) && <span className="text-muted-foreground">—</span>}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">States Licensed:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.states_licensed?.map((s: string) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                  {(!form.states_licensed || form.states_licensed.length === 0) && <span className="text-muted-foreground">—</span>}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Contacts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Contacts</CardTitle>
          <Button size="sm" onClick={() => { setEditingContactId(null); setContactForm({ name: "", title: "", email: "", phone: "", is_primary: false, is_signer: false }); setContactOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Add Contact
          </Button>
        </CardHeader>
        <CardContent>
          {contacts && contacts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.title || "—"}</TableCell>
                    <TableCell>{c.email || "—"}</TableCell>
                    <TableCell>{c.phone || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {c.is_primary && <Badge variant="default" className="text-[10px]">Primary</Badge>}
                        {c.is_signer && <Badge variant="outline" className="text-[10px]">Signer</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => {
                          setEditingContactId(c.id);
                          setContactForm({ name: c.name, title: c.title || "", email: c.email || "", phone: c.phone || "", is_primary: c.is_primary, is_signer: c.is_signer });
                          setContactOpen(true);
                        }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteContact.mutate(c.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No contacts added yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Contact Dialog */}
      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingContactId ? "Edit Contact" : "Add Contact"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Name *</Label><Input value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} /></div>
              <div><Label>Title</Label><Input value={contactForm.title} onChange={e => setContactForm({ ...contactForm, title: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Email</Label><Input value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} /></div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Checkbox checked={contactForm.is_primary} onCheckedChange={v => setContactForm({ ...contactForm, is_primary: v })} />
                <Label>Primary Contact</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={contactForm.is_signer} onCheckedChange={v => setContactForm({ ...contactForm, is_signer: v })} />
                <Label>Authorized Signer</Label>
              </div>
            </div>
            <Button className="w-full" disabled={!contactForm.name || saveContact.isPending} onClick={() => saveContact.mutate()}>
              {saveContact.isPending ? "Saving..." : "Save Contact"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
