"""Regulations.gov (read-only API, v4).

Uses only the read-only "documents" endpoint with the free api.data.gov key
(stored as the GitHub secret REGULATIONS_GOV_API_KEY). The collector never uses
the separate Comment API and never submits anything.

Most Regulations.gov documents are also Federal Register documents; those are
skipped here (the Federal Register copy is used) so nothing is listed twice.
"""
import urllib.parse

from .. import config
from ..http_client import SourceUnavailable, RequestRefused

BASE = "https://api.regulations.gov/v4/documents"
SOURCE = "regulations_gov"
PAGE_SIZE = 250
MAX_PAGES = 8
KEEP_TYPES = {"Rule", "Proposed Rule", "Notice", "Other"}


def _url(agency_id, start, end, page):
    params = [("filter[agencyId]", agency_id),
              ("filter[postedDate][ge]", start),
              ("filter[postedDate][le]", end),
              ("page[size]", PAGE_SIZE),
              ("page[number]", page),
              ("sort", "postedDate")]
    return f"{BASE}?{urllib.parse.urlencode(params)}"


def _normalize(doc, agency_key):
    a = doc.get("attributes") or {}
    doc_id = doc.get("id")
    return {
        "id": f"regs:{doc_id}",
        "source": SOURCE,
        "source_label": "Regulations.gov",
        "url": f"https://www.regulations.gov/document/{doc_id}",
        "title": (a.get("title") or "").strip(),
        "summary": "",
        "action": "",
        "date": (a.get("postedDate") or "")[:10],
        "doc_type": a.get("documentType") or "",
        "subtype": a.get("subtype") or "",
        "docket_ids": [a["docketId"]] if a.get("docketId") else [],
        "comments_close": (a.get("commentEndDate") or "")[:10] or None,
        "query_agencies": [agency_key],
        "regs_agency_id": a.get("agencyId"),
        "fr_doc_num": a.get("frDocNum"),
        "withdrawn": bool(a.get("withdrawn")),
    }


def fetch(client, start, end, api_key):
    report = {"source": SOURCE, "label": "Regulations.gov", "status": "ok", "detail": "", "agencies": {}}
    if not api_key:
        report.update(status="skipped",
                      detail="Not checked: the REGULATIONS_GOV_API_KEY secret has not been added to GitHub.")
        return [], report

    items, problems = [], []
    headers = {"X-Api-Key": api_key}
    for ag in config.AGENCIES:
        statuses = []
        for agency_id in ag["regs"]:
            page, has_next = 1, True
            try:
                while has_next and page <= MAX_PAGES:
                    data = client.get_json(_url(agency_id, start, end, page), SOURCE, headers=headers)
                    for doc in data.get("data") or []:
                        item = _normalize(doc, ag["key"])
                        if item["fr_doc_num"] or item["withdrawn"] or item["doc_type"] not in KEEP_TYPES:
                            continue
                        items.append(item)
                    has_next = bool((data.get("meta") or {}).get("hasNextPage"))
                    page += 1
                statuses.append("ok" if not has_next else "partial")
            except (SourceUnavailable, RequestRefused) as exc:
                statuses.append(f"error: {agency_id}: {exc}")
                problems.append(f"{agency_id}: {exc}")
        errors = [s for s in statuses if s.startswith("error")]
        report["agencies"][ag["key"]] = "; ".join(errors) if errors else (
            "partial: too many results" if "partial" in statuses else "ok")

    if problems:
        all_failed = all(str(v).startswith("error") for v in report["agencies"].values())
        report["status"] = "failed" if all_failed else "partial"
        report["detail"] = "; ".join(problems)[:1000]
    return items, report
