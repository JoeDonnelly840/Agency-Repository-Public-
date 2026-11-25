"""The RegCollect doctrine library and rating rubric.

Every kind of constitutional issue RegCollect screens for is described here as a
short legal memo: the question, the governing test broken into elements, the
controlling authorities (with decision dates), counter-indicators, and open
questions. Each element has a detector that looks for evidence in the
document's title, action line, and summary.

Ratings are computed from this library by a published rubric, never by a
keyword alone:

FLAGRANCE (how clearly existing law condemns this kind of action)
  Precedent tier, chosen by the first matching tier rule for the issue:
    3  The Supreme Court has held this specific practice unlawful.
    2  A Supreme Court holding applies by close analogy, or a federal court of
       appeals has held the same practice unlawful.
    1  The question is open, split, or was resolved the other way.
  Element coverage = core elements found / core elements in the test.
  Level:  Flagrant     tier 3 and every core element found
          Substantial  tier 3 with at least half the elements, or tier 2 with at
                       least half the elements
          Arguable     everything else
  A counter-indicator (for example, a settled case, or a contrary holding)
  caps the level at Arguable and is shown with the rating.
  Rated under the law today; when the controlling decision came after the
  action, the rating "at the time" is shown too.

SERIOUSNESS (how much is at stake), points from objective markers:
  Sanction       4 criminal, bars, expulsion, debarment, revocation, practice ban
                 3 civil penalty, forfeiture, disgorgement, seizure, asset freeze, funding cut
                 2 cease-and-desist, injunction, suspension, denial, shutdown, gag terms,
                   trading halt, data deletion, monitors, recall, import action
                 1 warning, censure, subpoena, inspection, compelled notice, restitution, settlement
  Money          3 at least $100 million; 2 at least $1 million; 1 any stated amount
  Reach          3 presidential document, or a rule designated economically significant or major
                 2 any other final or proposed rule
                 1 an action against particular parties, or a self-regulatory filing
  Level: Severe 6 or more points; Significant 3 to 5; Moderate 0 to 2.

STATUS: every memo below is a draft written for review. Each records who reviewed
it and when; until a reviewer signs off, the app labels it "Draft, not yet reviewed".
"""
import re

REVIEW_STATUS = {"status": "Draft, not yet reviewed", "reviewed_by": "", "last_reviewed": ""}


def _rx(*words):
    return re.compile(r"\b(?:" + "|".join(words) + r")", re.I)


def _has(rx):
    return lambda item, text: bool(rx.search(text))


def _src(*sources):
    return lambda item, text: item.get("source") in sources


def _any(*fns):
    return lambda item, text: any(f(item, text) for f in fns)


def _sanction(*keys):
    return lambda item, text: any(k in (item.get("sanctions") or []) for k in keys)


SETTLED = _rx(r"settle", r"consent(?:ed| order| decree| agreement)", r"offer of settlement", r"agreed to", r"stipulat")
FRAUD = _rx(r"fraud", r"misrepresent", r"mislead", r"deceptive", r"10b-5", r"antifraud", r"false statement")
PENALTY = _rx(r"civil (?:money |monetary )?penalt", r"penalt(?:y|ies) of", r"fine[sd]?\b", r"disgorg", r"forfeiture")
IN_HOUSE = _rx(r"administrative law judge", r"order instituting (?:cease-and-desist |administrative )?proceedings",
               r"administrative proceeding", r"in-house", r"hearing officer", r"initial decision")
PUBLIC_RIGHTS = _rx(r"tariff", r"customs dut", r"immigration", r"public lands", r"federal benefits", r"grant (?:award|program)",
                    r"\btax(?:es|ation)?\b")
MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)\s*(million|billion)?", re.I)


def money_in(text):
    best = 0.0
    for num, unit in MONEY.findall(text or ""):
        try:
            v = float(num.replace(",", ""))
        except ValueError:
            continue
        v *= {"million": 1e6, "billion": 1e9}.get((unit or "").lower(), 1)
        best = max(best, v)
    return best


