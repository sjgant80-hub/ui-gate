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
  const re = /<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m; while ((m = re.exec(html))) out.push(m[1]);
  // a single-file page often ends with an UNCLOSED <script> (browser auto-closes at EOF);
  // capture that trailing block too, or its code is invisible to every script-based check.
  const tail = html.replace(re, '').match(/<script\b[^>]*>([\s\S]*)$/i);
  if (tail) out.push(tail[1]);
  return out;
}
function visibleText(html) {
  return S(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<script\b[^>]*>[\s\S]*$/i, ' ')   // an unclosed trailing script → strip to EOF, not into "visible" text
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    // code samples legitimately CONTAIN undefined/NaN/[object Object] as example text — not defects
    .replace(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi, ' ')
    .replace(/<code\b[^>]*>[\s\S]*?<\/code\s*>/gi, ' ')
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
  { re: /◊\s*DEAD\b/g, kind: 'alarm-word', sev: 'medium', why: 'the "◊ DEAD" tier badge reads as broken to a user (relabel the unlicensed tier to FREE)' },
  { re: /(?<![\w-])(TODO|FIXME|XXX|PLACEHOLDER|TBD|WIP)(?![\w-])/g, kind: 'placeholder-text', sev: 'medium', why: 'dev placeholder text shipped to users' },
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
      // a fully quoted token ("[object Object]", "undefined") is the page DISCUSSING it, not rendering
      // it — a real broken render is bare (Total: [object Object]). Skip the quoted mention.
      const QUOTES = ['"', "'", '`'];
      if (QUOTES.includes(text[m.index - 1]) && QUOTES.includes(text[m.index + m[0].length])) continue;
      out.push({ kind: a.kind, severity: a.sev, why: a.why, evidence: clip(text.slice(Math.max(0, m.index - 30), m.index + 40)) });
    }
    // script string-literals that get assigned to what the user sees
    if (a.kind === 'alarm-word' || a.kind === 'alarm-literal') {
      // case-SENSITIVE and keep the word boundaries: "NaN" is an exact JS token, not the "nan"
      // inside "Tenant"; the alarm source is wrapped in (?:…) so its own alternation stays contained.
      // only the unambiguous render sinks — value/placeholder catch template conditionals like
      // value="${x!==undefined?x:1}", which are logic, not a shipped broken value.
      const assignRe = new RegExp('(textContent|innerHTML|innerText)\\s*[=:]\\s*[`\'"][^`\'"]*?(?:' + a.re.source + ')[^`\'"]*?[`\'"]', 'g');
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
  // An inline onclick runs in GLOBAL scope, so it can only reach a function that is global: a top-level
  // declaration in a CLASSIC <script>, or one assigned to window/globalThis. A function defined only
  // inside <script type="module"> is module-scoped and unreachable — "defined" but still a dead button.
  // So split the scripts by type; the def patterns are specific enough that prose can't false-match them.
  const whole = S(html);
  let classicJs = '', moduleJs = '';
  const sre = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi; let sm;
  while ((sm = sre.exec(whole))) { if (/\btype\s*=\s*["']?module/i.test(sm[1])) moduleJs += '\n' + sm[2]; else classicJs += '\n' + sm[2]; }
  const tail = whole.replace(sre, ' ').match(/<script\b([^>]*)>([\s\S]*)$/i);   // unclosed trailing script
  if (tail) { if (/\btype\s*=\s*["']?module/i.test(tail[1])) moduleJs += '\n' + tail[2]; else classicJs += '\n' + tail[2]; }
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // fn names can contain $ — escape before RegExp
  const handlers = new Set();
  const hre = /\bon\w+\s*=\s*"([^"]*)"|\bon\w+\s*=\s*'([^']*)'/g;
  let h; while ((h = hre.exec(html))) {
    const raw = h[1] || h[2] || '';
    // strip string literals FIRST: prose inside a string arg (usePrompt('…which courses (fire…)'))
    // is not a function call. Only tokens outside quotes are real calls.
    const code = raw.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``');
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
    const e = reEsc(fn);
    // identifier-aware boundaries: JS identifier chars are [\w$], so \b breaks on names like "$".
    const NB = '(?<![\\w$])', NA = '(?![\\w$])';
    const def = new RegExp(
      'function\\s+' + e + NA + '|' +
      NB + e + '\\s*[=:]\\s*(function|\\([^)]*\\)\\s*=>|async)|' +
      '(const|let|var)\\s+' + e + NA + '|' +
      NB + e + '\\s*\\([^)]*\\)\\s*\\{'   // method-style definition
    );
    const onWindow = new RegExp('(window|globalThis)\\.' + e + '\\s*=').test(whole);
    if (onWindow || def.test(classicJs)) continue;                 // global — reachable from inline onclick
    if (def.test(moduleJs)) {
      out.push({ kind: 'unreachable-control', severity: 'medium', why: `a control calls ${fn}() but it is defined ONLY inside a <script type="module"> — module scope, so an inline onclick cannot reach it (expose it via window.${fn} or move it to a classic script)`, evidence: fn + '()' });
    } else {
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
  while ((m = re.exec(text))) {
    // only REAL consecutive tax-year labels (2025-26, 2026-27) — not dates like 2023-06 or versions
    if (+m[2] === (+m[1] % 100 + 1) % 100) years.add(m[1] + '-' + m[2]);
  }
  // exactly two distinct current-year claims = a likely mislabel; 3+ is an intentional series (history/table)
  if (years.size === 2) {
    return [{ kind: 'inconsistent-year', severity: 'medium', why: 'the page shows two different tax-year labels — at most one is current', evidence: [...years].join(' vs ') }];
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
  const re = /<a\b([^>]*)\bhref\s*=\s*("|')(.*?)\2([^>]*)>(.*?)<\/a>/gis;
  while ((m = re.exec(html))) {
    const attrs = (m[1] || '') + (m[4] || '');
    const href = S(m[3]).trim();
    // an anchor wired to JS (onclick/onmousedown/role=button) is an intentional control, not a dead link
    if (/\bon\w+\s*=/i.test(attrs) || /\brole\s*=\s*["']?button/i.test(attrs)) continue;
    if (href === '' || href === '#' || /^javascript:\s*void/i.test(href) || /^(TODO|TBD)$/i.test(href)) {
      const label = clip(m[5].replace(/<[^>]+>/g, ''), 40);
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
