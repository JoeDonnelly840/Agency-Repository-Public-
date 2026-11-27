/* RegCollect 3.2 - static front end. No outside libraries or services; all data comes from ./data. */
(function () {
  "use strict";

  const K = { profiles: "regcollect.profiles", current: "regcollect.current", session: "regcollect.session", tour: "regcollect.tourSeen", bot: "regcollect.botOpen", reviews: "regcollect.reviews" };
  const OLD = [["reghunter.profiles", "reghunter.current"], ["agencyTracker.profiles", "agencyTracker.current"]];
  const LATE_LOOKBACK_DAYS = 14;
  const PAGE = 40;
  const CAT_ORDER = ["rulemaking", "enforcement", "adjudication", "presidential", "other"];
  // Rating names come from taxonomy.json (collector/flags.py), so they can be renamed in one place.
  const LEVEL = { 3: "Near certain", 2: "Very likely", 1: "Likely" };
  const LEVEL_FULL = { 3: "Almost certainly unlawful", 2: "Very likely unlawful", 1: "Likely unlawful" };
  let SCALE_NAME = "Lawfulness", SCALE_PREFIX = "Unlawful";
  const IMPACT = { 3: "Serious Impact", 2: "Significant Impact", 1: "Lower Impact" };
  const PRECEDENT = { direct: "Direct holding", analogy: "Close analogy", open: "Open question" };
  function loadScaleNames() {
    const sc = (state.tax || {}).scales || {};
    ((sc.constitutionality || {}).levels || []).forEach((l) => { LEVEL[l.value] = l.name; LEVEL_FULL[l.value] = l.full || l.name; });
    if ((sc.constitutionality || {}).label) SCALE_NAME = sc.constitutionality.label;
    if ((sc.constitutionality || {}).prefix) SCALE_PREFIX = sc.constitutionality.prefix;
    ((sc.impact || {}).levels || []).forEach((l) => { IMPACT[l.value] = l.name; });
  }
  const BASIS = { signed: "signed", posted: "posted", released: "released", classified: "classified", published: "published" };

  const state = { index: null, tax: null, user: null, since: null, sinceItems: [], pools: {}, view: "home", params: new URLSearchParams(), ui: {}, charts: {}, open: {} };

  // ---------------------------------------------------------------- utils
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "#");
  const pad = (n) => String(n).padStart(2, "0");
  const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (day, n) => { const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() + n); return localDay(d); };
  const fmtDay = (day) => (day ? new Date(day + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "");
  const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
  const today = () => localDay(new Date());
  const plural = (n, w, p) => `${n.toLocaleString()} ${n === 1 ? w : p || w + "s"}`;
  const listText = (xs) => (xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`);   // Oxford comma
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function sget(store, key, fallback) { try { const v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function sset(store, key, value) { try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ } }

  // -------------------------------------------------------------- profile
  function profiles() {
    let p = sget(localStorage, K.profiles, null);
    if (p) return p;
    p = {};
    OLD.forEach(([pk]) => Object.assign(p, sget(localStorage, pk, {})));   // carry over RegHunter and Agency Tracker users
    sset(localStorage, K.profiles, p);
    return p;
  }
  function signIn(name, imported) {
    const all = profiles(); const p = all[name] || {};
    if (imported && imported.last && (!p.lastVisit || imported.last > p.lastVisit)) p.lastVisit = imported.last;
    let session = sget(sessionStorage, K.session, null);
    if (!session || session.user !== name) {
      session = { user: name, baseline: p.lastVisit || null };
      sset(sessionStorage, K.session, session);
      p.lastVisit = new Date().toISOString(); all[name] = p; sset(localStorage, K.profiles, all);
    }
    sset(localStorage, K.current, name);
    state.user = name;
    setSinceFromVisit(session.baseline);
  }
  function setSinceFromVisit(iso) {
    if (iso) { const d = new Date(iso); state.since = { dateFrom: addDays(localDay(d), 1), cutoff: iso, mode: "visit", visitDay: localDay(d) }; }
    else { const from = addDays(today(), -7); state.since = { dateFrom: from, cutoff: new Date(from + "T00:00:00").toISOString(), mode: "first" }; }
  }
  function setSinceManual(day) { state.since = { dateFrom: day, cutoff: new Date(day + "T00:00:00").toISOString(), mode: "manual" }; }
  const syncCode = () => btoa(unescape(encodeURIComponent(JSON.stringify({ app: "regcollect", u: state.user, last: (profiles()[state.user] || {}).lastVisit || null }))));
  function readSyncCode(code) {
    try { const d = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!/^(regcollect|reghunter|agency-tracker)$/.test(d.app) || !d.u) throw 0; return d; }
    catch (e) { return null; }
  }

  // ----------------------------------------------------------------- data
  const fileCache = {};
  async function fetchJson(path) { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); }
  const loadFile = (path) => (fileCache[path] = fileCache[path] || fetchJson(path).catch(() => ({ items: [], rows: [] })));
  /** Items whose publication date is in [from, to] (either may be empty). Recent days come from day files, older months from month files. */
  async function loadPublished(from, to, onProgress) {
    const ix = state.index || {};
    const days = Object.keys(ix.days || {}).filter((d) => (!from || d >= from) && (!to || d <= to));
    const months = Object.keys(ix.months || {}).filter((m) => (!from || m >= from.slice(0, 7)) && (!to || m <= to.slice(0, 7)));
    const paths = [...days.map((d) => `data/days/${d}.json`), ...months.map((m) => `data/months/${m}.json`)];
    let done = 0;
    const parts = await Promise.all(paths.map((p) => loadFile(p).then((d) => { done++; if (onProgress) onProgress(done, paths.length); return d.items || []; })));
    const seen = new Set(), out = [];
    parts.flat().forEach((it) => { const pub = it.published || it.date; if (seen.has(it.id) || (from && pub < from) || (to && pub > to)) return; seen.add(it.id); out.push(it); });
    return out;
  }
  async function loadSince() {
    const items = await loadPublished(addDays(state.since.dateFrom, -LATE_LOOKBACK_DAYS), "");
    state.sinceItems = items.filter((it) => ((it.published || it.date) >= state.since.dateFrom) || (it.first_seen && it.first_seen > state.since.cutoff));
  }
  const historyStart = () => (state.index && state.index.history_start) || "2015-01-01";
  function periodRange(p) {
    if (p === "all") return { from: historyStart(), to: today(), label: `since ${fmtDay(historyStart())}` };
    if (/^\d{4}$/.test(p)) return { from: `${p}-01-01`, to: `${p}-12-31`, label: `in ${p}` };
    return { from: addDays(today(), -365), to: today(), label: "in the past 12 months" };
  }
  /** All items whose action date falls in the period, plus a search engine over them (cached per period). */
  async function loadPool(period, onProgress) {
    if (state.pools[period]) return state.pools[period];
    const r = periodRange(period);
    const items = (await loadPublished(r.from, addDays(r.to, 60), onProgress)).filter((it) => it.date >= r.from && it.date <= r.to);
    const engine = window.RHSearch.build(items, { entities: entities(), byKey: entityMap(), entityOf, taxonomy: state.tax, categories: state.index.categories });
    return (state.pools[period] = { items, engine, range: r });
  }
  /** Chart rows: compact facts for archived months, built from items for recent days. */
  async function loadChartRows(key) {
    const ix = state.index;
    const facts = await Promise.all(Object.keys(ix.months || {}).map((m) => loadFile(`data/facts/${m}.json`)));
    const corps = new Set((ix.corporations || []).map((c) => c.key));
    const rows = [];
    facts.forEach((f) => (f.rows || []).forEach((r) => {
      if (!r[1].includes(key)) return;
      rows.push({ date: r[0], agencies: r[1], corporation: corps.has(r[1][0]) ? r[1][0] : null, category: r[2], subcategory: f.subcategories[r[3]],
        outcome: r[4], sanctions: r[5], flags: r[6].map((code) => ({ code, level: r[7] })), rating: r[7] ? { level: r[7] } : null, impact: { level: r[8] }, routine: !!r[9] });
    }));
    const recent = await loadPublished(Object.keys(ix.days || {}).sort()[0] || today(), "");
    return rows.concat(scopeItems(recent, key));
  }

  /** Every item in the given archived months (YYYY-MM), for fetching a few actions found in the compact rows. */
  async function loadMonthItems(months) {
    const parts = await Promise.all(months.filter((m) => (state.index.months || {})[m] != null).map((m) => loadFile(`data/months/${m}.json`)));
    return parts.flatMap((p) => p.items || []);
  }
  /** Compact rows for every action since 2015 (chart facts for archived months, items for recent days), for fast counting. */
  async function loadAllRows() {
    if (state.allRows) return state.allRows;
    const ix = state.index;
    const facts = await Promise.all(Object.keys(ix.months || {}).map((m) => loadFile(`data/facts/${m}.json`)));
    const corps = new Set((ix.corporations || []).map((c) => c.key));
    const rows = [];
    facts.forEach((f) => (f.rows || []).forEach((r) => rows.push({ date: r[0], ents: corps.has(r[1][0]) ? [r[1][0]] : r[1], category: r[2], subcategory: f.subcategories[r[3]],
      outcome: r[4], sanctions: r[5], codes: r[6], level: r[7], impact: r[8], routine: !!r[9], poss: r[10] || null })));
    const recent = await loadPublished(Object.keys(ix.days || {}).sort()[0] || today(), "");
    recent.forEach((it) => rows.push({ date: it.date, ents: entityOf(it), category: it.category, subcategory: it.subcategory, outcome: it.outcome, sanctions: it.sanctions || [],
      codes: rated(it).map((f) => f.code), level: band(it), impact: impactOf(it), routine: !!it.routine, poss: possible(it).map((f) => f.code), item: it }));
    return (state.allRows = rows);
  }

  // ------------------------------------------------------------- entities
  const ALIASES = { sec: ["securities and exchange", "securities & exchange"], ftc: ["trade commission"], fcc: ["communications commission"],
    epa: ["environmental protection"], nlrb: ["labor relations board", "labor board"], cfpb: ["consumer bureau", "consumer financial protection"],
    dol: ["labor department", "osha", "wage and hour", "ebsa"], fda: ["food and drug"], hhs: ["health and human services", "cms", "medicare", "medicaid", "cdc", "nih"],
    ferc: ["energy regulatory commission"], president: ["white house", "presidential", "potus", "the president"],
    other_sro: ["exchanges", "stock exchanges", "nasdaq", "nyse", "cboe", "clearing agency", "clearing agencies"] };
  function entities() {
    const ix = state.index || {};
    return [...(ix.president ? [{ ...ix.president, type: "president" }] : []), ...(ix.agencies || []).map((a) => ({ ...a, type: "agency" })),
      ...(ix.corporations || []).map((c) => ({ ...c, type: "corporation" }))].map((e) => ({ ...e, aliases: ALIASES[e.key] || [] }));
  }
  const entityMap = () => Object.fromEntries(entities().map((e) => [e.key, e]));
  const entityOf = (it) => (it.corporation ? [it.corporation] : it.agencies || []);
  const entityNames = (it) => entityOf(it).map((k) => (entityMap()[k] || {}).name || k).join("; ");
  const codeText = (e) => (e.type === "president" ? "POTUS" : e.key === "other_sro" ? "SRO" : e.short);
  const scopeItems = (items, key) => items.filter((it) => entityOf(it).includes(key));
  const visible = (items, showRoutine) => (showRoutine ? items : items.filter((it) => !it.routine));

  // --------------------------------------------------------- taxonomy maps
  const sanctionMap = () => Object.fromEntries(((state.tax || {}).sanctions || []).map((s) => [s.key, s]));
  const outcomeMap = () => Object.fromEntries(((state.tax || {}).outcomes || []).map((o) => [o.key, o.label]));
  const doctrine = () => (state.tax || {}).doctrine || { issues: [], authorities: {}, rubric: {}, review: {} };
  const issueMap = () => Object.fromEntries(doctrine().issues.map((i) => [i.code, i]));
  const issueLabel = (code) => (issueMap()[code] || {}).label || code;

  // --------------------------------------------------------------- ratings
  // Lawfulness is the only rating, and the only thing colored red, orange, or yellow.
  // Impact is shown as plain text and never changes a rating or an order.
  const pill = (v) => `<span class="pill c${v}" title="${esc(LEVEL_FULL[v])}"><span class="k">${esc(SCALE_PREFIX)}</span>${esc(LEVEL[v])}</span>`;
  const impactTag = (v) => (v ? `<span class="impact-tag" title="Impact is context only; it does not affect the rating">${esc(IMPACT[v])}</span>` : "");
  const band = (it) => (it.rating ? it.rating.level : 0);
  const sevClass = (it) => (it.rating ? `s${band(it)}` : "");
  const impactOf = (it) => ((it.impact || {}).level || 0);
  const bySeverity = (a, b) => band(b) - band(a) || (b.date || "").localeCompare(a.date || "");
  const byDate = (a, b) => (b.date || "").localeCompare(a.date || "") || bySeverity(a, b);
  function sevCounts(items) { const c = { 3: 0, 2: 0, 1: 0 }; items.forEach((it) => { if (it.rating) c[band(it)]++; }); return c; }
  const sevDots = (c) => `<span class="sev-dots" title="Flagged actions: almost certain, very likely, and likely">${[3, 2, 1].map((k) => `<span class="sev-dot c${k} ${c[k] ? "" : "zero"}">${c[k]}</span>`).join("")}</span>`;
  const rated = (it) => (it.flags || []).filter((f) => f.level);
  const possible = (it) => (it.flags || []).filter((f) => !f.level);
  const monthOf = (it) => (it.published || it.date || "").slice(0, 7);
  // reviewer notes: your own judgment on a flag, kept in this browser and exportable for the maintainers
  const reviews = () => sget(localStorage, K.reviews, {});
  function saveReview(id, code, verdict, level) {
    const all = reviews(); const key = `${id}|${code}`;
    if (all[key] && all[key].verdict === verdict) delete all[key]; else all[key] = { id, code, verdict, level: +level || 0, at: new Date().toISOString() };
    sset(localStorage, K.reviews, all);
  }

  // ---------------------------------------------------------------- items
  function datesHtml(it) {
    const basis = BASIS[it.date_basis] || "published";
    const pub = it.published && it.published !== it.date ? `<span>Published <span class="d">${esc(fmtDay(it.published))}</span></span>` : "";
    return `<span>${basis === "published" ? "Published" : basis[0].toUpperCase() + basis.slice(1)} <span class="d">${esc(fmtDay(it.date))}</span></span>${pub}`;
  }
  const REVIEW_CHOICES = [["agree", "Agree"], ["higher", "Should be higher"], ["lower", "Should be lower"], ["none", "Not an issue"]];
  const EFFECT = { lowers: "lowers the rating one step, never below Likely", noted: "noted only", unrates: "listed as a possible issue for this reason" };
  function unratedNote(issue, f) {
    if (f.level) return f.capped ? `<p class="note">This memo rates issues ${esc(LEVEL_FULL[f.capped].toLowerCase())} at most. ${esc(((issue.precedent || [])[0] || {}).note || "")}</p>` : "";
    if (f.unrated_by) { const w = (issue.weighed || []).find((x) => x.id === f.unrated_by); return `<p class="note">Listed as a possible issue, not rated: ${esc(w ? w.text : f.unrated_by)}.</p>`; }
    return '<p class="note">Listed as a possible issue, not rated: the essential (gate) elements, or enough of the test, were not found in the document.</p>';
  }
  function basisNote(f) {
    if (f.basis === "passages") return '<p class="note">Rated Likely on passages from the full text. Higher ratings need the elements in the document\'s operative text (its title and summary, the whole of a presidential document, or a rule\'s authority line and regulatory text).</p>';
    if (f.basis === "operative") return '<p class="note">More elements appear in other passages of the full text, but higher ratings need them in the document\'s operative text.</p>';
    return "";
  }
  function flagHtml(it, f) {
    const d = doctrine(), A = d.authorities || {}, im = issueMap();
    const issue = im[f.code] || { elements: [], weighed: [], precedent: [], label: f.code, question: "" };
    const rule = (issue.precedent || []).find((r) => r.authority === f.authority && r.level === f.precedent) || {};
    const a = A[f.authority] || {};
    const ruling = f.ruling ? ((d.rulings || []).find((r) => r.key === f.ruling) || null) : null;
    const ft = new Set(f.full_text_elements || []);
    const then = f.at_the_time ? `<p class="then">${f.at_the_time.level ? `Under the precedent at the time of this action, it would have rated ${pill(f.at_the_time.level)}.` : "When this action was taken, no controlling decision had yet condemned it; it may have been lawful under the law as it then stood."}
      <span class="cite">${esc((A[f.at_the_time.because] || {}).cite || "")}</span> changed that. RegCollect rates every action under today's law.</p>` : "";
    const weighed = (issue.weighed || []).filter((w) => (f.weighed || []).includes(w.id));
    const rv = reviews()[`${it.id}|${f.code}`];
    return `<div class="flag-detail"><div class="issue-row">${f.level ? pill(f.level) : '<span class="pill c0"><span class="k">Possible issue</span>not rated</span>'}<strong>${esc(issue.label)}</strong>
        <span class="muted small">${f.structural ? "Structural" : "Individual rights"}</span></div>
      ${ruling ? `<div class="ruling"><strong>${esc(ruling.court_label)} ruling on this action.</strong> What the court held: ${esc((A[ruling.authority] || {}).held || ruling.summary)} <span class="cite">${esc((A[ruling.authority] || {}).cite || "")}</span>.${ruling.caution ? ` <em>${esc(ruling.caution)}</em>` : ""}${ruling.kind !== "constitutional" ? ` <span class="muted small">(Kind of holding: ${esc(ruling.kind)}.)</span>` : ""}</div>` : ""}
      <p>${esc(issue.question)}</p>
      ${unratedNote(issue, f)}${basisNote(f)}
      <p><strong>Elements of the test found: ${f.elements_found.length} of ${f.elements_total}</strong>${ruling ? ". The court's ruling on this action sets the rating; the checklist shows what the document's own text reveals." : f.level ? "" : ". The marked (gate) elements must all appear before this issue is rated."}</p>
      <ul class="checks-list">${issue.elements.map((e) => `<li class="${f.elements_found.includes(e.id) ? "yes" : "no"}">${esc(e.text)}${e.gate ? ' <span class="gate">gate</span>' : ""}${ft.has(e.id) ? ' <span class="ftmark">found in full text</span>' : ""}</li>`).join("")}
        ${weighed.map((w) => `<li class="counter">${esc(w.text)} <span class="muted small">(${EFFECT[w.effect || (w.lowers ? "lowers" : "noted")]})</span></li>`).join("")}
        ${(f.weighed || []).includes("upheld_by_court") ? '<li class="counter">A court upheld this action <span class="muted small">(lowers the rating one step)</span></li>' : ""}</ul>
      <p>Precedent: <strong>${esc(PRECEDENT[f.precedent] || f.precedent)}</strong>. ${esc(ruling ? "" : rule.note || "")} <span class="cite">${esc(a.cite || "")}</span>${a.held ? `: ${esc(a.held)}` : ""}</p>${then}
      <p class="muted small">Triggered by: ${(f.triggers || []).map((t) => `“${esc(t)}”`).join(", ")}. <a href="#methods#m-${esc(f.code)}">Read the memo for this issue</a>.</p>
      <div class="review" data-review="${esc(it.id)}|${esc(f.code)}|${f.level || 0}"><span class="muted small">Your view:</span>${REVIEW_CHOICES.map(([v, l]) => `<button type="button" class="${rv && rv.verdict === v ? "on" : ""}" data-v="${v}">${l}</button>`).join("")}</div></div>`;
  }
  function whyHtml(it) {
    const flags = it.flags || [];
    if (!flags.length) return "";
    const imp = it.impact || { breakdown: [], points: 0, level: 1 };
    const ft = it.ft || {};
    const statutes = (it.statutes || []).map((k) => ((doctrine().statutes || []).find((x) => x.key === k) || { label: k }).label);
    const read = ft.read ? `RegCollect read the full text of this document on ${esc(fmtDay(ft.read))}.` : ft.terms ? "RegCollect searched this document's full text for legal terms but has not read it in full yet." : "Rated from the title, action line, and summary only; the full text has not been read yet.";
    return `${[...rated(it), ...possible(it)].map((f) => flagHtml(it, f)).join("")}
    <div class="ft-box"><p class="small">${read}${statutes.length ? ` Statutes and provisions cited: ${esc(listText(statutes))}.` : ""}</p>
      ${ft.read || ft.terms ? `<button type="button" class="btn ghost small" data-ev="${esc(it.id)}" data-month="${esc(monthOf(it))}">Show passages from the document</button><div class="ev" id="ev-${esc(it.id.replace(/[^a-z0-9]/gi, "_"))}"></div>` : ""}</div>
    <p class="points">Impact (context only, not part of the rating): ${imp.breakdown.map((b) => `${esc(b.marker)} ${b.points} (${esc(b.why)})`).join(" + ")} = ${imp.points} points, ${esc(IMPACT[imp.level])}.</p>
    <p class="disclaimer">Rated by RegCollect's published rubric under today's law. A flag marks an issue worth a lawyer's review; it is not a legal conclusion. The doctrine memos are drafts awaiting review.</p>`;
  }
  function itemHtml(it, opts) {
    opts = opts || {};
    const flags = it.flags || [];
    const sm = sanctionMap();
    const sanc = (it.sanctions || []).map((k) => (sm[k] ? `<span class="tag">${esc(sm[k].short)}</span>` : "")).join("");
    const due = it.comments_close && it.comments_close >= today() ? `<span class="due">Comments due ${esc(fmtDay(it.comments_close))}</span>` : "";
    const outcome = outcomeMap()[it.outcome] || "";
    const rf = rated(it), pf = possible(it);
    const issues = rf.slice(0, 3).map((f) => `<div class="issue-row">${pill(f.level)}<span class="kind">${esc(issueLabel(f.code))}</span>${f.ruling ? '<span class="tag">Court ruling</span>' : ""}</div>`).join("") +
      (pf.length ? `<div class="issue-row"><span class="possible">Possible issue${pf.length > 1 ? "s" : ""} (not rated): ${esc(listText(pf.map((f) => issueLabel(f.code))))}</span></div>` : "");
    const more = rf.length > 3 ? `<div class="muted small" style="margin-top:6px">and ${rf.length - 3} more rated issue${rf.length - 3 === 1 ? "" : "s"}</div>` : "";
    const sum = it.summary ? `<p class="sum">${esc(it.summary.length > 360 ? it.summary.slice(0, 360) + "…" : it.summary)}</p>` : "";
    return `<article class="item ${sevClass(it)}">
      <a class="title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title || "(untitled)")}</a>
      <div class="meta">${datesHtml(it)}${opts.showEntity ? `<span>${esc(entityNames(it))}</span>` : ""}<span>${esc(it.subcategory || it.doc_type)}</span>
        ${outcome ? `<span>${esc(outcome)}</span>` : ""}<span>${esc(it.source_label)}</span>${impactTag(impactOf(it))}${(it.ft || {}).read ? '<span class="ftmark">Full text read</span>' : ""}${due}${opts.why ? `<span class="score">Matched: ${esc(opts.why)}</span>` : ""}</div>
      ${sum}${sanc ? `<div class="tags">${sanc}</div>` : ""}${issues}${more}
      ${flags.length ? `<details class="why"><summary>${rf.length ? "Why flagged, and how it was rated" : "Why this is a possible issue"}</summary>${whyHtml(it)}</details>` : ""}</article>`;
  }
  function listWithMore(items, key, opts) {
    const n = state.ui[key] || PAGE;
    return items.slice(0, n).map((i) => itemHtml(i, opts)).join("") +
      (items.length > n ? `<p><button type="button" class="btn ghost" data-more="${esc(key)}">Show ${Math.min(PAGE, items.length - n)} more of ${(items.length - n).toLocaleString()}</button></p>` : "");
  }

  // ------------------------------------------------------------- coverage
  const sourcesFor = (key) => { const m = state.index.source_agencies || {}; return Object.keys(m).filter((s) => m[s].includes(key)); };
  const sourceLabel = (src) => ((state.index.sources || {})[src] || {}).label || (state.index.source_labels || {})[src] || src;
  const coverageCache = {};
  function coverage(src, key, fromDay) {
    const ck = `${src}|${key}|${fromDay}`;
    if (coverageCache[ck]) return coverageCache[ck];
    const rank = { ok: 4, partial: 3, failed: 2, skipped: 1 }; const best = {}, detail = {};
    let through = null;
    (state.index.runs || []).forEach((run) => {
      const rep = (run.reports || []).find((r) => r.source === src);
      if (!rep) return;
      const st = rep.status === "skipped" ? "skipped" : String((rep.agencies || {})[key] || (rep.status === "ok" ? "ok" : rep.status));
      const kind = st.startsWith("ok") ? "ok" : st.startsWith("partial") ? "partial" : st.startsWith("skipped") ? "skipped" : "failed";
      if ((kind === "ok" || kind === "partial") && (run.kind || "daily") === "daily") through = !through || run.end > through ? run.end : through;
      for (let d = run.start < fromDay ? fromDay : run.start; d <= run.end; d = addDays(d, 1)) {
        const k = kind === "partial" && rep.covered_from && d >= rep.covered_from ? "ok" : kind;
        if (!best[d] || rank[k] > rank[best[d]]) { best[d] = k; detail[d] = k === "ok" ? "" : rep.detail || st; }
      }
    });
    const problems = [];
    for (let d = fromDay; d <= today(); d = addDays(d, 1)) {
      const kind = best[d] || (through && d > through ? "pending" : "unchecked");
      if (kind === "ok") continue;
      const last = problems[problems.length - 1];
      if (last && last.kind === kind && last.to === addDays(d, -1) && last.detail === (detail[d] || "")) last.to = d;
      else problems.push({ kind, from: d, to: d, detail: detail[d] || "" });
    }
    return (coverageCache[ck] = { through, problems });
  }
  const KIND_TEXT = { partial: "only partly checked", failed: "could not be checked", skipped: "not checked (switched off)",
    unchecked: "not checked yet (this source has no history for these dates, or the history backfill has not reached them)", pending: "not checked yet (next daily run)" };
  const rangeText = (p) => (p.from === p.to ? fmtDay(p.from) : `${fmtDay(p.from)} to ${fmtDay(p.to)}`);
  function coverageList(key, fromDay) {
    return sourcesFor(key).map((src) => {
      const c = coverage(src, key, fromDay);
      const serious = c.problems.filter((p) => p.kind !== "pending");
      const status = !serious.length ? (c.through ? "ok" : "skipped") : serious.every((p) => p.kind === "skipped") ? "skipped" : serious.some((p) => p.kind === "failed") ? "failed" : "partial";
      const label = { ok: "checked", partial: "partly checked", failed: "gaps", skipped: "not checked" }[status];
      return `<li><strong>${esc(sourceLabel(src))}</strong> <span class="status ${status}">${label}</span>
        ${c.through ? `<span class="muted small">through ${esc(fmtDay(c.through))}</span>` : ""}
        ${serious.slice(0, 4).map((p) => `<div class="gap">${esc(rangeText(p))}: ${esc(KIND_TEXT[p.kind])}${p.detail ? `. ${esc(p.detail)}` : ""}</div>`).join("")}</li>`;
    }).join("");
  }
  function notFound(what, cat, key, filtered, fromDay) {
    if (filtered) return `<div class="notfound"><h3>Nothing matches these filters</h3><p>There are items here, but none match the search or options above.</p></div>`;
    const note = (state.index.coverage_notes || {})[cat] || "";
    return `<div class="notfound"><h3>No ${esc(what)} found since ${esc(fmtDay(fromDay))}</h3><p>Sources searched:</p><ul class="plain">${coverageList(key, fromDay)}</ul>
      ${note ? `<p><strong>What these sources can and cannot show.</strong> ${esc(note)}</p>` : ""}
      <p class="muted">Not found means nothing was published in these sources for these dates. It does not prove that nothing happened. See <a href="#coverage">What we track</a>.</p></div>`;
  }

  // ----------------------------------------------------------------- home
  function sinceWords() {
    const s = state.since;
    if (s.mode === "visit") return `since your last visit on ${fmtDay(s.visitDay)}`;
    if (s.mode === "first") return "in the past seven days";
    return `since ${fmtDay(s.dateFrom)}`;
  }
  function ratingStrip(items, linkFn) {
    const c = sevCounts(items);
    return `<div class="strip" role="group" aria-label="Flagged actions by lawfulness">${[3, 2, 1].map((k) => `<a class="cell k${k} ${c[k] ? "" : "z"}" href="${linkFn(k)}">
        <span class="n">${c[k].toLocaleString()}</span><span class="l">${esc(LEVEL_FULL[k])}</span></a>`).join("")}</div>`;
  }
  function renderHome() {
    const items = visible(state.sinceItems);
    const flagged = items.filter((i) => i.rating).length;
    const routine = state.sinceItems.length - items.length;
    const tile = (e) => {
      const list = scopeItems(items, e.key);
      const tag = e.type === "agency" ? (e.kind === "commission" ? "Commission" : "Single head") : e.type === "corporation" ? `${e.overseer} oversight` : "White House";
      return `<a class="tile" href="#e/${esc(e.key)}"><div class="tile-top"><span class="code">${esc(codeText(e))}</span><h3>${esc(e.name)}</h3></div>
        <p class="desc">${esc(e.description || "")}</p>
        <div class="foot-line"><span><span class="new">${list.length.toLocaleString()}</span> new</span>${sevDots(sevCounts(list))}<span class="spacer"></span><span class="tag">${esc(tag)}</span></div></a>`;
    };
    const ents = entities();
    const section = (title, note, list) => `<section class="dir-section"><div class="dir-head"><h2>${esc(title)}</h2><p>${esc(note)}</p></div><div class="grid">${list.map(tile).join("")}</div></section>`;
    const planned = (state.index.jurisdictions || []).find((j) => j.key === "state") || {};
    return `<section class="brief" id="brief"><div>
        <h1>${plural(items.length, "new action")} ${esc(sinceWords())}</h1>
        <p class="brief-sub">${flagged ? `${flagged.toLocaleString()} ${flagged === 1 ? "is" : "are"} rated as likely unlawful or worse.` : "None was rated as likely unlawful."}
          ${routine ? `${plural(routine, "routine exchange fee filing")} ${routine === 1 ? "is" : "are"} not counted.` : ""} Choose a body below to see its actions, chart them, and check what RegCollect could and could not see.</p>
        <div class="stats"><a class="stat" href="#research"><div class="n">${items.length.toLocaleString()}</div><div class="l">new actions</div></a>
          <a class="stat" href="#coverage#history"><div class="n">${esc(historyStart().slice(0, 4))}</div><div class="l">history from</div></a></div>
      </div><div><p class="strip-cap">Lawfulness of new actions</p>${ratingStrip(items, (k) => `#issues?l=${k}`)}</div></section>
      ${section("The President", "Executive orders, proclamations, and memoranda", ents.filter((e) => e.type === "president"))}
      ${section("Federal agencies", "Departments, bureaus, and independent commissions", ents.filter((e) => e.type === "agency"))}
      ${section("Agency-controlled corporations", "Private bodies exercising delegated government power", ents.filter((e) => e.type === "corporation"))}
      <section class="dir-section"><div class="dir-head"><h2>State agencies</h2><p>${esc(planned.note || "Planned for a future version.")}</p></div>
        <div class="grid"><div class="tile ghost" aria-disabled="true"><div class="tile-top"><span class="code">ST</span><h3>State regulators</h3></div>
          <p class="desc">State agency rules and enforcement will appear here in a later version, alongside the federal directory.</p><div class="foot-line"><span class="tag">Planned</span></div></div></div></section>`;
  }

  // --------------------------------------------------------------- entity
  async function renderEntity(key, tab) {
    const e = entityMap()[key];
    if (!e) return renderHome();
    const tabs = [["activity", "Activity"], ["charts", "Charts"], ["coverage", "Coverage"]];
    const sroNote = key === "other_sro" ? `<div class="banner">Exchanges (such as NYSE, Nasdaq, and Cboe) and clearing agencies (such as DTC, NSCC, FICC, and the Options Clearing Corporation) are private self-regulatory organizations. Section 19(b) of the Securities Exchange Act requires them to file every rule change, including routine fee changes, with the SEC, which publishes each one in the Federal Register. RegCollect labels each filing as a fee change, a rule change, or a disciplinary matter, and hides routine fee changes unless you ask for them.</div>` : "";
    const head = `<a class="back" href="#home">Back to the directory</a>
      <div class="page-head"><span class="code">${esc(codeText(e))}</span><div><h1>${esc(e.name)}</h1><p class="desc">${esc(e.description || "")}</p></div></div>${sroNote}
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? "active" : ""}" data-go="#e/${esc(key)}/${k}">${l}</button>`).join("")}</div>`;
    if (tab === "charts") {
      const rows = await loadChartRows(key);
      return { html: head + `<p class="lede">Chart this ${e.type === "agency" ? "agency's" : "body's"} actions by their action dates, from ${esc(fmtDay(historyStart()))} to today (as far as the history backfill has reached). Choose kinds of action, sanctions, outcomes, and dates, then download the chart.</p><div id="chart-host"></div>`,
        after: () => { const ctx = state.charts[key] || (state.charts[key] = { entityName: e.name, fileKey: key }); ctx.labels = chartLabels(); ctx.today = today(); ctx.historyStart = historyStart(); window.RHCharts.render($("#chart-host"), rows, ctx); } };
    }
    if (tab === "coverage") {
      const from = state.since.dateFrom, isCorp = e.type === "corporation";
      return { html: head + `<h2>Sources checked since ${esc(fmtDay(from))}</h2><ul class="plain">${coverageList(isCorp ? "sec" : key, from)}</ul>
        ${isCorp ? `<p class="muted">${esc(e.name)} items come from SEC notices in the Federal Register; its own website is not read.</p>` : ""}
        <h2>What each kind of action can and cannot show</h2><ul class="plain">${CAT_ORDER.filter((c) => (state.index.coverage_notes || {})[c]).map((c) => `<li><strong>${esc(state.index.categories[c])}.</strong> ${esc(state.index.coverage_notes[c])}</li>`).join("")}</ul>
        <p><a href="#coverage">See everything RegCollect does and does not track</a></p>` };
    }
    const ui = state.ui[key] || (state.ui[key] = { scope: "new", cat: "all", q: "", flagged: false, sort: "severity", routine: false });
    const base = ui.scope === "new" ? state.sinceItems : (await loadPool(ui.scope)).items;
    const pool = visible(scopeItems(base, key), ui.routine);
    const cats = ["all", ...CAT_ORDER.filter((c) => pool.some((i) => i.category === c) || (e.type !== "president" && c !== "presidential"))];
    const inCat = pool.filter((i) => ui.cat === "all" || i.category === ui.cat);
    const q = ui.q.trim().toLowerCase();
    const matcher = q ? window.RHSearch.matcher(q) : null;
    const shown = inCat.filter((i) => (!ui.flagged || i.rating) && (!matcher || matcher(i))).sort(ui.sort === "date" ? byDate : bySeverity);
    const cnt = (c) => pool.filter((i) => c === "all" || i.category === c).length;
    const fromDay = ui.scope === "new" ? state.since.dateFrom : periodRange(ui.scope).from;
    const corpNote = key === "sec" ? `<p class="muted small">Filings by FINRA, PCAOB, MSRB, and the exchanges are under <a href="#e/finra">agency-controlled corporations</a>.</p>` : "";
    const scopes = [["new", state.since.mode === "visit" ? `New since ${fmtDay(state.since.visitDay)}` : `Since ${fmtDay(state.since.dateFrom)}`], ["12m", "Past 12 months"], ["all", `Since ${historyStart().slice(0, 4)}`]];
    const html = head + corpNote + `
      <div class="toolbar"><span class="seg" data-ui="scope">${scopes.map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.scope === v ? "active" : ""}">${esc(l)}</button>`).join("")}</span>
        <span class="seg" data-ui="sort">${[["severity", "Most likely unlawful first"], ["date", "Newest first"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.sort === v ? "active" : ""}">${l}</button>`).join("")}</span></div>
      <div class="tabs" id="cat-tabs">${cats.map((c) => `<button type="button" data-cat="${c}" class="${c === ui.cat ? "active" : ""}">${esc(c === "all" ? "All" : state.index.categories[c])}<span class="count">${cnt(c)}</span></button>`).join("")}</div>
      <div class="toolbar"><input type="search" id="f-q" placeholder="Filter by words (related words count too)" value="${esc(ui.q)}">
        <label><input type="checkbox" id="f-flag" ${ui.flagged ? "checked" : ""}> Only rated constitutional issues</label>
        ${key === "other_sro" ? `<label><input type="checkbox" id="f-routine" ${ui.routine ? "checked" : ""}> Include routine fee filings</label>` : ""}
        <a href="#research?e=${esc(key)}">Research this ${e.type === "agency" ? "agency" : "body"} in depth</a></div>
      <div id="items">${shown.length ? listWithMore(shown, `list:${key}`, {}) : notFound(ui.cat === "all" ? "actions" : state.index.categories[ui.cat].toLowerCase() + " items", ui.cat === "all" ? "enforcement" : ui.cat, e.type === "corporation" ? "sec" : key, inCat.length > 0, fromDay)}</div>`;
    return { html, after: () => bindEntity(key) };
  }
  function bindEntity(key) {
    const ui = state.ui[key];
    $$("[data-ui] button").forEach((b) => b.addEventListener("click", () => { ui[b.parentElement.dataset.ui] = b.dataset.v; rerender(); }));
    $$("#cat-tabs [data-cat]").forEach((b) => b.addEventListener("click", () => { ui.cat = b.dataset.cat; rerender(); }));
    const q = $("#f-q");
    if (q) q.addEventListener("input", () => { ui.q = q.value; const pos = q.selectionStart; rerender(() => { const n = $("#f-q"); n.focus(); n.setSelectionRange(pos, pos); }); });
    const f = $("#f-flag"); if (f) f.addEventListener("change", () => { ui.flagged = f.checked; rerender(); });
    const r = $("#f-routine"); if (r) r.addEventListener("change", () => { ui.routine = r.checked; rerender(); });
  }
  function chartLabels() {
    return { categories: state.index.categories, sanctions: sanctionMap(), outcomes: outcomeMap(),
      kinds: Object.fromEntries(doctrine().issues.map((k) => [k.code, k.label])), level: LEVEL_FULL, impact: IMPACT };
  }

  // --------------------------------------------------------------- issues
  async function renderIssues() {
    const p = state.params;
    const scope = p.get("scope") || "new";
    const all = visible(scope === "new" ? state.sinceItems : (await loadPool(scope)).items);
    const showPossible = p.get("poss") === "1";
    const lv = +p.get("l") || 0, im = +p.get("i") || 0, kind = p.get("kind") || "", structural = p.get("s") === "1";
    const pool = all.filter((i) => i.rating);
    const base = pool.filter((it) => (!kind || rated(it).some((f) => f.code === kind)) && (!structural || rated(it).some((f) => f.structural)) && (!im || impactOf(it) === im));
    const shown = base.filter((it) => !lv || band(it) === lv).sort(bySeverity);
    const link = (mods) => { const q = new URLSearchParams(p); Object.entries(mods).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k))); return `#issues?${q}`; };
    const kinds = doctrine().issues.map((k) => ({ ...k, n: pool.filter((it) => rated(it).some((f) => f.code === k.code)).length })).filter((k) => k.n || k.code === kind);
    let groups = "";
    [3, 2, 1].forEach((a) => {
      const list = shown.filter((it) => band(it) === a);
      if (list.length) groups += `<div class="group-h"><h3 class="c${a}">${esc(LEVEL_FULL[a])}</h3><span class="muted">${plural(list.length, "action")}</span></div>${listWithMore(list, `iss:${a}`, { showEntity: true })}`;
    });
    const poss = showPossible ? all.filter((it) => !it.rating && possible(it).length && (!kind || possible(it).some((f) => f.code === kind))).sort(byDate) : [];
    const scopes = [["new", sinceWords()[0].toUpperCase() + sinceWords().slice(1)], ["12m", "Past 12 months"], ["all", `Since ${historyStart().slice(0, 4)}`]];
    return { html: `<h1>Constitutional issues</h1>
      <p class="lede">Each flagged action is rated on one scale, <strong>lawfulness</strong>: how likely it is that the action is unlawful under the Constitution or the limits on executive power, under today's law. “Likely” marks an arguable issue worth a lawyer's look. The rating comes from a <a href="#methods">published rubric</a> and, when a court has ruled on the action itself, from that ruling. <strong>Impact</strong> is shown for context and never changes a rating.</p>
      <div class="toolbar"><span class="seg">${scopes.map(([v, l]) => `<button type="button" class="${scope === v ? "active" : ""}" data-go="${link({ scope: v === "new" ? "" : v })}">${esc(l)}</button>`).join("")}</span>
        <label><input type="checkbox" id="iss-s" ${structural ? "checked" : ""}> Structural issues only</label>
        ${lv || im || kind ? `<a href="${link({ l: "", i: "", kind: "" })}">Clear selection</a>` : ""}</div>
      ${ratingStrip(base, (k) => link({ l: lv === k ? "" : k }))}
      <div class="toolbar">Impact <span class="seg">${[[0, "Any"], [3, IMPACT[3]], [2, IMPACT[2]], [1, IMPACT[1]]].map(([v, l]) => `<button type="button" class="${im === v ? "active" : ""}" data-go="${link({ i: v || "" })}">${esc(l)}</button>`).join("")}</span>
        <span class="muted small">Context only; it does not change the rating.</span></div>
      <h2>Kind of issue</h2>
      <div class="chips">${kinds.map((k) => `<a class="chip ${k.code === kind ? "on" : ""}" href="${link({ kind: k.code === kind ? "" : k.code })}">${esc(k.label)} <span class="k">${k.n}</span></a>`).join("") || '<span class="muted">No rated issues in this period.</span>'}</div>
      <h2>${plural(shown.length, "rated action")}</h2>
      ${groups || `<div class="notfound"><h3>No rated actions match</h3><p>None of the actions in this period met the rubric's elements for a rating. Possible issues that were screened but not rated are listed below if you include them.</p></div>`}
      <h2>Possible issues (not rated)</h2>
      <p class="muted">Actions whose wording touches an issue but where the elements needed for a rating were not found. They are not counted as flags. Many will be rated once RegCollect has read their full text.</p>
      ${showPossible ? (poss.length ? listWithMore(poss, "iss:poss", { showEntity: true }) : '<p class="muted">None in this period.</p>') : `<p><a class="btn ghost small" href="${link({ poss: "1" })}">Show possible issues</a></p>`}`,
      after: () => { const s2 = $("#iss-s"); if (s2) s2.addEventListener("change", () => go(link({ s: s2.checked ? "1" : "" }))); } };
  }

  // ------------------------------------------------------------- research
  const EXAMPLES = ["Almost certainly unlawful actions by the President, as a timeline", "IEEPA tariffs", "Rules that relied on Chevron deference",
    "Religious freedom and RFRA", "Penalties decided by in-house judges", "Agencies acting like Congress", "SEC gag orders and no-deny settlements",
    "Eviction moratorium", "Grant terminations and impoundment", "Proposed rules open for comment about AI"];
  const SORTS = { date: (it) => it.date || "", body: (it) => entityNames(it), title: (it) => it.title || "", type: (it) => it.subcategory || "",
    level: (it) => band(it), impact: (it) => impactOf(it), issues: (it) => rated(it).length };
  function sortItems(items, sort) {
    if (!sort) return items.slice().sort(bySeverity);
    const [col, dir] = sort.split(":"); const f = SORTS[col] || SORTS.date; const m = dir === "asc" ? 1 : -1;
    return items.slice().sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * m || (b.date || "").localeCompare(a.date || ""); });
  }
  function tableHtml(items, key) {
    const sort = state.params.get("sort") || "";
    const [col, dir] = sort.split(":");
    const th = (c, label) => `<th><button type="button" data-sort="${c}" class="${col === c ? "on" : ""}" title="Sort">${label}${col === c ? (dir === "asc" ? " ▲" : " ▼") : ""}</button></th>`;
    const n = state.ui[key] || 200;
    const rows = sortItems(items, sort).slice(0, n).map((it) => {
      const open = state.open[it.id];
      return `<tr><td class="d">${esc(fmtDay(it.date))}</td><td>${esc(entityNames(it))}</td>
        <td><a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a></td><td>${esc(it.subcategory)}</td>
        <td>${it.rating ? pill(it.rating.level) : '<span class="muted small">Not rated</span>'}</td><td class="small">${esc(IMPACT[impactOf(it)] || "")}</td>
        <td>${(it.flags || []).length ? `<button type="button" class="why-btn" data-why="${esc(it.id)}">${esc(listText((rated(it).length ? rated(it) : possible(it)).map((f) => issueLabel(f.code))))}${rated(it).length ? "" : " (possible)"} ${open ? "(hide)" : "(why)"}</button>` : ""}</td></tr>
        ${open ? `<tr class="detail"><td colspan="7">${whyHtml(it)}</td></tr>` : ""}`;
    }).join("");
    return `<div class="wrap-x"><table class="t"><thead><tr>${th("date", "Date")}${th("body", "Agency or body")}${th("title", "Title")}${th("type", "Type")}${th("level", "Lawfulness")}${th("impact", "Impact")}${th("issues", "Why flagged")}</tr></thead><tbody>${rows}</tbody></table></div>
      ${items.length > n ? `<p><button type="button" class="btn ghost" data-more="${esc(key)}">Show more of ${items.length.toLocaleString()}</button></p>` : ""}`;
  }
  async function renderResearch() {
    const p = state.params;
    const said = window.RHSearch.parseDates(p.get("q") || "");
    const period = p.get("p") || (said && said.from && said.from < addDays(today(), -365) ? "all" : "12m");
    const view$ = $("#view");
    const pool = await loadPool(period, (d, n) => { if (n > 20 && view$) view$.innerHTML = `<p class="progress">Loading ${d} of ${n} files…</p>`; });
    const q = p.get("q") || "", strict = p.get("m") === "strict", group = p.get("g") || "none", view = p.get("v") || "cards";
    const facet = (k) => (p.get(k) || "").split(",").filter(Boolean);
    const facets = { entities: facet("e"), categories: facet("cat"), sanctions: facet("san"), issues: facet("iss"), outcomes: facet("out"),
      levels: facet("l").map(Number), impact: facet("im").map(Number), from: p.get("from") || "", to: p.get("to") || "", routine: p.get("routine") === "1" };
    const engine = pool.engine;
    const parsed = engine.parse(q);
    const drop = facet("drop");
    parsed.entities = parsed.entities.filter((x) => !drop.includes(`e:${x.key}`));
    parsed.concepts = parsed.concepts.filter((x) => !drop.includes(`${x.kind}:${x.key}`));
    parsed.severity = parsed.severity.filter((x) => !drop.includes(`sev:${x.axis}`));
    if (drop.includes("date")) parsed.date = null;
    const anything = q.trim() || Object.entries(facets).some(([k, v]) => k !== "routine" && (Array.isArray(v) ? v.length : v));
    const res = anything ? engine.search(parsed, facets, strict) : { strong: [], related: [], total: 0 };
    const all = res.strong.map((r) => r.it);
    const em = entityMap(), sm = sanctionMap(), om = outcomeMap(), imap = issueMap();
    const understood = [
      ...parsed.entities.map((x) => [`e:${x.key}`, "Agency", em[x.key].name]),
      ...parsed.concepts.map((x) => [`${x.kind}:${x.key}`, { sanction: "Sanction", issue: "Issue", category: "Kind", outcome: "Outcome", statute: "Statute" }[x.kind],
        x.kind === "statute" ? (((doctrine().statutes || []).find((t) => t.key === x.key)) || { label: x.said }).label : x.kind === "sanction" ? sm[x.key].label : x.kind === "issue" ? (imap[x.key] || {}).label : x.kind === "outcome" ? om[x.key] : x.key.startsWith("sub:") ? x.key.slice(4) + "s" : state.index.categories[x.key]]),
      ...parsed.severity.map((x) => [`sev:${x.axis}`, "Rating", x.axis === "level" ? (x.min >= 3 ? "Almost certainly unlawful" : "Very likely or almost certainly unlawful") : x.axis === "impact" ? "Serious impact" : x.axis === "structural" ? "Structural issues" : "Any rated constitutional issue"]),
      ...(parsed.date ? [["date", "Dates", [parsed.date.from && fmtDay(parsed.date.from), parsed.date.to && fmtDay(parsed.date.to)].filter(Boolean).join(" to ")]] : []),
    ];
    const items = visible(pool.items, facets.routine);
    const count = (fn) => items.filter(fn).length;
    const fbox = (name, key, opts, open) => `<details class="facet" ${open ? "open" : ""}><summary>${esc(name)}${facet(key).length ? ` (${facet(key).length})` : ""}</summary>${opts}</details>`;
    const cb = (key, val, label, n) => `<label><input type="checkbox" data-f="${key}" value="${esc(val)}" ${facet(key).includes(String(val)) ? "checked" : ""}> ${esc(label)} <span class="c">${n}</span></label>`;
    const fams = (state.tax.sanction_families || []).map((f) => `<div class="fam">${esc(f.label)}</div>${state.tax.sanctions.filter((s) => s.family === f.key).map((s) => cb("san", s.key, s.label, count((it) => (it.sanctions || []).includes(s.key)))).join("")}`).join("");
    const years = []; for (let y = new Date().getFullYear(); y >= +historyStart().slice(0, 4); y--) years.push(String(y));
    const side = `<aside class="facets" aria-label="Filters">
      <div class="facet"><label for="r-period" style="display:block;margin-bottom:4px">Period searched</label>
        <select id="r-period" style="width:100%"><option value="12m" ${period === "12m" ? "selected" : ""}>Past 12 months</option><option value="all" ${period === "all" ? "selected" : ""}>Since ${historyStart().slice(0, 4)} (larger download)</option>
          ${years.map((y) => `<option value="${y}" ${period === y ? "selected" : ""}>${y}</option>`).join("")}</select>
        <p class="muted small" style="margin:6px 0 0">${pool.items.length.toLocaleString()} actions loaded.</p></div>
      ${fbox("Lawfulness", "l", [3, 2, 1].map((v) => cb("l", v, LEVEL_FULL[v], count((it) => band(it) === v))).join(""), true)}
      ${fbox("Impact (context only)", "im", [3, 2, 1].map((v) => cb("im", v, IMPACT[v], count((it) => impactOf(it) === v))).join(""), facet("im").length)}
      ${fbox("Agency or body", "e", entities().map((e) => cb("e", e.key, e.name, count((it) => entityOf(it).includes(e.key)))).join(""), facet("e").length)}
      ${fbox("Kind of action", "cat", CAT_ORDER.map((c) => cb("cat", c, state.index.categories[c], count((it) => it.category === c))).join(""), facet("cat").length)}
      ${fbox("Sanction", "san", fams, facet("san").length)}
      ${fbox("Constitutional issue", "iss", doctrine().issues.map((k) => cb("iss", k.code, k.label, count((it) => rated(it).some((f) => f.code === k.code)))).join(""), facet("iss").length)}
      ${fbox("Outcome", "out", (state.tax.outcomes || []).map((o) => cb("out", o.key, o.label, count((it) => it.outcome === o.key))).join(""), facet("out").length)}
      <details class="facet" ${facets.from || facets.to ? "open" : ""}><summary>Dates of action</summary>
        <label>From <input type="date" data-d="from" value="${esc(facets.from)}"></label><label>To <input type="date" data-d="to" value="${esc(facets.to)}"></label></details>
      <div class="facet"><label><input type="checkbox" id="r-routine" ${facets.routine ? "checked" : ""}> Include routine exchange fee filings</label></div>
    </aside>`;
    let body;
    if (!anything) {
      body = `<div class="panel"><h3>Ask the way you would ask a research assistant</h3><p class="muted">RegCollect reads your request for agencies, dates, sanctions, constitutional issues, outcomes, and ratings, then ranks every action in the period by how well it matches, including related words (“gag” also finds “no-deny” and “nondisparagement”), other forms of a word (“barred” finds “bar”), and small typos. Nothing you type leaves this browser.</p></div>`;
    } else {
      const groupKey = (it) => group === "entity" ? entityOf(it).map((k) => (em[k] || {}).name || k)
        : group === "issue" ? (rated(it).length ? rated(it).map((f) => issueLabel(f.code)) : ["No rated constitutional issue"])
        : group === "sanction" ? ((it.sanctions || []).length ? it.sanctions.map((k) => sm[k].label) : ["No sanction wording"])
        : group === "category" ? [state.index.categories[it.category]]
        : group === "level" ? [it.rating ? LEVEL_FULL[it.rating.level] : "Not rated"]
        : group === "impact" ? [IMPACT[impactOf(it)] || "No impact recorded"]
        : group === "date" ? [(() => { const d = new Date(it.date + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `Week of ${fmtDay(localDay(d))}`; })()] : ["Results"];
      const RANK = { [LEVEL_FULL[3]]: 0, [LEVEL_FULL[2]]: 1, [LEVEL_FULL[1]]: 2, [IMPACT[3]]: 0, [IMPACT[2]]: 1, [IMPACT[1]]: 2, "Not rated": 9, "No impact recorded": 9 };
      const buckets = new Map();
      res.strong.forEach((r) => groupKey(r.it).forEach((g) => { if (!buckets.has(g)) buckets.set(g, []); buckets.get(g).push(r); }));
      const ordered = [...buckets.entries()];
      if (group === "date") ordered.sort((a, b) => (b[1][0].it.date || "").localeCompare(a[1][0].it.date || ""));
      else if (group === "level" || group === "impact") ordered.sort((a, b) => RANK[a[0]] - RANK[b[0]]);
      else if (group !== "none") ordered.sort((a, b) => b[1].length - a[1].length);
      const render = (rs, k) => view === "table" ? tableHtml(rs.map((r) => r.it), k)
        : rs.slice(0, state.ui[k] || PAGE).map((r) => itemHtml(r.it, { showEntity: true, why: r.why.slice(0, 4).join(", ") })).join("") +
          (rs.length > (state.ui[k] || PAGE) ? `<p><button type="button" class="btn ghost" data-more="${esc(k)}">Show more of ${rs.length.toLocaleString()}</button></p>` : "");
      body = `<div class="figures"><div class="figure"><div class="n">${res.strong.length.toLocaleString()}</div><div class="l">strong matches</div></div>
          <div class="figure"><div class="n">${res.related.length.toLocaleString()}</div><div class="l">related matches below</div></div>
          <div class="figure"><div class="n">${all.filter((it) => it.rating).length.toLocaleString()}</div><div class="l">rated as likely unlawful or worse</div></div>
          <div class="figure"><div class="n">${all.filter((it) => band(it) === 3).length}</div><div class="l">almost certainly</div></div></div>
        ${res.relaxed ? `<div class="banner">No action matched every part of your request, so RegCollect left out ${esc(res.relaxed)} and shows the closest matches.</div>` : ""}
        ${res.suggest && res.suggest.length ? `<p class="muted small">Did you mean: ${res.suggest.map((x) => `<a href="#research?q=${encodeURIComponent(x)}">${esc(x)}</a>`).join(", ")}?</p>` : ""}
        <div class="toolbar">Group by <span class="seg" data-p="g">${[["none", "Relevance"], ["level", "Lawfulness"], ["impact", "Impact"], ["entity", "Agency"], ["issue", "Issue"], ["sanction", "Sanction"], ["category", "Kind"], ["date", "Week"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${group === v ? "active" : ""}">${l}</button>`).join("")}</span>
          Show as <span class="seg" data-p="v">${[["cards", "Cards"], ["table", "Table"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${view === v ? "active" : ""}">${l}</button>`).join("")}</span>
          <button type="button" class="btn ghost small" id="r-csv">Download CSV</button><button type="button" class="btn ghost small" id="r-link">Copy link</button></div>
        ${view === "table" ? '<p class="muted small">Flagged actions come first. Click a column heading to sort; click it again to reverse.</p>' : ""}
        ${ordered.map(([g, rs], n) => `${group !== "none" ? `<div class="group-h"><h3>${esc(g)}</h3><span class="muted">${rs.length}</span></div>` : ""}${render(rs, `r:${n}`)}`).join("")
          || `<div class="notfound"><h3>No strong matches</h3><p>Try removing a recognized part (click its ×), switching to “Best matches first,” widening the period, or widening the dates.</p></div>`}
        ${res.related.length ? `<details class="panel"><summary>Related matches (${res.related.length.toLocaleString()}): weaker matches, kept so nothing is silently left out</summary>
          ${view === "table" ? tableHtml(res.related.map((r) => r.it), "rel") : res.related.slice(0, 60).map((r) => itemHtml(r.it, { showEntity: true, why: r.why.slice(0, 4).join(", ") })).join("")}</details>` : ""}
        ${limitsNote(parsed, facets, pool)}`;
    }
    const html = `<h1>Research</h1><p class="lede">Describe what you want, or use the filters. Results are dated by the agency's action date.</p>
      <div class="research">${side}<div>
        <form class="askbox" id="ask" role="search"><label class="sr" for="ask-q">Describe what you are looking for</label>
          <input id="ask-q" type="search" value="${esc(q)}" placeholder="e.g. FINRA expulsions and bars since September"><button class="btn" type="submit">Search</button></form>
        <div class="examples">Try: ${EXAMPLES.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join(" ")}</div>
        ${q.trim() ? `<div class="understood"><div class="chips">${understood.map(([id, k, l]) => `<span class="chip"><span class="k">${esc(k)}</span>${esc(l)}<button type="button" data-drop="${esc(id)}" aria-label="Remove ${esc(l)}">×</button></span>`).join("")}
            ${parsed.terms.length ? `<span class="chip"><span class="k">Words</span>${esc(parsed.terms.join(", "))}</span>` : ""}</div>
            ${drop.length ? `<a href="#" id="undrop">Restore removed parts</a>` : ""}
            <div class="toolbar">Match <span class="seg" data-p="m">${[["", "Best matches first"], ["strict", "Every recognized part"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(p.get("m") || "") === v ? "active" : ""}">${l}</button>`).join("")}</span></div></div>` : ""}
        ${body}</div></div>`;
    return { html, after: () => bindResearch(res) };
  }
  function limitsNote(parsed, facets, pool) {
    const sm = sanctionMap(), imap = issueMap();
    const neverSeen = parsed.concepts.filter((c) => (c.kind === "sanction" || c.kind === "issue") &&
      !pool.items.some((it) => (c.kind === "sanction" ? (it.sanctions || []).includes(c.key) : (it.flags || []).some((f) => f.code === c.key))))
      .map((c) => (c.kind === "sanction" ? sm[c.key].label : (imap[c.key] || {}).label));
    const wantsActions = parsed.concepts.some((c) => c.kind === "sanction" || (c.kind === "category" && c.key === "enforcement")) || facets.sanctions.length;
    const bf = state.index.backfill;
    const historyGap = bf && !Object.values(bf.done || {}).every(Boolean) ? `The history backfill is still running; Federal Register history currently reaches back to ${esc(fmtDay((bf.next || {}).federal_register + "-28"))}.` : "";
    if (!wantsActions && !neverSeen.length && !historyGap) return "";
    return `<div class="notfound"><h3>Limits on these results</h3><ul class="plain">
      ${neverSeen.map((l) => `<li>No action in this period is tagged “${esc(l)}.” Either none was published in the sources checked, or the wording appears only in full documents RegCollect has not read yet (it reads presidential documents, flagged actions, and significant rules first; see <a href="#coverage#fulltext">full-text progress</a>).</li>`).join("")}
      ${historyGap ? `<li>${historyGap}</li>` : ""}${wantsActions ? `<li>${esc(state.index.coverage_notes.enforcement)}</li>` : ""}</ul><p><a href="#coverage">What we track</a></p></div>`;
  }
  function csvOf(items) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const sm = sanctionMap(), om = outcomeMap();
    const head = ["Action date", "Date basis", "Published", "Agency or body", "Kind", "Type", "Outcome", "Title", "Link", "Lawfulness", "Impact", "Impact points", "Rated constitutional issues", "Possible issues (not rated)", "Court ruling", "Statutes cited", "Full text read", "Sanctions", "Source", "Comments due"];
    const rows = items.map((it) => [it.date, it.date_basis || "published", it.published || it.date, entityNames(it), state.index.categories[it.category], it.subcategory, om[it.outcome], it.title, it.url,
      it.rating ? LEVEL_FULL[it.rating.level] : "", IMPACT[impactOf(it)] || "", (it.impact || {}).points ?? "",
      rated(it).map((f) => issueLabel(f.code)).join("; "), possible(it).map((f) => issueLabel(f.code)).join("; "), (it.flags || []).filter((f) => f.ruling).map((f) => f.ruling).join("; "),
      (it.statutes || []).join("; "), (it.ft || {}).read || "", (it.sanctions || []).map((k) => (sm[k] || {}).label || k).join("; "), it.source_label, it.comments_close || ""]);
    return [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
  }
  function download(name, text) { downloadAs(name, "﻿" + text, "text/csv;charset=utf-8"); }
  function downloadAs(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 600);
  }
  function bindResearch(res) {
    const p = new URLSearchParams(state.params);
    const push = () => go(`#research?${p}`, true);
    $("#ask").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#ask-q").value.trim(); v ? p.set("q", v) : p.delete("q"); p.delete("drop"); push(); });
    $$("[data-ex]").forEach((b) => b.addEventListener("click", () => { p.set("q", b.dataset.ex); p.delete("drop"); push(); }));
    $$("[data-f]").forEach((el) => el.addEventListener("change", () => { const k = el.dataset.f; const vals = $$(`[data-f="${k}"]:checked`).map((x) => x.value); vals.length ? p.set(k, vals.join(",")) : p.delete(k); push(); }));
    $$("[data-d]").forEach((el) => el.addEventListener("change", () => { el.value ? p.set(el.dataset.d, el.value) : p.delete(el.dataset.d); push(); }));
    $$("[data-p] button").forEach((b) => b.addEventListener("click", () => { const k = b.parentElement.dataset.p; b.dataset.v ? p.set(k, b.dataset.v) : p.delete(k); push(); }));
    $$("[data-drop]").forEach((b) => b.addEventListener("click", () => { const d = (p.get("drop") || "").split(",").filter(Boolean); d.push(b.dataset.drop); p.set("drop", d.join(",")); push(); }));
    $$("[data-sort]").forEach((b) => b.addEventListener("click", () => { const [c, d] = (p.get("sort") || "").split(":"); p.set("sort", `${b.dataset.sort}:${c === b.dataset.sort && d !== "asc" ? "asc" : "desc"}`); push(); }));
    $$("[data-why]").forEach((b) => b.addEventListener("click", () => { state.open[b.dataset.why] = !state.open[b.dataset.why]; rerender(); }));
    const per = $("#r-period"); if (per) per.addEventListener("change", () => { p.set("p", per.value); push(); });
    const rt = $("#r-routine"); if (rt) rt.addEventListener("change", () => { rt.checked ? p.set("routine", "1") : p.delete("routine"); push(); });
    const u = $("#undrop"); if (u) u.addEventListener("click", (e) => { e.preventDefault(); p.delete("drop"); push(); });
    const c = $("#r-csv"); if (c) c.addEventListener("click", () => download("regcollect-research.csv", csvOf([...res.strong, ...res.related].map((r) => r.it))));
    const l = $("#r-link"); if (l) l.addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); l.textContent = "Link copied"; } catch (e) { l.textContent = "Copy the address bar"; } });
  }

  // ---------------------------------------------------------- methodology
  function renderMethods() {
    const d = doctrine(), A = d.authorities || {}, r = d.rubric || {}, rev = d.review || {};
    const scales = state.tax.scales || {};
    const cs = scales.constitutionality || { levels: [] };
    const myReviews = Object.values(reviews());
    const precedentRows = (i) => ["direct", "analogy", "open"].map((lv) => {
      const rs = (i.precedent || []).filter((t) => t.level === lv);
      return `<li><strong>${esc(PRECEDENT[lv])}.</strong> ${rs.length ? rs.map((t) => `${esc(t.note)} <span class="cite">${esc((A[t.authority] || {}).cite)}</span>`).join(" ") : '<span class="muted">No holding of this strength yet for this kind of issue.</span>'}</li>`;
    }).join("");
    const rulingsFor = (code) => (d.rulings || []).filter((x) => x.issue === code);
    return `<article class="prose"><h1>Methodology</h1>
      <p class="lede">How RegCollect decides what to flag and how to rate it. Every flag in the app links back to one of the memos below. Rubric version ${esc(d.rubric_version || "")}.</p>
      <div class="banner"><strong>${esc(rev.status || "Draft")}.</strong> ${rev.reviewed_by ? `Reviewed by ${esc(rev.reviewed_by)} on ${esc(fmtDay(rev.last_reviewed))}.` : "These memos are drafts awaiting review by a lawyer or law-trained reader."} Holdings are short paraphrases for screening; verify every authority before relying on it. The same text is in <a href="https://github.com/JoeDonnelly840/Agency-Repository-Public-/blob/main/DOCTRINE.md" rel="noopener">DOCTRINE.md</a> in the repository.</div>
      <div class="toc"><a href="#methods#rubric">The rubric</a><a href="#methods#rulings">Known rulings</a><a href="#methods#fulltext">Full-text reading</a><a href="#methods#improve">Improving accuracy</a>${d.issues.map((i) => `<a href="#methods#m-${esc(i.code)}">${esc(i.label)}</a>`).join("")}</div>
      <h2 id="rubric">The rubric</h2>
      <h3>Lawfulness (the rating)</h3><ul>${(r.constitutionality || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <ul class="plain">${cs.levels.map((l) => `<li>${pill(l.value)} <strong>${esc(l.full || l.name)}.</strong> ${esc(l.meaning)}</li>`).join("")}
        ${cs.unrated ? `<li><span class="pill c0"><span class="k">Possible issue</span>not rated</span> ${esc(cs.unrated.meaning)}</li>` : ""}</ul>
      <h3>Impact (context only)</h3><ul>${(r.impact || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <h3>Precedent strength</h3><p>Every memo sorts its precedent into the same three levels, always in this order: <strong>direct holding</strong>, <strong>close analogy</strong>, and <strong>open question</strong>. A memo that has no direct holding says so rather than skipping a level.</p>
      <h2 id="rulings">Known rulings on specific actions</h2>
      <p>When a court has ruled on the very action being rated, that ruling sets the rating. Several of these holdings are statutory (the agency or the President acted beyond the power Congress gave), which is a separation-of-powers limit; each says which kind it is.</p>
      <div class="wrap-x"><table class="t"><thead><tr><th>Action</th><th>Court</th><th>Result</th><th>Rating</th><th>What the court held</th></tr></thead><tbody>
        ${(d.rulings || []).map((x) => `<tr><td>${esc(x.label)}</td><td>${esc(x.court_label)}</td><td>${x.result === "upheld" ? "Upheld" : "Held unlawful"}</td><td>${x.result === "upheld" ? "Lowers one step" : pill(x.level)}</td><td class="small">${esc((A[x.authority] || {}).held || x.summary)} <span class="cite">${esc((A[x.authority] || {}).cite)}</span>${x.caution ? ` <em>${esc(x.caution)}</em>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <h2 id="fulltext">Full-text reading</h2>
      <p>Titles and summaries rarely say which statute an action relies on, or whether it invokes Chevron, an emergency power, or a religious exemption. RegCollect therefore also reads documents' full text, using only the Federal Register's own public interfaces: (1) its full-text search, asked about a fixed list of legal terms (${(d.statutes || []).length} statutes and doctrines are recognized), and (2) the plain-text version of the most important documents (presidential documents, flagged actions, and significant rules), one at a time with pauses, after checking robots.txt. Only short passages around the phrases the tests look for are kept, and each flag says which elements came from the full text. Regulations.gov attachments, SEC and agency press releases, and FDA recall reports are still rated from their titles and summaries.</p>
      <h2 id="improve">Improving accuracy</h2>
      <p>Open “Why flagged” on any action and record your view (agree, should be higher, should be lower, not an issue). Your notes stay in this browser. Download them below and add the file to the repository as <code>review/labels.json</code>. Each morning the collector compares the rubric with every reviewed action and records the agreement rate below, so changes to the rubric can be checked against your judgment.</p>
      ${state.index.review_report ? `<p><strong>Agreement with reviewers:</strong> ${esc(state.index.review_report.summary)}</p>` : ""}
      <p>${plural(myReviews.length, "review")} recorded in this browser. ${myReviews.length ? `<button type="button" class="btn ghost small" id="dl-reviews">Download my reviews</button>` : ""}</p>
      <h2>The doctrine library</h2>
      ${d.issues.map((i) => `<section class="memo" id="m-${esc(i.code)}"><h3>${esc(i.label)}</h3>
        <p class="muted small">${i.group === "structural" ? "Structural" : "Individual rights"}</p>
        <p><strong>Question.</strong> ${esc(i.question)}</p><p><strong>Test.</strong> ${esc(i.test)}</p>
        <p><strong>Elements checked in each document</strong> (gate elements must all appear before the issue is rated)</p><ol>${i.elements.map((e) => `<li>${esc(e.text)}${e.gate ? ' <span class="gate">gate</span>' : ""}</li>`).join("")}</ol>
        ${(i.weighed || []).length ? `<p><strong>Weighed factors</strong></p><ul>${i.weighed.map((w) => `<li>${esc(w.text)} <span class="muted small">(${EFFECT[w.effect || (w.lowers ? "lowers" : "noted")]})</span></li>`).join("")}</ul>` : ""}
        ${i.max_level && i.max_level < 3 ? `<p><strong>Cap:</strong> rated ${esc(LEVEL_FULL[i.max_level].toLowerCase())} at most.</p>` : ""}
        ${i.open_rated === false ? "<p><strong>Open questions under this memo are listed as possible issues, not rated</strong>, because they cover thousands of routine filings no court has addressed.</p>" : ""}
        ${i.excludes ? "<p><strong>Not flagged:</strong> ratifications, which cure an appointment defect rather than raise one.</p>" : ""}
        <p><strong>Precedent</strong> (first rule that matches)</p><ul>${precedentRows(i)}</ul>
        ${rulingsFor(i.code).length ? `<p><strong>Court rulings on specific actions</strong></p><ul>${rulingsFor(i.code).map((x) => `<li>${esc(x.label)}: ${esc(x.summary)}</li>`).join("")}</ul>` : ""}
        <p><strong>Authorities</strong></p><ul>${i.authorities.map((k) => `<li><span class="cite">${esc((A[k] || {}).cite)}</span>, decided ${esc(fmtDay((A[k] || {}).decided))}. ${esc((A[k] || {}).held)}</li>`).join("")}</ul>
        <p><strong>Open questions</strong></p><ul>${i.open_questions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>`).join("")}</article>`;
  }

  // ------------------------------------------------------------- coverage
  function renderCoverage() {
    const ix = state.index, tax = state.tax;
    const srcRows = Object.entries(ix.sources || {}).map(([k, s]) => `<tr><td>${esc(s.label)}</td><td><span class="status ${esc(s.last_status)}">${esc(s.last_status)}</span></td>
      <td class="d">${esc(fmtTime(s.last_attempt))}</td><td class="d">${esc(s.covered_through ? fmtDay(s.covered_through) : "never")}</td><td class="small">${esc(s.last_detail || "")}</td></tr>`).join("");
    const configured = Object.keys(ix.source_agencies || {}).filter((k) => !(ix.sources || {})[k]);
    const bf = ix.backfill || null;
    const hist = bf ? Object.entries(bf.next || {}).map(([s, m]) => `<li><strong>${esc(sourceLabel(s))}</strong>: ${(bf.done || {})[s] ? `complete back to ${esc(fmtDay(bf.target_start))}` : `filled back to the start of ${esc(new Date(m + "-15T12:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" }))} and continuing`}</li>`).join("")
      : `<li>The history backfill has not run yet. It starts automatically and fills back to ${esc(fmtDay(historyStart()))}, newest months first.</li>`;
    const sanctions = (tax.sanction_families || []).map((f) => `<h3>${esc(f.label)}</h3><ul class="plain">${tax.sanctions.filter((s) => s.family === f.key).map((s) => `<li>${esc(s.label)}</li>`).join("")}</ul>`).join("");
    const runs = (ix.runs || []).slice(-12).reverse().map((r) => `<tr><td class="d">${esc(fmtTime(r.run_at))}</td><td>${(r.kind || "daily") === "daily" ? "Daily" : "History"}</td><td class="d">${esc(fmtDay(r.start))} to ${esc(fmtDay(r.end))}</td><td class="num">${r.items_new ?? ""}</td><td class="num">${r.requests ?? ""}</td></tr>`).join("");
    return `<h1>What we track</h1><p class="lede">Everything RegCollect reads, when each source was last checked, the limits of each kind of search, and, just as important, what it does not track.</p>
      <div class="toc"><a href="#coverage#sources">Sources</a><a href="#coverage#history">History</a><a href="#coverage#limits">Limits</a><a href="#coverage#not">Not tracked</a><a href="#coverage#dates">Dates</a><a href="#coverage#sanctions">Kinds of sanction</a><a href="#coverage#runs">Recent runs</a></div>
      <h2 id="sources">Sources</h2>
      <div class="wrap-x"><table class="t"><thead><tr><th>Source</th><th>Last result</th><th>Last attempt</th><th>Checked through</th><th>Notes</th></tr></thead><tbody>${srcRows || '<tr><td colspan="5">No runs yet.</td></tr>'}
        ${configured.map((k) => `<tr><td>${esc(sourceLabel(k))}</td><td><span class="status skipped">new</span></td><td colspan="3" class="small">It will be checked on the next daily run.</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">Agency websites are read only through feeds the agency publishes for subscribers, after checking the site's robots.txt, once a day, with pauses between requests. Every other address is refused in code.</p>
      <h2 id="history">History back to ${esc(historyStart().slice(0, 4))}</h2><ul class="plain">${hist}</ul>
      <h3 id="fulltext">Full-text reading</h3><ul class="plain">${ix.deepread ? `<li><strong>Legal-term searches of history:</strong> ${ix.deepread.sweep && ix.deepread.sweep.done ? "complete" : `working back year by year; next year: ${esc((ix.deepread.sweep || {}).next_year || "")}`}</li>
        <li><strong>Full reads of important documents:</strong> ${ix.deepread.read && ix.deepread.read.done ? "complete" : (ix.deepread.sweep && ix.deepread.sweep.done ? `working back month by month; next: ${esc((ix.deepread.read || {}).next_month || "")}` : "starts when the term searches finish")}</li>` : "<li>Full-text reading of history has not started yet. New documents are read each morning.</li>"}</ul>
      <p class="muted small">The Federal Register, Regulations.gov, and FDA recall reports keep archives, so their history is filled in automatically. The SEC and agency press feeds keep only recent items, so their history starts when RegCollect began reading them.</p>
      <h2 id="limits">Limits by kind of action</h2><ul class="plain">${CAT_ORDER.filter((c) => (ix.coverage_notes || {})[c]).map((c) => `<li><strong>${esc(ix.categories[c])}.</strong> ${esc(ix.coverage_notes[c])}</li>`).join("")}</ul>
      <h2 id="not">Not tracked</h2><div class="wrap-x"><table class="t"><thead><tr><th>Not tracked</th><th>Why</th></tr></thead><tbody>${(ix.not_tracked || []).map((n) => `<tr><td>${esc(n.what)}</td><td class="small">${esc(n.why)}</td></tr>`).join("")}</tbody></table></div>
      <h2 id="dates">How actions are dated</h2><ul class="plain">
        <li><strong>Federal Register:</strong> the signing date when the Federal Register records one (for example, executive orders); otherwise the publication date, which is the legal act of issuing a rule or notice.</li>
        <li><strong>Regulations.gov:</strong> the date the agency posted the document.</li><li><strong>SEC and agency feeds:</strong> the agency's release date.</li>
        <li><strong>FDA recalls:</strong> the date FDA classified the recall (the publication date of the weekly report is shown too).</li>
        <li>No action is dated by when RegCollect collected it. The collection date is used only to show late postings in “what's new.”</li></ul>
      <h2 id="sanctions">Kinds of sanction RegCollect recognizes</h2>${sanctions}
      <h2 id="runs">Recent runs</h2><div class="wrap-x"><table class="t"><thead><tr><th>Run</th><th>Kind</th><th>Dates checked</th><th class="num">New items</th><th class="num">Requests</th></tr></thead><tbody>${runs || '<tr><td colspan="5">No runs yet.</td></tr>'}</tbody></table></div>`;
  }

  // --------------------------------------------------------------- manual
  function renderManual() {
    return `<article class="prose"><h1>User manual</h1>
      <p class="lede">RegCollect gathers what the federal executive branch publishes, sorts it by agency and kind of action, flags arguable constitutional issues, rates each one by a published rubric, and tells you plainly what it could not see.</p>
      <div class="toc"><a href="#manual#m1">Signing in</a><a href="#manual#m2">The directory</a><a href="#manual#m3">Agency pages</a><a href="#manual#m4">Ratings</a><a href="#manual#m5">Research</a><a href="#manual#m6">Charts</a><a href="#manual#m7">The assistant</a><a href="#manual#m8">Dates and history</a><a href="#manual#m9">Questions</a></div>
      <h2 id="m1">Signing in and “what's new”</h2><p>Choose a username the first time (no password). RegCollect remembers your last visit in this browser and shows what was published since then. Use the date button at the top right to pick another starting date, or to mark everything as read. On another computer, enter the same username and paste the sync code from the account button. Items published earlier that reached RegCollect after your last visit are included, so late postings are not missed.</p>
      <h2 id="m2">The directory</h2><p>The home screen opens with a count of new actions and how many are rated almost certainly, very likely, or likely unlawful. Below are buttons for the President, every federal agency, and the agency-controlled corporations, each with a description, the number of new actions, and its flag counts. State agencies are planned for a later version.</p>
      <h2 id="m3">Agency pages</h2><p><strong>Activity</strong> lists actions that are new since your last visit, from the past 12 months, or since ${esc(historyStart().slice(0, 4))}, split into rulemaking, enforcement, adjudication and licensing, and other notices. <strong>Charts</strong> builds charts you can download. <strong>Coverage</strong> shows which sources were checked and for which dates. Routine fee filings by exchanges and clearing agencies are hidden unless you ask for them.</p>
      <h2 id="m4">Ratings</h2><p>Each flagged issue gets one rating, <strong>lawfulness</strong>: <span class="c3">almost certainly</span>, <span class="c2">very likely</span>, or <span class="c1">likely</span> unlawful under the Constitution or the limits on executive power, under today's law. “Likely” is deliberately generous: it marks an arguable issue worth a lawyer's look. “Very likely” and “almost certainly” need a court ruling on the action, or the key elements of the legal test in the document's own operative text. When a court has ruled on the action itself, that ruling sets the rating and the flag says what the court held. Actions that were lawful under older precedent are rated under today's law, with a note saying how they stood at the time. Issues whose essential elements were not found, or whose practice the Supreme Court has upheld, are listed as <em>possible issues</em>, not rated. <strong>Impact</strong> (lower, significant, or serious) is shown as plain text for context and never changes the rating. Open “Why flagged” on any action to see the checklist, the precedent, any court ruling, passages from the document, and to record your own view. See <a href="#methods">Methodology</a>.</p>
      <h2 id="m5">Research</h2><p>Type a request in plain English, such as <em>“SEC gag orders since September,”</em> or use the filters on the left, including lawfulness and impact. The search understands related words, legal terms, case names, statutes, and everyday phrasing (for example, “religious freedom,” “IEEPA,” or “agencies acting like Congress”). Choose the period searched (the past 12 months by default, a single year, or everything since ${esc(historyStart().slice(0, 4))}). Results can be grouped, shown as a table (flagged actions first, every column sortable, with a “why flagged” column you can expand), downloaded as a CSV file, or saved as a link.</p>
      <h2 id="m6">Charts</h2><p>Choose a chart (stacked bars or lines over time, totals, or share of total), what to break it down by, the kinds of action, sanctions, and outcomes to include, and the dates. Axes use whole numbers. Hover for exact figures, show the numbers as a table, and download a PNG image, an SVG drawing, or a CSV file.</p>
      <h2 id="m7">Curt, the assistant</h2><p>Curt lives in the chat bubble at the bottom right; click it to open him and the minus button to tuck him away. He runs entirely in this browser, with no outside AI service, and he never reads other websites. Ask him in plain words: how many actions match (“how many SEC enforcement actions in 2024?”), the latest or most likely unlawful ones, which agency has the most, a comparison of agencies, a summary of an agency, what happened in a period (“what happened this week?”), where to start looking for a challenge, or why an action was rated. He remembers the last question, so “what about the FTC?” or “and in 2022?” works. He can also open pages and agencies, set filters, build charts, change the date, start the tour, and explain any rating, case, statute, or legal term in the doctrine library. Ask “what can you do?” for ideas.</p>
      <h2 id="m8">Dates and history</h2><p>Every action is dated by the agency's own action: the signing date when the Federal Register records one, the posting or release date, or FDA's classification date for recalls. History reaches back to January 1, 2015, for sources that keep archives; it fills in automatically, newest months first. See <a href="#coverage#dates">What we track</a>.</p>
      <h2 id="m9">Common questions</h2><dl><dt>Why is today's information missing?</dt><dd>The collector runs each morning. The Federal Register publishes on business days.</dd>
        <dt>Is my information private?</dt><dd>Your username, dates, searches, and assistant conversations stay in your browser.</dd>
        <dt>Is a flag a legal opinion?</dt><dd>No. It is an automated screen that marks an arguable issue worth a lawyer's review.</dd></dl></article>`;
  }

  // --------------------------------------------------------------- router
  function parseHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, "")) || "home";
    const [pathAndQ, anchor] = raw.split("#");
    const [path, query] = pathAndQ.split("?");
    return { path, params: new URLSearchParams(query || ""), anchor };
  }
  function go(hash, replace) { if (replace) { history.replaceState(null, "", hash); route(); } else location.hash = hash; }
  let routing = 0;
  async function route() {
    const { path, params, anchor } = parseHash();
    const prevView = state.view;
    state.view = path; state.params = params;
    const run = ++routing;
    const tip = $(".charttip"); if (tip) tip.hidden = true;
    $$(".nav a").forEach((a) => a.classList.toggle("active", path === a.dataset.nav || (a.dataset.nav === "home" && path.startsWith("e/"))));
    if (path === "tutorial") { state.view = "home"; await paint(renderHome(), null, true); startTour(); return; }
    let out;
    if (path === "manual") out = renderManual();
    else if (!state.index || !(state.index.runs || []).length) out = `<div class="empty"><img src="logo.svg" alt="" width="64" height="64"><h1>No data yet</h1><p>The daily collector has not published results yet. Once it runs (each morning, or when started from the repository's Actions tab), this page fills in.</p><p><a href="#manual">Read the manual</a></p></div>`;
    else if (path.startsWith("e/")) { const [, key, tab] = path.split("/"); out = await renderEntity(key, tab || "activity"); }
    else if (path === "issues") out = await renderIssues();
    else if (path === "research") out = await renderResearch();
    else if (path === "methods") out = renderMethods();
    else if (path === "coverage") out = renderCoverage();
    else out = renderHome();
    if (run !== routing) return;
    const same = prevView === path;
    await paint(typeof out === "string" ? out : out.html, typeof out === "string" ? null : out.after, !same);
    if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" }); }
    else if (!same) window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent("regcollect:route", { detail: { path } }));
  }
  async function paint(html, after, animate) {
    const apply = () => { const v = $("#view"); v.innerHTML = html; if (animate && !document.startViewTransition) { v.style.animation = "none"; void v.offsetWidth; v.style.animation = ""; } if (after) after(); bindCommon(); };
    if (animate && document.startViewTransition && !reduceMotion()) await document.startViewTransition(apply).updateCallbackDone; else apply();
  }
  const rerender = (done) => route().then(() => done && done());
  async function showEvidence(btn) {
    const box = document.getElementById(`ev-${btn.dataset.ev.replace(/[^a-z0-9]/gi, "_")}`);
    if (!box) return;
    if (box.innerHTML) { box.innerHTML = ""; btn.textContent = "Show passages from the document"; return; }
    box.innerHTML = '<p class="progress">Loading…</p>';
    const data = await loadFile(`data/evidence/${btn.dataset.month}.json`);
    const rec = (data.items || {})[btn.dataset.ev];
    const terms = ((rec || {}).terms || []).map((t) => (state.tax.sweep_labels || {})[t] || t);
    box.innerHTML = rec && (rec.ev || []).length ? `${terms.length ? `<p class="small muted">Full-text search: ${esc(listText(terms))}.</p>` : ""}<ul class="passages">${rec.ev.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      <p class="muted small">Short passages kept around the phrases the legal tests look for. Read the whole document at the title link.</p>` : '<p class="muted small">No passages were kept for this document.</p>';
    btn.textContent = "Hide passages";
  }
  function bindCommon() {
    $$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
    $$("[data-ev]").forEach((b) => b.addEventListener("click", () => showEvidence(b)));
    $$("[data-review] button").forEach((b) => b.addEventListener("click", () => {
      const [id, code, level] = b.parentElement.dataset.review.split("|"); saveReview(id, code, b.dataset.v, level);
      const on = !b.classList.contains("on"); b.parentElement.querySelectorAll("button").forEach((x) => x.classList.remove("on")); if (on) b.classList.add("on");
    }));
    const dl = $("#dl-reviews");
    if (dl) dl.addEventListener("click", () => { const blob = JSON.stringify({ app: "regcollect", exported: new Date().toISOString(), reviews: Object.values(reviews()) }, null, 1); downloadAs("regcollect-reviews.json", blob, "application/json"); });
    $$("[data-more]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.more; state.ui[k] = (state.ui[k] || PAGE) + (k.startsWith("r:") || k === "rel" ? 200 : PAGE); rerender(); }));
  }

  // ------------------------------------------------------------- the tour
  const TOUR = [
    { view: "home", target: "#brief", title: "Your briefing", text: "Each visit opens with what agencies published since you last checked, and how many actions raise constitutional issues." },
    { view: "home", target: 'a.tile[href="#e/sec"]', title: "The directory", text: "Every tracked body has its own button with a description, the number of new actions, and its flag counts." },
    { view: "e/sec", target: ".tabs", title: "Inside an agency", text: "Activity lists its actions; Charts builds charts you can download; Coverage shows what was checked." },
    { view: "e/sec", target: "#items .item", title: "Ratings on every action", text: "Flagged issues show how likely they are to be unlawful. Open “Why flagged” for the element checklist, the precedent, any court ruling, and passages from the document." },
    { view: "issues", target: ".strip", title: "Constitutional issues", text: "Every rated action, from almost certainly to likely unlawful. Click a box to see those actions; impact can be filtered separately." },
    { view: "research", target: "#ask", title: "Research", text: "Ask in plain English or use the filters, including lawfulness and impact. Choose the period searched on the left." },
    { view: "methods", target: "#rubric", title: "Methodology", text: "The rubric and the doctrine library behind every rating, with authorities and open questions." },
    { view: "home", target: "#bot-btn", title: "Meet Curt", text: "Curt, the assistant, lives in this bubble. Ask him anything about the app or the law it applies, or tell him what to do, like “chart SEC sanctions by month.” He runs in your browser." },
  ];
  let tourStep = 0;
  function startTour() { tourStep = 0; $("#tour").hidden = false; showTourStep(); }
  function endTour() { $("#tour").hidden = true; if (location.hash === "#tutorial") history.replaceState(null, "", "#home"); }
  async function showTourStep() {
    const s = TOUR[tourStep];
    if (state.view !== s.view) { history.replaceState(null, "", "#" + s.view); await route(); }
    const el = $(s.target) || $("#view");
    el.scrollIntoView({ block: "center", behavior: "instant" });
    $("#tour-step").textContent = `Step ${tourStep + 1} of ${TOUR.length}`;
    $("#tour-title").textContent = s.title; $("#tour-text").textContent = s.text;
    $("#tour-back").disabled = tourStep === 0; $("#tour-next").textContent = tourStep === TOUR.length - 1 ? "Finish" : "Next";
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect(), padPx = 8, h = Math.min(r.height, window.innerHeight - 40);
      Object.assign($("#tour-spot").style, { top: r.top - padPx + "px", left: r.left - padPx + "px", width: r.width + 2 * padPx + "px", height: h + 2 * padPx + "px" });
      const card = $("#tour-card"), cw = card.offsetWidth, ch = card.offsetHeight;
      let top = r.top + h + 18; if (top + ch > window.innerHeight - 8) top = r.top - ch - 18;
      top = Math.max(8, Math.min(top, window.innerHeight - ch - 8));
      Object.assign(card.style, { top: top + "px", left: Math.min(Math.max(8, r.left), window.innerWidth - cw - 8) + "px" });
    });
  }

  // ---------------------------------------------------------------- setup
  function updateBar() {
    $("#since-btn").textContent = state.since ? (state.since.mode === "visit" ? `New since ${fmtDay(state.since.visitDay)}` : `Since ${fmtDay(state.since.dateFrom)}`) : "";
    $("#user-btn").textContent = state.user || "Account";
    $("#since-date").value = state.since ? (state.since.mode === "visit" ? state.since.visitDay : state.since.dateFrom) : "";
    $("#since-note").textContent = state.since && state.since.mode === "visit" ? `Your last visit: ${fmtTime(state.since.cutoff)}.` : "";
  }
  function togglePop(id, btn) {
    const pop = $(id), open = pop.hidden;
    $$(".pop").forEach((p) => { p.hidden = true; }); $$("[aria-haspopup]").forEach((b) => b.setAttribute("aria-expanded", "false"));
    if (open) { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); }
  }
  async function refresh() {
    updateBar();
    $("#view").innerHTML = `<p class="progress">Loading…</p>`;
    await loadSince();
    Object.keys(coverageCache).forEach((k) => delete coverageCache[k]);
    await route();
  }
  async function setSince(day) { setSinceManual(day); await refresh(); }
  async function markAllRead() {
    const now = new Date().toISOString();
    sset(sessionStorage, K.session, { user: state.user, baseline: now });
    const all = profiles(); all[state.user] = { ...(all[state.user] || {}), lastVisit: now }; sset(localStorage, K.profiles, all);
    setSinceFromVisit(now); await refresh();
  }
  function bindChrome() {
    window.addEventListener("hashchange", route);
    $("#since-btn").addEventListener("click", (e) => togglePop("#since-pop", e.currentTarget));
    $("#user-btn").addEventListener("click", (e) => { $("#account-name").textContent = state.user || ""; $("#account-sync").value = state.user ? syncCode() : ""; togglePop("#user-pop", e.currentTarget); });
    document.addEventListener("click", (e) => { if (!e.target.closest(".pop, [aria-haspopup]")) $$(".pop").forEach((p) => { p.hidden = true; }); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { $$(".pop").forEach((p) => { p.hidden = true; }); if (!$("#tour").hidden) endTour(); }
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); $("#quick-q").focus(); }
    });
    $("#quick").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#quick-q").value.trim(); if (v) { $("#quick-q").value = ""; go(`#research?q=${encodeURIComponent(v)}`); } });
    $("#since-date").addEventListener("change", (e) => { if (e.target.value) setSince(e.target.value); });
    $("#caught-up").addEventListener("click", () => { $("#since-pop").hidden = true; markAllRead(); });
    $("#account-copy").addEventListener("click", async () => { const t = $("#account-sync"); t.select(); try { await navigator.clipboard.writeText(t.value); $("#account-copy").textContent = "Copied"; } catch (e) { /* stays selected */ } });
    $("#account-tour").addEventListener("click", () => { $("#user-pop").hidden = true; startTour(); });
    $("#account-switch").addEventListener("click", () => {
      $("#user-pop").hidden = true;
      try { sessionStorage.removeItem(K.session); localStorage.removeItem(K.current); } catch (e) { /* ignore */ }
      $("#welcome-name").value = ""; $("#welcome-sync").value = ""; $("#welcome").hidden = false; $("#welcome-name").focus();
    });
    $("#welcome-go").addEventListener("click", async () => {
      const code = $("#welcome-sync").value.trim(); let name = $("#welcome-name").value.trim(); let imported = null;
      const err = (m) => { $("#welcome-error").textContent = m; $("#welcome-error").hidden = false; };
      if (code) { imported = readSyncCode(code); if (!imported) return err("That sync code was not recognized. Copy it again from the account button on your other browser."); name = name || imported.u; }
      if (!name) return err("Enter a username to continue.");
      $("#welcome").hidden = true; signIn(name, imported); await refresh();
      if (!imported && !sget(localStorage, K.tour, false) && state.index && (state.index.runs || []).length) { sset(localStorage, K.tour, true); startTour(); }
    });
    $("#welcome-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#welcome-go").click(); });
    $("#tour-next").addEventListener("click", () => { if (tourStep < TOUR.length - 1) { tourStep++; showTourStep(); } else endTour(); });
    $("#tour-back").addEventListener("click", () => { if (tourStep > 0) { tourStep--; showTourStep(); } });
    $("#tour-exit").addEventListener("click", endTour);
    window.addEventListener("resize", () => { if (!$("#tour").hidden) showTourStep(); });
  }
  async function init() {
    bindChrome();
    try { state.index = await fetchJson("data/index.json"); } catch (e) { state.index = null; }
    try { state.tax = await fetchJson("data/taxonomy.json"); } catch (e) { state.tax = { sanctions: [], sanction_families: [], kinds: [], outcomes: [], scales: {}, groups: {} }; }
    loadScaleNames();
    const current = sget(localStorage, K.current, null) || OLD.map(([, ck]) => sget(localStorage, ck, null)).find(Boolean);
    if (current) { signIn(current); await refresh(); }
    else { setSinceFromVisit(null); updateBar(); await route(); $("#welcome").hidden = false; $("#welcome-name").focus(); }
    document.dispatchEvent(new CustomEvent("regcollect:ready"));
  }

  // The assistant (assistant.js) drives the app only through these functions.
  window.RegCollect = {
    state, go, route, entities, entityMap, entityOf, scopeItems, visible, sevCounts, band, issueMap, sanctionMap, outcomeMap, loadPool, loadAllRows, loadMonthItems, periodRange, today, addDays,
    LEVEL, LEVEL_FULL, IMPACT, PRECEDENT, rated, possible, impactOf, doctrine, issueLabel, fmtDay, listText, sinceWords, historyStart, startTour, setSince, markAllRead,
    setEntityUI(key, patch) { const ui = state.ui[key] || (state.ui[key] = { scope: "new", cat: "all", q: "", flagged: false, sort: "severity", routine: false }); Object.assign(ui, patch); },
    setChart(key, patch) { const e = entityMap()[key]; const ctx = state.charts[key] || (state.charts[key] = { entityName: e ? e.name : key, fileKey: key }); ctx.pending = patch; },
  };
  init();
})();
