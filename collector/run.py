"""Daily run: python -m collector.run

Environment variables (set as GitHub secrets, never written into the code):
  REGULATIONS_GOV_API_KEY  free api.data.gov key (read-only use)
  SEC_CONTACT_EMAIL        contact address the SEC asks automated tools to declare
Optional: START_DATE / END_DATE (YYYY-MM-DD) to re-check a specific window.
"""
import datetime as dt
import os
import sys

from . import config, store
from .classify import classify
from .flags import flag_item
from .http_client import PoliteClient
from .sources import federal_register, regulations_gov, sec_feeds


def main():
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    run_at = now.isoformat()
    index = store.load_index()
    start, end = store.compute_window(index, now.date())
    start = os.environ.get("START_DATE") or start
    end = os.environ.get("END_DATE") or end
    print(f"Agency Tracker run {run_at}: checking {start} to {end}")

    regs_key = os.environ.get("REGULATIONS_GOV_API_KEY", "").strip()
    contact = os.environ.get("SEC_CONTACT_EMAIL", "").strip()

    client = PoliteClient()
    sec_client = PoliteClient(user_agent=f"{config.USER_AGENT} contact: {contact}") if contact else client

    all_items, reports = [], []
    items, rep = federal_register.fetch(client, start, end)
    all_items += items
    reports.append(rep)

    items, rep = regulations_gov.fetch(client, start, end, regs_key)
    all_items += items
    reports.append(rep)

    items, reps = sec_feeds.fetch(sec_client, start, end, contact)
    all_items += items
    reports += reps

    for it in all_items:
        classify(it)
        flag_item(it)
        for k in ("query_agencies", "forced_category", "forced_subcategory"):
            it.pop(k, None)

    new = store.merge_items(all_items, run_at)
    run = {"run_at": run_at, "start": start, "end": end, "reports": reports, "items_found": len(all_items),
           "items_new": new, "requests": client.total_requests + (sec_client.total_requests if sec_client is not client else 0)}
    store.write_index(index, run)

    for r in reports:
        print(f"  {r['label']}: {r['status']} {r['detail']}")
    print(f"  {len(all_items)} items found, {new} new, {run['requests']} requests made")
    return 0


if __name__ == "__main__":
    sys.exit(main())
