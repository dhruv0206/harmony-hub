import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Column<T> {
  header: string;
  accessor: (row: T) => ReactNode;
  /** If true, show this field prominently as the card title on mobile */
  primary?: boolean;
  /** Hide this column on mobile card view */
  hideMobile?: boolean;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  keyExtractor: (row: T) => string;
}

export function ResponsiveTable<T>({ columns, data, onRowClick, keyExtractor }: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="space-y-3">
        {data.map((row) => (
          <Card
            key={keyExtractor(row)}
            className={onRowClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}
            onClick={() => onRowClick?.(row)}
          >
            <CardContent className="p-4 space-y-2">
              {columns
                .filter((c) => !c.hideMobile)
                .map((col, i) => (
                  <div key={i} className={col.primary ? "text-base font-semibold" : "flex items-center justify-between text-sm"}>
                    {col.primary ? (
                      col.accessor(row)
                    ) : (
                      <>
                        <span className="text-muted-foreground">{col.header}</span>
                        <span className="text-right">{col.accessor(row)}</span>
                      </>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map((col, i) => (
            <TableHead key={i}>{col.header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <TableRow
            key={keyExtractor(row)}
            className={onRowClick ? "cursor-pointer" : ""}
            onClick={() => onRowClick?.(row)}
          >
            {columns.map((col, i) => (
              <TableCell key={i}>{col.accessor(row)}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
