// Page bootstrap for screens: loads src/data/mock.json, then runs the page's draw function.
// Usage inside a screen:
//   <script type="module">
//     import { mount } from '../lib/mount.js';
//     mount(({ mock, chart, $ }) => { $('#spark-temp').innerHTML = chart.sparkline(mock.sparklines60m.materialTemp, {...}); });
//   </script>
// Data binding check: any element with data-bind="path.in.mock" (optional data-fixed="1") must already contain the value
// from mock.json. Mismatches are logged as console warnings, which scripts/render.mjs reports, so numbers can't drift.
import * as chart from './chart.js';

window.__primePending = true; // render.mjs waits until this is cleared

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

export async function mount(draw) {
  window.__primePending = true;
  try {
    const url = new URL('../data/mock.json', import.meta.url);
    const mock = await (await fetch(url)).json();
    const $ = (sel) => document.querySelector(sel);
    for (const el of document.querySelectorAll('[data-bind]')) {
      let v = get(mock, el.dataset.bind);
      if (v == null) { console.warn(`data-bind: no value at "${el.dataset.bind}"`); continue; }
      if (typeof v === 'number' && el.dataset.fixed) v = v.toFixed(Number(el.dataset.fixed));
      const shown = el.textContent.trim();
      if (shown && shown !== String(v)) console.warn(`data-bind mismatch at "${el.dataset.bind}": page shows "${shown}", mock.json has "${v}"`);
      el.textContent = String(v);
    }
    if (draw) await draw({ mock, chart, $ });
  } catch (e) {
    console.error('mount failed: ' + e.message);
  } finally {
    window.__primePending = false;
  }
}

// Pages that only need the binding check can call mount() with no draw function.
export { chart };
