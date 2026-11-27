"""Reading whole documents, not just their titles and summaries.

Two polite methods, both using the Federal Register's own public interfaces:

1. Term sweeps. The Federal Register API searches the full text of every document on its
   own servers (conditions[term]) and returns short excerpts around each match. RegCollect
   asks it about a fixed list of legal terms (for example "International Emergency
   Economic Powers Act", "Chevron", "Religious Freedom Restoration Act") for the tracked
   agencies and the President. One request covers hundreds of documents.

2. Full reads. For the documents most likely to matter (presidential documents, flagged
   actions, and significant rules), RegCollect downloads the plain-text version the Federal
   Register publishes for each document (raw_text_url), one at a time, with the same pauses
   and request ceilings as everything else, after checking robots.txt.

Nothing is republished in full. From each document RegCollect keeps only short passages
(about 240 characters each, at most MAX_PASSAGES) around the phrases its legal tests look
for, plus the list of statutes the document cites. These are stored in
docs/data/evidence/<YYYY-MM>.json, separately from the items, and the app loads them only
when you open "Why flagged". Federal Register documents are works of the U.S. government.
"""
import datetime as dt
import html
import re
import urllib.parse

from . import config, doctrine, store
from .http_client import RequestRefused, SourceUnavailable

FT_VERSION = 1
HALF = 120
MAX_PASSAGES = 10
SOURCE = "federal_register_fulltext"
API = "https://www.federalregister.gov/api/v1/documents.json"

# Terms swept through the Federal Register's full-text search. Each key is stored on
# matching items and searchable in the app.
SWEEP_TERMS = [
    ("ieepa", '"International Emergency Economic Powers Act"'),
    ("national_emergencies_act", '"National Emergencies Act"'),
    ("chevron", '"Chevron"'),
    ("loper_bright", '"Loper Bright"'),
    ("major_questions", '"major questions"'),
    ("nondelegation", '"nondelegation"'),
    ("seventh_amendment", '"Seventh Amendment"'),
    ("jarkesy", '"Jarkesy"'),
    ("appointments_clause", '"Appointments Clause"'),
    ("removal_protection", '"removal protections"'),
    ("rfra", '"Religious Freedom Restoration Act"'),
    ("rluipa", '"Religious Land Use and Institutionalized Persons Act"'),
    ("free_exercise", '"free exercise"'),
    ("establishment_clause", '"Establishment Clause"'),
    ("first_amendment", '"First Amendment"'),
    ("compelled_speech", '"compelled speech"'),
    ("fourth_amendment", '"Fourth Amendment"'),
    ("warrantless", '"warrantless"'),
    ("takings_clause", '"Takings Clause"'),
    ("excessive_fines", '"Excessive Fines"'),
    ("due_process", '"due process"'),
    ("equal_protection", '"equal protection"'),
    ("race_conscious", '"race-conscious"'),
    ("tenth_amendment", '"Tenth Amendment"'),
    ("commandeering", '"commandeering"'),
    ("impoundment", '"Impoundment Control Act"'),
    ("appropriations_clause", '"Appropriations Clause"'),
    ("good_cause", '"impracticable, unnecessary, or contrary to the public interest"'),
    ("notwithstanding", '"notwithstanding any other provision of law"'),
    ("nonenforcement", '"non-enforcement"'),
]
SWEEP_LABELS = {
    "ieepa": "mentions IEEPA", "national_emergencies_act": "mentions the National Emergencies Act", "chevron": "mentions Chevron",
    "loper_bright": "mentions Loper Bright", "major_questions": "discusses major questions", "nondelegation": "discusses nondelegation",
    "seventh_amendment": "mentions the Seventh Amendment", "jarkesy": "mentions Jarkesy", "appointments_clause": "mentions the Appointments Clause",
    "removal_protection": "discusses removal protections", "rfra": "mentions RFRA", "rluipa": "mentions RLUIPA", "free_exercise": "discusses free exercise",
    "establishment_clause": "mentions the Establishment Clause", "first_amendment": "mentions the First Amendment", "compelled_speech": "discusses compelled speech",
    "fourth_amendment": "mentions the Fourth Amendment", "warrantless": "mentions warrantless searches", "takings_clause": "mentions the Takings Clause",
    "excessive_fines": "mentions excessive fines", "due_process": "discusses due process", "equal_protection": "discusses equal protection",
    "race_conscious": "mentions race-conscious measures", "tenth_amendment": "mentions the Tenth Amendment", "commandeering": "discusses commandeering",
    "impoundment": "mentions the Impoundment Control Act", "appropriations_clause": "mentions the Appropriations Clause",
    "good_cause": "invokes the APA good-cause exception", "notwithstanding": "overrides other law ('notwithstanding any other provision')",
    "nonenforcement": "discusses non-enforcement",
}

