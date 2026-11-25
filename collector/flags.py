"""Constitutional "arguable issue" flags, rated by the rubric in doctrine.py.

This is an automated screen of official documents' titles, action lines, and
summaries. A flag means "a lawyer may want to look at this", never "this is
unconstitutional". Each flag records which elements of the governing test were
found, which precedent tier applies, any counter-indicators, and how the
seriousness points were counted, so every rating can explain itself.
"""
from . import doctrine
from .taxonomy import text_of

FLAGRANCE = {3: "Flagrant", 2: "Substantial", 1: "Arguable"}
IMPACT = {3: "Severe", 2: "Significant", 1: "Moderate"}
SCALES = {
    "flagrance": {
        "label": "Flagrance", "question": "How clearly does existing law condemn this kind of action?",
        "levels": [
            {"value": 3, "name": "Flagrant", "color": "red",
             "meaning": "The Supreme Court has held this specific practice unlawful, and every element of the test appears in the document."},
            {"value": 2, "name": "Substantial", "color": "orange",
             "meaning": "A Supreme Court or appellate holding applies closely, and at least half the elements appear."},
            {"value": 1, "name": "Arguable", "color": "yellow",
             "meaning": "An open or contested question, fewer elements found, or a counter-indicator. Not a lesser concern; a less settled one."},
        ]},
    "impact": {
        "label": "Seriousness", "question": "How much is at stake if the action is unlawful?",
        "levels": [
            {"value": 3, "name": "Severe", "color": "red", "meaning": "6 or more points for sanction, money, and reach."},
            {"value": 2, "name": "Significant", "color": "orange", "meaning": "3 to 5 points."},
            {"value": 1, "name": "Moderate", "color": "yellow", "meaning": "0 to 2 points. Still a constitutional concern."},
        ]},
}
GROUP_LABELS = {"structural": "Structural (separation of powers and federalism)", "rights": "Individual rights"}


def _triggers(issue, item, text):
    if issue["code"] == "excessive_fines":
        amount = doctrine.money_in(text)
        return [f"${amount:,.0f}"] if amount >= 1e6 and doctrine.PENALTY.search(text) else []
    if issue["code"] == "private_delegation":
        return ["issued by an agency-supervised private corporation"]
    found = sorted({m.group(0).lower() for m in issue["trigger"].finditer(text)})
    if not found and issue.get("also_triggers") and issue["also_triggers"](item):
        found = {"sec_admin": ["SEC in-house administrative proceeding"]}.get(item.get("source"), [])
        if not found:
            found = ["civil money penalty complaint"] if item.get("doc_subtype_hint") == "cmp_complaint" else ["designated a significant rule"]
    return found


def flag_item(item):
    text = text_of(item)
    level, points, breakdown = doctrine.seriousness(item, text)
    flags = []
    for issue in doctrine.ISSUES:
        if not issue["applies"](item):
            continue
        triggers = _triggers(issue, item, text)
        if not triggers:
            continue
        f = doctrine.assess(issue, item, text)
        f["impact"] = level
        f["triggers"] = triggers[:6]
        flags.append(f)
    flags.sort(key=lambda f: (-f["flagrance"], f["group"] != "structural", f["code"]))
    item["flags"] = flags
    item["seriousness"] = {"level": level, "points": points, "breakdown": breakdown}
    if flags:
        fl = max(f["flagrance"] for f in flags)
        item["severity"] = {"flagrance": fl, "impact": level, "score": fl * level}
    else:
        item["severity"] = None
    item["priority"] = max((max(f["flagrance"], level) for f in flags), default=0)
    item.pop("doc_subtype_hint", None)
    return item


def export():
    return {"scales": SCALES, "groups": GROUP_LABELS,
            "kinds": [{"code": i["code"], "label": i["label"], "group": i["group"]} for i in doctrine.ISSUES]}
