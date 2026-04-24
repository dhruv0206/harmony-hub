import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  const navigate = useNavigate();

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
    if (!q || q.length < 2) { setResults([]); return; }
    const s = `%${q}%`;
    const [providers, contracts, tickets, deals] = await Promise.all([
      supabase.from("providers").select("id, business_name, city, state").textSearch("search_vector", q, { type: "websearch" }).limit(10),
      supabase.from("contracts").select("id, contract_type, providers(business_name)").or(`id.ilike.${s}`).limit(5),
      supabase.from("support_tickets").select("id, subject").ilike("subject", s).limit(5),
      supabase.from("sales_pipeline").select("id, providers(business_name), estimated_value").limit(5),
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
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

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
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search providers, contracts, tickets..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
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
