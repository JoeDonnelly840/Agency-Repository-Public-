"""Types of sanction and outcomes of agency actions.

Every item is tagged with the sanctions its title and summary describe, and
with an "outcome" (the stage the action has reached). Both drive the
research tools and the charts in the app. The full lists are written to
docs/data/taxonomy.json so the app can show them in the user manual.
"""
import re


def _rx(*words):
    return re.compile(r"\b(?:" + "|".join(words) + r")", re.I)


SANCTION_FAMILIES = [
    {"key": "monetary", "label": "Money"},
    {"key": "exclusion", "label": "Exclusion from a market, profession, or program"},
    {"key": "license", "label": "Licenses, registrations, and permits"},
    {"key": "orders", "label": "Orders, injunctions, and conduct restrictions"},
    {"key": "speech", "label": "Speech, disclosure, and publicity"},
    {"key": "product", "label": "Products, goods, and operations"},
    {"key": "investigative", "label": "Investigative and intrusive measures"},
    {"key": "reputational", "label": "Warnings and reputational sanctions"},
    {"key": "funding", "label": "Funding and program conditions"},
    {"key": "criminal", "label": "Criminal process"},
]

# words: extra plain-English phrases the search box treats as asking for this sanction.
SANCTIONS = [
    # ---- money
    {"key": "civil_penalty", "family": "monetary", "label": "Civil money penalties and fines", "short": "Fines",
     "rx": _rx(r"civil (?:money |monetary )?penalt", r"monetary penalt", r"penalt(?:y|ies) of \$", r"fined\b",
               r"\bfines?\b(?! print)", r"assess(?:es|ed|ing)? (?:a |civil )?penalt", r"administrative penalt"),
     "words": ["fine", "fines", "fined", "penalty", "penalties", "civil penalty", "money penalty", "cmp"]},
    {"key": "forfeiture_nal", "family": "monetary", "label": "FCC forfeitures and notices of apparent liability",
     "short": "FCC forfeitures",
     "rx": _rx(r"notice of apparent liability", r"forfeiture order", r"\bNAL\b", r"apparent liability for forfeiture"),
     "words": ["notice of apparent liability", "nal", "forfeiture order", "fcc fine"]},
    {"key": "disgorgement", "family": "monetary", "label": "Disgorgement of profits", "short": "Disgorgement",
     "rx": _rx(r"disgorg", r"ill-gotten", r"unjust enrichment"),
     "words": ["disgorgement", "disgorge", "ill-gotten gains", "profits"]},
    {"key": "restitution", "family": "monetary", "label": "Restitution, redress, and refunds", "short": "Restitution",
     "rx": _rx(r"restitution", r"redress", r"refunds? (?:to|for) (?:consumers|customers|investors|victims)",
               r"back wages", r"returns? (?:\$[\d.,]+ (?:million |billion )?)?to (?:consumers|customers|investors)",
               r"compensat(?:e|ion) (?:for )?(?:harmed |injured )?(?:consumers|customers|investors|workers)"),
     "words": ["restitution", "redress", "refund", "refunds", "back wages", "compensation"]},
    {"key": "asset_freeze", "family": "monetary", "label": "Asset freezes and receiverships", "short": "Asset freeze",
     "rx": _rx(r"asset freeze", r"freez(?:e|es|ing) (?:the |their |his |her )?assets", r"receiver(?:ship)?\b",
               r"temporary restraining order"),
     "words": ["asset freeze", "frozen assets", "receiver", "receivership"]},
    # ---- exclusion
    {"key": "industry_bar", "family": "exclusion", "label": "Bars, bans, and expulsions from an industry",
     "short": "Bars & bans",
     "rx": _rx(r"industry bar", r"associational bar", r"penny[- ]stock bar", r"barr(?:ed|ing) (?:him|her|them|the respondent|from)",
               r"bars? (?:him|her|them|from)", r"permanently barred", r"expel", r"expulsion",
               r"bann(?:ed|ing) (?:him|her|them|it|the company|the defendants?)? ?from", r"lifetime ban"),
     "words": ["bar", "bars", "barred", "barring", "industry bar", "ban", "banned", "banning", "expel", "expelled",
               "expulsion", "kicked out", "blacklist", "blacklisted"]},
    {"key": "officer_director_bar", "family": "exclusion", "label": "Officer-and-director bars",
     "short": "O&D bars",
     "rx": _rx(r"officer[- ](?:and|or)[- ]director bar", r"director[- ](?:and|or)[- ]officer bar",
               r"(?:serving|acting) as an? officer or director"),
     "words": ["officer and director bar", "officer director bar", "o&d bar"]},
    {"key": "practice_suspension", "family": "exclusion",
     "label": "Suspension from practising before an agency (accountants, lawyers)", "short": "Practice bans",
     "rx": _rx(r"102\(e\)", r"appearing or practicing before the commission", r"privilege of appearing",
               r"suspended from (?:appearing|practicing)"),
     "words": ["rule 102(e)", "102e", "practice before the commission", "attorney suspension", "accountant suspension"]},
    {"key": "debarment", "family": "exclusion", "label": "Debarment and exclusion from government programs",
     "short": "Debarment",
     "rx": _rx(r"debar", r"exclusion from (?:participation|federal|medicare|medicaid)",
               r"excluded from (?:participation|federal|medicare|medicaid)", r"suspension and debarment"),
     "words": ["debarment", "debar", "debarred", "exclusion", "excluded", "medicare exclusion", "contract ban"]},
    {"key": "trading_suspension", "family": "exclusion", "label": "Trading suspensions and halts",
     "short": "Trading halts",
     "rx": _rx(r"trading suspension", r"suspend(?:ed|s|ing)? trading", r"order of suspension of trading", r"trading halt"),
     "words": ["trading suspension", "trading halt", "halted trading"]},
    # ---- licenses
    {"key": "suspension", "family": "license", "label": "Suspension of a license, registration, or membership",
     "short": "Suspensions",
     "rx": _rx(r"suspension (?:of|from) (?:the )?(?:registration|membership|association|license|licence|certificate|permit|authori[sz]ation)",
               r"suspend(?:ed|s|ing)? (?:the |its |his |her )?(?:registration|license|licence|membership|certificate|permit)",
               r"notice of suspension", r"interim suspension", r"summary suspension"),
     "words": ["suspension", "suspensions", "suspend", "suspended", "license suspension"]},
    {"key": "revocation", "family": "license", "label": "Revocation, termination, or deregistration",
     "short": "Revocations",
     "rx": _rx(r"revoc", r"revok", r"terminat(?:ion|ed|e|ing) (?:of )?(?:the |its )?(?:license|licence|registration|permit|certificate|authori[sz]ation|approval)",
               r"deregistr", r"12\(j\)", r"cancel(?:l?ation|l?ed) (?:of )?(?:the |its )?(?:license|registration|permit)",
               r"withdraw(?:al|ing|n)? (?:of )?(?:the )?approval"),
     "words": ["revocation", "revoke", "revoked", "revoking", "deregistration", "license revoked", "withdrawal of approval"]},
    {"key": "license_denial", "family": "license", "label": "Denial of an application, license, or renewal",
     "short": "Denials",
     "rx": _rx(r"denial of (?:the |an? )?(?:application|license|licence|registration|renewal|petition)",
               r"den(?:y|ies|ied|ying) (?:the |an? )?(?:application|license|licence|registration|renewal)",
               r"hearing designation order", r"refus(?:e|al) to (?:file|approve|register)"),
     "words": ["denial", "denied", "deny", "application denied", "hearing designation order", "hdo"]},
    # ---- orders
    {"key": "cease_desist", "family": "orders", "label": "Cease-and-desist orders", "short": "Cease & desist",
     "rx": _rx(r"cease[- ](?:and|&)[- ]desist", r"order to (?:stop|halt|cease)"),
     "words": ["cease and desist", "cease-and-desist", "c&d"]},
    {"key": "injunction", "family": "orders", "label": "Court injunctions and restraining orders", "short": "Injunctions",
     "rx": _rx(r"injunct", r"restraining order", r"permanent(?:ly)? enjoin", r"enjoin"),
     "words": ["injunction", "injunctions", "injunctive", "enjoin", "enjoined", "tro", "restraining order"]},
    {"key": "consent_order", "family": "orders", "label": "Consent orders, decrees, and settlements",
     "short": "Settlements",
     "rx": _rx(r"consent (?:order|decree|agreement|judgment)", r"settle(?:ment|s|d)\b", r"agreement containing consent",
               r"stipulat(?:ed|ion) (?:final )?(?:judgment|order)", r"offer of settlement"),
     "words": ["consent order", "consent decree", "settlement", "settlements", "settled", "settle", "plea deal"]},
    {"key": "undertakings", "family": "orders", "label": "Compliance undertakings, monitors, and consultants",
     "short": "Monitors",
     "rx": _rx(r"independent (?:compliance )?(?:monitor|consultant)", r"compliance monitor", r"undertaking",
               r"compliance (?:program|officer) requirement"),
     "words": ["monitor", "monitorship", "independent consultant", "undertaking", "undertakings"]},
    {"key": "data_deletion", "family": "orders", "label": "Orders to delete data, models, or algorithms",
     "short": "Data deletion",
     "rx": _rx(r"delete (?:the |all |any )?(?:data|information|models?|algorithms?|photos|recordings)",
               r"algorithmic disgorgement", r"destroy (?:the )?data"),
     "words": ["data deletion", "delete data", "algorithm", "algorithmic disgorgement", "ai model deletion"]},
    {"key": "operations_order", "family": "orders", "label": "Stop-work, shutdown, and emergency orders",
     "short": "Shutdowns",
     "rx": _rx(r"stop[- ]work", r"shut(?:s|ting)? ?down", r"cease (?:all )?operations", r"emergency (?:order|action)",
               r"imminent hazard", r"imminent danger", r"order to show cause"),
     "words": ["shutdown", "shut down", "stop work", "stop-work", "emergency order", "imminent hazard", "show cause"]},
    # ---- speech
    {"key": "gag", "family": "speech",
     "label": "Gag orders, no-deny, and confidentiality terms, and prior restraints", "short": "Gag orders",
     "rx": _rx(r"\bgag", r"neither admit(?:s|ting)? nor den", r"no[- ]deny", r"not to (?:publicly )?deny",
               r"without admitting or denying", r"confidentiality (?:provision|agreement|order|requirement)",
               r"non-?disparagement", r"prior restraint", r"protective order", r"nondisclosure (?:order|agreement)"),
     "words": ["gag", "gag order", "gag orders", "gag rule", "no deny", "no-deny", "neither admit nor deny",
               "without admitting or denying", "confidentiality", "non-disparagement", "nondisparagement",
               "prior restraint", "silence", "silenced", "speech restriction", "nda", "nondisclosure"]},
    {"key": "corrective_disclosure", "family": "speech", "label": "Corrective advertising and compelled notices",
     "short": "Compelled notices",
     "rx": _rx(r"corrective (?:advertising|notice|statement|disclosure)", r"notify (?:affected )?(?:customers|consumers|patients)",
               r"(?:required|ordered|must) to (?:disclose|post|publish|notify)"),
     "words": ["corrective advertising", "corrective notice", "compelled disclosure", "compelled speech", "notice to customers"]},
    # ---- product / operations
    {"key": "recall", "family": "product", "label": "Recalls and market withdrawals", "short": "Recalls",
     "rx": _rx(r"recall", r"market withdrawal"),
     "words": ["recall", "recalls", "recalled", "market withdrawal"]},
    {"key": "import_action", "family": "product", "label": "Import alerts, detentions, and refusals",
     "short": "Import actions",
     "rx": _rx(r"import alert", r"detention without physical examination", r"import refusal", r"refused (?:entry|admission)"),
     "words": ["import alert", "import detention", "import refusal", "border"]},
    {"key": "seizure", "family": "product", "label": "Seizure, forfeiture, and condemnation of property",
     "short": "Seizures",
     "rx": _rx(r"seiz(?:ure|ed|e)\b", r"forfeit(?:ure)? of (?:property|assets|goods|funds)", r"condemnation", r"civil forfeiture"),
     "words": ["seizure", "seized", "seize", "civil forfeiture", "condemnation", "confiscation", "confiscated"]},
    # ---- investigative
    {"key": "subpoena", "family": "investigative", "label": "Subpoenas and civil investigative demands",
     "short": "Subpoenas & CIDs",
     "rx": _rx(r"subpoena", r"civil investigative demand", r"\bCIDs?\b", r"petition to quash", r"special order (?:to file|requiring)"),
     "words": ["subpoena", "subpoenas", "civil investigative demand", "cid", "cids", "investigative demand", "6(b) order"]},
    {"key": "inspection", "family": "investigative", "label": "Inspections, audits, and on-site examinations",
     "short": "Inspections",
     "rx": _rx(r"inspection(?:s)? of", r"warrantless", r"on-site (?:inspection|examination|review)", r"audit of"),
     "words": ["inspection", "inspections", "audit", "audits", "raid", "search", "warrantless"]},
    # ---- reputational
    {"key": "warning", "family": "reputational", "label": "Warning letters, citations, and notices of violation",
     "short": "Warnings",
     "rx": _rx(r"warning letter", r"untitled letter", r"notice of violation", r"citation(?:s)? (?:issued|for)",
               r"cites? (?:\w+ ){0,4}for", r"notice of (?:non-?compliance|deficiency)", r"notice of opportunity for hearing"),
     "words": ["warning letter", "warning letters", "warning", "citation", "citations", "cited", "notice of violation",
               "untitled letter"]},
    {"key": "censure", "family": "reputational", "label": "Censures and reprimands", "short": "Censures",
     "rx": _rx(r"censur", r"reprimand", r"admonish"),
     "words": ["censure", "censured", "reprimand", "reprimanded"]},
    # ---- funding
    {"key": "funding_cut", "family": "funding", "label": "Termination, suspension, or conditioning of federal funds",
     "short": "Funding cuts",
     "rx": _rx(r"terminat\w* (?:of )?(?:the |all |its )?(?:grants?|awards?|funding|contracts?)",
               r"suspend\w* (?:federal )?(?:funding|grants?|payments)", r"withh(?:o|e)ld\w* (?:federal )?(?:funds|funding|payments)",
               r"claw ?back", r"recoup\w*", r"conditions? on (?:federal )?(?:funds|grants|funding)"),
     "words": ["grant termination", "funding cut", "funding cuts", "defund", "defunded", "withhold funds",
               "clawback", "recoupment", "grant conditions"]},
    # ---- criminal
    {"key": "criminal", "family": "criminal", "label": "Criminal charges, pleas, convictions, and referrals",
     "short": "Criminal",
     "rx": _rx(r"indict", r"criminal (?:charges?|complaint|referral|information|case)", r"pleaded guilty", r"pleads? guilty",
               r"guilty plea", r"sentenced", r"convict", r"arrest"),
     "words": ["criminal", "indictment", "indicted", "guilty", "plea", "sentenced", "conviction", "convicted", "prosecution",
               "arrested", "jail", "prison"]},
]
SANCTION_BY_KEY = {s["key"]: s for s in SANCTIONS}

