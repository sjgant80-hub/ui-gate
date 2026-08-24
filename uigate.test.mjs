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
  // "DEAD" as legitimate content (a rubric grade, "dead code") is NOT the badge — only "◊ DEAD" is
  assert.ok(!has(scanHtml('<td class="mono">DEAD</td><p>an UNASSESSABLE or DEAD finding</p>'), 'alarm-word'));
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

test('UNREACHABLE CONTROL — a fn defined ONLY inside a module is module-scoped, not global', () => {
  // fallbookspaper's class: the app is a <script type="module">, so inline onclick can't reach it
  const modOnly = `<button onclick="openThing()">x</button><script type="module">function openThing(){ return 1; }</script>`;
  const r = scanHtml(modOnly);
  assert.ok(has(r, 'unreachable-control'), 'module-scoped fn must be flagged unreachable, not clean');
  assert.ok(!has(r, 'dead-control'), 'it IS defined — just unreachable, not dead');
});

test('A MODULE FN EXPOSED VIA window IS reachable; a CLASSIC-script fn is reachable', () => {
  const exposed = `<button onclick="openThing()">x</button><script type="module">function openThing(){}; window.openThing = openThing;</script>`;
  assert.ok(!has(scanHtml(exposed), 'unreachable-control'), 'window.fn = exposes it to global');
  const classic = `<button onclick="openThing()">x</button><script>function openThing(){}</script>`;
  assert.ok(!has(scanHtml(classic), 'unreachable-control'), 'a classic top-level fn is global');
  assert.ok(!has(scanHtml(classic), 'dead-control'));
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

test('INCONSISTENT YEAR — two conflicting tax-year labels, but not dates or a multi-year series', () => {
  assert.ok(has(scanHtml('<h1>Tax 2025-26</h1><p>rates 2026/27</p>'), 'inconsistent-year'), 'the fallaccount bug: two current-year claims');
  assert.ok(!has(scanHtml('<h1>Tax 2026/27</h1><p>for 2026/27 only</p>'), 'inconsistent-year'), 'one consistent year is fine');
  assert.ok(!has(scanHtml('<p>records 2023-06, 2020-03, 2023-01</p>'), 'inconsistent-year'), 'dates (non-consecutive) are not tax years');
  assert.ok(!has(scanHtml('<p>2016-17 2022-23 2023-24 2024-25 2025-26</p>'), 'inconsistent-year'), 'a multi-year data series is intentional, not a mislabel');
});

test('PLACEHOLDER TEXT — a standalone marker fires, a hyphenated word does not', () => {
  assert.ok(has(scanHtml('<p>TODO: wire this up</p>'), 'placeholder-text'));
  assert.ok(has(scanHtml('<p>lorem ipsum dolor sit amet</p>'), 'placeholder-text'));
  assert.ok(!has(scanHtml('<p>quality = fraction of non-TODO lines</p>'), 'placeholder-text'), '"non-TODO" is prose about TODOs, not a placeholder');
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

test('CODE SAMPLES are not defects — undefined/NaN/[object Object] inside <pre>/<code> is example text', () => {
  assert.ok(!has(scanHtml('<pre>if (typeof x !== "undefined") return NaN;</pre>'), 'alarm-literal'));
  assert.ok(!has(scanHtml('<p>hashing avoids <code>[object Object]</code> collisions</p>'), 'alarm-literal'));
  // but a real broken value in ordinary prose still fires
  assert.ok(has(scanHtml('<p>Welcome back, undefined!</p>'), 'alarm-literal'));
  // a FULLY-QUOTED mention is discussion, not a rendered value — all three quote styles
  assert.ok(!has(scanHtml('<p>flattens to "[object Object]" here</p>'), 'alarm-literal'), 'double-quoted mention skipped');
  assert.ok(!has(scanHtml("<p>flattens to '[object Object]' here</p>"), 'alarm-literal'), 'single-quoted mention skipped');
  assert.ok(!has(scanHtml('<p>flattens to `[object Object]` here</p>'), 'alarm-literal'), 'backtick mention skipped');
  // only ONE side quoted is NOT a mention — a real render can be adjacent to a quote
  assert.ok(has(scanHtml('<p>Total: [object Object]"</p>'), 'alarm-literal'), 'one-sided quote still fires');
  assert.ok(has(scanHtml('<p>Total: [object Object]</p>'), 'alarm-literal'), 'bare (unquoted) still fires');
});

test('TEMPLATE CONDITIONALS are not shipped broken values — value="${x!==undefined?…}"', () => {
  const r = scanHtml(`<script>const h = '<input value="' + (a!==undefined?a:1) + '">'; el.value = undefined;</script>`);
  assert.ok(!has(r, 'alarm-literal'), 'value= and template logic are not a rendered undefined');
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
