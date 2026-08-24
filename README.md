# ui-gate

### ▶ Live: **https://sjgant80-hub.github.io/ui-gate/** — paste a page's HTML, get its user-surface defects.

**The gate for the _surface_.** A kernel gate (witness, proof-of-play) proves the *maths*. ui-gate
catches what a **user** hits and a kernel gate never sees: a value that shipped as `undefined` or
`NaN`, a badge that says `DEAD`, a button wired to a function that doesn't exist, a CSS variable used
but never defined, a link that points nowhere, two different tax-year labels on one page.

It exists because two hand-walked audits in a row found the same thing — **a proven kernel behind an
un-walked surface.** `fallaccount` had a gated pence-exact tax engine and a "load sample" button that
left the dashboard empty, a badge reading `◊ DEAD`, and a stale year label. `redress-engine` had a
mutation-clean legal kernel and a letter that printed `you have not..`. None of it is anything a
kernel gate can catch. So this is the gate for that class.

## What it flags

| kind | severity | what it means |
|---|---|---|
| `alarm-literal` | 🔴 | `[object Object]`, `undefined`, `NaN`, `£NaN` reached the DOM — a broken value shipped |
| `alarm-word` | 🟠 | `DEAD` shown to a user (e.g. an unlicensed-tier badge) reads as *broken* |
| `dead-control` | 🟠 | an `onclick` calls a function no inline script defines — the button does nothing |
| `inconsistent-year` | 🟠 | more than one tax-year label on the page — at most one is current |
| `undefined-css-var` | 🟠 | `var(--x)` used but `--x` never defined — it silently falls back to nothing |
| `placeholder-text` | 🟠 | `TODO` / `lorem ipsum` / `PLACEHOLDER` shipped |
| `dead-link` | 🟡 | `href="#"`, empty, or `javascript:void` — points nowhere |
| `punctuation` | 🟡 | a word followed by `..` — a template appended a stop to text that already had one |

## Use it

```bash
node run.mjs https://example.com/page          # scan live URLs
node run.mjs --file path/to/index.html         # scan a local file
node run.mjs --estate 50                        # sample N live estate pages from the index
npm test                                        # the kernel's falsifiable examples
```

Or open the live page and paste HTML.

## Honest limits

ui-gate reads **static markup — it does not run the page.** So it is a **first pass**: it flags what is
almost certainly wrong, not everything. A value only broken at runtime can slip past; a function
defined in an **external `.js`** can be over-reported as a dead control. A browser-walk still confirms.
It is **case-sensitive and word-bounded** on purpose — `NaN` is the JS token, never the "nan" inside
"Tenant" (a real false positive that this fix closed).

## The gate is itself gated

`uigate.mjs` is the pure kernel — HTML in, findings out, never throws. It is **witness-gated: 19/19
mutants killed, zero baselines**, and CI diffs the kernel inlined into the live page against the
source, so the page's scanner cannot drift from the tested one. The gate that judges other pages is
held to the same bar it applies.

Not affiliated with any site it scans. MIT.
