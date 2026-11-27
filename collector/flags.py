"""Constitutional flags, rated by the rubric in doctrine.py.

This is an automated screen of official documents: their titles, action lines, and
summaries, plus passages of the full text when RegCollect has read it (fulltext.py).
A flag means "a lawyer may want to look at this", never a legal conclusion. Each flag
records which elements of the governing test were found (and which only in the full
text), the precedent relied on, weighed factors, and any court ruling on the action,
so every rating can explain itself. Impact is recorded alongside but never affects
the rating.
"""
from . import doctrine, rulings
from .taxonomy import text_of

LEVELS = {3: "Almost certainly unlawful", 2: "Very likely unlawful", 1: "Likely unlawful"}
SCALES = {
    # Named "constitutionality" internally for compatibility; shown to users as Lawfulness.
    "constitutionality": {
        "label": "Lawfulness",
        "question": "How likely is it that this action is unlawful under the Constitution or the limits on executive power, under the law today?",
        "prefix": "Unlawful",
        "levels": [
            {"value": 3, "name": "Near certain", "full": "Almost certainly unlawful", "color": "red",
             "meaning": "A court has squarely held this practice (or this very action) unlawful, and every element of the test appears in the document's operative text."},
            {"value": 2, "name": "Very likely", "full": "Very likely unlawful", "color": "orange",
             "meaning": "A direct holding with at least half the elements, or a close analogy (or an appeals-court holding) with every element, in the document's operative text."},
            {"value": 1, "name": "Likely", "full": "Likely unlawful", "color": "yellow",
             "meaning": "An arguable case: the essential (gate) elements appear, with at least half the elements of the test. Worth a lawyer's look."},
        ],
        "unrated": {"name": "Possible issue", "meaning": "Wording tied to an issue appears, but the essential elements were not found, or the Supreme Court has upheld this very practice. Not rated and not counted as a flag."},
    },
    "impact": {
        "label": "Impact", "question": "How much is at stake? Noted for context; never part of the rating.",
        "levels": [
            {"value": 3, "name": "Serious Impact", "meaning": "7 or more points for sanction, money, and reach."},
            {"value": 2, "name": "Significant Impact", "meaning": "4 to 6 points."},
            {"value": 1, "name": "Lower Impact", "meaning": "1 to 3 points."},
        ]},
}
GROUP_LABELS = {"structural": "Structural (separation of powers and federalism)", "rights": "Individual rights"}


def doctrine_text(item):
    """Title, action line, and summary, plus evidence passages from the full text if it has been read."""
    return " ".join([text_of(item), " … ".join(item.get("_ev") or [])]).strip()


def core_text(item):
    """The document's operative text: title, action line, and summary; the whole of a presidential document;
    and, for other documents, the full-text passages from the authority line and regulatory text."""
    if item.get("category") == "presidential":
        return doctrine_text(item)
    return " ".join([text_of(item), " … ".join(item.get("_op") or [])]).strip()


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
    summary_text = text_of(item)
    text = doctrine_text(item)
    core = core_text(item)
    lvl, points, breakdown = doctrine.impact(item, summary_text)
    item.pop("severity", None)
    item.pop("seriousness", None)
    cited = sorted(doctrine.statutes_cited(item, text))
    if cited:
        item["statutes"] = cited
    else:
        item.pop("statutes", None)
    known = {r["issue"]: r for r in rulings.for_item(item)}
    flags = []
    quiet = item.get("subcategory") in doctrine.NO_FLAG_SUBCATEGORIES or (
        item.get("category") in ("rulemaking", "presidential") and bool(doctrine.DEREGULATORY.search(
            " ".join([item.get("title", ""), item.get("action", ""), (item.get("summary") or "")[:220]]))))
    for issue in doctrine.ISSUES:
        ruling = known.get(issue["code"])
        skip = issue.get("skip_titles")
        if not ruling and (quiet or not issue["applies"](item) or (skip and skip.search(item.get("title", "")))):
            continue
        if not ruling and issue.get("exclude") and issue["exclude"].search(summary_text):
            continue        # for example, a ratification cures an appointment defect rather than raising one
        triggers = _triggers(issue, item, text)
        if not triggers and not ruling:
            continue
        f = doctrine.assess(issue, item, text, core, summary_text)
        if ruling:
            doctrine.apply_ruling(f, ruling, item)
            triggers = triggers or [f"court ruling: {ruling['label']}"]
        f["triggers"] = triggers[:6]
        flags.append(f)
    flags.sort(key=lambda f: (-f["level"], f["group"] != "structural", f["code"]))
    item["flags"] = flags
    item["impact"] = {"level": lvl, "points": points, "breakdown": breakdown}
    rated = [f for f in flags if f["level"]]
    item["rating"] = {"level": max(f["level"] for f in rated), "issues": len(rated)} if rated else None
    item["priority"] = item["rating"]["level"] if item["rating"] else 0
    item.pop("doc_subtype_hint", None)
    return item


def export():
    return {"scales": SCALES, "groups": GROUP_LABELS, "rubric_version": doctrine.RUBRIC_VERSION,
            "kinds": [{"code": i["code"], "label": i["label"], "group": i["group"]} for i in doctrine.ISSUES]}
