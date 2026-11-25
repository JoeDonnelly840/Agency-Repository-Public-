"""openFDA recall enforcement reports (official FDA API, https://open.fda.gov).

openFDA is offered for programmatic use; without a key it allows 240 requests a
minute and 1,000 a day per address. RegHunter sends one request per endpoint
per day (three in all), three seconds apart. Data is public domain (CC0).
"""
import hashlib
import urllib.parse

from .. import config
from ..http_client import SourceUnavailable, RequestRefused

SOURCE = "openfda"
BASE = "https://api.fda.gov"


def _url(endpoint, start, end):
    s, e = start.replace("-", ""), end.replace("-", "")
    # openFDA's query syntax uses a literal "+" for spaces inside the search expression.
    return (f"{BASE}/{endpoint}/enforcement.json?search=report_date:[{s}+TO+{e}]"
            f"&limit={config.OPENFDA_MAX_PER_ENDPOINT}")


def _iso(yyyymmdd):
    v = (yyyymmdd or "").strip()
    return f"{v[:4]}-{v[4:6]}-{v[6:8]}" if len(v) == 8 and v.isdigit() else None


def normalize(rec, endpoint_label):
    number = rec.get("recall_number") or rec.get("event_id") or ""
    uid = number or hashlib.sha1(repr(sorted(rec.items())).encode()).hexdigest()[:16]
    firm = (rec.get("recalling_firm") or "").strip()
    product = (rec.get("product_description") or "").strip()
    cls = (rec.get("classification") or "").strip()
    who = (rec.get("voluntary_mandated") or "").strip()
    return {
        "id": f"openfda:{uid}",
        "source": SOURCE,
        "source_label": f"openFDA recall enforcement reports ({endpoint_label})",
        "url": "https://api.fda.gov/{}/enforcement.json?search=recall_number:%22{}%22".format(
            rec.get("_endpoint", "drug"), urllib.parse.quote(number)) if number else "",
        "title": f"{firm}: {product[:160]}{'…' if len(product) > 160 else ''}" if firm else product[:180],
        "summary": f"{cls}. {who}. Reason: {(rec.get('reason_for_recall') or '').strip()}"[:800],
        "action": "",
        # The agency's action is FDA's classification of the recall; the weekly report date is when it was published.
        "date": _iso(rec.get("center_classification_date")) or _iso(rec.get("report_date")),
        "date_basis": "classified" if _iso(rec.get("center_classification_date")) else "published",
        "published": _iso(rec.get("report_date")),
        "doc_type": "Recall enforcement report",
        "subtype": cls,
        "query_agencies": ["fda"],
        "forced_category": "enforcement",
        "forced_subcategory": f"Recall ({cls or 'unclassified'}, {endpoint_label})",
        "recall_class": cls,
        "recall_initiator": who,
    }


def fetch(client, start, end):
    report = {"source": SOURCE, "label": "openFDA recall enforcement reports", "status": "ok", "detail": "",
              "agencies": {}, "kind": "api"}
    items, problems, truncated = [], [], []
    for ep in config.OPENFDA_ENDPOINTS:
        try:
            data = client.get_json(_url(ep["key"], start, end), SOURCE, not_found_ok=True)
        except (SourceUnavailable, RequestRefused) as exc:
            problems.append(f"{ep['label']}: {exc}")
            continue
        results = data.get("results") or []
        total = ((data.get("meta") or {}).get("results") or {}).get("total", len(results))
        if total > len(results):
            truncated.append(ep["label"])
        for rec in results:
            rec["_endpoint"] = ep["key"]
            it = normalize(rec, ep["label"])
            if it["published"]:
                items.append(it)
    if problems:
        report["status"] = "failed" if len(problems) == len(config.OPENFDA_ENDPOINTS) else "partial"
        report["detail"] = "; ".join(problems)[:800]
    elif truncated:
        report["status"] = "partial"
        report["detail"] = f"More recalls than the per-run limit for: {', '.join(truncated)}."
    report["agencies"]["fda"] = "ok" if report["status"] == "ok" else f"{report['status']}: {report['detail']}"
    return items, report
