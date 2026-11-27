"""The RegCollect doctrine library and rating rubric (rubric version 3.1).

Every kind of constitutional issue RegCollect screens for is described here as a
short legal memo: the question, the governing test broken into elements, the
controlling authorities (with decision dates), precedent rules, weighed factors,
and open questions. Each element has a detector that looks for evidence in the
document's title, action line, summary, and, when RegCollect has read it, the
document's full text (see fulltext.py).

CONSTITUTIONALITY (the only thing the rating measures)
  How likely is it that the action is unconstitutional, or exceeds the limits on
  executive power, under the law as it stands today?

  Precedent strength, from the first precedent rule that matches:
    Direct holding   A court has held this practice (or this very action) unlawful.
    Close analogy    A Supreme Court holding applies by close analogy, or a federal
                     court of appeals has held the same practice unlawful.
    Open question    No holding yet condemns this practice.
  Gate elements must all be present before an action is rated at all. Without them
  the issue is listed as a "possible issue" and not rated.

  Level 3  Near certain (almost certainly unconstitutional):
           a direct holding and every element of the test found.
  Level 2  Very likely: a direct holding with at least half the elements, or a close
           analogy with every element.
  Level 1  Likely: any other rated issue (a direct holding with fewer elements, a close
           analogy with at least half, or an open question with every element).
  Weighed factors (a contrary holding, a closely regulated industry, and similar)
  lower the level by one step each, but never remove a rating. Settlements are noted
  and do not lower the rating: people settle for many reasons.

  Ratings apply today's law. When the controlling decision came after the action,
  the flag also notes how the action stood under the precedent at the time.

  Known rulings: when a court has ruled on a specific action (for example, the IEEPA
  tariff orders in Learning Resources), the ruling sets the level directly
  (Supreme Court: 3, court of appeals: 2, district court: 1), and a ruling that
  upheld the action counts as a weighed factor.

IMPACT (recorded, never part of the rating, never color-coded)
  Sanction  4 criminal, bars, expulsion, debarment, revocation, practice ban
            3 civil penalty, forfeiture, disgorgement, seizure, asset freeze, funding cut
            2 cease-and-desist, injunction, suspension, denial, shutdown, gag terms,
              trading halt, data deletion, monitors, recall, import action
            1 warning, censure, subpoena, inspection, compelled notice, restitution, settlement
  Money     3 at least $100 million; 2 at least $1 million; 1 any stated amount
  Reach     3 presidential document, or a rule designated economically significant or major
            2 any other final or proposed rule
            1 an action against particular parties, or a self-regulatory filing
  Lower Impact 1 to 3 points; Significant Impact 4 to 6; Serious Impact 7 or more.

STATUS: every memo below is a draft written for review. Until a reviewer signs off,
the app labels it "Draft, not yet reviewed".
"""
import re

from . import rulings

RUBRIC_VERSION = "3.1"
REVIEW_STATUS = {"status": "Draft, not yet reviewed", "reviewed_by": "", "last_reviewed": ""}
STRENGTH = {"direct": 3, "analogy": 2, "open": 1}
STRENGTH_LABEL = {"direct": "Direct holding", "analogy": "Close analogy", "open": "Open question"}

# Every specific regular expression used by a detector is registered here, so that the
# full-text reader knows which passages of a long document are worth keeping as evidence.
EVIDENCE_RX = []


def _rx(*words, ev=True):
    rx = re.compile(r"\b(?:" + "|".join(words) + r")", re.I)
    if ev:
        EVIDENCE_RX.append(rx)
    return rx


def _has(rx):
    return lambda item, text: bool(rx.search(text))


def _src(*sources):
    return lambda item, text: item.get("source") in sources


def _any(*fns):
    return lambda item, text: any(f(item, text) for f in fns)


def _all(*fns):
    return lambda item, text: all(f(item, text) for f in fns)


def _sanction(*keys):
    return lambda item, text: any(k in (item.get("sanctions") or []) for k in keys)


def _cites(*keys):
    """The document cites one of these statutes (found in the summary or the full text)."""
    return lambda item, text: any(k in statutes_cited(item, text) for k in keys)


SETTLED = _rx(r"settle", r"consent(?:ed| order| decree| agreement)", r"offer of settlement", r"agreed to", r"stipulat", ev=False)
FRAUD = _rx(r"fraud", r"misrepresent", r"mislead", r"deceptive", r"10b-5", r"antifraud", r"false statement", r"manipulat")
PENALTY = _rx(r"civil (?:money |monetary )?penalt", r"penalt(?:y|ies) of", r"fine[sd]?\b", r"disgorg", r"forfeiture")
IN_HOUSE = _rx(r"administrative law judge", r"order instituting (?:cease-and-desist |administrative )?proceedings",
               r"administrative proceeding", r"in-house", r"hearing officer", r"initial decision", r"departmental appeals board")
PUBLIC_RIGHTS = _rx(r"tariff", r"customs dut", r"immigration", r"public lands", r"federal benefits", r"grant (?:award|program)",
                    r"\btax(?:es|ation)?\b", ev=False)
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


# ------------------------------------------------------------------------------------ statutes
# Statutes RegCollect recognizes when a document cites them as its authority (or discusses them).
STATUTES = [
    ("ieepa", "International Emergency Economic Powers Act (IEEPA)",
     r"International Emergency Economic Powers Act|\bIEEPA\b|50 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?170[1-9]"),
    ("nea", "National Emergencies Act", r"National Emergencies Act|50 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?16(?:0[1-9]|[1-5]\d)\b"),
    ("s232", "Section 232 of the Trade Expansion Act of 1962", r"section 232 of the Trade Expansion Act|19 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?1862"),
    ("s301", "Section 301 of the Trade Act of 1974", r"section 301 of the Trade Act|19 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?2411"),
    ("s122", "Section 122 of the Trade Act of 1974", r"section 122 of the Trade Act|19 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?2132"),
    ("s338", "Section 338 of the Tariff Act of 1930", r"section 338 of the Tariff Act|19 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?1338"),
    ("s201", "Section 201 of the Trade Act of 1974 (safeguards)", r"section 201 of the Trade Act|19 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?225[1-3]"),
    ("ina212f", "Immigration and Nationality Act section 212(f)", r"212\(f\)|8 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?1182\(f\)"),
    ("dpa", "Defense Production Act", r"Defense Production Act|50 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?45\d\d"),
    ("stafford", "Stafford Act", r"Stafford (?:Disaster Relief and Emergency Assistance )?Act|42 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?51\d\d"),
    ("phsa361", "Public Health Service Act section 361", r"section 361 of the Public Health Service Act|42 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?264\b"),
    ("osh6c", "OSH Act section 6(c) (emergency temporary standards)", r"29 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?655\(c\)|section 6\(c\) of the (?:OSH|Occupational)"),
    ("heroes", "HEROES Act", r"HEROES Act"),
    ("ica", "Impoundment Control Act", r"Impoundment Control Act|2 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?68[1-8]"),
    ("rfra", "Religious Freedom Restoration Act (RFRA)", r"Religious Freedom Restoration Act|\bRFRA\b|42 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?2000bb"),
    ("rluipa", "Religious Land Use and Institutionalized Persons Act (RLUIPA)",
     r"Religious Land Use and Institutionalized Persons Act|\bRLUIPA\b|42 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?2000cc"),
    ("apa_good_cause", "APA good-cause exception (no notice and comment)", r"5 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?553\(b\)\(B\)|good cause to (?:forgo|waive|dispense)|good cause exists"),
    ("cra", "Congressional Review Act", r"Congressional Review Act|5 U\.?\s?S\.?\s?C\.?\s?(?:§+\s*)?80[1-8]\b"),
    ("seventh_amendment", "Seventh Amendment", r"Seventh Amendment"),
    ("appointments_clause", "Appointments Clause", r"Appointments Clause"),
]
STATUTE_RX = [(k, label, re.compile(rx, re.I)) for k, label, rx in STATUTES]
STATUTE_LABEL = {k: label for k, label, _ in STATUTES}
EVIDENCE_RX.extend(rx for _, _, rx in STATUTE_RX)


def statutes_cited(item, text):
    found = {k for k, _, rx in STATUTE_RX if rx.search(text)}
    if not text and item.get("_ev"):
        found.update(k for k, _, rx in STATUTE_RX if rx.search(" ".join(item["_ev"])))
    return found


