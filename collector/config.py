"""RegHunter configuration.

Everything the collector is allowed to contact is listed here. The collector
never crawls and never contacts a host that is not in ALLOWED_HOSTS. To add an
agency, add an entry to AGENCIES.

Every entity carries a "jurisdiction" so that state agencies can be added later
alongside the federal ones without changing the data format.
"""

APP_NAME = "RegHunter"
APP_VERSION = "2.0"
REPO_URL = "https://github.com/JoeDonnelly840/Agency-Repository-Public-"
USER_AGENT = f"{APP_NAME}/{APP_VERSION} (personal legal-research tool; +{REPO_URL})"
SEC_USER_AGENT_NAME = APP_NAME  # followed by the SEC_CONTACT_EMAIL secret, per the SEC's fair-access format

# Only these hosts may ever be contacted. Anything else is refused in code.
ALLOWED_HOSTS = {
    "www.federalregister.gov",   # official public API, designed for programmatic use
    "api.regulations.gov",       # official API, requires a free api.data.gov key
    "www.sec.gov",               # official RSS feeds; SEC fair-access policy followed
    "api.fda.gov",               # openFDA: official public API (terms: open.fda.gov/terms)
    # Agency websites: only their published RSS feeds (and, where a feed's address
    # must be looked up, the agency's own list of feeds). robots.txt is checked first.
    "www.ftc.gov",
    "www.nlrb.gov",
    "www.fcc.gov",
    "www.fda.gov",
    "www.consumerfinance.gov",
}

# --- Safety limits (deliberately far below every published limit) ---------
MIN_SECONDS_BETWEEN_REQUESTS = {   # per host; requests are never sent in parallel
    "www.federalregister.gov": 2.0,
    "api.regulations.gov": 4.0,    # api.data.gov keys allow ~1,000/hour; we use < 40/day
    "www.sec.gov": 5.0,            # SEC allows 10/second; we send a handful per day
    "api.fda.gov": 3.0,            # openFDA allows 240/minute; we send about 3 per day
}
DEFAULT_SECONDS_BETWEEN_REQUESTS = 6.0  # agency websites: one feed every 6+ seconds
MAX_REQUESTS_PER_RUN = 300         # hard ceiling for one daily run, all sources together
REQUEST_TIMEOUT_SECONDS = 30
MAX_RETRIES = 2                    # retries only on timeouts / 429 / 5xx, with long pauses
MAX_RETRY_AFTER_SECONDS = 120
MAX_CONSECUTIVE_FAILURES_PER_SOURCE = 3  # "circuit breaker": stop using a source that is struggling
MAX_RESPONSE_BYTES = 8 * 1024 * 1024     # never download anything larger than this

FIRST_RUN_BACKFILL_DAYS = 30       # how far back the very first run looks
OVERLAP_DAYS = 3                   # re-check recent days to catch late postings and corrections
MAX_RUN_HISTORY = 400              # run log entries kept in index.json

JURISDICTIONS = [
    {"key": "federal", "name": "Federal", "status": "active"},
    {"key": "state", "name": "State agencies", "status": "planned",
     "note": "Planned for a future version. The data format already records each item's jurisdiction."},
]

