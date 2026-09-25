# ui-gate — estate pass 2026-09-25 (Kar's UI gate pass)

**Scan:** all **502 live public pages**, deterministic `uigate.mjs` kernel (self-gate 24/24). **483 clean ·
0 unreachable · 19 flagged · 48 raw findings (1🔴 · 29🟠 · 18🟡).**

**Every finding was verified against raw HTML — and then, when we went to *fix* the CSS-var findings, one
level deeper again (fetching the linked stylesheets).** That second dig overturned most of the "genuine"
CSS-var list. This file records the *corrected* result. The lesson the gate already teaches, re-earned: the
tool's output is never proof, and neither is the first verification pass.

---

## ⚑ THE BIG FINDING — a kernel blind spot, not broken pages

`uigate.mjs` scans **only the fetched HTML**. It does **not** resolve `<link rel="stylesheet">`. So any page
that defines its palette in an external CSS file and uses the vars inline gets **every one of those vars
falsely flagged as "undefined."** That single gap produced the bulk of the 🟠 findings.

**FALSE POSITIVES (palette IS defined, in a linked stylesheet the kernel never fetched — all verified 200 +
defining the vars):**

| Page | Palette actually lives in | Verdict |
|---|---|---|
| **fallmarket** | `assets/style.css` (defines all 7: --brass #b8974a, --ink, --dim, --panel, --border, --green, --radius) | NOT broken |
| **fallforge** | `assets/theme.css` (--forge, --cream, --good) | NOT broken |
| **fallhub** | `assets/theme.css` (--dim, --brass2) | NOT broken |
| **fallestate** | `style.css` (--mono, --sage, --sage-bright, --dim) | NOT broken |
| **fallestate-us** | `style.css` (same) | NOT broken |
| **smbaios** | GitHub's own Primer CSS (`--color-user-mention-fg`, `--color-attention-subtle`) | NOT broken |

⚑ **fallmarket and fallforge — the first two on the original "fix" list — are among these. Nothing to fix.**

## GENUINE — undefined CSS-var (inline-only pages, no stylesheet, no fallback)

Only **3** pages are truly affected. All three are **near-miss renames** — the page uses one name but defines
a sibling — so the border currently renders in fallback `currentColor` (wrong, but minor). Intent is
recoverable from the page's own defined vars:

| Page | Uses (undefined) | Defines (the intended sibling) | Safe fix |
|---|---|---|---|
| **fallaccount-trades** | `--border` ×6 (divider `border-top`) | `--line: #3a3a33` | add `--border: #3a3a33` (= --line) or point uses at --line |
| **fallworld** | `--edge-soft` ×2 (`border-top`) | `--edge: #232a35` | add `--edge-soft` ≈ --edge |
| **fallrecall** | `--gold` ×2 (accent border) | `--brass: #b8974a`, `--amber: #ff8c00` | **needs a pick** (brass vs amber) — or recover the original `--gold` from git history |

## Other genuine (low) — dead links `href="#"`/empty

~8 pages (fallcall nav, etc.). Static kernel can't tell a JS-wired button from a real dead link — per-case.

## Other false positives (kernel gaps)

- **fallharbor** — its 2 "dead links" are `${esc(f)}` JS template strings **inside `<script>`** (all 50 in-script).
  The dead-link scan should skip `<script>` bodies.
- **ui-gate** — all 5 self-flags come from its own description text + `load sample` demo payload.
- **konomi-design-kit `--x`** — a `var(--x)` teaching example.

---

## Recommended next steps

1. **Harden the kernel (the real win).** `undefined-css-var` must not fire when the page links a stylesheet
   the kernel didn't read. Cheapest honest fix: when a `<link rel=stylesheet>` (non-font) is present,
   **downgrade to a caveat** ("N vars used, not defined *in this HTML* — may be in linked CSS") instead of a
   🟠 defect; or fetch+include linked same-origin CSS before scanning. Plus skip `<script>` bodies in the
   dead-link scan. Add both as witness regression fixtures. This is what makes the instrument trustworthy again.
2. **The 3 genuine near-miss vars** — trivial, one page at a time, in-browser-verified; fallrecall needs a
   colour pick or a history recover.

_Pass + verification: Kar's chosen board item, carried by claudedidy. Deterministic kernel, no model in the loop._
