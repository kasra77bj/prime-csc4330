/** Vector PRIME mark: a "P" of three stacked bead/circuit traces with a rising arrow (docs/03). */
export function LogoMark({ className = "h-8 w-8", mono = false }: { className?: string; mono?: boolean }) {
  const c = mono ? ["currentColor", "currentColor", "currentColor"] : ["#174A6D", "#1F5F8B", "#2E7D32"];
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden fill="none" strokeLinecap="round" strokeWidth={3.2}>
      <path d="M9 42V10h13a10 10 0 0 1 0 20H15" stroke={c[0]} />
      <path d="M15 42V16h7a4 4 0 0 1 0 8h-1" stroke={c[1]} />
      <path d="M21 42V34" stroke={c[2]} />
      <circle cx="21" cy="42" r="2" fill={c[2]} stroke="none" />
      <path d="M27 30l12-14m0 0h-7m7 0v7" stroke={c[2]} />
    </svg>
  );
}

export function Logo({ light = false, tagline = false }: { light?: boolean; tagline?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={light ? "rounded-ctl bg-white p-1" : ""}>
        <LogoMark className="h-7 w-7" />
      </span>
      <div className="leading-tight">
        <div className={`text-lg font-bold tracking-wide ${light ? "text-white" : "text-text"}`}>PRIME</div>
        {tagline && (
          <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${light ? "text-white/70" : "text-text-muted"}`}>
            AI-powered concrete 3D printing
          </div>
        )}
      </div>
    </div>
  );
}