# ------------------------------------------------------------------------------------ authorities
# key -> citation, decision date, court level, and a one-sentence paraphrase of what was held.
AUTHORITIES = {
    # adjudication and juries
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
    # officers and removal
    "lucia": {"cite": "Lucia v. SEC, 585 U.S. 237 (2018)", "decided": "2018-06-21",
              "held": "SEC administrative law judges are officers of the United States and must be appointed as the Appointments Clause requires."},
    "arthrex": {"cite": "United States v. Arthrex, Inc., 594 U.S. 1 (2021)", "decided": "2021-06-21",
                "held": "Administrative judges may not issue final decisions that no principal officer can review."},
    "free_enterprise": {"cite": "Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)", "decided": "2010-06-28",
                        "held": "Two layers of for-cause protection between the President and officers of the PCAOB violate the separation of powers."},
    "slaughter": {"cite": "Trump v. Slaughter (U.S. June 29, 2026)", "decided": "2026-06-29",
                  "held": "Statutory limits on the President's power to remove FTC commissioners are unconstitutional; Humphrey's Executor is overruled."},
    "cook": {"cite": "Trump v. Cook (U.S. June 29, 2026)", "decided": "2026-06-29",
             "held": "Upheld an injunction against the attempted removal of a Federal Reserve governor, treating the Federal Reserve differently."},
    "seila": {"cite": "Seila Law LLC v. CFPB, 591 U.S. 197 (2020)", "decided": "2020-06-29",
              "held": "For-cause removal protection for the CFPB's single director is unconstitutional."},
    "collins": {"cite": "Collins v. Yellen, 594 U.S. 220 (2021)", "decided": "2021-06-23",
                "held": "An unconstitutional removal restriction does not by itself void the agency's actions; a challenger must show the restriction caused harm."},
    "myers": {"cite": "Myers v. United States, 272 U.S. 52 (1926)", "decided": "1926-10-25",
              "held": "The President has power to remove executive officers he appoints."},
    # private power
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
    # agency authority and executive lawmaking
    "west_virginia": {"cite": "West Virginia v. EPA, 597 U.S. 697 (2022)", "decided": "2022-06-30",
                      "held": "Agencies need clear congressional authorization to decide questions of vast economic and political significance; the Clean Power Plan's generation-shifting approach exceeded the Clean Air Act."},
    "nebraska": {"cite": "Biden v. Nebraska, 600 U.S. 477 (2023)", "decided": "2023-06-30",
                 "held": "The student-loan forgiveness program exceeded the HEROES Act; the major questions doctrine reinforced that reading."},
    "nfib_osha": {"cite": "NFIB v. OSHA, 595 U.S. 109 (2022) (per curiam)", "decided": "2022-01-13",
                  "held": "OSHA's workplace vaccine-or-test mandate likely exceeded its statutory authority; the Court stayed it."},
    "alabama_realtors": {"cite": "Alabama Ass'n of Realtors v. HHS, 594 U.S. 758 (2021) (per curiam)", "decided": "2021-08-26",
                         "held": "The CDC's nationwide eviction moratorium exceeded its authority under section 361 of the Public Health Service Act."},
    "biden_missouri": {"cite": "Biden v. Missouri, 595 U.S. 87 (2022) (per curiam)", "decided": "2022-01-13",
                       "held": "Allowed the CMS rule requiring vaccination of staff at Medicare- and Medicaid-funded facilities to take effect."},
    "sackett": {"cite": "Sackett v. EPA, 598 U.S. 651 (2023)", "decided": "2023-05-25",
                "held": "The Clean Water Act reaches only wetlands with a continuous surface connection to traditional waters; the 'significant nexus' test is rejected."},
    "loper_bright": {"cite": "Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024)", "decided": "2024-06-28",
                     "held": "Courts must exercise independent judgment on statutory meaning and may not defer to an agency's reading because a statute is ambiguous; Chevron is overruled."},
    "kisor": {"cite": "Kisor v. Wilkie, 588 U.S. 558 (2019)", "decided": "2019-06-26",
              "held": "Deference to an agency's reading of its own regulation survives only for genuinely ambiguous rules and within strict limits."},
    "youngstown": {"cite": "Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)", "decided": "1952-06-02",
                   "held": "The President may not make law without constitutional or statutory authority; Justice Jackson's three-category framework."},
    "clinton_ny": {"cite": "Clinton v. City of New York, 524 U.S. 417 (1998)", "decided": "1998-06-25",
                   "held": "The President may not cancel or amend parts of duly enacted statutes; the Line Item Veto Act is unconstitutional."},
    "aiken": {"cite": "In re Aiken County, 725 F.3d 255 (D.C. Cir. 2013)", "decided": "2013-08-13",
              "held": "An agency may not decline to follow a statutory mandate simply because it disagrees with it or lacks enthusiasm for it."},
    "learning_resources": {"cite": "Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026)", "decided": "2026-02-20",
                           "held": "The International Emergency Economic Powers Act does not authorize the President to impose tariffs."},
    "dames_moore": {"cite": "Dames & Moore v. Regan, 453 U.S. 654 (1981)", "decided": "1981-07-02",
                    "held": "Upheld presidential actions under IEEPA settling claims against Iran, in light of congressional acquiescence."},
    "algonquin": {"cite": "Federal Energy Administration v. Algonquin SNG, Inc., 426 U.S. 548 (1976)", "decided": "1976-06-17",
                  "held": "Section 232 lets the President adjust imports through license fees as well as quotas."},
    "trump_hawaii": {"cite": "Trump v. Hawaii, 585 U.S. 667 (2018)", "decided": "2018-06-26",
                     "held": "Upheld a presidential proclamation restricting entry under INA section 212(f)."},
    # spending and structure
    "train": {"cite": "Train v. City of New York, 420 U.S. 35 (1975)", "decided": "1975-02-18",
              "held": "The executive may not withhold funds Congress directed be allotted."},
    "cfsa": {"cite": "CFPB v. Community Financial Services Ass'n of America, 601 U.S. 416 (2024)", "decided": "2024-05-16",
             "held": "The CFPB's funding mechanism satisfies the Appropriations Clause."},
    "ica": {"cite": "Impoundment Control Act of 1974, 2 U.S.C. 681–688", "decided": "1974-07-12",
            "held": "Statute: the President may propose deferrals and rescissions but may not withhold appropriated funds without following the Act."},
    # federalism
    "printz": {"cite": "Printz v. United States, 521 U.S. 898 (1997)", "decided": "1997-06-27",
               "held": "The federal government may not command state officers to administer federal programs."},
    "murphy": {"cite": "Murphy v. NCAA, 584 U.S. 453 (2018)", "decided": "2018-05-14",
               "held": "Congress may not directly order state legislatures what laws to pass or not pass."},
    "nfib_sebelius": {"cite": "NFIB v. Sebelius, 567 U.S. 519 (2012)", "decided": "2012-06-28",
                      "held": "Conditions on federal funds become unconstitutionally coercive when they threaten existing funding the states depend on."},
    "dole": {"cite": "South Dakota v. Dole, 483 U.S. 203 (1987)", "decided": "1987-06-23",
             "held": "Congress may attach clear, related, non-coercive conditions to federal grants."},
    # speech
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
    "reed": {"cite": "Reed v. Town of Gilbert, 576 U.S. 155 (2015)", "decided": "2015-06-18",
             "held": "Laws that regulate speech because of its topic or message are content-based and must satisfy strict scrutiny."},
    "nifla": {"cite": "National Institute of Family & Life Advocates v. Becerra, 585 U.S. 755 (2018)", "decided": "2018-06-26",
              "held": "Compelled notices that are not purely factual and uncontroversial information about the speaker's own services fall outside Zauderer and face heightened scrutiny."},
    "sorrell": {"cite": "Sorrell v. IMS Health Inc., 564 U.S. 552 (2011)", "decided": "2011-06-23",
                "held": "Content- and speaker-based burdens on commercial information receive heightened scrutiny."},
    "creative_303": {"cite": "303 Creative LLC v. Elenis, 600 U.S. 570 (2023)", "decided": "2023-06-30",
                     "held": "Government may not compel a person to create expressive work conveying a message she does not hold."},
    "moody": {"cite": "Moody v. NetChoice, LLC, 603 U.S. 707 (2024)", "decided": "2024-07-01",
              "held": "A platform's curation of third-party content is protected expression; government may not override it to rebalance the marketplace of ideas."},
    "murthy": {"cite": "Murthy v. Missouri, 603 U.S. 43 (2024)", "decided": "2024-06-26",
               "held": "Plaintiffs lacked standing to challenge federal officials' communications with platforms about content moderation."},
    "vullo": {"cite": "NRA v. Vullo, 602 U.S. 175 (2024)", "decided": "2024-05-30",
              "held": "A regulator may not coerce third parties to punish or suppress protected speech."},
    # religion
    "smith": {"cite": "Employment Division v. Smith, 494 U.S. 872 (1990)", "decided": "1990-04-17",
              "held": "A neutral, generally applicable law that incidentally burdens religious exercise does not violate the Free Exercise Clause."},
    "lukumi": {"cite": "Church of the Lukumi Babalu Aye, Inc. v. City of Hialeah, 508 U.S. 520 (1993)", "decided": "1993-06-11",
               "held": "A law that targets religious practice or is not neutral and generally applicable must satisfy strict scrutiny."},
    "fulton": {"cite": "Fulton v. City of Philadelphia, 593 U.S. 522 (2021)", "decided": "2021-06-17",
               "held": "A rule is not generally applicable if it allows individualized, discretionary exemptions; refusing one to a religious objector triggers strict scrutiny."},
    "tandon": {"cite": "Tandon v. Newsom, 593 U.S. 61 (2021) (per curiam)", "decided": "2021-04-09",
               "held": "A rule triggers strict scrutiny when it treats any comparable secular activity more favorably than religious exercise."},
    "carson": {"cite": "Carson v. Makin, 596 U.S. 767 (2022)", "decided": "2022-06-21",
               "held": "Government may not exclude religious organizations or uses from a generally available public benefit because they are religious."},
    "kennedy": {"cite": "Kennedy v. Bremerton School District, 597 U.S. 507 (2022)", "decided": "2022-06-27",
                "held": "Establishment Clause questions are decided by historical practice and understanding, not the Lemon test; government may not punish private religious expression."},
    "catholic_charities": {"cite": "Catholic Charities Bureau, Inc. v. Wisconsin Labor & Industry Review Comm'n, 605 U.S. ___ (2025)", "decided": "2025-06-05",
                           "held": "Government may not grant or deny a religious exemption based on theological distinctions between denominations."},
    "mahmoud": {"cite": "Mahmoud v. Taylor, 606 U.S. ___ (2025)", "decided": "2025-06-27",
                "held": "Government policies that substantially interfere with parents' religious upbringing of their children trigger strict scrutiny, even if neutral and generally applicable."},
    "rfra_statute": {"cite": "Religious Freedom Restoration Act of 1993, 42 U.S.C. 2000bb to 2000bb-4", "decided": "1993-11-16",
                     "held": "Statute: the federal government may not substantially burden a person's religious exercise, even by a neutral and generally applicable rule, unless it uses the least restrictive means of furthering a compelling interest."},
    "rluipa_statute": {"cite": "Religious Land Use and Institutionalized Persons Act of 2000, 42 U.S.C. 2000cc to 2000cc-5", "decided": "2000-09-22",
                       "held": "Statute: applies RFRA's strict-scrutiny test to land-use regulation and to prisons and other institutions that receive federal funds."},
    "boerne": {"cite": "City of Boerne v. Flores, 521 U.S. 507 (1997)", "decided": "1997-06-25",
               "held": "RFRA cannot be applied to the states, but it continues to bind the federal government."},
    "hobby_lobby": {"cite": "Burwell v. Hobby Lobby Stores, Inc., 573 U.S. 682 (2014)", "decided": "2014-06-30",
                    "held": "The HHS contraceptive mandate, as applied to closely held corporations with religious objections, violated RFRA because less restrictive means were available."},
    "o_centro": {"cite": "Gonzales v. O Centro Espírita Beneficente União do Vegetal, 546 U.S. 418 (2006)", "decided": "2006-02-21",
                 "held": "Under RFRA the government must justify applying a law to the particular religious claimant, not just the law in general."},
    "holt": {"cite": "Holt v. Hobbs, 574 U.S. 352 (2015)", "decided": "2015-01-20",
             "held": "Under RLUIPA a prison grooming rule that barred a religious beard was not the least restrictive means."},
    "little_sisters": {"cite": "Little Sisters of the Poor v. Pennsylvania, 591 U.S. 657 (2020)", "decided": "2020-07-08",
                       "held": "Agencies may, and in some cases must, consider RFRA when writing rules, and may create religious exemptions."},
    "tanzin": {"cite": "Tanzin v. Tanvir, 592 U.S. 43 (2020)", "decided": "2020-12-10",
               "held": "RFRA permits damages suits against federal officials in their individual capacities."},
    # association
    "naacp_alabama": {"cite": "NAACP v. Alabama ex rel. Patterson, 357 U.S. 449 (1958)", "decided": "1958-06-30",
                      "held": "Compelled disclosure of an association's membership lists can unconstitutionally burden freedom of association."},
    "afpf": {"cite": "Americans for Prosperity Foundation v. Bonta, 594 U.S. 595 (2021)", "decided": "2021-07-01",
             "held": "Compelled disclosure of donor identities must be narrowly tailored to a sufficiently important interest (exacting scrutiny)."},
    "jaycees": {"cite": "Roberts v. United States Jaycees, 468 U.S. 609 (1984)", "decided": "1984-07-03",
                "held": "Freedom of expressive association may be infringed only by regulations serving compelling interests unrelated to suppressing ideas that cannot be achieved by less restrictive means."},
    # searches
    "see_seattle": {"cite": "See v. City of Seattle, 387 U.S. 541 (1967)", "decided": "1967-06-05",
                    "held": "Administrative inspections of commercial premises generally require a warrant."},
    "patel": {"cite": "City of Los Angeles v. Patel, 576 U.S. 409 (2015)", "decided": "2015-06-22",
              "held": "A demand for business records without an opportunity for precompliance review by a neutral decisionmaker is unconstitutional."},
    "burger": {"cite": "New York v. Burger, 482 U.S. 691 (1987)", "decided": "1987-06-19",
               "held": "Warrantless inspections of closely regulated industries can be reasonable under set conditions."},
    "carpenter": {"cite": "Carpenter v. United States, 585 U.S. 296 (2018)", "decided": "2018-06-22",
                  "held": "Acquiring historical cell-site location records is a search requiring a warrant."},
    # process and property
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
    # equal protection
    "sffa": {"cite": "Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023)", "decided": "2023-06-29",
             "held": "Race-conscious admissions programs at Harvard and UNC violate equal protection."},
    "adarand": {"cite": "Adarand Constructors, Inc. v. Peña, 515 U.S. 200 (1995)", "decided": "1995-06-12",
                "held": "Federal racial classifications are subject to strict scrutiny."},
    "vmi": {"cite": "United States v. Virginia, 518 U.S. 515 (1996)", "decided": "1996-06-26",
            "held": "Sex-based government classifications require an exceedingly persuasive justification."},
}
AUTHORITIES.update(rulings.AUTHORITIES)


