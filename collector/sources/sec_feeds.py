"""SEC enforcement RSS feeds (litigation releases, administrative proceedings).

RSS feeds are published by the SEC for subscription by software. The SEC's
fair-access policy asks automated tools to (1) declare who they are with a
contact address, (2) stay under 10 requests per second, and (3) respect
robots.txt. This module sends one request per feed per day, waits 5 seconds
between requests, checks robots.txt first, and only runs when a contact email
has been provided through the SEC_CONTACT_EMAIL secret.
"""
import email.utils
import hashlib
import html.entities
import re
import xml.etree.ElementTree as ET

from .. import config
from ..http_client import SourceUnavailable, RequestRefused

SOURCE_PREFIX = "sec"


def _text(el, tag):
    found = el.find(tag)
    return (found.text or "").strip() if found is not None and found.text else ""


def _date(value):
    try:
        return email.utils.parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError):
        m = re.search(r"\d{4}-\d{2}-\d{2}", value or "")
        return m.group(0) if m else None


def _strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


_VALID_ENTITY = re.compile(r"&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)")
_NAMED_ENTITY = re.compile(r"&([A-Za-z][A-Za-z0-9]+);")


def _repair(xml_bytes):
    """Fix the common mistakes in hand-made feeds: web-page symbols such as &nbsp;
    (not valid in XML) and bare '&' characters in titles."""
    text = xml_bytes.decode("utf-8", "replace")

    def named(m):
        name = m.group(1)
        if name in ("amp", "lt", "gt", "quot", "apos"):
            return m.group(0)
        code = html.entities.name2codepoint.get(name)
        return f"&#{code};" if code else f"&amp;{name};"
    text = _NAMED_ENTITY.sub(named, text)
    text = _VALID_ENTITY.sub("&amp;", text)
    return text.encode("utf-8")


def parse_feed(xml_bytes, feed):
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        root = ET.fromstring(_repair(xml_bytes))
    out = []
    for it in root.iter("item"):
        link = _text(it, "link")
        title = _strip_html(_text(it, "title"))
        uid = _text(it, "guid") or link or title
        out.append({
            "id": f"{feed['key']}:{hashlib.sha1(uid.encode()).hexdigest()[:16]}",
            "source": feed["key"],
            "source_label": feed["label"],
            "url": link,
            "title": title,
            "summary": _strip_html(_text(it, "description"))[:800],
            "action": "",
            "date": _date(_text(it, "pubDate")),
            "doc_type": feed["subcategory"],
            "subtype": "",
            "query_agencies": ["sec"],
            "forced_category": feed["category"],
            "forced_subcategory": feed["subcategory"],
        })
    return out


def fetch(client, start, end, contact_email):
    items, reports = [], []
    for feed in config.SEC_FEEDS:
        report = {"source": feed["key"], "label": feed["label"], "status": "ok", "detail": "",
                  "agencies": {}}
        if not contact_email:
            report.update(status="skipped", detail="Not checked: the SEC asks automated tools to give a contact "
                          "email. Add the SEC_CONTACT_EMAIL secret in GitHub to turn this on.")
            reports.append(report)
            continue
        try:
            body = client.get(feed["url"], feed["key"], check_robots=True)
            parsed = parse_feed(body, feed)
        except (SourceUnavailable, RequestRefused, ET.ParseError) as exc:
            report.update(status="failed", detail=str(exc)[:500])
            report["agencies"]["sec"] = f"error: {exc}"
            reports.append(report)
            continue
        kept = [i for i in parsed if i["date"] and start <= i["date"] <= end]
        dates = sorted(i["date"] for i in parsed if i["date"])
        if dates and dates[0] > start:
            # RSS feeds only hold the latest entries; say so if the window reaches further back.
            report.update(status="partial", detail=f"The feed only reaches back to {dates[0]}; "
                          f"earlier items in this window could not be checked.")
            report["agencies"]["sec"] = f"partial: feed starts {dates[0]}"
            report["covered_from"] = dates[0]  # days from here on were fully checked
        else:
            report["agencies"]["sec"] = "ok"
        items.extend(kept)
        reports.append(report)
    return items, reports