_TAG = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")
_BASIS = re.compile(r"by the authority vested in me[^.]{0,600}\.|\bAuthority:\s[^\n]{0,400}", re.I)


def clean(text):
    return _WS.sub(" ", html.unescape(_TAG.sub(" ", text or ""))).strip()


# ------------------------------------------------------------------ evidence storage
def evidence_path(month, root=None):
    return store._path("evidence", f"{month}.json", root=root)


def load_evidence(month, root=None):
    return store._read_json(evidence_path(month, root), {"month": month, "items": {}})


def save_evidence(month, data, root=None):
    store._write_json(evidence_path(month, root), data, compact=True)


def attach(items, root=None):
    """Attach stored evidence to items (transiently, as item['_ev']) so flagging can use it."""
    cache = {}
    for it in items:
        day = store.filed_day(it)
        if not day:
            continue
        m = day[:7]
        if m not in cache:
            cache[m] = load_evidence(m, root)["items"]
        ev = cache[m].get(it["id"])
        if ev:
            it["_ev"] = ev.get("ev", [])
            if not it.get("ft") and ev.get("v"):
                it["ft"] = {k: ev[k] for k in ("v", "read", "terms") if ev.get(k)}
    return items


def detach(item):
    item.pop("_ev", None)
    return item


def merge_evidence(items_ev, root=None):
    """items_ev: {item_id: (month, record)}. Merges records into the evidence files."""
    by_month = {}
    for iid, (month, rec) in items_ev.items():
        by_month.setdefault(month, {})[iid] = rec
    for month, recs in by_month.items():
        data = load_evidence(month, root)
        for iid, rec in recs.items():
            old = data["items"].get(iid, {})
            merged = {**old, **{k: v for k, v in rec.items() if k not in ("ev", "terms")}}
            merged["ev"] = _dedupe((rec.get("ev") or []) + (old.get("ev") or []))[:MAX_PASSAGES + 4]
            merged["terms"] = sorted(set(old.get("terms", [])) | set(rec.get("terms", [])))
            if not merged["terms"]:
                merged.pop("terms")
            data["items"][iid] = merged
        save_evidence(month, data, root)


def _dedupe(passages):
    out, seen = [], set()
    for p in passages:
        k = p[:80].lower()
        if p and k not in seen:
            seen.add(k)
            out.append(p)
    return out


