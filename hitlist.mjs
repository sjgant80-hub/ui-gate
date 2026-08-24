#!/usr/bin/env node
// hitlist.mjs — turn a run.mjs scan log into a grouped hit-list: per-kind tallies, the pages that
// have each defect, and a worst-first page ranking. Reads the log path from argv[2].
import { readFileSync } from 'node:fs';

const log = readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const pages = [];       // { url, high, med, low, findings: [{sev,kind,why}] }
let cur = null;
const nameOf = (u) => (u.match(/github\.io\/([^/]+)/) || [, u])[1];

for (const line of log) {
  let m;
  if ((m = line.match(/^[·✓]\s+(https?:\/\/\S+)\s+—\s+(clean|(\d+) finding)/))) {
    cur = { url: m[1].replace(/\/$/, ''), name: nameOf(m[1]), findings: [] };
    pages.push(cur);
  } else if (cur && (m = line.match(/^\s+[🔴🟠🟡]\s+\[([a-z-]+)\]\s+(.*)$/u))) {
    const sev = line.includes('🔴') ? 'high' : line.includes('🟠') ? 'medium' : 'low';
    cur.findings.push({ sev, kind: m[1], why: m[2] });
  }
}

const flagged = pages.filter((p) => p.findings.length);
const byKind = {};
for (const p of flagged) for (const f of p.findings) (byKind[f.kind] ||= new Set()).add(p.name);

const RANK = { high: 0, medium: 1, low: 2 };
const worst = (p) => Math.min(...p.findings.map((f) => RANK[f.sev]));
flagged.sort((a, b) => worst(a) - worst(b) || b.findings.length - a.findings.length || a.name.localeCompare(b.name));

console.log(`# ui-gate estate hit-list\n`);
console.log(`Scanned ${pages.length} live pages · ${pages.length - flagged.length} clean · ${flagged.length} flagged\n`);

console.log(`## By defect kind\n`);
for (const [kind, set] of Object.entries(byKind).sort((a, b) => b[1].size - a[1].size)) {
  console.log(`- **${kind}** — ${set.size} page(s): ${[...set].sort().join(', ')}`);
}

console.log(`\n## Every flagged page (worst-first)\n`);
for (const p of flagged) {
  const t = { high: 0, medium: 0, low: 0 }; p.findings.forEach((f) => t[f.sev]++);
  console.log(`### ${p.name}  —  ${t.high}🔴 ${t.medium}🟠 ${t.low}🟡`);
  console.log(`  ${p.url}/`);
  for (const f of p.findings) console.log(`  - ${f.sev === 'high' ? '🔴' : f.sev === 'medium' ? '🟠' : '🟡'} [${f.kind}] ${f.why}`);
  console.log('');
}
