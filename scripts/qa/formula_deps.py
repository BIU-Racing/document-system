"""For each mapped target cell, list template formulas that read it (independent of app code)."""
import json, re, sys
from openpyxl import load_workbook
from openpyxl.utils import range_boundaries, get_column_letter

scratch = sys.argv[1]
ctx = json.load(open(f"{scratch}/template-context.json"))
files = {"ESF": f"{scratch}/esf-template.xlsx", "ASES": f"{scratch}/ases-template.xlsm"}
REF = re.compile(r"(?:(?:'([^']+)'|([A-Za-z0-9_.&]+))!)?\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?")
result = {}
for doc, path in files.items():
    wb = load_workbook(path, keep_vba=(doc == "ASES"))
    deps = {}
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if isinstance(c.value, str) and c.value.startswith("="):
                    for m in REF.finditer(c.value):
                        sheet = m.group(1) or m.group(2) or ws.title
                        a = f"{m.group(3)}{m.group(4)}"
                        b = f"{m.group(5)}{m.group(6)}" if m.group(5) else a
                        try: c1, r1, c2, r2 = range_boundaries(f"{a}:{b}")
                        except Exception: continue
                        if (c2 - c1 + 1) * (r2 - r1 + 1) > 5000: continue
                        for r in range(r1, r2 + 1):
                            for col in range(c1, c2 + 1):
                                deps.setdefault((sheet, f"{get_column_letter(col)}{r}"), []).append(f"{ws.title}!{c.coordinate}: {c.value[:140]}")
    for e in [x for x in ctx if x["doc"] == doc]:
        hits = []
        for rng in e["ranges"][:3]:
            first = rng.split(":")[0]
            hits += deps.get((e["sheet"], first), [])
        if hits: result[e["id"]] = {"schemaType": e["schemaType"], "label": e["label"], "sheet": e["sheet"], "cell": e["ranges"][0], "formulas": hits[:4], "count": len(hits)}
json.dump(result, open(f"{scratch}/formula-deps.json", "w"), ensure_ascii=False, indent=1)
print(len(result), "mapped cells are read by formulas")
