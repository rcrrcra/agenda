"""Exportação para Excel (.xlsx) com openpyxl: uma resposta HTTP a partir de abas `(título, cabeçalhos, linhas)`.

Todo texto é gravado como texto (nunca como fórmula), então valores iniciados por `=`, `+`, `-` ou `@` não são executados.
"""
from io import BytesIO

from django.http import HttpResponse
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def workbook_response(filename, sheets):
    """Monta o arquivo e devolve o `HttpResponse` de download. `sheets`: lista de `(título, cabeçalhos, linhas)`."""
    wb = Workbook()
    wb.remove(wb.active)
    for title, headers, rows in sheets:
        ws = wb.create_sheet(title[:31])
        ws.append(list(headers))
        for cell in ws[1]:
            cell.font = Font(bold=True)
        ws.freeze_panes = "A2"
        widths = [len(str(h)) for h in headers]
        for row in rows:
            ws.append(list(row))
            for i, v in enumerate(row):
                widths[i] = min(max(widths[i], len(str(v if v is not None else ""))), 60)
        for row in ws.iter_rows(min_row=1):
            for cell in row:
                if isinstance(cell.value, str):
                    cell.data_type = "s"          # força texto: sem fórmulas vindas de dados
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w + 2
    buf = BytesIO()
    wb.save(buf)
    response = HttpResponse(buf.getvalue(), content_type=CONTENT_TYPE)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
