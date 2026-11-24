// Colors mirror src/styles/tokens.css (plan/01_design_system.md §7). Do not add colors here.
const v = (name) => `var(--${name})`;
module.exports = {
  content: ['./src/**/*.html', './src/lib/**/*.js'],
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'), surface: v('surface'), border: v('border'),
        text: { DEFAULT: v('text'), muted: v('text-muted') },
        charcoal: v('charcoal'),
        brand: { 50: v('brand-50'), 600: v('brand-600'), 700: v('brand-700') },
        critical: { DEFAULT: v('critical'), 50: v('critical-50') },
        ok: { DEFAULT: v('ok'), 50: v('ok-50') },
        warn: { 50: v('warn-50') },
        viz: { teal: v('viz-teal'), violet: v('viz-violet'), ochre: v('viz-ochre') },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'] },
      borderRadius: { card: '8px', ctl: '6px' },
      boxShadow: { card: '0 1px 2px rgba(28,30,33,.06), 0 1px 3px rgba(28,30,33,.10)' },
    },
  },
  plugins: [],
};
