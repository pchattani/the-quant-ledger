/* The Quant Ledger — client.
   Reads the JSON the builder wrote under data/, draws every panel with Plotly in the
   family's theme, offers a table view of every chart, and keeps the selected tab,
   market, style, construction and book in the hash so a view can be linked. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;   // only ever static markup from this file
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c !== null && c !== undefined) n.append(c);
  return n;
};
const txt = (s) => document.createTextNode(s);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const fmt = (v, nd = 2, signed = false) => !isNum(v) ? "—" : (signed && v > 0 ? "+" : "") + v.toFixed(nd);
const pct = (v, nd = 1, signed = true) => !isNum(v) ? "—" : (signed && v > 0 ? "+" : "") + (v * 100).toFixed(nd) + "%";
const pctU = (v, nd = 1) => pct(v, nd, false);
const dateLabel = (iso) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ── Theme ────────────────────────────────────────────────────────────────────
const T = {
  surface: "#0d1526", page: "#070b16", elev: "#132038", ink1: "#f2f5fb", ink2: "#c0c9da", muted: "#8e9ab0", grid: "#1a2641", axis: "#3a4b70",
  border: "rgba(170,190,235,0.14)", up: "#7d93ff", down: "#ff6a4d", bench: "#8e9ab0", amber: "#ffb224", ink4: "#56617a",
  sans: "\"Barlow\", system-ui, sans-serif", mono: "\"IBM Plex Mono\", ui-monospace, Consolas, monospace", cond: "\"Barlow Condensed\", \"Barlow\", sans-serif",
};
const FACTOR_C = { momentum: "#7d93ff", ewmom: "#a9b7ff", reversal: "#5ec8f0", value: "#ffb224", quality: "#8fd16a", investment: "#c39be8", size: "#f28fb5", lowvol: "#d9b38c", lowbeta: "#e8cfa0", dividend: "#ffd36a" };
const MARKET_C = ["#7d93ff", "#ffb224", "#5ec8f0", "#c39be8", "#8fd16a", "#f28fb5", "#d9b38c", "#ff6a4d", "#a9b7ff", "#ffd36a", "#9ad7c8", "#e0a0ff", "#b5e07a", "#ffb5a0", "#7ad1ff", "#ffc98f", "#c8d08f", "#f0a3c9", "#8fb8ff", "#d4a37a", "#9fe3b8", "#f5c6a0"];
const DIV = [[0, T.down], [0.5, "#1b2740"], [1, T.up]];
const rgba = (hex, a) => { const h = hex.replace("#", ""); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
const PLOT_CONFIG = { displaylogo: false, responsive: true, displayModeBar: "hover", modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines", "zoomIn2d", "zoomOut2d"] };
const VARIANT_LABEL = { neutral_dollar: "Sector-neutral · dollar", neutral_invvol: "Sector-neutral · inverse vol", plain_dollar: "Plain · dollar", plain_invvol: "Plain · inverse vol" };
const VARIANT_SHORT = { neutral_dollar: "Neutral · $", neutral_invvol: "Neutral · 1/σ", plain_dollar: "Plain · $", plain_invvol: "Plain · 1/σ" };
const WIN_LABEL = { all: "All", since_2010: "2010+", since_2021: "2021+", last_3y: "3 years", ytd: "This year" };

function axis(extra = {}) {
  return { gridcolor: T.grid, zerolinecolor: T.axis, linecolor: T.axis, tickcolor: T.axis, tickfont: { color: T.muted, size: 11 }, automargin: true, ...extra };
}
function L(extra = {}) {
  const base = {
    paper_bgcolor: T.surface, plot_bgcolor: T.surface, font: { color: T.ink2, family: T.sans, size: 12 }, margin: { l: 48, r: 16, t: 12, b: 36 },
    xaxis: axis(), yaxis: axis(), hovermode: "x unified",
    hoverlabel: { bgcolor: T.elev, bordercolor: T.border, font: { color: T.ink1, family: T.mono, size: 11.5 } },
    legend: { orientation: "h", y: 1.02, yanchor: "bottom", x: 0, font: { size: 11, color: T.ink2 }, bgcolor: "rgba(0,0,0,0)" },
  };
  return merge(base, extra);
}
function merge(a, b) {
  for (const k in b) {
    if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) a[k] = merge(a[k] || {}, b[k]);
    else a[k] = b[k];
  }
  return a;
}
const hline = (y, yref = "y", color = T.axis, dash = "dot") => ({ type: "line", xref: "paper", x0: 0, x1: 1, yref, y0: y, y1: y, line: { color, dash, width: 1 } });

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  tab: "monitor",
  monitor: { variant: "neutral_dollar", window: "since_2010", navwindow: "all" },
  country: { code: null, variant: "neutral_dollar", window: "all" },
  style: { key: "momentum", variant: "neutral_dollar" },
  book: { id: null, window: "all", leg: "all" },
  pure: { code: null },
  access: { code: null },
};
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("tab")) state.tab = p.get("tab");
  if (p.get("market")) { state.country.code = p.get("market"); state.pure.code = p.get("market"); }
  if (p.get("style")) state.style.key = p.get("style");
  if (p.get("variant")) { state.monitor.variant = p.get("variant"); state.country.variant = p.get("variant"); state.style.variant = p.get("variant"); }
  if (p.get("book")) state.book.id = p.get("book");
  return p.get("g");
}
function writeHash() {
  const p = new URLSearchParams({ tab: state.tab });
  if (state.tab === "monitor") p.set("variant", state.monitor.variant);
  if (state.tab === "country" && state.country.code) { p.set("market", state.country.code); p.set("variant", state.country.variant); }
  if (state.tab === "style") { p.set("style", state.style.key); p.set("variant", state.style.variant); }
  if (state.tab === "book" && state.book.id) p.set("book", state.book.id);
  if (state.tab === "pure" && state.pure.code) p.set("market", state.pure.code);
  try { history.replaceState(null, "", "#" + p.toString()); } catch (_) { /* sandboxed */ }
}

// ── Data ─────────────────────────────────────────────────────────────────────
const cache = new Map();
async function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch("data/" + path).then(r => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }).catch(err => { cache.delete(path); throw err; }));
  }
  return cache.get(path);
}
let META, MX;
const mkt = (c) => META.markets[c] || { code: c, name: c, tier: 3 };
const fac = (k) => META.factors[k] || { key: k, label: k };
const bookId = (m, f, v) => `eq_${m}_${f}_${v}`;
const parseBook = (id) => { const p = id.split("_"); return { market: p[1], factor: p[2], variant: `${p[3]}_${p[4]}` }; };
const marketColor = (code) => MARKET_C[META.market_order.indexOf(code) % MARKET_C.length];

