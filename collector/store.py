"""RegCollect: reading and writing the data files the website shows.

docs/data/index.json             run log, source health, and what files exist
docs/data/taxonomy.json          sanction types, outcomes, the doctrine library, and the rating rubric
docs/data/days/<date>.json       items published in the last ~70 days, one file per publication day
docs/data/months/<YYYY-MM>.json  older items, one file per publication month
docs/data/facts/<YYYY-MM>.json   compact numbers-only rows for each archived month, used by the charts

Items are filed by the day they were published (which never changes), and each item
carries its own "date": the date of the agency's action (signed, posted, released, or
classified). Nothing is ever deleted: day files are combined into month files once a month
is more than ARCHIVE_AFTER_DAYS old, so the browser can load whole months at once.
"""
import datetime as dt
import json
import os

from . import config, doctrine, flags, taxonomy

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "data")
SUMMARY_LIMIT = 700


def _path(*parts, root=None):
    return os.path.join(root or ROOT, *parts)


def _read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def _write_json(path, data, compact=False):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if compact:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        else:
            json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def load_index(root=None):
    return _read_json(_path("index.json", root=root), {"schema": 3, "runs": [], "days": {}, "months": {}, "sources": {}})


def compute_window(index, today):
    """Publication dates (inclusive, ISO strings) the daily run should check."""
    ends = [r["end"] for r in index.get("runs", []) if r.get("kind", "daily") == "daily"
            and any(rep.get("status") in ("ok", "partial") for rep in r.get("reports", []))]
    if ends:
        start = dt.date.fromisoformat(max(ends)) - dt.timedelta(days=config.OVERLAP_DAYS)
        start = max(start, today - dt.timedelta(days=60))  # long outages show up as gaps, not giant runs
    else:
        start = today - dt.timedelta(days=config.FIRST_RUN_BACKFILL_DAYS)
    return start.isoformat(), today.isoformat()


def sort_key(item):
    r = item.get("rating") or {}
    return (-r.get("level", 0), item.get("title", ""))


def filed_day(item):
    return item.get("published") or item.get("date")


def archive_cutoff(today):
    """Months whose last day is before this date are archived into month files."""
    return (today - dt.timedelta(days=config.ARCHIVE_AFTER_DAYS)).isoformat()


def _month_end(month):
    y, m = int(month[:4]), int(month[5:7])
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def is_archived_month(month, today):
    return _month_end(month) < archive_cutoff(today)


def slim(item):
    """Keep stored items small: long summaries are trimmed, and flag explanations live in taxonomy.json."""
    if len(item.get("summary") or "") > SUMMARY_LIMIT:
        item["summary"] = item["summary"][:SUMMARY_LIMIT].rsplit(" ", 1)[0] + "…"
    for k in ("query_agencies", "forced_category", "forced_subcategory", "_ev"):
        item.pop(k, None)
    if not item.get("raw_text_url"):
        item.pop("raw_text_url", None)
    return item


def _merge_into(path, key_name, key_value, items, run_at):
    data = _read_json(path, {key_name: key_value, "items": []})
    existing = {i["id"]: i for i in data["items"]}
    new = 0
    for it in items:
        old = existing.get(it["id"])
        it["first_seen"] = old.get("first_seen", run_at) if old else run_at
        if old and old.get("ft") and not it.get("ft"):
            it["ft"] = old["ft"]          # keep the record of full-text reading when an item is fetched again
        new += 0 if old else 1
        existing[it["id"]] = slim(it)
    _write_json(path, {key_name: key_value, "items": sorted(existing.values(), key=sort_key)},
                compact=(key_name == "month"))
    return new


def merge_items(items, run_at, root=None, today=None):
    """Merge items into their day or month files. Returns (new items, months touched)."""
    today = today or dt.date.today()
    by_file, months = {}, set()
    for it in items:
        day = filed_day(it)
        if not day:
            continue
        month = day[:7]
        if is_archived_month(month, today):
            by_file.setdefault(("month", month), []).append(it)
            months.add(month)
        else:
            by_file.setdefault(("date", day), []).append(it)
    new = 0
    for (kind, key), group in by_file.items():
        path = _path("months" if kind == "month" else "days", f"{key}.json", root=root)
        new += _merge_into(path, kind, key, group, run_at)
    return new, months


def archive_old_days(today, root=None):
    """Combine day files from archived months into month files. Returns months touched."""
    days_dir = _path("days", root=root)
    touched = set()
    if not os.path.isdir(days_dir):
        return touched
    for name in sorted(os.listdir(days_dir)):
        if not name.endswith(".json"):
            continue
        month = name[:7]
        if not is_archived_month(month, today):
            continue
        path = os.path.join(days_dir, name)
        items = _read_json(path, {"items": []})["items"]
        mpath = _path("months", f"{month}.json", root=root)
        data = _read_json(mpath, {"month": month, "items": []})
        existing = {i["id"]: i for i in data["items"]}
        for it in items:
            existing.setdefault(it["id"], slim(it))
        _write_json(mpath, {"month": month, "items": sorted(existing.values(), key=sort_key)}, compact=True)
        os.remove(path)
        touched.add(month)
    return touched


