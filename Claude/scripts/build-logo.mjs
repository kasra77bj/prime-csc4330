// Builds the PRIME vector logo set (plan/03_cover_page.md §1) into assets/logo/. Run: node scripts/build-logo.mjs
// Mark: a "P" drawn as 3 parallel traces (stacked concrete beads / circuit bus), rounded caps, two traces end in
// circuit pads. Text is converted to outlines (opentype.js).
// Colors are tokens from src/styles/tokens.css (spec 03 hexes #0B2A45/#1E5FA8/#2FA36B/#1B2430/#5B6573 are not in the
// palette; mapped to brand-700 / brand-600 / ok / text / text-muted per plan/01 §2).
import fs from 'node:fs';
import opentype from 'opentype.js';

const C = { brand700: '#174A6D', brand600: '#1F5F8B', ok: '#2E7D32', text: '#1C1E21', muted: '#5F6368', charcoal: '#23272B', white: '#FFFFFF' };
const OUT = 'assets/logo';
fs.mkdirSync(OUT, { recursive: true });

const load = (p) => { const b = fs.readFileSync(p); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const montserrat = load('node_modules/@fontsource/montserrat/files/montserrat-latin-800-normal.woff');
const inter = load('node_modules/@fontsource/inter/files/inter-latin-600-normal.woff');

// ---------- Mark geometry (viewBox 0 0 72 64) ----------
// Three traces share the stem (x = 10 / 17 / 24) and are concentric around the bowl centre (38, 26).
const SW = 4.6; // stroke width
const traces = [
  // outer: full stem, bowl, returns left and ends in a pad
  { d: 'M10 60V6H38A20 20 0 0 1 38 46H33', pad: [30.5, 46] },
  // middle: stem, bowl, ends in a pad
  { d: 'M17 60V13H38A13 13 0 0 1 38 39H29', pad: [26.5, 39] },
  // inner: short closed bowl on its own stem
  { d: 'M24 60V20H38A6 6 0 0 1 38 32H24' },
];
// The rising arrow from spec 03 was dropped at the team's request (Oct 9): the green inner trace carries the accent.
const MW = 64; // mark viewBox is 64 x 64; geometry is shifted by (-2, -1) to centre it

function markSVG({ colors = [C.brand700, C.brand600, C.ok], x = 0, y = 0, s = 1, sw = SW } = {}) {
  const g = traces.map((t, i) => {
    let p = `<path d="${t.d}" fill="none" stroke="${colors[i]}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (t.pad) p += `<circle cx="${t.pad[0]}" cy="${t.pad[1]}" r="${sw * 0.78}" fill="${colors[i]}"/>`;
    return p;
  }).join('');
  return `<g transform="translate(${x} ${y}) scale(${s}) translate(-2 -1)">${g}</g>`;
}

// ---------- Outlined text ----------
function textPath(font, str, size, { tracking = 0, x = 0, y = 0, fill }) {
  let cx = x, d = '';
  const glyphs = [...str].map((ch) => font.charToGlyph(ch)); // no shaping needed for caps
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, y, size).toPathData(2);
    cx += (g.advanceWidth / font.unitsPerEm) * size + (i < glyphs.length - 1 ? tracking * size : 0);
    if (i < glyphs.length - 1) cx += (font.getKerningValue(g, glyphs[i + 1]) / font.unitsPerEm) * size;
  });
  return { svg: `<path d="${d}" fill="${fill}"/>`, width: cx - x };
}
const capH = (font, size) => ((font.tables.os2.sCapHeight || font.unitsPerEm * 0.7) / font.unitsPerEm) * size;

// ---------- Variants ----------
const svg = (w, h, body, title = 'PRIME') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

function horizontal({ mark = {}, word = C.text } = {}) {
  const H = 64, size = 40, ch = capH(montserrat, size);
  const t = textPath(montserrat, 'PRIME', size, { tracking: 0.04, x: 80, y: 32 + ch / 2, fill: word });
  return svg(Math.ceil(80 + t.width + 2), H, markSVG(mark) + t.svg);
}

function stacked({ mark = {}, word = C.text, tag = C.muted } = {}) {
  const W = 520, ms = 2.2, mw = MW * ms;
  const word1 = textPath(montserrat, 'PRIME', 76, { tracking: 0.04, x: 0, y: 0, fill: word });
  const tagT = textPath(inter, 'AI-POWERED CONCRETE 3D PRINTING PLATFORM', 15, { tracking: 0.12, x: 0, y: 0, fill: tag });
  const wx = (W - word1.width) / 2, tx = (W - tagT.width) / 2;
  const wy = 64 * ms + 28 + capH(montserrat, 76), ty = wy + 40;
  const w = textPath(montserrat, 'PRIME', 76, { tracking: 0.04, x: wx, y: wy, fill: word });
  const tg = textPath(inter, 'AI-POWERED CONCRETE 3D PRINTING PLATFORM', 15, { tracking: 0.12, x: tx, y: ty, fill: tag });
  return svg(W, Math.ceil(ty + 6), markSVG({ ...mark, x: (W - mw) / 2, y: 0, s: ms }) + w.svg + tg.svg);
}

// Favicon: charcoal rounded square, simplified mark (outer trace + green inner pad) with thicker strokes
function favicon(size = 32) {
  const body = `<rect width="32" height="32" rx="7" fill="${C.charcoal}"/>` +
    `<g transform="translate(6.6 5.2) scale(0.36)">` +
    `<path d="M10 60V6H38A20 20 0 0 1 38 46H10" fill="none" stroke="${C.white}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="34" cy="26" r="6.5" fill="${C.ok}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" role="img" aria-label="PRIME"><title>PRIME</title>${body}</svg>\n`;
}

const dark = { colors: [C.white, C.white, C.ok] };
const files = {
  'prime-mark.svg': svg(MW, 64, markSVG()),
  'prime-mark-mono.svg': svg(MW, 64, markSVG({ colors: [C.brand700, C.brand700, C.brand700] })),
  'prime-mark-white.svg': svg(MW, 64, markSVG(dark)),
  'prime-logo-horizontal.svg': horizontal(),
  'prime-logo-horizontal-white.svg': horizontal({ mark: dark, word: C.white }),
  'prime-logo-stacked.svg': stacked(),
  'prime-logo-stacked-white.svg': stacked({ mark: dark, word: C.white, tag: '#DCD9D3' }),
  'prime-favicon.svg': favicon(32),
  'prime-app-icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="PRIME"><title>PRIME</title><rect width="128" height="128" rx="28" fill="${C.charcoal}"/>${markSVG({ ...dark, x: 26, y: 26, s: 1.19 })}</svg>\n`,
};
for (const [name, content] of Object.entries(files)) fs.writeFileSync(`${OUT}/${name}`, content);
console.log('Wrote', Object.keys(files).map((f) => `${OUT}/${f}`).join('\n      '));