# --- Agencies ---------------------------------------------------------------
# fr: Federal Register agency slugs; regs: Regulations.gov agency IDs.
# If a document lists a more specific tracked agency (e.g. FDA), it is shown
# there instead of under the parent (HHS) - see "excludes".
# kind: "commission" (multi-member commission or board) or "single" (led by one official).
AGENCIES = [
    {"key": "sec", "name": "Securities and Exchange Commission", "short": "SEC", "kind": "commission",
     "description": "Regulates the securities markets, public-company disclosure, brokers and investment advisers.",
     "fr": ["securities-and-exchange-commission"], "regs": ["SEC"]},
    {"key": "ftc", "name": "Federal Trade Commission", "short": "FTC", "kind": "commission",
     "description": "Enforces antitrust and consumer-protection law against unfair or deceptive business practices.",
     "fr": ["federal-trade-commission"], "regs": ["FTC"]},
    {"key": "fcc", "name": "Federal Communications Commission", "short": "FCC", "kind": "commission",
     "description": "Licenses and regulates broadcast, wireless, wire, cable and satellite communications.",
     "fr": ["federal-communications-commission"], "regs": ["FCC"]},
    {"key": "epa", "name": "Environmental Protection Agency", "short": "EPA", "kind": "single",
     "description": "Sets and enforces national standards for air, water, chemicals, pesticides and waste.",
     "fr": ["environmental-protection-agency"], "regs": ["EPA"]},
    {"key": "nlrb", "name": "National Labor Relations Board", "short": "NLRB", "kind": "commission",
     "description": "Decides unfair-labor-practice cases and runs union representation elections.",
     "fr": ["national-labor-relations-board"], "regs": ["NLRB"]},
    {"key": "cfpb", "name": "Consumer Financial Protection Bureau", "short": "CFPB", "kind": "single",
     "description": "Writes and enforces federal consumer-finance law for banks, lenders and other providers.",
     "fr": ["consumer-financial-protection-bureau"], "regs": ["CFPB"]},
    {"key": "dol", "name": "Department of Labor", "short": "DOL", "kind": "single",
     "description": "Enforces wage, workplace-safety, benefits and contractor laws through OSHA, WHD, EBSA and others.",
     "fr": ["labor-department"], "regs": ["DOL", "OSHA", "WHD", "EBSA", "ETA", "OFCCP", "MSHA"]},
    {"key": "fda", "name": "Food and Drug Administration", "short": "FDA", "kind": "single",
     "description": "Regulates food, drugs, medical devices, tobacco, cosmetics and dietary supplements.",
     "fr": ["food-and-drug-administration"], "regs": ["FDA"]},
    {"key": "hhs", "name": "Department of Health and Human Services (excluding FDA)", "short": "HHS", "kind": "single",
     "description": "Runs Medicare, Medicaid, public-health and grant programs through CMS, CDC, NIH, OIG and others.",
     "fr": ["health-and-human-services-department"], "regs": ["HHS", "CMS", "CDC", "HRSA", "ACF"],
     "excludes": ["fda"]},
    {"key": "ferc", "name": "Federal Energy Regulatory Commission", "short": "FERC", "kind": "commission",
     "description": "Regulates interstate electricity, natural-gas and oil pipelines, and hydropower licensing.",
     "fr": ["federal-energy-regulatory-commission"], "regs": ["FERC"]},
]

# Presidential documents (executive orders, memoranda, proclamations).
PRESIDENT = {"key": "president", "name": "The President", "short": "President", "kind": "president",
             "description": "Executive orders, proclamations, memoranda, determinations and other presidential documents."}

# --- Agency-controlled corporations ----------------------------------------
# Their rule changes must be filed with and approved by the SEC, which publishes
# them in the Federal Register. We identify them from the official document
# titles, so no visit to the corporations' own websites is needed.
CORPORATIONS = [
    {"key": "finra", "name": "Financial Industry Regulatory Authority", "short": "FINRA", "overseer": "SEC",
     "description": "Private corporation that writes rules for, examines and disciplines broker-dealers, under SEC oversight.",
     "title_patterns": [r"Financial Industry Regulatory Authority"]},
    {"key": "pcaob", "name": "Public Company Accounting Oversight Board", "short": "PCAOB", "overseer": "SEC",
     "description": "Nonprofit corporation that registers, inspects and disciplines auditors of public companies.",
     "title_patterns": [r"Public Company Accounting Oversight Board"]},
    {"key": "msrb", "name": "Municipal Securities Rulemaking Board", "short": "MSRB", "overseer": "SEC",
     "description": "Writes rules for dealers in municipal bonds and for municipal advisors.",
     "title_patterns": [r"Municipal Securities Rulemaking Board"]},
    {"key": "other_sro", "name": "Stock Exchanges and Clearing Agencies",
     "short": "Exchanges & clearing agencies", "overseer": "SEC",
     "description": "Other self-regulatory organizations, such as Nasdaq, NYSE, Cboe and the clearing agencies, whose rule changes the SEC must approve.",
     "title_patterns": [r"^Self-Regulatory Organizations\s*[;:]"]},
]