def rule(when, level, authority, before=None, note=""):
    """A precedent rule. when: fn(item, text, found) -> bool. level: 'direct', 'analogy', or 'open'.
    before: the precedent strength for actions dated before the authority was decided (default: open)."""
    return {"when": when, "level": level, "authority": authority, "before": before or "open", "note": note}


def weighed(id, text, detect, since=None, lowers=True):
    """A factor that cuts against a violation. lowers=False means it is noted but does not change the rating."""
    return {"id": id, "text": text, "detect": detect, "since": since, "lowers": lowers}


ALWAYS = lambda item, text, found: True  # noqa: E731

# Kinds of document that never raise an issue by themselves (paperwork, meetings, inflation adjustments).
NO_FLAG_SUBCATEGORIES = {"Information collection, privacy, or paperwork notice", "Meeting or event", "Penalty inflation adjustment",
                         "GRAS notice (food ingredient)", "Dietary supplement structure/function notification"}

# Actions that withdraw, repeal, or delay something do not themselves raise the issues of what they undo.
DEREGULATORY = re.compile(r"\b(?:withdrawal of|withdrawn|withdrawing|repeal(?:ing|ed)? of|repeal of|rescission of|rescinding|removal of|delay of (?:the )?effective date|"
                          r"termination of the|ending certain|revok(?:es|ing) executive order)", re.I)
TARIFF = re.compile(r"tariff|dut(?:y|ies) on (?:imports|articles|goods|products)|ad valorem|additional dut(?:y|ies)|imposing dut(?:y|ies)|duties", re.I)
STATUTE_OVERRIDE = re.compile(r"suspend(?:s|ing|ed)? (?:the )?(?:operation|enforcement|application|implementation) of|shall not (?:be )?enforce|"
                              r"non-?enforcement|decline[sd]? to enforce|notwithstanding any (?:other )?provision of (?:law|statute)|"
                              r"waiv(?:e|es|ing|er of) (?:the )?(?:requirements? of )?(?:section|the act|the statute)", re.I)
EVIDENCE_RX.extend([TARIFF, STATUTE_OVERRIDE])

