/* Agency Tracker - static front end. No external libraries; all data comes from ./data. */
(function () {
  "use strict";

  const STORE_KEY = "agencyTracker.profiles";
  const CURRENT_KEY = "agencyTracker.current";
  const SESSION_KEY = "agencyTracker.session";
  const LATE_LOOKBACK_DAYS = 14;   // also scan this many earlier days for items that arrived late
  const MAX_DAYS = 400;
  const CAT_ORDER = ["rulemaking", "enforcement", "adjudication", "other"];
  const PRIORITY = { 3: "high", 2: "medium", 1: "low" };

  const state = {
    index: null, items: [], loadedFrom: null,
    user: null, since: null,     // since = {dateFrom: 'YYYY-MM-DD', cutoff: ISO string, mode: 'visit'|'manual'}
    view: "overview", tab: {}, filters: { q: "", flagged: false, structural: false },
    coverageCache: {},
  };

  // ---------------------------------------------------------------- utils
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (/^https:\/\//i.test(u || "") ? u : "#");
  const pad = (n) => String(n).padStart(2, "0");
  const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (day, n) => { const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() + n); return localDay(d); };
  const fmtDay = (day) => day ? new Date(day + "T12:00:00").toLocaleDateString(undefined,
    { month: "short", day: "numeric", year: "numeric" }) : "";
  const fmtTime = (iso) => iso ? new Date(iso).toLocaleString(undefined,
    { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
  const today = () => localDay(new Date());
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

  function storageGet(store, key, fallback) {
    try { const v = store.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function storageSet(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode etc. - app still works */ }
  }

  // --------------------------------------------------------------- profile
  function profiles() { return storageGet(localStorage, STORE_KEY, {}); }

  function signIn(name, imported) {
    const all = profiles();
    const p = all[name] || {};
    if (imported && imported.last && (!p.lastVisit || imported.last > p.lastVisit)) p.lastVisit = imported.last;
    const previous = p.lastVisit || null;
    // The baseline for this session is the previous visit; the new visit time is saved for next time.
    let session = storageGet(sessionStorage, SESSION_KEY, null);
    if (!session || session.user !== name) {
      session = { user: name, baseline: previous };
      storageSet(sessionStorage, SESSION_KEY, session);
      p.lastVisit = new Date().toISOString();
      all[name] = p;
      storageSet(localStorage, STORE_KEY, all);
    }
    storageSet(localStorage, CURRENT_KEY, name);
    state.user = name;
    setSinceFromVisit(session.baseline);
  }

  function setSinceFromVisit(baselineIso) {
    if (baselineIso) {
      const d = new Date(baselineIso);
      state.since = { dateFrom: addDays(localDay(d), 1), cutoff: baselineIso, mode: "visit", visitDay: localDay(d) };
    } else {
      const from = addDays(today(), -7);
      state.since = { dateFrom: from, cutoff: new Date(from + "T00:00:00").toISOString(), mode: "first" };
    }
  }

  function setSinceManual(day) {
    state.since = { dateFrom: day, cutoff: new Date(day + "T00:00:00").toISOString(), mode: "manual" };
  }

  function syncCode() {
    const all = profiles();
    return btoa(unescape(encodeURIComponent(JSON.stringify({ app: "agency-tracker", u: state.user,
      last: (all[state.user] || {}).lastVisit || null }))));
  }
  function readSyncCode(code) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
      if (data.app !== "agency-tracker" || !data.u) throw new Error();
      return data;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------------------ data
  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  }

  async function loadIndex() {
    try { state.index = await fetchJson("data/index.json"); }
    catch (e) { state.index = null; }
  }

  async function loadItems() {
    if (!state.index) { state.items = []; return; }
    const from = addDays(state.since.dateFrom, -LATE_LOOKBACK_DAYS);
    let days = Object.keys(state.index.days || {}).filter((d) => d >= from).sort();
    state.truncated = days.length > MAX_DAYS;
    if (state.truncated) days = days.slice(-MAX_DAYS);
    const results = await Promise.all(days.map((d) => fetchJson(`data/days/${d}.json`).catch(() => ({ items: [] }))));
    const all = [];
    results.forEach((r) => (r.items || []).forEach((it) => all.push(it)));
    state.items = all.filter(isNew);
    state.coverageCache = {};
  }

  function isNew(it) {
    if (it.date && it.date >= state.since.dateFrom) return true;
    return !!(it.first_seen && it.first_seen > state.since.cutoff);
  }

  // ------------------------------------------------------------- selection
  const agencyList = () => (state.index ? state.index.agencies : []);
  const corpList = () => (state.index ? state.index.corporations : []);
  function scopeItems(scope) {
    if (scope.type === "agency") return state.items.filter((i) => (i.agencies || []).includes(scope.key) && !i.corporation);
    if (scope.type === "corp") return state.items.filter((i) => i.corporation === scope.key);
    return state.items;
  }
  function applyFilters(items) {
    const q = state.filters.q.trim().toLowerCase();
    return items.filter((i) => {
      if (state.filters.flagged && !(i.flags || []).length) return false;
      if (state.filters.structural && !(i.flags || []).some((f) => f.structural)) return false;
      if (q && !`${i.title} ${i.summary} ${i.action}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }
  const byPriority = (a, b) => (b.priority || 0) - (a.priority || 0) || (b.date || "").localeCompare(a.date || "");

  // -------------------------------------------------------------- coverage
  function sourcesFor(agencyKey) {
    const map = (state.index && state.index.source_agencies) || {};
    return Object.keys(map).filter((s) => map[s].includes(agencyKey));
  }
  function sourceLabel(src) {
    const s = state.index.sources && state.index.sources[src];
    return (s && s.label) || src;
  }

  /** For one source+agency, classify each day from dateFrom to today. */
  function coverage(src, agencyKey) {
    const key = src + "|" + agencyKey;
    if (state.coverageCache[key]) return state.coverageCache[key];
    const rank = { ok: 4, partial: 3, failed: 2, skipped: 1 };
    const best = {}; const detail = {};
    let checkedThrough = null;
    (state.index.runs || []).forEach((run) => {
      const rep = (run.reports || []).find((r) => r.source === src);
      if (!rep) return;
      let st = rep.status === "skipped" ? "skipped"
        : String((rep.agencies || {})[agencyKey] || (rep.status === "ok" ? "ok" : rep.status));
      const kind = st.startsWith("ok") ? "ok" : st.startsWith("partial") ? "partial"
        : st.startsWith("skipped") ? "skipped" : "failed";
      if (kind === "ok" || kind === "partial") checkedThrough = !checkedThrough || run.end > checkedThrough ? run.end : checkedThrough;
      for (let d = run.start < state.since.dateFrom ? state.since.dateFrom : run.start; d <= run.end; d = addDays(d, 1)) {
        const k = kind === "partial" && rep.covered_from && d >= rep.covered_from ? "ok" : kind;
        if (!best[d] || rank[k] > rank[best[d]]) { best[d] = k; detail[d] = k === "ok" ? "" : (rep.detail || st); }
      }
    });
    const problems = [];
    const end = today();
    for (let d = state.since.dateFrom; d <= end; d = addDays(d, 1)) {
      const kind = best[d] || (checkedThrough && d > checkedThrough ? "pending" : "unchecked");
      if (kind === "ok") continue;
      const last = problems[problems.length - 1];
      if (last && last.kind === kind && last.to === addDays(d, -1)) last.to = d;
      else problems.push({ kind, from: d, to: d, detail: detail[d] || "" });
    }
    const result = { checkedThrough, problems };
    state.coverageCache[key] = result;
    return result;
  }

  const KIND_TEXT = {
    partial: "only partly checked", failed: "could not be checked (error)", skipped: "not checked (turned off)",
    unchecked: "not checked (no run covered these days)", pending: "not checked yet (next daily run)",
  };
  function rangeText(p) { return p.from === p.to ? fmtDay(p.from) : `${fmtDay(p.from)} – ${fmtDay(p.to)}`; }

  function coverageList(agencyKey, onlySources) {
    return (onlySources || sourcesFor(agencyKey)).map((src) => {
      const c = coverage(src, agencyKey);
      const serious = c.problems.filter((p) => p.kind !== "pending");
      const status = serious.length === 0 ? (c.checkedThrough ? "ok" : "skipped")
        : serious.every((p) => p.kind === "skipped") ? "skipped" : serious.some((p) => p.kind === "failed" || p.kind === "unchecked") ? "failed" : "partial";
      const label = { ok: "checked", partial: "partly checked", failed: "gaps", skipped: "not checked" }[status];
      const lines = serious.map((p) => `<div class="gap">${esc(rangeText(p))}: ${esc(KIND_TEXT[p.kind])}${p.detail ? " – " + esc(p.detail) : ""}</div>`).join("");
      const through = c.checkedThrough ? ` <span class="muted">(checked through ${esc(fmtDay(c.checkedThrough))})</span>` : "";
      return `<li><strong>${esc(sourceLabel(src))}</strong> <span class="status ${status}">${label}</span>${through}${lines}</li>`;
    }).join("");
  }

  // --------------------------------------------------------------- render
  function badge(p) { return `<span class="badge ${PRIORITY[p]}">${PRIORITY[p][0].toUpperCase() + PRIORITY[p].slice(1)}</span>`; }

  function itemHtml(it, opts) {
    const flags = it.flags || [];
    const badges = flags.map((f) => `<span class="badge ${f.priority}" title="${esc(f.structural ? "Structural" : "Substantive rights")}">${esc(f.label)}</span>`).join("");
    const whereAgency = opts && opts.showAgency ? `<span>${esc(agencyNames(it))}</span>` : "";
    const deadline = it.comments_close && it.comments_close >= today()
      ? `<span class="deadline">Comments due ${esc(fmtDay(it.comments_close))}</span>` : "";
    const sig = it.significant ? `<span class="badge neutral">Significant rule</span>` : "";
    const why = flags.length ? `<details class="why"><summary>Why flagged?</summary>${flags.map((f) => `
      <div class="flag-detail">${badge({ high: 3, medium: 2, low: 1 }[f.priority])} <strong>${esc(f.label)}</strong>
        <span class="muted">(${f.structural ? "structural" : "substantive rights"})</span>
        <div>${esc(f.why)}</div>
        <div class="trig">Triggered by: ${f.triggers.map((t) => `“${esc(t)}”`).join(", ")}</div>
        <div class="trig">Starting points: ${f.authorities.map(esc).join("; ")}</div>
      </div>`).join("")}
      <p class="disclaimer">Automated screen of the title and summary only. A flag marks an arguable issue worth a look; it is not a legal conclusion.</p></details>` : "";
    const summary = it.summary ? `<p class="summary-text">${esc(it.summary.length > 420 ? it.summary.slice(0, 420) + "…" : it.summary)}</p>` : "";
    return `<div class="item p${it.priority || 0}">
      <a class="title" href="${esc(safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title || "(untitled)")}</a>
      <div class="meta"><span>${esc(fmtDay(it.date))}</span><span>${esc(it.subcategory || it.doc_type)}</span>
        <span>Source: ${esc(it.source_label)}</span>${whereAgency}${deadline}</div>
      ${summary}
      ${badges || sig ? `<div class="badges">${sig}${badges}</div>` : ""}
      ${why}</div>`;
  }

  function agencyNames(it) {
    if (it.corporation) { const c = corpList().find((x) => x.key === it.corporation); return c ? c.name : it.corporation; }
    return (it.agencies || []).map((k) => { const a = [...agencyList(), state.index.president].find((x) => x.key === k); return a ? a.short : k; }).join(", ");
  }

  function filtersHtml() {
    return `<div class="filters" id="filters">
      <input type="search" id="f-q" placeholder="Search titles and summaries" value="${esc(state.filters.q)}">
      <label><input type="checkbox" id="f-flagged" ${state.filters.flagged ? "checked" : ""}> Flagged only</label>
      <label><input type="checkbox" id="f-structural" ${state.filters.structural ? "checked" : ""}> Structural flags only</label>
    </div>`;
  }

  function notFoundHtml(what, catKey, agencyKey, hadItemsBeforeFilter, onlySources) {
    const notes = (state.index.coverage_notes || {})[catKey] || "";
    if (hadItemsBeforeFilter) {
      return `<div class="notfound"><h3>Nothing matches your filters</h3><p>There are items here, but none match the search or checkboxes above.</p></div>`;
    }
    return `<div class="notfound">
      <h3>No ${esc(what)} found since ${esc(fmtDay(state.since.dateFrom))}</h3>
      <p>Searched:</p><ul class="sources">${coverageList(agencyKey, onlySources)}</ul>
      ${notes ? `<p><strong>What these sources can and cannot show:</strong> ${esc(notes)}</p>` : ""}
      <p class="muted">“Not found” means nothing was published in the sources above for these dates. It does not prove that nothing happened.</p>
    </div>`;
  }

  function header(title, sub) {
    return `<h1>${esc(title)}</h1><p class="subtitle">${sub}</p>`;
  }
  function sinceText() {
    const s = state.since;
    if (s.mode === "visit") return `New since your last visit on ${esc(fmtTime(s.cutoff))}.`;
    if (s.mode === "first") return `Welcome! Showing the last 7 days. From now on, you will see what is new since your previous visit.`;
    return `Showing everything since ${esc(fmtDay(s.dateFrom))}.`;
  }

  function renderOverview() {
    const items = state.items;
    const flagged = items.filter((i) => (i.flags || []).length);
    const high = items.filter((i) => i.priority === 3);
    const structural = flagged.filter((i) => i.flags.some((f) => f.structural));
    const rows = [...agencyList(), state.index.president].map((a) => {
      const list = scopeItems({ type: "agency", key: a.key });
      const counts = CAT_ORDER.concat(["presidential"]).map((c) => list.filter((i) => i.category === c).length);
      const hi = list.filter((i) => i.priority === 3).length;
      return `<tr><td><a href="#agency/${esc(a.key)}">${esc(a.name)}</a></td>
        <td class="num">${list.length}</td><td class="num">${counts[0]}</td><td class="num">${counts[1]}</td>
        <td class="num">${counts[2]}</td><td class="num">${hi ? `<span class="badge high">${hi}</span>` : "0"}</td></tr>`;
    }).join("");
    const corpRows = corpList().map((c) => {
      const list = scopeItems({ type: "corp", key: c.key });
      const hi = list.filter((i) => i.priority === 3).length;
      return `<tr><td><a href="#corp/${esc(c.key)}">${esc(c.name)}</a></td><td class="num">${list.length}</td>
        <td class="num">${hi ? `<span class="badge high">${hi}</span>` : "0"}</td></tr>`;
    }).join("");

    // What was NOT found / not checked
    const empties = [];
    agencyList().forEach((a) => {
      const list = scopeItems({ type: "agency", key: a.key });
      const missing = CAT_ORDER.slice(0, 3).filter((c) => !list.some((i) => i.category === c)).map((c) => state.index.categories[c]);
      if (missing.length) empties.push(`<li><a href="#agency/${esc(a.key)}">${esc(a.short)}</a>: no ${esc(missing.join(", ").toLowerCase())} items</li>`);
    });
    const gaps = [];
    Object.keys(state.index.sources || {}).forEach((src) => {
      const keys = (state.index.source_agencies || {})[src] || [];
      const grouped = {};   // identical problems across agencies are listed once
      keys.forEach((k) => coverage(src, k).problems.filter((p) => p.kind !== "pending").forEach((p) => {
        const sig = `${p.kind}|${p.from}|${p.to}|${p.detail}`;
        (grouped[sig] = grouped[sig] || { p, agencies: [] }).agencies.push(k);
      }));
      Object.values(grouped).forEach(({ p, agencies }) => {
        const who = agencies.length === keys.length ? "" : ` (${agencies.map((k) => k.toUpperCase()).join(", ")})`;
        gaps.push(`<li><strong>${esc(sourceLabel(src))}</strong>${esc(who)}: ${esc(rangeText(p))} ${esc(KIND_TEXT[p.kind])}${p.detail ? " – " + esc(p.detail) : ""}</li>`);
      });
    });

    const top = high.concat(items.filter((i) => i.priority === 2)).sort(byPriority).slice(0, 12);
    return header("Since you last checked", sinceText()) + `
      <div class="stats" id="ov-stats">
        <div class="stat"><div class="n">${items.length}</div><div class="l">new items</div></div>
        <div class="stat"><div class="n">${high.length}</div><div class="l">high-priority flags</div></div>
        <div class="stat"><div class="n">${structural.length}</div><div class="l">items with structural flags</div></div>
        <div class="stat"><div class="n">${items.filter((i) => i.category === "rulemaking" && i.subcategory === "Final rule").length}</div><div class="l">final rules</div></div>
      </div>
      <h2>Top flagged items</h2>
      ${top.length ? top.map((i) => itemHtml(i, { showAgency: true })).join("") + `<p><a href="#flags">See all ${plural(flagged.length, "flagged item")} →</a></p>`
        : `<div class="notfound"><p>No high- or medium-priority constitutional flags in this period.</p></div>`}
      <h2>By agency</h2>
      <table class="summary"><thead><tr><th>Agency</th><th class="num">Total</th><th class="num">Rulemaking</th>
        <th class="num">Enforcement</th><th class="num">Adjudication</th><th class="num">High flags</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>Agency-controlled corporations</h2>
      <table class="summary"><thead><tr><th>Corporation</th><th class="num">Items</th><th class="num">High flags</th></tr></thead><tbody>${corpRows}</tbody></table>
      <h2>What we did not find, and what we could not check</h2>
      <div class="panel" id="ov-notfound">
        <h3>Problems checking sources</h3>
        ${gaps.length ? `<ul class="sources">${gaps.join("")}</ul>` : `<p>None. Every enabled source was checked for these dates.</p>`}
        <h3>Empty categories</h3>
        ${empties.length ? `<ul class="sources">${empties.join("")}</ul>` : "<p>Every agency had items in each main category.</p>"}
        <p class="muted">Empty does not mean nothing happened; see <a href="#coverage">What we checked</a> for each source's limits.</p>
      </div>`;
  }

  function renderList(title, sub, scope, catKeys) {
    const all = scopeItems(scope);
    const tabKey = scope.type + ":" + scope.key;
    const cats = catKeys.filter((c) => c);
    let current = state.tab[tabKey] || cats[0];
    if (!cats.includes(current)) current = cats[0];
    const counts = Object.fromEntries(cats.map((c) => [c, all.filter((i) => c === "all" || i.category === c).length]));
    const flaggedCounts = Object.fromEntries(cats.map((c) => [c, all.filter((i) => (c === "all" || i.category === c) && i.priority === 3).length]));
    const tabs = cats.length > 1 ? `<div class="tabs" id="cat-tabs">${cats.map((c) => `<button type="button" data-tab="${c}" class="${c === current ? "active" : ""}">
      ${esc(c === "all" ? "All" : state.index.categories[c])}<span class="count ${flaggedCounts[c] ? "hot" : ""}">${counts[c]}</span></button>`).join("")}</div>` : "";
    const inCat = all.filter((i) => current === "all" || i.category === current);
    const shown = applyFilters(inCat).sort(byPriority);
    const coverageKey = scope.type === "corp" ? "sec" : scope.key;
    const what = (current === "all" ? "items" : state.index.categories[current].toLowerCase() + " items");
    const body = shown.length ? shown.map((i) => itemHtml(i)).join("") : notFoundHtml(what, current, coverageKey, inCat.length > 0,
      scope.type === "corp" ? ["federal_register"] : null);
    const corpNote = scope.type === "agency" && scope.key === "sec"
      ? `<p class="muted">Filings by FINRA, PCAOB, MSRB and exchanges are shown under <a href="#corp/finra">Agency-controlled corporations</a>.</p>` : "";
    state.tab[tabKey] = current;
    return header(title, sub) + corpNote + tabs + filtersHtml() + `<div id="items">${body}</div>`;
  }

  function renderFlags() {
    const items = applyFilters(state.items.filter((i) => (i.flags || []).length)).sort(byPriority);
    return header("Constitutional flags", `${sinceText()} Structural issues are ranked first.`) + filtersHtml() +
      (items.length ? items.map((i) => itemHtml(i, { showAgency: true })).join("")
        : `<div class="notfound"><h3>No flagged items in this period</h3><p>The automated screen found no wording associated with constitutional issues in the items collected since ${esc(fmtDay(state.since.dateFrom))}. This is a keyword screen of titles and summaries, so an unflagged item can still raise issues.</p></div>`);
  }

  function renderCoverage() {
    const srcs = Object.entries(state.index.sources || {}).map(([k, s]) => `<tr><td>${esc(s.label)}</td>
      <td><span class="status ${esc(s.last_status)}">${esc(s.last_status)}</span></td><td>${esc(fmtTime(s.last_attempt))}</td>
      <td>${esc(s.covered_through ? fmtDay(s.covered_through) : "never")}</td><td>${esc(s.last_detail || "")}</td></tr>`).join("");
    const notes = Object.entries(state.index.coverage_notes || {}).map(([k, v]) =>
      `<li><strong>${esc(state.index.categories[k])}:</strong> ${esc(v)}</li>`).join("");
    const perAgency = [...agencyList(), state.index.president].map((a) => `<h3>${esc(a.name)}</h3><ul class="sources">${coverageList(a.key)}</ul>`).join("");
    const runs = (state.index.runs || []).slice(-10).reverse().map((r) => `<tr><td>${esc(fmtTime(r.run_at))}</td>
      <td>${esc(fmtDay(r.start))} – ${esc(fmtDay(r.end))}</td><td class="num">${r.items_new ?? ""}</td><td class="num">${r.requests ?? ""}</td></tr>`).join("");
    return header("What we checked", "Every source, when it was last checked, and the limits of each kind of search.") + `
      <table class="summary" id="cov-sources"><thead><tr><th>Source</th><th>Last result</th><th>Last attempt</th><th>Checked through</th><th>Notes</th></tr></thead><tbody>${srcs || '<tr><td colspan="5">No runs yet.</td></tr>'}</tbody></table>
      <h2>Limits of each category</h2><ul class="sources">${notes}</ul>
      <h2>Not tracked in this version</h2>
      <ul class="sources"><li>Agency websites' own press releases and enforcement pages (other than the SEC feeds above).</li>
        <li>Individual ALJ and board decisions not published in the Federal Register (for example, most NLRB decisions).</li>
        <li>FINRA's own disciplinary database and website (not read, to respect its terms of use). FINRA matters appear only when the SEC publishes them.</li>
        <li>Agencies other than the ones listed in the sidebar.</li></ul>
      <h2>Coverage by agency since ${esc(fmtDay(state.since.dateFrom))}</h2>${perAgency}
      <h2>Recent runs</h2>
      <table class="summary"><thead><tr><th>Run</th><th>Dates checked</th><th class="num">New items</th><th class="num">Requests</th></tr></thead><tbody>${runs || '<tr><td colspan="4">No runs yet.</td></tr>'}</tbody></table>`;
  }

  function renderEmptyData() {
    return `<div class="empty-state"><img src="logo.svg" alt="" width="72" height="72">
      <h1>No data yet</h1><p>The daily collector has not run yet, or its first results have not been published.
      Once it runs (each morning, or when started by hand from the repository's Actions tab), this page will fill in.</p>
      <p><a href="#manual">Read the user manual</a> · <a href="#tutorial">Take the tutorial</a></p></div>`;
  }

  // ------------------------------------------------------------------- nav
  function renderNav() {
    const count = (list) => { const hi = list.filter((i) => i.priority === 3).length;
      return `<span class="count ${hi ? "hot" : ""}" title="${hi ? hi + " high-priority" : ""}">${list.length}</span>`; };
    $("#nav-agencies").innerHTML = agencyList().map((a) =>
      `<a href="#agency/${esc(a.key)}" data-nav="agency/${esc(a.key)}"><span>${esc(a.short)}</span>${count(scopeItems({ type: "agency", key: a.key }))}</a>`).join("");
    const p = state.index ? state.index.president : null;
    $("#nav-president").innerHTML = p ? `<a href="#agency/president" data-nav="agency/president"><span>Presidential documents</span>${count(scopeItems({ type: "agency", key: "president" }))}</a>` : "";
    $("#nav-corps").innerHTML = corpList().map((c) =>
      `<a href="#corp/${esc(c.key)}" data-nav="corp/${esc(c.key)}"><span>${esc(c.key === "other_sro" ? "Other SROs" : c.key.toUpperCase())}</span>${count(scopeItems({ type: "corp", key: c.key }))}</a>`).join("");
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("active", a.dataset.nav === state.view));
  }

  function render() {
    const view = state.view;
    let html;
    if (view === "manual") html = $("#manual-template").innerHTML;
    else if (!state.index || !(state.index.runs || []).length) html = renderEmptyData();
    else if (view === "flags") html = renderFlags();
    else if (view === "coverage") html = renderCoverage();
    else if (view.startsWith("agency/")) {
      const key = view.slice(7);
      const a = [...agencyList(), state.index.president].find((x) => x.key === key);
      html = a ? renderList(a.name, sinceText(), { type: "agency", key },
        key === "president" ? ["presidential"] : ["all", ...CAT_ORDER]) : renderOverview();
    } else if (view.startsWith("corp/")) {
      const key = view.slice(5);
      const c = corpList().find((x) => x.key === key);
      html = c ? renderList(c.name, `Supervised by the ${esc(c.overseer)}. ${sinceText()}`, { type: "corp", key }, ["all", "rulemaking", "enforcement"]) : renderOverview();
    } else html = renderOverview();
    $("#view").innerHTML = html;
    renderNav();
    bindViewEvents();
  }

  function bindViewEvents() {
    document.querySelectorAll("#cat-tabs [data-tab]").forEach((b) => b.addEventListener("click", () => {
      state.tab[state.view.replace("/", ":")] = b.dataset.tab; render();
    }));
    const q = $("#f-q");
    if (q) {
      q.addEventListener("input", () => { state.filters.q = q.value; const pos = q.selectionStart; render(); const nq = $("#f-q"); nq.focus(); nq.setSelectionRange(pos, pos); });
      $("#f-flagged").addEventListener("change", (e) => { state.filters.flagged = e.target.checked; render(); });
      $("#f-structural").addEventListener("change", (e) => { state.filters.structural = e.target.checked; render(); });
    }
  }

  function route() {
    const h = decodeURIComponent(location.hash.replace(/^#/, "")) || (getMode() === "research" ? "research/sanctions" : "overview");
    const research = h.startsWith("research");
    setMode(research ? "research" : "classic");
    if (research && window.AgencyResearch) {
      state.view = h.split("?")[0];
      renderNav();
      window.AgencyResearch.render(h);
      return;
    }
    if (h === "tutorial") { state.view = "overview"; render(); startTour(); return; }
    state.view = h;
    render();
    window.scrollTo(0, 0);
  }

  // ------------------------------------------------------------- tutorial
  const TOUR = [
    { view: "overview", target: "#ov-stats", title: "Your summary",
      text: "Each time you open Agency Tracker, this page summarizes everything published since your last visit." },
    { view: "overview", target: "#since-box", title: "Choose the period",
      text: "This date controls every page. Change it to review any period, or click “Mark all as read” to start fresh." },
    { view: "overview", target: "#nav-agencies", title: "One tab per agency",
      text: "Click an agency to see only its actions. The number is how many new items it has; red means a high-priority flag." },
    { view: "agency/sec", target: "#cat-tabs", title: "Types of action",
      text: "Inside each agency, switch between Rulemaking, Enforcement, Adjudication & licensing, and Other notices." },
    { view: "agency/sec", target: "#filters", title: "Search and filter",
      text: "Search the titles, or show only flagged items, or only structural constitutional flags." },
    { view: "agency/sec", target: "#items", title: "Items and flags",
      text: "Each title links to the official document. Colored labels are constitutional flags; click “Why flagged?” for the trigger words and leading cases. Empty tabs explain what was searched and what could not be seen." },
    { view: "flags", target: "[data-nav='flags']", title: "All flags in one place",
      text: "This page lists every flagged item, with structural issues such as in-house ALJ adjudication ranked first." },
    { view: "corp/finra", target: "#nav-corps", title: "Agency-controlled corporations",
      text: "FINRA, PCAOB, MSRB and other SEC-supervised self-regulatory organizations have their own section." },
    { view: "coverage", target: "[data-nav='coverage']", title: "What we checked",
      text: "See every source, the dates it covered, any failures, and what each source cannot show." },
    { view: "coverage", target: "#user-box", title: "Your account",
      text: "Your username is kept in this browser. The Account button gives you a sync code to use on another device." },
    { view: "manual", target: "[data-nav='manual']", title: "Need more help?",
      text: "The user manual explains everything in detail. You can restart this tutorial at any time from the sidebar." },
  ];
  let tourStep = 0;

  function startTour() { tourStep = 0; $("#tour").hidden = false; showTourStep(); }
  function endTour() { $("#tour").hidden = true; if (location.hash === "#tutorial") history.replaceState(null, "", "#" + state.view); }
  function showTourStep() {
    const step = TOUR[tourStep];
    if (state.view !== step.view) { state.view = step.view; render(); }
    const el = $(step.target) || $("#view");
    el.scrollIntoView({ block: "center", behavior: "instant" });
    $("#tour-step").textContent = `Step ${tourStep + 1} of ${TOUR.length}`;
    $("#tour-title").textContent = step.title;
    $("#tour-text").textContent = step.text;
    $("#tour-back").disabled = tourStep === 0;
    $("#tour-next").textContent = tourStep === TOUR.length - 1 ? "Finish" : "Next";
    requestAnimationFrame(() => positionTour(el));
  }
  function positionTour(el) {
    const r = el.getBoundingClientRect();
    const spot = $("#tour-spot"); const card = $("#tour-card");
    const padPx = 6;
    const h = Math.min(r.height, window.innerHeight - 40);
    Object.assign(spot.style, { top: r.top - padPx + "px", left: r.left - padPx + "px", width: r.width + padPx * 2 + "px", height: h + padPx * 2 + "px" });
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let top = r.top + h + 16;
    if (top + ch > window.innerHeight - 8) top = r.top - ch - 16;
    if (top < 8) top = Math.max(8, window.innerHeight - ch - 16);
    let left = Math.min(Math.max(8, r.left), window.innerWidth - cw - 8);
    if (r.width < 300 && r.right + cw + 24 < window.innerWidth && (r.top + ch < window.innerHeight)) { left = r.right + 16; top = Math.max(8, r.top); }
    Object.assign(card.style, { top: top + "px", left: left + "px" });
  }

  // ----------------------------------------------------------------- modes
  function getMode() { return storageGet(localStorage, "agencyTracker.mode", "classic"); }
  function setMode(mode) {
    storageSet(localStorage, "agencyTracker.mode", mode);
    document.body.classList.toggle("mode-research", mode === "research");
    document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }

  /** All items on or after `from` (or all history), ignoring "since last visit". Cached. */
  const rangeCache = {};
  async function loadRange(from) {
    if (!state.index) return [];
    const days = Object.keys(state.index.days || {}).filter((d) => !from || d >= from).sort().slice(-MAX_DAYS);
    const missing = days.filter((d) => !rangeCache[d]);
    const loaded = await Promise.all(missing.map((d) => fetchJson(`data/days/${d}.json`).catch(() => ({ items: [] }))));
    missing.forEach((d, i) => { rangeCache[d] = loaded[i].items || []; });
    return days.flatMap((d) => rangeCache[d]);
  }

  window.AgencyTracker = {
    get index() { return state.index; }, get user() { return state.user; },
    esc, safeUrl, fmtDay, addDays, today, plural, itemHtml, agencyNames, loadRange,
    storageGet: (k, f) => storageGet(localStorage, k, f), storageSet: (k, v) => storageSet(localStorage, k, v),
  };

  // ---------------------------------------------------------------- setup
  function showWelcome() {
    $("#welcome").hidden = false;
    $("#welcome-name").focus();
  }
  function bindChrome() {
    window.addEventListener("hashchange", route);
    document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      location.hash = b.dataset.mode === "research" ? "#research/sanctions" : "#overview";
    }));
    window.addEventListener("resize", () => { if (!$("#tour").hidden) showTourStep(); });

    $("#welcome-go").addEventListener("click", async () => {
      const code = $("#welcome-sync").value.trim();
      let name = $("#welcome-name").value.trim();
      let imported = null;
      if (code) {
        imported = readSyncCode(code);
        if (!imported) { $("#welcome-error").textContent = "That sync code was not recognized."; $("#welcome-error").hidden = false; return; }
        name = name || imported.u;
      }
      if (!name) { $("#welcome-error").textContent = "Please enter a username."; $("#welcome-error").hidden = false; return; }
      $("#welcome").hidden = true;
      signIn(name, imported);
      await refresh();
      if (!imported && !storageGet(localStorage, "agencyTracker.tourSeen", false)) {
        storageSet(localStorage, "agencyTracker.tourSeen", true);
        if (state.index && (state.index.runs || []).length) startTour();
      }
    });
    $("#welcome-name").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#welcome-go").click(); });

    $("#since-date").addEventListener("change", async (e) => {
      if (!e.target.value) return;
      setSinceManual(e.target.value);
      await refresh();
    });
    $("#caught-up").addEventListener("click", async () => {
      const now = new Date().toISOString();
      storageSet(sessionStorage, SESSION_KEY, { user: state.user, baseline: now });
      const all = profiles(); all[state.user] = { ...(all[state.user] || {}), lastVisit: now }; storageSet(localStorage, STORE_KEY, all);
      setSinceFromVisit(now);
      await refresh();
    });
    $("#user-menu-btn").addEventListener("click", () => {
      $("#account-name").textContent = state.user;
      $("#account-sync").value = syncCode();
      $("#account").hidden = false;
    });
    $("#account-close").addEventListener("click", () => { $("#account").hidden = true; });
    $("#account-copy").addEventListener("click", async () => {
      const ta = $("#account-sync"); ta.select();
      try { await navigator.clipboard.writeText(ta.value); $("#account-copy").textContent = "Copied"; }
      catch (e) { document.execCommand && document.execCommand("copy"); }
    });
    $("#account-switch").addEventListener("click", () => {
      $("#account").hidden = true;
      try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(CURRENT_KEY); } catch (e) { /* ignore */ }
      $("#welcome-name").value = ""; $("#welcome-sync").value = "";
      showWelcome();
    });
    $("#tour-next").addEventListener("click", () => { if (tourStep < TOUR.length - 1) { tourStep++; showTourStep(); } else endTour(); });
    $("#tour-back").addEventListener("click", () => { if (tourStep > 0) { tourStep--; showTourStep(); } });
    $("#tour-exit").addEventListener("click", endTour);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#tour").hidden) endTour(); });
  }

  async function refresh() {
    $("#user-name").textContent = state.user ? `Hello, ${state.user}` : "";
    $("#since-date").value = state.since.mode === "visit" ? state.since.visitDay : state.since.dateFrom;
    $("#view").innerHTML = `<p class="muted">Loading…</p>`;
    await loadItems();
    route();
  }

  async function init() {
    bindChrome();
    await loadIndex();
    const current = storageGet(localStorage, CURRENT_KEY, null);
    if (current) { signIn(current); await refresh(); }
    else { setSinceFromVisit(null); renderNav(); state.view = "manual"; render(); showWelcome(); }
  }

  init();
})();
