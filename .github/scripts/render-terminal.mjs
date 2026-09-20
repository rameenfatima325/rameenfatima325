// Renders the profile README's terminal-window PNGs (light + dark) from a
// stats object. Shared by fetch-stats.mjs (real GitHub data) and any local
// test run. Pure rendering concerns live here; data fetching lives in
// fetch-stats.mjs.

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- design tokens (GitHub Primer palette) -----------------------------

const THEMES = {
  dark: {
    canvas: '#0d1117',
    text: '#e6edf3',
    muted: '#8b949e',
    border: '#30363d',
    accent: '#58a6ff',
    green: '#3fb950'
  },
  light: {
    canvas: '#ffffff',
    text: '#1f2328',
    muted: '#656d76',
    border: '#d0d7de',
    accent: '#0969da',
    green: '#1a7f37'
  }
};

const FONT_STACK = `'Liberation Mono', 'DejaVu Sans Mono', 'Courier New', monospace`;

// Window content width, in characters, available to monospace grids/prose
// (measured against the container width + padding defined in baseCSS below).
const COLUMN_BUDGET = 92;

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- ls-style column-major grid layout ----------------------------------
// Mirrors how a real `ls` picks the widest column count that still fits the
// terminal width, filling down each column before moving to the next.

function layoutColumns(items, maxWidth, spacing = 2) {
  const maxCols = Math.min(items.length, 6) || 1;
  for (let numCols = maxCols; numCols >= 1; numCols--) {
    const numRows = Math.ceil(items.length / numCols);
    const colWidths = [];
    for (let c = 0; c < numCols; c++) {
      const slice = items.slice(c * numRows, (c + 1) * numRows);
      colWidths.push(Math.max(...slice.map(s => s.length)));
    }
    const totalWidth = colWidths.reduce((a, b) => a + b, 0) + spacing * (numCols - 1);
    if (totalWidth <= maxWidth || numCols === 1) {
      const rows = [];
      for (let r = 0; r < numRows; r++) {
        const cells = [];
        for (let c = 0; c < numCols; c++) {
          const idx = c * numRows + r;
          if (idx < items.length) {
            const isLastCol = c === numCols - 1;
            const cell = isLastCol ? items[idx] : items[idx].padEnd(colWidths[c] + spacing, ' ');
            cells.push(cell);
          }
        }
        rows.push(cells.join(''));
      }
      return rows;
    }
  }
  return items;
}

// ---- static content -------------------------------------------------

const PROMPT = 'PS C:\\Users\\rameen&gt;';

const NOTES = [
  ['right now', 'juggling Data Structures, OOP, and AI coursework at FAST-NUCES'],
  ['next up', 'actually understanding how CSP, A*, and genetic algorithms fit together, not just passing the assignment'],
  ['comfort zone', 'anywhere from breadboard logic gates to a Flask API'],
  ['happy to talk about', 'C++ data structures, SFML games, or building an LLM chatbot from scratch']
];

const STACK = {
  'languages/': ['C++', 'Python', 'Java', 'C#', 'JavaScript', 'TypeScript', 'x86 Assembly', 'HTML5', 'Markdown'],
  'frameworks-libraries/': ['Flask', 'SFML', 'JavaFX', 'Angular', 'NumPy', 'Pandas', 'Matplotlib', 'PyTorch', 'Scikit-learn'],
  'databases-hosting/': ['PostgreSQL', 'Oracle', 'SQLite', 'Netlify', 'Vercel', 'Windows Terminal'],
  'tools-design/': ['Figma', 'Canva', 'Git', 'GitHub']
};

function renderNotesHTML() {
  const labelWidth = Math.max(...NOTES.map(r => r[0].length));
  return NOTES.map(([label, value]) => {
    return `<div class="notes-row"><span class="notes-label">${esc(label.padEnd(labelWidth, ' '))}</span><span class="notes-value">${esc(value)}</span></div>`;
  }).join('');
}

function renderStackHTML() {
  const indent = '  ';
  return Object.entries(STACK).map(([label, tools]) => {
    const gridLines = layoutColumns(tools, COLUMN_BUDGET - indent.length);
    const gridHTML = gridLines.map(l => esc(indent + l)).join('\n');
    return `<span class="mut">${esc(label)}</span>\n<span class="txt">${gridHTML}</span>`;
  }).join('\n\n');
}

