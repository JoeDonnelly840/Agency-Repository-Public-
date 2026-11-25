# RegCollect doctrine library and rating rubric

Status: **Draft, not yet reviewed**. Reviewer: (none yet). Last reviewed: (never).

This memo is generated from `collector/doctrine.py`, which the app uses to rate every flag. Edit that file (not this one), then run `python -m collector.doctrine_md` and `python -m collector.reclassify`.
Holdings are short paraphrases for screening purposes; verify every citation before relying on it.

## How ratings are computed

### Flagrance

- Precedent tier: 3 if the Supreme Court has held this specific practice unlawful; 2 if a Supreme Court holding applies by close analogy or a federal court of appeals has held the same practice unlawful; 1 if the question is open, split, or was resolved the other way.
- Element coverage: the share of the test's elements found in the document's title, action line, and summary.
- Flagrant: tier 3 and every element found. Substantial: tier 2 or 3 with at least half the elements found. Arguable: everything else.
- A counter-indicator (such as a settlement or a contrary holding) caps the rating at Arguable.
- Ratings apply today's law. When the controlling decision came after the action, the app also shows the rating at the time.

### Seriousness

- Sanction points: 4 for criminal charges, bars, expulsions, debarment, revocations, and practice bans; 3 for civil penalties, forfeitures, disgorgement, seizures, asset freezes, and funding cuts; 2 for cease-and-desist orders, injunctions, suspensions, denials, shutdowns, gag terms, trading halts, data-deletion orders, monitors, recalls, and import actions; 1 for warnings, censures, subpoenas, inspections, compelled notices, restitution, and settlements.
- Money points: 3 for at least $100 million, 2 for at least $1 million, 1 for any stated amount.
- Reach points: 3 for presidential documents and rules designated economically significant or major; 2 for other final or proposed rules; 1 for actions against particular parties and self-regulatory filings.
- Severe: 6 points or more. Significant: 3 to 5. Moderate: 0 to 2.

## Agency adjudication of penalties (jury trial and Article III)

Group: structural. Code: `agency_adjudication`.

**Question.** Is an agency deciding, in its own forum and without a jury, a penalty claim of the kind the Seventh Amendment and Article III reserve to the courts?

**Test.** Under Jarkesy, the jury right attaches when (1) the government seeks a legal remedy such as a civil penalty, (2) for a claim that resembles a common-law action (fraud is the paradigm), and (3) the public-rights exception does not apply. A structural problem arises when such a claim is (4) decided in the agency's own forum and (5) actually contested rather than settled by consent.

**Elements checked in each document:**

1. A civil penalty or similar punitive money remedy is sought
2. The claim resembles a common-law action (fraud, misrepresentation, deception)
3. The matter is decided in the agency's own forum
4. The matter is contested rather than settled by consent

**Counter-indicators (cap the rating at Arguable):**

- Described as settled or consented, so the jury right was likely waived
- FCC forfeiture order: FCC v. AT&T (2026) held these do not violate the Seventh Amendment
- Subject matter traditionally treated as a public right (customs, immigration, public lands, benefits, taxes)

**Precedent tier (first rule that matches):**

- Tier 3: SEC penalty claim for fraud: the facts of Jarkesy. (SEC v. Jarkesy, 603 U.S. 109 (2024))
- Tier 2: Fraud-like penalty claim at another agency: Jarkesy applies by close analogy. (SEC v. Jarkesy, 603 U.S. 109 (2024))
- Tier 1: No common-law analogue identified: Atlas Roofing may still permit agency adjudication of a purely statutory claim. (Atlas Roofing Co. v. OSHRC, 430 U.S. 442 (1977))

**Authorities:**

