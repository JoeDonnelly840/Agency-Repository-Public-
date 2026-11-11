/* Agency Tracker - Research mode.
 * Two tools that search the full stored history:
 *   #research/sanctions  - pick types of sanction; results grouped by agency
 *   #research/ask        - describe what you want in plain English; the app interprets it and builds a report
 * Everything runs in the browser. Classic mode (app.js) is unchanged; this file only uses window.AgencyTracker.
 */
(function () {
  "use strict";
  const AT = () => window.AgencyTracker;

  // ------------------------------------------------------------------ vocab
  const SANCTIONS = [
    { key: "fines", short: "Fines", label: "Fines & civil money penalties",
      rx: /\b(?:civil (?:money |monetary )?penalt|monetary penalt|penalt(?:y|ies) of \$|fined\b|fines\b|assess(?:es|ed|ing)? (?:a |civil )?penalt)/i,
      words: ["fine", "fines", "fined", "civil money penalties", "civil money penalty", "civil monetary penalties", "money penalty", "money penalties", "civil penalty", "civil penalties", "monetary penalty", "monetary penalties", "penalty", "penalties"] },
    { key: "disgorgement", short: "Disgorgement", label: "Disgorgement, restitution & redress",
      rx: /\b(?:disgorg|restitution|redress|refunds? to (?:consumers|customers|investors))/i,
      words: ["disgorgement", "disgorge", "restitution", "redress", "refunds"] },
    { key: "bars", short: "Bars & expulsions", label: "Bars & expulsions from the market or industry",
      rx: /\b(?:industry bar|associational bar|penny[- ]stock bar|(?:officer|director)[- ]and[- ](?:officer|director) bar|barr(?:ed|ing) (?:him|her|them|the respondent|from)|bars? (?:him|her|them|from)|permanently barred|expel|expulsion)/i,
      words: ["bar from", "bars from", "barred", "barring", "industry bar", "expel", "expelled", "expulsion", "banned from", "ban from", "kicked out", "access to the market", "market access"] },
    { key: "suspensions", short: "Suspensions", label: "Suspensions (trading, registration, membership)",
      rx: /\b(?:trading suspension|suspension (?:of|from) (?:trading|registration|membership|association|the (?:license|registration|certificate))|suspend(?:ed|s|ing)? (?:trading|the registration|registration|the license|membership)|notice of suspension)/i,
      words: ["suspension", "suspensions", "suspend", "suspended", "trading halt"] },
    { key: "license", short: "License revoked", label: "License, registration or permit revoked or terminated",
      rx: /\b(?:revoc|revok|terminat(?:ion|ed|e|ing) (?:of )?(?:the )?(?:license|registration|permit|certificate|authori[sz]ation)|deregistr|cancel(?:l?ation|l?ed) (?:of )?(?:the )?(?:license|registration|permit)|denial of (?:the )?(?:application|license|registration))/i,
      words: ["revocation", "revoke", "revoked", "revoking", "license", "licenses", "licence", "deregistration", "permit revoked", "registration revoked"] },
    { key: "cease", short: "Cease & desist", label: "Cease-and-desist orders & injunctions",
      rx: /\b(?:cease[- ](?:and|&)[- ]desist|injunct|order to (?:stop|halt|cease))/i,
      words: ["cease and desist", "cease-and-desist", "injunction", "injunctions", "injunctive"] },
    { key: "debarment", short: "Debarment", label: "Debarment & exclusion from government programs",
      rx: /\b(?:debar|exclusion from (?:participation|federal|medicare|medicaid)|excluded from (?:participation|federal))/i,
      words: ["debarment", "debar", "debarred", "exclusion", "excluded from"] },
    { key: "consent", short: "Consent & settlements", label: "Consent orders, decrees & settlements",
      rx: /\b(?:consent (?:order|decree|agreement)|settle(?:ment|d)\b|agreement containing consent)/i,
      words: ["consent order", "consent orders", "consent decree", "consent decrees", "settlement", "settlements", "settled"] },
    { key: "forfeiture", short: "Forfeiture", label: "Forfeiture & seizure",
      rx: /\b(?:forfeit|seiz(?:ure|ed|e)\b)/i, words: ["forfeiture", "forfeit", "seizure", "seized"] },
  ];
  const SANCTION_BY_KEY = Object.fromEntries(SANCTIONS.map((s) => [s.key, s]));

  const AGENCY_WORDS = {
    sec: ["sec", "securities and exchange commission", "securities and exchange", "securities & exchange"],
    ftc: ["ftc", "federal trade commission", "trade commission"],
    fcc: ["fcc", "federal communications commission", "communications commission"],
    epa: ["epa", "environmental protection agency", "environmental protection"],
    nlrb: ["nlrb", "national labor relations board", "labor relations board", "labor board"],
    cfpb: ["cfpb", "consumer financial protection bureau", "consumer financial protection", "consumer bureau"],
    dol: ["dol", "department of labor", "labor department", "osha", "wage and hour", "ebsa"],
    fda: ["fda", "food and drug administration", "food and drug"],
    hhs: ["hhs", "health and human services", "cms", "medicare", "medicaid", "cdc"],
    ferc: ["ferc", "federal energy regulatory commission", "energy regulatory commission"],
    president: ["the president", "president", "white house", "presidential"],
  };
  const CORP_WORDS = {
    finra: ["finra", "financial industry regulatory authority"],
    pcaob: ["pcaob", "accounting oversight board"],
    msrb: ["msrb", "municipal securities rulemaking board"],
    other_sro: ["stock exchanges", "exchanges", "nasdaq", "nyse", "cboe", "clearing agencies", "clearing agency"],
    "*": ["self-regulatory organizations", "self-regulatory organization", "sros", "sro", "agency-controlled corporations", "corporations"],
  };
  const ISSUE_WORDS = {
    agency_adjudication: ["seventh amendment", "jury trial", "jury", "article iii", "in-house", "administrative proceedings", "administrative proceeding", "jarkesy", "agency adjudication", "alj", "aljs", "administrative law judges", "administrative law judge"],
    officer_appointment_removal: ["appointments clause", "appointment", "appointments", "inferior officer", "lucia", "alj", "aljs", "administrative law judges", "administrative law judge"],
    private_delegation: ["private nondelegation", "private delegation", "private entity", "private entities"],
    private_discipline: ["private discipline", "sro discipline"],
    major_questions: ["major questions", "major question", "nondelegation", "delegation"],
    statutory_deference: ["chevron", "deference", "loper bright", "loper", "statutory interpretation"],
    removal_independence: ["independent agencies", "independent agency", "humphrey", "presidential control", "removal power", "removal protections", "slaughter"],
    spending_appropriations: ["appropriations", "appropriation", "impoundment", "impound", "power of the purse", "spending power"],
    agency_structure_change: ["reorganization", "reorganize", "abolish", "restructuring", "reduction in force", "dismantling"],
    federalism: ["federalism", "preemption", "preempt", "tenth amendment", "commandeering", "spending clause", "states' rights"],
    presidential_lawmaking: ["tariffs", "tariff", "emergency powers", "national emergencies", "national emergency", "emergencies", "emergency", "ieepa"],
    first_amendment: ["first amendment", "free speech", "speech", "religious liberty", "religion", "press freedom"],
    fourth_amendment: ["fourth amendment", "searches", "search", "surveillance", "privacy", "inspections", "warrantless"],
    due_process_takings: ["due process", "takings clause", "takings", "fifth amendment", "property rights"],
    equal_protection: ["equal protection", "race-based", "racial", "dei", "sex-based"],
  };
  const ISSUE_LABELS = {
    agency_adjudication: "Agency adjudication of penalties", officer_appointment_removal: "Appointment or removal of officers",
    private_delegation: "Private corporations exercising government power", private_discipline: "Private corporation discipline",
    major_questions: "Delegation / major questions", statutory_deference: "Agency interpretation of statutes",
    removal_independence: "Presidential control of independent agencies", spending_appropriations: "Spending & appropriations",
    agency_structure_change: "Restructuring agencies", federalism: "Federalism", presidential_lawmaking: "Executive action like legislation",
    first_amendment: "First Amendment", fourth_amendment: "Fourth Amendment", due_process_takings: "Due process & takings",
    equal_protection: "Equal protection",
  };
  const CATEGORY_WORDS = {
    "sub:Proposed rule": ["proposed rules", "proposed rule", "proposals", "nprm"],
    "sub:Final rule": ["final rules", "final rule"],
    rulemaking: ["rule changes", "rule change", "rule filings", "rulemaking", "rulemakings", "regulations", "regulation", "rules", "rule", "guidance"],
    enforcement: ["enforcement actions", "enforcement action", "enforcement"],
    adjudication: ["adjudications", "adjudication", "decisions", "decision", "orders", "adjudicatory", "hearings", "hearing", "licensing", "applications"],
    presidential: ["executive orders", "executive order", "proclamations", "proclamation", "memoranda", "presidential memorandum"],
  };
  const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const STOP = new Set(("a an the of in on for to and or by with about from that which what where when who how show shows me my i im i'm we us our " +
    "all any anything everything find list give get want wanted interested interest information info related regarding involving concerning " +
    "agency agencies federal government has have had did done been being are is was were be their them they there this these those please " +
    "would like see look looking up out new recent recently latest issued published taken against companies company people persons person firms " +
    "firm kind sort type types violation violations under its it can could should also just only more most other than then into over each every " +
    "between since before after during within past last next day days week weeks month months year years ago executive branch do does track " +
    "tracking tell let know report reports items item documents document actions action things thing stuff made making done imposed impose " +
    "imposing issue issues group grouped organize organized sorted table list chart timeline trend trends over time date dates whether any " +
    "constitutional unconstitutional constitution structural separation powers flagged flags flag significant open comment comments deadline " +
    "deadlines period periods today yesterday industry industries market markets access sector business businesses individuals " +
    "entities cases case matters matter anyone someone people's proceedings proceeding may might raise raises raising involve " +
    "involves possibly potentially potential arguably questions question concerns").split(/\s+/));

  // ---------------------------------------------------------------- helpers
  const esc = (s) => AT().esc(s);
  const textOf = (it) => `${it.title || ""} ${it.action || ""} ${it.summary || ""}`;
  const sanctionsOf = (it) => SANCTIONS.filter((s) => s.rx.test(textOf(it))).map((s) => s.key);
  const isAction = (it) => it.category === "enforcement" || it.category === "adjudication" || /^sec_/.test(it.source || "");
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function groupsForItem(it) {
    if (it.corporation) return ["corp:" + it.corporation];
    return (it.agencies || []).map((k) => "agency:" + k);
  }
  function groupName(g) {
    const [kind, key] = g.split(":");
    const idx = AT().index;
    if (kind === "corp") { const c = idx.corporations.find((x) => x.key === key); return c ? c.name : key; }
    const a = [...idx.agencies, idx.president].find((x) => x.key === key);
    return a ? a.name : key;
  }
  function groupShort(g) {
    const [kind, key] = g.split(":");
    if (kind === "corp") return key === "other_sro" ? "Other SROs" : key.toUpperCase();
    const a = [...AT().index.agencies, AT().index.president].find((x) => x.key === key);
    return a ? a.short : key;
  }
  const allGroupKeys = () => [...AT().index.agencies.map((a) => "agency:" + a.key), "agency:president",
    ...AT().index.corporations.map((c) => "corp:" + c.key)];

  function cardHtml(it) {
    const tags = sanctionsOf(it).map((k) => `<span class="badge neutral">${esc(SANCTION_BY_KEY[k].label)}</span>`).join("");
    let html = AT().itemHtml(it, { showAgency: true });
    if (tags) html = html.replace("</a>", `</a><div class="badges" style="margin-top:4px">${tags}</div>`);
    return html;
  }

  function tableHtml(items) {
    return `<table class="summary compact"><thead><tr><th>Date</th><th>Agency</th><th>Title</th><th>Type</th><th>Flags</th></tr></thead><tbody>${
      items.map((it) => `<tr><td style="white-space:nowrap">${esc(AT().fmtDay(it.date))}</td><td>${esc(AT().agencyNames(it))}</td>
        <td><a href="${esc(AT().safeUrl(it.url))}" target="_blank" rel="noopener">${esc(it.title)}</a></td>
        <td>${esc(it.subcategory || it.doc_type)}</td>
        <td>${(it.flags || []).map((f) => `<span class="badge ${f.priority}">${esc(f.label)}</span>`).join(" ")}</td></tr>`).join("")
    }</tbody></table>`;
  }

  function barsHtml(rows, hot) {
    const max = Math.max(1, ...rows.map((r) => r.n));
    return `<div class="bars">${rows.map((r) => `<div class="bar-row"><span class="lbl" title="${esc(r.label)}">${esc(r.label)}</span>
      <span class="track"><span class="fill ${hot ? "hot" : ""}" style="width:${(100 * r.n / max).toFixed(1)}%;display:block"></span></span>
      <span class="n">${r.n}</span></div>`).join("")}</div>`;
  }

  function csv(items) {
    const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const head = ["Date", "Agency or corporation", "Category", "Type", "Title", "Link", "Constitutional flags", "Sanction types", "Source", "Comments due"];
    const rows = items.map((it) => [it.date, AT().agencyNames(it), (AT().index.categories || {})[it.category] || it.category,
      it.subcategory, it.title, it.url, (it.flags || []).map((f) => `${f.label} (${f.priority})`).join("; "),
      sanctionsOf(it).map((k) => SANCTION_BY_KEY[k].label).join("; "), it.source_label, it.comments_close || ""]);
    return [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  function coverageWarnings(needsActions) {
    const idx = AT().index; const out = [];
    Object.values(idx.sources || {}).forEach((s) => {
      if (s.last_status === "skipped") out.push(`${s.label}: ${s.last_detail}`);
      else if (s.last_status === "failed") out.push(`${s.label} failed on its last run: ${s.last_detail}`);
    });
    if (needsActions) out.push(idx.coverage_notes.enforcement);
    return out.length ? `<div class="notfound"><h3>Limits on these results</h3><ul class="sources">${out.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>` : "";
  }

  function params(hash) { return new URLSearchParams(hash.split("?")[1] || ""); }
  function setHash(base, p) {
    const s = p.toString();
    history.replaceState(null, "", "#" + base + (s ? "?" + s : ""));
  }

  // ------------------------------------------------------ sanctions search
  async function renderSanctions(hash) {
    const p = params(hash);
    const chosen = (p.get("types") || "").split(",").filter((k) => SANCTION_BY_KEY[k]);
    const from = p.get("from") || "", to = p.get("to") || "";
    const onlyActions = p.get("all") !== "1";
    const focus = p.get("focus") || "";
    const view = $view();
    view.innerHTML = `<p class="muted">Loading the full history…</p>`;
    const items = (await AT().loadRange(from || null)).filter((it) => !to || (it.date || "") <= to);

    const pick = SANCTIONS.map((s) => `<label class="chip ${chosen.includes(s.key) ? "on" : ""}"><input type="checkbox" data-s="${s.key}" ${chosen.includes(s.key) ? "checked" : ""}>${esc(s.label)}</label>`).join("");
    let html = `<h1>Search by type of sanction</h1>
      <p class="subtitle">Choose the kinds of action you want to track. Results come back grouped by agency. This searches the whole stored history${from || to ? "" : ` (since ${esc(AT().fmtDay(Object.keys(AT().index.days || {}).sort()[0]))})`}.</p>
      <div class="panel"><div class="chips" id="s-pick">${pick}</div>
        <div class="toolbar">
          <button type="button" class="btn ghost small" id="s-all">Select all</button>
          <button type="button" class="btn ghost small" id="s-none">Clear</button>
          <span class="date-range">From <input type="date" id="s-from" value="${esc(from)}"> to <input type="date" id="s-to" value="${esc(to)}"></span>
          <label><input type="checkbox" id="s-only" ${onlyActions ? "checked" : ""}> Only actions against particular parties (enforcement &amp; adjudication)</label>
        </div></div>`;

    if (!chosen.length) {
      html += `<div class="notfound"><h3>Pick at least one type of sanction above</h3><p>For example, tick “Bars &amp; expulsions from the market” and “Fines &amp; civil money penalties”.</p></div>`;
      view.innerHTML = html; bindSanctions(p); return;
    }

    const matches = items.filter((it) => (!onlyActions || isAction(it)) && sanctionsOf(it).some((k) => chosen.includes(k)));
    const groups = allGroupKeys();
    const table = groups.map((g) => {
      const inG = matches.filter((it) => groupsForItem(it).includes(g));
      const cells = chosen.map((k) => {
        const n = inG.filter((it) => sanctionsOf(it).includes(k)).length;
        return `<td class="num">${n ? `<a href="#" data-focus="${esc(g)}|${k}">${n}</a>` : '<span class="zero">0</span>'}</td>`;
      }).join("");
      return { g, n: inG.length, row: `<tr><td><a href="#" data-focus="${esc(g)}|">${esc(groupName(g))}</a></td>${cells}<td class="num"><strong>${inG.length}</strong></td></tr>` };
    });
    const [fg, fk] = focus.split("|");
    const shown = matches.filter((it) => (!fg || groupsForItem(it).includes(fg)) && (!fk || sanctionsOf(it).includes(fk)));
    const hit = table.filter((r) => r.n && (!fg || r.g === fg));
    const empty = table.filter((r) => !r.n).map((r) => groupShort(r.g));

    html += `<h2>${matches.length} matching ${matches.length === 1 ? "action" : "actions"}</h2>
      <div style="overflow-x:auto"><table class="summary matrix"><thead><tr><th>Agency or corporation</th>${chosen.map((k) => `<th class="num" title="${esc(SANCTION_BY_KEY[k].label)}">${esc(SANCTION_BY_KEY[k].short)}</th>`).join("")}<th class="num">Total</th></tr></thead>
      <tbody>${table.filter((r) => r.n).map((r) => r.row).join("") || `<tr><td colspan="${chosen.length + 2}">No matches.</td></tr>`}</tbody></table></div>
      ${empty.length ? `<p class="muted"><strong>No matching actions found for:</strong> ${esc(empty.join(", "))}.</p>` : ""}
      <div class="toolbar">${focus ? `<span class="chip understood">Showing only: ${esc(fg ? groupName(fg) : "")}${fk ? " – " + esc(SANCTION_BY_KEY[fk].label) : ""} <button type="button" id="s-unfocus" aria-label="Show all">×</button></span>` : ""}
        <button type="button" class="btn ghost small" id="s-csv">Download as spreadsheet (CSV)</button></div>`;
    html += hit.map((r) => {
      const list = shown.filter((it) => groupsForItem(it).includes(r.g)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return list.length ? `<section class="group" id="g-${esc(r.g.replace(":", "-"))}"><h2>${esc(groupName(r.g))} <span class="count">${list.length}</span></h2>${list.map(cardHtml).join("")}</section>` : "";
    }).join("");
    html += coverageWarnings(true);
    view.innerHTML = html;
    bindSanctions(p, shown);
  }

  function bindSanctions(p, shown) {
    const go = () => setHash("research/sanctions", p) || renderSanctions(location.hash.slice(1));
    document.querySelectorAll("#s-pick [data-s]").forEach((cb) => cb.addEventListener("change", () => {
      const keys = [...document.querySelectorAll("#s-pick [data-s]:checked")].map((x) => x.dataset.s);
      keys.length ? p.set("types", keys.join(",")) : p.delete("types"); p.delete("focus"); go();
    }));
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on("s-all", "click", () => { p.set("types", SANCTIONS.map((s) => s.key).join(",")); go(); });
    on("s-none", "click", () => { p.delete("types"); p.delete("focus"); go(); });
    on("s-from", "change", (e) => { e.target.value ? p.set("from", e.target.value) : p.delete("from"); go(); });
    on("s-to", "change", (e) => { e.target.value ? p.set("to", e.target.value) : p.delete("to"); go(); });
    on("s-only", "change", (e) => { e.target.checked ? p.delete("all") : p.set("all", "1"); go(); });
    on("s-unfocus", "click", () => { p.delete("focus"); go(); });
    on("s-csv", "click", () => download("agency-tracker-sanctions.csv", csv(shown || [])));
    document.querySelectorAll("[data-focus]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault(); p.set("focus", a.dataset.focus); go(); window.scrollTo(0, 0);
    }));
  }

  // ------------------------------------------------------------- the parser
  function findPhrases(text, dict, kind, out, consumed) {
    // longer phrases first so "proposed rule" beats "rule"
    const pairs = [];
    Object.entries(dict).forEach(([key, words]) => words.forEach((w) => pairs.push([key, w])));
    pairs.sort((a, b) => b[1].length - a[1].length);
    pairs.forEach(([key, w]) => {
      const rx = new RegExp(`(^|[^a-z0-9])(${reEsc(w)})(?=$|[^a-z0-9])`, "gi");
      let m;
      while ((m = rx.exec(text))) {
        const start = m.index + m[1].length, end = start + m[2].length;
        if (consumed.some(([s, e]) => start < e && end > s)) continue;
        consumed.push([start, end]);
        if (!out.some((o) => o.kind === kind && o.key === key)) out.push({ kind, key, said: m[2] });
      }
    });
  }

  function parseDay(s, fallbackYear) {
    s = s.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(",", "");
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    m = s.match(/^([a-z]+)\.?(?: (\d{1,2}))?(?: (\d{4}))?$/);
    if (m) {
      const mi = MONTHS.findIndex((x) => x.startsWith(m[1].slice(0, 3)) && m[1].length >= 3);
      if (mi < 0) return null;
      const now = new Date();
      let y = m[3] ? +m[3] : fallbackYear || now.getFullYear();
      if (!m[3] && !fallbackYear && (mi > now.getMonth() || (mi === now.getMonth() && m[2] && +m[2] > now.getDate()))) y -= 1;
      return { y, mi, d: m[2] ? +m[2] : null };
    }
    return null;
  }
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function startOf(p) { return typeof p === "string" ? p : `${p.y}-${pad(p.mi + 1)}-${pad(p.d || 1)}`; }
  function endOf(p) {
    if (typeof p === "string") return p;
    return p.d ? `${p.y}-${pad(p.mi + 1)}-${pad(p.d)}` : ymd(new Date(p.y, p.mi + 1, 0));
  }

  const MONTH_RX = "(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\\b\\.?";
  const DATE_WORD = `(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{2,4}|${MONTH_RX}(?: \\d{1,2}(?:st|nd|rd|th)?\\b)?(?:,? \\d{4})?)`;

  function parseDates(text, consumed) {
    const today = new Date(); const t = ymd(today);
    const tries = [
      [/\btoday\b/i, () => [t, t, "today"]],
      [/\byesterday\b/i, () => { const d = new Date(); d.setDate(d.getDate() - 1); return [ymd(d), ymd(d), "yesterday"]; }],
      [/\b(?:in |over |during |for )?the (?:past|last) (\d+) (day|week|month|year)s?\b/i, (m) => {
        const d = new Date(); const n = +m[1]; const u = m[2].toLowerCase();
        if (u === "day") d.setDate(d.getDate() - n); else if (u === "week") d.setDate(d.getDate() - 7 * n);
        else if (u === "month") d.setMonth(d.getMonth() - n); else d.setFullYear(d.getFullYear() - n);
        return [ymd(d), t, `past ${n} ${u}${n === 1 ? "" : "s"}`]; }],
      [/\b(?:in |over |during )?the (?:past|last) (day|week|month|year)\b/i, (m) => {
        const d = new Date(); const u = m[1].toLowerCase();
        if (u === "day") d.setDate(d.getDate() - 1); else if (u === "week") d.setDate(d.getDate() - 7);
        else if (u === "month") d.setMonth(d.getMonth() - 1); else d.setFullYear(d.getFullYear() - 1);
        return [ymd(d), t, `past ${u}`]; }],
      [/\bthis week\b/i, () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [ymd(d), t, "this week"]; }],
      [/\blast week\b/i, () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7); const e = new Date(d); e.setDate(e.getDate() + 6); return [ymd(d), ymd(e), "last week"]; }],
      [/\bthis month\b/i, () => [ymd(new Date(today.getFullYear(), today.getMonth(), 1)), t, "this month"]],
      [/\blast month\b/i, () => [ymd(new Date(today.getFullYear(), today.getMonth() - 1, 1)), ymd(new Date(today.getFullYear(), today.getMonth(), 0)), "last month"]],
      [/\bthis year\b/i, () => [`${today.getFullYear()}-01-01`, t, "this year"]],
      [/\blast year\b/i, () => [`${today.getFullYear() - 1}-01-01`, `${today.getFullYear() - 1}-12-31`, "last year"]],
      [new RegExp(`\\b(?:between|from) (${DATE_WORD}) (?:and|to|through|until|-) (${DATE_WORD})`, "i"), (m) => {
        const a = parseDay(m[1]), b = parseDay(m[2]); return a && b ? [startOf(a), endOf(b), `${m[1]} to ${m[2]}`] : null; }],
      [new RegExp(`\\b(?:since|after|starting|beginning|from) (${DATE_WORD})`, "i"), (m) => {
        const a = parseDay(m[1]); return a ? [startOf(a), t, `since ${m[1]}`] : null; }],
      [new RegExp(`\\b(?:before|until|through|prior to) (${DATE_WORD})`, "i"), (m) => {
        const a = parseDay(m[1]); return a ? ["", endOf(a), `before ${m[1]}`] : null; }],
      [new RegExp(`\\b(?:in|during|for|on) (${DATE_WORD})`, "i"), (m) => {
        const a = parseDay(m[1]); return a ? [startOf(a), endOf(a), m[1]] : null; }],
      [/\b(?:in|during|for|throughout) (20\d{2})\b/, (m) => [`${m[1]}-01-01`, `${m[1]}-12-31`, m[1]]],
    ];
    for (const [rx, fn] of tries) {
      const m = text.match(rx);
      if (!m) continue;
      const r = fn(m);
      if (!r) continue;
      consumed.push([m.index, m.index + m[0].length]);
      return { from: r[0], to: r[1], said: r[2] };
    }
    return null;
  }

  function parse(text) {
    const lower = " " + text.toLowerCase().replace(/[“”]/g, '"').replace(/[’]/g, "'") + " ";
    const consumed = [];
    const out = [];
    const date = parseDates(lower, consumed);
    if (date) out.push({ kind: "date", key: "date", said: date.said, from: date.from, to: date.to });

    // presentation hints
    const hints = { group: null, view: null };
    [[/\bby (?:constitutional )?(?:issue|violation|problem|flag)s?\b/i, "issue"], [/\bby (?:type|category|kind)\b/i, "category"],
     [/\b(?:timeline|over time|by (?:date|week|month)|chronolog\w*|trend\w*)\b/i, "date"], [/\bby (?:agency|agencies|regulator)\b/i, "agency"],
     [/\bby (?:sanction|penalty|punishment)s?\b/i, "sanction"]]
      .forEach(([rx, g]) => { const m = lower.match(rx); if (m && !hints.group) { hints.group = g; consumed.push([m.index, m.index + m[0].length]); } });
    const tm = lower.match(/\b(?:as a |in a )?(?:table|spreadsheet)\b/i);
    if (tm) { hints.view = "table"; consumed.push([tm.index, tm.index + tm[0].length]); }

    const sanctionDict = Object.fromEntries(SANCTIONS.map((s) => [s.key, s.words]));
    findPhrases(lower, CORP_WORDS, "corp", out, consumed);
    findPhrases(lower, ISSUE_WORDS, "issue", out, consumed);
    findPhrases(lower, sanctionDict, "sanction", out, consumed);
    findPhrases(lower, CATEGORY_WORDS, "category", out, consumed);
    findPhrases(lower, AGENCY_WORDS, "agency", out, consumed);
    // an ALJ phrase belongs to two issues
    if (/\b(?:aljs?|administrative law judges?)\b/.test(lower) &&
        !out.some((o) => o.key === "officer_appointment_removal")) out.push({ kind: "issue", key: "officer_appointment_removal", said: "ALJs" });

    const flagWords = [[/\bstructural\b|\bseparation of powers\b/i, "structural"], [/\b(?:un)?constitutional\w*|\bconstitution\b|\bflagged\b/i, "flagged"],
      [/\bsignificant\b|\bmajor rules?\b/i, "significant"], [/\b(?:open (?:for|to) comment|comment (?:period|deadline)s?|comments? due|accepting comments)\b/i, "comments"],
      [/\bhigh[- ]priority\b|\bmost (?:serious|important)\b/i, "high"]];
    flagWords.forEach(([rx, key]) => { const m = lower.match(rx); if (m) { consumed.push([m.index, m.index + m[0].length]); out.push({ kind: "filter", key, said: m[0].trim() }); } });

    // leftover words become keywords
    let rest = lower.split("");
    consumed.forEach(([s, e]) => { for (let i = s; i < e; i++) rest[i] = " "; });
    const keywords = [...new Set(rest.join("").split(/[^a-z0-9'-]+/).map((w) => w.replace(/^'+|'+$/g, ""))
      .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)))];
    keywords.forEach((w) => out.push({ kind: "keyword", key: w, said: w }));
    return { terms: out, hints };
  }

  const KIND_LABEL = { agency: "Agency", corp: "Corporation", sanction: "Sanction", issue: "Issue", category: "Type", date: "Dates", filter: "Filter", keyword: "Word" };
  function termLabel(t) {
    const idx = AT().index;
    if (t.kind === "agency") { const a = [...idx.agencies, idx.president].find((x) => x.key === t.key); return a ? a.short : t.key; }
    if (t.kind === "corp") return t.key === "*" ? "All agency-controlled corporations" : (t.key === "other_sro" ? "Other SROs (exchanges)" : t.key.toUpperCase());
    if (t.kind === "sanction") return SANCTION_BY_KEY[t.key].label;
    if (t.kind === "issue") return ISSUE_LABELS[t.key];
    if (t.kind === "category") return t.key.startsWith("sub:") ? t.key.slice(4) + "s" : idx.categories[t.key];
    if (t.kind === "date") return [t.from && AT().fmtDay(t.from), t.to && AT().fmtDay(t.to)].filter(Boolean).join(" – ") || t.said;
    if (t.kind === "filter") return { structural: "Structural constitutional flags", flagged: "Any constitutional flag", significant: "Significant rules",
      comments: "Open for public comment", high: "High-priority flags", actions: "Only actions against particular parties" }[t.key];
    return `contains “${t.key}”`;
  }
  const termId = (t) => `${t.kind}:${t.key}`;

  function applyTerms(items, terms) {
    const of = (k) => terms.filter((t) => t.kind === k);
    const agencies = of("agency").map((t) => t.key), corps = of("corp").map((t) => t.key);
    const sanctions = of("sanction").map((t) => t.key), issues = of("issue").map((t) => t.key);
    const issueWords = of("issue").map((t) => (t.said || "").toLowerCase()).filter((w) => w.length > 3);
    const cats = of("category").map((t) => t.key), filters = of("filter").map((t) => t.key);
    const kws = of("keyword").map((t) => t.key.replace(/s$/, ""));
    const date = of("date")[0];
    const today = AT().today();
    return items.filter((it) => {
      if (date && ((date.from && (it.date || "") < date.from) || (date.to && (it.date || "") > date.to))) return false;
      if (agencies.length || corps.length) {
        const inAgency = !it.corporation && (it.agencies || []).some((k) => agencies.includes(k));
        const inCorp = it.corporation && (corps.includes("*") || corps.includes(it.corporation) || (agencies.includes("sec") && !corps.length));
        if (!inAgency && !inCorp) return false;
      }
      if (cats.length && !cats.some((c) => c.startsWith("sub:") ? it.subcategory === c.slice(4) : it.category === c)) return false;
      if (sanctions.length && !sanctionsOf(it).some((k) => sanctions.includes(k))) return false;
      // an issue matches if the item is flagged for it, or if it uses the words you typed (e.g. "privacy")
      if (issues.length && !(it.flags || []).some((f) => issues.includes(f.code)) &&
          !issueWords.some((w) => textOf(it).toLowerCase().includes(w))) return false;
      if (filters.includes("actions") && !isAction(it)) return false;
      if (filters.includes("structural") && !(it.flags || []).some((f) => f.structural)) return false;
      if (filters.includes("flagged") && !(it.flags || []).length) return false;
      if (filters.includes("high") && it.priority !== 3) return false;
      if (filters.includes("significant") && !it.significant) return false;
      if (filters.includes("comments") && !(it.comments_close && it.comments_close >= today)) return false;
      if (kws.length) { const tx = textOf(it).toLowerCase(); if (!kws.some((k) => tx.includes(k))) return false; }
      return true;
    });
  }

  function describe(terms, n) {
    if (!terms.length) return `Showing all ${n} stored items. Add words to narrow this down.`;
    const by = (k) => terms.filter((t) => t.kind === k).map(termLabel);
    const parts = [];
    const who = [...by("agency"), ...by("corp")];
    const what = [...by("category"), ...by("sanction")];
    parts.push(what.length ? what.join(" or ").toLowerCase() : "items");
    if (who.length) parts.push(`from ${who.join(", ")}`);
    if (by("issue").length) parts.push(`about ${by("issue").join(" or ")}`);
    if (by("filter").length) parts.push(`(${by("filter").join(", ").toLowerCase()})`);
    if (by("keyword").length) parts.push(`mentioning ${by("keyword").map((k) => k.replace(/^contains /, "")).join(" or ")}`);
    if (by("date").length) parts.push(`dated ${by("date")[0]}`);
    return `I looked for ${parts.join(" ")} and found ${n}.`;
  }

  // ---------------------------------------------------------------- ask view
  const EXAMPLES = [
    "SEC and FINRA actions barring people from the industry since September",
    "Fines and civil money penalties by agency this year",
    "Structural constitutional issues involving ALJs or in-house proceedings",
    "EPA and FERC proposed rules open for comment",
    "Executive orders about independent agencies, as a timeline",
    "Significant rules that may raise major questions issues, as a table",
  ];

  async function renderAsk(hash) {
    const p = params(hash);
    const q = p.get("q") || "";
    const dropped = (p.get("drop") || "").split("|").filter(Boolean);
    const view = $view();
    const askBox = `<h1>Ask in your own words</h1>
      <p class="subtitle">Describe what you are looking for. The app reads your request, shows how it understood it, and builds an organized report from the full stored history.</p>
      <div class="ask-box"><textarea id="ask-q" rows="2" placeholder="e.g. FINRA and SEC bars from the market since September, grouped by agency">${esc(q)}</textarea>
        <button type="button" class="btn" id="ask-go">Build report</button></div>
      <div class="examples">Try: ${EXAMPLES.map((e) => `<a data-ex="${esc(e)}">“${esc(e)}”</a>`).join(" ")}</div>`;
    if (!q.trim()) { view.innerHTML = askBox; bindAsk(p); return; }
    view.innerHTML = askBox + `<p class="muted">Building your report…</p>`;

    const parsed = parse(q);
    let terms = parsed.terms;
    if (terms.some((t) => t.kind === "sanction") && !terms.some((t) => t.kind === "category"))
      terms.push({ kind: "filter", key: "actions", said: "(automatic)" });
    terms = terms.filter((t) => !dropped.includes(termId(t)));
    const group = p.get("group") || parsed.hints.group ||
      (terms.some((t) => t.kind === "issue" || (t.kind === "filter" && (t.key === "structural" || t.key === "flagged"))) && !terms.some((t) => t.kind === "agency") ? "issue" : "agency");
    const mode = p.get("view") || parsed.hints.view || "cards";

    const date = terms.find((t) => t.kind === "date");
    const all = await AT().loadRange(date && date.from ? date.from : null);
    let results = applyTerms(all, terms);
    let relaxed = [];
    if (!results.length && terms.some((t) => t.kind === "keyword")) {
      const without = terms.filter((t) => t.kind !== "keyword");
      const retry = applyTerms(all, without);
      if (retry.length) { relaxed = terms.filter((t) => t.kind === "keyword").map((t) => t.key); terms = without; results = retry; }
    }
    results = results.sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.date || "").localeCompare(a.date || ""));

    // grouping
    const buckets = new Map();
    const put = (k, label, it) => { if (!buckets.has(k)) buckets.set(k, { label, items: [] }); buckets.get(k).items.push(it); };
    results.forEach((it) => {
      if (group === "agency") groupsForItem(it).forEach((g) => put(g, groupName(g), it));
      else if (group === "issue") { const fl = it.flags || []; if (!fl.length) put("zz", "No constitutional flag", it); fl.forEach((f) => put(f.code, f.label, it)); }
      else if (group === "category") put(it.category + "|" + it.subcategory, `${AT().index.categories[it.category] || it.category} – ${it.subcategory}`, it);
      else if (group === "sanction") { const s = sanctionsOf(it); if (!s.length) put("zz", "No sanction wording", it); s.forEach((k) => put(k, SANCTION_BY_KEY[k].label, it)); }
      else { const d = new Date((it.date || "1970-01-01") + "T12:00:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); put(ymd(d), `Week of ${AT().fmtDay(ymd(d))}`, it); }
    });
    let ordered = [...buckets.entries()];
    if (group === "date") ordered.sort((a, b) => b[0].localeCompare(a[0]));
    else ordered.sort((a, b) => (a[0] === "zz") - (b[0] === "zz") || b[1].items.length - a[1].items.length);

    const chips = terms.map((t) => `<span class="chip understood"><span class="kind">${esc(KIND_LABEL[t.kind])}</span>${esc(termLabel(t))}
      <button type="button" data-drop="${esc(termId(t))}" title="Remove this part of the search" aria-label="Remove">×</button></span>`).join("");
    const seg = (name, cur, opts) => `<span class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${v === cur ? "active" : ""}">${l}</button>`).join("")}</span>`;
    const high = results.filter((i) => i.priority === 3).length;
    const agencyCount = new Set(results.flatMap(groupsForItem)).size;
    const chartRows = (group === "date" ? ordered.slice(0, 16).reverse() : ordered.slice(0, 12)).map(([, b]) => ({ label: b.label, n: b.items.length }));

    let html = askBox + `<div class="panel"><strong>How I understood your request</strong>
      <div class="chips">${chips || '<span class="muted">No specific filters recognized.</span>'}</div>
      <p style="margin:4px 0 0">${esc(describe(terms, results.length))}</p>
      ${relaxed.length ? `<p class="muted" style="margin:6px 0 0">No items mentioned “${esc(relaxed.join("”, “"))}”, so ${relaxed.length === 1 ? "that word was" : "those words were"} ignored.</p>` : ""}
      ${dropped.length ? `<p class="muted" style="margin:6px 0 0">${dropped.length} part(s) removed. <a href="#" id="ask-restore">Restore</a></p>` : ""}</div>`;
    if (results.length) {
      html += `<div class="stats">
          <div class="stat"><div class="n">${results.length}</div><div class="l">matching items</div></div>
          <div class="stat"><div class="n">${agencyCount}</div><div class="l">agencies &amp; corporations</div></div>
          <div class="stat"><div class="n">${high}</div><div class="l">high-priority flags</div></div>
          <div class="stat"><div class="n">${esc(results.length ? AT().fmtDay(results.reduce((m, i) => (i.date < m ? i.date : m), results[0].date)) : "")}</div><div class="l">earliest item</div></div>
        </div>
        <div class="toolbar">Group by ${seg("group", group, [["agency", "Agency"], ["issue", "Constitutional issue"], ["category", "Type of action"], ["sanction", "Sanction"], ["date", "Week"]])}
          Show as ${seg("view", mode, [["cards", "Cards"], ["table", "Table"]])}
          <button type="button" class="btn ghost small" id="ask-csv">Download as spreadsheet (CSV)</button>
          <button type="button" class="btn ghost small" id="ask-link">Copy link to this report</button></div>
        <div class="panel"><strong>${group === "date" ? "Items per week" : "Items per group"}</strong>${barsHtml(chartRows, false)}</div>
        <div class="toc">Jump to: ${ordered.map(([k, b], i) => `<a href="#" data-jump="grp-${i}">${esc(b.label)} (${b.items.length})</a>`).join("")}</div>`;
      html += ordered.map(([k, b], i) => `<section class="group" id="grp-${i}"><h2>${esc(b.label)} <span class="count">${b.items.length}</span></h2>
        ${mode === "table" ? tableHtml(b.items) : b.items.map(cardHtml).join("")}</section>`).join("");
    } else {
      html += `<div class="notfound"><h3>Nothing matched every part of your request</h3>
        <p>Every item must match all the labels above. Try removing one (click its ×), widening the dates, or rewording.</p></div>`;
    }
    const wantedAgencies = terms.filter((t) => t.kind === "agency").map((t) => t.key);
    const missing = wantedAgencies.filter((k) => !results.some((it) => !it.corporation && (it.agencies || []).includes(k)));
    if (results.length && missing.length)
      html += `<div class="notfound"><h3>Not found</h3><p>Nothing matched for: ${esc(missing.map((k) => termLabel({ kind: "agency", key: k })).join(", "))}.</p></div>`;
    html += coverageWarnings(terms.some((t) => t.kind === "sanction" || (t.kind === "category" && t.key === "enforcement")));
    view.innerHTML = html;
    bindAsk(p, results);
  }

  function bindAsk(p, results) {
    const go = () => { setHash("research/ask", p); renderAsk(location.hash.slice(1)); };
    const run = () => { const v = document.getElementById("ask-q").value.trim(); p.set("q", v); p.delete("drop"); p.delete("group"); p.delete("view"); go(); };
    document.getElementById("ask-go").addEventListener("click", run);
    document.getElementById("ask-q").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); run(); } });
    document.querySelectorAll("[data-ex]").forEach((a) => a.addEventListener("click", () => { document.getElementById("ask-q").value = a.dataset.ex; run(); }));
    document.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", () => {
      const d = (p.get("drop") || "").split("|").filter(Boolean); d.push(b.dataset.drop); p.set("drop", d.join("|")); go();
    }));
    const restore = document.getElementById("ask-restore");
    if (restore) restore.addEventListener("click", (e) => { e.preventDefault(); p.delete("drop"); go(); });
    document.querySelectorAll("[data-seg] button").forEach((b) => b.addEventListener("click", () => { p.set(b.parentElement.dataset.seg, b.dataset.v); go(); }));
    document.querySelectorAll("[data-jump]").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault(); document.getElementById(a.dataset.jump).scrollIntoView({ behavior: "smooth" }); }));
    const c = document.getElementById("ask-csv");
    if (c) c.addEventListener("click", () => download("agency-tracker-report.csv", csv(results || [])));
    const l = document.getElementById("ask-link");
    if (l) l.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(location.href); l.textContent = "Link copied"; } catch (e) { l.textContent = "Copy the address bar"; }
    });
  }

  // ------------------------------------------------------------------- help
  function renderHelp() {
    $view().innerHTML = `<article class="prose"><h1>How research mode works</h1>
      <p class="lead">Research mode searches everything Agency Tracker has ever collected, not just what is new since your last visit.
        Switch back to the original report at any time with the <strong>Classic</strong> button at the top.</p>
      <h2>Search by type of sanction</h2>
      <p>Tick one or more kinds of action: ${SANCTIONS.map((s) => esc(s.label)).join("; ")}. The table shows how many matching actions
        each agency or corporation took, and you can click any number to see just those items. Agencies with no matches are listed by name,
        so you can see what was not found.</p>
      <p>By default, only actions against particular parties (enforcement and adjudication) are counted, so a rule that only adjusts
        penalty amounts for inflation is left out. Untick that box to include rules too.</p>
      <h2>Ask in your own words</h2>
      <p>Type what you want, the way you would say it to a research assistant. The app recognizes:</p>
      <ul><li><strong>Agencies and corporations</strong>: names or initials (SEC, FINRA, “labor board”, “White House”…)</li>
        <li><strong>Sanctions</strong>: fines, bars, license revocations, consent orders and the others above</li>
        <li><strong>Constitutional issues</strong>: “ALJs”, “jury trial”, “appointments”, “nondelegation”, “Chevron”, “independent agencies”, “federalism”, “First Amendment”…, or simply “structural” or “constitutional”</li>
        <li><strong>Types of action</strong>: proposed or final rules, enforcement, adjudication, hearings, executive orders</li>
        <li><strong>Dates</strong>: “since September”, “last month”, “in October 2026”, “between Oct 1 and Nov 5”, “past 30 days”, “this year”</li>
        <li><strong>Other filters</strong>: “significant rules”, “open for comment”, “high priority”</li>
        <li><strong>How to show it</strong>: “by agency”, “by issue”, “by type”, “as a timeline”, “as a table”</li></ul>
      <p>Any other important words are searched for in titles and summaries. Everything the app recognized is shown as labels you can remove with ×.
        Each report can be regrouped, shown as a table, downloaded as a spreadsheet (CSV), or saved as a link.</p>
      <h2>Limits</h2>
      <p>The request is read with a built-in vocabulary and runs entirely in your browser, so nothing you type is sent anywhere. It is not an AI
        model, so unusual wording may be missed. If so, check the labels and rephrase. Search results are only as complete as the sources
        collected, and enforcement coverage in particular is partial (see <a href="#coverage">What we checked</a> in Classic mode).</p></article>`;
  }

  function $view() { return document.getElementById("view"); }

  window.AgencyResearch = {
    render(hash) {
      if (!AT() || !AT().index) { $view().innerHTML = `<p class="muted">No data yet.</p>`; return; }
      window.scrollTo(0, 0);
      if (hash.startsWith("research/ask")) return renderAsk(hash);
      if (hash.startsWith("research/help")) return renderHelp();
      return renderSanctions(hash);
    },
    _parse: parse, _sanctionsOf: sanctionsOf,  // exposed for testing
  };
})();