# ------------------------------------------------------------------ extraction
def extract(raw):
    """Short evidence passages around the phrases the legal tests look for, and the statutes cited."""
    text = clean(raw)
    spans = []
    basis = _BASIS.search(text)
    if basis:
        spans.append((basis.start(), min(len(text), basis.start() + 2 * HALF + 60), 99))
    for rx in doctrine.EVIDENCE_RX:
        for n, m in enumerate(rx.finditer(text)):
            if n >= 2:
                break
            spans.append((max(0, m.start() - HALF), min(len(text), m.end() + HALF), 1))
    spans.sort()
    merged = []
    for s, e, w in spans:
        if merged and s <= merged[-1][1]:
            ps, pe, pw = merged[-1]
            merged[-1] = (ps, min(max(pe, e), ps + 4 * HALF + 40), pw + w)
            continue
        merged.append((s, e, w))
    best = sorted(merged, key=lambda x: -x[2])[:MAX_PASSAGES]
    best.sort()
    passages = []
    for s, e, _ in best:
        frag = text[s:e]
        if s > 0:
            frag = frag.split(" ", 1)[-1]
        if e < len(text):
            frag = frag.rsplit(" ", 1)[0]
        passages.append(("…" if s > 0 else "") + frag + ("…" if e < len(text) else ""))
    cites = sorted(k for k, _, rx in doctrine.STATUTE_RX if rx.search(text))
    return {"ev": passages, "cites": cites, "chars": len(text)}


# ------------------------------------------------------------------ requests
def raw_text_url(item):
    if item.get("raw_text_url"):
        return item["raw_text_url"]
    num = (item.get("id") or "").split(":", 1)[-1]
    pub = item.get("published") or item.get("date") or ""
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", pub) or not re.match(r"^\d{4}-\d+$", num):
        return None
    y, m, d = pub.split("-")
    return f"https://www.federalregister.gov/documents/full_text/text/{y}/{m}/{d}/{num}.txt"


def read_one(client, item):
    """Download one document's plain text and extract evidence. Returns a record, or None if unavailable."""
    url = raw_text_url(item)
    if not url:
        return {"v": FT_VERSION, "read": "", "error": "no plain-text version"}
    try:
        body = client.get(url, SOURCE, check_robots=True, not_found_ok=True)
    except (SourceUnavailable, RequestRefused) as exc:
        return {"v": FT_VERSION, "read": "", "error": str(exc)[:120], "retry": True}
    if not body:
        return {"v": FT_VERSION, "read": "", "error": "no plain-text version"}
    rec = extract(body.decode("utf-8", "replace"))
    rec.update(v=FT_VERSION, read=dt.date.today().isoformat())
    return rec


def sweep(client, start, end, budget, first_term=0):
    """Run the term sweeps for a publication-date window, starting at SWEEP_TERMS[first_term].
    Returns ({document_number: record}, requests used, index of the next term to run or None when complete)."""
    slugs = [s for ag in config.AGENCIES for s in ag["fr"]]
    found, used = {}, 0
    for ti in range(first_term, len(SWEEP_TERMS)):
        key, phrase = SWEEP_TERMS[ti]
        if used + 2 > budget:
            return found, used, ti
        for target in ("agencies", "president"):
            params = [("conditions[term]", phrase), ("per_page", 1000), ("order", "oldest"),
                      ("conditions[publication_date][gte]", start), ("conditions[publication_date][lte]", end),
                      ("fields[]", "document_number"), ("fields[]", "excerpts")]
            if target == "agencies":
                params += [("conditions[agencies][]", s) for s in slugs]
            else:
                params.append(("conditions[type][]", "PRESDOCU"))
            url = f"{API}?{urllib.parse.urlencode(params)}"
            pages = 0
            while url and pages < 10:
                if used >= budget:
                    return found, used, ti
                try:
                    data = client.get_json(url, SOURCE)
                except (SourceUnavailable, RequestRefused):
                    return found, used, ti
                used += 1
                pages += 1
                for r in data.get("results") or []:
                    num = r.get("document_number")
                    if not num:
                        continue
                    rec = found.setdefault(num, {"terms": [], "ev": []})
                    if key not in rec["terms"]:
                        rec["terms"].append(key)
                    ex = clean(r.get("excerpts") or "")
                    if ex:
                        rec["ev"].append(ex[:2 * HALF + 80])
                url = data.get("next_page_url")
    return found, used, None


