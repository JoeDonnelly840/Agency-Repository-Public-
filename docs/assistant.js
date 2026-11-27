/* Curt, RegCollect's assistant. A private helper that runs entirely in this browser.
 * He uses no outside AI service and sends nothing anywhere. He:
 *   1. operates the app through the functions app.js exposes (window.RegCollect),
 *   2. answers questions about the data by running RegCollect's own search engine over it
 *      (counts, top lists, latest actions, agency comparisons, briefings, why an action was rated),
 *   3. answers questions about the app, the rubric, and the law from a long prepared script
 *      (curt-script.js) plus entries generated from the doctrine library (every memo, case,
 *      statute, court ruling, sanction, outcome, and agency), found by meaning rather than exact wording,
 *   4. remembers the last thing you asked about, so “what about the FTC?” works. */
(function () {
  "use strict";
  const KEY = "regcollect.curt";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "#");
  let log = [];
  try { log = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (e) { log = []; }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(log.slice(-80))); } catch (e) { /* private mode */ } };
  const memory = { lastData: null, lastEntity: null };

  // ------------------------------------------------------------ knowledge base
  let KB = null;
  const S = () => window.RHSearch;
  function caseNames(cite) {
    const head = cite.split(/,\s*\d|\s\(/)[0].replace(/^In re /, "");
    const names = new Set([head]);
    const parts = head.split(/\s+v\.\s+/);
    const skip = /^(United States|SEC|FTC|FCC|EPA|NLRB|CFPB|FDA|HHS|OSHA|FINRA|PCAOB|Trump|Biden|City of|State of|Department|Town of|National|Federal|U\.S\.)\b/;
    parts.forEach((p) => {
      const clean = p.replace(/,?\s*(Inc|LLC|Corp|Co|Ltd|L\.L\.C)\.?$/i, "").trim();
      if (clean && !skip.test(clean)) { names.add(clean); const first = clean.split(/\s+/)[0]; if (first.length > 4 && !/^(Sunshine|Students|Americans|Church|Catholic|Learning|Alabama)$/.test(first)) names.add(first); }
    });
    if (/Loper Bright/.test(head)) names.add("Loper Bright");
    if (/Learning Resources/.test(head)) names.add("Learning Resources");
    if (/Alabama Ass'n of Realtors/.test(head)) names.add("Alabama Realtors");
    if (/Students for Fair Admissions/.test(head)) names.add("SFFA");
    if (/Americans for Prosperity/.test(head)) names.add("Americans for Prosperity");
    if (/Hobby Lobby/.test(head)) names.add("Hobby Lobby");
    if (/Church of the Lukumi/.test(head)) names.add("Lukumi");
    if (/Employment Division/.test(head)) names.add("Smith");
    return [...names];
  }
  function buildKB() {
    const R = window.RegCollect, d = R.doctrine(), A = d.authorities || {}, tax = R.state.tax || {};
    const entries = (window.CURT_SCRIPT || []).map((e) => ({ ...e }));
    const ISSUE_WORDS = S().ISSUE_WORDS || {};
    (d.issues || []).forEach((i) => entries.push({
      id: `issue:${i.code}`, q: [i.label, `what is the ${i.label} issue`, `test for ${i.label}`, `explain ${i.label}`, ...(ISSUE_WORDS[i.code] || []).slice(0, 14)],
      a: `<strong>${esc(i.label)}.</strong> ${esc(i.question)}<br><strong>Test.</strong> ${esc(i.test)} <a href="#methods#m-${esc(i.code)}">Read the memo</a>.`,
      next: [`Find actions raising ${i.label.split(" (")[0].toLowerCase()}`, "How are actions rated?"] }));
    Object.entries(A).forEach(([k, a]) => {
      const names = caseNames(a.cite);
      entries.push({ id: `case:${k}`, q: [...names, ...names.map((n) => `what is ${n}`), ...names.map((n) => `what did ${n} hold`)],
        a: `<em>${esc(a.cite)}</em>, decided ${esc(R.fmtDay(a.decided))}. ${esc(a.held)}` });
    });
    (d.statutes || []).forEach((st) => entries.push({ id: `statute:${st.key}`, q: [st.label, `what is ${st.label}`, ...((S().STATUTE_WORDS || {})[st.key] || [])],
      a: `RegCollect recognizes citations to the <strong>${esc(st.label)}</strong> in documents' summaries and full text, and records them on each action. <a href="#research?q=${encodeURIComponent(st.label)}&p=all">Find actions citing it</a>.` }));
    (d.rulings || []).forEach((r) => entries.push({ id: `ruling:${r.key}`, q: [r.label, `${r.label} ruling`, `was the ${r.label} struck down`, `court ruling on ${r.label}`],
      a: `<strong>${esc(r.label)}.</strong> ${esc(r.summary)} <em>${esc((A[r.authority] || {}).cite || "")}</em>. ${r.result === "upheld" ? "Because a court upheld it, any rating is lowered one step." : `RegCollect rates it ${esc(R.LEVEL_FULL[r.level] || "")}.`}` }));
    (tax.sanctions || []).forEach((s) => entries.push({ id: `sanction:${s.key}`, q: [s.label, s.short, ...(s.words || []).slice(0, 8)],
      a: `<strong>${esc(s.label)}.</strong> RegCollect tags an action with this sanction when its title or summary describes it. <a href="#research?q=${encodeURIComponent(s.label)}">Find them</a>.` }));
    (tax.outcomes || []).forEach((o) => entries.push({ id: `outcome:${o.key}`, q: [o.label, `outcome ${o.label}`], a: `“${esc(o.label)}” is one of the stages RegCollect records for each action (its outcome).` }));
    R.entities().forEach((e) => entries.push({ id: `entity:${e.key}`, q: [e.name, e.short, `what does the ${e.short} do`, `tell me about the ${e.short}`, `about ${e.name}`, ...(e.aliases || [])],
      a: `<strong>${esc(e.name)}.</strong> ${esc(e.description || "")} <a href="#e/${esc(e.key)}">Open its page</a>.`, next: [`How many ${e.short} actions are rated?`, `Latest ${e.short} actions`] }));
    // index
    const docs = entries.map((e) => {
      const tf = new Map();
      const add = (txt, w) => S().tokens(txt).forEach((t) => tf.set(t, (tf.get(t) || 0) + w));
      (e.q || []).forEach((x) => add(x, 3));
      add(String(e.a || "").replace(/<[^>]+>/g, " "), 0.25);
      return { e, tf, phrases: (e.q || []).map((x) => x.toLowerCase()) };
    });
    const df = new Map();
    docs.forEach((dd) => dd.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
    const groups = (S().THESAURUS || []).map((line) => line.split("|").map((p) => S().tokens(p)).filter((x) => x.length === 1).map((x) => x[0]));
    KB = { docs, df, N: docs.length, groups };
  }
  function kbFind(text) {
    if (!KB) buildKB();
    const q = text.toLowerCase().replace(/[?!.]+$/, "").trim();
    const terms = [...new Set(S().tokens(q))];
    if (!terms.length) return [];
    const idf = (t) => Math.log(1 + KB.N / (1 + (KB.df.get(t) || 0)));
    // each word in the question counts once: either itself, or (at half weight) its best related word
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
      const phrase = exact || dd.phrases.some((p) => p.length > 3 && (q.includes(p) && p.length >= 6 || (p.includes(q) && q.length >= 6)));
      if (exact) score += maxScore * 1.4; else if (phrase) score += maxScore * 0.8;
      return { e: dd.e, score: score / maxScore, cover: hit / terms.length, phrase };
    }).filter((r) => r.score > 0.2).sort((a, b) => b.score - a.score).slice(0, 5);
  }

  // ------------------------------------------------------------------ parsing
  const PAGES = [[/\b(?:home|directory|start page|main page)\b/, "#home"], [/\bconstitutional issues? page\b|\bissues page\b|\bthe issues\b/, "#issues"],
    [/\bresearch page\b|\bresearch\b$/, "#research"], [/\bmethodolog\w*|\brubric\b|\bdoctrine library\b|\bmemos?\b/, "#methods"], [/\bwhat we track\b|\bcoverage page\b|\bsources page\b/, "#coverage"],
    [/\bmanual\b/, "#manual"]];
  function findEntities(t) {
    const R = window.RegCollect;
    const pairs = [];
    R.entities().forEach((e) => [e.name, e.short, ...(e.aliases || [])].forEach((n) => pairs.push([n.toLowerCase(), e.key])));
    pairs.sort((a, b) => b[0].length - a[0].length);
    let rest = ` ${t} `; const found = [];
    for (const [n, k] of pairs) {
      const rx = new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`);
      if (rx.test(rest)) { if (!found.includes(k)) found.push(k); rest = rest.replace(rx, "$1 $2"); }
    }
    return found;
  }
  const findEntity = (t) => findEntities(t)[0] || null;
  function period(t) {
    const R = window.RegCollect;
    if (/\b(?:since 2015|all (?:time|history|years)|ever|everything|in history|since the beginning)\b/.test(t)) return { scope: "all", label: `since ${R.historyStart().slice(0, 4)}` };
    const y = t.match(/\b(?:in|during|for|of) (20[12]\d)\b/) || t.match(/\b(20[12]\d)\b/);
    if (y) return { scope: y[1], label: `in ${y[1]}` };
    if (/\bthis year\b/.test(t)) { const yr = String(new Date().getFullYear()); return { scope: yr, label: `in ${yr}` }; }
    if (/\b(?:past|last) (?:12 months|year)\b/.test(t)) return { scope: "12m", label: "in the past 12 months" };
    if (/\b(?:new|since my last visit|since i last checked)\b/.test(t)) return { scope: "new", label: R.sinceWords() };
    return null;
  }
  const CATS = { enforcement: /\benforcement\b/, rulemaking: /\brules?\b|\brulemaking\b|\bregulations?\b/, adjudication: /\badjudicat\w*|\bhearings?\b|\blicens\w*/, presidential: /\bexecutive orders?\b|\bproclamations?\b/ };
  const QUESTION = /^(?:what|whats|what's|how|why|who|whom|when|where|which|is|are|does|do|did|can|could|should|would|will|explain|define|definition|meaning|tell me about|tell me what|describe)\b/;

  // ------------------------------------------------------------------ data answers
  async function poolFor(per) {
    const R = window.RegCollect;
    if (per && per.scope === "new") {
      const items = R.visible(R.state.sinceItems);
      return { items, engine: window.RHSearch.build(items, { entities: R.entities(), byKey: R.entityMap(), entityOf: R.entityOf, taxonomy: R.state.tax, categories: R.state.index.categories }) };
    }
    return R.loadPool(per ? per.scope : "12m");
  }
  function cleanDataQuery(t) {
    return t.replace(/^(?:how many|count(?: of)?|number of|total(?: number of)?|what(?:'s| is| are) the (?:most|top|latest|newest|worst)|show me the (?:most|top|latest)|list the (?:most|top|latest)|which (?:agency|agencies|body|bodies) (?:has|have|had) the most|who has the most|compare|rank)\b/, " ")
      .replace(/\b(?:top \d+|top|most recent|latest|newest|most|worst|biggest|are there|were there|is there|have been|has been|did|do|does|are|is|were|was|there|so far|right now|currently|and|versus|vs\.?|between|actions?)\b/g, " ")
      .replace(/\b(?:since 2015|all time|ever|this year|past 12 months|last year|since my last visit|new)\b/g, " ").replace(/\s+/g, " ").trim();
  }
  function levelSplit(items) {
    const R = window.RegCollect, c = { 3: 0, 2: 0, 1: 0 }; let un = 0;
    items.forEach((it) => { if (it.rating) c[it.rating.level]++; else un++; });
    const parts = [3, 2, 1].filter((k) => c[k]).map((k) => `${c[k].toLocaleString()} ${R.LEVEL_FULL[k].toLowerCase()}`);
    return parts.length ? `${parts.join(", ")}; ${un.toLocaleString()} not rated` : "none rated as likely unconstitutional";
  }
  function itemLine(it) {
    const R = window.RegCollect;
    const lv = it.rating ? `<span class="pill c${it.rating.level}">${esc(R.LEVEL[it.rating.level])}</span> ` : "";
    const issues = R.rated(it).map((f) => R.issueLabel(f.code));
    return `<li>${lv}<a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a> <span class="muted small">${esc(R.fmtDay(it.date))}, ${esc(R.entityOf(it).map((k) => (R.entityMap()[k] || {}).short || k).join(", "))}${issues.length ? `; ${esc(R.listText(issues))}` : ""}</span></li>`;
  }
  async function matchData(text, per) {
    const pool = await poolFor(per);
    const parsed = pool.engine.parse(text);
    const res = pool.engine.rawSearch(parsed, {}, true);   // counts never drop part of the request
    const anything = (parsed.terms || []).length || parsed.entities.length || parsed.concepts.length || parsed.severity.length || parsed.date;
    const items = anything ? [...res.strong, ...res.related].map((r) => r.it) : window.RegCollect.visible(pool.items);
    return { items, parsed };
  }
  const researchLink = (q, per) => `#research?${new URLSearchParams({ q, ...(per && per.scope !== "new" ? { p: per.scope } : {}), m: "strict" })}`;

  async function answerCount(t, per) {
    const q = cleanDataQuery(t);
    const { items } = await matchData(q, per);
    memory.lastData = { kind: "count", q, per };
    const p = per || { label: "in the past 12 months", scope: "12m" };
    return `<strong>${items.length.toLocaleString()}</strong> action${items.length === 1 ? "" : "s"} ${esc(p.label)} match${items.length === 1 ? "es" : ""} your question${q ? ` (I read it as “${esc(q)}”)` : ""}: ${levelSplit(items)}.${items.length ? ` <a href="${researchLink(q, p)}">See them in Research</a>.` : ""}${!per ? " Add “since 2015” to count all history." : ""}`;
  }
  async function answerTop(t, per, byDate) {
    const R = window.RegCollect, q = cleanDataQuery(t);
    const n = Math.min(10, +((t.match(/\btop (\d+)\b/) || [])[1] || 5));
    const { items } = await matchData(q, per);
    memory.lastData = { kind: byDate ? "latest" : "top", q, per };
    const sorted = items.slice().sort(byDate ? (a, b) => (b.date || "").localeCompare(a.date || "") : (a, b) => R.band(b) - R.band(a) || (b.date || "").localeCompare(a.date || ""));
    if (!sorted.length) return `I found nothing matching “${esc(q)}” ${esc((per || { label: "in the past 12 months" }).label)}. Try a longer period, for example “${esc(t)} since 2015”.`;
    const ratedOnes = sorted.filter((i) => i.rating);
    const head = byDate ? `The ${Math.min(n, sorted.length)} most recent` : ratedOnes.length ? `The ${Math.min(n, ratedOnes.length)} most likely unconstitutional` : "None of these is rated; the most recent";
    const list = (byDate || !ratedOnes.length ? sorted : ratedOnes).slice(0, n);
    return `${head} ${esc((per || { label: "in the past 12 months" }).label)}${q ? ` matching “${esc(q)}”` : ""}:<ul class="curt-list">${list.map(itemLine).join("")}</ul><a href="${researchLink(q, per || { scope: "12m" })}">See all ${items.length.toLocaleString()} in Research</a>.`;
  }
  async function answerWhichAgency(t, per) {
    const R = window.RegCollect, q = cleanDataQuery(t).replace(/\b(?:agency|agencies|body|bodies)\b/g, " ").trim();
    const { items } = await matchData(q, per);
    const wantsRated = /\b(?:unconstitutional|rated|flag|flags|issues?|violations?|problems?)\b/.test(t);
    const counts = new Map();
    items.filter((i) => !wantsRated || i.rating).forEach((it) => R.entityOf(it).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    memory.lastData = { kind: "which", q, per };
    if (!top.length) return `No agency has ${wantsRated ? "rated actions" : "actions"} matching that ${esc((per || { label: "in the past 12 months" }).label)}.`;
    return `${wantsRated ? "Rated actions" : "Actions"}${q ? ` matching “${esc(q)}”` : ""} ${esc((per || { label: "in the past 12 months" }).label)}, by agency:<ol class="curt-list">${top.map(([k, n]) => `<li><a href="#e/${esc(k)}">${esc((R.entityMap()[k] || {}).name || k)}</a>: ${n.toLocaleString()}</li>`).join("")}</ol>`;
  }
  async function answerCompare(keys, t, per) {
    const R = window.RegCollect, pool = await poolFor(per);
    const items = R.visible(pool.items);
    memory.lastData = { kind: "compare", keys, per };
    const rows = keys.map((k) => {
      const list = R.scopeItems(items, k);
      const issues = new Map();
      list.forEach((it) => R.rated(it).forEach((f) => issues.set(f.code, (issues.get(f.code) || 0) + 1)));
      const topIssue = [...issues.entries()].sort((a, b) => b[1] - a[1])[0];
      return `<li><strong>${esc((R.entityMap()[k] || {}).name || k)}</strong>: ${list.length.toLocaleString()} actions; ${levelSplit(list)}${topIssue ? `. Most common rated issue: ${esc(R.issueLabel(topIssue[0]))} (${topIssue[1]})` : ""}.</li>`;
    });
    return `${esc((per || { label: "In the past 12 months" }).label.replace(/^./, (c) => c.toUpperCase()))}:<ul class="curt-list">${rows.join("")}</ul>`;
  }
  function answerBrief() {
    const R = window.RegCollect, items = R.visible(R.state.sinceItems);
    const ratedOnes = items.filter((i) => i.rating).sort((a, b) => R.band(b) - R.band(a) || (b.date || "").localeCompare(a.date || ""));
    const by = new Map(); items.forEach((it) => R.entityOf(it).forEach((k) => by.set(k, (by.get(k) || 0) + 1)));
    const busiest = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${(R.entityMap()[k] || {}).short || k} (${n})`);
    return `${items.length.toLocaleString()} new action${items.length === 1 ? "" : "s"} ${esc(R.sinceWords())}${busiest.length ? `; busiest: ${esc(R.listText(busiest))}` : ""}. ${levelSplit(items)}.${ratedOnes.length ? `<ul class="curt-list">${ratedOnes.slice(0, 4).map(itemLine).join("")}</ul>` : ""} <a href="#issues">Open Constitutional issues</a>.`;
  }
  async function answerExplain(phrase) {
    const R = window.RegCollect, per = period(phrase) || { scope: "all", label: "" };
    const pool = await R.loadPool(per.scope === "new" ? "12m" : per.scope);
    const res = pool.engine.search(pool.engine.parse(phrase), {}, false);
    const top = res.strong[0];
    // a question about why something was flagged is usually about a rated action: prefer one among the close matches
    const ratedHit = res.strong.slice(0, 8).find((r) => r.it.rating && top && r.score >= 0.5 * top.score);
    const it = ((ratedHit || top) || {}).it;
    if (!it) return `I couldn't find an action matching “${esc(phrase)}”. Try a few distinctive words from its title.`;
    const A = R.doctrine().authorities || {};
    const parts = R.rated(it).map((f) => {
      const ruling = f.ruling ? (R.doctrine().rulings || []).find((r) => r.key === f.ruling) : null;
      return `<li><strong>${esc(R.LEVEL_FULL[f.level])}</strong>: ${esc(R.issueLabel(f.code))}. ${ruling ? esc(ruling.summary) : `Precedent: ${esc(R.PRECEDENT[f.precedent])} (${esc((A[f.authority] || {}).cite || "")}); ${f.elements_found.length} of ${f.elements_total} elements found${(f.full_text_elements || []).length ? ", some in the full text" : ""}.`}${f.at_the_time ? " It may have been lawful under the precedent at the time." : ""}</li>`;
    });
    const poss = R.possible(it).map((f) => R.issueLabel(f.code));
    return `<a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a> (${esc(R.fmtDay(it.date))}). ${parts.length ? `<ul class="curt-list">${parts.join("")}</ul>` : "It isn't rated."}${poss.length ? ` Possible issues, not rated: ${esc(R.listText(poss))}.` : ""} Impact: ${esc(R.IMPACT[R.impactOf(it)] || "none recorded")} (context only). Open “Why flagged” on the action for the full checklist.`;
  }

  // ------------------------------------------------------------------ respond
  async function respond(raw) {
    const R = window.RegCollect;
    let t = raw.toLowerCase().trim().replace(/[“”]/g, '"').replace(/[’]/g, "'").replace(/[?!.]+$/, "");
    if (!t) return null;
    if (/^(?:hi|hello|hey|good (?:morning|afternoon|evening)|yo|howdy)\b/.test(t) && t.split(" ").length <= 3)
      return { a: `Hi${R.state.user ? `, ${esc(R.state.user)}` : ""}. What would you like to look into?`, next: ["What's new?", "What can you do?"] };
    if (/^(?:thanks|thank you|thx|great|perfect|ok|okay|cool|got it)\b/.test(t) && t.split(" ").length <= 4) return { a: "Glad to help." };

    // follow-ups: "what about the FTC?", "and in 2023?"
    const follow = t.match(/^(?:what|how) about (.+)|^and (?:for |in |the |what about )?(.+)/);
    if (follow && memory.lastData) {
      const extra = (follow[1] || follow[2]).trim();
      const ld = memory.lastData;
      const ents = findEntities(extra), per2 = period(extra) || ld.per;
      if (ld.kind === "compare") return { a: await answerCompare(ents.length ? ents : ld.keys, extra, per2) };
      let q = ld.q || "";
      if (ents.length) { R.entities().forEach((e) => { [e.name, e.short, ...(e.aliases || [])].forEach((n) => { q = q.replace(new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " "); }); }); q = `${q} ${extra}`.replace(/\s+/g, " ").trim(); }
      else if (!period(extra)) q = `${q} ${extra}`;
      t = q;
      if (ld.kind === "count") return { a: await answerCount(t, per2) };
      if (ld.kind === "top" || ld.kind === "latest") return { a: await answerTop(t, per2, ld.kind === "latest") };
      if (ld.kind === "which") return { a: await answerWhichAgency(t, per2) };
    }

    // actions on the app
    if (/\b(?:tour|tutorial|walk me through|show me around)\b/.test(t)) { R.startTour(); return { a: "Starting the tour." }; }
    if (/mark (?:everything|all) (?:as )?read|i'?m caught up|start fresh/.test(t)) { R.markAllRead(); return { a: "Done. Everything up to now is marked as read." }; }
    const since = t.match(/(?:new|what'?s new|show me .*|changes) since ((?:\d{4}-\d{2}-\d{2})|(?:[a-z]+ \d{1,2}(?:,? \d{4})?)|(?:\d{1,2}\/\d{1,2}\/\d{2,4}))/);
    if (since) { const d = window.RHSearch.parseDates(`since ${since[1]}`); if (d && d.from) { R.setSince(d.from); return { a: `Showing what's new since ${R.fmtDay(d.from)}.` }; } }

    // data questions
    const per = period(t);
    if (/^(?:what'?s new|whats new|anything new|brief me|catch me up|give me (?:a|the) (?:brief|summary|rundown)|summari[sz]e (?:what'?s new|recent|the (?:last|past) (?:week|visit|few days)))\b/.test(t)) return { a: answerBrief(), next: ["What are the most likely unconstitutional actions this year?", "Open Constitutional issues"] };
    if (/^(?:why (?:was|is|were|did) (.+?) (?:get )?(?:flagged|rated|marked)|explain (?:the )?(?:rating|flag) (?:of|for|on) (.+))$/.test(t)) {
      const m = t.match(/^(?:why (?:was|is|were|did) (.+?) (?:get )?(?:flagged|rated|marked)|explain (?:the )?(?:rating|flag) (?:of|for|on) (.+))$/);
      return { a: await answerExplain((m[1] || m[2]).replace(/^the /, "")) };
    }
    const ents = findEntities(t);
    if (/\bcompare\b|\bversus\b|\bvs\.?\b/.test(t) && ents.length >= 2) return { a: await answerCompare(ents.slice(0, 4), t, per), next: ["What about since 2015?"] };
    if (/^(?:which|what) (?:agency|agencies|body|bodies) (?:has|have|had|issued|did) the most|^who has the most|^rank (?:the )?agencies/.test(t)) return { a: await answerWhichAgency(t, per), next: ["What about since 2015?"] };
    if (/^(?:how many|count|number of|total number of|how much)\b/.test(t)) return { a: await answerCount(t, per), next: ["What about since 2015?", "Show the most likely unconstitutional ones"] };
    if (/\b(?:most (?:likely )?unconstitutional|most (?:serious|egregious|blatant|flagrant)|worst|top \d+|clearest|biggest violations?)\b/.test(t) && !/\bwhat (?:is|does)\b/.test(t)) return { a: await answerTop(t, per, false) };
    if (/^(?:latest|newest|most recent|recent)\b|\b(?:the )?(?:latest|newest|most recent) (?:actions?|rules?|orders?|executive orders?|enforcement|cases?|filings?)\b/.test(t)) return { a: await answerTop(t, per, true) };

    // questions about the app, the rubric, or the law
    const isQuestion = QUESTION.test(t) || raw.trim().endsWith("?");
    const kb = kbFind(t);
    const top = kb[0];
    const confident = top && (top.phrase || (top.score >= 0.55 && top.cover >= 0.5));
    if (isQuestion && confident && !/\b(?:chart|graph|plot)\b/.test(t)) return fromEntry(top.e);

    // chart commands
    if (/\b(?:chart|graph|plot|visual\w*|pie|donut|trend)\b/.test(t)) {
      const key = ents[0] || memory.lastEntity;
      if (!key) return { a: "Which agency or body should I chart? For example, “chart SEC sanctions by month.”" };
      const patch = {};
      patch.type = /\b(?:pie|donut|share)\b/.test(t) ? "donut" : /\blines?\b|\btrend/.test(t) ? "lines" : /\btotals?\b|\bbar chart\b|\bbars\b/.test(t) ? "bars" : "stacked";
      const by = [[/sanction|penalt|punish/, "sanction"], [/outcome|result/, "outcome"], [/constitutional issue|kind of issue|\bissues?\b/, "issue"], [/constitutional|unconstitutional|rating|flag/, "level"], [/impact|serious/, "impact"], [/document|type of/, "subcategory"], [/kind|category/, "category"]].find(([rx]) => rx.test(t));
      if (by) patch.by = by[1];
      const iv = t.match(/\b(?:by|per|each) (day|week|month|year)\b/); if (iv) patch.interval = iv[1] === "year" ? "month" : iv[1];
      if (per && /^\d{4}$/.test(per.scope)) { patch.from = `${per.scope}-01-01`; patch.to = `${per.scope}-12-31`; }
      if (/\b(?:flagged|rated|only unconstitutional)\b/.test(t)) patch.flaggedOnly = true;
      R.setChart(key, patch); R.go(`#e/${key}/charts`); memory.lastEntity = key;
      return { a: `Here is a chart of the ${esc(R.entityMap()[key].name)}'s actions. Change it with the controls on the left, or download it.` };
    }
    // issues page
    if (/\b(?:show|open|list|see)\b.*\b(?:unconstitutional|rated|flagged|constitutional issues?|violations?)\b/.test(t) && !ents.length && !/\b(?:find|search)\b/.test(t)) {
      const q = new URLSearchParams();
      if (/\balmost certain|near certain|clearly|red\b/.test(t)) q.set("l", "3"); else if (/\bvery likely\b/.test(t)) q.set("l", "2");
      if (/\bserious impact\b/.test(t)) q.set("i", "3");
      if (per && per.scope !== "new") q.set("scope", per.scope); if (/\bstructural\b/.test(t)) q.set("s", "1");
      if (/\bpossible\b/.test(t)) q.set("poss", "1");
      R.go(`#issues${q.toString() ? "?" + q : ""}`);
      return { a: "Here are the rated actions. Click a box to narrow them by rating." };
    }
    // search
    const search = t.match(/^(?:find|search(?: for)?|look (?:for|up)|show me (?:any|all)?|are there (?:any)?|list|pull up|get me)\s+(.+)/);
    if (search) {
      const q = search[1].replace(/\b(?:please|for me)\b/g, "").replace(/\s+/g, " ").trim();
      const p = new URLSearchParams({ q }); if (per && per.scope !== "new") p.set("p", per.scope);
      R.go(`#research?${p}`);
      memory.lastData = { kind: "count", q, per };
      return { a: `Searching for “${esc(q)}”${per && per.scope !== "new" ? ` ${esc(per.label)}` : ""}. The chips above the results show how I read your request; click × to drop any that don't fit.` };
    }
    // pages
    if (!ents.length) for (const [rx, hash] of PAGES) if (rx.test(t) && /\b(?:open|go to|show|take me|page|where is)\b/.test(t)) { R.go(hash); return { a: `Opening ${{ "#home": "the directory", "#methods": "the Methodology page", "#coverage": "What we track", "#issues": "Constitutional issues", "#research": "Research", "#manual": "the manual" }[hash]}.` }; }
    // agency pages, with options
    if (ents.length && !isQuestion) {
      const key = ents[0], patch = {};
      const cat = Object.entries(CATS).find(([, rx]) => rx.test(t)); if (cat) patch.cat = cat[0];
      if (/\bflagged\b|\brated\b|\bonly (?:constitutional )?(?:flags?|issues?)\b|\bunconstitutional\b/.test(t)) patch.flagged = true;
      if (/\bnewest|latest|most recent\b/.test(t)) patch.sort = "date";
      if (/\bmost (?:likely|serious)|worst\b/.test(t)) patch.sort = "severity";
      if (per) patch.scope = per.scope === "all" || per.scope === "12m" || per.scope === "new" ? per.scope : "all";
      if (/\bfees?\b|\broutine\b/.test(t)) patch.routine = true;
      R.setEntityUI(key, patch);
      const tab = /\bcoverage\b|\bchecked\b/.test(t) ? "/coverage" : "";
      R.go(`#e/${key}${tab}`); memory.lastEntity = key;
      return { a: `Opening the ${esc(R.entityMap()[key].name)}${patch.cat ? `, ${patch.cat} only` : ""}${patch.flagged ? ", rated actions only" : ""}.` };
    }
    // a less certain answer from the script, if there is a reasonable one
    if (top && (top.score >= 0.4 || top.cover >= 0.5)) {
      const r = fromEntry(top.e);
      const others = kb.slice(1, 3).filter((x) => x.score >= 0.3);
      if (others.length) r.next = [...(r.next || []), ...others.map((x) => (x.e.q || [])[0]).filter(Boolean)].slice(0, 4);
      return r;
    }
    // fall back to a search, and offer the closest topics
    const p = new URLSearchParams({ q: raw.trim() }); R.go(`#research?${p}`);
    return { a: `I wasn't sure what you meant, so I searched Research for “${esc(raw.trim())}”.${kb.length ? " Or did you mean one of these?" : " Ask “what can you do?” for ideas."}`, next: kb.slice(0, 3).map((x) => (x.e.q || [])[0]).filter(Boolean).map((s) => s[0].toUpperCase() + s.slice(1) + (QUESTION.test(s) ? "?" : "")) };
  }
  function fromEntry(e) {
    const R = window.RegCollect;
    if (e.action === "tour") R.startTour();
    if (e.action === "markread") R.markAllRead();
    if (e.go) R.go(e.go);
    return { a: e.a, next: e.next };
  }

  // -------------------------------------------------------------------- UI
  function render() {
    const box = $("#bot-log");
    if (!box) return;
    box.innerHTML = log.map((m, i) => `<div class="msg ${m.who}">${m.who === "me" ? esc(m.text) : m.text}</div>${m.who === "it" && m.next && m.next.length && i === log.length - 1
      ? `<div class="msg-next">${m.next.map((x) => `<button type="button" data-ask="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}`).join("");
    box.querySelectorAll("[data-ask]").forEach((b) => b.addEventListener("click", () => ask(b.dataset.ask)));
    box.scrollTop = box.scrollHeight;
  }
  function suggest() {
    const R = window.RegCollect, view = (R && R.state.view) || "home";
    const s = view.startsWith("e/") ? ["Only rated actions", "Chart sanctions by month", "Latest actions", "How many are rated?"]
      : view === "research" ? ["How does search work?", "Find IEEPA tariffs since 2015", "What is a possible issue?"]
      : view === "issues" ? ["What does very likely mean?", "Which agency has the most rated actions?", "Why so few flags?"]
      : view === "methods" ? ["What is the test for free exercise?", "What is Jarkesy?", "Does impact affect the rating?"]
      : ["What's new?", "What can you do?", "Most likely unconstitutional actions this year", "How are actions rated?"];
    $("#bot-sugg").innerHTML = s.map((x) => `<button type="button">${esc(x)}</button>`).join("");
    $("#bot-sugg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
  }
  async function ask(text) {
    const R = window.RegCollect;
    const onPage = (R.state.view.match(/^e\/([a-z_]+)/) || [])[1];
    let t = text;
    // "only rated actions", "newest first", "chart sanctions" apply to the agency on screen
    if (onPage && !findEntity(text.toLowerCase()) && !QUESTION.test(text.trim().toLowerCase()) && !/\?$/.test(text.trim()) &&
        !/^(?:find|search|look|list|are there|show me (?:any|all)|what'?s new|compare)\b/i.test(text.trim())) t = `${text} ${R.entityMap()[onPage].short}`;
    else if (onPage && /^how many\b/i.test(text.trim()) && !findEntity(text.toLowerCase())) t = `${text} ${R.entityMap()[onPage].short}`;
    log.push({ who: "me", text });
    log.push({ who: "it", text: '<span class="typing">Curt is looking…</span>' });
    render();
    let answer;
    try { answer = await respond(t); } catch (e) { answer = { a: "Something went wrong while doing that. Try rephrasing, or ask “what can you do?”." }; }
    log.pop();
    if (answer) log.push({ who: "it", text: answer.a, next: answer.next });
    save(); render();
  }
  function open(on) {
    const bot = $("#bot"), btn = $("#bot-btn");
    bot.hidden = !on; btn.setAttribute("aria-expanded", String(on)); btn.classList.toggle("open", on);
    try { localStorage.setItem("regcollect.botOpen", on ? "1" : "0"); } catch (e) { /* ignore */ }
    if (on) {
      if (!log.length) { log.push({ who: "it", text: "Hi, I'm Curt. I can find and count actions, compare agencies, build charts, and explain the ratings and the law behind them. What would you like to know?", next: ["What's new?", "What can you do?"] }); save(); }
      render(); suggest(); $("#bot-q").focus();
    }
  }
  document.addEventListener("regcollect:ready", () => {
    $("#bot-btn").addEventListener("click", () => open($("#bot").hidden));
    $("#bot-min").addEventListener("click", () => open(false));
    $("#bot-new").addEventListener("click", () => { log = []; memory.lastData = null; save(); open(true); });
    $("#bot-form").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#bot-q").value.trim(); if (v) { $("#bot-q").value = ""; ask(v); } });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#bot").hidden && $("#bot").contains(document.activeElement)) open(false); });
    let was = "0"; try { was = localStorage.getItem("regcollect.botOpen") || "0"; } catch (e) { /* ignore */ }
    if (was === "1") open(true);
  });
  document.addEventListener("regcollect:route", () => { if (!$("#bot").hidden) suggest(); });
  window.RCAssistant = { respond, ask, kbFind };
})();
