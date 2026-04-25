import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Check, CheckCheck, Clock, XCircle, Lock, Download,
  AlertCircle, Eye, Send, ShieldCheck, Bot
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
  expired: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Expired" },
  voided: { color: "bg-muted text-muted-foreground", icon: XCircle, label: "Voided" },
};

interface ProviderDoc {
  id: string;
  status: string | null;
  signing_order: number | null;
  sent_at: string | null;
  signed_at: string | null;
  signature_request_id: string | null;
  package_id: string | null;
  template_id: string;
  document_templates: {
    name: string;
    short_code: string;
    document_type: string;
    file_url: string | null;
  } | null;
  service_packages: { name: string } | null;
  signature_requests: { expires_at: string | null } | null;
}

export default function MyDocuments() {
  const { profile } = useAuth();

  const { data: provider } = useQuery({
    queryKey: ["my-provider-record", profile?.email],
    queryFn: async () => {
      if (!profile?.email) return null;
      const { data } = await supabase
        .from("providers")
        .select("id, business_name")
        .eq("contact_email", profile.email)
        .single();
      return data;
    },
    enabled: !!profile?.email,
  });

  const { data: docs, isLoading } = useQuery({
    queryKey: ["my-documents", provider?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provider_documents")
        .select("*, document_templates(name, short_code, document_type, file_url), service_packages(name), signature_requests!signature_requests_provider_document_id_fkey(expires_at)")
        .eq("provider_id", provider!.id)
        .neq("status", "voided")
        .order("signing_order");
      if (error) throw error;
      return (data ?? []) as unknown as ProviderDoc[];
    },
    enabled: !!provider?.id,
  });

  const allDocs = docs ?? [];
  const actionRequired = allDocs
    .filter(d => d.status === "sent" || d.status === "viewed")
    .sort((a, b) => {
      const ea = a.signature_requests?.expires_at;
      const eb = b.signature_requests?.expires_at;
      if (!ea) return 1;
      if (!eb) return -1;
      return new Date(ea).getTime() - new Date(eb).getTime();
    });

  // Group by package for progress stepper
  const packageGroups = new Map<string, ProviderDoc[]>();
  allDocs.forEach(d => {
    if (d.package_id) {
      const key = d.package_id;
      if (!packageGroups.has(key)) packageGroups.set(key, []);
      packageGroups.get(key)!.push(d);
    }
  });

  const canSign = (doc: ProviderDoc) => {
    if (!doc.signing_order || !doc.package_id) return true;
    const siblings = allDocs.filter(d => d.package_id === doc.package_id);
    const prev = siblings.filter(d => d.signing_order != null && d.signing_order < (doc.signing_order ?? 0));
    return prev.every(d => d.status === "signed" || d.status === "fully_executed");
  };

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Loading your documents...</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Documents</h1>
        <p className="text-sm text-muted-foreground mt-1">Review, sign, and download your documents.</p>
      </div>

      {/* Signing Progress Steppers */}
      {Array.from(packageGroups.entries()).map(([pkgId, pkgDocs]) => {
        const pkgName = pkgDocs[0]?.service_packages?.name || "Document Package";
        const sorted = [...pkgDocs].sort((a, b) => (a.signing_order ?? 0) - (b.signing_order ?? 0));
        return (
          <Card key={pkgId}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">{pkgName} — Signing Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <TooltipProvider>
                <div className="flex items-center gap-1 overflow-x-auto pb-2">
                  {sorted.map((doc, i) => {
                    const isSigned = doc.status === "signed" || doc.status === "fully_executed";
                    const isCurrent = (doc.status === "sent" || doc.status === "viewed") && canSign(doc);
                    const isLocked = !isSigned && !isCurrent;
                    return (
                      <div key={doc.id} className="flex items-center">
                        {i > 0 && (
                          <div className={cn(
                            "w-6 h-0.5 mx-0.5",
                            isSigned ? "bg-emerald-500" : "bg-border"
                          )} />
                        )}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className={cn(
                              "flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold shrink-0 transition-colors",
                              isSigned && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                              isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                              isLocked && "bg-muted text-muted-foreground"
                            )}>
                              {isSigned ? <Check className="h-4 w-4" /> : isLocked ? <Lock className="h-3.5 w-3.5" /> : i + 1}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{doc.document_templates?.name || `Document ${i + 1}`}</TooltipContent>
                        </Tooltip>
                      </div>
                    );
                  })}
                </div>
              </TooltipProvider>
            </CardContent>
          </Card>
        );
      })}

      {/* Action Required */}
      {actionRequired.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              You have {actionRequired.length} document{actionRequired.length > 1 ? "s" : ""} to review and sign
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {actionRequired.map(doc => {
              const tmpl = doc.document_templates;
              const expires = doc.signature_requests?.expires_at;
              const locked = !canSign(doc);
              return (
                <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-background border">
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{tmpl?.name || "Document"}</p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {tmpl?.document_type && (
                        <Badge variant="outline" className="text-[10px] capitalize">{tmpl.document_type}</Badge>
                      )}
                      {doc.sent_at && <span>Sent {format(new Date(doc.sent_at), "MMM d, yyyy")}</span>}
                      {expires && (
                        <span className="text-destructive font-medium">
                          Expires {formatDistanceToNow(new Date(expires), { addSuffix: true })}
                        </span>
                      )}
                    </div>
                  </div>
                  {locked ? (
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                      <Lock className="h-3.5 w-3.5" /> Sign previous document first
                    </span>
                  ) : (
                    <Button asChild size="sm">
                      <Link to={`/sign/${doc.signature_request_id}`}>
                        <ShieldCheck className="h-4 w-4 mr-1.5" /> Review & Sign
                      </Link>
                    </Button>
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
          <h2 className="text-lg font-semibold text-foreground">All Documents</h2>
          {allDocs.map(doc => {
            const tmpl = doc.document_templates;
            const status = doc.status || "pending";
            const cfg = STATUS_MAP[status] || STATUS_MAP.pending;
            const StatusIcon = cfg.icon;
            const locked = !canSign(doc);
            const isSendable = (status === "sent" || status === "viewed") && !locked;

            // Package label
            const pkgDocs = doc.package_id ? allDocs.filter(d => d.package_id === doc.package_id) : [];
            const pkgIndex = pkgDocs.findIndex(d => d.id === doc.id);
            const pkgLabel = doc.package_id && pkgDocs.length > 0
              ? `Document ${pkgIndex + 1} of ${pkgDocs.length}`
              : null;

            return (
              <Card key={doc.id} className={cn(status === "voided" && "opacity-50")}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="shrink-0 h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-foreground truncate">{tmpl?.name || "Document"}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {tmpl?.document_type && (
                            <Badge variant="outline" className="text-[10px] capitalize">{tmpl.document_type}</Badge>
                          )}
                          <Badge className={cn("text-[10px]", cfg.color)}>
                            <StatusIcon className="h-3 w-3 mr-1" />{cfg.label}
                          </Badge>
                          {pkgLabel && (
                            <span className="text-[10px] text-muted-foreground">{pkgLabel} • {doc.service_packages?.name}</span>
                          )}
                        </div>
                        {doc.signed_at && (
                          <p className="text-xs text-muted-foreground">Signed {format(new Date(doc.signed_at), "MMM d, yyyy")}</p>
                        )}
                        {status === "expired" && (
                          <p className="text-xs text-muted-foreground">Contact your rep to resend this document.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {locked && status !== "signed" && status !== "fully_executed" && status !== "expired" && status !== "declined" && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" /> Previous required
                        </span>
                      )}
                      {isSendable && doc.signature_request_id && (
                        <Button asChild size="sm">
                          <Link to={`/sign/${doc.signature_request_id}`}>
                            <ShieldCheck className="h-4 w-4 mr-1" /> Review & Sign
                          </Link>
                        </Button>
                      )}
                      {/* Review with AI — available for any document with a file */}
                      {tmpl?.file_url && (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/document-review/${doc.id}`}>
                            <Bot className="h-4 w-4 mr-1" /> Review with AI
                          </Link>
                        </Button>
                      )}
                      {status === "signed" && doc.signature_request_id && (
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/sign/${doc.signature_request_id}`}>
                              <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> View Certificate
                            </Link>
                          </Button>
                          {tmpl?.file_url && (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={tmpl.file_url} target="_blank" rel="noopener noreferrer">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Download All Signed */}
      {allDocs.some(d => d.status === "signed" || d.status === "fully_executed") && (
        <>
          <Separator />
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => {
              const signedDocs = allDocs.filter(d => (d.status === "signed" || d.status === "fully_executed") && d.document_templates?.file_url);
              signedDocs.forEach(d => {
                const a = document.createElement("a");
                a.href = d.document_templates!.file_url!;
                a.target = "_blank";
                a.download = d.document_templates!.name || "document";
                a.click();
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
