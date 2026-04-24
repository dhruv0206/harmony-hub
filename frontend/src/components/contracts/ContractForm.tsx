import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Constants } from "@/integrations/supabase/types";
import type { Database } from "@/integrations/supabase/types";

type ContractType = Database["public"]["Enums"]["contract_type"];
type ContractStatus = Database["public"]["Enums"]["contract_status"];

interface ContractFormProps {
  contractId?: string;
  defaultProviderId?: string;
  // Invoked on save success. Receives the (created-or-updated) contract id so
  // callers can navigate to /contracts/:id if desired.
  onSuccess: (createdContractId?: string) => void;
}

export default function ContractForm({ contractId, defaultProviderId, onSuccess }: ContractFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [providerId, setProviderId] = useState(defaultProviderId || "");
  const [contractType, setContractType] = useState<ContractType>("standard");
  const [status, setStatus] = useState<ContractStatus>("draft");
  const [dealValue, setDealValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [renewalDate, setRenewalDate] = useState("");
  const [termsSummary, setTermsSummary] = useState("");
  const [providerSearch, setProviderSearch] = useState("");
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: providers } = useQuery({
    queryKey: ["providers_list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("providers").select("id, business_name").order("business_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["contract", contractId],
    enabled: !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("*").eq("id", contractId!).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (existing) {
      setProviderId(existing.provider_id);
      setContractType(existing.contract_type);
      setStatus(existing.status);
      setDealValue(String(existing.deal_value || ""));
      setStartDate(existing.start_date || "");
      setEndDate(existing.end_date || "");
      setRenewalDate(existing.renewal_date || "");
      setTermsSummary(existing.terms_summary || "");
      setDocumentUrl(existing.document_url || null);
    }
  }, [existing]);

  // Auto-calculate renewal date: 30 days before end date
  useEffect(() => {
    if (startDate && endDate && !renewalDate) {
      const end = new Date(endDate);
      end.setDate(end.getDate() - 30);
      setRenewalDate(end.toISOString().split("T")[0]);
    }
  }, [startDate, endDate]);

  // Uploads to private `contracts` bucket; returns the storage PATH (not a URL).
  // Signed URLs are generated on-demand when the file is rendered/previewed.
  const uploadPdf = async (file: File): Promise<string> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user?.id || "anon"}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("contracts").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/pdf",
    });
    if (upErr) throw upErr;
    return path;
  };

  // Resolve a viewable URL from either a legacy http link (seeded demo data) or
  // a storage path in the private `contracts` bucket → signed URL (1h).
  const { data: displayDocUrl } = useQuery({
    queryKey: ["contract-doc-display", documentUrl],
    queryFn: async () => {
      if (!documentUrl) return null;
      if (documentUrl.startsWith("http")) return documentUrl;
      const { data } = await supabase.storage.from("contracts").createSignedUrl(documentUrl, 3600);
      return data?.signedUrl || null;
    },
    enabled: !!documentUrl,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      let finalDocUrl = documentUrl;
      if (pendingFile) {
        setUploading(true);
        try {
          finalDocUrl = await uploadPdf(pendingFile);
        } finally {
          setUploading(false);
        }
      }
      const payload = {
        provider_id: providerId,
        contract_type: contractType,
        status,
        deal_value: dealValue ? Number(dealValue) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        renewal_date: renewalDate || null,
        terms_summary: termsSummary || null,
        document_url: finalDocUrl,
        created_by: user?.id || null,
      };
      if (contractId) {
        const { error } = await supabase.from("contracts").update(payload).eq("id", contractId);
        if (error) throw error;
        return contractId;
      } else {
        const { data, error } = await supabase.from("contracts").insert(payload).select("id").single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ["v-contract-list"] });
      queryClient.invalidateQueries({ queryKey: ["contract"] });
      toast.success(contractId ? "Contract updated" : "Contract created");
      onSuccess(newId);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredProviders = providers?.filter((p) =>
    p.business_name.toLowerCase().includes(providerSearch.toLowerCase())
  ) || [];

  return (
    <div className="space-y-4">
      <div>
        <Label>Provider</Label>
        <Select value={providerId} onValueChange={setProviderId}>
          <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
          <SelectContent>
            <div className="p-2">
              <Input placeholder="Search providers..." value={providerSearch} onChange={(e) => setProviderSearch(e.target.value)} className="mb-2" />
            </div>
            {filteredProviders.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.business_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Contract Type</Label>
          <Select value={contractType} onValueChange={(v) => setContractType(v as ContractType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Constants.public.Enums.contract_type.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ContractStatus)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Constants.public.Enums.contract_status.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Deal Value ($)</Label>
        <Input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label>Start Date</Label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div>
          <Label>End Date</Label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div>
          <Label>Renewal Date</Label>
          <Input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Terms Summary</Label>
        <Textarea value={termsSummary} onChange={(e) => setTermsSummary(e.target.value)} rows={4} placeholder="Key contract terms..." />
      </div>

      <div>
        <Label>Contract PDF</Label>
        <div className="mt-1 border border-dashed border-border rounded-md p-4 bg-muted/30">
          {pendingFile ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="text-sm truncate">{pendingFile.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{(pendingFile.size / 1024).toFixed(0)} KB</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPendingFile(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : documentUrl ? (
            <div className="flex items-center justify-between gap-2">
              <a href={displayDocUrl || "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline min-w-0">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{displayDocUrl ? "View current PDF" : "Loading PDF..."}</span>
              </a>
              <label className="text-xs text-primary hover:underline cursor-pointer flex-shrink-0">
                Replace
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
              </label>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 cursor-pointer py-2 text-sm text-muted-foreground hover:text-foreground">
              <Upload className="h-4 w-4" />
              <span>Upload contract PDF (will be sent for e-signature)</span>
              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPendingFile(e.target.files?.[0] || null)} />
            </label>
          )}
        </div>
      </div>

      <Button onClick={() => mutation.mutate()} disabled={!providerId || mutation.isPending || uploading} className="w-full">
        {uploading ? "Uploading PDF..." : mutation.isPending ? "Saving..." : contractId ? "Update Contract" : "Create Contract"}
      </Button>
    </div>
  );
}
