# Mixology: Daily Color Mix

One color name a day, the same for everyone. You're told what today's color is
*called* — never shown it. Dose paint into the pot, guess what the name looks
like, and get scored on **% accuracy** (perceptual distance, CIEDE2000) when
you seal **2 attempts** (round 9; your best attempt is your score, the round
ends by itself after the 2nd — there is no early "lock it in"). The reveal is a side-by-side: the official color vs
your mix, and your %.

## The pot model (the heart of the game — read before touching engine.js)

The pot is a **composition vector `{r, y, b, k, w}` that always sums to
exactly 100** once it holds paint. Round 83 (Franklin): it **starts EMPTY**
(all zeros, `E.FRESH_COMP`, shown as an empty bowl). The first drop makes it
100% that paint, and taking out the last paint empties it again (`addUnits`).
Before round 83 it started as 100% white, and that white was real paint in the
mix, the disc numbers and the score. Dosing is *displacement*: adding n
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
- **Shipping UI changes** (round 32): bump `version` in game.js and the `?v=` on all six `<script>` tags together (a test enforces the match). Pages caches for about 10 min, so without this a returning visitor can get new game.js with old index.html, or the reverse.
- **a11y baseline** (rounds 17, 21, 26): axe-core is clean in 12 states (light/dark × home, reveal, calendar, stats, tips, welcome). Keep `<main id="app">`, the `#sr-announce` live region, `aria-pressed` on pigments and tools, and `--muted` at ≥ 4.5:1.
- **Keyboard shortcuts** (rounds 40, 57, 60): 1–5 pigments, D/P tools, Z undo, PgUp/PgDn months. There is deliberately **no seal key**, so an attempt can never be sealed by accident. Shortcuts are ignored in dialogs and fields, and they announce changes to screen readers by naming the control, never the mix.
- **Forced colors** (round 51): any new element whose *meaning* is a paint color must join the `@media (forced-colors: active)` `forced-color-adjust: none` list, or it vanishes in High Contrast mode.
- **Contrast and motion preferences** (rounds 52, 59): `prefers-contrast: more` is palette-only, like dark mode. Entrance animations are transform-only (never text opacity), and the global reduced-motion rule switches them off.
- **Install screenshots** (round 45): `icons/screenshot-*.png` must show an unmixed board, with no mix and no recipe. Re-shoot them if the layout changes a lot.
- **Sharing never names the color** (round 12): the share text and PNG card use the hook
  line instead of the name and show no colors or recipes. The card is drawn by `drawShareCard`.
- **100% is reachable** (round 77, Franklin): recipes are whole percents (`tools/whole-drop-recipes.js`), and a color's scoring target is the color its recipe renders (`E.recipeHex`, `c.thex` in game.js), not the raw XKCD/CSS hex. The raw hex only decides how well a recipe represents the name (`de`, eligibility).
  - An attempt whose disc numbers equal the recipe's numbers is an exact match: 100%, ΔE 0, DEAD ON (`E.scoreMix`).
  - Every pool recipe is reachable with whole drops and '−' taps from a fresh pot (`E.wholeDropPath`, tested).
  - The official color shown at the reveal, in the calendar and in the Collection is the recipe color. Collection discovery is ΔE00 3 from recipe colors, with no hard-color margin. Names sharing one recipe color are discovered together.
- **Stars only on the color of the day** (round 94, Franklin): a Collection color shows a star only if the player played a daily whose target was that color. That means a `days` record with that name; on a duo day both colors count. The star comes from the best % of those daily attempts at it (`E.collectionStar(name, days)`), never from `collectedBestPct`.
  - Twins (names sharing a recipe color) and nearby finds are still discovered and show their best %, but carry no star. Their detail says "Found by a nearby mix. Stars are earned only on the color of the day."
  - It is derived from the save, so it applies retroactively. `collection.data` is never pruned.
  - Discovery toasts never mention stars.