# Authorities: key -> citation, decision date, and a one-sentence statement of what was held (paraphrase).
AUTHORITIES = {
    "jarkesy": {"cite": "SEC v. Jarkesy, 603 U.S. 109 (2024)", "decided": "2024-06-27",
                "held": "When the SEC seeks civil penalties for securities fraud, the Seventh Amendment entitles the defendant to a jury, and the public-rights exception does not apply."},
    "tull": {"cite": "Tull v. United States, 481 U.S. 412 (1987)", "decided": "1987-04-28",
             "held": "Civil penalties are a legal remedy, so the defendant is entitled to a jury on liability in a government penalty suit."},
    "granfinanciera": {"cite": "Granfinanciera, S.A. v. Nordberg, 492 U.S. 33 (1989)", "decided": "1989-06-23",
                       "held": "Congress may not strip a jury right from a claim resembling a common-law action by assigning it to a non-Article III forum."},
    "atlas_roofing": {"cite": "Atlas Roofing Co. v. OSHRC, 430 U.S. 442 (1977)", "decided": "1977-03-23",
                      "held": "Congress may assign new statutory 'public rights' (there, OSHA penalties) to agency adjudication without a jury; Jarkesy later confined this to claims without a common-law analogue."},
    "axon": {"cite": "Axon Enterprise, Inc. v. FTC, 598 U.S. 175 (2023)", "decided": "2023-04-14",
             "held": "Parties may bring structural constitutional challenges to agency proceedings in federal district court without waiting for the agency to finish."},
    "fcc_att": {"cite": "FCC v. AT&T, Inc., No. 25-406 (U.S. June 4, 2026)", "decided": "2026-06-04",
                "held": "FCC forfeiture orders do not violate the Seventh Amendment because they do not definitively resolve liability and the FCC's findings are not conclusive in a later collection suit."},
    "lucia": {"cite": "Lucia v. SEC, 585 U.S. 237 (2018)", "decided": "2018-06-21",
              "held": "SEC administrative law judges are officers of the United States and must be appointed as the Appointments Clause requires."},
    "arthrex": {"cite": "United States v. Arthrex, Inc., 594 U.S. 1 (2021)", "decided": "2021-06-21",
                "held": "Administrative judges may not issue final decisions that no principal officer can review."},
    "free_enterprise": {"cite": "Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)", "decided": "2010-06-28",
                        "held": "Two layers of for-cause protection between the President and officers of the PCAOB violate the separation of powers."},
    "carter_coal": {"cite": "Carter v. Carter Coal Co., 298 U.S. 238 (1936)", "decided": "1936-05-18",
                    "held": "Congress may not give private parties power to impose binding rules on their competitors."},
    "adkins": {"cite": "Sunshine Anthracite Coal Co. v. Adkins, 310 U.S. 381 (1940)", "decided": "1940-05-20",
               "held": "Private bodies may assist government if they function subordinately to an agency that has final authority."},
    "amtrak": {"cite": "Department of Transportation v. Association of American Railroads, 575 U.S. 43 (2015)", "decided": "2015-03-09",
               "held": "Amtrak is a governmental entity for these purposes; the Court left the private-delegation questions for remand."},
    "consumers_research": {"cite": "FCC v. Consumers' Research, 606 U.S. ___ (2025)", "decided": "2025-06-27",
                           "held": "The Universal Service Fund survives nondelegation challenge, and the FCC's reliance on a private administrator is lawful because the administrator is subordinate to the FCC."},
    "alpine": {"cite": "Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)", "decided": "2024-11-22",
               "held": "FINRA may not expel a member before the SEC has reviewed the expulsion (granting an injunction pending appeal)."},
    "west_virginia": {"cite": "West Virginia v. EPA, 597 U.S. 697 (2022)", "decided": "2022-06-30",
                      "held": "Agencies need clear congressional authorization to decide questions of vast economic and political significance."},
    "nebraska": {"cite": "Biden v. Nebraska, 600 U.S. 477 (2023)", "decided": "2023-06-30",
                 "held": "The student-loan forgiveness program exceeded the HEROES Act; the major questions doctrine reinforced that reading."},
    "nfib_osha": {"cite": "NFIB v. OSHA, 595 U.S. 109 (2022) (per curiam)", "decided": "2022-01-13",
                  "held": "OSHA's workplace vaccine-or-test mandate likely exceeded its statutory authority."},
    "loper_bright": {"cite": "Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024)", "decided": "2024-06-28",
                     "held": "Courts must exercise independent judgment on statutory meaning and may not defer to an agency's reading because a statute is ambiguous; Chevron is overruled."},
    "kisor": {"cite": "Kisor v. Wilkie, 588 U.S. 558 (2019)", "decided": "2019-06-26",
              "held": "Deference to an agency's reading of its own regulation survives only for genuinely ambiguous rules and within strict limits."},
    "slaughter": {"cite": "Trump v. Slaughter (U.S. June 29, 2026)", "decided": "2026-06-29",
                  "held": "Statutory limits on the President's power to remove FTC commissioners are unconstitutional; Humphrey's Executor is overruled."},
    "cook": {"cite": "Trump v. Cook (U.S. June 29, 2026)", "decided": "2026-06-29",
             "held": "Upheld an injunction against the attempted removal of a Federal Reserve governor, treating the Federal Reserve differently."},
    "seila": {"cite": "Seila Law LLC v. CFPB, 591 U.S. 197 (2020)", "decided": "2020-06-29",
              "held": "For-cause removal protection for the CFPB's single director is unconstitutional."},
    "train": {"cite": "Train v. City of New York, 420 U.S. 35 (1975)", "decided": "1975-02-18",
              "held": "The executive may not withhold funds Congress directed be allotted."},
    "cfsa": {"cite": "CFPB v. Community Financial Services Ass'n of America, 601 U.S. 416 (2024)", "decided": "2024-05-16",
             "held": "The CFPB's funding mechanism satisfies the Appropriations Clause."},
    "ica": {"cite": "Impoundment Control Act of 1974, 2 U.S.C. 681–688", "decided": "1974-07-12",
            "held": "Statute: the President may propose deferrals and rescissions but may not withhold appropriated funds without following the Act."},
    "myers": {"cite": "Myers v. United States, 272 U.S. 52 (1926)", "decided": "1926-10-25",
              "held": "The President has power to remove executive officers he appoints."},
    "youngstown": {"cite": "Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)", "decided": "1952-06-02",
                   "held": "The President may not make law without constitutional or statutory authority; Justice Jackson's three-category framework."},
    "printz": {"cite": "Printz v. United States, 521 U.S. 898 (1997)", "decided": "1997-06-27",
               "held": "The federal government may not command state officers to administer federal programs."},
    "murphy": {"cite": "Murphy v. NCAA, 584 U.S. 453 (2018)", "decided": "2018-05-14",
               "held": "Congress may not directly order state legislatures what laws to pass or not pass."},
    "nfib_sebelius": {"cite": "NFIB v. Sebelius, 567 U.S. 519 (2012)", "decided": "2012-06-28",
                      "held": "Conditions on federal funds become unconstitutionally coercive when they threaten existing funding the states depend on."},
    "dole": {"cite": "South Dakota v. Dole, 483 U.S. 203 (1987)", "decided": "1987-06-23",
             "held": "Congress may attach clear, related, non-coercive conditions to federal grants."},
    "learning_resources": {"cite": "Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026)", "decided": "2026-02-20",
                           "held": "The International Emergency Economic Powers Act does not authorize the President to impose tariffs."},
    "dames_moore": {"cite": "Dames & Moore v. Regan, 453 U.S. 654 (1981)", "decided": "1981-07-02",
                    "held": "Upheld presidential actions under IEEPA settling claims against Iran, in light of congressional acquiescence."},
    "powell": {"cite": "Powell v. SEC (9th Cir. Aug. 2025)", "decided": "2025-08-01",
               "held": "Upheld the SEC's no-deny settlement policy against a facial First Amendment challenge, while recognizing legitimate concerns; the SEC rescinded the policy in May 2026."},
    "romeril": {"cite": "SEC v. Romeril, 15 F.4th 166 (2d Cir. 2021)", "decided": "2021-09-29",
                "held": "Declined to relieve a defendant from a consent judgment's no-deny provision."},
    "nebraska_press": {"cite": "Nebraska Press Ass'n v. Stuart, 427 U.S. 539 (1976)", "decided": "1976-06-30",
                       "held": "Prior restraints on speech bear a heavy presumption against their validity."},
    "rumery": {"cite": "Town of Newton v. Rumery, 480 U.S. 386 (1987)", "decided": "1987-03-09",
               "held": "Agreements waiving constitutional rights can be enforced if voluntary and not against public policy."},
    "central_hudson": {"cite": "Central Hudson Gas & Electric Corp. v. Public Service Comm'n, 447 U.S. 557 (1980)", "decided": "1980-06-20",
                       "held": "Sets the intermediate-scrutiny test for restrictions on commercial speech."},
    "zauderer": {"cite": "Zauderer v. Office of Disciplinary Counsel, 471 U.S. 626 (1985)", "decided": "1985-05-28",
                 "held": "Compelled factual, uncontroversial commercial disclosures are permissible if reasonably related to preventing deception and not unduly burdensome."},
    "vullo": {"cite": "NRA v. Vullo, 602 U.S. 175 (2024)", "decided": "2024-05-30",
              "held": "A regulator may not coerce third parties to punish or suppress protected speech."},
    "see_seattle": {"cite": "See v. City of Seattle, 387 U.S. 541 (1967)", "decided": "1967-06-05",
                    "held": "Administrative inspections of commercial premises generally require a warrant."},
    "patel": {"cite": "City of Los Angeles v. Patel, 576 U.S. 409 (2015)", "decided": "2015-06-22",
              "held": "A demand for business records without an opportunity for precompliance review by a neutral decisionmaker is unconstitutional."},
    "burger": {"cite": "New York v. Burger, 482 U.S. 691 (1987)", "decided": "1987-06-19",
               "held": "Warrantless inspections of closely regulated industries can be reasonable under set conditions."},
    "carpenter": {"cite": "Carpenter v. United States, 585 U.S. 296 (2018)", "decided": "2018-06-22",
                  "held": "Acquiring historical cell-site location records is a search requiring a warrant."},
    "mathews": {"cite": "Mathews v. Eldridge, 424 U.S. 319 (1976)", "decided": "1976-02-24",
                "held": "The process due before a deprivation is set by balancing the private interest, the risk of error, and the government's interest."},
    "fox": {"cite": "FCC v. Fox Television Stations, Inc., 567 U.S. 239 (2012)", "decided": "2012-06-21",
            "held": "Due process requires fair notice of what conduct is prohibited before an agency sanctions it."},
    "cedar_point": {"cite": "Cedar Point Nursery v. Hassid, 594 U.S. 139 (2021)", "decided": "2021-06-23",
                    "held": "A regulation granting a right to physically enter private property is a per se taking."},
    "culley": {"cite": "Culley v. Marshall, 601 U.S. 377 (2024)", "decided": "2024-05-09",
               "held": "Due process requires a timely forfeiture hearing but not a separate preliminary retention hearing."},
    "timbs": {"cite": "Timbs v. Indiana, 586 U.S. 146 (2019)", "decided": "2019-02-20",
              "held": "The Excessive Fines Clause applies to the states."},
    "bajakajian": {"cite": "United States v. Bajakajian, 524 U.S. 321 (1998)", "decided": "1998-06-22",
                   "held": "A punitive forfeiture violates the Excessive Fines Clause if grossly disproportional to the offense."},
    "austin": {"cite": "Austin v. United States, 509 U.S. 602 (1993)", "decided": "1993-06-28",
               "held": "Civil forfeitures that serve in part to punish are subject to the Excessive Fines Clause."},
    "sffa": {"cite": "Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023)", "decided": "2023-06-29",
             "held": "Race-conscious admissions programs at Harvard and UNC violate equal protection."},
    "adarand": {"cite": "Adarand Constructors, Inc. v. Peña, 515 U.S. 200 (1995)", "decided": "1995-06-12",
                "held": "Federal racial classifications are subject to strict scrutiny."},
    "vmi": {"cite": "United States v. Virginia, 518 U.S. 515 (1996)", "decided": "1996-06-26",
            "held": "Sex-based government classifications require an exceedingly persuasive justification."},
}


