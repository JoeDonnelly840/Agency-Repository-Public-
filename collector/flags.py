"""Constitutional "arguable issue" flags, rated on two scales.

This is an automated screen based on the wording of official documents. A flag
means "a lawyer may want to look at this", never "this is unconstitutional".

Each flag is rated on two independent scales, each with three levels:

  Clarity (how flagrant)    3 Flagrant    the action fits a pattern the Supreme Court has squarely held unlawful
                            2 Substantial strong argument under existing Supreme Court or appellate precedent
                            1 Arguable    an open question that deserves a lawyer's review
  Seriousness (impact)      3 Severe      penalties, bars or loss of livelihood or property; economy-wide or presidential action
                            2 Significant binding obligations on regulated parties or a whole industry
                            1 Moderate    narrower, procedural or preliminary effects

The kind of issue (jury trial, appointments, nondelegation, speech...) is kept as
a sub-category. Every rule lists the words that trigger it and the conditions
that move its ratings, so every flag can explain itself.
"""
import re

from .classify import text_of

CLARITY = {3: "Flagrant", 2: "Substantial", 1: "Arguable"}
IMPACT = {3: "Severe", 2: "Significant", 1: "Moderate"}
SCALES = {
    "clarity": {
        "label": "Clarity", "question": "How clearly does existing law condemn this kind of action?",
        "levels": [
            {"value": 3, "name": "Flagrant", "color": "red",
             "meaning": "The action fits a pattern the Supreme Court has squarely held unlawful."},
            {"value": 2, "name": "Substantial", "color": "orange",
             "meaning": "A strong argument under existing Supreme Court or federal appellate precedent."},
            {"value": 1, "name": "Arguable", "color": "yellow",
             "meaning": "An open or developing question that deserves a lawyer's review. Not a lesser concern; a less settled one."},
        ]},
    "impact": {
        "label": "Seriousness", "question": "How much is at stake if the action is unlawful?",
        "levels": [
            {"value": 3, "name": "Severe", "color": "red",
             "meaning": "Penalties, bars, loss of livelihood or property, or economy-wide or presidential action."},
            {"value": 2, "name": "Significant", "color": "orange",
             "meaning": "Binding obligations on regulated parties or a whole industry."},
            {"value": 1, "name": "Moderate", "color": "yellow",
             "meaning": "Narrower, procedural or preliminary effects. Still a constitutional concern."},
        ]},
}


def _rx(*words):
    return re.compile(r"\b(?:" + "|".join(words) + r")", re.I)


def _cat(*cats):
    return lambda item: item.get("category") in cats


def _any(item):
    return True


_PENAL = _rx(r"civil (?:money )?penalt", r"penalt(?:y|ies) of", r"disgorg", r"\bbar(?:s|red)?\b", r"expel", r"debar",
             r"revoc", r"forfeit", r"suspen")
_BIG_MONEY = re.compile(r"\$\s?\d[\d,.]*\s?(?:million|billion)|\$\s?\d{1,3}(?:,\d{3}){2,}", re.I)


def _adj_adjudication(item, text):
    c, i, why = 2, 3, []
    if not _PENAL.search(text):
        i, why = 2, why + ["no penalty wording found (seriousness lowered)"]
    settled = re.search(r"settle|consent|offer of settlement", text, re.I)
    contested_penalty = re.search(r"civil (?:money )?penalt|penalt(?:y|ies) of", text, re.I)
    if "sec" in item.get("agencies", []) and contested_penalty and re.search(r"fraud|10b-5|antifraud|misrepresent", text, re.I):
        c, why = 3, why + ["SEC in-house civil penalties for fraud: the pattern held unconstitutional in SEC v. Jarkesy (clarity raised)"]
    elif item.get("source") == "sec_admin" and not contested_penalty:
        why.append("the SEC feed gives only the respondent's name; open the order to see whether penalties were sought")
    if settled:
        c, why = 1, why + ["described as settled or consented, so the jury right may have been waived (clarity lowered)"]
    if "fcc" in item.get("agencies", []) and re.search(r"forfeiture|apparent liability", text, re.I):
        c, why = 1, why + ["FCC forfeiture orders: FCC v. AT&T (2026) held they do not violate the Seventh Amendment (clarity lowered)"]
    if item.get("doc_subtype_hint") == "cmp_complaint":
        why.append("civil money penalty decided by an HHS administrative law judge")
    if re.search(r"cease[- ]and[- ]desist", text, re.I) and not re.search(r"penalt|disgorg", text, re.I):
        c, why = min(c, 1), why + ["cease-and-desist only, no money penalty found (clarity lowered)"]
    return c, i, why


