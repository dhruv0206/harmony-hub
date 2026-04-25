import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Image, X, Check } from "lucide-react";
import { toast } from "sonner";

export default function BrandingSettings() {
  const queryClient = useQueryClient();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const loginBgInputRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useQuery({
    queryKey: ["company-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const [companyName, setCompanyName] = useState("");
  const [brandColor, setBrandColor] = useState("#3B82F6");
  const [secondaryColor, setSecondaryColor] = useState("#1E40AF");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [loginBgColor, setLoginBgColor] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [loginBgPreview, setLoginBgPreview] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (settings && !initialized) {
      setCompanyName(settings.company_name || "");
      setBrandColor(settings.brand_color || "#3B82F6");
      setSecondaryColor((settings as any).secondary_color || "#1E40AF");
      setSupportEmail((settings as any).support_email || "");
      setSupportPhone((settings as any).support_phone || "");
      setCompanyAddress((settings as any).company_address || "");
      setLoginBgColor((settings as any).login_bg_color || "");
      setLogoPreview(settings.logo_url || null);
      setFaviconPreview((settings as any).favicon_url || null);
      setLoginBgPreview((settings as any).login_bg_url || null);
      setInitialized(true);
    }
  }, [settings, initialized]);

  const uploadFile = async (file: File, path: string): Promise<string> => {
    const ext = file.name.split(".").pop();
    const filePath = `${path}.${ext}`;
    const { error } = await supabase.storage.from("brand-assets").upload(filePath, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("brand-assets").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo must be under 2MB"); return; }
    if (!["image/png", "image/jpeg", "image/svg+xml"].includes(file.type)) { toast.error("Only PNG, JPG, or SVG"); return; }
    try {
      const url = await uploadFile(file, "logo");
      setLogoPreview(url);
      toast.success("Logo uploaded");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) { toast.error("Favicon must be under 500KB"); return; }
    try {
      const url = await uploadFile(file, "favicon");
      setFaviconPreview(url);
      toast.success("Favicon uploaded");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleLoginBgUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    try {
      const url = await uploadFile(file, "login-bg");
      setLoginBgPreview(url);
      toast.success("Background uploaded");
    } catch (err: any) { toast.error(err.message); }
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) return;
      const updates: Record<string, any> = {
        company_name: companyName,
        brand_color: brandColor,
        secondary_color: secondaryColor,
        logo_url: logoPreview,
        favicon_url: faviconPreview,
        login_bg_url: loginBgPreview,
        login_bg_color: loginBgColor || null,
        support_email: supportEmail || null,
        support_phone: supportPhone || null,
        company_address: companyAddress || null,
      };
      const { error } = await supabase.from("company_settings").update(updates).eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-settings"] });
      queryClient.invalidateQueries({ queryKey: ["brand-settings"] });
      toast.success("Branding saved! Refresh to see changes across the platform.");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5" />Company Branding
        </CardTitle>
        <CardDescription>Customize how your platform looks to providers and law firms</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Company Name */}
        <div className="space-y-2">
          <Label>Company Name</Label>
          <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Your company name" />
          <p className="text-xs text-muted-foreground">Appears in sidebar, login page, invoices, and certificates</p>
        </div>

        <Separator />

        {/* Logo */}
        <div className="space-y-3">
          <Label>Company Logo</Label>
          <div className="flex items-center gap-4">
            {logoPreview ? (
              <div className="relative">
                <img src={logoPreview} alt="Logo" className="h-12 max-w-[200px] object-contain border rounded p-1 bg-background" />
                <button onClick={() => setLogoPreview(null)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <div className="h-12 w-48 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-sm">
                No logo uploaded
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />Upload Logo
            </Button>
            <input ref={logoInputRef} type="file" accept=".png,.jpg,.jpeg,.svg" className="hidden" onChange={handleLogoUpload} />
          </div>
          <p className="text-xs text-muted-foreground">PNG, SVG, or JPG. Max 2MB. Recommended: 200×50px</p>
        </div>

        {/* Favicon */}
        <div className="space-y-3">
          <Label>Favicon</Label>
          <div className="flex items-center gap-4">
            {faviconPreview ? (
              <div className="relative">
                <img src={faviconPreview} alt="Favicon" className="h-8 w-8 object-contain border rounded p-0.5" />
                <button onClick={() => setFaviconPreview(null)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <div className="h-8 w-8 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground text-xs">—</div>
            )}
            <Button variant="outline" size="sm" onClick={() => faviconInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1" />Upload Favicon
            </Button>
            <input ref={faviconInputRef} type="file" accept=".png,.ico,.svg" className="hidden" onChange={handleFaviconUpload} />
          </div>
          <p className="text-xs text-muted-foreground">32×32 or 64×64 PNG/ICO</p>
        </div>

        <Separator />

        {/* Brand Colors */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Primary Brand Color</Label>
            <div className="flex gap-2">
              <Input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="w-14 h-10 p-1 cursor-pointer" />
              <Input value={brandColor} onChange={e => setBrandColor(e.target.value)} className="flex-1 font-mono" />
            </div>
            <p className="text-xs text-muted-foreground">Buttons, links, active states, progress bars</p>
          </div>
          <div className="space-y-2">
            <Label>Secondary Brand Color</Label>
            <div className="flex gap-2">
              <Input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="w-14 h-10 p-1 cursor-pointer" />
              <Input value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="flex-1 font-mono" />
            </div>
            <p className="text-xs text-muted-foreground">Accents and secondary elements</p>
          </div>
        </div>

        {/* Color Preview */}
        <div className="flex gap-2">
          <div className="rounded-lg px-4 py-2 text-white text-sm font-medium" style={{ backgroundColor: brandColor }}>Primary Button</div>
          <div className="rounded-lg px-4 py-2 text-white text-sm font-medium" style={{ backgroundColor: secondaryColor }}>Secondary</div>
          <div className="rounded-lg px-4 py-2 text-sm font-medium border" style={{ color: brandColor, borderColor: brandColor }}>Outline</div>
        </div>

        <Separator />

        {/* Login Background */}
        <div className="space-y-3">
          <Label>Login Page Background</Label>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Background Image (optional)</p>
              <div className="flex items-center gap-2">
                {loginBgPreview ? (
                  <div className="relative">
                    <img src={loginBgPreview} alt="Login BG" className="h-16 w-28 object-cover border rounded" />
                    <button onClick={() => setLoginBgPreview(null)} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"><X className="h-3 w-3" /></button>
                  </div>
                ) : null}
                <Button variant="outline" size="sm" onClick={() => loginBgInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-1" />Upload
                </Button>
                <input ref={loginBgInputRef} type="file" accept=".png,.jpg,.jpeg" className="hidden" onChange={handleLoginBgUpload} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Or solid background color</p>
              <div className="flex gap-2">
                <Input type="color" value={loginBgColor || "#1a1a2e"} onChange={e => setLoginBgColor(e.target.value)} className="w-14 h-10 p-1 cursor-pointer" />
                <Input value={loginBgColor} onChange={e => setLoginBgColor(e.target.value)} className="flex-1 font-mono" placeholder="#1a1a2e" />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Contact Info */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Support Email</Label>
            <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@yourcompany.com" />
          </div>
          <div className="space-y-2">
            <Label>Support Phone</Label>
            <Input value={supportPhone} onChange={e => setSupportPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Company Address</Label>
          <Input value={companyAddress} onChange={e => setCompanyAddress(e.target.value)} placeholder="123 Main St, Suite 100, Atlanta, GA 30301" />
          <p className="text-xs text-muted-foreground">Used on invoices and signature certificates</p>
        </div>

        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full sm:w-auto">
          <Check className="h-4 w-4 mr-1" />
          {saveMutation.isPending ? "Saving..." : "Save Branding"}
        </Button>
      </CardContent>
    </Card>
  );
}
