// PRIME chart helpers: every function returns a pure inline-SVG string (vector → crisp at 2× and editable in Figma).
// Works in the browser (ES module) and in Node. Chart rules: plan/01_design_system.md §2.4
//   measured = text solid · second series = viz-teal · AI prediction = viz-violet dashed · target band = brand-50
//   limit lines = critical 1 px dashed · warning zone = viz-ochre shading · gridlines = border

// Hex values mirror src/styles/tokens.css exactly (SVG attributes are resolved without CSS so Figma import keeps them).
export const T = {
  canvas: '#F5F4F1', surface: '#FFFFFF', border: '#DCD9D3', text: '#1C1E21', muted: '#5F6368', charcoal: '#23272B',
  brand600: '#1F5F8B', brand700: '#174A6D', brand50: '#E6EEF4', critical: '#C62828', critical50: '#FDECEA',
  ok: '#2E7D32', ok50: '#E8F5E9', warn50: '#FBF3E4', teal: '#3C665E', violet: '#7E57A6', ochre: '#B7791F',
};
const FONT = "Inter, system-ui, sans-serif";
const f = (n) => Math.round(n * 100) / 100;

function scale(d0, d1, r0, r1) { const k = (r1 - r0) / ((d1 - d0) || 1); return (v) => r0 + (v - d0) * k; }
function extent(vals, pad = 0.1) { const lo = Math.min(...vals), hi = Math.max(...vals); const p = (hi - lo || 1) * pad; return [lo - p, hi + p]; }
function pathD(pts) { return pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])} ${f(p[1])}`).join(''); }
function text(x, y, s, { size = 11, fill = T.muted, anchor = 'start', weight = 500, baseline = 'auto' } = {}) {
  return `<text x="${f(x)}" y="${f(y)}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="${baseline}" style="font-variant-numeric:tabular-nums">${s}</text>`;
}

/** 60-min sparkline for metric tiles. `values` = numbers. Optional target band [lo, hi] drawn in brand-50. */
export function sparkline(values, opts = {}) {
  if (opts.limits) return limitSparkline(values, opts);
  return plainSparkline(values, opts);
}

/**
 * Sparkline framed by the normal range: band between [lo, hi], dashed limit lines, limit values labelled on the right.
 * The y-axis spans the range (plus margin) so you can see where readings sit inside it, or that they left it.
 */
function limitSparkline(values, { width = 282, height = 60, limits: [lo, hi], stroke = T.text, strokeWidth = 1.75, dotColor, fmt = (v) => v } = {}) {
  const labelW = 30, m = 0.3 * (hi - lo);
  const y0 = Math.min(lo - m, ...values), y1 = Math.max(hi + m, ...values);
  const Y = scale(y0, y1, height - 4, 4), X = scale(0, values.length - 1, 6, width - labelW - 6);
  const pts = values.map((v, i) => [X(i), Y(v)]);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
  s += `<rect x="0" y="${f(Y(hi))}" width="${width - labelW}" height="${f(Y(lo) - Y(hi))}" fill="${T.brand50}"/>`;
  for (const v of [lo, hi]) {
    s += `<line x1="0" x2="${width - labelW}" y1="${f(Y(v))}" y2="${f(Y(v))}" stroke="${T.critical}" stroke-width="1" stroke-dasharray="4 3"/>`;
    s += text(width - labelW + 4, Y(v), fmt(v), { size: 10, baseline: 'middle' });
  }
  s += `<path d="${pathD(pts)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
  for (let i = 0; i < pts.length; i++) s += `<circle cx="${f(pts[i][0])}" cy="${f(pts[i][1])}" r="3" fill="${dotColor ? dotColor(values[i]) : stroke}" stroke="${T.surface}" stroke-width="1.2"/>`;
  return s + '</svg>';
}

function plainSparkline(values, { width = 160, height = 36, min, max, band, stroke = T.text, strokeWidth = 1.5, warnFrom, dot = true, dots = false, dotColor, pad = 0.12 } = {}) {
  const [e0, e1] = extent(band ? [...values, ...band] : values, pad);
  const inset = dots ? 6 : 2;
  const y = scale(min ?? e0, max ?? e1, height - inset, inset), x = scale(0, values.length - 1, dots ? 6 : 1, width - (dot || dots ? 6 : 1));
  const pts = values.map((v, i) => [x(i), y(v)]);
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">`;
  if (band) s += `<rect x="0" y="${f(y(band[1]))}" width="${width}" height="${f(y(band[0]) - y(band[1]))}" fill="${T.brand50}"/>`;
  if (warnFrom != null) { // second segment (from index warnFrom) drawn in ochre to show where it left the band
    s += `<path d="${pathD(pts.slice(0, warnFrom + 1))}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
    s += `<path d="${pathD(pts.slice(warnFrom))}" fill="none" stroke="${T.ochre}" stroke-width="${strokeWidth + 0.5}" stroke-linejoin="round" stroke-linecap="round"/>`;
  } else {
    s += `<path d="${pathD(pts)}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`;
  }
  // dots: every reading marked (zoomed views such as "last 10 readings"); dotColor(v) flags individual readings
  if (dots) for (let i = 0; i < pts.length; i++) s += `<circle cx="${f(pts[i][0])}" cy="${f(pts[i][1])}" r="3" fill="${dotColor ? dotColor(values[i]) : stroke}" stroke="${T.surface}" stroke-width="1.2"/>`;
  else if (dot) { const p = pts[pts.length - 1]; s += `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="2.5" fill="${warnFrom != null ? T.ochre : stroke}"/>`; }
  return s + '</svg>';
}

