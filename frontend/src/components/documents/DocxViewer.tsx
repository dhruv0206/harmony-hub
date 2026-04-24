import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Maximize, Minimize, Loader2, AlertTriangle, FileText } from "lucide-react";
import { downloadStorageFile } from "@/lib/download-storage-file";
import { sanitizeHtml } from "@/lib/sanitize";

interface DocxViewerProps {
  fileUrl: string;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  maxHeight?: string;
}

export function DocxViewer({ fileUrl, onToggleFullscreen, isFullscreen, maxHeight = "calc(100vh - 260px)" }: DocxViewerProps) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const arrayBuffer = await downloadStorageFile(fileUrl);
        const mammoth = await import("mammoth");
        const result = await (mammoth as any).convertToHtml(
          { arrayBuffer },
          {
            styleMap: [
              "p[style-name='Heading 1'] => h1:fresh",
              "p[style-name='Heading 2'] => h2:fresh",
              "p[style-name='Heading 3'] => h3:fresh",
              "p[style-name='Title'] => h1.doc-title:fresh",
              "p[style-name='Subtitle'] => h2.doc-subtitle:fresh",
              "b => strong",
              "i => em",
              "u => u",
              "strike => s",
              "p[style-name='List Paragraph'] => li:fresh",
            ],
          }
        );
        if (!cancelled) {
          setHtml(result.value);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to render document");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  if (error) return (
    <div className="flex items-center justify-center py-20 text-destructive border border-border rounded-lg">
      <AlertTriangle className="h-5 w-5 mr-2" />
      <span>{error}</span>
    </div>
  );

  return (
    <div className="border border-border rounded-lg overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Document Preview</span>
          <span className="text-xs text-muted-foreground">(DOCX)</span>
        </div>
        <div className="flex items-center gap-1">
          {onToggleFullscreen && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleFullscreen} title={isFullscreen ? "Exit Full Screen" : "Full Screen"}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="outline" size="sm" className="h-8" asChild>
            <a href={fileUrl} download target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5 mr-1.5" />Download Original
            </a>
          </Button>
        </div>
      </div>

      {/* Document surface */}
      <div
        className="overflow-auto doc-surface"
        style={{ maxHeight: isFullscreen ? "calc(100vh - 56px)" : maxHeight }}
      >
        {loading ? (
          <div className="flex flex-col items-center py-8 px-4">
            <div className="rounded shadow-md overflow-hidden" style={{ maxWidth: 816, width: "100%", height: 792 }}>
              <Skeleton className="w-full h-full rounded-none" />
            </div>
          </div>
        ) : (
          <div className="flex justify-center py-6 px-4">
            <div className="flex flex-col items-center">
              <div
                className="docx-preview bg-white rounded shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
                style={{
                  maxWidth: 816,
                  width: "100%",
                  padding: "72px",
                  fontFamily: "'Georgia', 'Times New Roman', serif",
                  fontSize: "12pt",
                  lineHeight: 1.6,
                  color: "#1a1a1a",
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
              />
              <span className="text-[11px] text-muted-foreground mt-2">Page 1 of 1</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
