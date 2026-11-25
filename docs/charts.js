/* RegHunter chart builder: per-agency visuals, drawn as SVG with no outside libraries.
 * Chart types: stacked bars over time, lines over time, totals, share (donut), and the
 * clarity x seriousness grid. Every chart can be exported as PNG, SVG or CSV.
 *
 * Series colors were checked with a colorblind-safety validator against the dark
 * chart surface. Red, orange and yellow are deliberately absent: they mean severity
 * everywhere in RegHunter and are used only when a chart is broken down by severity.
 */
(function () {
  "use strict";

  const SURFACE = "#121418";
  const TEXT = "#ece6d6", TEXT2 = "#bdb6a4", TEXT3 = "#8b8577", GRID = "rgba(236,230,214,0.10)";
  const SERIES = ["#338ced", "#e24d8b", "#0aac23", "#9887ef", "#00a888"]; // validated order; never cycled
  const OTHER = "#5b616b";
  const SEV = { 3: "#ef5148", 2: "#f39232", 1: "#f2cb4c" };
  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayObj = (s) => new Date(s + "T12:00:00");
  const fmt = (s, opts) => dayObj(s).toLocaleDateString(undefined, opts || { month: "short", day: "numeric" });

  function bucketOf(date, interval) {
    const d = dayObj(date);
    if (interval === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    if (interval === "week") { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
    return date;
  }
  function bucketRange(from, to, interval) {
    const out = []; let d = dayObj(bucketOf(from, interval)); const end = dayObj(to);
    while (d <= end && out.length < 800) {
      out.push(ymd(d));
      if (interval === "month") d = new Date(d.getFullYear(), d.getMonth() + 1, 1, 12);
      else d.setDate(d.getDate() + (interval === "week" ? 7 : 1));
    }
    return out;
  }
  function bucketLabel(b, interval) {
    if (interval === "month") return dayObj(b).toLocaleDateString(undefined, { month: "short", year: "numeric" });
    return fmt(b);
  }
  function niceMax(v) {
    if (v <= 4) return Math.max(1, v);
    const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  // -------------------------------------------------------------- the data
  /** keys an item belongs to for a breakdown dimension */
  function keysFor(it, dim, L) {
    switch (dim) {
      case "category": return [it.category];
      case "subcategory": return [it.subcategory || "Other"];
      case "sanction": return (it.sanctions || []).length ? it.sanctions : ["none"];
      case "outcome": return [it.outcome || "notice"];
      case "issue": return (it.flags || []).length ? [...new Set(it.flags.map((f) => f.code))] : ["none"];
      case "clarity": return [it.severity ? String(it.severity.clarity) : "0"];
      case "impact": return [it.severity ? String(it.severity.impact) : "0"];
      default: return ["all"];
    }
  }
  function labelFor(key, dim, L) {
    if (key === "none") return dim === "issue" ? "No constitutional flag" : "No sanction wording";
    if (key === "all") return "All matching actions";
    if (key === "__other") return "Other";
    if (dim === "category") return L.categories[key] || key;
    if (dim === "sanction") return (L.sanctions[key] || {}).label || key;
    if (dim === "outcome") return L.outcomes[key] || key;
    if (dim === "issue") return L.kinds[key] || key;
    if (dim === "clarity") return key === "0" ? "No flag" : `Clarity: ${L.clarity[key]}`;
    if (dim === "impact") return key === "0" ? "No flag" : `Seriousness: ${L.impact[key]}`;
    return key;
  }

  function filterItems(items, st) {
    return items.filter((it) => {
      if (st.from && (it.date || "") < st.from) return false;
      if (st.to && (it.date || "") > st.to) return false;
      if (st.categories.length && !st.categories.includes(it.category)) return false;
      if (st.sanctions.length && !(it.sanctions || []).some((s) => st.sanctions.includes(s))) return false;
      if (st.outcomes.length && !st.outcomes.includes(it.outcome)) return false;
      if (st.flaggedOnly && !(it.flags || []).length) return false;
      return true;
    });
  }

  function aggregate(items, st, L) {
    const dim = st.type === "matrix" ? "none" : st.by;
    const totals = new Map();
    items.forEach((it) => keysFor(it, dim, L).forEach((k) => totals.set(k, (totals.get(k) || 0) + 1)));
    let keys = [...totals.keys()];
    const severityDim = dim === "clarity" || dim === "impact";
    if (severityDim) keys.sort((a, b) => b - a);
    else keys.sort((a, b) => (a === "none") - (b === "none") || totals.get(b) - totals.get(a));
    // At most five colored series; the rest fold into "Other" (never a generated sixth hue).
    let fold = new Set();
    if (!severityDim && st.type !== "bars" && keys.length > SERIES.length) {
      fold = new Set(keys.slice(SERIES.length));
      keys = keys.slice(0, SERIES.length).concat(["__other"]);
      totals.set("__other", [...fold].reduce((s, k) => s + totals.get(k), 0));
    }
    const colorOf = (k, i) => severityDim ? (SEV[k] || OTHER) : k === "__other" || k === "none" ? OTHER : SERIES[i] || OTHER;
    const series = keys.map((k, i) => ({ key: k, label: labelFor(k, dim, L), color: colorOf(k, i), total: totals.get(k) }));
    const buckets = st.from && st.to ? bucketRange(st.from, st.to, st.interval) : [];
    const grid = new Map(buckets.map((b) => [b, Object.fromEntries(keys.map((k) => [k, 0]))]));
    items.forEach((it) => {
      const row = grid.get(bucketOf(it.date, st.interval));
      if (!row) return;
      keysFor(it, dim, L).forEach((k) => { const kk = fold.has(k) ? "__other" : k; if (kk in row) row[kk]++; });
    });
    return { series, buckets, grid, dim };
  }

  // ------------------------------------------------------------- drawings
  const W = 960, H = 440, M = { l: 52, r: 20, t: 58, b: 64 };

  function frame(title, subtitle, body, h) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h || H}" role="img" aria-label="${esc(title)}" font-family="${esc(FONT)}">
      <rect width="${W}" height="${h || H}" fill="${SURFACE}" rx="12"/>
      <text x="${M.l}" y="28" fill="${TEXT}" font-family="${esc(SERIF)}" font-size="19">${esc(title)}</text>
      <text x="${M.l}" y="47" fill="${TEXT3}" font-size="12">${esc(subtitle)}</text>${body}</svg>`;
  }
  function yAxis(max, x0, x1, y0, y1) {
    let s = "";
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, y = y0 - (y0 - y1) * (i / 4);
      s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${GRID}"/>
        <text x="${x0 - 8}" y="${y + 4}" fill="${TEXT3}" font-size="11" text-anchor="end">${Math.round(v * 10) / 10}</text>`;
    }
    return s;
  }
  function xLabels(buckets, interval, x, y) {
    const every = Math.max(1, Math.ceil(buckets.length / 12));
    return buckets.map((b, i) => (i % every ? "" : `<text x="${x(i)}" y="${y}" fill="${TEXT3}" font-size="11" text-anchor="middle">${esc(bucketLabel(b, interval))}</text>`)).join("");
  }
  function roundTop(x, y, w, h, r) {
    r = Math.min(r, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function drawStacked(a, st, title, sub) {
    const { series, buckets, grid } = a;
    const x0 = M.l, x1 = W - M.r, y0 = H - M.b, y1 = M.t + 10;
    const max = niceMax(Math.max(1, ...buckets.map((b) => series.reduce((s, se) => s + grid.get(b)[se.key], 0))));
    const bw = (x1 - x0) / Math.max(1, buckets.length);
    const barW = Math.max(2, Math.min(42, bw * 0.7));
    const xc = (i) => x0 + bw * i + bw / 2;
    let marks = "";
    buckets.forEach((b, i) => {
      let y = y0; const row = grid.get(b);
      const live = series.filter((se) => row[se.key] > 0);
      live.forEach((se, j) => {
        const h = ((y0 - y1) * row[se.key]) / max; const top = y - h;
        const gap = j < live.length - 1 ? 0 : 0;
        const hh = Math.max(0, h - (j > 0 ? 2 : 0) - gap); // 2px surface gap between stacked fills
        marks += j === live.length - 1
          ? `<path d="${roundTop(xc(i) - barW / 2, top, barW, hh, 4)}" fill="${se.color}"/>`
          : `<rect x="${xc(i) - barW / 2}" y="${top}" width="${barW}" height="${hh}" fill="${se.color}"/>`;
        y = top;
      });
      marks += `<rect class="hit" x="${x0 + bw * i}" y="${y1}" width="${bw}" height="${y0 - y1}" fill="transparent"
        data-tip="${esc(bucketLabel(b, st.interval) + "|" + series.map((se) => `${se.label}: ${row[se.key]}`).join("|"))}"/>`;
    });
    return frame(title, sub, yAxis(max, x0, x1, y0, y1) + marks + xLabels(buckets, st.interval, xc, y0 + 20) +
      `<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" stroke="${TEXT3}"/>`);
  }

  function drawLines(a, st, title, sub) {
    const { series, buckets, grid } = a;
    const x0 = M.l, x1 = W - M.r - 130, y0 = H - M.b, y1 = M.t + 10;
    const max = niceMax(Math.max(1, ...buckets.flatMap((b) => series.map((se) => grid.get(b)[se.key]))));
    const xc = (i) => (buckets.length < 2 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (buckets.length - 1));
    const yc = (v) => y0 - ((y0 - y1) * v) / max;
    let marks = "";
    series.forEach((se) => {
      const pts = buckets.map((b, i) => `${xc(i)},${yc(grid.get(b)[se.key])}`).join(" ");
      marks += `<polyline points="${pts}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (buckets.length <= 40) buckets.forEach((b, i) => { marks += `<circle cx="${xc(i)}" cy="${yc(grid.get(b)[se.key])}" r="4" fill="${se.color}" stroke="${SURFACE}" stroke-width="2"/>`; });
      // direct label at the line end (up to four series)
      if (series.length <= 4 && buckets.length) {
        const last = buckets[buckets.length - 1];
        marks += `<text x="${xc(buckets.length - 1) + 10}" y="${yc(grid.get(last)[se.key]) + 4}" fill="${TEXT2}" font-size="11">${esc(se.label.slice(0, 22))}</text>`;
      }
    });
    const step = buckets.length < 2 ? (x1 - x0) : (x1 - x0) / (buckets.length - 1);
    buckets.forEach((b, i) => {
      const row = grid.get(b);
      marks += `<rect class="hit" data-x="${xc(i)}" x="${xc(i) - step / 2}" y="${y1}" width="${step}" height="${y0 - y1}" fill="transparent"
        data-tip="${esc(bucketLabel(b, st.interval) + "|" + series.map((se) => `${se.label}: ${row[se.key]}`).join("|"))}"/>`;
    });
    return frame(title, sub, yAxis(max, x0, x1, y0, y1) + `<line class="cross" x1="0" x2="0" y1="${y1}" y2="${y0}" stroke="${TEXT3}" stroke-dasharray="3 3" visibility="hidden"/>` +
      marks + xLabels(buckets, st.interval, xc, y0 + 20) + `<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y0}" stroke="${TEXT3}"/>`);
  }

  function drawTotals(a, st, title, sub) {
    const rows = a.series.slice(0, 18);
    const rowH = 30, h = M.t + 20 + rows.length * rowH + 30;
    const labelW = 280, x0 = M.l + labelW, x1 = W - M.r - 50;
    const max = Math.max(1, ...rows.map((r) => r.total));
    let s = "";
    rows.forEach((r, i) => {
      const y = M.t + 20 + i * rowH, w = Math.max(2, ((x1 - x0) * r.total) / max);
      const color = a.dim === "clarity" || a.dim === "impact" ? r.color : r.key === "none" || r.key === "__other" ? OTHER : SERIES[0];
      s += `<text x="${x0 - 12}" y="${y + 15}" fill="${TEXT2}" font-size="12" text-anchor="end">${esc(r.label.length > 44 ? r.label.slice(0, 43) + "…" : r.label)}</text>
        <path d="M${x0},${y + 4}H${x0 + w - 4}Q${x0 + w},${y + 4} ${x0 + w},${y + 8}V${y + 16}Q${x0 + w},${y + 20} ${x0 + w - 4},${y + 20}H${x0}Z" fill="${color}"/>
        <text x="${x0 + w + 8}" y="${y + 16}" fill="${TEXT}" font-size="12">${r.total}</text>
        <rect class="hit" x="${M.l}" y="${y}" width="${W - M.l - M.r}" height="${rowH}" fill="transparent" data-tip="${esc(r.label + "|" + r.total + " actions")}"/>`;
    });
    if (!rows.length) s = `<text x="${M.l}" y="${M.t + 40}" fill="${TEXT3}">No matching actions.</text>`;
    return frame(title, sub, s, Math.max(h, 160));
  }

  function drawDonut(a, st, title, sub) {
    const total = a.series.reduce((s, r) => s + r.total, 0);
    const cx = 260, cy = (H + M.t) / 2, R = 140, r = 86;
    let s = "", ang = -Math.PI / 2;
    const pt = (rad, t) => [cx + rad * Math.cos(t), cy + rad * Math.sin(t)];
    a.series.forEach((se) => {
      if (!se.total) return;
      const sweep = (se.total / total) * Math.PI * 2;
      const t0 = ang, t1 = ang + sweep; ang = t1;
      const large = sweep > Math.PI ? 1 : 0;
      const [ax, ay] = pt(R, t0), [bx, by] = pt(R, t1 - 0.0001), [cx2, cy2] = pt(r, t1 - 0.0001), [dx, dy] = pt(r, t0);
      s += `<path d="M${ax},${ay}A${R},${R} 0 ${large} 1 ${bx},${by}L${cx2},${cy2}A${r},${r} 0 ${large} 0 ${dx},${dy}Z" fill="${se.color}"
        stroke="${SURFACE}" stroke-width="2" class="hit" data-tip="${esc(`${se.label}|${se.total} (${Math.round((100 * se.total) / total)}%)`)}"/>`;
    });
    s += `<text x="${cx}" y="${cy - 2}" fill="${TEXT}" font-family="${esc(SERIF)}" font-size="34" text-anchor="middle">${total}</text>
      <text x="${cx}" y="${cy + 20}" fill="${TEXT3}" font-size="12" text-anchor="middle">${a.dim === "sanction" || a.dim === "issue" ? "tags" : "actions"}</text>`;
    a.series.forEach((se, i) => {
      const y = M.t + 40 + i * 30;
      s += `<rect x="500" y="${y - 10}" width="12" height="12" rx="2" fill="${se.color}"/>
        <text x="522" y="${y}" fill="${TEXT2}" font-size="13">${esc(se.label.length > 46 ? se.label.slice(0, 45) + "…" : se.label)}</text>
        <text x="${W - M.r}" y="${y}" fill="${TEXT}" font-size="13" text-anchor="end">${se.total} (${total ? Math.round((100 * se.total) / total) : 0}%)</text>`;
    });
    if (!total) s = `<text x="${M.l}" y="${M.t + 40}" fill="${TEXT3}">No matching actions.</text>`;
    return frame(title, sub, s);
  }

  function drawMatrix(items, st, L, title, sub) {
    const counts = {}; items.forEach((it) => { if (it.severity) { const k = `${it.severity.clarity}${it.severity.impact}`; counts[k] = (counts[k] || 0) + 1; } });
    const x0 = 250, y0 = M.t + 50, cw = 200, ch = 92;
    let s = "";
    [3, 2, 1].forEach((imp, j) => { s += `<text x="${x0 + j * cw + cw / 2}" y="${y0 - 14}" fill="${TEXT2}" font-size="13" text-anchor="middle">Seriousness: ${esc(L.impact[imp])}</text>`; });
    [3, 2, 1].forEach((cla, i) => {
      s += `<text x="${x0 - 14}" y="${y0 + i * ch + ch / 2 + 4}" fill="${TEXT2}" font-size="13" text-anchor="end">Clarity: ${esc(L.clarity[cla])}</text>`;
      [3, 2, 1].forEach((imp, j) => {
        const n = counts[`${cla}${imp}`] || 0, score = cla * imp;
        const c = score >= 6 ? SEV[3] : score >= 3 ? SEV[2] : SEV[1];
        s += `<rect x="${x0 + j * cw + 3}" y="${y0 + i * ch + 3}" width="${cw - 6}" height="${ch - 6}" rx="8" fill="${c}" fill-opacity="${n ? 0.28 : 0.07}" stroke="${c}" stroke-opacity="${n ? 0.8 : 0.25}"
          class="hit" data-tip="${esc(`Clarity ${L.clarity[cla]}, seriousness ${L.impact[imp]}|${n} flagged actions`)}"/>
          <text x="${x0 + j * cw + cw / 2}" y="${y0 + i * ch + ch / 2 + 10}" fill="${n ? TEXT : TEXT3}" font-family="${esc(SERIF)}" font-size="28" text-anchor="middle">${n}</text>`;
      });
    });
    return frame(title, sub, s, y0 + 3 * ch + 40);
  }

  // -------------------------------------------------------------- the UI
  function defaults(items) {
    const dates = items.map((i) => i.date).filter(Boolean).sort();
    return { type: "stacked", by: "category", interval: "week", from: dates[0] || "", to: dates[dates.length - 1] || "",
      categories: [], sanctions: [], outcomes: [], flaggedOnly: false, table: false };
  }

  function render(host, items, ctx) {
    const L = ctx.labels;
    const st = ctx.state || (ctx.state = defaults(items));
    const present = (key) => [...new Set(items.flatMap((i) => key(i)))];
    const cats = present((i) => [i.category]);
    const sancs = present((i) => i.sanctions || []);
    const outs = present((i) => [i.outcome]);
    const check = (name, val, label, on) => `<label><input type="checkbox" data-arr="${name}" value="${esc(val)}" ${on ? "checked" : ""}> ${esc(label)}</label>`;
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;

    host.innerHTML = `<div class="chart-builder">
      <form class="chart-controls" id="cc" onsubmit="return false">
        <div class="ctl"><span>Chart</span><select data-k="type">
          ${opt("stacked", "Stacked bars over time", st.type)}${opt("lines", "Lines over time", st.type)}${opt("bars", "Totals (bar chart)", st.type)}
          ${opt("donut", "Share of total (donut)", st.type)}${opt("matrix", "Clarity × seriousness grid", st.type)}</select></div>
        <div class="ctl" ${st.type === "matrix" ? "hidden" : ""}><span>Break down by</span><select data-k="by">
          ${opt("category", "Kind of action", st.by)}${opt("subcategory", "Specific type of document", st.by)}${opt("sanction", "Sanction imposed or sought", st.by)}
          ${opt("outcome", "Outcome", st.by)}${opt("issue", "Constitutional issue", st.by)}${opt("clarity", "Clarity rating", st.by)}
          ${opt("impact", "Seriousness rating", st.by)}${opt("none", "Nothing (one total)", st.by)}</select></div>
        <div class="ctl" ${st.type === "stacked" || st.type === "lines" ? "" : "hidden"}><span>Group dates by</span><select data-k="interval">
          ${opt("day", "Day", st.interval)}${opt("week", "Week", st.interval)}${opt("month", "Month", st.interval)}</select></div>
        <div class="ctl"><span>Time period</span><div class="row" style="margin:0">
          <input type="date" data-k="from" value="${esc(st.from)}" aria-label="From"><input type="date" data-k="to" value="${esc(st.to)}" aria-label="To"></div></div>
        <div class="ctl"><span>Kinds of action ${st.categories.length ? "" : "(all)"}</span><div class="checks">${cats.map((c) => check("categories", c, L.categories[c] || c, st.categories.includes(c))).join("")}</div></div>
        <div class="ctl"><span>Sanctions ${st.sanctions.length ? "" : "(any)"}</span><div class="checks">${sancs.length ? sancs.map((s) => check("sanctions", s, (L.sanctions[s] || {}).label || s, st.sanctions.includes(s))).join("") : '<span class="muted small">None recorded for this agency yet.</span>'}</div></div>
        <div class="ctl"><span>Outcomes ${st.outcomes.length ? "" : "(any)"}</span><div class="checks">${outs.map((o) => check("outcomes", o, L.outcomes[o] || o, st.outcomes.includes(o))).join("")}</div></div>
        <div class="ctl"><label class="small"><input type="checkbox" data-k="flaggedOnly" ${st.flaggedOnly ? "checked" : ""}> Only actions with a constitutional flag</label></div>
        <div class="row"><button type="button" class="btn small" data-x="png">Download PNG</button><button type="button" class="btn ghost small" data-x="svg">SVG</button>
          <button type="button" class="btn ghost small" data-x="csv">CSV</button><button type="button" class="btn ghost small" data-x="reset">Reset</button></div>
      </form>
      <div><div class="chart-stage" id="stage"></div><div class="legend" id="legend"></div>
        <p><button type="button" class="btn ghost small" data-x="table">${st.table ? "Hide" : "Show"} the numbers as a table</button></p>
        <div id="ctable"></div></div></div>`;

    const data = filterItems(items, st);
    const what = { category: "kind of action", subcategory: "type of document", sanction: "sanction", outcome: "outcome",
      issue: "constitutional issue", clarity: "clarity", impact: "seriousness", none: "" }[st.by];
    const span = st.from && st.to ? `${fmt(st.from, { month: "short", day: "numeric", year: "numeric" })} – ${fmt(st.to, { month: "short", day: "numeric", year: "numeric" })}` : "";
    const title = `${ctx.entityName}: ${st.type === "matrix" ? "flagged actions by clarity and seriousness" : `actions${st.type === "stacked" || st.type === "lines" ? ` per ${st.interval}` : ""}${what ? ` by ${what}` : ""}`}`;
    const filtersSaid = [st.categories.length && `kinds: ${st.categories.map((c) => L.categories[c]).join(", ")}`,
      st.sanctions.length && `sanctions: ${st.sanctions.map((s) => (L.sanctions[s] || {}).short || s).join(", ")}`,
      st.outcomes.length && `outcomes: ${st.outcomes.map((o) => L.outcomes[o]).join(", ")}`, st.flaggedOnly && "flagged only"].filter(Boolean).join("; ");
    const sub = `${data.length} matching actions${span ? `, ${span}` : ""}${filtersSaid ? `. Filters: ${filtersSaid}` : ""}. Source: RegHunter`;

    let svg, agg = null;
    if (st.type === "matrix") svg = drawMatrix(data, st, L, title, sub);
    else {
      agg = aggregate(data, st, L);
      svg = st.type === "lines" ? drawLines(agg, st, title, sub) : st.type === "bars" ? drawTotals(agg, st, title, sub)
        : st.type === "donut" ? drawDonut(agg, st, title, sub) : drawStacked(agg, st, title, sub);
    }
    const stage = host.querySelector("#stage");
    stage.innerHTML = svg;
    if (agg && agg.series.length > 1 && st.type !== "donut" && st.type !== "bars")
      host.querySelector("#legend").innerHTML = agg.series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} (${s.total})</span>`).join("");
    if (agg && (agg.dim === "sanction" || agg.dim === "issue")) host.querySelector("#legend").insertAdjacentHTML("beforeend",
      `<span class="muted">An action with several ${agg.dim === "sanction" ? "sanctions" : "issues"} is counted once for each.</span>`);

    // table view (accessibility and checking)
    const rowsForCsv = tableRows(st, agg, data, L);
    if (st.table) host.querySelector("#ctable").innerHTML = `<div class="wrap-x"><table class="t"><thead><tr>${rowsForCsv[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rowsForCsv.slice(1).map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

    bindTips(stage);
    const rerender = () => render(host, items, ctx);
    host.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", () => {
      const k = el.dataset.k; st[k] = el.type === "checkbox" ? el.checked : el.value; rerender();
    }));
    host.querySelectorAll("[data-arr]").forEach((el) => el.addEventListener("change", () => {
      const k = el.dataset.arr; st[k] = [...host.querySelectorAll(`[data-arr="${k}"]:checked`)].map((x) => x.value); rerender();
    }));
    host.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => {
      const x = b.dataset.x, name = `reghunter-${ctx.fileKey}-${st.type}`;
      if (x === "svg") download(`${name}.svg`, new Blob([stage.innerHTML], { type: "image/svg+xml" }));
      if (x === "png") toPng(stage.querySelector("svg"), (blob) => download(`${name}.png`, blob));
      if (x === "csv") download(`${name}.csv`, new Blob(["﻿" + rowsForCsv.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv" }));
      if (x === "table") { st.table = !st.table; rerender(); }
      if (x === "reset") { ctx.state = defaults(items); render(host, items, ctx); }
    }));
  }

  function tableRows(st, agg, data, L) {
    if (!agg) {
      const rows = [["Clarity", "Seriousness: Severe", "Seriousness: Significant", "Seriousness: Moderate"]];
      [3, 2, 1].forEach((c) => rows.push([L.clarity[c], ...[3, 2, 1].map((i) => data.filter((it) => it.severity && it.severity.clarity === c && it.severity.impact === i).length)]));
      return rows;
    }
    if (st.type === "stacked" || st.type === "lines")
      return [["Period", ...agg.series.map((s) => s.label)], ...agg.buckets.map((b) => [b, ...agg.series.map((s) => agg.grid.get(b)[s.key])])];
    return [["Group", "Count"], ...agg.series.map((s) => [s.label, s.total])];
  }

  function bindTips(stage) {
    let tip = document.querySelector(".charttip");
    if (!tip) { tip = document.createElement("div"); tip.className = "charttip"; tip.hidden = true; document.body.appendChild(tip); }
    const cross = stage.querySelector(".cross");
    stage.querySelectorAll(".hit").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const [head, ...rest] = el.dataset.tip.split("|");
        tip.innerHTML = `<strong>${esc(head)}</strong>${rest.map((r) => `<br>${esc(r)}`).join("")}`;
        tip.hidden = false;
        tip.style.left = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8) + "px";
        tip.style.top = e.clientY + 14 + "px";
        if (cross && el.dataset.x) { cross.setAttribute("x1", el.dataset.x); cross.setAttribute("x2", el.dataset.x); cross.setAttribute("visibility", "visible"); }
      });
      el.addEventListener("mouseleave", () => { tip.hidden = true; if (cross) cross.setAttribute("visibility", "hidden"); });
    });
  }

  function download(name, blob) {
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
  }
  function toPng(svgEl, done) {
    const vb = svgEl.viewBox.baseVal, scale = 2;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = vb.width * scale; c.height = vb.height * scale;
      const g = c.getContext("2d"); g.scale(scale, scale); g.drawImage(img, 0, 0, vb.width, vb.height);
      c.toBlob(done, "image/png");
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(svgEl));
  }

  window.RHCharts = { render };
})();
