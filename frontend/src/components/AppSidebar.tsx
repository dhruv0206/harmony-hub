import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Building2, FileText, Map, BarChart3, TrendingUp,
  HelpCircle, UserPlus, Users, Settings, Headphones, User,
  LogOut, Tag, PenTool, Radar, Megaphone, Brain, ChevronRight,
  FileStack, DollarSign, Receipt, CreditCard, Wallet, CalendarDays, GraduationCap, Video,
  Scale, Shield, ClipboardList
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  icon: React.ElementType;
  children: NavItem[];
}

type SidebarEntry = NavItem | NavGroup;

function isGroup(entry: SidebarEntry): entry is NavGroup {
  return "children" in entry;
}

const adminEntries: SidebarEntry[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Providers", url: "/providers", icon: Building2 },
  { title: "Law Firms", url: "/law-firms", icon: Scale },
  {
    title: "Contracts",
    icon: FileText,
    children: [
      { title: "All Contracts", url: "/contracts", icon: FileText },
      { title: "Deal Types", url: "/deal-types", icon: Tag },
      { title: "E-Signatures", url: "/signatures", icon: PenTool },
    ],
  },
  {
    title: "Sales",
    icon: TrendingUp,
    children: [
      { title: "Pipeline", url: "/pipeline", icon: TrendingUp },
      { title: "Lead Finder", url: "/leads", icon: Radar },
      { title: "Campaigns", url: "/campaigns", icon: Megaphone },
    ],
  },
  { title: "Map", url: "/map", icon: Map },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Reports", url: "/reports", icon: ClipboardList },
  { title: "Help Desk", url: "/helpdesk", icon: Headphones },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Onboarding", url: "/onboarding", icon: UserPlus },
  { title: "Users", url: "/users", icon: Users },
  {
    title: "Billing",
    icon: Wallet,
    children: [
      { title: "Overview", url: "/billing", icon: Wallet },
      { title: "Invoices", url: "/billing/invoices", icon: Receipt },
      { title: "Payments", url: "/billing/payments", icon: CreditCard },
      { title: "Rate Card", url: "/billing/rate-card", icon: DollarSign },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    children: [
      { title: "General", url: "/settings", icon: Settings },
      { title: "AI Command Center", url: "/ai-settings", icon: Brain },
      { title: "Document Templates", url: "/document-templates", icon: FileStack },
      { title: "Training Videos", url: "/training-videos", icon: Video },
      { title: "Audit Log", url: "/audit-log", icon: Shield },
    ],
  },
];

const salesRepEntries: SidebarEntry[] = [
  { title: "My Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Providers", url: "/providers", icon: Building2 },
  {
    title: "Sales",
    icon: TrendingUp,
    children: [
      { title: "My Pipeline", url: "/pipeline", icon: TrendingUp },
      { title: "Lead Finder", url: "/leads", icon: Radar },
      { title: "My Campaigns", url: "/campaigns", icon: Megaphone },
    ],
  },
  { title: "Contracts", url: "/contracts", icon: FileText },
  { title: "Onboarding", url: "/onboarding", icon: UserPlus },
  { title: "E-Signatures", url: "/signatures", icon: PenTool },
  { title: "Help Desk", url: "/helpdesk", icon: Headphones },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
];

const providerEntries: SidebarEntry[] = [
  { title: "My Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Contracts", url: "/contracts", icon: FileText },
  { title: "My Documents", url: "/my-documents", icon: FileStack },
  { title: "Training", url: "/training", icon: GraduationCap },
  { title: "Billing", url: "/billing/provider", icon: Wallet },
  { title: "Support", url: "/support", icon: HelpCircle },
  { title: "My Appointments", url: "/my-appointments", icon: CalendarDays },
  { title: "Profile", url: "/profile", icon: User },
];

const lawFirmEntries: SidebarEntry[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "My Documents", url: "/lf/documents", icon: FileStack },
  { title: "Billing", url: "/lf/billing", icon: Wallet },
  { title: "Training", url: "/lf/training", icon: GraduationCap },
  { title: "Appointments", url: "/lf/appointments", icon: CalendarDays },
  { title: "Support", url: "/lf/support", icon: HelpCircle },
  { title: "Profile", url: "/lf/profile", icon: User },
];

