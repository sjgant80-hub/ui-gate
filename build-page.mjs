#!/usr/bin/env node
// ui-gate · build-page.mjs — inline the gated kernel (uigate.mjs) into index.html between the markers,
// exposing window.UIGATE. CI diffs the rebuild, so the page's scanner cannot drift from the tested one.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const kernel = readFileSync(join(here, 'uigate.mjs'), 'utf8')
  .replace(/^export default .*$/m, '')
  .replace(/^export /gm, '');

if (/<\/script/i.test(kernel)) { console.error('REFUSED: kernel contains </script'); process.exit(1); }

const block = `/*__KERNEL_START__*/
(function(){
${kernel.trim()}
window.UIGATE = { scanHtml, clip };
})();
/*__KERNEL_END__*/`;

const htmlPath = join(here, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const re = /\/\*__KERNEL_START__\*\/[\s\S]*?\/\*__KERNEL_END__\*\//;
if (!re.test(html)) { console.error('REFUSED: markers not found in index.html'); process.exit(1); }
// replacement FUNCTION, not string: the kernel contains "$&" (in reEsc) which String.replace would
// otherwise expand as the matched text — a $-substitution footgun that made the build non-idempotent.
writeFileSync(htmlPath, html.replace(re, () => block));
console.log(`inlined ${(kernel.length / 1024).toFixed(1)}KB kernel into index.html`);
