# EU2050 checks

Four Playwright scripts that assert the behaviour and the claims of the page.
They exist because several regressions here were invisible by inspection:
numbers that disagreed with their own prose, controls that cancelled
themselves out, and changes that shipped behind a stale cache key.

## Running

```bash
python3 -m http.server 8000         # from the repo root, in one terminal
npm i playwright                    # once
node tests/verify-behaviour.js      # stats, maps, overlays, detail toggle
node tests/verify-integrity-a11y.js # feed provenance, keyboard access, compare
node tests/verify-share.js          # share section, copy, deep links, OG meta
node tests/verify-layout.js         # horizontal overflow at 375px and 1440px
```

Each exits non-zero on failure, so they can gate a deploy.

## What `verify-behaviour.js` covers

- 2026 cross-scenario parity — every tile identical, since the scenarios only
  diverge after the baseline year
- 2050 headline values, and that no tile is a one-step staircase
- No `NaN`/`undefined` across a full 2026-2050 sweep
- Country detail opens, closes on a second click, and syncs the URL
- Selection is linked across the two maps — one country, both scenarios — so
  the panels always compare the same place
- Detail panel tracks the year slider
- Schengen/Eurozone/NATO chips on both maps: highlight, survive a re-render,
  clear on re-click, and never leak across maps
- Only one map overlay active at a time

## What `verify-integrity-a11y.js` covers

- The signals feed carries **no outlet bylines**, and the page makes no
  "live"/"updated today" claim it cannot support. This is the important one:
  the feed used to attribute invented headlines to real newsrooms.
- The disclaimer states that the scenarios are illustrative, where the
  headlines are collected from, and that the scenario readings are ours
  rather than any publication's
- Countries are keyboard-focusable, labelled, and activate with Enter
- Stat cards and chips expose button roles / `aria-pressed`
- The cross-scenario comparison renders and collapses
- Both maps render at the same width

## What `verify-share.js` covers

- The share section renders, and its copy names the year on the slider and
  whichever country is open — and drops the country again on deselect
- "Copy link" copies the current deep link, including `year` and `country`,
  and confirms with a label swap and a toast that both reset
- The outgoing social text is view-specific, not a fixed tagline
- A copied link, reopened, reproduces the same country and year
- Open Graph / Twitter Card metadata and the favicon are present, so a
  pasted link previews as a card rather than a bare URL

## What `verify-layout.js` covers

- No horizontal overflow at 375px or 1440px, scrolled to the page bottom
- No `NaN`/`undefined` in either detail panel across a year sweep
