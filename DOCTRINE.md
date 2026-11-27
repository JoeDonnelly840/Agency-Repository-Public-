# RegCollect doctrine library and rating rubric

Rubric version 3.1. Status: **Draft, not yet reviewed**. Reviewer: (none yet). Last reviewed: (never).

This memo is generated from `collector/doctrine.py` and `collector/rulings.py`, which the app uses to rate every flag. Edit those files (not this one), then run `python -m collector.doctrine_md` and `python -m collector.reclassify`.
Holdings are short paraphrases for screening purposes; verify every citation before relying on it.

## How ratings are computed

### Constitutionality

- The rating measures one thing: how likely it is that the action is unconstitutional, or exceeds the limits on executive power, under the law as it stands today. Impact is recorded separately and never affects it.
- Precedent strength comes from the first rule in the memo that matches: a direct holding (a court has held this practice unlawful), a close analogy (a Supreme Court holding applies closely, or an appeals court has held the same practice unlawful), or an open question.
- Gate elements must all appear before an action is rated. Without them, the issue is listed as a possible issue and not rated.
- Almost certainly unconstitutional: a direct holding and every element found. Very likely: a direct holding with at least half the elements, or a close analogy with every element. Likely: any other rated issue.
- Elements are looked for in the title, action line, and summary, and in the full text when RegCollect has read it. Each flag says which elements came from the full text.
- Weighed factors (such as a contrary holding or a closely regulated industry) lower the rating by one step each but never remove it. Settlements are noted and do not lower it.
- When a court has ruled on the specific action, the ruling sets the rating: Supreme Court, almost certainly; court of appeals, very likely; district court, likely. A ruling that upheld the action lowers the rating one step.
- Ratings apply today's law. When the controlling decision came after the action, the flag notes that the action may have been lawful under the precedent at the time.

### Impact (context only)

- Impact is noted for context only. It is not color-coded and does not affect the constitutionality rating.
- Sanction points: 4 for criminal charges, bars, expulsions, debarment, revocations, and practice bans; 3 for civil penalties, forfeitures, disgorgement, seizures, asset freezes, and funding cuts; 2 for cease-and-desist orders, injunctions, suspensions, denials, shutdowns, gag terms, trading halts, data-deletion orders, monitors, recalls, and import actions; 1 for warnings, censures, subpoenas, inspections, compelled notices, restitution, and settlements.
- Money points: 3 for at least $100 million, 2 for at least $1 million, 1 for any stated amount.
- Reach points: 3 for presidential documents and rules designated economically significant or major; 2 for other final or proposed rules; 1 for actions against particular parties and self-regulatory filings.
- Lower Impact: 1 to 3 points. Significant Impact: 4 to 6. Serious Impact: 7 or more.

### Precedent strength

Every memo sorts its precedent into the same three levels:

- **Direct holding**
- **Close analogy**
- **Open question**

## Known rulings on specific actions

| Action | Court | Result | Rating | Kind of holding | Case |
|---|---|---|---|---|---|
| IEEPA tariff orders | Supreme Court | unlawful | 3 | statutory | *Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026)* |
| Clean Power Plan | Supreme Court | unlawful | 3 | statutory | *West Virginia v. EPA, 597 U.S. 697 (2022)* |
| CDC eviction moratorium | Supreme Court | unlawful | 3 | statutory | *Alabama Ass'n of Realtors v. HHS, 594 U.S. 758 (2021) (per curiam)* |
| OSHA vaccine-or-test emergency standard | Supreme Court | unlawful | 2 | statutory | *NFIB v. OSHA, 595 U.S. 109 (2022) (per curiam)* |
| CMS health-care staff vaccination rule | Supreme Court | upheld | lowers one step | statutory | *Biden v. Missouri, 595 U.S. 87 (2022) (per curiam)* |
| 2015 Clean Water Rule | Federal district court | unlawful | 1 | statutory | *Georgia v. Wheeler, 418 F. Supp. 3d 1336 (S.D. Ga. 2019)* |
| Department of Labor fiduciary rule (2016) | Federal court of appeals | unlawful | 2 | statutory | *Chamber of Commerce v. U.S. Department of Labor, 885 F.3d 360 (5th Cir. 2018)* |
| FCC net-neutrality order (2024) | Federal court of appeals | unlawful | 2 | statutory | *Ohio Telecom Ass'n v. FCC, 124 F.4th 993 (6th Cir. 2025)* |
| SEC private fund adviser rules | Federal court of appeals | unlawful | 2 | statutory | *National Ass'n of Private Fund Managers v. SEC, 103 F.4th 1097 (5th Cir. 2024)* |
| FTC non-compete rule | Federal district court | unlawful | 1 | statutory | *Ryan, LLC v. FTC, 746 F. Supp. 3d 369 (N.D. Tex. 2024)* |
| Department of Labor overtime rule (2024) | Federal district court | unlawful | 1 | statutory | *Texas v. U.S. Department of Labor, No. 4:24-cv-499 (E.D. Tex. Nov. 15, 2024)* |
| Department of Labor overtime rule (2016) | Federal district court | unlawful | 1 | statutory | *Nevada v. U.S. Department of Labor, 275 F. Supp. 3d 795 (E.D. Tex. 2017)* |
| NLRB joint-employer rule (2023) | Federal district court | unlawful | 1 | statutory | *Chamber of Commerce v. NLRB, No. 6:23-cv-553 (E.D. Tex. Mar. 8, 2024)* |
| HHS Section 1557 rule (2016) | Federal district court | unlawful | 1 | statutory and constitutional | *Franciscan Alliance, Inc. v. Burwell, 227 F. Supp. 3d 660 (N.D. Tex. 2016)* |