- *SEC v. Jarkesy, 603 U.S. 109 (2024)* (decided 2024-06-27): When the SEC seeks civil penalties for securities fraud, the Seventh Amendment entitles the defendant to a jury, and the public-rights exception does not apply.
- *Tull v. United States, 481 U.S. 412 (1987)* (decided 1987-04-28): Civil penalties are a legal remedy, so the defendant is entitled to a jury on liability in a government penalty suit.
- *Granfinanciera, S.A. v. Nordberg, 492 U.S. 33 (1989)* (decided 1989-06-23): Congress may not strip a jury right from a claim resembling a common-law action by assigning it to a non-Article III forum.
- *Atlas Roofing Co. v. OSHRC, 430 U.S. 442 (1977)* (decided 1977-03-23): Congress may assign new statutory 'public rights' (there, OSHA penalties) to agency adjudication without a jury; Jarkesy later confined this to claims without a common-law analogue.
- *Axon Enterprise, Inc. v. FTC, 598 U.S. 175 (2023)* (decided 2023-04-14): Parties may bring structural constitutional challenges to agency proceedings in federal district court without waiting for the agency to finish.
- *FCC v. AT&T, Inc., No. 25-406 (U.S. June 4, 2026)* (decided 2026-06-04): FCC forfeiture orders do not violate the Seventh Amendment because they do not definitively resolve liability and the FCC's findings are not conclusive in a later collection suit.

**Open questions:**

- How far Jarkesy reaches beyond fraud-like claims (for example, purely regulatory violations).
- Whether consent settlements negotiated under threat of in-house proceedings raise separate concerns.
- How FCC v. AT&T's reasoning applies to other agencies whose penalty orders are not self-executing.

## Appointment of officers (ALJs, hearing officers, and board members)

Group: structural. Code: `officer_appointment_removal`.

**Question.** Are officials exercising significant federal authority appointed, supervised, and reviewable as Article II requires?

**Test.** An official who holds a continuing position and exercises significant authority under federal law is an officer (Lucia) and must be appointed by the President, a department head, or a court of law; an inferior officer's final decisions must be reviewable by a principal officer (Arthrex).

**Elements checked in each document:**

1. An adjudicator or officer (ALJ, hearing officer, board member) is involved
2. The official exercises significant authority (decides cases, issues orders)
3. The document indicates an appointment, review, or removal problem

**Precedent tier (first rule that matches):**

- Tier 2: Lucia and Arthrex apply by close analogy. (Lucia v. SEC, 585 U.S. 237 (2018))
- Tier 1: No specific appointment or review defect is described. (United States v. Arthrex, Inc., 594 U.S. 1 (2021))

**Authorities:**

- *Lucia v. SEC, 585 U.S. 237 (2018)* (decided 2018-06-21): SEC administrative law judges are officers of the United States and must be appointed as the Appointments Clause requires.
- *United States v. Arthrex, Inc., 594 U.S. 1 (2021)* (decided 2021-06-21): Administrative judges may not issue final decisions that no principal officer can review.
- *Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)* (decided 2010-06-28): Two layers of for-cause protection between the President and officers of the PCAOB violate the separation of powers.

**Open questions:**

- Whether multi-level removal protection for ALJs survives after Free Enterprise Fund and Slaughter.

## Government power exercised by a private corporation

Group: structural. Code: `private_delegation`.

**Question.** Is a private self-regulatory organization exercising government power without adequate agency control?

**Test.** Private bodies may help administer federal law only if they function subordinately to an agency that retains final authority (Adkins; Consumers' Research). Delegating binding power to private parties without that control is forbidden (Carter Coal).

**Elements checked in each document:**

1. Issued by a private, agency-supervised corporation
2. The action binds members or the public (a rule or fee change)
3. Effective without prior agency approval (for example, immediately effective under 19(b)(3)(A))

**Precedent tier (first rule that matches):**

- Tier 1: Open question: Consumers' Research upheld a subordinate private administrator; Alpine addressed discipline, not rules. (FCC v. Consumers' Research, 606 U.S. ___ (2025))

**Authorities:**

- *Carter v. Carter Coal Co., 298 U.S. 238 (1936)* (decided 1936-05-18): Congress may not give private parties power to impose binding rules on their competitors.
- *Sunshine Anthracite Coal Co. v. Adkins, 310 U.S. 381 (1940)* (decided 1940-05-20): Private bodies may assist government if they function subordinately to an agency that has final authority.
- *Department of Transportation v. Association of American Railroads, 575 U.S. 43 (2015)* (decided 2015-03-09): Amtrak is a governmental entity for these purposes; the Court left the private-delegation questions for remand.
- *FCC v. Consumers' Research, 606 U.S. ___ (2025)* (decided 2025-06-27): The Universal Service Fund survives nondelegation challenge, and the FCC's reliance on a private administrator is lawful because the administrator is subordinate to the FCC.
- *Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)* (decided 2024-11-22): FINRA may not expel a member before the SEC has reviewed the expulsion (granting an injunction pending appeal).