def _adj_private_delegation(item, text):
    if item.get("corporation") == "other_sro":
        return 1, 1, ["routine exchange or clearing-agency filing (seriousness lowered)"]
    return 1, 2, []


def _adj_major(item, text):
    if item.get("significant") or re.search(r"economically significant|major rule", text, re.I):
        return 1, 3, ["designated a significant or major rule (seriousness raised)"]
    return 1, 2, []


def _adj_deference(item, text):
    if re.search(r"chevron|defer(?:ence)? to (?:the |our |agency)", text, re.I):
        return 2, 2, ["relies on deference to the agency's own reading of a statute, which Loper Bright rejected (clarity raised)"]
    return 1, 2, []


def _adj_spending(item, text):
    if re.search(r"impound|rescission|deferral of budget authority|withh(?:o|e)ld", text, re.I):
        return 2, 3, ["withholding or rescinding appropriated money (Impoundment Control Act and Appropriations Clause)"]
    return 1, 2, []


def _adj_structure(item, text):
    if re.search(r"abolish|dismantl|eliminat(?:e|ion of) (?:the |an )?(?:agency|department|bureau)", text, re.I):
        return 2, 3, ["abolishing or dismantling a body created by statute (clarity and seriousness raised)"]
    return 1, 2, []


def _adj_federalism(item, text):
    if re.search(r"commandeer|direct(?:s|ing)? (?:state|local) officials", text, re.I):
        return 2, 2, ["directing state officials (anti-commandeering rule)"]
    return 1, 2, []


def _adj_presidential(item, text):
    if re.search(r"tariff|dut(?:y|ies) on imports", text, re.I) and re.search(r"emergency economic powers|IEEPA|50 U\.S\.C\.? 17", text, re.I):
        return 3, 3, ["tariffs under the International Emergency Economic Powers Act, which Learning Resources v. Trump (2026) held does not authorize tariffs"]
    if re.search(r"tariff", text, re.I):
        return 1, 3, ["tariffs under another statute (check the cited authority)"]
    return 1, 3, []


def _adj_speech(item, text):
    if re.search(r"prior restraint|gag order", text, re.I):
        return 2, 2, ["prior restraint on speech (heavily disfavored)"]
    return 1, 2, []


def _adj_fourth(item, text):
    if re.search(r"warrantless", text, re.I):
        return 2, 2, ["warrantless search or inspection (clarity raised)"]
    return 1, 2, []


def _adj_due_process(item, text):
    c, i, why = 1, 2, []
    if re.search(r"without (?:prior )?(?:notice|hearing)|ex parte|summary (?:suspension|action)|immediately effective", text, re.I):
        c, why = 2, why + ["action without prior notice or hearing (clarity raised)"]
    if re.search(r"forfeit|seiz|revoc|revok|taking", text, re.I):
        i, why = 3, why + ["loss of property or a license (seriousness raised)"]
    return c, i, why


def _adj_equal(item, text):
    if re.search(r"race[- ]conscious|racial preference|race[- ]based|racial set[- ]aside", text, re.I):
        return 3, 2, ["express racial classification, the pattern rejected in SFFA v. Harvard (clarity raised)"]
    return 1, 2, []


def _adj_fines(item, text):
    if re.search(r"billion", text, re.I):
        return 1, 3, ["penalty in the billions (seriousness raised)"]
    return 1, 2, []


def _fixed(c, i):
    return lambda item, text: (c, i, [])


