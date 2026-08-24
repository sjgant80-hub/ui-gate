// dog-food check: the broken fixture MUST trip findings, the clean one MUST be clean.
// Run in CI so ui-gate cannot silently stop catching its own reference defects.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanHtml } from '../uigate.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const scan = (f) => scanHtml(readFileSync(join(here, 'fixtures', f), 'utf8'));

const broken = scan('broken.html');
const clean = scan('clean.html');
let fail = false;

if (broken.count < 4) { console.error(`✗ broken.html tripped only ${broken.count} findings — expected the full spread`); fail = true; }
else console.log(`✓ broken.html → ${broken.count} findings (${broken.findings.map(f => f.kind).join(', ')})`);

if (!clean.ok) { console.error(`✗ clean.html is NOT clean: ${clean.findings.map(f => f.kind).join(', ')}`); fail = true; }
else console.log('✓ clean.html → clean');

process.exit(fail ? 1 : 0);
