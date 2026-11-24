// Generates assets/vision/bead-camera.svg: a clean vector "camera frame" of the printed wall seen end-on from the
// nozzle-side camera (plan/05 S09: "generated/clean illustration ... no blurry stock"). Token grays only.
// Scale: 4.4 px per mm. Lower beads are ~40 x 15 mm; the newest (top) bead is 36.4 x 14.8 mm (under-extrusion).
// The measurement overlay is drawn separately in the screen so "Show overlay" can toggle it.
// Run: node scripts/build-vision-art.mjs
import fs from 'node:fs';

const W = 720, H = 480, PX = 4.4, CX = 360;
const C = { charcoal: '#23272B', text: '#1C1E21', muted: '#5F6368', border: '#DCD9D3', canvas: '#F5F4F1', surface: '#FFFFFF' };
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// beads from top (newest) to bottom; width/height in mm
const beads = [
  { w: 36.4, h: 14.8 }, { w: 39.0, h: 15.0 }, { w: 39.6, h: 15.1 }, { w: 40.1, h: 14.9 }, { w: 39.8, h: 15.0 }, { w: 40.2, h: 15.2 },
];
const TOP = 132; // y of the top edge of the newest bead
let y = TOP;
const shapes = [];
beads.forEach((b, i) => {
  const w = b.w * PX, h = b.h * PX, x = CX - w / 2;
  shapes.push({ x, y, w, h, i });
  y += h - 4; // beads squash into each other slightly
});

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
s += `<rect width="${W}" height="${H}" fill="${C.charcoal}"/>`;
// soft floor light behind the wall
s += `<ellipse cx="${CX}" cy="${H + 40}" rx="420" ry="190" fill="${C.muted}" fill-opacity=".35"/>`;
// beads (bottom first so upper ones overlap)
for (const b of [...shapes].reverse()) {
  const r = b.h / 2;
  s += `<rect x="${b.x.toFixed(1)}" y="${b.y.toFixed(1)}" width="${b.w.toFixed(1)}" height="${b.h.toFixed(1)}" rx="${r.toFixed(1)}" fill="${b.i === 0 ? C.canvas : C.border}" stroke="${C.muted}" stroke-width="1.5"/>`;
  // shading on the lower half of each bead
  s += `<rect x="${(b.x + 6).toFixed(1)}" y="${(b.y + b.h * 0.55).toFixed(1)}" width="${(b.w - 12).toFixed(1)}" height="${(b.h * 0.38).toFixed(1)}" rx="${(b.h * 0.19).toFixed(1)}" fill="${C.muted}" fill-opacity=".16"/>`;
  // concrete texture: small pores
  for (let k = 0; k < 26; k++) {
    const px = b.x + 10 + rnd() * (b.w - 20), py = b.y + 6 + rnd() * (b.h - 12);
    s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(0.8 + rnd() * 1.4).toFixed(1)}" fill="${C.muted}" fill-opacity="${(0.25 + rnd() * 0.3).toFixed(2)}"/>`;
  }
}
// nozzle above the newest bead (30 mm diameter)
const nw = 30 * PX;
s += `<rect x="${CX - nw / 2}" y="0" width="${nw}" height="${TOP - 26}" fill="${C.text}"/>`;
s += `<rect x="${CX - nw / 2 - 10}" y="${TOP - 34}" width="${nw + 20}" height="14" rx="3" fill="${C.text}"/>`;
s += `<rect x="${CX - nw / 2 + 8}" y="0" width="6" height="${TOP - 26}" fill="${C.muted}" fill-opacity=".5"/>`;
s += `</svg>\n`;

fs.mkdirSync('assets/vision', { recursive: true });
fs.writeFileSync('assets/vision/bead-camera.svg', s);
// geometry for the overlay (used by the Vision screen)
const top = shapes[0];
console.log('top bead (px):', { x: +top.x.toFixed(1), y: top.y, w: +top.w.toFixed(1), h: +top.h.toFixed(1) });