function CollapsibleNavGroup({
  group,
  collapsed,
  pathname,
  badgeCount,
}: {
  group: NavGroup;
  collapsed: boolean;
  pathname: string;
  badgeCount?: number;
}) {
  const childUrls = group.children.map((c) => c.url);
  const hasActiveChild = childUrls.some(
    (url) => pathname === url || pathname.startsWith(url + "/")
  );

  const storageKey = `sidebar-group-${group.title}`;
  const [open, setOpen] = useState(() => {
    if (hasActiveChild) return true;
    const stored = sessionStorage.getItem(storageKey);
    return stored === "true";
  });

  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (hasActiveChild && !open) setOpen(true);
  }, [hasActiveChild]);

  useEffect(() => {
    sessionStorage.setItem(storageKey, String(open));
  }, [open, storageKey]);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [open, group.children.length]);

  if (collapsed) {
    return (
      <>
        {group.children.map((child) => (
          <SidebarMenuItem key={child.title}>
            <SidebarMenuButton asChild>
              <NavLink
                to={child.url}
                end={child.url === "/"}
                className="hover:bg-sidebar-accent"
                activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
              >
                <child.icon className="h-4 w-4" />
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </>
    );
  }

  return (
    <SidebarMenuItem>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-200",
          "hover:bg-sidebar-accent text-sidebar-foreground",
          hasActiveChild && "text-sidebar-primary font-medium",
          hasActiveChild && !open && "border-l-2 border-sidebar-primary"
        )}
      >
        {hasActiveChild && !open && (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
        )}
        <group.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{group.title}</span>
        {(badgeCount ?? 0) > 0 && !open && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 mr-1">
            {badgeCount}
          </span>
        )}
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-in-out",
            open && "rotate-90"
          )}
        />
      </button>
      <div
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out"
        style={{
          maxHeight: open ? `${contentHeight}px` : "0px",
          opacity: open ? 1 : 0,
        }}
      >
        <div ref={contentRef}>
          <SidebarMenu className="ml-4 mt-1 border-l border-sidebar-border pl-2">
            {group.children.map((child) => (
              <SidebarMenuItem key={child.title}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={child.url}
                    end
                    className="hover:bg-sidebar-accent text-sm"
                    activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                  >
                    <child.icon className="mr-2 h-3.5 w-3.5" />
                    <span>{child.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      </div>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { role, profile, signOut } = useAuth();

  // Brand settings
  const { data: brandSettings } = useQuery({
    queryKey: ["brand-settings"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("company_settings").select("company_name, logo_url").limit(1).single();
      return data;
    },
  });

  const companyName = brandSettings?.company_name || "ContractPro";
  const logoUrl = brandSettings?.logo_url || null;

  // Churn alert badge query
  const { data: churnAlertCount } = useQuery({
    queryKey: ["churn-alert-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("churn_predictions")
        .select("id", { count: "exact", head: true })
        .eq("status", "new")
        .gte("churn_probability", 70);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  // Billing alerts badge query
  const { data: billingAlertCount } = useQuery({
    queryKey: ["billing-alerts-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("billing_alerts")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const entries =
    role === "admin"
      ? adminEntries
      : role === "sales_rep"
        ? salesRepEntries
        : role === "law_firm"
          ? lawFirmEntries
          : providerEntries;

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-primary font-bold text-base px-4 py-3">
            {!collapsed && (
              logoUrl
                ? <img src={logoUrl} alt={companyName} className="h-7 max-w-[160px] object-contain" />
                : companyName
            )}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {entries.map((entry) =>
                isGroup(entry) ? (
                  <CollapsibleNavGroup
                    key={entry.title}
                    group={entry}
                    collapsed={collapsed}
                    pathname={location.pathname}
                    badgeCount={entry.title === "Billing" ? (billingAlertCount ?? 0) : undefined}
                  />
                ) : (
                  <SidebarMenuItem key={entry.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={entry.url}
                        end={entry.url === "/"}
                        className="hover:bg-sidebar-accent relative"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <entry.icon className="mr-2 h-4 w-4" />
                        {!collapsed && <span>{entry.title}</span>}
                        {entry.url === "/analytics" && (churnAlertCount ?? 0) > 0 && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1">
                            {churnAlertCount}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {!collapsed && (
          <div className="mb-2 px-2">
            <p className="text-sm font-medium text-sidebar-accent-foreground truncate">
              {profile?.full_name || profile?.email || "User"}
            </p>
            <p className="text-xs text-sidebar-foreground capitalize">{role?.replace("_", " ")}</p>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={signOut}
          className="w-full justify-start text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent"
        >
          <LogOut className="mr-2 h-4 w-4" />
          {!collapsed && "Sign Out"}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
