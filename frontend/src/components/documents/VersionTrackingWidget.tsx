import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle, CheckCircle, Send, Eye, Loader2, FileText, Users,
} from "lucide-react";

interface Props {
  templateId: string;
  templateVersion: number;
  templateName: string;
}

export function VersionTrackingWidget({ templateId, templateVersion, templateName }: Props) {
  const queryClient = useQueryClient();
  const [showOutdated, setShowOutdated] = useState(false);
  const [sending, setSending] = useState(false);

  // Fetch provider documents for this template
  const { data: providerDocs } = useQuery({
    queryKey: ["version-tracking-providers", templateId],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("id, template_version, is_current_version, status, signed_at, sent_at, providers(id, business_name)")
        .eq("template_id", templateId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch law firm documents for this template
  const { data: lawFirmDocs } = useQuery({
    queryKey: ["version-tracking-lawfirms", templateId],
    queryFn: async () => {
      const { data } = await supabase
        .from("law_firm_documents")
        .select("id, template_version, is_current_version, status, signed_at, sent_at, law_firms:law_firm_id(id, firm_name)")
        .eq("template_id", templateId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Dedupe by provider/law firm — keep most recent doc per entity
  const latestProviderDocs = (() => {
    const map = new Map<string, any>();
    providerDocs?.forEach((d: any) => {
      const pid = d.providers?.id;
      if (!pid) return;
      const existing = map.get(pid);
      if (!existing) map.set(pid, d);
    });
    return Array.from(map.values());
  })();

  const latestLfDocs = (() => {
    const map = new Map<string, any>();
    lawFirmDocs?.forEach((d: any) => {
      const lid = d.law_firms?.id;
      if (!lid) return;
      const existing = map.get(lid);
      if (!existing) map.set(lid, d);
    });
    return Array.from(map.values());
  })();

  const currentProviders = latestProviderDocs.filter((d: any) => (d.template_version || 1) >= templateVersion);
  const outdatedProviders = latestProviderDocs.filter((d: any) => (d.template_version || 1) < templateVersion);
  const currentLfs = latestLfDocs.filter((d: any) => (d.template_version || 1) >= templateVersion);
  const outdatedLfs = latestLfDocs.filter((d: any) => (d.template_version || 1) < templateVersion);

  const totalCurrent = currentProviders.length + currentLfs.length;
  const totalOutdated = outdatedProviders.length + outdatedLfs.length;
  const totalAll = totalCurrent + totalOutdated;

  // Re-signing progress: how many outdated entities have a new doc at current version
  const resignedCount = (() => {
    let count = 0;
    outdatedProviders.forEach((d: any) => {
      const pid = d.providers?.id;
      const hasNew = providerDocs?.some((pd: any) => pd.providers?.id === pid && (pd.template_version || 1) >= templateVersion && pd.id !== d.id);
      if (hasNew) count++;
    });
    outdatedLfs.forEach((d: any) => {
      const lid = d.law_firms?.id;
      const hasNew = lawFirmDocs?.some((ld: any) => ld.law_firms?.id === lid && (ld.template_version || 1) >= templateVersion && ld.id !== d.id);
      if (hasNew) count++;
    });
    return count;
  })();

  const handleSendToAll = async () => {
    setSending(true);
    try {
      // Get template info
      const { data: template } = await supabase
        .from("document_templates")
        .select("file_url")
        .eq("id", templateId)
        .single();

      if (!template?.file_url) {
        toast.error("Template has no file uploaded");
        return;
      }

      let sentCount = 0;

      // Send to outdated providers
      for (const doc of outdatedProviders) {
        const pid = (doc as any).providers?.id;
        if (!pid) continue;
        await supabase.from("provider_documents").insert({
          provider_id: pid,
          template_id: templateId,
          template_version: templateVersion,
          is_current_version: true,
          status: "sent",
          sent_at: new Date().toISOString(),
          file_url: template.file_url,
        });
        // Mark old doc as not current
        await supabase.from("provider_documents").update({ is_current_version: false }).eq("id", doc.id);
        sentCount++;
      }

      // Send to outdated law firms
      for (const doc of outdatedLfs) {
        const lid = (doc as any).law_firms?.id;
        if (!lid) continue;
        await supabase.from("law_firm_documents").insert({
          law_firm_id: lid,
          template_id: templateId,
          template_version: templateVersion,
          is_current_version: true,
          status: "sent",
          sent_at: new Date().toISOString(),
          file_url: template.file_url,
        });
        await supabase.from("law_firm_documents").update({ is_current_version: false }).eq("id", doc.id);
        sentCount++;
      }

      toast.success(`Sent updated document to ${sentCount} recipient${sentCount !== 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["version-tracking-providers", templateId] });
      queryClient.invalidateQueries({ queryKey: ["version-tracking-lawfirms", templateId] });
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (totalAll === 0) return null;

  const outdatedItems = [
    ...outdatedProviders.map((d: any) => ({
      id: d.id,
      name: d.providers?.business_name || "Unknown",
      type: "Provider" as const,
      version: d.template_version || 1,
      signedAt: d.signed_at,
      status: d.status,
    })),
    ...outdatedLfs.map((d: any) => ({
      id: d.id,
      name: d.law_firms?.firm_name || "Unknown",
      type: "Law Firm" as const,
      version: d.template_version || 1,
      signedAt: d.signed_at,
      status: d.status,
    })),
  ];

  const statusColor: Record<string, string> = {
    signed: "bg-green-500/10 text-green-700 dark:text-green-400",
    sent: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    pending: "bg-muted text-muted-foreground",
    fully_executed: "bg-green-500/10 text-green-700 dark:text-green-400",
  };

  return (
    <>
      <Card className="border-t-2 border-t-primary">
        <CardHeader className="p-4 pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
            <FileText className="h-3.5 w-3.5" />Version Tracking
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 space-y-3">
          <div className="text-sm space-y-1">
            <p>
              Current Version: <span className="font-semibold">v{templateVersion}</span>
            </p>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              <span className="text-sm">{totalCurrent} on current version</span>
            </div>
            {totalOutdated > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">
                  {totalOutdated} on older version{totalOutdated !== 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>

          {totalOutdated > 0 && (
            <>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3">
                <p className="text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                  {totalOutdated} recipient{totalOutdated !== 1 ? "s are" : " is"} on an older version of this document.
                </p>
                {resignedCount > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Re-signing progress: {resignedCount} of {totalOutdated}
                    </p>
                    <Progress value={(resignedCount / totalOutdated) * 100} className="h-1.5" />
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowOutdated(true)}>
                  <Eye className="h-3.5 w-3.5 mr-1.5" />View Outdated
                </Button>
                <Button size="sm" className="flex-1" onClick={handleSendToAll} disabled={sending}>
                  {sending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                  Send Updated to All
                </Button>
              </div>
            </>
          )}

          {totalOutdated === 0 && totalAll > 0 && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3">
              <p className="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5" />
                All recipients are on the current version.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Outdated Recipients Modal */}
      <Dialog open={showOutdated} onOpenChange={setShowOutdated}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Outdated Recipients — {templateName}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            These recipients have v{templateVersion - 1} or older. Current version is v{templateVersion}.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Signed</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outdatedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      <Users className="h-3 w-3 mr-1" />{item.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs">v{item.version}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {item.signedAt ? new Date(item.signedAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={`text-[10px] ${statusColor[item.status] || "bg-muted text-muted-foreground"}`}>
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {outdatedItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No outdated recipients
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOutdated(false)}>Close</Button>
            <Button onClick={() => { setShowOutdated(false); handleSendToAll(); }} disabled={sending || outdatedItems.length === 0}>
              <Send className="h-4 w-4 mr-1.5" />Send Updated Version to All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
