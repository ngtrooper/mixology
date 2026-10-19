# Mixology — the daily color-mixing game

One color name a day, the same for everyone. You're told what today's color is
*called* — never shown it. Dose paint into the pot, guess what the name looks
like, and get scored on **% accuracy** (perceptual distance, CIEDE2000) when
you seal up to 3 attempts. The reveal is a side-by-side: the official color vs
your mix, and your %.

## The pot model (the heart of the game — read before touching engine.js)

The pot is a **composition vector `{r, y, b, k, w}` that always sums to
exactly 100**. It starts at 100% white. Dosing is *displacement*: adding n
units of a pigment raises it by n, then the whole vector renormalizes back to
100 — so every addition lowers everything else proportionally and the total
never exceeds 100.

Consequences that are **invariants**, not implementation details:

- Color is a pure function of the composition. Same % in = same hex out,
  regardless of the order paint went in.
- Nothing can get stuck: no caps, no volume, no frozen pots. From ANY
  composition, pouring any pigment visibly moves the color toward it.
  (Two earlier models failed exactly here — see BUILD-REPORT.md rounds 4–6.)
- Canonical recipes in `colors.js` are % compositions produced by
  `tools/solve-recipes.js` against this model. If you change the mapping in
  `engine.js`, you MUST re-run the solver and re-check eligibility counts.

## Design locks (producer decisions — do not relitigate in code)

- Score is **% accuracy only**. No points anywhere.
- **No hints** on attempts (just %), **no live caption** naming the mix,
  **no counts/tallies** on the main screen. Tool dosages live only in the
  Tips overlay. The game is meant to be hard: some people can't visualize
  the color, and that's the game.
- **Never show the official recipe or the target hex before the reveal.**
  Share text and duel links must stay spoiler-safe (a duel link carries the
  *player's* mix, never the answer).
- Two dosing tools: **Dropper** (1 unit/click, falling-drop animation) and
  **Pour Bucket** (hold to pour ~30 units/sec, pouring animation). The Pour
  Bucket is the default tool. Pigment selectors are unlabeled full-color
  discs in a ring around a central circular pot; dosing happens on the pot.
- Buckets are R / Y / B / K / W (white is a full pigment). Known gamut hole:
  cyan/turquoise is unreachable in this paint box; those bank colors are
  excluded from the daily pool by the solver (eligibility = recipe ΔE ≤ 12).

## Files

- `index.html` — page + CSS (single-page, mobile-first)
- `engine.js` — pure logic: % mixing over an RYB cube, RGB→Lab, CIEDE2000,
  % mapping, daily picker. Loadable in browser and Node.
- `game.js` — controller: rounds, saves (localStorage, v2 with v1
  migration), duels, share, `window.MISNOMER` debug handle.
- `colors.js` — the bank: 981 named colors with solver recipes + ΔE.
- `tools/` — bank builder, recipe solver, diagnostics.
- `test/tests.js` — `node test/tests.js` (must be green before pushing).

## Working on this repo (Muse + Grok Bot)

- Current state of the build lives at the top of `BUILD-REPORT.md`
  (round-by-round addenda). Read the latest round before changing behavior.
- Verify like the project does: unit tests + a real-browser pass of the
  main flows (dose with both tools, seal, finish, reload persistence).
- Small, explained commits. If you change a design lock, you're wrong —
  check with Jon first.

## Run it

Any static server, e.g. `python3 -m http.server` in this directory, then
open `index.html`. No build step, no dependencies.
