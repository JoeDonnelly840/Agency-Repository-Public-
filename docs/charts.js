/* RegCollect chart builder: per-agency visuals, drawn as SVG with no outside libraries.
 * Chart types: stacked bars over time, lines over time, totals, and share (donut).
 * Every chart can be exported as PNG, SVG, or CSV, and the export carries its own title, legend,
 * and notes, so it stands on its own in a brief or a slide.
 *
 * Time axes have two tiers: the fine unit (months, quarters, weeks, or days) where there is room,
 * and the coarse unit (years, or months for daily charts) centered under its span with boundary
 * ticks. A period cut short by the chosen dates (such as the current month) is drawn lighter and
 * noted under the chart.
 *
 * Series colors were checked with a colorblind-safety validator against the dark chart surface
 * (all checks pass). Red, orange, and yellow are deliberately absent: they mean the lawfulness
 * rating everywhere in RegCollect and are used only when a chart is broken down by that rating.
 * Impact is context only, so it is drawn in ordinary series colors. Colors follow the series, not
 * its rank in the current view, so changing the dates never repaints a series.
 */
(function () {
  "use strict";

  const SURFACE = "#14171b";
  const TEXT = "#e8ebf0", TEXT2 = "#b4bcc8", TEXT3 = "#8a94a3", GRID = "rgba(232,235,240,0.09)", AXIS = "rgba(232,235,240,0.28)";
  const SERIES = ["#338ced", "#e24d8b", "#0aac23", "#9887ef", "#00a888"]; // validated order; never cycled
  const OTHER = "#5b616b";
  const SEV = { 3: "#ef5148", 2: "#f39232", 1: "#f2cb4c", 0: OTHER };
  const IMPACT_COLORS = { 3: SERIES[3], 2: SERIES[0], 1: SERIES[4], 0: OTHER };
  // Kinds of action always wear the same color.
  // Kinds of action always wear the same color, stacked in palette order so neighbors stay distinguishable;
  // "Other notices" (meetings, paperwork) is gray so the substantive kinds stand out.
  const CATEGORY_COLORS = { rulemaking: SERIES[0], enforcement: SERIES[1], adjudication: SERIES[2], presidential: SERIES[3], other: OTHER };
  const CATEGORY_ORDER = ["rulemaking", "enforcement", "adjudication", "presidential", "other"];
  const FONT = "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
  const MONO = "'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (v) => Number(v || 0).toLocaleString("en-US");
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayObj = (s) => new Date(s + "T12:00:00");
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const longDay = (s) => { const d = dayObj(s); return `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`; };
  const textW = (s, size) => String(s).length * (size || 11) * 0.56;   // rough width of a label, for spacing

  // -------------------------------------------------------------- time buckets
  const UNIT = { day: "day", week: "week", month: "month", quarter: "quarter", year: "year" };
  function bucketOf(date, interval) {
    const d = dayObj(date);
    if (interval === "year") return `${d.getFullYear()}-01-01`;
    if (interval === "quarter") return `${d.getFullYear()}-${pad(Math.floor(d.getMonth() / 3) * 3 + 1)}-01`;
    if (interval === "month") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
    if (interval === "week") { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); }
    return date;
  }
  function nextBucket(b, interval) {
    const d = dayObj(b);
    if (interval === "year") return `${d.getFullYear() + 1}-01-01`;
    if (interval === "quarter") return ymd(new Date(d.getFullYear(), d.getMonth() + 3, 1, 12));
    if (interval === "month") return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 1, 12));
    d.setDate(d.getDate() + (interval === "week" ? 7 : 1));
    return ymd(d);
  }
  const lastDay = (b, interval) => { const d = dayObj(nextBucket(b, interval)); d.setDate(d.getDate() - 1); return ymd(d); };
  function bucketRange(from, to, interval) {
    const out = []; let b = bucketOf(from, interval);
    while (b <= to && out.length < 1200) { out.push(b); b = nextBucket(b, interval); }
    return out;
  }
  /** Full name of a period, for tooltips and the table. */
  function periodName(b, interval) {
    const d = dayObj(b);
    if (interval === "year") return String(d.getFullYear());
    if (interval === "quarter") { const q = Math.floor(d.getMonth() / 3); return `Q${q + 1} ${d.getFullYear()} (${MON[q * 3]}–${MON[q * 3 + 2]})`; }
    if (interval === "month") return `${MONTH[d.getMonth()]} ${d.getFullYear()}`;
    if (interval === "week") return `Week of ${longDay(b)}`;
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  /** Pick the interval that gives a readable number of bars (about 60 or fewer). */
  function autoInterval(from, to) {
    const days = (dayObj(to) - dayObj(from)) / 864e5;
    return days <= 62 ? "day" : days <= 430 ? "week" : days <= 5.2 * 365 ? "month" : days <= 16 * 365 ? "quarter" : "year";
  }

  /** Whole-number axis for counts: a "nice" step (1, 2, 5 × 10^n) and 4 to 6 gridlines. */
  function niceAxis(maxVal) {
    maxVal = Math.max(1, maxVal);
    const raw = maxVal / 5, mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag);
    return { max: Math.ceil(maxVal / step) * step, step };
  }

  // -------------------------------------------------------------- the data
  /** keys an item belongs to for a breakdown dimension */
  function keysFor(it, dim) {
    switch (dim) {
      case "category": return [it.category || "other"];
      case "subcategory": return [it.subcategory || "Other"];
      case "sanction": return (it.sanctions || []).length ? it.sanctions : ["none"];
      case "outcome": return [it.outcome || "notice"];
      case "issue": { const r = (it.flags || []).filter((f) => f.level); return r.length ? [...new Set(r.map((f) => f.code))] : ["none"]; }
      case "level": return [it.rating ? String(it.rating.level) : "0"];
      case "impact": return [String((it.impact || {}).level || 0)];
      default: return ["all"];
    }
  }
  function labelFor(key, dim, L) {
    if (key === "none") return dim === "issue" ? "No rated issue" : "No sanction wording";
    if (key === "all") return "All matching actions";
    if (key === "__other") return "Other";
    if (dim === "category") return L.categories[key] || key;
    if (dim === "sanction") return (L.sanctions[key] || {}).label || key;
    if (dim === "outcome") return L.outcomes[key] || key;
    if (dim === "issue") return (L.kinds[key] || key).split(" (")[0];
    if (dim === "level") return key === "0" ? "Not rated" : L.level[key];
    if (dim === "impact") return key === "0" ? "No impact recorded" : L.impact[key];
    return key;
  }
  const ORDERED = { level: ["3", "2", "1", "0"], impact: ["3", "2", "1", "0"] };

  function filterItems(items, st, ignoreDates) {
    return items.filter((it) => {
      if (!ignoreDates && st.from && (it.date || "") < st.from) return false;
      if (!ignoreDates && st.to && (it.date || "") > st.to) return false;
      if (st.categories.length && !st.categories.includes(it.category)) return false;
      if (st.sanctions.length && !(it.sanctions || []).some((s) => st.sanctions.includes(s))) return false;
      if (st.outcomes.length && !st.outcomes.includes(it.outcome)) return false;
      if (st.flaggedOnly && !it.rating) return false;
      if (!st.routine && it.routine) return false;
      return true;
    });
  }

  /** Series, buckets, and counts. Color slots come from the ranking over all dates, so moving the
   *  date range never repaints a series. */
  function aggregate(data, everyDate, st, L) {
    const dim = st.by === "none" ? "all" : st.by;
    const totals = new Map();
    data.forEach((it) => keysFor(it, dim).forEach((k) => totals.set(k, (totals.get(k) || 0) + 1)));
    // Actions with no sanction (or no rated issue) would swamp a chart about sanctions (or issues); they're counted in a note instead.
    const left = (dim === "sanction" || dim === "issue") ? totals.get("none") || 0 : 0;
    totals.delete(left ? "none" : "\u0000");
    let palette = null, keys;
    if (ORDERED[dim]) keys = ORDERED[dim].filter((k) => totals.has(k));
    else if (dim === "category") keys = [...CATEGORY_ORDER.filter((k) => totals.has(k)), ...[...totals.keys()].filter((k) => !CATEGORY_ORDER.includes(k))];
    else {
      const rank = new Map();
      everyDate.forEach((it) => keysFor(it, dim).forEach((k) => rank.set(k, (rank.get(k) || 0) + 1)));
      const ranked = [...rank.keys()].filter((k) => k !== "none").sort((a, b) => rank.get(b) - rank.get(a) || String(a).localeCompare(String(b)));
      palette = new Map(ranked.slice(0, SERIES.length).map((k, i) => [k, SERIES[i]]));
      const order = new Map(ranked.map((k, i) => [k, i]));
      // stacked and listed in palette order, so neighbors are the validated neighbor pairs
      keys = [...totals.keys()].sort((a, b) => (a === "none") - (b === "none") || (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9));
    }
    const colorOf = (k) => dim === "level" ? SEV[k] : dim === "impact" ? IMPACT_COLORS[k] : dim === "category" ? CATEGORY_COLORS[k] || OTHER
      : dim === "all" ? SERIES[0] : (palette.get(k) || OTHER);
    // At most five colored series; the rest fold into "Other" (never a generated sixth hue).
    let fold = new Set();
    if (palette && st.type !== "bars") {
      const colored = keys.filter((k) => palette.has(k));
      const rest = keys.filter((k) => !palette.has(k));
      if (rest.length > 1 || (rest.length === 1 && rest[0] !== "none" && colored.length >= SERIES.length)) {
        fold = new Set(rest);
        keys = colored.concat(["__other"]);
        totals.set("__other", rest.reduce((s, k) => s + totals.get(k), 0));
      }
    }
    const series = keys.map((k) => ({ key: k, label: labelFor(k, dim, L), color: k === "__other" || k === "none" ? OTHER : colorOf(k), total: totals.get(k) }));
    const buckets = st.from && st.to ? bucketRange(st.from, st.to, st.interval) : [];
    const grid = new Map(buckets.map((b) => [b, Object.fromEntries(keys.map((k) => [k, 0]))]));
    data.forEach((it) => {
      const row = grid.get(bucketOf(it.date, st.interval));
      if (!row) return;
      keysFor(it, dim).forEach((k) => { const kk = fold.has(k) ? "__other" : k; if (kk in row) row[kk]++; });
    });
    // periods the chosen dates cut short (usually the current month or quarter)
    const partial = new Set(buckets.filter((b, i) => (i === buckets.length - 1 && lastDay(b, st.interval) > st.to) || (i === 0 && b < st.from)));
    return { series, buckets, grid, dim, partial, left, multi: dim === "sanction" || dim === "issue" };
  }

  // ------------------------------------------------------------- drawings
  const W = 960, M = { l: 64, r: 24 };
  const PLOT_H = 300;

  /** Title, subtitle, and a legend that wraps; returns the svg header and where the plot may start. */
  function header(title, subtitle, series, showLegend) {
    let s = `<text x="${M.l - 40}" y="30" fill="${TEXT}" font-weight="600" font-size="17">${esc(title)}</text>
      <text x="${M.l - 40}" y="50" fill="${TEXT3}" font-size="12">${esc(subtitle)}</text>`;
    let y = 50;
    if (showLegend && series.length > 1) {
      let x = M.l - 40; y = 78;
      series.forEach((se) => {
        const label = `${se.label.length > 40 ? se.label.slice(0, 39) + "…" : se.label}`, count = num(se.total);
        const w = 16 + textW(label, 12) + 6 + textW(count, 11) + 22;
        if (x + w > W - M.r && x > M.l - 40) { x = M.l - 40; y += 22; }
        s += `<rect x="${x}" y="${y - 9}" width="10" height="10" rx="2" fill="${se.color}"/>
          <text x="${x + 16}" y="${y}" fill="${TEXT2}" font-size="12">${esc(label)} <tspan fill="${TEXT3}" font-family="${esc(MONO)}" font-size="11">${count}</tspan></text>`;
        x += w;
      });
    }
    return { s, top: y + 34 };
  }
  function footer(lines, y) {
    return lines.filter(Boolean).map((t, i) => `<text x="${M.l - 40}" y="${y + i * 16}" fill="${TEXT3}" font-size="11">${esc(t)}</text>`).join("");
  }
  function frame(title, h, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img" aria-label="${esc(title)}" font-family="${esc(FONT)}">
      <rect width="${W}" height="${h}" fill="${SURFACE}" rx="12"/>${body}</svg>`;
  }
  function yAxis(max, step, x0, x1, y0, y1, unit) {
    let s = "";
    for (let v = 0; v <= max + 1e-9; v += step) {
      const y = y0 - (y0 - y1) * (v / max);
      s += `<line x1="${x0}" x2="${x1}" y1="${y}" y2="${y}" stroke="${v === 0 ? AXIS : GRID}"/>
        <text x="${x0 - 8}" y="${y + 4}" fill="${TEXT3}" font-size="11" font-family="${esc(MONO)}" text-anchor="end">${num(v)}</text>`;
    }
    return s + `<text x="${M.l - 40}" y="${y1 - 14}" fill="${TEXT3}" font-size="11">${esc(unit)}</text>`;
  }

  /** The two-tier time axis. xs[i] is the center of bucket i; bw is the width of one bucket. */
  function timeAxis(buckets, interval, xs, bw, y0) {
    if (!buckets.length) return "";
    let s = "";
    const d = buckets.map(dayObj);
    // tier 1: the fine unit, labeled only where there is room
    let minor = null;
    if (interval === "month") {
      const stride = [1, 2, 3, 6].find((k) => bw * k >= 30);
      if (stride) minor = (i) => (d[i].getMonth() % stride === 0 ? MON[d[i].getMonth()] : "");
    } else if (interval === "quarter") {
      const stride = [1, 2].find((k) => bw * k >= 26);
      if (stride) minor = (i) => (Math.floor(d[i].getMonth() / 3) % stride === 0 ? `Q${Math.floor(d[i].getMonth() / 3) + 1}` : "");
    } else if (interval === "week") {
      const room = bw * 4.3 >= 30;
      minor = (i) => (room && (i === 0 || d[i].getMonth() !== d[i - 1].getMonth()) && d[i].getDate() <= 7 ? MON[d[i].getMonth()] : "");
    } else if (interval === "day") {
      // days 1, 1+k, 1+2k, ... in each month, skipping a last label that would crowd the next month's 1
      const stride = [1, 2, 7, 14].find((k) => bw * k >= 24);
      const monthLen = (x) => new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
      if (stride) minor = (i) => ((d[i].getDate() - 1) % stride === 0 && d[i].getDate() + stride - 1 <= monthLen(d[i]) ? String(d[i].getDate()) : "");
    } else if (interval === "year") {
      const stride = [1, 2, 5].find((k) => bw * k >= 40) || 10;
      minor = (i) => (d[i].getFullYear() % stride === 0 || buckets.length <= 12 ? String(d[i].getFullYear()) : "");
    }
    if (minor) buckets.forEach((b, i) => {
      const t = minor(i);
      if (t) s += `<line x1="${xs[i]}" x2="${xs[i]}" y1="${y0}" y2="${y0 + 4}" stroke="${AXIS}"/><text x="${xs[i]}" y="${y0 + 17}" fill="${TEXT3}" font-size="11" text-anchor="middle">${esc(t)}</text>`;
    });
    if (interval === "year") return s;
    // tier 2: years (or months, for daily charts), centered under their span, with boundary ticks
    const groupOf = (i) => (interval === "day" ? `${d[i].getFullYear()}-${d[i].getMonth()}` : String(d[i].getFullYear()));
    const nameOf = (i) => (interval === "day" ? `${MONTH[d[i].getMonth()]} ${d[i].getFullYear()}` : String(d[i].getFullYear()));
    const ty = minor ? y0 + 36 : y0 + 18;
    let start = 0;
    for (let i = 1; i <= buckets.length; i++) {
      if (i < buckets.length && groupOf(i) === groupOf(start)) continue;
      const left = xs[start] - bw / 2, right = xs[i - 1] + bw / 2, label = nameOf(start);
      if (start > 0) s += `<line x1="${left}" x2="${left}" y1="${y0}" y2="${y0 + 5}" stroke="${AXIS}"/><line x1="${left}" x2="${left}" y1="${minor ? y0 + 24 : y0}" y2="${ty + 4}" stroke="${AXIS}"/>`;
      const wide = right - left >= textW(label, 12) + 8;
      const short = interval === "day" ? `${MON[d[start].getMonth()]}` : `’${String(d[start].getFullYear()).slice(2)}`;
      const t = wide ? label : right - left >= textW(short, 12) + 4 ? short : "";
      if (t) s += `<text x="${(left + right) / 2}" y="${ty}" fill="${TEXT2}" font-size="12" font-weight="500" text-anchor="middle">${esc(t)}</text>`;
      start = i;
    }
    return s;
  }
  const axisBand = (interval) => (interval === "year" ? 26 : 46);
  const unitWord = (st) => `Actions per ${UNIT[st.interval]}`;

  function notes(a, st) {
    const out = [];
    if (a.partial.size > 1) out.push(`Faded ${st.type === "lines" ? "segments" : "bars"}: the first and last periods are only partly inside the chosen dates.`);
    else if (a.partial.size) {
      const b = [...a.partial].pop();
      const what = st.type === "lines" ? "Faded segment" : "Faded bar";
      out.push(b >= bucketOf(st.to, st.interval) && lastDay(b, st.interval) > st.to
        ? `${what}: ${periodName(b, st.interval).replace(/ \(.*\)$/, "")} is partial (through ${longDay(st.to)}).` : `Faded ${st.type === "lines" ? "segments" : "bars"} are partial periods.`);
    }
    if (a.multi) out.push(`An action with several ${a.dim === "sanction" ? "sanctions" : "issues"} counts once for each.${a.left ? ` Not shown: ${num(a.left)} action${a.left === 1 ? "" : "s"} with no ${a.dim === "sanction" ? "sanction wording" : "rated issue"}.` : ""}`);
    out.push("Source: RegCollect, from the Federal Register, Regulations.gov, and agency feeds. Dated by the agency's action date.");
    return out;
  }
  const tipFor = (a, st, b) => {
    const row = a.grid.get(b), tot = a.series.reduce((s, se) => s + row[se.key], 0);
    const lines = a.series.filter((se) => row[se.key] || a.series.length <= 6).map((se) => `${se.label}: ${num(row[se.key])}`);
    return [periodName(b, st.interval) + (a.partial.has(b) ? " (partial)" : ""), ...(a.series.length > 1 ? [...lines, `Total: ${num(tot)}`] : [`${num(tot)} actions`])].join("|");
  };
  function roundTop(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function drawStacked(a, st, title, sub) {
    const { series, buckets, grid } = a;
    const hd = header(title, sub, series, true);
    const x0 = M.l, x1 = W - M.r, y1 = hd.top + 8, y0 = y1 + PLOT_H;
    const { max, step } = niceAxis(Math.max(1, ...buckets.map((b) => series.reduce((s, se) => s + grid.get(b)[se.key], 0))));
    const bw = (x1 - x0) / Math.max(1, buckets.length);
    const barW = Math.max(1, Math.min(46, bw - Math.max(1.5, bw * 0.22)));
    const xs = buckets.map((b, i) => x0 + bw * i + bw / 2);
    let marks = "";
    buckets.forEach((b, i) => {
      let y = y0; const row = grid.get(b);
      const live = series.filter((se) => row[se.key] > 0);
      const op = a.partial.has(b) ? ' opacity="0.5"' : "";
      live.forEach((se, j) => {
        const h = ((y0 - y1) * row[se.key]) / max, top = y - h;
        const hh = Math.max(0.6, h - (j > 0 && h > 3 ? 2 : 0));   // 2px surface gap between stacked fills
        marks += j === live.length - 1
          ? `<path d="${roundTop(xs[i] - barW / 2, top, barW, hh, barW > 8 ? 3 : 1)}" fill="${se.color}"${op}/>`
          : `<rect x="${xs[i] - barW / 2}" y="${top}" width="${barW}" height="${hh}" fill="${se.color}"${op}/>`;
        y = top;
      });
      marks += `<rect class="hit" x="${x0 + bw * i}" y="${y1}" width="${bw}" height="${y0 - y1}" fill="transparent" data-tip="${esc(tipFor(a, st, b))}"/>`;
    });
    if (!buckets.length || !series.length) marks = `<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2}" fill="${TEXT3}" text-anchor="middle">No matching actions in this period.</text>`;
    const fy = y0 + axisBand(st.interval) + 18, nt = notes(a, st);
    return frame(title, fy + nt.length * 16 + 6, hd.s + yAxis(max, step, x0, x1, y0, y1, unitWord(st)) + marks + timeAxis(buckets, st.interval, xs, bw, y0) + footer(nt, fy));
  }

  function drawLines(a, st, title, sub) {
    const { series, buckets, grid } = a;
    const hd = header(title, sub, series, true);
    const labelRoom = series.length > 1 && series.length <= 4 ? 140 : 12;
    const x0 = M.l, x1 = W - M.r - labelRoom, y1 = hd.top + 8, y0 = y1 + PLOT_H;
    const { max, step } = niceAxis(Math.max(1, ...buckets.flatMap((b) => series.map((se) => grid.get(b)[se.key]))));
    const bw = (x1 - x0) / Math.max(1, buckets.length);
    const xs = buckets.map((b, i) => x0 + bw * i + bw / 2);
    const yc = (v) => y0 - ((y0 - y1) * v) / max;
    let marks = "";
    const ends = [];
    series.forEach((se) => {
      // the partial last period is drawn as a separate, fainter segment
      const pts = buckets.map((b, i) => [xs[i], yc(grid.get(b)[se.key])]);
      const lastFull = a.partial.has(buckets[buckets.length - 1]) ? pts.length - 1 : pts.length;
      const firstFull = a.partial.has(buckets[0]) && pts.length > 1 ? 1 : 0;
      const solid = pts.slice(firstFull, lastFull);
      if (solid.length) marks += `<polyline points="${solid.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${se.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (firstFull) marks += `<polyline points="${pts.slice(0, 2).map((p) => p.join(",")).join(" ")}" fill="none" stroke="${se.color}" stroke-width="2" stroke-opacity="0.45"/>`;
      if (lastFull < pts.length && pts.length > 1) marks += `<polyline points="${pts.slice(-2).map((p) => p.join(",")).join(" ")}" fill="none" stroke="${se.color}" stroke-width="2" stroke-opacity="0.45"/>`;
      if (buckets.length <= 36) pts.forEach((p, i) => { marks += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="${se.color}" stroke="${SURFACE}" stroke-width="2"${a.partial.has(buckets[i]) ? ' opacity="0.5"' : ""}/>`; });
      if (pts.length) ends.push({ se, y: pts[pts.length - 1][1] });
    });
    // direct labels at the line ends (up to four series), nudged apart so they never overlap
    if (labelRoom > 12) {
      ends.sort((p, q) => p.y - q.y);
      for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 15);
      ends.forEach((e) => { marks += `<text x="${x1 + 10}" y="${e.y + 4}" fill="${TEXT2}" font-size="11">${esc(e.se.label.length > 22 ? e.se.label.slice(0, 21) + "…" : e.se.label)}</text>`; });
    }
    buckets.forEach((b, i) => {
      marks += `<rect class="hit" data-x="${xs[i]}" x="${xs[i] - bw / 2}" y="${y1}" width="${bw}" height="${y0 - y1}" fill="transparent" data-tip="${esc(tipFor(a, st, b))}"/>`;
    });
    if (!buckets.length || !series.length) marks = `<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2}" fill="${TEXT3}" text-anchor="middle">No matching actions in this period.</text>`;
    const fy = y0 + axisBand(st.interval) + 18, nt = notes(a, st);
    return frame(title, fy + nt.length * 16 + 6, hd.s + yAxis(max, step, x0, x1, y0, y1, unitWord(st)) +
      `<line class="cross" x1="0" x2="0" y1="${y1}" y2="${y0}" stroke="${TEXT3}" stroke-width="1" visibility="hidden"/>` + marks + timeAxis(buckets, st.interval, xs, bw, y0) + footer(nt, fy));
  }

  function drawTotals(a, st, title, sub) {
    const rows = a.series.slice(0, 20);
    const hd = header(title, sub, [], false);
    const rowH = 28, top = hd.top;
    const labelW = Math.min(330, Math.max(120, ...rows.map((r) => textW(r.label.length > 48 ? r.label.slice(0, 47) + "…" : r.label, 12) + 16)));
    const x0 = M.l - 40 + labelW, x1 = W - M.r - 70;
    const max = Math.max(1, ...rows.map((r) => r.total));
    let s = "";
    rows.forEach((r, i) => {
      const y = top + i * rowH, w = Math.max(2, ((x1 - x0) * r.total) / max);
      const color = r.key === "none" || r.key === "__other" ? OTHER : a.dim === "level" || a.dim === "impact" || a.dim === "category" ? r.color : SERIES[0];
      s += `<text x="${x0 - 12}" y="${y + 16}" fill="${TEXT2}" font-size="12" text-anchor="end">${esc(r.label.length > 48 ? r.label.slice(0, 47) + "…" : r.label)}</text>
        <path d="M${x0},${y + 6}H${x0 + w - 3}Q${x0 + w},${y + 6} ${x0 + w},${y + 9}V${y + 17}Q${x0 + w},${y + 20} ${x0 + w - 3},${y + 20}H${x0}Z" fill="${color}"/>
        <text x="${x0 + w + 8}" y="${y + 17}" fill="${TEXT}" font-size="12" font-family="${esc(MONO)}">${num(r.total)}</text>
        <rect class="hit" x="${M.l - 40}" y="${y}" width="${W - M.l + 40 - M.r}" height="${rowH}" fill="transparent" data-tip="${esc(r.label + "|" + num(r.total) + " actions")}"/>`;
    });
    if (!rows.length) s = `<text x="${M.l - 40}" y="${top + 20}" fill="${TEXT3}">No matching actions in this period.</text>`;
    s += `<line x1="${x0}" x2="${x0}" y1="${top}" y2="${top + Math.max(1, rows.length) * rowH}" stroke="${AXIS}"/>`;
    const nt = notes({ ...a, partial: new Set() }, st);
    if (a.series.length > rows.length) nt.unshift(`Showing the ${rows.length} largest of ${a.series.length} groups; the CSV has all of them.`);
    const fy = top + Math.max(1, rows.length) * rowH + 24;
    return frame(title, fy + nt.length * 16 + 6, hd.s + s + footer(nt, fy));
  }

  function drawDonut(a, st, title, sub) {
    const hd = header(title, sub, [], false);
    const total = a.series.reduce((s, r) => s + r.total, 0);
    const R = 130, r = 82, cx = M.l - 40 + R + 10, cy = hd.top + R + 6;
    let s = "", ang = -Math.PI / 2;
    const pt = (rad, t) => [cx + rad * Math.cos(t), cy + rad * Math.sin(t)];
    a.series.forEach((se) => {
      if (!se.total) return;
      const sweep = (se.total / total) * Math.PI * 2;
      const t0 = ang, t1 = ang + sweep; ang = t1;
      if (sweep >= Math.PI * 2 - 1e-6) {
        s += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${se.color}" stroke-width="${R - r}" class="hit" data-tip="${esc(`${se.label}|${num(se.total)} (100%)`)}"/>`;
        return;
      }
      const large = sweep > Math.PI ? 1 : 0;
      const [ax, ay] = pt(R, t0), [bx, by] = pt(R, t1), [cx2, cy2] = pt(r, t1), [dx, dy] = pt(r, t0);
      s += `<path d="M${ax},${ay}A${R},${R} 0 ${large} 1 ${bx},${by}L${cx2},${cy2}A${r},${r} 0 ${large} 0 ${dx},${dy}Z" fill="${se.color}"
        stroke="${SURFACE}" stroke-width="2" class="hit" data-tip="${esc(`${se.label}|${num(se.total)} (${((100 * se.total) / total).toFixed(1)}%)`)}"/>`;
    });
    s += `<text x="${cx}" y="${cy + 4}" fill="${TEXT}" font-size="30" font-weight="600" text-anchor="middle">${num(total)}</text>
      <text x="${cx}" y="${cy + 24}" fill="${TEXT3}" font-size="12" text-anchor="middle">${a.multi ? "tags" : "actions"}</text>`;
    const lx = cx + R + 60;
    a.series.forEach((se, i) => {
      const y = hd.top + 22 + i * 30;
      const pct = total ? (100 * se.total) / total : 0;
      s += `<rect x="${lx}" y="${y - 10}" width="12" height="12" rx="2" fill="${se.color}"/>
        <text x="${lx + 22}" y="${y}" fill="${TEXT2}" font-size="13">${esc(se.label.length > 46 ? se.label.slice(0, 45) + "…" : se.label)}</text>
        <text x="${W - M.r - 64}" y="${y}" fill="${TEXT}" font-size="13" font-family="${esc(MONO)}" text-anchor="end">${num(se.total)}</text>
        <text x="${W - M.r}" y="${y}" fill="${TEXT3}" font-size="13" font-family="${esc(MONO)}" text-anchor="end">${pct < 1 && pct > 0 ? "<1" : Math.round(pct)}%</text>`;
    });
    if (!total) s = `<text x="${M.l - 40}" y="${hd.top + 20}" fill="${TEXT3}">No matching actions in this period.</text>`;
    const nt = notes({ ...a, partial: new Set() }, st);
    const fy = Math.max(cy + R, hd.top + 22 + a.series.length * 30) + 28;
    return frame(title, fy + nt.length * 16 + 6, hd.s + s + footer(nt, fy));
  }

  // -------------------------------------------------------------- the UI
  function defaults(items, ctx) {
    const dates = items.map((i) => i.date).filter(Boolean).sort();
    const today = (ctx && ctx.today) || ymd(new Date());
    const start = (ctx && ctx.historyStart) || "2015-01-01";
    const from = dates.length ? (dates[0] < start ? start : `${dates[0].slice(0, 7)}-01`) : start;
    const to = dates.length && dates[dates.length - 1] < today ? today : today;
    return { type: "stacked", by: "category", interval: autoInterval(from, to), autoInterval: true, from, to,
      categories: [], sanctions: [], outcomes: [], flaggedOnly: false, routine: false, table: false };
  }

  function render(host, items, ctx) {
    const L = ctx.labels;
    const st = ctx.state || (ctx.state = defaults(items, ctx));
    if (ctx.pending) {                                   // set by the assistant
      const p = ctx.pending; delete ctx.pending;
      Object.assign(st, p);
      if (p.from || p.to) { if (!p.interval) { st.interval = autoInterval(st.from, st.to); st.autoInterval = true; } }
      if (p.interval) st.autoInterval = false;
    }
    if (st.type === "matrix") { st.type = "bars"; st.by = "level"; }          // the old grid chart was retired in 3.1
    if (st.by === "flagrance") st.by = "level";
    if (!UNIT[st.interval]) st.interval = autoInterval(st.from, st.to);
    if (st.from && st.to && st.from > st.to) [st.from, st.to] = [st.to, st.from];
    const present = (key) => [...new Set(items.flatMap((i) => key(i)))].filter((x) => x != null && x !== "");
    const cats = present((i) => [i.category]).sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99));
    const sancs = present((i) => i.sanctions || []);
    const outs = present((i) => [i.outcome]);
    const check = (name, val, label, on) => `<label><input type="checkbox" data-arr="${name}" value="${esc(val)}" ${on ? "checked" : ""}> ${esc(label)}</label>`;
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? "selected" : ""}>${esc(l)}</option>`;
    const timeChart = st.type === "stacked" || st.type === "lines";
    const presets = [["1y", "Past year"], ["3y", "3 years"], ["5y", "5 years"], ["all", "All"]];
    const presetFrom = (k) => { const today = ctx.today || ymd(new Date()), d = dayObj(today);
      return k === "all" ? defaults(items, ctx).from : ymd(new Date(d.getFullYear() - (+k[0]), d.getMonth(), d.getDate() + 1, 12)); };
    const activePreset = presets.map(([k]) => k).find((k) => st.from === presetFrom(k) && st.to === (ctx.today || ymd(new Date())));

    host.innerHTML = `<div class="chart-builder">
      <form class="chart-controls" id="cc" onsubmit="return false">
        <div class="ctl"><span>Chart</span><select data-k="type">
          ${opt("stacked", "Stacked bars over time", st.type)}${opt("lines", "Lines over time", st.type)}${opt("bars", "Totals (bar chart)", st.type)}
          ${opt("donut", "Share of total (donut)", st.type)}</select></div>
        <div class="ctl"><span>Break down by</span><select data-k="by">
          ${opt("category", "Kind of action", st.by)}${opt("subcategory", "Specific type of document", st.by)}${opt("sanction", "Sanction imposed or sought", st.by)}
          ${opt("outcome", "Outcome", st.by)}${opt("issue", "Legal issue (rated)", st.by)}${opt("level", "Lawfulness rating", st.by)}
          ${opt("impact", "Impact (context only)", st.by)}${opt("none", "Nothing (one total)", st.by)}</select></div>
        <div class="ctl" ${timeChart ? "" : "hidden"}><span>Group dates by</span><select data-k="interval">
          ${opt("day", "Day", st.interval)}${opt("week", "Week", st.interval)}${opt("month", "Month", st.interval)}${opt("quarter", "Quarter", st.interval)}${opt("year", "Year", st.interval)}</select></div>
        <div class="ctl"><span>Time period</span>
          <div class="seg" role="group" aria-label="Quick periods">${presets.map(([k, l]) => `<button type="button" data-p="${k}" aria-pressed="${k === activePreset}" class="${k === activePreset ? "on" : ""}">${l}</button>`).join("")}</div>
          <div class="row" style="margin:6px 0 0">
          <input type="date" data-k="from" value="${esc(st.from)}" aria-label="From"><input type="date" data-k="to" value="${esc(st.to)}" aria-label="To"></div></div>
        <div class="ctl"><span>Kinds of action ${st.categories.length ? "" : "(all)"}</span><div class="checks">${cats.map((c) => check("categories", c, L.categories[c] || c, st.categories.includes(c))).join("")}</div></div>
        <div class="ctl"><span>Sanctions ${st.sanctions.length ? "" : "(any)"}</span><div class="checks">${sancs.length ? sancs.map((s) => check("sanctions", s, (L.sanctions[s] || {}).label || s, st.sanctions.includes(s))).join("") : '<span class="muted small">None recorded for this agency yet.</span>'}</div></div>
        <div class="ctl"><span>Outcomes ${st.outcomes.length ? "" : "(any)"}</span><div class="checks">${outs.map((o) => check("outcomes", o, L.outcomes[o] || o, st.outcomes.includes(o))).join("")}</div></div>
        <div class="ctl"><label class="small"><input type="checkbox" data-k="flaggedOnly" ${st.flaggedOnly ? "checked" : ""}> Only actions rated likely unlawful or worse</label>
          ${items.some((i) => i.routine) ? `<br><label class="small"><input type="checkbox" data-k="routine" ${st.routine ? "checked" : ""}> Include routine exchange fee filings</label>` : ""}</div>
        <div class="row"><button type="button" class="btn small" data-x="png">Download PNG</button><button type="button" class="btn ghost small" data-x="svg">SVG</button>
          <button type="button" class="btn ghost small" data-x="csv">CSV</button><button type="button" class="btn ghost small" data-x="reset">Reset</button></div>
      </form>
      <div class="chart-col"><div class="chart-stage" id="stage"></div>
        <p class="chart-actions"><button type="button" class="btn ghost small" data-x="table">${st.table ? "Hide" : "Show"} the numbers as a table</button></p>
        <div id="ctable"></div></div></div>`;

    const data = filterItems(items, st);
    const everyDate = filterItems(items, st, true);
    const what = { category: "kind of action", subcategory: "type of document", sanction: "sanction", outcome: "outcome",
      issue: "legal issue", level: "lawfulness rating", impact: "impact", none: "" }[st.by];
    const span = st.from && st.to ? `${longDay(st.from)} – ${longDay(st.to)}` : "";
    const title = `${ctx.entityName}: actions${timeChart ? ` per ${UNIT[st.interval]}` : ""}${what ? ` by ${what}` : ""}`;
    const filtersSaid = [st.categories.length && `kinds: ${st.categories.map((c) => L.categories[c]).join(", ")}`,
      st.sanctions.length && `sanctions: ${st.sanctions.map((s) => (L.sanctions[s] || {}).short || s).join(", ")}`,
      st.outcomes.length && `outcomes: ${st.outcomes.map((o) => L.outcomes[o]).join(", ")}`, st.flaggedOnly && "rated likely unlawful or worse only"].filter(Boolean).join("; ");
    const sub = `${num(data.length)} action${data.length === 1 ? "" : "s"}${span ? `, ${span}` : ""}${filtersSaid ? `. Filters: ${filtersSaid}` : ""}`;

    const agg = aggregate(data, everyDate, st, L);
    const svg = st.type === "lines" ? drawLines(agg, st, title, sub) : st.type === "bars" ? drawTotals(agg, st, title, sub)
      : st.type === "donut" ? drawDonut(agg, st, title, sub) : drawStacked(agg, st, title, sub);
    const stage = host.querySelector("#stage");
    stage.innerHTML = svg;

    // table view (accessibility and checking)
    const rowsForCsv = tableRows(st, agg);
    if (st.table) host.querySelector("#ctable").innerHTML = `<div class="wrap-x"><table class="t"><thead><tr>${rowsForCsv[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${rowsForCsv.slice(1).map((r) => `<tr>${r.map((c, i) => `<td class="${i ? "num" : ""}">${esc(typeof c === "number" ? num(c) : c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

    bindTips(stage);
    const rerender = () => render(host, items, ctx);
    host.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", () => {
      const k = el.dataset.k; st[k] = el.type === "checkbox" ? el.checked : el.value;
      if (k === "interval") st.autoInterval = false;
      if ((k === "from" || k === "to") && st.autoInterval) st.interval = autoInterval(st.from, st.to);
      rerender();
    }));
    host.querySelectorAll("[data-p]").forEach((el) => el.addEventListener("click", () => {
      st.to = ctx.today || ymd(new Date());
      st.from = presetFrom(el.dataset.p);
      st.interval = autoInterval(st.from, st.to); st.autoInterval = true;
      rerender();
    }));
    host.querySelectorAll("[data-arr]").forEach((el) => el.addEventListener("change", () => {
      const k = el.dataset.arr; st[k] = [...host.querySelectorAll(`[data-arr="${k}"]:checked`)].map((x) => x.value); rerender();
    }));
    host.querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => {
      const x = b.dataset.x, name = `regcollect-${ctx.fileKey}-${st.type}-${st.by}`;
      if (x === "svg") download(`${name}.svg`, new Blob([stage.innerHTML], { type: "image/svg+xml" }));
      if (x === "png") toPng(stage.querySelector("svg"), (blob) => download(`${name}.png`, blob));
      if (x === "csv") download(`${name}.csv`, new Blob(["﻿" + rowsForCsv.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\r\n")], { type: "text/csv" }));
      if (x === "table") { st.table = !st.table; rerender(); }
      if (x === "reset") { ctx.state = defaults(items, ctx); render(host, items, ctx); }
    }));
  }

  function tableRows(st, agg) {
    const many = agg.series.length > 1;
    if (st.type === "stacked" || st.type === "lines")
      return [["Period", "Starts", ...agg.series.map((s) => s.label), ...(many ? ["Total"] : [])],
        ...agg.buckets.map((b) => { const row = agg.series.map((s) => agg.grid.get(b)[s.key]);
          return [periodName(b, st.interval) + (agg.partial.has(b) ? " (partial)" : ""), b, ...row, ...(many ? [row.reduce((x, y) => x + y, 0)] : [])]; })];
    return [["Group", "Actions"], ...agg.series.map((s) => [s.label, s.total])];
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
        tip.style.top = Math.min(e.clientY + 14, window.innerHeight - tip.offsetHeight - 8) + "px";
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

  window.RHCharts = { render, _test: { bucketRange, autoInterval, niceAxis, periodName, timeAxis } };
})();
