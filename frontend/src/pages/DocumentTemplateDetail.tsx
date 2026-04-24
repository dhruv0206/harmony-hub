import { useState, useCallback, useEffect } from "react";
import SendToProviderModal from "@/components/signatures/SendToProviderModal";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft, Download, Upload, Send, Pencil, FileText, File, Eye, Shield, Users,
  Clock, BarChart3, Package, CheckCircle, AlertTriangle, Loader2, PenTool, MoreVertical,
} from "lucide-react";
import { PDFViewer } from "@/components/documents/PDFViewer";
import { DocxViewer } from "@/components/documents/DocxViewer";
import "@/components/documents/docx-preview.css";
import { VersionTrackingWidget } from "@/components/documents/VersionTrackingWidget";

// ─── Type border colors mapped by document_type ─────────────────────────────

const DOC_TYPE_COLORS: Record<string, string> = {
  agreement: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  addendum: "bg-green-500/10 text-green-700 dark:text-green-400",
  exhibit: "bg-muted text-muted-foreground",
  application: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  baa: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
  acknowledgment: "bg-destructive/10 text-destructive",
};

const DOC_TYPE_BORDER: Record<string, string> = {
  agreement: "border-t-blue-500",
  addendum: "border-t-green-500",
  exhibit: "border-t-muted-foreground",
  application: "border-t-orange-500",
  baa: "border-t-purple-500",
  acknowledgment: "border-t-destructive",
};

// ─── Upload New Version Modal ───────────────────────────────────────────────

