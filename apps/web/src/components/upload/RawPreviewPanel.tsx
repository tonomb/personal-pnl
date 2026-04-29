import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RawPreviewPanelProps {
  headers: string[];
  rawRows: Record<string, string>[];
  maxRows?: number;
}

export function RawPreviewPanel({ headers, rawRows, maxRows = 10 }: RawPreviewPanelProps) {
  const visibleRows = rawRows.slice(0, maxRows);
  const total = rawRows.length;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">
        File preview{" "}
        <span className="text-muted-foreground font-normal">
          (first {visibleRows.length} of {total} {total === 1 ? "row" : "rows"})
        </span>
      </p>
      {visibleRows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No rows in file.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row, i) => (
              <TableRow key={i}>
                {headers.map((h) => (
                  <TableCell key={h}>{row[h] ?? ""}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