**Open questions:**

- Whether immediately effective rule and fee changes give the SEC enough prior control.
- Whether FINRA and the exchanges are themselves government actors for constitutional purposes.

## Private corporation disciplining or expelling a member

Group: structural. Code: `private_discipline`.

**Question.** Is a private self-regulatory organization imposing severe discipline before any government review?

**Test.** The D.C. Circuit has held that FINRA may not expel a member before the SEC reviews the expulsion (Alpine).

**Elements checked in each document:**

1. A private, agency-supervised corporation
2. Discipline is imposed or proposed
3. The sanction is expulsion or a bar

**Precedent tier (first rule that matches):**

- Tier 2: A federal court of appeals has held this practice unlawful (Alpine). (Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024))
- Tier 1: Alpine addressed expulsion; lesser discipline is an open question. (Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024))

**Authorities:**

- *Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)* (decided 2024-11-22): FINRA may not expel a member before the SEC has reviewed the expulsion (granting an injunction pending appeal).
- *Carter v. Carter Coal Co., 298 U.S. 238 (1936)* (decided 1936-05-18): Congress may not give private parties power to impose binding rules on their competitors.
- *Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)* (decided 2010-06-28): Two layers of for-cause protection between the President and officers of the PCAOB violate the separation of powers.

**Open questions:**

- Whether Alpine's reasoning extends to fines and suspensions, and outside the D.C. Circuit.

## Delegation and major questions

Group: structural. Code: `major_questions`.

**Question.** Does the rule decide a question of vast economic or political significance without clear congressional authorization?

**Test.** Agencies need clear congressional authorization for rules of vast economic and political significance, especially when they claim newfound power in a long-standing statute (West Virginia v. EPA).

**Elements checked in each document:**

1. A binding final or proposed rule
2. Vast economic or political significance (economically significant, major, or nationwide)
3. A novel assertion of power (unprecedented, first-ever, transformative)

**Precedent tier (first rule that matches):**

- Tier 2: West Virginia v. EPA and Biden v. Nebraska apply by close analogy. (West Virginia v. EPA, 597 U.S. 697 (2022))
- Tier 1: Significance alone does not establish a major-questions problem. (West Virginia v. EPA, 597 U.S. 697 (2022))

**Authorities:**

- *West Virginia v. EPA, 597 U.S. 697 (2022)* (decided 2022-06-30): Agencies need clear congressional authorization to decide questions of vast economic and political significance.
- *Biden v. Nebraska, 600 U.S. 477 (2023)* (decided 2023-06-30): The student-loan forgiveness program exceeded the HEROES Act; the major questions doctrine reinforced that reading.
- *NFIB v. OSHA, 595 U.S. 109 (2022) (per curiam)* (decided 2022-01-13): OSHA's workplace vaccine-or-test mandate likely exceeded its statutory authority.
- *FCC v. Consumers' Research, 606 U.S. ___ (2025)* (decided 2025-06-27): The Universal Service Fund survives nondelegation challenge, and the FCC's reliance on a private administrator is lawful because the administrator is subordinate to the FCC.

**Open questions:**

- What counts as 'vast' significance, and whether the doctrine applies to deregulatory rules.

## Agency interpretation of an ambiguous statute

Group: structural. Code: `statutory_deference`.

**Question.** Does the action rest on deference to the agency's own reading of a statute?

**Test.** Courts decide what statutes mean without deferring to agencies (Loper Bright). Reliance on Chevron-style deference after June 28, 2024, rests on overruled law.

**Elements checked in each document:**

1. The agency interprets a statute
2. The agency invokes ambiguity or gap-filling
3. The agency relies on deference to its own reading

**Precedent tier (first rule that matches):**

