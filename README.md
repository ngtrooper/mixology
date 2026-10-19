# Mixology — the daily color-mixing game

One color name a day, the same for everyone. You're told what today's color is
*called* — never shown it. Dose paint into the pot, guess what the name looks
like, and get scored on **% accuracy** (perceptual distance, CIEDE2000) when
you seal **2 attempts** (round 9; your best attempt is your score, the round
ends by itself after the 2nd — there is no early "lock it in"). The reveal is a side-by-side: the official color vs
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
- **Two attempts, best counts** (round 9, Franklin): `MAX_ATTEMPTS = 2` in
  game.js for daily and practice; no early-finish button. Days saved before
  round 9 keep the attempt they were scored on (last-counts) — see
  `scoredAttempt`.
- **Tools are SVG rigs** (round 9): the bucket tilts and the stream is drawn
  from its measured lip (`#bucket-lip`); the dropper forms the drop at
  `#dropper-tip`. Both are tinted with the selected pigment.
- **Calendar** (round 9) reads `store.data.days` (local to the device).
  Each day shows the % inside its swatch and the name below.
- **Public numbering is display-only** (round 10): `E.publicNumber(day)` gives
  `day − 655`, so internal day #656 (Sun 2026-10-18) is **Mixology #1**. Days
  before launch show only a date, never #0 or negatives. The internal index
  still drives the schedule, saves, streaks and duel links (`?d=` stays
  internal so old links keep working). In game.js, always show numbers via
  `dayTag(day)`.
- **Recipes appear only after the round** (round 10): the reveal and the
  played-day calendar detail show "Recipe" (official solver recipe) vs "Your
  mix" (scored attempt) bars. They are **never** included in share text or
  duel links, and a test enforces this.
- Subtitle: "How well do you know your colors?"
- **Dark mode is palette-only** (round 13). `@media (prefers-color-scheme: dark)` sits at the end of the stylesheet and swaps the CSS variables. Never recolor paint: the pot surface, pigments and swatches keep their true colors.
- **First-visit welcome** (round 14) shows once, and only to players with no saved days and no WIP. Its flag lives in its own key, `mixology.welcomed.v1`; don't add it to the save. Keep tool dosages out of it, since they live only in Tips.
- **Modals** (tips, calendar, welcome) must use `openOverlay` / `closeOverlay` and the `.modal-ov` class to get focus trap and restore.
- **Stats live only in the 📅 overlay** (round 16), via `E.computeStats(days)`, which is pure and read-only. No stats on the main screen (the round-65 disc percentages are the only numbers there).
- **Celebration** (round 15): confetti only at 95%+, never under reduced motion. Sound and haptics are tiered (below par / par / 95%+).
- **Assets** (round 11): `icons/icon.svg` is the source. The PNGs (favicon-32, apple-touch 180, 192, 512, maskable 512) and `icons/og-image.png` (1200×630) were rendered from it with Playwright. The og image never names a daily color.
- **Share card** (round 12): `drawShareCard(day)` draws a 1080² canvas with no name, no colors and no recipe. Share attaches it through Web Share when the platform can share files.
- **Buttons with icons** (round 25): use `flashLabel(btn, text)` for temporary labels. Setting `textContent` directly would wipe the SVG.
- **Shipping UI changes** (round 32): bump `version` in game.js and the `?v=` on all four `<script>` tags together (a test enforces the match). Pages caches for about 10 min, so without this a returning visitor can get new game.js with old index.html, or the reverse.
- **a11y baseline** (rounds 17, 21, 26): axe-core is clean in 12 states (light/dark × home, reveal, calendar, stats, tips, welcome). Keep `<main id="app">`, the `#sr-announce` live region, `aria-pressed` on pigments and tools, and `--muted` at ≥ 4.5:1.
- **Keyboard shortcuts** (rounds 40, 57, 60): 1–5 pigments, D/P tools, Z undo, PgUp/PgDn months. There is deliberately **no seal key**, so an attempt can never be sealed by accident. Shortcuts are ignored in dialogs and fields, and they announce changes to screen readers by naming the control, never the mix.
- **Forced colors** (round 51): any new element whose *meaning* is a paint color must join the `@media (forced-colors: active)` `forced-color-adjust: none` list, or it vanishes in High Contrast mode.
- **Contrast and motion preferences** (rounds 52, 59): `prefers-contrast: more` is palette-only, like dark mode. Entrance animations are transform-only (never text opacity), and the global reduced-motion rule switches them off.
- **Install screenshots** (round 45): `icons/screenshot-*.png` must show an unmixed board, with no mix and no recipe. Re-shoot them if the layout changes a lot.
- **Sharing never names the color** (round 12): the share text and PNG card use the hook
  line instead of the name and show no colors or recipes. The card is drawn by `drawShareCard`.
- **No hints** on attempts (just %), **no live caption** naming the mix,
  **no counts/tallies** on the main screen, **except** (round 65, Franklin, 2026-10-18, overriding the earlier lock) each paint disc shows the pot's live % of that paint (`E.displayPercents`: whole numbers, largest-remainder so they sum to 100, `<1%` for a trace). The pot itself stays number-free, and there are still no attempt feedback or recipe readouts before the reveal. Tool dosages live only in the
  Tips overlay. The game is meant to be hard: some people can't visualize
  the color, and that's the game.