RULES = [
    # ---------------------------- STRUCTURAL ----------------------------
    {
        "code": "agency_adjudication", "group": "structural",
        "label": "Agency adjudication of penalties (jury trial / Article III)",
        "when": _cat("adjudication", "enforcement"),
        "pattern": _rx(r"order instituting", r"civil (?:money )?penalt", r"cease[- ]and[- ]desist",
                       r"disgorgement", r"penalt(?:y|ies) of", r"sanctions? (?:against|on)", r"debar",
                       r"(?:expel|bar) (?:or (?:bar|expel) )?members", r"notice of apparent liability", r"forfeiture order"),
        "adjust": _adj_adjudication, "default": (2, 3),
        "why": "The agency itself appears to be deciding a case that could carry penalties. Penalty cases "
               "resembling common-law suits may require a jury and an Article III court, and agency "
               "proceedings can combine prosecutor and judge in one body.",
        "authorities": ["SEC v. Jarkesy, 603 U.S. 109 (2024)", "Axon Enterprise, Inc. v. FTC, 598 U.S. 175 (2023)",
                        "FCC v. AT&T, Inc. (U.S. June 4, 2026) (FCC forfeiture orders upheld)",
                        "Granfinanciera, S.A. v. Nordberg, 492 U.S. 33 (1989)"],
        "raises": "Clarity rises to Flagrant for SEC in-house civil penalties for fraud (Jarkesy).",
        "lowers": "Clarity falls to Arguable for settled or consented matters, FCC forfeiture orders (FCC v. AT&T) "
                  "and cease-and-desist orders without money penalties; seriousness falls when no penalty wording is found.",
    },
    {
        "code": "officer_appointment_removal", "group": "structural",
        "label": "Appointment of officers (ALJs, hearing officers, board members)",
        "when": _any,
        "pattern": _rx(r"administrative law judge", r"hearing officer", r"administrative patent judge",
                       r"inferior officer", r"appointments clause", r"removal (?:protection|power|of (?:a |the )?(?:member|commissioner|director|judge))",
                       r"for[- ]cause", r"removed from office"),
        "adjust": _fixed(2, 2),
        "why": "Officers who exercise significant federal power must be appointed in a manner the Appointments "
               "Clause allows, and their decisions must be reviewable by a principal officer.",
        "authorities": ["Lucia v. SEC, 585 U.S. 237 (2018)", "United States v. Arthrex, Inc., 594 U.S. 1 (2021)",
                        "Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)"],
    },
    {
        "code": "private_delegation", "group": "structural",
        "label": "Government power exercised by a private corporation",
        "when": lambda item: bool(item.get("corporation")),
        "pattern": re.compile(r"."),
        "adjust": _adj_private_delegation,
        "why": "This action comes from a private, agency-supervised corporation. Delegating government power to "
               "private entities is limited by the private nondelegation doctrine and by Article II.",
        "authorities": ["Carter v. Carter Coal Co., 298 U.S. 238 (1936)",
                        "Department of Transportation v. Association of American Railroads, 575 U.S. 43 (2015)",
                        "Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)"],
        "lowers": "Seriousness falls to Moderate for routine exchange and clearing-agency filings.",
    },
    {
        "code": "private_discipline", "group": "structural",
        "label": "Private corporation disciplining or expelling a member",
        "when": lambda item: bool(item.get("corporation")),
        "pattern": _rx(r"disciplin", r"expel", r"expulsion", r"\bbar\b", r"suspend", r"sanction", r"\bfine"),
        "adjust": _fixed(2, 3),
        "why": "A private, agency-supervised corporation appears to be imposing discipline. The D.C. Circuit has "
               "held that such a body may not expel a member without government review first.",
        "authorities": ["Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)"],
    },
    {
        "code": "major_questions", "group": "structural",
        "label": "Delegation and major questions",
        "when": lambda item: item.get("category") == "rulemaking" and item.get("subcategory") in ("Final rule", "Proposed rule"),
        "pattern": None,
        "extra": _rx(r"economically significant", r"major rule", r"nationwide", r"industry[- ]wide",
                     r"unprecedented", r"first[- ]ever", r"transform"),
        "adjust": _adj_major,
        "why": "Large or novel rules may exceed what Congress clearly authorized (major questions doctrine) or "
               "raise questions about how much lawmaking power Congress may hand to agencies (nondelegation).",
        "authorities": ["West Virginia v. EPA, 597 U.S. 697 (2022)", "Biden v. Nebraska, 600 U.S. 477 (2023)",
                        "FCC v. Consumers' Research, 606 U.S. ___ (2025)"],
        "raises": "Seriousness rises to Severe for rules designated significant or major.",
    },
    {
        "code": "statutory_deference", "group": "structural",
        "label": "Agency interpretation of an ambiguous statute",
        "when": lambda item: item.get("category") in ("rulemaking", "adjudication"),
        "pattern": _rx(r"chevron", r"deference", r"ambiguous", r"reasonable interpretation", r"gap[- ]fill",
                       r"interpretive rule", r"interpretation of (?:section|the act|the statute)"),
        "adjust": _adj_deference,
        "why": "Courts no longer defer to an agency's reading of an ambiguous statute; reliance on agency "
               "interpretation is a point to check.",
        "authorities": ["Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024)"],
        "raises": "Clarity rises to Substantial when the document itself invokes Chevron-style deference.",
    },
    {
        "code": "removal_independence", "group": "structural",
        "label": "Presidential control and removal of agency leaders",
        "when": _any,
        "pattern": _rx(r"independent (?:regulatory )?agenc", r"humphrey", r"multi-member", r"commissioners? (?:was|were) removed",
                       r"supervision (?:and|&) control", r"accountability for all agencies", r"OIRA review of independent",
                       r"federal reserve", r"removal of (?:a |the )?(?:governor|commissioner|member)"),
        "adjust": _fixed(1, 2),
        "why": "In Trump v. Slaughter (2026) the Supreme Court overruled Humphrey's Executor and held that the "
               "President may remove FTC commissioners at will. Open questions remain about bodies the Court "
               "has treated differently, such as the Federal Reserve (Trump v. Cook, 2026), and about how far "
               "presidential direction of agency decisions may go.",
        "authorities": ["Trump v. Slaughter (U.S. June 29, 2026)", "Trump v. Cook (U.S. June 29, 2026)",
                        "Seila Law LLC v. CFPB, 591 U.S. 197 (2020)", "Collins v. Yellen, 594 U.S. 220 (2021)"],
    },
    {
        "code": "spending_appropriations", "group": "structural",
        "label": "Spending, funding and appropriations",
        "when": _any,
        "pattern": _rx(r"impound", r"rescission", r"deferral of budget authority", r"pause (?:of |all |on )?(?:federal )?(?:funding|grants|disbursements)",
                       r"freez(?:e|ing) (?:of )?(?:federal )?(?:funding|grants)", r"terminat(?:e|ion of) (?:all )?(?:grants|funding)",
                       r"appropriations clause", r"user fees?", r"funding mechanism", r"withh(?:o|e)ld\w* (?:federal )?funds"),
        "adjust": _adj_spending,
        "why": "Congress holds the power of the purse. Withholding, redirecting or self-funding money can raise "
               "Appropriations Clause and separation-of-powers questions.",
        "authorities": ["Train v. City of New York, 420 U.S. 35 (1975)",
                        "CFPB v. Community Financial Services Ass'n, 601 U.S. 416 (2024)",
                        "Impoundment Control Act of 1974, 2 U.S.C. 681 et seq."],
        "raises": "Clarity and seriousness rise when appropriated money is withheld or rescinded.",
    },
    {
        "code": "agency_structure_change", "group": "structural",
        "label": "Creating, abolishing or restructuring agencies and offices",
        "when": lambda item: item.get("category") in ("presidential", "rulemaking", "other"),
        "pattern": _rx(r"reorganiz", r"abolish", r"eliminat(?:e|ion of) (?:the |an )?(?:office|agency|bureau|department)",
                       r"reduction[- ]in[- ]force", r"establish(?:ing|ment of)? (?:the |a )?(?:office|council|task force|department)",
                       r"transfer of functions", r"dismantl"),
        "adjust": _adj_structure,
        "why": "Agencies and offices are created by statute; executive changes to their structure or functions "
               "may raise separation-of-powers questions.",
        "authorities": ["Myers v. United States, 272 U.S. 52 (1926)", "Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)"],
        "raises": "Clarity and seriousness rise when a statutory body is abolished or dismantled.",
    },
    {
        "code": "federalism", "group": "structural",
        "label": "Federalism (states, preemption, conditions on federal funds)",
        "when": _any,
        "pattern": _rx(r"preempt", r"commandeer", r"state plan", r"conditions? (?:on|of) (?:federal )?(?:funds|grants|funding)",
                       r"sanctuary", r"tenth amendment", r"sovereign immunity"),
        "adjust": _adj_federalism,
        "why": "Federal action that directs states, overrides state law, or attaches conditions to federal money "
               "can raise Tenth Amendment and Spending Clause questions.",
        "authorities": ["Murphy v. NCAA, 584 U.S. 453 (2018)", "NFIB v. Sebelius, 567 U.S. 519 (2012)",
                        "Printz v. United States, 521 U.S. 898 (1997)"],
        "raises": "Clarity rises when state officials are directed to act (anti-commandeering).",
    },
    {
        "code": "presidential_lawmaking", "group": "structural",
        "label": "Executive action that may act like legislation",
        "when": _cat("presidential"),
        "pattern": _rx(r"shall be (?:prohibited|unlawful)", r"tariff", r"national emergency", r"emergency economic powers",
                       r"suspend(?:ing|s)? (?:the )?(?:entry|enforcement|implementation)", r"notwithstanding",
                       r"waive(?:r|s|d)? (?:of )?(?:the )?(?:requirements|statute)"),
        "adjust": _adj_presidential,
        "why": "Presidential orders must rest on the Constitution or a statute. Orders that impose duties, "
               "tariffs or suspend laws invite scrutiny of their legal basis.",
        "authorities": ["Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)",
                        "Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026)"],
        "raises": "Clarity rises to Flagrant for tariffs imposed under the International Emergency Economic Powers Act.",
    },
    # ---------------------------- RIGHTS --------------------------------
    {
        "code": "speech_restraint", "group": "rights",
        "label": "Gag orders, no-deny terms and prior restraints on speech",
        "when": _cat("enforcement", "adjudication", "rulemaking"),
        "pattern": _rx(r"\bgag", r"neither admit(?:s|ting)? nor den", r"no[- ]deny", r"not to (?:publicly )?deny",
                       r"prior restraint", r"non-?disparagement", r"confidentiality (?:provision|requirement|order)",
                       r"nondisclosure (?:order|requirement)"),
        "adjust": _adj_speech,
        "why": "Conditions that stop people from denying charges or discussing their case restrict speech. The SEC "
               "rescinded its no-deny rule in May 2026, but similar terms can appear in other agencies' settlements "
               "and orders.",
        "authorities": ["Powell v. SEC, 149 F.4th 1029 (9th Cir. 2025)", "SEC v. Romeril, 15 F.4th 166 (2d Cir. 2021)",
                        "Nebraska Press Ass'n v. Stuart, 427 U.S. 539 (1976)"],
        "raises": "Clarity rises when the document describes a gag order or prior restraint.",
    },
    {
        "code": "first_amendment", "group": "rights",
        "label": "Speech, press, religion or association",
        "when": _any,
        "pattern": _rx(r"speech", r"advertis", r"compelled disclosure", r"labeling requirement", r"misinformation",
                       r"content moderation", r"religio", r"press\b", r"journalis", r"political (?:activity|contribution)"),
        "adjust": _fixed(1, 2),
        "why": "Rules about what people say, must disclose, publish or believe can raise First Amendment issues.",
        "authorities": ["Central Hudson Gas & Electric v. PSC, 447 U.S. 557 (1980)",
                        "Zauderer v. Office of Disciplinary Counsel, 471 U.S. 626 (1985)",
                        "NRA v. Vullo, 602 U.S. 175 (2024)"],
    },
    {
        "code": "fourth_amendment", "group": "rights",
        "label": "Searches, inspections, records demands or surveillance",
        "when": _any,
        "pattern": _rx(r"warrantless", r"inspection", r"administrative subpoena", r"civil investigative demand", r"surveillance",
                       r"monitoring of", r"records? (?:access|demand)", r"geolocation", r"biometric"),
        "adjust": _adj_fourth,
        "why": "Government inspections and demands for records or data can raise Fourth Amendment questions.",
        "authorities": ["City of Los Angeles v. Patel, 576 U.S. 409 (2015)", "Carpenter v. United States, 585 U.S. 296 (2018)"],
        "raises": "Clarity rises for warrantless searches.",
    },
    {
        "code": "due_process_takings", "group": "rights",
        "label": "Property, takings or due process",
        "when": _any,
        "pattern": _rx(r"forfeit", r"taking(?:s)? of", r"without (?:prior )?(?:notice|hearing)", r"interim final rule",
                       r"retroactiv", r"revoc", r"access easement", r"seiz", r"ex parte", r"summary suspension"),
        "adjust": _adj_due_process,
        "why": "Taking property, revoking licenses or acting without notice and a hearing can raise Fifth "
               "Amendment due process or takings questions.",
        "authorities": ["Cedar Point Nursery v. Hassid, 594 U.S. 139 (2021)", "Mathews v. Eldridge, 424 U.S. 319 (1976)",
                        "Culley v. Marshall, 601 U.S. 377 (2024)"],
        "raises": "Clarity rises for action without notice or hearing; seriousness rises for loss of property or a license.",
    },
    {
        "code": "excessive_fines", "group": "rights",
        "label": "Excessive fines and forfeitures",
        "when": _cat("enforcement", "adjudication"),
        "pattern": None,
        "adjust": _adj_fines,
        "why": "Very large penalties and forfeitures can be tested against the Eighth Amendment's Excessive Fines "
               "Clause, which asks whether a sanction is grossly disproportional to the offense.",
        "authorities": ["Timbs v. Indiana, 586 U.S. 146 (2019)", "United States v. Bajakajian, 524 U.S. 321 (1998)"],
        "raises": "Triggered by penalties of a million dollars or more; seriousness rises for penalties in the billions.",
    },
    {
        "code": "equal_protection", "group": "rights",
        "label": "Classifications by race, sex or other protected traits",
        "when": _any,
        "pattern": _rx(r"race[- ]conscious", r"racial preference", r"set[- ]aside", r"disadvantaged business",
                       r"diversity, equity", r"\bDEI\b", r"sex[- ]based", r"race[- ]based"),
        "adjust": _adj_equal,
        "why": "Government classifications by race or sex receive heightened scrutiny.",
        "authorities": ["Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023)"],
        "raises": "Clarity rises to Flagrant for express racial classifications or set-asides.",
    },
]

