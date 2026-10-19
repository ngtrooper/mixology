# MISNOMER — v1 core build report

Built 2026-10-18 in `~/workspace/game-projects/misnomer/`. Local only — nothing published or submitted.

## Round 22 (2026-10-18, Grok Bot): TACTILE PIGMENTS
- Pigment discs press-squish (scale .9 on `:active`), spring back with a pop when selected, and lift slightly on hover (pointer devices only).
- The selected ring keeps the glossy inset shading it used to lose.
- All transforms keep the `translate(-50%,-50%)` positioning; selection was verified not to move the disc. The global reduced-motion rule disables these animations.

## Round 21 (2026-10-18, Grok Bot): AXE-CORE AUDIT (WCAG 2 A/AA + best practice) → CLEAN
- I ran axe-core 4 in Playwright across 12 states: home, reveal, calendar, stats, tips and welcome, each in light and dark. Findings and fixes:
  - **color-contrast (serious):** day numbers before your first play were 1.7–2:1. Now opacity .62 with ink-colored numerals (AA). Future days are `disabled` (nothing to show; not focusable).
  - **landmark-one-main / region:** `#app` is now `<main>`.
  - **heading-order:** the stats "Score spread" `h4` is now a styled div.
- Re-run: all 12 states clean. Script: /tmp/pw/axe.js. Static test added.

## Round 20 (2026-10-18, Grok Bot): SVG TOOL ICONS
- The 💧 / 🪣 / ↩ emoji in the toolbar are now inline SVG icons (drop, bucket, undo arrow, reset loop) using `currentColor`. They invert correctly on the selected pill and in dark mode, and look the same on every OS.
- The collapsed-toolbar label copies the selected tool's icon.
- Old test updated: the static label is still "Pour Bucket", now preceded by the SVG.
- The Tips prose keeps its emoji.

