/* RegCollect assistant. A private, rule-based helper that runs entirely in this browser.
 * It does not send anything anywhere and uses no outside AI service. It understands
 * requests with simple language patterns, acts on the app only through the functions
 * app.js exposes (window.RegCollect), and answers questions from the help library below. */
(function () {
  "use strict";
  const KEY = "regcollect.assistant";
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let log = [];
  try { log = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch (e) { log = []; }
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(log.slice(-60))); } catch (e) { /* private mode */ } };

  // ------------------------------------------------------------ help library
  const HELP = [
    [/what can you do|^help$|how do (?:i|you) use you|commands/, () => `I can operate RegCollect for you. Try:<ul>
      <li>“Open the SEC” or “show FDA enforcement since 2015”</li><li>“Find gag orders” or “search FINRA expulsions”</li>
      <li>“Chart SEC sanctions by month” or “pie chart of FDA outcomes”</li><li>“Show flagrant issues” or “what's new for the CFPB?”</li>
      <li>“Show me what's new since October 1” or “mark everything as read”</li><li>“What is flagrance?” or “how are dates chosen?”</li></ul>`],
    [/what (?:is|does) flagran|flagrance mean/, () => `<strong>Flagrance</strong> is how clearly existing law condemns a kind of action. It combines a precedent tier (3: the Supreme Court has held this specific practice unlawful; 2: a holding applies by close analogy, or an appeals court has held the same practice unlawful; 1: open, split, or decided the other way) with how many elements of the legal test appear in the document. Flagrant needs tier 3 and every element; Substantial needs tier 2 or 3 and at least half. A counter-indicator, such as a settlement, caps it at Arguable. <a href="#methods">Read the rubric</a>.`],
    [/seriousness|severity mean|how serious/, () => `<strong>Seriousness</strong> adds objective points: up to 4 for the sanction (criminal charges, bars, and debarment score highest), up to 3 for money ($100 million or more scores 3), and up to 3 for reach (presidential documents and economically significant rules score 3). Severe is 6 or more points; Significant is 3 to 5; Moderate is 0 to 2. Every flag shows its point count.`],
    [/tier|precedent/, () => `The precedent tier records how directly a court has spoken to this kind of action, and which case it relies on. Each flag names the case, and the <a href="#methods">Methodology</a> page lists every tier rule.`],
    [/rubric|methodolog|how (?:are|do you) (?:flags|ratings) (?:made|decided|computed|rated)|why (?:was|is) .* flagged/, () => `Every flag comes from a memo in the doctrine library: the legal test broken into elements, the controlling cases, counter-indicators, and open questions. Open “Why flagged” on any action to see the checklist and the point count, or read the full <a href="#methods">Methodology</a>.`],
    [/exchange|clearing|sro|self-regulatory/, () => `Exchanges (such as NYSE, Nasdaq, and Cboe) and clearing agencies (such as DTC, NSCC, FICC, and the Options Clearing Corporation) are private self-regulatory organizations. The Securities Exchange Act requires them to file every rule change, including fee changes, with the SEC, which publishes each one. RegCollect labels each filing as a fee change, a rule change, or discipline, and hides routine fee changes unless you ask. <a href="#e/other_sro">Open their page</a>.`],
    [/date|dated|when (?:was|is) .* (?:pulled|collected)/, () => `Actions are dated by the agency's own action: the signing date when the Federal Register records one, otherwise the publication, posting, or release date; FDA recalls use FDA's classification date. Nothing is dated by when RegCollect collected it. <a href="#coverage#dates">Details</a>.`],
    [/history|backfill|2015|how far back/, () => `History reaches back to January 1, 2015, for the Federal Register, Regulations.gov, and FDA recall reports. It fills in automatically, newest months first; <a href="#coverage#history">see how far it has reached</a>. The SEC and agency press feeds keep only recent items.`],
    [/not track|missing|what (?:do|does) (?:you|regcollect) (?:not )?track|coverage|gaps?/, () => `See <a href="#coverage#not">Not tracked</a> for the full list. The main gaps: FTC and FCC press releases (their sites refuse automated readers), NLRB decisions (feed addresses still being confirmed), DOL and EPA enforcement, FERC and HHS-OIG enforcement, and anything an agency never publishes.`],
    [/privacy|private|where does .* go|send/, () => `Everything stays in this browser: your username, dates, searches, and this conversation. I don't use any outside service.`],
    [/who are you|what are you|are you (?:ai|claude|chatgpt|a robot)/, () => `I'm RegCollect's built-in assistant. I'm a set of rules that runs in your browser and works the app for you; I'm not connected to any outside AI.`],
    [/sync|another (?:computer|browser)|username|account/, () => `Click your username at the top right to copy a sync code, then paste it on the welcome screen in the other browser.`],
  ];

  // ---------------------------------------------------------------- parsing
  const PAGES = [[/\b(?:home|directory|start|main)\b/, "#home"], [/\bconstitutional issues?\b|\bissues page\b|\bthe grid\b|\bmatrix\b/, "#issues"],
    [/\bresearch\b/, "#research"], [/\bmethodolog\w*|\brubric\b|\bdoctrine\b|\bmemos?\b/, "#methods"], [/\bwhat we track\b|\bcoverage\b|\bsources\b/, "#coverage"],
    [/\bmanual\b|\binstructions\b/, "#manual"]];
  function findEntity(t) {
    const R = window.RegCollect;
    const pairs = [];
    R.entities().forEach((e) => [e.name, e.short, ...(e.aliases || [])].forEach((n) => pairs.push([n.toLowerCase(), e.key])));
    pairs.sort((a, b) => b[0].length - a[0].length);
    for (const [n, k] of pairs) if (new RegExp(`(^|[^a-z])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`).test(t)) return k;
    return null;
  }
  function period(t) {
    const R = window.RegCollect;
    if (/\b(?:since 2015|all (?:time|history)|ever|everything)\b/.test(t)) return { scope: "all", from: R.historyStart() };
    const y = t.match(/\b(?:in|during|for) (20[12]\d)\b/);
    if (y) return { scope: y[1], from: `${y[1]}-01-01`, to: `${y[1]}-12-31` };
    if (/\b(?:past|last) (?:12 months|year)\b/.test(t)) return { scope: "12m" };
    return null;
  }
  const CATS = { enforcement: /\benforcement\b/, rulemaking: /\brules?\b|\brulemaking\b|\bregulations?\b/, adjudication: /\badjudicat\w*|\bhearings?\b|\blicens\w*/, presidential: /\bexecutive orders?\b|\bproclamations?\b/ };

  function respond(raw) {
    const R = window.RegCollect;
    const t = raw.toLowerCase().trim().replace(/[?!.]+$/, "");
    if (!t) return null;
    if (/\b(?:tour|tutorial|walk me through)\b/.test(t)) { R.startTour(); return "Starting the tour."; }
    if (/mark (?:everything|all) (?:as )?read|i'?m caught up|start fresh/.test(t)) { R.markAllRead(); return "Done. Everything up to now is marked as read."; }
    const since = t.match(/(?:new|what'?s new|show me .*) since ((?:\d{4}-\d{2}-\d{2})|(?:[a-z]+ \d{1,2}(?:,? \d{4})?))/);
    if (since) {
      const d = window.RHSearch.parseDates(`since ${since[1]}`);
      if (d && d.from) { R.setSince(d.from); return `Showing what's new since ${R.fmtDay(d.from)}.`; }
    }
    for (const [rx, fn] of HELP) if (rx.test(t) && !/\b(?:chart|graph|plot|find|search|open)\b/.test(t)) return fn();
    const key = findEntity(t);
    const name = key ? R.entityMap()[key].name : "";
    const per = period(t);

    // charts
    if (/\b(?:chart|graph|plot|visual\w*|pie|donut|trend)\b/.test(t)) {
      if (!key) return "Which agency or body should I chart? For example, “chart SEC sanctions by month.”";
      const patch = {};
      patch.type = /\b(?:pie|donut|share)\b/.test(t) ? "donut" : /\blines?\b|\btrend/.test(t) ? "lines" : /\btotals?\b|\bbar chart\b|\bbars\b/.test(t) ? "bars" : /\bgrid\b|\bmatrix\b/.test(t) ? "matrix" : "stacked";
      const by = [[/sanction|penalt|punish/, "sanction"], [/outcome|result/, "outcome"], [/constitutional|issue/, "issue"], [/flagran/, "flagrance"], [/serious|severity/, "impact"], [/document|type of/, "subcategory"], [/kind|category/, "category"]].find(([rx]) => rx.test(t));
      if (by) patch.by = by[1];
      const iv = t.match(/\b(?:by|per|each) (day|week|month|year)\b/); if (iv) patch.interval = iv[1] === "year" ? "month" : iv[1];
      if (per && per.from) { patch.from = per.from; if (per.to) patch.to = per.to; }
      if (/\bflagged\b/.test(t)) patch.flaggedOnly = true;
      R.setChart(key, patch); R.go(`#e/${key}/charts`);
      return `Here is a chart of the ${esc(name)}'s actions. You can change it with the controls on the left, or download it.`;
    }
    // issues
    if (/\bflagrant\b|\bsevere\b|\bconstitutional (?:issues?|problems?|violations?)\b|\bflagged\b/.test(t) && !/\b(?:find|search)\b/.test(t) && !key) {
      const q = new URLSearchParams();
      if (/\bflagrant\b/.test(t)) q.set("f", "3"); if (/\bsevere\b/.test(t)) q.set("i", "3");
      if (per) q.set("scope", per.scope); if (/\bstructural\b/.test(t)) q.set("s", "1");
      R.go(`#issues${q.toString() ? "?" + q : ""}`);
      return "Here are the flagged actions. Click a square in the grid to narrow them down.";
    }
    // counts
    if (/^how many\b/.test(t)) {
      const items = R.visible(R.state.sinceItems);
      const list = key ? R.scopeItems(items, key) : items;
      const flagged = list.filter((i) => i.severity).length;
      return `${list.length.toLocaleString()} new action${list.length === 1 ? "" : "s"} ${esc(R.sinceWords())}${key ? ` for the ${esc(name)}` : ""}, and ${flagged.toLocaleString()} with a constitutional flag.`;
    }
    // search
    const search = t.match(/^(?:find|search(?: for)?|look (?:for|up)|show me (?:any|all)?|are there (?:any)?|list)\s+(.+)/);
    if (search) {
      const q = search[1].replace(/\b(?:please|for me)\b/g, "").replace(/\b(?:since 2015|all (?:time|history)|ever)\b/g, "").replace(/\s+/g, " ").trim();
      const p = new URLSearchParams({ q }); if (per) p.set("p", per.scope);
      R.go(`#research?${p}`);
      return `Searching for “${esc(q)}”${per && per.scope === "all" ? ` since ${R.historyStart().slice(0, 4)}` : ""}. The chips above the results show how I read your request; remove any that don't fit.`;
    }
    // pages
    if (!key) for (const [rx, hash] of PAGES) if (rx.test(t)) { R.go(hash); return `Opening ${hash === "#home" ? "the directory" : hash.slice(1) === "methods" ? "the Methodology page" : hash === "#coverage" ? "What we track" : hash === "#issues" ? "Constitutional issues" : hash.slice(1)}.`; }
    // agency pages, with options
    if (key) {
      const patch = {};
      const cat = Object.entries(CATS).find(([, rx]) => rx.test(t)); if (cat) patch.cat = cat[0];
      if (/\bflagged\b|\bonly (?:constitutional )?flags?\b/.test(t)) patch.flagged = true;
      if (/\bnewest|latest|most recent\b/.test(t)) patch.sort = "date";
      if (/\bmost serious|worst|severity\b/.test(t)) patch.sort = "severity";
      if (per) patch.scope = per.scope === "all" || per.scope === "12m" ? per.scope : "all";
      if (/\bnew\b|\bwhat'?s new\b/.test(t)) patch.scope = "new";
      if (/\bfees?\b|\broutine\b/.test(t)) patch.routine = true;
      R.setEntityUI(key, patch);
      const tab = /\bcoverage\b|\bchecked\b/.test(t) ? "/coverage" : "";
      R.go(`#e/${key}${tab}`);
      return `Opening the ${esc(name)}${patch.cat ? `, ${patch.cat} only` : ""}${patch.flagged ? ", flagged actions only" : ""}.`;
    }
    // fall back to search
    const p = new URLSearchParams({ q: raw.trim() }); R.go(`#research?${p}`);
    return `I wasn't sure what you meant, so I searched Research for “${esc(raw.trim())}.” Type “help” to see what I can do.`;
  }

  // -------------------------------------------------------------------- UI
  function render() {
    const box = $("#bot-log");
    if (!box) return;
    box.innerHTML = log.map((m) => `<div class="msg ${m.who}">${m.who === "me" ? esc(m.text) : m.text}</div>`).join("");
    box.scrollTop = box.scrollHeight;
  }
  function suggest() {
    const R = window.RegCollect, view = (R && R.state.view) || "home";
    const s = view.startsWith("e/") ? ["Only flagged actions", "Chart sanctions by month", "Newest first", "What is flagrance?"]
      : view === "research" ? ["Find gag orders", "Search FINRA bars since 2015", "How are dates chosen?"]
      : ["What can you do?", "Show flagrant issues", "Open the SEC", "Chart FDA outcomes as a pie"];
    $("#bot-sugg").innerHTML = s.map((x) => `<button type="button">${esc(x)}</button>`).join("");
    $("#bot-sugg").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
  }
  function ask(text) {
    const R = window.RegCollect;
    const lastEntity = (R.state.view.match(/^e\/([a-z_]+)/) || [])[1];
    let t = text;
    // "only flagged actions", "newest first", "chart sanctions" apply to the agency on screen
    if (lastEntity && !findEntity(text.toLowerCase()) && !/^(?:find|search|look|list|are there|show me (?:any|all))\b|\?$|^(?:what|how|why|who|where|when)\b/i.test(text.trim()))
      t = `${text} ${R.entityMap()[lastEntity].short}`;
    log.push({ who: "me", text });
    let answer;
    try { answer = respond(t); } catch (e) { answer = "Something went wrong while doing that. Try rephrasing, or type “help.”"; }
    if (answer) log.push({ who: "it", text: answer });
    save(); render();
  }
  function open(on) {
    const bot = $("#bot"), btn = $("#bot-btn");
    bot.hidden = !on; btn.setAttribute("aria-expanded", String(on));
    try { localStorage.setItem("regcollect.botOpen", on ? "1" : "0"); } catch (e) { /* ignore */ }
    if (on) {
      if (!log.length) { log.push({ who: "it", text: "Hi. I can find actions, open agencies, set filters, build charts, and explain how RegCollect rates things. What would you like to do?" }); save(); }
      render(); suggest(); $("#bot-q").focus();
    }
  }
  document.addEventListener("regcollect:ready", () => {
    $("#bot-btn").addEventListener("click", () => open($("#bot").hidden));
    $("#bot-close").addEventListener("click", () => open(false));
    $("#bot-form").addEventListener("submit", (e) => { e.preventDefault(); const v = $("#bot-q").value.trim(); if (v) { $("#bot-q").value = ""; ask(v); } });
    let was = "0"; try { was = localStorage.getItem("regcollect.botOpen") || "0"; } catch (e) { /* ignore */ }
    if (was === "1") open(true);
  });
  document.addEventListener("regcollect:route", () => { if (!$("#bot").hidden) suggest(); });
  window.RCAssistant = { respond, ask };
})();
