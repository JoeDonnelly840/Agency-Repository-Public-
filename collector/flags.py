"""Constitutional "arguable issue" flags.

This is an automated screen based on the wording of official documents. A flag
means "a lawyer may want to look at this", never "this is unconstitutional".
Structural issues (separation of powers, appointments, removal, delegation,
agency adjudication, federalism, spending) are ranked above substantive-rights
issues, as requested.

Each rule lists the words that trigger it, so every flag can explain itself.
"""
import re

from .classify import text_of

PRIORITY_RANK = {"high": 3, "medium": 2, "low": 1}


def _rx(*words):
    return re.compile(r"\b(?:" + "|".join(words) + r")", re.I)


def _cat(*cats):
    return lambda item: item.get("category") in cats


def _any(item):
    return True


RULES = [
    # ---------------------------- STRUCTURAL ----------------------------
    {
        "code": "agency_adjudication",
        "label": "Agency adjudication of penalties (jury trial / Article III)",
        "structural": True, "priority": "high",
        "when": _cat("adjudication", "enforcement"),
        # Penalty-type words are required; a mere mention of an ALJ (e.g. presiding over a
        # rulemaking hearing) is handled by the appointments flag instead.
        "pattern": _rx(r"order instituting", r"civil (?:money )?penalt", r"cease[- ]and[- ]desist",
                       r"disgorgement", r"penalt(?:y|ies) of", r"sanctions? (?:against|on)", r"debar",
                       r"(?:expel|bar) (?:or (?:bar|expel) )?members"),
        "why": "The agency itself appears to be deciding a case that could carry penalties. Penalty cases "
               "resembling common-law suits may require a jury and an Article III court, and agency "
               "proceedings can combine prosecutor and judge in one body.",
        "authorities": ["SEC v. Jarkesy, 603 U.S. 109 (2024)", "Axon Enterprise, Inc. v. FTC, 598 U.S. 175 (2023)",
                        "Granfinanciera, S.A. v. Nordberg, 492 U.S. 33 (1989)"],
    },
    {
        "code": "officer_appointment_removal",
        "label": "Appointment or removal of officers (ALJs, hearing officers, board members)",
        "structural": True, "priority": "high",
        "when": _any,
        "pattern": _rx(r"administrative law judge", r"hearing officer", r"administrative patent judge",
                       r"inferior officer", r"appointments clause", r"removal (?:protection|power|of (?:a |the )?(?:member|commissioner|director|judge))",
                       r"for[- ]cause", r"removed from office"),
        "why": "Officers who exercise significant federal power must be appointed in a manner the Appointments "
               "Clause allows, and limits on the President's power to remove them raise Article II questions.",
        "authorities": ["Lucia v. SEC, 585 U.S. 237 (2018)", "United States v. Arthrex, Inc., 594 U.S. 1 (2021)",
                        "Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)", "Seila Law LLC v. CFPB, 591 U.S. 197 (2020)"],
    },
    {
        "code": "private_delegation",
        "label": "Government power exercised by a private corporation",
        "structural": True, "priority": "medium",
        "when": lambda item: bool(item.get("corporation")),
        "pattern": re.compile(r"."),
        "why": "This action comes from a private, agency-supervised corporation. Delegating government power to "
               "private entities is limited by the private nondelegation doctrine and by Article II.",
        "authorities": ["Carter v. Carter Coal Co., 298 U.S. 238 (1936)",
                        "Department of Transportation v. Association of American Railroads, 575 U.S. 43 (2015)",
                        "Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)"],
    },
    {
        "code": "private_discipline",
        "label": "Private corporation disciplining or expelling a member",
        "structural": True, "priority": "high",
        "when": lambda item: bool(item.get("corporation")),
        "pattern": _rx(r"disciplin", r"expel", r"expulsion", r"\bbar\b", r"suspend", r"sanction", r"fine"),
        "why": "A private, agency-supervised corporation appears to be imposing discipline. Courts have questioned "
               "whether such bodies may expel or punish without government review first.",
        "authorities": ["Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)"],
    },
    {
        "code": "major_questions",
        "label": "Significant rule - check delegation / major-questions limits",
        "structural": True, "priority": "medium",
        "when": lambda item: item.get("category") == "rulemaking" and item.get("subcategory") in ("Final rule", "Proposed rule"),
        "pattern": None,  # triggered by the "significant" designation or the words below
        "extra": _rx(r"economically significant", r"major rule", r"nationwide", r"industry[- ]wide",
                     r"unprecedented", r"first[- ]ever", r"transform"),
        "why": "Large or novel rules may exceed what Congress clearly authorized (major questions doctrine) or "
               "raise questions about how much lawmaking power Congress may hand to agencies (nondelegation).",
        "authorities": ["West Virginia v. EPA, 597 U.S. 697 (2022)", "Biden v. Nebraska, 600 U.S. 477 (2023)",
                        "FCC v. Consumers' Research, 606 U.S. ___ (2025)"],
    },
    {
        "code": "statutory_deference",
        "label": "Agency interpretation of an ambiguous statute",
        "structural": True, "priority": "medium",
        "when": lambda item: item.get("category") in ("rulemaking", "adjudication"),
        "pattern": _rx(r"chevron", r"deference", r"ambiguous", r"reasonable interpretation", r"gap[- ]fill",
                       r"interpretive rule", r"interpretation of (?:section|the act|the statute)"),
        "why": "Courts no longer defer to an agency's reading of an ambiguous statute; reliance on agency "
               "interpretation is a point to check.",
        "authorities": ["Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024)"],
    },
    {
        "code": "removal_independence",
        "label": "Presidential control of independent agencies",
        "structural": True, "priority": "medium",
        "when": _any,
        "pattern": _rx(r"independent (?:regulatory )?agenc", r"humphrey", r"multi-member", r"commissioners? (?:was|were) removed",
                       r"supervision (?:and|&) control", r"accountability for all agencies", r"OIRA review of independent"),
        "why": "Questions about how far the President may direct or remove the leaders of independent agencies "
               "are central separation-of-powers issues. Check the current status of Trump v. Slaughter.",
        "authorities": ["Humphrey's Executor v. United States, 295 U.S. 602 (1935)",
                        "Seila Law LLC v. CFPB, 591 U.S. 197 (2020)", "Collins v. Yellen, 594 U.S. 220 (2021)"],
    },
    {
        "code": "spending_appropriations",
        "label": "Spending, funding or appropriations",
        "structural": True, "priority": "medium",
        "when": _any,
        "pattern": _rx(r"impound", r"rescission", r"deferral of budget authority", r"pause (?:of |all |on )?(?:federal )?(?:funding|grants|disbursements)",
                       r"freez(?:e|ing) (?:of )?(?:federal )?(?:funding|grants)", r"terminat(?:e|ion of) (?:all )?(?:grants|funding)",
                       r"appropriations clause", r"user fees?", r"funding mechanism"),
        "why": "Congress holds the power of the purse. Withholding, redirecting or self-funding money can raise "
               "Appropriations Clause and separation-of-powers questions.",
        "authorities": ["Train v. City of New York, 420 U.S. 35 (1975)",
                        "CFPB v. Community Financial Services Ass'n, 601 U.S. 416 (2024)"],
    },
    {
        "code": "agency_structure_change",
        "label": "Creating, abolishing or restructuring agencies or offices",
        "structural": True, "priority": "medium",
        "when": lambda item: item.get("category") in ("presidential", "rulemaking", "other"),
        "pattern": _rx(r"reorganiz", r"abolish", r"eliminat(?:e|ion of) (?:the |an )?(?:office|agency|bureau|department)",
                       r"reduction[- ]in[- ]force", r"establish(?:ing|ment of)? (?:the |a )?(?:office|council|task force|department)",
                       r"transfer of functions", r"dismantl"),
        "why": "Agencies and offices are created by statute; executive changes to their structure or functions "
               "may raise separation-of-powers questions.",
        "authorities": ["Myers v. United States, 272 U.S. 52 (1926)", "Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)"],
    },
    {
        "code": "federalism",
        "label": "Federalism (states, preemption, conditions on federal funds)",
        "structural": True, "priority": "medium",
        "when": _any,
        "pattern": _rx(r"preempt", r"commandeer", r"state plan", r"conditions? (?:on|of) (?:federal )?(?:funds|grants|funding)",
                       r"sanctuary", r"tenth amendment", r"sovereign immunity"),
        "why": "Federal action that directs states, overrides state law, or attaches conditions to federal money "
               "can raise Tenth Amendment and Spending Clause questions.",
        "authorities": ["Murphy v. NCAA, 584 U.S. 453 (2018)", "NFIB v. Sebelius, 567 U.S. 519 (2012)",
                        "Printz v. United States, 521 U.S. 898 (1997)"],
    },
    {
        "code": "presidential_lawmaking",
        "label": "Executive action that may act like legislation",
        "structural": True, "priority": "medium",
        "when": _cat("presidential"),
        "pattern": _rx(r"shall be (?:prohibited|unlawful)", r"tariff", r"national emergency", r"emergency economic powers",
                       r"suspend(?:ing|s)? (?:the )?(?:entry|enforcement|implementation)", r"notwithstanding",
                       r"waive(?:r|s|d)? (?:of )?(?:the )?(?:requirements|statute)"),
        "why": "Presidential orders must rest on the Constitution or a statute. Orders that impose duties, "
               "tariffs or suspend laws invite scrutiny of their legal basis.",
        "authorities": ["Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)"],
    },
    # ---------------------------- SUBSTANTIVE ---------------------------
    {
        "code": "first_amendment",
        "label": "Speech, press, religion or association",
        "structural": False, "priority": "low",
        "when": _any,
        "pattern": _rx(r"speech", r"advertis", r"compelled disclosure", r"labeling requirement", r"misinformation",
                       r"content moderation", r"religio", r"press\b", r"journalis", r"political (?:activity|contribution)"),
        "why": "Rules about what people say, must disclose, publish or believe can raise First Amendment issues.",
        "authorities": ["Central Hudson Gas & Electric v. PSC, 447 U.S. 557 (1980)",
                        "Zauderer v. Office of Disciplinary Counsel, 471 U.S. 626 (1985)"],
    },
    {
        "code": "fourth_amendment",
        "label": "Searches, inspections, records demands or surveillance",
        "structural": False, "priority": "low",
        "when": _any,
        "pattern": _rx(r"warrantless", r"inspection", r"administrative subpoena", r"surveillance",
                       r"monitoring of", r"records? (?:access|demand)", r"geolocation", r"biometric"),
        "why": "Government inspections and demands for records or data can raise Fourth Amendment questions.",
        "authorities": ["City of Los Angeles v. Patel, 576 U.S. 409 (2015)", "Carpenter v. United States, 585 U.S. 296 (2018)"],
    },
    {
        "code": "due_process_takings",
        "label": "Property, takings or due process",
        "structural": False, "priority": "low",
        "when": _any,
        "pattern": _rx(r"forfeit", r"taking(?:s)? of", r"without (?:prior )?(?:notice|hearing)", r"interim final rule",
                       r"retroactiv", r"revoc", r"access easement", r"seiz"),
        "why": "Taking property, revoking licenses or acting without notice and a hearing can raise Fifth "
               "Amendment due process or takings questions.",
        "authorities": ["Cedar Point Nursery v. Hassid, 594 U.S. 139 (2021)", "Mathews v. Eldridge, 424 U.S. 319 (1976)"],
    },
    {
        "code": "equal_protection",
        "label": "Classifications by race, sex or other protected traits",
        "structural": False, "priority": "low",
        "when": _any,
        "pattern": _rx(r"race[- ]conscious", r"racial preference", r"set[- ]aside", r"disadvantaged business",
                       r"diversity, equity", r"\bDEI\b", r"sex[- ]based"),
        "why": "Government classifications by race or sex receive heightened scrutiny.",
        "authorities": ["Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023)"],
    },
]