/**
 * Line chart with target band, limit lines, warning zones, AI prediction, annotations and a hover tooltip.
 * series: [{ points:[[x,y],…], color, width, dash, label }]  (x in any numeric domain, e.g. seconds or layer number)
 * opts: { width, height, x:{min,max,ticks:[[v,label]]}, y:{min,max,ticks:[v], unit}, band:[lo,hi], limits:[v], warnZones:[[lo,hi]],
 *         predictBand:{points:[[x,lo,hi]]}, nowX, nowLabel, annotations:[{x,label}], hover:{x,y,lines:[…]}, legend:[{label,color,dash}] }
 */
export function lineChart(o) {
  const W = o.width ?? 720, H = o.height ?? 280;
  const m = { top: o.legend ? 28 : 12, right: 16, bottom: 26, left: 44, ...(o.margin || {}) };
  const allY = o.series.flatMap((s) => s.points.map((p) => p[1]));
  const [ey0, ey1] = extent(allY, 0.15);
  const y0 = o.y?.min ?? ey0, y1 = o.y?.max ?? ey1;
  const allX = o.series.flatMap((s) => s.points.map((p) => p[0]));
  const x0 = o.x?.min ?? Math.min(...allX), x1 = o.x?.max ?? Math.max(...allX);
  const X = scale(x0, x1, m.left, W - m.right), Y = scale(y0, y1, H - m.bottom, m.top);
  const clipY = (v) => Math.max(m.top, Math.min(H - m.bottom, Y(v)));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img">`;
  // bands & zones (behind everything)
  if (o.band) s += `<rect x="${m.left}" y="${f(clipY(o.band[1]))}" width="${W - m.left - m.right}" height="${f(clipY(o.band[0]) - clipY(o.band[1]))}" fill="${T.brand50}"/>`;
  for (const [lo, hi] of o.warnZones || []) s += `<rect x="${m.left}" y="${f(clipY(hi))}" width="${W - m.left - m.right}" height="${f(clipY(lo) - clipY(hi))}" fill="${T.ochre}" fill-opacity="0.12"/>`;
  if (o.futureFrom != null) s += `<rect x="${f(X(o.futureFrom))}" y="${m.top}" width="${f(W - m.right - X(o.futureFrom))}" height="${H - m.top - m.bottom}" fill="${T.canvas}" fill-opacity="0.7"/>`;
  // grid + y ticks
  for (const v of o.y?.ticks || []) {
    s += `<line x1="${m.left}" x2="${W - m.right}" y1="${f(Y(v))}" y2="${f(Y(v))}" stroke="${T.border}" stroke-width="1"/>`;
    s += text(m.left - 8, Y(v), `${v}`, { anchor: 'end', baseline: 'middle' });
  }
  if (o.y?.unit) s += text(m.left - 8, m.top - 10, o.y.unit, { anchor: 'end', size: 10 });
  s += `<line x1="${m.left}" x2="${W - m.right}" y1="${H - m.bottom}" y2="${H - m.bottom}" stroke="${T.border}" stroke-width="1"/>`;
  for (const [v, label] of o.x?.ticks || []) s += text(X(v), H - m.bottom + 16, label, { anchor: 'middle' });
  if (o.xLabel) s += text(W - m.right, H - m.bottom + 16, o.xLabel, { anchor: 'end', size: 10 });
  // limits
  for (const v of o.limits || []) s += `<line x1="${m.left}" x2="${W - m.right}" y1="${f(Y(v))}" y2="${f(Y(v))}" stroke="${T.critical}" stroke-width="1" stroke-dasharray="4 3"/>`;
  // prediction band
  if (o.predictBand) {
    const top = o.predictBand.points.map((p) => [X(p[0]), Y(p[2])]), bot = o.predictBand.points.map((p) => [X(p[0]), Y(p[1])]).reverse();
    s += `<path d="${pathD([...top, ...bot])}Z" fill="${T.violet}" fill-opacity="0.12"/>`;
  }
  // annotations (vertical markers)
  for (const a of o.annotations || []) {
    s += `<line x1="${f(X(a.x))}" x2="${f(X(a.x))}" y1="${m.top}" y2="${H - m.bottom}" stroke="${T.muted}" stroke-width="1" stroke-dasharray="2 3"/>`;
    s += `<rect x="${f(X(a.x) - 3.5)}" y="${m.top - 1}" width="7" height="7" rx="1" transform="rotate(45 ${f(X(a.x))} ${m.top + 2.5})" fill="${T.charcoal}"/>`;
    if (a.label) s += text(X(a.x) + (a.align === 'end' ? -8 : 8), m.top + 14, a.label, { size: 11, fill: T.text, anchor: a.align === 'end' ? 'end' : 'start' });
  }
  // events: alerts drawn as overlays on the same chart (dotted line + severity marker at the top)
  const SEV = { info: T.muted, warning: T.ochre, critical: T.critical };
  const marker = (x, y, sev) => sev === 'warning' ? `<path d="M${f(x)} ${f(y - 6)}L${f(x + 6.5)} ${f(y + 5)}H${f(x - 6.5)}Z" fill="${SEV.warning}" stroke="${T.surface}" stroke-width="1.5" stroke-linejoin="round"/>`
    : sev === 'critical' ? `<rect x="${f(x - 5)}" y="${f(y - 5)}" width="10" height="10" rx="2" fill="${SEV.critical}" stroke="${T.surface}" stroke-width="1.5"/>`
    : `<circle cx="${f(x)}" cy="${f(y)}" r="5" fill="${SEV.info}" stroke="${T.surface}" stroke-width="1.5"/>`;
  for (const e of o.events || []) {
    s += `<line x1="${f(X(e.x))}" x2="${f(X(e.x))}" y1="${m.top + 6}" y2="${H - m.bottom}" stroke="${SEV[e.severity]}" stroke-width="1.25" stroke-dasharray="2 3"/>`;
    s += marker(X(e.x), m.top + 4, e.severity);
  }
  if (o.nowX != null) {
    s += `<line x1="${f(X(o.nowX))}" x2="${f(X(o.nowX))}" y1="${m.top}" y2="${H - m.bottom}" stroke="${T.text}" stroke-width="1"/>`;
    if (o.nowLabel) s += text(X(o.nowX) + 6, H - m.bottom - 6, o.nowLabel, { size: 11, fill: T.text, weight: 600 });
  }
  // series
  for (const se of o.series) {
    s += `<path d="${pathD(se.points.map((p) => [X(p[0]), Y(p[1])]))}" fill="none" stroke="${se.color || T.text}" stroke-width="${se.width || 2}" stroke-linejoin="round" stroke-linecap="round"${se.dash ? ` stroke-dasharray="${se.dash}"` : ''}/>`;
    // dots: connected scatter (every point marked); dotColor(y) can flag individual points (e.g., ochre below target)
    if (se.dots) for (const p of se.points) s += `<circle cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="${se.dotR || 4}" fill="${se.dotColor ? se.dotColor(p[1]) : se.color || T.text}" stroke="${T.surface}" stroke-width="1.5"/>`;
    if (se.endDot) { const p = se.points[se.points.length - 1]; s += `<circle cx="${f(X(p[0]))}" cy="${f(Y(p[1]))}" r="3.5" fill="${se.color || T.text}" stroke="${T.surface}" stroke-width="1.5"/>`; }
  }
  // hover tooltip
  if (o.hover) {
    const hx = X(o.hover.x), hy = Y(o.hover.y);
    s += `<line x1="${f(hx)}" x2="${f(hx)}" y1="${m.top}" y2="${H - m.bottom}" stroke="${T.text}" stroke-width="1" stroke-opacity="0.35"/>`;
    s += `<circle cx="${f(hx)}" cy="${f(hy)}" r="5" fill="${T.surface}" stroke="${T.text}" stroke-width="2"/>`;
    const lines = o.hover.lines, bw = o.hover.boxWidth ?? 128, bh = 12 + lines.length * 17;
    const bx = o.hover.side === 'left' ? hx - bw - 12 : hx + 12, by = Math.max(m.top + 4, hy - bh - 10);
    s += `<rect x="${f(bx)}" y="${f(by)}" width="${bw}" height="${bh}" rx="6" fill="${T.charcoal}"/>`;
    lines.forEach((l, i) => { s += text(bx + 10, by + 20 + i * 17, l, { size: 12, fill: i === 1 ? '#FFFFFF' : T.border, weight: i === 1 ? 700 : 500 }); });
  }
  // legend (top-left)
  if (o.legend) {
    let lx = m.left;
    for (const l of o.legend) {
      if (l.marker) s += l.marker === 'warning' ? `<path d="M${lx + 8} 5L${lx + 14} 16H${lx + 2}Z" fill="${T.ochre}"/>` : `<circle cx="${lx + 8}" cy="11" r="4.5" fill="${T.muted}"/>`;
      else if (l.swatch) s += `<rect x="${lx}" y="6" width="16" height="10" rx="2" fill="${l.color}"${l.opacity ? ` fill-opacity="${l.opacity}"` : ''}/>`;
      else s += `<line x1="${lx}" x2="${lx + 16}" y1="11" y2="11" stroke="${l.color}" stroke-width="2"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''}/>`;
      s += text(lx + 22, 15, l.label, { size: 11, fill: T.text });
      lx += 30 + l.label.length * 6.2;
    }
  }
  return s + '</svg>';
}

