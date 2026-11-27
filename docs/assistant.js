/* Curt, RegCollect's assistant. A private helper that runs entirely in this browser.
 * He uses no outside AI service, sends nothing anywhere, and only reads RegCollect's own data and
 * doctrine library. He never looks anything up on other websites.
 *
 * How Curt answers (in this order):
 *   1. Small talk and simple utilities (greetings, thanks, the date and time, arithmetic).
 *   2. Follow-ups to his last answer ("what about the FTC?", "and in 2020?", "open them").
 *   3. Things you ask him to do in the app (open a page or agency, filter, chart, change the date, tour).
 *   4. Questions about the data. He reads your question into a structured query (agencies, period,
 *      kind of action, rating, legal issue, sanction, statute, topic words), runs it over the data
 *      directly, and answers with counts, breakdowns, and the matching actions: how many, which ones,
 *      the latest, the most likely unlawful, which agency has the most, comparisons, summaries, briefings,
 *      and why an action was rated.
 *   5. Definitions and explanations, from a long prepared script (curt-script.js) plus entries built from
 *      the doctrine library: every memo, case, statute, court ruling, sanction, outcome, and agency.
 *   6. If he still isn't sure, he says so, shows what the data holds for the words you used, and offers
 *      the closest topics. He never sends you to another page unless you asked him to. */
