import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BrandSettings {
  companyName: string;
  logoUrl: string | null;
  brandColor: string;
  secondaryColor: string;
  faviconUrl: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  companyAddress: string | null;
  loginBgUrl: string | null;
  loginBgColor: string | null;
}

const defaults: BrandSettings = {
  companyName: "ContractPro",
  logoUrl: null,
  brandColor: "#3B82F6",
  secondaryColor: "#1E40AF",
  faviconUrl: null,
  supportEmail: null,
  supportPhone: null,
  companyAddress: null,
  loginBgUrl: null,
  loginBgColor: null,
};

const BrandContext = createContext<BrandSettings>(defaults);

export function useBrand() {
  return useContext(BrandContext);
}

function hexToHSL(hex: string): string {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16); g = parseInt(hex[2] + hex[2], 16); b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16); g = parseInt(hex.slice(3, 5), 16); b = parseInt(hex.slice(5, 7), 16);
  }
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyBrandColors(primary: string, secondary: string) {
  const root = document.documentElement;
  const primaryHSL = hexToHSL(primary);
  const secondaryHSL = hexToHSL(secondary);

  root.style.setProperty("--primary", primaryHSL);
  root.style.setProperty("--ring", primaryHSL);

  // Derive accent from primary
  const [h, s] = primaryHSL.split(" ");
  root.style.setProperty("--accent", `${h} ${s} 95%`);
  root.style.setProperty("--accent-foreground", `${h} ${s} 40%`);

  // Sidebar primary
  root.style.setProperty("--sidebar-primary", primaryHSL);
  root.style.setProperty("--sidebar-primary-foreground", "0 0% 100%");
}

function applyFavicon(url: string | null) {
  if (!url) return;
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const { data: settings } = useQuery({
    queryKey: ["brand-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const brand: BrandSettings = {
    companyName: settings?.company_name || defaults.companyName,
    logoUrl: settings?.logo_url || null,
    brandColor: settings?.brand_color || defaults.brandColor,
    secondaryColor: (settings as any)?.secondary_color || defaults.secondaryColor,
    faviconUrl: (settings as any)?.favicon_url || null,
    supportEmail: (settings as any)?.support_email || null,
    supportPhone: (settings as any)?.support_phone || null,
    companyAddress: (settings as any)?.company_address || null,
    loginBgUrl: (settings as any)?.login_bg_url || null,
    loginBgColor: (settings as any)?.login_bg_color || null,
  };

  useEffect(() => {
    applyBrandColors(brand.brandColor, brand.secondaryColor);
  }, [brand.brandColor, brand.secondaryColor]);

  useEffect(() => {
    applyFavicon(brand.faviconUrl);
  }, [brand.faviconUrl]);

  useEffect(() => {
    if (brand.companyName) {
      document.title = brand.companyName;
    }
  }, [brand.companyName]);

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}
