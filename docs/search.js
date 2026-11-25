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
    "taken involving involve involves regarding concerning related relating anything everything agency agencies federal government").split(/\s+/));

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
  ];

  const ISSUE_WORDS = {
    agency_adjudication: ["seventh amendment", "jury trial", "jury", "article iii", "in-house judges", "in house judges", "in-house", "in house", "administrative proceeding", "administrative proceedings", "jarkesy", "agency adjudication", "alj", "aljs", "administrative law judge", "administrative law judges"],
    officer_appointment_removal: ["appointments clause", "appointment", "appointments", "inferior officer", "lucia", "arthrex", "alj", "aljs"],
    private_delegation: ["private nondelegation", "private delegation", "private entity", "private entities", "sro", "sros", "self-regulatory"],
    private_discipline: ["private discipline", "sro discipline", "expulsion", "alpine"],
    major_questions: ["major questions", "major question", "nondelegation", "delegation", "west virginia v. epa"],
    statutory_deference: ["chevron", "deference", "loper bright", "loper", "statutory interpretation"],
    removal_independence: ["independent agencies", "independent agency", "humphrey", "humphrey's", "presidential control", "removal power", "slaughter", "at-will removal"],
    spending_appropriations: ["appropriations", "appropriation", "impoundment", "impound", "power of the purse", "spending power"],
    agency_structure_change: ["reorganization", "reorganize", "abolish", "abolished", "restructuring", "reduction in force", "dismantling", "dismantle"],
    federalism: ["federalism", "preemption", "preempt", "tenth amendment", "commandeering", "spending clause", "states' rights", "state sovereignty"],
    presidential_lawmaking: ["emergency powers", "national emergency", "ieepa", "executive overreach", "youngstown"],
    speech_restraint: ["gag", "gag order", "gag orders", "gag rule", "prior restraint", "no-deny", "no deny", "nondisparagement"],
    first_amendment: ["first amendment", "free speech", "speech", "religious liberty", "press freedom", "compelled speech"],
    fourth_amendment: ["fourth amendment", "searches", "warrantless", "surveillance", "unreasonable search"],
    due_process_takings: ["due process", "takings clause", "takings", "fifth amendment", "property rights", "notice and hearing"],
    excessive_fines: ["excessive fines", "eighth amendment", "excessive fine", "disproportionate"],
    equal_protection: ["equal protection", "race-based", "racial preference", "dei", "sex-based", "affirmative action"],
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
    [/\b(?:most )?flagrant\b|\bclearest\b|\bobvious(?:ly)? unconstitutional\b|\bworst\b/i, { axis: "flagrance", min: 3 }],
    [/\b(?:highly |most )?flagran(?:t|ce)\b/i, { axis: "flagrance", min: 2 }],
    [/\b(?:most )?(?:severe|serious)\b|\bhigh[- ]impact\b|\bhigh[- ]stakes\b/i, { axis: "impact", min: 3 }],
    [/\b(?:un)?constitutional(?: issues?| problems?| violations?)?\b|\bflagged\b|\bconstitution\b/i, { axis: "any", min: 1 }],
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
      (it.flags || []).forEach((f) => add(kindLabel[f.code], 1.5));
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
    concepts.sort((a, b) => b[0].length - a[0].length);

    function parse(q) {
      let text = " " + String(q || "").toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'") + " ";
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
      const s = it.severity;
      if (sev.axis === "structural") return (it.flags || []).some((f) => f.structural);
      if (!s) return false;
      if (sev.axis === "any") return true;
      return s[sev.axis] >= sev.min;
    }

    function conceptHit(it, c) {
      if (c.kind === "sanction") return (it.sanctions || []).includes(c.key);
      if (c.kind === "issue") return (it.flags || []).some((f) => f.code === c.key);
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
      const q = expand(parsed.terms || [], conceptWords);
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
        if (facets.flagrance && facets.flagrance.length && !(it.severity && facets.flagrance.includes(it.severity.flagrance))) return;
        if (!facets.routine && it.routine && !ents.includes("other_sro")) return;
        if (facets.impact && facets.impact.length && !(it.severity && facets.impact.includes(it.severity.impact))) return;
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
        cons.forEach((c) => { if (conceptHit(it, c)) { conceptHits++; score += 10; } });
        if (cons.length && conceptHits === cons.length && (!hasText || score > 10 * conceptHits)) score *= 1.3;  // matches every part
        if (strict && conceptHits < cons.length) return;
        if (strict && hasText && !(parsed.terms || []).some((t) => q.has(t) && d.tf.has(t))) return;
        if (!score && (hasText || cons.length)) return;
        // gentle tie-breakers: severity and recency
        if (it.severity) score += 0.15 * it.severity.score;
        results.push({ it, score, why, conceptHits });
      });
      results.sort((a, b) => b.score - a.score || (b.it.date || "").localeCompare(a.it.date || ""));
      const top = results.length ? results[0].score : 0;
      const cut = hasText || cons.length ? top * 0.18 : -1;
      return { strong: results.filter((r) => r.score >= cut), related: results.filter((r) => r.score < cut), total: results.length };
    }

    return { parse, search, tokens, sanctionLabel, kindLabel, outcomeLabel };
  }

  window.RHSearch = { build, tokens, stem, parseDates };
})();
