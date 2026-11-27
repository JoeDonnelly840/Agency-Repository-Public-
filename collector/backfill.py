"""History backfill: python -m collector.backfill

Fills stored history back to config.HISTORY_START (January 1, 2015) from sources
that keep an archive: the Federal Register, Regulations.gov, and openFDA. It
works backwards one calendar month at a time, newest first, so recent history
arrives soonest. Each run stops after config.BACKFILL_MAX_REQUESTS requests and
records where it stopped in docs/data/backfill.json; the next run continues from
there. The same politeness rules as the daily run apply (one request at a time,
pauses between requests, honoring "slow down" replies).
"""
import datetime as dt
import json
import os
import sys

from . import config, deepread, fulltext, reclassify, store
from .classify import classify
from .flags import flag_item
from .http_client import PoliteClient
from .sources import federal_register, openfda, regulations_gov

STATE = os.path.join(store.ROOT, "backfill.json")
SOURCES = ("federal_register", "regulations_gov", "openfda")


def _month_bounds(month):
    start = f"{month}-01"
    return start, store._month_end(month)


def _prev_month(month):
    y, m = int(month[:4]), int(month[5:7])
    return f"{y - (m == 1)}-{(m - 2) % 12 + 1:02d}"


def load_state(today):
    state = store._read_json(STATE, None)
    if not state:
        # Start with the current month so items already stored are fetched again with their action dates
        # (signing and classification dates); re-fetched items replace the stored copies in place.
        first = today.isoformat()
        state = {"target_start": config.HISTORY_START, "next": {s: first[:7] for s in SOURCES},
                 "done": {s: False for s in SOURCES}, "log": []}
    return state


def run_once(client, state, regs_key, today, budget):
    """Process months until the request budget is spent. Returns items collected and reports."""
    items, reports, processed = [], [], []
    target = state["target_start"][:7]
    for source in SOURCES:
        while not state["done"][source] and client.total_requests < budget:
            month = state["next"][source]
            if month < target:
                state["done"][source] = True
                break
            start, end = _month_bounds(month)
            if source == "federal_register":
                got, rep = federal_register.fetch(client, start, end)
            elif source == "regulations_gov":
                if not regs_key:
                    state["log"].append(f"{month} regulations_gov skipped: no key")
                    break
                got, rep = regulations_gov.fetch(client, start, end, regs_key)
            else:
                got, rep = openfda.fetch(client, start, end)
            rep = {**rep, "detail": f"History {month}: {rep.get('detail', '')}".strip()}
            if rep["status"] == "failed":
                state["log"].append(f"{month} {source} failed: {rep['detail'][:200]}")
                reports.append(rep)
                break  # try again next run
            items += got
            reports.append(rep)
            processed.append(month)
            state["log"] = (state["log"] + [f"{month} {source} {rep['status']} {len(got)} items"])[-200:]
            state["next"][source] = _prev_month(month)
    return items, reports, processed


def main():
    today = dt.date.today()
    reclassify.ensure_current(today)
    state = load_state(today)
    client = PoliteClient()
    if all(state["done"].values()):
        print("History backfill is complete; reading full texts instead.")
        return deepread.main()
    regs_key = os.environ.get("REGULATIONS_GOV_API_KEY", "").strip()
    run_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    items, reports, processed = run_once(client, state, regs_key, today, config.BACKFILL_MAX_REQUESTS)
    for it in items:
        classify(it)
    fulltext.attach(items)
    for it in items:
        flag_item(it)
        fulltext.detach(it)
    new, months = store.merge_items(items, run_at, today=today)
    touched, dlog = deepread.run(client, config.BACKFILL_MAX_REQUESTS, today=today)   # leftover budget
    months |= {m for m in touched if store.is_archived_month(m, today)}
    if dlog:
        print("Full-text reading:", "; ".join(dlog))
    index = store.load_index()
    store.finish_storage(index, months, today)
    if not processed:
        store._write_json(STATE, state)
        print("Nothing processed this run.", state["log"][-3:])
        return 0
    run = {"run_at": run_at, "kind": "backfill", "start": f"{min(processed)}-01", "end": store._month_end(max(processed)), "reports": reports, "items_found": len(items),
           "items_new": new, "requests": client.total_requests}
    store.write_index(index, run)
    index = store.load_index()
    index["backfill"] = {"next": state["next"], "done": state["done"], "target_start": state["target_start"]}
    store._write_json(store._path("index.json"), index)
    store._write_json(STATE, state)
    print(f"Backfill run {run_at}: {len(items)} items, {new} new, {client.total_requests} requests; next: {state['next']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