// ── Figures and their table view ─────────────────────────────────────────────
function mount(id, fig, opts = {}) {
  const node = document.getElementById(id);
  if (!node) return;
  node._fig = fig; node._opts = opts;
  const card = node.closest(".card");
  const wrap = card ? $(".tablewrap", card) : null;
  if (wrap && !wrap.hidden) { wrap.replaceChildren(tableFromFig(fig)); return; }
  Plotly.react(node, fig.data, fig.layout, PLOT_CONFIG).then(() => { if (opts.after) opts.after(node); });
}
function tableFromFig(fig) {
  const traces = (fig.data || []).filter(t => t.visible !== false);
  if (!traces.length) return el("p", { class: "empty", text: "Nothing to show." });
  const first = traces[0];
  if (first.type === "heatmap") {
    const cols = [{ key: "_r", label: "" }, ...first.x.map((x, i) => ({ key: "c" + i, label: String(x), num: true, nd: 2 }))];
    const rows = first.y.map((y, j) => { const r = { _r: String(y) }; first.x.forEach((_, i) => r["c" + i] = first.z[j][i]); return r; });
    return buildTable(cols, rows);
  }
  const horizontal = traces.every(t => t.orientation === "h");
  const keyOf = horizontal ? (t, i) => t.y[i] : (t, i) => t.x[i];
  const valOf = horizontal ? (t, i) => t.x[i] : (t, i) => t.y[i];
  const keys = [];
  const seen = new Set();
  for (const t of traces) for (let i = 0; i < (t.x || []).length; i++) { const k = String(keyOf(t, i)); if (!seen.has(k)) { seen.add(k); keys.push(k); } }
  const cols = [{ key: "_k", label: horizontal ? "" : "Date" }, ...traces.map((t, i) => ({ key: "t" + i, label: t.name || `Series ${i + 1}`, num: true, nd: 2 }))];
  const rows = keys.map(k => ({ _k: k }));
  const idx = new Map(keys.map((k, i) => [k, i]));
  traces.forEach((t, ti) => { for (let i = 0; i < (t.x || []).length; i++) { const r = rows[idx.get(String(keyOf(t, i)))]; const v = valOf(t, i); r["t" + ti] = isNum(v) ? v : null; } });
  if (!horizontal) rows.reverse();
  return buildTable(cols, rows.slice(0, 600));
}
function buildTable(columns, rows, { onRow = null } = {}) {
  const t = el("table", { class: "data" });
  t.append(el("thead", {}, el("tr", {}, columns.map(c => el("th", { class: c.num ? "n" : "", text: c.label })))));
  t.append(el("tbody", {}, rows.map(r => {
    const tr = el("tr", { class: onRow ? "clickable" : "" }, columns.map(c => {
      const td = el("td", { class: c.cls || (c.num ? "n" : "") });
      const v = r[c.key];
      if (c.render) td.append(c.render(v, r)); else td.textContent = c.num ? fmt(v, c.nd ?? 2) : (v ?? "—");
      return td;
    }));
    if (onRow) tr.addEventListener("click", () => onRow(r));
    return tr;
  })));
  return t;
}
function sortableTable(container, columns, rows, { sortKey = null, desc = false, onRow = null, current = null } = {}) {
  let key = sortKey, down = desc;
  const render = () => {
    const sorted = [...rows];
    if (key) sorted.sort((a, b) => {
      const va = a[key], vb = b[key];
      if (va === null || va === undefined) return 1; if (vb === null || vb === undefined) return -1;
      const c = (isNum(va) && isNum(vb)) ? va - vb : String(va).localeCompare(String(vb));
      return down ? -c : c;
    });
    const t = el("table", { class: "data" });
    t.append(el("thead", {}, el("tr", {}, columns.map(c => el("th", {
      class: c.num ? "n" : "", text: c.label, title: c.title || null, role: "button", tabindex: "0",
      "aria-sort": key === c.key ? (down ? "descending" : "ascending") : null,
      onclick: () => { if (key === c.key) down = !down; else { key = c.key; down = !!c.num; } render(); },
      onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.target.click(); } },
    })))));
    t.append(el("tbody", {}, sorted.map(r => {
      const tr = el("tr", { class: onRow ? "clickable" : "", "aria-current": current && current(r) ? "true" : null }, columns.map(c => {
        const td = el("td", { class: c.cls || (c.num ? "n" : "") });
        const v = r[c.key];
        if (c.render) td.append(c.render(v, r)); else td.textContent = c.num ? fmt(v, c.nd ?? 2, c.signed ?? false) : (v ?? "—");
        return td;
      }));
      if (onRow) tr.addEventListener("click", () => onRow(r));
      return tr;
    })));
    container.replaceChildren(t);
  };
  render();
}
const signed = (v, nd = 2) => el("span", { class: "num " + (!isNum(v) ? "" : v < 0 ? "down" : v > 0 ? "up" : ""), text: fmt(v, nd, true) });
const signedPct = (v, nd = 1) => el("span", { class: "num " + (!isNum(v) ? "" : v < 0 ? "down" : v > 0 ? "up" : ""), text: pct(v, nd) });
const wash = (v, vmax) => !isNum(v) ? "" : `background:rgba(var(--${v < 0 ? "down" : "up"}-rgb), ${(Math.min(1, Math.abs(v) / vmax) * 0.55).toFixed(3)})`;
const washCell = (v, nd, vmax) => el("span", { class: "wash", text: fmt(v, nd, true), style: wash(v, vmax) });
const factorTag = (k) => el("span", { class: `tag factor f-${k}`, text: fac(k).label });
const tierBadge = (t) => el("span", { class: `tier t${t}`, text: t === 1 ? "Tier 1 · shortable" : t === 2 ? "Tier 2 · restricted" : "Tier 3 · not shortable" });
function zbar(v, cap, cls = "") {
  if (!isNum(v)) return txt("—");
  const span = Math.min(Math.abs(v), cap) / cap * 50;
  const i = el("i", { class: v < 0 ? "down" : "up", style: v < 0 ? `right:50%;width:${span}%` : `left:50%;width:${span}%` });
  return el("span", { style: "display:inline-flex;align-items:center;gap:6px" }, [el("span", { class: "zbar " + cls, title: fmt(v, 2, true) }, i), el("span", { class: "num", text: fmt(v, 2, true) })]);
}
function seg(container, options, value, onChange) {
  const name = "seg-" + Math.random().toString(36).slice(2, 8);
  container.replaceChildren(...options.map(([v, label]) => {
    const input = el("input", { type: "radio", name, value: v });
    input.checked = v === value;
    input.addEventListener("change", () => onChange(v));
    return el("label", {}, [input, el("span", { text: label })]);
  }));
}
function segFilter(sel, options, get, set) {
  const paint = () => { for (const c of $$(`[data-filter="${sel}"]`)) seg(c, options, get(), v => { set(v); paint(); }); };
  paint();
}
const WINDOWS = [["all", "All"], ["2010", "2010"], ["2021", "2021"], ["5y", "5Y"]];
const VARIANTS = Object.keys(VARIANT_SHORT).map(k => [k, VARIANT_SHORT[k]]);
function windowRange(dates, w) {
  if (!dates || !dates.length) return null;
  const last = dates[dates.length - 1];
  if (w === "all") return null;
  if (w === "5y") { const d = new Date(last); d.setFullYear(d.getFullYear() - 5); return [d.toISOString().slice(0, 10), last]; }
  return [`${w}-01-01`, last];
}
function applyWindow(fig, dates, w) {
  const r = windowRange(dates, w);
  if (!r) return fig;
  fig.layout.xaxis = { ...(fig.layout.xaxis || {}), range: r, autorange: false };
  for (const k of Object.keys(fig.layout)) if (/^xaxis\d+$/.test(k)) fig.layout[k] = { ...fig.layout[k], range: r, autorange: false };
  if (fig._rebase) for (const t of fig.data) {
    if (!t._nav) continue;
    const i0 = t.x.findIndex(d => d >= r[0]);
    if (i0 > 0) { const base = t._nav[i0]; t.y = t._nav.map(v => isNum(v) && isNum(base) ? v / base * 100 : null); }
  }
  return fig;
}

// ── SVG sparklines ───────────────────────────────────────────────────────────
function svgFrom(markup) { const host = el("div"); host.innerHTML = markup.trim(); return host.firstElementChild; }
function sparkPath(values, w, h, pad = 2, zeroAt = null) {
  const v = values.filter(isNum);
  if (v.length < 2) return { d: "", last: null, zero: null };
  const lo = Math.min(...v, zeroAt ?? Infinity), hi = Math.max(...v, zeroAt ?? -Infinity), span = (hi - lo) || 1;
  const y = (val) => h - pad - (val - lo) / span * (h - 2 * pad);
  const pts = values.map((val, i) => isNum(val) ? [i / (values.length - 1) * w, y(val)] : null).filter(Boolean);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return { d, last: pts[pts.length - 1], zero: zeroAt === null ? null : y(zeroAt) };
}
function sparkSvg(values, { w = 100, h = 22, cls = "spark", zeroAt = null } = {}) {
  const { d, last, zero } = sparkPath(values, w, h, 2, zeroAt);
  if (!d) return svgFrom(`<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`);
  return svgFrom(`<svg class="${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    ${zero === null ? "" : `<line x1="0" x2="${w}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" stroke="currentColor" stroke-opacity="0.18"/>`}
    <path d="${d}"/><circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2"/></svg>`);
}
function tile(label, value, sub, { cls = "", spark = null, zeroAt = null } = {}) {
  return el("div", { class: "tile" }, [
    el("span", { class: "label eyebrow", text: label }),
    el("span", { class: "value " + cls, text: value }),
    el("span", { class: "delta", text: sub || "" }),
    spark ? sparkSvg(spark, { zeroAt }) : null,
  ]);
}
const upDown = (v) => !isNum(v) ? "" : v < 0 ? "down" : v > 0 ? "up" : "";

// ── Shared figure builders ───────────────────────────────────────────────────
function navFig(dates, nav, dd, color, name, { extra = [], log = true, rebase = true } = {}) {
  const data = [
    { x: dates, y: nav, _nav: nav, mode: "lines", name, line: { color, width: 1.8 }, yaxis: "y", hovertemplate: "%{y:.1f}<extra>" + name + "</extra>" },
    ...extra,
    { x: dates, y: dd.map(v => isNum(v) ? v * 100 : null), mode: "lines", name: "Drawdown, %", line: { color: T.down, width: 1 }, fill: "tozeroy", fillcolor: rgba(T.down, 0.25), yaxis: "y2", hovertemplate: "%{y:.1f}%<extra>drawdown</extra>" },
  ];
  const fig = { data, layout: L({ height: 440, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { type: log ? "log" : "linear", domain: [0.34, 1] }, yaxis2: { domain: [0, 0.26] }, xaxis: { anchor: "y2" } }) };
  fig._rebase = rebase;
  return fig;
}
function linesFig(series, { height = 420, log = true, rebase = true, yfmt = ".1f" } = {}) {
  // series: [{dates, values, name, color}]
  const data = series.map(s => ({ x: s.dates, y: s.values, _nav: s.values, mode: "lines", name: s.name, line: { color: s.color, width: s.width || 1.4 }, hovertemplate: `%{y:${yfmt}}<extra>${s.name}</extra>` }));
  const fig = { data, layout: L({ height, yaxis: { type: log ? "log" : "linear" } }) };
  fig._rebase = rebase;
  return fig;
}
function calendarFig(cal, { height = null, zmax = 8 } = {}) {
  const z = cal.matrix.map(r => r.map(v => isNum(v) ? v * 100 : null));
  const yrs = cal.years.map(String);
  return { data: [
    { z, x: MONTHS, y: yrs, type: "heatmap", colorscale: DIV, zmid: 0, zmin: -zmax, zmax, text: z.map(r => r.map(v => isNum(v) ? v.toFixed(1) : "")), texttemplate: "%{text}", textfont: { size: 9.5, family: T.mono }, showscale: false, hovertemplate: "%{y} %{x}: %{z:.2f}%<extra></extra>", xgap: 1, ygap: 1 },
    { z: cal.annual.map(v => [isNum(v) ? v * 100 : null]), x: ["Year"], y: yrs, type: "heatmap", colorscale: DIV, zmid: 0, zmin: -zmax * 3, zmax: zmax * 3, text: cal.annual.map(v => [isNum(v) ? (v * 100).toFixed(1) : ""]), texttemplate: "%{text}", textfont: { size: 9.5, family: T.mono }, showscale: false, xaxis: "x2", hovertemplate: "%{y}: %{z:.2f}%<extra></extra>", xgap: 1, ygap: 1 },
  ], layout: L({ height: height || Math.max(360, 17 * yrs.length + 50), hovermode: "closest", xaxis: { domain: [0, 0.9], side: "top", showgrid: false }, xaxis2: { domain: [0.92, 1], side: "top", showgrid: false }, yaxis: { autorange: "reversed", tickfont: { size: 10 }, showgrid: false }, margin: { l: 44, r: 8, t: 26, b: 6 } }) };
}
function corrFig(labels, matrix, { height = 420 } = {}) {
  return { data: [{ z: matrix, x: labels, y: labels, type: "heatmap", colorscale: DIV, zmid: 0, zmin: -1, zmax: 1, text: matrix.map(r => r.map(v => isNum(v) ? v.toFixed(2) : "")), texttemplate: "%{text}", textfont: { size: 9, family: T.mono }, showscale: false, xgap: 1, ygap: 1, hovertemplate: "%{y} × %{x}: %{z:.2f}<extra></extra>" }],
    layout: L({ height, hovermode: "closest", xaxis: { tickangle: -40, tickfont: { size: 9.5 }, showgrid: false }, yaxis: { autorange: "reversed", tickfont: { size: 9.5 }, showgrid: false }, margin: { l: 8, r: 8, t: 6, b: 8 } }) };
}
function heatYears(rows, labels, years, { height = null, zmax = 20 } = {}) {
  // rows: [[v per year]] in fractions
  const z = rows.map(r => r.map(v => isNum(v) ? v * 100 : null));
  return { data: [{ z, x: years.map(String), y: labels, type: "heatmap", colorscale: DIV, zmid: 0, zmin: -zmax, zmax, text: z.map(r => r.map(v => isNum(v) ? v.toFixed(0) : "")), texttemplate: "%{text}", textfont: { size: 9, family: T.mono }, showscale: false, xgap: 1, ygap: 1, hovertemplate: "%{y} %{x}: %{z:.1f}%<extra></extra>" }],
    layout: L({ height: height || Math.max(220, 30 * labels.length + 70), hovermode: "closest", xaxis: { tickfont: { size: 9 }, showgrid: false }, yaxis: { showgrid: false, autorange: "reversed" }, margin: { l: 8, t: 6 } }) };
}
function rollingSharpeFig(r1, r3, color) {
  return { data: [
    { x: r1.dates, y: r1.values, mode: "lines", name: "1-year Sharpe", line: { color: rgba(color, 0.6), width: 1 } },
    { x: r3.dates, y: r3.values, mode: "lines", name: "3-year Sharpe", line: { color, width: 1.8 } },
  ], layout: L({ height: 300, shapes: [hline(0)], yaxis: { zeroline: false } }) };
}
const emptyFig = (msg, height = 300) => ({ data: [], layout: L({ height, annotations: [{ text: msg, showarrow: false, xref: "paper", yref: "paper", x: 0.5, y: 0.5, font: { color: T.muted } }], xaxis: { visible: false }, yaxis: { visible: false } }) });