def flag_item(item):
    text = text_of(item)
    flags = []
    for rule in RULES:
        if not rule["when"](item):
            continue
        triggers = []
        if rule["code"] == "major_questions":
            if item.get("significant"):
                triggers.append("designated a significant rule")
            triggers += sorted({m.group(0).lower() for m in rule["extra"].finditer(text)})
        elif rule["code"] == "private_delegation":
            triggers.append("issued by an agency-supervised private corporation")
        else:
            triggers = sorted({m.group(0).lower() for m in rule["pattern"].finditer(text)})
        if not triggers:
            continue
        priority = rule["priority"]
        if rule["code"] == "private_delegation" and item.get("corporation") == "other_sro":
            priority = "low"  # hundreds of routine exchange filings; keep FINRA/PCAOB/MSRB above them
        flags.append({
            "code": rule["code"], "label": rule["label"], "structural": rule["structural"],
            "priority": priority, "triggers": triggers[:6], "why": rule["why"],
            "authorities": rule["authorities"],
        })
    # Feed-based SEC in-house proceedings are always flagged for the jury-trial question.
    if item.get("source") == "sec_admin" and not any(f["code"] == "agency_adjudication" for f in flags):
        rule = RULES[0]
        flags.insert(0, {"code": rule["code"], "label": rule["label"], "structural": True, "priority": "high",
                         "triggers": ["SEC in-house administrative proceeding"], "why": rule["why"],
                         "authorities": rule["authorities"]})
    flags.sort(key=lambda f: (-PRIORITY_RANK[f["priority"]], not f["structural"]))
    item["flags"] = flags
    item["priority"] = max((PRIORITY_RANK[f["priority"]] for f in flags), default=0)
    return item
