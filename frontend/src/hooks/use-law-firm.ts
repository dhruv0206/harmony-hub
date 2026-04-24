import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useLawFirm() {
  const { user, role } = useAuth();

  return useQuery({
    queryKey: ["my-law-firm", user?.id],
    queryFn: async () => {
      const { data: link } = await supabase
        .from("law_firm_profiles")
        .select("law_firm_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (!link) return null;
      const { data } = await supabase
        .from("law_firms")
        .select("*, profiles!law_firms_assigned_sales_rep_fkey(full_name, email, phone)")
        .eq("id", link.law_firm_id)
        .maybeSingle();
      return data;
    },
    enabled: !!user && role === "law_firm",
  });
}