// ── Boot ─────────────────────────────────────────────────────────────────────
const inited = {};
const INIT = { monitor: initMonitor, country: initCountry, style: initStyle, book: initBook, pure: initPure, access: initAccess, methodology: initMethodology };
async function showTab(tab, { push = true } = {}) {
  if (!INIT[tab]) tab = "monitor";
  state.tab = tab;
  for (const b of $$(".tab")) b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  for (const p of $$(".panel")) p.hidden = p.id !== "tab-" + tab;
  if (push) writeHash();
  if (!inited[tab]) { inited[tab] = true; try { await INIT[tab](); } catch (err) { console.error(err); $("#tab-" + tab).prepend(el("p", { class: "empty", text: "This section could not load: " + err.message })); } }
  else if (tab === "country") await renderCountry();
  else if (tab === "style") await renderStyle();
  else if (tab === "book") await renderBook();
  else if (tab === "pure") await renderPure();
  window.dispatchEvent(new Event("resize"));
}
function openBook(id) { state.book.id = id; showTab("book"); }
function openCountry(code) { state.country.code = code; showTab("country"); }
function openStyle(key) { state.style.key = key; showTab("style"); }

async function main() {
  const glossaryTarget = readHash();
  [META, MX] = await Promise.all([load("meta.json"), load("matrix.json")]);
  if (!state.country.code || !META.markets[state.country.code]) state.country.code = META.market_order[0];
  if (!state.pure.code || !META.markets[state.pure.code]) state.pure.code = META.market_order[0];
  if (!META.factors[state.style.key]) state.style.key = META.factor_order[0];
  if (!state.book.id || !MX.summaries[state.book.id]) state.book.id = bookId(state.country.code, state.style.key, META.default_variant);
  if (!MX.summaries[state.book.id]) state.book.id = Object.keys(MX.summaries)[0];
  $("#brand-n").textContent = META.n_books;
  $("#brand-m").textContent = META.market_order.length;
  $("#brand-f").textContent = META.factor_order.length;
  $("#freshness").replaceChildren(el("span", { class: "eyebrow", text: "Last bar " }), el("b", { text: dateLabel(META.last_bar) }), el("span", { class: "eyebrow", text: ` · built ${META.built}` }));
  for (const b of $$(".tab")) b.addEventListener("click", () => showTab(b.dataset.tab));
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".table-toggle");
    if (!btn) return;
    const card = btn.closest(".card"), plot = $(".plot", card), wrap = $(".tablewrap", card);
    const on = btn.getAttribute("aria-pressed") !== "true";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    wrap.hidden = !on; plot.hidden = on;
    if (on && plot._fig) wrap.replaceChildren(tableFromFig(plot._fig));
    else if (!on && plot._fig) Plotly.react(plot, plot._fig.data, plot._fig.layout, PLOT_CONFIG);
  });
  window.addEventListener("hashchange", () => { readHash(); showTab(state.tab, { push: false }); });
  renderTape();
  await showTab(state.tab, { push: false });
  if (glossaryTarget) { await showTab("methodology"); document.getElementById(glossaryTarget)?.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

function renderTape() {
  const comps = MX.composites[META.default_variant]?.factors || {};
  const items = META.factor_order.filter(k => comps[k]).map(k => {
    const c = comps[k];
    return el("button", { class: "tick", onclick: () => openStyle(k) }, [
      el("span", { class: "code", text: fac(k).label }),
      el("span", { class: "bank", text: `${c.n} markets · Sharpe ${fmt(c.tearsheet.since_2010?.sharpe ?? c.tearsheet.all?.sharpe)} since 2010` }),
      el("span", { class: "when " + upDown(c.ytd) }, [el("span", { class: "ylab", text: "YTD " }), txt(pct(c.ytd))]),
    ]);
  });
  const tape = $("#tape");
  tape.replaceChildren(...items, ...items.map(i => i.cloneNode(true)));
  for (const b of $$(".tick", tape)) b.addEventListener("click", () => openStyle(META.factor_order.filter(k => comps[k])[[...tape.children].indexOf(b) % items.length]));
}

// ── Monitor ──────────────────────────────────────────────────────────────────
async function initMonitor() {
  const nMk = META.market_order.length, nF = META.factor_order.length;
  const tiers = { 1: 0, 2: 0, 3: 0 };
  for (const c of META.market_order) tiers[mkt(c).tier]++;
  $("#hero-sub").textContent = `${nF} canonical styles built the same way in ${nMk} markets (${tiers[1]} where shorting is routine, ${tiers[2]} with restrictions, ${tiers[3]} where it is not possible): top 30% long, bottom 30% short, dollar neutral, sector neutral by default, geared to 10% vol on the book's own realised PnL, net of commission, spread, stamp duty and borrow. Four constructions of every book: sector-neutral or plain, dollar- or inverse-vol-weighted.`;
  $("#hero-side").replaceChildren(...META.factor_order.map(k => el("button", { class: `sh-link sty f-${k}`, onclick: () => openStyle(k) }, [el("b", { text: fac(k).label }), el("span", { class: "n", text: fac(k).rebalance === "daily" ? `daily, ${fac(k).smoothing}-day smoothing` : `monthly, ${fac(k).smoothing}-day smoothing` })])));
  segFilter("monitor.variant", VARIANTS, () => state.monitor.variant, v => { state.monitor.variant = v; writeHash(); renderMatrix(); renderComposites(); });
  segFilter("monitor.window", Object.entries(WIN_LABEL), () => state.monitor.window, v => { state.monitor.window = v; renderMatrix(); });
  segFilter("monitor.navwindow", WINDOWS, () => state.monitor.navwindow, v => { state.monitor.navwindow = v; renderCompNav(); });
  renderKpis();
  renderMatrix();
  renderComposites();
}
function renderKpis() {
  const vk = META.default_variant, cells = MX.variants[vk], comps = MX.composites[vk]?.factors || {};
  const srs = [];
  for (const c of META.market_order) for (const f of META.factor_order) { const v = cells[c]?.[f]?.sr?.since_2010; if (isNum(v)) srs.push(v); }
  srs.sort((a, b) => a - b);
  const med = srs.length ? srs[Math.floor(srs.length / 2)] : null;
  const pos21 = []; for (const c of META.market_order) for (const f of META.factor_order) { const v = cells[c]?.[f]?.sr?.since_2021; if (isNum(v)) pos21.push(v > 0 ? 1 : 0); }
  const best = Object.entries(comps).map(([k, c]) => [k, c.tearsheet.since_2010?.sharpe ?? c.tearsheet.all?.sharpe]).filter(([, v]) => isNum(v)).sort((a, b) => b[1] - a[1])[0];
  const worst = Object.entries(comps).map(([k, c]) => [k, c.tearsheet.since_2010?.sharpe ?? c.tearsheet.all?.sharpe]).filter(([, v]) => isNum(v)).sort((a, b) => a[1] - b[1])[0];
  const names = META.market_order.reduce((a, c) => a + (mkt(c).n_names || 0), 0);
  $("#kpis").replaceChildren(
    tile("Books", String(META.n_books), `${META.market_order.length} markets × ${META.factor_order.length} styles × 4 constructions`),
    tile("Names priced", names.toLocaleString(), `across the built markets · ADV floors from $0.5m to $5m a day`),
    tile("Median cell Sharpe", fmt(med), `sector-neutral, dollar-weighted · since 2010 · ${srs.length} cells`, { cls: upDown(med) }),
    tile("Cells positive since 2021", pos21.length ? pctU(pos21.reduce((a, b) => a + b, 0) / pos21.length, 0) : "—", `the window the fundamental styles cover · ${pos21.length} cells`),
    tile("Best style", best ? fac(best[0]).label : "—", best ? `global composite Sharpe ${fmt(best[1])} since 2010` : "", { cls: "up", spark: best ? comps[best[0]].spark : null }),
    tile("Weakest style", worst ? fac(worst[0]).label : "—", worst ? `global composite Sharpe ${fmt(worst[1])} since 2010` : "", { cls: "down", spark: worst ? comps[worst[0]].spark : null }),
  );
}
function renderMatrix() {
  const vk = state.monitor.variant, w = state.monitor.window, cells = MX.variants[vk];
  const isYtd = w === "ytd";
  $("#matrix-ctx").textContent = isYtd ? "return this year, % of capital at 10% vol · select a cell to open the book · hatched = not shortable"
    : `Sharpe ratio ${WIN_LABEL[w].toLowerCase()}, net of costs · select a cell to open the book · hatched = not shortable`;
  const table = el("table", { class: "data" });
  table.append(el("thead", {}, el("tr", {}, [el("th", { text: "Market" }), ...META.factor_order.map(f => el("th", { class: "n", text: fac(f).label }))])));
  const byTier = [1, 2, 3].map(t => META.market_order.filter(c => mkt(c).tier === t));
  const body = el("tbody");
  let n = 0;
  byTier.forEach((codes, i) => {
    if (!codes.length) return;
    body.append(el("tr", {}, el("td", { colspan: META.factor_order.length + 1, class: "legend-note", text: i === 0 ? "Tier 1 · shorting routine" : i === 1 ? "Tier 2 · shorting with restrictions" : "Tier 3 · not shortable: a measurement, not a product" })));
    for (const c of codes) {
      const m = mkt(c);
      const tr = el("tr", {}, [el("td", { class: "mk" }, [el("b", { text: c }), el("small", { text: `${m.name} · ${m.n_names} names` })])]);
      for (const f of META.factor_order) {
        const cell = cells[c]?.[f];
        const v = cell ? (isYtd ? cell.ytd : cell.sr?.[w]) : null;
        const span = el("span", { class: "cell" + (isNum(v) ? "" : " na") + (m.tier === 3 ? " measure" : ""), text: isNum(v) ? (isYtd ? pct(v, 0) : fmt(v, 2, true)) : "·", style: isNum(v) ? wash(v, isYtd ? 0.2 : 1.5) : "",
          title: cell ? `${m.name} · ${fac(f).label}: Sharpe all ${fmt(cell.sr.all)} · 2010+ ${fmt(cell.sr.since_2010)} · 2021+ ${fmt(cell.sr.since_2021)} · YTD ${pct(cell.ytd)} · max DD ${pct(cell.max_dd, 0, false)}` : "not built",
          onclick: () => { if (cell) openBook(cell.id); } });
        tr.append(el("td", { class: "n" }, span));
        if (cell) n++;
      }
      body.append(tr);
    }
  });
  table.append(body);
  $("#matrix").replaceChildren(table);
  $("#matrix-count").textContent = `${n} books · ${VARIANT_LABEL[vk]}`;
  $("#matrix-legend").replaceChildren(
    el("span", {}, [el("span", { class: "sw", style: wash(isYtd ? 0.2 : 1.5, isYtd ? 0.2 : 1.5) }), txt(isYtd ? "+20% or better" : "Sharpe +1.5 or better")]),
    el("span", {}, [el("span", { class: "sw", style: wash(isYtd ? -0.2 : -1.5, isYtd ? 0.2 : 1.5) }), txt(isYtd ? "−20% or worse" : "Sharpe −1.5 or worse")]),
    el("span", {}, [el("span", { class: "sw measure", style: "background:rgba(255,255,255,0.05)" }), txt("tier 3: short leg not tradeable")]),
    el("span", { text: "standard error of a Sharpe over 15 years is about 0.26; over 5 years 0.45" }),
  );
}
function renderComposites() {
  const vk = state.monitor.variant, C = MX.composites[vk];
  if (!C) { mount("chart-comp-nav", emptyFig("No composites for this construction")); return; }
  renderCompNav();
  mount("chart-comp-corr", corrFig(C.corr.ids.map(k => fac(k).label), C.corr.matrix, { height: 420 }));
  const rows = META.factor_order.filter(k => C.factors[k]).map(k => { const c = C.factors[k]; return { key: k, label: fac(k).label, n: c.n, sr_all: c.tearsheet.all?.sharpe, sr10: c.tearsheet.since_2010?.sharpe, sr21: c.tearsheet.since_2021?.sharpe, sr3: c.tearsheet.last_3y?.sharpe, ytd: c.ytd, dd: c.tearsheet.all?.max_dd, spark: c.spark }; });
  sortableTable($("#comp-board"), [
    { key: "label", label: "Style", render: (v, r) => factorTag(r.key) }, { key: "n", label: "Markets", num: true, nd: 0 },
    { key: "sr_all", label: "Sharpe · all", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr10", label: "2010+", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "sr21", label: "2021+", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr3", label: "3 years", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v) }, { key: "dd", label: "Max DD", num: true, render: v => txt(pct(v, 0, false)) },
    { key: "spark", label: "52 weeks", render: v => sparkSvg(v || [], { w: 100, h: 20 }) },
  ], rows, { sortKey: "sr10", desc: true, onRow: r => openStyle(r.key) });
  mount("chart-comp-breadth", { data: META.factor_order.filter(k => C.factors[k]).map(k => ({ x: C.factors[k].breadth.dates, y: C.factors[k].breadth.values, mode: "lines", name: fac(k).label, line: { color: FACTOR_C[k], width: 1.4 }, hovertemplate: "%{y}<extra>" + fac(k).label + "</extra>" })),
    layout: L({ height: 300, yaxis: { rangemode: "tozero" } }) });
  const years = [...new Set(Object.values(C.factors).flatMap(c => c.by_year.map(r => r.year)))].sort();
  mount("chart-comp-years", heatYears(META.factor_order.filter(k => C.factors[k]).map(k => years.map(y => C.factors[k].by_year.find(r => r.year === y)?.ret ?? null)), META.factor_order.filter(k => C.factors[k]).map(k => fac(k).label), years));
}
function renderCompNav() {
  const C = MX.composites[state.monitor.variant];
  if (!C) return;
  const series = META.factor_order.filter(k => C.factors[k]).map(k => ({ dates: C.factors[k].nav.dates, values: C.factors[k].nav.nav, name: fac(k).label, color: FACTOR_C[k] }));
  const dates = series.length ? series.reduce((a, s) => s.dates.length > a.length ? s.dates : a, []) : [];
  mount("chart-comp-nav", applyWindow(linesFig(series, { height: 460 }), dates, state.monitor.navwindow));
}