# --- SEC enforcement feeds ---------------------------------------------------
# Only used when the SEC_CONTACT_EMAIL secret is set, because the SEC's
# fair-access policy asks automated tools to identify themselves with contact
# information. The email is sent only in the request header, never published.
SEC_FEEDS = [
    {"key": "sec_litigation", "label": "SEC litigation releases (federal court actions)",
     "url": "https://www.sec.gov/enforcement-litigation/litigation-releases/rss",
     "category": "enforcement", "subcategory": "Federal court action (litigation release)"},
    {"key": "sec_admin", "label": "SEC administrative proceedings (in-house)",
     "url": "https://www.sec.gov/enforcement-litigation/administrative-proceedings/rss",
     "category": "adjudication", "subcategory": "In-house administrative proceeding"},
]

# --- Agency website feeds (new in 2.0) --------------------------------------
# Agencies publish these RSS feeds so that software can subscribe to them.
# Rules: robots.txt is checked before every host is used; one request per feed
# per day; nothing but the feed itself is read. When an agency lists a feed on
# its "RSS feeds" page without a fixed address, the collector reads that one
# official page and follows the link whose text matches "link_text" - but only
# if the link stays on the same agency host.
# "keep": only items whose title or summary match one of these words are kept,
# so that press releases about events, speeches and webinars are left out.
ACTION_WORDS = (r"settle|consent|order|complaint|charg|su(?:e|ed|es|ing)\b|lawsuit|penalt|fine[sd]?\b|forfeit|"
                r"disgorg|refund|redress|restitution|ban(?:s|ned)?\b|bar(?:s|red)?\b|halt|stop|shut|injunct|"
                r"enforce|violat|indict|plead|guilty|sentenc|seiz|recall|warning letter|revok|revocation|"
                r"suspend|suspension|debar|exclu|decision|ruling|judge|cease")

AGENCY_FEEDS = [
    {"key": "ftc_consumer", "agency": "ftc", "label": "FTC consumer-protection press releases",
     "url": "https://www.ftc.gov/feeds/press-release-consumer-protection.xml", "keep": ACTION_WORDS},
    {"key": "ftc_competition", "agency": "ftc", "label": "FTC competition (antitrust) press releases",
     "url": "https://www.ftc.gov/feeds/press-release-competition.xml", "keep": ACTION_WORDS},
    {"key": "nlrb_board", "agency": "nlrb", "label": "NLRB Board decisions",
     "discover": {"page": "https://www.nlrb.gov/resources/rss-feeds", "link_text": r"Board Decisions"},
     "category": "adjudication", "subcategory": "Board decision"},
    {"key": "nlrb_alj", "agency": "nlrb", "label": "NLRB administrative law judge decisions",
     "discover": {"page": "https://www.nlrb.gov/resources/rss-feeds", "link_text": r"Judges'? Decisions"},
     "category": "adjudication", "subcategory": "Administrative law judge decision"},
    {"key": "nlrb_press", "agency": "nlrb", "label": "NLRB press releases",
     "url": "https://www.nlrb.gov/rss/rssPressReleases.xml", "keep": ACTION_WORDS},
    {"key": "fcc_enforcement", "agency": "fcc", "label": "FCC Enforcement Bureau documents",
     "discover": {"page": "https://www.fcc.gov/rss", "link_text": r"Enforcement Bureau"}},
    {"key": "fcc_nal", "agency": "fcc", "label": "FCC notices of apparent liability (proposed forfeitures)",
     "discover": {"page": "https://www.fcc.gov/rss", "link_text": r"Notices? of Apparent Liability"},
     "category": "enforcement", "subcategory": "Notice of apparent liability (proposed forfeiture)"},
    {"key": "fda_press", "agency": "fda", "label": "FDA press releases",
     "url": "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml",
     "keep": ACTION_WORDS},
    {"key": "cfpb_newsroom", "agency": "cfpb", "label": "CFPB newsroom (enforcement announcements)",
     "url": "https://www.consumerfinance.gov/about-us/newsroom/feed/", "keep": ACTION_WORDS},
]

