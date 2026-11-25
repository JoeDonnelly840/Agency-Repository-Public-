/* RegHunter 2.0 - static front end. No outside libraries; all data comes from ./data. */
(function () {
  "use strict";

  const K = { profiles: "reghunter.profiles", current: "reghunter.current", session: "reghunter.session", tour: "reghunter.tourSeen" };
  const OLD = { profiles: "agencyTracker.profiles", current: "agencyTracker.current" };
  const LATE_LOOKBACK_DAYS = 14;
  const PAGE = 40;
  const CAT_ORDER = ["rulemaking", "enforcement", "adjudication", "presidential", "other"];
  const CLARITY = { 3: "Flagrant", 2: "Substantial", 1: "Arguable" };
  const IMPACT = { 3: "Severe", 2: "Significant", 1: "Moderate" };

  const state = {
    index: null, tax: null, user: null, since: null, sinceItems: [], all: null, engine: null,
    view: "home", params: new URLSearchParams(), ui: {}, charts: {},
  };

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
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function sget(store, key, fallback) { try { const v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
  function sset(store, key, value) { try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode: app still works */ } }

  // -------------------------------------------------------------- profile
  function profiles() {
    const p = sget(localStorage, K.profiles, null);
    if (p) return p;
    const old = sget(localStorage, OLD.profiles, {});   // carry over Agency Tracker users
    sset(localStorage, K.profiles, old);
    return old;
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
  function syncCode() {
    const last = (profiles()[state.user] || {}).lastVisit || null;
    return btoa(unescape(encodeURIComponent(JSON.stringify({ app: "reghunter", u: state.user, last }))));
  }
  function readSyncCode(code) {
    try { const d = JSON.parse(decodeURIComponent(escape(atob(code.trim())))); if (!/^(reghunter|agency-tracker)$/.test(d.app) || !d.u) throw 0; return d; }
    catch (e) { return null; }
  }

  // ----------------------------------------------------------------- data
  const dayCache = {};
  async function fetchJson(path) { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); }
  async function loadDays(from) {
    if (!state.index) return [];
    const days = Object.keys(state.index.days || {}).filter((d) => !from || d >= from).sort();
    const missing = days.filter((d) => !dayCache[d]);
    const got = await Promise.all(missing.map((d) => fetchJson(`data/days/${d}.json`).catch(() => ({ items: [] }))));
    missing.forEach((d, i) => { dayCache[d] = got[i].items || []; });
    return days.flatMap((d) => dayCache[d]);
  }
  async function loadSince() {
    const items = await loadDays(addDays(state.since.dateFrom, -LATE_LOOKBACK_DAYS));
    state.sinceItems = items.filter((it) => (it.date && it.date >= state.since.dateFrom) || (it.first_seen && it.first_seen > state.since.cutoff));
  }
  async function loadAll() {
    if (!state.all) state.all = await loadDays(null);
    if (!state.engine) state.engine = window.RHSearch.build(state.all, { entities: entities(), byKey: entityMap(), entityOf, taxonomy: state.tax, categories: state.index.categories });
    return state.all;
  }

  // ------------------------------------------------------------- entities
  const ALIASES = { sec: ["securities and exchange", "securities & exchange"], ftc: ["trade commission"], fcc: ["communications commission"],
    epa: ["environmental protection"], nlrb: ["labor relations board", "labor board"], cfpb: ["consumer bureau", "consumer financial protection"],
    dol: ["labor department", "osha", "wage and hour", "ebsa"], fda: ["food and drug"], hhs: ["health and human services", "cms", "medicare", "medicaid", "cdc", "nih"],
    ferc: ["energy regulatory commission"], president: ["white house", "presidential", "potus", "the president"],
    other_sro: ["exchanges", "stock exchanges", "nasdaq", "nyse", "cboe", "clearing agency", "clearing agencies"] };
  function entities() {
    const ix = state.index || {};
    return [
      ...(ix.president ? [{ ...ix.president, type: "president" }] : []),
      ...(ix.agencies || []).map((a) => ({ ...a, type: "agency" })),
      ...(ix.corporations || []).map((c) => ({ ...c, type: "corporation" })),
    ].map((e) => ({ ...e, aliases: ALIASES[e.key] || [] }));
  }
  const entityMap = () => Object.fromEntries(entities().map((e) => [e.key, e]));
  const entityOf = (it) => (it.corporation ? [it.corporation] : it.agencies || []);
  const entityNames = (it) => entityOf(it).map((k) => (entityMap()[k] || {}).name || k).join("; ");
  const sealText = (e) => (e.type === "president" ? "POTUS" : e.key === "other_sro" ? "SRO" : e.short);
  const scopeItems = (items, key) => items.filter((it) => entityOf(it).includes(key));

  // ------------------------------------------------------------- severity
  const pill = (axis, v) => `<span class="pill c${v}"><span class="k">${axis === "clarity" ? "Clarity" : "Seriousness"}</span>${axis === "clarity" ? CLARITY[v] : IMPACT[v]}</span>`;
  const sevClass = (it) => (it.severity ? `s${it.severity.score >= 6 ? 3 : it.severity.score >= 3 ? 2 : 1}` : "");
  const bySeverity = (a, b) => ((b.severity || {}).clarity || 0) - ((a.severity || {}).clarity || 0) || ((b.severity || {}).impact || 0) - ((a.severity || {}).impact || 0) || (b.date || "").localeCompare(a.date || "");
  const byDate = (a, b) => (b.date || "").localeCompare(a.date || "") || bySeverity(a, b);
  function sevCounts(items) {
    const c = { 3: 0, 2: 0, 1: 0 };
    items.forEach((it) => { if (it.severity) c[it.severity.score >= 6 ? 3 : it.severity.score >= 3 ? 2 : 1]++; });
    return c;
  }
  const sevDots = (c) => `<span class="sev-dots" title="Flagged actions: red, orange, yellow">${[3, 2, 1].map((k) => `<span class="sev-dot c${k} ${c[k] ? "" : "zero"}">${c[k]}</span>`).join("")}</span>`;

  // ---------------------------------------------------------------- items
  function itemHtml(it, opts) {
    opts = opts || {};
    const flags = it.flags || [];
    const sanc = (it.sanctions || []).map((k) => { const s = (state.engine ? state.engine.sanctionLabel : sanctionMap())[k]; return s ? `<span class="tag">${esc(s.short)}</span>` : ""; }).join("");
    const due = it.comments_close && it.comments_close >= today() ? `<span class="due">Comments due ${esc(fmtDay(it.comments_close))}</span>` : "";
    const outcome = (outcomeMap()[it.outcome] || "");
    const issues = flags.slice(0, 3).map((f) => `<div class="issue-row">${pill("clarity", f.clarity)}${pill("impact", f.impact)}<span class="kind">${esc(f.label)}</span></div>`).join("");
    const more = flags.length > 3 ? `<div class="muted small" style="margin-top:6px">and ${flags.length - 3} more issue${flags.length - 3 === 1 ? "" : "s"}</div>` : "";
    const why = flags.length ? `<details class="why"><summary>Why flagged, and how it was rated</summary>${flags.map((f) => `
      <div class="flag-detail"><div class="issue-row">${pill("clarity", f.clarity)}${pill("impact", f.impact)}<strong>${esc(f.label)}</strong>
        <span class="muted small">${f.structural ? "Structural" : "Individual rights"}</span></div>
        <p>${esc(f.why)}</p>
        ${(f.rating_notes || []).length ? `<p class="trig">Rating: ${f.rating_notes.map(esc).join("; ")}.</p>` : ""}
        <p class="trig">Triggered by: ${f.triggers.map((t) => `“${esc(t)}”`).join(", ")}</p>
        <p class="trig">Starting points: ${f.authorities.map(esc).join("; ")}</p></div>`).join("")}
      <p class="disclaimer">Automated screen of the title and summary only. A flag marks an arguable issue worth a lawyer's look; it is not a legal conclusion.</p></details>` : "";
    const sum = it.summary ? `<p class="sum">${esc(it.summary.length > 380 ? it.summary.slice(0, 380) + "…" : it.summary)}</p>` : "";
    return `<article class="item ${sevClass(it)}">
      <a class="title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title || "(untitled)")}</a>
      <div class="meta"><span>${esc(fmtDay(it.date))}</span>${opts.showEntity ? `<span>${esc(entityNames(it))}</span>` : ""}
        <span>${esc(it.subcategory || it.doc_type)}</span>${outcome ? `<span>${esc(outcome)}</span>` : ""}<span>${esc(it.source_label)}</span>${due}
        ${opts.why ? `<span class="score">Matched: ${esc(opts.why)}</span>` : ""}</div>
      ${sum}${sanc ? `<div class="tags">${sanc}</div>` : ""}${issues}${more}${why}</article>`;
  }
  const sanctionMap = () => Object.fromEntries(((state.tax || {}).sanctions || []).map((s) => [s.key, s]));
  const outcomeMap = () => Object.fromEntries(((state.tax || {}).outcomes || []).map((o) => [o.key, o.label]));
  const kindMap = () => Object.fromEntries(((state.tax || {}).kinds || []).map((k) => [k.code, k]));

  function listWithMore(items, key, opts) {
    const n = state.ui[key] || PAGE;
    const shown = items.slice(0, n).map((i) => itemHtml(i, opts)).join("");
    return shown + (items.length > n ? `<p><button type="button" class="btn ghost" data-more="${esc(key)}">Show ${Math.min(PAGE, items.length - n)} more of ${(items.length - n).toLocaleString()}</button></p>` : "");
  }

  // ------------------------------------------------------------- coverage
  const coverageCache = {};
  const sourcesFor = (key) => { const m = state.index.source_agencies || {}; return Object.keys(m).filter((s) => m[s].includes(key)); };
  const sourceLabel = (src) => ((state.index.sources || {})[src] || {}).label || (state.index.source_labels || {})[src] || src;
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
      if (kind === "ok" || kind === "partial") through = !through || run.end > through ? run.end : through;
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
    unchecked: "not checked (the source was added later or no run covered these days)", pending: "not checked yet (next daily run)" };
  const rangeText = (p) => (p.from === p.to ? fmtDay(p.from) : `${fmtDay(p.from)} – ${fmtDay(p.to)}`);
  function coverageList(key, fromDay) {
    return sourcesFor(key).map((src) => {
      const c = coverage(src, key, fromDay);
      const serious = c.problems.filter((p) => p.kind !== "pending");
      const status = !serious.length ? (c.through ? "ok" : "skipped") : serious.every((p) => p.kind === "skipped") ? "skipped"
        : serious.some((p) => p.kind === "failed") ? "failed" : "partial";
      const label = { ok: "checked", partial: "partly checked", failed: "gaps", skipped: "not checked" }[status];
      return `<li><strong>${esc(sourceLabel(src))}</strong> <span class="status ${status}">${label}</span>
        ${c.through ? `<span class="muted small">through ${esc(fmtDay(c.through))}</span>` : ""}
        ${serious.slice(0, 4).map((p) => `<div class="gap">${esc(rangeText(p))}: ${esc(KIND_TEXT[p.kind])}${p.detail ? `. ${esc(p.detail)}` : ""}</div>`).join("")}</li>`;
    }).join("");
  }
  function notFound(what, cat, key, filtered, fromDay) {
    if (filtered) return `<div class="notfound"><h3>Nothing matches these filters</h3><p>There are items here, but none match the search or options above.</p></div>`;
    const note = (state.index.coverage_notes || {})[cat] || "";
    return `<div class="notfound"><h3>No ${esc(what)} found since ${esc(fmtDay(fromDay))}</h3>
      <p>Sources searched:</p><ul class="plain">${coverageList(key, fromDay)}</ul>
      ${note ? `<p><strong>What these sources can and cannot show.</strong> ${esc(note)}</p>` : ""}
      <p class="muted">Not found means nothing was published in these sources for these dates. It does not prove that nothing happened. See <a href="#coverage">What we track</a>.</p></div>`;
  }

  // ----------------------------------------------------------------- home
  function sinceWords() {
    const s = state.since;
    if (s.mode === "visit") return `Since your last visit on ${fmtTime(s.cutoff)}`;
    if (s.mode === "first") return "In the past seven days";
    return `Since ${fmtDay(s.dateFrom)}`;
  }
  function renderHome() {
    const items = state.sinceItems;
    const flagrant = items.filter((i) => i.severity && i.severity.clarity === 3).length;
    const severe = items.filter((i) => i.severity && i.severity.impact === 3).length;
    const flagged = items.filter((i) => i.severity).length;
    const ents = entities();
    const tile = (e) => {
      const list = scopeItems(items, e.key); const c = sevCounts(list);
      const tag = e.type === "agency" ? (e.kind === "commission" ? "Commission" : "Single head")
        : e.type === "corporation" ? `${e.overseer} oversight` : "White House";
      return `<a class="tile" href="#e/${esc(e.key)}" data-tilt>
        <div class="tile-top"><span class="seal ${sealText(e).length > 4 ? "wide" : ""}">${esc(sealText(e))}</span><h3>${esc(e.name)}</h3></div>
        <p class="desc">${esc(e.description || "")}</p>
        <div class="foot-line"><span><span class="new">${list.length.toLocaleString()}</span> new</span>${sevDots(c)}<span class="spacer"></span><span class="tag">${esc(tag)}</span></div></a>`;
    };
    const section = (title, note, list, extra) => `<section class="dir-section"><div class="dir-head"><h2>${esc(title)}</h2><p>${esc(note)}</p></div>
      <div class="grid">${list.map(tile).join("")}${extra || ""}</div></section>`;
    const planned = ((state.index.jurisdictions || []).find((j) => j.key === "state") || {});
    const sc = sevCounts(items);
    const flaggedHere = items.filter((i) => i.severity);
    const mini = `<div class="matrix mini" role="group" aria-label="Flagged actions by clarity and seriousness">
        <div class="ax"></div>${[3, 2, 1].map((im) => `<div class="ax col">${IMPACT[im]}</div>`).join("")}
        ${[3, 2, 1].map((cl) => `<div class="ax">${CLARITY[cl]}</div>${[3, 2, 1].map((im) => {
          const n = flaggedHere.filter((it) => it.severity.clarity === cl && it.severity.impact === im).length;
          return `<a class="cell k${cl * im >= 6 ? 3 : cl * im >= 3 ? 2 : 1} ${n ? "" : "z"}" href="#issues?c=${cl}&i=${im}" aria-label="${CLARITY[cl]} and ${IMPACT[im]}: ${n}">${n}</a>`;
        }).join("")}`).join("")}
        <p class="axis-title">Clarity down, seriousness across</p></div>`;
    const when = state.since.mode === "visit" ? `since your last visit on ${fmtDay(state.since.visitDay)}` : state.since.mode === "first" ? "in the past seven days" : `since ${fmtDay(state.since.dateFrom)}`;
    return `<section class="brief" id="brief"><div>
        <p class="brief-line"><span class="n">${plural(items.length, "action")}</span> ${esc(when)}.
          ${flagged ? `<a href="#issues">${flagged.toLocaleString()} raise${flagged === 1 ? "s" : ""} a constitutional issue</a>.` : "None raised a flagged constitutional issue."}</p>
        <p class="brief-sub">${flagged ? `${flagrant} flagrant, ${severe} severe. ` : ""}Choose a body below to see its actions, chart them, and check what RegHunter could and could not see.</p>
        <div class="brief-strip">${[3, 2, 1].map((k) => `<a href="#issues?band=${k}" class="pill c${k}"><span class="k">${{ 3: "Red", 2: "Orange", 1: "Yellow" }[k]}</span>${sc[k]}</a>`).join("")}</div>
      </div>${mini}</section>
      ${section("The President", "Executive orders, proclamations and memoranda", ents.filter((e) => e.type === "president"))}
      ${section("Federal agencies", "Departments, bureaus and independent commissions", ents.filter((e) => e.type === "agency"))}
      ${section("Agency-controlled corporations", "Private bodies exercising delegated government power", ents.filter((e) => e.type === "corporation"))}
      <section class="dir-section"><div class="dir-head"><h2>State agencies</h2><p>${esc(planned.note || "Planned for a future version.")}</p></div>
        <div class="grid"><div class="tile ghost" aria-disabled="true"><div class="tile-top"><span class="seal">ST</span><h3>State regulators</h3></div>
          <p class="desc">State agency rules and enforcement will appear here in a later version, alongside the federal directory.</p>
          <div class="foot-line"><span class="tag">Planned</span></div></div></div></section>`;
  }
  function bindTilt() {
    if (reduceMotion() || !window.matchMedia("(hover: hover)").matches) return;
    $$("[data-tilt]").forEach((el) => {
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect(); const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${px * 100}%`); el.style.setProperty("--my", `${py * 100}%`);
        el.style.setProperty("--rx", `${(0.5 - py) * 7}deg`); el.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
      });
      el.addEventListener("pointerleave", () => { ["--rx", "--ry"].forEach((p) => el.style.setProperty(p, "0deg")); el.style.setProperty("--my", "0%"); });
    });
  }

  // --------------------------------------------------------------- entity
  async function renderEntity(key, tab) {
    const e = entityMap()[key];
    if (!e) return renderHome();
    const tabs = [["activity", "Activity"], ["charts", "Charts"], ["coverage", "Coverage"]];
    const head = `<a class="back" href="#home">Back to the directory</a>
      <div class="page-head"><span class="seal">${esc(sealText(e))}</span><div><h1>${esc(e.name)}</h1>
        <p class="desc">${esc(e.description || "")}${e.overseer ? ` Supervised by the ${esc((entityMap()[e.overseer.toLowerCase()] || {}).name || e.overseer)}.` : ""}</p></div></div>
      <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === tab}" class="${k === tab ? "active" : ""}" data-go="#e/${esc(key)}/${k}">${l}</button>`).join("")}</div>`;
    if (tab === "charts") {
      const all = scopeItems(await loadAll(), key);
      return { html: head + `<p class="lede">Build a chart of this ${e.type === "agency" ? "agency's" : "body's"} actions across the whole stored history (since ${esc(fmtDay(Object.keys(state.index.days).sort()[0]))}). Choose the kinds of action, sanctions, outcomes and dates, then download the chart.</p><div id="chart-host"></div>`,
        after: () => {
          const ctx = state.charts[key] || (state.charts[key] = { entityName: e.name, fileKey: key });
          ctx.labels = chartLabels();
          window.RHCharts.render($("#chart-host"), all, ctx);
        } };
    }
    if (tab === "coverage") {
      const from = state.since.dateFrom;
      const isCorp = e.type === "corporation";
      return { html: head + `<h2>Sources checked since ${esc(fmtDay(from))}</h2><ul class="plain">${coverageList(isCorp ? "sec" : key, from)}</ul>
        ${isCorp ? `<p class="muted">${esc(e.name)} items come from SEC notices in the Federal Register; its own website is not read.</p>` : ""}
        <h2>What each kind of action can and cannot show</h2><ul class="plain">${CAT_ORDER.filter((c) => (state.index.coverage_notes || {})[c]).map((c) => `<li><strong>${esc(state.index.categories[c])}.</strong> ${esc(state.index.coverage_notes[c])}</li>`).join("")}</ul>
        <p><a href="#coverage">See everything RegHunter does and does not track</a></p>` };
    }
    // activity
    const ui = state.ui[key] || (state.ui[key] = { scope: "new", cat: "all", q: "", flagged: false, sort: "severity" });
    const pool = ui.scope === "new" ? scopeItems(state.sinceItems, key) : scopeItems(await loadAll(), key);
    const cats = ["all", ...CAT_ORDER.filter((c) => pool.some((i) => i.category === c) || (e.type !== "president" && c !== "presidential"))];
    const inCat = pool.filter((i) => ui.cat === "all" || i.category === ui.cat);
    const q = ui.q.trim().toLowerCase();
    const shown = inCat.filter((i) => (!ui.flagged || i.severity) && (!q || `${i.title} ${i.summary} ${i.subcategory}`.toLowerCase().includes(q)))
      .sort(ui.sort === "date" ? byDate : bySeverity);
    const cnt = (c) => pool.filter((i) => c === "all" || i.category === c).length;
    const fromDay = ui.scope === "new" ? state.since.dateFrom : Object.keys(state.index.days).sort()[0];
    const corpNote = key === "sec" ? `<p class="muted small">Filings by FINRA, PCAOB, MSRB and the exchanges are under <a href="#e/finra">agency-controlled corporations</a>.</p>` : "";
    const html = head + corpNote + `
      <div class="toolbar"><span class="seg" data-ui="scope">${[["new", state.since.mode === "visit" ? `New since ${fmtDay(state.since.visitDay)}` : `Since ${fmtDay(state.since.dateFrom)}`], ["all", "All stored history"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.scope === v ? "active" : ""}">${esc(l)}</button>`).join("")}</span>
        <span class="seg" data-ui="sort">${[["severity", "Most severe first"], ["date", "Newest first"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${ui.sort === v ? "active" : ""}">${l}</button>`).join("")}</span></div>
      <div class="tabs" id="cat-tabs">${cats.map((c) => `<button type="button" data-cat="${c}" class="${c === ui.cat ? "active" : ""}">${esc(c === "all" ? "All" : state.index.categories[c])}<span class="count">${cnt(c)}</span></button>`).join("")}</div>
      <div class="toolbar" id="filters"><input type="search" id="f-q" placeholder="Filter by words in the title or summary" value="${esc(ui.q)}">
        <label><input type="checkbox" id="f-flag" ${ui.flagged ? "checked" : ""}> Only constitutional flags</label>
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
  }
  function chartLabels() {
    const tax = state.tax || {};
    return { categories: state.index.categories, sanctions: sanctionMap(), outcomes: outcomeMap(),
      kinds: Object.fromEntries((tax.kinds || []).map((k) => [k.code, k.label])), clarity: CLARITY, impact: IMPACT };
  }

  // --------------------------------------------------------------- issues
  async function renderIssues() {
    const p = state.params;
    const scope = p.get("scope") || "new";
    const pool = (scope === "all" ? await loadAll() : state.sinceItems).filter((i) => i.severity);
    const c = +p.get("c") || 0, i = +p.get("i") || 0, band = +p.get("band") || 0, kind = p.get("kind") || "", structural = p.get("s") === "1";
    const bandOf = (it) => (it.severity.score >= 6 ? 3 : it.severity.score >= 3 ? 2 : 1);
    const inKind = (it) => !kind || it.flags.some((f) => f.code === kind);
    const inStruct = (it) => !structural || it.flags.some((f) => f.structural);
    const base = pool.filter((it) => inKind(it) && inStruct(it));
    const shown = base.filter((it) => (!c || it.severity.clarity === c) && (!i || it.severity.impact === i) && (!band || bandOf(it) === band)).sort(bySeverity);
    const link = (mods) => { const q = new URLSearchParams(p); Object.entries(mods).forEach(([k, v]) => (v ? q.set(k, v) : q.delete(k))); return `#issues?${q}`; };
    const cell = (cl, im) => {
      const n = base.filter((it) => it.severity.clarity === cl && it.severity.impact === im).length;
      const k = cl * im >= 6 ? 3 : cl * im >= 3 ? 2 : 1;
      return `<a class="cell k${k} ${n ? "" : "z"} ${c === cl && i === im ? "sel" : ""}" href="${link({ c: c === cl && i === im ? "" : cl, i: c === cl && i === im ? "" : im, band: "" })}"
        aria-label="${CLARITY[cl]} and ${IMPACT[im]}: ${n}">${n}</a>`;
    };
    const kinds = (state.tax.kinds || []).map((k) => ({ ...k, n: pool.filter((it) => it.flags.some((f) => f.code === k.code)).length })).filter((k) => k.n || k.code === kind);
    // group: clarity, then seriousness
    let groups = "";
    [3, 2, 1].forEach((cl) => [3, 2, 1].forEach((im) => {
      const list = shown.filter((it) => it.severity.clarity === cl && it.severity.impact === im);
      if (list.length) groups += `<div class="group-h"><h3>${CLARITY[cl]} and ${IMPACT[im].toLowerCase()}</h3><span class="muted">${plural(list.length, "action")}</span></div>${listWithMore(list, `iss:${cl}${im}`, { showEntity: true })}`;
    }));
    return { html: `<h1>Constitutional issues</h1>
      <p class="lede">Every flagged action is rated on two scales. <strong>Clarity</strong> asks how directly existing law condemns this kind of action;
        <strong>seriousness</strong> asks how much is at stake. Both run red, orange, yellow. Yellow is never "acceptable"; it means less settled or narrower.
        <a href="#coverage#kinds">How each kind of issue is rated</a>.</p>
      <div class="toolbar"><span class="seg">${[["new", sinceWords()], ["all", "All stored history"]].map(([v, l]) => `<button type="button" class="${scope === v ? "active" : ""}" data-go="${link({ scope: v === "new" ? "" : v })}">${esc(l)}</button>`).join("")}</span>
        <label><input type="checkbox" id="iss-s" ${structural ? "checked" : ""}> Structural issues only</label>
        ${c || i || band || kind ? `<a href="${link({ c: "", i: "", band: "", kind: "" })}">Clear selection</a>` : ""}</div>
      <div class="matrix" role="group" aria-label="Flagged actions by clarity and seriousness">
        <div class="ax"><span class="axis-title">Clarity down, seriousness across</span></div>
        ${[3, 2, 1].map((im) => `<div class="ax col"><strong>${IMPACT[im]}</strong></div>`).join("")}
        ${[3, 2, 1].map((cl) => `<div class="ax"><strong>${CLARITY[cl]}</strong></div>${[3, 2, 1].map((im) => cell(cl, im)).join("")}`).join("")}
      </div>
      <h2>Kind of issue</h2>
      <div class="chips">${kinds.map((k) => `<a class="chip ${k.code === kind ? "on" : ""}" href="${link({ kind: k.code === kind ? "" : k.code })}">${esc(k.label)} <span class="k">${k.n}</span></a>`).join("") || '<span class="muted">No flags in this period.</span>'}</div>
      <h2>${plural(shown.length, "flagged action")}</h2>
      ${groups || `<div class="notfound"><h3>No flagged actions match</h3><p>The automated screen found no wording tied to these issues in the selected period. It reads titles and summaries only, so an unflagged action can still raise issues.</p></div>`}`,
      after: () => { const s = $("#iss-s"); if (s) s.addEventListener("change", () => go(link({ s: s.checked ? "1" : "" }))); } };
  }

  // ------------------------------------------------------------- research
  const EXAMPLES = [
    "SEC gag orders and no-deny settlements",
    "Penalties decided by in-house judges since October",
    "FINRA expulsions and bars",
    "Flagrant issues involving the President, as a timeline",
    "Crypto enforcement",
    "Tobacco retailer fines by FDA",
    "Grant terminations and impoundment",
    "Proposed rules open for comment about AI",
  ];
  async function renderResearch() {
    await loadAll();
    const p = state.params;
    const q = p.get("q") || "";
    const strict = p.get("m") === "strict";
    const group = p.get("g") || "none";
    const view = p.get("v") || "cards";
    const facet = (k) => (p.get(k) || "").split(",").filter(Boolean);
    const facets = { entities: facet("e"), categories: facet("cat"), sanctions: facet("san"), issues: facet("iss"), outcomes: facet("out"),
      clarity: facet("cl").map(Number), impact: facet("im").map(Number), from: p.get("from") || "", to: p.get("to") || "" };
    const parsed = state.engine.parse(q);
    const drop = facet("drop");
    parsed.entities = parsed.entities.filter((x) => !drop.includes(`e:${x.key}`));
    parsed.concepts = parsed.concepts.filter((x) => !drop.includes(`${x.kind}:${x.key}`));
    parsed.severity = parsed.severity.filter((x) => !drop.includes(`sev:${x.axis}`));
    if (drop.includes("date")) parsed.date = null;
    const anything = q.trim() || Object.values(facets).some((v) => (Array.isArray(v) ? v.length : v));
    const res = anything ? state.engine.search(parsed, facets, strict) : { strong: [], related: [], total: 0 };
    const all = res.strong.map((r) => r.it);

    const em = entityMap(), sm = sanctionMap(), om = outcomeMap(), km = kindMap();
    const understood = [
      ...parsed.entities.map((x) => [`e:${x.key}`, "Agency", em[x.key].name]),
      ...parsed.concepts.map((x) => [`${x.kind}:${x.key}`, { sanction: "Sanction", issue: "Issue", category: "Kind", outcome: "Outcome" }[x.kind],
        x.kind === "sanction" ? sm[x.key].label : x.kind === "issue" ? km[x.key].label : x.kind === "outcome" ? om[x.key] : x.key.startsWith("sub:") ? x.key.slice(4) + "s" : state.index.categories[x.key]]),
      ...parsed.severity.map((x) => [`sev:${x.axis}`, "Severity", x.axis === "clarity" ? "Flagrant issues" : x.axis === "impact" ? "Severe issues" : x.axis === "structural" ? "Structural issues" : "Any constitutional flag"]),
      ...(parsed.date ? [["date", "Dates", [parsed.date.from && fmtDay(parsed.date.from), parsed.date.to && fmtDay(parsed.date.to)].filter(Boolean).join(" to ")]] : []),
    ];
    const pool = state.all;
    const count = (fn) => pool.filter(fn).length;
    const fbox = (name, key, opts, open) => `<details class="facet" ${open ? "open" : ""}><summary>${esc(name)}${facet(key).length ? ` (${facet(key).length})` : ""}</summary>${opts}</details>`;
    const cb = (key, val, label, n) => `<label><input type="checkbox" data-f="${key}" value="${esc(val)}" ${facet(key).includes(String(val)) ? "checked" : ""}> ${esc(label)} <span class="c">${n}</span></label>`;
    const fams = (state.tax.sanction_families || []).map((f) => `<div class="fam">${esc(f.label)}</div>${state.tax.sanctions.filter((s) => s.family === f.key).map((s) => cb("san", s.key, s.label, count((it) => (it.sanctions || []).includes(s.key)))).join("")}`).join("");
    const side = `<aside class="facets" aria-label="Filters">
      <p class="muted small">Filters narrow the results; every list shows the full set of options, including ones with no matches yet.</p>
      ${fbox("Agency or body", "e", entities().map((e) => cb("e", e.key, e.name, count((it) => entityOf(it).includes(e.key)))).join(""), facet("e").length)}
      ${fbox("Kind of action", "cat", CAT_ORDER.map((c) => cb("cat", c, state.index.categories[c], count((it) => it.category === c))).join(""), facet("cat").length)}
      ${fbox("Sanction", "san", fams, facet("san").length)}
      ${fbox("Constitutional issue", "iss", (state.tax.kinds || []).map((k) => cb("iss", k.code, k.label, count((it) => (it.flags || []).some((f) => f.code === k.code)))).join(""), facet("iss").length)}
      ${fbox("Clarity", "cl", [3, 2, 1].map((v) => cb("cl", v, CLARITY[v], count((it) => it.severity && it.severity.clarity === v))).join(""), facet("cl").length)}
      ${fbox("Seriousness", "im", [3, 2, 1].map((v) => cb("im", v, IMPACT[v], count((it) => it.severity && it.severity.impact === v))).join(""), facet("im").length)}
      ${fbox("Outcome", "out", (state.tax.outcomes || []).map((o) => cb("out", o.key, o.label, count((it) => it.outcome === o.key))).join(""), facet("out").length)}
      <details class="facet" ${facets.from || facets.to ? "open" : ""}><summary>Dates</summary>
        <label>From <input type="date" data-d="from" value="${esc(facets.from)}"></label><label>To <input type="date" data-d="to" value="${esc(facets.to)}"></label></details>
    </aside>`;

    let body = "";
    if (!anything) {
      body = `<div class="panel"><h3>Ask the way you would ask a research assistant</h3>
        <p class="muted">RegHunter reads your request for agencies, dates, sanctions, constitutional issues and outcomes, then ranks every stored action by how well it matches,
          including related words (“gag” also finds “no-deny” and “nondisparagement”), word forms (“barred” finds “bar”) and small typos. Nothing you type leaves this browser.</p></div>`;
    } else {
      const groupKey = (it) => group === "entity" ? entityOf(it).map((k) => (em[k] || {}).name || k)
        : group === "issue" ? ((it.flags || []).length ? it.flags.map((f) => f.label) : ["No constitutional flag"])
        : group === "sanction" ? ((it.sanctions || []).length ? it.sanctions.map((k) => sm[k].label) : ["No sanction wording"])
        : group === "category" ? [state.index.categories[it.category]]
        : group === "severity" ? [it.severity ? `${CLARITY[it.severity.clarity]} and ${IMPACT[it.severity.impact].toLowerCase()}` : "Not flagged"]
        : group === "date" ? [(() => { const d = new Date(it.date + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return `Week of ${fmtDay(localDay(d))}`; })()] : ["Results"];
      const buckets = new Map();
      res.strong.forEach((r) => groupKey(r.it).forEach((g) => { if (!buckets.has(g)) buckets.set(g, []); buckets.get(g).push(r); }));
      let ordered = [...buckets.entries()];
      if (group === "date") ordered.sort((a, b) => (b[1][0].it.date || "").localeCompare(a[1][0].it.date || ""));
      else if (group !== "none") ordered.sort((a, b) => b[1].length - a[1].length);
      const render = (rs, k) => view === "table" ? tableHtml(rs.map((r) => r.it)) : rs.slice(0, state.ui[k] || PAGE).map((r) => itemHtml(r.it, { showEntity: true, why: r.why.slice(0, 4).join(", ") })).join("")
        + (view !== "table" && rs.length > (state.ui[k] || PAGE) ? `<p><button type="button" class="btn ghost" data-more="${esc(k)}">Show more of ${rs.length.toLocaleString()}</button></p>` : "");
      body = `<div class="figures"><div class="figure"><div class="n">${res.strong.length.toLocaleString()}</div><div class="l">strong matches</div></div>
          <div class="figure"><div class="n">${res.related.length.toLocaleString()}</div><div class="l">related matches below</div></div>
          <div class="figure"><div class="n">${new Set(all.flatMap(entityOf)).size}</div><div class="l">agencies and bodies</div></div>
          <div class="figure"><div class="n">${all.filter((it) => it.severity && it.severity.clarity === 3).length}</div><div class="l">flagrant issues</div></div></div>
        <div class="toolbar">Group by <span class="seg" data-p="g">${[["none", "Relevance"], ["entity", "Agency"], ["severity", "Severity"], ["issue", "Issue"], ["sanction", "Sanction"], ["category", "Kind"], ["date", "Week"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${group === v ? "active" : ""}">${l}</button>`).join("")}</span>
          Show as <span class="seg" data-p="v">${[["cards", "Cards"], ["table", "Table"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${view === v ? "active" : ""}">${l}</button>`).join("")}</span>
          <button type="button" class="btn ghost small" id="r-csv">Download CSV</button><button type="button" class="btn ghost small" id="r-link">Copy link to these results</button></div>
        ${ordered.map(([g, rs], n) => `${group !== "none" ? `<div class="group-h"><h3>${esc(g)}</h3><span class="muted">${rs.length}</span></div>` : ""}${render(rs, `r:${n}`)}`).join("")
          || `<div class="notfound"><h3>No strong matches</h3><p>Try removing a recognized part (click its ×), switching to “Best matches first”, or widening the dates.</p></div>`}
        ${res.related.length ? `<details class="panel"><summary>Related matches (${res.related.length.toLocaleString()}): weaker matches, kept so nothing is silently left out</summary>
          ${view === "table" ? tableHtml(res.related.slice(0, 200).map((r) => r.it)) : res.related.slice(0, 60).map((r) => itemHtml(r.it, { showEntity: true, why: r.why.slice(0, 4).join(", ") })).join("")}</details>` : ""}
        ${limitsNote(parsed, facets)}`;
    }
    const html = `<h1>Research</h1>
      <p class="lede">Search the whole stored history${state.index.days ? `, since ${esc(fmtDay(Object.keys(state.index.days).sort()[0]))}` : ""}, by describing what you want or by using the filters.</p>
      <div class="research">${side}<div>
        <form class="askbox" id="ask" role="search"><label class="sr" for="ask-q">Describe what you are looking for</label>
          <input id="ask-q" type="search" value="${esc(q)}" placeholder="e.g. FINRA expulsions and bars since September">
          <button class="btn" type="submit">Search</button></form>
        <div class="examples">Try: ${EXAMPLES.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join(" ")}</div>
        ${q.trim() ? `<div class="understood"><div class="chips">${understood.map(([id, k, l]) => `<span class="chip fixed"><span class="k">${esc(k)}</span>${esc(l)}<button type="button" data-drop="${esc(id)}" aria-label="Remove ${esc(l)}">×</button></span>`).join("")}
            ${parsed.terms.length ? `<span class="chip fixed"><span class="k">Words</span>${esc(parsed.terms.join(", "))}</span>` : ""}</div>
            ${drop.length ? `<a href="#" id="undrop">Restore removed parts</a>` : ""}
            <div class="toolbar">Match <span class="seg" data-p="m">${[["", "Best matches first"], ["strict", "Every recognized part"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${(p.get("m") || "") === v ? "active" : ""}">${l}</button>`).join("")}</span></div></div>` : ""}
        ${body}</div></div>`;
    return { html, after: () => bindResearch(res) };
  }
  function limitsNote(parsed, facets) {
    const sm = sanctionMap(), km = kindMap();
    const neverSeen = parsed.concepts.filter((c) => (c.kind === "sanction" || c.kind === "issue") &&
      !state.all.some((it) => (c.kind === "sanction" ? (it.sanctions || []).includes(c.key) : (it.flags || []).some((f) => f.code === c.key))))
      .map((c) => (c.kind === "sanction" ? sm[c.key].label : km[c.key].label));
    const wantsActions = parsed.concepts.some((c) => c.kind === "sanction" || (c.kind === "category" && c.key === "enforcement")) || facets.sanctions.length;
    const skipped = Object.values(state.index.sources || {}).filter((s) => s.last_status === "skipped" || s.last_status === "failed");
    if (!wantsActions && !skipped.length && !neverSeen.length) return "";
    return `<div class="notfound"><h3>Limits on these results</h3><ul class="plain">
      ${neverSeen.map((l) => `<li>No stored action is tagged “${esc(l)}” yet. Either none was published in the sources checked, or the wording appears only in the full documents, which RegHunter does not read.</li>`).join("")}
      ${skipped.map((s) => `<li>${esc(s.label)} ${s.last_status === "failed" ? "failed on its last run" : "is switched off"}: ${esc(s.last_detail)}</li>`).join("")}
      ${wantsActions ? `<li>${esc(state.index.coverage_notes.enforcement)}</li>` : ""}</ul><p><a href="#coverage">What we track</a></p></div>`;
  }
  function tableHtml(items) {
    return `<div class="wrap-x"><table class="t"><thead><tr><th>Date</th><th>Agency or body</th><th>Title</th><th>Type</th><th>Clarity</th><th>Seriousness</th></tr></thead><tbody>${
      items.map((it) => `<tr><td style="white-space:nowrap">${esc(fmtDay(it.date))}</td><td>${esc(entityNames(it))}</td>
        <td><a href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a></td><td>${esc(it.subcategory)}</td>
        <td>${it.severity ? pill("clarity", it.severity.clarity) : ""}</td><td>${it.severity ? pill("impact", it.severity.impact) : ""}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function csvOf(items) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const sm = sanctionMap(), om = outcomeMap();
    const head = ["Date", "Agency or body", "Kind", "Type", "Outcome", "Title", "Link", "Clarity", "Seriousness", "Constitutional issues", "Sanctions", "Source", "Comments due"];
    const rows = items.map((it) => [it.date, entityNames(it), state.index.categories[it.category], it.subcategory, om[it.outcome], it.title, it.url,
      it.severity ? CLARITY[it.severity.clarity] : "", it.severity ? IMPACT[it.severity.impact] : "", (it.flags || []).map((f) => f.label).join("; "),
      (it.sanctions || []).map((k) => (sm[k] || {}).label || k).join("; "), it.source_label, it.comments_close || ""]);
    return [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
  }
  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: type || "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 600);
  }
  function bindResearch(res) {
    const p = new URLSearchParams(state.params);
    const push = () => go(`#research?${p}`, true);
    $("#ask").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#ask-q").value.trim(); v ? p.set("q", v) : p.delete("q"); p.delete("drop"); push(); });
    $$("[data-ex]").forEach((b) => b.addEventListener("click", () => { p.set("q", b.dataset.ex); p.delete("drop"); push(); }));
    $$("[data-f]").forEach((el) => el.addEventListener("change", () => {
      const k = el.dataset.f; const vals = $$(`[data-f="${k}"]:checked`).map((x) => x.value);
      vals.length ? p.set(k, vals.join(",")) : p.delete(k); push();
    }));
    $$("[data-d]").forEach((el) => el.addEventListener("change", () => { el.value ? p.set(el.dataset.d, el.value) : p.delete(el.dataset.d); push(); }));
    $$("[data-p] button").forEach((b) => b.addEventListener("click", () => { const k = b.parentElement.dataset.p; b.dataset.v ? p.set(k, b.dataset.v) : p.delete(k); push(); }));
    $$("[data-drop]").forEach((b) => b.addEventListener("click", () => { const d = (p.get("drop") || "").split(",").filter(Boolean); d.push(b.dataset.drop); p.set("drop", d.join(",")); push(); }));
    const u = $("#undrop"); if (u) u.addEventListener("click", (e) => { e.preventDefault(); p.delete("drop"); push(); });
    const c = $("#r-csv"); if (c) c.addEventListener("click", () => download("reghunter-research.csv", csvOf([...res.strong, ...res.related].map((r) => r.it))));
    const l = $("#r-link"); if (l) l.addEventListener("click", async () => { try { await navigator.clipboard.writeText(location.href); l.textContent = "Link copied"; } catch (e) { l.textContent = "Copy the address bar"; } });
  }

  // ------------------------------------------------------------- coverage
  function renderCoverage() {
    const ix = state.index, tax = state.tax;
    const srcRows = Object.entries(ix.sources || {}).map(([k, s]) => `<tr><td>${esc(s.label)}</td><td><span class="status ${esc(s.last_status)}">${esc(s.last_status)}</span></td>
      <td>${esc(fmtTime(s.last_attempt))}</td><td>${esc(s.covered_through ? fmtDay(s.covered_through) : "never")}</td><td class="small">${esc(s.last_detail || "")}</td></tr>`).join("");
    const configured = Object.keys(ix.source_agencies || {}).filter((k) => !(ix.sources || {})[k]);
    const kinds = (tax.kinds || []).map((k) => `<tr><td><strong>${esc(k.label)}</strong><div class="muted small">${esc(tax.groups[k.group])}</div></td>
      <td>${pill("clarity", k.default_clarity)}</td><td>${pill("impact", k.default_impact)}</td>
      <td class="small">${esc(k.raises)}${k.raises && k.lowers ? " " : ""}${esc(k.lowers)}</td><td class="small">${k.authorities.map(esc).join("; ")}</td></tr>`).join("");
    const sanctions = (tax.sanction_families || []).map((f) => `<h3>${esc(f.label)}</h3><ul class="plain">${tax.sanctions.filter((s) => s.family === f.key).map((s) => `<li>${esc(s.label)}</li>`).join("")}</ul>`).join("");
    const runs = (ix.runs || []).slice(-10).reverse().map((r) => `<tr><td>${esc(fmtTime(r.run_at))}</td><td>${esc(fmtDay(r.start))} – ${esc(fmtDay(r.end))}</td>
      <td class="num">${r.items_new ?? ""}</td><td class="num">${r.requests ?? ""}</td></tr>`).join("");
    return `<h1>What we track</h1>
      <p class="lede">Everything RegHunter reads, when each source was last checked, the limits of each kind of search, and, just as important, what it does not track.</p>
      <div class="toc"><a href="#coverage#sources">Sources</a><a href="#coverage#limits">Limits by kind of action</a><a href="#coverage#not">Not tracked</a>
        <a href="#coverage#kinds">Kinds of constitutional issue</a><a href="#coverage#sanctions">Kinds of sanction</a><a href="#coverage#runs">Recent runs</a></div>
      <h2 id="sources">Sources</h2>
      <div class="wrap-x"><table class="t"><thead><tr><th>Source</th><th>Last result</th><th>Last attempt</th><th>Checked through</th><th>Notes</th></tr></thead><tbody>${srcRows || '<tr><td colspan="5">No runs yet.</td></tr>'}
        ${configured.map((k) => `<tr><td>${esc(sourceLabel(k))}</td><td><span class="status skipped">new</span></td><td colspan="3" class="small">Added in version 2.0; it will be checked on the next daily run.</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small">Agency websites are read only through feeds the agency publishes for subscribers, after checking the site's robots.txt, once a day, with pauses between requests. Every other address is refused in code.</p>
      <h2 id="limits">Limits by kind of action</h2>
      <ul class="plain">${CAT_ORDER.filter((c) => (ix.coverage_notes || {})[c]).map((c) => `<li><strong>${esc(ix.categories[c])}.</strong> ${esc(ix.coverage_notes[c])}</li>`).join("")}</ul>
      <h2 id="not">Not tracked</h2>
      <div class="wrap-x"><table class="t"><thead><tr><th>Not tracked</th><th>Why</th></tr></thead><tbody>${(ix.not_tracked || []).map((n) => `<tr><td>${esc(n.what)}</td><td class="small">${esc(n.why)}</td></tr>`).join("")}</tbody></table></div>
      <h2 id="kinds">Kinds of constitutional issue and how they are rated</h2>
      <p>Each kind starts at the ratings shown. The wording of a particular document can move the ratings up or down, as described. Each flag in the app explains its own rating.</p>
      <div class="wrap-x"><table class="t"><thead><tr><th>Kind of issue</th><th>Usual clarity</th><th>Usual seriousness</th><th>What changes the rating</th><th>Leading authorities</th></tr></thead><tbody>${kinds}</tbody></table></div>
      ${["clarity", "impact"].map((ax) => `<h3>${esc(tax.scales[ax].label)}: ${esc(tax.scales[ax].question)}</h3><ul class="plain">${tax.scales[ax].levels.map((l) => `<li>${pill(ax, l.value)} ${esc(l.meaning)}</li>`).join("")}</ul>`).join("")}
      <h2 id="sanctions">Kinds of sanction RegHunter recognizes</h2>${sanctions}
      <h2 id="runs">Recent runs</h2>
      <div class="wrap-x"><table class="t"><thead><tr><th>Run</th><th>Dates checked</th><th class="num">New items</th><th class="num">Requests</th></tr></thead><tbody>${runs || '<tr><td colspan="4">No runs yet.</td></tr>'}</tbody></table></div>`;
  }

  // --------------------------------------------------------------- manual
  function renderManual() {
    return `<article class="prose"><h1>User manual</h1>
      <p class="lede">RegHunter gathers what the federal executive branch publishes each day, sorts it by agency and kind of action, flags arguable constitutional problems, rates each one for clarity and seriousness, and tells you plainly what it could not see.</p>
      <div class="toc"><a href="#manual#m1">Signing in</a><a href="#manual#m2">The directory</a><a href="#manual#m3">Agency pages</a><a href="#manual#m4">Ratings</a>
        <a href="#manual#m5">Constitutional issues</a><a href="#manual#m6">Research</a><a href="#manual#m7">Charts</a><a href="#manual#m8">Sources and limits</a><a href="#manual#m9">Questions</a></div>
      <h2 id="m1">Signing in and “what's new”</h2>
      <p>Choose a username the first time (no password). RegHunter remembers your last visit in this browser and shows what was published since then. Use the date button at the top right to pick any other starting date, or to mark everything as read. On another computer, enter the same username and paste the sync code from the account button. Items that were published earlier but reached RegHunter after your last visit are included, so late postings are not missed.</p>
      <h2 id="m2">The directory</h2>
      <p>The home screen opens with a one-sentence briefing, then a button for every body RegHunter tracks: the President, federal agencies, and agency-controlled corporations such as FINRA, each with a short description, the number of new actions, and red, orange and yellow counts of flagged actions. State agencies are planned for a later version.</p>
      <h2 id="m3">Agency pages</h2>
      <p>Each agency has three tabs. <strong>Activity</strong> lists its actions, either new since your last visit or across all stored history, split into rulemaking, enforcement, adjudication and licensing, and other notices. <strong>Charts</strong> builds charts of its actions. <strong>Coverage</strong> shows which sources were checked for it and for which dates.</p>
      <h2 id="m4">How ratings work</h2>
      <p>Each flagged issue gets two ratings, each red, orange or yellow:</p>
      <ul><li><strong>Clarity</strong> (how flagrant): ${pill("clarity", 3)} the action fits a pattern the Supreme Court has squarely held unlawful; ${pill("clarity", 2)} a strong argument under existing precedent; ${pill("clarity", 1)} an open question worth review.</li>
        <li><strong>Seriousness</strong> (impact): ${pill("impact", 3)} penalties, bars, loss of property or livelihood, or economy-wide or presidential action; ${pill("impact", 2)} binding obligations on an industry or regulated parties; ${pill("impact", 1)} narrower or preliminary effects.</li></ul>
      <p>Yellow is never “acceptable”; it means less settled or narrower. The kind of issue (jury trial, appointments, delegation, speech and so on) is shown beside the ratings. Open <em>Why flagged</em> on any action to see the trigger words, the reason for each rating, and leading cases. The full list of kinds and their usual ratings is on <a href="#coverage#kinds">What we track</a>.</p>
      <h2 id="m5">Constitutional issues page</h2>
      <p>A grid of clarity against seriousness shows how many flagged actions fall in each combination. Click a square to list just those, or pick a kind of issue below the grid. Results are grouped from most flagrant and severe down.</p>
      <h2 id="m6">Research</h2>
      <p>Type a request in plain English, such as <em>“SEC gag orders since September”</em>, or use the filters on the left. RegHunter recognizes agencies, dates, about thirty kinds of sanction, every kind of constitutional issue, outcomes and severity words, then ranks all stored actions by relevance. It understands related words (a search for “gag” also finds “no-deny” and “nondisparagement”), different forms of a word, and small typos. Strong matches come first; weaker related matches are kept in a separate section rather than dropped. Remove any recognized part with its ×, or switch to “Every recognized part” for strict matching. Results can be grouped, shown as a table, downloaded as a spreadsheet file (CSV), or saved as a link. The search box at the top of every page goes straight here.</p>
      <h2 id="m7">Charts</h2>
      <p>On an agency's Charts tab, choose a chart (stacked bars or lines over time, totals, share of total, or the clarity and seriousness grid), what to break it down by, the kinds of action, sanctions and outcomes to include, and the dates. Hover over the chart for exact figures, show the numbers as a table, and download it as a PNG image, an SVG drawing or a CSV file.</p>
      <h2 id="m8">Sources and limits</h2>
      <p>RegHunter reads the Federal Register and Regulations.gov interfaces, the SEC's enforcement feeds, FDA's recall enforcement interface (openFDA), and feeds that the FTC, NLRB, FCC, FDA and CFPB publish on their websites for subscribers. It checks each website's robots.txt first, reads each feed once a day with pauses between requests, identifies itself honestly, never submits anything, and refuses every address not on its list. Flags read only titles and summaries. See <a href="#coverage#not">Not tracked</a> for the gaps, including EPA and Department of Labor enforcement.</p>
      <h2 id="m9">Common questions</h2>
      <dl><dt>Why is today's information missing?</dt><dd>The collector runs each morning. The Federal Register publishes on business days.</dd>
        <dt>Can I add an agency?</dt><dd>Yes. Agencies are listed in <code>collector/config.py</code>; a new entry adds a button after the next run.</dd>
        <dt>Is my information private?</dt><dd>Your username, dates and searches stay in your browser. The site and the government records it shows are public.</dd>
        <dt>Is a flag a legal opinion?</dt><dd>No. It is an automated screen that marks an arguable issue worth a lawyer's review.</dd></dl></article>`;
  }

  // --------------------------------------------------------------- router
  function parseHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, "")) || "home";
    const [pathAndQ, anchor] = raw.split("#");
    const [path, query] = pathAndQ.split("?");
    return { path, params: new URLSearchParams(query || ""), anchor };
  }
  function go(hash, replace) {
    if (replace) { history.replaceState(null, "", hash); route(); } else location.hash = hash;
  }
  let routing = 0;
  async function route() {
    const { path, params, anchor } = parseHash();
    const prevView = state.view;
    state.view = path; state.params = params;
    const run = ++routing;
    const tip = $(".charttip"); if (tip) tip.hidden = true;
    $$(".nav a").forEach((a) => a.classList.toggle("active", path === a.dataset.nav || (a.dataset.nav === "home" && path.startsWith("e/"))));
    if (path === "tutorial") { state.view = "home"; await paint(renderHome(), bindTilt, true); startTour(); return; }
    let out;
    if (path === "manual") out = renderManual();
    else if (!state.index || !(state.index.runs || []).length) out = `<div class="empty"><img src="logo.svg" alt="" width="80" height="80"><h1>No data yet</h1>
      <p>The daily collector has not published results yet. Once it runs (each morning, or when started from the repository's Actions tab), this page fills in.</p><p><a href="#manual">Read the manual</a></p></div>`;
    else if (path.startsWith("e/")) { const [, key, tab] = path.split("/"); out = await renderEntity(key, tab || "activity"); }
    else if (path === "issues") out = await renderIssues();
    else if (path === "research") out = await renderResearch();
    else if (path === "coverage") out = renderCoverage();
    else out = { html: renderHome(), after: bindTilt };
    if (run !== routing) return;
    const html = typeof out === "string" ? out : out.html;
    const same = prevView === path;
    await paint(html, typeof out === "string" ? null : out.after, !same);
    if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth" }); }
    else if (!same) window.scrollTo(0, 0);
  }
  async function paint(html, after, animate) {
    const apply = () => {
      const v = $("#view");
      v.innerHTML = html;
      if (animate && !document.startViewTransition) { v.style.animation = "none"; void v.offsetWidth; v.style.animation = ""; }
      if (after) after();
      bindCommon();
    };
    if (animate && document.startViewTransition && !reduceMotion()) await document.startViewTransition(apply).updateCallbackDone;
    else apply();
  }
  function rerender(done) {
    route().then(() => done && done());
  }
  function bindCommon() {
    $$("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
    $$("[data-more]").forEach((b) => b.addEventListener("click", () => { const k = b.dataset.more; state.ui[k] = (state.ui[k] || PAGE) + PAGE; rerender(); }));
  }

  // ------------------------------------------------------------- the tour
  const TOUR = [
    { view: "home", target: "#brief", title: "Your briefing", text: "Each visit opens with what agencies published since you last checked, and how many actions raise constitutional issues." },
    { view: "home", target: "#since-btn", title: "Choose the period", text: "Pick any starting date, or mark everything as read to start fresh." },
    { view: "home", target: 'a.tile[href="#e/sec"]', title: "The directory", text: "Every tracked body has its own button with a short description, the number of new actions, and red, orange and yellow counts of flagged ones." },
    { view: "e/sec", target: ".tabs", title: "Inside an agency", text: "Activity lists its actions; Charts builds charts you can download; Coverage shows what was checked." },
    { view: "e/sec", target: "#items .item", title: "Ratings on every action", text: "Each flagged issue shows clarity and seriousness, each red, orange or yellow, beside the kind of issue. Open “Why flagged” for the trigger words, the reasons and leading cases." },
    { view: "issues", target: ".matrix", title: "Constitutional issues", text: "A grid of clarity against seriousness. Click any square to see those actions." },
    { view: "research", target: "#ask", title: "Research", text: "Ask in plain English or use the filters. Results are ranked, related words count, and weaker matches are kept visible." },
    { view: "coverage", target: "#not", title: "What we do not track", text: "RegHunter is as clear about its gaps as about its findings." },
    { view: "manual", target: ".prose", title: "The manual", text: "Everything in detail. Restart this tour from the account button." },
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
      const left = Math.min(Math.max(8, r.left), window.innerWidth - cw - 8);
      Object.assign(card.style, { top: top + "px", left: left + "px" });
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
    $("#view").innerHTML = `<p class="muted">Loading…</p>`;
    await loadSince();
    Object.keys(coverageCache).forEach((k) => delete coverageCache[k]);
    await route();
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
    $("#since-date").addEventListener("change", async (e) => { if (!e.target.value) return; setSinceManual(e.target.value); await refresh(); });
    $("#caught-up").addEventListener("click", async () => {
      const now = new Date().toISOString();
      sset(sessionStorage, K.session, { user: state.user, baseline: now });
      const all = profiles(); all[state.user] = { ...(all[state.user] || {}), lastVisit: now }; sset(localStorage, K.profiles, all);
      setSinceFromVisit(now); $("#since-pop").hidden = true; await refresh();
    });
    $("#account-copy").addEventListener("click", async () => { const t = $("#account-sync"); t.select(); try { await navigator.clipboard.writeText(t.value); $("#account-copy").textContent = "Copied"; } catch (e) { /* the text stays selected for manual copying */ } });
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
    const current = sget(localStorage, K.current, null) || sget(localStorage, OLD.current, null);
    if (current) { signIn(current); await refresh(); }
    else { setSinceFromVisit(null); updateBar(); await route(); $("#welcome").hidden = false; $("#welcome-name").focus(); }
  }

  window.RegHunter = { state, route };   // for debugging in the browser console
  init();
})();