// ── Country ──────────────────────────────────────────────────────────────────
async function initCountry() {
  const sel = $("#country-select");
  sel.replaceChildren(...[1, 2, 3].map(t => el("optgroup", { label: t === 1 ? "Tier 1 · shortable" : t === 2 ? "Tier 2 · restricted" : "Tier 3 · not shortable" },
    META.market_order.filter(c => mkt(c).tier === t).map(c => el("option", { value: c, text: `${c} · ${mkt(c).name}` })))));
  sel.value = state.country.code;
  sel.addEventListener("change", () => { state.country.code = sel.value; writeHash(); renderCountry(); });
  segFilter("country.variant", VARIANTS, () => state.country.variant, v => { state.country.variant = v; writeHash(); renderCountry(); });
  segFilter("country.window", WINDOWS, () => state.country.window, v => { state.country.window = v; renderCountry(); });
  await renderCountry();
}
async function renderCountry() {
  const code = state.country.code, vk = state.country.variant, m = mkt(code);
  $("#country-select").value = code;
  const D = await load(`country/${code}.json`);
  $("#country-tier").replaceChildren(tierBadge(D.tier));
  $("#country-name").textContent = D.name;
  $("#country-meta").textContent = `${D.universe.n_names} names · ${dateLabel(D.universe.first)} → ${dateLabel(D.universe.last)} · quotes in ${D.currency}${D.price_unit > 1 ? ` (×1/${D.price_unit})` : ""} · MSCI lending ${D.lending} · short selling ${D.short}`;
  const def = META.default_variant;
  const byF = META.factor_order.filter(f => D.factors[f]?.[vk]).map(f => [f, D.factors[f][vk].summary]);
  const best = [...byF].sort((a, b) => (b[1].sr.since_2010 ?? -9) - (a[1].sr.since_2010 ?? -9))[0];
  $("#country-tiles").replaceChildren(
    tile("Universe today", String(D.universe.n_names), `top ${D.universe_rule.top_n} by value, floors $${D.universe_rule.adv_floor_usd_m}m ADV · median ADV $${fmt(D.universe.adv_quantiles_usd_m["0.5"], 1)}m · all $${fmt(D.universe.sum_adv_usd_bn, 1)}bn a day`),
    tile("Fundamentals from", D.coverage?.btm?.first_20_names ? D.coverage.btm.first_20_names.slice(0, 7) : "—", `first month book-to-market covers 20 names · ${D.lag_days}-day publication lag`),
    tile("Best style here", best ? fac(best[0]).label : "—", best ? `Sharpe ${fmt(best[1].sr.since_2010)} since 2010 · ${VARIANT_SHORT[vk]}` : "", { cls: "up", spark: best ? best[1].spark : null }),
    tile("Styles positive since 2021", byF.length ? `${byF.filter(([, s]) => (s.sr.since_2021 ?? 0) > 0).length} of ${byF.length}` : "—", "the window the fundamental styles cover"),
    tile("Costs assumed", `${fmt(D.costs.commission_bps + D.costs.half_spread_bps, 0)} bps`, `one way · stamp ${fmt(D.costs.stamp_buy_bps, 0)} / ${fmt(D.costs.stamp_sell_bps, 0)} bps buy / sell · borrow ${fmt(D.costs.borrow_bps, 0)} bps a year`),
    tile("Access", D.tier === 1 ? "Routine" : D.tier === 2 ? "Restricted" : "Not shortable", D.tier === 3 ? "the short leg is a measurement" : D.tier === 2 ? "eligible lists, registration or reporting" : "deep lending, standard rules", { cls: D.tier === 3 ? "down" : "" }),
  );
  $("#country-access").replaceChildren(el("b", { text: "What a long/short book must honour here. " }), txt(D.access), el("div", { class: "data-notes" }, [el("b", { text: "Data. " }), txt(D.data_notes || "—")]));
  $("#country-rule").replaceChildren(el("b", { text: "Universe rule" }), txt(`Top ${D.universe_rule.top_n} by market value on the market's exchanges, issuer domiciled here, one share class per issuer; then daily: 252 days of history, ADV ≥ $${D.universe_rule.adv_floor_usd_m}m (20% band), price ≥ ${D.universe_rule.price_floor} ${D.currency === "USD" ? "" : "quote units"}, at least ${D.universe_rule.min_names} names.`));
  // every style's NAV, default variant
  const series = META.factor_order.filter(f => D.factors[f]?.[def]?.nav).map(f => ({ dates: D.factors[f][def].nav.dates, values: D.factors[f][def].nav.nav, name: fac(f).label, color: FACTOR_C[f] }));
  const dates = series.length ? series.reduce((a, s) => s.dates.length > a.length ? s.dates : a, []) : [];
  mount("chart-c-nav", series.length ? applyWindow(linesFig(series, { height: 460 }), dates, state.country.window) : emptyFig("No books"));
  mount("chart-c-corr", D.corr ? corrFig(D.corr.ids.map(k => fac(k).label), D.corr.matrix, { height: 460 }) : emptyFig("—"));
  $("#c-board-ctx").textContent = `${VARIANT_LABEL[vk]} · Sharpe by window · select a row to open the book`;
  sortableTable($("#country-board"), [
    { key: "label", label: "Style", render: (v, r) => factorTag(r.key) },
    { key: "sr_all", label: "Sharpe · all", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr10", label: "2010+", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "sr21", label: "2021+", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr3", label: "3 years", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v) }, { key: "vol", label: "Vol", num: true, render: v => txt(pctU(v)) },
    { key: "dd", label: "Max DD", num: true, render: v => txt(pct(v, 0, false)) }, { key: "turnover", label: "Turnover", num: true, render: v => txt(isNum(v) ? fmt(v, 1) + "×" : "—") },
    { key: "cost", label: "Cost bps/yr", num: true, nd: 0 }, { key: "names", label: "Names", num: true, nd: 0 }, { key: "start", label: "From" },
    { key: "spark", label: "52 weeks", render: v => sparkSvg(v || [], { w: 100, h: 20 }) },
  ], byF.map(([f, s]) => ({ key: f, label: fac(f).label, id: s.id, sr_all: s.sr.all, sr10: s.sr.since_2010, sr21: s.sr.since_2021, sr3: s.sr.last_3y, ytd: s.ytd, vol: s.vol.all, dd: s.max_dd, turnover: s.turnover, cost: s.cost_bps, names: s.names_held, start: s.start, spark: s.spark })),
    { sortKey: "sr10", desc: true, onRow: r => openBook(r.id) });
  const U = D.universe;
  mount("chart-c-breadth", { data: [
    { x: U.names_priced.dates, y: U.names_priced.values, mode: "lines", name: "Names priced", line: { color: T.muted, width: 1.4 } },
    ...(U.names_eligible ? [{ x: U.names_eligible.dates, y: U.names_eligible.values, mode: "lines", name: "Eligible after the floors", line: { color: marketColor(code), width: 1.8 } }] : []),
  ], layout: L({ height: 300, yaxis: { rangemode: "tozero" } }) });
  const sm = Object.entries(U.sector_mix).sort((a, b) => b[1] - a[1]);
  mount("chart-c-sectors", { data: [{ x: sm.map(r => r[0]), y: sm.map(r => r[1]), type: "bar", name: "Names", marker: { color: marketColor(code) }, hovertemplate: "%{x}: %{y}<extra></extra>" }],
    layout: L({ height: 300, showlegend: false, hovermode: "closest", xaxis: { showgrid: false, tickangle: -30, tickfont: { size: 10 } } }) });
  const yearsAll = [...new Set(META.factor_order.flatMap(f => (D.factors[f]?.[def]?.by_year || []).map(r => r.year)))].sort();
  const fy = META.factor_order.filter(f => D.factors[f]?.[def]?.by_year);
  mount("chart-c-years", fy.length ? heatYears(fy.map(f => yearsAll.map(y => D.factors[f][def].by_year.find(r => r.year === y)?.ret ?? null)), fy.map(f => fac(f).label), yearsAll) : emptyFig("—"));
  const cov = Object.entries(D.coverage || {}).map(([k, v]) => ({ panel: k, first: v.first_20_names === "None" ? "—" : v.first_20_names, cov: v.coverage_1y }));
  $("#country-coverage").replaceChildren(buildTable([{ key: "panel", label: "Panel" }, { key: "first", label: "20 names from" }, { key: "cov", label: "Coverage, last year", num: true, render: v => txt(pctU(v, 0)) }], cov));
  if (D.coverage_notes?.length) $("#country-coverage").append(el("p", { class: "note", text: D.coverage_notes.join(" · ") }));
}