function renderStatsHTML(stats) {
  const rows = [
    ['commits', String(stats.commits)],
    ['best streak', `${stats.bestStreak} day${stats.bestStreak === 1 ? '' : 's'}`],
    ['current streak', `${stats.currentStreak} day${stats.currentStreak === 1 ? '' : 's'}`],
    ['account age', `${stats.accountAgeDays} days`]
  ];
  const rows2 = [
    ['top language', `${stats.topLanguage.name} (${stats.topLanguage.pct.toFixed(2)}%)`],
    ['most active day', `${stats.mostActiveDay.name} (${stats.mostActiveDay.pct}% of commits)`],
    ['peak hours', `${stats.peakHours.label} (${stats.peakHours.pct}%)`],
    ['shipping code', `${stats.shippingDays} days`]
  ];
  const labelW1 = Math.max(...rows.map(r => r[0].length)) + 1;
  const valW1 = Math.max(...rows.map(r => r[1].length));
  const labelW2 = Math.max(...rows2.map(r => r[0].length)) + 1;

  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const left = `<span class="mut">${esc((rows[i][0] + ':').padEnd(labelW1 + 1, ' '))}</span><span class="txt">${esc(rows[i][1].padEnd(valW1 + 3, ' '))}</span>`;
    const right = `<span class="mut">${esc((rows2[i][0] + ':').padEnd(labelW2 + 1, ' '))}</span><span class="txt">${esc(rows2[i][1])}</span>`;
    lines.push(left + right);
  }
  return lines.join('\n');
}

// ---- HTML/CSS ---------------------------------------------------------

function baseCSS(theme) {
  const c = THEMES[theme];
  return `
    * { margin:0; padding:0; box-sizing:border-box; }
    html,body { background:transparent; }
    body { font-family:${FONT_STACK}; }
    .window {
      width:960px;
      background:${c.canvas};
      border: 1px solid ${c.border};
      border-radius: 12px;
      overflow:hidden;
      color:${c.text};
    }
    .titlebar {
      width:960px;
      background:${c.canvas};
      border-bottom: 1px solid ${c.border};
      display:flex;
      align-items:center;
      justify-content:space-between;
      padding: 12px 18px;
      height: 48px;
    }
    .tb-left { display:flex; align-items:center; gap:12px; }
    .tb-icon {
      width:20px; height:20px;
      background:${c.accent};
      color:${c.canvas};
      border-radius:4px;
      display:flex; align-items:center; justify-content:center;
      font-family:${FONT_STACK};
      font-size:12px; font-weight:700;
      line-height:1;
    }
    .tb-title {
      font-family:${FONT_STACK};
      font-size:14px;
      color:${c.text};
      letter-spacing:0.2px;
    }
    .tb-controls { display:flex; align-items:center; gap:16px; }
    .tb-ctrl { display:flex; align-items:center; justify-content:center; width:14px; height:14px; }
    .tb-ctrl svg { display:block; }
    .body {
      width:960px;
      background:${c.canvas};
      padding: 20px 28px 26px 28px;
      font-family:${FONT_STACK};
      font-size:14px;
      line-height:20px;
    }
    pre {
      font-family:${FONT_STACK};
      font-size:14px;
      line-height:20px;
      white-space:pre;
      margin:0;
    }
    .row { margin-bottom: 13px; }
    .row:last-child { margin-bottom:0; }
    .prompt { color:${c.accent}; }
    .verb { color:${c.green}; }
    .args { color:${c.text}; }
    .out { margin-top:2px; }
    .txt { color:${c.text}; }
    .mut { color:${c.muted}; }
    .prose {
      color:${c.text};
      max-width: 900px;
      font-family:${FONT_STACK};
      font-size:14px;
      line-height:20px;
      margin-top:2px;
    }
    .notes-row { display:flex; font-family:${FONT_STACK}; font-size:14px; line-height:20px; }
    .notes-label { flex: 0 0 21ch; color:${c.muted}; }
    .notes-value { flex: 1 1 auto; color:${c.text}; white-space:normal; }
    .cursor { color:${c.text}; }
  `;
}

