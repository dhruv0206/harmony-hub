import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Building2, FileText, Headphones, TrendingUp } from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  subtitle: string;
  category: "provider" | "contract" | "ticket" | "deal";
  link: string;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const search = useCallback(async (q: string) => {
    if (!q || q.length < 2) { setResults([]); setLoading(false); return; }
    // Wait for auth before firing — otherwise queries run unauthenticated
    // and RLS returns 0 rows on first open.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const s = `%${q}%`;
    // contracts.id is uuid and contract_type is an enum — neither supports ilike.
    // Search contracts by joined provider business_name instead.
    // Same for sales_pipeline (id is uuid).
    const [providers, contracts, tickets, deals] = await Promise.all([
      supabase.from("providers").select("id, business_name, city, state").textSearch("search_vector", q, { type: "websearch" }).limit(10),
      supabase.from("contracts").select("id, contract_type, providers!inner(business_name)").ilike("providers.business_name", s).limit(5),
      supabase.from("support_tickets").select("id, subject").ilike("subject", s).limit(5),
      supabase.from("sales_pipeline").select("id, providers!inner(business_name), estimated_value").ilike("providers.business_name", s).limit(5),
    ]);

    const r: SearchResult[] = [];
    providers.data?.forEach((p) => r.push({
      id: p.id, title: p.business_name,
      subtitle: [p.city, p.state].filter(Boolean).join(", ") || "Provider",
      category: "provider", link: `/providers/${p.id}`,
    }));
    contracts.data?.forEach((c) => r.push({
      id: c.id, title: `${(c as any).contract_type} Contract`,
      subtitle: (c.providers as any)?.business_name || c.id.slice(0, 8),
      category: "contract", link: `/contracts/${c.id}`,
    }));
    tickets.data?.forEach((t) => r.push({
      id: t.id, title: t.subject,
      subtitle: `Ticket #${t.id.slice(0, 8)}`,
      category: "ticket", link: `/helpdesk/${t.id}`,
    }));
    deals.data?.forEach((d) => r.push({
      id: d.id, title: (d.providers as any)?.business_name || "Deal",
      subtitle: `$${Number(d.estimated_value || 0).toLocaleString()}`,
      category: "deal", link: `/pipeline`,
    }));
    setResults(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Only fire search once user is available — prevents unauthenticated
    // queries on first open after page load.
    if (!user) return;
    const timer = setTimeout(() => search(query), 150);
    return () => clearTimeout(timer);
  }, [query, search, user]);

  const select = (link: string) => {
    setOpen(false);
    setQuery("");
    navigate(link);
  };

  const icons = {
    provider: Building2,
    contract: FileText,
    ticket: Headphones,
    deal: TrendingUp,
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  const labels = { provider: "Providers", contract: "Contracts", ticket: "Tickets", deal: "Pipeline" };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput placeholder="Search providers, contracts, tickets..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>
          {loading ? "Searching..." : query.length < 2 ? "Type at least 2 characters." : "No results found."}
        </CommandEmpty>
        {Object.entries(grouped).map(([cat, items]) => {
          const Icon = icons[cat as keyof typeof icons];
          return (
            <CommandGroup key={cat} heading={labels[cat as keyof typeof labels]}>
              {items.map((item) => (
                <CommandItem key={item.id} onSelect={() => select(item.link)}>
                  <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span>{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
