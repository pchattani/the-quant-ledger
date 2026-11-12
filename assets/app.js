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
const FACTOR_C = { momentum: "#7d93ff", reversal: "#5ec8f0", value: "#ffb224", value_composite: "#ffd36a", quality: "#8fd16a", low_beta: "#d9b38c", investment: "#c39be8", size: "#f28fb5", ewmom: "#a9b7ff", lowvol: "#d9b38c", lowbeta: "#e8cfa0", dividend: "#ffd36a" };
const MARKET_C = ["#7d93ff", "#ffb224", "#5ec8f0", "#c39be8", "#8fd16a", "#f28fb5", "#d9b38c", "#ff6a4d", "#a9b7ff", "#ffd36a", "#9ad7c8", "#e0a0ff", "#b5e07a", "#ffb5a0", "#7ad1ff", "#ffc98f", "#c8d08f", "#f0a3c9", "#8fb8ff", "#d4a37a", "#9fe3b8", "#f5c6a0"];
const DIV = [[0, T.down], [0.5, "#1b2740"], [1, T.up]];
const rgba = (hex, a) => { const h = hex.replace("#", ""); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`; };
const PLOT_CONFIG = { displaylogo: false, responsive: true, displayModeBar: "hover", modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d", "toggleSpikelines", "zoomIn2d", "zoomOut2d"] };
const VARIANT_LABEL = { plain_cap: "Cap-weighted · 2×3 sort", neutral_dollar: "Sector-neutral · equal weight", plain_dollar: "Plain · equal weight", neutral_invvol: "Sector-neutral · inverse vol" };
const VARIANT_SHORT = { plain_cap: "Cap-weighted", neutral_dollar: "Neutral · EW", plain_dollar: "Plain · EW", neutral_invvol: "Neutral · 1/σ" };
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
  monitor: { variant: "plain_cap", window: "since_2010", navwindow: "all", family: "headline" },
  country: { code: null, variant: "plain_cap", window: "all", family: "headline" },
  style: { key: "momentum", variant: "plain_cap" },
  book: { id: null, window: "all", leg: "all" },
  pure: { code: null },
  research: { code: null, family: "headline", factor: null, measure: "ic_t" },
  portfolio: { code: "US" },
  access: { code: null },
};
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("tab")) state.tab = p.get("tab");
  if (p.get("market")) { state.country.code = p.get("market"); state.pure.code = p.get("market"); state.research.code = p.get("market"); state.portfolio.code = p.get("market"); }
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
  if (state.tab === "research" && state.research.code) p.set("market", state.research.code);
  if (state.tab === "portfolio" && state.portfolio.code) p.set("market", state.portfolio.code);
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
const parseBook = (id) => { const p = id.split("_"); return { market: p[1], factor: p.slice(2, -2).join("_"), variant: p.slice(-2).join("_") }; };
// families: "headline" is the eight original styles; every other key is a family of the factor file
const famOf = (k) => fac(k).family || "other";
const famLabel = (f) => f === "headline" ? "Headline styles" : (META.families?.[f] || f);
const famFactors = (f) => META.factor_order.filter(k => f === "headline" ? fac(k).headline : famOf(k) === f);
const famOptions = () => [["headline", "Headline styles"], ...Object.keys(META.families || {}).map(k => [k, META.families[k]])];
function fcol(k) {
  if (FACTOR_C[k]) return FACTOR_C[k];
  const peers = META.factor_order.filter(x => famOf(x) === famOf(k) && !FACTOR_C[x]);
  return MARKET_C[Math.max(0, peers.indexOf(k)) % MARKET_C.length];
}
function familySelect(sel, get, set) {
  sel.replaceChildren(...famOptions().map(([k, l]) => el("option", { value: k, text: `${l} (${famFactors(k).length})` })));
  sel.value = get();
  sel.addEventListener("change", () => set(sel.value));
}
function factorOptions() {
  return Object.keys(META.families || {}).map(f => el("optgroup", { label: META.families[f] },
    META.factor_order.filter(k => famOf(k) === f).map(k => el("option", { value: k, text: fac(k).label }))));
}
function subCorr(corr, keys) {
  const idx = keys.map(k => corr.ids.indexOf(k)).filter(i => i >= 0);
  return { ids: idx.map(i => corr.ids[i]), matrix: idx.map(i => idx.map(j => corr.matrix[i][j])) };
}
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
const factorTag = (k) => el("span", { class: `tag factor f-${k}`, text: fac(k).label, style: `--c:${fcol(k)}` });
const tierBadge = (t) => el("span", { class: `tier t${t}`, text: t === 1 ? "Tier 1 · shortable" : t === 2 ? "Tier 2 · restricted" : "Tier 3 · not shortable" });
// data-source badge: EODHD markets carry a point-in-time universe (delisted names included); Yahoo markets are today's listings
const sourceBadge = (m) => el("span", { class: `tier src ${m.point_in_time ? "pit" : "surv"}`,
  title: m.point_in_time ? `EODHD · universe re-struck monthly from historical market value; ${m.ever_members || "?"} names ever members, ${m.delisted_members || 0} since delisted` : "Yahoo Finance · today's listings only (survivorship-biased)",
  text: m.point_in_time ? "EODHD · point-in-time" : "Yahoo · survivorship" });
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
    el("span", { class: "value " + cls + (String(value).length > 11 ? " long" : ""), text: value }),
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
const INIT = { monitor: initMonitor, country: initCountry, style: initStyle, book: initBook, research: initResearch, portfolio: initPortfolio, pure: initPure, access: initAccess, methodology: initMethodology };
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
  else if (tab === "research") await renderResearch();
  else if (tab === "portfolio") await renderPortfolio();
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
  if (!state.research.code || !META.markets[state.research.code]) state.research.code = META.market_order[0];
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
  $("#hero-sub").textContent = `${nF} factors in ${Object.keys(META.families || {}).length} families, built to the published academic definitions in ${nMk} markets (${tiers[1]} where shorting is routine, ${tiers[2]} with restrictions, ${tiers[3]} where it is not possible), on EODHD data with point-in-time universes that include the names that have since delisted. The cap-weighted construction is a value-weighted 2×3 sort re-struck monthly, geared to 10% vol on the book's own realised PnL, net of commission, spread, stamp duty and borrow; every factor is also built sector-neutral at equal weight, and the headline styles and family composites in two further constructions.`;
  const setFamily = (f) => { state.monitor.family = f; $("#monitor-family").value = f; renderMatrix(); renderComposites(); };
  $("#hero-side").replaceChildren(...Object.keys(META.families || {}).map(f => el("button", { class: "sh-link sty", onclick: () => { setFamily(f); $("#matrix").scrollIntoView({ behavior: "smooth", block: "center" }); } },
    [el("b", { text: META.families[f] }), el("span", { class: "n", text: `${famFactors(f).length} factors` })])));
  familySelect($("#monitor-family"), () => state.monitor.family, setFamily);
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
  // a style built in a handful of markets is not a global composite: ten markets or more
  const broad = Object.entries(comps).filter(([, c]) => (c.n || 0) >= 10).map(([k, c]) => [k, c.tearsheet.since_2010?.sharpe ?? c.tearsheet.all?.sharpe, c.n]).filter(([, v]) => isNum(v));
  const best = broad.slice().sort((a, b) => b[1] - a[1])[0];
  const worst = broad.slice().sort((a, b) => a[1] - b[1])[0];
  const names = META.market_order.reduce((a, c) => a + (mkt(c).n_names || 0), 0);
  $("#kpis").replaceChildren(
    tile("Books", String(META.n_books), `${META.market_order.length} markets × ${META.factor_order.length} factors, two to four constructions each`),
    tile("Names priced", names.toLocaleString(), `across the built markets · ADV floors from $0.5m to $5m a day`),
    tile("Median cell Sharpe", fmt(med), `sector-neutral, dollar-weighted · since 2010 · ${srs.length} cells`, { cls: upDown(med) }),
    tile("Cells positive since 2021", pos21.length ? pctU(pos21.reduce((a, b) => a + b, 0) / pos21.length, 0) : "—", `the window the fundamental styles cover · ${pos21.length} cells`),
    tile("Best style", best ? fac(best[0]).label : "—", best ? `${best[2]}-market composite · Sharpe ${fmt(best[1])} since 2010` : "", { cls: "up", spark: best ? comps[best[0]].spark : null }),
    tile("Weakest style", worst ? fac(worst[0]).label : "—", worst ? `${worst[2]}-market composite · Sharpe ${fmt(worst[1])} since 2010` : "", { cls: "down", spark: worst ? comps[worst[0]].spark : null }),
  );
}
function renderMatrix() {
  const vk = state.monitor.variant, w = state.monitor.window, cells = MX.variants[vk];
  const FL = famFactors(state.monitor.family).filter(f => (fac(f).variants || [vk]).includes(vk));
  const isYtd = w === "ytd";
  $("#matrix-ctx").textContent = isYtd ? "return this year, % of capital at 10% vol · select a cell to open the book · hatched = not shortable"
    : `Sharpe ratio ${WIN_LABEL[w].toLowerCase()}, net of costs · select a cell to open the book · hatched = not shortable`;
  const table = el("table", { class: "data" });
  table.append(el("thead", {}, el("tr", {}, [el("th", { text: "Market" }), ...FL.map(f => el("th", { class: "n", text: fac(f).label }))])));
  const byTier = [1, 2, 3].map(t => META.market_order.filter(c => mkt(c).tier === t));
  const body = el("tbody");
  let n = 0;
  byTier.forEach((codes, i) => {
    if (!codes.length) return;
    body.append(el("tr", {}, el("td", { colspan: FL.length + 1, class: "legend-note", text: i === 0 ? "Tier 1 · shorting routine" : i === 1 ? "Tier 2 · shorting with restrictions" : "Tier 3 · not shortable: a measurement, not a product" })));
    for (const c of codes) {
      const m = mkt(c);
      const tr = el("tr", {}, [el("td", { class: "mk" }, [el("b", { text: c }), el("small", { text: `${m.name} · ${m.n_names} names` })])]);
      for (const f of FL) {
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
  $("#matrix-count").textContent = `${n} books · ${famLabel(state.monitor.family)} · ${VARIANT_LABEL[vk]}`;
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
  const FL = famFactors(state.monitor.family).filter(k => C.factors[k]);
  const SC = subCorr(C.corr, FL);
  mount("chart-comp-corr", SC.ids.length > 1 ? corrFig(SC.ids.map(k => fac(k).label), SC.matrix, { height: Math.max(420, 26 * SC.ids.length + 140) }) : emptyFig("One factor in this view"));
  const rows = FL.map(k => { const c = C.factors[k]; return { key: k, label: fac(k).label, n: c.n, sr_all: c.tearsheet.all?.sharpe, sr10: c.tearsheet.since_2010?.sharpe, sr21: c.tearsheet.since_2021?.sharpe, sr3: c.tearsheet.last_3y?.sharpe, ytd: c.ytd, dd: c.tearsheet.all?.max_dd, spark: c.spark }; });
  sortableTable($("#comp-board"), [
    { key: "label", label: "Style", render: (v, r) => factorTag(r.key) }, { key: "n", label: "Markets", num: true, nd: 0 },
    { key: "sr_all", label: "Sharpe · all", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr10", label: "2010+", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "sr21", label: "2021+", num: true, render: v => washCell(v, 2, 1.5) }, { key: "sr3", label: "3 years", num: true, render: v => washCell(v, 2, 1.5) },
    { key: "ytd", label: "This year", num: true, render: v => signedPct(v) }, { key: "dd", label: "Max DD", num: true, render: v => txt(pct(v, 0, false)) },
    { key: "spark", label: "52 weeks", render: v => sparkSvg(v || [], { w: 100, h: 20 }) },
  ], rows, { sortKey: "sr10", desc: true, onRow: r => openStyle(r.key) });
  mount("chart-comp-breadth", { data: FL.map(k => ({ x: C.factors[k].breadth.dates, y: C.factors[k].breadth.values, mode: "lines", name: fac(k).label, line: { color: fcol(k), width: 1.4 }, hovertemplate: "%{y}<extra>" + fac(k).label + "</extra>" })),
    layout: L({ height: 300, yaxis: { rangemode: "tozero" } }) });
  const years = [...new Set(FL.flatMap(k => C.factors[k].by_year.map(r => r.year)))].sort();
  mount("chart-comp-years", FL.length ? heatYears(FL.map(k => years.map(y => C.factors[k].by_year.find(r => r.year === y)?.ret ?? null)), FL.map(k => fac(k).label), years) : emptyFig("—"));
}
function renderCompNav() {
  const C = MX.composites[state.monitor.variant];
  if (!C) return;
  const series = famFactors(state.monitor.family).filter(k => C.factors[k]).map(k => ({ dates: C.factors[k].nav.dates, values: C.factors[k].nav.nav, name: fac(k).label, color: fcol(k) }));
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
  familySelect($("#country-family"), () => state.country.family, f => { state.country.family = f; renderCountry(); });
  segFilter("country.variant", VARIANTS, () => state.country.variant, v => { state.country.variant = v; writeHash(); renderCountry(); });
  segFilter("country.window", WINDOWS, () => state.country.window, v => { state.country.window = v; renderCountry(); });
  await renderCountry();
}
async function renderCountry() {
  const code = state.country.code, vk = state.country.variant, m = mkt(code);
  $("#country-select").value = code;
  const D = await load(`country/${code}.json`);
  $("#country-tier").replaceChildren(tierBadge(D.tier), txt(" "), sourceBadge(D));
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
  const CF = famFactors(state.country.family);
  const series = CF.filter(f => D.factors[f]?.[def]?.nav).map(f => ({ dates: D.factors[f][def].nav.dates, values: D.factors[f][def].nav.nav, name: fac(f).label, color: fcol(f) }));
  const dates = series.length ? series.reduce((a, s) => s.dates.length > a.length ? s.dates : a, []) : [];
  mount("chart-c-nav", series.length ? applyWindow(linesFig(series, { height: 460 }), dates, state.country.window) : emptyFig("No books"));
  const CC = D.corr ? subCorr(D.corr, CF) : null;      // the family on show, as in the chart beside it
  mount("chart-c-corr", CC && CC.ids.length > 1 ? corrFig(CC.ids.map(k => fac(k).label), CC.matrix, { height: Math.max(460, 22 * CC.ids.length + 160) }) : emptyFig(CC ? "One factor in this view" : "—"));
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
  const yearsAll = [...new Set(CF.flatMap(f => (D.factors[f]?.[def]?.by_year || []).map(r => r.year)))].sort();
  const fy = CF.filter(f => D.factors[f]?.[def]?.by_year);
  mount("chart-c-years", fy.length ? heatYears(fy.map(f => yearsAll.map(y => D.factors[f][def].by_year.find(r => r.year === y)?.ret ?? null)), fy.map(f => fac(f).label), yearsAll) : emptyFig("—"));
  const cov = Object.entries(D.coverage || {}).map(([k, v]) => ({ panel: k, first: v.first_20_names === "None" ? "—" : v.first_20_names, cov: v.coverage_1y }));
  $("#country-coverage").replaceChildren(buildTable([{ key: "panel", label: "Panel" }, { key: "first", label: "20 names from" }, { key: "cov", label: "Coverage, last year", num: true, render: v => txt(pctU(v, 0)) }], cov));
  if (D.coverage_notes?.length) $("#country-coverage").append(el("p", { class: "note", text: D.coverage_notes.join(" · ") }));
}

// ── Style ────────────────────────────────────────────────────────────────────
async function initStyle() {
  const sel = $("#style-select");
  sel.replaceChildren(...factorOptions());
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
  f.replaceChildren(...factorOptions());
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
  const c = fcol(factor) || T.up, ts = D.tearsheet, w = state.book.window, m = mkt(market);
  $("#book-name").replaceChildren(txt(`${m.name} · ${fac(factor).label}`), txt(" "), tierBadge(m.tier), txt(" "), sourceBadge(m));
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
  $("#b-pos-ctx").textContent = `${D.n_positions} positions at ${dateLabel(D.as_of)} (${D.n_long ?? D.positions.filter(p => p.weight > 0).length} long, ${D.n_short ?? D.positions.filter(p => p.weight < 0).length} short${D.positions_shown && D.n_positions > D.positions.length ? `; the ${D.positions_shown} largest a side shown` : ""}) · weight in % of capital · vol · ADV · market value · this year's P&L from the name`;
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

// ── Portfolio ────────────────────────────────────────────────────────────────
const CORE = ["core_opt", "core_equal", "core_ic"];
const CORE_C = { core_opt: "#ffb224", core_equal: "#7d93ff", core_ic: "#8fd16a" };
const FAM_LABEL = (k) => META.families?.[k.replace("comp_", "")] || fac(k).label || k;
const holdoutShape = (dates) => dates && dates.length && dates[dates.length - 1] >= "2024-01-01"
  ? [{ type: "rect", xref: "x", yref: "paper", x0: "2024-01-01", x1: dates[dates.length - 1], y0: 0, y1: 1, fillcolor: rgba(T.amber, 0.07), line: { width: 0 }, layer: "below" }] : [];
let PF_HAVE = new Set();
async function initPortfolio() {
  let B = null;
  try { B = await load("portfolio/board.json"); } catch (_) { B = null; }
  const have = new Set(B?.markets || []);
  PF_HAVE = have;
  const sel = $("#portfolio-select");
  sel.replaceChildren(el("option", { value: "GLOBAL", text: "Global · every market at equal risk" }),
    ...META.market_order.filter(c => have.has(c)).map(c => el("option", { value: c, text: `${c} · ${mkt(c).name}` })));
  sel.value = have.has(state.portfolio.code) ? state.portfolio.code : "GLOBAL";
  sel.addEventListener("change", () => { state.portfolio.code = sel.value; writeHash(); renderPortfolio(); });
  renderPortfolioBoard(B);
  await renderPortfolio();
}
function renderPortfolioBoard(B) {
  if (!B || !B.rows) { $("#portfolio-board").replaceChildren(el("p", { class: "empty", text: "Not built yet" })); return; }
  const cols = [
    { key: "market", label: "Market", render: (v) => el("span", {}, [el("b", { text: v }), txt(" " + mkt(v).name)]) },
    { key: "opt_sr", label: "Optimised", num: true, title: "Net Sharpe of the optimised book", render: v => washCell(v, 2, 1.0) },
    { key: "opt_holdout", label: "2024+", num: true, render: v => signed(v, 2) },
    { key: "equal_sr", label: "Equal blend", num: true, title: "Net Sharpe of the families at equal weight", render: v => washCell(v, 2, 1.0) },
    { key: "equal_holdout", label: "2024+", num: true, render: v => signed(v, 2) },
    { key: "ic_sr", label: "IC blend", num: true, title: "Net Sharpe of the families weighted by IC", render: v => washCell(v, 2, 1.0) },
    { key: "best_single", label: "Best single", num: true, title: "Highest net Sharpe of any one factor's sector-neutral book in the market", render: (v, r) => el("span", { title: r.best_single_factor ? fac(r.best_single_factor).label : "" , text: fmt(v, 2) }) },
    { key: "turnover", label: "Turnover", num: true, title: "Optimised book: one-way, times capital, a year", render: v => txt(isNum(v) ? fmt(v, 1) + "×" : "—") },
    { key: "cost_bps", label: "Cost bps", num: true, title: "Optimised book: costs charged, bps of capital a year", render: v => txt(isNum(v) ? fmt(v, 0) : "—") },
    { key: "capacity_m", label: "Capacity $m", num: true, title: "Capital at which square-root impact (Y = 1) halves the optimised book's Sharpe, last five years", render: v => txt(isNum(v) ? Math.round(v).toLocaleString() : ">10,000") },
    { key: "specific", label: "Specific risk", num: true, title: "Share of the optimised book's forecast variance that is stock-specific, today", render: v => txt(isNum(v) ? pctU(v, 0) : "—") },
    { key: "bias", label: "Bias", num: true, title: "Risk model: realised over forecast for random long-short books (one is right)", nd: 2 },
  ];
  sortableTable($("#portfolio-board"), cols, B.rows, { sortKey: "opt_sr", desc: true, onRow: r => { state.portfolio.code = r.market; $("#portfolio-select").value = r.market; writeHash(); renderPortfolio(); }, current: r => r.market === state.portfolio.code });
}
async function renderPortfolio() {
  const code = state.portfolio.code;
  $("#portfolio-select").value = code;
  for (const tr of $$("#portfolio-board tbody tr")) tr.removeAttribute("aria-current");
  if (code === "GLOBAL") return renderPortfolioGlobal();
  if (!PF_HAVE.has(code)) return renderPortfolioGlobal(`${code} · ${mkt(code).name} has no optimised book: its universe stays under the optimiser's 40-name floor, or the book has under a year of history. The global books are shown.`);
  let D = null;
  try { D = await load(`portfolio/${code}.json`); } catch (_) { D = null; }
  const ids = CORE.map(k => bookId(code, k, "neutral_dollar"));
  const S = ids.map(id => MX.summaries[id]);
  const navs = await Promise.all(ids.map(id => MX.summaries[id] ? load(`book/${id}.json`).catch(() => null) : Promise.resolve(null)));
  $("#portfolio-note").textContent = D ? `risk model ${D.n_factors} factors (${D.n_sectors} sectors, ${D.styles.length} styles) · optimised monthly from ${dateLabel(D.first_book)}` : "not built for this market";
  const o = S[0]?.sr || {}, e = S[1]?.sr || {};
  const r = D?.risk_today || {};
  $("#portfolio-tiles").replaceChildren(
    tile("Optimised, net", fmt(o.all, 2), `Sharpe over ${fmt(S[0]?.years, 0)} years · ${fmt(o.since_2021, 2)} since 2021`, { cls: upDown(o.all) }),
    tile("Equal blend, net", fmt(e.all, 2), `the baseline with nothing fitted · ${fmt(e.since_2021, 2)} since 2021`, { cls: upDown(e.all) }),
    tile("Families explain", isNum(D?.attribution?.r2) ? pctU(D.attribution.r2, 0) : "—", isNum(D?.attribution?.alpha_t) ? `of the optimised book's variance · alpha t ${fmt(D.attribution.alpha_t, 1)}` : ""),
    tile("Stock-specific risk", isNum(r.share_specific) ? pctU(r.share_specific, 0) : "—", isNum(D?.risk_today_equal?.share_specific) ? `of forecast variance today · equal blend ${pctU(D.risk_today_equal.share_specific, 0)}` : "of forecast variance today"),
    tile("Capacity", isNum(D?.capacity?.half_y1) ? `$${Math.round(D.capacity.half_y1).toLocaleString()}m` : (D?.capacity ? ">$10bn" : "—"), "where impact halves the Sharpe · Y = 1; " + (isNum(D?.capacity?.half_y05) ? `$${Math.round(D.capacity.half_y05).toLocaleString()}m at Y = 0.5` : "")),
    tile("Turnover", isNum(D?.optimiser?.turnover) ? fmt(D.optimiser.turnover, 1) + "×" : "—", isNum(D?.optimiser?.held) ? `capital a year, one way (${fmt(D.optimiser.turnover_gross, 1)}× its gross) · ${fmt(D.optimiser.held, 0)} of ${fmt(D.optimiser.names, 0)} names held` : ""),
  );
  const series = navs.map((b, i) => b ? { dates: b.nav.dates, values: b.nav.nav, name: fac(CORE[i]).label, color: CORE_C[CORE[i]], width: i === 0 ? 2.2 : 1.3 } : null).filter(Boolean);
  const dates = series.length ? series.reduce((a, s) => s.dates.length > a.length ? s.dates : a, []) : [];
  const nf = series.length ? linesFig(series, { height: 420 }) : emptyFig("No core book for this market");
  if (series.length) nf.layout.shapes = holdoutShape(dates);
  mount("chart-pf-nav", nf);
  if (!D) { for (const id of ["chart-pf-risk", "chart-pf-exposure", "chart-pf-attr", "chart-pf-capacity", "chart-pf-weights"]) mount(id, emptyFig("—")); $("#portfolio-bias").replaceChildren(); return; }
  // risk shares through time
  const R = D.risk;
  const parts = [["share_specific", "Stock-specific", T.up], ["share_market", "Market", T.muted], ["share_sectors", "Sectors", "#c39be8"], ["styles", "Styles", T.amber]];
  mount("chart-pf-risk", { data: parts.map(([k, name, c]) => ({ x: R.dates, y: (k === "styles" ? R.styles_share : R[k]).map(v => isNum(v) ? v * 100 : null), name, stackgroup: "one", mode: "lines", line: { width: 0.5, color: c }, fillcolor: rgba(c, 0.55), hovertemplate: "%{y:.0f}%<extra>" + name + "</extra>" })),
    layout: L({ height: 340, yaxis: { ticksuffix: "%", range: [0, 100] }, shapes: holdoutShape(R.dates) }) });
  // exposures today
  const st = D.styles;
  mount("chart-pf-exposure", { data: [
      { type: "bar", orientation: "h", y: st, x: st.map(s => D.risk_today?.[`exp_${s}`]), name: "Optimised", marker: { color: CORE_C.core_opt }, hovertemplate: "%{x:.2f}<extra>optimised</extra>" },
      { type: "bar", orientation: "h", y: st, x: st.map(s => D.risk_today_equal?.[`exp_${s}`]), name: "Equal blend", marker: { color: rgba(CORE_C.core_equal, 0.6) }, hovertemplate: "%{x:.2f}<extra>equal blend</extra>" }],
    layout: L({ height: 340, barmode: "group", hovermode: "closest", margin: { l: 110 }, yaxis: { autorange: "reversed" }, xaxis: { zeroline: true } }) });
  // attribution
  const A = D.attribution;
  if (A && A.rows) {
    const xs = [...A.rows.map(r => FAM_LABEL(r.family)), "Unexplained (alpha)"];
    const ys = [...A.rows.map(r => r.contribution * 100), A.alpha * 100];
    const tt = [...A.rows.map(r => r.t), A.alpha_t];
    mount("chart-pf-attr", { data: [{ type: "bar", x: xs, y: ys, customdata: tt, marker: { color: ys.map((v, i) => i === ys.length - 1 ? T.amber : v < 0 ? T.down : T.up) }, hovertemplate: "%{y:.2f}% a year<br>t %{customdata:.1f}<extra>%{x}</extra>" }],
      layout: L({ height: 340, showlegend: false, hovermode: "closest", yaxis: { ticksuffix: "%" }, xaxis: { tickangle: -30 }, shapes: [hline(0)] }) });
  } else mount("chart-pf-attr", emptyFig("Too little history"));
  // capacity
  const C = D.capacity;
  if (C && C.y1) {
    $("#portfolio-cap-ctx").textContent = `net Sharpe after square-root market impact · ${dateLabel(C.start)} → ${dateLabel(C.end)} · ${fmt(C.sr_before, 2)} before impact`;
    mount("chart-pf-capacity", { data: [
        { x: C.y1.map(r => r.aum_usd_m), y: C.y1.map(r => r.sr_net), customdata: C.y1.map(r => r.impact_bps), mode: "lines+markers", name: "Y = 1", line: { color: T.down, width: 2 }, hovertemplate: "$%{x:,}m: Sharpe %{y:.2f}<br>impact %{customdata:.0f} bps a year<extra>Y = 1</extra>" },
        { x: C.y05.map(r => r.aum_usd_m), y: C.y05.map(r => r.sr_net), customdata: C.y05.map(r => r.impact_bps), mode: "lines+markers", name: "Y = 0.5", line: { color: T.amber, width: 1.5, dash: "dot" }, hovertemplate: "$%{x:,}m: Sharpe %{y:.2f}<br>impact %{customdata:.0f} bps a year<extra>Y = 0.5</extra>" }],
      layout: L({ height: 340, hovermode: "closest", xaxis: { type: "log", title: { text: "capital, $m", font: { size: 11, color: T.muted } } }, yaxis: { zeroline: true }, shapes: [hline(0), hline(C.sr_before, "y", T.muted, "dash")] }) });
  } else mount("chart-pf-capacity", emptyFig("Not measured"));
  // family weights
  const W = D.weights;
  mount("chart-pf-weights", W && W.dates?.length ? { data: Object.keys(W.families).map((k, i) => ({ x: W.dates, y: W.families[k].map(v => v * 100), name: FAM_LABEL(k), stackgroup: "w", mode: "lines", line: { width: 0.5, color: fcol(k) || MARKET_C[i] }, hovertemplate: "%{y:.0f}%<extra>" + FAM_LABEL(k) + "</extra>" })),
    layout: L({ height: 340, yaxis: { ticksuffix: "%", range: [0, 100] } }) } : emptyFig("—"));
  // bias
  buildBiasTable(D.bias);
}
function buildBiasTable(rows) {
  if (!rows || !rows.length) { $("#portfolio-bias").replaceChildren(el("p", { class: "empty", text: "—" })); return; }
  const lbl = (b) => b.startsWith("book ") ? fac(b.slice(5)).label + " book" : b;
  $("#portfolio-bias").replaceChildren(buildTable([
    { key: "book", label: "Portfolio", render: v => txt(lbl(v)) },
    { key: "bias", label: "Bias", num: true, render: v => el("span", { class: "wash", text: fmt(v, 2), style: wash(isNum(v) ? -Math.abs(v - 1) * 3 : null, 1) }) },
    { key: "months", label: "Months", num: true, nd: 0 },
    { key: "portfolios", label: "Portfolios", num: true, nd: 0 }], rows),
    el("p", { class: "note", text: "Above one the model understates the risk, below one it overstates it; with 280 months the band of chance is about 0.92 to 1.08." }));
}
function renderPortfolioGlobal(why = null) {
  const C = MX.composites?.neutral_dollar?.factors || {};
  $("#portfolio-select").value = "GLOBAL";
  $("#portfolio-note").textContent = why || "each market's book at 10% vol, averaged at equal weight and scaled to 10% over its whole history";
  const keys = CORE.filter(k => C[k]);
  $("#portfolio-tiles").replaceChildren(...keys.map(k => tile(fac(k).label, fmt(C[k].tearsheet.all?.sharpe, 2), `${C[k].n} markets · ${fmt(C[k].tearsheet.since_2021?.sharpe, 2)} since 2021`, { cls: upDown(C[k].tearsheet.all?.sharpe), spark: C[k].spark })));
  const series = keys.map((k, i) => ({ dates: C[k].nav.dates, values: C[k].nav.nav, name: fac(k).label, color: CORE_C[k], width: i === 0 ? 2.2 : 1.3 }));
  const dates = series.length ? series.reduce((a, s) => s.dates.length > a.length ? s.dates : a, []) : [];
  const nf = series.length ? linesFig(series, { height: 420 }) : emptyFig("Not built yet");
  if (series.length) nf.layout.shapes = holdoutShape(dates);
  mount("chart-pf-nav", nf);
  for (const id of ["chart-pf-risk", "chart-pf-exposure", "chart-pf-attr", "chart-pf-capacity", "chart-pf-weights"]) mount(id, emptyFig("Per market: choose one above", 340));
  $("#portfolio-bias").replaceChildren(el("p", { class: "empty", text: "Per market: choose one above" }));
}

// ── Pure factors ─────────────────────────────────────────────────────────────
// ── Research ─────────────────────────────────────────────────────────────────
const R_MEASURES = [["ic_t", "IC t-stat"], ["t_net", "Book t-stat"], ["alpha_t", "Alpha t-stat"]];
const R_MEASURE_TEXT = { ic_t: "t-statistic of the monthly rank IC", t_net: "t-statistic of the book's net return", alpha_t: "t-statistic of the alpha over the market and the headline styles" };
const rFamFactors = (f, have) => (f === "all" ? META.factor_order : famFactors(f)).filter(k => have[k]);
async function initResearch() {
  const sel = $("#research-select");
  sel.replaceChildren(...META.market_order.map(c => el("option", { value: c, text: `${c} · ${mkt(c).name}` })));
  sel.value = state.research.code;
  sel.addEventListener("change", () => { state.research.code = sel.value; writeHash(); renderResearch(); });
  const fs = $("#research-family");
  fs.replaceChildren(el("option", { value: "all", text: `All factors (${META.factor_order.length})` }), ...famOptions().map(([k, l]) => el("option", { value: k, text: `${l} (${famFactors(k).length})` })));
  fs.value = state.research.family;
  fs.addEventListener("change", () => { state.research.family = fs.value; renderResearch(); });
  segFilter("research.measure", R_MEASURES, () => state.research.measure, v => { state.research.measure = v; renderResearchBoard(); });
  await renderResearch();
}
async function renderResearch() {
  const code = state.research.code;
  $("#research-select").value = code;
  let D = null;
  try { D = await load(`research/${code}.json`); } catch (_) { D = null; }
  if (!D || !D.rows || !D.rows.length) {
    $("#research-note").textContent = "not run for this market";
    $("#research-tiles").replaceChildren(); $("#research-table").replaceChildren();
    for (const id of ["chart-r-decay", "chart-r-deciles"]) mount(id, emptyFig("—"));
    await renderResearchBoard();
    return;
  }
  const byKey = Object.fromEntries(D.rows.map(r => [r.factor, r]));
  const keys = rFamFactors(state.research.family, byKey);
  const rows = keys.map(k => byKey[k]);
  if (!byKey[state.research.factor] || !keys.includes(state.research.factor)) state.research.factor = keys[0] || D.rows[0].factor;
  const m = D.testing || {};
  $("#research-note").textContent = `${D.rows.length} factors · score ranked within sector · month-end dates · ${dateLabel(D.first)} → ${dateLabel(D.last)}`;
  $("#research-tiles").replaceChildren(
    tile("Factors tried", String(m.tried ?? D.rows.length), "each one definition, fixed before the run"),
    tile("IC clears t = 3", `${m.ic_clear ?? "—"} of ${m.ic_tested ?? "—"}`, `${m.ic_clear_negative ?? 0} clear it with the wrong sign`),
    tile("Book clears t = 3", `${m.book_clear ?? "—"} of ${m.book_tested ?? "—"}`, `net of costs · ${m.book_clear_negative ?? 0} significantly negative`),
    tile("Alpha clears t = 3", `${m.alpha_clear ?? "—"} of ${m.alpha_tested ?? "—"}`, "over the market and the headline styles"),
    tile("Expected by chance", fmt(m.expected_by_chance, 1), `two-sided, at t = ${fmt(m.hurdle, 0)}, if no factor worked`),
    tile("Holdout agrees", isNum(m.holdout_same_sign) ? pctU(m.holdout_same_sign, 0) : "—", "books whose 2024+ net Sharpe has the sign of the years before"),
  );
  const tcell = (v) => el("span", { class: "wash", text: fmt(v, 1, true), style: wash(v, 5), title: !isNum(v) ? "" : Math.abs(v) >= 3 ? "clears the hurdle of 3" : "below the hurdle of 3" });
  const cols = [
    { key: "label", label: "Factor", render: (v, r) => factorTag(r.factor) },
    ...(state.research.family === "all" ? [{ key: "family_label", label: "Family" }] : []),     // the family select already says it
    { key: "ic", label: "IC", num: true, title: "Mean monthly rank IC against the return of the next 21 sessions", render: v => signed(v, 3) },
    { key: "ic_t", label: "t", num: true, title: "t-statistic of the mean IC (non-overlapping months)", render: tcell },
    { key: "ic_holdout", label: "IC 2024+", num: true, title: "Mean IC in the holdout", render: v => signed(v, 3) },
    { key: "spread_ann", label: "D10−D1", num: true, title: "Top tenth less bottom tenth, % a year, before costs", render: v => signedPct(v, 1) },
    { key: "long_share", label: "Long side", num: true, title: "Share of the spread earned by the top tenth against the universe", render: (v, r) => txt(isNum(v) && v >= 0 && v <= 1.5 && r.spread_ann >= 0.01 ? pctU(v, 0) : "—") },   // defined for a positive spread only
    { key: "half_life", label: "Half-life", num: true, title: "Sessions for the rank autocorrelation to fall to one half", render: (v, r) => txt(isNum(v) ? fmt(v, 0) : (isNum(r.ac_252) ? ">252" : "—")) },
    { key: "sr_net", label: "Net SR", num: true, render: v => washCell(v, 2, 1.0) },
    { key: "t_net", label: "t", num: true, title: "t-statistic of the book's net mean return", render: tcell },
    { key: "sr_net_holdout", label: "SR 2024+", num: true, render: v => signed(v, 2) },
    { key: "turnover", label: "Turnover", num: true, title: "One-way, times the book's gross, a year", render: v => txt(isNum(v) ? fmt(v, 1) + "×" : "—") },
    { key: "breakeven_bps", label: "Breakeven", num: true, title: "One-way cost in bps at which the gross return is gone", render: v => txt(isNum(v) ? fmt(v, 0) : "—") },
    { key: "capacity_usd_m", label: "Capacity $m", num: true, title: "AUM at which the book's average dollar sits in a position equal to 10% of a day's traded value", render: v => txt(isNum(v) ? Math.round(v).toLocaleString() : "—") },
    { key: "alpha_ann", label: "α %/yr", num: true, title: "Annual alpha of the gross book over the market and the headline styles of this market", render: v => signedPct(v, 1) },
    { key: "alpha_t", label: "t", num: true, title: "Newey-West t-statistic of the alpha", render: tcell },
    { key: "span_r2", label: "R²", num: true, title: "Share of the book's variance the market and the headline styles explain", nd: 2 },
  ];
  sortableTable($("#research-table"), cols, rows.map(r => ({ ...r, label: fac(r.factor).label, family_label: META.families?.[famOf(r.factor)] || "" })),
    { sortKey: "ic_t", desc: true, onRow: r => { state.research.factor = r.factor; renderResearchFactor(D); }, current: r => r.factor === state.research.factor });
  renderResearchFactor(D);
  await renderResearchBoard();
}
function renderResearchFactor(D) {
  const k = state.research.factor, name = fac(k).label, color = fcol(k);
  for (const tr of $$("#research-table tbody tr")) tr.removeAttribute("aria-current");
  const dk = D.decay?.[k], dc = D.deciles?.[k];
  $("#research-decay-ctx").textContent = `${name} · rank IC by horizon, sessions ahead · every fifth session`;
  $("#research-decile-ctx").textContent = `${name} · next-month return of each tenth less the universe, % a year`;
  mount("chart-r-decay", dk ? {
    data: [{ type: "bar", x: dk.horizon.map(h => `${h}d`), y: dk.ic, customdata: dk.t, marker: { color: dk.ic.map(v => rgba(color, 0.85)) }, name: "IC",
      hovertemplate: "IC %{y:.3f}<br>t %{customdata:.1f}<extra>" + name + "</extra>" }],
    layout: L({ height: 320, showlegend: false, hovermode: "closest", xaxis: { type: "category", title: { text: "horizon", font: { size: 11, color: T.muted } } }, yaxis: { tickformat: ".3f", zeroline: true }, shapes: [hline(0)] }),
  } : emptyFig("No decay for this factor", 320));
  mount("chart-r-deciles", dc ? {
    data: [{ type: "bar", x: dc.decile.map(d => d === 1 ? "1 · short" : d === dc.decile.length ? `${d} · long` : String(d)), y: dc.excess.map(v => v * 100), customdata: dc.names,
      marker: { color: dc.excess.map(v => v < 0 ? T.down : T.up) }, name: "excess", hovertemplate: "%{y:.1f}% a year<br>%{customdata:.0f} names<extra>" + name + "</extra>" }],
    layout: L({ height: 320, showlegend: false, hovermode: "closest", xaxis: { type: "category", title: { text: "tenth of the cross-section, by score", font: { size: 11, color: T.muted } } }, yaxis: { ticksuffix: "%", zeroline: true }, shapes: [hline(0)] }),
  } : emptyFig("No deciles for this factor", 320));
}
async function renderResearchBoard() {
  let B = null;
  try { B = await load("research/board.json"); } catch (_) { B = null; }
  const key = state.research.measure;
  $("#research-board-ctx").textContent = `${R_MEASURE_TEXT[key]} · every market · blank where the factor is not built`;
  if (!B || !B[key]) { mount("chart-r-board", emptyFig("Not run yet")); return; }
  const have = Object.fromEntries(Object.keys(B[key]).map(k => [k, true]));
  const keys = rFamFactors(state.research.family, have);
  const mk = B.markets;
  const z = keys.map(k => mk.map(c => { const v = B[key][k]?.[c]; return isNum(v) ? v : null; }));
  mount("chart-r-board", keys.length ? {
    data: [{ type: "heatmap", x: mk, y: keys.map(k => fac(k).label), z, zmin: -5, zmax: 5, colorscale: DIV, xgap: 1, ygap: 1,
      text: z.map(r => r.map(v => isNum(v) ? v.toFixed(1) : "")), texttemplate: keys.length <= 30 ? "%{text}" : "", textfont: { family: T.mono, size: 10, color: T.ink1 },
      hovertemplate: "%{y} · %{x}<br>%{z:.1f}<extra></extra>", colorbar: { thickness: 10, outlinewidth: 0, tickfont: { color: T.muted, size: 10 }, title: { text: "t", font: { color: T.muted, size: 10 } } } }],
    layout: L({ height: Math.max(360, 20 * keys.length + 110), hovermode: "closest", margin: { l: 210, r: 20, t: 12, b: 40 }, yaxis: { autorange: "reversed", tickfont: { size: 10.5, color: T.ink2 } }, xaxis: { side: "top", tickfont: { size: 11, color: T.ink2 } } }),
  } : emptyFig("No factor of this family"));
}

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
  mount("chart-p-styles", { data: sty.map((k, i) => ({ x: D.nav.dates, y: D.nav[k], mode: "lines", name: k, line: { color: k === "market" ? T.muted : (fcol(k) || MARKET_C[i]), width: k === "market" ? 1 : 1.5 }, hovertemplate: "%{y:.2f}<extra>" + k + "</extra>" })), layout: L({ height: 420, yaxis: { type: "log" } }) });
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
    $("#access-detail-title").replaceChildren(txt(`${r.name} `), tierBadge(r.tier), txt(" "), sourceBadge(r));
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
<p>Every factor is built cap-weighted and sector-neutral at equal weight; the eight headline styles and the family composites also plain at equal weight and sector-neutral at inverse volatility. <strong>Cap-weighted 2×3</strong> follows the published academic definitions: the whole market is ranked; names are split into <em>big</em> (the largest names covering 90% of market value) and <em>small</em>; inside each group the top 30% by rank are long and the bottom 30% short, value-weighted; the factor is the average of the small and big spreads. Size is the small half minus the big half, value-weighted. Low beta is the beta-neutral book of Frazzini &amp; Pedersen (2014): rank-weighted, low-beta names long and levered to beta one, high-beta names short and de-levered to beta one, so it is beta neutral and net long in dollars. <strong>Sector-neutral</strong> ranks and balances the legs inside each GICS sector (thin sectors pooled on the day), so no sector carries a net position; <strong>plain</strong> ranks the whole market at equal weight with a 10% net sector cap; <strong>inverse-vol</strong> sizes names by 1/σ (63-day EWMA, floored at 8%) and re-balances the legs. Every book caps a name at ${(d.max_weight * 100).toFixed(0)}% of gross with the excess redistributed inside the leg.</p>
<h3>Gearing</h3>
<p>Each book targets ${(d.target_vol * 100).toFixed(0)}% annualised volatility: the position scalar is the target over the trailing ${d.gearing_lookback}-day realised vol of the ungeared book's PnL, lagged a day, capped at ${d.leverage_cap}× gross, and held until it has drifted ${((d.gearing_buffer || 0) * 100).toFixed(0)}% from the value in force. Backward-looking by design, and piecewise constant by design, so the book is re-geared a handful of times a year rather than daily. A diversified sector-neutral stock book runs 2-3% ungeared, so the cap is a budget for gross exposure rather than a venue limit; the gearing chart on each book's page shows where it binds. Turnover is quoted per unit of capital and, beside it, per unit of gross: the first is what the cost model charges, the second is how much the factor itself churns.</p>
<h3>Data</h3>
<p>EODHD. Daily adjusted and raw closes, volume, dividends and splits for every common stock ever listed on each market's exchanges, delisted names included; annual and quarterly statements with filing dates (believed where they are real: the US; elsewhere the period end plus a per-market lag); shares outstanding restated to today's terms and split-adjusted back; FX from 1971-1985. The closes are repaired at build time (EODHD's sentinels, one-day spikes, adjusted-only jumps and scale breaks beyond +100%/−75% in a day are removed; a genuine move beyond those bounds is lost with them). <strong>The universe is point in time</strong>: each month end the top N names by market value as it then stood, one share class per issuer, so a name that later shrank or went bust is in the history for the months it belonged and no book is survivorship-biased. The fundamental styles start where twenty names have statements, 1995-2006 in the developed markets and 2005-2012 in the emerging ones. Quality's growth component needs five years of statements and starts later.</p>
<h3>The factor library</h3>
<p>${META.factor_order.length} factors in ${Object.keys(META.families || {}).length} families, each defined from the paper cited in the table below and not tuned. Every input enters on the day it was public: statements on their filing date (or the period end plus the market's lag), earnings reports the session after the report, and regulator files the session after their measured publication date. Return-based measures use daily returns capped at five trailing standard deviations. A factor is built in a market only where at least 60% of the universe has a value for it. Traded value is the raw close times volume on the same share basis: the vendor restates most volume into today's share terms, and where a split left the volume unchanged the earlier volume is divided by the split ratio, so a name that later split is not counted as more liquid in its past.</p>
<p>Short interest and positioning come from public regulator files: FINRA (US short interest, twice monthly from 2018; daily off-exchange short-sale volume from 2009), the US Securities and Exchange Commission (fails to deliver; insider transactions on Forms 3, 4 and 5), the Australian Securities and Investments Commission (daily short positions from 2010), the Hong Kong Securities and Futures Commission (weekly short positions from 2012) and the UK Financial Conduct Authority (disclosed net short positions from 2012). The data belong to those bodies; this site shows only what is computed from them.</p>
<h3>Research</h3>
<p>The Research tab asks of each score what a Sharpe ratio cannot: whether it ranks names by the return of the following month (the rank IC, on month-end dates so the observations do not overlap), how long that lasts (the IC at 1 to 126 sessions), where in the cross-section the return sits (tenths of the universe, and the long side's share of the spread), how fast the ordering turns over, what one-way cost would take the gross return to zero, how much capital the book holds before its average position is a tenth of a day's traded value, and whether the book earns anything the market and the momentum, value, quality, low-beta and size books of the same market do not already explain. Every factor has one definition, fixed from its paper before any of this was run; with ${META.factor_order.length} of them tried, the bar is a t-statistic of 3, and each market's page counts how many clear it beside the number chance alone would give. The window from 2024 is a holdout: it is shown next to the earlier years and was never used to choose anything.</p>
<h3>Costs</h3>
<p>Commission plus half the spread on every unit traded, stamp duty or a financial-transaction tax on the leg it falls on (London 0.5% on purchases, Hong Kong 0.1% each side, Taiwan 0.3% on sales, and so on), and a flat borrow rate on the short notional, all per market from the table on the access tab. No market impact: capacity is a separate question.</p>
<h3>Windows and errors</h3>
<p>Sharpe ratios are shown over the whole sample, since 2010, since 2021 (the window the fundamental styles cover), the last three years and this year. The standard error of a Sharpe ratio is roughly 1/√years: 0.26 over 15 years, 0.45 over five, 0.7 over two. Most cells since 2021 are inside their error bars.</p>
<h3>Caveats</h3>
<ul>${M.caveats.map(s => `<li>${s}</li>`).join("")}</ul>`;
  $("#factor-table").replaceChildren(buildTable([{ key: "label", label: "Style", render: (v, r) => factorTag(r.key) }, { key: "family", label: "Family", render: v => txt(META.families?.[v] || v || "") }, { key: "blurb", label: "What is ranked", render: v => el("span", { style: "white-space:normal", text: v }) }, { key: "rebalance", label: "Re-struck" }, { key: "smoothing", label: "Smoothing, days", num: true, nd: 0 }, { key: "panels", label: "Panels", render: v => txt((v || []).join(", ") || "returns") }, { key: "literature", label: "Source", render: v => el("span", { style: "white-space:normal", text: v }) }],
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
    ["g-ic", "Rank IC", "The Spearman correlation, across the names of the universe on one date, between the factor's score (ranked within sector, signed the way the book trades it) and the return of the following 21 sessions. Measured on each month's last session so the observations do not overlap; the t-statistic is the mean over its standard error. A mean of 0.02 to 0.05 that holds its sign is a real signal."],
    ["g-decay", "IC decay", "The same correlation against the return of the next 1, 5, 21, 63 and 126 sessions, measured every fifth session, with the t-statistic deflated for the overlap of the windows. A score whose IC holds to 63 sessions loses little to a monthly rebalance; one that is gone after five does not survive its costs."],
    ["g-decile", "Deciles", "The universe sorted into tenths by score each month-end; the bar is the mean return of the tenth over the next 21 sessions less the universe's, annualised and before costs. D10−D1 is the top tenth less the bottom; the long side is the top tenth's share of it, which matters where shorting is dear or barred."],
    ["g-halflife", "Half-life", "The number of sessions after which the cross-sectional rank correlation of the score with itself has fallen to one half; '>252' means the ordering is still more than half the same a year on."],
    ["g-breakeven", "Breakeven cost", "The book's gross profit divided by the notional it traded, in basis points: the one-way cost at which the factor earns nothing. Set against the cost assumed for the market."],
    ["g-capacity", "Capacity", "The capital at which the book's average dollar sits in a position equal to 10% of that name's daily traded value (the 63-day average, lagged a day), at the median of the last three years. A scale, not a limit: the impact of trading is not modelled."],
    ["g-spanning", "Spanning alpha", "The intercept of a regression of the book's daily gross return on the market and the momentum, value, quality, low-beta and size books of the same market and construction (the factor's own book left out), with Newey-West standard errors. A factor that is a known style again has a high R² and no alpha."],
    ["g-hurdle", "The hurdle of 3", "With many factors tried, some clear a t-statistic of 2 by chance. The scoreboard marks 3, counts how many clear it, and shows beside that the number chance alone would give. The window from 2024 is a holdout: reported, never used to choose a definition."],
    ["g-riskmodel", "Risk model", "Every day the returns of the universe are regressed on a market term, sector dummies (summing to zero) and ten standardised styles (beta, momentum, size, book-to-price, earnings yield, profitability, investment, leverage, volatility, liquidity), weighted by the square root of market value. The factor covariance is an exponentially weighted average of the daily factor returns (half-life six months, three years of data, Newey-West for serial correlation); each name's specific variance is the same average of its residual, shrunk a quarter of the way to the median. A book's risk is split by each source's exposure times its marginal contribution, so the shares add to one."],
    ["g-bias", "Bias statistic", "A book's return over the next 21 sessions divided by the volatility the model forecast for it, collected every month-end; the standard deviation of that ratio is one if the forecasts are right. Shown for random long-short and long-only books, the market and the style books."],
    ["g-optimiser", "The optimiser", "Each month-end: maximise expected return less half the risk aversion times the forecast variance less trading cost (commission, half spread and stamp, spread over a six-month holding) and borrow, subject to zero net dollars, zero net in every sector, zero beta, and each name within 5% of capital or one day's traded value at $100m. Expected return is the IC-weighted family score times the name's specific volatility times the score's own past IC (Grinold). Risk aversion is set so the forecast volatility is 10%. The book is then traded by the same engine as every other book: smoothed, geared to 10% realised volatility and charged costs."],
    ["g-attribution", "Attribution", "The optimised book's daily gross return regressed on the sector-neutral books of each family composite in the same market, with Newey-West errors: a family's contribution is its slope times that book's mean return, a year. The intercept is what the combination earns beyond holding the families."],
    ["g-impact", "Market impact", "On top of the costs every book already pays, each trade is charged Y × the name's daily volatility × √(trade value / daily traded value) per unit traded: the square-root law (Torre 1997; Almgren et al. 2005; Tóth et al. 2011 find Y of order one). Shown at Y = 1 and at Y = 0.5 over the last five years, so the traded values are today's. Capacity is the capital at which the Sharpe ratio falls to half its value before impact."],
    ["g-tier", "Tier", "1: stock lending is deep and shorting routine (MSCI ++/++). 2: allowed with restrictions (eligible lists, registration, reporting). 3: restricted or banned; the short leg cannot be traded and the book is a measurement."],
    ["g-adv", "ADV", "63-day mean of traded value in USD (price × volume × FX, lagged a day). A name enters the universe above the market's floor and leaves 20% below it."],
    ["g-pit", "Point in time", "A statement value is usable from max(period end + lag, first seen in the archive). Before the archive, the lag convention governs; the archive snapshots every table weekly."],
  ];
  $("#glossary").replaceChildren(...G.map(([id, t, dd]) => el("dl", { id }, [el("dt", { text: t }), el("dd", { text: dd })])));
}

main().catch(err => { console.error(err); $("#main").prepend(el("p", { class: "empty", text: "The Quant Ledger could not load its data: " + err.message })); });
