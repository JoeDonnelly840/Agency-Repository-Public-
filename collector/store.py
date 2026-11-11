"""Reading and writing the data files the website shows.

docs/data/index.json        - run log, source health, list of days that have items
docs/data/days/<date>.json  - the items published on that date

Nothing is ever deleted: each run merges new items into the day files, so the
full dated history stays in the repository.
"""
import datetime as dt
import json
import os

from . import config

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "data")


def _path(*parts, root=None):
    return os.path.join(root or ROOT, *parts)


def _read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def _write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def load_index(root=None):
    return _read_json(_path("index.json", root=root), {"schema": 1, "runs": [], "days": {}, "sources": {}})


def compute_window(index, today):
    """Dates (inclusive, ISO strings) this run should check."""
    ends = [r["end"] for r in index.get("runs", [])
            if any(rep.get("status") in ("ok", "partial") for rep in r.get("reports", []))]
    if ends:
        start = dt.date.fromisoformat(max(ends)) - dt.timedelta(days=config.OVERLAP_DAYS)
        start = max(start, today - dt.timedelta(days=60))  # long outages show up as gaps, not giant runs
    else:
        start = today - dt.timedelta(days=config.FIRST_RUN_BACKFILL_DAYS)
    return start.isoformat(), today.isoformat()


def merge_items(items, run_at, root=None):
    """Merge items into their day files. Returns number of items not seen before."""
    by_day = {}
    for it in items:
        if it.get("date"):
            by_day.setdefault(it["date"], []).append(it)
    new_count = 0
    for day, day_items in by_day.items():
        path = _path("days", f"{day}.json", root=root)
        existing = {i["id"]: i for i in _read_json(path, {"items": []})["items"]}
        for it in day_items:
            old = existing.get(it["id"])
            it["first_seen"] = old.get("first_seen", run_at) if old else run_at
            if not old:
                new_count += 1
            existing[it["id"]] = it
        ordered = sorted(existing.values(), key=lambda i: (-i.get("priority", 0), i.get("title", "")))
        _write_json(path, {"date": day, "items": ordered})
    return new_count


def _day_counts(root=None):
    days_dir = _path("days", root=root)
    counts = {}
    if os.path.isdir(days_dir):
        for name in sorted(os.listdir(days_dir)):
            if name.endswith(".json"):
                counts[name[:-5]] = len(_read_json(os.path.join(days_dir, name), {"items": []})["items"])
    return counts


def write_index(index, run, root=None):
    index["schema"] = 1
    index["updated_at"] = run["run_at"]
    index["runs"] = (index.get("runs", []) + [run])[-config.MAX_RUN_HISTORY:]
    sources = index.setdefault("sources", {})
    for rep in run["reports"]:
        s = sources.setdefault(rep["source"], {})
        s.update(label=rep["label"], last_status=rep["status"], last_detail=rep["detail"],
                 last_attempt=run["run_at"])
        if rep["status"] in ("ok", "partial"):
            s["covered_through"] = run["end"]
    index["days"] = _day_counts(root)
    index["agencies"] = [{k: a[k] for k in ("key", "name", "short")} for a in config.AGENCIES]
    index["president"] = config.PRESIDENT
    index["corporations"] = [{k: c[k] for k in ("key", "name", "overseer")} for c in config.CORPORATIONS]
    index["categories"] = config.CATEGORIES
    index["coverage_notes"] = config.COVERAGE_NOTES
    index["source_agencies"] = {
        "federal_register": [a["key"] for a in config.AGENCIES] + [config.PRESIDENT["key"]],
        "regulations_gov": [a["key"] for a in config.AGENCIES],
        **{f["key"]: ["sec"] for f in config.SEC_FEEDS},
    }
    _write_json(_path("index.json", root=root), index)
    return index
