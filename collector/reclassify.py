"""Re-apply the current sorting, flagging, and rating rules to every stored item:
python -m collector.reclassify   (run after changing classify.py, taxonomy.py, flags.py, or doctrine.py)"""
import datetime as dt
import glob
import json
import os

from . import config, store
from .classify import classify
from .flags import flag_item

# Sources whose category comes from the feed itself rather than from the wording.
FIXED_CATEGORY_SOURCES = ({f["key"] for f in config.SEC_FEEDS} | {"openfda"} |
                          {f["key"] for f in config.AGENCY_FEEDS if f.get("category")})


def redo(it):
    it.setdefault("published", it.get("date"))       # items stored before version 3.0
    it.setdefault("date_basis", "published")
    it["query_agencies"] = list(it.get("agencies", []))
    if it.get("source") in FIXED_CATEGORY_SOURCES:
        it["forced_category"], it["forced_subcategory"] = it["category"], it["subcategory"]
    classify(it)
    flag_item(it)
    for k in ("query_agencies", "forced_category", "forced_subcategory"):
        it.pop(k, None)
    return store.slim(it)


def main(today=None):
    today = today or dt.date.today()
    changed, months = 0, set()
    for folder, key in (("days", "date"), ("months", "month")):
        for path in sorted(glob.glob(os.path.join(store.ROOT, folder, "*.json"))):
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
            before = json.dumps(data, sort_keys=True)
            data["items"] = sorted((redo(it) for it in data["items"]), key=store.sort_key)
            if folder == "months":
                months.add(data[key])
            if json.dumps(data, sort_keys=True) != before:
                store._write_json(path, data, compact=(folder == "months"))
                changed += 1
    index = store.load_index()
    store.finish_storage(index, months, today)
    if index.get("runs"):
        store.write_index(index, index["runs"].pop())  # refresh lists, taxonomy, and counts
    print(f"Re-sorted and re-rated items; {changed} files updated.")


if __name__ == "__main__":
    main()
