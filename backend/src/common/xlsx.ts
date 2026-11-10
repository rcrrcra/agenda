/** Exportação para Excel (.xlsx) com ExcelJS. Todo texto é gravado como texto (nunca fórmula): `=`, `+`, `-`, `@` não executam. */
import { StreamableFile } from "@nestjs/common";
import { Workbook } from "exceljs";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export type Sheet = [title: string, headers: string[], rows: (string | number | null)[][]];

export async function workbookResponse(filename: string, sheets: Sheet[]): Promise<StreamableFile> {
  const wb = new Workbook();
  for (const [title, headers, rows] of sheets) {
    const ws = wb.addWorksheet(title.slice(0, 31));
    ws.addRow(headers).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const widths = headers.map((h) => h.length);
    for (const row of rows) {
      ws.addRow(row.map((v) => (v === undefined ? null : v)));
      row.forEach((v, i) => { widths[i] = Math.min(Math.max(widths[i], String(v ?? "").length), 60); });
    }
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w + 2; });
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new StreamableFile(buf, { type: XLSX_TYPE, disposition: `attachment; filename="${filename}"` });
}