## Agency adjudication of penalties (jury trial and Article III)

Group: structural. Code: `agency_adjudication`.

**Question.** Is an agency deciding, in its own forum and without a jury, a penalty claim of the kind the Seventh Amendment and Article III reserve to the courts?

**Test.** Under Jarkesy, the jury right attaches when (1) the government seeks a legal remedy such as a civil penalty, (2) for a claim that resembles a common-law action (fraud is the paradigm), and (3) the public-rights exception does not apply. A structural problem arises when such a claim is (4) decided in the agency's own forum.

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. A civil penalty or similar punitive money remedy is sought *(gate)*
2. The claim resembles a common-law action (fraud, misrepresentation, deception)
3. The matter is decided in the agency's own forum *(gate)*

**Weighed factors:**

- Described as settled or consented. Noted only: a settlement does not cure the forum, and people settle for many reasons. (noted only)
- FCC forfeiture order: FCC v. AT&T (2026) held these do not violate the Seventh Amendment (lowers the rating one step)
- Subject matter traditionally treated as a public right (customs, immigration, public lands, benefits, taxes) (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: An SEC penalty claim for fraud decided in-house: the facts of Jarkesy. (SEC v. Jarkesy, 603 U.S. 109 (2024))
- Close analogy: A fraud-like penalty claim at another agency: Jarkesy applies by close analogy. (SEC v. Jarkesy, 603 U.S. 109 (2024))
- Open question: No common-law analogue identified: Atlas Roofing may still permit agency adjudication of a purely statutory claim. (Atlas Roofing Co. v. OSHRC, 430 U.S. 442 (1977))

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

## Appointment and supervision of officers (ALJs, hearing officers, and board members)

Group: structural. Code: `officer_appointment_removal`.

**Question.** Are officials exercising significant federal authority appointed, supervised, and reviewable as Article II requires?

**Test.** An official who holds a continuing position and exercises significant authority under federal law is an officer (Lucia) and must be appointed by the President, a department head, or a court of law; an inferior officer's final decisions must be reviewable by a principal officer (Arthrex).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. An adjudicator or officer (ALJ, hearing officer, board member) is involved *(gate)*
2. The official exercises significant authority (decides cases, issues orders)
3. The document indicates an appointment, review, or removal problem *(gate)*

**Weighed factors:**

- The agency head ratified the appointment, which usually cures an appointment defect going forward (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: Lucia and Arthrex hold that unappointed or unreviewable adjudicators violate Article II. (Lucia v. SEC, 585 U.S. 237 (2018))
- Close analogy: none yet for this kind of issue.
- Open question: No specific appointment or review defect is described. (United States v. Arthrex, Inc., 594 U.S. 1 (2021))

**Authorities:**

- *Lucia v. SEC, 585 U.S. 237 (2018)* (decided 2018-06-21): SEC administrative law judges are officers of the United States and must be appointed as the Appointments Clause requires.
- *United States v. Arthrex, Inc., 594 U.S. 1 (2021)* (decided 2021-06-21): Administrative judges may not issue final decisions that no principal officer can review.
- *Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)* (decided 2010-06-28): Two layers of for-cause protection between the President and officers of the PCAOB violate the separation of powers.
- *Collins v. Yellen, 594 U.S. 220 (2021)* (decided 2021-06-23): An unconstitutional removal restriction does not by itself void the agency's actions; a challenger must show the restriction caused harm.

**Open questions:**

- Whether multi-level removal protection for ALJs survives after Free Enterprise Fund and Slaughter.
- What remedy follows a removal defect after Collins v. Yellen.

## Government power exercised by a private corporation

Group: structural. Code: `private_delegation`.

**Question.** Is a private self-regulatory organization exercising government power without adequate agency control?

**Test.** Private bodies may help administer federal law only if they function subordinately to an agency that retains final authority (Adkins; Consumers' Research). Delegating binding power to private parties without that control is forbidden (Carter Coal).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Issued by a private, agency-supervised corporation *(gate)*
2. The action binds members or the public (a rule or fee change) *(gate)*
3. Effective without prior agency approval (for example, immediately effective under 19(b)(3)(A)) *(gate)*

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: none yet for this kind of issue.
- Open question: Open question: Consumers' Research upheld a subordinate private administrator; Alpine addressed discipline, not rules. (FCC v. Consumers' Research, 606 U.S. ___ (2025))

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

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. A private, agency-supervised corporation *(gate)*
2. Discipline is imposed or proposed *(gate)*
3. The sanction is expulsion or a bar

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: A federal court of appeals has held this practice unlawful (Alpine). (Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024))
- Open question: Alpine addressed expulsion; lesser discipline is an open question. (Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024))

