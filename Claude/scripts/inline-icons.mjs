// Replaces <i data-lucide="name" class="ic"></i> placeholders in src/**/*.html with the inline Lucide SVG markup
// (from the lucide-static package). Idempotent: already-inlined icons are <svg data-lucide=…> and are left alone.
// Plan rule: icons are inline SVG, no icon fonts (plan/08 §1). Run: npm run icons (also part of npm run render).
import fs from 'node:fs';
import path from 'node:path';

const ICONS = 'node_modules/lucide-static/icons';
const SIZES = { 'ic-xs': 14, 'ic-sm': 16, ic: 20, 'ic-lg': 24 };
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p);
  }
})('src');

let total = 0;
const missing = new Set();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let n = 0;
  const out = src.replace(/<i data-lucide="([a-z0-9-]+)"([^>]*)><\/i>/g, (all, name, attrs) => {
    const svgFile = path.join(ICONS, `${name}.svg`);
    if (!fs.existsSync(svgFile)) { missing.add(`${name} (${file})`); return all; }
    const inner = fs.readFileSync(svgFile, 'utf8').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
      .replace(/\s*\n\s*/g, '').replace(/\s+\/>/g, '/>');
    const cls = (attrs.match(/class="([^"]*)"/) || [])[1] || '';
    const size = Object.entries(SIZES).find(([c]) => cls.split(/\s+/).includes(c))?.[1] ?? 20;
    n++;
    return `<svg data-lucide="${name}"${attrs} xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  });
  if (n) { fs.writeFileSync(file, out); total += n; console.log(`  ${file}: ${n} icon(s) inlined`); }
}
console.log(`${total} icon(s) inlined.`);
if (missing.size) { console.error('Unknown Lucide icons:\n  ' + [...missing].join('\n  ')); process.exitCode = 1; }
