# EU2050 checks

Two Playwright scripts that assert the behaviour and the claims of the page.
They exist because several regressions here were invisible by inspection:
numbers that disagreed with their own prose, controls that cancelled
themselves out, and changes that shipped behind a stale cache key.

## Running

```bash
python3 -m http.server 8000        # from the repo root, in one terminal
npm i playwright                   # once
node tests/verify-behaviour.js     # stats, maps, overlays, detail toggle
node tests/verify-integrity-a11y.js # feed honesty, keyboard access, compare
```

Both exit non-zero on failure, so they can gate a deploy.

## What `verify-behaviour.js` covers

- 2026 cross-scenario parity — every tile identical, since the scenarios only
  diverge after the baseline year
- 2050 headline values, and that no tile is a one-step staircase
- No `NaN`/`undefined` across a full 2026-2050 sweep
- Country detail opens, closes on a second click, and syncs the URL
- Detail panel tracks the year slider
- Schengen/Eurozone/NATO chips on both maps: highlight, survive a re-render,
  clear on re-click, and never leak across maps
- Only one map overlay active at a time

## What `verify-integrity-a11y.js` covers

- The example signals carry **no outlet bylines and no dates**, and the page
  makes no "live"/"updated today" claim. This is the important one: the feed
  used to attribute invented headlines to real newsrooms.
- Countries are keyboard-focusable, labelled, and activate with Enter
- Stat cards and chips expose button roles / `aria-pressed`
- The cross-scenario comparison renders and collapses
- Both maps render at the same width