**Authorities:**

- *Alpine Securities Corp. v. FINRA, 121 F.4th 1314 (D.C. Cir. 2024)* (decided 2024-11-22): FINRA may not expel a member before the SEC has reviewed the expulsion (granting an injunction pending appeal).
- *Carter v. Carter Coal Co., 298 U.S. 238 (1936)* (decided 1936-05-18): Congress may not give private parties power to impose binding rules on their competitors.
- *Free Enterprise Fund v. PCAOB, 561 U.S. 477 (2010)* (decided 2010-06-28): Two layers of for-cause protection between the President and officers of the PCAOB violate the separation of powers.

**Open questions:**

- Whether Alpine's reasoning extends to fines and suspensions, and outside the D.C. Circuit.

## Agency authority, delegation, and major questions

Group: structural. Code: `major_questions`.

**Question.** Does the rule decide a question of vast economic or political significance, or claim a power, without clear congressional authorization?

**Test.** Agencies need clear congressional authorization for rules of vast economic and political significance, especially when they claim newfound power in a long-standing statute (West Virginia v. EPA; Alabama Realtors; NFIB v. OSHA). Agencies have only the power Congress gives them.

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. A binding rule, order, or program *(gate)*
2. Vast economic or political significance (economically significant, major, nationwide, or billions at stake) *(gate)*
3. A novel or expansive assertion of power (unprecedented, first-ever, transformative, emergency)
4. Rests on a broad, general, or long-standing statutory provision (or emergency authority)

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: West Virginia v. EPA, Alabama Realtors, and NFIB v. OSHA apply by close analogy. (West Virginia v. EPA, 597 U.S. 697 (2022))
- Open question: Significance alone does not establish a major-questions problem. (West Virginia v. EPA, 597 U.S. 697 (2022))

**Authorities:**

- *West Virginia v. EPA, 597 U.S. 697 (2022)* (decided 2022-06-30): Agencies need clear congressional authorization to decide questions of vast economic and political significance; the Clean Power Plan's generation-shifting approach exceeded the Clean Air Act.
- *Biden v. Nebraska, 600 U.S. 477 (2023)* (decided 2023-06-30): The student-loan forgiveness program exceeded the HEROES Act; the major questions doctrine reinforced that reading.
- *NFIB v. OSHA, 595 U.S. 109 (2022) (per curiam)* (decided 2022-01-13): OSHA's workplace vaccine-or-test mandate likely exceeded its statutory authority; the Court stayed it.
- *Alabama Ass'n of Realtors v. HHS, 594 U.S. 758 (2021) (per curiam)* (decided 2021-08-26): The CDC's nationwide eviction moratorium exceeded its authority under section 361 of the Public Health Service Act.
- *Sackett v. EPA, 598 U.S. 651 (2023)* (decided 2023-05-25): The Clean Water Act reaches only wetlands with a continuous surface connection to traditional waters; the 'significant nexus' test is rejected.
- *FCC v. Consumers' Research, 606 U.S. ___ (2025)* (decided 2025-06-27): The Universal Service Fund survives nondelegation challenge, and the FCC's reliance on a private administrator is lawful because the administrator is subordinate to the FCC.
- *Biden v. Missouri, 595 U.S. 87 (2022) (per curiam)* (decided 2022-01-13): Allowed the CMS rule requiring vaccination of staff at Medicare- and Medicaid-funded facilities to take effect.

**Open questions:**

- What counts as 'vast' significance, and whether the doctrine applies to deregulatory rules.
- Whether the major questions doctrine applies to the President's own actions as it does to agencies.

## Agency interpretation of an ambiguous statute (Chevron and Loper Bright)

Group: structural. Code: `statutory_deference`.

**Question.** Does the action rest on deference to the agency's own reading of a statute?

**Test.** Courts decide what statutes mean without deferring to agencies (Loper Bright). Reliance on Chevron-style deference rests on overruled law, even for rules issued while Chevron governed.

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. The agency interprets a statute
2. The agency invokes ambiguity or gap-filling
3. The agency relies on deference to its own reading *(gate)*

**Precedent (first rule that matches):**

- Direct holding: Loper Bright squarely rejects deference to agency statutory interpretation. Rules relying on Chevron stood on governing law when issued. (Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024))
- Close analogy: none yet for this kind of issue.
- Open question: Interpretation without claimed deference is ordinary agency work. (Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024))

**Authorities:**

- *Loper Bright Enterprises v. Raimondo, 603 U.S. 369 (2024)* (decided 2024-06-28): Courts must exercise independent judgment on statutory meaning and may not defer to an agency's reading because a statute is ambiguous; Chevron is overruled.
- *Kisor v. Wilkie, 588 U.S. 558 (2019)* (decided 2019-06-26): Deference to an agency's reading of its own regulation survives only for genuinely ambiguous rules and within strict limits.

**Open questions:**