def tier_rule(when, tier, authority, before=1, note=""):
    """when: fn(item, text, found) -> bool. 'before' is the tier for actions dated before the authority."""
    return {"when": when, "tier": tier, "authority": authority, "before": before, "note": note}


ALWAYS = lambda item, text, found: True  # noqa: E731

# ---------------------------------------------------------------------------------------------------
ISSUES = [
    {
        "code": "agency_adjudication", "group": "structural",
        "label": "Agency adjudication of penalties (jury trial and Article III)",
        "applies": lambda item: item.get("category") in ("adjudication", "enforcement"),
        "trigger": _rx(r"order instituting", r"civil (?:money )?penalt", r"cease[- ]and[- ]desist", r"disgorgement",
                       r"penalt(?:y|ies) of", r"sanctions? (?:against|on)", r"debar", r"(?:expel|bar) (?:or (?:bar|expel) )?members",
                       r"notice of apparent liability", r"forfeiture order", r"administrative law judge"),
        "also_triggers": lambda item: item.get("source") == "sec_admin" or item.get("doc_subtype_hint") == "cmp_complaint",
        "question": "Is an agency deciding, in its own forum and without a jury, a penalty claim of the kind the Seventh Amendment and Article III reserve to the courts?",
        "test": "Under Jarkesy, the jury right attaches when (1) the government seeks a legal remedy such as a civil penalty, "
                "(2) for a claim that resembles a common-law action (fraud is the paradigm), and (3) the public-rights "
                "exception does not apply. A structural problem arises when such a claim is (4) decided in the agency's own "
                "forum and (5) actually contested rather than settled by consent.",
        "elements": [
            {"id": "penalty", "text": "A civil penalty or similar punitive money remedy is sought",
             "detect": _any(_has(PENALTY), _sanction("civil_penalty", "disgorgement", "forfeiture_nal"),
                            lambda i, t: i.get("doc_subtype_hint") == "cmp_complaint")},
            {"id": "common_law", "text": "The claim resembles a common-law action (fraud, misrepresentation, deception)",
             "detect": _has(FRAUD)},
            {"id": "in_house", "text": "The matter is decided in the agency's own forum",
             "detect": _any(_has(IN_HOUSE), _src("sec_admin"), lambda i, t: i.get("doc_subtype_hint") == "cmp_complaint")},
            {"id": "contested", "text": "The matter is contested rather than settled by consent",
             "detect": lambda i, t: not SETTLED.search(t) and bool(re.search(r"order instituting|complaint|notice of hearing|initial decision|charg", t, re.I))},
        ],
        "counters": [
            {"id": "settled", "text": "Described as settled or consented, so the jury right was likely waived",
             "detect": _has(SETTLED)},
            {"id": "fcc_forfeiture", "text": "FCC forfeiture order: FCC v. AT&T (2026) held these do not violate the Seventh Amendment",
             "detect": lambda i, t: "fcc" in i.get("agencies", []) and bool(re.search(r"forfeiture|apparent liability", t, re.I)),
             "since": "2026-06-04"},
            {"id": "public_rights", "text": "Subject matter traditionally treated as a public right (customs, immigration, public lands, benefits, taxes)",
             "detect": _has(PUBLIC_RIGHTS)},
        ],
        "tiers": [
            tier_rule(lambda i, t, f: "sec" in i.get("agencies", []) and "common_law" in f, 3, "jarkesy",
                      note="SEC penalty claim for fraud: the facts of Jarkesy."),
            tier_rule(lambda i, t, f: {"penalty", "common_law"} <= set(f), 2, "jarkesy",
                      note="Fraud-like penalty claim at another agency: Jarkesy applies by close analogy."),
            tier_rule(ALWAYS, 1, "atlas_roofing",
                      note="No common-law analogue identified: Atlas Roofing may still permit agency adjudication of a purely statutory claim."),
        ],
        "authorities": ["jarkesy", "tull", "granfinanciera", "atlas_roofing", "axon", "fcc_att"],
        "open_questions": ["How far Jarkesy reaches beyond fraud-like claims (for example, purely regulatory violations).",
                           "Whether consent settlements negotiated under threat of in-house proceedings raise separate concerns.",
                           "How FCC v. AT&T's reasoning applies to other agencies whose penalty orders are not self-executing."],
    },
    {
        "code": "officer_appointment_removal", "group": "structural",
        "label": "Appointment of officers (ALJs, hearing officers, and board members)",
        "applies": lambda item: True,
        "trigger": _rx(r"administrative law judge", r"hearing officer", r"administrative patent judge", r"inferior officer",
                       r"appointments clause", r"removal (?:protection|power)", r"for[- ]cause", r"removed from office"),
        "question": "Are officials exercising significant federal authority appointed, supervised, and reviewable as Article II requires?",
        "test": "An official who holds a continuing position and exercises significant authority under federal law is an officer "
                "(Lucia) and must be appointed by the President, a department head, or a court of law; an inferior officer's "
                "final decisions must be reviewable by a principal officer (Arthrex).",
        "elements": [
            {"id": "official", "text": "An adjudicator or officer (ALJ, hearing officer, board member) is involved",
             "detect": _has(_rx(r"administrative law judge", r"hearing officer", r"administrative (?:patent )?judge", r"board member", r"inferior officer"))},
            {"id": "significant", "text": "The official exercises significant authority (decides cases, issues orders)",
             "detect": _has(_rx(r"decision", r"order", r"hearing", r"rul(?:e|ing)", r"adjudicat"))},
            {"id": "defect", "text": "The document indicates an appointment, review, or removal problem",
             "detect": _has(_rx(r"appoint", r"unreviewable", r"without review", r"removal protection", r"for[- ]cause", r"final decision"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: "defect" in f, 2, "lucia", note="Lucia and Arthrex apply by close analogy."),
                  tier_rule(ALWAYS, 1, "arthrex", note="No specific appointment or review defect is described.")],
        "authorities": ["lucia", "arthrex", "free_enterprise"],
        "open_questions": ["Whether multi-level removal protection for ALJs survives after Free Enterprise Fund and Slaughter."],
    },
    {
        "code": "private_delegation", "group": "structural",
        "label": "Government power exercised by a private corporation",
        "applies": lambda item: bool(item.get("corporation")),
        "trigger": re.compile(r"."),
        "question": "Is a private self-regulatory organization exercising government power without adequate agency control?",
        "test": "Private bodies may help administer federal law only if they function subordinately to an agency that retains "
                "final authority (Adkins; Consumers' Research). Delegating binding power to private parties without that "
                "control is forbidden (Carter Coal).",
        "elements": [
            {"id": "private", "text": "Issued by a private, agency-supervised corporation", "detect": lambda i, t: bool(i.get("corporation"))},
            {"id": "binding", "text": "The action binds members or the public (a rule or fee change)",
             "detect": _has(_rx(r"rule change", r"proposed rule", r"fee", r"amend", r"rule\b"))},
            {"id": "no_prior_review", "text": "Effective without prior agency approval (for example, immediately effective under 19(b)(3)(A))",
             "detect": _has(_rx(r"immediately effective", r"19\(b\)\(3\)\(a\)", r"effective upon filing", r"effectiveness of"))},
        ],
        "counters": [],
        "tiers": [tier_rule(ALWAYS, 1, "consumers_research",
                            note="Open question: Consumers' Research upheld a subordinate private administrator; Alpine addressed discipline, not rules.")],
        "authorities": ["carter_coal", "adkins", "amtrak", "consumers_research", "alpine"],
        "open_questions": ["Whether immediately effective rule and fee changes give the SEC enough prior control.",
                           "Whether FINRA and the exchanges are themselves government actors for constitutional purposes."],
    },
    {
        "code": "private_discipline", "group": "structural",
        "label": "Private corporation disciplining or expelling a member",
        "applies": lambda item: bool(item.get("corporation")),
        "trigger": _rx(r"disciplin", r"expel", r"expulsion", r"\bbar\b", r"suspend", r"sanction", r"\bfine"),
        "question": "Is a private self-regulatory organization imposing severe discipline before any government review?",
        "test": "The D.C. Circuit has held that FINRA may not expel a member before the SEC reviews the expulsion (Alpine).",
        "elements": [
            {"id": "private", "text": "A private, agency-supervised corporation", "detect": lambda i, t: bool(i.get("corporation"))},
            {"id": "discipline", "text": "Discipline is imposed or proposed", "detect": _has(_rx(r"disciplin", r"sanction", r"\bfine", r"suspend"))},
            {"id": "expulsion", "text": "The sanction is expulsion or a bar", "detect": _has(_rx(r"expel", r"expulsion", r"\bbar\b", r"barred"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: "expulsion" in f, 2, "alpine", before=1,
                            note="A federal court of appeals has held this practice unlawful (Alpine)."),
                  tier_rule(ALWAYS, 1, "alpine", note="Alpine addressed expulsion; lesser discipline is an open question.")],
        "authorities": ["alpine", "carter_coal", "free_enterprise"],
        "open_questions": ["Whether Alpine's reasoning extends to fines and suspensions, and outside the D.C. Circuit."],
    },
    {
        "code": "major_questions", "group": "structural",
        "label": "Delegation and major questions",
        "applies": lambda item: item.get("category") == "rulemaking" and item.get("subcategory") in ("Final rule", "Proposed rule"),
        "trigger": _rx(r"economically significant", r"major rule", r"nationwide", r"industry[- ]wide", r"unprecedented",
                       r"first[- ]ever", r"transform", r"for the first time"),
        "also_triggers": lambda item: bool(item.get("significant")),
        "question": "Does the rule decide a question of vast economic or political significance without clear congressional authorization?",
        "test": "Agencies need clear congressional authorization for rules of vast economic and political significance, "
                "especially when they claim newfound power in a long-standing statute (West Virginia v. EPA).",
        "elements": [
            {"id": "rule", "text": "A binding final or proposed rule", "detect": lambda i, t: i.get("subcategory") in ("Final rule", "Proposed rule")},
            {"id": "significance", "text": "Vast economic or political significance (economically significant, major, or nationwide)",
             "detect": _any(lambda i, t: bool(i.get("significant")), _has(_rx(r"economically significant", r"major rule", r"nationwide", r"industry[- ]wide", r"billion")))},
            {"id": "novelty", "text": "A novel assertion of power (unprecedented, first-ever, transformative)",
             "detect": _has(_rx(r"unprecedented", r"first[- ]ever", r"for the first time", r"transform", r"new authority"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: {"significance", "novelty"} <= set(f), 2, "west_virginia", before=1,
                            note="West Virginia v. EPA and Biden v. Nebraska apply by close analogy."),
                  tier_rule(ALWAYS, 1, "west_virginia", note="Significance alone does not establish a major-questions problem.")],
        "authorities": ["west_virginia", "nebraska", "nfib_osha", "consumers_research"],
        "open_questions": ["What counts as 'vast' significance, and whether the doctrine applies to deregulatory rules."],
    },
    {
        "code": "statutory_deference", "group": "structural",
        "label": "Agency interpretation of an ambiguous statute",
        "applies": lambda item: item.get("category") in ("rulemaking", "adjudication"),
        "trigger": _rx(r"chevron", r"deference", r"ambiguous", r"reasonable interpretation", r"gap[- ]fill", r"interpretive rule",
                       r"interpretation of (?:section|the act|the statute)"),
        "question": "Does the action rest on deference to the agency's own reading of a statute?",
        "test": "Courts decide what statutes mean without deferring to agencies (Loper Bright). Reliance on Chevron-style "
                "deference after June 28, 2024, rests on overruled law.",
        "elements": [
            {"id": "interpretation", "text": "The agency interprets a statute", "detect": _has(_rx(r"interpret", r"construe", r"meaning of"))},
            {"id": "ambiguity", "text": "The agency invokes ambiguity or gap-filling", "detect": _has(_rx(r"ambigu", r"gap[- ]fill", r"silent", r"reasonable interpretation"))},
            {"id": "deference", "text": "The agency relies on deference to its own reading", "detect": _has(_rx(r"chevron", r"deference", r"defer to"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: "deference" in f, 3, "loper_bright", before=1,
                            note="Loper Bright squarely rejects deference to agency statutory interpretation."),
                  tier_rule(ALWAYS, 1, "loper_bright", note="Interpretation without claimed deference is ordinary agency work.")],
        "authorities": ["loper_bright", "kisor"],
        "open_questions": ["How much weight courts still give agency views under Skidmore after Loper Bright."],
    },
    {
        "code": "removal_independence", "group": "structural",
        "label": "Presidential control and removal of agency leaders",
        "applies": lambda item: True,
        "trigger": _rx(r"independent (?:regulatory )?agenc", r"humphrey", r"multi-member", r"commissioners? (?:was|were) removed",
                       r"supervision (?:and|&) control", r"accountability for all agencies", r"federal reserve", r"removal of (?:a |the )?(?:governor|commissioner|member)"),
        "question": "Does the action remove or direct officials whose independence the law still protects?",
        "test": "After Trump v. Slaughter (2026), the President may remove commissioners of agencies wielding executive power. "
                "Bodies the Court treats differently, such as the Federal Reserve (Trump v. Cook), remain protected.",
        "elements": [
            {"id": "control", "text": "The action removes or directs agency leaders", "detect": _has(_rx(r"remov", r"supervision", r"direct", r"control", r"review of"))},
            {"id": "protected_body", "text": "The body is one the Court still treats as protected (for example, the Federal Reserve)",
             "detect": _has(_rx(r"federal reserve", r"board of governors"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: "protected_body" in f, 2, "cook", before=1, note="Trump v. Cook protects Federal Reserve governors."),
                  tier_rule(ALWAYS, 1, "slaughter", note="After Slaughter, presidential removal of commissioners is generally lawful.")],
        "authorities": ["slaughter", "cook", "seila", "myers"],
        "open_questions": ["Which bodies, beyond the Federal Reserve, remain outside the President's at-will removal power."],
    },
    {
        "code": "spending_appropriations", "group": "structural",
        "label": "Spending, funding, and appropriations",
        "applies": lambda item: True,
        "trigger": _rx(r"impound", r"rescission", r"deferral of budget authority", r"pause (?:of |all |on )?(?:federal )?(?:funding|grants|disbursements)",
                       r"freez(?:e|ing) (?:of )?(?:federal )?(?:funding|grants)", r"terminat(?:e|ion of) (?:all )?(?:grants|funding)",
                       r"appropriations clause", r"user fees?", r"funding mechanism", r"withh(?:o|e)ld\w* (?:federal )?funds"),
        "question": "Is the executive withholding, redirecting, or self-funding money contrary to Congress's appropriations?",
        "test": "The executive must spend funds as Congress directs (Train) and may withhold them only through the Impoundment "
                "Control Act's procedures.",
        "elements": [
            {"id": "withhold", "text": "Appropriated money is withheld, paused, or terminated", "detect": _has(_rx(r"withh(?:o|e)ld", r"pause", r"freez", r"terminat", r"impound", r"rescission"))},
            {"id": "no_authority", "text": "No statutory process (such as an Impoundment Control Act message) is cited", "detect": lambda i, t: not re.search(r"impoundment control act|special message", t, re.I)},
            {"id": "broad", "text": "The action is broad (all grants, a whole program, or government-wide)", "detect": _has(_rx(r"\ball\b", r"government-wide", r"program-wide", r"entire"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: "withhold" in f, 2, "train", note="Train and the Impoundment Control Act apply by close analogy."),
                  tier_rule(ALWAYS, 1, "cfsa", note="Funding questions without withholding are open.")],
        "authorities": ["train", "ica", "cfsa"],
        "open_questions": ["Whether courts will enforce the Impoundment Control Act at the behest of private grantees."],
    },
    {
        "code": "agency_structure_change", "group": "structural",
        "label": "Creating, abolishing, or restructuring agencies and offices",
        "applies": lambda item: item.get("category") in ("presidential", "rulemaking", "other"),
        "trigger": _rx(r"reorganiz", r"abolish", r"eliminat(?:e|ion of) (?:the |an )?(?:office|agency|bureau|department)",
                       r"reduction[- ]in[- ]force", r"transfer of functions", r"dismantl"),
        "question": "Is the executive restructuring or abolishing a body that Congress created by statute?",
        "test": "Congress creates agencies and assigns their functions by statute; the executive may manage but not abolish them "
                "without authority (Youngstown framework).",
        "elements": [
            {"id": "restructure", "text": "Abolishes, eliminates, or dismantles an office or agency", "detect": _has(_rx(r"abolish", r"eliminat", r"dismantl", r"reduction[- ]in[- ]force"))},
            {"id": "executive", "text": "Done by executive action rather than statute", "detect": lambda i, t: i.get("category") == "presidential" or bool(re.search(r"order|directive|memorandum", t, re.I))},
        ],
        "counters": [],
        "tiers": [tier_rule(ALWAYS, 1, "youngstown", note="Courts are still working out the limits of executive reorganization.")],
        "authorities": ["youngstown", "myers"],
        "open_questions": ["Whether large reductions in force can effectively abolish a statutory function."],
    },
    {
        "code": "federalism", "group": "structural",
        "label": "Federalism (states, preemption, and conditions on federal funds)",
        "applies": lambda item: True,
        "trigger": _rx(r"preempt", r"commandeer", r"state plan", r"conditions? (?:on|of) (?:federal )?(?:funds|grants|funding)",
                       r"sanctuary", r"tenth amendment", r"sovereign immunity"),
        "question": "Does the action command state officials or coerce states through funding conditions?",
        "test": "The federal government may not commandeer state officers or legislatures (Printz; Murphy) and may not attach "
                "coercive conditions to existing funds (NFIB v. Sebelius); conditions must be clear and related (Dole).",
        "elements": [
            {"id": "states", "text": "The action is directed at states or localities", "detect": _has(_rx(r"\bstates?\b", r"local", r"jurisdictions", r"sanctuary"))},
            {"id": "command", "text": "It commands state officials or legislatures", "detect": _has(_rx(r"commandeer", r"direct(?:s|ing)? (?:state|local)", r"require (?:states|state officials)"))},
            {"id": "coercive_condition", "text": "It conditions existing federal funds on compliance", "detect": _has(_rx(r"condition", r"withh(?:o|e)ld", r"terminat\w* (?:federal )?funds"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: "command" in f, 2, "printz", note="Printz and Murphy apply by close analogy."),
                  tier_rule(lambda i, t, f: "coercive_condition" in f, 2, "nfib_sebelius", note="NFIB v. Sebelius applies by close analogy."),
                  tier_rule(ALWAYS, 1, "dole", note="Preemption and ordinary grant conditions are usually lawful.")],
        "authorities": ["printz", "murphy", "nfib_sebelius", "dole"],
        "open_questions": ["When executive (rather than congressional) funding conditions are unauthorized as well as coercive."],
    },
    {
        "code": "presidential_lawmaking", "group": "structural",
        "label": "Executive action that may act like legislation",
        "applies": lambda item: item.get("category") == "presidential",
        "trigger": _rx(r"shall be (?:prohibited|unlawful)", r"tariff", r"national emergency", r"emergency economic powers",
                       r"suspend(?:ing|s)? (?:the )?(?:entry|enforcement|implementation)", r"notwithstanding",
                       r"waive(?:r|s|d)? (?:of )?(?:the )?(?:requirements|statute)"),
        "question": "Does the presidential action rest on a constitutional or statutory power that actually authorizes it?",
        "test": "Presidential orders need a source in the Constitution or a statute (Youngstown). IEEPA does not authorize "
                "tariffs (Learning Resources).",
        "elements": [
            {"id": "presidential", "text": "A presidential document", "detect": lambda i, t: i.get("category") == "presidential"},
            {"id": "binding", "text": "Imposes duties, tariffs, or prohibitions, or suspends a law", "detect": _has(_rx(r"tariff", r"dut(?:y|ies)", r"prohibit", r"suspend", r"waive"))},
            {"id": "weak_basis", "text": "Rests on emergency powers or overrides a statute", "detect": _has(_rx(r"emergency economic powers", r"IEEPA", r"national emergency", r"notwithstanding"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: bool(re.search(r"tariff|dut(?:y|ies) on imports", t, re.I)) and bool(re.search(r"emergency economic powers|IEEPA", t, re.I)),
                            3, "learning_resources", before=1, note="IEEPA tariffs: the facts of Learning Resources."),
                  tier_rule(ALWAYS, 1, "youngstown", note="Other statutory bases must be checked one by one.")],
        "authorities": ["youngstown", "learning_resources", "dames_moore"],
        "open_questions": ["The limits of tariff authority under Sections 122, 232, and 301."],
    },
    {
        "code": "speech_restraint", "group": "rights",
        "label": "Gag orders, no-deny terms, and prior restraints on speech",
        "applies": lambda item: item.get("category") in ("enforcement", "adjudication", "rulemaking"),
        "trigger": _rx(r"\bgag", r"neither admit(?:s|ting)? nor den", r"no[- ]deny", r"not to (?:publicly )?deny", r"prior restraint",
                       r"non-?disparagement", r"confidentiality (?:provision|requirement|order)", r"nondisclosure (?:order|requirement)"),
        "question": "Does the government condition a settlement or order on silence about the case?",
        "test": "Prior restraints are presumptively invalid (Nebraska Press). Courts have so far upheld no-deny settlement terms "
                "as voluntary waivers (Powell; Romeril; Rumery), though the SEC rescinded its policy in May 2026.",
        "elements": [
            {"id": "restriction", "text": "A restriction on speaking about the matter", "detect": _has(_rx(r"\bgag", r"no[- ]deny", r"not to (?:publicly )?deny", r"non-?disparagement", r"confidential", r"prior restraint"))},
            {"id": "government", "text": "Imposed by a government order or settlement", "detect": _has(_rx(r"order", r"settle", r"consent", r"rule"))},
            {"id": "public", "text": "Applies to public statements", "detect": _has(_rx(r"public", r"press", r"media"))},
        ],
        "counters": [],
        "tiers": [tier_rule(ALWAYS, 1, "powell", note="Courts have upheld these terms so far; the question remains contested.")],
        "authorities": ["nebraska_press", "powell", "romeril", "rumery"],
        "open_questions": ["Whether the Supreme Court will review no-deny provisions, and whether rescission moots the issue."],
    },
    {
        "code": "first_amendment", "group": "rights",
        "label": "Speech, press, religion, or association",
        "applies": lambda item: True,
        "trigger": _rx(r"speech", r"advertis", r"compelled disclosure", r"labeling requirement", r"misinformation", r"content moderation",
                       r"religio", r"press\b", r"journalis", r"political (?:activity|contribution)"),
        "question": "Does the action restrict or compel speech, or burden religion or association?",
        "test": "Commercial-speech restrictions face intermediate scrutiny (Central Hudson); compelled factual disclosures must be "
                "reasonably related to preventing deception (Zauderer); regulators may not coerce others to suppress speech (Vullo).",
        "elements": [
            {"id": "speech", "text": "Regulates speech, advertising, disclosure, or religion", "detect": _has(_rx(r"speech", r"advertis", r"disclos", r"label", r"religio", r"press"))},
            {"id": "content", "text": "Content-based or compelled", "detect": _has(_rx(r"content", r"misinformation", r"compel", r"must (?:disclose|state|include)", r"viewpoint"))},
        ],
        "counters": [],
        "tiers": [tier_rule(ALWAYS, 1, "central_hudson", note="Outcome depends on the level of scrutiny and the fit of the rule.")],
        "authorities": ["central_hudson", "zauderer", "vullo"],
        "open_questions": ["How Zauderer applies to disclosures that are arguably not purely factual or uncontroversial."],
    },
    {
        "code": "fourth_amendment", "group": "rights",
        "label": "Searches, inspections, records demands, or surveillance",
        "applies": lambda item: True,
        "trigger": _rx(r"warrantless", r"inspection", r"administrative subpoena", r"civil investigative demand", r"surveillance",
                       r"monitoring of", r"records? (?:access|demand)", r"geolocation", r"biometric"),
        "question": "Does the action authorize searches or records demands without a warrant or neutral review?",
        "test": "Administrative inspections generally require a warrant (See v. Seattle), and records demands require a chance "
                "for precompliance review (Patel), except in closely regulated industries (Burger).",
        "elements": [
            {"id": "search", "text": "A search, inspection, or demand for records or data", "detect": _has(_rx(r"inspect", r"search", r"subpoena", r"investigative demand", r"records", r"surveillance", r"location"))},
            {"id": "no_warrant", "text": "Without a warrant or precompliance review", "detect": _has(_rx(r"warrantless", r"without (?:a )?warrant", r"without notice", r"unannounced"))},
        ],
        "counters": [{"id": "closely_regulated", "text": "A closely regulated industry (Burger exception may apply)",
                      "detect": _has(_rx(r"firearm", r"liquor", r"alcohol", r"mining", r"junkyard", r"pharmac"))}],
        "tiers": [tier_rule(lambda i, t, f: "no_warrant" in f, 2, "patel", note="See v. Seattle and Patel apply by close analogy."),
                  tier_rule(ALWAYS, 1, "burger", note="Ordinary inspections and subpoenas are usually lawful.")],
        "authorities": ["see_seattle", "patel", "burger", "carpenter"],
        "open_questions": ["How Carpenter applies to bulk data demands made to companies about their customers."],
    },
    {
        "code": "due_process_takings", "group": "rights",
        "label": "Property, takings, or due process",
        "applies": lambda item: True,
        "trigger": _rx(r"forfeit", r"taking(?:s)? of", r"without (?:prior )?(?:notice|hearing)", r"interim final rule", r"retroactiv",
                       r"revoc", r"access easement", r"seiz", r"ex parte", r"summary suspension"),
        "question": "Does the action take property or a license without the notice and hearing due process requires, or without fair notice of the rule?",
        "test": "The process due turns on the Mathews balance; agencies must give fair notice of prohibited conduct before "
                "sanctioning it (Fox); a right of physical access to property is a per se taking (Cedar Point).",
        "elements": [
            {"id": "deprivation", "text": "Property, money, or a license is taken or suspended", "detect": _has(_rx(r"forfeit", r"seiz", r"revok", r"revoc", r"taking of", r"easement",
                                r"suspen(?:d|sion) (?:of )?(?:the |a |its )?(?:license|registration|permit|certificate|approval)"))},
            {"id": "no_hearing", "text": "Without prior notice or a hearing", "detect": _has(_rx(r"without (?:prior )?(?:notice|hearing)", r"ex parte", r"summary", r"immediately effective", r"interim final"))},
            {"id": "notice_problem", "text": "Retroactive or without fair notice of the standard", "detect": _has(_rx(r"retroactiv", r"vague", r"fair notice", r"new interpretation"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: {"deprivation", "no_hearing"} <= set(f), 2, "mathews", note="Mathews and Fox apply by close analogy."),
                  tier_rule(ALWAYS, 1, "mathews", note="Due process is a fact-specific balance.")],
        "authorities": ["mathews", "fox", "cedar_point", "culley"],
        "open_questions": ["When interim final rules adopted without comment also deny constitutionally adequate notice."],
    },
    {
        "code": "excessive_fines", "group": "rights",
        "label": "Excessive fines and forfeitures",
        "applies": lambda item: item.get("category") in ("enforcement", "adjudication"),
        "trigger": None,
        "question": "Is a punitive penalty or forfeiture grossly disproportional to the offense?",
        "test": "Punitive fines and forfeitures violate the Eighth Amendment if grossly disproportional to the gravity of the "
                "offense (Bajakajian); civil forfeitures that partly punish are covered (Austin).",
        "elements": [
            {"id": "punitive", "text": "A punitive fine, penalty, or forfeiture", "detect": _has(PENALTY)},
            {"id": "large", "text": "The amount is at least $1 million", "detect": lambda i, t: money_in(t) >= 1e6},
        ],
        "counters": [{"id": "restitution", "text": "The money is described as restitution to victims, which is generally remedial",
                      "detect": _has(_rx(r"restitution", r"refunds? to", r"redress"))}],
        "tiers": [tier_rule(ALWAYS, 1, "bajakajian", note="Gross disproportionality is fact-specific; amounts alone are a screen.")],
        "authorities": ["bajakajian", "austin", "timbs"],
        "open_questions": ["How courts measure proportionality for corporate penalties calculated per violation."],
    },
    {
        "code": "equal_protection", "group": "rights",
        "label": "Classifications by race, sex, or other protected traits",
        "applies": lambda item: True,
        "trigger": _rx(r"race[- ]conscious", r"racial preference", r"set[- ]aside", r"disadvantaged business", r"diversity, equity",
                       r"\bDEI\b", r"sex[- ]based", r"race[- ]based"),
        "question": "Does the action classify people by race or sex?",
        "test": "Federal racial classifications receive strict scrutiny (Adarand) and are rarely upheld after SFFA; "
                "sex classifications require an exceedingly persuasive justification (Virginia).",
        "elements": [
            {"id": "classification", "text": "The action classifies by race or sex", "detect": _has(_rx(r"race", r"racial", r"sex[- ]based", r"gender", r"disadvantaged"))},
            {"id": "preference", "text": "It grants an express preference or set-aside", "detect": _has(_rx(r"preference", r"set[- ]aside", r"presum", r"race[- ]conscious"))},
        ],
        "counters": [],
        "tiers": [tier_rule(lambda i, t, f: {"classification", "preference"} <= set(f), 2, "sffa", before=1,
                            note="SFFA and Adarand apply by close analogy; strict scrutiny is rarely satisfied."),
                  tier_rule(ALWAYS, 1, "adarand", note="Mentions of diversity programs are not themselves classifications.")],
        "authorities": ["adarand", "sffa", "vmi"],
        "open_questions": ["How SFFA applies to federal contracting presumptions of disadvantage."],
    },
]
ISSUE_BY_CODE = {i["code"]: i for i in ISSUES}

# ---------------------------------------------------------------------------------------- seriousness
SANCTION_POINTS = {
    4: ["criminal", "industry_bar", "officer_director_bar", "debarment", "revocation", "practice_suspension"],
    3: ["civil_penalty", "forfeiture_nal", "disgorgement", "seizure", "asset_freeze", "funding_cut"],
    2: ["cease_desist", "injunction", "suspension", "license_denial", "operations_order", "trading_suspension", "gag",
        "data_deletion", "undertakings", "recall", "import_action"],
    1: ["warning", "censure", "subpoena", "inspection", "corrective_disclosure", "restitution", "consent_order"],
}
_SANCTION_PTS = {k: p for p, ks in SANCTION_POINTS.items() for k in ks}


def seriousness(item, text):
    """Objective points for how much is at stake. Returns (level, points, breakdown)."""
    parts = []
    sp = max((_SANCTION_PTS.get(k, 0) for k in item.get("sanctions") or []), default=0)
    if sp:
        parts.append(("Sanction", sp, "most serious sanction named"))
    amount = money_in(text)
    mp = 3 if amount >= 1e8 else 2 if amount >= 1e6 else 1 if amount > 0 else 0
    if mp:
        parts.append(("Money", mp, f"${amount:,.0f} stated"))
    if item.get("category") == "presidential":
        parts.append(("Reach", 3, "presidential document"))
    elif item.get("subcategory") in ("Final rule", "Proposed rule"):
        if re.search(r"economically significant|major rule", text, re.I):
            parts.append(("Reach", 3, "economically significant or major rule"))
        else:
            parts.append(("Reach", 2, "binding rule" + (" designated significant" if item.get("significant") else "")))
    else:
        parts.append(("Reach", 1, "self-regulatory filing" if item.get("corporation") else "action against particular parties"))
    points = sum(p for _, p, _ in parts)
    level = 3 if points >= 6 else 2 if points >= 3 else 1
    return level, points, [{"marker": m, "points": p, "why": w} for m, p, w in parts]


# ---------------------------------------------------------------------------------------- flagrance
def _level(tier, coverage):
    if tier == 3 and coverage >= 1:
        return 3
    if tier >= 2 and coverage >= 0.5:
        return 2
    return 1


def assess(issue, item, text):
    """Apply one issue's test to an item. Returns the stored flag (without explanations, which live in taxonomy.json)."""
    found = [e["id"] for e in issue["elements"] if e["detect"](item, text)]
    hits = [c for c in issue.get("counters", []) if c["detect"](item, text)]
    counters = [c["id"] for c in hits]
    # a counter based on a later decision (for example FCC v. AT&T) did not exist at the time of an older action
    counters_then = [c["id"] for c in hits if not c.get("since") or (item.get("date") or "") >= c["since"]]
    rule = next(r for r in issue["tiers"] if r["when"](item, text, found))
    tier, auth = rule["tier"], rule["authority"]
    coverage = len(found) / len(issue["elements"])
    level = _level(tier, coverage)
    if counters:
        level = 1
    decided = AUTHORITIES[auth]["decided"]
    then = None
    if item.get("date") and item["date"] < decided:
        then_level = 1 if counters_then else _level(rule["before"], coverage)
        if then_level != level:
            then = {"flagrance": then_level, "because": auth}
    out = {"code": issue["code"], "group": issue["group"], "structural": issue["group"] == "structural",
           "flagrance": level, "tier": tier, "tier_authority": auth, "elements_found": found,
           "elements_total": len(issue["elements"]), "counters": counters}
    if then:
        out["at_the_time"] = then
    return out


def export():
    """JSON-safe doctrine library and rubric for the app and for DOCTRINE.md."""
    return {
        "doctrine": {
            "review": REVIEW_STATUS,
            "authorities": AUTHORITIES,
            "issues": [{
                "code": i["code"], "group": i["group"], "label": i["label"], "question": i["question"], "test": i["test"],
                "elements": [{"id": e["id"], "text": e["text"]} for e in i["elements"]],
                "counters": [{"id": c["id"], "text": c["text"]} for c in i.get("counters", [])],
                "tiers": [{"tier": r["tier"], "authority": r["authority"], "note": r["note"]} for r in i["tiers"]],
                "authorities": i["authorities"], "open_questions": i["open_questions"],
            } for i in ISSUES],
            "rubric": {
                "flagrance": [
                    "Precedent tier: 3 if the Supreme Court has held this specific practice unlawful; 2 if a Supreme Court holding applies by close analogy or a federal court of appeals has held the same practice unlawful; 1 if the question is open, split, or was resolved the other way.",
                    "Element coverage: the share of the test's elements found in the document's title, action line, and summary.",
                    "Flagrant: tier 3 and every element found. Substantial: tier 2 or 3 with at least half the elements found. Arguable: everything else.",
                    "A counter-indicator (such as a settlement or a contrary holding) caps the rating at Arguable.",
                    "Ratings apply today's law. When the controlling decision came after the action, the app also shows the rating at the time.",
                ],
                "seriousness": [
                    "Sanction points: 4 for criminal charges, bars, expulsions, debarment, revocations, and practice bans; 3 for civil penalties, forfeitures, disgorgement, seizures, asset freezes, and funding cuts; 2 for cease-and-desist orders, injunctions, suspensions, denials, shutdowns, gag terms, trading halts, data-deletion orders, monitors, recalls, and import actions; 1 for warnings, censures, subpoenas, inspections, compelled notices, restitution, and settlements.",
                    "Money points: 3 for at least $100 million, 2 for at least $1 million, 1 for any stated amount.",
                    "Reach points: 3 for presidential documents and rules designated economically significant or major; 2 for other final or proposed rules; 1 for actions against particular parties and self-regulatory filings.",
                    "Severe: 6 points or more. Significant: 3 to 5. Moderate: 0 to 2.",
                ],
            },
        }
    }
