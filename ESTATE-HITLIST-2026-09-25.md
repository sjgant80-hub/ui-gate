# ui-gate — estate pass 2026-09-25 (Kar's UI gate pass)

**Scan:** all **502 live public pages** from the estate index, fetched live (cache-busted), scanned with
the deterministic `uigate.mjs` kernel (self-gate 24/24 here). **483 clean · 0 unreachable · 19 flagged ·
48 raw findings (1🔴 · 29🟠 · 18🟡).**

**Every finding below was verified against the raw HTML** — the gate's own first law is *a tool that cries
wolf is worse than none; the tool's output is never proof*. That verification split the 48 raw findings
into **genuine defects** and **false positives (kernel gaps)**. It also caught a misclassification in the
*verifier itself* (a greedy "is-this-a-code-sample" heuristic wrongly excused fallestate's `--mono`/`--sage`;
the tighter check proved them real) — the auditor is not exempt.

---

## GENUINE — undefined CSS-var palettes (colours silently fall back to nothing)

A `var(--x)` used in real CSS/inline style where `--x` is **never defined** (`def=0`, confirmed). The
element renders with a missing colour/size — a real, user-visible degradation.

| Page | Undefined vars (use-count) | Note |
|---|---|---|
| **fallmarket** | `--brass`×7, `--ink`×4, `--dim`×5, `--panel`, `--border`×3, `--radius`, `--green`×2 | **Defines ZERO css vars** — the entire palette is missing. Flagged 2026-08-24, still broken. |
| **fallforge** | `--forge`×11, `--cream`×4, `--good`×3 | The suite hub page. |
| **fallestate** | `--mono`×2, `--sage`×2, `--sage-bright`, `--dim` | Real inline styles on `<code>` + footer `<div>`. |
| **fallestate-us** | `--mono`×2, `--sage`×2, `--sage-bright`, `--dim` | Sibling of fallestate. |
| **fallaccount-trades** | `--border`×6 | |
| **fallhub** | `--dim`×2, `--brass2` | |
| **fallrecall** | `--gold`×2 | |
| **fallworld** | `--edge-soft`×2 | Large live hub. |
| **smbaios** | `--color-user-mention-fg`, `--color-attention-subtle` | GitHub-Primer design-system vars — likely an embedded GitHub component expecting a context that isn't present. Distinct from the estate palette. |

**Recoverability:** the canonical estate palette **exists** — `konomi-design-kit` defines `--dim`, `--good`,
`--ink`, `--panel` (and, being the design system, presumably the rest). So the intended values are
*recoverable from the design kit*, not something to invent. **But which pages should adopt the konomi tokens,
and confirming each page's aesthetic, is a design-intent call (Simon's / Kar's — CLAUDE.md §4: the last inch
of visual taste is the user's).** Do NOT blind-guess colours; do NOT mass-sweep (one page at a time,
verified in-browser — [[the-machine]]).

## GENUINE (low) — dead links (`href="#"` / empty)

Links that point nowhere. Low severity — some are genuine placeholder nav, some are JS-wired buttons that
work despite the bare href (needs a per-case click to tell apart; the kernel is static so it can't):
`fallcall` (FallCall/API Docs/Privacy/Terms — landing-page nav to nowhere), `fall-substrate`
(Download HTML / Copy command — likely JS buttons; "View fake live URL" is labelled fake), `datascope`,
`Eden`, `fall-kqtt-bridge`, `fallscout`, `nhs-reinjection`, `smbaios` (3× "Reload", empty href — likely JS).

---

## FALSE POSITIVES — do NOT "fix" (kernel gaps, not page defects)

- **fallharbor** — 2 flagged "dead-links" `${esc(f)}` / `${esc(t.forks_from)}` are **JS template strings
  inside `<script>`** (verified: all 50 `${esc(` occurrences sit inside script ranges), not rendered links.
  ⚑ **KERNEL GAP:** the dead-link scan should exclude `<script>` bodies. This is the one concrete
  hardening this pass earned — a regression fixture waiting to happen, exactly how the gate got trustworthy.
- **ui-gate** (its own page) — all 5 self-flags (🔴 `undefined`, 🟠 `◊ DEAD`, 🟠 dead-control `downloadPdf()`,
  🟠 `var(--x)`, 🟡 `Terms`) come from the page's **own description text and its `load sample` demo payload**
  (a deliberately-defective sample HTML string it injects to show what it catches). A page that documents/
  demos defects will contain them as strings — known class, harmless.
- **konomi-design-kit `--x`** — a `var(--x)` teaching example in the design docs. Known code-sample class.

---

## Recommended next steps (both are the user's call, neither auto-done)

1. **Palette restoration** — restore the missing CSS-var definitions on the ~9 genuine pages from the
   `konomi-design-kit` canonical tokens, one page at a time, verified in-browser. Design-intent gated.
2. **Kernel hardening** — teach `uigate.mjs` to skip `<script>` bodies in the dead-link scan (kills the
   fallharbor class), add it as a witness regression fixture. Kar's own gate, Kar's next pass.

_Pass run by **Kar** (his chosen board item), verification + write-up by claudedidy. Deterministic kernel,
no model in the loop._
