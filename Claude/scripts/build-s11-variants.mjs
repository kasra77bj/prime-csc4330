// Derives the AI Recommendations variants from src/screens/S11-ai-recommendations.html (plan/05 S11):
//   S11b · Manual adjust drawer (US-11): right-hand drawer over a scrim; the control bar stays uncovered.
//   S11c · Operator view: same recommendation, actions locked ("Engineer approval required") + Escalate.
// Write new markup with <i data-lucide> placeholders, then run: node scripts/build-s11-variants.mjs && npm run icons
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/S11-ai-recommendations.html', 'utf8');
const mock = JSON.parse(fs.readFileSync('src/data/mock.json', 'utf8'));
const swap = (html, name, body) => {
  const re = new RegExp(`(<!-- VARIANT:${name} -->)[\\s\\S]*?(<!-- /VARIANT:${name} -->)`);
  if (!re.test(html)) throw new Error(`marker ${name} not found`);
  return html.replace(re, `$1\n${body}\n    $2`);
};
const header = (id, title, us) => (html) => html.replace(
  /<!-- S11 · AI Recommendations · \/prints\/:jobId\/ai · US-09,10,11 -->([\s\S]*?)<!-- Source for S11b\/S11c:[^\n]*-->/,
  `<!-- ${id} · AI Recommendations · ${title} · /prints/:jobId/ai · ${us} -->$1<!-- GENERATED from S11-ai-recommendations.html by scripts/build-s11-variants.mjs. Edit S11, then re-run. -->`);

// ---------- S11b · Manual adjust drawer ----------
const d = mock.aiRecommendations.manualDrawer;
let b = header('S11b', 'Manual adjust drawer', 'US-11')(src);
b = swap(b, 'OVERLAY', `<!-- scrim: whole sidebar + content above the control bar (the control bar is never covered) -->
<div class="absolute left-0 top-0 bottom-0 w-[240px] z-20" style="background:rgba(35,39,43,.45)"></div>
<div class="absolute left-[240px] right-0 top-0 bottom-[72px] z-20" style="background:rgba(35,39,43,.45)"></div>
<aside class="absolute right-0 top-0 bottom-[72px] z-30 w-[460px] bg-surface flex flex-col" style="box-shadow:-8px 0 24px rgba(28,30,33,.18)">
  <div class="flex items-center justify-between px-7 py-5 border-b border-border">
    <h2 class="h2">Manual Adjustment</h2>
    <span class="icon-btn -mr-2"><i data-lucide="x" class="ic"></i></span>
  </div>
  <div class="flex-1 px-7 py-6 flex flex-col gap-6">
    <div>
      <label class="field-label">Parameter</label>
      <div class="grid grid-cols-2 p-1 rounded-ctl bg-canvas">
        <span class="h-10 flex items-center justify-center text-[14px] font-medium text-text-muted">Pump RPM</span>
        <span class="h-10 flex items-center justify-center text-[14px] font-semibold rounded-ctl bg-surface shadow-card">${d.parameter}</span>
      </div>
    </div>
    <div>
      <label class="field-label">New value</label>
      <div class="flex items-center gap-4">
        <div class="text-center">
          <div class="caption">Current</div>
          <div class="text-[24px] font-semibold num text-text-muted">${d.current}</div>
        </div>
        <i data-lucide="arrow-right" class="ic text-text-muted mt-4"></i>
        <div class="flex items-center flex-1 h-14 rounded-ctl border border-brand-600" style="box-shadow:0 0 0 3px var(--brand-50)">
          <span class="w-14 h-full flex items-center justify-center text-brand-600 border-r border-border"><i data-lucide="minus" class="ic"></i></span>
          <span class="flex-1 text-center text-[24px] font-semibold num">${d.next} <span class="text-[14px] font-medium text-text-muted">${d.unit}</span></span>
          <span class="w-14 h-full flex items-center justify-center text-brand-600 border-l border-border"><i data-lucide="plus" class="ic"></i></span>
        </div>
      </div>
      <div class="caption mt-2">Normal 60–140 ${d.unit} · applies at the ${d.applyAt}</div>
    </div>
    <div>
      <label class="field-label">Reason <span class="text-text-muted font-normal">(required)</span></label>
      <div class="input h-auto items-start py-3 text-[14px] leading-relaxed min-h-[88px]">${d.note}</div>
    </div>
    <label class="flex items-center gap-3 text-[14px]"><span class="checkbox checkbox-locked"><i data-lucide="lock" class="ic-xs"></i></span>Logged to the audit trail as Dev Patel · Engineer</label>
  </div>
  <div class="px-7 py-5 border-t border-border flex items-center justify-end gap-3">
    <button class="btn btn-ghost">Cancel</button>
    <button class="btn btn-primary">Apply at next layer</button>
  </div>
</aside>`);

// ---------- S11c · Operator view (locked) ----------
let c = header('S11c', 'Operator view (locked)', 'US-09,10 · NFR security')(src);
c = swap(c, 'USER', `    <span class="role-badge">Operator</span>
    <span class="avatar">MO</span>`);
c = swap(c, 'ACTIONS', `      <div class="flex items-center gap-3 pt-1">
        <button class="btn btn-locked"><i data-lucide="lock" class="ic-sm"></i>Accept</button>
        <button class="btn btn-locked"><i data-lucide="lock" class="ic-sm"></i>Modify</button>
        <span class="tooltip">Engineer approval required</span>
        <button class="btn btn-secondary ml-auto"><i data-lucide="user-round-plus" class="ic-sm"></i>Escalate to Dev Patel</button>
      </div>`);
c = swap(c, 'MANUAL', `      <div class="p-4 border-t border-border">
        <button class="btn btn-locked w-full"><i data-lucide="lock" class="ic-sm"></i>Adjust without AI</button>
      </div>`);
c = c.replace('<span class="caption ml-auto">Applies at the next layer · logged as Dev Patel · Engineer</span>', '');

fs.writeFileSync('src/screens/S11b-manual-adjust.html', b);
fs.writeFileSync('src/screens/S11c-operator-locked.html', c);
console.log('Wrote S11b-manual-adjust.html and S11c-operator-locked.html');
