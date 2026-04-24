import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onFirst?: () => void;
  onLast?: () => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
}

export function PaginationControls({ page, pageSize, total, onPrev, onNext, onFirst, onLast, onPageSizeChange, pageSizeOptions }: Props) {
  const totalPages = Math.ceil(total / pageSize);
  if (total <= 0) return null;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
        </p>
        {onPageSizeChange && pageSizeOptions && (
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map(size => (
                <SelectItem key={size} value={String(size)}>{size} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-1">
        {onFirst && (
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page === 0} onClick={onFirst}>
            <ChevronsLeft className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>
          <ChevronLeft className="h-4 w-4 mr-1" />Prev
        </Button>
        <span className="text-sm text-muted-foreground px-2">
          Page {page + 1} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={onNext}>
          Next<ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        {onLast && (
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages - 1} onClick={onLast}>
            <ChevronsRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
