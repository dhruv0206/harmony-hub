import { useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ZoomIn, ZoomOut, Download, Maximize, Minimize, FileText } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  fileUrl: string;
  fileName?: string;
  maxHeight?: string;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
}

const ZOOM_LEVELS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export function PDFViewer({
  fileUrl,
  fileName,
  maxHeight = "calc(100vh - 260px)",
  onToggleFullscreen,
  isFullscreen,
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  }, []);

  const zoomIn = () => {
    const next = ZOOM_LEVELS.find((z) => z > scale);
    if (next) setScale(next);
  };

  const zoomOut = () => {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < scale);
    if (prev) setScale(prev);
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden flex flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Document Preview</span>
          <span className="text-xs text-muted-foreground">(PDF)</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut} disabled={scale <= ZOOM_LEVELS[0]}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center font-mono">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn} disabled={scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          {numPages > 0 && (
            <span className="text-xs text-muted-foreground ml-2 border-l border-border pl-2">
              {numPages} page{numPages !== 1 ? "s" : ""}
            </span>
          )}
          {onToggleFullscreen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 ml-1" onClick={onToggleFullscreen} title={isFullscreen ? "Exit Full Screen" : "Full Screen"}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
          )}
          <Button variant="outline" size="sm" className="ml-1 h-8" asChild>
            <a href={fileUrl} download={fileName || "document.pdf"} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5 mr-1.5" />Download Original
            </a>
          </Button>
        </div>
      </div>

      {/* Document surface */}
      <div
        ref={containerRef}
        className="overflow-auto doc-surface"
        style={{ maxHeight: isFullscreen ? "calc(100vh - 56px)" : maxHeight }}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex flex-col items-center gap-4 py-8 px-4">
              {[1, 2].map(i => (
                <div key={i} className="rounded shadow-md overflow-hidden" style={{ width: 612, height: 792 }}>
                  <Skeleton className="w-full h-full rounded-none" />
                </div>
              ))}
            </div>
          }
          error={
            <div className="flex items-center justify-center py-20 text-destructive text-sm">
              Failed to load PDF.
            </div>
          }
        >
          <div className="flex flex-col items-center gap-4 py-6 px-4">
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="bg-white rounded shadow-[0_2px_12px_rgba(0,0,0,0.25)] overflow-hidden"
                >
                  <Page
                    pageNumber={i + 1}
                    scale={scale}
                    renderTextLayer
                    renderAnnotationLayer
                  />
                </div>
                <span className="text-[11px] text-muted-foreground mt-2">
                  Page {i + 1} of {numPages}
                </span>
              </div>
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
}