- Tier 3: Loper Bright squarely rejects deference to agency statutory interpretation. (Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024))
- Tier 1: Interpretation without claimed deference is ordinary agency work. (Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024))

**Authorities:**

- *Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024)* (decided 2024-06-28): Courts must exercise independent judgment on statutory meaning and may not defer to an agency's reading because a statute is ambiguous; Chevron is overruled.
- *Kisor v. Wilkie, 588 U.S. 558 (2019)* (decided 2019-06-26): Deference to an agency's reading of its own regulation survives only for genuinely ambiguous rules and within strict limits.

**Open questions:**

- How much weight courts still give agency views under Skidmore after Loper Bright.

## Presidential control and removal of agency leaders

Group: structural. Code: `removal_independence`.

**Question.** Does the action remove or direct officials whose independence the law still protects?

**Test.** After Trump v. Slaughter (2026), the President may remove commissioners of agencies wielding executive power. Bodies the Court treats differently, such as the Federal Reserve (Trump v. Cook), remain protected.

**Elements checked in each document:**

1. The action removes or directs agency leaders
2. The body is one the Court still treats as protected (for example, the Federal Reserve)

**Precedent tier (first rule that matches):**

- Tier 2: Trump v. Cook protects Federal Reserve governors. (Trump v. Cook (U.S. June 29, 2026))
- Tier 1: After Slaughter, presidential removal of commissioners is generally lawful. (Trump v. Slaughter (U.S. June 29, 2026))

**Authorities:**

- *Trump v. Slaughter (U.S. June 29, 2026)* (decided 2026-06-29): Statutory limits on the President's power to remove FTC commissioners are unconstitutional; Humphrey's Executor is overruled.
- *Trump v. Cook (U.S. June 29, 2026)* (decided 2026-06-29): Upheld an injunction against the attempted removal of a Federal Reserve governor, treating the Federal Reserve differently.
- *Seila Law LLC v. CFPB, 591 U.S. 197 (2020)* (decided 2020-06-29): For-cause removal protection for the CFPB's single director is unconstitutional.
- *Myers v. United States, 272 U.S. 52 (1926)* (decided 1926-10-25): The President has power to remove executive officers he appoints.

**Open questions:**

- Which bodies, beyond the Federal Reserve, remain outside the President's at-will removal power.

## Spending, funding, and appropriations

Group: structural. Code: `spending_appropriations`.

**Question.** Is the executive withholding, redirecting, or self-funding money contrary to Congress's appropriations?

**Test.** The executive must spend funds as Congress directs (Train) and may withhold them only through the Impoundment Control Act's procedures.

**Elements checked in each document:**

1. Appropriated money is withheld, paused, or terminated
2. No statutory process (such as an Impoundment Control Act message) is cited
3. The action is broad (all grants, a whole program, or government-wide)

**Precedent tier (first rule that matches):**

- Tier 2: Train and the Impoundment Control Act apply by close analogy. (Train v. City of New York, 420 U.S. 35 (1975))
- Tier 1: Funding questions without withholding are open. (CFPB v. Community Financial Services Ass'n of America, 601 U.S. 416 (2024))

**Authorities:**

- *Train v. City of New York, 420 U.S. 35 (1975)* (decided 1975-02-18): The executive may not withhold funds Congress directed be allotted.
- *Impoundment Control Act of 1974, 2 U.S.C. 681–688* (decided 1974-07-12): Statute: the President may propose deferrals and rescissions but may not withhold appropriated funds without following the Act.
- *CFPB v. Community Financial Services Ass'n of America, 601 U.S. 416 (2024)* (decided 2024-05-16): The CFPB's funding mechanism satisfies the Appropriations Clause.

**Open questions:**

- Whether courts will enforce the Impoundment Control Act at the behest of private grantees.

## Creating, abolishing, or restructuring agencies and offices

Group: structural. Code: `agency_structure_change`.

**Question.** Is the executive restructuring or abolishing a body that Congress created by statute?

**Test.** Congress creates agencies and assigns their functions by statute; the executive may manage but not abolish them without authority (Youngstown framework).

**Elements checked in each document:**

1. Abolishes, eliminates, or dismantles an office or agency
2. Done by executive action rather than statute

**Precedent tier (first rule that matches):**

- Tier 1: Courts are still working out the limits of executive reorganization. (Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952))

