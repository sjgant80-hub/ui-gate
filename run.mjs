#!/usr/bin/env node
// ui-gate · run.mjs — point the gate at real pages. Fetch each URL, scan the served HTML with the
// gated kernel, print findings worst-first. The kernel is the proof; this is just the wire that
// carries a live page into it.
//
//   node run.mjs https://site/a https://site/b        # scan specific URLs
//   node run.mjs --estate 40                            # sample N live estate pages from the index
//   node run.mjs --file path/to/index.html             # scan a local file
//
// Sovereign-first: fetches the estate's own public Pages; the judgement is the deterministic kernel,
// no model in the loop.

import { readFileSync } from 'node:fs';
import { scanHtml } from './uigate.mjs';

const args = process.argv.slice(2);
const SEV = { high: '🔴', medium: '🟠', low: '🟡' };

async function scanUrl(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { url, error: `HTTP ${res.status}` };
    const html = await res.text();
    return { url, ...scanHtml(html) };
  } catch (e) { return { url, error: String(e.message || e) }; }
}

function report(r) {
  if (r.error) { console.log(`\n· ${r.url}\n    ✗ ${r.error}`); return { high: 0, medium: 0, low: 0, err: 1 }; }
  const by = { high: 0, medium: 0, low: 0 };
  r.findings.forEach((f) => { by[f.severity]++; });
  if (!r.count) { console.log(`\n✓ ${r.url}  — clean`); return { ...by, err: 0 }; }
  console.log(`\n· ${r.url}  — ${r.count} finding(s): ${by.high}🔴 ${by.medium}🟠 ${by.low}🟡`);
  for (const f of r.findings.slice(0, 12)) {
    console.log(`    ${SEV[f.severity]} [${f.kind}] ${f.why}`);
    if (f.evidence) console.log(`         ↳ ${f.evidence}`);
  }
  if (r.findings.length > 12) console.log(`    … and ${r.findings.length - 12} more`);
  return { ...by, err: 0 };
}

async function urlsFromEstate(n) {
  const idxPath = 'C:/Users/sjgan/.claude/projects/C--Users-sjgan--claude/memory/estate-index.json';
  const idx = JSON.parse(readFileSync(idxPath, 'utf8'));
  const live = idx.nodes.filter((x) => x && x.name && !x.private && x.live);
  // deterministic spread across the live set (every k-th), so a sample isn't just the alphabetical head
  const step = Math.max(1, Math.floor(live.length / n));
  const pick = [];
  for (let i = 0; i < live.length && pick.length < n; i += step) pick.push(live[i]);
  return pick.map((x) => x.url || `https://sjgant80-hub.github.io/${x.name}/`);
}

const urls = [];
if (args[0] === '--file') {
  const r = scanHtml(readFileSync(args[1], 'utf8'));
  report({ url: args[1], ...r });
  process.exit(0);
} else if (args[0] === '--estate') {
  urls.push(...(await urlsFromEstate(+args[1] || 40)));
} else {
  urls.push(...args);
}

if (!urls.length) { console.error('usage: run.mjs <url…> | --estate N | --file path'); process.exit(2); }

const totals = { high: 0, medium: 0, low: 0, err: 0, clean: 0, pages: urls.length };
const CONCURRENCY = 6;
for (let i = 0; i < urls.length; i += CONCURRENCY) {
  const batch = await Promise.all(urls.slice(i, i + CONCURRENCY).map(scanUrl));
  for (const r of batch) {
    const t = report(r);
    totals.high += t.high; totals.medium += t.medium; totals.low += t.low; totals.err += t.err;
    if (!t.err && !(t.high + t.medium + t.low)) totals.clean++;
  }
}
console.log(`\n${'─'.repeat(60)}\nSCANNED ${totals.pages} pages · ${totals.clean} clean · ${totals.err} unreachable`);
console.log(`FINDINGS: ${totals.high}🔴 high · ${totals.medium}🟠 medium · ${totals.low}🟡 low`);
