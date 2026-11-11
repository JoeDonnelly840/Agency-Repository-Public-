"""Federal Register: the official daily journal of the U.S. government.

Uses the public API at https://www.federalregister.gov/developers/documentation/api/v1,
which is provided for exactly this kind of programmatic use and needs no key.
"""
import urllib.parse

from .. import config
from ..http_client import SourceUnavailable, RequestRefused

BASE = "https://www.federalregister.gov/api/v1"
SOURCE = "federal_register"
FIELDS = [
    "document_number", "title", "type", "subtype", "abstract", "action", "agencies",
    "publication_date", "html_url", "pdf_url", "docket_ids", "regulation_id_numbers",
    "significant", "comments_close_on", "effective_on", "executive_order_number", "cfr_references",
]
PER_PAGE = 500
MAX_PAGES_PER_QUERY = 20


def _query_url(start, end, agency_slug=None, doc_type=None):
    params = [("per_page", PER_PAGE), ("order", "oldest"),
              ("conditions[publication_date][gte]", start),
              ("conditions[publication_date][lte]", end)]
    if agency_slug:
        params.append(("conditions[agencies][]", agency_slug))
    if doc_type:
        params.append(("conditions[type][]", doc_type))
    params += [("fields[]", f) for f in FIELDS]
    return f"{BASE}/documents.json?{urllib.parse.urlencode(params)}"


def _normalize(doc):
    agencies = doc.get("agencies") or []
    return {
        "id": f"fr:{doc.get('document_number')}",
        "source": SOURCE,
        "source_label": "Federal Register",
        "url": doc.get("html_url"),
        "pdf_url": doc.get("pdf_url"),
        "title": (doc.get("title") or "").strip(),
        "summary": (doc.get("abstract") or "").strip(),
        "action": (doc.get("action") or "").strip(),
        "date": doc.get("publication_date"),
        "doc_type": doc.get("type") or "",
        "subtype": doc.get("subtype") or "",
        "fr_agency_slugs": [a.get("slug") for a in agencies if a.get("slug")],
        "fr_agency_names": [a.get("name") or a.get("raw_name") for a in agencies if a.get("name") or a.get("raw_name")],
        "docket_ids": doc.get("docket_ids") or [],
        "rins": doc.get("regulation_id_numbers") or [],
        "significant": bool(doc.get("significant")),
        "comments_close": doc.get("comments_close_on"),
        "effective_on": doc.get("effective_on"),
        "eo_number": doc.get("executive_order_number"),
    }


def _run_query(client, url):
    docs, pages = [], 0
    while url and pages < MAX_PAGES_PER_QUERY:
        data = client.get_json(url, SOURCE)
        docs.extend(data.get("results") or [])
        url = data.get("next_page_url")
        pages += 1
    truncated = bool(url)
    return docs, truncated


def check_agency_slugs(client):
    """One request: confirm every configured slug exists. Returns {slug: bool}."""
    data = client.get_json(f"{BASE}/agencies.json", SOURCE)
    known = {a.get("slug") for a in data if isinstance(a, dict)}
    return {slug: (slug in known) for ag in config.AGENCIES for slug in ag["fr"]}


def fetch(client, start, end):
    items, report = {}, {"source": SOURCE, "label": "Federal Register", "status": "ok",
                         "detail": "", "agencies": {}}
    problems = []

    try:
        slug_ok = check_agency_slugs(client)
    except (SourceUnavailable, RequestRefused) as exc:
        slug_ok = {}
        problems.append(f"Could not verify agency list ({exc})")

    targets = [(ag["key"], slug, None) for ag in config.AGENCIES for slug in ag["fr"]]
    targets.append((config.PRESIDENT["key"], None, "PRESDOCU"))

    for key, slug, doc_type in targets:
        if slug and slug_ok and not slug_ok.get(slug):
            report["agencies"][key] = f"error: '{slug}' is not a Federal Register agency name (configuration needs fixing)"
            problems.append(f"Unknown agency slug {slug}")
            continue
        try:
            docs, truncated = _run_query(client, _query_url(start, end, slug, doc_type))
        except (SourceUnavailable, RequestRefused) as exc:
            report["agencies"][key] = f"error: {exc}"
            problems.append(f"{key}: {exc}")
            continue
        for d in docs:
            item = _normalize(d)
            item.setdefault("query_agencies", [])
            items.setdefault(item["id"], item)["query_agencies"].append(key)
        status = "ok" if not truncated else "partial: too many results, some were not retrieved"
        report["agencies"][key] = status

    if problems:
        failed = sum(1 for v in report["agencies"].values() if str(v).startswith("error"))
        report["status"] = "failed" if failed == len(targets) else "partial"
        report["detail"] = "; ".join(problems)[:1000]
    return list(items.values()), report
