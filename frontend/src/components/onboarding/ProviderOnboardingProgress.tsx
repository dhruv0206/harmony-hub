import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2, Circle, Play, Lock, ArrowRight,
  Mail, FileText, Upload, Pencil, Bot, Shield, GraduationCap, CheckSquare,
  AlertTriangle, Eye, PartyPopper, Rocket
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, addDays } from "date-fns";

const STEP_ICONS: Record<string, typeof Mail> = {
  auto_email: Mail,
  manual_task: CheckSquare,
  document_upload: Upload,
  contract_review: FileText,
  e_signature: Pencil,
  ai_verification: Bot,
  approval: Shield,
  training: GraduationCap,
};

// High-level stage labels for the stepper
const STEP_LABELS: Record<string, string> = {
  auto_email: "Account Created",
  contract_review: "Documents Under Review",
  e_signature: "Documents Signed",
  approval: "Credentials Issued",
  training: "Training",
  manual_task: "Go Live",
  document_upload: "Documents Uploaded",
  ai_verification: "AI Verification",
};

export default function ProviderOnboardingProgress() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data: provider } = useQuery({
    queryKey: ["my-provider-for-onboarding"],
    queryFn: async () => {
      const { data: prof } = await supabase.from("profiles").select("email").eq("id", user!.id).single();
      if (!prof?.email) return null;
      const { data } = await supabase.from("providers").select("id").eq("contact_email", prof.email).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const { data: workflow } = useQuery({
    queryKey: ["my-onboarding-workflow", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("onboarding_workflows")
        .select("*")
        .eq("provider_id", provider!.id)
        .in("status", ["in_progress", "not_started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!provider?.id,
  });

  const { data: steps } = useQuery({
    queryKey: ["my-workflow-steps", workflow?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workflow_steps")
        .select("*")
        .eq("workflow_id", workflow!.id)
        .order("step_number");
      return data ?? [];
    },
    enabled: !!workflow?.id,
  });

  // Fetch provider documents
  const { data: providerDocs } = useQuery({
    queryKey: ["my-provider-documents", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("provider_documents")
        .select("*, document_templates(name, document_type), signature_requests:signature_request_id(id, status)")
        .eq("provider_id", provider!.id)
        .neq("status", "voided")
        .order("signing_order");
      return data ?? [];
    },
    enabled: !!provider?.id,
  });

  // Fetch active contract for AI review link
  const { data: activeContract } = useQuery({
    queryKey: ["provider-active-contract", provider?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, status")
        .eq("provider_id", provider!.id)
        .in("status", ["sent", "pending_review", "active", "draft"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!provider?.id,
  });

  if (!workflow || !steps || steps.length === 0) return null;

  const docs = providerDocs ?? [];
  const totalDocs = docs.length;
  const signedDocs = docs.filter(d => d.status === "signed").length;
  const allDocsSigned = totalDocs > 0 && signedDocs >= totalDocs;
  const docProgressPct = totalDocs > 0 ? (signedDocs / totalDocs) * 100 : 0;

  const completedCount = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const remainingManual = steps.filter((s) => s.status !== "completed" && s.status !== "skipped" && !s.auto_trigger).length;
  const estGoLiveDate = addDays(new Date(), Math.max(1, remainingManual * 2));

  // Determine which documents are ready to sign (signing order enforcement)
  const canSign = (doc: typeof docs[0]) => {
    if (!doc.signing_order) return true;
    const prev = docs.filter(d => d.signing_order != null && d.signing_order < doc.signing_order! && d.status !== "voided");
    return prev.every(d => d.status === "signed");
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Rocket className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Your Onboarding Progress</h2>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {steps.length} steps completed · Estimated go-live: {format(estGoLiveDate, "MMM d, yyyy")}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* LEFT — Document Signing Progress (60%) */}
        <Card className="lg:col-span-3 border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Your Documents
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                {signedDocs} of {totalDocs} signed
              </Badge>
            </div>
            <Progress value={docProgressPct} className="h-2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-2">
            {docs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No documents assigned yet.</p>
            ) : (
              <>
                {docs.map((doc) => {
                  const tmpl = (doc as any).document_templates;
                  const sigReq = (doc as any).signature_requests;
                  const isSigned = doc.status === "signed";
                  const isReady = !isSigned && (doc.status === "sent" || doc.status === "viewed") && canSign(doc);
                  const isLocked = !isSigned && !isReady && doc.status !== "declined";
                  const isDeclined = doc.status === "declined";

                  return (
                    <div
                      key={doc.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                        isReady ? "border-primary/30 bg-primary/5" :
                        isSigned ? "border-success/20 bg-success/5" :
                        isDeclined ? "border-destructive/20 bg-destructive/5" :
                        "border-border"
                      }`}
                    >
                      {/* Status icon */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        isSigned ? "bg-success/10 text-success" :
                        isReady ? "bg-primary/10 text-primary" :
                        isDeclined ? "bg-destructive/10 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {isSigned ? <CheckCircle2 className="h-4 w-4" /> :
                         isReady ? <Pencil className="h-4 w-4" /> :
                         isDeclined ? <AlertTriangle className="h-4 w-4" /> :
                         <Lock className="h-4 w-4" />}
                      </div>

                      {/* Document info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{tmpl?.name || "Document"}</span>
                          <Badge variant="secondary" className="text-[10px] capitalize shrink-0">
                            {tmpl?.document_type || "document"}
                          </Badge>
                        </div>
                        {isSigned && doc.signed_at && (
                          <p className="text-xs text-muted-foreground">
                            Signed {format(new Date(doc.signed_at), "MMM d, yyyy")}
                          </p>
                        )}
                        {isLocked && (
                          <p className="text-xs text-muted-foreground">
                            Previous document must be signed first
                          </p>
                        )}
                        {isReady && (
                          <p className="text-xs text-primary font-medium">Ready for your signature</p>
                        )}
                      </div>

                      {/* Action */}
                      {isSigned && sigReq?.id && (
                        <Button variant="ghost" size="sm" onClick={() => navigate(`/signing/${sigReq.id}`)}>
                          <Eye className="h-3.5 w-3.5 mr-1" />Certificate
                        </Button>
                      )}
                      {isReady && sigReq?.id && (
                        <Button size="sm" onClick={() => navigate(`/signing/${sigReq.id}`)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />Review & Sign
                        </Button>
                      )}
                      {isLocked && (
                        <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  );
                })}

                {/* All signed banner */}
                {allDocsSigned && (
                  <div className="flex items-center gap-3 p-4 rounded-lg bg-success/10 border border-success/20 mt-2">
                    <PartyPopper className="h-5 w-5 text-success shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-success">All documents signed!</p>
                      <p className="text-xs text-muted-foreground">Your account is being activated by our team.</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* RIGHT — Onboarding Steps Stepper (40%) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Onboarding Steps</CardTitle>
            <CardDescription className="text-xs">
              Estimated go-live: {format(estGoLiveDate, "MMMM d, yyyy")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {steps.map((step, idx) => {
                const isComplete = step.status === "completed" || step.status === "skipped";
                const isCurrent = step.status === "in_progress";
                const isBlocked = step.status === "blocked";
                const isLast = idx === steps.length - 1;
                const Icon = STEP_ICONS[step.step_type] || CheckSquare;
                const label = STEP_LABELS[step.step_type] || step.step_name;

                return (
                  <div key={step.id} className="flex gap-3">
                    {/* Vertical line + dot */}
                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        isComplete ? "border-success bg-success/10 text-success" :
                        isCurrent ? "border-primary bg-primary/10 text-primary" :
                        isBlocked ? "border-destructive bg-destructive/10 text-destructive" :
                        "border-muted-foreground/30 bg-muted text-muted-foreground"
                      }`}>
                        {isComplete ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : isCurrent ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                        ) : isBlocked ? (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        ) : (
                          <Circle className="h-3.5 w-3.5" />
                        )}
                      </div>
                      {!isLast && (
                        <div className={`w-0.5 flex-1 min-h-[20px] ${
                          isComplete ? "bg-success" : "bg-border"
                        }`} />
                      )}
                    </div>

                    {/* Step content */}
                    <div className={`pb-4 ${isLast ? "pb-0" : ""}`}>
                      <p className={`text-sm leading-tight ${
                        isComplete ? "text-muted-foreground" :
                        isCurrent ? "font-semibold text-foreground" :
                        "text-muted-foreground"
                      }`}>
                        {step.step_name}
                      </p>
                      {isCurrent && step.step_type === "e_signature" && totalDocs > 0 && (
                        <p className="text-xs text-primary mt-0.5">{signedDocs}/{totalDocs} documents signed</p>
                      )}
                      {isComplete && step.completed_at && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(step.completed_at), "MMM d")}
                        </p>
                      )}
                      {isCurrent && step.step_type === "contract_review" && activeContract?.id && (
                        <Button
                          size="sm"
                          variant="link"
                          className="p-0 h-auto text-xs text-primary"
                          onClick={() => navigate(`/contracts/${activeContract.id}/review`)}
                        >
                          Review with AI <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