## Round 19 (2026-10-18, Grok Bot): NEXT-COLOR COUNTDOWN
- A finished daily reveal ends with "Next color in 1h 41m". It counts down to local midnight via `dateForDay(DAY + 1)`, the same boundary `dayNumber()` uses, and refreshes on the existing 20 s rollover tick.
- Hidden in practice, before finishing, and on a stale (yesterday's) round, where the "Play today's color" button shows instead.
- Test checks the boundary maths (internal 657 starts at local Mon Oct 19 00:00) and the visibility rule.

## Round 18 (2026-10-18, Grok Bot): MICRO-ANIMATIONS · LEGEND FIX
- **Reveal entrance**, only on a fresh finish: the card fades up, the Official and Your-mix swatches slide in from their sides, and band, bars and actions follow.
  - The % counts up with an ease-out over 0.75 s and always lands on the exact value.
  - A reload shows the reveal already settled. Nothing animates under reduced motion.
- **Attempt pop:** the slot just sealed springs in.
- **Bug fix (r10 legend):** black showed as "B" like blue. Legend letters are now R/Y/B/K/W from the pigment keys. Test added.

## Round 17 (2026-10-18, Grok Bot): ACCESSIBILITY · SVG HEADER ICONS
- The header 📅 and 🔊/🔇 emoji are now inline SVG icons (calendar with an accent dot; speaker on/off).
  - Mute is a real toggle: `aria-pressed` plus a stateful label ("Sound is on. Turn sound off").
- A global `:focus-visible` ring (3px accent) on buttons and links. Tab order: header → pot → pigments → tools.
- A polite `aria-live` region announces "Attempt N sealed: X% accuracy." and the round-complete result. It only reads back what is on screen, so the no-hints lock is kept.
- Light `--muted` darkened from #7a7264 to #6b6356, raising contrast on paper from about 4.3:1 to about 5.4:1 (WCAG AA). Tested.
- Earlier rounds already gave the overlays focus trap and restore (r14) and reduced motion for confetti, the flame and smooth scroll (r15).

## Round 16 (2026-10-18, Grok Bot): STATS PANEL
- The 📅 overlay now has **Calendar | Stats** tabs. It always reopens on Calendar.
- Stats come from `E.computeStats(store.data.days)`, which is pure and read-only (it never writes the save):
  - Played, average, % at par, best.
  - Current streak, longest streak (consecutive internal days), par streak.
  - A score-spread bar chart (95+, 85–94, 70–84, 50–69, <50).
  - An empty state before the first finished day.
- Design lock kept: no counts on the main screen. Stats live only inside the overlay.
- Header streak line: "(85%+)" moved into a tooltip, so the line no longer wraps at 390px.
- Test: computeStats math on a fixture, the empty and garbage cases, no mutation, and stats placed inside the overlay.

## Round 15 (2026-10-18, Grok Bot): FEEL (TIERED FINISH · CONFETTI · STREAK FLAME)
- The finish sound is tiered: below par plays the old 3-note chime, par (85%+) adds a fourth note, and 95%+ plays a 6-note sparkle run. All respect mute.
- Haptics scale with the result (phones with `navigator.vibrate`): 12 ms tick, a par double-pulse, and a triple at 95%+.
- **Confetti at 95%+:** 80 WAAPI particles in the paint colors plus the official color. The layer is `pointer-events: none` and is removed after 2.6 s. It is skipped entirely under `prefers-reduced-motion`.
- **Streak flame:** 🔥 is wrapped in `.flame` and does a 0.9 s bump-and-glow when a daily finish grows the streak (not under reduced motion).
- Playwright verified: 97% run gives 80 particles, flame bump, the vibrate pattern, and the layer cleaned up afterward; reduced motion gives 0 particles. Test added.

## Round 14 (2026-10-18, Grok Bot): FIRST-VISIT WELCOME · MODAL FOCUS
- **Welcome overlay** for brand-new players only: no saved days and no WIP, so returning players never see it.
  - Three illustrated steps (inline SVG): one name a day; mix from five paints by tapping or holding the pot; two attempts, best counts, 85%+ beats par.
  - Buttons: "Let's mix" and "Read the full tips".
  - Shown once. The flag is `mixology.welcomed.v1`, in its own localStorage key, so the save format is untouched.
  - No tool dosages (design lock: those live only in Tips).
- **a11y:** tips, calendar and welcome now share `openOverlay` / `closeOverlay`.
  - Focus moves into the dialog and Tab / Shift+Tab wrap inside it.
  - Esc or close returns focus to the button that opened it.
  - Opening Tips also stops a running pour.
- Playwright verified: shows on first visit (light and dark), gone after reload, absent for a seeded returning player, tips focus goes to ✕ and Esc restores focus to Tips.

## Round 13 (2026-10-18, Grok Bot): DARK MODE
- `@media (prefers-color-scheme: dark)` sits at the end of the stylesheet and swaps the palette variables (paper #1a1815, card #24211d, ink #f1ebdf, accent #d9743a).
- The paint itself is untouched: pot surface, pigments, swatches and calendar swatches keep their true colors, so judging a mix in dark mode is still honest.
- Adjusted for dark mode: pot rim, black-pigment edge, overlay scrim, recipe bar track.
- White-on-accent buttons keep #b3541e for contrast (about 5:1).
- Theme-color has light and dark variants, plus `color-scheme: light dark`. Test added.
- Before = the light shots in v4/01–04; after = `r13-after-dark-*.png`.

## Round 12 (2026-10-18, Grok Bot): SPOILER-FREE SHARING · PNG RESULT CARD
- **Franklin's request:** shared text no longer names the color. The headline is now `🎨 MIXOLOGY #1 — How well do you know your colors?`, followed by the score/tries line, streak and duel link.
  - Duel links carry only d/p/x, never a name.
  - An incoming duel for today (when the visitor hasn't played) still shows no name or color. The game screen itself shows the name as usual.
  - A test asserts the name is absent from the share text, the card renderer and the duel URL.
- **PNG result card:** `drawShareCard(day)` renders a 1080×1080 canvas with the wordmark, #N and date, the hook line, the big %, the band, try bars and the streak.
  - It is spoiler-free: no name, no mix or official color, no recipe.
  - **Share result** attaches the PNG when `navigator.canShare({files})` allows it (phones), otherwise it falls back to text share, then to clipboard. A cancelled share no longer falls through to copying.
  - A small **🖼 Save image card** link downloads `mixology-<N>.png`.
  - Both are daily-only (hidden in practice).
- Version 1.9.0.

## Round 11 (2026-10-18, Grok Bot, original brief priority 4): PUBLISHING BASICS
- `icons/icon.svg` is the app mark: a pot with an R/Y/B wedge rim, a mixed center and a falling red drop. Rendered PNGs: favicon-32, apple-touch-icon (180, opaque), icon-192, icon-512, and icon-maskable-512 (with a safe-zone pad).
- `manifest.webmanifest` sets standalone display, start_url `./` and paper theme/background colors.
- `icons/og-image.png` is 1200×630: the wordmark, the subtitle and five paint dots. It never names a daily color. Meta tags: og:image (absolute URL), width/height/alt, and twitter `summary_large_image`.
- The emoji data-URI favicon is replaced by the SVG and PNG icons.
- The icons are regenerated from icon.svg with Playwright (/tmp/pw/icons.js; nothing in the repo depends on it).
- Test: assets exist, are real PNGs of the right sizes, and are linked from the head; the manifest's icons resolve.

## Round 10 (2026-10-18, Grok Bot, Franklin's calls) — PUBLIC #1 · NEW SUBTITLE · RECIPE BARS
- **Numbering:** today (internal #656) is publicly **Mixology #1**. This is display-only, via `E.LAUNCH_DAY = 656` and `E.publicNumber(day) = day − 655` (null when < 1).
  - Updated: header (`MIXOLOGY #1 · Sun, Oct 18`), share text, duel cards and calendar detail.
  - Pre-launch days show the date only.
  - Unchanged: schedule, saves, streaks and duel `?d=` (still internal).
- **Subtitle** is now "How well do you know your colors?". Added meta description and og/twitter tags with the same line. The Tips copy keeps its own wording.
- **Recipe vs your mix:** after the round ends, the reveal shows two segmented R/Y/B/K/W % bars with legends.
  - Recipe = the official solver recipe, with its best-achievable %.
  - Your mix = the scored best attempt.
  - The same bars appear in the calendar detail for played days.
  - Never shown in share text or duel links (tested).
- Calendar names now hyphenate rather than break mid-word. Version is 1.8.0.
- Tests: 95 pass. Added 3 round-10 tests, and the rename test now checks the dayTag form.

## Round 9 (2026-10-18, Grok Bot, Franklin's calls) — TWO ATTEMPTS · NO LOCK-IN · REAL POUR/DROPPER · CALENDAR

1. **"Lock it in" removed.** It was `#btn-finish` — "Lock it in (attempt N counts)", shown after the 1st seal, which ended the round early with the last sealed attempt as the score. Button, CSS and handler are gone; the round now ends automatically on the final seal (`MISNOMER.finish()` remains as a debug/playtest hook only).
2. **Two attempts per round** (`MAX_ATTEMPTS = 2`, daily and practice — practice used the same flow). **Scoring is now best-of** (`bestAttempt`, ties → earliest): with lock-in gone, last-counts would let the forced 2nd seal throw away a good 1st attempt. Seal button reads "Seal attempt 1" → "Seal final attempt"; the scored slot is outlined. Share text: `Tries: 41% · 60%`; duel links carry the scored attempt's composition. Streak/par logic unchanged (uses the scored pct).
   - **Migration:** a WIP saved under 3-attempt rules holding 2 seals is a complete round now → finished on load (best of those two counts). Finished pre-round-9 days keep their stored score (they were last-counts; `scoredAttempt` finds that attempt by hex+pct) and render all 3 slots (a 3rd slot is created on demand). New day records carry `scoring: 'best'`.
3. **Pour/Dropper graphics.** The emoji bucket and free-floating stream are replaced by inline SVG: a metal bucket tinted with the pigment (paint surface, band, drip at the lip) that tilts −64° about its base while pouring; the stream is an SVG quadratic path redrawn every frame from the bucket's measured lip point (`#bucket-lip` via getBoundingClientRect after the CSS rotation) to an impact point on the surface, with a flowing highlight. Paint appears ~110 ms after the press (once the bucket has tilted). Dropper: a glass dropper with a rubber bulb hovers over the pot when selected; a tap squeezes the bulb, a drop swells at `#dropper-tip`, then falls into the pot with bloom/ripple/splash. Only the selected tool's rig shows; both hide on a finished pot. No dependencies; reduced-motion respected.
4. **Calendar** (📅 in the header). Built from `store.data.days`, which every finished daily round has written since v1, so existing local history appears with **no migration** (only on the device/browser that played it; practice isn't recorded). Month grid with prev/next (Jan 2025 → current month), today outlined, played days show the best attempt's swatch + %, par days in accent, missed days (since the first played day) shown as empty dashed circles, future days disabled. Tap a day: name, date, best % + band, official swatch and every attempt. A missed past day shows what its color was. Note: for pre-round-9 days the calendar's "best" can be higher than that day's official (last-counts) score.

5. **Calendar cells (9b, Franklin):** the best % is printed INSIDE the day's swatch, ink chosen by WCAG luminance contrast (`inkFor` → dark or light text); the color's name sits below in 8.5 px, clamped to 2 lines with an ellipsis (full name in the day detail and the cell's title/aria-label). Verified at 390 px: 44 px cells, 31 px swatches, "100%" fits, no horizontal overflow.

- Tests: **92/92** (84 prior, 2 updated for the SVG rigs, 8 new round-9 tests). Phone run (390×844, touch): stream path starts exactly at the tilted bucket lip, dropper drop forms at the tip, 2-attempt round → reveal, calendar with today + seeded history, 3-attempt WIP migration, old 3-attempt day rendering — zero page errors. Debug handle 1.7.0.

## Round 8 (2026-10-18, Grok Bot, approved by Franklin) — FROZEN SCHEDULE · PAR FAIRNESS · MIXING FEEL · NO ANSWER LEAK · VISUALS

Muse: read this before touching the picker, the pool filter or `mixRaw`.

1. **Frozen daily schedule** (`schedule.js`, `tools/build-schedule.js`, `tools/legacy-schedule-epoch0.json`). The v1 picker shuffled over `POOL.length`, so the proposed ΔE 11 change would have moved 99 of the next 100 days and switched *today* (#656 lipstick → muddy yellow) mid-day. Now day → color name is data. Days 0..809 are exactly the v1 picker's output over the 810-color ΔE≤12 pool (days 1..657 frozen — 657 covers players a timezone ahead; 658..809 kept because all are still eligible); days 810..4018 are seeded shuffle-bags of the new pool, no repeat within 120 days. `game.js colorForDay` reads the schedule, falling back to the old picker past the horizon. A hash test locks days 0..657. **#656 (2026-10-18) is still lipstick.**
   - WIP saves now carry the color name; a WIP whose day or color doesn't match today is discarded on load (pre-round-8 WIPs have no name; their day still pins the same color because the schedule preserved it).
   - Midnight rollover in an open tab (`checkDayRollover`, 20 s timer + visibilitychange/focus): an untouched or finished daily switches to the new day; a round in progress keeps its own day (`round.day`) — it scores/streaks as that day, then offers "Play today's color →".
   - Streak display only shows a live streak (`liveStreaks`: lastDay ≥ today−1); after a missed day the header no longer shows the stale number.
2. **Par fairness.** `engine.PAR_PCT = 85`, `engine.isDailyEligible(de) = accuracyFromDeltaE(de) >= PAR_PCT` (≈ ΔE ≤ 11.25 — note ΔE ≤ 11 would have needlessly cut 8 colors that can still hit exactly 85%). Used by game.js, the solver and the generated colors.js header; no hard-coded 12 remains. Under the round-7 model this gives 792 (exactly the 18 sub-par colors dropped). After the round-8 model re-solve: **860 / 981 daily-eligible**, every one able to clear par with its best mix.
3. **Mixing feel — tint over body** (engine header note 6; supersedes notes 4–5). Round 7 whitened twice (dilution × blend): 2 s of red into white (45% red) rendered #F5CACC, and `cfade` made 9–11% red/blue get *lighter* as pigment went in. Now pigments-only → body (cube + mud + black rules unchanged; mud still keyed to real white share), then one OKLab blend from white by a monotone cubic Hermite tint curve (`TINT_C 1.4`, `TINT_K 2.0`, `TINT_END 1.0`). 1 s pour from white: ΔE r 20.9 · y 15.0 · b 18.4 · k 24.7 (was 11.1 · 11.4 · 8.0 · 25.6); 2 s red → #F49E95-ish clear pink-coral. Bank re-solved (8 s): ≤2: 421 · 2–5: 203 · 5–8: 123 · 8–12: 136 · >12: 98; lipstick 90.5R/6.5B/3W, ΔE 3.31.
   - Trade-off (honest): with a fixed body, tint strength near white comes out of mid-range white response. Three round-7 bars were adjusted with in-line reasons: 3% tint ΔE ≥4 → ≥3.5 (renders 3.9), 5% ≥7 → ≥6 (6.1; new 10% ≥10 bar added); white-pour bar 8 → 7 for the half-white parent purple only (7.4; all saturated pots keep ≥8); black win-back judged by chroma/ΔE instead of L* (pure blue is only L* 30).
   - New tests: single pigment into white never lightens / never desaturates (0.25% steps), explicit 9–11% check; 1 s pour from white ΔE ≥ 15 for every pigment; 1 s r/y/b pour into 400 random pale pots min ΔE ≥ 5, median ≥ 12.
4. **No answer leak in duel/share links.** New format `?d=<day>&p=<pct>&x=<10 chars>` — `x` is the % composition masked with a day-seeded keystream (`engine.encodeDuelComp/decodeDuelComp`; obfuscation, not crypto). No `m=` hex. The friend's swatch is rendered from `x` only after the visitor finishes that day (teaser also covers a friend a timezone ahead). Legacy `?m=&q=` links still parse and show the hex the friend actually saw.
5. **Visuals.** Pour: flowing stream in the pigment color sized to an impact point on the surface, continuous pigment blooms + tinted ripples + splash droplets at the impact, a slow surface swirl, soft "glug" sound, light haptics (`navigator.vibrate`). Dropper: droplet falls to the pot centre and lands with a bloom, tinted ripple and splash. Surface color eases (.22 s). All transform/opacity, skipped under reduced motion; no dependencies. No numeric drop counter — the "no counts on the main screen" design lock stands (producer call if wanted). Reveal now scrolls into view on finish.

- Tests: **84/84** (72 prior, 4 adjusted as above, 12 new). Headless phone run (390×844, touch): pour/dropper/seal/reveal, duel visitor flow, legacy link, stale-WIP discard, clock-driven midnight rollover (#656 lipstick → #657 dark forest green), stale-streak hide — zero page errors. Screenshots: `/workspace/mixology-review-shots/v2/` on the Grok Bot box. Debug handle 1.6.0.

## Producer round-7 fixes (2026-10-18) — WHITE ANSWERS AT THE END + POUR BUCKET DEFAULT

Producer report after hands-on play of the round-6 build: **"I added white at the end and the color wasn't changing."** Plus a standing request: start on the Pour Bucket tool, switch to the Dropper only when wanted.

**Diagnosis (reproduced through real DOM events first — `playtest-harness/misnomer-round7-repro.js`).** The wiring is INNOCENT: clicking `#bucket-base` sets `selectedBucket = 'w'`, white taps/pours raise `w` correctly, and the shipped single-file embeds byte-identical sources (no `base`/`w` key mismatch anywhere — the round-6 rename was consistent). The bug is response shaping, suspect #3: white has no cube coordinate, so it acted only through the capped tint blend (`0.5 · tw^1.2`) and the slow strength shrink — the two weakest levers in the model. Measured on the round-6 engine: from strong late pots a 1 s white pour moved ΔE **3.94** (green 55Y/40B/5, orange 60R/35Y/5) to **6.41** (purple 45/45/10); 10 dropper taps moved ΔE **1.12–2.20** at ~0.2–0.35 per tap, with occasional hex-identical taps. The parent's live repro matched: {21R/31B/48W} → +10 taps ≈ ΔE 2 total, and at 74.3% white the mix still rendered rgb(172,134,180), L* ≈ 60 — a medium lavender where ¾ white paint should read pale.

**The fix (engine.js).** White now also DILUTES the cube coordinates: `dil = 1 − dilAmt · cfade(C)`, where `dilAmt` ramps 0 → 0.58 as white's share of the whole pot goes 0.06 → 0.55 and keeps growing by a 0.18 tail to 100% white; `cfade = clamp(C/11)` fades dilution in only under a real chromatic load, so whisper tints keep their strength. The tint blend was also strengthened: `0.5 · tw^1.2` → `0.6 · tw^1.0`. Results vs the round-7 bars (from ANY composition: 1 s white pour ΔE ≥ 8; 10 taps ΔE ≥ 2): worst pour across a 9-pot battery is **8.66** (the 87%-black pot — dilution can't act there, C = 0; it rides the blend alone) and worst taps **2.85**; the failing pots now read purple 18.1 / green 11.6 / orange 10.1 per pour-second, and the parent's purple answers 10 taps with ΔE 5.7 and a live 1 s pour with ΔE 18.4. Pale means pale: at 73% white the parent mix renders L* 81.8 (unit test asserts ≥ 75). One tuning casualty, caught by the suite: an intermediate cfade (C/15) made white pours into pale red mixes briefly *darken* (dilution releasing as chroma fell) — cfade C/11 removes it; a continuous 40-unit white pour now has zero L* dips. All other criteria hold: hue sanity, 95% saturation within ΔE ≤ 2.21 of full strength, tints (3% → ΔE 6.1, 5% → 7.5), mud recovery ΔE 21.5, black→red recovery ΔE 11.6, pour-level monotonicity sweep.

**Bank re-solved** (mapping changed): **810 / 981 eligible (was 835, Δ −25).** Every loss was already a marginal fringe fit (old ΔE 9.9–12.0 — pale greens, teals, pastels at the RYB gamut edge, now 12.0–13.4); zero still-eligible colors worsened by more than ΔE 3, and the pool still holds ~2.2 years of unique dailies. Distribution: ≤2: 390 · 2–5: 217 · 5–8: 102 · 8–12: 101 · >12: 171. ISCC grounding unchanged (866). A gentler dilution (0.42) was tried and rejected on evidence: it recovered fringe colors but dropped the parent's own pot to ΔE 7.16 — under the bar.

**Post-round lock (Part A item 4) — was genuinely ambiguous, now fixed.** After the 3rd seal the pot was not disabled, kept `cursor: pointer` and a full-color surface, taps were silently swallowed (not even an animation), and the reveal sat below the fold — a player adding white "at the end" of a finished round faced a dead pot indistinguishable from a live one. Now: `stage.locked` greys the surface (`saturate(.4)`), the cursor drops to default, and a press on the finished pot shakes it and smooth-scrolls the reveal into view. Dosing itself is unchanged (still refused after finish — but never silently).

**Part B — Pour Bucket is the default tool.** `selectedTool` initializes to `'pour'`, the static HTML pre-selects it (toolbar head + collapsed head show 🪣 Pour Bucket on first paint), and entering practice resets to it. The Dropper is the switch-to, as briefed.

- Tests: **72/72** (`node test/tests.js`; +7 round-7 contracts: white pour/tap bars over 9 strong pots, pale-at-74%, every-pigment share+render, disc-keys == engine COMP_KEYS, pour-default ×3 surfaces, locked-pot feedback). Two existing assertions were adjusted with reasons recorded in-line: navy L threshold 38 → 40 (the retune lightens mid-white mixes by design; the navy renders 39.8, still dark navy) and the no-cap test's shake clause (the shake returned — as the round-over signal inside `lockedFeedback` only; doses on a live round are still never refused).
- Browser check `playtest-harness/misnomer-round7-check.js`: **ALL PASS** on the real page and the rebuilt single-file playtest (179,290 B) — every disc driven through real DOM events, white taps/pour live on a strong purple, practice-entry tool reset, locked-pot shake + reveal scroll, zero page errors. Screenshot: `misnomer-r7-locked.png`. Debug handle version 1.5.0.

## Producer round-6 transplant (2026-10-18) — THE PERCENTAGE POT

The core model is replaced, per the producer's own design ("the pot is always 100% full; adding any paint raises its % and reduces the others proportionally, so it never goes above 100"). Supersedes the drops-accumulation model of rounds 1–5 everywhere below. The paused round-5 Pour Out workaround was CANCELLED and never built.

**The model.** State = composition `{r, y, b, k, w}` of percentages summing to exactly 100 (fresh pot: `w = 100`). A drop = 1 unit: dosing P by n units does P += n, then renormalizes ×100/(100+n) (`engine.addUnits`) — displacement, not accumulation. There is NO cap and no refusal: shares asymptote, the pot cannot overflow, and color is a pure function of the composition (path independence — same % → same hex, any history). Intuition: every unit moves a share by ~(100 − share)/100 regardless of how the pot got there, so response is uniform from ANY state — the exact property the drops model lacked twice (strength ceiling, round 4; volume lock-in, round 5).

**% → color mapping shipped** (same hand-tuned RYB cube corners): chroma C = r+y+b; strength `s = C / (C + 12·(1 − C/100))` — s(100) = 1 exactly, so a 100% pigment IS its cube corner and 95% lands ΔE 0.3–1.3 from full strength (criterion: ≤ ~6; the last 5% is the documented asymptote tax). Cube coordinates = s × shape(share), `shape(x) = 1 − (1−x)^4`, boosting pair shares toward their pairwise corner (50/50 → 0.94·s) so saturated greens/oranges/violets survive the trilinear average. Mud pull: balance-scaled (0 when any primary is absent), keyed to C/(C+w) past 0.45, max 0.9 — white breaks mud fast. Black damper share-based: `kd = k / (k + 25·(1 − k/100))`. White tint blend `0.5 · tw^1.2 · (1 − 0.85·kd)`, tw = w/(w+pigment). Tints: 3% red in white = ΔE 9.1 from white (clear pastel), 5% = 12.7.

**Acceptance vs the round-5 diagnosis** (`tools/stuck-diagnosis-round5.md`; replay script `tools/diagnose-stuck.js`):
- (a) Mud pot (round-5's 130/130/130-in-30, as 31/31/31% + 7% white): was **7.7 s** of white pouring to move ΔE 10 → now **ΔE 12.2 in 1 s** (30 units).
- (b) Black pot (200K-in-30, as 87% K): was **4.0 s** → now **ΔE 12.1 in 1 s**.
- (c) Both hard-stuck cap states: **unreachable by construction** — the engine exports no cap; after 5,000 consecutive black units the pot is 100% black and STILL recovers (white pour: ΔE 7.3 in the first second — the asymptote tip is the slowest point in the whole space — then 16.1 by 2 s, 25.8 by 3 s).
- Monotonicity: a 2,000-pour randomized sweep (random compositions × 5 pigments × 30-unit pours) shows ΔE-to-the-poured-pigment strictly decreasing in every case, zero frozen renders; the unit suite re-runs a 600-pour version of the sweep plus the purple→red hue-approach scenario (min 1 s step ΔE 4.2).

**Undo is gesture-based.** One snapshot per press/hold — a whole pour is ONE Undo step (round-5 diagnosis (c3): undoing one 3 s pour used to take up to 90 clicks).

**Bank re-solved** (`tools/solve-recipes.js` rewritten: 4% composition grid, 23,751 mixes → transfer-descent at 4/2/1/0.5/0.25/0.125% steps; recipes stored at 0.1% precision, stored ΔE recomputed from the rounded recipe). **Daily-eligible 835 / 981 (was 841).** Honest delta: 18 colors lost, 12 gained (diffed exactly against the old bank). The losses are boundary churn in the sRGB-extreme fringe — bright limes/yellow-greens (chartreuse 11.4→12.5, lime yellow 11.9→12.7…), the teal/turquoise edge (tealish green 9.7→12.0, turquoise 12.0→12.5), a few saturated purples/pinks (violet 11.5→12.3, shocking pink 11.8→12.3) — every one was already a marginal 11–12 fit (hard-mode day) in the old model; the gains are pale/mid greens and blues (washed out green 12.1→10.2, tea green 12.4→10.8…). Distribution: ≤2: 399 · 2–5: 217 · 5–8: 108 · 8–12: 110 · >12: 147. The cyan wall is unchanged (worst: cyan 21.7). Solver-fineness was NOT the limiter (a finer descent moved nothing) — the losses are gamut, not search. Judgment call, flagged per spec: −6 net (0.6% of the pool, still ≥ 800) was accepted rather than re-opening mapping constants that pass every playability criterion; ISCC grounding unchanged (866). Sanity: mustard = 85% Y, ΔE 0.52; banana = Y-led, ΔE 7.63; charcoal's canonical recipe now reaches its hex EXACTLY (ΔE 0.00) via a blue-led balanced mix + mud pull rather than the K bucket — the K route still works in play (80% K → L* 16.7).

**Duel links + saves.** Attempts now store `comp` (the % vector). Duel `q` = the five shares as %×10 integers in base36, r.y.b.k.w order (round-trip verified: decodes to 100.0%). Save format bumped to **v2 under the same key** (`misnomer.save.v1`) with a load-time migration: v1 drops vectors normalize to the compositions they represented (day-600 test save: drops {40,3,0,0,16} → comp r 67.8% / y 5.1% / w 27.1%), finished days and streaks survive, and a migrated save is persisted back immediately so migration runs once. Old duel links (drops-encoded) are not parsed by the new decoder — pre-launch, no live links exist.

**Tips rewritten** for the new model: the pot is always 100% full, each drop pushes the others down to make room, one drop = 1% of the pot, pour ≈ 30 drops/sec, Undo takes back a whole press or pour in one step. No Pour Out mention anywhere. White bucket's state key renamed `base` → `w` (DOM id `bucket-base` deliberately kept).

- Tests: **65/65** (`node test/tests.js`; old-model sections replaced with %-model contracts: composition invariants, displacement semantics, path independence, saturation/tint criteria, the diagnosis acceptance pair, no-cap contracts, gesture-undo/duel/migration source contracts). Browser check `playtest-harness/misnomer-round6-check.js`: **ALL PASS** on the real page and the rebuilt single-file playtest (174,323 B) — fresh 100%-white pot, dropper = exactly 1 unit (red 0.99%), 2 s pour → red 46.0% with the total still exactly 100 and a dead stop on release, ONE undo erasing the whole pour, a live r/y/b mess-around pot recovering ΔE 10.7 under a 1 s white hold, in-page diagnosis replay (12.2 / 12.1), full round, spoiler-free duel teaser, v1→v2 migration with reload persistence — zero page errors throughout. Screenshots: `playtest-harness/misnomer-r6.png` (fresh board), `misnomer-r6-recovered.png` (after the live recovery). Debug handle version 1.4.0.

## Producer round-4 fixes (2026-10-18)

Three hands-on-play fixes; supersedes round-3 details where they conflict:

1. **Pigment discs are pure color.** The five ring buttons are now full-color discs filled edge-to-edge — text labels (RED/YELLOW/…) and the inner swatch spans are deleted. `aria-label`s remain for screen readers; the white disc carries a strengthened border (#a2936f) so it reads on the cream background. Selected-state double-ring highlight unchanged.
2. **Pour Bucket is faster: 30 drops/sec** (round-3 shipped 12/s). Browser-measured ≈29 drops/s over a 2.9 s real mouse hold. Tips overlay text updated to match ("about 30 drops per second"). Dropper unchanged at 1 drop/click.
3. **BUG FIXED — "purple pot, kept pouring red, color stopped changing."**
   - **Reproduction (old engine):** from 60R+60B, hue was pinned at ~285° for 600 consecutive added red drops; from 40R+40B it froze at ~321° after ~30 drops; the rendered hex was *identical* for stretches of 80–120 consecutive drops (ΔE per 10 drops = 0.000). From any purple the mix asymptoted to a fixed magenta and never approached red.
   - **Root cause:** the mixing model's coordinates were absolute strengths, `clamp(drops/60, 0, 1)` — at 60 drops a pigment's trilinear cube weight is mathematically frozen, so the cube color cannot move toward a poured pigment at all. The only term still responding was the white-tint blend `0.5·tw^1.2`, whose per-drop effect decays as 1/total² and quickly falls below hex resolution. The black damper `k/60` saturated the same way. (Backstop: past 240 drops/pigment, `dose()` also silently clamped doses at MAX_DROPS while still pushing undo entries.)
   - **Fix (engine.js `mixRaw`):** coordinates are now proportion-driven — `drops / max(FULL_DROPS, chroma/2)`. Below a total chromatic load of 120 drops the model is bit-identical to before; past it, coordinates track each pigment's *share* of the load, so pouring keeps raising the poured pigment's share and hue keeps traveling toward it for as long as you pour (real paint behavior). Supporting changes: a balance-scaled mud pull (0 at any absent primary, growing with balanced load) keeps all-three-heavy mixes darkening instead of stalling at the cube center; the black damper is share-based (`k / max(60, 0.6·total)`) so a chromatic pigment poured long enough can win the pot back from black. **MAX_DROPS raised 240 → 1200** (40 s of continuous pouring on one pigment) and hitting it is now a *visible refusal* — `dose()` returns false, pushes no undo entry, and shakes the pot; a pour stops dead at the cap. No silent no-op dosing remains anywhere.
   - **Acceptance (engine test + browser):** purple 60R+60B + red sampled every 30 drops (= 1 s of pouring) out to +300: hue's distance to red strictly decreases at every step (285° → 346°) and every step moves ≥0.5 ΔE. In the browser, a real 2.9 s mouse hold on the purple pot changed the rendered surface color at every 300 ms sample: rgb(132,59,156) → rgb(163,52,113).
   - **Solver consequence:** model changed, so `tools/solve-recipes.js` was re-run. **Daily-eligible is unchanged: 841 / 981.** ΔE distribution shift is minimal — ≤2: 408→402 · 2–5: 224→230 · 5–8: 95→96 · 8–12: 114→113 · >12: 140→140 (the cyan family remains a hard RYB gamut wall, identical worst fits). ISCC grounding unchanged (866).
- Tests: **52/52** (round-4 additions: purple+red monotonic-response acceptance, hex-freeze regression, black win-back, cap-refusal contract, unlabeled-disc contract; mud test rewritten to the new darken-with-load behavior; pour-rate and tips-text assertions updated). Browser check `playtest-harness/misnomer-round4-check.js`: discs, purple+red hold, dropper, full round — all pass on the real page and the rebuilt single-file playtest (168,775 B), zero page errors. Screenshots: `playtest-harness/misnomer-r4.png` (unlabeled ring), `misnomer-r4-pour.png` (after the red pour). Debug handle version 1.3.0.

## Producer round-3 overhaul (2026-10-18)

Display name is now **MIXOLOGY** (wordmark, `<title>`, day label, share-text header). Internal identifiers deliberately unchanged: file names, `misnomer.save.v1` storage key, `window.MISNOMER`, duel-link format — existing saves carry over. Supersedes the round-2/v1 descriptions below where they conflict:

1. **Two tools only.** Spoon and the fixed-dose Pour are deleted. **Dropper** = 1 drop per pot click. **Pour Bucket** = press-and-hold on the pot, pouring at **12 drops/sec** (whole drops, interval timer), stopping on release / pointer-cancel / lost capture, auto-stopping at the per-pigment cap. No dosages anywhere on the tools — dosages live only in the Tips overlay.
2. **Animations.** Dropper: a pigment-colored droplet falls from above the pot into the surface (WAAPI transform/opacity, ~330 ms) and lands with an expanding ripple ring in the mix surface. Pour: a bucket glyph at the pot's top-right rim tilts ~46° while a pigment-colored stream flows into the pot; ripples spawn periodically during the pour. All effects are transform/opacity only; `prefers-reduced-motion` disables them in JS and CSS.
3. **Radial layout.** The pot is a circular vessel (gradient rim + inset-shadow surface that fills with the mix color) centered in a `#stage`; the 5 pigments are 64 px circular swatch buttons in a ring around it (R top, Y upper-right, B lower-right, K lower-left, W upper-left), selected pigment gets a double-ring highlight. All dosing input lands on the pot itself. Verified at 430×860: the full ring fits (pot Ø187 px on a 398 px stage) — no arc fallback needed.
4. **No counts on the main screen.** The recipe readout line and the per-bucket drop tallies are deleted from the page, the CSS, and `renderAll`. Main screen = name, stage, toolbar, attempt slots, seal/lock actions.
5. **Collapsible toolbar.** A bottom card whose head always shows the selected tool + a chevron toggle (aria-expanded); the body holds Dropper / Pour Bucket + Undo + Reset. Default expanded.
6. **Tips overlay.** Header "Tips" button opens a modal (✕, backdrop click, or Escape to close) with how-to-play, the tool dosages (Dropper 1 drop/click; Pour Bucket hold, ~a dozen drops/sec), % accuracy explained, and the daily cadence.
7. **Attempts are % only — no hints.** `seal()` no longer computes feedback text; attempt slots and the last-result line show swatch + % only. `hintFor` remains in engine.js unused; a test asserts game.js never references it (the word "hint" no longer appears in game.js at all).
8. **Input model.** Dosing moved from `click` to `pointerdown` (+ pointer capture) so holds work; the trailing mouse click is ignored (`detail > 0`) and keyboard activation (Space/Enter, `detail === 0`) doses exactly one drop — verified no double-dosing from either path. `MISNOMER.dose()` still doses exactly 1 drop of the current selection (v1.2.0).
- Tests: **47/47** (round-3 contract tests added; spoon/tally/hint-era assertions replaced). Browser check `playtest-harness/misnomer-round3-check.js`: dropper = exactly 1, keyboard = exactly 1, hold ≈1.5 s → +20 drops with stream/bucket visible mid-hold and a clean stop on release, toolbar collapse/expand, tips open/close both ways, full round + reveal + renamed share header, reload persistence — all pass on the real page and the rebuilt single-file playtest (165,601 B), zero page errors. Screenshots: `playtest-harness/misnomer-r3.png` (layout), `misnomer-r3-pour.png` (mid-pour).



## Producer round-2 edits (2026-10-18, after the reveal-recipe removal)

Three of Jon's calls landed on top of v1; the sections below that describe the old behavior are superseded by this addendum:

1. **Live caption REMOVED.** The "Your mix currently reads as: X" line is gone from the page and from game.js — players get no naming feedback while mixing; feedback exists only on sealed attempts (% + word hint). `nearestColorName` remains in engine.js as an unused export; nothing in gameplay consults it, and the target name is never rendered pre-reveal. (Supersedes the "Live caption names the nearest bank color…" bullet below.)
2. **Dosing is pot-click.** Buckets and tools are pure selectors (highlighted `.sel` state); each click/tap on the **pot** — now a real `<button id="pot">` with keyboard Enter/Space activation — adds the selected tool's drops of the selected bucket. Bucket buttons no longer dose. On-screen instruction now reads: **"Pick a color and a tool, then tap the pot to add."** Debug API: `MISNOMER.dose()` doses the current selection (mirrors a pot click); `dose(bucketKey)` selects first, then doses. `dilute` is removed from the API.
3. **WHITE is a full 5th bucket** (`data-bucket="base"`, key `base` in the drops vector), dosed by Dropper/Spoon/Pour like any pigment — it raises the base component, lightening/desaturating the mix. The **Dilute button is removed** (white supersedes it); Undo/Reset unchanged. The pot readout line now reads `R n · Y n · B n · K n · W n drops`. The mixing model itself did not change (white was always the base component), and the duel link already carried `base` — round-trip verified live incl. added white.
- **Solver re-run after the edits:** identical result — ΔE distribution unchanged, **daily-eligible 841 / 981 before and after**. Tests: **39/39** (9 new: white-dosing monotonic lightness, pastel conversion, white-only stays white, caption-absence and UI-contract assertions). Live browser check (`playtest-harness/misnomer-round2-check.js`): select-only buckets, pot-click dosing, keyboard dosing, white dosing + undo, duel round-trip — all pass, zero page errors. Single-file playtest rebuilt (156,222 B) and re-verified.

## Files

| File | Size | Role |
|---|---|---|
| [index.html](sandbox://workspace/game-projects/misnomer/index.html) | 11,244 B | Page + inline CSS, stable element ids for playtest |
| [game.js](sandbox://workspace/game-projects/misnomer/game.js) | 16,357 B | Controller: rounds, saves, duels, share, sound, `window.MISNOMER` |
| [engine.js](sandbox://workspace/game-projects/misnomer/engine.js) | 11,612 B | Pure logic: RYBK mixing, RGB→Lab, CIEDE2000, % mapping, hints, daily picker |
| [colors.js](sandbox://workspace/game-projects/misnomer/colors.js) | 117,838 B | Bank: 981 colors with canonical recipe + solver ΔE + ISCC grounding |
| [tools/build-bank.js](sandbox://workspace/game-projects/misnomer/tools/build-bank.js) | 6,313 B | Bank builder (XKCD + CSS/X11 + authored) |
| [tools/solve-recipes.js](sandbox://workspace/game-projects/misnomer/tools/solve-recipes.js) | 5,838 B | Offline canonical-recipe solver |
| [tools/xkcd-rgb.txt](sandbox://workspace/game-projects/misnomer/tools/xkcd-rgb.txt) | 19,307 B | XKCD source list (CC0, per file header) |
| [tools/nbs-iscc-raw.txt](sandbox://workspace/game-projects/misnomer/tools/nbs-iscc-raw.txt) | 8,634 B | ISCC–NBS 267 centroid list (source) |
| [tools/recipe-report.json](sandbox://workspace/game-projects/misnomer/tools/recipe-report.json) | 3,115 B | Solver distribution + worst fits |
| [test/tests.js](sandbox://workspace/game-projects/misnomer/test/tests.js) | 8,091 B | 30 unit tests, all passing |

## The game (as specced, with Jon's refinements)

- Name-only prompt, never a target swatch before the reveal. Pot of white base; **four buckets R/Y/B/K**; **drops are the canonical unit everywhere** — the pot state is a drops vector `{r, y, b, k, base}`, fresh pot = 30 base drops.
- **Toolbar:** Dropper = 1 drop, Spoon = 5 drops, Pour = 20 drops per tap on a bucket; Dilute = +10 base drops; Undo (dose stack, incl. reset snapshots); Reset pot. Why these values: full pigment strength = 60 drops, so a Pour is ⅓ strength, a Spoon a fine shade step, a Dropper the trim step; canonical recipes land in the 5–60 drop range per pigment, which keeps typical rounds to ~5–15 taps.
- Live caption names the nearest bank color to the current mix, **excluding the target** (it can never leak or confirm the answer).
- 3 sealed attempts per round; each returns % + one words-only hint from the dominant Lab axis ("way too yellow — pull it back toward blue", etc.). Pot carries over between attempts. "Lock it in" finishes early; the **last sealed attempt is the score**. Reveal: official vs. your swatch, final %, band, ΔE, **official recipe vs. your recipe in drops** (base shown only when non-standard), streak update, share + duel link.
- Practice mode: random eligible color, unlimited rounds, no streak/history writes. Save layer: localStorage adapter, write-on-change (debounced + `pagehide` flush), key `misnomer.save.v1`.
- Minimal WebAudio clicks/seal chirp/reveal arpeggio with persisted mute. No assets, no build step.

## % accuracy formula (the score — Jon's lock)

`accuracy = clamp(round(100 · max(0, 1 − (ΔE00/50)^1.25)), 0, 100)`

Checkpoints: ΔE 0→100 · 2→98 · 5→94 · 10→87 · 20→68 · 35→36 · ≥50→0. Chosen because ΔE ≤2 must read ≥97 (it reads 98), a good-but-imperfect mix (ΔE 5–10) lands 87–94, and the curve steepens through the mid-range instead of the long flat tail of a linear map. Bands are flavor only: ≤2 DEAD ON · ≤5 PAINT-STORE MATCH · ≤10 CLOSE COUSIN · ≤20 SAME FAMILY · ≤35 DISTANT RELATIVE · >35 ABSTRACT INTERPRETATION. Par = 85% (drives the par streak).

## Mixing model

RYB trilinear cube in RGB space, strengths = min(1, drops/60), then a black damper (blend toward RGB(10,10,12) by 1 − 0.94·kd) and a tempered white-tint blend (0.5 · tw^1.2 · (1 − 0.85·kd), tw = base share). Cube corners (RGB):

| corner | value | corner | value |
|---|---|---|---|
| white | 255,255,255 | red+yellow (orange) | 247,118,18 |
| red | 214,40,46 | red+blue (violet) | 122,44,148 |
| yellow | 255,205,0 | yellow+blue (green) | 46,164,58 |
| blue | 28,64,150 | all three (mud) | 52,40,34 |

Hue sanity (all asserted in tests): blue+yellow → green (90–160°), red+white → pink, blue+white → light blue, red+yellow → orange, all-three-heavy → mud L*≤30, white+little black → near-neutral gray, blue+black → navy (hue + value), black alone → charcoal depth.

## Bank: 981 colors, tiers by source

- **XKCD color survey (907):** the full 954-name list fetched from xkcd.com/color/rgb.txt (file header licenses it CC0/public domain). Each name's official value = its survey RGB. A family-friendly filter dropped 27 (bodily-function names: vomit/poop/shit/puke/snot/booger/diarrhea family).
- **CSS/X11 (39 net-new):** spec color keywords not already in XKCD.
- **Hand-authored (35):** deep shades the K bucket unlocks (charcoal family, navies, wines, forests, espresso, slate…), generic descriptive names only — no paint-brand coinages.

**Canonical recipes + eligibility (solver, build-time):** coarse grid (85,683 mixes) → ΔE76 prefilter → ΔE2000 → coordinate descent to 1-drop steps. Distribution of best-recipe ΔE00 across the bank: **≤2: 408 · 2–5: 224 · 5–8: 95 · 8–12: 114 · >12: 140**. **Daily pool = 841 colors with ΔE ≤ 12 (86%)**; the picker draws only from those. The 140 failures are reported, not dropped — full list + recipes in `tools/recipe-report.json`. Worst fits are one family: cyan / bright turquoise / bright aqua / robin's egg (ΔE 19–23) — the classic RYB blind spot (below).

**ISCC–NBS grounding:** the 267 published ISCC–NBS centroid colors (NBS/Inter-Society Color Council; public-domain standard, digitized as the Voluntocracy/Foster reconversion of Mundie's centroids — `tools/nbs-iscc-raw.txt` preserves its provenance notes, including that some bright centroids are gamut-clamped). Each bank color carries `iscc` = name of its nearest centroid when within ΔE00 10: **866 of 981 grounded**. The ISCC names describe the official value's standard block; they don't replace the survey values (XKCD stays canonical per the producer call).

## Tests — 30/30 passing (`node test/tests.js`)

- CIEDE2000 vs. Sharma reference pairs: 6 pairs within 0.1 (2.0425, 2.8615, 3.4412, 1.0000 ×2, 7.1792). **One documented exclusion:** the row (50, −0.9009, −84.2393) vs (50, 0, −82.7485) circulates with expected 1.0000, but two independent implementations of the published formula both compute 0.7504 — I excluded it as a likely transcription error in secondary sources rather than force the engine to match it.
- RGB→Lab anchors (white, sRGB red); % mapping monotonic + checkpoints; 8 mixing hue/value tests incl. the new K-bucket tests (gray, navy, charcoal).
- Drops determinism (same vector → same color across module reloads); daily picker deterministic + 300 distinct days inside one epoch (shuffle-bag guarantee is per-epoch; a repeat is possible across an epoch boundary ~2.3 years apart at pool size 841).
- Solver sanity: mustard's canonical recipe is Y-dominated (110 Y · 5 R · 10 B · 5 K, ΔE 0.55); charcoal leans on K (50 drops, ΔE 0.32); banana Y-dominated (ΔE 7.84); stored recipes reproduce their stored ΔE on a 40-color sample.
- `node --check` clean on all JS; local serve: index/engine/colors/game all HTTP 200.

## Duel links

`?d=<day>&m=<mix hex>&p=<pct>&q=<drops r.y.b.k.base in base36>` — e.g. `q=c.32.0.5.19` = 12 R · 50 Y · 0 B · 5 K · 45 base. Played visitor → side-by-side duel card with winner line. Unplayed visitor on today's link → teaser only, **their mix and % stay hidden until the visitor finishes** (no advantage, no spoilers); past-day link with no local play → their card alone. Share text is the locked spoiler-safe format (name + ██████ + %s + streak + duel link; official hex never appears).

## Known weaknesses (honest)

1. **Cyan/turquoise is unreachable.** RYB physics: the cube's blue→green edge can't produce cyan-family colors (140 bank colors fail eligibility, worst ΔE ~23). They're excluded from dailies, so no unwinnable days — but a player who *thinks* in cyan gets no help from this paint box. Real fix would be a 4th pigment (a true cyan), which breaks the classic RYB fantasy; revisit only if playtests complain.
2. **RGB-space trilinear interpolation is not spectral mixing.** Dark secondaries skew muddy faster than real paint and some mixtures (violet especially) read duller than quality gouache would. It passes every hue test and 86% of the bank solves to ≤12, but a paint-feel pass (playtest) may want corner tuning — corners are one table in engine.js, tuning is cheap.
3. **Saturated brights are hard mode.** XKCD's survey values include near-gamut-edge colors (pink ΔE 10.6, banana 7.8) whose canonical recipes sit at the cube's limits; they're eligible but a 95%+ on those days will be rare. Consider a fairness weighting in the picker later (favor ΔE ≤ 8 colors) if day difficulty feels spiky.
4. **colors.js is 118 KB** because every entry carries its recipe. Fine for v1; gzip ≈ 30 KB, and a future split (recipes only needed at reveal) could lazy-load.
5. Solver took ~54 s for the full bank — build-time only, rerun `tools/build-bank.js && tools/solve-recipes.js` if the bank changes.

## For the parent playtest

Open `index.html` from the project dir (any static server). Buttons have stable ids (`btn-seal`, `bucket-r`…, `tool-spoon`, `btn-dilute`, `btn-undo`, `btn-finish`, `btn-share`, `btn-duel`). `window.MISNOMER` exposes `state()` (includes target hex — debug only, never rendered pre-reveal), `dose/dilute/undo/resetPot/seal/finish`, `selectBucket/selectTool`, `startPractice/exitPractice`, plus `engine`, `bank`, `pool`, `today`.
