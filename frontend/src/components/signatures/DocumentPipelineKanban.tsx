import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock } from "lucide-react";

interface DocCard {
  id: string;
  providerName: string;
  docName: string;
  packageName: string;
  status: string;
  daysInStatus: number;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
}

const COLUMNS = [
  { key: "pending", label: "Not Sent", color: "border-t-muted-foreground" },
  { key: "sent", label: "Sent", color: "border-t-primary" },
  { key: "viewed", label: "Viewed", color: "border-t-warning" },
  { key: "signed", label: "Signed", color: "border-t-success" },
];

export default function DocumentPipelineKanban() {
  const { data: providerDocs } = useQuery({
    queryKey: ["doc-pipeline-docs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("id, provider_id, template_id, status, sent_at, viewed_at, signed_at, created_at, signing_order, providers(business_name), document_templates(name), service_packages:package_id(name)")
        .neq("status", "voided")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const cards = useMemo<DocCard[]>(() => {
    if (!providerDocs) return [];
    const now = Date.now();
    return providerDocs.map(d => {
      // Map status: provider_documents uses pending/sent but we also check viewed_at
      let status = d.status || "pending";
      // If status is "sent" but viewed_at is set, treat as "viewed"
      if (status === "sent" && d.viewed_at) status = "viewed";

      let referenceDate = d.created_at;
      if (status === "sent" && d.sent_at) referenceDate = d.sent_at;
      if (status === "viewed" && d.viewed_at) referenceDate = d.viewed_at;
      if (status === "signed" && d.signed_at) referenceDate = d.signed_at;

      const daysInStatus = Math.ceil((now - new Date(referenceDate || d.created_at).getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: d.id,
        providerName: (d.providers as any)?.business_name || "Unknown",
        docName: (d.document_templates as any)?.name || "Document",
        packageName: (d.service_packages as any)?.name || "",
        status,
        daysInStatus,
        sentAt: d.sent_at,
        viewedAt: d.viewed_at,
        signedAt: d.signed_at,
      };
    });
  }, [providerDocs]);

  const columnCards = useMemo(() => {
    const map: Record<string, DocCard[]> = { pending: [], sent: [], viewed: [], signed: [] };
    cards.forEach(c => {
      const key = map[c.status] ? c.status : "pending";
      map[key].push(c);
    });
    return map;
  }, [cards]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {COLUMNS.map(col => (
        <div key={col.key} className="space-y-2">
          <Card className={`border-t-4 ${col.color}`}>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">{col.label}</CardTitle>
                <Badge variant="secondary" className="text-xs">{columnCards[col.key]?.length || 0}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-2 space-y-2 min-h-[100px] max-h-[500px] overflow-y-auto">
              {columnCards[col.key]?.map(card => {
                const showYellowWarning = col.key === "viewed" && card.daysInStatus > 3;
                const showOrangeWarning = col.key === "sent" && card.daysInStatus > 5;

                return (
                  <div key={card.id} className="rounded-md border bg-background p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{card.providerName}</p>
                      {(showYellowWarning || showOrangeWarning) && (
                        <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${showOrangeWarning ? "text-orange-500" : "text-yellow-500"}`} />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{card.docName}</p>
                    {card.packageName && (
                      <Badge variant="outline" className="text-[10px]">{card.packageName}</Badge>
                    )}
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{card.daysInStatus}d in status</span>
                    </div>
                  </div>
                );
              })}
              {(!columnCards[col.key] || columnCards[col.key].length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-6">No documents</p>
              )}
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
