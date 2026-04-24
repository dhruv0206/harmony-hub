import { useState, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export interface FieldMapping {
  key: string;
  label: string;
  required: boolean;
  validate?: (val: string) => boolean;
}

interface CSVImportWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: FieldMapping[];
  onImport: (rows: Record<string, string>[]) => Promise<{ imported: number; skipped: number }>;
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

function autoMap(csvHeaders: string[], fields: FieldMapping[]): Record<string, string> {
  const map: Record<string, string> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  fields.forEach(f => {
    const nk = normalize(f.key);
    const nl = normalize(f.label);
    const match = csvHeaders.find(h => {
      const nh = normalize(h);
      return nh === nk || nh === nl || nh.includes(nk) || nk.includes(nh) || nh.includes(nl);
    });
    if (match) map[f.key] = match;
  });
  return map;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CSVImportWizard({ open, onOpenChange, title, fields, onImport }: CSVImportWizardProps) {
  const [step, setStep] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [skipErrors, setSkipErrors] = useState(true);

  const reset = () => {
    setStep(0); setCsvHeaders([]); setCsvRows([]); setColumnMap({}); setImporting(false); setProgress(0); setResult(null);
  };

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) { toast.error("Please upload a CSV file"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const { headers, rows } = parseCSV(e.target?.result as string);
      if (headers.length === 0) { toast.error("Could not parse CSV"); return; }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setColumnMap(autoMap(headers, fields));
      setStep(1);
    };
    reader.readAsText(file);
  }, [fields]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const mappedRows = useMemo(() => {
    return csvRows.map(row => {
      const obj: Record<string, string> = {};
      fields.forEach(f => {
        const csvCol = columnMap[f.key];
        if (csvCol) {
          const idx = csvHeaders.indexOf(csvCol);
          obj[f.key] = idx >= 0 ? (row[idx] || "") : "";
        } else {
          obj[f.key] = "";
        }
      });
      return obj;
    });
  }, [csvRows, columnMap, csvHeaders, fields]);

  const validatedRows = useMemo(() => {
    return mappedRows.map(row => {
      let status = "valid" as string;
      const issues: string[] = [];
      fields.forEach(f => {
        const val = row[f.key]?.trim();
        if (f.required && !val) { status = "error"; issues.push(`${f.label} required`); }
        if (f.validate && val && !f.validate(val)) { status = "error"; issues.push(`${f.label} invalid`); }
        if (f.key === "contact_email" && val && !emailRegex.test(val)) { status = "error"; issues.push("Invalid email"); }
      });
      if (status === "valid") {
        const optionalMissing = fields.filter(f => !f.required && !row[f.key]?.trim());
        if (optionalMissing.length > 0) status = "warning";
      }
      return { ...row, _status: status, _issues: issues };
    });
  }, [mappedRows, fields]);

  const counts = useMemo(() => ({
    valid: validatedRows.filter(r => r._status === "valid").length,
    warning: validatedRows.filter(r => r._status === "warning").length,
    error: validatedRows.filter(r => r._status === "error").length,
  }), [validatedRows]);

  const importableRows = useMemo(() => {
    return validatedRows.filter(r => r._status !== "error").map(({ _status, _issues, ...rest }) => rest);
  }, [validatedRows]);

  const handleImport = async () => {
    setImporting(true);
    setProgress(10);
    try {
      const res = await onImport(importableRows);
      setProgress(100);
      setResult(res);
      setStep(3);
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          {["Upload CSV", "Map Columns", "Preview", "Import"].map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
              <span className={i === step ? "font-medium text-foreground" : ""}>{s}</span>
              {i < 3 && <ArrowRight className="h-3 w-3 mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 0: Upload */}
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
            <p className="font-medium">Drop a CSV file here or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">Supports .csv files</p>
          </div>
        )}

        {/* Step 1: Map Columns */}
        {step === 1 && (
          <div className="space-y-4 flex-1 overflow-auto">
            <p className="text-sm text-muted-foreground">Detected {csvHeaders.length} columns and {csvRows.length} rows. Map each field to a CSV column.</p>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(f => (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="text-sm w-36 truncate">{f.label}{f.required && " *"}</span>
                  <Select value={columnMap[f.key] || "_none"} onValueChange={v => setColumnMap(prev => ({ ...prev, [f.key]: v === "_none" ? "" : v }))}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Select column" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">— Skip —</SelectItem>
                      {csvHeaders.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            {/* Preview first 5 rows */}
            <div>
              <p className="text-xs font-medium mb-2">Preview (first 5 rows)</p>
              <ScrollArea className="max-h-40 border rounded">
                <Table>
                  <TableHeader>
                    <TableRow>{csvHeaders.map(h => <TableHead key={h} className="text-xs">{h}</TableHead>)}</TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>{row.map((c, j) => <TableCell key={j} className="text-xs py-1">{c}</TableCell>)}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              <Button onClick={() => setStep(2)}>Preview & Validate<ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </div>
        )}

        {/* Step 2: Validate */}
        {step === 2 && (
          <div className="space-y-4 flex-1 overflow-auto">
            <div className="flex items-center gap-4 text-sm">
              <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-700"><CheckCircle2 className="h-3 w-3" />{counts.valid} Valid</Badge>
              <Badge variant="outline" className="gap-1 bg-yellow-500/10 text-yellow-700"><AlertTriangle className="h-3 w-3" />{counts.warning} Warnings</Badge>
              <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-700"><XCircle className="h-3 w-3" />{counts.error} Errors</Badge>
            </div>
            <ScrollArea className="max-h-[400px] border rounded">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Status</TableHead>
                    {fields.filter(f => f.required || columnMap[f.key]).map(f => (
                      <TableHead key={f.key} className="text-xs">{f.label}</TableHead>
                    ))}
                    <TableHead className="text-xs">Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validatedRows.map((row, i) => (
                    <TableRow key={i} className={row._status === "error" ? "bg-red-500/5" : row._status === "warning" ? "bg-yellow-500/5" : ""}>
                      <TableCell>
                        {row._status === "valid" && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {row._status === "warning" && <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                        {row._status === "error" && <XCircle className="h-4 w-4 text-red-600" />}
                      </TableCell>
                      {fields.filter(f => f.required || columnMap[f.key]).map(f => (
                        <TableCell key={f.key} className="text-xs py-1">{row[f.key] || "—"}</TableCell>
                      ))}
                      <TableCell className="text-xs text-destructive">{row._issues.join(", ")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
              <Button onClick={handleImport} disabled={importableRows.length === 0 || importing}>
                {importing ? "Importing..." : `Import ${importableRows.length} Records`}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 3 && result && (
          <div className="text-center py-8 space-y-4">
            <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
            <h3 className="text-lg font-semibold">Import Complete</h3>
            <p className="text-muted-foreground">
              <span className="text-green-600 font-medium">{result.imported}</span> imported.{" "}
              {result.skipped > 0 && <span className="text-yellow-600 font-medium">{result.skipped} skipped.</span>}
            </p>
            <Button onClick={() => { reset(); onOpenChange(false); }}>Done</Button>
          </div>
        )}

        {importing && (
          <div className="px-2">
            <Progress value={progress} className="h-2" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