**Authorities:**

- *Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)* (decided 1952-06-02): The President may not make law without constitutional or statutory authority; Justice Jackson's three-category framework.
- *Myers v. United States, 272 U.S. 52 (1926)* (decided 1926-10-25): The President has power to remove executive officers he appoints.

**Open questions:**

- Whether large reductions in force can effectively abolish a statutory function.

## Federalism (states, preemption, and conditions on federal funds)

Group: structural. Code: `federalism`.

**Question.** Does the action command state officials or coerce states through funding conditions?

**Test.** The federal government may not commandeer state officers or legislatures (Printz; Murphy) and may not attach coercive conditions to existing funds (NFIB v. Sebelius); conditions must be clear and related (Dole).

**Elements checked in each document:**

1. The action is directed at states or localities
2. It commands state officials or legislatures
3. It conditions existing federal funds on compliance

**Precedent tier (first rule that matches):**

- Tier 2: Printz and Murphy apply by close analogy. (Printz v. United States, 521 U.S. 898 (1997))
- Tier 2: NFIB v. Sebelius applies by close analogy. (NFIB v. Sebelius, 567 U.S. 519 (2012))
- Tier 1: Preemption and ordinary grant conditions are usually lawful. (South Dakota v. Dole, 483 U.S. 203 (1987))

**Authorities:**

- *Printz v. United States, 521 U.S. 898 (1997)* (decided 1997-06-27): The federal government may not command state officers to administer federal programs.
- *Murphy v. NCAA, 584 U.S. 453 (2018)* (decided 2018-05-14): Congress may not directly order state legislatures what laws to pass or not pass.
- *NFIB v. Sebelius, 567 U.S. 519 (2012)* (decided 2012-06-28): Conditions on federal funds become unconstitutionally coercive when they threaten existing funding the states depend on.
- *South Dakota v. Dole, 483 U.S. 203 (1987)* (decided 1987-06-23): Congress may attach clear, related, non-coercive conditions to federal grants.

**Open questions:**

- When executive (rather than congressional) funding conditions are unauthorized as well as coercive.

## Executive action that may act like legislation

Group: structural. Code: `presidential_lawmaking`.

**Question.** Does the presidential action rest on a constitutional or statutory power that actually authorizes it?

**Test.** Presidential orders need a source in the Constitution or a statute (Youngstown). IEEPA does not authorize tariffs (Learning Resources).

**Elements checked in each document:**

1. A presidential document
2. Imposes duties, tariffs, or prohibitions, or suspends a law
3. Rests on emergency powers or overrides a statute

**Precedent tier (first rule that matches):**

- Tier 3: IEEPA tariffs: the facts of Learning Resources. (Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026))
- Tier 1: Other statutory bases must be checked one by one. (Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952))

**Authorities:**

- *Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)* (decided 1952-06-02): The President may not make law without constitutional or statutory authority; Justice Jackson's three-category framework.
- *Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026)* (decided 2026-02-20): The International Emergency Economic Powers Act does not authorize the President to impose tariffs.
- *Dames & Moore v. Regan, 453 U.S. 654 (1981)* (decided 1981-07-02): Upheld presidential actions under IEEPA settling claims against Iran, in light of congressional acquiescence.

**Open questions:**

- The limits of tariff authority under Sections 122, 232, and 301.

## Gag orders, no-deny terms, and prior restraints on speech

Group: individual rights. Code: `speech_restraint`.

**Question.** Does the government condition a settlement or order on silence about the case?

**Test.** Prior restraints are presumptively invalid (Nebraska Press). Courts have so far upheld no-deny settlement terms as voluntary waivers (Powell; Romeril; Rumery), though the SEC rescinded its policy in May 2026.

**Elements checked in each document:**

1. A restriction on speaking about the matter
2. Imposed by a government order or settlement
3. Applies to public statements

**Precedent tier (first rule that matches):**

- Tier 1: Courts have upheld these terms so far; the question remains contested. (Powell v. SEC (9th Cir. Aug. 2025))

**Authorities:**

