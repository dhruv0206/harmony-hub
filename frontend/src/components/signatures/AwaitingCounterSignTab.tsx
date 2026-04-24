import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PenTool, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import SignatureCanvas from "react-signature-canvas";

export default function AwaitingCounterSignTab() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const [adminTitle, setAdminTitle] = useState("Authorized Representative");
  const bulkSigCanvas = useRef<SignatureCanvas>(null);

  // Fetch signed requests awaiting counter-sign
  const { data: awaitingDocs, isLoading } = useQuery({
    queryKey: ["awaiting-counter-sign"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signature_requests")
        .select("*, providers(business_name), provider_documents!signature_requests_provider_document_id_fkey(document_templates(name, document_type))")
        .eq("status", "signed")
        .is("counter_signed_at", null)
        .order("signed_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!awaitingDocs) return;
    if (selectedIds.size === awaitingDocs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(awaitingDocs.map(d => d.id)));
    }
  };

  // Bulk counter-sign mutation
  const bulkMutation = useMutation({
    mutationFn: async () => {
      if (!bulkSigCanvas.current || bulkSigCanvas.current.isEmpty()) throw new Error("Please draw your signature");
      if (!bulkConfirmed) throw new Error("Please confirm");

      const sigDataUrl = bulkSigCanvas.current.toDataURL("image/png");
      const { compressSignatureImage } = await import("@/lib/compress-image");
      const compressedBlob = await compressSignatureImage(sigDataUrl);
      const now = new Date().toISOString();

      const ids = Array.from(selectedIds);
      for (const reqId of ids) {
        const filePath = `${reqId}/counter-signature-${Date.now()}.png`;
        await supabase.storage.from("signatures").upload(filePath, compressedBlob);

        const req = awaitingDocs?.find(d => d.id === reqId);

        await supabase.from("signature_requests").update({
          status: "fully_executed" as any,
          counter_signed_by: user!.id,
          counter_signed_at: now,
          counter_signature_url: filePath,
        }).eq("id", reqId);

        const pdId = (req as any)?.provider_document_id;
        if (pdId) {
          await supabase.from("provider_documents").update({ status: "fully_executed" }).eq("id", pdId);
        }

        await supabase.from("signature_audit_log").insert({
          signature_request_id: reqId,
          action: "counter_signed" as any,
          actor_id: user!.id,
          ip_address: "client",
          user_agent: navigator.userAgent,
          metadata: { admin_name: profile?.full_name, admin_title: adminTitle, bulk: true },
        });

        // Notify provider
        const providerEmail = (req as any)?.providers?.contact_email;
        if (providerEmail) {
          const { data: pp } = await supabase.from("profiles").select("id").eq("email", providerEmail).maybeSingle();
          if (pp) {
            const docName = (req as any)?.provider_documents?.document_templates?.name || "document";
            await supabase.from("notifications").insert({
              user_id: pp.id,
              title: `${docName} is fully executed`,
              message: `Your document "${docName}" has been counter-signed and is now fully executed.`,
              type: "info",
              link: "/my-documents",
            });
          }
        }

        await supabase.from("activities").insert({
          provider_id: req!.provider_id,
          user_id: user!.id,
          activity_type: "status_change" as any,
          description: `Admin counter-signed "${(req as any)?.provider_documents?.document_templates?.name || "document"}" — now fully executed`,
        });
      }

      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["awaiting-counter-sign"] });
      queryClient.invalidateQueries({ queryKey: ["signature-requests"] });
      setSelectedIds(new Set());
      setBulkOpen(false);
      setBulkConfirmed(false);
      toast.success(`Counter-signed ${count} document(s) successfully!`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground">Loading...</div>;

  const docs = awaitingDocs ?? [];

  return (
    <div className="space-y-4">
      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle className="h-12 w-12 mx-auto mb-3 text-emerald-500" />
            <p className="text-lg font-medium">All caught up!</p>
            <p className="text-sm">No documents are awaiting your counter-signature.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg p-3">
              <span className="text-sm font-medium">{selectedIds.size} document(s) selected</span>
              <Button size="sm" onClick={() => setBulkOpen(true)}>
                <PenTool className="h-3.5 w-3.5 mr-1" /> Bulk Counter-Sign
              </Button>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={docs.length > 0 && selectedIds.size === docs.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Provider Signed</TableHead>
                    <TableHead>Days Waiting</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map(r => {
                    const pd = (r as any)?.provider_documents;
                    const tmpl = pd?.document_templates;
                    const signedDate = r.signed_at ? new Date(r.signed_at) : null;
                    const daysWaiting = signedDate ? differenceInDays(new Date(), signedDate) : 0;

                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(r.id)}
                            onCheckedChange={() => toggleSelect(r.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{(r as any).providers?.business_name || "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{tmpl?.name || "Document"}</span>
                            {tmpl?.document_type && (
                              <Badge variant="outline" className="text-[10px] capitalize">{tmpl.document_type}</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {signedDate ? format(signedDate, "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={daysWaiting > 3 ? "destructive" : "outline"} className="text-xs">
                            {daysWaiting}d
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => navigate(`/counter-sign/${r.id}`)}>
                            <PenTool className="h-3.5 w-3.5 mr-1" /> Counter-Sign
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* Bulk Counter-Sign Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Counter-Sign ({selectedIds.size} documents)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-3">
              {docs.filter(d => selectedIds.has(d.id)).map(d => (
                <div key={d.id} className="flex items-center justify-between text-sm">
                  <span>{(d as any)?.provider_documents?.document_templates?.name || "Document"}</span>
                  <span className="text-muted-foreground">{(d as any)?.providers?.business_name}</span>
                </div>
              ))}
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Your Name</Label>
              <Input value={profile?.full_name || ""} disabled className="bg-muted" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={adminTitle} onChange={e => setAdminTitle(e.target.value)} />
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-2 block">Draw Your Signature (applied to all)</Label>
              <div className="border-2 border-dashed border-border rounded-lg overflow-hidden bg-background">
                <SignatureCanvas
                  ref={bulkSigCanvas}
                  canvasProps={{ className: "w-full h-32" }}
                  penColor="black"
                />
              </div>
              <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => bulkSigCanvas.current?.clear()}>
                Clear
              </Button>
            </div>

            <div className="flex items-start gap-2">
              <Checkbox checked={bulkConfirmed} onCheckedChange={v => setBulkConfirmed(v === true)} id="bulk-confirm" />
              <label htmlFor="bulk-confirm" className="text-xs text-muted-foreground leading-tight cursor-pointer">
                I confirm that I am authorized to counter-sign all selected documents on behalf of the organization.
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button
              disabled={!bulkConfirmed || bulkMutation.isPending}
              onClick={() => bulkMutation.mutate()}
            >
              {bulkMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" />Processing...</>
              ) : (
                <><CheckCircle className="h-4 w-4 mr-1" />Counter-Sign All ({selectedIds.size})</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
