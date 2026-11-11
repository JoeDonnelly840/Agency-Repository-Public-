"""Sort each item into an agency (or agency-controlled corporation) and a category."""
import re

from . import config

_SLUG_TO_KEY = {slug: ag["key"] for ag in config.AGENCIES for slug in ag["fr"]}
_EXCLUDES = {ag["key"]: set(ag.get("excludes", [])) for ag in config.AGENCIES}
_CORP_PATTERNS = [(c["key"], [re.compile(p, re.I) for p in c["title_patterns"]]) for c in config.CORPORATIONS]


def _rx(*words):
    return re.compile(r"\b(?:" + "|".join(words) + r")", re.I)


ADJUDICATION = _rx(r"administrative law judge", r"initial decision", r"decision and order", r"opinion and order",
                   r"notice of (?:a )?hearing", r"hearing (?:on|to determine)", r"petition for review",
                   r"in the matter of", r"order to show cause", r"remand")
LICENSING = _rx(r"combined notice of filings", r"notice of (?:filing|application|intent to (?:prepare|file))",
                r"application(?:s)? for", r"licen[cs]e", r"certificate of public convenience",
                r"permit(?:s)?\b", r"waiver", r"exemptive relief", r"notice of applications? for deregistration",
                r"tariff", r"rate (?:filing|case|schedule)")
ENFORCEMENT = _rx(r"consent (?:agreement|order|decree)", r"civil (?:money )?penalt", r"cease[- ]and[- ]desist",
                  r"order instituting", r"settlement", r"notice of violation", r"debarment", r"enforcement",
                  r"proposed (?:consent )?order", r"complaint", r"forfeiture", r"revocation", r"trading suspension",
                  r"disgorgement", r"sanction")
STRONG = _rx(r"civil (?:money )?penalt(?:y|ies) (?:of|against)", r"consent (?:order|decree)", r"cease[- ]and[- ]desist",
             r"order instituting", r"debarment proceeding")
GUIDANCE = _rx(r"guidance", r"policy statement", r"statement of policy", r"interpretive", r"interpretation",
               r"request for (?:information|comment)", r"advance notice of proposed rulemaking",
               r"petition for rulemaking", r"frequently asked questions")
RULE_HEARING = _rx(r"informal (?:public )?hearing", r"public hearing on (?:the )?proposed rule")
PAPERWORK = _rx(r"information collection", r"paperwork reduction act", r"agency information collection",
                r"submission for (?:the )?office of management and budget", r"system of records", r"privacy act of 1974")
MEETING = _rx(r"meeting", r"sunshine act", r"advisory committee", r"webinar", r"public workshop")


def text_of(item):
    return " ".join([item.get("title", ""), item.get("action", ""), item.get("summary", "")])


def assign_agencies(item):
    keys = set()
    for slug in item.get("fr_agency_slugs", []):
        if slug in _SLUG_TO_KEY:
            keys.add(_SLUG_TO_KEY[slug])
    keys.update(item.get("query_agencies", []))
    for key in list(keys):  # e.g. drop HHS when the document is FDA's
        if _EXCLUDES.get(key, set()) & keys:
            keys.discard(key)
    return sorted(keys)


def assign_corporation(item):
    if "sec" not in item.get("agencies", []):
        return None
    title = item.get("title", "")
    for key, patterns in _CORP_PATTERNS:
        if any(p.search(title) for p in patterns):
            return key
    return None


def assign_category(item):
    """Returns (category, subcategory)."""
    if item.get("forced_category"):
        return item["forced_category"], item.get("forced_subcategory", "")
    dtype = (item.get("doc_type") or "").lower()
    title_action = " ".join([item.get("title", ""), item.get("action", "")])
    full = text_of(item)

    if dtype == "presidential document":
        return "presidential", item.get("subtype") or "Presidential document"
    if dtype == "rule":
        return "rulemaking", "Final rule"
    if dtype == "proposed rule":
        return "rulemaking", "Proposed rule"
    if item.get("corporation"):
        if ENFORCEMENT.search(title_action) and re.search(r"disciplin|expel|\bbar\b", full, re.I):
            return "enforcement", "Disciplinary matter"
        return "rulemaking", "Rule filing by self-regulatory organization"
    # Notices and everything else: decide from the wording.
    if PAPERWORK.search(title_action):
        return "other", "Information collection, privacy or paperwork notice"
    if RULE_HEARING.search(title_action):
        return "rulemaking", "Rulemaking hearing"
    if ADJUDICATION.search(title_action):
        return "adjudication", "Hearing, decision or adjudicatory order"
    if ENFORCEMENT.search(title_action):
        return "enforcement", "Enforcement notice"
    if LICENSING.search(title_action):
        return "adjudication", "Applications, filings & licensing"
    if GUIDANCE.search(title_action):
        return "rulemaking", "Guidance, interpretation or request for comment"
    if MEETING.search(title_action):
        return "other", "Meeting or event"
    # Summary text alone is only trusted for strong adjudication/enforcement wording.
    if STRONG.search(full):
        return "enforcement", "Enforcement notice"
    return "other", "Other notice"


def classify(item):
    item["agencies"] = assign_agencies(item)
    item["corporation"] = assign_corporation(item)
    item["category"], item["subcategory"] = assign_category(item)
    return item
