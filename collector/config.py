"""Agency Tracker configuration.

Everything the collector is allowed to contact is listed here. The collector
never follows links, never crawls, and never contacts a host that is not in
ALLOWED_HOSTS. To add an agency, add an entry to AGENCIES.
"""

REPO_URL = "https://github.com/JoeDonnelly840/Agency-Repository-Public-"
USER_AGENT = f"AgencyTracker/1.0 (personal research tool; +{REPO_URL})"
SEC_USER_AGENT_NAME = "AgencyTracker"  # followed by the SEC_CONTACT_EMAIL secret, per the SEC's fair-access format

# Only these hosts may ever be contacted. Anything else is refused in code.
ALLOWED_HOSTS = {
    "www.federalregister.gov",  # official public API, designed for programmatic use
    "api.regulations.gov",      # official API, requires a free api.data.gov key
    "www.sec.gov",              # official RSS feeds; SEC fair-access policy followed
}

# --- Safety limits (deliberately far below every published limit) ---------
MIN_SECONDS_BETWEEN_REQUESTS = {   # per host; requests are never sent in parallel
    "www.federalregister.gov": 2.0,
    "api.regulations.gov": 4.0,    # api.data.gov keys allow ~1,000/hour; we use < 40/day
    "www.sec.gov": 5.0,            # SEC allows 10/second; we send a handful per day
}
MAX_REQUESTS_PER_RUN = 300         # hard ceiling for one daily run, all sources together
REQUEST_TIMEOUT_SECONDS = 30
MAX_RETRIES = 2                    # retries only on timeouts / 429 / 5xx, with long pauses
MAX_RETRY_AFTER_SECONDS = 120
MAX_CONSECUTIVE_FAILURES_PER_SOURCE = 3  # "circuit breaker": stop using a source that is struggling

FIRST_RUN_BACKFILL_DAYS = 30       # how far back the very first run looks
OVERLAP_DAYS = 3                   # re-check recent days to catch late postings and corrections
MAX_RUN_HISTORY = 400              # run log entries kept in index.json

# --- Agencies ---------------------------------------------------------------
# fr: Federal Register agency slugs; regs: Regulations.gov agency IDs.
# If a document lists a more specific tracked agency (e.g. FDA), it is shown
# there instead of under the parent (HHS) - see "excludes".
AGENCIES = [
    {"key": "sec", "name": "Securities and Exchange Commission", "short": "SEC",
     "fr": ["securities-and-exchange-commission"], "regs": ["SEC"]},
    {"key": "ftc", "name": "Federal Trade Commission", "short": "FTC",
     "fr": ["federal-trade-commission"], "regs": ["FTC"]},
    {"key": "fcc", "name": "Federal Communications Commission", "short": "FCC",
     "fr": ["federal-communications-commission"], "regs": ["FCC"]},
    {"key": "epa", "name": "Environmental Protection Agency", "short": "EPA",
     "fr": ["environmental-protection-agency"], "regs": ["EPA"]},
    {"key": "nlrb", "name": "National Labor Relations Board", "short": "NLRB",
     "fr": ["national-labor-relations-board"], "regs": ["NLRB"]},
    {"key": "cfpb", "name": "Consumer Financial Protection Bureau", "short": "CFPB",
     "fr": ["consumer-financial-protection-bureau"], "regs": ["CFPB"]},
    {"key": "dol", "name": "Department of Labor", "short": "DOL",
     "fr": ["labor-department"], "regs": ["DOL", "OSHA", "WHD", "EBSA", "ETA", "OFCCP", "MSHA"]},
    {"key": "fda", "name": "Food and Drug Administration", "short": "FDA",
     "fr": ["food-and-drug-administration"], "regs": ["FDA"]},
    {"key": "hhs", "name": "Health and Human Services (other than FDA)", "short": "HHS",
     "fr": ["health-and-human-services-department"], "regs": ["HHS", "CMS", "CDC", "HRSA", "ACF"],
     "excludes": ["fda"]},
    {"key": "ferc", "name": "Federal Energy Regulatory Commission", "short": "FERC",
     "fr": ["federal-energy-regulatory-commission"], "regs": ["FERC"]},
]

# Presidential documents (executive orders, memoranda, proclamations).
PRESIDENT = {"key": "president", "name": "The President (Presidential Documents)", "short": "President"}

# --- Agency-controlled corporations ----------------------------------------
# Their rule changes must be filed with and approved by the SEC, which publishes
# them in the Federal Register. We identify them from the official document
# titles, so no visit to the corporations' own websites is needed.
CORPORATIONS = [
    {"key": "finra", "name": "Financial Industry Regulatory Authority (FINRA)", "overseer": "SEC",
     "title_patterns": [r"Financial Industry Regulatory Authority"]},
    {"key": "pcaob", "name": "Public Company Accounting Oversight Board (PCAOB)", "overseer": "SEC",
     "title_patterns": [r"Public Company Accounting Oversight Board"]},
    {"key": "msrb", "name": "Municipal Securities Rulemaking Board (MSRB)", "overseer": "SEC",
     "title_patterns": [r"Municipal Securities Rulemaking Board"]},
    {"key": "other_sro", "name": "Other SEC-supervised self-regulatory organizations (exchanges, clearing agencies)",
     "overseer": "SEC", "title_patterns": [r"^Self-Regulatory Organizations\s*[;:]"]},
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
                  "if the agency chose to publish them there.",
    "enforcement": "Partly covered. Only enforcement matters published in the Federal Register (for example, "
                   "some FTC proposed consent orders and civil-penalty notices) and, for the SEC, its official "
                   "litigation-release and administrative-proceeding feeds. Most other agencies announce "
                   "enforcement actions only on their own websites, which this version does not read.",
    "adjudication": "Partly covered. Federal Register notices of hearings, applications, licensing and filings, "
                    "plus SEC in-house administrative proceedings. Individual ALJ and board decisions "
                    "(for example, most NLRB decisions) are usually NOT published in the Federal Register "
                    "and are not tracked in this version.",
    "presidential": "Well covered. Executive orders, memoranda and proclamations published in the Federal Register.",
    "other": "Everything else the Federal Register publishes for the agency (meetings, information-collection "
             "requests, and similar notices).",
}