/** Alerts timeline: dots on a horizontal time axis. items: [{x, severity:'info'|'warning'|'critical', label}] */
export function timelineDots({ width = 640, height = 64, min, max, items, ticks = [] }) {
  const m = { left: 12, right: 12 }, axisY = 26;
  const X = scale(min, max, m.left, width - m.right);
  const color = { info: T.muted, warning: T.ochre, critical: T.critical }; // info is neutral: blue is for interactive elements only
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
  s += `<line x1="${m.left}" x2="${width - m.right}" y1="${axisY}" y2="${axisY}" stroke="${T.border}" stroke-width="2" stroke-linecap="round"/>`;
  for (const [v, label] of ticks) s += text(X(v), height - 6, label, { anchor: 'middle' });
  for (const it of items) {
    const cx = X(it.x);
    if (it.severity === 'warning') s += `<path d="M${f(cx)} ${axisY - 8}L${f(cx + 8)} ${axisY + 6}H${f(cx - 8)}Z" fill="${color.warning}" stroke="${T.surface}" stroke-width="1.5" stroke-linejoin="round"/>`;
    else if (it.severity === 'critical') s += `<rect x="${f(cx - 6)}" y="${axisY - 6}" width="12" height="12" rx="2" fill="${color.critical}" stroke="${T.surface}" stroke-width="1.5"/>`;
    else s += `<circle cx="${f(cx)}" cy="${axisY}" r="6" fill="${color.info}" stroke="${T.surface}" stroke-width="1.5"/>`;
    if (it.label) s += text(cx, axisY - 14, it.label, { anchor: 'middle', size: 10.5, fill: T.text });
  }
  return s + '</svg>';
}

