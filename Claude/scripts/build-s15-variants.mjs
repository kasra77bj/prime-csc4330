// Derives S15b (Create user modal, plan/05 S15) from src/screens/S15-admin-users.html.
// The form is shown empty-but-ready (placeholders only): the project allows only the four named people,
// so no new person's name is invented. Run: node scripts/build-s15-variants.mjs && npm run icons
import fs from 'node:fs';

const src = fs.readFileSync('src/screens/S15-admin-users.html', 'utf8');
const swap = (html, name, body) => {
  const re = new RegExp(`(<!-- VARIANT:${name} -->)[\\s\\S]*?(<!-- /VARIANT:${name} -->)`);
  if (!re.test(html)) throw new Error(`marker ${name} not found`);
  return html.replace(re, `$1\n${body}\n$2`);
};
const roleCard = (name, desc, on) => `<label class="rounded-card border ${on ? 'border-brand-600 bg-brand-50' : 'border-border'} p-4 flex gap-3">
          <span class="w-[18px] h-[18px] mt-0.5 rounded-full border-2 ${on ? 'border-brand-600' : 'border-text-muted'} flex items-center justify-center shrink-0">${on ? '<span class="w-2 h-2 rounded-full bg-brand-600"></span>' : ''}</span>
          <span><span class="block font-semibold text-[14px]">${name}</span><span class="block caption text-[13px] mt-0.5">${desc}</span></span>
        </label>`;

let b = src.replace(/<!-- S15 · Admin › Users · \/admin\/users · US-02 -->\n<!-- Source for S15b[^\n]*-->/,
  '<!-- S15b · Admin › Users · Create user modal · /admin/users?new=1 · US-02 -->\n<!-- GENERATED from S15-admin-users.html by scripts/build-s15-variants.mjs. Edit S15, then re-run. -->');
b = swap(b, 'OVERLAY', `<div class="absolute inset-0 z-20 flex items-center justify-center" style="background:rgba(35,39,43,.5)">
  <section class="card w-[600px] flex flex-col" style="box-shadow:0 16px 48px rgba(28,30,33,.28)">
    <div class="flex items-center justify-between px-8 py-5 border-b border-border">
      <h2 class="h2">Create user</h2>
      <span class="icon-btn -mr-2"><i data-lucide="x" class="ic"></i></span>
    </div>
    <div class="px-8 py-6 flex flex-col gap-5">
      <div class="grid grid-cols-2 gap-4">
        <div><label class="field-label">Full name</label><div class="input input-focus"><span class="placeholder">First and last name</span></div></div>
        <div><label class="field-label">Work email</label><div class="input"><span class="placeholder">name@prime.example</span></div></div>
      </div>
      <div>
        <label class="field-label">Role</label>
        <div class="grid grid-cols-2 gap-3">
          ${roleCard('Operator', 'Live view, pause/stop, alerts', true)}
          ${roleCard('Engineer', 'Plus AI review and adjustments', false)}
          ${roleCard('Manager', 'Reports and exports only', false)}
          ${roleCard('Admin', 'Users, roles and printers', false)}
        </div>
      </div>
      <div>
        <label class="field-label">Bay access</label>
        <div class="flex gap-2"><span class="chip">Bay 1</span><span class="chip chip-selected"><i data-lucide="check" class="ic-sm"></i>Bay 2</span><span class="chip">Bay 3</span></div>
      </div>
      <label class="flex items-center gap-3 text-[14px]"><span class="checkbox checkbox-locked"><i data-lucide="lock" class="ic-xs"></i></span>2-factor setup required at first sign-in</label>
    </div>
    <div class="px-8 py-5 border-t border-border flex justify-end gap-3">
      <button class="btn btn-ghost">Cancel</button>
      <button class="btn btn-primary"><i data-lucide="send" class="ic-sm"></i>Send invite</button>
    </div>
  </section>
</div>`);
fs.writeFileSync('src/screens/S15b-create-user.html', b);
console.log('Wrote S15b-create-user.html');