- How much weight courts still give agency views under Skidmore after Loper Bright.
- Loper Bright did not reopen past cases that upheld rules under Chevron (statutory stare decisis).

## Presidential control and removal of agency leaders

Group: structural. Code: `removal_independence`.

**Question.** Does the action remove or direct officials whose independence the law still protects?

**Test.** After Trump v. Slaughter (2026), the President may remove commissioners of agencies wielding executive power. Bodies the Court treats differently, such as the Federal Reserve (Trump v. Cook), remain protected.

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. The action removes or directs agency leaders *(gate)*
2. The body is one the Court still treats as protected (for example, the Federal Reserve) *(gate)*

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: Trump v. Cook protects Federal Reserve governors. (Trump v. Cook (U.S. June 29, 2026))
- Open question: After Slaughter, presidential removal of commissioners is generally lawful. (Trump v. Slaughter (U.S. June 29, 2026))

**Authorities:**

- *Trump v. Slaughter (U.S. June 29, 2026)* (decided 2026-06-29): Statutory limits on the President's power to remove FTC commissioners are unconstitutional; Humphrey's Executor is overruled.
- *Trump v. Cook (U.S. June 29, 2026)* (decided 2026-06-29): Upheld an injunction against the attempted removal of a Federal Reserve governor, treating the Federal Reserve differently.
- *Seila Law LLC v. CFPB, 591 U.S. 197 (2020)* (decided 2020-06-29): For-cause removal protection for the CFPB's single director is unconstitutional.
- *Collins v. Yellen, 594 U.S. 220 (2021)* (decided 2021-06-23): An unconstitutional removal restriction does not by itself void the agency's actions; a challenger must show the restriction caused harm.
- *Myers v. United States, 272 U.S. 52 (1926)* (decided 1926-10-25): The President has power to remove executive officers he appoints.

**Open questions:**

- Which bodies, beyond the Federal Reserve, remain outside the President's at-will removal power.

## Spending, funding, and appropriations

Group: structural. Code: `spending_appropriations`.

**Question.** Is the executive withholding, redirecting, or self-funding money contrary to Congress's appropriations?

**Test.** The executive must spend funds as Congress directs (Train) and may withhold them only through the Impoundment Control Act's procedures.

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Appropriated money is withheld, paused, or terminated *(gate)*
2. No statutory process (such as an Impoundment Control Act message) is cited
3. The action is broad (all grants, a whole program, or government-wide)

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: Train and the Impoundment Control Act apply by close analogy. (Train v. City of New York, 420 U.S. 35 (1975))
- Open question: Funding questions without withholding are open. (CFPB v. Community Financial Services Ass'n of America, 601 U.S. 416 (2024))

**Authorities:**

- *Train v. City of New York, 420 U.S. 35 (1975)* (decided 1975-02-18): The executive may not withhold funds Congress directed be allotted.
- *Impoundment Control Act of 1974, 2 U.S.C. 681–688* (decided 1974-07-12): Statute: the President may propose deferrals and rescissions but may not withhold appropriated funds without following the Act.
- *CFPB v. Community Financial Services Ass'n of America, 601 U.S. 416 (2024)* (decided 2024-05-16): The CFPB's funding mechanism satisfies the Appropriations Clause.

**Open questions:**

- Whether courts will enforce the Impoundment Control Act at the behest of private grantees.

## Creating, abolishing, or restructuring agencies and offices

Group: structural. Code: `agency_structure_change`.

**Question.** Is the executive restructuring or abolishing a body that Congress created by statute?

**Test.** Congress creates agencies and assigns their functions by statute; the executive may manage but not abolish them without authority (Youngstown framework; In re Aiken County).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Abolishes, eliminates, or dismantles an office or agency *(gate)*
2. Done by executive action rather than statute *(gate)*
3. The body or function was created by statute

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: Aiken County and Youngstown apply by close analogy when a statutory function is abandoned. (In re Aiken County, 725 F.3d 255 (D.C. Cir. 2013))
- Open question: Courts are still working out the limits of executive reorganization. (Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952))

**Authorities:**

- *Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)* (decided 1952-06-02): The President may not make law without constitutional or statutory authority; Justice Jackson's three-category framework.
- *In re Aiken County, 725 F.3d 255 (D.C. Cir. 2013)* (decided 2013-08-13): An agency may not decline to follow a statutory mandate simply because it disagrees with it or lacks enthusiasm for it.
- *Myers v. United States, 272 U.S. 52 (1926)* (decided 1926-10-25): The President has power to remove executive officers he appoints.

**Open questions:**

- Whether large reductions in force can effectively abolish a statutory function.

## Federalism (states, preemption, and conditions on federal funds)

Group: structural. Code: `federalism`.

**Question.** Does the action command state officials or coerce states through funding conditions?