GROUP_LABELS = {"structural": "Structural (separation of powers, federalism)", "rights": "Individual rights"}


def _triggers(rule, item, text):
    code = rule["code"]
    if code == "major_questions":
        t = ["designated a significant rule"] if item.get("significant") else []
        return t + sorted({m.group(0).lower() for m in rule["extra"].finditer(text)})
    if code == "private_delegation":
        return ["issued by an agency-supervised private corporation"]
    if code == "excessive_fines":
        if not re.search(r"penalt|fine|forfeit|disgorg|judgment", text, re.I):
            return []
        return sorted({m.group(0) for m in _BIG_MONEY.finditer(text)})
    return sorted({m.group(0).lower() for m in rule["pattern"].finditer(text)})


def flag_item(item):
    text = text_of(item)
    flags = []
    for rule in RULES:
        if not rule["when"](item):
            continue
        triggers = _triggers(rule, item, text)
        if not triggers and rule["code"] == "agency_adjudication" and item.get("doc_subtype_hint") == "cmp_complaint":
            triggers = ["civil money penalty complaint"]
        if not triggers:
            continue
        clarity, impact, notes = rule["adjust"](item, text)
        flags.append({
            "code": rule["code"], "label": rule["label"], "group": rule["group"],
            "structural": rule["group"] == "structural",
            "clarity": clarity, "impact": impact, "rating_notes": notes,
            "triggers": triggers[:6], "why": rule["why"], "authorities": rule["authorities"],
        })
    # Feed-based SEC in-house proceedings are always flagged for the jury-trial question.
    if item.get("source") == "sec_admin" and not any(f["code"] == "agency_adjudication" for f in flags):
        rule = RULES[0]
        clarity, impact, notes = rule["adjust"](item, text)
        flags.insert(0, {"code": rule["code"], "label": rule["label"], "group": "structural", "structural": True,
                         "clarity": clarity, "impact": impact, "rating_notes": notes,
                         "triggers": ["SEC in-house administrative proceeding"], "why": rule["why"],
                         "authorities": rule["authorities"]})
    flags.sort(key=lambda f: (-f["clarity"], -f["impact"], f["group"] != "structural"))
    item["flags"] = flags
    if flags:
        c = max(f["clarity"] for f in flags)
        i = max(f["impact"] for f in flags)
        item["severity"] = {"clarity": c, "impact": i, "score": max(f["clarity"] * f["impact"] for f in flags)}
    else:
        item["severity"] = None
    # Kept for older links and exports: 3 = red, 2 = orange, 1 = yellow (by the worse of the two scales).
    item["priority"] = max((max(f["clarity"], f["impact"]) for f in flags), default=0)
    item.pop("doc_subtype_hint", None)
    return item


def export():
    """JSON-safe list of every kind of issue and how it is rated, for the app's manual."""
    out = []
    for r in RULES:
        # default ratings, computed on an empty item
        c, i = r.get("default") or r["adjust"]({"agencies": []}, "")[:2]
        out.append({"code": r["code"], "label": r["label"], "group": r["group"], "default_clarity": c,
                    "default_impact": i, "why": r["why"], "authorities": r["authorities"],
                    "raises": r.get("raises", ""), "lowers": r.get("lowers", "")})
    return {"scales": SCALES, "groups": GROUP_LABELS, "kinds": out}