- **Never show the official recipe or the target hex before the reveal.**
  Share text and duel links must stay spoiler-safe (a duel link carries the
  *player's* mix, never the answer).
- Two dosing tools: **Dropper** (1 unit/click, falling-drop animation) and
  **Pour Bucket** (hold to pour: starts ~30 units/sec, ramps to ~90/sec after ~1 s, per `E.pourUnitsAt`, round 62; pouring animation). The Pour
  Bucket is the default tool. Pigment selectors are full-color (round 65: each carries its live pot %)
  discs in a ring around a central circular pot; dosing happens on the pot.
- Buckets are R / Y / B / K / W (white is a full pigment). Known gamut hole:
  cyan/turquoise is unreachable in this paint box; those bank colors are
  excluded from the daily pool by the solver. **Eligibility (round 8) =
  the solver's best recipe scores ≥ par** (`engine.isDailyEligible`,
  `PAR_PCT = 85`, ≈ ΔE ≤ 11.25) — one shared rule for game.js, the solver
  and the colors.js header; no day can be unwinnable at par.
- **Star badges** (round 74, Franklin): a small star in a swatch corner for the displayed %. 90–96 bronze, 97–99 silver, 100 gold. They appear on Calendar circles (that day's best), Collection tiles (best mix against that color) and the reveal's "Your mix". Stars are derived from saved scores and never stored, they never cover the % in a calendar circle, and they always carry spoken words (e.g. "silver star: 97%+"). Stars never go into share text or the image card.
- **Holiday colors** (round 72, Franklin): `tools/build-schedule.js` gives future holidays a themed, daily-eligible color (`tools/holiday-colors.js`, rotated by year) and shows a small header tag such as "🎃 Halloween". Frozen days are never touched, and the 120-day no-repeat rule still holds. Lunar-calendar holidays come from tables (2026–2035).
- **Header and panels** (round 71, Franklin):
  - Calendar, Stats and Collection each have their own icon button with an aria-label, and their own dialog with a title (no sub-tabs). The header's right side is two rows (four icons, then Tips and Practice) and fits at 320px.
  - User-facing copy says **Submit** ("Submit attempt 1", "Submit final attempt", "submitted"), never "Seal"; internal names may stay.
- **No selection/callout in the play area** (round 70): play-area elements are user-select/touch-callout none and cancel contextmenu and selectstart. The pot and badges also cancel touchstart. Reading text (Tips, reveal, calendar) stays selectable.
- **Collection** (round 69, Franklin): a third Calendar overlay tab with every daily-eligible, non-retired color (853).
  - A seal discovers the nearest one within ΔE00 3, or the round's own target if it is within reach. Hard colors use their solver best + 1.
  - Discoveries are announced only at the reveal (no clues mid-round). Today's or the open round's color stays "?" until the round is finished.
  - The official recipe shows only for colors the player has **finished as a daily** (round 73). Pre-launch days, missed days and upcoming colors never reveal a recipe, because colors recur in the schedule.
  - Own key `mixology.collection.v1`, backfilled from saved days.
- **No traces; paint can be taken out** (round 68, Franklin): a paint under 0.5% of the pot snaps to 0 (engine `snapTraces`, also used by the solver, so every recipe has each paint at 0 or at least 0.5%). Disc numbers are whole and always sum to 100, with no "<1%". Each disc holding paint has a separate "−" badge outside it: a tap removes ~1%, a hold follows the bucket ramp, and one undo step covers a whole hold.
- **Nothing drawn on or in the pot** (round 67, Franklin): no swirl, bloom, ripple, splash or color spot. The pot surface only eases to the mix color. Rigs, stream and falling drop may animate *toward* the pot.
- **Family-friendly names** (round 66): gross or bodily names are BANNED (dropped) or RETIRED in `tools/build-bank.js`. Retired names stay in colors.js (`retired: true`) only so frozen past days and old saves resolve. Never schedule them or offer them in practice.
- **The daily schedule is frozen data** (`schedule.js`, round 8). Never
  derive a day's color from the pool size again; past days, duel links
  and today's color must not move when the bank or pool changes. Change
  future days only with `node tools/build-schedule.js`.

## Files

- `index.html` — page + CSS (single-page, mobile-first)
- `engine.js` — pure logic: % mixing over an RYB cube, RGB→Lab, CIEDE2000,
  % mapping, daily picker. Loadable in browser and Node.
- `game.js` — controller: rounds, saves (localStorage, v2 with v1
  migration), duels, share, `window.MISNOMER` debug handle.
- `colors.js` — the bank: 981 named colors with solver recipes + ΔE.
- `schedule.js` — frozen day → color-name list (days 0..4018; generated by
  `tools/build-schedule.js`, which never rewrites a live/past day).
- `tools/` — bank builder, recipe solver, diagnostics.
- `test/tests.js` — `node test/tests.js` (must be green before pushing).

## Working on this repo (Muse + Grok Bot)

- Current state of the build lives at the top of `BUILD-REPORT.md`
  (round-by-round addenda). Read the latest round before changing behavior.
- Verify like the project does: unit tests + a real-browser pass of the
  main flows (dose with both tools, seal, finish, reload persistence).
- Small, explained commits. If you change a design lock, you're wrong —
  check with Jon first.

## Changing the model or the pool (round 8)

1. Edit `engine.js` → `node tools/solve-recipes.js` (re-solves recipes,
   rewrites `colors.js` + `tools/recipe-report.json`).
2. `node tools/build-schedule.js` — keeps every day through tomorrow
   verbatim, keeps still-eligible future days, replaces only future days
   that fell out of the pool.
3. `node test/tests.js` (the frozen-prefix hash test must stay green).

## Run it

Any static server, e.g. `python3 -m http.server` in this directory, then
open `index.html`. No build step, no dependencies.