**Test.** The federal government may not commandeer state officers or legislatures (Printz; Murphy) and may not attach coercive conditions to existing funds (NFIB v. Sebelius); conditions must be clear and related (Dole).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. The action is directed at states or localities *(gate)*
2. It commands state officials or legislatures
3. It conditions existing federal funds on compliance

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: Printz and Murphy apply by close analogy. (Printz v. United States, 521 U.S. 898 (1997))
- Close analogy: NFIB v. Sebelius applies by close analogy. (NFIB v. Sebelius, 567 U.S. 519 (2012))
- Open question: Preemption and ordinary grant conditions are usually lawful. (South Dakota v. Dole, 483 U.S. 203 (1987))

**Authorities:**

- *Printz v. United States, 521 U.S. 898 (1997)* (decided 1997-06-27): The federal government may not command state officers to administer federal programs.
- *Murphy v. NCAA, 584 U.S. 453 (2018)* (decided 2018-05-14): Congress may not directly order state legislatures what laws to pass or not pass.
- *NFIB v. Sebelius, 567 U.S. 519 (2012)* (decided 2012-06-28): Conditions on federal funds become unconstitutionally coercive when they threaten existing funding the states depend on.
- *South Dakota v. Dole, 483 U.S. 203 (1987)* (decided 1987-06-23): Congress may attach clear, related, non-coercive conditions to federal grants.

**Open questions:**

- When executive (rather than congressional) funding conditions are unauthorized as well as coercive.

## Executive action that makes law (emergency powers, tariffs, and suspending or rewriting statutes)

Group: structural. Code: `presidential_lawmaking`.

**Question.** Does an executive action impose duties, taxes, or prohibitions on the public, or set aside a statute, without a power the Constitution or Congress actually gives?

**Test.** The President's power to act must come from the Constitution or a statute (Youngstown). Jackson's framework: power is greatest with Congress's authorization, weakest when the action is incompatible with Congress's will. Taxes and tariffs are Congress's power (Art. I, sec. 8), and IEEPA does not delegate it (Learning Resources). The executive may not cancel or suspend duly enacted statutes (Clinton v. City of New York; In re Aiken County). Courts read general or emergency statutes narrowly when they are used for sweeping measures.

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Imposes duties, tariffs, fees, or prohibitions on the public, or suspends or waives a statute *(gate)*
2. Rests on an emergency power or a general statute rather than a specific grant
3. The power claimed is one the cited statute does not clearly give (for example, tariffs under IEEPA, or overriding a statute)
4. Applies to private parties or the public (importers, businesses, people), not just to agencies

**Weighed factors:**

- Also rests on a trade statute courts have read broadly (Section 232, 301, 122, or 201) (lowers the rating one step)
- Restricts entry of noncitizens under INA 212(f), which Trump v. Hawaii read broadly (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: Tariffs or duties imposed under IEEPA: the facts of Learning Resources. (Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026))
- Close analogy: Suspending, waiving, or refusing to enforce a statute: Clinton v. City of New York and In re Aiken County apply by close analogy. (Clinton v. City of New York, 524 U.S. 417 (1998))
- Close analogy: Other IEEPA measures that operate like taxes or regulation of commerce: Learning Resources applies by close analogy. (Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026))
- Open question: Other bases (Sections 232, 301, 122, 212(f), and emergency statutes) must be checked one by one under Youngstown. (Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952))

**Authorities:**

- *Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)* (decided 1952-06-02): The President may not make law without constitutional or statutory authority; Justice Jackson's three-category framework.
- *Learning Resources, Inc. v. Trump (U.S. Feb. 20, 2026)* (decided 2026-02-20): The International Emergency Economic Powers Act does not authorize the President to impose tariffs.
- *Clinton v. City of New York, 524 U.S. 417 (1998)* (decided 1998-06-25): The President may not cancel or amend parts of duly enacted statutes; the Line Item Veto Act is unconstitutional.
- *In re Aiken County, 725 F.3d 255 (D.C. Cir. 2013)* (decided 2013-08-13): An agency may not decline to follow a statutory mandate simply because it disagrees with it or lacks enthusiasm for it.
- *Dames & Moore v. Regan, 453 U.S. 654 (1981)* (decided 1981-07-02): Upheld presidential actions under IEEPA settling claims against Iran, in light of congressional acquiescence.
- *Federal Energy Administration v. Algonquin SNG, Inc., 426 U.S. 548 (1976)* (decided 1976-06-17): Section 232 lets the President adjust imports through license fees as well as quotas.
- *Trump v. Hawaii, 585 U.S. 667 (2018)* (decided 2018-06-26): Upheld a presidential proclamation restricting entry under INA section 212(f).
- *Biden v. Nebraska, 600 U.S. 477 (2023)* (decided 2023-06-30): The student-loan forgiveness program exceeded the HEROES Act; the major questions doctrine reinforced that reading.

**Open questions:**

- The limits of tariff authority under Sections 122, 232, and 301 after Learning Resources.
- Whether the major questions doctrine constrains the President directly, or only agencies.
- When nonenforcement policies become a refusal to execute the law.

## Gag orders, no-deny terms, and prior restraints on speech

Group: individual rights. Code: `speech_restraint`.

**Question.** Does the government condition a settlement or order on silence about the case?