def fact_row(it, subs):
    """One compact row per item for the charts and the assistant: date, bodies, kind, type, outcome, sanctions,
    rated issues, lawfulness level, impact level, routine, possible issues."""
    sub = it.get("subcategory") or ""
    if sub not in subs:
        subs[sub] = len(subs)
    r = it.get("rating") or {}
    bodies = [it["corporation"]] if it.get("corporation") else it.get("agencies", [])
    return [it.get("date") or "", bodies, it.get("category", ""), subs[sub], it.get("outcome", ""),
            it.get("sanctions", []), sorted({f["code"] for f in it.get("flags", []) if f.get("level")}),
            r.get("level", 0), (it.get("impact") or {}).get("level", 0), 1 if it.get("routine") else 0,
            sorted({f["code"] for f in it.get("flags", []) if not f.get("level")})]


def write_facts(months, root=None):
    for month in sorted(months):
        items = _read_json(_path("months", f"{month}.json", root=root), {"items": []})["items"]
        subs = {}
        rows = [fact_row(i, subs) for i in items]
        _write_json(_path("facts", f"{month}.json", root=root),
                    {"month": month, "subcategories": list(subs), "rows": rows}, compact=True)


def _counts(folder, root=None):
    d = _path(folder, root=root)
    out = {}
    if os.path.isdir(d):
        for name in sorted(os.listdir(d)):
            if name.endswith(".json"):
                out[name[:-5]] = len(_read_json(os.path.join(d, name), {"items": []})["items"])
    return out


def finish_storage(index, months_touched, today, root=None):
    """Archive old days, refresh chart facts, and update the file lists in the index."""
    months_touched = set(months_touched) | archive_old_days(today, root)
    write_facts(months_touched, root)
    index["days"] = _counts("days", root)
    month_counts = index.setdefault("months", {})
    for m in months_touched:
        month_counts[m] = len(_read_json(_path("months", f"{m}.json", root=root), {"items": []})["items"])
    index["months"] = dict(sorted(month_counts.items()))
    return index


def source_agencies():
    """Which tracked agencies each source can see (used for "what we checked" lists)."""
    out = {
        "federal_register": [a["key"] for a in config.AGENCIES] + [config.PRESIDENT["key"]],
        "regulations_gov": [a["key"] for a in config.AGENCIES],
        "openfda": ["fda"],
        "federal_register_fulltext": [a["key"] for a in config.AGENCIES] + [config.PRESIDENT["key"]],
    }
    out.update({f["key"]: ["sec"] for f in config.SEC_FEEDS})
    out.update({f["key"]: [f["agency"]] for f in config.AGENCY_FEEDS if f.get("enabled") is not False})
    return out


def write_index(index, run, root=None):
    index["schema"] = 3
    index["rubric_version"] = doctrine.RUBRIC_VERSION
    index["updated_at"] = run["run_at"]
    index["runs"] = (index.get("runs", []) + [run])[-config.MAX_RUN_HISTORY:]
    sources = index.setdefault("sources", {})
    for rep in (run["reports"] if run.get("kind", "daily") == "daily" else []):
        s = sources.setdefault(rep["source"], {})
        s.update(label=rep["label"], last_status=rep["status"], last_detail=rep["detail"], last_attempt=run["run_at"])
        if rep["status"] in ("ok", "partial") and run.get("kind", "daily") == "daily":
            s["covered_through"] = run["end"]
    # sources that no longer exist (for example the FTC and FCC feeds) are dropped from the list
    live = set(source_agencies())
    index["sources"] = {k: v for k, v in sources.items() if k in live}
    index["app"] = {"name": config.APP_NAME, "version": config.APP_VERSION}
    index["history_start"] = config.HISTORY_START
    index["archive_after_days"] = config.ARCHIVE_AFTER_DAYS
    index["jurisdictions"] = config.JURISDICTIONS
    index["agencies"] = [{k: a[k] for k in ("key", "name", "short", "kind", "description")} for a in config.AGENCIES]
    index["president"] = {k: config.PRESIDENT[k] for k in ("key", "name", "short", "kind", "description")}
    index["corporations"] = [{k: c[k] for k in ("key", "name", "short", "overseer", "description")}
                             for c in config.CORPORATIONS]
    index["categories"] = config.CATEGORIES
    index["coverage_notes"] = config.COVERAGE_NOTES
    index["not_tracked"] = config.NOT_TRACKED
    index["source_agencies"] = source_agencies()
    dr = _read_json(_path("deepread.json", root=root), None)
    if dr:
        index["deepread"] = {"sweep": dr.get("sweep"), "read": dr.get("read")}
    index["source_labels"] = {"federal_register": "Federal Register", "regulations_gov": "Regulations.gov",
                              "openfda": "openFDA recall enforcement reports",
                              "federal_register_fulltext": "Federal Register full text (legal-term searches and full reads)",
                              **{f["key"]: f["label"] for f in config.SEC_FEEDS + config.AGENCY_FEEDS}}
    from . import fulltext   # imported here: fulltext itself uses store
    _write_json(_path("taxonomy.json", root=root), {**taxonomy.export(), **flags.export(), **doctrine.export(),
                                                     "sweep_labels": fulltext.SWEEP_LABELS})
    _write_json(_path("index.json", root=root), index)
    return index
