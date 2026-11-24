// The one sidebar used on every signed-in screen (desktop and tablet), so all pages show the same options.
// Role only changes the lock icons (RBAC): Admin is locked unless Admin; Sessions is locked for Operators.
const ITEMS = [
  ['dashboard', 'layout-dashboard', 'Dashboard'],
  ['live', 'brick-wall', 'Live prints'],
  ['alerts', 'bell', 'Alerts', '<span class="count-badge count-badge-neutral">2</span>'],
  ['ai', 'sparkles', 'AI suggestions', '<span class="count-badge count-badge-neutral">1</span>'],
  ['sessions', 'history', 'Sessions'],
  ['achievements', 'trophy', 'Achievements'],
  ['admin', 'shield', 'Admin'],
  ['settings', 'settings', 'Settings'],
];

export function sidebar(active, role) {
  const lock = '<i data-lucide="lock" class="ic-sm ml-auto opacity-70"></i>';
  const locked = (key) => (key === 'admin' && role !== 'Admin') || (key === 'sessions' && role === 'Operator');
  const nav = ITEMS.map(([key, icon, label, extra = '']) =>
    `    <a class="nav-item${key === active ? ' nav-item-active' : ''}"><i data-lucide="${icon}"></i>${label}${locked(key) ? lock : extra}</a>`).join('\n');
  return `<!-- SIDEBAR · identical on every signed-in screen (scripts/lib/shell.mjs; run npm run sidebar) -->
<aside class="sidebar">
  <div class="flex items-center gap-2 px-3 h-10 mb-6">
    <img src="../../assets/logo/prime-logo-horizontal-white.svg" alt="PRIME" class="h-7">
  </div>
  <nav class="flex flex-col gap-1">
${nav}
  </nav>
  <div class="mt-auto flex flex-col gap-1">
    <a class="nav-item"><i data-lucide="circle-help"></i>Help</a>
    <a class="nav-item"><i data-lucide="panel-left-close"></i>Collapse</a>
  </div>
</aside>`;
}