**Test.** Prior restraints are presumptively invalid (Nebraska Press). Courts have so far upheld no-deny settlement terms as voluntary waivers (Powell; Romeril; Rumery), though the SEC rescinded its policy in May 2026.

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. A restriction on speaking about the matter *(gate)*
2. Imposed by a government order or settlement
3. Applies to public statements

**Weighed factors:**

- Courts of appeals have upheld no-deny terms as voluntary waivers (Powell; Romeril) (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: none yet for this kind of issue.
- Open question: Prior-restraint doctrine applies, but courts have upheld these terms so far; the question remains contested. (Nebraska Press Ass'n v. Stuart, 427 U.S. 539 (1976))

**Authorities:**

- *Nebraska Press Ass'n v. Stuart, 427 U.S. 539 (1976)* (decided 1976-06-30): Prior restraints on speech bear a heavy presumption against their validity.
- *Powell v. SEC (9th Cir. Aug. 2025)* (decided 2025-08-01): Upheld the SEC's no-deny settlement policy against a facial First Amendment challenge, while recognizing legitimate concerns; the SEC rescinded the policy in May 2026.
- *SEC v. Romeril, 15 F.4th 166 (2d Cir. 2021)* (decided 2021-09-29): Declined to relieve a defendant from a consent judgment's no-deny provision.
- *Town of Newton v. Rumery, 480 U.S. 386 (1987)* (decided 1987-03-09): Agreements waiving constitutional rights can be enforced if voluntary and not against public policy.

**Open questions:**

- Whether the Supreme Court will review no-deny provisions, and whether rescission moots the issue.

## Freedom of speech and the press

Group: individual rights. Code: `free_speech`.

**Question.** Does the action restrict or compel speech, or pressure others to suppress it?

**Test.** Content-based restrictions face strict scrutiny (Reed); commercial-speech restrictions face intermediate scrutiny (Central Hudson), heightened when speaker- or content-based (Sorrell). Compelled disclosures are allowed only if purely factual, uncontroversial, and reasonably related to preventing deception (Zauderer); others face heightened scrutiny (NIFLA). Government may not compel expressive work (303 Creative), override editorial judgment (Moody), or coerce third parties to suppress speech (Vullo).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Regulates speech, advertising, labels, disclosures, publishing, or editorial choices *(gate)*
2. Content-based, viewpoint-based, or compelled
3. Compels opinion, controversial, or non-factual statements, or targets protected expression

**Weighed factors:**

- Requires only factual, uncontroversial information about the speaker's own products (Zauderer) (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: NIFLA, Reed, and Vullo apply by close analogy to content-based or non-factual compulsion. (National Institute of Family & Life Advocates v. Becerra, 585 U.S. 755 (2018))
- Open question: Outcome depends on the level of scrutiny and the fit of the rule. (Central Hudson Gas & Electric Corp. v. Public Service Comm'n, 447 U.S. 557 (1980))

**Authorities:**

- *Reed v. Town of Gilbert, 576 U.S. 155 (2015)* (decided 2015-06-18): Laws that regulate speech because of its topic or message are content-based and must satisfy strict scrutiny.
- *Central Hudson Gas & Electric Corp. v. Public Service Comm'n, 447 U.S. 557 (1980)* (decided 1980-06-20): Sets the intermediate-scrutiny test for restrictions on commercial speech.
- *Sorrell v. IMS Health Inc., 564 U.S. 552 (2011)* (decided 2011-06-23): Content- and speaker-based burdens on commercial information receive heightened scrutiny.
- *Zauderer v. Office of Disciplinary Counsel, 471 U.S. 626 (1985)* (decided 1985-05-28): Compelled factual, uncontroversial commercial disclosures are permissible if reasonably related to preventing deception and not unduly burdensome.
- *National Institute of Family & Life Advocates v. Becerra, 585 U.S. 755 (2018)* (decided 2018-06-26): Compelled notices that are not purely factual and uncontroversial information about the speaker's own services fall outside Zauderer and face heightened scrutiny.
- *303 Creative LLC v. Elenis, 600 U.S. 570 (2023)* (decided 2023-06-30): Government may not compel a person to create expressive work conveying a message she does not hold.
- *Moody v. NetChoice, LLC, 603 U.S. 707 (2024)* (decided 2024-07-01): A platform's curation of third-party content is protected expression; government may not override it to rebalance the marketplace of ideas.
- *NRA v. Vullo, 602 U.S. 175 (2024)* (decided 2024-05-30): A regulator may not coerce third parties to punish or suppress protected speech.
- *Murthy v. Missouri, 603 U.S. 43 (2024)* (decided 2024-06-26): Plaintiffs lacked standing to challenge federal officials' communications with platforms about content moderation.

**Open questions:**

- How Zauderer applies to disclosures that are arguably not purely factual or uncontroversial (for example, climate or ESG disclosures).
- How Moody applies to agency rules affecting platform moderation.

## Religious liberty (Free Exercise, Establishment, RFRA, and RLUIPA)

Group: individual rights. Code: `free_exercise`.

**Question.** Does the action burden religious exercise, discriminate against religion, or favor one religion over another?

**Test.** Constitution: a neutral, generally applicable rule that incidentally burdens religion gets rational-basis review (Smith); a rule that targets religion, is not neutral, allows individualized exemptions (Fulton), or treats any comparable secular activity better (Tandon) must survive strict scrutiny (Lukumi). Government may not exclude religious groups from public benefits (Carson) or draw lines between denominations (Catholic Charities). Statutes: for federal action RFRA applies strict scrutiny even to neutral, generally applicable rules: a substantial burden must be the least restrictive means of serving a compelling interest (Hobby Lobby; O Centro). RLUIPA applies the same test to land-use rules and to federally funded prisons and institutions (Holt).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Affects religious exercise, religious organizations, or houses of worship *(gate)*
2. Imposes a requirement, penalty, or loss of benefits that burdens that exercise *(gate)*
3. Not neutral or generally applicable (singles out religion, has exemptions for secular reasons, or discretionary exemptions)
4. No religious exemption or accommodation is provided, or one is removed

**Weighed factors:**

- Provides a religious exemption or accommodation (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: Fulton, Tandon, and Lukumi apply by close analogy; for federal action RFRA independently requires strict scrutiny (Hobby Lobby). (Fulton v. City of Philadelphia, 593 U.S. 522 (2021))
- Close analogy: A federal requirement that burdens religious exercise without accommodation: RFRA and Hobby Lobby apply by close analogy. (Burwell v. Hobby Lobby Stores, Inc., 573 U.S. 682 (2014))
- Open question: A neutral, generally applicable rule gets rational-basis review under Smith, but RFRA still requires strict scrutiny of substantial burdens imposed by the federal government. (Employment Division v. Smith, 494 U.S. 872 (1990))

**Authorities:**

- *Employment Division v. Smith, 494 U.S. 872 (1990)* (decided 1990-04-17): A neutral, generally applicable law that incidentally burdens religious exercise does not violate the Free Exercise Clause.
- *Church of the Lukumi Babalu Aye, Inc. v. City of Hialeah, 508 U.S. 520 (1993)* (decided 1993-06-11): A law that targets religious practice or is not neutral and generally applicable must satisfy strict scrutiny.
- *Fulton v. City of Philadelphia, 593 U.S. 522 (2021)* (decided 2021-06-17): A rule is not generally applicable if it allows individualized, discretionary exemptions; refusing one to a religious objector triggers strict scrutiny.
- *Tandon v. Newsom, 593 U.S. 61 (2021) (per curiam)* (decided 2021-04-09): A rule triggers strict scrutiny when it treats any comparable secular activity more favorably than religious exercise.
- *Carson v. Makin, 596 U.S. 767 (2022)* (decided 2022-06-21): Government may not exclude religious organizations or uses from a generally available public benefit because they are religious.
- *Kennedy v. Bremerton School District, 597 U.S. 507 (2022)* (decided 2022-06-27): Establishment Clause questions are decided by historical practice and understanding, not the Lemon test; government may not punish private religious expression.
- *Catholic Charities Bureau, Inc. v. Wisconsin Labor & Industry Review Comm'n, 605 U.S. ___ (2025)* (decided 2025-06-05): Government may not grant or deny a religious exemption based on theological distinctions between denominations.
- *Mahmoud v. Taylor, 606 U.S. ___ (2025)* (decided 2025-06-27): Government policies that substantially interfere with parents' religious upbringing of their children trigger strict scrutiny, even if neutral and generally applicable.
- *Religious Freedom Restoration Act of 1993, 42 U.S.C. 2000bb to 2000bb-4* (decided 1993-11-16): Statute: the federal government may not substantially burden a person's religious exercise, even by a neutral and generally applicable rule, unless it uses the least restrictive means of furthering a compelling interest.
- *City of Boerne v. Flores, 521 U.S. 507 (1997)* (decided 1997-06-25): RFRA cannot be applied to the states, but it continues to bind the federal government.
- *Burwell v. Hobby Lobby Stores, Inc., 573 U.S. 682 (2014)* (decided 2014-06-30): The HHS contraceptive mandate, as applied to closely held corporations with religious objections, violated RFRA because less restrictive means were available.
- *Gonzales v. O Centro Espírita Beneficente União do Vegetal, 546 U.S. 418 (2006)* (decided 2006-02-21): Under RFRA the government must justify applying a law to the particular religious claimant, not just the law in general.
- *Little Sisters of the Poor v. Pennsylvania, 591 U.S. 657 (2020)* (decided 2020-07-08): Agencies may, and in some cases must, consider RFRA when writing rules, and may create religious exemptions.
- *Tanzin v. Tanvir, 592 U.S. 43 (2020)* (decided 2020-12-10): RFRA permits damages suits against federal officials in their individual capacities.
- *Religious Land Use and Institutionalized Persons Act of 2000, 42 U.S.C. 2000cc to 2000cc-5* (decided 2000-09-22): Statute: applies RFRA's strict-scrutiny test to land-use regulation and to prisons and other institutions that receive federal funds.
- *Holt v. Hobbs, 574 U.S. 352 (2015)* (decided 2015-01-20): Under RLUIPA a prison grooming rule that barred a religious beard was not the least restrictive means.

**Open questions:**

- Whether the Court will overrule Smith (several Justices have urged it).
- How Mahmoud's parental-rights reasoning applies to federal programs and conditions on funds.
- How RLUIPA applies when federal agencies set conditions for state prisons or land-use programs.

## Freedom of association and donor privacy

Group: individual rights. Code: `association`.

**Question.** Does the action compel disclosure of members or donors, or penalize joining or supporting a group?

**Test.** Compelled disclosure of members or donors must survive exacting scrutiny: narrow tailoring to a sufficiently important interest (Americans for Prosperity; NAACP v. Alabama). Burdens on expressive association need a compelling interest unrelated to suppressing ideas (Roberts v. Jaycees).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Requires disclosure of members, donors, owners, or supporters, or penalizes association *(gate)*
2. Applies broadly or in bulk rather than case by case
3. The information may be made public or shared widely

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: Americans for Prosperity applies by close analogy to broad donor or member disclosure. (Americans for Prosperity Foundation v. Bonta, 594 U.S. 595 (2021))
- Open question: Disclosure rules are judged by exacting scrutiny case by case. (NAACP v. Alabama ex rel. Patterson, 357 U.S. 449 (1958))

**Authorities:**

- *NAACP v. Alabama ex rel. Patterson, 357 U.S. 449 (1958)* (decided 1958-06-30): Compelled disclosure of an association's membership lists can unconstitutionally burden freedom of association.
- *Americans for Prosperity Foundation v. Bonta, 594 U.S. 595 (2021)* (decided 2021-07-01): Compelled disclosure of donor identities must be narrowly tailored to a sufficiently important interest (exacting scrutiny).
- *Roberts v. United States Jaycees, 468 U.S. 609 (1984)* (decided 1984-07-03): Freedom of expressive association may be infringed only by regulations serving compelling interests unrelated to suppressing ideas that cannot be achieved by less restrictive means.

**Open questions:**

- How Americans for Prosperity applies to federal beneficial-ownership and political-disclosure rules.

## Searches, inspections, records demands, or surveillance

Group: individual rights. Code: `fourth_amendment`.

**Question.** Does the action authorize searches or records demands without a warrant or neutral review?

**Test.** Administrative inspections generally require a warrant (See v. Seattle), and records demands require a chance for precompliance review (Patel), except in closely regulated industries (Burger).

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. A search, inspection, or demand for records or data *(gate)*
2. Without a warrant or precompliance review *(gate)*

**Weighed factors:**

- A closely regulated industry (the Burger exception may apply) (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: See v. Seattle and Patel apply by close analogy. (City of Los Angeles v. Patel, 576 U.S. 409 (2015))
- Open question: Ordinary inspections and subpoenas are usually lawful. (New York v. Burger, 482 U.S. 691 (1987))

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

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. Property, money, or a license is taken or suspended *(gate)*
2. Without prior notice or a hearing, or without fair notice of the standard *(gate)*
3. A physical occupation or right of access to private property

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: Cedar Point applies by close analogy to a right of access. (Cedar Point Nursery v. Hassid, 594 U.S. 139 (2021))
- Close analogy: Mathews and Fox apply by close analogy. (Mathews v. Eldridge, 424 U.S. 319 (1976))
- Open question: Due process is a fact-specific balance. (Mathews v. Eldridge, 424 U.S. 319 (1976))

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

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. A punitive fine, penalty, or forfeiture *(gate)*
2. The amount is at least $1 million *(gate)*
3. The underlying violation is described as technical, recordkeeping, or reporting only

**Weighed factors:**

- The money is described as restitution to victims, which is generally remedial (lowers the rating one step)

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: A large punitive sum for a technical violation: Bajakajian applies by close analogy. (United States v. Bajakajian, 524 U.S. 321 (1998))
- Open question: Gross disproportionality is fact-specific; amounts alone are a screen. (United States v. Bajakajian, 524 U.S. 321 (1998))

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

**Elements checked in each document** (gate elements must all appear before the issue is rated):

1. The action classifies by race or sex *(gate)*
2. It grants an express preference, presumption, or set-aside *(gate)*

**Precedent (first rule that matches):**

- Direct holding: none yet for this kind of issue.
- Close analogy: SFFA and Adarand apply by close analogy; strict scrutiny is rarely satisfied. (Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023))
- Open question: Mentions of diversity programs are not themselves classifications. (Adarand Constructors, Inc. v. Peña, 515 U.S. 200 (1995))

**Authorities:**

- *Adarand Constructors, Inc. v. Peña, 515 U.S. 200 (1995)* (decided 1995-06-12): Federal racial classifications are subject to strict scrutiny.
- *Students for Fair Admissions v. Harvard, 600 U.S. 181 (2023)* (decided 2023-06-29): Race-conscious admissions programs at Harvard and UNC violate equal protection.
- *United States v. Virginia, 518 U.S. 515 (1996)* (decided 1996-06-26): Sex-based government classifications require an exceedingly persuasive justification.

**Open questions:**

- How SFFA applies to federal contracting presumptions of disadvantage.