# ---------------------------------------------------------------------------------------------------
ISSUES = [
    {
        "code": "agency_adjudication", "group": "structural",
        "label": "Agency adjudication of penalties (jury trial and Article III)",
        "applies": lambda item: item.get("category") in ("adjudication", "enforcement"),
        "trigger": _rx(r"order instituting", r"civil (?:money )?penalt", r"cease[- ]and[- ]desist", r"disgorgement",
                       r"penalt(?:y|ies) of", r"sanctions? (?:against|on)", r"debar", r"(?:expel|bar) (?:or (?:bar|expel) )?members",
                       r"notice of apparent liability", r"forfeiture order", r"administrative law judge", r"Seventh Amendment", r"Jarkesy"),
        "also_triggers": lambda item: item.get("source") == "sec_admin" or item.get("doc_subtype_hint") == "cmp_complaint",
        "question": "Is an agency deciding, in its own forum and without a jury, a penalty claim of the kind the Seventh Amendment and Article III reserve to the courts?",
        "test": "Under Jarkesy, the jury right attaches when (1) the government seeks a legal remedy such as a civil penalty, "
                "(2) for a claim that resembles a common-law action (fraud is the paradigm), and (3) the public-rights "
                "exception does not apply. A structural problem arises when such a claim is (4) decided in the agency's own forum.",
        "elements": [
            {"id": "penalty", "gate": True, "text": "A civil penalty or similar punitive money remedy is sought",
             "detect": _any(_has(PENALTY), _sanction("civil_penalty", "disgorgement", "forfeiture_nal"),
                            lambda i, t: i.get("doc_subtype_hint") == "cmp_complaint")},
            {"id": "common_law", "text": "The claim resembles a common-law action (fraud, misrepresentation, deception)",
             "detect": _has(FRAUD)},
            {"id": "in_house", "gate": True, "text": "The matter is decided in the agency's own forum",
             "detect": _any(_has(IN_HOUSE), _src("sec_admin"), lambda i, t: i.get("doc_subtype_hint") == "cmp_complaint")},
        ],
        "weighed": [
            weighed("settled", "Described as settled or consented. Noted only: a settlement does not cure the forum, and people settle for many reasons.",
                    _has(SETTLED), lowers=False),
            weighed("fcc_forfeiture", "FCC forfeiture order: FCC v. AT&T (2026) held these do not violate the Seventh Amendment",
                    lambda i, t: "fcc" in i.get("agencies", []) and bool(re.search(r"forfeiture|apparent liability", t, re.I)), since="2026-06-04"),
            weighed("public_rights", "Subject matter traditionally treated as a public right (customs, immigration, public lands, benefits, taxes)",
                    _has(PUBLIC_RIGHTS)),
        ],
        "precedent": [
            rule(lambda i, t, f: "sec" in i.get("agencies", []) and "common_law" in f, "direct", "jarkesy",
                 note="An SEC penalty claim for fraud decided in-house: the facts of Jarkesy."),
            rule(lambda i, t, f: "common_law" in f, "analogy", "jarkesy",
                 note="A fraud-like penalty claim at another agency: Jarkesy applies by close analogy."),
            rule(ALWAYS, "open", "atlas_roofing",
                 note="No common-law analogue identified: Atlas Roofing may still permit agency adjudication of a purely statutory claim."),
        ],
        "authorities": ["jarkesy", "tull", "granfinanciera", "atlas_roofing", "axon", "fcc_att"],
        "open_questions": ["How far Jarkesy reaches beyond fraud-like claims (for example, purely regulatory violations).",
                           "Whether consent settlements negotiated under threat of in-house proceedings raise separate concerns.",
                           "How FCC v. AT&T's reasoning applies to other agencies whose penalty orders are not self-executing."],
    },
    {
        "code": "officer_appointment_removal", "group": "structural",
        "label": "Appointment and supervision of officers (ALJs, hearing officers, and board members)",
        "applies": lambda item: True,
        "trigger": _rx(r"administrative law judge", r"hearing officer", r"administrative patent judge", r"inferior officer",
                       r"appointments clause", r"removal (?:protection|power)", r"for[- ]cause", r"removed from office", r"\bLucia\b", r"Arthrex"),
        "question": "Are officials exercising significant federal authority appointed, supervised, and reviewable as Article II requires?",
        "test": "An official who holds a continuing position and exercises significant authority under federal law is an officer "
                "(Lucia) and must be appointed by the President, a department head, or a court of law; an inferior officer's "
                "final decisions must be reviewable by a principal officer (Arthrex).",
        "elements": [
            {"id": "official", "gate": True, "text": "An adjudicator or officer (ALJ, hearing officer, board member) is involved",
             "detect": _has(_rx(r"administrative law judge", r"hearing officer", r"administrative (?:patent )?judge", r"board member", r"inferior officer"))},
            {"id": "significant", "text": "The official exercises significant authority (decides cases, issues orders)",
             "detect": _has(_rx(r"decision", r"order", r"hearing", r"rul(?:e|ing)", r"adjudicat", ev=False))},
            {"id": "defect", "gate": True, "text": "The document indicates an appointment, review, or removal problem",
             "detect": _has(_rx(r"not (?:properly )?appointed", r"improperly appointed", r"appointments clause", r"unreviewable", r"without (?:further )?review",
                                r"removal protection", r"ratif(?:y|ied|ication) (?:of )?(?:the )?appointment", r"final decision (?:of|by) the (?:judge|ALJ)"))},
        ],
        "weighed": [weighed("ratified", "The agency head ratified the appointment, which usually cures an appointment defect going forward",
                            _has(_rx(r"ratif", ev=False)))],
        "precedent": [rule(lambda i, t, f: "defect" in f, "direct", "lucia", before="open",
                           note="Lucia and Arthrex hold that unappointed or unreviewable adjudicators violate Article II."),
                      rule(ALWAYS, "open", "arthrex", note="No specific appointment or review defect is described.")],
        "authorities": ["lucia", "arthrex", "free_enterprise", "collins"],
        "open_questions": ["Whether multi-level removal protection for ALJs survives after Free Enterprise Fund and Slaughter.",
                           "What remedy follows a removal defect after Collins v. Yellen."],
    },
    {
        "code": "private_delegation", "group": "structural", "open_rated": False,
        "label": "Government power exercised by a private corporation",
        "applies": lambda item: bool(item.get("corporation")),
        "trigger": re.compile(r"."),
        "question": "Is a private self-regulatory organization exercising government power without adequate agency control?",
        "test": "Private bodies may help administer federal law only if they function subordinately to an agency that retains "
                "final authority (Adkins; Consumers' Research). Delegating binding power to private parties without that "
                "control is forbidden (Carter Coal).",
        "elements": [
            {"id": "private", "gate": True, "text": "Issued by a private, agency-supervised corporation", "detect": lambda i, t: bool(i.get("corporation"))},
            {"id": "binding", "gate": True, "text": "The action binds members or the public (a rule or fee change)",
             "detect": _has(_rx(r"rule change", r"proposed rule", r"fee", r"amend", r"rule\b", ev=False))},
            {"id": "no_prior_review", "gate": True, "text": "Effective without prior agency approval (for example, immediately effective under 19(b)(3)(A))",
             "detect": _has(_rx(r"immediately effective", r"immediate effectiveness", r"19\(b\)\(3\)\(a\)", r"effective upon filing"))},
        ],
        "weighed": [],
        "precedent": [rule(ALWAYS, "open", "consumers_research",
                           note="Open question: Consumers' Research upheld a subordinate private administrator; Alpine addressed discipline, not rules.")],
        "authorities": ["carter_coal", "adkins", "amtrak", "consumers_research", "alpine"],
        "open_questions": ["Whether immediately effective rule and fee changes give the SEC enough prior control.",
                           "Whether FINRA and the exchanges are themselves government actors for constitutional purposes."],
    },
    {
        "code": "private_discipline", "group": "structural",
        "label": "Private corporation disciplining or expelling a member",
        "applies": lambda item: bool(item.get("corporation")) and item.get("subcategory") == "Disciplinary matter",
        "trigger": _rx(r"disciplin", r"expel", r"expulsion", r"\bbar\b", r"suspend", r"sanction", r"\bfine", ev=False),
        "question": "Is a private self-regulatory organization imposing severe discipline before any government review?",
        "test": "The D.C. Circuit has held that FINRA may not expel a member before the SEC reviews the expulsion (Alpine).",
        "elements": [
            {"id": "private", "gate": True, "text": "A private, agency-supervised corporation", "detect": lambda i, t: bool(i.get("corporation"))},
            {"id": "discipline", "gate": True, "text": "Discipline is imposed or proposed", "detect": _has(_rx(r"disciplin", r"sanction", r"\bfine", r"suspend", r"expel", r"\bbar\b", ev=False))},
            {"id": "expulsion", "text": "The sanction is expulsion or a bar", "detect": _has(_rx(r"expel", r"expulsion", r"\bbar\b", r"barred", ev=False))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: "expulsion" in f, "analogy", "alpine",
                           note="A federal court of appeals has held this practice unlawful (Alpine)."),
                      rule(ALWAYS, "open", "alpine", note="Alpine addressed expulsion; lesser discipline is an open question.")],
        "authorities": ["alpine", "carter_coal", "free_enterprise"],
        "open_questions": ["Whether Alpine's reasoning extends to fines and suspensions, and outside the D.C. Circuit."],
    },
    {
        "code": "major_questions", "group": "structural",
        "label": "Agency authority, delegation, and major questions",
        "applies": lambda item: item.get("category") in ("rulemaking", "presidential") or item.get("subcategory") in ("Final rule", "Proposed rule"),
        "trigger": _rx(r"economically significant", r"major rule", r"nationwide", r"industry[- ]wide", r"unprecedented",
                       r"first[- ]ever", r"transform", r"for the first time", r"major questions", r"nondelegation", r"emergency temporary standard",
                       r"moratorium", r"generation shifting", r"significant nexus"),
        "also_triggers": lambda item: bool(item.get("significant")),
        "question": "Does the rule decide a question of vast economic or political significance, or claim a power, without clear congressional authorization?",
        "test": "Agencies need clear congressional authorization for rules of vast economic and political significance, "
                "especially when they claim newfound power in a long-standing statute (West Virginia v. EPA; Alabama Realtors; NFIB v. OSHA). "
                "Agencies have only the power Congress gives them.",
        "elements": [
            {"id": "rule", "gate": True, "text": "A binding rule, order, or program", "detect": lambda i, t: i.get("subcategory") in ("Final rule", "Proposed rule") or i.get("category") == "presidential"
             or bool(re.search(r"\border\b|moratorium|emergency temporary standard", t, re.I))},
            {"id": "significance", "gate": True, "text": "Vast economic or political significance (economically significant, major, nationwide, or billions at stake)",
             "detect": _any(lambda i, t: bool(i.get("significant")), _has(_rx(r"economically significant", r"major rule", r"nationwide", r"industry[- ]wide", r"billion", r"all (?:employers|landlords|power plants)")))},
            {"id": "novelty", "text": "A novel or expansive assertion of power (unprecedented, first-ever, transformative, emergency)",
             "detect": _has(_rx(r"unprecedented", r"first[- ]ever", r"for the first time", r"transform", r"new authority", r"emergency temporary standard",
                                r"moratorium", r"generation shifting", r"never before"))},
            {"id": "thin_basis", "text": "Rests on a broad, general, or long-standing statutory provision (or emergency authority)",
             "detect": _any(_has(_rx(r"general (?:rulemaking )?authority", r"long-?standing", r"broad authority", r"catch-?all", r"emergency")),
                            _cites("phsa361", "osh6c", "heroes", "dpa", "ieepa", "nea"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: {"significance", "novelty", "thin_basis"} <= set(f), "analogy", "west_virginia",
                           note="West Virginia v. EPA, Alabama Realtors, and NFIB v. OSHA apply by close analogy."),
                      rule(ALWAYS, "open", "west_virginia", note="Significance alone does not establish a major-questions problem.")],
        "authorities": ["west_virginia", "nebraska", "nfib_osha", "alabama_realtors", "sackett", "consumers_research", "biden_missouri"],
        "open_questions": ["What counts as 'vast' significance, and whether the doctrine applies to deregulatory rules.",
                           "Whether the major questions doctrine applies to the President's own actions as it does to agencies."],
    },
    {
        "code": "statutory_deference", "group": "structural",
        "label": "Agency interpretation of an ambiguous statute (Chevron and Loper Bright)",
        "applies": lambda item: item.get("category") in ("rulemaking", "adjudication"),
        "trigger": _rx(r"chevron,? U\.?S\.?A", r"chevron deference", r"chevron (?:step|framework|doctrine|analysis)", r"under chevron", r"chevron v\.", r"deference", r"ambiguous", r"reasonable interpretation", r"gap[- ]fill", r"interpretive rule",
                       r"interpretation of (?:section|the act|the statute)", r"permissible (?:construction|interpretation)"),
        "question": "Does the action rest on deference to the agency's own reading of a statute?",
        "test": "Courts decide what statutes mean without deferring to agencies (Loper Bright). Reliance on Chevron-style "
                "deference rests on overruled law, even for rules issued while Chevron governed.",
        "elements": [
            {"id": "interpretation", "text": "The agency interprets a statute", "detect": _has(_rx(r"interpret", r"construe", r"meaning of", r"construction of", ev=False))},
            {"id": "ambiguity", "text": "The agency invokes ambiguity or gap-filling", "detect": _has(_rx(r"ambigu", r"gap[- ]fill", r"statute is silent", r"reasonable interpretation", r"permissible (?:construction|interpretation)"))},
            {"id": "deference", "gate": True, "text": "The agency relies on deference to its own reading", "detect": _has(_rx(r"chevron,? U\.?S\.?A", r"chevron deference", r"chevron (?:step|framework|doctrine|analysis)", r"under chevron", r"chevron v\.", r"deference", r"defer to"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: "deference" in f, "direct", "loper_bright", before="open",
                           note="Loper Bright squarely rejects deference to agency statutory interpretation. Rules relying on Chevron stood on governing law when issued."),
                      rule(ALWAYS, "open", "loper_bright", note="Interpretation without claimed deference is ordinary agency work.")],
        "authorities": ["loper_bright", "kisor"],
        "open_questions": ["How much weight courts still give agency views under Skidmore after Loper Bright.",
                           "Loper Bright did not reopen past cases that upheld rules under Chevron (statutory stare decisis)."],
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
            {"id": "control", "gate": True, "text": "The action removes or directs agency leaders", "detect": _has(_rx(r"remov", r"supervision", r"direct", r"control", r"review of", ev=False))},
            {"id": "protected_body", "gate": True, "text": "The body is one the Court still treats as protected (for example, the Federal Reserve)",
             "detect": _has(_rx(r"federal reserve", r"board of governors"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: "protected_body" in f, "analogy", "cook", note="Trump v. Cook protects Federal Reserve governors."),
                      rule(ALWAYS, "open", "slaughter", note="After Slaughter, presidential removal of commissioners is generally lawful.")],
        "authorities": ["slaughter", "cook", "seila", "collins", "myers"],
        "open_questions": ["Which bodies, beyond the Federal Reserve, remain outside the President's at-will removal power."],
    },
    {
        "code": "spending_appropriations", "group": "structural",
        "label": "Spending, funding, and appropriations",
        "applies": lambda item: True,
        "trigger": _rx(r"impoundment of (?:funds|appropriat)", r"impound(?:s|ed|ing)? (?:funds|appropriat)", r"rescission of (?:budget authority|funds|appropriat)", r"deferral of budget authority", r"pause (?:of |all |on )?(?:federal )?(?:funding|grants|disbursements)",
                       r"freez(?:e|ing) (?:of )?(?:federal )?(?:funding|grants)", r"terminat(?:e|ion of) (?:all )?(?:grants|funding)",
                       r"appropriations clause", r"funding mechanism", r"withh(?:o|e)ld\w* (?:federal )?funds"),
        "question": "Is the executive withholding, redirecting, or self-funding money contrary to Congress's appropriations?",
        "test": "The executive must spend funds as Congress directs (Train) and may withhold them only through the Impoundment "
                "Control Act's procedures.",
        "elements": [
            {"id": "withhold", "gate": True, "text": "Appropriated money is withheld, paused, or terminated",
             "detect": _has(_rx(r"withh(?:o|e)ld\w* (?:federal )?(?:funds|funding|payments)", r"pause (?:of |all |on )?(?:federal )?(?:funding|grants|disbursements)",
                                r"freez(?:e|ing) (?:of )?(?:federal )?(?:funding|grants)", r"terminat\w* (?:of )?(?:all )?(?:grants|funding|awards)", r"impoundment of (?:funds|appropriat)",
                                r"rescission of (?:budget authority|funds|appropriat)"))},
            {"id": "no_authority", "text": "No statutory process (such as an Impoundment Control Act message) is cited",
             "detect": lambda i, t: not re.search(r"impoundment control act|special message", t, re.I)},
            {"id": "broad", "text": "The action is broad (all grants, a whole program, or government-wide)", "detect": _has(_rx(r"\ball\b", r"government-wide", r"program-wide", r"entire", ev=False))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: "withhold" in f, "analogy", "train", note="Train and the Impoundment Control Act apply by close analogy."),
                      rule(ALWAYS, "open", "cfsa", note="Funding questions without withholding are open.")],
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
                "without authority (Youngstown framework; In re Aiken County).",
        "elements": [
            {"id": "restructure", "gate": True, "text": "Abolishes, eliminates, or dismantles an office or agency", "detect": _has(_rx(r"abolish", r"eliminat\w* (?:the |an )?(?:office|agency|bureau|department)", r"dismantl", r"reduction[- ]in[- ]force"))},
            {"id": "executive", "gate": True, "text": "Done by executive action rather than statute", "detect": lambda i, t: i.get("category") == "presidential" or bool(re.search(r"\border\b|directive|memorandum", t, re.I))},
            {"id": "statutory_body", "text": "The body or function was created by statute", "detect": _has(_rx(r"established by (?:statute|law|the act)", r"statutory (?:office|function|duties|mandate)", r"required by (?:law|statute)"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: "statutory_body" in f, "analogy", "aiken", note="Aiken County and Youngstown apply by close analogy when a statutory function is abandoned."),
                      rule(ALWAYS, "open", "youngstown", note="Courts are still working out the limits of executive reorganization.")],
        "authorities": ["youngstown", "aiken", "myers"],
        "open_questions": ["Whether large reductions in force can effectively abolish a statutory function."],
    },
    {
        "code": "federalism", "group": "structural",
        "label": "Federalism (states, preemption, and conditions on federal funds)",
        "applies": lambda item: True,
        "trigger": _rx(r"preempt", r"commandeer", r"state plan", r"conditions? (?:on|of) (?:federal )?(?:funds|grants|funding)",
                       r"sanctuary", r"tenth amendment", r"sovereign immunity"),
        "skip_titles": re.compile(r"implementation plans?|attainment plan|maintenance plan|state plan|approval of .{0,60}plan|redesignation|program approval|primacy", re.I),
        "question": "Does the action command state officials or coerce states through funding conditions?",
        "test": "The federal government may not commandeer state officers or legislatures (Printz; Murphy) and may not attach "
                "coercive conditions to existing funds (NFIB v. Sebelius); conditions must be clear and related (Dole).",
        "elements": [
            {"id": "states", "gate": True, "text": "The action is directed at states or localities", "detect": _has(_rx(r"\bstates?\b", r"local", r"jurisdictions", r"sanctuary", ev=False))},
            {"id": "command", "text": "It commands state officials or legislatures", "detect": _has(_rx(r"commandeer", r"direct(?:s|ing)? (?:state|local)", r"require (?:states|state officials)"))},
            {"id": "coercive_condition", "text": "It conditions existing federal funds on compliance", "detect": _has(_rx(r"condition(?:s|ing|ed)? (?:on|of) (?:federal )?(?:funds|grants|funding)", r"withh(?:o|e)ld\w* (?:federal )?(?:funds|grants)", r"terminat\w* (?:federal )?funds"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: "command" in f, "analogy", "printz", note="Printz and Murphy apply by close analogy."),
                      rule(lambda i, t, f: "coercive_condition" in f, "analogy", "nfib_sebelius", note="NFIB v. Sebelius applies by close analogy."),
                      rule(ALWAYS, "open", "dole", note="Preemption and ordinary grant conditions are usually lawful.")],
        "authorities": ["printz", "murphy", "nfib_sebelius", "dole"],
        "open_questions": ["When executive (rather than congressional) funding conditions are unauthorized as well as coercive."],
    },
    {
        "code": "presidential_lawmaking", "group": "structural",
        "label": "Executive action that makes law (emergency powers, tariffs, and suspending or rewriting statutes)",
        "applies": lambda item: item.get("category") == "presidential" or bool(statutes_cited(item, "") & {"ieepa", "nea"}),
        "trigger": _rx(r"shall be (?:prohibited|unlawful)", r"tariff", r"duties", r"national emergency", r"emergency economic powers", r"IEEPA",
                       r"suspend(?:ing|s)? (?:the )?(?:entry|enforcement|implementation|operation)", r"notwithstanding",
                       r"waive(?:r|s|d)? (?:of )?(?:the )?(?:requirements|statute)", r"shall not (?:be )?enforce", r"non-?enforcement"),
        "question": "Does an executive action impose duties, taxes, or prohibitions on the public, or set aside a statute, without a power the Constitution or Congress actually gives?",
        "test": "The President's power to act must come from the Constitution or a statute (Youngstown). Jackson's framework: power "
                "is greatest with Congress's authorization, weakest when the action is incompatible with Congress's will. Taxes and "
                "tariffs are Congress's power (Art. I, sec. 8), and IEEPA does not delegate it (Learning Resources). The executive "
                "may not cancel or suspend duly enacted statutes (Clinton v. City of New York; In re Aiken County). Courts read "
                "general or emergency statutes narrowly when they are used for sweeping measures.",
        "elements": [
            {"id": "binding", "gate": True, "text": "Imposes duties, tariffs, fees, or prohibitions on the public, or suspends or waives a statute",
             "detect": _any(_has(TARIFF), _has(STATUTE_OVERRIDE), _has(_rx(r"prohibit", r"shall be unlawful", r"import (?:ban|restriction)", r"embargo", ev=False)))},
            {"id": "basis", "text": "Rests on an emergency power or a general statute rather than a specific grant",
             "detect": _any(_cites("ieepa", "nea", "dpa", "stafford"), _has(_rx(r"national emergency", r"emergency economic powers", r"authority vested in me")))},
            {"id": "no_clear_authority", "text": "The power claimed is one the cited statute does not clearly give (for example, tariffs under IEEPA, or overriding a statute)",
             "detect": lambda i, t: (bool(TARIFF.search(t)) and "ieepa" in statutes_cited(i, t)) or bool(STATUTE_OVERRIDE.search(t))},
            {"id": "public_effect", "text": "Applies to private parties or the public (importers, businesses, people), not just to agencies",
             "detect": _has(_rx(r"import", r"importer", r"employers?", r"persons?", r"compan(?:y|ies)", r"entities", r"goods", r"articles", r"products", r"businesses", ev=False))},
        ],
        "weighed": [
            weighed("specific_trade_statute", "Also rests on a trade statute courts have read broadly (Section 232, 301, 122, or 201)",
                    _cites("s232", "s301", "s122", "s201")),
            weighed("entry_power", "Restricts entry of noncitizens under INA 212(f), which Trump v. Hawaii read broadly", _cites("ina212f")),
        ],
        "precedent": [
            rule(lambda i, t, f: bool(TARIFF.search(t)) and "ieepa" in statutes_cited(i, t), "direct", "learning_resources",
                 note="Tariffs or duties imposed under IEEPA: the facts of Learning Resources."),
            rule(lambda i, t, f: bool(STATUTE_OVERRIDE.search(t)), "analogy", "clinton_ny", before="analogy",
                 note="Suspending, waiving, or refusing to enforce a statute: Clinton v. City of New York and In re Aiken County apply by close analogy."),
            rule(lambda i, t, f: "ieepa" in statutes_cited(i, t) and "binding" in f, "analogy", "learning_resources",
                 note="Other IEEPA measures that operate like taxes or regulation of commerce: Learning Resources applies by close analogy."),
            rule(ALWAYS, "open", "youngstown",
                 note="Other bases (Sections 232, 301, 122, 212(f), and emergency statutes) must be checked one by one under Youngstown."),
        ],
        "authorities": ["youngstown", "learning_resources", "clinton_ny", "aiken", "dames_moore", "algonquin", "trump_hawaii", "nebraska"],
        "open_questions": ["The limits of tariff authority under Sections 122, 232, and 301 after Learning Resources.",
                           "Whether the major questions doctrine constrains the President directly, or only agencies.",
                           "When nonenforcement policies become a refusal to execute the law."],
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
            {"id": "restriction", "gate": True, "text": "A restriction on speaking about the matter", "detect": _has(_rx(r"\bgag", r"no[- ]deny", r"not to (?:publicly )?deny", r"non-?disparagement", r"confidential", r"prior restraint", r"neither admit"))},
            {"id": "government", "text": "Imposed by a government order or settlement", "detect": _has(_rx(r"order", r"settle", r"consent", r"rule", ev=False))},
            {"id": "public", "text": "Applies to public statements", "detect": _has(_rx(r"public", r"press", r"media", ev=False))},
        ],
        "weighed": [weighed("courts_upheld", "Courts of appeals have upheld no-deny terms as voluntary waivers (Powell; Romeril)",
                            _has(_rx(r"neither admit", r"no[- ]deny", r"not to (?:publicly )?deny", ev=False)))],
        "precedent": [rule(ALWAYS, "open", "nebraska_press", note="Prior-restraint doctrine applies, but courts have upheld these terms so far; the question remains contested.")],
        "authorities": ["nebraska_press", "powell", "romeril", "rumery"],
        "open_questions": ["Whether the Supreme Court will review no-deny provisions, and whether rescission moots the issue."],
    },
    {
        "code": "free_speech", "group": "rights",
        "label": "Freedom of speech and the press",
        "applies": lambda item: item.get("category") in ("enforcement", "adjudication", "presidential") or item.get("subcategory") in ("Final rule", "Proposed rule"),
        "trigger": _rx(r"free speech", r"freedom of (?:speech|the press)", r"first amendment", r"advertis", r"compelled (?:disclosure|speech)", r"labeling requirement",
                       r"misinformation", r"disinformation", r"content moderation", r"press\b", r"journalis", r"viewpoint", r"broadcast content", r"censor"),
        "question": "Does the action restrict or compel speech, or pressure others to suppress it?",
        "test": "Content-based restrictions face strict scrutiny (Reed); commercial-speech restrictions face intermediate scrutiny "
                "(Central Hudson), heightened when speaker- or content-based (Sorrell). Compelled disclosures are allowed only if "
                "purely factual, uncontroversial, and reasonably related to preventing deception (Zauderer); others face heightened "
                "scrutiny (NIFLA). Government may not compel expressive work (303 Creative), override editorial judgment (Moody), "
                "or coerce third parties to suppress speech (Vullo).",
        "elements": [
            {"id": "speech", "gate": True, "text": "Regulates speech, advertising, labels, disclosures, publishing, or editorial choices",
             "detect": _has(_rx(r"speech", r"advertis", r"disclos", r"label", r"press", r"publish", r"broadcast", r"content", r"statement", ev=False))},
            {"id": "content", "text": "Content-based, viewpoint-based, or compelled", "detect": _has(_rx(r"content", r"misinformation", r"disinformation", r"compel", r"must (?:disclose|state|include|display)", r"viewpoint", r"warning statement"))},
            {"id": "not_factual", "text": "Compels opinion, controversial, or non-factual statements, or targets protected expression",
             "detect": _has(_rx(r"controversial", r"opinion", r"ideolog", r"editorial (?:judgment|discretion|decisions)", r"viewpoint", r"misinformation", r"disinformation"))},
        ],
        "weighed": [weighed("factual_disclosure", "Requires only factual, uncontroversial information about the speaker's own products (Zauderer)",
                            _has(_rx(r"nutrition", r"ingredient", r"fee disclosure", r"price", r"factual", ev=False)))],
        "precedent": [rule(lambda i, t, f: {"content", "not_factual"} <= set(f), "analogy", "nifla", note="NIFLA, Reed, and Vullo apply by close analogy to content-based or non-factual compulsion."),
                      rule(ALWAYS, "open", "central_hudson", note="Outcome depends on the level of scrutiny and the fit of the rule.")],
        "authorities": ["reed", "central_hudson", "sorrell", "zauderer", "nifla", "creative_303", "moody", "vullo", "murthy"],
        "open_questions": ["How Zauderer applies to disclosures that are arguably not purely factual or uncontroversial (for example, climate or ESG disclosures).",
                           "How Moody applies to agency rules affecting platform moderation."],
    },
    {
        "code": "free_exercise", "group": "rights",
        "label": "Religious liberty (Free Exercise, Establishment, RFRA, and RLUIPA)",
        "applies": lambda item: True,
        "trigger": _rx(r"religio", r"free exercise", r"faith-based", r"church", r"conscience", r"\bRFRA\b", r"RLUIPA", r"establishment clause",
                       r"houses? of worship", r"ministr", r"clergy", r"sincerely held"),
        "question": "Does the action burden religious exercise, discriminate against religion, or favor one religion over another?",
        "test": "Constitution: a neutral, generally applicable rule that incidentally burdens religion gets rational-basis review "
                "(Smith); a rule that targets religion, is not neutral, allows individualized exemptions (Fulton), or treats any "
                "comparable secular activity better (Tandon) must survive strict scrutiny (Lukumi). Government may not exclude "
                "religious groups from public benefits (Carson) or draw lines between denominations (Catholic Charities). "
                "Statutes: for federal action RFRA applies strict scrutiny even to neutral, generally applicable rules: a "
                "substantial burden must be the least restrictive means of serving a compelling interest (Hobby Lobby; O Centro). "
                "RLUIPA applies the same test to land-use rules and to federally funded prisons and institutions (Holt).",
        "elements": [
            {"id": "religion", "gate": True, "text": "Affects religious exercise, religious organizations, or houses of worship",
             "detect": _has(_rx(r"religio", r"faith", r"church", r"worship", r"conscience", r"ministr", r"clergy", r"sincerely held"))},
            {"id": "burden", "gate": True, "text": "Imposes a requirement, penalty, or loss of benefits that burdens that exercise",
             "detect": _has(_rx(r"requir", r"mandat", r"must", r"prohibit", r"penalt", r"den(?:y|ial|ied)", r"exclu", r"terminat", r"condition", ev=False))},
            {"id": "not_neutral", "text": "Not neutral or generally applicable (singles out religion, has exemptions for secular reasons, or discretionary exemptions)",
             "detect": _has(_rx(r"except(?:ion|ions)? for", r"exempt(?:ion|s)? (?:for|from)", r"case-by-case", r"discretion", r"waiver", r"religious (?:organizations|entities) (?:are|may not)", r"excludes? religious"))},
            {"id": "no_accommodation", "text": "No religious exemption or accommodation is provided, or one is removed",
             "detect": _has(_rx(r"no (?:religious )?exemption", r"without (?:a )?(?:religious )?exemption", r"rescind\w* (?:the )?(?:religious|conscience)",
                                r"remov\w* (?:the )?(?:religious|conscience) (?:exemption|protection)", r"eliminat\w* (?:the )?(?:religious|conscience)"))},
        ],
        "weighed": [weighed("accommodation", "Provides a religious exemption or accommodation", _has(_rx(r"religious exemption", r"accommodation", r"conscience protection", ev=False)))],
        "precedent": [
            rule(lambda i, t, f: {"not_neutral", "no_accommodation"} <= set(f), "analogy", "fulton",
                 note="Fulton, Tandon, and Lukumi apply by close analogy; for federal action RFRA independently requires strict scrutiny (Hobby Lobby)."),
            rule(lambda i, t, f: "no_accommodation" in f, "analogy", "hobby_lobby",
                 note="A federal requirement that burdens religious exercise without accommodation: RFRA and Hobby Lobby apply by close analogy."),
            rule(ALWAYS, "open", "smith",
                 note="A neutral, generally applicable rule gets rational-basis review under Smith, but RFRA still requires strict scrutiny of substantial burdens imposed by the federal government."),
        ],
        "authorities": ["smith", "lukumi", "fulton", "tandon", "carson", "kennedy", "catholic_charities", "mahmoud",
                        "rfra_statute", "boerne", "hobby_lobby", "o_centro", "little_sisters", "tanzin", "rluipa_statute", "holt"],
        "open_questions": ["Whether the Court will overrule Smith (several Justices have urged it).",
                           "How Mahmoud's parental-rights reasoning applies to federal programs and conditions on funds.",
                           "How RLUIPA applies when federal agencies set conditions for state prisons or land-use programs."],
    },
    {
        "code": "association", "group": "rights",
        "label": "Freedom of association and donor privacy",
        "applies": lambda item: item.get("category") in ("enforcement", "adjudication", "presidential") or item.get("subcategory") in ("Final rule", "Proposed rule"),
        "trigger": _rx(r"membership lists?", r"donor (?:lists?|names|identit|information|disclosure)", r"disclos\w* (?:of )?(?:their |its )?(?:donors|members)", r"political contribut", r"freedom of association", r"associational", r"beneficial owner", r"disclos\w* of (?:members|donors|contributors)"),
        "question": "Does the action compel disclosure of members or donors, or penalize joining or supporting a group?",
        "test": "Compelled disclosure of members or donors must survive exacting scrutiny: narrow tailoring to a sufficiently "
                "important interest (Americans for Prosperity; NAACP v. Alabama). Burdens on expressive association need a "
                "compelling interest unrelated to suppressing ideas (Roberts v. Jaycees).",
        "elements": [
            {"id": "disclosure", "gate": True, "text": "Requires disclosure of members, donors, owners, or supporters, or penalizes association",
             "detect": _has(_rx(r"membership lists?", r"donor (?:lists?|names|identit|information|disclosure)", r"disclos\w* (?:of )?(?:their |its )?(?:donors|members|contributors)",
                                r"political contribut", r"beneficial owner", r"identit(?:y|ies) of (?:its )?(?:members|donors|contributors|supporters)"))},
            {"id": "broad", "text": "Applies broadly or in bulk rather than case by case", "detect": _has(_rx(r"\ball\b", r"each", r"every", r"annual", r"report", ev=False))},
            {"id": "public_release", "text": "The information may be made public or shared widely", "detect": _has(_rx(r"public(?:ly)? (?:available|disclos|release)", r"published", r"database"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: {"broad", "public_release"} <= set(f), "analogy", "afpf", note="Americans for Prosperity applies by close analogy to broad donor or member disclosure."),
                      rule(ALWAYS, "open", "naacp_alabama", note="Disclosure rules are judged by exacting scrutiny case by case.")],
        "authorities": ["naacp_alabama", "afpf", "jaycees"],
        "open_questions": ["How Americans for Prosperity applies to federal beneficial-ownership and political-disclosure rules."],
    },
    {
        "code": "fourth_amendment", "group": "rights",
        "label": "Searches, inspections, records demands, or surveillance",
        "applies": lambda item: True,
        "trigger": _rx(r"warrantless", r"inspection", r"administrative subpoena", r"civil investigative demand", r"surveillance",
                       r"monitoring of", r"records? (?:access|demand)", r"geolocation", r"biometric", r"Fourth Amendment"),
        "question": "Does the action authorize searches or records demands without a warrant or neutral review?",
        "test": "Administrative inspections generally require a warrant (See v. Seattle), and records demands require a chance "
                "for precompliance review (Patel), except in closely regulated industries (Burger).",
        "elements": [
            {"id": "search", "gate": True, "text": "A search, inspection, or demand for records or data", "detect": _has(_rx(r"inspect", r"search", r"subpoena", r"investigative demand", r"records", r"surveillance", r"location", ev=False))},
            {"id": "no_warrant", "gate": True, "text": "Without a warrant or precompliance review", "detect": _has(_rx(r"warrantless", r"without (?:a )?warrant", r"without (?:judicial|precompliance) review", r"without (?:a )?subpoena"))},
        ],
        "weighed": [weighed("closely_regulated", "A closely regulated industry (the Burger exception may apply)",
                            _has(_rx(r"firearm", r"liquor", r"alcohol", r"mining", r"junkyard", r"pharmac", r"vessel", r"cruise", r"aircraft", r"nuclear", ev=False)))],
        "precedent": [rule(lambda i, t, f: "no_warrant" in f, "analogy", "patel", note="See v. Seattle and Patel apply by close analogy."),
                      rule(ALWAYS, "open", "burger", note="Ordinary inspections and subpoenas are usually lawful.")],
        "authorities": ["see_seattle", "patel", "burger", "carpenter"],
        "open_questions": ["How Carpenter applies to bulk data demands made to companies about their customers."],
    },
    {
        "code": "due_process_takings", "group": "rights",
        "label": "Property, takings, or due process",
        "applies": lambda item: True,
        "trigger": _rx(r"forfeit", r"taking(?:s)? of", r"takings clause", r"without (?:prior )?(?:notice|hearing)", r"interim final rule", r"retroactiv",
                       r"revoc", r"access easement", r"seiz", r"ex parte", r"summary suspension", r"moratorium"),
        "question": "Does the action take property or a license without the notice and hearing due process requires, or without fair notice of the rule?",
        "test": "The process due turns on the Mathews balance; agencies must give fair notice of prohibited conduct before "
                "sanctioning it (Fox); a right of physical access to property is a per se taking (Cedar Point).",
        "elements": [
            {"id": "deprivation", "gate": True, "text": "Property, money, or a license is taken or suspended", "detect": _has(_rx(r"forfeit", r"seiz", r"revok", r"revoc", r"taking of", r"easement", r"moratorium",
                                r"suspen(?:d|sion) (?:of )?(?:the |a |its )?(?:license|registration|permit|certificate|approval)"))},
            {"id": "no_hearing", "gate": True, "text": "Without prior notice or a hearing, or without fair notice of the standard",
             "detect": _has(_rx(r"without (?:prior )?(?:notice|hearing)", r"ex parte", r"summary (?:suspension|action)", r"immediately effective", r"interim final", r"retroactiv", r"vague", r"fair notice"))},
            {"id": "physical", "text": "A physical occupation or right of access to private property", "detect": _has(_rx(r"access easement", r"right (?:of|to) (?:physical )?(?:access|entry|enter)", r"occupation of"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: "physical" in f, "analogy", "cedar_point", note="Cedar Point applies by close analogy to a right of access."),
                      rule(lambda i, t, f: {"deprivation", "no_hearing"} <= set(f), "analogy", "mathews", note="Mathews and Fox apply by close analogy."),
                      rule(ALWAYS, "open", "mathews", note="Due process is a fact-specific balance.")],
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
            {"id": "punitive", "gate": True, "text": "A punitive fine, penalty, or forfeiture", "detect": _has(PENALTY)},
            {"id": "large", "gate": True, "text": "The amount is at least $1 million", "detect": lambda i, t: money_in(t) >= 1e6},
            {"id": "minor_offense", "text": "The underlying violation is described as technical, recordkeeping, or reporting only",
             "detect": _has(_rx(r"recordkeeping", r"record-keeping", r"failure to (?:file|report|preserve|maintain)", r"technical violation", r"paperwork"))},
        ],
        "weighed": [weighed("restitution", "The money is described as restitution to victims, which is generally remedial",
                            _has(_rx(r"restitution", r"refunds? to", r"redress", ev=False)))],
        "precedent": [rule(lambda i, t, f: "minor_offense" in f, "analogy", "bajakajian", note="A large punitive sum for a technical violation: Bajakajian applies by close analogy."),
                      rule(ALWAYS, "open", "bajakajian", note="Gross disproportionality is fact-specific; amounts alone are a screen.")],
        "authorities": ["bajakajian", "austin", "timbs"],
        "open_questions": ["How courts measure proportionality for corporate penalties calculated per violation."],
    },
    {
        "code": "equal_protection", "group": "rights",
        "label": "Classifications by race, sex, or other protected traits",
        "applies": lambda item: True,
        "trigger": _rx(r"race[- ]conscious", r"racial preference", r"set[- ]aside", r"disadvantaged business", r"diversity, equity",
                       r"\bDEI\b", r"sex[- ]based", r"race[- ]based", r"socially disadvantaged"),
        "question": "Does the action classify people by race or sex?",
        "test": "Federal racial classifications receive strict scrutiny (Adarand) and are rarely upheld after SFFA; "
                "sex classifications require an exceedingly persuasive justification (Virginia).",
        "elements": [
            {"id": "classification", "gate": True, "text": "The action classifies by race or sex", "detect": _has(_rx(r"race", r"racial", r"sex[- ]based", r"gender", r"disadvantaged", r"minority-owned", r"women-owned"))},
            {"id": "preference", "gate": True, "text": "It grants an express preference, presumption, or set-aside", "detect": _has(_rx(r"preference", r"set[- ]aside", r"presum", r"race[- ]conscious", r"goal"))},
        ],
        "weighed": [],
        "precedent": [rule(lambda i, t, f: {"classification", "preference"} <= set(f), "analogy", "sffa", before="analogy",
                           note="SFFA and Adarand apply by close analogy; strict scrutiny is rarely satisfied."),
                      rule(ALWAYS, "open", "adarand", note="Mentions of diversity programs are not themselves classifications.")],
        "authorities": ["adarand", "sffa", "vmi"],
        "open_questions": ["How SFFA applies to federal contracting presumptions of disadvantage."],
    },
]
ISSUE_BY_CODE = {i["code"]: i for i in ISSUES}

# ---------------------------------------------------------------------------------------- impact
SANCTION_POINTS = {
    4: ["criminal", "industry_bar", "officer_director_bar", "debarment", "revocation", "practice_suspension"],
    3: ["civil_penalty", "forfeiture_nal", "disgorgement", "seizure", "asset_freeze", "funding_cut"],
    2: ["cease_desist", "injunction", "suspension", "license_denial", "operations_order", "trading_suspension", "gag",
        "data_deletion", "undertakings", "recall", "import_action"],
    1: ["warning", "censure", "subpoena", "inspection", "corrective_disclosure", "restitution", "consent_order"],
}
_SANCTION_PTS = {k: p for p, ks in SANCTION_POINTS.items() for k in ks}


def impact(item, text):
    """Objective points for how much is at stake. Returns (level, points, breakdown). Never part of the rating."""
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
    level = 3 if points >= 7 else 2 if points >= 4 else 1
    return level, points, [{"marker": m, "points": p, "why": w} for m, p, w in parts]


# ---------------------------------------------------------------------------------------- rating
def _level(strength, coverage):
    if strength == 3:
        return 3 if coverage >= 1 else 2 if coverage >= 0.5 else 1
    if strength == 2:
        return 2 if coverage >= 1 else 1 if coverage >= 0.5 else 0
    return 1 if coverage >= 1 else 0


def assess(issue, item, text, summary_text=None):
    """Apply one issue's test to an item. Returns the stored flag (explanations live in taxonomy.json).
    level 0 means a possible issue that is not rated (gate elements missing, or too little evidence)."""
    found = [e["id"] for e in issue["elements"] if e["detect"](item, text)]
    from_full_text = []
    if summary_text is not None and summary_text != text:
        from_full_text = [e["id"] for e in issue["elements"] if e["id"] in found and not e["detect"](item, summary_text)]
    gates_ok = all(e["id"] in found for e in issue["elements"] if e.get("gate"))
    hits = [w for w in issue.get("weighed", []) if w["detect"](item, text)]
    rule_ = next(r for r in issue["precedent"] if r["when"](item, text, found))
    coverage = len(found) / len(issue["elements"])
    level = _level(STRENGTH[rule_["level"]], coverage) if gates_ok else 0
    if rule_["level"] == "open" and issue.get("open_rated") is False:
        level = 0   # an open question this common is listed as a possible issue, not rated

    def lowered(lv, factors):
        if lv <= 1:
            return lv
        return max(1, lv - sum(1 for w in factors if w["lowers"]))

    level = lowered(level, hits)   # today, every weighed factor counts, including ones based on later decisions
    out = {"code": issue["code"], "group": issue["group"], "structural": issue["group"] == "structural",
           "level": level, "precedent": rule_["level"], "authority": rule_["authority"], "elements_found": found,
           "elements_total": len(issue["elements"]), "weighed": [w["id"] for w in hits]}
    if from_full_text:
        out["full_text_elements"] = from_full_text
    decided = AUTHORITIES[rule_["authority"]]["decided"]
    if level and item.get("date") and item["date"] < decided:
        then_hits = [w for w in hits if not w.get("since") or (item.get("date") or "") >= w["since"]]
        then_level = lowered(_level(STRENGTH[rule_["before"]], coverage) if gates_ok else 0, then_hits)
        if then_level < level:
            out["at_the_time"] = {"level": then_level, "because": rule_["authority"]}
    return out


def apply_ruling(flag, ruling, item):
    """A court ruled on this specific action. The ruling sets the level (or, if it upheld the action, lowers it)."""
    if ruling["result"] == "upheld":
        if flag["level"] > 1:
            flag["level"] -= 1
        flag["weighed"] = flag.get("weighed", []) + ["upheld_by_court"]
    else:
        flag["level"] = max(flag.get("level", 0), rulings.level_of(ruling))
        flag["precedent"] = "direct"
        flag["authority"] = ruling["authority"]
        decided = AUTHORITIES[ruling["authority"]]["decided"]
        if item.get("date") and item["date"] < decided:
            flag["at_the_time"] = {"level": 0, "because": ruling["authority"]}
    flag["ruling"] = ruling["key"]
    return flag


def export():
    """JSON-safe doctrine library and rubric for the app and for DOCTRINE.md."""
    return {
        "doctrine": {
            "rubric_version": RUBRIC_VERSION,
            "review": REVIEW_STATUS,
            "authorities": AUTHORITIES,
            "statutes": [{"key": k, "label": label} for k, label, _ in STATUTES],
            "precedent_levels": [{"key": k, "label": STRENGTH_LABEL[k], "strength": v} for k, v in STRENGTH.items()],
            "rulings": rulings.export(),
            "issues": [{
                "code": i["code"], "group": i["group"], "label": i["label"], "question": i["question"], "test": i["test"],
                "elements": [{"id": e["id"], "text": e["text"], "gate": bool(e.get("gate"))} for e in i["elements"]],
                "weighed": [{"id": w["id"], "text": w["text"], "lowers": w["lowers"]} for w in i.get("weighed", [])],
                "precedent": [{"level": r["level"], "label": STRENGTH_LABEL[r["level"]], "authority": r["authority"],
                               "before": r["before"], "note": r["note"]} for r in i["precedent"]],
                "authorities": i["authorities"], "open_questions": i["open_questions"],
            } for i in ISSUES],
            "rubric": {
                "constitutionality": [
                    "The rating measures one thing: how likely it is that the action is unconstitutional, or exceeds the limits on executive power, under the law as it stands today. Impact is recorded separately and never affects it.",
                    "Precedent strength comes from the first rule in the memo that matches: a direct holding (a court has held this practice unlawful), a close analogy (a Supreme Court holding applies closely, or an appeals court has held the same practice unlawful), or an open question.",
                    "Gate elements must all appear before an action is rated. Without them, the issue is listed as a possible issue and not rated.",
                    "Almost certainly unconstitutional: a direct holding and every element found. Very likely: a direct holding with at least half the elements, or a close analogy with every element. Likely: any other rated issue.",
                    "Elements are looked for in the title, action line, and summary, and in the full text when RegCollect has read it. Each flag says which elements came from the full text.",
                    "Weighed factors (such as a contrary holding or a closely regulated industry) lower the rating by one step each but never remove it. Settlements are noted and do not lower it.",
                    "When a court has ruled on the specific action, the ruling sets the rating: Supreme Court, almost certainly; court of appeals, very likely; district court, likely. A ruling that upheld the action lowers the rating one step.",
                    "Ratings apply today's law. When the controlling decision came after the action, the flag notes that the action may have been lawful under the precedent at the time.",
                ],
                "impact": [
                    "Impact is noted for context only. It is not color-coded and does not affect the constitutionality rating.",
                    "Sanction points: 4 for criminal charges, bars, expulsions, debarment, revocations, and practice bans; 3 for civil penalties, forfeitures, disgorgement, seizures, asset freezes, and funding cuts; 2 for cease-and-desist orders, injunctions, suspensions, denials, shutdowns, gag terms, trading halts, data-deletion orders, monitors, recalls, and import actions; 1 for warnings, censures, subpoenas, inspections, compelled notices, restitution, and settlements.",
                    "Money points: 3 for at least $100 million, 2 for at least $1 million, 1 for any stated amount.",
                    "Reach points: 3 for presidential documents and rules designated economically significant or major; 2 for other final or proposed rules; 1 for actions against particular parties and self-regulatory filings.",
                    "Lower Impact: 1 to 3 points. Significant Impact: 4 to 6. Serious Impact: 7 or more.",
                ],
            },
        }
    }
