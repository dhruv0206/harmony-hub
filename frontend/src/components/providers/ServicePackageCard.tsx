import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, Lock, Check, Eye, Send, XCircle, Clock, Package, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";
import SendForDocSignatureModal from "@/components/signatures/SendForDocSignatureModal";

const DOC_TYPE_COLORS: Record<string, string> = {
  agreement: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  addendum: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  exhibit: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  application: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  baa: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  acknowledgment: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  pending: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Pending" },
  sent: { color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300", icon: Send, label: "Sent" },
  viewed: { color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300", icon: Eye, label: "Viewed" },
  signed: { color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: Check, label: "Signed" },
  declined: { color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300", icon: XCircle, label: "Declined" },
  expired: { color: "bg-muted text-muted-foreground", icon: Clock, label: "Expired" },
  voided: { color: "bg-muted text-muted-foreground", icon: XCircle, label: "Voided" },
};

interface ProviderDocument {
  id: string;
  provider_id: string;
  template_id: string;
  package_id: string | null;
  file_url: string | null;
  status: string;
  signing_order: number | null;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signature_request_id: string | null;
  notes: string | null;
}

interface DocTemplate {
  id: string;
  name: string;
  short_code: string;
  document_type: string;
  file_url: string | null;
  signing_instructions: string | null;
}

interface PackageDoc {
  id: string;
  package_id: string;
  template_id: string;
  signing_order: number;
  is_required: boolean;
  condition_description: string | null;
}

interface ServicePkg {
  id: string;
  name: string;
  short_code: string;
  description: string | null;
  is_active: boolean;
}

export function ServicePackageCard({ providerId, currentPackageId }: { providerId: string; currentPackageId: string | null }) {
  const queryClient = useQueryClient();
  const { role } = useAuth();
  const [selectedPkg, setSelectedPkg] = useState<string>("");
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [newPkgForChange, setNewPkgForChange] = useState<string>("");
  const [sendDocModal, setSendDocModal] = useState<{ doc: ProviderDocument; template: DocTemplate } | null>(null);

  const { data: packages } = useQuery({
    queryKey: ["service-packages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_packages").select("*").eq("is_active", true).order("display_order");
      if (error) throw error;
      return data as ServicePkg[];
    },
  });

  const { data: currentPackage } = useQuery({
    queryKey: ["provider-package", currentPackageId],
    queryFn: async () => {
      if (!currentPackageId) return null;
      const { data, error } = await supabase.from("service_packages").select("*").eq("id", currentPackageId).single();
      if (error) throw error;
      return data as ServicePkg;
    },
    enabled: !!currentPackageId,
  });

  const { data: packageDocDefs } = useQuery({
    queryKey: ["package-documents", currentPackageId],
    queryFn: async () => {
      if (!currentPackageId) return [];
      const { data, error } = await supabase.from("package_documents").select("*").eq("package_id", currentPackageId).order("signing_order");
      if (error) throw error;
      return data as PackageDoc[];
    },
    enabled: !!currentPackageId,
  });

  const { data: templates } = useQuery({
    queryKey: ["document-templates-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_templates").select("id, name, short_code, document_type, file_url, signing_instructions").eq("is_active", true).eq("participant_type", "provider");
      if (error) throw error;
      return data as DocTemplate[];
    },
  });

  const { data: providerDocs, refetch: refetchProviderDocs } = useQuery({
    queryKey: ["provider-documents", providerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("provider_documents").select("*").eq("provider_id", providerId).order("signing_order");
      if (error) throw error;
      return data as ProviderDocument[];
    },
  });

  const assignPackage = useMutation({
    mutationFn: async (packageId: string) => {
      const { data: pkgDocs, error: pdErr } = await supabase.from("package_documents").select("*").eq("package_id", packageId).order("signing_order");
      if (pdErr) throw pdErr;
      const { error: provErr } = await supabase.from("providers").update({ service_package_id: packageId }).eq("id", providerId);
      if (provErr) throw provErr;
      await supabase.from("provider_documents").delete().eq("provider_id", providerId);
      if (pkgDocs && pkgDocs.length > 0) {
        const inserts = pkgDocs.map((pd: any) => ({
          provider_id: providerId,
          template_id: pd.template_id,
          package_id: packageId,
          signing_order: pd.signing_order,
          status: "pending",
          notes: pd.condition_description ? `Condition: ${pd.condition_description}` : null,
        }));
        const { error: insErr } = await supabase.from("provider_documents").insert(inserts);
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["provider", providerId] });
      queryClient.invalidateQueries({ queryKey: ["provider-documents", providerId] });
      queryClient.invalidateQueries({ queryKey: ["provider-package"] });
      queryClient.invalidateQueries({ queryKey: ["package-documents"] });
      toast.success("Service package assigned");
    },
    onError: (err: any) => toast.error(err.message || "Failed to assign package"),
  });

  const handleChangePackage = () => {
    if (newPkgForChange) {
      assignPackage.mutate(newPkgForChange);
      setChangeDialogOpen(false);
    }
  };

  const toggleExclude = async (doc: ProviderDocument, exclude: boolean) => {
    const newStatus = exclude ? "voided" : "pending";
    await supabase.from("provider_documents").update({ status: newStatus }).eq("id", doc.id);
    refetchProviderDocs();
    toast.success(exclude ? "Document excluded" : "Document included");
  };

  const canSend = (doc: ProviderDocument, allDocs: ProviderDocument[]) => {
    if (!doc.signing_order) return true;
    const previousDocs = allDocs.filter(
      (d) => d.signing_order != null && d.signing_order < doc.signing_order! && d.status !== "voided"
    );
    return previousDocs.every((d) => d.status === "signed");
  };

  if (!currentPackageId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" /> Service Package & Documents
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">No service package assigned. Select a package to determine which documents this provider needs to sign.</p>
          <div className="flex gap-2">
            <Select value={selectedPkg} onValueChange={setSelectedPkg}>
              <SelectTrigger className="flex-1"><SelectValue placeholder="Select a package..." /></SelectTrigger>
              <SelectContent>
                {(packages ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => selectedPkg && assignPackage.mutate(selectedPkg)} disabled={!selectedPkg || assignPackage.isPending}>
              {assignPackage.isPending ? "Setting..." : "Set Package"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const docs = providerDocs ?? [];
  const activeDocs = docs.filter((d) => d.status !== "voided");
  const signedCount = activeDocs.filter((d) => d.status === "signed").length;
  const totalActive = activeDocs.length;
  const progressPct = totalActive > 0 ? (signedCount / totalActive) * 100 : 0;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" /> Service Package & Documents
            </CardTitle>
            {role === "admin" && (
              <Button variant="ghost" size="sm" onClick={() => setChangeDialogOpen(true)}>Change Package</Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentPackage && (
            <div>
              <p className="font-medium">{currentPackage.name}</p>
              {currentPackage.description && <p className="text-xs text-muted-foreground mt-0.5">{currentPackage.description}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{signedCount} of {totalActive} documents signed</span>
              <span>{Math.round(progressPct)}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
          <div className="space-y-2">
            {docs.map((doc) => {
              const tmpl = templates?.find((t) => t.id === doc.template_id);
              if (!tmpl) return null;
              const pkgDoc = packageDocDefs?.find((pd) => pd.template_id === doc.template_id);
              const isConditional = pkgDoc && !pkgDoc.is_required;
              const isExcluded = doc.status === "voided";
              const statusCfg = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const sendable = !isExcluded && canSend(doc, docs) && (doc.status === "pending" || doc.status === "declined");
              const isLocked = !isExcluded && !canSend(doc, docs) && doc.status !== "signed";

              return (
                <div key={doc.id} className={`border rounded-lg p-3 space-y-2 transition-opacity ${isExcluded ? "opacity-50" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted text-xs font-bold shrink-0 mt-0.5">{doc.signing_order}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{tmpl.name}</span>
                        <Badge className={`text-[10px] ${DOC_TYPE_COLORS[tmpl.document_type]}`}>{tmpl.document_type}</Badge>
                        <Badge className={`text-[10px] ${statusCfg.color}`}>
                          <StatusIcon className="h-3 w-3 mr-1" />{statusCfg.label}
                        </Badge>
                      </div>
                      {doc.signed_at && (
                        <p className="text-xs text-muted-foreground mt-1">Signed {format(new Date(doc.signed_at), "MMM d, yyyy 'at' h:mm a")}</p>
                      )}
                      {isConditional && pkgDoc?.condition_description && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />{pkgDoc.condition_description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isLocked && <Lock className="h-4 w-4 text-muted-foreground" />}
                      {doc.status === "signed" && doc.signature_request_id && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/sign/${doc.signature_request_id}`}>View</a>
                        </Button>
                      )}
                      {sendable && !isLocked && (
                        <Button variant="outline" size="sm" onClick={() => setSendDocModal({ doc, template: tmpl })}>
                          <Send className="h-3.5 w-3.5 mr-1" /> Send
                        </Button>
                      )}
                      {isConditional && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground">{isExcluded ? "Excluded" : "Included"}</span>
                          <Switch checked={!isExcluded} onCheckedChange={(v) => toggleExclude(doc, !v)} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>

        <AlertDialog open={changeDialogOpen} onOpenChange={setChangeDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change Service Package</AlertDialogTitle>
              <AlertDialogDescription>This will reset all unsigned documents. Signed documents will be removed. Are you sure?</AlertDialogDescription>
            </AlertDialogHeader>
            <Select value={newPkgForChange} onValueChange={setNewPkgForChange}>
              <SelectTrigger><SelectValue placeholder="Select new package..." /></SelectTrigger>
              <SelectContent>
                {(packages ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleChangePackage} disabled={!newPkgForChange}>Change Package</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      {sendDocModal && (
        <SendForDocSignatureModal
          open={!!sendDocModal}
          onOpenChange={(open) => !open && setSendDocModal(null)}
          providerDocument={sendDocModal.doc}
          template={sendDocModal.template}
          providerId={providerId}
          onSuccess={() => {
            refetchProviderDocs();
            queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
          }}
        />
      )}
    </>
  );
}
