import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Search, X, FileText, Shield, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string;
  templateName: string;
  fileUrl: string | null;
  /** If provided, skip provider selection (Option B: from provider detail page) */
  preselectedProviderId?: string;
  preselectedProviderName?: string;
  /** If we already have a provider_document record */
  providerDocumentId?: string;
  onSuccess?: () => void;
}

export default function SendToProviderModal({
  open, onOpenChange, templateId, templateName, fileUrl,
  preselectedProviderId, preselectedProviderName, providerDocumentId,
  onSuccess,
}: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<{ id: string; name: string }[]>(
    preselectedProviderId ? [{ id: preselectedProviderId, name: preselectedProviderName || "" }] : []
  );
  const [message, setMessage] = useState("");
  const [expirationDays, setExpirationDays] = useState(14);
  const [requireVerification, setRequireVerification] = useState(true);

  const showProviderSelect = !preselectedProviderId;

  const { data: providers } = useQuery({
    queryKey: ["providers-for-send-modal"],
    queryFn: async () => {
      const { data } = await supabase
        .from("providers")
        .select("id, business_name, contact_email")
        .in("status", ["active", "contracted", "prospect", "in_negotiation"] as any[])
        .order("business_name");
      return data ?? [];
    },
    enabled: open && showProviderSelect,
  });

  const filteredProviders = useMemo(() => {
    if (!providers) return [];
    const q = search.toLowerCase();
    return providers.filter(p =>
      p.business_name.toLowerCase().includes(q) ||
      (p.contact_email || "").toLowerCase().includes(q)
    );
  }, [providers, search]);

  const toggleProvider = (p: { id: string; business_name: string }) => {
    setSelectedProviders(prev =>
      prev.some(s => s.id === p.id)
        ? prev.filter(s => s.id !== p.id)
        : [...prev, { id: p.id, name: p.business_name }]
    );
  };

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (selectedProviders.length === 0) throw new Error("Select at least one provider");
      if (!fileUrl) throw new Error("No file uploaded for this template");

      // Get template version for version tracking
      const { data: tmpl } = await supabase
        .from("document_templates")
        .select("version")
        .eq("id", templateId)
        .single();
      const templateVersion = tmpl?.version || 1;

      const expiresAt = addDays(new Date(), expirationDays).toISOString();
      const now = new Date().toISOString();

      for (const sp of selectedProviders) {
        // Mark any existing docs for this template+provider as not current version
        await supabase
          .from("provider_documents")
          .update({ is_current_version: false })
          .eq("provider_id", sp.id)
          .eq("template_id", templateId);

        // Create or find provider_document
        let provDocId = providerDocumentId;
        if (!provDocId) {
          // Check if one already exists
          const { data: existing } = await supabase
            .from("provider_documents")
            .select("id")
            .eq("provider_id", sp.id)
            .eq("template_id", templateId)
            .in("status", ["pending", "declined"])
            .limit(1)
            .maybeSingle();

          if (existing) {
            provDocId = existing.id;
          } else {
            const { data: newDoc, error: docErr } = await supabase
              .from("provider_documents")
              .insert({ provider_id: sp.id, template_id: templateId, status: "sent", sent_at: now, template_version: templateVersion, is_current_version: true })
              .select("id")
              .single();
            if (docErr) throw docErr;
            provDocId = newDoc.id;
          }
        }

        // Update provider_document status
        await supabase.from("provider_documents").update({
          status: "sent", sent_at: now, template_version: templateVersion, is_current_version: true,
        }).eq("id", provDocId);

        // Create signature_request — contract_id is required, use templateId as reference
        const { data: sigReq, error: sigErr } = await supabase
          .from("signature_requests")
          .insert({
            contract_id: templateId,
            provider_id: sp.id,
            requested_by: user!.id,
            expires_at: expiresAt,
            message: message || null,
            provider_document_id: provDocId,
            require_verification: requireVerification,
          } as any)
          .select()
          .single();
        if (sigErr) throw sigErr;

        // Link signature request to provider_document
        await supabase.from("provider_documents").update({
          signature_request_id: sigReq.id,
        }).eq("id", provDocId);

        // Audit log
        await supabase.from("signature_audit_log").insert({
          signature_request_id: sigReq.id,
          action: "request_created" as any,
          actor_id: user!.id,
          metadata: {
            expiration_days: expirationDays,
            template_name: templateName,
            require_verification: requireVerification,
            provider_document_id: provDocId,
          },
        });

        // Notify provider
        const { data: providerProfiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", (await supabase.from("providers").select("contact_email").eq("id", sp.id).single()).data?.contact_email || "");

        if (providerProfiles?.[0]) {
          await supabase.from("notifications").insert({
            user_id: providerProfiles[0].id,
            title: `Action Required: Sign "${templateName}"`,
            message: `You have a new document to review and sign: ${templateName}.`,
            type: "warning",
            link: `/sign/${sigReq.id}`,
          });
        }

        // Log activity
        await supabase.from("activities").insert({
          provider_id: sp.id,
          user_id: user!.id,
          activity_type: "status_change" as any,
          description: `Document sent for signature: "${templateName}"`,
        });
      }
    },
    onSuccess: () => {
      toast.success(`Sent to ${selectedProviders.length} provider${selectedProviders.length > 1 ? "s" : ""}`);
      queryClient.invalidateQueries({ queryKey: ["template-activity"] });
      queryClient.invalidateQueries({ queryKey: ["template-stats"] });
      queryClient.invalidateQueries({ queryKey: ["provider-documents"] });
      onOpenChange(false);
      setMessage("");
      setSelectedProviders(preselectedProviderId ? [{ id: preselectedProviderId, name: preselectedProviderName || "" }] : []);
      onSuccess?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            Send for E-Signature
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Document info */}
          <div className="bg-muted/50 rounded-lg p-3 flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm truncate">{templateName}</p>
              {!fileUrl && (
                <p className="text-xs text-destructive">No file uploaded — cannot send</p>
              )}
            </div>
          </div>

          {/* Provider selection (Option A) */}
          {showProviderSelect && (
            <div className="space-y-2">
              <Label>Select Providers</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search providers..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {selectedProviders.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedProviders.map(sp => (
                    <Badge key={sp.id} variant="secondary" className="gap-1 text-xs">
                      {sp.name}
                      <button onClick={() => setSelectedProviders(prev => prev.filter(p => p.id !== sp.id))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <ScrollArea className="h-40 border rounded-md">
                <div className="p-1">
                  {filteredProviders.map(p => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedProviders.some(s => s.id === p.id)}
                        onCheckedChange={() => toggleProvider(p)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.business_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.contact_email}</p>
                      </div>
                    </label>
                  ))}
                  {filteredProviders.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No providers found</p>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Pre-selected provider info (Option B) */}
          {!showProviderSelect && preselectedProviderName && (
            <div className="text-sm">
              <Label>Provider</Label>
              <p className="font-medium mt-1">{preselectedProviderName}</p>
            </div>
          )}

          {/* Personal message */}
          <div>
            <Label>Personal Message (optional)</Label>
            <Textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Add a note for the provider..."
              rows={3}
            />
          </div>

          {/* Expiration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Expiration (days)
              </Label>
              <Input
                type="number"
                min={1}
                max={90}
                value={expirationDays}
                onChange={e => setExpirationDays(Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Expires: {format(addDays(new Date(), expirationDays), "MMM d, yyyy")}
              </p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" />
                Identity Verification
              </Label>
              <div className="flex items-center gap-2 mt-2">
                <Switch checked={requireVerification} onCheckedChange={setRequireVerification} />
                <span className="text-sm text-muted-foreground">{requireVerification ? "Required" : "Skipped"}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || selectedProviders.length === 0 || !fileUrl}
          >
            {sendMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Sending...</>
            ) : (
              <><Send className="h-4 w-4 mr-1.5" />Send to {selectedProviders.length} Provider{selectedProviders.length !== 1 ? "s" : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