- *Nebraska Press Ass'n v. Stuart, 427 U.S. 539 (1976)* (decided 1976-06-30): Prior restraints on speech bear a heavy presumption against their validity.
- *Powell v. SEC (9th Cir. Aug. 2025)* (decided 2025-08-01): Upheld the SEC's no-deny settlement policy against a facial First Amendment challenge, while recognizing legitimate concerns; the SEC rescinded the policy in May 2026.
- *SEC v. Romeril, 15 F.4th 166 (2d Cir. 2021)* (decided 2021-09-29): Declined to relieve a defendant from a consent judgment's no-deny provision.
- *Town of Newton v. Rumery, 480 U.S. 386 (1987)* (decided 1987-03-09): Agreements waiving constitutional rights can be enforced if voluntary and not against public policy.

**Open questions:**

- Whether the Supreme Court will review no-deny provisions, and whether rescission moots the issue.

## Speech, press, religion, or association

Group: individual rights. Code: `first_amendment`.

**Question.** Does the action restrict or compel speech, or burden religion or association?

**Test.** Commercial-speech restrictions face intermediate scrutiny (Central Hudson); compelled factual disclosures must be reasonably related to preventing deception (Zauderer); regulators may not coerce others to suppress speech (Vullo).

**Elements checked in each document:**

1. Regulates speech, advertising, disclosure, or religion
2. Content-based or compelled

**Precedent tier (first rule that matches):**

