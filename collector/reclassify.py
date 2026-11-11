"""Re-apply the current sorting and flagging rules to all stored items:
python -m collector.reclassify   (run after changing classify.py or flags.py)"""
import glob
import json
import os

from . import store
from .classify import classify
from .flags import flag_item


def main():
    changed = 0
    for path in sorted(glob.glob(os.path.join(store.ROOT, "days", "*.json"))):
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        before = json.dumps(data, sort_keys=True)
        for it in data["items"]:
            it["query_agencies"] = list(it.get("agencies", []))
            if it.get("source") in ("sec_litigation", "sec_admin"):
                it["forced_category"], it["forced_subcategory"] = it["category"], it["subcategory"]
            classify(it)
            flag_item(it)
            for k in ("query_agencies", "forced_category", "forced_subcategory"):
                it.pop(k, None)
        data["items"].sort(key=lambda i: (-i.get("priority", 0), i.get("title", "")))
        if json.dumps(data, sort_keys=True) != before:
            store._write_json(path, data)
            changed += 1
    print(f"Re-sorted items; {changed} day files updated.")


if __name__ == "__main__":
    main()
