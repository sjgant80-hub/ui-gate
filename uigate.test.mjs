// ui-gate · uigate.test.mjs — every rule falsifiable: a known-bad page trips exactly the finding it
// should, a clean page trips nothing, and no input crashes the scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanHtml, clip } from './uigate.mjs';

const kinds = (r) => r.findings.map((f) => f.kind);
const has = (r, k) => r.findings.some((f) => f.kind === k);

test('ALARM LITERALS — [object Object], undefined, NaN, £NaN in visible text are caught (high)', () => {
  assert.ok(has(scanHtml('<p>Total: [object Object]</p>'), 'alarm-literal'));
  assert.ok(has(scanHtml('<div>Name: undefined</div>'), 'alarm-literal'));
  assert.ok(has(scanHtml('<span>Tax: £NaN</span>'), 'alarm-literal'));
  assert.equal(scanHtml('<p>Total: [object Object]</p>').findings[0].severity, 'high');
});

test('THE "DEAD" BADGE — an alarm word injected by a script is caught (the fallaccount badge)', () => {
  const html = `<body><script>el.textContent = '◊ DEAD';</script></body>`;
  const r = scanHtml(html);
  assert.ok(has(r, 'alarm-word'), 'must flag DEAD assigned to the DOM');
  // and the FIXED version (FREE) trips nothing
  assert.ok(!has(scanHtml(`<script>el.textContent='◊ FREE';</script>`), 'alarm-word'));
});

test('DOUBLE FULL-STOP — the redress-engine letter bug is caught, but a real ellipsis is not', () => {
  assert.ok(has(scanHtml('<p>you have not..</p>'), 'punctuation'));
  assert.ok(!has(scanHtml('<p>Loading…</p><p>Categorising...</p>'), 'punctuation'), 'a 3-dot ellipsis is legitimate');
});

test('DEAD CONTROL — a handler with no inline definition is flagged; a defined one is not', () => {
  const dead = `<button onclick="doThing()">Go</button><script>function other(){}</script>`;
  assert.ok(has(scanHtml(dead), 'dead-control'));
  const live = `<button onclick="save()">Save</button><script>function save(){return 1}</script>`;
  assert.ok(!has(scanHtml(live), 'dead-control'), 'a defined handler must not be flagged');
  const arrow = `<button onclick="go()">x</button><script>const go = () => 1;</script>`;
  assert.ok(!has(scanHtml(arrow), 'dead-control'), 'arrow-function definitions count');
  // builtins in a handler are never "dead"
  assert.ok(!has(scanHtml(`<a onclick="window.print()">print</a>`), 'dead-control'));
});

test('NO DEAD CONTROL from prose inside a string argument', () => {
  // the fallseed-law false positive: "courses (fire safety…)" lived inside usePrompt('…')
  const html = `<button onclick="usePrompt('training register — which courses (fire safety, GDPR) done')">x</button>
    <script>function usePrompt(){}</script>`;
  const r = scanHtml(html);
  assert.ok(!has(r, 'dead-control'), '"courses(" inside a string arg is not a function call');
});

test('NO DEAD CONTROL for $() — a fn name that is a regex metachar must be escaped', () => {
  // the fallclaim false positive: "$" is defined but "\\b$" was read as an end-anchor
  const html = `<button onclick="$('x').focus()">y</button><script>const $ = (s) => document.querySelector(s);</script>`;
  assert.ok(!has(scanHtml(html), 'dead-control'), '$ is defined; the name must be regex-escaped');
});

test('INCONSISTENT YEAR — two different tax-year labels on one page (the fallaccount bug)', () => {
  assert.ok(has(scanHtml('<h1>Tax 2025-26</h1><p>rates 2026/27</p>'), 'inconsistent-year'));
  assert.ok(!has(scanHtml('<h1>Tax 2026/27</h1><p>for 2026/27 only</p>'), 'inconsistent-year'), 'one consistent year is fine');
});

test('UNDEFINED CSS VAR — used but never defined is flagged; a defined one is not', () => {
  assert.ok(has(scanHtml('<div style="color:var(--ghost)">x</div>'), 'undefined-css-var'));
  assert.ok(!has(scanHtml('<style>:root{--ink:#111}</style><div style="color:var(--ink)">x</div>'), 'undefined-css-var'));
});

test('DEAD LINK — href="#", empty, or javascript:void points nowhere', () => {
  assert.ok(has(scanHtml('<a href="#">Click</a>'), 'dead-link'));
  assert.ok(has(scanHtml('<a href="">Click</a>'), 'dead-link'));
  assert.ok(has(scanHtml('<a href="javascript:void(0)">Click</a>'), 'dead-link'));
  assert.ok(!has(scanHtml('<a href="https://gov.uk">GOV.UK</a>'), 'dead-link'));
  // an anchor wired to JS is an intentional control, not a dead link — handler before OR after href
  assert.ok(!has(scanHtml('<a href="#" onclick="openMenu()">Menu</a>'), 'dead-link'));
  assert.ok(!has(scanHtml('<a onclick="openMenu()" href="#">Menu</a>'), 'dead-link'), 'handler before href counts too');
  assert.ok(!has(scanHtml('<a href="#" role="button">Toggle</a>'), 'dead-link'));
});

