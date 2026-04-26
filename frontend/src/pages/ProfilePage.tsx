import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { User, Building2, Mail, Phone, MapPin, CheckCircle } from "lucide-react";

export default function ProfilePage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const isProvider = role === "provider";

  // Fetch profile
  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Fetch provider record for providers
  const { data: provider } = useQuery({
    queryKey: ["my-provider-profile"],
    queryFn: async () => {
      if (!profile?.email) return null;
      const { data } = await supabase.from("providers").select("*").eq("contact_email", profile.email).maybeSingle();
      return data;
    },
    enabled: isProvider && !!profile?.email,
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    // Provider-specific
    business_name: "",
    contact_name: "",
    contact_phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    zip_code: "",
  });

  useEffect(() => {
    if (profile) {
      setForm(f => ({ ...f, full_name: profile.full_name || "", phone: profile.phone || "" }));
    }
  }, [profile]);

  useEffect(() => {
    if (provider) {
      setForm(f => ({
        ...f,
        business_name: provider.business_name || "",
        contact_name: provider.contact_name || "",
        contact_phone: provider.contact_phone || "",
        address_line1: provider.address_line1 || "",
        address_line2: provider.address_line2 || "",
        city: provider.city || "",
        state: provider.state || "",
        zip_code: provider.zip_code || "",
      }));
    }
  }, [provider]);

  const completionPercent = useMemo(() => {
    if (!isProvider) {
      const fields = [form.full_name, profile?.email, form.phone];
      const filled = fields.filter(Boolean).length;
      return Math.round((filled / fields.length) * 100);
    }
    const fields = [
      form.full_name, profile?.email, form.phone,
      form.business_name, form.contact_name, form.contact_phone,
      form.address_line1, form.city, form.state, form.zip_code,
    ];
    const filled = fields.filter(Boolean).length;
    return Math.round((filled / fields.length) * 100);
  }, [form, profile, isProvider]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Update profile
      const { error: profileErr } = await supabase
        .from("profiles")
        .update({ full_name: form.full_name, phone: form.phone })
        .eq("id", user!.id);
      if (profileErr) throw profileErr;

      // Update provider record if provider
      if (isProvider && provider) {
        const { error: provErr } = await supabase
          .from("providers")
          .update({
            business_name: form.business_name,
            contact_name: form.contact_name,
            contact_phone: form.contact_phone,
            address_line1: form.address_line1,
            address_line2: form.address_line2,
            city: form.city,
            state: form.state,
            zip_code: form.zip_code,
          })
          .eq("id", provider.id);
        if (provErr) throw provErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      queryClient.invalidateQueries({ queryKey: ["my-provider-profile"] });
      toast.success("Profile updated successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      {/* Completion Indicator */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <CheckCircle className={`h-5 w-5 ${completionPercent === 100 ? "text-success" : "text-muted-foreground"}`} />
              <span className="text-sm font-medium">Profile Completion</span>
            </div>
            <span className="text-sm font-bold">{completionPercent}%</span>
          </div>
          <Progress value={completionPercent} className="h-2" />
          {completionPercent < 100 && (
            <p className="text-xs text-muted-foreground mt-2">Complete your profile to help us serve you better.</p>
          )}
        </CardContent>
      </Card>

      {/* Personal Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email || ""} disabled />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
          </div>
        </CardContent>
      </Card>

      {/* Provider Business Information */}
      {isProvider && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Business Information</CardTitle>
              <CardDescription>Update your business details. Status and assigned rep are managed by our team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Business Name</Label>
                <Input value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Name</Label>
                  <Input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone</Label>
                  <Input value={form.contact_phone} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
                </div>
              </div>

              {/* Read-only fields */}
              {provider && (
                <div className="pt-2 space-y-2">
                  <Separator />
                  <p className="text-xs text-muted-foreground pt-2">The following are managed by our team:</p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge className={`capitalize ${provider.status ? (provider.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground") : ""}`}>
                      {provider.status?.replace(/_/g, " ") || "—"}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" /> Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Address Line 1</Label>
                <Input value={form.address_line1} onChange={e => setForm({ ...form, address_line1: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Address Line 2</Label>
                <Input value={form.address_line2} onChange={e => setForm({ ...form, address_line2: e.target.value })} placeholder="Suite, unit, etc." />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>ZIP Code</Label>
                  <Input value={form.zip_code} onChange={e => setForm({ ...form, zip_code: e.target.value })} />
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
        {saveMutation.isPending ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
