"""Agency website feeds (new in RegHunter 2.0).

Agencies publish RSS feeds so that people and software can subscribe to them.
This module reads only those feeds, listed in config.AGENCY_FEEDS, and follows
these rules:
  * robots.txt is checked before any page on an agency host is read;
  * each feed is read at most once per day, with at least 6 seconds between requests;
  * if a feed's address must be looked up, only the agency's own "RSS feeds"
    page is read, and only a link on the same agency host is followed;
  * nothing is submitted, and no other pages are visited.
"""
import email.utils
import hashlib
import html
import re
import urllib.parse
import xml.etree.ElementTree as ET

from .. import config
from ..http_client import SourceUnavailable, RequestRefused
from .sec_feeds import _repair

_A_TAG = re.compile(r"<a\b[^>]*?href\s*=\s*[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.I | re.S)


def _local(tag):
    return tag.rsplit("}", 1)[-1].lower()


def _child_text(el, *names):
    for child in el:
        if _local(child.tag) in names:
            if child.text and child.text.strip():
                return child.text.strip()
            if child.get("href"):
                return child.get("href").strip()
    return ""


def _strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _date(value):
    if not value:
        return None
    try:
        return email.utils.parsedate_to_datetime(value).date().isoformat()
    except (TypeError, ValueError, IndexError):
        m = re.search(r"\d{4}-\d{2}-\d{2}", value)
        return m.group(0) if m else None


def parse_feed(xml_bytes, feed):
    """Parse RSS 2.0, RSS 1.0 or Atom into RegHunter items."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        root = ET.fromstring(_repair(xml_bytes))
    out = []
    for el in root.iter():
        if _local(el.tag) not in ("item", "entry"):
            continue
        title = _strip(_child_text(el, "title"))
        link = _child_text(el, "link")
        if not link:
            for child in el:
                if _local(child.tag) == "link" and child.get("href"):
                    link = child.get("href")
                    break
        uid = _child_text(el, "guid", "id") or link or title
        summary = _strip(_child_text(el, "description", "summary", "content"))
        when = _date(_child_text(el, "pubdate", "published", "updated", "date", "issued"))
        out.append({
            "id": f"{feed['key']}:{hashlib.sha1(uid.encode()).hexdigest()[:16]}",
            "source": feed["key"],
            "source_label": feed["label"],
            "url": link if link.startswith("https://") else "",
            "title": title,
            "summary": "" if summary == title else summary[:800],
            "action": "",
            "date": when,          # the agency's release date
            "date_basis": "released",
            "published": when,
            "doc_type": "Agency announcement",
            "subtype": "",
            "query_agencies": [feed["agency"]],
            **({"forced_category": feed["category"], "forced_subcategory": feed.get("subcategory", "")}
               if feed.get("category") else {}),
        })
    return out


def keep(item, feed):
    """Press-release feeds also announce events, speeches and webinars; keep actions only."""
    pattern = feed.get("keep")
    if not pattern:
        return True
    return bool(re.search(r"\b(?:" + pattern + ")", f"{item['title']} {item['summary']}", re.I))


def discover_url(client, feed):
    """Find a feed's address on the agency's own list of feeds (one page, same host only)."""
    page = feed["discover"]["page"]
    host = urllib.parse.urlsplit(page).hostname
    body = client.get(page, feed["key"], check_robots=True).decode("utf-8", "replace")
    wanted = re.compile(feed["discover"]["link_text"], re.I)
    for href, text in _A_TAG.findall(body):
        label = _strip(text)
        if not wanted.search(label):
            continue
        url = urllib.parse.urljoin(page, html.unescape(href))
        parts = urllib.parse.urlsplit(url)
        if parts.scheme == "https" and parts.hostname == host and re.search(r"rss|feed|xml", url, re.I):
            return url
    raise SourceUnavailable(f"Could not find the '{feed['discover']['link_text']}' feed on {page}.")


def fetch(client, start, end):
    items, reports = [], []
    for feed in config.AGENCY_FEEDS:
        if feed.get("enabled") is False:
            continue
        report = {"source": feed["key"], "label": feed["label"], "status": "ok", "detail": "",
                  "agencies": {}, "kind": "agency_website"}
        try:
            url = feed.get("url") or discover_url(client, feed)
            body = client.get(url, feed["key"], check_robots=True)
            parsed = parse_feed(body, feed)
        except (SourceUnavailable, RequestRefused, ET.ParseError) as exc:
            report.update(status="failed", detail=str(exc)[:500])
            report["agencies"][feed["agency"]] = f"error: {exc}"
            reports.append(report)
            continue
        dated = [i for i in parsed if i["date"]]
        kept = [i for i in dated if start <= i["date"] <= end and keep(i, feed)]
        dates = sorted(i["date"] for i in dated)
        if dates and dates[0] > start:
            report.update(status="partial", detail=f"The feed only reaches back to {dates[0]}; "
                          f"earlier days in this window could not be checked.")
            report["agencies"][feed["agency"]] = f"partial: feed starts {dates[0]}"
            report["covered_from"] = dates[0]
        else:
            report["agencies"][feed["agency"]] = "ok"
        if feed.get("keep"):
            report["detail"] = (report["detail"] + " " if report["detail"] else "") + \
                "Only announcements that describe an action (charges, settlements, orders, penalties, and similar) are kept."
        items.extend(kept)
        reports.append(report)
    return items, reports
