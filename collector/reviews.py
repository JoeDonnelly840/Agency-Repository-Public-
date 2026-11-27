"""Compare the rubric with human reviews: python -m collector.reviews

Reviews are exported from the app (Methodology page, "Download my reviews") and saved in the
repository as review/labels.json. Each review says whether a flag's rating was right
("agree"), too low ("higher"), too high ("lower"), or not an issue at all ("none"), and records
the level the reviewer saw. This script finds each reviewed action in the stored data and reports
how often today's rubric agrees with the reviewer, so a change to the rubric can be judged
against human judgment. It never fails the daily run; it only reports.
"""
import glob
import json
import os
import sys

from . import store

LABELS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "review", "labels.json")


def load_labels(path=LABELS):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, ValueError):
        return []
    return data.get("reviews", data if isinstance(data, list) else [])


def expected_ok(verdict, seen, now):
    """Does today's level satisfy the reviewer? seen: level when reviewed; now: level today."""
    if verdict == "agree":
        return now == seen
    if verdict == "higher":
        return now > seen
    if verdict == "lower":
        return now < seen
    if verdict == "none":
        return now == 0
    return True


def report(labels, root=None):
    want = {(r["id"], r["code"]): r for r in labels if r.get("id") and r.get("code")}
    if not want:
        return None
    ids = {i for i, _ in want}
    found = {}
    for path in glob.glob(store._path("months", "*.json", root=root)) + glob.glob(store._path("days", "*.json", root=root)):
        for it in store._read_json(path, {"items": []})["items"]:
            if it["id"] in ids:
                for f in it.get("flags", []):
                    found[(it["id"], f["code"])] = f.get("level", 0)
    rows = []
    for key, r in want.items():
        now = found.get(key, 0)
        rows.append({"id": key[0], "code": key[1], "verdict": r.get("verdict"), "seen": r.get("level", 0), "now": now,
                     "ok": expected_ok(r.get("verdict"), r.get("level", 0), now)})
    ok = sum(1 for x in rows if x["ok"])
    return {"reviews": len(rows), "agree": ok,
            "summary": f"{ok} of {len(rows)} reviewed flags ({round(100 * ok / len(rows))}%) now match the reviewer's judgment.",
            "disagreements": [x for x in rows if not x["ok"]][:200]}


def main():
    rep = report(load_labels())
    if not rep:
        print("No reviews yet (review/labels.json).")
        return 0
    index = store.load_index()
    index["review_report"] = {k: rep[k] for k in ("reviews", "agree", "summary")}
    store._write_json(store._path("index.json"), index)
    store._write_json(store._path("review_report.json"), rep)
    print(rep["summary"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
