import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLawFirm } from "@/hooks/use-law-firm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Check, CheckCheck, Clock, XCircle, Download, AlertCircle, Send, ShieldCheck, Lock, Eye
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  pending: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Pending" },
  sent: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Send, label: "Ready to Sign" },
  viewed: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Eye, label: "Ready to Sign" },
  signed: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Clock, label: "Awaiting Finalization" },
  fully_executed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: CheckCheck, label: "Fully Executed" },
  declined: { color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", icon: XCircle, label: "Declined" },
};

export default function LFDocuments() {
  const { data: lawFirm } = useLawFirm();

  const { data: docs, isLoading } = useQuery({
    queryKey: ["lf-documents", lawFirm?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firm_documents")
        .select("*, document_templates(name, short_code, document_type, file_url)")
        .eq("law_firm_id", lawFirm!.id)
        .neq("status", "voided")
        .order("signing_order");
      return data ?? [];
    },
    enabled: !!lawFirm?.id,
  });

  const allDocs = docs ?? [];
  const actionRequired = allDocs.filter(d => d.status === "sent" || d.status === "viewed");
  const signedDocs = allDocs.filter(d => d.status === "signed" || d.status === "fully_executed");

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading documents...</div>;

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">My Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Review, sign, and download your documents.</p>
      </div>

      {/* Action Required */}
      {actionRequired.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              {actionRequired.length} document{actionRequired.length > 1 ? "s" : ""} require your action
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionRequired.map(doc => {
              const tmpl = doc.document_templates as any;
              return (
                <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-background border">
                  <div className="space-y-1">
                    <p className="font-medium">{tmpl?.name || "Document"}</p>
                    {doc.sent_at && <p className="text-xs text-muted-foreground">Sent {format(new Date(doc.sent_at), "MMM d, yyyy")}</p>}
                  </div>
                  {doc.signature_request_id ? (
                    <Button asChild size="sm">
                      <Link to={`/sign/${doc.signature_request_id}`}>
                        <ShieldCheck className="h-4 w-4 mr-1.5" /> Review & Sign
                      </Link>
                    </Button>
                  ) : (
                    <Badge variant="outline">Awaiting preparation</Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* All Documents */}
      {allDocs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No documents assigned yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">All Documents</h2>
          {allDocs.map(doc => {
            const tmpl = doc.document_templates as any;
            const status = doc.status || "pending";
            const cfg = STATUS_MAP[status] || STATUS_MAP.pending;
            const StatusIcon = cfg.icon;
            return (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium truncate">{tmpl?.name || "Document"}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {tmpl?.document_type && <Badge variant="outline" className="text-[10px] capitalize">{tmpl.document_type}</Badge>}
                          <Badge className={cn("text-[10px]", cfg.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />{cfg.label}
                          </Badge>
                        </div>
                        {doc.signed_at && <p className="text-xs text-muted-foreground">Signed {format(new Date(doc.signed_at), "MMM d, yyyy")}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {(status === "sent" || status === "viewed") && doc.signature_request_id && (
                        <Button asChild size="sm">
                          <Link to={`/sign/${doc.signature_request_id}`}>
                            <ShieldCheck className="h-4 w-4 mr-1" /> Sign
                          </Link>
                        </Button>
                      )}
                      {(status === "signed" || status === "fully_executed") && tmpl?.file_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={tmpl.file_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Download All */}
      {signedDocs.length > 0 && (
        <>
          <Separator />
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => {
              signedDocs.forEach(d => {
                const url = (d.document_templates as any)?.file_url;
                if (url) { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.click(); }
              });
            }}>
              <Download className="h-4 w-4 mr-1.5" /> Download All Signed Documents
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
