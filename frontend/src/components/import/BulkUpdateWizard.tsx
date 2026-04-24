import { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react";
import { toast } from "sonner";

interface BulkUpdateWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  matchFields: string[];
  onUpdate: (rows: Record<string, string>[]) => Promise<{ updated: number; notFound: number }>;
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
      else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine).filter(r => r.some(c => c));
  return { headers, rows };
}

export function BulkUpdateWizard({ open, onOpenChange, title, matchFields, onUpdate }: BulkUpdateWizardProps) {
  const [step, setStep] = useState(0);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<{ updated: number; notFound: number } | null>(null);

  const reset = () => { setStep(0); setHeaders([]); setRows([]); setUpdating(false); setResult(null); };

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a CSV file"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers: h, rows: r } = parseCSV(e.target?.result as string);
      if (h.length === 0) { toast.error("Could not parse CSV"); return; }
      const hasMatch = matchFields.some(mf => h.some(col => col.toLowerCase().replace(/[^a-z0-9]/g, "") === mf.toLowerCase().replace(/[^a-z0-9]/g, "")));
      if (!hasMatch) { toast.error(`CSV must contain at least one match column: ${matchFields.join(", ")}`); return; }
      setHeaders(h);
      const mapped = r.map(row => {
        const obj: Record<string, string> = {};
        h.forEach((col, i) => { obj[col] = row[i] || ""; });
        return obj;
      });
      setRows(mapped);
      setStep(1);
    };
    reader.readAsText(file);
  }, [matchFields]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const updateFields = useMemo(() => headers.filter(h => !matchFields.some(mf => h.toLowerCase().replace(/[^a-z0-9]/g, "") === mf.toLowerCase().replace(/[^a-z0-9]/g, ""))), [headers, matchFields]);

  const handleUpdate = async () => {
    setUpdating(true);
    try {
      const res = await onUpdate(rows);
      setResult(res);
      setStep(2);
    } catch (e: any) {
      toast.error(e.message || "Update failed");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>

        {step === 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file"; input.accept = ".csv";
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFile(file);
              };
              input.click();
            }}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
            <p className="font-medium">Drop a CSV with updates</p>
            <p className="text-sm text-muted-foreground mt-1">Must include a match column: {matchFields.join(" or ")}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4 flex-1 overflow-auto">
            <p className="text-sm text-muted-foreground">
              Will update <span className="font-medium">{rows.length}</span> records.
              Fields to update: <span className="font-medium">{updateFields.join(", ") || "none"}</span>
            </p>
            <ScrollArea className="max-h-[400px] border rounded">
              <Table>
                <TableHeader>
                  <TableRow>{headers.map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 50).map((row, i) => (
                    <TableRow key={i}>
                      {headers.map(h => <TableCell key={h} className="text-xs py-1">{row[h]}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            {rows.length > 50 && <p className="text-xs text-muted-foreground">Showing first 50 of {rows.length} rows</p>}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={handleUpdate} disabled={updating}>
                <RefreshCw className={`h-4 w-4 mr-1 ${updating ? "animate-spin" : ""}`} />
                {updating ? "Updating..." : `Update ${rows.length} Records`}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && result && (
          <div className="text-center py-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
            <h3 className="text-lg font-semibold">Update Complete</h3>
            <p className="text-muted-foreground">
              <span className="text-green-600 font-medium">{result.updated}</span> updated.{" "}
              {result.notFound > 0 && <span className="text-yellow-600 font-medium">{result.notFound} not matched.</span>}
            </p>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