// ── Style ────────────────────────────────────────────────────────────────────
async function initStyle() {
  const sel = $("#style-select");
  sel.replaceChildren(...META.factor_order.map(k => el("option", { value: k, text: fac(k).label })));
  sel.value = state.style.key;
  sel.addEventListener("change", () => { state.style.key = sel.value; writeHash(); renderStyle(); });
  segFilter("style.variant", VARIANTS, () => state.style.variant, v => { state.style.variant = v; writeHash(); renderStyle(); });
  await renderStyle();
}
async function renderStyle() {
  const k = state.style.key, vk = state.style.variant;
  $("#style-select").value = k;
  const D = await load(`style/${k}.json`);
  const C = MX.composites[vk]?.factors?.[k];
  const codes = META.market_order.filter(c => D.markets[c]?.[vk]);
  $("#style-name").textContent = fac(k).label;
  $("#style-meta").textContent = `${codes.length} markets · ${fac(k).rebalance === "daily" ? "re-struck daily" : "re-struck monthly"}, ${fac(k).smoothing}-day smoothing · ${VARIANT_LABEL[vk]}`;
  $("#style-blurb").textContent = fac(k).blurb;
  $("#style-rule").replaceChildren(el("b", { text: "Source" }), txt(fac(k).literature || "—"));
  const srs = codes.map(c => D.markets[c][vk].sr.since_2010).filter(isNum).sort((a, b) => a - b);
  $("#style-tiles").replaceChildren(
    tile("Global composite Sharpe", fmt(C?.tearsheet.since_2010?.sharpe ?? C?.tearsheet.all?.sharpe), C ? `${C.n} markets at equal weight, 10% vol · since 2010 · all ${fmt(C.tearsheet.all?.sharpe)} · 2021+ ${fmt(C.tearsheet.since_2021?.sharpe)}` : "", { cls: upDown(C?.tearsheet.since_2010?.sharpe), spark: C?.spark }),
    tile("Median market Sharpe", fmt(srs.length ? srs[Math.floor(srs.length / 2)] : null), `since 2010 · ${srs.filter(v => v > 0).length} of ${srs.length} markets positive`),
    tile("This year", pct(C?.ytd), C ? `composite · max drawdown ${pct(C.tearsheet.all?.max_dd, 0, false)}` : "", { cls: upDown(C?.ytd) }),
    tile("Best market", srs.length ? codes.sort((a, b) => (D.markets[b][vk].sr.since_2010 ?? -9) - (D.markets[a][vk].sr.since_2010 ?? -9))[0] : "—", srs.length ? `Sharpe ${fmt(Math.max(...srs))} since 2010` : "", { cls: "up" }),
  );
  codes.sort((a, b) => META.market_order.indexOf(a) - META.market_order.indexOf(b));
  const nav = D.nav_m;
  mount("chart-st-nav", { data: codes.filter(c => nav[c]).map(c => ({ x: nav.dates, y: nav[c], mode: "lines", name: `${c} · ${mkt(c).name}`, line: { color: marketColor(c), width: 1.3 }, hovertemplate: "%{y:.0f}<extra>" + c + "</extra>" })),
    layout: L({ height: 460, yaxis: { type: "log" } }) });
  mount("chart-st-corr", D.corr ? corrFig(D.corr.ids, D.corr.matrix, { height: 460 }) : emptyFig("Needs more than one market"));
  sortableTable($("#style-board"), [
    { key: "code", label: "Market", cls: "sym" }, { key: "name", label: "", cls: "nm" }, { key: "tier", label: "Tier", render: v => tierBadge(v) },
    { key: "sr_all", label: "Sharpe · all", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr10", label: "2010+", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "sr21", label: "2021+", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr3", label: "3 years", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v) }, { key: "dd", label: "Max DD", num: true, render: v => txt(pct(v, 0, false)) },
    { key: "turnover", label: "Turnover", num: true, render: v => txt(isNum(v) ? fmt(v, 1) + "×" : "—") }, { key: "cost", label: "Cost bps/yr", num: true, nd: 0 },
    { key: "names", label: "Names", num: true, nd: 0 }, { key: "start", label: "From" }, { key: "spark", label: "52 weeks", render: v => sparkSvg(v || [], { w: 100, h: 20 }) },
  ], codes.map(c => { const s = D.markets[c][vk]; return { code: c, name: mkt(c).name, tier: mkt(c).tier, id: s.id, sr_all: s.sr.all, sr10: s.sr.since_2010, sr21: s.sr.since_2021, sr3: s.sr.last_3y, ytd: s.ytd, dd: s.max_dd, turnover: s.turnover, cost: s.cost_bps, names: s.names_held, start: s.start, spark: s.spark }; }),
    { sortKey: "sr10", desc: true, onRow: r => openBook(r.id) });
  const years = [...new Set(Object.values(D.by_year).flatMap(o => Object.keys(o).map(Number)))].sort();
  const rows = codes.filter(c => D.by_year[c]).map(c => years.map(y => D.by_year[c][y] ?? null));
  mount("chart-st-years", rows.length ? heatYears(rows, codes.filter(c => D.by_year[c]), years, { zmax: 25 }) : emptyFig("—"));
}

