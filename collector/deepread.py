"""Reading the full text of stored history: python -m collector.deepread

Runs inside the history-backfill job, using whatever request budget the history backfill
leaves over (and the whole budget once history is complete). Progress is kept in
docs/data/deepread.json, so each run continues where the last one stopped:

  Phase 1, term sweeps: for each year from this year back to 2015, ask the Federal Register's
           full-text search about each legal term in fulltext.SWEEP_TERMS.
  Phase 2, full reads:  for each month, newest first, read the most important documents in full
           (presidential documents, flagged actions, significant rules), a few hundred per run.

After each step the affected items are re-rated with the evidence found, and their files,
evidence files, and chart facts are rewritten. The same politeness rules apply as everywhere
else: one request at a time, pauses between requests, robots.txt, and a hard ceiling.
"""
import datetime as dt
import glob
import os
import sys

from . import config, fulltext, store
from .flags import flag_item
from .http_client import PoliteClient


def _files_for_months(months, root=None):
    out = []
    for m in sorted(months, reverse=True):
        mp = store._path("months", f"{m}.json", root=root)
        if os.path.exists(mp):
            out.append((mp, "month", m))
        for dp in sorted(glob.glob(store._path("days", f"{m}-*.json", root=root)), reverse=True):
            out.append((dp, "date", os.path.basename(dp)[:-5]))
    return out


def _rewrite(path, key_name, key_value, items, root=None):
    for it in items:
        fulltext.detach(it)
    store._write_json(path, {key_name: key_value, "items": sorted(items, key=store.sort_key)}, compact=(key_name == "month"))


def apply_sweep(found, months, root=None):
    """Attach sweep results to stored items in these months. Returns months touched."""
    touched = set()
    if not found:
        return touched
    for path, kind, key in _files_for_months(months, root):
        data = store._read_json(path, {"items": []})
        items = data["items"]
        records, changed = {}, False
        fulltext.attach(items, root)
        for it in items:
            num = it["id"].split(":", 1)[-1] if it.get("source") == "federal_register" else None
            rec = found.get(num) if num else None
            if rec:
                fulltext.record_on_item(it, rec)
                flag_item(it)
                records[it["id"]] = rec
                changed = True
        if changed:
            fulltext.save_records(items, records, root)
            _rewrite(path, kind, key, items, root)
            touched.add(key[:7])
        else:
            for it in items:
                fulltext.detach(it)
    return touched


def read_month(client, month, budget, root=None):
    """Read wanted documents in one month until the budget runs out. Returns (reads, months touched, month finished?)."""
    reads, touched = 0, set()
    for path, kind, key in _files_for_months([month], root):
        data = store._read_json(path, {"items": []})
        items = data["items"]
        queue = sorted((it for it in items if fulltext.wants_reading(it)), key=lambda i: -fulltext.wants_reading(i))
        if not queue:
            continue
        fulltext.attach(items, root)
        records = {}
        for it in queue:
            if client.total_requests >= budget:
                break
            rec = fulltext.read_one(client, it)
            reads += 1
            fulltext.record_on_item(it, rec)
            flag_item(it)
            if rec.get("ev") or rec.get("opev") or rec.get("cites"):
                records[it["id"]] = rec
        fulltext.save_records(items, records, root)
        _rewrite(path, kind, key, items, root)
        touched.add(month)
        if client.total_requests >= budget:
            return reads, touched, False
    return reads, touched, True


def _read(client, rd, budget, root, log):
    """Read documents month by month, newest first, until the budget is spent."""
    touched = set()
    while not rd["done"] and client.total_requests < budget:
        month = rd["next_month"]
        if month < config.HISTORY_START[:7]:
            rd["done"] = True
            break
        reads, t, finished = read_month(client, month, budget, root)
        touched |= t
        log.append(f"read {month}: {reads} documents")
        if finished:
            y, m = int(month[:4]), int(month[5:7])
            rd["next_month"] = f"{y - (m == 1)}-{(m - 2) % 12 + 1:02d}"
    return touched


def run(client, budget, root=None, today=None):
    """Use the client's remaining budget (up to `budget` total requests) on sweeps, then full reads."""
    today = today or dt.date.today()
    state = fulltext.load_state(root)
    first_year = int(config.HISTORY_START[:4])
    touched, log = set(), []
    sw, rd = state["sweep"], state["read"]
    # Reading whole documents (which finds their operative text) comes first; until the term sweeps
    # are finished they get the last third of the budget.
    read_budget = budget if sw["done"] else budget - budget // 3
    touched |= _read(client, rd, read_budget, root, log)
    while not sw["done"] and client.total_requests < budget:
        year = sw["next_year"]
        if year < first_year:
            sw["done"] = True
            break
        start, end = f"{year}-01-01", min(f"{year}-12-31", today.isoformat())
        found, used, nxt = fulltext.sweep(client, start, end, budget - client.total_requests, sw.get("term", 0))
        months = {f"{year}-{m:02d}" for m in range(1, 13)}
        touched |= apply_sweep(found, months, root)
        log.append(f"sweep {year} terms {sw.get('term', 0)}-{(nxt or len(fulltext.SWEEP_TERMS)) - 1}: {len(found)} documents")
        if nxt is None:
            sw["next_year"], sw["term"] = year - 1, 0
        else:
            sw["term"] = nxt
            break
    touched |= _read(client, rd, budget, root, log)
    state["log"] = (state.get("log", []) + log)[-200:]
    fulltext.save_state(state, root)
    return touched, log


def main():
    today = dt.date.today()
    client = PoliteClient(max_requests=config.DEEPREAD_MAX_REQUESTS)
    touched, log = run(client, config.DEEPREAD_MAX_REQUESTS, today=today)
    index = store.load_index()
    store.finish_storage(index, {m for m in touched if store.is_archived_month(m, today)}, today)
    state = fulltext.load_state()
    index["deepread"] = {"sweep": state.get("sweep"), "read": state.get("read")}
    store._write_json(store._path("index.json"), index)
    print("Full-text reading:", "; ".join(log) or "nothing to do", f"({client.total_requests} requests)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
