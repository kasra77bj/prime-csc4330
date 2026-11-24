// Backup route diagram: renders the Mermaid flowchart from plan/02_information_architecture.md §3 to exports/route-diagram.svg
// (vector). Colors in the spec block (#EEF4FB / #1E5FA8) are not tokens, so they are mapped to brand-50 / brand-600.
// Run: node scripts/render-mermaid.mjs   (loads mermaid from cdn.jsdelivr.net; needs internet)
import { chromium } from 'playwright';
import fs from 'node:fs';

const spec = fs.readFileSync('plan/02_information_architecture.md', 'utf8');
const src = spec.match(/```mermaid\n([\s\S]*?)```/)[1]
  .replace(/#EEF4FB/gi, '#E6EEF4').replace(/#1E5FA8/gi, '#1F5F8B');

let browser;
for (const opt of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) { try { browser = await chromium.launch(opt); break; } catch {} }
const page = await browser.newPage();
await page.setContent(`<html><body><script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: false, theme: 'base', flowchart: { htmlLabels: false },
    themeVariables: { fontFamily: 'Inter, Arial, sans-serif', primaryColor: '#FFFFFF', primaryBorderColor: '#1C1E21',
      primaryTextColor: '#1C1E21', lineColor: '#1F5F8B', fontSize: '15px' } });
  const { svg } = await mermaid.render('routes', ${JSON.stringify(src)});
  window.__svg = svg;
</script></body></html>`);
await page.waitForFunction(() => window.__svg, null, { timeout: 30000 });
fs.writeFileSync('exports/route-diagram.svg', await page.evaluate(() => window.__svg));
await browser.close();
console.log('✓ exports/route-diagram.svg');
