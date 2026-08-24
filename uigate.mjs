// ui-gate · uigate.mjs — the gate the LAST TWO passes earned.
//
// fallaccount and redress-engine both had a PROVEN kernel and an UN-WALKED user surface: an empty
// "load sample" demo, a badge that said "◊ DEAD", a stale tax-year label, a double full-stop in the
// letter. The witness gate never sees any of that — it proves the maths, not what a human hits. This
// is the gate for the SURFACE: the class of defect a user meets that a kernel gate is blind to.
//
// Pure and total: HTML string in, findings out, NEVER throws (a vulnerable page must not crash the
// gate). It reads static markup — it does not run the page — so it is a FIRST pass: it flags what is
// almost certainly wrong; a browser-walk still confirms. Deterministic, so it can be gated itself.

const S = (v) => (typeof v === 'string' ? v : '');

// ── extract the <script> bodies and the visible (non-script/style) text ───────────────────────────
function scripts(html) {
  const out = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m; while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function visibleText(html) {
  return S(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ');
}
export const clip = (s, n = 80) => { s = S(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };

// ── 1 · alarm literals a user should never see, in visible text OR injected by a script ───────────
// high = a broken value rendered as-is; medium = dev/placeholder text that shipped.
const ALARMS = [
  { re: /\[object Object\]/g, kind: 'alarm-literal', sev: 'high', why: '"[object Object]" — an object was string-concatenated instead of a field' },
  { re: /\bundefined\b/g, kind: 'alarm-literal', sev: 'high', why: '"undefined" rendered to the user — a missing value reached the DOM' },
  { re: /\bNaN\b/g, kind: 'alarm-literal', sev: 'high', why: '"NaN" — a number calculation failed and shipped the failure' },
  { re: /£\s*NaN|NaN\s*%|\$NaN/g, kind: 'alarm-literal', sev: 'high', why: 'a money/percent field computed NaN' },
  { re: /\bDEAD\b/g, kind: 'alarm-word', sev: 'medium', why: '"DEAD" shown to a user reads as broken (e.g. an unlicensed-tier badge)' },
  { re: /\b(TODO|FIXME|XXX|PLACEHOLDER|TBD|WIP)\b/g, kind: 'placeholder-text', sev: 'medium', why: 'dev placeholder text shipped to users' },
  { re: /lorem ipsum/gi, kind: 'placeholder-text', sev: 'medium', why: 'lorem-ipsum filler shipped' },
  { re: /[A-Za-z][.]{2}(?![.])/g, kind: 'punctuation', sev: 'low', why: 'a word followed by exactly two full stops ("..") — a template appended a stop to text that already ended in one (not an ellipsis)' },
];
function alarmFindings(html) {
  const out = [];
  const text = visibleText(html);
  const scriptText = scripts(html).join('\n');
  for (const a of ALARMS) {
    // visible text is the strong signal
    let m; a.re.lastIndex = 0;
    while ((m = a.re.exec(text))) {
      out.push({ kind: a.kind, severity: a.sev, why: a.why, evidence: clip(text.slice(Math.max(0, m.index - 30), m.index + 40)) });
    }
    // script string-literals that get assigned to what the user sees
    if (a.kind === 'alarm-word' || a.kind === 'alarm-literal') {
      // case-SENSITIVE and keep the word boundaries: "NaN" is an exact JS token, not the "nan"
      // inside "Tenant"; the alarm source is wrapped in (?:…) so its own alternation stays contained.
      const assignRe = new RegExp('(textContent|innerHTML|innerText|placeholder|value)\\s*[=:]\\s*[`\'"][^`\'"]*?(?:' + a.re.source + ')[^`\'"]*?[`\'"]', 'g');
      let s; while ((s = assignRe.exec(scriptText))) {
        out.push({ kind: a.kind, severity: a.sev, why: a.why + ' (assigned to the DOM in a script)', evidence: clip(s[0]) });
      }
    }
  }
  return out;
}

// ── 2 · dead controls: an on*-handler calling a function the page never defines ───────────────────
function deadControls(html) {
  const out = [];
  const scriptText = scripts(html).join('\n');
  const handlers = new Set();
  const hre = /\bon\w+\s*=\s*"([^"]*)"|\bon\w+\s*=\s*'([^']*)'/g;
  let h; while ((h = hre.exec(html))) {
    const code = h[1] || h[2] || '';
    const cre = /([A-Za-z_$][\w$]*)\s*\(/g; let c;
    while ((c = cre.exec(code))) {
      const fn = c[1];
      // a method call (obj.fn() / this.fn()) is not a page-defined global — skip it
      if (code[c.index - 1] === '.') continue;
      // skip language keywords and builtins that are never page-defined globals
      if (/^(if|for|while|return|typeof|new|this|event|alert|confirm|prompt|console|parseInt|parseFloat|Number|String|Boolean|Array|Object|JSON|Math|Date|window|document|location|history|setTimeout|setInterval)$/.test(fn)) continue;
      handlers.add(fn);
    }
  }
  for (const fn of handlers) {
    const def = new RegExp(
      '(function\\s+' + fn + '\\b)|' +
      '\\b' + fn + '\\s*[=:]\\s*(function|\\([^)]*\\)\\s*=>|async)|' +
      '\\b(const|let|var)\\s+' + fn + '\\b|' +
      'window\\.' + fn + '\\s*=|' +
      '\\b' + fn + '\\s*\\([^)]*\\)\\s*\\{'   // method-style definition
    );
    if (!def.test(scriptText)) {
      out.push({ kind: 'dead-control', severity: 'medium', why: `a control calls ${fn}() but no INLINE script defines it — likely a dead button (unless it lives in an external .js)`, evidence: fn + '()' });
    }
  }
  return out;
}

// ── 3 · inconsistent year labels (the fallaccount tax-year bug) ───────────────────────────────────
function yearConsistency(html) {
  const text = visibleText(html);
  const years = new Set();
  let m; const re = /\b(20\d\d)\s*[\/–-]\s*(\d\d)\b/g;
  while ((m = re.exec(text))) years.add(m[1] + '-' + m[2]);
  if (years.size > 1) {
    return [{ kind: 'inconsistent-year', severity: 'medium', why: 'the page shows more than one tax-year label — at most one is current', evidence: [...years].join(' vs ') }];
  }
  return [];
}

// ── 4 · undefined CSS custom properties (used but never defined) ──────────────────────────────────
function cssVars(html) {
  const defined = new Set(); let m;
  const dre = /(--[\w-]+)\s*:/g; while ((m = dre.exec(html))) defined.add(m[1]);
  const used = new Set();
  const ure = /var\(\s*(--[\w-]+)/g; while ((m = ure.exec(html))) used.add(m[1]);
  const out = [];
  for (const v of used) if (!defined.has(v)) out.push({ kind: 'undefined-css-var', severity: 'medium', why: `CSS var ${v} is used but never defined — it silently falls back to nothing`, evidence: `var(${v})` });
  return out;
}

// ── 5 · placeholder / dead links ──────────────────────────────────────────────────────────────────
function deadLinks(html) {
  const out = []; let m;
  const re = /<a\b[^>]*\bhref\s*=\s*("|')(.*?)\1[^>]*>(.*?)<\/a>/gis;
  while ((m = re.exec(html))) {
    const href = S(m[2]).trim();
    if (href === '' || href === '#' || /^javascript:\s*void/i.test(href) || /^(TODO|TBD|#)$/i.test(href)) {
      // '#' with an id target elsewhere is fine only if it's an in-page anchor the page uses; a bare '#' is a dead link
      const label = clip(m[3].replace(/<[^>]+>/g, ''), 40);
      out.push({ kind: 'dead-link', severity: 'low', why: `a link labelled "${label}" points nowhere (href="${href || '(empty)'}")`, evidence: href || '(empty)' });
    }
  }
  return out;
}

const RANK = { high: 0, medium: 1, low: 2 };

/** Scan one page's HTML. Returns { ok, count, findings[] } sorted worst-first. Never throws. */
export function scanHtml(html) {
  try {
    const src = S(html);
    if (!src.trim()) return { ok: true, count: 0, findings: [] };
    const findings = [
      ...alarmFindings(src), ...deadControls(src), ...yearConsistency(src), ...cssVars(src), ...deadLinks(src),
    ];
    findings.sort((a, b) => (RANK[a.severity] - RANK[b.severity]) || a.kind.localeCompare(b.kind));
    return { ok: findings.length === 0, count: findings.length, findings };
  } catch {
    return { ok: true, count: 0, findings: [], note: 'scan aborted safely' };
  }
}

export default scanHtml;