# A rule that only adjusts penalty amounts for inflation (or similar) mentions
# penalties without imposing any; these are not tagged as sanctions.
_NOT_A_SANCTION = _rx(r"inflation adjustment", r"adjustment of civil (?:monetary )?penalt", r"civil (?:monetary )?penalty (?:inflation )?adjustment",
                      r"no adjustment to .{0,40}penalt", r"penalty amounts for")


def text_of(item):
    return " ".join([item.get("title", ""), item.get("action", ""), item.get("summary", "")])


def sanctions_of(item):
    text = text_of(item)
    if item.get("category") == "rulemaking" and _NOT_A_SANCTION.search(text):
        return []
    found = [s["key"] for s in SANCTIONS if s["rx"].search(text)]
    if item.get("doc_subtype_hint") == "cmp_complaint" and "civil_penalty" not in found:
        found.insert(0, "civil_penalty")
    if item.get("source") == "openfda" and "recall" not in found:
        found.append("recall")
    return found


# ------------------------------------------------------------------ outcomes
OUTCOMES = [
    {"key": "proposed", "label": "Proposed rule or proposal", "group": "rulemaking"},
    {"key": "final", "label": "Final rule", "group": "rulemaking"},
    {"key": "guidance", "label": "Guidance, interpretation, or request for comment", "group": "rulemaking"},
    {"key": "initiated", "label": "Charged or proceeding started", "group": "action"},
    {"key": "settled", "label": "Settled or consented", "group": "action"},
    {"key": "decided", "label": "Decided or ordered after a contest", "group": "action"},
    {"key": "closed", "label": "Dismissed, withdrawn, or closed", "group": "action"},
    {"key": "recall", "label": "Recall classified", "group": "action"},
    {"key": "applied", "label": "Application or filing", "group": "licensing"},
    {"key": "granted", "label": "Granted or approved", "group": "licensing"},
    {"key": "denied", "label": "Denied", "group": "licensing"},
    {"key": "issued", "label": "Issued (presidential)", "group": "presidential"},
    {"key": "notice", "label": "Notice only", "group": "other"},
]
OUTCOME_LABELS = {o["key"]: o["label"] for o in OUTCOMES}