- Tier 1: Outcome depends on the level of scrutiny and the fit of the rule. (Central Hudson Gas & Electric Corp. v. Public Service Comm'n, 447 U.S. 557 (1980))

**Authorities:**

- *Central Hudson Gas & Electric Corp. v. Public Service Comm'n, 447 U.S. 557 (1980)* (decided 1980-06-20): Sets the intermediate-scrutiny test for restrictions on commercial speech.
- *Zauderer v. Office of Disciplinary Counsel, 471 U.S. 626 (1985)* (decided 1985-05-28): Compelled factual, uncontroversial commercial disclosures are permissible if reasonably related to preventing deception and not unduly burdensome.
- *NRA v. Vullo, 602 U.S. 175 (2024)* (decided 2024-05-30): A regulator may not coerce third parties to punish or suppress protected speech.

**Open questions:**

- How Zauderer applies to disclosures that are arguably not purely factual or uncontroversial.

## Searches, inspections, records demands, or surveillance

Group: individual rights. Code: `fourth_amendment`.

**Question.** Does the action authorize searches or records demands without a warrant or neutral review?

**Test.** Administrative inspections generally require a warrant (See v. Seattle), and records demands require a chance for precompliance review (Patel), except in closely regulated industries (Burger).

**Elements checked in each document:**

1. A search, inspection, or demand for records or data
2. Without a warrant or precompliance review

**Counter-indicators (cap the rating at Arguable):**

- A closely regulated industry (Burger exception may apply)

**Precedent tier (first rule that matches):**

- Tier 2: See v. Seattle and Patel apply by close analogy. (City of Los Angeles v. Patel, 576 U.S. 409 (2015))
- Tier 1: Ordinary inspections and subpoenas are usually lawful. (New York v. Burger, 482 U.S. 691 (1987))

**Authorities:**

- *See v. City of Seattle, 387 U.S. 541 (1967)* (decided 1967-06-05): Administrative inspections of commercial premises generally require a warrant.
- *City of Los Angeles v. Patel, 576 U.S. 409 (2015)* (decided 2015-06-22): A demand for business records without an opportunity for precompliance review by a neutral decisionmaker is unconstitutional.
- *New York v. Burger, 482 U.S. 691 (1987)* (decided 1987-06-19): Warrantless inspections of closely regulated industries can be reasonable under set conditions.
- *Carpenter v. United States, 585 U.S. 296 (2018)* (decided 2018-06-22): Acquiring historical cell-site location records is a search requiring a warrant.

**Open questions:**

- How Carpenter applies to bulk data demands made to companies about their customers.

## Property, takings, or due process

Group: individual rights. Code: `due_process_takings`.

**Question.** Does the action take property or a license without the notice and hearing due process requires, or without fair notice of the rule?

**Test.** The process due turns on the Mathews balance; agencies must give fair notice of prohibited conduct before sanctioning it (Fox); a right of physical access to property is a per se taking (Cedar Point).

**Elements checked in each document:**

1. Property, money, or a license is taken or suspended
2. Without prior notice or a hearing
3. Retroactive or without fair notice of the standard

**Precedent tier (first rule that matches):**

- Tier 2: Mathews and Fox apply by close analogy. (Mathews v. Eldridge, 424 U.S. 319 (1976))
- Tier 1: Due process is a fact-specific balance. (Mathews v. Eldridge, 424 U.S. 319 (1976))

**Authorities:**

- *Mathews v. Eldridge, 424 U.S. 319 (1976)* (decided 1976-02-24): The process due before a deprivation is set by balancing the private interest, the risk of error, and the government's interest.
- *FCC v. Fox Television Stations, Inc., 567 U.S. 239 (2012)* (decided 2012-06-21): Due process requires fair notice of what conduct is prohibited before an agency sanctions it.
- *Cedar Point Nursery v. Hassid, 594 U.S. 139 (2021)* (decided 2021-06-23): A regulation granting a right to physically enter private property is a per se taking.
- *Culley v. Marshall, 601 U.S. 377 (2024)* (decided 2024-05-09): Due process requires a timely forfeiture hearing but not a separate preliminary retention hearing.

**Open questions:**

- When interim final rules adopted without comment also deny constitutionally adequate notice.

## Excessive fines and forfeitures

Group: individual rights. Code: `excessive_fines`.

**Question.** Is a punitive penalty or forfeiture grossly disproportional to the offense?

**Test.** Punitive fines and forfeitures violate the Eighth Amendment if grossly disproportional to the gravity of the offense (Bajakajian); civil forfeitures that partly punish are covered (Austin).

**Elements checked in each document:**

1. A punitive fine, penalty, or forfeiture
2. The amount is at least $1 million

**Counter-indicators (cap the rating at Arguable):**

- The money is described as restitution to victims, which is generally remedial

**Precedent tier (first rule that matches):**

- Tier 1: Gross disproportionality is fact-specific; amounts alone are a screen. (United States v. Bajakajian, 524 U.S. 321 (1998))

**Authorities:**

- *United States v. Bajakajian, 524 U.S. 321 (1998)* (decided 1998-06-22): A punitive forfeiture violates the Excessive Fines Clause if grossly disproportional to the offense.
- *Austin v. United States, 509 U.S. 602 (1993)* (decided 1993-06-28): Civil forfeitures that serve in part to punish are subject to the Excessive Fines Clause.
- *Timbs v. Indiana, 586 U.S. 146 (2019)* (decided 2019-02-20): The Excessive Fines Clause applies to the states.

**Open questions:**

- How courts measure proportionality for corporate penalties calculated per violation.

## Classifications by race, sex, or other protected traits

Group: individual rights. Code: `equal_protection`.

**Question.** Does the action classify people by race or sex?

**Test.** Federal racial classifications receive strict scrutiny (Adarand) and are rarely upheld after SFFA; sex classifications require an exceedingly persuasive justification (Virginia).

**Elements checked in each document:**

1. The action classifies by race or sex
2. It grants an express preference or set-aside

**Precedent tier (first rule that matches):**

- Tier 2: SFFA and Adarand apply by close analogy; strict scrutiny is rarely satisfied. (Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023))
- Tier 1: Mentions of diversity programs are not themselves classifications. (Adarand Constructors, Inc. v. Peña, 515 U.S. 200 (1995))

**Authorities:**

- *Adarand Constructors, Inc. v. Peña, 515 U.S. 200 (1995)* (decided 1995-06-12): Federal racial classifications are subject to strict scrutiny.
- *Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023)* (decided 2023-06-29): Race-conscious admissions programs at Harvard and UNC violate equal protection.
- *United States v. Virginia, 518 U.S. 515 (1996)* (decided 1996-06-26): Sex-based government classifications require an exceedingly persuasive justification.

**Open questions:**

- How SFFA applies to federal contracting presumptions of disadvantage.
