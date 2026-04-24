import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, Shield, Briefcase, User, Scale } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";

const demoAccounts = [
  { email: "admin@demo.com", password: "demo123456", role: "admin", name: "Demo Admin", icon: Shield, label: "Admin" },
  { email: "sales@demo.com", password: "demo123456", role: "sales_rep", name: "Demo Sales Rep", icon: Briefcase, label: "Sales Rep" },
  { email: "provider@demo.com", password: "demo123456", role: "provider", name: "Demo Provider", icon: User, label: "Provider" },
  { email: "lawfirm@demo.com", password: "demo123456", role: "law_firm", name: "Demo Law Firm", icon: Scale, label: "Law Firm" },
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<string>("provider");
  const [loading, setLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState<string | null>(null);
  const navigate = useNavigate();
  const brand = useBrand();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Logged in successfully");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Account created! Check your email to confirm.");
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (account: typeof demoAccounts[0]) => {
    setQuickLoading(account.role);
    try {
      // Try to sign in first
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: account.password,
      });

      let userId = signInData?.user?.id;

      if (signInError) {
        // Account doesn't exist yet — create it
        const { error: signUpError } = await supabase.auth.signUp({
          email: account.email,
          password: account.password,
          options: { data: { full_name: account.name, role: account.role } },
        });
        if (signUpError) throw signUpError;

        // Auto-confirm is on, so sign in immediately
        const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
          email: account.email,
          password: account.password,
        });
        if (retryError) throw retryError;
        userId = retryData?.user?.id;
      }

      // For law_firm demo, ensure the profile link exists
      if (account.role === "law_firm" && userId) {
        const { data: existing } = await supabase
          .from("law_firm_profiles")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!existing) {
          await supabase.from("law_firm_profiles").insert({
            user_id: userId,
            law_firm_id: "a0000000-0000-0000-0000-000000000001",
          });
        }
      }

      toast.success(`Logged in as ${account.label}`);
      navigate("/");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setQuickLoading(null);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        backgroundColor: brand.loginBgColor || undefined,
        backgroundImage: brand.loginBgUrl ? `url(${brand.loginBgUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader className="text-center">
            {brand.logoUrl ? (
              <img src={brand.logoUrl} alt={brand.companyName} className="h-12 max-w-[200px] object-contain mx-auto mb-4" />
            ) : (
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary">
                <Building2 className="h-6 w-6 text-primary-foreground" />
              </div>
            )}
            <CardTitle className="text-2xl">{brand.companyName}</CardTitle>
            <CardDescription>
              {isLogin ? "Sign in to your account" : "Create a new account"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
              </div>
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="role">Role (Demo)</Label>
                  <Select value={role} onValueChange={setRole}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="sales_rep">Sales Rep</SelectItem>
                      <SelectItem value="provider">Provider</SelectItem>
                      <SelectItem value="law_firm">Law Firm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-muted-foreground">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline">
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Quick Demo Access</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-4 gap-2">
            {demoAccounts.map((account) => (
              <Button
                key={account.role}
                variant="outline"
                size="sm"
                className="flex flex-col items-center gap-1 h-auto py-3"
                disabled={quickLoading !== null}
                onClick={() => handleQuickLogin(account)}
              >
                <account.icon className="h-4 w-4" />
                <span className="text-xs">
                  {quickLoading === account.role ? "Loading..." : account.label}
                </span>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}