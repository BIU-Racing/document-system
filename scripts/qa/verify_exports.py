"""Independent re-read of exported workbooks with openpyxl + raw zip comparison with the template."""
import json, sys, zipfile, hashlib
from openpyxl import load_workbook

scratch = sys.argv[1]
sc = json.load(open(f"{scratch}/e2e/scenarios.json"))
templates = {"esf": f"{scratch}/esf-template.xlsx", "ases": f"{scratch}/ases-template.xlsm", "ses": f"{scratch}/ses-template.xlsx"}
report = {}
for name, s in sc.items():
    kind = s["kind"]
    wb = load_workbook(s["file"], keep_vba=(kind == "ases"))
    tpl = load_workbook(templates[kind], keep_vba=(kind == "ases")) if kind != "ses" else None
    checks = []
    for w in s["writtenCells"]:
        cell = wb[w["sheet"]][w["cell"]]
        actual = cell.value
        expected = float(w["value"]) if w["type"] == "number" else w["value"]
        ok = (actual == expected) or (w["type"] == "number" and isinstance(actual, (int, float)) and abs(actual - expected) < 1e-12)
        checks.append({"sheet": w["sheet"], "cell": w["cell"], "fieldId": w["fieldId"], "columnId": w.get("columnId"), "exportType": w["type"],
                       "pythonType": type(actual).__name__, "expected": w["value"], "actual": actual, "match": ok})
    # Structure preservation vs template (raw zip): parts other than changed sheets + workbook.xml must be identical.
    zt, ze = zipfile.ZipFile(templates[kind]), zipfile.ZipFile(s["file"])
    tparts = {n: hashlib.sha256(zt.read(n)).hexdigest() for n in zt.namelist()}
    eparts = {n: hashlib.sha256(ze.read(n)).hexdigest() for n in ze.namelist()}
    changed = sorted(n for n in tparts if eparts.get(n) != tparts[n])
    missing = sorted(set(tparts) - set(eparts)); added = sorted(set(eparts) - set(tparts))
    struct = {"partsChanged": changed, "partsMissing": missing, "partsAdded": added,
              "vbaProjectPreserved": ("xl/vbaProject.bin" in eparts and eparts.get("xl/vbaProject.bin") == tparts.get("xl/vbaProject.bin")) if kind == "ases" else None}
    if tpl is not None:
        diffs = []
        for ws in tpl.worksheets:
            e = wb[ws.title]
            if set(map(str, ws.merged_cells.ranges)) != set(map(str, e.merged_cells.ranges)): diffs.append(f"merged:{ws.title}")
            if len(ws.data_validations.dataValidation) != len(e.data_validations.dataValidation): diffs.append(f"validation:{ws.title}")
            if bool(ws.protection.sheet) != bool(e.protection.sheet): diffs.append(f"protection:{ws.title}")
            for row in ws.iter_rows():
                for c in row:
                    if isinstance(c.value, str) and c.value.startswith("=") and e[c.coordinate].value != c.value: diffs.append(f"formula:{ws.title}!{c.coordinate}")
        struct["sheetLevelDiffs"] = diffs[:20]; struct["definedNames"] = (len(tpl.defined_names), len(wb.defined_names))
    report[name] = {"cellsChecked": len(checks), "mismatches": [c for c in checks if not c["match"]], "checks": checks, "structure": struct}
    print(name, "cells", len(checks), "mismatch", len([c for c in checks if not c["match"]]), "| changed parts", changed, "| missing", missing, "| added", added, "| vba", struct["vbaProjectPreserved"], "| diffs", struct.get("sheetLevelDiffs"), struct.get("definedNames"))
json.dump(report, open(f"{scratch}/e2e/independent-readback.json", "w"), ensure_ascii=False, indent=1, default=str)