(function () {
  "use strict";
  const KEY = "regcollect.curt";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "#");
  const R = () => window.RegCollect;
  const S = () => window.RHSearch;
  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const n = (x) => Number(x || 0).toLocaleString();
  const plural = (k, word, many) => `${n(k)} ${k === 1 ? word : many || word + "s"}`;
  let log = [];
  try { log = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (e) { log = []; }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(log.slice(-80))); } catch (e) { /* private mode */ } };
  const memory = { last: null, entity: null };

  // ------------------------------------------------------------------ reading a question
  const CONTRACTIONS = [[/\bwhat's\b/g, "what is"], [/\bwho's\b/g, "who is"], [/\bwhere's\b/g, "where is"], [/\bhow's\b/g, "how is"], [/\bit's\b/g, "it is"],
    [/\bthat's\b/g, "that is"], [/\bthere's\b/g, "there is"], [/\bdon't\b/g, "do not"], [/\bdoesn't\b/g, "does not"], [/\bdidn't\b/g, "did not"], [/\bcan't\b/g, "cannot"],
    [/\bwon't\b/g, "will not"], [/\bisn't\b/g, "is not"], [/\baren't\b/g, "are not"], [/\bi'm\b/g, "i am"], [/\bi'd\b/g, "i would"], [/\byou're\b/g, "you are"], [/\bwhats\b/g, "what is"]];
  function normalize(raw) {
    let t = String(raw || "").toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
    CONTRACTIONS.forEach(([rx, to]) => { t = t.replace(rx, to); });
    return t.replace(/^(?:hey|ok|okay|so|um|curt)[, ]+/, "").replace(/^(?:please|pls|can you|could you|would you|will you)\s+/, "").replace(/[?!.]+$/, "").trim();
  }
  const QUESTION = /^(?:what|how|why|who|whom|when|where|which|is|are|does|do|did|can|could|should|would|will|explain|define|definition|meaning|tell me|describe)\b/;

  function findEntities(t) {
    const pairs = [];
    R().entities().forEach((e) => [e.name, e.short, ...(e.aliases || [])].forEach((nm) => nm && pairs.push([nm.toLowerCase(), e.key])));
    pairs.sort((a, b) => b[0].length - a[0].length);
    let rest = ` ${t} `; const found = [];
    const at = new Map();
    for (const [nm, k] of pairs) {
      const rx = new RegExp(`(^|[^a-z])${nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z])`, "g");
      const m = rx.exec(rest);
      if (m) { if (!at.has(k) || at.get(k) > m.index) at.set(k, m.index); rest = rest.replace(new RegExp(rx.source, "g"), (x, p1) => p1 + " ".repeat(x.length - p1.length)); }
    }
    found.push(...[...at.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k));
    return { keys: found, rest: rest.replace(/\s+/g, " ").trim() };
  }

  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  /** The time period a question is about. Returns {from, to, label, scope} and the text with the period removed. */
  function parsePeriod(t) {
    const app = R(), today = app.today(), year = +today.slice(0, 4);
    const out = (from, to, label, rx) => ({ period: { from, to, label, scope: poolFor(from, to) }, rest: t.replace(rx, " ").replace(/\s+/g, " ").trim() });
    let m;
    if ((m = t.match(/\b(?:since (?:my|the) last (?:visit|login|check)|since i last (?:checked|visited|logged in)|while i was away|new since last time)\b/)))
      return { period: { scope: "new", label: app.sinceWords() }, rest: t.replace(m[0], " ").trim() };
    if ((m = t.match(/\b(?:ever|all[- ]time|of all time|in all history|all history|since 2015|since the beginning|in total|altogether)\b/)))
      return out(app.historyStart(), today, `since ${app.historyStart().slice(0, 4)}`, m[0]);
    if ((m = t.match(/\b(?:right now|currently|at the moment|these days|nowadays|at present|lately)\b/))) return out(app.addDays(today, -365), today, "in the past 12 months", m[0]);
    if ((m = t.match(/\btoday\b/))) return out(today, today, "today", m[0]);
    if ((m = t.match(/\byesterday\b/))) { const y = app.addDays(today, -1); return out(y, y, "yesterday", m[0]); }
    if ((m = t.match(/\b(?:this|the past|the last|past|last) (\d+) (day|week|month|year)s?\b/))) {
      const k = +m[1], unit = m[2], days = unit === "day" ? k : unit === "week" ? 7 * k : unit === "month" ? 30 * k : 365 * k;
      return out(app.addDays(today, -days + 1), today, `in the past ${k} ${unit}${k === 1 ? "" : "s"}`, m[0]);
    }
    if ((m = t.match(/\b(?:this week|past week|last week|the past week|the last week|this past week|last seven days|past seven days)\b/))) return out(app.addDays(today, -6), today, "in the past 7 days", m[0]);
    if ((m = t.match(/\bthis month\b/))) return out(`${today.slice(0, 7)}-01`, today, "this month", m[0]);
    if ((m = t.match(/\b(?:last|past|previous) month\b/))) {
      const d = new Date(`${today.slice(0, 7)}-01T12:00:00`); d.setMonth(d.getMonth() - 1);
      const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, end = app.addDays(`${today.slice(0, 7)}-01`, -1);
      return out(from, end, `in ${cap(MONTHS[d.getMonth()])} ${d.getFullYear()}`, m[0]);
    }
    if ((m = t.match(/\b(?:this year|so far this year|year to date)\b/))) return out(`${year}-01-01`, today, `in ${year} so far`, m[0]);
    if ((m = t.match(/\b(?:last year|previous year)\b/))) return out(`${year - 1}-01-01`, `${year - 1}-12-31`, `in ${year - 1}`, m[0]);
    if ((m = t.match(/\b(?:past|last) (?:12 months|twelve months|year)\b/))) return out(app.addDays(today, -365), today, "in the past 12 months", m[0]);
    if ((m = t.match(/\b(?:between|from) (20[12]\d) (?:and|to|through|-) (20[12]\d)\b/))) return out(`${m[1]}-01-01`, `${m[2]}-12-31`, `from ${m[1]} through ${m[2]}`, m[0]);
    if ((m = t.match(/\bsince (20[12]\d)\b/))) return out(`${m[1]}-01-01`, today, `since ${m[1]}`, m[0]);
    if ((m = t.match(new RegExp(`\\b(?:in |during |for )?(${MONTHS.join("|")}) (20[12]\\d)\\b`)))) {
      const mi = MONTHS.indexOf(m[1]) + 1, from = `${m[2]}-${String(mi).padStart(2, "0")}-01`;
      const d = new Date(`${from}T12:00:00`); d.setMonth(d.getMonth() + 1);
      return out(from, app.addDays(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, -1), `in ${cap(m[1])} ${m[2]}`, m[0]);
    }
    if ((m = t.match(/\b(?:in |during |for |of )?(20[12]\d)\b/))) return out(`${m[1]}-01-01`, `${m[1]}-12-31`, `in ${m[1]}`, m[0]);
    if ((m = t.match(/\bsince ([a-z]+ \d{1,2}(?:,? \d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/))) {
      const d = S().parseDates(`since ${m[1]}`);
      if (d && d.from) return out(d.from, today, `since ${app.fmtDay(d.from)}`, m[0]);
    }
    return { period: null, rest: t };
  }
  function poolFor(from, to) {
    const app = R(), today = app.today();
    if (from >= app.addDays(today, -365)) return "12m";
    if (from.slice(0, 4) === to.slice(0, 4)) return from.slice(0, 4);
    return "all";
  }
  const DEFAULT_PERIOD = () => ({ from: R().addDays(R().today(), -365), to: R().today(), label: "in the past 12 months", scope: "12m", assumed: true });

  // kinds of action
  const KINDS = [
    [/\bexecutive orders?\b|\beos?\b/, { sub: "Executive Order", word: "executive orders" }],
    [/\bproclamations?\b/, { sub: "Proclamation", word: "proclamations" }],
    [/\bpresidential memorand(?:a|um|ums)\b|\bmemorand(?:a|um|ums)\b/, { sub: "Memorandum", word: "presidential memoranda" }],
    [/\bpresidential (?:documents?|actions?)\b/, { cat: "presidential", word: "presidential documents" }],
    [/\bproposed rules?\b|\bproposals?\b|\bnprms?\b/, { sub: "Proposed rule", word: "proposed rules" }],
    [/\bfinal rules?\b/, { sub: "Final rule", word: "final rules" }],
    [/\brecalls?\b/, { subRx: /^Recall/, word: "recalls" }],
    [/\b(?:rules?|regulations?|regs|rulemakings?)\b/, { cat: "rulemaking", word: "rulemaking actions" }],
    [/\b(?:enforcement(?: actions?| cases?)?|penalt(?:y|ies) cases?|charges|prosecutions?|crackdowns?|settlements?)\b/, { cat: "enforcement", word: "enforcement actions" }],
    [/\b(?:adjudications?|hearings?|licens\w*|decisions)\b/, { cat: "adjudication", word: "adjudications and licensing actions" }],
  ];
  function parseKind(t) {
    for (const [rx, k] of KINDS) { const m = t.match(rx); if (m) return { kind: k, rest: t.replace(m[0], " ").replace(/\s+/g, " ").trim() }; }
    return { kind: null, rest: t };
  }
  function parseRating(t) {
    let m;
    if ((m = t.match(/\bpossible issues?\b|\bnot rated\b|\bunrated\b/))) return { rating: { possible: true }, rest: t.replace(m[0], " ") };
    if ((m = t.match(/\b(?:almost certainly|near[- ]certain(?:ly)?|clearly|definitely|plainly)(?: unlawful| unconstitutional| illegal)?\b|\bred flags?\b|\bworst\b|\bclearest\b/))) return { rating: { min: 3 }, rest: t.replace(m[0], " ") };
    if ((m = t.match(/\bvery likely(?: unlawful| unconstitutional| illegal)?\b|\borange flags?\b/))) return { rating: { min: 2 }, rest: t.replace(m[0], " ") };
    if ((m = t.match(/\b(?:likely )?(?:unlawful|unconstitutional|illegal|invalid)\b|\brated\b|\bflag(?:s|ged)?\b|\briskiest\b|\bproblematic\b|\bquestionable\b|\bchallengeable\b/)))
      return { rating: { min: 1 }, rest: t.replace(m[0], " ") };
    if ((m = t.match(/\b(?:constitutional|legal|lawfulness) (?:issues?|problems?|violations?|concerns?)\b|\b(?:issues|problems|violations|concerns)\b/)))
      return { rating: { min: 1, generic: true }, rest: t.replace(m[0], " ") };
    return { rating: null, rest: t };
  }
  // words that carry no topic in a data question
  const DATA_STOP_WORDS = (("how many much number count total totals tally show list give get find search look display pull tell me us what which who whose when where is are was were be been being " +
    "the a an of in on for to by from with about at as and or than that this these those it its their there here any all every each some most more least fewest latest newest recent recently " +
    "top biggest largest worst best first last next new old action actions document documents item items thing things filing filings publish published issued issue issues bring brought did do does done " +
    "make made take taken agency agencies body bodies federal government administration so far ever currently now right please curt you your i my we our has have had per by month year week day " +
    "rating ratings rated flag flags flagged kind kinds type types sort lot lots overall breakdown summary summarize summarise compare versus vs between " +
    "much many anything something everything happen happened happening going lately ones one them those active busiest busy came come out " +
    "difference between happen published publish occurred raise raised raising raises involve involves involved involving concerning regarding related relating " +
    "touch touches touching implicate implicates implicating present presents presented see seen mention mentions mentioned mentioning cite cites cited citing " +
    "reference references referencing discuss discusses discussing against case cases strong strongest any").split(" "));
  let DATA_STOP = null;
  const dataStop = () => DATA_STOP || (DATA_STOP = new Set(DATA_STOP_WORDS.flatMap((w) => [w, S().stem(w)])));

  /** Turn a data question into a structured query. */
  function parseData(t) {
    const p = parsePeriod(t);
    const e = findEntities(p.rest);
    const k = parseKind(e.rest);
    const r = parseRating(k.rest);
    const rest = r.rest.replace(/\s+/g, " ").trim();
    return { text: t, period: p.period, ents: e.keys, kind: k.kind, rating: r.rating, rest };
  }
  async function poolOf(period) {
    const app = R();
    if (period && period.scope === "new") {
      const items = app.visible(app.state.sinceItems);
      return { items, engine: S().build(items, { entities: app.entities(), byKey: app.entityMap(), entityOf: app.entityOf, taxonomy: app.state.tax, categories: app.state.index.categories }) };
    }
    return app.loadPool(period ? period.scope : "12m");
  }
  /** Concepts (issues, sanctions, statutes, outcomes) and leftover topic words from the rest of a question. */
  function topicOf(rest, engine, legal) {
    const parsed = engine.parse(rest);
    const concepts = (parsed.concepts || []).filter((c) => ["issue", "sanction", "statute", "outcome"].includes(c.kind));
    let leftover = rest;
    concepts.forEach((c) => { leftover = leftover.replace(new RegExp(`\\b${c.said.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), " "); });
    if (legal) caseIssues().forEach(([rx, code, said]) => {
      if (rx.test(leftover) && !concepts.some((c) => c.kind === "issue" && c.key === code)) { concepts.push({ kind: "issue", key: code, said }); leftover = leftover.replace(rx, " "); }
    });
    const words = S().tokens(leftover).filter((w) => !dataStop().has(w) && w.length > 1);
    const shown = leftover.toLowerCase().split(/[^a-z0-9'\-]+/).filter((w) => w.length > 1 && S().tokens(w).some((x) => words.includes(x)));
    return { concepts, words, shown: shown.length ? shown : words };
  }
  let CASE_ISSUES = null;
  /** Case names (“Jarkesy”, “Loper Bright”) that stand for one kind of issue in a data question. */
  function caseIssues() {
    if (CASE_ISSUES) return CASE_ISSUES;
    const d = R().doctrine(), A = d.authorities || {}, owner = new Map();
    (d.issues || []).forEach((i) => (i.authorities || []).forEach((k) => { if (!owner.has(k)) owner.set(k, i.code); }));
    CASE_ISSUES = [];
    owner.forEach((code, k) => caseNames((A[k] || {}).cite || "").filter((nm) => nm.length >= 4 && !/ v\. /.test(nm)).forEach((nm) =>
      CASE_ISSUES.push([new RegExp(`\\b${nm.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), code, nm])));
    return CASE_ISSUES;
  }
  function conceptHit(it, c) {
    if (c.kind === "issue") return (it.flags || []).some((f) => f.code === c.key);
    if (c.kind === "sanction") return (it.sanctions || []).includes(c.key);
    if (c.kind === "outcome") return it.outcome === c.key;
    if (c.kind === "statute") return (it.statutes || []).includes(c.key) || ((it.ft || {}).terms || []).some((t) => t === c.key || (c.key === "nea" && t === "national_emergencies_act"));
    return true;
  }
  function kindHit(it, kind) {
    if (!kind) return true;
    if (kind.sub) return (it.subcategory || "") === kind.sub || (it.subtype || "") === kind.sub;
    if (kind.subRx) return kind.subRx.test(it.subcategory || "");
    return it.category === kind.cat;
  }
  function ratingHit(it, rating) {
    if (!rating) return true;
    if (rating.possible) return !it.rating && (it.flags || []).some((f) => !f.level);
    if (rating.generic) return (it.flags || []).length > 0;
    return !!it.rating && it.rating.level >= rating.min;
  }
  const strictRating = (r) => !!r && !r.possible && !r.generic;
  /** Run a structured query over the actions in its period. Questions about long periods that need no
   *  topic words are answered from the compact rows (a small download); a few full actions are fetched
   *  afterwards only when an answer lists them. */
  async function run(q) {
    const app = R();
    const period = q.period || DEFAULT_PERIOD();
    const parser = (await app.loadPool("12m")).engine;
    const topic = topicOf(q.rest || "", parser, !!q.rating);
    const rating = q.rating;
    const needsPossible = (rating && (rating.possible || rating.generic)) || topic.concepts.some((c) => c.kind === "issue" && !strictRating(rating));
    let light = period.scope === "all" && !topic.words.length && topic.concepts.every((c) => ["sanction", "outcome", "issue"].includes(c.kind));
    const filt = makeFilter(q, period, topic);
    let pool;
    if (light) {
      const rows = await app.loadAllRows();
      // Older compact rows don't list possible issues; questions that need them then use the full actions.
      if (needsPossible && rows.some((r) => !r.item && !r.poss)) light = false;
      else pool = rows.map((r) => r.item || r.light || (r.light = { light: true, date: r.date, agencies: r.ents, category: r.category, subcategory: r.subcategory, outcome: r.outcome,
        sanctions: r.sanctions || [], flags: [...(r.codes || []).map((code) => ({ code, level: r.level })), ...(r.poss || []).map((code) => ({ code, level: 0 }))],
        rating: r.level ? { level: r.level } : null, impact: { level: r.impact }, routine: r.routine }));
    }
    if (!light) pool = (await poolOf(period)).items;
    const base = app.visible(pool).filter(filt.base);
    const items = base.filter(filt.rest);
    return { items, base, period, topic, light, q, filt };
  }
  function makeFilter(q, period, topic) {
    const app = R();
    const match = topic.words.length ? S().matcher(topic.words.join(" ")) : null;
    const inRange = (it) => period.scope === "new" || (it.date >= period.from && it.date <= period.to);
    return {
      base: (it) => inRange(it) && (!(q.ents || []).length || app.entityOf(it).some((k) => q.ents.includes(k))) && kindHit(it, q.kind),
      rest: (it) => ratingHit(it, q.rating) && topic.concepts.every((c) => conceptHit(it, c)) && (!match || match(it)),
    };
  }
  /** The first k of a sorted list as full actions (fetching the months of any compact rows among them). */
  async function full(list, res, k, order) {
    const top = list.slice(0, k);
    if (!top.some((it) => it.light)) return top;
    const months = [...new Set(top.filter((it) => it.light).map((it) => it.date.slice(0, 7)))];
    const loaded = R().visible(await R().loadMonthItems(months)).filter((it) => res.filt.base(it) && res.filt.rest(it));
    return [...list.filter((it) => !it.light), ...loaded].sort(order).slice(0, k);
  }
  function describe(q, res, opts) {
    const app = R(), em = app.entityMap();
    const who = (q.ents || []).length ? app.listText(q.ents.map((k) => (em[k] || {}).short || k)) + " " : "";
    const what = q.kind ? q.kind.word : "actions";
    const about = [...res.topic.concepts.map((c) => c.said), ...res.topic.shown].join(" ");
    const rate = opts && opts.noRating ? "" : q.rating ? (q.rating.possible ? " listed as possible issues" : q.rating.generic ? " with a flagged issue (rated or possible)" : ` rated ${app.LEVEL_FULL[q.rating.min].toLowerCase()}${q.rating.min < 3 ? " or worse" : ""}`) : "";
    const single = { actions: "action", "rulemaking actions": "rulemaking action", "enforcement actions": "enforcement action", "executive orders": "executive order", proclamations: "proclamation",
      "presidential memoranda": "presidential memorandum", "proposed rules": "proposed rule", "final rules": "final rule", recalls: "recall", "presidential documents": "presidential document",
      "adjudications and licensing actions": "adjudication or licensing action" };
    if (opts && opts.count === 1) return `${who}${single[what] || what}${about ? ` about “${about}”` : ""}${rate} ${res.period.label}`;
    return `${who}${what}${about ? ` about “${about}”` : ""}${rate} ${res.period.label}`;
  }
  function researchHref(q, res) {
    const app = R(), em = app.entityMap();
    const parts = [...(q.ents || []).map((k) => (em[k] || {}).short || k), q.kind ? q.kind.word : "", ...res.topic.concepts.map((c) => c.said), ...res.topic.shown,
      q.rating ? (q.rating.possible || q.rating.generic ? "" : q.rating.min >= 3 ? "almost certainly unlawful" : q.rating.min === 2 ? "very likely unlawful" : "unlawful") : ""].filter(Boolean);
    const p = new URLSearchParams({ q: parts.join(" ") || "everything" });
    const sc = res.period.scope;
    if (sc && sc !== "12m" && sc !== "new") p.set("p", /^\d{4}$/.test(sc) ? sc : "all");
    p.set("m", "strict");
    return `#research?${p}`;
  }
  function levelSplit(items, light) {
    if (light && items.some((it) => it.light && (it.flags || []).some((f) => !f.level))) light = false;
    const app = R(), c = { 3: 0, 2: 0, 1: 0 }; let poss = 0;
    items.forEach((it) => { if (it.rating) c[it.rating.level]++; else if ((it.flags || []).length) poss++; });
    const parts = [3, 2, 1].filter((k) => c[k]).map((k) => `${n(c[k])} ${app.LEVEL_FULL[k].toLowerCase()}`);
    return (parts.length ? parts.join(", ") : "none rated likely unlawful or worse") + (poss && !light ? `; ${n(poss)} possible issue${poss === 1 ? "" : "s"}` : "");
  }
  function breakdown(items, by, limit) {
    const app = R(), m = new Map();
    const catName = { rulemaking: "rulemaking", enforcement: "enforcement", adjudication: "adjudication and licensing", presidential: "presidential", other: "other notices" };
    items.forEach((it) => {
      const keys = by === "entity" ? app.entityOf(it).map((k) => (app.entityMap()[k] || {}).short || k) : by === "kind" ? [it.subcategory || it.category] : [catName[it.category] || it.category];
      keys.forEach((k) => m.set(k, (m.get(k) || 0) + 1));
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit || 5).map(([k, v]) => `${k} ${n(v)}`).join(", ");
  }
  function itemLine(it, why) {
    const app = R();
    const lv = it.rating ? `<span class="pill c${it.rating.level}">${esc(app.LEVEL[it.rating.level])}</span> ` : "";
    const issues = app.rated(it).map((f) => app.issueLabel(f.code).split(" (")[0]);
    const ents = app.entityOf(it).map((k) => (app.entityMap()[k] || {}).short || k).join(", ");
    const ruling = (it.flags || []).find((f) => f.ruling);
    return `<li>${lv}<a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a> <span class="muted small">${esc(app.fmtDay(it.date))}, ${esc(ents)}${issues.length ? `; ${esc(app.listText(issues))}` : ""}${ruling && why ? "; a court ruled on this action" : ""}</span></li>`;
  }
  const byRating = (a, b) => R().band(b) - R().band(a) || (b.date || "").localeCompare(a.date || "");
  const byDate = (a, b) => (b.date || "").localeCompare(a.date || "") || R().band(b) - R().band(a);
  const ALL = () => ({ from: R().historyStart(), to: R().today(), label: `since ${R().historyStart().slice(0, 4)}`, scope: "all" });

  // ------------------------------------------------------------------ data answers
  async function answerCount(q) {
    const res = await run(q);
    const { items } = res;
    memory.last = { kind: "count", q };
    let extra = "";
    const oneCat = new Set(items.map((it) => it.category)).size === 1;
    if (!q.kind && items.length > 3 && !oneCat) extra = ` By kind: ${breakdown(items, "category", 5)}.`;
    else if (items.length > 3 && (oneCat || (q.kind && !q.kind.sub && !q.kind.subRx)) && !(q.kind && (q.kind.sub || q.kind.subRx))) extra = ` By type: ${breakdown(items, "kind", 4)}.`;
    if (!(q.ents || []).length && items.length > 3 && new Set(items.flatMap((it) => R().entityOf(it))).size > 1) extra += ` Most from: ${breakdown(items, "entity", 4)}.`;
    const none = !items.length && res.topic.words.length && res.base.length
      ? ` (${plural(res.base.length, "action")} match without the words “${esc(res.topic.shown.join(" "))}”.)` : "";
    let wider = "";
    if (res.period.assumed && strictRating(q.rating) && !res.topic.words.length) {
      const all = await run({ ...q, period: ALL() });
      wider = ` Since ${esc(R().historyStart().slice(0, 4))}: <strong>${n(all.items.length)}</strong> (${levelSplit(all.items, true)}).`;
    }
    return { a: `<strong>${n(items.length)}</strong> ${esc(describe(q, res, { count: items.length }))}.${none}${items.length ? ` ${cap(levelSplit(items, res.light))}.` : ""}${extra}${wider}${items.length ? ` <a href="${researchHref(q, res)}">Open them in Research</a>.` : ""}`
      + (res.period.assumed && !wider ? ` <span class="muted small">That's the past 12 months; add “since 2015” or a year for other periods.</span>` : ""),
    next: items.length ? ["Show the most recent ones", "Which are rated?", "What about since 2015?"] : ["What about since 2015?", "What can you do?"] };
  }
  async function answerList(q, order, limit) {
    const qq = order === "rating" && !q.period && strictRating(q.rating) ? { ...q, period: ALL() } : q;
    const res = await run(qq);
    const sorter = order === "rating" ? byRating : byDate;
    let items = res.items.slice().sort(sorter);
    if (order === "rating") { const r = items.filter((it) => it.rating); if (r.length) items = r; }
    memory.last = { kind: order === "rating" ? "top" : "latest", q };
    if (!items.length) return { a: `I found no ${esc(describe(qq, res))}.${res.period.scope !== "all" ? " Try a longer period, such as “since 2015”." : ""}`, next: res.period.scope !== "all" ? ["What about since 2015?"] : ["What can you do?"] };
    const k = Math.min(limit || 5, items.length);
    const shown = await full(items, res, k, sorter);
    const desc = describe(qq, res, { noRating: order === "rating" && shown[0].rating && (!qq.rating || qq.rating.min === 1) });
    const lead = order === "rating" && shown[0].rating ? "most likely unlawful" : "most recent";
    const head = order === "rating" && !shown[0].rating ? `None of these is rated. The ${k === 1 ? "most recent of the" : `${k} most recent`}` : k === 1 ? `The ${lead} of the` : `The ${k} ${lead}`;
    return { a: `${head} ${esc(desc)}:<ul class="curt-list">${shown.map((it) => itemLine(it, true)).join("")}</ul>`
      + `${items.length > k ? `<a href="${researchHref(qq, res)}">See all ${n(items.length)} in Research</a>. ` : ""}Open “Why flagged” on any action for the reasoning.`,
    next: ["Why was the first one flagged?", "How many are there?", res.period.scope === "all" ? "What about this year?" : "What about since 2015?"] };
  }
  async function answerWhich(q) {
    const app = R();
    const res = await run({ ...q, ents: [] });
    const m = new Map();
    res.items.forEach((it) => app.entityOf(it).forEach((k) => m.set(k, (m.get(k) || 0) + 1)));
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    memory.last = { kind: "which", q };
    if (!top.length) return { a: `No agency has ${esc(describe({ ...q, ents: [] }, res))}.`, next: ["What about since 2015?"] };
    return { a: `${cap(describe({ ...q, ents: [] }, res))}, by agency:<ol class="curt-list">${top.map(([k, v]) => `<li><a href="#e/${esc(k)}">${esc((app.entityMap()[k] || {}).name || k)}</a>: ${n(v)}</li>`).join("")}</ol>`,
      next: [`Summarize the ${(app.entityMap()[top[0][0]] || {}).short || top[0][0]}`, res.period.scope === "all" ? "What about this year?" : "What about since 2015?"] };
  }
  async function answerCompare(q) {
    const app = R();
    const period = q.period || DEFAULT_PERIOD();
    const rows = [];
    for (const k of (q.ents || []).slice(0, 4)) {
      const res = await run({ ...q, ents: [k], period });
      const issues = new Map();
      res.items.forEach((it) => app.rated(it).forEach((f) => issues.set(f.code, (issues.get(f.code) || 0) + 1)));
      const ti = [...issues.entries()].sort((a, b) => b[1] - a[1])[0];
      rows.push(`<li><strong>${esc((app.entityMap()[k] || {}).name || k)}</strong>: ${plural(res.items.length, "action")}${res.items.length ? ` (${breakdown(res.items, "category", 3)})` : ""}; ${levelSplit(res.items, res.light)}${ti ? `. Most common rated issue: ${esc(app.issueLabel(ti[0]).split(" (")[0])} (${ti[1]})` : ""}.</li>`);
    }
    memory.last = { kind: "compare", q: { ...q, period } };
    return { a: `${cap(period.label)}${q.kind ? `, ${q.kind.word}` : ""}:<ul class="curt-list">${rows.join("")}</ul>`, next: [period.scope === "all" ? "What about this year?" : "What about since 2015?", "What about last year?"] };
  }
  async function answerEntity(key, period) {
    const app = R(), e = app.entityMap()[key];
    if (!e) return null;
    const p = period || DEFAULT_PERIOD();
    const q = { ents: [key], period: p, kind: null, rating: null, rest: "" };
    const res = await run(q);
    const items = res.items;
    const newCount = app.scopeItems(app.visible(app.state.sinceItems), key).length;
    const ratedOnes = await full(items.filter((it) => it.rating).sort(byRating), res, 3, byRating);
    const latest = await full(items.slice().sort(byDate), res, 3, byDate);
    memory.entity = key; memory.last = { kind: "count", q };
    return { a: `<strong>${esc(e.name)}.</strong> ${esc(e.description || "")}<br>${cap(p.label)}: ${plural(items.length, "action")}${items.length ? ` (${breakdown(items, "category", 4)})` : ""}; ${levelSplit(items, res.light)}. ${plural(newCount, "new action")} ${esc(app.sinceWords())}.`
      + `${ratedOnes.length ? `<br>Most likely unlawful:<ul class="curt-list">${ratedOnes.map((it) => itemLine(it, true)).join("")}</ul>` : "<br>"}`
      + `${latest.length ? `Latest:<ul class="curt-list">${latest.map((it) => itemLine(it)).join("")}</ul>` : ""}<a href="#e/${esc(key)}">Open the ${esc(e.short)} page</a>.`,
    next: [`Chart ${e.short} actions by month`, `${e.short} enforcement this year`, p.scope === "all" ? `What about this year?` : "What about since 2015?"] };
  }
  /** What happened in a period: a count, a breakdown, the rated actions, and the latest. */
  async function answerDigest(q) {
    const res = await run(q);
    const items = res.items;
    memory.last = { kind: "latest", q };
    if (!items.length) return { a: `Nothing: no ${esc(describe(q, res))}. The Federal Register publishes on business days, and some sources post a day or two late.`, next: ["What's new?", "What about this month?"] };
    const ratedOnes = await full(items.filter((it) => it.rating).sort(byRating), res, 3, byRating);
    const latest = await full(items.slice().sort(byDate), res, 4, byDate);
    const oneCat = new Set(items.map((it) => it.category)).size === 1;
    return { a: `<strong>${n(items.length)}</strong> ${esc(describe(q, res, { count: items.length }))}${items.length > 2 ? ` (${breakdown(items, oneCat ? "kind" : "category", 4)}${(q.ents || []).length ? "" : `; most from ${breakdown(items, "entity", 3)}`})` : ""}. ${cap(levelSplit(items, res.light))}.`
      + `${ratedOnes.length ? `<br>Rated:<ul class="curt-list">${ratedOnes.map((it) => itemLine(it, true)).join("")}</ul>` : "<br>"}`
      + `Latest:<ul class="curt-list">${latest.map((it) => itemLine(it)).join("")}</ul>${items.length > latest.length ? `<a href="${researchHref(q, res)}">See all ${n(items.length)} in Research</a>.` : ""}`,
    next: ["Which are rated?", "Why was the first one flagged?", "What about this month?"] };
  }
  function answerBrief() {
    const app = R(), items = app.visible(app.state.sinceItems);
    const ratedOnes = items.filter((i) => i.rating).sort(byRating);
    memory.last = { kind: "latest", q: { ents: [], period: { scope: "new", label: app.sinceWords() }, kind: null, rating: null, rest: "" } };
    return { a: `${cap(plural(items.length, "new action"))} ${esc(app.sinceWords())}${items.length ? `; busiest: ${breakdown(items, "entity", 4)}` : ""}. ${cap(levelSplit(items))}.`
      + `${ratedOnes.length ? `<ul class="curt-list">${ratedOnes.slice(0, 4).map((it) => itemLine(it, true)).join("")}</ul>` : "<br>"}`
      + `${items.length ? `Latest:<ul class="curt-list">${items.slice().sort(byDate).slice(0, 3).map((it) => itemLine(it)).join("")}</ul>` : ""}<a href="#issues">Open Constitutional issues</a>.`,
    next: ["What should I look at first?", "What happened this week?", "Mark everything as read"] };
  }
  function rulingLine(r) {
    const app = R(), A = (app.doctrine().authorities || {})[r.authority] || {};
    return `<li><strong>${esc(r.label)}</strong>: ${r.result === "upheld" ? "upheld" : "held unlawful"} by a ${esc(r.court_label.toLowerCase())} (<em>${esc(A.cite || "")}</em>)${r.result === "upheld" ? "" : `; rated ${esc((app.LEVEL_FULL[r.level] || "").toLowerCase())}`}.</li>`;
  }
  async function answerRecommend() {
    const app = R();
    const recentQ = { ents: [], period: DEFAULT_PERIOD(), kind: null, rating: { min: 1 }, rest: "" };
    const recentRes = await run(recentQ);
    const recent = recentRes.items.slice().sort(byRating).slice(0, 3);
    const allRes = await run({ ...recentQ, period: ALL() });
    const poss = recentRes.base.filter((it) => !it.rating && (it.flags || []).length).length;
    const struck = (app.doctrine().rulings || []).filter((r) => r.result !== "upheld").slice(0, 4);
    memory.last = { kind: "top", q: { ...recentQ, period: ALL() } };
    return { a: `Good places to start (RegCollect has ${plural(allRes.items.length, "rated action")} since ${esc(app.historyStart().slice(0, 4))}):`
      + `${recent.length ? `<br><strong>Rated in the past 12 months</strong> (actions still in force are usually the most useful to challenge):<ul class="curt-list">${recent.map((it) => itemLine(it, true)).join("")}</ul>` : ""}`
      + `${struck.length ? `<strong>Where courts have already ruled</strong>, useful as models and for related actions nobody has challenged:<ul class="curt-list">${struck.map(rulingLine).join("")}</ul>` : ""}`
      + `<strong>Possible issues</strong>: ${n(poss)} actions in the past 12 months match part of a legal test. They're leads a closer read may turn into claims. <a href="#issues?poss=1">See them</a>. The ratings are a screen, not legal advice.`,
    next: ["The most likely unlawful actions since 2015", "Possible issues about religious liberty", "How are actions rated?"] };
  }
  function answerRuling(r) {
    const app = R(), A = (app.doctrine().authorities || {})[r.authority] || {};
    return { a: `<strong>${esc(r.label)}.</strong> ${r.result === "upheld" ? "Upheld" : "Held unlawful"} by a ${esc(r.court_label.toLowerCase())}: ${esc(A.held || r.summary)} <em>${esc(A.cite || "")}</em>. `
      + (r.result === "upheld" ? "Because a court upheld it, any rating on it is lowered one step." : `A court ruling on the action itself sets the rating, so RegCollect rates ${r.count > 1 ? `these ${r.count} actions` : "it"} ${esc((app.LEVEL_FULL[r.level] || "").toLowerCase())}.`)
      + `${r.caution ? ` <em>${esc(r.caution)}</em>` : ""} <a href="#methods#rulings">Known rulings</a>.`, next: ["What other rulings do you track?", "How are actions rated?"] };
  }
  async function answerExplain(phrase) {
    const app = R(), per = parsePeriod(phrase);
    const hit = kbTerm(per.rest) || (kbFind(per.rest)[0] || {}).e;
    if (hit && /^ruling:/.test(hit.id || "")) { const r = (app.doctrine().rulings || []).find((x) => `ruling:${x.key}` === hit.id); if (r) return answerRuling(r); }
    const pick = (res) => { const top = res.strong[0]; const flagged = res.strong.slice(0, 8).find((r) => r.it.flags && r.it.flags.length && top && r.score >= 0.5 * top.score); return top && top.score > 0 ? (flagged || top) : null; };
    let pool = await app.loadPool(per.period && per.period.scope !== "new" ? per.period.scope : "12m");
    let best = pick(pool.engine.rawSearch(pool.engine.parse(per.rest), {}, false));
    if ((!best || !(best.it.flags || []).length) && !per.period) {
      pool = await app.loadPool("all");
      best = pick(pool.engine.rawSearch(pool.engine.parse(per.rest), {}, false)) || best;
    }
    if (!best) return { a: `I couldn't find an action matching “${esc(phrase)}”. Try a few distinctive words from its title.` };
    return explainItem(best.it);
  }
  function explainItem(it) {
    const app = R(), d = app.doctrine(), A = d.authorities || {};
    const parts = app.rated(it).map((f) => {
      const ruling = f.ruling ? (d.rulings || []).find((r) => r.key === f.ruling) : null;
      const why = ruling ? `A court ruled on this action. What the court held: ${esc((A[ruling.authority] || {}).held || ruling.summary)}`
        : `Precedent: ${esc(app.PRECEDENT[f.precedent])} (${esc((A[f.authority] || {}).cite || "")}); ${f.elements_found.length} of ${f.elements_total} elements of the test found${f.basis === "passages" ? ", some only in passages of the full text" : ""}.`;
      return `<li><strong>${esc(app.LEVEL_FULL[f.level])}</strong>: ${esc(app.issueLabel(f.code))}. ${why}${f.at_the_time ? " It may have been lawful under the precedent at the time." : ""}</li>`;
    });
    const poss = app.possible(it).map((f) => app.issueLabel(f.code).split(" (")[0]);
    return { a: `<a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a> (${esc(app.fmtDay(it.date))}). ${parts.length ? `<ul class="curt-list">${parts.join("")}</ul>` : "It isn't rated. "}${poss.length ? `Possible issues, not rated: ${esc(app.listText(poss))}. ` : ""}Impact: ${esc(app.IMPACT[app.impactOf(it)] || "none recorded")} (context only). Open “Why flagged” on the action for the full checklist and passages.` };
  }
  function answerCoverage() {
    const app = R(), es = app.entities();
    return { a: `RegCollect covers ${plural(es.length, "body", "bodies")}: ${es.map((e) => `<a href="#e/${esc(e.key)}">${esc(e.short)}</a>`).join(", ")}. For each it tracks rules, enforcement, adjudications, and presidential documents since ${esc(app.historyStart().slice(0, 4))}. <a href="#coverage">What we track</a> lists every source and gap.`,
      next: ["What don't you track?", "Summarize the EPA"] };
  }

  // ------------------------------------------------------------------ the script (knowledge base)
  let KB = null;
  function caseNames(cite) {
    const head = cite.split(/,\s*\d|\s\(/)[0].replace(/^In re /, "");
    const names = new Set([head]);
    const skip = /^(United States|SEC|FTC|FCC|EPA|NLRB|CFPB|FDA|HHS|OSHA|FINRA|PCAOB|Trump|Biden|City of|State of|Department|Town of|National|Federal|U\.S\.)\b/;
    head.split(/\s+v\.\s+/).forEach((p) => {
      const clean = p.replace(/,?\s*(Inc|LLC|Corp|Co|Ltd|L\.L\.C)\.?$/i, "").trim();
      if (clean && !skip.test(clean)) { names.add(clean); const first = clean.split(/\s+/)[0]; if (first.length > 4 && !/^(Sunshine|Students|Americans|Church|Catholic|Learning|Alabama|Federal|Department)$/.test(first)) names.add(first); }
    });
    [[/Loper Bright/, "Loper Bright"], [/Learning Resources/, "Learning Resources"], [/Alabama Ass'n of Realtors/, "Alabama Realtors"], [/Students for Fair Admissions/, "SFFA"],
      [/Americans for Prosperity/, "Americans for Prosperity"], [/Hobby Lobby/, "Hobby Lobby"], [/Church of the Lukumi/, "Lukumi"], [/Employment Division/, "Smith"], [/Bi-Metallic/, "Bi-Metallic"],
      [/Trump v\. Slaughter/, "Slaughter"], [/Trump v\. Cook/, "Cook"], [/FCC v\. AT&T/, "FCC v. AT&T"], [/West Virginia v\. EPA/, "West Virginia v. EPA"], [/Biden v\. Nebraska/, "Biden v. Nebraska"]]
      .forEach(([rx, nm]) => { if (rx.test(cite)) names.add(nm); });
    return [...names];
  }
  const stripQ = (x) => x.toLowerCase().replace(/^(?:what|who) (?:is|are|was|were|does|do) (?:a |an |the )?|^(?:define|explain|describe|tell me about|meaning of|definition of) (?:a |an |the )?|^(?:the|a|an) /, "").replace(/[?.!]+$/, "").trim();
  function buildKB() {
    const app = R(), d = app.doctrine(), A = d.authorities || {}, tax = app.state.tax || {};
    const entries = (window.CURT_SCRIPT || []).map((e) => ({ ...e }));
    const ISSUE_WORDS = S().ISSUE_WORDS || {};
    (d.rulings || []).forEach((r) => entries.push({ id: `ruling:${r.key}`, q: [r.label, r.label.replace(/ (?:orders?|rules?)$/i, ""), `${r.label.replace(/ (?:orders?|rules?)$/i, "")}s`, `${r.label} ruling`, `${r.label} struck down`, `${r.label} court`, `is the ${r.label} unlawful`, `is the ${r.label} unconstitutional`, `the ${r.label}`],
      a: `<strong>${esc(r.label)}.</strong> ${r.result === "upheld" ? "Upheld" : "Held unlawful"} by a ${esc(r.court_label.toLowerCase())}. What the court held: ${esc((A[r.authority] || {}).held || r.summary)} <em>${esc((A[r.authority] || {}).cite || "")}</em>. ${r.result === "upheld" ? "Because a court upheld it, any rating is lowered one step." : `RegCollect rates it ${esc((app.LEVEL_FULL[r.level] || "").toLowerCase())}.`}${r.caution ? ` <em>${esc(r.caution)}</em>` : ""}` }));
    Object.entries(A).forEach(([k, a]) => entries.push({ id: `case:${k}`, q: caseNames(a.cite), a: `<em>${esc(a.cite)}</em>, decided ${esc(app.fmtDay(a.decided))}. ${esc(a.held)}` }));
    (d.issues || []).forEach((i) => entries.push({
      id: `issue:${i.code}`, q: [i.label, i.label.split(" (")[0], `${i.label.split(" (")[0]} memo`, `test for ${i.label.split(" (")[0]}`, ...(ISSUE_WORDS[i.code] || []).filter((w) => w.split(" ").length > 1).slice(0, 10)],
      a: `<strong>${esc(i.label)}.</strong> ${esc(i.question)}<br><strong>Test.</strong> ${esc(i.test)} <a href="#methods#m-${esc(i.code)}">Read the memo</a>.`,
      next: [`How many actions raise ${i.label.split(" (")[0].toLowerCase()} issues since 2015?`, "How are actions rated?"] }));
    (d.statutes || []).forEach((st) => entries.push({ id: `statute:${st.key}`, q: [st.label, st.label.replace(/\s*\([^)]*\)/, ""), ...((S().STATUTE_WORDS || {})[st.key] || [])],
      a: `RegCollect recognizes citations to the <strong>${esc(st.label)}</strong> in documents' summaries and full text, and records them on each action. <a href="#research?q=${encodeURIComponent(st.label)}&p=all">Find actions citing it</a>.` }));
    (tax.sanctions || []).forEach((s) => entries.push({ id: `sanction:${s.key}`, q: [s.label, s.short, ...(s.words || []).slice(0, 6)],
      a: `<strong>${esc(s.label)}.</strong> RegCollect tags an action with this sanction when its title or summary describes it. Ask “how many ${esc(s.label.toLowerCase())} since 2015?” or <a href="#research?q=${encodeURIComponent(s.label)}">find them</a>.` }));
    app.entities().forEach((e) => entries.push({ id: `entity:${e.key}`, entity: e.key, q: [e.name, e.short, ...(e.aliases || [])] }));
    const docs = entries.map((e) => {
      const tf = new Map();
      const add = (txt, w) => S().tokens(txt).forEach((t) => tf.set(t, (tf.get(t) || 0) + w));
      (e.q || []).forEach((x) => add(x, 3));
      add(String(e.a || "").replace(/<[^>]+>/g, " "), 0.25);
      return { e, tf, phrases: (e.q || []).map((x) => x.toLowerCase()), heads: (e.q || []).map(stripQ) };
    });
    const df = new Map();
    docs.forEach((dd) => dd.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const groups = (S().THESAURUS || []).map((line) => line.split("|").map((p) => S().tokens(p)).filter((x) => x.length === 1).map((x) => x[0]));
    const heads = new Map();
    docs.forEach((dd) => dd.heads.forEach((h) => { if (h && !heads.has(h)) heads.set(h, dd); }));
    KB = { docs, df, N: docs.length, groups, heads };
  }
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  /** Exact lookup of a term ("jarkesy", "an nprm", "the major questions doctrine"), tolerating plurals and small typos. */
  function kbTerm(term) {
    if (!KB) buildKB();
    const h = stripQ(term);
    if (!h) return null;
    for (const x of [h, h.replace(/s$/, ""), h.replace(/^(?:an?|the) /, "")]) if (KB.heads.has(x)) return KB.heads.get(x).e;
    if (h.length < 5) return null;
    let best = null, bd = h.length > 9 ? 3 : 2;
    KB.heads.forEach((dd, k) => { if (k.length >= 4) { const d = editDistance(h, k, bd); if (d < bd) { bd = d; best = dd.e; } } });
    return best;
  }
  /** An entry one of whose prepared questions is exactly this question. */
  function kbExact(t) {
    if (!KB) buildKB();
    const q = t.toLowerCase().replace(/[?!.]+$/, "").trim();
    const hit = KB.docs.find((dd) => dd.phrases.includes(q));
    return hit ? hit.e : null;
  }
  function kbFind(text) {
    if (!KB) buildKB();
    const q = text.toLowerCase().replace(/[?!.]+$/, "").trim();
    const terms = [...new Set(S().tokens(q))];
    if (!terms.length) return [];
    const idf = (t) => Math.log(1 + KB.N / (1 + (KB.df.get(t) || 0)));
    const alts = terms.map((t) => { const set = new Set(); KB.groups.forEach((g) => { if (g.includes(t)) g.forEach((x) => { if (x !== t) set.add(x); }); }); return [t, [...set]]; });
    const maxScore = terms.reduce((s, t) => s + idf(t), 0) || 1;
    return KB.docs.map((dd) => {
      let score = 0, hit = 0;
      alts.forEach(([t, rel]) => {
        const f = dd.tf.get(t);
        let best = f ? idf(t) * Math.min(1, f / 3) : 0;
        if (f) hit++;
        rel.forEach((x) => { const g = dd.tf.get(x); if (g) best = Math.max(best, 0.5 * idf(t) * Math.min(1, g / 3)); });
        score += best;
      });
      const exact = dd.phrases.some((p) => q === p);
      const phrase = exact || dd.phrases.some((p) => p.length >= 6 && (q.includes(p) || (p.includes(q) && q.length >= 6)));
      if (exact) score += maxScore * 1.4; else if (phrase) score += maxScore * 0.8;
      return { e: dd.e, score: score / maxScore, cover: hit / terms.length, phrase };
    }).filter((r) => r.score > 0.2).sort((a, b) => b.score - a.score).slice(0, 5);
  }
  async function fromEntry(e, period) {
    const app = R();
    if (e.entity) return answerEntity(e.entity, period);
    if (/^ruling:/.test(e.id || "")) { const r = (app.doctrine().rulings || []).find((x) => `ruling:${x.key}` === e.id); if (r) return answerRuling(r); }
    if (e.action === "tour") app.startTour();
    if (e.action === "markread") app.markAllRead();
    if (e.action === "coverage") return answerCoverage();
    if (e.action === "recommend") return answerRecommend();
    if (e.go) app.go(e.go);
    return { a: e.a, next: e.next };
  }
  const titleOf = (e) => { const x = (e.q || [])[0] || ""; return x ? cap(x) + (QUESTION.test(x) ? "?" : "") : ""; };

  // ------------------------------------------------------------------ small things
  function safeMath(t) {
    const pc = t.match(/^(?:what is |calculate )?(\d+(?:\.\d+)?)\s*(?:%|percent) of (\d[\d,]*(?:\.\d+)?)$/);
    if (pc) return (+pc[1] / 100) * +pc[2].replace(/,/g, "");
    const m = t.match(/^(?:what is |calculate |compute )?([\d\s.+\-*/()%^x]+)$/);
    if (!m || !/\d\s*[-+*/x^%]\s*\d/.test(m[1])) return null;
    const expr = m[1].replace(/x/g, "*").replace(/\^/g, "**");
    if (!/^[\d\s.+\-*/()%]+$/.test(expr)) return null;
    try { const v = Function(`"use strict"; return (${expr});`)(); return Number.isFinite(v) ? v : null; } catch (e) { return null; }
  }
  const OUTSIDE = /\b(?:weather|forecast|stock price|share price|score of|sports?|recipe|movie|song|lyrics|news today|headlines|bitcoin price|who won|election results?|translate)\b/;
  const PEOPLE = /^(?:who is|who are) (?:the )?(?:current |new )?(?:[a-z]+ )?(?:chair(?:man|woman|person)?|commissioners?|secretary|administrator|director|head|attorney general|justices?|judge)\b/;

  // ------------------------------------------------------------------ respond
  async function respond(raw) {
    const app = R();
    const t = normalize(raw);
    if (!t) return null;
    const words = t.split(" ").length;

    // 1. small talk and utilities
    if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening)|yo|howdy|greetings)\b/.test(t) && words <= 4)
      return { a: `Hi${app.state.user ? `, ${esc(app.state.user)}` : ""}. I can count and find actions, compare agencies, explain any rating, and answer questions about the law RegCollect applies. What would you like to look into?`, next: ["What's new?", "What should I look at first?", "What can you do?"] };
    if (/^(?:thanks|thank you|thx|ty|great|perfect|awesome|cool|got it|nice|ok|okay|good)\b/.test(t) && words <= 5) return { a: "Glad to help. Anything else?", next: ["What's new?", "What should I look at first?"] };
    if (/^(?:bye|goodbye|see you|later)\b/.test(t)) return { a: "Bye for now. Click the bubble any time to bring me back." };
    if (/^how are you\b/.test(t)) return { a: "Running well, and ready to dig into the data. What would you like to know?", next: ["What's new?", "What can you do?"] };
    if (/^(?:what (?:time|day|date) is it|what is (?:the )?(?:time|date|day)(?: today)?|what is today|today's date)$/.test(t)) {
      const d = new Date(); return { a: `It's ${esc(d.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }))} on this computer.` };
    }
    const math = safeMath(t);
    if (math !== null) return { a: `${esc(t.replace(/^(?:what is|calculate|compute) /, ""))} = <strong>${esc(String(Math.round(math * 1e6) / 1e6))}</strong>.` };
    if (/\b(?:joke|funny)\b/.test(t)) return { a: "An agency walked into a bar. The bartender asked for its statutory authority. (I'm better at counting actions.)", next: ["What's new?"] };
    if (/^(?:search|browse|access|look (?:at|up|on)|use|go (?:on|to)|connect to|read) (?:the )?(?:internet|web|google|online|other (?:web)?sites?|websites?)\b|^(?:do|can|could) you (?:search|browse|access|use|go on|connect to) (?:the )?(?:internet|web|google|online|other)/.test(t))
      return { a: "No. I only use RegCollect's own data and doctrine library, inside this page; I don't search the internet or visit other websites, and nothing you type leaves your browser. The collector that gathers the data runs separately, on a schedule, using official feeds.", next: ["What do you track?", "What can you do?"] };
    if (/^who is (?:the )?(?:current )?president\b/.test(t)) {
      const r = await answerEntity("president");
      return { a: `I don't look up who holds an office, but here's what RegCollect has on the President's documents. ${r.a}`, next: r.next };
    }
    if (OUTSIDE.test(t) || PEOPLE.test(t))
      return { a: "I only answer from RegCollect's own data and doctrine library, and I don't look anything up on other websites, so I can't answer that one. I can tell you what agencies and the President have published, how it's rated, and the law behind the ratings.", next: ["What's new?", "What can you do?"] };

    // 2. follow-ups to the last answer
    const fol = t.match(/^(?:and |but |ok )?(?:what|how) about (.+)|^and (?:for |in |the |what about )?(.+)|^(?:only|just) (?:the )?(.+)$/);
    if (fol && memory.last) {
      const extra = (fol[1] || fol[2] || fol[3] || "").trim();
      const L = memory.last, base = L.q || {};
      const p = parsePeriod(extra), e = findEntities(p.rest), k = parseKind(e.rest), r = parseRating(k.rest);
      const q = { ...base, period: p.period || base.period, ents: e.keys.length ? e.keys : base.ents || [], kind: k.kind || base.kind, rating: r.rating || base.rating,
        rest: [base.rest || "", r.rest.replace(/\b(?:the|ones?|them|those|instead|it)\b/g, " ")].join(" ").replace(/\s+/g, " ").trim() };
      if (L.kind === "compare" && e.keys.length) q.ents = e.keys.length > 1 ? e.keys : [...(base.ents || []).slice(0, 1), ...e.keys];
      if (L.kind === "compare") return answerCompare(q);
      if (L.kind === "which") return answerWhich(q);
      if (L.kind === "top") return answerList(q, "rating");
      if (L.kind === "latest") return answerList(q, "date");
      return answerCount(q);
    }
    if (/^(?:open|show) (?:them|those|these|it|that)(?: in research)?$|^see (?:them|those|all)$/.test(t) && memory.last && memory.last.q) {
      const res = await run(memory.last.q); app.go(researchHref(memory.last.q, res)); return { a: "Opened them in Research." };
    }
    if (/^why (?:was|is) (?:the )?first one (?:flagged|rated)/.test(t) && memory.last && memory.last.q) {
      const res = await run(memory.last.q); const it = res.items.slice().sort(memory.last.kind === "latest" ? byDate : byRating)[0];
      return it ? explainItem(it) : { a: "There was no first item in my last answer." };
    }
    if (/^(?:show|list) (?:me )?(?:the )?(?:most recent|latest|newest) ones?$/.test(t) && memory.last && memory.last.q) return answerList(memory.last.q, "date");
    if (/^which (?:ones )?are rated$/.test(t) && memory.last && memory.last.q) return answerList({ ...memory.last.q, rating: { min: 1 } }, "rating");
    if (/^how many are (?:there|rated)$/.test(t) && memory.last && memory.last.q) return answerCount(/rated/.test(t) ? { ...memory.last.q, rating: { min: 1 } } : memory.last.q);

    // a question the script answers word for word
    const exact = kbExact(t);
    if (exact && !exact.entity) return fromEntry(exact, null);

    // 3. things to do in the app
    if (/\b(?:tour|tutorial|walk me through|show me around)\b/.test(t)) { app.startTour(); return { a: "Starting the tour. It takes about a minute." }; }
    if (/mark (?:everything|all|it all) (?:as )?read|i am caught up|start fresh/.test(t)) { app.markAllRead(); return { a: "Done. Everything up to now is marked as read." }; }
    const since = t.match(/^(?:show (?:me )?)?(?:what is )?(?:new|changes?) since ([a-z]+ \d{1,2}(?:,? \d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)$/);
    if (since) { const d = S().parseDates(`since ${since[1]}`); if (d && d.from) { app.setSince(d.from); return { a: `Showing what's new since ${esc(app.fmtDay(d.from))}.` }; } }
    const ents = findEntities(t).keys;
    const onPage = (app.state.view.match(/^e\/([a-z_]+)/) || [])[1];
    const PAGES = { "#home": /\b(?:home|directory|start page|main page)\b/, "#issues": /\b(?:constitutional issues|issues page|flags page)\b/, "#research": /\bresearch(?: page)?\b/,
      "#methods": /\b(?:methodolog\w*|rubric|doctrine library|memos?)\b/, "#coverage": /\b(?:what we track|coverage page|sources page)\b/, "#manual": /\b(?:manual|user guide)\b/ };
    if (/^(?:open|go to|go back to|take me to|navigate to|bring up|show(?: me)?|where is) (?:the )?/.test(t) && !ents.length) {
      for (const [hash, rx] of Object.entries(PAGES)) if (rx.test(t)) { app.go(hash); return { a: `Opened ${{ "#home": "the directory", "#issues": "Constitutional issues", "#research": "Research", "#methods": "Methodology", "#coverage": "What we track", "#manual": "the manual" }[hash]}.` }; }
    }
    if (/\b(?:chart|graph|plot|visuali[sz]e|pie|donut|trend line)\b/.test(t) && !/^(?:what|why) (?:is|are|do|does)\b/.test(t) && !/^how do (?:charts|graphs) work/.test(t)) {
      const key = ents[0] || onPage || memory.entity;
      if (!key) return { a: "Which agency or body should I chart? For example, “chart SEC sanctions by month.”", next: ["Chart SEC sanctions by month", "Chart FDA actions by year"] };
      const patch = { type: /\b(?:pie|donut|share)\b/.test(t) ? "donut" : /\blines?\b|\btrend/.test(t) ? "lines" : /\btotals?\b|\bbar chart\b/.test(t) ? "bars" : "stacked" };
      const by = [[/sanction|penalt|punish/, "sanction"], [/outcome|result/, "outcome"], [/kind of issue|legal issue|constitutional issue/, "issue"], [/lawful|unlawful|unconstitutional|rating|flag/, "level"], [/impact/, "impact"], [/type of|document type/, "subcategory"], [/\bkinds?\b|category|categories/, "category"]].find(([rx]) => rx.test(t));
      if (by) patch.by = by[1];
      const iv = t.match(/\b(?:by|per|each) (day|week|month|quarter|year)\b|\b(daily|weekly|monthly|quarterly|yearly|annual(?:ly)?)\b/);
      if (iv) { const w = iv[1] || iv[2]; patch.interval = /day|daily/.test(w) ? "day" : /week/.test(w) ? "week" : /quarter/.test(w) ? "quarter" : /year|annual/.test(w) ? "year" : "month"; }
      const per = parsePeriod(t).period;
      if (per && per.from) { patch.from = per.from; patch.to = per.to; }
      if (/\b(?:flagged|rated|unlawful|unconstitutional)\b/.test(t) && !(by && by[1] === "level")) patch.flaggedOnly = true;
      app.setChart(key, patch); app.go(`#e/${key}/charts`); memory.entity = key;
      return { a: `Here's a chart of the ${esc(app.entityMap()[key].name)}'s actions. Change it with the controls on the left, or download it as PNG, SVG, or CSV.`, next: ["Break it down by sanction", "Show it by year"] };
    }
    if (onPage && /^(?:only|just|show only) (?:the )?(?:rated|flagged|unlawful|constitutional)/.test(t)) { app.setEntityUI(onPage, { flagged: true }); app.go(`#e/${onPage}`); return { a: "Showing only rated actions." }; }
    if (onPage && /^(?:sort by |show )?(?:newest|latest|most recent) first$/.test(t)) { app.setEntityUI(onPage, { sort: "date" }); app.go(`#e/${onPage}`); return { a: "Sorted newest first." }; }
    if (/^(?:open|go to|take me to|show me|show|pull up|bring up) (?:the )?/.test(t) && ents.length && !/\b(?:how many|most|latest|recent|unlawful|rated|flag|issues?|about)\b/.test(t)) {
      const key = ents[0], patch = {};
      const k = parseKind(t).kind; if (k && k.cat) patch.cat = k.cat;
      app.setEntityUI(key, patch); app.go(`#e/${key}`); memory.entity = key;
      return { a: `Opened the ${esc(app.entityMap()[key].name)}${patch.cat ? `, ${patch.cat} only` : ""}.`, next: [`Summarize the ${app.entityMap()[key].short}`, `Latest ${app.entityMap()[key].short} actions`] };
    }

    // 4. questions about the data
    if (/^(?:what is new|anything new|any news|brief me|catch me up|give me (?:a |the )?(?:brief|briefing|summary|rundown|update)|what happened(?: recently| lately)?|summari[sz]e (?:what is new|recent activity|the latest))$/.test(t))
      return answerBrief();
    const digest = /^(?:what (?:is|was) new|what (?:has )?happened|what came out|what (?:was|got|has been) (?:published|issued|released)|anything new|what is going on|what went on|summari[sz]e|recap|give me (?:a )?(?:recap|summary|rundown) of)\b/.test(t);
    if (digest || /^what did (?:the )?.+ do\b/.test(t)) {
      const dq = parseData(t);
      if (dq.period || (digest && dq.ents.length && /\bnew\b/.test(t))) return answerDigest({ ...dq, period: dq.period || { scope: "new", label: app.sinceWords() }, rest: "" });
    }
    const ex = t.match(/^(?:why (?:was|is|were|did) (.+?) (?:get )?(?:flagged|rated|marked)|explain (?:the )?(?:rating|flag|flags) (?:of|for|on) (.+)|why is (.+?) (?:unlawful|unconstitutional|rated))$/);
    if (ex) return answerExplain((ex[1] || ex[2] || ex[3]).replace(/^the /, ""));
    if (/^(?:what should i (?:look at|start with|research|read|focus on)|where (?:should|do) i start|what is worth (?:a look|challenging)|recommend|suggest|give me (?:\w+ )?(?:actions|ideas|leads|targets)|tell me something interesting|what (?:actions )?(?:could|can|should) (?:a |public interest )*(?:lawyers?|i) challenge|best (?:targets|candidates))/.test(t))
      return answerRecommend();
    const q = parseData(t);
    if (/\bcompare\b|\bversus\b|\bvs\b|\bdifference between (?:the )?[a-z]+ and\b/.test(t) && q.ents.length >= 2) return answerCompare(q);
    if (/^(?:which|what) (?:agency|agencies|body|bodies|department)\b.*\b(?:most|least|fewest|biggest|busiest|active)\b|^who (?:has|had|issued|did|does) the most\b|^rank (?:the )?agencies|^(?:most|least) active agenc/.test(t)) return answerWhich(q);
    if (/^(?:how many|count(?: of)?|number of|total(?: number)?(?: of)?|how much)\b|^(?:are|were|was|is) there (?:any|many)\b/.test(t)) return answerCount(q);
    if (/\b(?:most (?:likely )?(?:unlawful|unconstitutional|illegal)|most serious|most egregious|most blatant|riskiest|worst|top \d+|clearest|biggest (?:issues?|problems?|violations?)|strongest cases?)\b/.test(t)) {
      const lim = +((t.match(/\btop (\d+)\b/) || [])[1] || (t.match(/\b(\d+) (?:actions|examples|cases)\b/) || [])[1] || 5);
      return answerList({ ...q, rating: q.rating && q.rating.min > 1 ? q.rating : { min: 1 } }, "rating", Math.min(lim, 10));
    }
    if ((/\b(?:latest|newest|most recent|recent|last (?:few|\d+))\b|^any new\b/.test(t) && (q.ents.length || q.kind || q.rating || onPage))
      || (/^(?:what|which) (?:new )?(?:executive orders|rules|regulations|proclamations|enforcement actions|recalls|proposed rules|final rules)\b/.test(t))) {
      if (strictRating(q.rating) && !/\b(?:latest|newest|most recent|recent)\b/.test(t)) return answerList(q, "rating", 8);
      const single = /\b(?:the )?(?:most recent|latest|newest|last)\b(?: \w+)? (?:action|rule|order|executive order|proclamation|document|case|notice|recall)$/.test(t.replace(/^what is /, ""));
      const lim = single ? 1 : +((t.match(/\blast (\d+)\b/) || [])[1] || 5);
      return answerList({ ...q, ents: q.ents.length ? q.ents : onPage && !/\bagencies\b/.test(t) ? [onPage] : [] }, "date", Math.min(lim, 10));
    }
    if (/^what did (?:the )?.+ do\b|^what (?:has|have) (?:the )?.+ (?:been doing|done)\b|^(?:summari[sz]e|overview of|give me an overview of|tell me what) (?:the )?/.test(t) && (q.ents.length || onPage)) {
      if (q.kind || q.rating || (q.period && q.period.scope !== "12m")) return answerList({ ...q, ents: q.ents.length ? q.ents : [onPage] }, "date");
      return answerEntity(q.ents[0] || onPage, q.period);
    }
    if (/^(?:what|which) agencies (?:do you|does (?:it|regcollect|this app)) (?:cover|track|follow|include|watch)|^(?:what|which) agencies(?: are)?(?: covered| tracked| included)?$|^list (?:the |all )?agencies/.test(t)) return answerCoverage();
    const covers = t.match(/^(?:do|does) (?:you|it|regcollect|this app) (?:cover|track|include|follow|watch) (?:the )?(.+)$/);
    if (covers) {
      const k = findEntities(covers[1]).keys[0];
      if (k) return { a: `Yes. RegCollect tracks the <a href="#e/${esc(k)}">${esc(app.entityMap()[k].name)}</a>.`, next: [`Summarize the ${app.entityMap()[k].short}`] };
      return { a: `Not yet: RegCollect doesn't track ${esc(covers[1])}. ${answerCoverage().a} More agencies, and state agencies, are planned.` };
    }

    // "is X constitutional?": the doctrine library's answer, then how RegCollect rates it
    const legal = t.match(/^(?:is|are|was|were|does|do|did|can|could) (.+?) (?:constitutional|unconstitutional|lawful|unlawful|legal|illegal|valid|invalid|allowed|permitted|struck down|upheld)(?: under .+)?$/)
      || t.match(/^(?:is|are|was|were|does|do|did) (.+?) (?:violate|violates|break|breaks) (?:the )?(?:constitution|law|first amendment|seventh amendment|due process|.+? clause)$/);
    if (legal) {
      const hits = kbFind(t).filter((x) => !x.e.entity);
      const top2 = hits[0];
      if (top2 && top2.score >= 0.35) {
        const r = await fromEntry(top2.e, q.period);
        return { a: `Here's what RegCollect's doctrine library says. ${r.a}<br><span class="muted small">This is a screen, not legal advice.</span>`, next: r.next || hits.slice(1, 3).map((x) => titleOf(x.e)).filter(Boolean) };
      }
      if (q.ents.length || q.kind) return answerList({ ...q, rating: { min: 1, generic: true } }, "rating");
    }
    // a data question about a kind of issue at a particular agency or kind of action ("religious liberty issues at HHS")
    if ((q.ents.length || q.kind) && /^(?:what|which|any|are there|list|show)\b/.test(t)) {
      const parser = (await app.loadPool("12m")).engine;
      const tp = topicOf(q.rest, parser, true);
      if (tp.concepts.some((c) => c.kind === "issue") || q.rating) return answerList({ ...q, rating: q.rating || { min: 1, generic: true } }, "rating");
    }
    // "how do I find X": do it
    const howFind = t.match(/^how (?:do|can|would|should) i (?:find|search for|look for|get|see|pull up|research) (.+)$/);
    if (howFind && !/^(?:things|stuff|actions|it|that|this)$/.test(howFind[1])) {
      const sq = parseData(howFind[1]);
      const res = await run(sq);
      app.go(researchHref(sq, res));
      memory.last = { kind: "count", q: sq };
      return { a: `Ask me or type it in Research in plain words. I ran it for you: ${plural(res.items.length, "match", "matches")} for ${esc(describe(sq, res, { count: res.items.length }))}; ${levelSplit(res.items, res.light)}.${res.items.length ? `<ul class="curt-list">${(await full(res.items.slice().sort(byRating), res, 3, byRating)).map((it) => itemLine(it)).join("")}</ul>` : ""} They're open in Research, where you can refine the search.`,
        next: ["How does search work?", "What about since 2015?"] };
    }
    // search requests: answer here and open Research, since the person asked to find something
    const search = t.match(/^(?:find|search(?: for)?|look (?:for|up)|list|pull up|get me|anything (?:about|on)|any(?! new\b)|show me (?!how\b|what\b|where\b|around\b))\s*(?:all |every |the )?(.+)/);
    if (search && !/^(?:how|what|why)\b/.test(search[1])) {
      const sq = parseData(search[1].replace(/\b(?:please|for me)\b/g, "").trim());
      const res = await run(sq);
      app.go(researchHref(sq, res));
      memory.last = { kind: "count", q: sq };
      return { a: `${plural(res.items.length, "match", "matches")} for ${esc(describe(sq, res, { count: res.items.length }))}; ${levelSplit(res.items, res.light)}.${res.items.length ? `<ul class="curt-list">${(await full(res.items.slice().sort(byRating), res, 3, byRating)).map((it) => itemLine(it)).join("")}</ul>` : ""} I opened them in Research, where you can refine the search.${res.period.assumed ? " Add “since 2015” or a year to search further back." : ""}`,
        next: ["How many are rated?", "What about since 2015?"] };
    }

    // an agency, kind, or rating with a period and nothing else ("EPA 2023", "SEC enforcement last year")
    const restWords = q.rest.replace(/\b(?:the|a|an|and|of|in|for|on|at|from|by|show|me|please)\b/g, " ").trim();
    if ((q.ents.length || q.kind || q.rating) && !restWords && !QUESTION.test(t)) return q.ents.length === 1 && !q.kind && !q.rating ? answerEntity(q.ents[0], q.period) : answerCount(q);
    // a topic with an explicit period ("religious freedom since 2015")
    if (q.period && !QUESTION.test(t) && !kbExact(t)) return answerCount(q);

    // 5. definitions and explanations
    const diff = t.match(/^(?:what is )?(?:the )?difference between (.+)$/);
    if (diff) { const hit = kbFind(t)[0]; if (hit && hit.score >= 0.4) return fromEntry(hit.e, q.period); }
    const def = t.match(/^(?:what does (.+?) (?:mean|stand for|do)|(?:what (?:is|are|was|were)|who (?:is|are|was)|define|explain|describe|tell me about|tell me more about|meaning of|definition of|what happened (?:with|to)|what about)\s+(.+))$/);
    if (def) {
      const term = (def[1] || def[2] || "").trim();
      const tk = findEntities(term);
      if (tk.keys.length === 1 && !tk.rest.split(" ").some((w) => w && !/^(?:the|a|an|is|do|does|agency|commission|board|department|bureau|administration|about)$/.test(w)))
        return answerEntity(tk.keys[0], q.period);
      const hit = kbTerm(term);
      if (hit) return fromEntry(hit, q.period);
    }
    const kb = kbFind(t);
    const top = kb[0];
    if (top && (top.phrase || (top.score >= 0.55 && top.cover >= 0.6))) {
      const r = await fromEntry(top.e, q.period);
      if (r && !top.phrase) { const alt = kb.slice(1, 3).filter((x) => x.score >= 0.45).map((x) => titleOf(x.e)).filter(Boolean); if (alt.length) r.next = [...(r.next || []).slice(0, 2), ...alt]; }
      return r;
    }

    // a bare agency name
    if (ents.length && words <= 4) return answerEntity(ents[0], q.period);
    // a data question in other words ("SEC enforcement in 2024", "crypto rules")
    if (q.ents.length || q.kind || q.rating) return answerCount(q);
    // a less certain answer from the script
    if (top && (top.score >= 0.4 || top.cover >= 0.5)) {
      const r = await fromEntry(top.e, q.period);
      const alt = kb.slice(1, 3).filter((x) => x.score >= 0.3).map((x) => titleOf(x.e)).filter(Boolean);
      return { a: `I think you're asking about this. ${r.a}`, next: alt.length ? alt : r.next };
    }
    // 7. not sure: show what the data holds for these words, and the closest topics; stay on this page
    const res = await run({ ...q, rest: q.rest });
    const sugg = kb.slice(0, 3).map((x) => titleOf(x.e)).filter(Boolean);
    if (res.topic.words.length && res.items.length) {
      memory.last = { kind: "count", q };
      return { a: `${words <= 3 ? "" : "I'm not sure exactly what you're asking. "}Here's what RegCollect has on “${esc(res.topic.shown.join(" "))}” ${esc(res.period.label)}: ${plural(res.items.length, "action")}; ${levelSplit(res.items, res.light)}.<ul class="curt-list">${(await full(res.items.slice().sort(byRating), res, 3, byRating)).map((it) => itemLine(it)).join("")}</ul><a href="${researchHref(q, res)}">Open them in Research</a>.`,
        next: sugg.length ? sugg : ["What can you do?"] };
    }
    return { a: "I'm not sure what you're asking, and the words don't match anything in the data. I can count and find actions (“how many EPA rules in 2024?”), list the most likely unlawful ones, compare agencies, summarize an agency, and explain any rating, case, statute, or legal term.",
      next: sugg.length ? sugg : ["What can you do?", "What's new?", "What should I look at first?"] };
  }

  // -------------------------------------------------------------------- UI
  function render() {
    const box = $("#bot-log");
    if (!box) return;
    box.innerHTML = log.map((m, i) => `<div class="msg ${m.who}">${m.who === "me" ? esc(m.text) : m.text}</div>${m.who === "it" && m.next && m.next.length && i === log.length - 1
      ? `<div class="msg-next">${m.next.map((x) => `<button type="button" data-ask="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}`).join("");
    box.querySelectorAll("[data-ask]").forEach((b) => b.addEventListener("click", () => ask(b.dataset.ask)));
    // Show the start of a long answer rather than its end; short answers just scroll into view.
    const answers = box.querySelectorAll(".msg.it"), last = answers[answers.length - 1];
    box.scrollTop = box.scrollHeight;
    if (last && log.length > 1 && last.offsetHeight > box.clientHeight * 0.7)
      box.scrollTop += last.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  }
  function suggest() {
    const app = R(), view = (app && app.state.view) || "home";
    const key = (view.match(/^e\/([a-z_]+)/) || [])[1];
    const short = key ? (app.entityMap()[key] || {}).short || key : "";
    const s = key ? [`Summarize the ${short}`, `Latest ${short} actions`, `How many ${short} actions are rated since 2015?`, "Chart this by month"]
      : view === "research" ? ["How does search work?", "Find IEEPA tariffs since 2015", "What is a possible issue?"]
      : view === "issues" ? ["What does likely unlawful mean?", "Which agency has the most rated actions since 2015?", "What should I look at first?"]
      : view === "methods" ? ["What is the test for free exercise?", "What is Jarkesy?", "Does impact affect the rating?"]
      : ["What's new?", "What should I look at first?", "What can you do?"];
    $("#bot-sugg").innerHTML = s.map((x) => `<button type="button">${esc(x)}</button>`).join("");
    $("#bot-sugg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
  }
  async function ask(text) {
    const app = R();
    const key = (app.state.view.match(/^e\/([a-z_]+)/) || [])[1];
    let t = text;
    // On an agency page, questions that name no agency are about that agency ("how many are rated?", "chart this by month").
    if (key && !findEntities(normalize(text)).keys.length && /\b(?:how many|latest|recent|newest|rated|flag|chart|summari[sz]e|this agency|this page|enforcement|rules|actions)\b/i.test(text) && !/\b(?:agencies|which agency)\b/i.test(text))
      t = `${text.replace(/\b(?:this agency|this page|this)\b(?! (?:year|month|week|morning|quarter))/i, "")} ${app.entityMap()[key].short}`;
    log.push({ who: "me", text });
    log.push({ who: "it", text: '<span class="typing">Curt is looking…</span>' });
    render();
    let answer;
    try { answer = await respond(t); } catch (e) { console.error(e); answer = { a: "Something went wrong while I was working on that. Try rephrasing, or ask “what can you do?”.", next: ["What can you do?"] }; }
    log.pop();
    if (answer) log.push({ who: "it", text: answer.a, next: answer.next });
    save(); render();
  }
  function open(on) {
    const bot = $("#bot"), btn = $("#bot-btn");
    bot.hidden = !on; btn.setAttribute("aria-expanded", String(on)); btn.classList.toggle("open", on);
    try { localStorage.setItem("regcollect.botOpen", on ? "1" : "0"); } catch (e) { /* ignore */ }
    if (on) {
      if (!log.length) { log.push({ who: "it", text: "Hi, I'm Curt. Ask me anything about what agencies and the President have done, how it's rated, or the law behind the ratings. I can count, list, compare, summarize, chart, and explain.", next: ["What's new?", "What should I look at first?", "What can you do?"] }); save(); }
      render(); suggest(); $("#bot-q").focus();
    }
  }
  document.addEventListener("regcollect:ready", () => {
    $("#bot-btn").addEventListener("click", () => open($("#bot").hidden));
    $("#bot-min").addEventListener("click", () => open(false));
    $("#bot-new").addEventListener("click", () => { log = []; memory.last = null; memory.entity = null; save(); open(true); });
    $("#bot-form").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#bot-q").value.trim(); if (v) { $("#bot-q").value = ""; ask(v); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#bot").hidden && $("#bot").contains(document.activeElement)) open(false); });
    let was = "0"; try { was = localStorage.getItem("regcollect.botOpen") || "0"; } catch (e) { /* ignore */ }
    if (was === "1") open(true);
  });
  document.addEventListener("regcollect:route", () => { if (!$("#bot").hidden) suggest(); });
  window.RCAssistant = { respond, ask, kbFind, kbTerm, parseData, parsePeriod };
})();