# openFDA recall enforcement reports (official API, no key needed at this volume).
OPENFDA_ENDPOINTS = [
    {"key": "drug", "label": "drugs"}, {"key": "device", "label": "medical devices"}, {"key": "food", "label": "food"},
]
OPENFDA_MAX_PER_ENDPOINT = 300

CATEGORIES = {
    "rulemaking": "Rulemaking",
    "enforcement": "Enforcement",
    "adjudication": "Adjudication & licensing",
    "presidential": "Presidential actions",
    "other": "Other notices",
}

# What each category can and cannot see in this version. Shown in the app so
# the user always knows the limits of a "nothing found" result.
COVERAGE_NOTES = {
    "rulemaking": "Well covered. Proposed and final rules must be published in the Federal Register, "
                  "which is checked for every tracked agency. Guidance and policy statements appear only "
                  "if the agency published them there or on Regulations.gov.",
    "enforcement": "Partly covered. Enforcement notices in the Federal Register and on Regulations.gov; the SEC's "
                   "litigation-release and administrative-proceeding feeds; enforcement announcements in the FTC, "
                   "NLRB, FDA and CFPB press feeds; FCC Enforcement Bureau documents and notices of apparent "
                   "liability; and FDA recall enforcement reports. Not covered: EPA, DOL (OSHA, Wage and Hour), "
                   "FERC and HHS-OIG enforcement announcements, and anything an agency never announces publicly.",
    "adjudication": "Partly covered. Federal Register notices of hearings, applications and licensing; SEC in-house "
                    "proceedings; NLRB Board and administrative-law-judge decisions (from the NLRB's own feeds); and "
                    "FDA civil-money-penalty complaints on Regulations.gov. Not covered: ALJ and appeals-board "
                    "decisions at the other agencies (for example the HHS Departmental Appeals Board, OSHRC, FERC "
                    "initial decisions) unless they appear in the Federal Register.",
    "presidential": "Well covered. Executive orders, memoranda and proclamations published in the Federal Register. "
                    "Presidential actions that are never published (for example some directives and firings) are not.",
    "other": "Everything else the Federal Register publishes for the agency (meetings, information-collection "
             "requests, and similar notices) and routine Regulations.gov postings.",
}

# A plain list of what RegHunter does NOT track, shown on the "What we track" page.
NOT_TRACKED = [
    {"what": "Agency websites without a published feed or API",
     "why": "Reading ordinary web pages in bulk can breach a site's terms or load its servers, so RegHunter "
            "reads only feeds and interfaces published for software."},
    {"what": "EPA enforcement cases (ECHO database)",
     "why": "EPA offers an official ECHO web service; it is a planned addition but is not connected yet."},
    {"what": "Department of Labor enforcement (OSHA citations, Wage and Hour cases)",
     "why": "DOL's enforcement data API needs a separate key and has not been connected yet."},
    {"what": "FERC enforcement settlements and orders not in the Federal Register",
     "why": "FERC does not publish an enforcement feed; its eLibrary is not read."},
    {"what": "HHS Office of Inspector General exclusions and civil money penalties",
     "why": "Published as monthly downloadable files; not connected yet."},
    {"what": "FINRA's disciplinary database, BrokerCheck and website",
     "why": "Not read, to respect FINRA's terms of use. FINRA matters appear only when the SEC publishes them."},
    {"what": "PCAOB and MSRB disciplinary orders",
     "why": "Their websites are not read. Only SEC-published notices about them are tracked."},
    {"what": "Court dockets (PACER) and Department of Justice actions",
     "why": "PACER charges per page and DOJ is not a tracked agency in this version."},
    {"what": "Unpublished agency actions",
     "why": "Investigations, subpoenas, closing letters, supervisory findings and anything an agency does not "
            "announce publicly cannot be seen by any outside tool."},
    {"what": "Full text of documents",
     "why": "Flags and search use each document's title, summary and type, not the full text."},
    {"what": "State agencies",
     "why": "Planned for a future version."},
    {"what": "Federal agencies other than those on the home screen",
     "why": "More agencies can be added in collector/config.py."},
]