function ctrlIcon(kind, color) {
  if (kind === 'min') {
    return `<svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="9" x2="10" y2="9" stroke="${color}" stroke-width="1.2"/></svg>`;
  }
  if (kind === 'max') {
    return `<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="${color}" stroke-width="1.2"/></svg>`;
  }
  return `<svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="0" x2="10" y2="10" stroke="${color}" stroke-width="1.2"/><line x1="10" y1="0" x2="0" y2="10" stroke="${color}" stroke-width="1.2"/></svg>`;
}

function cmd(verb, args) {
  return `<span class="prompt">${PROMPT}</span> <span class="verb">${esc(verb)}</span>${args ? ' <span class="args">' + esc(args) + '</span>' : ''}`;
}

export function buildHtml(theme, stats) {
  const c = THEMES[theme];
  const stackHTML = renderStackHTML();
  const statsHTML = renderStatsHTML(stats);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${baseCSS(theme)}</style></head>
  <body>
    <div class="window">
    <div class="titlebar">
      <div class="tb-left">
        <div class="tb-icon">&gt;_</div>
        <div class="tb-title">rameen@github:&nbsp;~</div>
      </div>
      <div class="tb-controls">
        <div class="tb-ctrl">${ctrlIcon('min', c.muted)}</div>
        <div class="tb-ctrl">${ctrlIcon('max', c.muted)}</div>
        <div class="tb-ctrl">${ctrlIcon('close', c.muted)}</div>
      </div>
    </div>
    <div class="body">

      <div class="row">
        <div>${cmd('whoami')}</div>
        <div class="out">
          <pre><span class="txt">Rameen Fatima</span>
<span class="mut">Computer Science student &amp; builder</span></pre>
          <div class="prose">Computer Science student who likes building things end-to-end &mdash; AI simulations, custom data structures, OOP games, and a Mario clone in raw x86 Assembly.</div>
        </div>
      </div>

      <div class="row">
        <div>${cmd('cat', 'notes.txt')}</div>
        <div class="out">${renderNotesHTML()}</div>
      </div>

      <div class="row">
        <div>${cmd('cat', 'contact.txt')}</div>
        <div class="out"><pre><span class="mut">github    </span><span class="txt">github.com/rameenfatima325</span>
<span class="mut">linkedin  </span><span class="txt">linkedin.com/in/rameen-fatima-ba480a219</span></pre></div>
      </div>

      <div class="row">
        <div>${cmd('ls', 'stack/')}</div>
        <div class="out"><pre>${stackHTML}</pre></div>
      </div>

      <div class="row">
        <div>${cmd('.\\stats.ps1')}</div>
        <div class="out"><pre>${statsHTML}</pre></div>
      </div>

      <div class="row">
        <div><span class="prompt">${PROMPT}</span> <span class="cursor">&#9608;</span></div>
      </div>

    </div>
    </div>
  </body></html>`;
}

export async function renderToFiles(stats, outDir) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    await page.setViewportSize({ width: 1100, height: 2200 });
    const results = {};
    for (const theme of ['dark', 'light']) {
      await page.setContent(buildHtml(theme, stats), { waitUntil: 'networkidle' });
      await page.waitForTimeout(120);
      const winEl = await page.$('.window');
      const box = await winEl.boundingBox();
      const overflow = await page.evaluate(() => {
        const body = document.querySelector('.body');
        const bodyRect = body.getBoundingClientRect();
        const all = body.querySelectorAll('*');
        let maxRight = 0;
        all.forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.right > maxRight) maxRight = r.right;
        });
        return { bodyRight: bodyRect.right, maxRight };
      });
      const outPath = path.join(outDir, `terminal-${theme}.png`);
      await winEl.screenshot({ path: outPath });
      results[theme] = { box, overflow, outPath };
    }
    return results;
  } finally {
    await browser.close();
  }
}

// Allow `node render-terminal.mjs` for a quick local smoke test with
// placeholder numbers (does not touch the real GitHub API).
if (import.meta.url === `file://${process.argv[1]}`) {
  const placeholder = {
    commits: 42,
    bestStreak: 4,
    currentStreak: 1,
    topLanguage: { name: 'C++', pct: 52.98 },
    mostActiveDay: { name: 'Sunday', pct: 57 },
    peakHours: { label: 'late night, 9pm\u20135am', pct: 64 },
    accountAgeDays: 433,
    shippingDays: 136
  };
  const out = process.argv[2] || __dirname;
  const res = await renderToFiles(placeholder, out);
  console.log(JSON.stringify(res, null, 2));
}