_CLOSED = _rx(r"dismiss", r"withdraw(?:n|al)? (?:of|the) (?:complaint|charges|proceeding|order instituting)",
              r"terminat(?:ion|ed|es|ing) (?:of )?(?:the )?proceeding", r"closing letter", r"vacat")
_SETTLED = _rx(r"settle", r"consent", r"agreement containing", r"stipulat", r"offer of settlement", r"plead(?:s|ed)? guilty",
               r"agree(?:s|d)? to pay", r"accepted? (?:an? )?(?:offer|plea)")
_DECIDED = _rx(r"decision and order", r"final order", r"initial decision", r"opinion of the commission", r"order imposing",
               r"forfeiture order", r"\bruling\b", r"board decision", r"judge'?s? decision", r"found (?:liable|that)", r"\bdecid",
               r"sentenced", r"convicted", r"judgment against")
_INITIATED = _rx(r"order instituting", r"complaint", r"charg", r"\bsue[sd]?\b", r"lawsuit", r"notice of apparent liability",
                 r"notice of hearing", r"order to show cause", r"indict", r"files? (?:suit|action)", r"proposed (?:consent )?order",
                 r"notice of opportunity for hearing", r"subpoena", r"civil investigative demand")
_DENIED = _rx(r"\bden(?:y|ies|ied|ial)\b", r"refus", r"rejected?")
_GRANTED = _rx(r"\bgrant", r"approv", r"issu(?:e|ance) of (?:a |the )?(?:license|permit|certificate)", r"accepted for filing")


def outcome_of(item):
    cat, sub = item.get("category"), item.get("subcategory", "")
    text = text_of(item)
    if cat == "presidential":
        return "issued"
    if cat == "rulemaking":
        if sub == "Final rule":
            return "final"
        if sub == "Proposed rule" or "self-regulatory organization" in sub:
            return "proposed"
        return "guidance"
    if item.get("source") == "openfda":
        return "recall"
    if cat in ("enforcement", "adjudication"):
        if "licensing" in sub.lower() or "application" in sub.lower() or "variance" in sub.lower():
            if _DENIED.search(text):
                return "denied"
            if _GRANTED.search(text):
                return "granted"
            return "applied"
        if _CLOSED.search(text):
            return "closed"
        if _SETTLED.search(text):
            return "settled"
        if _DECIDED.search(text) or "decision" in sub.lower():
            return "decided"
        return "initiated"
    return "notice"


def export():
    """JSON-safe description of the taxonomy for the app."""
    return {
        "sanction_families": SANCTION_FAMILIES,
        "sanctions": [{k: s[k] for k in ("key", "family", "label", "short", "words")} for s in SANCTIONS],
        "outcomes": OUTCOMES,
    }
