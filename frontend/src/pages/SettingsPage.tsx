import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings, Building2, Users, Bot, Tag, Mail, Palette, UserPlus, Search, X, Plus } from "lucide-react";
import TemplateBuilder from "@/components/onboarding/TemplateBuilder";
import NotificationPreferences from "@/components/settings/NotificationPreferences";
import BrandingSettings from "@/components/settings/BrandingSettings";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const DEFAULT_LEAD_CATEGORIES = [
  "Chiropractor", "Orthopedic Surgeon", "Pain Management", "Physical Therapy",
  "Neurologist", "MRI / Imaging Center", "General Practitioner", "Urgent Care",
  "Acupuncture", "Massage Therapy", "Podiatrist", "Oral Surgeon / Dental",
  "Ophthalmologist", "Dermatologist", "Mental Health / Psychiatry"
];

function LeadFinderCategorySettings() {
  const queryClient = useQueryClient();
  const [newCat, setNewCat] = useState("");

  const { data: config } = useQuery({
    queryKey: ["lead-finder-categories-config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("ai_config")
        .select("*")
        .eq("feature_name", "lead_finder_categories")
        .single();
      return data;
    },
  });

  const categories: string[] = (config?.settings as any)?.categories || DEFAULT_LEAD_CATEGORIES;

  const saveCategories = async (cats: string[]) => {
    const settings = { categories: cats };
    if (config?.id) {
      await supabase.from("ai_config").update({ settings: settings as any }).eq("id", config.id);
    } else {
      await supabase.from("ai_config").insert({ feature_name: "lead_finder_categories", settings: settings as any, enabled: true });
    }
    queryClient.invalidateQueries({ queryKey: ["lead-finder-categories-config"] });
    queryClient.invalidateQueries({ queryKey: ["lead-finder-categories"] });
  };

  const addCategory = () => {
    const trimmed = newCat.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    saveCategories([...categories, trimmed]);
    setNewCat("");
    toast.success(`Added "${trimmed}"`);
  };

  const removeCategory = (cat: string) => {
    saveCategories(categories.filter(c => c !== cat));
    toast.success(`Removed "${cat}"`);
  };

  const resetDefaults = () => {
    saveCategories(DEFAULT_LEAD_CATEGORIES);
    toast.success("Reset to defaults");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Lead Finder Categories</CardTitle>
        <CardDescription>Manage the category dropdown for lead finder searches</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <Badge key={cat} variant="secondary" className="gap-1 pr-1">
              {cat}
              <button onClick={() => removeCategory(cat)} className="ml-1 hover:text-destructive">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Add new category..."
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCategory()}
            className="max-w-xs"
          />
          <Button size="sm" onClick={addCategory} disabled={!newCat.trim()}>
            <Plus className="h-4 w-4 mr-1" />Add
          </Button>
          <Button size="sm" variant="outline" onClick={resetDefaults}>Reset Defaults</Button>
        </div>
      </CardContent>
    </Card>
  );
}


export default function SettingsPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("provider");

  const { data: settings } = useQuery({
    queryKey: ["company-settings"],
    staleTime: 5 * 60 * 1000, // 5 minutes for settings
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").limit(1).single();
      return data;
    },
  });

  const { data: users } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*, user_roles(role)");
      return data ?? [];
    },
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      if (!settings?.id) return;
      const { error } = await supabase.from("company_settings").update(updates).eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      toast.success("Settings updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [companyName, setCompanyName] = useState("");
  const [brandColor, setBrandColor] = useState("");

  // Initialize form values
  if (settings && !companyName && !brandColor) {
    setCompanyName(settings.company_name);
    setBrandColor(settings.brand_color || "#2563eb");
  }

  if (role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Settings className="h-12 w-12 mb-4" />
        <p>Only administrators can access settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Platform configuration and administration</p>
      </div>

      {/* Company Branding */}
      <BrandingSettings />

      {/* User Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />User Management</CardTitle>
              <CardDescription>Manage users and their roles</CardDescription>
            </div>
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><UserPlus className="h-4 w-4 mr-2" />Invite User</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Invite User</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="user@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="sales_rep">Sales Rep</SelectItem>
                        <SelectItem value="provider">Provider</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The user will need to sign up with this email. Their role will be assigned automatically.
                  </p>
                  <Button className="w-full" onClick={() => { toast.success(`Invitation ready for ${inviteEmail}`); setInviteOpen(false); setInviteEmail(""); }}>
                    Send Invitation
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                  <TableCell>{u.email || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {(u.user_roles as any)?.[0]?.role?.replace("_", " ") || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Deal Type Configuration */}
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/deal-types")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Tag className="h-5 w-5" />Deal Type Configuration</CardTitle>
          <CardDescription>Manage deal types, commission rates, and terms → Click to configure</CardDescription>
        </CardHeader>
      </Card>

      {/* Onboarding Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5" />Onboarding Templates</CardTitle>
          <CardDescription>Create and manage automated onboarding workflows</CardDescription>
        </CardHeader>
        <CardContent>
          <TemplateBuilder />
        </CardContent>
      </Card>

      {/* AI Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" />AI Settings</CardTitle>
          <CardDescription>Configure AI features across the platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable AI Features</p>
              <p className="text-xs text-muted-foreground">Toggle AI-powered suggestions, analysis, and assistants</p>
            </div>
            <Switch
              checked={settings?.ai_enabled ?? true}
              onCheckedChange={(v) => updateSettings.mutate({ ai_enabled: v })}
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>AI Tone</Label>
            <Select
              value={settings?.ai_tone || "professional"}
              onValueChange={(v) => updateSettings.mutate({ ai_tone: v })}
            >
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <NotificationPreferences />

      {/* Lead Finder Categories */}
      <LeadFinderCategorySettings />

      {/* Email Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Email Templates</CardTitle>
          <CardDescription>Configure email notifications — templates will use your brand logo and colors</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: "Welcome Email", desc: "Sent when a new provider or law firm signs up" },
              { name: "Document Sent", desc: "Notifies recipient that a document awaits their signature" },
              { name: "Document Signed Confirmation", desc: "Confirms a document has been signed by the provider" },
              { name: "Invoice Email", desc: "Sent with each new invoice, includes payment link" },
              { name: "Payment Reminder", desc: "Sent at 7, 14, and 30 days past due" },
              { name: "Onboarding Welcome", desc: "Welcome packet sent when onboarding begins" },
              { name: "Password Reset", desc: "Standard password reset email with brand styling" },
            ].map((t) => (
              <div key={t.name} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">Coming Soon</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Email integration coming soon. Templates will automatically use your uploaded logo and brand colors.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