test('A CLEAN PAGE TRIPS NOTHING — no false positives on a well-formed page', () => {
  const clean = `<!doctype html><html><head><style>:root{--ink:#111;--bg:#fff}</style></head>
    <body style="color:var(--ink);background:var(--bg)">
      <h1>Council Tax 2026/27</h1>
      <p>Your estimate is ready. Review it, then send.</p>
      <a href="https://www.gov.uk/council-tax">GOV.UK guidance</a>
      <button onclick="generate()">Generate</button>
      <p>Loading…</p>
      <script>function generate(){ return true; } window.helper = function(){};</script>
    </body></html>`;
  const r = scanHtml(clean);
  assert.equal(r.ok, true, 'clean page must be ok; got: ' + JSON.stringify(kinds(r)));
  assert.equal(r.count, 0);
});

test('SORTED WORST-FIRST — high severity findings come before low', () => {
  const r = scanHtml('<p>x..</p><div>£NaN</div>');  // low (punct) + high (NaN)
  assert.equal(r.findings[0].severity, 'high');
});

test('SCRIPT-LITERAL SCANNING IS LIMITED TO alarm words/literals — not punctuation', () => {
  // "ok.." assigned in a script must NOT be flagged (punctuation only scans VISIBLE text);
  // only DEAD/undefined/NaN-class words are chased into script DOM-assignments.
  const r = scanHtml(`<body>fine text</body><script>x.textContent='ok..'</script>`);
  assert.ok(!has(r, 'punctuation'), 'a double-stop inside a script string is not a shipped user-visible defect');
});

test('UNCLOSED TRAILING SCRIPT — its defs are seen and its code does not leak as visible text', () => {
  // a single-file page whose last <script> has no </script> (browser auto-closes at EOF).
  const html = `<button onclick="openModal()">x</button>
<script>
function openModal(){ return typeof window !== 'undefined'; }
</script>
<script>
'use strict';
function boot(){ const k = cond ? undefined : 'id'; return k; }
<button onclick="boot()">go</button>`;   // note: no closing </script> — runs to EOF
  const r = scanHtml(html);
  assert.ok(!has(r, 'dead-control'), 'openModal/boot are defined in the (unclosed) script — not dead');
  assert.ok(!has(r, 'alarm-literal'), '"undefined" inside the script code is not user-visible text');
});

test('NO FALSE NaN — "NaN" must not match the "nan" inside ordinary words like Tenant', () => {
  // the bug the estate scan caught: a case-insensitive script-scan flagged placeholder="Tenant…"
  const r = scanHtml(`<body>ok</body><script>x.innerHTML = '<input placeholder="Tenant full name">';</script>`);
  assert.ok(!has(r, 'alarm-literal'), '"Tenant"/"banana" contain "nan" but are not the token NaN');
  // a REAL NaN token in a DOM assignment still fires
  assert.ok(has(scanHtml(`<script>el.textContent = 'Total £NaN';</script>`), 'alarm-literal'));
});

test('DEAD CONTROL works for SINGLE-QUOTE handlers too', () => {
  const r = scanHtml(`<button onclick='ghost()'>x</button><script>function other(){}</script>`);
  assert.ok(has(r, 'dead-control'), "onclick='...' (single-quoted) must be checked, not just double");
});

test('DEAD LINK evidence names the empty href explicitly', () => {
  const r = scanHtml('<a href="">Go</a>');
  const f = r.findings.find((x) => x.kind === 'dead-link');
  assert.equal(f.evidence, '(empty)');
  assert.match(f.why, /\(empty\)/);
});

test('SORT ORDERS BY SEVERITY even when it disagrees with alphabetical kind', () => {
  // inconsistent-year is MEDIUM (kind starts "i"); dead-link is LOW (kind starts "d").
  // severity says year first; alphabetical would say dead-link first. Severity must win.
  const r = scanHtml('<h1>2025-26</h1><p>2026/27</p><a href="#">nowhere</a>');
  assert.equal(r.findings[0].kind, 'inconsistent-year', 'medium must sort before low regardless of kind name');
});

test('CLIP truncates only past the limit — a string exactly at the limit keeps no ellipsis', () => {
  assert.equal(clip('x'.repeat(80), 80), 'x'.repeat(80), 'exactly n chars: unchanged, no ellipsis');
  assert.equal(clip('x'.repeat(81), 80), 'x'.repeat(80) + '…', 'past n: truncated with ellipsis');
});

test('FUZZ — never throws on garbage', () => {
  for (const g of [null, undefined, 7, {}, [], '', '   ', '<html', '<script>'.repeat(1000), '<'.repeat(5000)]) {
    const r = scanHtml(g);
    assert.equal(typeof r.ok, 'boolean');
    assert.ok(Array.isArray(r.findings));
  }
});
