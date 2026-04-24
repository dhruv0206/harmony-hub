import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { PageBreadcrumb } from "@/components/PageBreadcrumb";
import { NotificationBell } from "@/components/NotificationBell";
import { DarkModeToggle } from "@/components/DarkModeToggle";
import { BackgroundJobsWidget } from "@/components/BackgroundJobsWidget";
import { GlobalSearch } from "@/components/GlobalSearch";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import { useState } from "react";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-card px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <PageBreadcrumb />
              <Button
                variant="outline"
                size="sm"
                className="hidden sm:flex items-center gap-2 text-muted-foreground h-9 w-64"
                onClick={() => {
                  // Trigger Cmd+K programmatically
                  const e = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
                  document.dispatchEvent(e);
                }}
              >
                <Search className="h-4 w-4" />
                <span className="text-sm">Search...</span>
                <kbd className="ml-auto pointer-events-none text-xs bg-muted px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
              </Button>
            </div>
            <div className="flex items-center gap-1">
              <BackgroundJobsWidget />
              <DarkModeToggle />
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <GlobalSearch />
    </SidebarProvider>
  );
}