- **Duo days** (round 93, Franklin): only days listed in `DUO_DAYS` in game.js are two-color days. The only one is internal day 669, **Mixology #14 (Sat Oct 31, 2026), the Halloween Duo**: Pumpkin (the scheduled color) followed by Midnight Purple. There is no weekly duo yet. Each color gets two attempts, best one counts, and the day's `pct` is the **average** of the two bests.
  - One day record holds color 1's `name`/`attempts`/`hex`, plus a `duo` sub-object (`names`, `parts`, `pcts`, `hexes`, `des`). That way save transfer, streaks, stats and the collection keep working unchanged.
  - Everything is gated on `duoFor(day)`, so nothing about a duo is visible before that local date.
  - The duo share card shows the player's own pumpkin (their two mixes) with the average and both per-color %. It never shows names or recipes.
  - The duel link adds `&y=` for color 2. A link without `y` degrades to a no-spoiler card.
  - The clip tools in `/workspace/game-clips` read `DUO_DAYS`: `make_clip.js --story` films both colors, and `make_cover.js` draws the pumpkin.
  - Every other day must play and share byte-identically to a non-duo build.
  - Saved history is never rescored. Duel links carry `s=2`; older links with a mix are rescored on open.
- **One hint after attempt 1** (round 77, Franklin, overriding the "no hints" lock below for that moment only): `E.mixHint` gives the 1–2 biggest issues in plain words (lightness, muted/strong, which hue to lean toward). 97–99 gets "So close!" and 100 gets "Perfect match!". There are never amounts, numbers or the recipe. It shows under attempt 1's result until attempt 2, and is never in share text, duel links or the card.
- **Title** (round 77): "Mixology: Daily Color Mix" in `<title>`, og/twitter titles and the manifest `name` (`short_name` stays "Mixology"). The header wordmark stays "MIXOLOGY." with a small "Daily Color Mix" line under it. Share text keeps "MIXOLOGY #N — How well do you know your colors?".
- **No hints** on attempts (just %; see round 77 above for the single post-attempt-1 hint), **no live caption** naming the mix,
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
- **Star badges** (round 74, re-pointed in round 75, Franklin): a small star in a swatch corner for the displayed %. 85–89 bronze (par), 90–96 silver, 97–99 gold, 100 diamond (icy faceted). Since round 76, only the diamond animates: a gentle halo pulse and a staggered twinkle, opacity/transform only, badge only. Under reduced motion it shows a stronger static glow and glint instead. They appear on Calendar circles (that day's best), Collection tiles (best mix against that color) and the reveal's "Your mix". Stars are derived from saved scores and never stored, they never cover the % in a calendar circle, and they always carry spoken words (e.g. "silver star: 97%+"). Stars never go into share text or the image card.
- **Holiday colors** (round 72, Franklin): `tools/build-schedule.js` gives future holidays a themed, daily-eligible color (`tools/holiday-colors.js`, rotated by year) and shows a small header tag such as "🎃 Halloween". Frozen days are never touched, and the 120-day no-repeat rule still holds. Lunar-calendar holidays come from tables (2026–2035).
- **Header and panels** (round 71, Franklin):
  - Calendar, Stats and Collection each have their own icon button with an aria-label, and their own dialog with a title (no sub-tabs). The header's right side is two rows (four icons, then Tips and Practice) and fits at 320px.
  - User-facing copy says **Submit** ("Submit attempt 1", "Submit final attempt", "submitted"), never "Seal"; internal names may stay.
- **No selection/callout in the play area** (round 70): play-area elements are user-select/touch-callout none and cancel contextmenu and selectstart. The pot and badges also cancel touchstart. Reading text (Tips, reveal, calendar) stays selectable.
- **Collection** (round 69, Franklin): a third Calendar overlay tab with every daily-eligible, non-retired color (853).
  - A seal discovers the nearest one within ΔE00 3 of its recipe color (round 77; before that, of the named hex with a hard-color margin), or the round's own target if it is within reach.
  - Discoveries are announced only at the reveal (no clues mid-round). Today's or the open round's color stays "?" until the round is finished.
  - The official recipe shows only for colors the player has **finished as a daily** (round 73). Pre-launch days, missed days and upcoming colors never reveal a recipe, because colors recur in the schedule.
  - Own key `mixology.collection.v1`, backfilled from saved days.
- **No traces; paint can be taken out** (round 68, Franklin): a paint under 0.5% of the pot snaps to 0 (engine `snapTraces`, also used by the solver, so every recipe has each paint at 0 or at least 0.5%). Disc numbers are whole and always sum to 100, with no "<1%". Each disc holding paint has a separate "−" badge outside it: a tap removes ~1%, a hold follows the bucket ramp, and one undo step covers a whole hold.
- **Dialogs never hide their close button** (round 80, iPhone tester): Calendar, Stats, Collection and Tips are `.ov-dlg` columns, with a fixed `.ov-head` row (title plus a 40px ✕, 48px tap area) above an `.ov-body` that scrolls on its own. The panel is capped by the overlay box, with a `100dvh` fallback. The overlay pads by `env(safe-area-inset-*)`. Never cap a dialog with plain `vh`: on iOS that is the large viewport and pushes the header off screen. Never put the ✕ inside the scrolling part. Escape and tapping outside close every dialog, and a dialog opens scrolled to the top. The welcome card scrolls too, so "Let's mix" is reachable in landscape. Checked at 320×568, 375×667, 390×844 and landscape.
- **Nothing drawn on or in the pot** (round 67, Franklin): no swirl, bloom, ripple, splash or color spot. The pot surface only eases to the mix color. Rigs, stream and falling drop may animate *toward* the pot.
- **It is DAILY, and the game says so** (round 82, Franklin).
  - The day rolls over at **local midnight**: `dayNumber` counts local calendar days, and the countdown targets `dateForDay(DAY + 1)` (= `E.nextDayStart`, DST-safe).
  - Right under the reveal's result, a prominent "Next color in 6h 12m 08s" ticks every second (`E.formatCountdown`). Under it is the streak line (`E.comeBackLine`: N-day streak / start a streak / plain).
  - At zero, a finished round is **not** swapped under the player. The block turns into "Today's new color is ready" with a button. An untouched round still switches by itself.
  - A player who reopens after finishing today gets a top banner under the color name: done, the countdown, "See your result ↓" and "Practice (doesn't count)".
  - The welcome card's first step reads "One new color every day."
  - Share text is unchanged.
- **"Hold to pour" first-time label** (round 81, Franklin): the one exception to "nothing on the pot".
  - A static, dark "Hold to pour" label with a small hand icon sits centered on the empty pot (light text on the dark empty bowl in dark mode).
  - It shows only to a browser with no saved day, no day in progress, and no `mixology.poured.v1` flag.
  - The first drop (any dose path, via `applyUnit`) sets the flag and fades the label out once. It never shows again, not after undo, reset or reload.
  - It uses `pointer-events: none` and allows no selection or long-press callout.
  - While shown, the pot's aria-label starts with "Hold to pour."
  - Keep it static: no pot animation.
- **The pot starts empty** (round 83, Franklin). White is a paint you add on purpose, never a base.
  - Submit stays disabled, with "Pour some paint into the pot to submit.", until the pot holds paint. `seal()` refuses an empty pot too.
  - The "−" badge also shows at 100%, because taking out the last paint empties the pot.
  - Recipes, schedule and past scores are unchanged. Every pool recipe is exactly reachable from the empty pot (tested for all 853).
  - An in-progress save whose pot is exactly the old untouched 100% white loads as empty. Any other saved pot loads as it is.
- **Practice counts for nothing** (round 84, Franklin). A practice round never writes the save: no day, streak or stats, no Collection discovery or best %, no star, no recipe unlock, no analytics event. `collectRound` runs only for dailies, and the old `practiceRounds` counter is no longer bumped.
  - Its end screen shows its own score and "Your mix", but no star. The official recipe row appears only if the player has finished that color as a daily (`E.officialRecipeVisible`, the round 73 spoiler rule). Otherwise it shows "The official recipe unlocks once you finish this color as a daily." (hidden on an exact match).
  - The label "Practice — doesn't count toward stars, recipes or collection" sits on the practice bar and at the end of the reveal.
  - Saves from before round 84 may hold Collection entries made or raised by practice. `MISNOMER.practiceAudit()` (`E.auditCollectionSources`) lists them read-only; nothing is removed.
  - Round 85 (Franklin, option A): the Collection shows a **view** (`E.collectionView`, `collectionView()` in game.js). Practice-only entries are not shown and not counted. Entries raised by practice show their daily-only best % and star. A "practice" entry whose color is a finished daily's color (same name or same target color) counts as daily, because it may be a find from before round 77. The stored `mixology.collection.v1` is never pruned, so the change is reversible. The grid, the count and the detail all read the view, and a daily that re-finds a hidden color toasts it as new.
- **Sharing is image-only** (round 87, Franklin). Share result sends only the PNG card, with `navigator.share({ files })`: no text and no URL. Fallbacks in order: copy the image to the clipboard, download it, and only if no image can be made, copy one short line (`shareLine`: number and %, no name, no link). The card is drawn at the reveal so the share sheet opens within the tap. It carries a small "● mixologydaily.com" wordmark, plus the number, score, tries and streak, and never the name, the color or a recipe. Duel links are unchanged (challenge line plus link). The `share` event is kept.
- **A phone round fits one screen** (round 87, iPhone tester), for `max-width: 600px` only, so desktop is untouched.
  - The spacing is tighter.
  - The stage (pot and ring, scaled as one piece with the aspect ratio kept) is `clamp(250px, (100dvh − --fit-chrome − safe-area) / .88, 100%)` wide. `fitStage()` measures --fit-chrome once per round and on resize.
  - Paint discs scale with the stage but never go under 48px.
  - Below 700px tall the hook sub-line and the toolbar header are hidden (the tools stay open).
  - Submit is sticky at the bottom while playing.
  - Checked at 375×667, 320×568, 390×844 and 430×932.
- **Family-friendly names** (round 66): gross or bodily names are BANNED (dropped) or RETIRED in `tools/build-bank.js`. Retired names stay in colors.js (`retired: true`) only so frozen past days and old saves resolve. Never schedule them or offer them in practice.
- **The daily schedule is frozen data** (`schedule.js`, round 8). Never
  derive a day's color from the pool size again; past days, duel links
  and today's color must not move when the bank or pool changes. Change
  future days only with `node tools/build-schedule.js`.
  - Round 96 (Franklin): one future day was swapped by hand. Internal day 664, **Mixology #9 (Mon Oct 26, 2026)**, is now **Coral** (#FC5A50) instead of Banana, which was nearly identical to #3 Manilla. Coral is daily-eligible and not used within 120 days (its nearest uses are days 436 and 1648), so `build-schedule.js` keeps it on a rebuild.

## Moving to mixologydaily.com (round 86)
- The app is path-agnostic: every asset and manifest URL is relative, so it runs at `/mixology/` and at a domain root `/`. The canonical and og:url are `https://mixologydaily.com/`. og:image stays on github.io until the switch, because GitHub's 301 will carry it over.
- `transfer.js` loads **before** analytics.js and game.js. It reads `#import=m1.<len>.<data>` (UTF-8 JSON of every Mixology key, LZW, base64url), validates it, **merges** it, strips the hash (`history.replaceState`), and game.js shows "Your progress moved over ✓".
  - **Merge rules:** days are unioned, with the best % per day kept (a tie keeps local). lastDay is the max. streak/parStreak follow the latest side and are re-derived from the merged days, so a run split across origins joins. A WIP is kept unless its day is finished. The Collection is unioned with the best mix and the earliest date kept. Onboarding flags are unioned, an analytics opt-out always carries over, and today's sent-flags are unioned (no double count).
  - Bad links are rejected and change nothing. Importing twice is a no-op.
- **Flags (`MixTransfer.CONFIG`), all off:**
  - `DOMAIN_LIVE`: share/duel links, the card text and the Tips "Move my progress" button switch to the domain.
  - `MIGRATE_TO_DOMAIN`: github.io redirects to the domain with the save, once the domain answers.
  - `BRIDGE_URL`: on the domain, a browser with no save pulls once from a bridge page on the old origin (`tools/transfer-bridge/`).
- Switch order and DNS: `/workspace/research/mixology_domain_switch.md`. GoatCounter keeps code `ngtrooper`. After the switch, page views are `/` instead of `/mixology/`.

## Roadmap (design notes, not built)
1. ~~**Domain move to mixologydaily.com.**~~ **Done in rounds 88–89 (v1.29.0):** the game is served at https://mixologydaily.com/ with the bridge `ngtrooper/mixology-move`. Remaining manual steps: verify the domain on the GitHub account, set the GoatCounter domain, and confirm support@ forwarding. The transfer code shipped in r86 with its flags off. Run the steps in `/workspace/research/mixology_domain_switch.md` (bridge repo, DNS, custom domain, Enforce HTTPS, `DOMAIN_LIVE`, GoatCounter domain, support@ forwarding, then a support link in Tips).
2. **Optional accounts (after the move).** Supabase free tier with magic link, Google and Apple. The full save syncs with exactly the `MixTransfer.merge` rules. The offer is soft (after a share, at streak milestones, a Stats row) and never at first launch, and guest play always works. Plan, setup, privacy, consent, costs and effort: `/workspace/research/mixology_accounts_plan.md`.

## Privacy and analytics (round 78)
Mixology sets no cookies and has no accounts. Saves live only in this browser's localStorage.

Optional, internal-only play counts use [GoatCounter](https://www.goatcounter.com/help), which is cookieless and anonymous. They are **on** since round 79 (v1.20.1) with site code `ngtrooper` (dashboard: https://ngtrooper.goatcounter.com):
- **Turn on/off:** in `analytics.js`, set `const ANALYTICS_CODE = '<code>';` (the `<code>` of `https://<code>.goatcounter.com`). That one line is the only change, and an empty string means no script and no network request at all.
- **Loading:** when on, `count.js` loads async from `gc.zgo.at`. Failures (offline, ad blockers, errors) are swallowed and never affect the game. The page view is sent as the path only, never the query string, because duel links carry a mix code.
- **Never counted:** localhost, private IPs, `file://`, and automated or headless browsers (`navigator.webdriver`).
- **Excluding yourself:** open the game once with `?noanalytics` (e.g. `https://ngtrooper.github.io/mixology/?noanalytics`). That sets `localStorage['mixology.noanalytics.v1'] = '1'` for that browser permanently, so do it on each device and browser you use. `?analytics=on` undoes it. GoatCounter's own `localStorage.skipgc = 't'` is honored too.
- **Events:** at most once per day per browser, and only puzzle numbers, scores and buckets. Never a color name, recipe or hex. The whitelist is `validEvent` in `analytics.js`.
  - Round 83 difficulty events (daily rounds only):
    - `pct-#N-a1-<score>` and `pct-#N-final-<score>`: the score 60–100, or `<60`.
    - `off-#N-<k>`: the final scored mix's distance from the recipe, as the sum of |yours − official| over the five disc numbers, bucketed 0–5, 6-10, 11-20, 21+. It is always even: 2 = one paint 1% high and another 1% low.
    - `paints-#N-1..5`: how many paints the final mix uses.
  - `open`
  - **Round 95 (Franklin): `first-visit` and `known-player`.** These are sent **once ever per browser**, never daily, and fire with `open` on page load. Their permanent flag is `mixology.analytics.ever.v1`.
    - `first-visit`: the browser had no Mixology history.
    - `known-player`: it already had a save, collection, welcome/pour flag or analytics sent-flags from before this change.
    - **Reading it:** in GoatCounter, pick a range from 2026-10-21 (the deploy) to today and add the two rows. That sum is the exact number of unique browsers since the deploy.
    - **Timing:** the kind is decided when analytics.js loads, after transfer.js merged any `#import=` and before game.js writes. It is stored as `<kind>:pending` until GoatCounter takes it, so a blocked count.js retries on the next load without changing the kind.
    - **Transfer:** a player arriving with a transferred save counts as `known-player`. If transfer.js navigates away on load (bridge pull, https hop), nothing is sent and the page it returns to decides: a returned save means `known-player`, `#import-none` means `first-visit`. The flag is per origin and does not travel with a transfer.
    - **Not counted:** opted-out and automated browsers are never counted. Neither is storage that can't persist.
  - `start-#N` (first dose of the day's daily)
  - `finish-#N`
  - `score-band-none|bronze|silver|gold|diamond` (the star tiers)
  - `return-day-0..7|8+` (days since this browser's first finished daily, sent on each visit and finish)
  - `streak-1|2|3|5|7|14|30+`
  - `played-days-1|2|3|5|7|14|30+` (largest step not over the count)
  - `share`
  - `duel-open`
- **Retention read-out:** in GoatCounter, compare unique `return-day-1` / `return-day-7` counts with `return-day-0`.
- **Visible:** while analytics is on, the Tips overlay shows "No cookies. Anonymous play counts only."

## Files

- `index.html` — page + CSS (single-page, mobile-first)
- `engine.js` — pure logic: % mixing over an RYB cube, RGB→Lab, CIEDE2000,
  % mapping, daily picker. Loadable in browser and Node.
- `game.js` — controller: rounds, saves (localStorage, v2 with v1
  migration), duels, share, `window.MISNOMER` debug handle.
- `analytics.js` — round 78: optional GoatCounter counts; `ANALYTICS_CODE` = `'ngtrooper'` since round 79 (empty = off).
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
   rewrites `colors.js` + `tools/recipe-report.json`), then
   `node tools/whole-drop-recipes.js` (round 77: whole-percent recipes; run last).
2. `node tools/build-schedule.js` — keeps every day through tomorrow
   verbatim, keeps still-eligible future days, replaces only future days
   that fell out of the pool.
3. `node test/tests.js` (the frozen-prefix hash test must stay green).

## Run it

Any static server, e.g. `python3 -m http.server` in this directory, then
open `index.html`. No build step, no dependencies.
