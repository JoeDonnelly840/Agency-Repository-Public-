/* RegCollect research engine. Runs entirely in the browser; nothing typed is sent anywhere.
 *
 * Version 1 matched requests against a fixed vocabulary and required every
 * recognized part to match, so anything phrased differently was left out.
 * This engine instead:
 *   1. pulls out the parts of a request that are clearly filters (agencies, dates),
 *   2. recognizes legal concepts (sanctions, constitutional issues, outcomes, severity),
 *   3. ranks every item by relevance (BM25) across its title, summary, type, agency,
 *      sanctions and flags, using word stems, a legal thesaurus, prefix matches and
 *      typo-tolerant matching,
 *   4. returns strong matches first and keeps weaker "related" matches visible
 *      instead of silently dropping them.
 */
(function () {
  "use strict";

  const STOP = new Set(("a an the of in on for to and or by with about from that which what where when who how show shows me my i im " +
    "we us our all any find list give get want see look looking please would like could can should there this these those is are was " +
    "were be been being has have had do does did it its their them they into over under between per via vs versus also just only " +
    "some such than then more most other items item documents document things thing stuff report reports tell let know made making " +
    "taken involving involve involves regarding concerning related relating anything everything agency agencies federal government " +
    "has have ever done doing does did will would been case cases instance instances example examples kind kinds type types sort sorts " +
    "where whether lot lots many much few several any regcollect app tool database data results result search searching query " +
    "think believe seem seems seemed possibly maybe perhaps really very quite pretty kinda sorta action actions").split(/\s+/));
  // Question scaffolding stripped before a request is read ("has any agency ever...", "can you find me...").
  const SCAFFOLD = [
    /^\s*(?:can|could|would|will) you (?:please )?(?:find|show|list|get|pull up|look up|search for|tell me about)(?: me)?\s*/i,
    /^\s*(?:i(?:'d| would) like to see|i want to (?:see|find|know about)|i'?m (?:looking|searching) for|help me find|please find|please show(?: me)?)\s*/i,
    /^\s*(?:are there|were there|is there|have there been|has there been)(?: any)?\s*/i,
    /^\s*(?:what|which) (?:actions?|rules?|orders?|cases?|things?|documents?)(?: has| have| did| does)?\s*/i,
    /^\s*(?:has|have|did|does) (?:any|an|the)? ?(?:agency|agencies|government|administration|regulators?)(?: ever)?\s*/i,
    /^\s*(?:show|find|list|give|get)(?: me)?(?: all| any| every)?(?: the)?\s*/i,
    /\b(?:cases|instances|examples|times) (?:where|when|in which)\b/gi,
    /\b(?:in the database|in regcollect|in the app|for me|please|thanks?(?: you)?)\b/gi,
  ];

  // Legal thesaurus: each line is a group of interchangeable words or phrases.
  const THESAURUS = [
    "gag|gag order|silence|silenced|no deny|no-deny|neither admit nor deny|nondisparagement|non-disparagement|confidentiality|prior restraint|nondisclosure",
    "fine|fines|penalty|penalties|civil penalty|monetary penalty|money penalty|cmp|forfeiture",
    "ban|bans|banned|bar|bars|barred|expel|expelled|expulsion|exclusion|excluded|debar|debarment|blacklist",
    "license|licence|permit|registration|certificate|authorization|charter",
    "revoke|revoked|revocation|terminate|termination|cancel|cancellation|deregister|deregistration|withdrawal of approval",
    "alj|aljs|administrative law judge|hearing officer|in-house|administrative proceeding|administrative hearing",
    "jury|jury trial|seventh amendment|jarkesy|article iii",
    "crypto|cryptocurrency|digital asset|bitcoin|token|blockchain|stablecoin",
    "ai|artificial intelligence|algorithm|machine learning|automated decision",
    "privacy|personal information|personal data|surveillance|tracking|biometric|geolocation",
    "tobacco|cigarette|vape|vaping|e-cigarette|nicotine|ends",
    "drug|drugs|pharmaceutical|medication|medicine|prescription",
    "device|medical device|implant",
    "supplement|dietary supplement|vitamin",
    "bank|banks|lender|lending|credit union|financial institution|loan",
    "union|labor union|collective bargaining|organizing|unfair labor practice",
    "pipeline|natural gas|lng|gas pipeline",
    "electric|electricity|power|grid|transmission|utility|utilities",
    "broadcast|broadcaster|radio|television|tv station|station license",
    "robocall|robocalls|telemarketing|spam call|caller id",
    "merger|acquisition|antitrust|competition|monopoly|anticompetitive",
    "emission|emissions|pollution|air quality|clean air|greenhouse",
    "water|clean water|wastewater|drinking water|discharge",
    "removal|fired|firing|dismissal|removed from office",
    "executive order|proclamation|presidential memorandum|presidential",
    "tariff|tariffs|duty|duties|import tax",
    "grant|grants|funding|appropriation|appropriations|spending|funds",
    "recall|recalls|recalled|market withdrawal",
    "warning|warning letter|citation|cited|notice of violation|untitled letter",
    "settlement|settled|consent|consent order|consent decree|agreed",
    "lawsuit|complaint|sue|sued|sues|litigation|charges|charged",
    "child|children|minor|minors|kids|youth|coppa",
    "dei|diversity|equity|inclusion|affirmative action|race-based|racial",
    "religion|religious|faith|church",
    "guidance|policy statement|interpretation|interpretive|faq|advisory opinion",
    "broker|dealer|broker-dealer|investment adviser|investment advisor|adviser",
    "fraud|deceptive|deception|misleading|scam|false|misrepresentation",
    "wage|wages|overtime|minimum wage|back wages|pay",
    "safety|hazard|injury|workplace safety|osha",
    "subpoena|civil investigative demand|cid|investigative demand",
    "inspection|inspections|audit|examination|raid|search",
    "seizure|seized|seize|confiscate|confiscated|civil forfeiture",
    "shutdown|shut down|stop work|stop-work|emergency order|close",
    "auditor|auditors|accountant|accounting firm|cpa",
    "exchange|exchanges|nasdaq|nyse|cboe|stock exchange",
    "spectrum|wireless|5g|satellite",
    "healthcare|health care|hospital|medicare|medicaid|nursing home",
    "independent agency|independent agencies|humphrey|commissioner removal",
    // constitutional and administrative-law vocabulary
    "unconstitutional|illegal|unlawful|invalid|violation|violates|violating|overreach|ultra vires|beyond authority|exceeds authority|without authority|power grab",
    "religious freedom|religious liberty|free exercise|freedom of religion|rfra|religious freedom restoration act|rluipa|conscience|religious exemption",
    "establishment clause|separation of church and state|government endorsement of religion",
    "speech|free speech|freedom of speech|expression|expressive|first amendment|censorship|censor|content moderation|misinformation|disinformation",
    "press|journalist|journalists|reporter|reporters|newspaper|media|news organization|broadcaster",
    "compelled speech|compelled disclosure|mandatory disclosure|disclosure requirement|labeling requirement|warning label",
    "association|freedom of association|donor|donors|donor disclosure|membership list|beneficial ownership",
    "jury|jury trial|seventh amendment|jarkesy|right to a jury|trial by jury",
    "due process|notice and hearing|fair notice|hearing|vagueness|vague",
    "taking|takings|takings clause|just compensation|physical occupation|easement|property rights",
    "search|searches|seizure|fourth amendment|warrant|warrantless|surveillance|monitoring|data collection",
    "excessive fine|excessive fines|eighth amendment|disproportionate|grossly disproportional",
    "equal protection|discrimination|racial classification|race-based|sex-based|affirmative action|set-aside|preference|dei",
    "federalism|states rights|tenth amendment|commandeering|preemption|state sovereignty|sanctuary",
    "appropriations|spending|impoundment|withhold funds|withholding funds|freeze funding|funding freeze|power of the purse|rescission",
    "delegation|nondelegation|intelligible principle|major questions|major question|vast economic significance",
    "chevron|deference|loper bright|statutory interpretation|ambiguous statute|agency interpretation|skidmore|auer|kisor",
    "appointments clause|appointment|appointed|inferior officer|principal officer|lucia|arthrex|unappointed",
    "executive order|executive orders|eo|presidential action|presidential actions|proclamation|presidential memorandum",
    "emergency|emergency powers|national emergency|ieepa|international emergency economic powers act|national emergencies act",
    "legislating|lawmaking|making law|acting like congress|rewriting the law|rewrite statute|suspend law|suspending law|nonenforcement|refusing to enforce",
    "tariff|tariffs|duty|duties|customs|import tax|trade war|reciprocal tariff|section 232|section 301|section 122",
    "moratorium|eviction|evictions|eviction moratorium|landlord|landlords|tenants|rent",
    "vaccine|vaccines|vaccination|mandate|vaccine mandate|covid|covid-19|pandemic|coronavirus",
    "climate|carbon|greenhouse gas|clean power plan|power plant|power plants|coal|emissions standards",
    "wetland|wetlands|wotus|waters of the united states|clean water act",
    "net neutrality|open internet|broadband|internet service provider|isp",
    "noncompete|non-compete|noncompetes|non-compete clause|restrictive covenant",
    "overtime|overtime rule|salary threshold|exempt employees|white collar exemption",
    "joint employer|franchise|franchisee|contractor|independent contractor|gig worker",
    "fiduciary|fiduciary rule|retirement advice|erisa|401k|pension",
    "private fund|private funds|hedge fund|private equity|venture capital|fund adviser",
    "abortion|reproductive|contraception|contraceptive|mifepristone|planned parenthood",
    "transgender|gender identity|sex discrimination|title ix|section 1557",
    "immigration|immigrant|immigrants|deportation|asylum|visa|visas|border|noncitizen|alien|entry ban|travel ban",
    "firearm|firearms|gun|guns|pistol brace|ghost gun|atf",
    "student loan|student loans|loan forgiveness|debt relief|heroes act",
    "social media|platform|platforms|online|internet|tech company|big tech",
    "data broker|data brokers|personal data|consumer data|data privacy|data security|cybersecurity|breach",
    "credit card|credit cards|late fee|late fees|overdraft|junk fee|junk fees|hidden fees",
    "payday|payday loan|small-dollar loan|consumer lending|debt collection|debt collector",
    "mortgage|mortgages|home loan|servicer|foreclosure|housing",
    "insider trading|insider|market manipulation|manipulation|pump and dump|front running",
    "accounting fraud|financial reporting|audit|auditor|restatement|internal controls",
    "climate disclosure|esg|sustainability|environmental social governance",
    "drug pricing|drug prices|340b|medicare part d|price negotiation",
    "nursing home|hospital|hospitals|health system|provider|providers|clinic|clinics",
    "food safety|contamination|listeria|salmonella|e. coli|adulterated|misbranded",
    "medical device|devices|510(k)|premarket|clearance|approval",
    "opioid|opioids|fentanyl|controlled substance|narcotic",
    "union election|representation election|bargaining unit|strike|strikes|picketing|employer speech|captive audience",
    "worker|workers|employee|employees|workforce|labor|labour|employment",
    "pipeline safety|natural gas pipeline|lng terminal|certificate of public convenience|eminent domain",
    "rate|rates|tariff filing|rate case|wholesale power|transmission rate",
    "broadcast license|license renewal|station|indecency|equal time|fairness doctrine",
    "robocall|spam|telemarketing|do not call|tcpa",
    "investigation|investigations|probe|inquiry|examination|exam|sweep",
    "penalty|penalties|fine|fines|sanction|sanctions|punishment|punish",
    "ban|ban on|prohibit|prohibited|prohibition|forbid|outlaw",
    "rule|rules|regulation|regulations|rulemaking|regulatory|reg|regs",
    "proposed rule|proposed rules|nprm|proposal|proposals|notice of proposed rulemaking",
    "interim final rule|ifr|direct final rule|emergency rule|without notice and comment|good cause",
    "repeal|rescind|rescission|rollback|roll back|withdraw|withdrawal|deregulation|deregulatory",
    "delay|postpone|postponement|stay|pause|suspend",
    "court|courts|judge|judges|ruling|rulings|held|decision|struck down|vacated|enjoined|injunction",
    "supreme court|scotus|justices",
    "trump|president trump|trump administration",
    "biden|president biden|biden administration",
    "obama|president obama|obama administration",
  ];
  // Everyday or shorthand names for statutes and doctrines, used for "did you mean" and concept recognition.
  const STATUTE_WORDS = {
    ieepa: ["ieepa", "international emergency economic powers act", "emergency economic powers"],
    nea: ["national emergencies act"], s232: ["section 232", "trade expansion act"], s301: ["section 301"], s122: ["section 122"],
    ina212f: ["212(f)", "travel ban", "entry ban"], dpa: ["defense production act"], heroes: ["heroes act"],
    ica: ["impoundment control act"], rfra: ["rfra", "religious freedom restoration act"], rluipa: ["rluipa", "religious land use"],
    apa_good_cause: ["good cause", "good-cause exception"], cra: ["congressional review act", "cra"],
    phsa361: ["public health service act"], osh6c: ["emergency temporary standard", "ets"],
  };

  const ISSUE_WORDS = {
    agency_adjudication: ["seventh amendment", "jury trial", "jury trials", "right to a jury", "jury", "article iii", "in-house judges", "in house judges", "in-house courts", "in-house", "in house",
      "administrative proceeding", "administrative proceedings", "jarkesy", "agency adjudication", "agency courts", "agency judges", "alj", "aljs", "administrative law judge", "administrative law judges",
      "tull", "granfinanciera", "atlas roofing", "axon", "public rights"],
    officer_appointment_removal: ["appointments clause", "inferior officer", "inferior officers", "principal officer", "lucia", "arthrex", "unappointed", "improperly appointed"],
    private_delegation: ["private nondelegation", "private delegation", "private entity", "private entities", "private power", "sro", "sros", "self-regulatory", "self regulatory", "carter coal", "consumers' research", "consumers research"],
    private_discipline: ["private discipline", "sro discipline", "finra discipline", "finra expulsion", "expulsion", "alpine"],
    major_questions: ["major questions", "major question", "nondelegation", "delegation", "west virginia v. epa", "west virginia", "exceeded its authority", "exceeds its authority",
      "beyond its authority", "without authority", "ultra vires", "power grab", "agency overreach", "overreach", "eviction moratorium", "vaccine mandate", "clean power plan",
      "nfib v. osha", "alabama realtors", "biden v. nebraska", "sackett", "statutory authority"],
    statutory_deference: ["chevron", "chevron deference", "deference", "loper bright", "loper", "statutory interpretation", "agency interpretation", "skidmore", "kisor", "auer"],
    removal_independence: ["independent agencies", "independent agency", "humphrey", "humphrey's", "humphrey's executor", "presidential control", "removal power", "slaughter", "at-will removal",
      "firing commissioners", "fired commissioners", "removal of commissioners", "seila law", "federal reserve independence"],
    spending_appropriations: ["appropriations", "appropriation", "impoundment", "impound", "power of the purse", "spending power", "funding freeze", "freezing funds", "withholding funds", "withheld funds",
      "grant terminations", "terminated grants", "train v. city of new york", "impoundment control act"],
    agency_structure_change: ["reorganization", "reorganize", "abolish", "abolished", "abolishing", "restructuring", "reduction in force", "rif", "layoffs", "dismantling", "dismantle", "shutting down agencies", "eliminating agencies"],
    federalism: ["federalism", "preemption", "preempt", "tenth amendment", "commandeering", "commandeer", "spending clause", "states' rights", "states rights", "state sovereignty", "sanctuary cities", "sanctuary", "printz", "coercive conditions"],
    presidential_lawmaking: ["emergency powers", "national emergency", "national emergencies", "ieepa", "executive overreach", "youngstown", "learning resources", "tariffs by executive order", "ieepa tariffs",
      "executive lawmaking", "presidential lawmaking", "acting like congress", "acting like a legislature", "making law", "legislating", "rewriting statutes", "rewriting the law", "suspending statutes",
      "suspending the law", "refusing to enforce", "nonenforcement", "non-enforcement", "dames & moore", "clinton v. city of new york", "line item veto", "emergency tariffs"],
    speech_restraint: ["gag", "gag order", "gag orders", "gag rule", "prior restraint", "prior restraints", "no-deny", "no deny", "neither admit nor deny", "nondisparagement", "non-disparagement", "silencing defendants"],
    free_speech: ["first amendment", "free speech", "freedom of speech", "speech", "censorship", "censor", "press freedom", "freedom of the press", "compelled speech", "compelled disclosure",
      "content moderation", "misinformation", "disinformation", "jawboning", "viewpoint discrimination", "content-based", "nifla", "zauderer", "central hudson", "303 creative", "moody v. netchoice", "vullo", "commercial speech"],
    free_exercise: ["free exercise", "religious liberty", "religious freedom", "freedom of religion", "religion", "religious", "religious exemption", "religious exemptions", "conscience", "conscience protections",
      "rfra", "religious freedom restoration act", "rluipa", "establishment clause", "church", "churches", "houses of worship", "faith-based", "employment division v. smith", "hobby lobby",
      "fulton v. philadelphia", "lukumi", "tandon", "carson v. makin", "kennedy v. bremerton", "little sisters", "mahmoud", "catholic charities"],
    association: ["freedom of association", "associational", "donor disclosure", "donor privacy", "donor lists", "membership lists", "americans for prosperity", "naacp v. alabama", "beneficial ownership"],
    fourth_amendment: ["fourth amendment", "searches", "warrantless", "warrantless searches", "surveillance", "unreasonable search", "patel", "carpenter", "administrative inspections", "inspections without a warrant"],
    due_process_takings: ["due process", "takings clause", "takings", "fifth amendment", "property rights", "notice and hearing", "fair notice", "just compensation", "cedar point", "mathews"],
    excessive_fines: ["excessive fines", "eighth amendment", "excessive fine", "disproportionate", "disproportionate penalty", "bajakajian", "timbs"],
    equal_protection: ["equal protection", "race-based", "race based", "racial preference", "racial preferences", "dei", "diversity equity and inclusion", "sex-based", "affirmative action", "sffa", "adarand", "set-asides", "race discrimination", "sex discrimination"],
  };
  const CATEGORY_WORDS = {
    "sub:Proposed rule": ["proposed rules", "proposed rule", "nprm", "proposals"],
    "sub:Final rule": ["final rules", "final rule"],
    rulemaking: ["rulemaking", "rulemakings", "regulations", "regulation", "rules", "rule"],
    enforcement: ["enforcement actions", "enforcement action", "enforcement"],
    adjudication: ["adjudications", "adjudication", "hearings", "hearing", "licensing", "decisions", "decision"],
    presidential: ["executive orders", "executive order", "proclamations", "proclamation", "presidential memoranda"],
  };
  const OUTCOME_WORDS = {
    settled: ["settled", "settlements", "settlement", "consented"],
    closed: ["dismissed", "dismissal", "withdrawn", "closed"],
    decided: ["decided", "litigated", "contested", "after trial"],
    initiated: ["filed", "initiated", "charged", "brought"],
    denied: ["denied", "denials"],
    granted: ["granted", "approved"],
  };
  const SEVERITY_WORDS = [
    [/\b(?:almost certainly|clearly|plainly|blatantly|obviously|flagrantly|definitely) (?:un ?constitutional|illegal|unlawful|invalid)\b|\bnear[- ]certain\b|\bflagrant\b|\bblatant\b|\bworst\b|\bclearest\b|\bobvious violations?\b|\bred flags?\b/i, { axis: "level", min: 3 }],
    [/\b(?:very likely|probably|most likely|highly likely) (?:un ?constitutional|illegal|unlawful|invalid)\b|\bstrong(?:est)? cases?\b|\borange flags?\b/i, { axis: "level", min: 2 }],
    [/\b(?:serious|severe|significant|high|big|major) impact\b|\bhigh[- ]stakes\b|\bbiggest\b|\bmost consequential\b/i, { axis: "impact", min: 3 }],
    [/\b(?:likely )?un ?constitutional\b|\bconstitutional (?:issues?|problems?|violations?|concerns?|questions?)\b|\bflagged\b|\bviolat(?:e|es|ed|ions?) (?:of )?the constitution\b|\billegal(?:ly)?\b|\bunlawful(?:ly)?\b|\brated\b/i, { axis: "any", min: 1 }],
    [/\bstructural\b|\bseparation of powers\b/i, { axis: "structural", min: 1 }],
  ];
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

  // --------------------------------------------------------------- text
  function stem(w) {
    if (w.length <= 3) return w;
    w = w.replace(/'s$/, "");
    if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + "y";
    else if (/sses$/.test(w)) w = w.slice(0, -2);
    else if (/[^su]s$/.test(w) && !/(ous|ics|ess)$/.test(w)) w = w.slice(0, -1);
    if (/ing$/.test(w) && w.length > 5) w = w.slice(0, -3);
    else if (/ed$/.test(w) && w.length > 4) w = w.slice(0, -2);
    if (/([^aeiouslz])\1$/.test(w)) w = w.slice(0, -1);
    if (/e$/.test(w) && w.length > 4) w = w.slice(0, -1);
    return w;
  }
  const words = (s) => String(s || "").toLowerCase().replace(/[’']/g, "'").split(/[^a-z0-9'\-]+/).map((x) => x.replace(/^[-']+|[-']+$/g, "")).filter(Boolean);
  const tokens = (s) => words(s).filter((w) => !STOP.has(w)).flatMap((w) => (w.includes("-") ? [w, ...w.split("-")] : [w])).map(stem).filter((w) => w.length > 1);

  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // ------------------------------------------------------------- dates
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function parseDay(s) {
    s = s.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(",", "");
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[1])}-${pad(m[2])}`;
    m = s.match(/^([a-z]+)\.?(?: (\d{1,2}))?(?: (\d{4}))?$/);
    if (m) {
      const mi = MONTHS.findIndex((x) => m[1].length >= 3 && x.startsWith(m[1].slice(0, 3)));
      if (mi < 0) return null;
      const now = new Date();
      let y = m[3] ? +m[3] : now.getFullYear();
      if (!m[3] && (mi > now.getMonth() || (mi === now.getMonth() && m[2] && +m[2] > now.getDate()))) y -= 1;
      return { y, mi, d: m[2] ? +m[2] : null };
    }
    return null;
  }
  const startOf = (p) => (typeof p === "string" ? p : `${p.y}-${pad(p.mi + 1)}-${pad(p.d || 1)}`);
  const endOf = (p) => (typeof p === "string" ? p : p.d ? `${p.y}-${pad(p.mi + 1)}-${pad(p.d)}` : ymd(new Date(p.y, p.mi + 1, 0)));
  const MONTH_RX = "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\b\\.?";
  const DATE_WORD = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4}|${MONTH_RX}(?: \\d{1,2}(?:st|nd|rd|th)?\\b)?(?:,? \\d{4})?)`;

  function parseDates(text) {
    const today = new Date(), t = ymd(today);
    const back = (fn) => { const d = new Date(); fn(d); return ymd(d); };
    const tries = [
      [/\btoday\b/i, () => [t, t, "today"]],
      [/\byesterday\b/i, () => { const y = back((d) => d.setDate(d.getDate() - 1)); return [y, y, "yesterday"]; }],
      [/\b(?:in |over |during |for )?the (?:past|last) (\d+) (day|week|month|year)s?\b/i, (m) => {
        const n = +m[1], u = m[2].toLowerCase();
        return [back((d) => (u === "day" ? d.setDate(d.getDate() - n) : u === "week" ? d.setDate(d.getDate() - 7 * n)
          : u === "month" ? d.setMonth(d.getMonth() - n) : d.setFullYear(d.getFullYear() - n))), t, `past ${n} ${u}s`]; }],
      [/\b(?:in |over |during )?the (?:past|last) (day|week|month|year)\b/i, (m) => {
        const u = m[1].toLowerCase();
        return [back((d) => (u === "day" ? d.setDate(d.getDate() - 1) : u === "week" ? d.setDate(d.getDate() - 7)
          : u === "month" ? d.setMonth(d.getMonth() - 1) : d.setFullYear(d.getFullYear() - 1))), t, `past ${u}`]; }],
      [/\bthis week\b/i, () => [back((d) => d.setDate(d.getDate() - ((d.getDay() + 6) % 7))), t, "this week"]],
      [/\blast week\b/i, () => { const s = new Date(); s.setDate(s.getDate() - ((s.getDay() + 6) % 7) - 7); const e = new Date(s); e.setDate(e.getDate() + 6); return [ymd(s), ymd(e), "last week"]; }],
      [/\bthis month\b/i, () => [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), t, "this month"]],
      [/\blast month\b/i, () => [ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), ymd(new Date(today.getFullYear(), today.getMonth(), 0)), "last month"]],
      [/\bthis year\b/i, () => [`${today.getFullYear()}-01-01`, t, "this year"]],
      [/\blast year\b/i, () => [`${today.getFullYear() - 1}-01-01`, `${today.getFullYear() - 1}-12-31`, "last year"]],
      [new RegExp(`\\b(?:between|from) (${DATE_WORD}) (?:and|to|through|until|-) (${DATE_WORD})`, "i"), (m) => {
        const a = parseDay(m[1]), b = parseDay(m[2]); return a && b ? [startOf(a), endOf(b), `${m[1]} to ${m[2]}`] : null; }],
      [/\b(?:since|after|starting in|beginning in|from) (20\d{2})\b(?![-/])/i, (m) => [`${m[1]}-01-01`, t, `since ${m[1]}`]],
      [new RegExp(`\\b(?:since|after|starting|beginning|from) (${DATE_WORD})`, "i"), (m) => { const a = parseDay(m[1]); return a ? [startOf(a), t, `since ${m[1]}`] : null; }],
      [new RegExp(`\\b(?:before|until|through|prior to) (${DATE_WORD})`, "i"), (m) => { const a = parseDay(m[1]); return a ? ["", endOf(a), `before ${m[1]}`] : null; }],
      [new RegExp(`\\b(?:in|during|for|on) (${DATE_WORD})`, "i"), (m) => { const a = parseDay(m[1]); return a ? [startOf(a), endOf(a), m[1]] : null; }],
      [/\b(?:in|during|for|throughout) (20\d{2})\b/, (m) => [`${m[1]}-01-01`, `${m[1]}-12-31`, m[1]]],
    ];
    for (const [rx, fn] of tries) {
      const m = text.match(rx);
      if (!m) continue;
      const r = fn(m);
      if (r) return { from: r[0], to: r[1], said: r[2], span: [m.index, m.index + m[0].length] };
    }
    return null;
  }

  // ---------------------------------------------------------- the engine
  function build(items, ctx) {
    // ctx: { entities: [{key,name,short,type}], taxonomy, categories, entityOf(item) -> [keys] }
    const tax = ctx.taxonomy || { sanctions: [], kinds: [], outcomes: [] };
    const sanctionLabel = Object.fromEntries((tax.sanctions || []).map((s) => [s.key, s]));
    const kindLabel = Object.fromEntries((tax.kinds || []).map((k) => [k.code, k.label]));
    const statuteLabel = Object.fromEntries((((tax.doctrine || {}).statutes) || []).map((x) => [x.key, x.label]));
    const sweepLabel = tax.sweep_labels || {};
    const rulingLabel = Object.fromEntries((((tax.doctrine || {}).rulings) || []).map((r) => [r.key, `${r.label} court ruling held unlawful`]));
    const outcomeLabel = Object.fromEntries((tax.outcomes || []).map((o) => [o.key, o.label]));

    // thesaurus: stemmed phrase -> group index
    const groups = THESAURUS.map((line) => line.split("|").map((p) => tokens(p)).filter((t) => t.length));
    const phraseGroup = new Map();
    groups.forEach((g, gi) => g.forEach((t) => phraseGroup.set(t.join(" "), gi)));

    // documents
    const FIELDS = [["title", 3], ["summary", 1], ["action", 1], ["subcategory", 1.5]];
    const docs = items.map((it) => {
      const tf = new Map();
      const add = (text, w) => tokens(text).forEach((t) => tf.set(t, (tf.get(t) || 0) + w));
      FIELDS.forEach(([f, w]) => add(it[f], w));
      add((ctx.categories || {})[it.category], 1);
      ctx.entityOf(it).forEach((k) => { const e = ctx.byKey[k]; if (e) add(`${e.name} ${e.short}`, 2); });
      (it.sanctions || []).forEach((k) => { const s = sanctionLabel[k]; if (s) add(`${s.label} ${s.words.join(" ")}`, 1.5); });
      (it.flags || []).forEach((f) => add(kindLabel[f.code], f.level ? 1.5 : 0.5));
      (it.flags || []).forEach((f) => { if (f.ruling) add(rulingLabel[f.ruling], 1.5); });
      (it.statutes || []).forEach((k) => add(`${statuteLabel[k] || ""} ${k}`, 1.5));
      ((it.ft || {}).terms || []).forEach((k) => add(`${sweepLabel[k] || ""} ${k.replace(/_/g, " ")}`, 1));
      add(outcomeLabel[it.outcome], 0.8);
      let len = 0; tf.forEach((v) => { len += v; });
      return { it, tf, len };
    });
    const df = new Map();
    docs.forEach((d) => d.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const N = docs.length || 1;
    const avg = docs.reduce((s, d) => s + d.len, 0) / N || 1;
    const vocab = [...df.keys()];
    const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));

    // entity aliases for filters
    const entityPhrases = [];
    ctx.entities.forEach((e) => {
      const names = new Set([e.name, e.short, ...(e.aliases || [])].map((x) => x.toLowerCase()));
      names.forEach((n) => entityPhrases.push([n, e.key]));
    });
    entityPhrases.sort((a, b) => b[0].length - a[0].length);

    const concepts = [];
    (tax.sanctions || []).forEach((s) => [s.label.toLowerCase(), s.short.toLowerCase(), ...s.words].forEach((w) => concepts.push([w, "sanction", s.key])));
    Object.entries(ISSUE_WORDS).forEach(([k, ws]) => ws.forEach((w) => concepts.push([w, "issue", k])));
    Object.entries(CATEGORY_WORDS).forEach(([k, ws]) => ws.forEach((w) => concepts.push([w, "category", k])));
    Object.entries(OUTCOME_WORDS).forEach(([k, ws]) => ws.forEach((w) => concepts.push([w, "outcome", k])));
    Object.entries(STATUTE_WORDS).forEach(([k, ws]) => ws.forEach((w) => concepts.push([w, "statute", k])));
    concepts.sort((a, b) => b[0].length - a[0].length);

    function parse(q) {
      let raw = String(q || "").replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/[?!.]+\s*$/, "");
      SCAFFOLD.forEach((rx) => { raw = raw.replace(rx, " "); });
      let text = " " + raw.toLowerCase() + " ";
      const blank = (s, e) => { text = text.slice(0, s) + " ".repeat(e - s) + text.slice(e); };
      const out = { entities: [], concepts: [], severity: [], date: null, hints: {}, said: [] };
      const date = parseDates(text);
      if (date) { out.date = date; blank(...date.span); }
      [[/\bby (?:constitutional )?(?:issue|violation|problem|flag)s?\b/, "issue"], [/\bby (?:type|category|kind)\b/, "category"],
       [/\b(?:timeline|over time|by (?:date|week|month)|chronolog\w*|trend\w*)\b/, "date"], [/\bby (?:agency|agencies|regulator)\b/, "agency"],
       [/\bby (?:sanction|penalty|punishment)s?\b/, "sanction"], [/\bby (?:severity|flagrance|clarity|seriousness)\b/, "severity"]]
        .forEach(([rx, g]) => { const m = text.match(rx); if (m && !out.hints.group) { out.hints.group = g; blank(m.index, m.index + m[0].length); } });
      const tm = text.match(/\b(?:as a |in a )?(?:table|spreadsheet)\b/);
      if (tm) { out.hints.view = "table"; blank(tm.index, tm.index + tm[0].length); }
      SEVERITY_WORDS.forEach(([rx, v]) => { const m = text.match(rx); if (m) { out.severity.push({ ...v, said: m[0].trim() }); blank(m.index, m.index + m[0].length); } });
      const scan = (list, push) => list.forEach(([phrase, ...rest]) => {
        const rx = new RegExp(`(^|[^a-z0-9])(${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=$|[^a-z0-9])`, "g");
        let m;
        while ((m = rx.exec(text))) { const s = m.index + m[1].length; push(rest, m[2]); blank(s, s + m[2].length); }
      });
      scan(entityPhrases, ([key], said) => { if (!out.entities.some((e) => e.key === key)) out.entities.push({ key, said }); });
      scan(concepts, ([kind, key], said) => { if (!out.concepts.some((c) => c.kind === kind && c.key === key)) out.concepts.push({ kind, key, said }); });
      out.terms = [...new Set(tokens(text))];
      // Names of specific things ("clean power plan", "rfra") are also matched as words, not only as concepts.
      out.conceptTerms = [...new Set(out.concepts.filter((c) => c.kind === "issue" || c.kind === "statute").flatMap((c) => tokens(c.said)))].filter((t) => !out.terms.includes(t));
      return out;
    }

    function expand(terms, rawConceptWords) {
      // returns Map(term -> {w, why})
      const q = new Map();
      const generic = (t) => (df.get(t) || 0) > N * 0.05;   // related words that appear everywhere add noise, not recall
      const put = (t, w, why) => { if (w < 1 && generic(t)) return; const cur = q.get(t); if (!cur || cur.w < w) q.set(t, { w, why }); };
      terms.forEach((t) => {
        put(t, 1, "");
        // thesaurus (single-word and phrase members)
        const gi = phraseGroup.get(t);
        if (gi != null) groups[gi].forEach((p) => p.forEach((x) => { if (x !== t) put(x, 0.55, `related to “${t}”`); }));
        if (!df.has(t)) {
          if (t.length >= 4) vocab.forEach((v) => { if (v.startsWith(t) && v !== t) put(v, 0.7, `starts with “${t}”`); });
          if (t.length >= 5) vocab.forEach((v) => { if (v[0] === t[0] && editDistance(t, v, 1) === 1) put(v, 0.5, `close spelling of “${t}”`); });
        }
      });
      // two-word phrases in the request that are thesaurus entries
      for (let i = 0; i + 1 < terms.length; i++) {
        const gi = phraseGroup.get(terms[i] + " " + terms[i + 1]);
        if (gi != null) groups[gi].forEach((p) => p.forEach((x) => put(x, 0.55, "related phrase")));
      }
      // words inside a recognized phrase ("gag orders") help only if they are distinctive, not generic ("order")
      (rawConceptWords || []).forEach((t) => { if ((df.get(t) || 0) < N * 0.03) put(t, 0.4, ""); });
      return q;
    }

    function matchesSeverity(it, sev) {
      if (sev.axis === "structural") return (it.flags || []).some((f) => f.structural && f.level);
      if (sev.axis === "impact") return ((it.impact || {}).level || 0) >= sev.min;
      if (!it.rating) return false;
      if (sev.axis === "any") return true;
      return it.rating.level >= sev.min;
    }

    function conceptHit(it, c) {
      if (c.kind === "sanction") return (it.sanctions || []).includes(c.key);
      if (c.kind === "issue") return (it.flags || []).some((f) => f.code === c.key);
      if (c.kind === "statute") return (it.statutes || []).includes(c.key) || ((it.ft || {}).terms || []).some((t) => t === c.key || (c.key === "nea" && t === "national_emergencies_act"));
      if (c.kind === "outcome") return it.outcome === c.key;
      if (c.kind === "category") return c.key.startsWith("sub:") ? it.subcategory === c.key.slice(4) : it.category === c.key;
      return false;
    }

    /**
     * query: parsed request (from parse) possibly edited by the user
     * facets: { entities:[], categories:[], sanctions:[], issues:[], outcomes:[], flagrance:[], impact:[], from, to, routine }
     * strict: require every recognized concept
     */
    function search(parsed, facets, strict) {
      facets = facets || {};
      const ents = [...(parsed.entities || []).map((e) => e.key), ...(facets.entities || [])];
      const from = facets.from || (parsed.date && parsed.date.from) || "";
      const to = facets.to || (parsed.date && parsed.date.to) || "";
      const cons = parsed.concepts || [];
      const conceptWords = cons.flatMap((c) => tokens(c.said));
      const q = expand([...(parsed.terms || []), ...(parsed.conceptTerms || [])], conceptWords);
      const hasText = (parsed.terms || []).length > 0;
      const results = [];
      docs.forEach((d) => {
        const it = d.it;
        if (from && (it.date || "") < from) return;
        if (to && (it.date || "") > to) return;
        if (ents.length && !ctx.entityOf(it).some((k) => ents.includes(k))) return;
        if (facets.categories && facets.categories.length && !facets.categories.includes(it.category)) return;
        if (facets.sanctions && facets.sanctions.length && !(it.sanctions || []).some((k) => facets.sanctions.includes(k))) return;
        if (facets.issues && facets.issues.length && !(it.flags || []).some((f) => facets.issues.includes(f.code))) return;
        if (facets.outcomes && facets.outcomes.length && !facets.outcomes.includes(it.outcome)) return;
        if (facets.levels && facets.levels.length && !(it.rating && facets.levels.includes(it.rating.level))) return;
        if (!facets.routine && it.routine && !ents.includes("other_sro")) return;
        if (facets.impact && facets.impact.length && !facets.impact.includes((it.impact || {}).level || 0)) return;
        if ((parsed.severity || []).some((s) => !matchesSeverity(it, s))) return;

        let score = 0; const why = [];
        q.forEach(({ w, why: reason }, t) => {
          const f = d.tf.get(t);
          if (!f) return;
          const k1 = 1.2, b = 0.75;
          score += w * idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avg));
          if (w === 1) why.push(t); else if (reason && why.length < 8) why.push(`${t} (${reason})`);
        });
        let conceptHits = 0;
        cons.forEach((c) => { if (conceptHit(it, c)) { conceptHits++; score += 10; } else if (c.kind === "issue" && (it.flags || []).some((f) => f.code === c.key && !f.level)) score += 3; });
        if (cons.length && conceptHits === cons.length && (!hasText || score > 10 * conceptHits)) score *= 1.3;  // matches every part
        if (strict && conceptHits < cons.length) return;
        if (strict && hasText && !(parsed.terms || []).some((t) => q.has(t) && d.tf.has(t))) return;
        if (!score && (hasText || cons.length)) return;
        // gentle tie-breakers: severity and recency
        if (it.rating) score += 0.4 * it.rating.level;
        results.push({ it, score, why, conceptHits });
      });
      results.sort((a, b) => b.score - a.score || (b.it.date || "").localeCompare(a.it.date || ""));
      const top = results.length ? results[0].score : 0;
      const cut = hasText || cons.length ? top * 0.18 : -1;
      return { strong: results.filter((r) => r.score >= cut), related: results.filter((r) => r.score < cut), total: results.length };
    }

    // When nothing matches every part of a request, drop the least common recognized part and try again,
    // saying which part was left out, rather than showing nothing.
    function searchWithRelax(parsed, facets, strict) {
      let res = search(parsed, facets, strict);
      if (res.strong.length || !(parsed.concepts || []).length && !(parsed.severity || []).length) return { ...res, suggest: suggest(parsed) };
      const tryDrop = [...(parsed.concepts || []).map((c, i) => ({ kind: "c", i, label: c.said })), ...(parsed.severity || []).map((x, i) => ({ kind: "s", i, label: x.said }))];
      for (const d of tryDrop) {
        const p2 = { ...parsed, concepts: parsed.concepts.filter((_, j) => !(d.kind === "c" && j === d.i)), severity: parsed.severity.filter((_, j) => !(d.kind === "s" && j === d.i)) };
        const r2 = search(p2, facets, false);
        if (r2.strong.length) return { ...r2, relaxed: `“${d.label}”`, suggest: suggest(parsed) };
      }
      return { ...res, suggest: suggest(parsed) };
    }
    // "Did you mean": unknown words replaced by the closest known word.
    function suggest(parsed) {
      const unknown = (parsed.terms || []).filter((t) => !df.has(t) && !phraseGroup.has(t) && t.length >= 4);
      if (!unknown.length) return [];
      const fixed = (parsed.terms || []).map((t) => {
        if (!unknown.includes(t)) return t;
        let best = null, bd = 3;
        vocab.forEach((v) => { if (Math.abs(v.length - t.length) <= 2 && (df.get(v) || 0) > 1) { const d = editDistance(t, v, 2); if (d < bd || (d === bd && best && (df.get(v) || 0) > (df.get(best) || 0))) { bd = d; best = v; } } });
        return best || t;
      });
      const q = fixed.join(" ");
      return q !== (parsed.terms || []).join(" ") ? [q] : [];
    }

    return { parse, search: searchWithRelax, rawSearch: search, tokens, sanctionLabel, kindLabel, outcomeLabel };
  }

  /** A quick filter: every word (or a related word, other form, or prefix) must appear in the item. */
  const tokCache = new WeakMap();
  const THES_GROUPS = THESAURUS.map((line) => line.split("|").map((p) => tokens(p)).filter((t) => t.length));
  function matcher(q) {
    const terms = [...new Set(tokens(q))];
    const alts = terms.map((t) => {
      const set = new Set([t]);
      THES_GROUPS.forEach((g) => { if (g.some((p) => p.length === 1 && p[0] === t)) g.forEach((p) => p.forEach((x) => set.add(x))); });
      return [...set];
    });
    return (it) => {
      let toks = tokCache.get(it);
      if (!toks) {
        toks = new Set(tokens([it.title, it.summary, it.action, it.subcategory, (it.statutes || []).join(" ")].join(" ")));
        tokCache.set(it, toks);
      }
      return alts.every((a) => a.some((x) => toks.has(x) || (x.length >= 4 && [...toks].some((t) => t.startsWith(x)))));
    };
  }

  window.RHSearch = { build, tokens, stem, parseDates, matcher, THESAURUS, ISSUE_WORDS, STATUTE_WORDS };
})();