// ── Book ─────────────────────────────────────────────────────────────────────
async function initBook() {
  const m = $("#book-market"), f = $("#book-factor"), v = $("#book-variant");
  m.replaceChildren(...META.market_order.map(c => el("option", { value: c, text: `${c} · ${mkt(c).name}` })));
  f.replaceChildren(...META.factor_order.map(k => el("option", { value: k, text: fac(k).label })));
  v.replaceChildren(...Object.entries(VARIANT_LABEL).map(([k, l]) => el("option", { value: k, text: l })));
  const pick = () => { const id = bookId(m.value, f.value, v.value); if (MX.summaries[id]) { state.book.id = id; writeHash(); renderBook(); } else { $("#book-name").textContent = "Not built"; $("#book-meta").textContent = `${mkt(m.value).name} · ${fac(f.value).label} · ${VARIANT_LABEL[v.value]}: no cached run`; } };
  for (const s of [m, f, v]) s.addEventListener("change", pick);
  segFilter("book.window", WINDOWS, () => state.book.window, x => { state.book.window = x; renderBook(); });
  segFilter("book.leg", [["all", "All"], ["long", "Long"], ["short", "Short"]], () => state.book.leg, x => { state.book.leg = x; renderBook(); });
  await renderBook();
}
async function renderBook() {
  const id = state.book.id, S = MX.summaries[id];
  if (!S) return;
  const { market, factor, variant } = parseBook(id);
  $("#book-market").value = market; $("#book-factor").value = factor; $("#book-variant").value = variant;
  const D = await load(`book/${id}.json`);
  const c = FACTOR_C[factor] || T.up, ts = D.tearsheet, w = state.book.window, m = mkt(market);
  $("#book-name").replaceChildren(txt(`${m.name} · ${fac(factor).label}`), txt(" "), tierBadge(m.tier));
  $("#book-meta").textContent = `${VARIANT_LABEL[variant]} · ${dateLabel(S.start)} → ${dateLabel(S.end)} · ${fmt(ts.all.n_years, 1)} years · ${fac(factor).rebalance}, ${fac(factor).smoothing}-day smoothing`;
  $("#book-tiles").replaceChildren(
    tile("Sharpe · whole sample", fmt(ts.all.sharpe), `${pctU(ts.all.ann_ret)} a year at ${pctU(ts.all.vol)} · ± ${fmt(ts.all.se_sharpe)} s.e. · Sortino ${fmt(ts.all.sortino)}`),
    tile("Sharpe · since 2021", fmt(ts.since_2021?.sharpe), `${pctU(ts.since_2021?.ann_ret)} a year · 2010+ ${fmt(ts.since_2010?.sharpe)} · 3y ${fmt(ts.last_3y?.sharpe)}`),
    tile("This year", pct(S.ytd), `3 months ${pct(S.m3)} · 12 months ${pct(S.m12)}`, { cls: upDown(S.ytd), spark: S.spark }),
    tile("Max drawdown", pct(ts.all.max_dd, 1, false), `now ${pct(S.dd_now, 1, false)} from the peak · Calmar ${fmt(ts.all.calmar)}`, { cls: "down" }),
    tile("Turnover", isNum(D.activity.turnover_mean) ? fmt(D.activity.turnover_mean, 1) + "×" : "—", `of capital a year · ${fmt(S.turnover_gross, 1)}× of gross · gross ${fmt(S.gross_mean, 1)}× · ${fmt(D.activity.cost_bps_mean, 0)} bps a year in costs · ${fmt(S.names_held, 0)} names held`),
    tile("Neutrality", pctU(D.neutrality.net_mean_abs, 2), `mean |net| of capital · worst day ${pctU(D.neutrality.net_max_abs, 1)} · sector |net| ${pctU(D.neutrality.sector_net_mean_abs, 2)} mean`),
  );
  mount("chart-b-nav", applyWindow(navFig(D.nav.dates, D.nav.nav, D.nav.dd, c, `${market} ${fac(factor).label}`), D.nav.dates, w));
  const keys = ["all", "since_2010", "since_2021", "last_3y", "ytd"].filter(k => ts[k]);
  const rows = [["Return, annualised", k => pctU(ts[k].ann_ret)], ["Volatility", k => pctU(ts[k].vol)], ["Sharpe", k => fmt(ts[k].sharpe)], ["Sharpe s.e.", k => fmt(ts[k].se_sharpe)], ["Sortino", k => fmt(ts[k].sortino)], ["Max drawdown", k => pct(ts[k].max_dd, 1, false)], ["Calmar", k => fmt(ts[k].calmar)],
    ["Best year", k => `${ts[k].best_year[0]} ${pct(ts[k].best_year[1])}`], ["Worst year", k => `${ts[k].worst_year[0]} ${pct(ts[k].worst_year[1])}`], ["Years positive", k => pctU(ts[k].pct_years_pos, 0)], ["Months positive", k => pctU(ts[k].pct_months_pos, 0)],
    ["Best month", k => `${ts[k].best_month[0]} ${pct(ts[k].best_month[1])}`], ["Worst month", k => `${ts[k].worst_month[0]} ${pct(ts[k].worst_month[1])}`], ["Skew, daily / monthly", k => `${fmt(ts[k].skew_d)} / ${fmt(ts[k].skew_m)}`], ["Excess kurtosis, daily", k => fmt(ts[k].kurt_d, 1)]];
  $("#b-tear").replaceChildren(buildTable([{ key: "_m", label: "" }, ...keys.map(k => ({ key: k, label: WIN_LABEL[k], num: true, render: v => txt(v) }))], rows.map(([mm, fn]) => Object.fromEntries([["_m", mm], ...keys.map(k => [k, fn(k)])]))));
  mount("chart-b-calendar", calendarFig(D.calendar));
  const yrs = D.by_year;
  mount("chart-b-annual", { data: [{ x: yrs.map(r => r.year), y: yrs.map(r => r.ret * 100), type: "bar", name: "Return", marker: { color: yrs.map(r => r.ret >= 0 ? T.up : T.down) }, customdata: yrs.map(r => [r.sharpe, r.max_dd * 100]), hovertemplate: "%{x}: %{y:.1f}% · Sharpe %{customdata[0]:.2f} · max DD %{customdata[1]:.1f}%<extra></extra>" }],
    layout: L({ height: Math.max(360, 15 * yrs.length + 40), showlegend: false, hovermode: "closest", xaxis: { type: "category", showgrid: false }, yaxis: { ticksuffix: "%" } }) });
  mount("chart-b-rolling", rollingSharpeFig(D.rolling.sharpe_1y, D.rolling.sharpe_3y, c));
  const G = D.gearing;
  mount("chart-b-gearing", G.factor ? { data: [
    { x: G.factor.dates, y: G.factor.values, mode: "lines", name: "Gearing scalar", line: { color: c, width: 1.6 }, hovertemplate: "%{y:.2f}×<extra>scalar</extra>" },
    { x: D.rolling.vol_63.dates, y: D.rolling.vol_63.values.map(v => isNum(v) ? v * 100 : null), mode: "lines", name: "Realised vol, 63-day", line: { color: T.amber, width: 1.4 }, xaxis: "x2", yaxis: "y2", hovertemplate: "%{y:.1f}%<extra>realised vol</extra>" },
  ], layout: L({ height: 440, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1], ticksuffix: "×", rangemode: "tozero" }, yaxis2: { domain: [0, 0.44], ticksuffix: "%", rangemode: "tozero" }, xaxis: { anchor: "y" }, xaxis2: { anchor: "y2", matches: "x" },
    shapes: [{ type: "line", xref: "paper", x0: 0, x1: 1, yref: "y", y0: G.cap, y1: G.cap, line: { color: T.down, dash: "dot", width: 1 } }, { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y2", y0: 10, y1: 10, line: { color: T.axis, dash: "dot", width: 1 } }] }) } : emptyFig("No gearing record"));
  const E = D.exposure, gk = Object.keys(E.gross);
  const secColors = gk.map((_, i) => MARKET_C[i % MARKET_C.length]);
  mount("chart-b-exposure", { data: [
    ...gk.map((k, i) => ({ x: E.dates, y: E.gross[k], stackgroup: "g", mode: "lines", name: k, line: { width: 0.5, color: secColors[i] }, fillcolor: rgba(secColors[i], 0.55), legendgroup: k, hovertemplate: "%{y:.2f}×<extra>" + k + " gross</extra>" })),
    ...gk.map((k, i) => ({ x: E.dates, y: E.net[k], mode: "lines", name: k, line: { width: 1.2, color: secColors[i] }, legendgroup: k, showlegend: false, xaxis: "x2", yaxis: "y2", hovertemplate: "%{y:.3f}×<extra>" + k + " net</extra>" })),
  ], layout: L({ height: 480, grid: { rows: 2, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.56, 1], ticksuffix: "×" }, yaxis2: { domain: [0, 0.44], ticksuffix: "×", zeroline: true }, xaxis: { anchor: "y" }, xaxis2: { anchor: "y2", matches: "x" }, legend: { font: { size: 9.5 } } }) });
  const ty = Object.keys(D.activity.turnover_by_year);
  mount("chart-b-activity", { data: [
    { x: ty, y: ty.map(k => D.activity.turnover_by_year[k]), type: "bar", name: "Turnover, × capital", marker: { color: c }, hovertemplate: "%{x}: %{y:.1f}×<extra>turnover</extra>" },
    { x: ty, y: ty.map(k => D.activity.cost_bps_by_year[k]), type: "bar", name: "Cost, bps of capital", marker: { color: T.amber }, xaxis: "x2", yaxis: "y2", hovertemplate: "%{x}: %{y:.0f} bps<extra>cost</extra>" },
    { x: D.activity.names_held.dates, y: D.activity.names_held.values, mode: "lines", name: "Names held", line: { color: T.muted, width: 1.2 }, xaxis: "x3", yaxis: "y3", hovertemplate: "%{y:.0f}<extra>names</extra>" },
  ], layout: L({ height: 520, hovermode: "x", grid: { rows: 3, columns: 1, roworder: "top to bottom" }, yaxis: { domain: [0.7, 1], ticksuffix: "×" }, yaxis2: { domain: [0.37, 0.63] }, yaxis3: { domain: [0, 0.3], rangemode: "tozero" }, xaxis: { type: "category", showgrid: false }, xaxis2: { type: "category", showgrid: false, matches: "x" }, xaxis3: { showgrid: false } }) });
  const leg = state.book.leg;
  const pos = D.positions.filter(p => leg === "all" || (leg === "long" ? p.weight > 0 : p.weight < 0));
  $("#b-pos-ctx").textContent = `${D.n_positions} positions at ${dateLabel(D.as_of)} (${D.positions.filter(p => p.weight > 0).length} long, ${D.positions.filter(p => p.weight < 0).length} short) · weight in % of capital · vol · ADV · market value · this year's P&L from the name`;
  sortableTable($("#b-positions"), [
    { key: "symbol", label: "Name", cls: "sym" }, { key: "name", label: "", cls: "nm" }, { key: "sector", label: "Sector" }, { key: "industry", label: "Industry", cls: "nm" },
    { key: "weight", label: "Weight", num: true, render: v => signedPct(v, 2) }, { key: "vol", label: "Vol", num: true, render: v => txt(pctU(v, 0)) },
    { key: "adv_usd_m", label: "ADV $m", num: true, nd: 1 }, { key: "mcap_usd_bn", label: "Value $bn", num: true, nd: 1 }, { key: "ytd", label: "This year", num: true, render: v => signedPct(v, 2) },
  ], pos, { sortKey: "weight", desc: true });
  $("#b-dd").replaceChildren(buildTable([{ key: "peak", label: "Peak" }, { key: "trough", label: "Trough" }, { key: "recovery", label: "Recovery" }, { key: "depth", label: "Depth", num: true, render: v => txt(pct(v, 1, false)) }, { key: "days", label: "Days", num: true, nd: 0 }], D.drawdowns));
  const N = D.neutrality;
  $("#b-neutral").replaceChildren(buildTable([{ key: "k", label: "" }, { key: "mean", label: "Mean", num: true, render: v => txt(pctU(v, 2)) }, { key: "max", label: "Worst day", num: true, render: v => txt(pctU(v, 1)) }],
    [{ k: "|Net| of capital", mean: N.net_mean_abs, max: N.net_max_abs }, { k: "|Sector net|", mean: N.sector_net_mean_abs, max: N.sector_net_max_abs }]));
  const mid = D.dist_m.edges.slice(0, -1).map((v, i) => (v + D.dist_m.edges[i + 1]) / 2 * 100);
  mount("chart-b-dist", { data: [{ x: mid, y: D.dist_m.counts, type: "bar", name: "Months", marker: { color: mid.map(v => v >= 0 ? T.up : T.down) }, hovertemplate: "%{x:.1f}%: %{y} months<extra></extra>" }], layout: L({ height: 220, showlegend: false, hovermode: "x", bargap: 0.05, xaxis: { ticksuffix: "%" }, margin: { l: 36, b: 30 } }) });
  $("#b-config").textContent = D.config;
}

// ── Pure factors ─────────────────────────────────────────────────────────────
async function initPure() {
  const sel = $("#pure-select");
  sel.replaceChildren(...META.market_order.map(c => el("option", { value: c, text: `${c} · ${mkt(c).name}` })));
  sel.value = state.pure.code;
  sel.addEventListener("change", () => { state.pure.code = sel.value; writeHash(); renderPure(); });
  await renderPure();
}
async function renderPure() {
  const code = state.pure.code;
  $("#pure-select").value = code;
  const D = await load(`pure/${code}.json`);
  if (!D.nav) { $("#pure-note").textContent = "not estimated for this market"; for (const id of ["chart-p-styles", "chart-p-sectors"]) mount(id, emptyFig("—")); $("#p-stats").replaceChildren(); $("#p-loadings").replaceChildren(); return; }
  $("#pure-note").textContent = `${dateLabel(D.start)} → ${dateLabel(D.end)} · square-root-of-market-value weights · styles standardised daily · ${D.styles.length} styles, ${D.sectors.length} sectors`;
  const sty = ["market", ...D.styles];
  mount("chart-p-styles", { data: sty.map((k, i) => ({ x: D.nav.dates, y: D.nav[k], mode: "lines", name: k, line: { color: k === "market" ? T.muted : (FACTOR_C[k] || MARKET_C[i]), width: k === "market" ? 1 : 1.5 }, hovertemplate: "%{y:.2f}<extra>" + k + "</extra>" })), layout: L({ height: 420, yaxis: { type: "log" } }) });
  mount("chart-p-sectors", { data: D.sectors.map((k, i) => ({ x: D.nav.dates, y: D.nav[k], mode: "lines", name: k, line: { color: MARKET_C[i % MARKET_C.length], width: 1.3 }, hovertemplate: "%{y:.2f}<extra>" + k + "</extra>" })), layout: L({ height: 420, yaxis: { type: "log" }, legend: { font: { size: 9.5 } } }) });
  const rows = Object.entries(D.stats).filter(([, s]) => s && s.sharpe !== undefined).map(([k, s]) => ({ k, kind: k === "market" ? "market" : D.styles.includes(k) ? "style" : "sector", ret: s.ann_ret, vol: s.vol, sharpe: s.sharpe, dd: s.max_dd, start: s.start }));
  sortableTable($("#p-stats"), [{ key: "k", label: "Factor" }, { key: "kind", label: "" }, { key: "ret", label: "Return/yr", num: true, render: v => signedPct(v) }, { key: "vol", label: "Vol", num: true, render: v => txt(pctU(v)) }, { key: "sharpe", label: "Sharpe", num: true, render: v => washCell(v, 2, 1.5) }, { key: "dd", label: "Max DD", num: true, render: v => txt(pct(v, 0, false)) }, { key: "start", label: "From" }], rows, { sortKey: "sharpe", desc: true });
  const LD = D.loadings || {};
  const facs = META.factor_order.filter(f => LD[f]);
  const cols = ["alpha", "market", ...D.styles];
  const table = el("table", { class: "data" });
  table.append(el("thead", {}, el("tr", {}, [el("th", { text: "Book" }), ...cols.map(k => el("th", { class: "n", text: k === "alpha" ? "α, %/yr" : "β " + k })), el("th", { class: "n", text: "R²" }), el("th", { class: "n", text: "IR of α" })])));
  table.append(el("tbody", {}, facs.map(f => el("tr", {}, [el("td", {}, factorTag(f)), ...cols.map(k => el("td", { class: "n", title: `t = ${fmt(LD[f].t[k], 1)}` }, k === "alpha" ? signedPct(LD[f].alpha_ann, 1) : washCell(LD[f].beta[k], 2, 1.0))), el("td", { class: "n", text: fmt(LD[f].r2, 2) }), el("td", { class: "n" }, washCell(LD[f].ir, 2, 1.5))]))));
  $("#p-loadings").replaceChildren(table, el("p", { class: "note", text: "Betas are to the daily pure factor returns (one unit of standardised exposure); hover a cell for its t-statistic. A sector-neutral momentum book that loads mostly on pure momentum, with little market or value, is doing what it says." }));
}

// ── Markets & access ─────────────────────────────────────────────────────────
async function initAccess() {
  const A = await load("access.json");
  const rows = A.markets;
  $("#access-sub").textContent += ` Source: ${A.source}.`;
  const show = (r) => {
    state.access.code = r.code;
    $("#access-detail-title").replaceChildren(txt(`${r.name} `), tierBadge(r.tier));
    $("#access-detail").replaceChildren(
      el("p", {}, [el("b", { text: "Access. " }), txt(r.access || "—")]),
      el("p", {}, [el("b", { text: "MSCI 2026. " }), txt(`Stock lending ${r.lending}, short selling ${r.short}${r.msci_note ? " — " + r.msci_note : ""}.`)]),
      el("p", {}, [el("b", { text: "Costs assumed. " }), txt(`Commission ${r.commission_bps} bps, half spread ${r.half_spread_bps} bps, stamp or FTT ${r.stamp_buy_bps} bps on buys and ${r.stamp_sell_bps} bps on sells, borrow ${r.borrow_bps} bps a year on the short notional.`)]),
      el("p", {}, [el("b", { text: "Universe. " }), txt(`Top ${r.top_n} by market value, ADV floor $${r.adv_floor_usd_m}m a day${r.built ? `; ${r.n_names} names priced, data from ${r.first}` : "; not built yet"}.`)]),
      el("p", { class: "data-notes" }, [el("b", { text: "Data. " }), txt(r.data_notes || "—")]),
    );
    for (const tr of $$("#access-table tr")) tr.setAttribute("aria-current", tr.dataset.code === r.code ? "true" : "false");
  };
  sortableTable($("#access-table"), [
    { key: "code", label: "Market", cls: "sym" }, { key: "name", label: "", cls: "nm" }, { key: "tier", label: "Tier", num: true, render: v => tierBadge(v) }, { key: "classification", label: "MSCI" },
    { key: "lending", label: "Lending" }, { key: "short", label: "Shorting" }, { key: "currency", label: "Ccy" },
    { key: "stamp_buy_bps", label: "Stamp buy", num: true, nd: 0 }, { key: "stamp_sell_bps", label: "Stamp sell", num: true, nd: 0 }, { key: "borrow_bps", label: "Borrow bps/yr", num: true, nd: 0 },
    { key: "top_n", label: "Top N", num: true, nd: 0 }, { key: "adv_floor_usd_m", label: "ADV floor $m", num: true, nd: 1 },
    { key: "built", label: "Built", render: v => el("span", { class: "status " + (v ? "current" : "none") }, [el("span", { class: "dot", style: v ? "background:var(--good)" : "background:var(--axis)" }), txt(v ? "yes" : "—")]) },
    { key: "n_names", label: "Names", num: true, nd: 0 }, { key: "first", label: "From" },
  ], rows, { sortKey: "tier", onRow: show, current: r => r.code === state.access.code });
  show(rows.find(r => r.code === (state.access.code || state.country.code)) || rows[0]);
}

// ── Methodology ──────────────────────────────────────────────────────────────
async function initMethodology() {
  const M = await load("method.json");
  const d = M.defaults;
  $("#method-prose").innerHTML = `
<h3>What this is</h3>
<p>One research engine, built for futures and extended to single stocks, runs every equity factor book through the same stages: a universe filter, a characteristic or return-based indicator, a cross-sectional rank, a long/short position function, a rebalance schedule with smoothing, a gearing layer that targets risk on the book's own realised PnL, and a cost model. Every cell of the country × style matrix is one configuration of those stages, generated from two tables: the markets and the factors. Nothing is fitted per market.</p>
<h3>The construction</h3>
<ul>${M.construction.map(s => `<li>${s}</li>`).join("")}</ul>
<p>The guards a stock book needs and a futures book does not: a penny-stock floor in the market's own quote units, a liquidity floor and a market-value floor in USD (each with a 20% exit band and a one-day lag), a traded-days test, one share class per issuer, foreign and depositary listings excluded, isolated bad prints blanked and unadjusted consolidations cut from the price history, returns capped at five trailing standard deviations before any compounding indicator, characteristics winsorised at 1% a day, a 5% per-name cap, and a 10% net sector cap on the books that are not sector-neutral.</p>
<p>Four constructions of every book are shown. <strong>Sector-neutral</strong> ranks and balances the legs inside each of Yahoo's eleven sectors (GICS names), so no sector carries a net position; <strong>plain</strong> ranks the whole market and lets the book tilt. <strong>Dollar-weighted</strong> gives every held name the same weight inside its leg; <strong>inverse-vol</strong> sizes names by 1/σ (63-day EWMA, floored at 8%) and then re-balances the legs so the book stays dollar neutral. Per-name weight is capped at ${(d.max_weight * 100).toFixed(0)}% of gross with the excess redistributed inside the leg.</p>
<h3>Gearing</h3>
<p>Each book targets ${(d.target_vol * 100).toFixed(0)}% annualised volatility: the position scalar is the target over the trailing ${d.gearing_lookback}-day realised vol of the ungeared book's PnL, lagged a day, capped at ${d.leverage_cap}× gross, and held until it has drifted ${((d.gearing_buffer || 0) * 100).toFixed(0)}% from the value in force. Backward-looking by design, and piecewise constant by design, so the book is re-geared a handful of times a year rather than daily. A diversified sector-neutral stock book runs 2-3% ungeared, so the cap is a budget for gross exposure rather than a venue limit; the gearing chart on each book's page shows where it binds. Turnover is quoted per unit of capital and, beside it, per unit of gross: the first is what the cost model charges, the second is how much the factor itself churns.</p>
<h3>Data</h3>
<p>Yahoo Finance only. Daily adjusted closes (total return), raw closes in quote units, volume, dividends and splits per name; the screener for the universe; one profile per name for country, sector and industry; four or five annual and up to seven quarterly statements per company for the fundamental characteristics. Prices run from 2000 in most markets; the <strong>fundamental styles start around 2021</strong> because that is all the statement history the feed serves. A statement is usable ${"from its period end plus a per-market lag (60 to 90 days)"} until the weekly point-in-time archive has recorded when it actually appeared. Universes are today's listings: <strong>every book is survivorship-biased</strong>, which flatters the long leg and the short leg alike and the momentum books most.</p>
<h3>Costs</h3>
<p>Commission plus half the spread on every unit traded, stamp duty or a financial-transaction tax on the leg it falls on (London 0.5% on purchases, Hong Kong 0.1% each side, Taiwan 0.3% on sales, and so on), and a flat borrow rate on the short notional, all per market from the table on the access tab. No market impact: capacity is a separate question.</p>
<h3>Windows and errors</h3>
<p>Sharpe ratios are shown over the whole sample, since 2010, since 2021 (the window the fundamental styles cover), the last three years and this year. The standard error of a Sharpe ratio is roughly 1/√years: 0.26 over 15 years, 0.45 over five, 0.7 over two. Most cells since 2021 are inside their error bars.</p>
<h3>Caveats</h3>
<ul>${M.caveats.map(s => `<li>${s}</li>`).join("")}</ul>`;
  $("#factor-table").replaceChildren(buildTable([{ key: "label", label: "Style", render: (v, r) => factorTag(r.key) }, { key: "blurb", label: "What is ranked", render: v => el("span", { style: "white-space:normal", text: v }) }, { key: "rebalance", label: "Re-struck" }, { key: "smoothing", label: "Smoothing, days", num: true, nd: 0 }, { key: "panels", label: "Panels", render: v => txt((v || []).join(", ") || "returns") }, { key: "literature", label: "Source", render: v => el("span", { style: "white-space:normal", text: v }) }],
    META.factor_order.map(k => ({ key: k, ...fac(k) }))));
  const G = [
    ["g-sharpe", "Sharpe ratio", "Annualised mean daily return over annualised daily volatility, net of costs, with no risk-free rate subtracted (the book is dollar neutral: the long leg's financing and the short leg's rebate roughly cancel). Standard error about 1/√years."],
    ["g-nav", "Growth of 100", "100 compounded by the daily returns at the 10% vol target, drawn weekly on a log scale; windows other than 'All' rebase to 100 at the window's start."],
    ["g-dd", "Drawdown", "The fall from the running peak of the growth of 100. Max drawdown is the deepest; Calmar is annualised return over max drawdown."],
    ["g-composite", "Global style composite", "The equal-weight average of a style's market books' daily returns (each already at 10% vol), scaled by one constant so the composite's whole-sample volatility is 10%. Breadth shows how many markets contribute on each date."],
    ["g-neutral", "Neutrality", "Mean and worst absolute net exposure of the held book as a share of capital, in total and by sector. The signal-stage book is exactly neutral; the drift comes from smoothing toward a moving target and from names that leave the universe."],
    ["g-turnover", "Turnover", "Gross notional traded in a year divided by capital (one-way); beside it, divided by the book's gross, which is how much the factor itself churns regardless of leverage. Cost is what the market's schedule charges on the capital figure plus borrow, in bps of capital a year."],
    ["g-pure", "Pure factor return", "The daily coefficient on a standardised style score in a cross-sectional regression of stock returns on market, sector dummies (sum to zero) and styles, weighted by √market value: the return to one unit of the style with everything else held at zero (toraniko's construction)."],
    ["g-loading", "Loading", "The slope of a book's daily PnL on a pure factor return; R² is the share of the book's variance the pure factors explain; the IR of α is the annualised intercept over the annualised residual volatility, the Sharpe of what the factors cannot explain."],
    ["g-tier", "Tier", "1: stock lending is deep and shorting routine (MSCI ++/++). 2: allowed with restrictions (eligible lists, registration, reporting). 3: restricted or banned; the short leg cannot be traded and the book is a measurement."],
    ["g-adv", "ADV", "63-day mean of traded value in USD (price × volume × FX, lagged a day). A name enters the universe above the market's floor and leaves 20% below it."],
    ["g-pit", "Point in time", "A statement value is usable from max(period end + lag, first seen in the archive). Before the archive, the lag convention governs; the archive snapshots every table weekly."],
  ];
  $("#glossary").replaceChildren(...G.map(([id, t, dd]) => el("dl", { id }, [el("dt", { text: t }), el("dd", { text: dd })])));
}

main().catch(err => { console.error(err); $("#main").prepend(el("p", { class: "empty", text: "The Quant Ledger could not load its data: " + err.message })); });
