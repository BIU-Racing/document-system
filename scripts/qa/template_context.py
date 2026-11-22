"""Independent template context extractor (openpyxl, not the app's OOXML code).

For every ESF/ASES mapping entry, read the official template and report what the
template itself says around the target cell: row label to the left, column header
above, data validation, number format, lock state and formula status.
Usage: python template_context.py <repo> <scratch>
"""
import json, re, sys
from openpyxl import load_workbook
from openpyxl.utils import range_boundaries, get_column_letter

repo, scratch = sys.argv[1], sys.argv[2]
coverage = json.load(open(f"{repo}/data/coverage.normalized.json"))["entries"]
systems = {s["id"]: s["fields"] for s in json.load(open(f"{repo}/data/systems.normalized.json"))}
systems["COORDINATOR"] = json.load(open(f"{repo}/data/coordinator.normalized.json"))
files = {"esf": f"{scratch}/esf-template.xlsx", "ases": f"{scratch}/ases-template.xlsm"}

def text(v):
    if v is None: return ""
    s = str(v).strip()
    return "" if s.startswith("=") else re.sub(r"\s+", " ", s)

out = []
for kind, path in files.items():
    wb = load_workbook(path, keep_vba=(kind == "ases"))
    for e in [e for e in coverage if e["official"]["document"].lower() == kind]:
        ws = wb[e["official"]["sheet"]]
        first = e["official"]["ranges"][0].split(":")[0]
        c0, r0, _, _ = range_boundaries(first)
        merged_anchor = {}
        for mr in ws.merged_cells.ranges:
            for row in range(mr.min_row, mr.max_row + 1):
                for col in range(mr.min_col, mr.max_col + 1):
                    merged_anchor[(row, col)] = (mr.min_row, mr.min_col)
        def val(row, col):
            ar, ac = merged_anchor.get((row, col), (row, col))
            return text(ws.cell(ar, ac).value)
        own_anchor = merged_anchor.get((r0, c0), (r0, c0))
        left = []
        col = c0 - 1
        while col >= 1 and len(left) < 2:
            if merged_anchor.get((r0, col), (r0, col)) != own_anchor:
                v = val(r0, col)
                if v and (not left or left[-1] != v): left.append(v)
            col -= 1
        above = []
        row = r0 - 1
        while row >= max(1, r0 - 25) and len(above) < 2:
            if merged_anchor.get((row, c0), (row, c0)) != own_anchor:
                v = val(row, c0)
                if v and (not above or above[-1] != v): above.append(v)
            row -= 1
        cell = ws[first]
        dv = []
        for d in ws.data_validations.dataValidation:
            if any(cell.coordinate in rng for rng in d.sqref.ranges) or any(
                    rng.min_row <= r0 <= rng.max_row and rng.min_col <= c0 <= rng.max_col for rng in d.sqref.ranges):
                dv.append({"type": d.type, "operator": d.operator, "f1": d.formula1, "f2": d.formula2})
        sys_id = e.get("systemId") or "COORDINATOR"
        field = next((f for f in systems.get(sys_id, []) if f["id"] == e.get("fieldId")), None)
        column = next((c for c in (field or {}).get("columns") or [] if c["id"] == e.get("columnId")), None)
        out.append({
            "doc": kind.upper(), "id": e["id"], "systemId": sys_id, "fieldId": e.get("fieldId"), "columnId": e.get("columnId"),
            "label": (column or {}).get("label") or e.get("label"), "fieldLabel": (field or {}).get("label"),
            "prompt": ((column or {}).get("prompt") or (field or {}).get("prompt") or "")[:220],
            "kind": (column or field or {}).get("kind"), "unit": (column or field or {}).get("unit"),
            "schemaType": e["inputSchema"].get("type"), "sheet": ws.title, "ranges": e["official"]["ranges"],
            "templateValue": text(cell.value) or (str(cell.value) if cell.value is not None else ""),
            "isFormula": isinstance(cell.value, str) and cell.value.startswith("="),
            "locked": bool(cell.protection.locked), "numberFormat": cell.number_format,
            "rowLabel": left, "columnHeader": above, "validation": dv,
        })
json.dump(out, open(f"{scratch}/template-context.json", "w"), ensure_ascii=False, indent=1)
print(len(out), "entries")
