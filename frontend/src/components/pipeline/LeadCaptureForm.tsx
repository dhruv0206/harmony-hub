import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const SOURCES = ["referral", "cold_call", "inbound", "event", "other"];

interface LeadCaptureFormProps {
  onSuccess: () => void;
  participantType?: "providers" | "law_firms";
}

export default function LeadCaptureForm({ onSuccess, participantType = "providers" }: LeadCaptureFormProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isLawFirm = participantType === "law_firms";

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [source, setSource] = useState("inbound");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const name = businessName.trim();
      if (!name) throw new Error(isLawFirm ? "Firm name is required." : "Business name is required.");
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
        throw new Error("Please enter a valid contact email or leave it blank.");
      }
      if (contactPhone && !/^[+()\-.\s\d]{7,}$/.test(contactPhone)) {
        throw new Error("Phone number doesn't look right. Use digits, spaces, dashes, or parentheses.");
      }
      const stateUpper = state.trim().toUpperCase();
      if (stateUpper && !/^[A-Z]{2}$/.test(stateUpper)) {
        throw new Error("State must be a 2-letter US code (e.g. GA, CA).");
      }
      if (estimatedValue && Number(estimatedValue) < 0) {
        throw new Error("Estimated value can't be negative.");
      }
      const noteText = [source ? `Source: ${source}` : "", notes].filter(Boolean).join("\n");

      if (isLawFirm) {
        const { data: firm, error: fErr } = await supabase
          .from("law_firms")
          .insert({
            firm_name: name,
            contact_name: contactName || null,
            contact_email: contactEmail || null,
            contact_phone: contactPhone || null,
            city: city || null,
            state: stateUpper || null,
            status: "prospect",
            assigned_sales_rep: user?.id,
            source: source || null,
            notes: noteText,
          })
          .select()
          .single();
        if (fErr) throw fErr;

        const { error: plErr } = await supabase.from("law_firm_pipeline").insert({
          law_firm_id: firm.id,
          sales_rep_id: user!.id,
          stage: "lead_identified",
          estimated_value: estimatedValue ? Number(estimatedValue) : null,
          probability: 10,
        });
        if (plErr) throw plErr;

        await supabase.from("law_firm_activities").insert({
          activity_type: "note",
          description: `New law firm lead captured: ${businessName} (Source: ${source})`,
          law_firm_id: firm.id,
          user_id: user?.id,
        });
      } else {
        const { data: provider, error: pErr } = await supabase
          .from("providers")
          .insert({
            business_name: name,
            contact_name: contactName || null,
            contact_email: contactEmail || null,
            contact_phone: contactPhone || null,
            city: city || null,
            state: stateUpper || null,
            status: "prospect",
            assigned_sales_rep: user?.id,
            notes: noteText,
          })
          .select()
          .single();
        if (pErr) throw pErr;

        const { error: plErr } = await supabase.from("sales_pipeline").insert({
          provider_id: provider.id,
          sales_rep_id: user!.id,
          stage: "lead_identified",
          estimated_value: estimatedValue ? Number(estimatedValue) : null,
          probability: 10,
        });
        if (plErr) throw plErr;

        await supabase.from("activities").insert({
          activity_type: "note",
          description: `New lead captured: ${businessName} (Source: ${source})`,
          provider_id: provider.id,
          user_id: user?.id,
        });
      }
    },
    onSuccess: () => {
      if (isLawFirm) {
        queryClient.invalidateQueries({ queryKey: ["lf-pipeline"] });
        queryClient.invalidateQueries({ queryKey: ["law-firms"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["pipeline"] });
        queryClient.invalidateQueries({ queryKey: ["providers"] });
      }
      toast.success(isLawFirm ? "Law firm lead captured and added to pipeline" : "Lead captured and added to pipeline");
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>{isLawFirm ? "Firm Name *" : "Business Name *"}</Label>
        <Input maxLength={255} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder={isLawFirm ? "Smith & Partners LLP" : "Acme Corp"} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Contact Name</Label>
          <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
        </div>
        <div>
          <Label>Contact Email</Label>
          <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Phone</Label>
          <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
        </div>
        <div>
          <Label>Estimated Value ($)</Label>
          <Input type="number" min={0} step={100} value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>City</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <Label>State</Label>
          <Input maxLength={2} value={state} onChange={(e) => setState(e.target.value.toUpperCase())} placeholder="GA" />
        </div>
      </div>

      <div>
        <Label>Lead Source</Label>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SOURCES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any additional context..." />
      </div>

      <Button onClick={() => mutation.mutate()} disabled={!businessName || mutation.isPending} className="w-full">
        {mutation.isPending ? "Capturing..." : "Capture Lead"}
      </Button>
    </div>
  );
}