# ------------------------------------------------------------------ choosing what to read
def wants_reading(item):
    """Documents worth reading in full: presidential documents, flagged actions, and significant rules."""
    if item.get("source") != "federal_register" or item.get("corporation") or item.get("routine"):
        return 0
    ft = item.get("ft") or {}
    if ft.get("v", 0) >= FT_VERSION or ft.get("tries", 0) >= 2:
        return 0
    if item.get("subcategory") in doctrine.NO_FLAG_SUBCATEGORIES:
        return 0
    if item.get("category") == "presidential":
        return 4
    flags = item.get("flags") or []
    if any(f.get("level") for f in flags):
        return 3
    if flags:
        return 2
    if item.get("subcategory") == "Final rule" and item.get("significant"):
        return 1
    return 0


def record_on_item(item, rec):
    """Keep a small summary of what was read on the item itself (the passages live in the evidence files)."""
    ft = dict(item.get("ft") or {})
    if rec.get("retry"):
        ft["tries"] = ft.get("tries", 0) + 1
    elif "v" in rec:
        ft["v"] = rec["v"]
        ft["read"] = rec.get("read", "")
        ft.pop("tries", None)
    if rec.get("terms"):
        ft["terms"] = sorted(set(ft.get("terms", [])) | set(rec["terms"]))
    if rec.get("error"):
        ft["note"] = rec["error"]
    else:
        ft.pop("note", None)
    item["ft"] = ft
    if rec.get("ev"):
        item["_ev"] = _dedupe((rec.get("ev") or []) + item.get("_ev", []))
    return item


def enrich_new(client, items, start, end, max_reads=None):
    """Daily run: sweep the window's terms, then read the most important new documents in full.
    items must already be classified and flagged once (so we know which ones matter).
    Returns (records by item id, report)."""
    max_reads = config.FULLTEXT_READS_PER_RUN if max_reads is None else max_reads
    by_num = {it["id"].split(":", 1)[1]: it for it in items if it.get("source") == "federal_register"}
    report = {"source": SOURCE, "label": "Federal Register full text", "status": "ok", "detail": "", "agencies": {}}
    out = {}
    found, used, stopped = sweep(client, start, end, config.FULLTEXT_SWEEP_BUDGET)
    complete = stopped is None
    for num, rec in found.items():
        it = by_num.get(num)
        if it:
            record_on_item(it, rec)
            out[it["id"]] = rec
    queue = sorted((it for it in by_num.values() if wants_reading(it)), key=lambda i: -wants_reading(i))[:max_reads]
    reads = 0
    for it in queue:
        rec = read_one(client, it)
        if rec is None:
            continue
        reads += 1
        record_on_item(it, rec)
        if rec.get("ev") or rec.get("cites"):
            prev = out.get(it["id"], {})
            out[it["id"]] = {**rec, "ev": rec.get("ev", []) + prev.get("ev", []), "terms": prev.get("terms", [])}
    report["detail"] = (f"{len(found)} documents matched legal-term searches ({used} requests"
                        f"{', stopped early' if not complete else ''}); {reads} documents read in full")
    if not complete:
        report["status"] = "partial"
    return out, report


def save_records(items, records, root=None):
    store_ev = {}
    by_id = {it["id"]: it for it in items}
    for iid, rec in records.items():
        it = by_id.get(iid)
        if not it:
            continue
        month = (store.filed_day(it) or "")[:7]
        if month:
            store_ev[iid] = (month, {k: v for k, v in rec.items() if k in ("v", "read", "chars", "ev", "cites", "terms")})
    if store_ev:
        merge_evidence(store_ev, root)


def load_state(root=None):
    return store._read_json(store._path("deepread.json", root=root), None) or {
        "sweep": {"next_year": dt.date.today().year, "term": 0, "done": False},
        "read": {"next_month": dt.date.today().isoformat()[:7], "done": False}, "log": []}


def save_state(state, root=None):
    store._write_json(store._path("deepread.json", root=root), state)