function UploadVersionModal({ open, onOpenChange, template }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  template: any;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const newVersion = (template.version || 1) + 1;
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${template.short_code.toLowerCase()}_v${newVersion}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("document-templates")
        .upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("document-templates").getPublicUrl(path);

      const { error } = await supabase.from("document_templates").update({
        file_url: urlData.publicUrl,
        file_type: ext === "docx" ? "docx" : "pdf",
        version: newVersion,
      }).eq("id", template.id);
      if (error) throw error;

      toast.success(`Uploaded v${newVersion}`);
      queryClient.invalidateQueries({ queryKey: ["document-template"] });
      onOpenChange(false);
      setFile(null);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Upload New Version</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Current version: <span className="font-medium text-foreground">v{template.version}</span>.
          Uploading will create <span className="font-medium text-foreground">v{(template.version || 1) + 1}</span>.
        </p>
        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 cursor-pointer hover:border-primary/50 transition-colors">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{file ? file.name : "Drag & drop or click to upload"}</span>
          <input type="file" accept=".pdf,.docx" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); setFile(null); }}>Cancel</Button>
          <Button onClick={handleUpload} disabled={uploading || !file}>
            <Upload className="h-4 w-4 mr-1.5" />{uploading ? "Uploading..." : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function DocumentTemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { data: signingFields } = useQuery({
    queryKey: ["template-signing-fields", id],
    queryFn: async () => {
      const { data } = await supabase.from("template_signing_fields").select("id, assigned_to").eq("template_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: template, isLoading } = useQuery({
    queryKey: ["document-template", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_templates").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: usedInPackages } = useQuery({
    queryKey: ["template-packages", id],
    queryFn: async () => {
      const { data } = await supabase.from("package_documents").select("signing_order, is_required, service_packages:package_id(id, name)").eq("template_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: recentActivity } = useQuery({
    queryKey: ["template-activity", id],
    queryFn: async () => {
      const { data } = await supabase.from("provider_documents").select("id, status, sent_at, signed_at, providers(business_name)").eq("template_id", id!).order("created_at", { ascending: false }).limit(5);
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: ["template-stats", id],
    queryFn: async () => {
      const { data } = await supabase.from("provider_documents").select("status, sent_at, signed_at").eq("template_id", id!);
      const docs = data ?? [];
      const sent = docs.length;
      const signed = docs.filter(d => d.status === "signed").length;
      const pending = docs.filter(d => d.status === "sent" || d.status === "pending").length;
      const signedWithTimes = docs.filter(d => d.signed_at && d.sent_at);
      const avgDays = signedWithTimes.length > 0
        ? Math.round(signedWithTimes.reduce((s, d) => s + (new Date(d.signed_at!).getTime() - new Date(d.sent_at!).getTime()) / (1000 * 60 * 60 * 24), 0) / signedWithTimes.length)
        : 0;
      return { sent, signed, pending, avgDays };
    },
    enabled: !!id,
  });

  const toggleActive = useMutation({
    mutationFn: async (active: boolean) => {
      const { error } = await supabase.from("document_templates").update({ is_active: active }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-template", id] });
      toast.success("Status updated");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          <Skeleton className="h-[600px] rounded-lg" />
          <div className="space-y-3">
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium">Template not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/document-templates")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to Templates
        </Button>
      </div>
    );
  }

  const isPdf = template.file_type === "pdf";
  const isDocx = template.file_type === "docx";
  const borderColor = DOC_TYPE_BORDER[template.document_type] || "border-t-muted-foreground";

  const statusColor: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    sent: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    viewed: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    signed: "bg-green-500/10 text-green-700 dark:text-green-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/document-templates")} className="shrink-0 mt-1">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-[28px] font-semibold leading-tight truncate">{template.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 rounded">{template.short_code}</Badge>
              <Badge className={`text-xs px-2 py-0.5 rounded ${DOC_TYPE_COLORS[template.document_type] || "bg-muted text-muted-foreground"}`}>
                {template.document_type}
              </Badge>
              <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded">v{template.version}</Badge>
              <div className="flex items-center gap-2 ml-2">
                <Switch checked={template.is_active ?? true} onCheckedChange={(v) => toggleActive.mutate(v)} />
                <span className="text-xs text-muted-foreground">{template.is_active ? "Active" : "Inactive"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action buttons — desktop */}
        <div className="hidden md:flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => navigate(`/document-templates/${template.id}/fields`)} disabled={!template.file_url}>
            <PenTool className="h-4 w-4 mr-1.5" />Signing Fields
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(`/document-templates?edit=${template.id}`)}>
            <Pencil className="h-4 w-4 mr-1.5" />Edit Details
          </Button>
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />Upload Version
          </Button>
          {template.file_url && (
            <Button variant="outline" size="sm" asChild>
              <a href={template.file_url} download target="_blank" rel="noopener noreferrer">
                <Download className="h-4 w-4 mr-1.5" />Download
              </a>
            </Button>
          )}
          <Button size="sm" onClick={() => setSendOpen(true)} disabled={!template.file_url} className="bg-primary text-primary-foreground hover:bg-primary/90 px-5">
            <Send className="h-4 w-4 mr-1.5" />Send to Provider
          </Button>
        </div>

        {/* Action buttons — mobile dropdown */}
        <div className="md:hidden flex gap-2">
          <Button size="sm" onClick={() => setSendOpen(true)} disabled={!template.file_url} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Send className="h-4 w-4 mr-1.5" />Send
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/document-templates/${template.id}/fields`)}>
                <PenTool className="h-3.5 w-3.5 mr-2" />Signing Fields
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/document-templates?edit=${template.id}`)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />Edit Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUploadOpen(true)}>
                <Upload className="h-3.5 w-3.5 mr-2" />Upload Version
              </DropdownMenuItem>
              {template.file_url && (
                <DropdownMenuItem onClick={() => window.open(template.file_url!, "_blank")}>
                  <Download className="h-3.5 w-3.5 mr-2" />Download
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main content: Viewer + Sidebar */}
      {isFullscreen ? (
        <div className="fixed inset-0 z-50 bg-background">
          {template.file_url && (
            isPdf ? (
              <PDFViewer fileUrl={template.file_url} fileName={`${template.short_code}.pdf`} maxHeight="calc(100vh - 56px)" onToggleFullscreen={() => setIsFullscreen(false)} isFullscreen />
            ) : isDocx ? (
              <DocxViewer fileUrl={template.file_url} onToggleFullscreen={() => setIsFullscreen(false)} isFullscreen />
            ) : null
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
          {/* Document Viewer */}
          <div className="min-h-[500px] space-y-4">
            {template.file_url ? (
              isPdf ? (
                <PDFViewer fileUrl={template.file_url} fileName={`${template.short_code}.pdf`} maxHeight="calc(100vh - 280px)" onToggleFullscreen={() => setIsFullscreen(true)} isFullscreen={false} />
              ) : isDocx ? (
                <DocxViewer fileUrl={template.file_url} onToggleFullscreen={() => setIsFullscreen(true)} isFullscreen={false} />
              ) : (
                <div className="border border-border rounded-lg flex flex-col items-center justify-center py-20 bg-muted/30">
                  <File className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Preview not available for this file type.</p>
                  <Button variant="outline" className="mt-4" asChild>
                    <a href={template.file_url} download target="_blank"><Download className="h-4 w-4 mr-2" />Download File</a>
                  </Button>
                </div>
              )
            ) : (
              <div className="border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center py-20">
                <Upload className="h-16 w-16 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No file uploaded</p>
                <p className="text-sm text-muted-foreground mt-1">Upload a PDF or DOCX to view it here</p>
                <Button className="mt-4" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />Upload File
                </Button>
              </div>
            )}

            {/* File Info */}
            {template.file_url && (
              <Card>
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">File Type</p>
                      <p className="font-medium uppercase">{template.file_type || "Unknown"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Version</p>
                      <p className="font-medium">v{template.version}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Uploaded</p>
                      <p className="font-medium">{new Date(template.updated_at).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-medium">{new Date(template.created_at!).toLocaleDateString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Signing Fields Indicator */}
            {template.file_url && (
              <div className="flex items-center gap-2 text-xs">
                {signingFields && signingFields.length > 0 ? (
                  <>
                    <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      {signingFields.length} signing field{signingFields.length !== 1 ? "s" : ""} configured
                      ({signingFields.filter(f => f.assigned_to === "provider").length} provider, {signingFields.filter(f => f.assigned_to === "admin").length} admin)
                    </Badge>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate(`/document-templates/${template.id}/fields`)}>
                      Edit Fields
                    </Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No signing fields — provider will draw a signature at the bottom
                    </Badge>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => navigate(`/document-templates/${template.id}/fields`)}>
                      Configure Fields
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Right Sidebar */}
          <div className="space-y-3">
            {/* Document Info */}
            <Card className={`border-t-2 ${borderColor}`}>
              <CardHeader className="p-4 pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5" />Document Info
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                {template.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm mt-0.5">{template.description}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Document Type</p>
                  <Badge className={`mt-1 ${DOC_TYPE_COLORS[template.document_type] || ""}`}>{template.document_type}</Badge>
                </div>
                {template.signing_instructions && (
                  <div>
                    <p className="text-xs text-muted-foreground">Signing Instructions</p>
                    <p className="text-sm mt-0.5 bg-muted/50 rounded p-2">{template.signing_instructions}</p>
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  {template.requires_witness && (
                    <Badge variant="outline" className="text-xs"><Eye className="h-3 w-3 mr-1" />Witness Required</Badge>
                  )}
                  {template.requires_notary && (
                    <Badge variant="outline" className="text-xs"><Shield className="h-3 w-3 mr-1" />Notary Required</Badge>
                  )}
                  {!template.requires_witness && !template.requires_notary && (
                    <span className="text-xs text-muted-foreground">No special requirements</span>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Used In Packages */}
            <Card className={`border-t-2 ${borderColor}`}>
              <CardHeader className="p-4 pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Package className="h-3.5 w-3.5" />Used In Packages
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {usedInPackages && usedInPackages.length > 0 ? (
                  <div className="space-y-2">
                    {usedInPackages.map((pd: any) => (
                      <div key={pd.signing_order + pd.service_packages?.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span className="text-sm">{pd.service_packages?.name}</span>
                        <Badge variant="secondary" className="text-[10px]">Order #{pd.signing_order}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not assigned to any packages</p>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className={`border-t-2 ${borderColor}`}>
              <CardHeader className="p-4 pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {recentActivity && recentActivity.length > 0 ? (
                  <div className="space-y-2">
                    {recentActivity.map((a: any) => (
                      <div key={a.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{a.providers?.business_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {a.sent_at ? new Date(a.sent_at).toLocaleDateString() : "—"}
                          </p>
                        </div>
                        <Badge className={`text-[10px] shrink-0 ${statusColor[a.status] || ""}`}>{a.status}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No activity yet</p>
                )}
              </CardContent>
            </Card>

            {/* Version Tracking */}
            <VersionTrackingWidget
              templateId={template.id}
              templateVersion={template.version || 1}
              templateName={template.name}
            />

            {/* Stats */}
            <Card className={`border-t-2 ${borderColor}`}>
              <CardHeader className="p-4 pb-3">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="h-3.5 w-3.5" />Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center p-3 rounded bg-muted/50">
                    <p className="text-2xl font-bold text-muted-foreground">{stats?.sent ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Total Sent</p>
                  </div>
                  <div className="text-center p-3 rounded bg-muted/50">
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats?.signed ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Signed</p>
                  </div>
                  <div className="text-center p-3 rounded bg-muted/50">
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats?.pending ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Pending</p>
                  </div>
                  <div className="text-center p-3 rounded bg-muted/50">
                    <p className="text-2xl font-bold text-muted-foreground">{stats?.avgDays ?? 0}d</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Avg Sign Time</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Modals */}
      <SendToProviderModal open={sendOpen} onOpenChange={setSendOpen} templateId={template.id} templateName={template.name} fileUrl={template.file_url} />
      <UploadVersionModal open={uploadOpen} onOpenChange={setUploadOpen} template={template} />
    </div>
  );
}
