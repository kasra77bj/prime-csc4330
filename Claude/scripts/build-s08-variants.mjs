// Derives the two Live Monitor variants from src/screens/S08-live-monitor.html so the shared layout and the control
// bar stay identical (plan/05 S08 "second variant"). Only the blocks between <!-- VARIANT:X --> markers are swapped.
//   S08b · Reconnecting (NFR reliability): pill + banner change, tiles show last known values, nothing is lost.
//   S08c · Hold to stop in progress (US-07): STOP ring at 70 %, content dimmed, control bar stays fully visible.
// Run after editing S08: node scripts/build-s08-variants.mjs  (npm run icons first if S08 has new <i data-lucide>)
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/S08-live-monitor.html', 'utf8');
const swap = (html, name, body) => {
  const re = new RegExp(`(<!-- VARIANT:${name} -->)[\\s\\S]*?(<!-- /VARIANT:${name} -->)`);
  if (!re.test(html)) throw new Error(`marker ${name} not found`);
  return html.replace(re, `$1\n${body}\n    $2`);
};
const header = (id, title, us) => (html) => html
  .replace(/<!-- S08 · Live Print Monitor · \/prints\/:jobId\/live · US-03,04,06,07 -->\n<!-- Source for S08b\/S08c:[^\n]*-->/,
    `<!-- ${id} · Live Print Monitor · ${title} · /prints/:jobId/live · ${us} -->\n<!-- GENERATED from S08-live-monitor.html by scripts/build-s08-variants.mjs. Edit S08, then re-run. -->`);

// Lucide markup reused below (already inlined form)
const icon = (inner, cls = 'ic-lg') => `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const LOADER = '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>';
const SQUARE = '<rect width="18" height="18" x="3" y="3" rx="2"/>';

// ---------- S08b · Reconnecting ----------
let b = header('S08b', 'Reconnecting variant', 'US-07 · NFR reliability')(src);
b = swap(b, 'CONN', `    <span class="conn conn-reconnecting">${icon(LOADER, '')}Reconnecting…</span>`);
b = swap(b, 'BANNER', `<div class="banner h-[64px]" style="background:var(--warn-50);box-shadow:inset 4px 0 0 var(--viz-ochre)">
  <span style="color:var(--viz-ochre)">${icon(LOADER)}</span>
  <div class="flex-1 text-[15px]"><b class="font-semibold">Reconnecting to Gantry-02…</b> <span data-bind="connection.reconnecting.detail">12 readings buffered, nothing lost</span>. Pause and STOP still work.</div>
  <span class="caption num">Last values 14:33:52</span>
</div>`);
// Tiles: show last known values (faded) with a timestamp; status pills stay so context isn't lost
b = b.replace('<section class="grid grid-cols-3 grid-rows-2 gap-3 flex-1 min-h-0">', '<section class="grid grid-cols-3 grid-rows-2 gap-3 flex-1 min-h-0 relative" style="opacity:.55">');

// ---------- S08c · Hold to stop ----------
let c = header('S08c', 'Hold-to-stop variant', 'US-07')(src);
c = swap(c, 'STOP', `    <button class="stop-btn" style="box-shadow:0 0 0 4px var(--critical-50)">
      <span class="stop-ring">
        <svg class="stop-ring-svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="none" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="3"/><circle cx="20" cy="20" r="17" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-dasharray="74.77 106.81"/></svg>
        <i data-lucide="square" class="ic-sm" style="fill:currentColor"></i>
      </span>
      <span class="stop-label"><b>STOP</b><small>70 %</small></span>
    </button>`);
// Dim everything above the control bar; the control bar itself is never covered (US-07)
c = swap(c, 'OVERLAY', `<div class="absolute left-0 top-0 bottom-0 w-[240px] z-20" style="background:rgba(35,39,43,.55)"></div>
<div class="absolute left-[240px] right-0 top-0 bottom-[72px] z-20 flex items-center justify-center" style="background:rgba(35,39,43,.55)">
  <div class="card px-8 py-6 flex items-center gap-4">
    <span class="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style="background:var(--critical-50);color:var(--critical)">${icon(SQUARE, 'ic-lg').replace('<svg ', '<svg style="fill:currentColor" ')}</span>
    <div>
      <div class="h2">Keep holding to stop</div>
      <div class="text-text-muted text-[15px]">Release to cancel</div>
    </div>
  </div>
</div>`);

fs.writeFileSync('src/screens/S08b-live-reconnecting.html', b);
fs.writeFileSync('src/screens/S08c-hold-to-stop.html', c);
console.log('Wrote S08b-live-reconnecting.html and S08c-hold-to-stop.html');