/** Progress ring (quality score, hold-to-stop progress, calibration). */
export function ring({ size = 64, pct = 50, stroke = 6, color = T.brand600, track = T.border, label, sublabel, labelColor = T.text, labelSize } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, mid = size / 2;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img">`;
  s += `<circle cx="${mid}" cy="${mid}" r="${f(r)}" fill="none" stroke="${track}" stroke-width="${stroke}"/>`;
  s += `<circle cx="${mid}" cy="${mid}" r="${f(r)}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${f((c * pct) / 100)} ${f(c)}" transform="rotate(-90 ${mid} ${mid})"/>`;
  if (label != null) s += text(mid, sublabel ? mid - 2 : mid + 1, label, { anchor: 'middle', baseline: 'middle', size: labelSize ?? Math.round(size * 0.3), weight: 700, fill: labelColor });
  if (sublabel) s += text(mid, mid + size * 0.2, sublabel, { anchor: 'middle', baseline: 'middle', size: Math.max(9, Math.round(size * 0.13)) });
  return s + '</svg>';
}

/** Small bar chart (e.g., width over the last 10 layers). bars: [{label, value, status}] */
export function bars({ width = 260, height = 96, bars: data, min, max, band, limit }) {
  const m = { top: 8, bottom: 18, left: 4, right: 4 };
  const Y = scale(min, max, height - m.bottom, m.top), bw = (width - m.left - m.right) / data.length;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`;
  if (band) s += `<rect x="${m.left}" y="${f(Y(band[1]))}" width="${width - m.left - m.right}" height="${f(Y(band[0]) - Y(band[1]))}" fill="${T.brand50}"/>`;
  data.forEach((d, i) => {
    const x = m.left + i * bw + bw * 0.18, w = bw * 0.64;
    s += `<rect x="${f(x)}" y="${f(Y(d.value))}" width="${f(w)}" height="${f(height - m.bottom - Y(d.value))}" rx="2" fill="${d.status === 'warn' ? T.ochre : T.text}" fill-opacity="${d.status === 'warn' ? 1 : 0.78}"/>`;
    if (d.label) s += text(x + w / 2, height - 5, d.label, { anchor: 'middle', size: 10 });
  });
  if (limit != null) s += `<line x1="${m.left}" x2="${width - m.right}" y1="${f(Y(limit))}" y2="${f(Y(limit))}" stroke="${T.critical}" stroke-width="1" stroke-dasharray="4 3"/>`;
  return s + '</svg>';
}
