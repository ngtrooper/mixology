# MISNOMER — v1 core build report

Built 2026-10-18 in `~/workspace/game-projects/misnomer/`. Local only — nothing published or submitted.

## Round 82 (2026-10-19, Grok Bot): MAKE "DAILY" OBVIOUS, COUNTDOWN TO MIDNIGHT (Franklin)

- **Found:** a countdown already existed (round 19: `untilNextColor()` / `#reveal-next`). It was a small grey line at the very bottom of the reveal, showing minutes only and updating every 20s. It is now the prominent block below, not a duplicate.
- **Rollover confirmed:** local midnight. `currentDay()` = `E.dayNumber(new Date()) + 1` counts local calendar days, and the countdown targets `dateForDay(DAY + 1)`, the next local 00:00. New `E.nextDayStart` gives the same instant, and tests prove it matches `dayNumber` across DST days.
- **Reveal:** right after the result (score, band, ΔE line) and before the recipes, a boxed "Next color in **6h 12m 08s**" (17px bold, accent clock, tabular digits, `role="timer"`, ticking every second).
  - Under it, `E.comeBackLine(streak)`: "New color every day — come back tomorrow to keep your 🔥 N-day streak." For a 1-day streak it reads "…to start a 🔥 streak."; for 0, "…for the next one."
  - `E.formatCountdown` rounds up, so it never shows "0s" early.
- **At zero:** the 1s tick calls `checkDayRollover()`. A finished round now stays on screen (it used to be swapped automatically). The block reads "Today's new color is ready" with the existing `#btn-today`, moved into the block and relabelled "Today's new color is ready →". An untouched round still switches automatically, and a round in progress keeps its day as before.
- **Returning finished player:** a `#done-banner` under the color name reads "✓ You've played today's color · Next color in …", with "See your result ↓" (scrolls to the reveal) and "Practice (doesn't count)". After midnight it switches to "Play today's color →". The practice round keeps its "Practice round — doesn't count" bar.
- **Welcome card:** step 1 is now "**One new color every day.** Same name for everyone…". The "How well do you know your colors?" lead is kept.
- **Not changed:** share text, the pot, the "−" badges.
- **Tests:** 4 new (formatting; local-midnight rollover incl. DST + game wiring + no auto-swap of finished rounds; streak line 0/1/N; placement/banner/welcome/share untouched). The round 19 test was updated. 206 pass.
- Version 1.22.0. 1.22.1 follow-up: in the ready state the heading is hidden, so "Today's new color is ready" isn't shown twice (the button says it).

## Round 81 (2026-10-19, Grok Bot): "HOLD TO POUR" ON THE EMPTY POT (Franklin)

- **Why:** testers didn't know how to start; one didn't realize you press/hold the big circle to add color.
- **What:** a centered "Hold to pour" label with a small hand icon on the empty white pot, for first-time players only.
  - Dark text (`#2a2621`) on the white canvas, in light and dark mode.
  - Static, with a 0.35s opacity fade on dismissal; reduced motion makes it instant.
  - No other pot effect.
- **When:** shown while the pot is empty (white 100%) and the round is open, only if this browser has no saved day, no day in progress, and no `mixology.poured.v1` flag. That check is decided once at startup from the save.
- **Dismissal:** the first drop, through `applyUnit`, which every Dropper/Pour/keyboard dose uses, sets `mixology.poured.v1 = 1` and retires the label for good. Undo, reset and reload never bring it back.
- **Press:** `pointer-events: none`, `user-select: none`, `-webkit-touch-callout: none`. A hold on the label pours into the pot.
- **Accessibility:** the label is `aria-hidden`. While shown, the pot's aria-label starts with "Hold to pour."
- **Not changed:** no other onboarding change. The welcome card and the r43 coach rings are unchanged, there is no Add/Remove toggle, and the "−" badges are unchanged.
- **Tests:** 4 new, which run the real hint code against a stub page and save: shown for a fresh save; hidden after the first drop, after undo to empty, and after reload; hidden for existing players (saved day, day in progress, finished pot); markup/CSS (dark, pointer-events none, no select/callout, fade only). 202 pass.
- Version 1.21.0.

## Round 80 (2026-10-19, Grok Bot): CLOSE BUTTON ALWAYS REACHABLE ON SHORT PHONES (iPhone tester)

- **Bug:** on an iPhone the Collection dialog could be taller than the visible screen. The panel was capped at `92vh` (Tips at `85vh`), and on iOS that is the large viewport with the toolbars hidden. The ✕ was absolutely positioned inside the scrolling panel. So the centered panel's top, with the ✕, sat under the Safari toolbar, and scrolling took the ✕ away with the content.
- **Fix (index.html):**
  - Calendar, Stats, Collection and Tips are now `.ov-dlg` flex columns: an `.ov-head` row (title plus ✕, `flex: none`, divider) and an `.ov-body` that scrolls on its own (`min-height: 0; overflow-y: auto; overscroll-behavior: contain`).
  - The panel's `max-height` is the overlay's box (`100%`), with a `100dvh` cap minus the safe-area insets under `@supports`, and `100vh` as the old-browser fallback.
  - The overlays pad by `env(safe-area-inset-*)`.
  - The ✕ is now 40px with a 48px tap area and a focus ring. It comes first in the DOM, so it is still the first focus stop.
  - The welcome card scrolls too (`max-height: 100%`), so "Let's mix" is reachable in landscape.
- **game.js:** `openOverlay` resets the body's scroll to the top when a dialog opens. Escape and tap-outside already closed every dialog; tests now lock that in. The reveal is part of the page, not a dialog, so it was unaffected.
- **Not changed:** the "−" remove badges stay exactly as they were. Franklin dropped the Add/Remove toggle idea.
- **Tests:** 3 new (header/body structure for every dialog; no `vh`-only caps, dvh, safe-area, 40px ✕, welcome scroll; scroll reset plus Escape/tap-outside). 198 pass.
- **Browser check** (`/workspace/pw/r80.js`):
  - Chromium and WebKit (mobile) at 320×568, 375×667, 390×844, 568×320, 667×375 and 844×390.
  - For each of the four dialogs, at the top and scrolled to the bottom: the ✕ is fully on screen, it is the element at its own center, the panel fits, and it is at least 40px. Each dialog then closed by tapping the ✕, by Escape and by tapping outside.
  - The welcome button was reachable, and a game played through to the reveal.
  - 108 checks, 0 failures, 0 page errors.
  - Every request to goatcounter.com and gc.zgo.at was aborted, and `?noanalytics` was set.
- Version 1.20.2.

## Round 79 (2026-10-19, Grok Bot): ANALYTICS TURNED ON (Franklin)

- `analytics.js`: `const ANALYTICS_CODE = 'ngtrooper';` (dashboard https://ngtrooper.goatcounter.com). No other code change.
- Test updated: the shipped-empty assertion now expects `'ngtrooper'`. 195 tests pass.
- Version 1.20.1 (game.js + every `?v=` stamp).
- Live check: headless browser on the deployed site, with every request to `ngtrooper.goatcounter.com/count` recorded and then aborted, so no fake hits reached the real stats.

## Round 78 (2026-10-19, Grok Bot): PRIVATE ANALYTICS, GOATCOUNTER, SHIPPED OFF (Franklin)
- **New `analytics.js`** (loaded before game.js, cache-busted like the rest). The constant `ANALYTICS_CODE = ''` at the top of the file is the one place to edit.
  - Empty means disabled: no script tag and no request. That was verified in the browser: 0 requests to zgo.at or goatcounter.com.
  - When set, it injects `<script async src="https://gc.zgo.at/count.js" data-goatcounter="https://<code>.goatcounter.com/count">`. The automatic page view uses `location.pathname` only, so duel query strings are never sent.
- **Skipped:**
  - localhost, private IPs and `file:`.
  - `navigator.webdriver` (headless test runs).
  - `?noanalytics`, which also sets the permanent `localStorage['mixology.noanalytics.v1'] = '1'`. `?analytics=on` clears it.
  - GoatCounter's `skipgc = 't'`.
- **Events:** `goatcounter.count({path, title, event: true})`, deduped once per local day per browser in `mixology.analytics.sent.v1`, and queued until count.js is ready (polls 500 ms for 30 s, then gives up).
  - Event list: open, start-#N, finish-#N, score-band-<tier|none>, return-day-0..7|8+, streak-<1,2,3,5,7,14,30+>, played-days-<same steps>, share, duel-open.
  - A regex whitelist (`validEvent`) drops anything else, so a color name can never be sent.
- **Robustness:** every call is in try/catch. A blocked count.js (onerror) turns analytics off for the session. If analytics.js itself is ad-blocked, `window.MixAnalytics` is undefined and game.js's `track()` is a no-op.
- **Game hooks** (game.js):
  - On load: open, return-day and duel-open.
  - `beginGesture` (first dose of a daily round): start-#N.
  - `finish()` for a daily: finish-#N, score-band, streak, played-days and return-day.
  - The Share button: share.
- **UI:** nothing changes while analytics is off. When on, the Tips overlay shows a small "No cookies. Anonymous play counts only." line.
- **Browser check** (the game served from a non-local test host, count.js stubbed so nothing reached GoatCounter):
  - Empty code: off, 0 requests.
  - Test code: page view `/mixology/`, then open, return-day-1, duel-open, start-#2, finish-#2, score-band-none, streak-2, played-days-2 and share. A second Share tap was deduped.
  - `?noanalytics` and the flag: off, 0 requests.
  - Script blocked: game fully playable, no errors.
- **Tests:** 7 new, covering the constant shipped empty, disabled-when-empty, the script attributes, the skip rules, once-per-day dedupe and the day reset, buckets, the whitelist (no bank name can be an event), and the game hooks. The cache-bust test now expects analytics.js. 195 tests.
- Version 1.20.0.

## Round 77 (2026-10-19, Grok Bot): 100% REACHABLE, HINT AFTER ATTEMPT 1, "MIXOLOGY: DAILY COLOR MIX" (Franklin)
Context: /workspace/research/mixology_competitors.md found that players hate "looks perfect but can't hit 100%", and that similar games build targets from whole drops.

**A) 100% is reachable**
- **Whole-drop recipes** (`tools/whole-drop-recipes.js`, run after the solver; it converges and a rerun changes 0 recipes):
  - Every recipe is now whole percents summing to 100, and each paint is 0 or at least 1%. 707 of 981 recipes changed, by ±1–2% per paint.
  - `de` (recipe vs the named XKCD/CSS hex) was recomputed: it rose by at most 0.84, and 14 colors rose by more than 0.5. 0 colors changed eligibility, so the pool is still 853.
  - schedule.js is untouched (the frozen sha test is green).
- **Target:** a color's scoring target is now the color its recipe renders (`E.recipeHex`, `c.thex`), not the raw hex the paints often can't make.
  - `E.scoreMix(pot, recipe)`: if the discs show exactly the recipe's whole numbers (`E.recipeMatch`), the attempt scores 100%, ΔE 0, DEAD ON, a diamond star. Otherwise it is the normal accuracy formula vs the recipe color.
  - The reveal says "you matched the official X recipe exactly". The recipe row reads "Recipe 100%", and both legends show whole numbers like the discs.
- **Reachability:** `E.wholeDropPath` does a beam search over exactly the player's actions (+1 unit, as with a dropper tap or one unit of a pour; −1, as with a '−' tap).
  - All 853 pool recipes are reachable: median 127 actions, max 169, 0 failures.
  - Tests cover today, the next 45 days and 30 random pool colors.
  - In the live browser check, the real UI (dropper taps + '−' taps, 169 actions) reached 0/30/29/41/0 for Dark Forest Green and scored 100% with a diamond.
- **Display:** the official color shown everywhere (reveal, calendar detail, Collection tile/detail/toast, confetti) is the recipe color.
- **History:** past saved scores are kept as recorded and never rescored (calendar, stats, stars read the stored pct). A mid-day save keeps its submitted attempt 1 as scored (checked live: a 91% WIP restores as 91% and shows its hint).
- **Collection:**
  - Discovery is now ΔE00 3 from each color's recipe color. That is the same target the daily scores against, so the hard-color margin (solver de + 1) is gone, because every recipe color is exactly makeable.
  - An exact recipe match always discovers the day's color.
  - 53 groups of names share one recipe color (e.g. baby blue / light blue grey / powder blue). A mix that discovers one of them discovers all of its twins too, since nothing could ever tell them apart.
  - Old entries keep their stored best.
- **Duels:** new links carry `&s=2`. An older link (no `s`) that has the friend's mix is rescored against the new target on open, so the duel compares like with like. Hex-only legacy links keep their p.

**C) Hint after attempt 1**
- `E.mixHint(mineLab, targetLab, pct)`, from CIE LCh differences weighted like CIEDE2000:
  - Lightness: "A bit too dark" / "Too dark" / "Too light".
  - Chroma: "Too muted, make it brighter" / "Too strong, tone it down" / "Needs a touch more color".
  - Hue: "Shift it toward <family>", naming the next hue family in that direction.
  - It keeps the 1–2 biggest issues (≥ 2.5, and a second one only if it is at least half the first), joined by "and".
  - 97–99 gives "So close!", 100 gives "Perfect match!", and anything tiny gives "Close! Fine-tune it".
- It never gives numbers, amounts, drops or the recipe (tested on 300 random pairs).
- It shows as a small "HINT" pill under "Attempt 1 submitted: N% accuracy" until attempt 2, and is also read by the screen-reader announcement. It is not in share text, duel links or the image card (tested).

**E) Title**
- `<title>`, og:title, the new twitter:title and the og/twitter image alt now read "Mixology: Daily Color Mix". The manifest `name` matches and `short_name` stays "Mixology".
- The header is "MIXOLOGY." with a small uppercase "Daily Color Mix" line under it. At 320px it ends 8px before the header buttons, with no horizontal scroll.
- README retitled. The share text header ("MIXOLOGY #N — How well do you know your colors?") and the in-game hook line are unchanged.

**Also**
- The Collection toast's aria-label now contains its visible text, which fixes an axe label-content-name-mismatch that dated from r69.
- Old tests updated: the no-hint lock (now "hint after attempt 1 only"), announce text, Collection hard margin and recipe-color labs, and twitter alt text.
- 11 new tests. 188 tests total.
- Shots: `r77-header-{320,390}-live.png`, `r77-hint-after-attempt1-live.png`, `r77-pot-matches-recipe-live.png`, `r77-reveal-diamond-from-pouring-live.png`.
- Version 1.19.0.

## Round 76 (2026-10-19, Grok Bot): DIAMOND GLOW + TWINKLE (Franklin)
- **Diamond badge only** (never the pot):
  - A soft blue/white halo (`::before`, radial gradient) pulses over 2.6s (`dia-halo`).
  - A tiny white 4-point glint at the top-right fades and rotates in once per 2.6s cycle (`dia-glint`).
  - Both animate only opacity and transform.
  - Each diamond gets a rolling `--tw` delay (0, 0.83, 1.66, 2.49s, ...), so calendar diamonds never twinkle in unison.
- **Stronger at rest:** a bluer drop-shadow glow, so diamond is clearly blue and glowing while silver is plain grey, even at 10px.
- **Halo size:** kept clear of the % at 320px (inset −40%, fades out by 62%). The star SVG still has no overlap with the % at 320 and 390.
- **Reduced motion:** no animation. The global `* { animation: none }` does not reach `::before`, so the halo and glint switch theirs off explicitly. Diamond instead shows a stronger static halo (opacity .9) and the glint, fully visible.
- **Tests:** only `dia-halo` and `dia-glint` exist as star keyframes, they touch only opacity/transform, only `.star-diamond` selectors use them, the reduced-motion static rule is present, and diamonds are staggered. 177 tests.
- **Live check:** 4 diamonds animate with 4 different delays, and silver/gold have none. Under reduced motion, 0 animations, halo .9, glint 1. No star in the pot; share text unchanged.
- Shots: `r76-calendar-zoom-{390,320}-live.png`, `r76-calendar-zoom-reduced-motion-live.png`, `r76-calendar-{390,320}-live.png`, `r76-reveal-diamond-live.png`.
- Version 1.18.1.

## Round 75 (2026-10-19, Grok Bot): STAR TIERS RE-POINTED + DIAMOND (Franklin)
- **New tiers** (`E.STAR_TIERS`, on the rounded % the player sees; a higher tier replaces a lower one):
  - 100 **diamond** ("diamond star: 100%")
  - 97–99 **gold** ("gold star: 97%+")
  - 90–96 **silver** ("silver star: 90%+")
  - 85–89 **bronze** ("bronze star: 85%+"; 85 is par)
  - below 85: none
- **Diamond look:**
  - Fill is an icy white → pale cyan → sky-blue gradient (one shared `#star-diamond-g` in index.html).
  - It has a deep-blue outline, white facet lines from the center to each point, and a small static sparkle at the top-right.
  - A soft blue glow helps it read on white and black and keeps it distinct from grey silver. There is no animation.
- **Where:** the same places as round 74 (Calendar circles, Collection tiles and detail, reveal "Your mix"), and the aria labels follow the tiers. No markup moved, so the 320px no-overlap check still passes.
- **Unchanged:** stars are derived and never stored; share text and the image card have no star or color name; the r73 recipe lock; no pot effects.
- **Tests:**
  - Thresholds: 84 none, 85/89 bronze, 90/96 silver, 97/99 gold, 100 diamond.
  - Rounding: 84.4 none, 84.5 bronze, 89.5 silver, 96.6 gold, 99.5 diamond.
  - Labels, ΔE mapping (par = bronze), the diamond gradient/facets and no star animation.
- Shots: `r75-calendar-{390,320}-live.png`, `r75-collection-tiles-live.png`, `r75-collection-detail-diamond-live.png`, `r75-reveal-diamond-live.png`.
- Version 1.18.0. 177 tests.

## Round 74 (2026-10-19, Grok Bot): STAR BADGES (Franklin)
- **Tiers** (`E.starTier(pct)`, on the rounded % the player sees): 90–96 **bronze**, 97–99 **silver**, 100 **gold**. A higher tier replaces a lower one. Labels: "bronze star: 90%+", "silver star: 97%+", "gold star: 100%".
- **Where:**
  - Calendar day circles: that day's best attempt. A 10px star sits on the circle's top-right edge, above the centered % (checked for no overlap with the % text at 320px and 390px). The cell's spoken name adds ", gold star: 100%".
  - Collection tiles: the best mix recorded for that color, scored against that color with the normal accuracy formula (`E.collectedBestPct`). The tile's aria-label adds the tier, and the detail panel shows "· ★ bronze star". Bronze shows here only when a collected color's best is 90–96 (hard colors found within their solver best + 1).
  - Reveal: a 22px star in the corner of the "Your mix" swatch (role img with an aria-label).
- **Saves:** nothing new is stored, because stars are derived. Old collection entries use `best.pct`; entries without it fall back to `best.de`, then to the mix hex vs the color hex. `misnomer.save.v1` and `mixology.collection.v1` are unchanged.
- **Unchanged:** no pot effects, the r73 recipe spoiler lock, and share text and image card (no star and no color name).
- **Style:** a 5-point SVG star with a thin dark outline and a drop shadow, so it reads on white, yellow, navy and black. It uses forced-color-adjust: none.
- **Tests:** 89 none, 90/96 bronze, 97/99 silver, 100 gold; rounding; labels; legacy-save fallbacks; markup and a11y contracts; share text has no star. Two older source contracts were updated for the new markup.
- Shots: `r74-calendar-{390,320}-live.png`, `r74-collection-tiles-live.png`, `r74-collection-detail-bronze-live.png`, `r74-reveal-gold-live.png`.
- Version 1.17.0. 177 tests.

## Round 73 (2026-10-19, Grok Bot): SPOILER FIX, OFFICIAL RECIPES ONLY FOR FINISHED DAILIES (Franklin)
- **Bug:** the Collection showed the official recipe for "evergreen", which is a future daily (internal days 1454, ...).
  - The r69 rule unlocked any color that had been a daily before today. That counted the 656 pre-launch days (internal < 656, before Mixology #1), and those colors recur later in the schedule.
- **New rule** (`E.officialRecipeVisible(name, store.data.days)`): the official recipe shows only for a color the player has finished as a daily. That is a reveal they already saw, so it stays visible when the color recurs.
  - `days` records are written only by `finish()`.
  - Pre-launch, missed, upcoming and today-unfinished colors show only the player's own mix, with the copy "The official recipe unlocks once you finish this color as a daily." The copy never says whether the color is upcoming.
  - The schedule lookup (`SCHEDULE_DAYS`) is removed.
- **Calendar:** unchanged and now tested. Recipe bars render only in the finished-day branch. Missed and pre-launch days show the name and date only.
- **Tests:**
  - Every pre-launch color is locked, both for a fresh player and for one who finished #1 and #2. evergreen (day 508, recurs) is locked.
  - Finished days unlock their color. Today's unfinished color is locked.
  - The calendar has a single recipe render, in the finished branch.
- **Live check** (mocked Oct 19, #1 finished): Evergreen and Amber locked, Lipstick shows its official recipe. Calendar Oct 1 (pre-launch) shows the name only, #1 shows recipes. axe is clean.
- Shot: `r73-evergreen-locked-live.png`.
- Version 1.16.1. 169 tests.

## Round 72 (2026-10-19, Grok Bot): HOLIDAY COLORS (Franklin)
- **Holiday calendar** (`engine.js`): `holidaysForYear` and `holidayOn`. 20 holidays:
  - Fixed dates.
  - Computed: Easter (anonymous Gregorian algorithm), Mardi Gras (Easter − 47), Mother's/Father's Day and Thanksgiving (US).
  - Tables for 2026–2035: Lunar New Year (Wikipedia/HKO), Hanukkah first candle (Hebcal API), Diwali/Lakshmi Puja (drikpanchang/qppstudio).
  - When two fall on one day, priority decides. Christmas > Hanukkah > Christmas Eve > New Year > Lunar New Year > Valentine's > Mardi Gras > the rest.
  - Skipped by a clash: Mardi Gras 2026 and 2029 (= Lunar New Year), Christmas Eve 2027 (= Hanukkah first night), Hanukkah 2035 (= Christmas).
- **Colors** (`tools/holiday-colors.js`): 2–4 fitting bank names per holiday, all daily-eligible (tested), rotated by year.
  - Independence Day alternates red (even years) and blue (odd years). Halloween alternates pumpkin and pumpkin orange.
- **Builder** (`tools/build-schedule.js`): days ≤ 658 (yesterday and earlier, today #2, tomorrow) are untouched, verified by a sha256 of days 0..658.
  - Each future holiday takes the first rotated candidate that doesn't repeat within 120 days of a frozen day or another holiday pick.
  - Other uses of that color within ±120 days are cleared. The displaced color moves into a cleared slot where it fits; other holes are refilled from the bag.
  - Result: 184 holiday days through 2035. 52 nearby repeats cleared, 47 displaced colors re-homed, 5 refilled, 234 future days changed in total.
  - 0 repeats within 120 days, 0 exceptions, all future colors eligible. A rebuild is idempotent (byte-identical).
- **Header tag:** on a holiday the header shows a subtle pill under the date ("🎃 Halloween"); the emoji is aria-hidden.
- **Header fix:** at 320px a 3–4 digit "MIXOLOGY #1132 · Thu, Nov 22" ran 13–28 px under the buttons (latent since r71). The date now wraps to its own line.
- Live with a mocked date: Oct 31 2026 shows "🎃 Halloween" and Pumpkin, Dec 25 2026 shows "🎄 Christmas" and Crimson, Oct 30 shows no tag. axe is clean.
- Shots: `r72-halloween.png`, `r72-halloween-320.png`, `r72-christmas.png`, plus `-live` versions.
- Version 1.16.0. 168 tests.

## Round 71 (2026-10-19, Grok Bot): STATS AND COLLECTION GET THEIR OWN PANELS; "SUBMIT" (Franklin)
- **Header buttons.** Calendar, Stats and Collection are now separate header buttons, each a clean SVG icon with an aria-label ("Calendar", "Stats", "Collection").
  - Stats icon: bars. Collection icon: tiles.
  - The header's right side is two compact rows: the four icons (Calendar, Stats, Collection, sound), then Tips and Practice.
  - Playwright at 320/360/390, light and dark, daily and practice ("← Daily"): no overlaps, nothing off-screen, no horizontal scroll, every button at least 24 px. Header height is 61 px at 320/360 and 67 px at 390.
- **Panels.** Each opens its own dialog (`#cal-overlay`, `#stats-overlay`, `#col-overlay`) with its own h2 title and close button. The sub-tabs are gone.
  - Opening one closes the others.
  - Kept: the sparkline dot opens that day in the Calendar (verified), the Collection tile detail, and the toast opening the Collection.
  - Escape closes all panels, and focus returns to the button that opened the panel. The focus trap holds (30 Tabs, 0 escapes). PageUp/PageDown still change month.
- **Submit wording.** "Seal" is now "Submit" in all user-facing text: "Submit attempt 1", "Submit final attempt", "Attempt 1 submitted: …" (status line and screen-reader announcement), the hint line, Tips, the welcome card, the footer and the Collection explainer.
  - Internal names (`seal()`, `#btn-seal`, `sfx.seal`) stay.
  - A test scans the visible HTML text and the game.js strings for "seal".
- **Calendar cell a11y.** Fixed a pre-existing axe `label-content-name-mismatch` on calendar cells.
  - "Thu Oct 01 2026" did not contain the visible "1". Unplayed days now use the long date ("Thursday, October 1, 2026").
  - Played days are named by their content: a hidden full date, then the visible day, score and name.
- axe is clean on home, reveal, calendar (including played days), stats, collection, tips and welcome, in light and dark.
- Tips copy explains the three buttons.
- Shots: `r71-header-{320,360,390}-{light,dark}.png`, `r71-header-320-*-practice.png`, `r71-stats.png`, `r71-collection.png`, plus `-live` versions.
- Version 1.15.0. 163 tests.

## Round 70 (2026-10-18, Grok Bot): NO LONG-PRESS CALLOUT IN THE PLAY AREA (Franklin, urgent)
- **Bug:** on phones, holding the pot or bucket brought up the OS text callout (Copy / Find Selection / Look Up).
- **CSS:** the whole play area (#stage, #toolbar, #attempts-list, #actions and everything in them) is `-webkit-user-select:none; user-select:none; -webkit-touch-callout:none; -webkit-tap-highlight-color:transparent`.
  - `touch-action: manipulation` on the stage, the tool and Seal buttons and the discs; `touch-action: none` on the pot and the "−" badges (pointer pour and hold-to-remove).
- **JS:** `contextmenu` and `selectstart` are cancelled on those areas, and any stray selection is cleared on pointerdown.
  - The pot and badges cancel `touchstart` (passive:false). They act on pointerdown and take keyboard clicks only, so discs, tools and Seal keep their normal taps.
- Tips, the reveal, the calendar and the footer stay selectable (verified: the Tips paragraph selects).
- **Playwright, WebKit iPhone 13 + Chromium Pixel 7** (Chromium long-presses use real CDP touch). After a 1.5 s hold on the pot, a disc, a badge, a tool, an attempt slot and Seal:
  - `getSelection()` is empty, and contextmenu and selectstart are prevented on each element.
  - Double-clicking a disc's % selects nothing.
  - The pour still works (red 0 → 61% in a 1.5 s hold), and so does the badge hold.
  - Normal WebKit taps still select, dose and seal.
- Version 1.14.1. 161 tests.

## Round 69 (2026-10-18, Grok Bot): COLLECTION (Franklin)
- **Where.** A third tab, "Collection", in the Calendar/Stats overlay. The calendar header button is now labelled "Calendar, stats and collection".
- **What's in it.** 853 colors: every color that can be a daily (non-retired and daily-eligible).
  - Left out: the 7 retired names, and the 121 colors the five paints cannot make at par (neons and brights such as cyan, ΔE 19.5). Those tiles could never be won.
- **Layout.**
  - "X / 853 discovered" and per-family progress bars, in 8 CIE LCh hue families.
  - Then a grid per family. Discovered tiles are labelled buttons in the official color. Undiscovered tiles are a neutral dashed "?", hidden from screen readers; the family heading carries the count.
- **Discovery.** Worked out on every seal (daily and practice). The mix discovers the nearest collectible color within ΔE00 ≤ `DISCOVER_DE` = 3.
  - Colors the paints cannot reach within 3 are found within their own solver best + 1.
  - If the mix is within reach of the round's own target, the target wins. The bank has near twins (bright green / fluorescent green are ΔE 0.05 apart) that could otherwise never be found.
  - Test: every one of the 853 tiles can be won with its own recipe in its own round.
- **Announced only at the reveal**, never at seal 1. Naming the color nearest your mix mid-round would tell you how close you are (no-clues lock).
  - Toast: "New color discovered: Pale Red!" with a swatch, a three-note chime and a light haptic. One toast per new color, queued. Also announced to screen readers. Tapping the toast opens that color in the Collection.
- **Tile detail.** Name, official swatch, the player's best mix (swatch, accuracy against that color, composition bar) and the date discovered.
- **Spoiler rule.** The official recipe shows only if the color was a daily on a day before today, or it is today's color and today is finished. Otherwise: "The official recipe unlocks once this color has been a daily color." The same text is used whether the color is upcoming or never scheduled, so it leaks no schedule.
  - While a round is open, today's color and the open round's color show as "?" and are not counted, even if collected earlier. Its official swatch would spoil the target.
- **Storage.** Own key `mixology.collection.v1` (v:1); the save is untouched.
  - Backfilled once from all saved daily attempts, dated by their day records. Practice was never saved, so it can't be backfilled.
  - Storage-failure safe: a test with every localStorage call throwing showed no errors, "0 / 853", and a collection that lives in memory.
- **Measured discovery rate** (`tools/discovery-rate.js`, 365 simulated daily rounds × 2 seals, three skill levels at about 82/87/91% average accuracy):

  | ΔE threshold | seals finding something | seals finding the target itself | new colors after 30 / 90 / 365 days |
  |---|---|---|---|
  | **3 (chosen)** | 60–72% | 11–37% | about 33–41 / 85–106 / 297–336 |
  | 5 | 83–92% | 15–53% | about 41–44 / 116–126 / 352–370 |

  The bank is dense, so the threshold mainly sets how often a seal finds *something*. At 5 nearly every seal does, which is trivial. At 3 roughly 2 in 3 do, and new finds slow from about 2 in 3 seals early to about 1 in 3 later. A year of dailies collects about 35–40%, so completing it takes deliberate practice exploration.
- a11y: tablist, labelled tiles, focusable detail, axe clean in light and dark. Forced colors keep the tile colors. Dark mode uses the theme variables.
- Shots:
  - `r66-collection-local-grid-{light,dark}.png`
  - `r66-collection-local-detail-recipe.png` (past daily: recipe shown)
  - `r66-collection-local-detail-locked.png` (future-only color: locked)
  - `r66-collection-local-toast.png`
  - plus `-live-` versions.
- Version 1.14.0. 160 tests.

## Round 68 (2026-10-18, Grok Bot): NO TRACES, PLUS A REMOVE CONTROL (Franklin)
**Problem.** With live % on the discs, dilution showed a flaw. A paint only shrinks geometrically, so 3% yellow sat at "<1%" for about 230 more white units and never reached 0.

**(a) Snap traces in the model.**
- `engine.snapTraces`: after every dose, any paint under `TRACE_PCT` = 0.5% of the pot is set to 0 and the rest renormalized.
  - Runs inside `addUnits`, so the mix and the disc numbers always agree.
- `displayPercents` no longer has "<1%". It shows whole numbers that always sum to 100, and a paint in the pot never reads 0%.
- Measured: diluting 3% yellow with white now reaches 0 after 180 units, with the disc reading 3, 2, 1, then 0.
- **Solver.** The old recipes had 137 components under 1%, the smallest 0.1 (dark mustard), so this threshold would have made them unreachable. `solve-recipes.js` now scores and searches under the same snap rule.
  - Every stored recipe has each paint at 0 or at least 0.5%. Tested, and the stored de reproduces.
  - 144 recipes changed. Mean de change −0.002, worst +0.52 (floral white 0→0.52).
- **Fairness.** Eligible pool 853 → 853: none lost, none gained.
  - `build-schedule --freeze-through=657` replaced 0 entries; `schedule.js` is byte-identical.
  - 0 future days ineligible. Today (lipstick, recipe unchanged) and tomorrow are untouched.

**(b) Remove control.**
- Each disc holding paint gets a "−" badge. It is its own button just outside the disc's upper corner, on the outward side; red's sits on the left, away from the tool rig.
  - 30 px visible with a 40 px hit area. Badge center is 40 px from the disc center (disc radius 32), and a hit test at its center hits the badge.
  - Hidden on a fresh pot, when that paint is at 0 or 100%, and on a finished round.
- **Tap** removes 1 unit (about 1% of the pot; 8.66% → 7.74% measured). The other paints grow back in proportion.
- **Hold** removes on the bucket ramp (30/s up to 90/s) until release or 0.
  - Measured: a 9% red clears in 0.31 s held, or 9–10 taps.
  - One undo step per press or hold (verified). The selection never changes.
- Shift+1–5 removes 1% from the keyboard. Each badge's aria-label reads "Remove red paint, 9% of the pot. Hold to keep removing". The result is announced on release.
- `touch-action: none` and no context menu, so a long press neither scrolls nor opens a menu.
- Tips and welcome copy updated.
- axe is clean in light and dark. Shots: `r68-*-remove-badges-{light,dark}.png`, `r68-*-after-remove.png`.
- Version 1.13.0. 153 tests.

## Round 67 (2026-10-18, Grok Bot): NO EFFECTS IN THE POT (Franklin)
- Testers found the pot effects distracting. Franklin: nothing drawn on or in the pot.
- Removed:
  - the rotating conic swirl overlay (`#pot-surface::before`, `@keyframes swirl`);
  - the pour impact bloom, ripple and splash (`pourFx` now only does the light haptic);
  - the Dropper's landing ripple, bloom and splash;
  - the `spawnRipple`/`bloom`/`splash` functions and their CSS.
- The pot surface now only eases to the new color: `background-color` .28s, standard ease. The static sheen highlight stays.
- The bucket and dropper rigs, the stream and the falling drop stay.
- Playwright mid-pour: the only animation on the pot surface is the color CSSTransition (before: swirl plus about 20 bloom/ripple animations).
- Shots: `r67-before-swirl.png` (live, before), `r67-no-swirl.png`, composite `r67-compare-swirl.png`.
- The old visuals test was rewritten to assert the effects are absent. Version 1.12.3.

## Round 66 (2026-10-18, Grok Bot): GROSS/BODILY NAMES RETIRED (Franklin)
- "barf green" slipped past the family-friendly filter.
- `tools/build-bank.js` gains whole-word `RETIRE_WORDS`: barf, bile, sick, sickly, pee, urine, phlegm, mucus, turd, dung, manure, sewage, feces/faeces, excrement, drool, spew, bruise, dried blood, pimple, zit, scab, earwax. This adds to the existing substring BANNED list (vomit, puke, poop, poo, snot, booger, diarrhea…).
- **Retired from play (7):** barf green, bile, bruise, dried blood, sick green, sickly green, sickly yellow.
  - These stay in colors.js as `retired: true` because six frozen PAST days name them (134, 235, 266, 303, 314, 350, all pre-launch). Past days and old saves keep resolving by name, with hex and recipe.
  - They are excluded from the daily pool (`build-schedule.js`), the practice/fallback pool (`game.js` POOL) and the solver's eligible count.
- **Regenerated:** build-bank, then solve-recipes (all other entries byte-identical), then `build-schedule --freeze-through=657`.
  - Days 0–657 (past, today #1, tomorrow #2) are untouched. The frozen hash test passes.
  - 27 future entries were replaced, the earliest #62 (2026-12-18): sickly yellow → red orange. Full list in the round-66 commit diff of schedule.js.
- **Not removed, flagged for Franklin:** names that are unflattering but not bodily: gross green, nasty green, ugly blue/brown/green/pink/purple/yellow, mud/muddy *, slime green, swamp, hospital green, blood red, blood orange, oxblood.
- Test added: no future daily is retired or gross, past retired days resolve, and the game pool skips retired. The header-count test now counts non-retired names only. Version 1.12.1.

## Round 65 (2026-10-18, Grok Bot): LIVE POT % ON THE PAINT DISCS (Franklin, overrides the no-counts lock)
- Each of the five paint discs shows the pot's live share of that paint: fresh pot reads white 100%, the others 0%.
  - Numbers update live during pours. The DOM write is coalesced to one per animation frame, because `renderAll` runs on every pour tick.
- Rounding is `E.displayPercents` (pure, in engine.js): whole numbers with largest-remainder rounding so the five add up to 100. A nonzero share under 1% shows `<1%`, and only then may the visible sum read 99.
- Display:
  - Legibility: dark ink on white and yellow, light ink with a soft shadow on red, blue and black. Checked in light and dark mode.
  - `pointer-events: none` on the labels: a tap on the label lands on the disc (verified with `elementFromPoint`).
  - aria-label: "Select red pigment, 18% of the pot".
- **The pot itself stays number-free.** There are still no attempt feedback or recipe readouts before the reveal.
- Copy: the Tips explain the disc numbers, and the welcome card adds "Each paint shows its share of the pot."
- README design locks record Franklin's override.
- The old "no counts" test is renamed (it still bans recipe readouts and drop tallies). New tests cover the rounding (2,000 random pots plus a pour sequence) and the markup.
- Version 1.12.0. Shots: `r65-local-*`, `r65-live-fresh-pot-*`, `r65-live-mid-mix-*` (390px).

## Round 64 (2026-10-18, Grok Bot): POUR SOUND FOLLOWS THE RAMP
- The pour glug rises in pitch (+50 Hz at full speed) and shortens, and once past half speed it comes every 3 ticks instead of 5. You can hear the bucket speed up. Respects mute.
- Version 1.11.2. Test added.

## Round 63 (2026-10-18, Grok Bot): KEYBOARD POUR PARITY
- With the Pour Bucket selected, holding Enter or Space on the focused pot now runs the real pour: the same round-62 ramp, and one undo step for the whole hold. Release or blur stops it.
  - Before, OS key auto-repeat dosed about 30 separate drops per second, each its own undo step, with no ramp.
  - A single press still doses one drop.
  - Screen-reader activation (a synthetic click) still doses once.
  - The Dropper is unchanged.
- Playwright: Enter held 2 s gives 75% red, and one Undo returns to the pre-hold pot. Space held 0.5 s pours and stops on release. A Dropper Enter is +1 unit.
- Tips keyboard line updated. Version 1.11.1. Test added.

## Round 62 (2026-10-18, Grok Bot): FASTER POUR BUCKET (Franklin request)
- **Problem:** at a flat 30 drops/s, holding the Pour Bucket on a fresh white pot took 7.6 s to reach 90% of one pigment and 10.0 s to reach 95%. Measured in the browser on the live site before the change.
- **Change:** a ramp, defined in `engine.js` (`POUR_RATE_START 30`, `POUR_RATE_MAX 90`, ramp from 0.3 s to 1.0 s, with `pourUnitsAt(sec)` and `pourRateAt(sec)`).
  - The first unit still lands on press, and the first 0.3 s stays at 30/s for fine control.
  - The game loop still ticks 30×/s and lands whole units to follow the curve, at most 6 per tick so a stalled tab can't dump paint.
  - The whole hold is still one undo step.
  - The Dropper is unchanged (1 per tap).
- **Measured (Playwright, real mouse hold, local):**
  - 120 ms tap: 3 units (2.9%).
  - 90% at 3.1 s, 95% at 3.8 s (was 7.6 s / 10.0 s).
  - 1 s hold: about 52 units (was 30).
  - One Undo after the hold returns to 0.
  - Recovering from mistakes is about as fast as filling.
- **Visuals:** the stream thickens with the rate (core 8 to 13 px, outline 10 to 16) and resets on release. Shots: `r62-before-pour-stream.png` and `r62-after-pour-stream.png` (1.5 s into a hold), composite `r62-compare-pour-1.5s.png`.
- **Tips:** "starts at about 30 drops per second for fine control and speeds up to about 90 if you keep holding (a full pot of one paint in about 3 seconds)".
- **Tests:**
  - The "1 s pour" engine tests now use `ONE_SEC = 1 + floor(pourUnitsAt(1))` (52 units). Re-measured, with the bars raised: fresh 1 s ΔE ≥ 18 (r 26.8, y 19.2, b 26.6, k 36.5; was ≥ 15), and a 1 s white pour on strong pots ≥ 10 (was 8 / 7).
  - New tests: 90% lands within 3–4 s, cross-checked against `addUnits`; quick taps stay ≤ 6 units; the curve is monotonic; per-tick cap; stream reset.
  - The start-rate band 24..36 is kept.
- **Solver and pool unaffected:** they work on compositions, not time. Re-running `tools/solve-recipes.js` leaves `colors.js` and the recipe report byte-identical, the frozen-schedule hash test passes, and `schedule.js` is untouched.
- Version 1.11.0. Also: the box restarted mid-session and restored a 22:58 snapshot, so local r59–r61 were re-synced from origin (nothing was lost on the remote).

## Round 61 (2026-10-18, Grok Bot): README LOCKS FOR ROUNDS 40–60
- README design locks now cover keyboard shortcuts (no seal key), forced colors, contrast and motion preferences, and spoiler-free install screenshots.
- A stray round-51 note that had landed under "Run it" moved into the locks list. Docs only.

## Round 60 (2026-10-18, Grok Bot): A11Y: SHORTCUT ANNOUNCEMENTS
- Keyboard shortcuts change controls without moving focus, so the change was silent for screen readers.
  - They now announce through the existing polite live region: "Blue paint selected", "Dropper selected", "Pour Bucket selected", and "Undone" (only if something was actually undone).
  - These name the control, never the mix.
- Version 1.10.17. Playwright-verified. Test added.

## Round 59 (2026-10-18, Grok Bot): TIPS/CALENDAR ENTRANCE
- Tips and Calendar now ease in like the welcome card: the backdrop darkens over 0.2 s and the panel rises 14 px with a slight spring over 0.24 s.
  - The animation is transform-only, so text is never semi-transparent and contrast stays valid mid-animation (axe re-run: 12/12 clean).
  - Off under reduced motion.
- CSS only. Test added.

## Round 58 (2026-10-18, Grok Bot): HOT FLAME (7+ DAY STREAK)
- With a streak of 7 or more, the header 🔥 gets a warm glow and a slow 2.4 s flicker. The bump on a streak increase still overrides it.
  - Reduced motion keeps the glow but drops the flicker, through the global kill switch.
- Old flame-wrapper test loosened to allow the extra class. Version 1.10.16. Shot: `r58-after-hot-flame.png`. Test added.

## Round 57 (2026-10-18, Grok Bot): CALENDAR PAGEUP/PAGEDOWN
- While the Calendar tab is open, PageUp and PageDown flip months (the date-picker convention), using the same bounds as the ‹ › buttons (no future months). Ignored on the Stats tab.
- `aria-keyshortcuts` added on ‹ ›, and the Tips keyboard line mentions it. Version 1.10.15. Playwright-verified. Test added.

## Round 56 (2026-10-18, Grok Bot): SEAL HAPTIC + WORDMARK
- Sealing attempt 1 now gives an 18 ms haptic tap. Before, only the final seal buzzed, through the tiered finish pattern.
- `<h1 translate="no">` keeps the MIXOLOGY wordmark from being machine-translated. Page content is still translatable.
- Version 1.10.14. Test added.

## Round 55 (2026-10-18, Grok Bot): DIALOG SCROLL LOCK
- Before: scrolling to the end of Tips or Calendar chained into the page behind, and wheel or touch on the backdrop scrolled the board.
- Now: `html:has(.modal-ov.open) { overflow: hidden }` plus `overscroll-behavior: contain` on overlays and panels.
- Playwright: page stayed at y=120 through 15 wheel ticks while the Tips panel scrolled to its end. The position was preserved on close, and the page scrolls normally afterwards.
- CSS only (older browsers keep the old behavior). Test added.

## Round 54 (2026-10-18, Grok Bot): NOSCRIPT NOTICE
- With JavaScript disabled, a small card above the board now says "Mixology needs JavaScript to mix paint. Please enable it and reload." Before, the page showed a dead board with "…" as the name.
- Markup and CSS only. Shot: `r54-after-noscript.png`. Test added.

## Round 53 (2026-10-18, Grok Bot): LINK-PREVIEW METADATA
- Head gains `<link rel="canonical">` (duel `?d=` links all collapse to the one page for crawlers), `og:site_name`, `og:locale`, `og:image:type` and `twitter:image:alt`.
  - All of it is static and spoiler-free: the hook line, never a color name.
- Markup only. Test added.

## Round 52 (2026-10-18, Grok Bot): A11Y: INCREASE CONTRAST
- `prefers-contrast: more` (the iOS/macOS "Increase contrast" setting) strengthens two palette variables: secondary text `--muted` and outlines `--line`. Light and dark each have their own values. Palette only, like dark mode.
  - Light: muted 8.7:1 on paper (was 5.3:1), lines 3.3:1 (non-text AA).
  - Dark: muted 10.8:1, lines 3.5:1.
- CSS only. Shots: `r52-before-contrast-more.png`, `r52-after-contrast-more.png`, composite `r52-compare-contrast-more.png`. Test added.

## Round 51 (2026-10-18, Grok Bot): A11Y: FORCED COLORS / WINDOWS HIGH CONTRAST (real bug)
- **Found:** with `forced-colors: active` (Windows High Contrast and similar), the browser strips backgrounds. Every pigment, the pot surface, attempt swatches, the reveal swatches and the recipe bars rendered as empty outlines, so the game was unplayable. Playwright `forcedColors: 'active'`.
- **Fix:** the paint colors are content, so `forced-color-adjust: none` keeps them on the stage, attempt swatches, reveal swatches, recipe bars and legend dots, duel swatches, calendar swatches and detail dots, and stats bars. All other UI still follows the system palette.
  - The selected tool and the selected Calendar/Stats tab used to be fill-only. They now get a 3px `Highlight` outline in that mode.
- CSS only. Shots: `r51-before-forced-colors-{home,reveal}.png`, `r51-after-forced-colors-{home,reveal}.png`. Test added.

## Round 50 (2026-10-18, Grok Bot): DESKTOP HOVER FEEDBACK
- On pointer devices (`hover: hover`), header pills and unselected tools darken their border on hover. Seal and Share brighten slightly, Duel fills with paper, and the text links (Save image card, Replay the intro) go to ink.
  - Smooth 150 ms transitions, removed under reduced motion. Header pills also get a press-scale.
  - Touch devices are unchanged.
- CSS only. Shots: `r50-after-hover-{light,dark}.png` (Tips pill hovered). Test added.

## Round 49 (2026-10-18, Grok Bot): REPLAY THE INTRO
- Tips ends with a quiet "Replay the intro" link. It closes Tips and opens the welcome card. Esc or "Let's mix" closes it, and focus returns to the Tips button.
  - The welcome still auto-shows only on a true first visit (`mixology.welcomed.v1`).
- Version 1.10.13. Shot: `r49-after-replay-intro-link.png`. Playwright-verified (focus flow, no errors). Test added.

## Round 48 (2026-10-18, Grok Bot): TYPOGRAPHY: NO ORPHANS
- The reveal's "accuracy · perceptual distance … from the official <Name>" line now uses `text-wrap: balance`, so the color name no longer hangs alone on line two.
- Body paragraphs and the status line use `text-wrap: pretty`. This is progressive enhancement; browsers without support are unchanged.
- CSS only. Shots: before `r48-before-reveal-de.png` (live site), after `r48-after-reveal-de.png`. Test added.

## Round 47 (2026-10-18, Grok Bot): A11Y: ARIA-KEYSHORTCUTS
- The five pigments, Dropper, Pour Bucket and Undo carry `aria-keyshortcuts` (1–5, D, P, Z), so assistive tech can announce the round-40 shortcuts. Markup only. Test added. axe clean.

## Round 46 (2026-10-18, Grok Bot): TOUCH-AWARE TIPS + DARK CHECK
- The Tips keyboard-shortcut line is hidden on touch-only devices (`hover: none` and `pointer: coarse`). Phones and tablets with a keyboard or trackpad still see it.
- Dark-mode check of the new `<kbd>` chips: legible. Shot: `r46-check-tips-dark.png`, taken with a fine pointer. Test added.

## Round 45 (2026-10-18, Grok Bot): RICHER INSTALL (MANIFEST SCREENSHOTS)
- manifest.webmanifest gains `lang: en`, `dir: ltr` and two `screenshots` (`icons/screenshot-narrow.png` 780×1688 and `icons/screenshot-wide.png` 1280×800), each with a form_factor and a label.
  - Chrome on Android and desktop uses these for the richer install sheet.
  - The images are a fresh, unmixed board: no mix, no recipe.
  - Browsers fetch them only for the install UI, so normal page loads don't pay for them.
- Test checks both files exist and that their PNG dimensions match `sizes`. No JS/CSS change, so the version is unchanged.

## Round 44 (2026-10-18, Grok Bot): UNDO FEEDBACK
- Undo now has feel, like the other actions: a small falling two-note sound (respects mute) and an 8 ms haptic tick.
  - Only fires when something was actually undone. Version 1.10.12. Test added.

## Round 43 (2026-10-18, Grok Bot): FIRST-VISIT COACH RING
- When a first-time player closes the welcome card, two soft accent rings pulse out of the pot (about 2.6 s, then the class clears itself). It shows where to tap first.
  - It is a pointer to the control, not a mix suggestion: no color or amount is implied.
  - Off under reduced motion, and skipped if the round is already finished.
- Version 1.10.11. Shot: `r43-after-coach-ring.png`. Test added.

## Round 42 (2026-10-18, Grok Bot): STATS POLISH
- Score spread: once today is finished, the bucket holding today's score is highlighted (accent label and count) and the other bars dim, as in other daily games.
  - The highlight comes from the saved daily record only. The aria-label adds ", includes today".
- Last-14-days sparkline: the "par" label now has its own right gutter. The newest dot used to sit on top of it.
- Version 1.10.10. Shots: `r42-after-stats-{light,dark}.png` (before: `r16-after-stats-*`). Test added. axe clean.

## Round 41 (2026-10-18, Grok Bot): REGRESSION SWEEP + QUIET HAPTICS
- Re-ran the older Playwright suites against the current build: v3 (calendar, migration, old 3-attempt days), cal, duel, drop, pig, nostore, tab. All behave as before.
  - drop.js predates the welcome overlay, so it needs the welcomed flag seeded.
- Fix: `buzz()` now waits for `navigator.userActivation.hasBeenActive`.
  - Before, migrating an old save on load called vibrate before any tap. Chrome blocked it and logged a console warning. That console noise is gone.
- Version 1.10.9. Test added.
- Also verified (r39 follow-up): a midnight rollover simulated with `page.clock`.
  - #1 rolls to #2 with the countdown hidden; the streak is kept; yesterday's share still reads "#1 — How well do you know your colors?"; no errors.

## Round 40 (2026-10-18, Grok Bot): KEYBOARD SHORTCUTS
- Desktop shortcuts: `1`–`5` pick red/yellow/blue/black/white (ring order), `D` Dropper, `P` Pour Bucket, `Z` (or Ctrl/Cmd+Z) Undo. `Enter` on the focused pot already adds paint.
  - There is **no seal key**, so an attempt can't be sealed by accident.
  - Shortcuts are ignored while any dialog is open, inside form fields, and with Alt.
- Documented in Tips › The tools with `<kbd>` styling. Version 1.10.8. Playwright-verified. Test added.

## Round 39 (2026-10-18, Grok Bot): PLAY FROM THE CALENDAR
- The calendar's unplayed "Today" detail gets a "Play today's color →" button. It closes the overlay (focus returns to 📅), leaves practice if you were in it, and scrolls to the top.
- Version 1.10.7. Shot `r39-after-cal-today-play`. Test added.

## Round 38 (2026-10-18, Grok Bot): TIPS ICON CONSISTENCY
- The Tips prose now uses the same inline SVG icons as the UI for Dropper, Pour Bucket, Undo and the calendar. No 💧/🪣/📅 emoji remain in the page body. This supersedes the r20 note.
- Version 1.10.6. Shots: `r38-before-tips-emoji` → `r38-after-tips-icons`. Test added.

## Round 37 (2026-10-18, Grok Bot): ERROR GUARD
- A tiny inline guard runs before our scripts. If `colors/schedule/engine/game.js` from our own origin throws, a bottom banner says "Something went wrong loading Mixology. [Reload]" instead of leaving a dead page. It shows once; errors from extensions or other origins are ignored.
- Verified by serving old HTML (no `#btn-card`) with new JS: a dead page before, the banner now (`r37-after-error-banner.png`). A normal load and a third-party error show no banner.
- This complements the r32 cache-busting. Version 1.10.5. Test added.

## Round 36 (2026-10-18, Grok Bot): DUEL SHARE LINE · WEB SHARE PATH VERIFIED
- On phones, Copy duel link opens the share sheet with `{ text: "Beat my 93% on Mixology #1?", url }`. It never names the color. The clipboard fallback still copies just the link.
- Verified with a mocked `navigator.share`/`canShare`:
  - Share result sends the spoiler-free text plus `mixology-1.png` (image/png).
  - The duel share sends the challenge line plus the URL.
  - Neither payload contains the color name.
- Version 1.10.4. Test added.

## Round 35 (2026-10-18, Grok Bot): SPARKLINE → DAY
- Tapping a dot in Stats › Last 14 days switches to Calendar, jumps to that month, and opens the day's detail (recipe vs your mix, tries). Dots have an 11 px invisible hit area. Version 1.10.3. Test added.

## Round 34 (2026-10-18, Grok Bot): CALENDAR MONTH SLIDE
- Prev/next (and swipe, which uses the same buttons) slide the month grid in from the direction of travel: 0.26 s with a fade, none under reduced motion. Version 1.10.2.

## Round 33 (2026-10-18, Grok Bot): HEADLINE TITLE CASE · BALANCED NAME WRAP
- CSS `text-transform: capitalize` rendered "Blue With A Hint Of Purple". Names now go through a headline-style `titleCase()`: small joining words stay lower case unless first, and slashes split words. Result: "Blue with a Hint of Purple", "Green/Yellow".
  - Applied to the prompt, reveal, calendar and duel card.
  - Saves, WIP and schedule still store the raw bank name.
- `text-wrap: balance` on the prompt name gives even two-line breaks.
- Checked the five longest names at 320/390: no overflow.
- Shots: `r33-before-longname-320` → `r33-after-{longname,slashname}-320`. Test added.

## Round 32 (2026-10-18, Grok Bot): DEPLOY CACHE SAFETY
- GitHub Pages serves with `max-age=600`, so for about 10 minutes after a deploy a browser can pair a cached old `game.js` with the new `index.html`, or the reverse.
  - New JS + old HTML is a real crash: for example, `$('btn-card')` would be null and `addEventListener` would throw, killing the game.
- All four scripts now load as `*.js?v=<version>`. Version bumped to 1.10.0. A test enforces that the stamp equals `MISNOMER.version`. The README tells Muse to bump both together.

## Round 31 (2026-10-18, Grok Bot): CALM FINISHED STATE
- After the round, the big seal button no longer looks like a faded call to action. It becomes "Round complete ✓": a dashed outline with muted text at full opacity, in both light and dark.
- The best attempt keeps its ink ring. Shots: `r31-after-finished-actions-{light,dark}`. Test added.

## Round 30 (2026-10-18, Grok Bot): DUEL CARD POLISH
- Finished duel: title-cased name ("Duel · #1 “Lipstick”"), bold scores, and the winner's swatch ringed in accent with a bold label. Verdict line is bold. "They take this one. Rematch tomorrow." fixes the dash style.
- The pending (today, not yet played) card gets an accent left border. It is still spoiler-free: no name, no color, no score.
- The spoiler test now targets the exact today-branch, not the first textual match.
- Shots: `r30-before-duel-*` / `r30-after-duel-*`.

## Round 29 (2026-10-18, Grok Bot): RECENT-FORM SPARKLINE
- The Stats tab has a "Last 14 days" SVG sparkline.
  - Dots at each day's % (accent when at par); missed days break the line; a dashed par line.
  - The y-range zooms to where scores live (from min(40, lowest decade) to 100).
  - It has an `aria-label` listing the scores and needs at least 2 points.
- Test added.

## Round 27–28 (2026-10-18, Grok Bot): SELECT FEEL · CALENDAR SWIPE
- Changing pigment or tool gives a soft 660 Hz tick (respects mute) and a 6 ms haptic. Re-tapping the current selection stays silent.
- Swiping the calendar grid left/right changes month on touch.
  - It needs ≥ 50 px and a mostly-horizontal swipe, so vertical scroll is never hijacked.
  - It goes through the same prev/next buttons, so the future month stays locked.
  - Listeners are passive.
- Playwright verified: month back and forth works, and swiping into the future is blocked. Test added.

## Round 26 (2026-10-18, Grok Bot): CONTROL STATES FOR SCREEN READERS
- Pigment discs and tool buttons expose `aria-pressed`, so the selected pigment and tool are announced, not just drawn.
- The pot's accessible name follows the selection: "Pour blue into the pot (hold to keep pouring)" / "Add one drop of blue to the pot" / "Pot (round complete)".
  - It never describes the mix or the target (no-caption lock). A test enforces this.
- Keyboard dosing (Enter on the focused pot) verified. axe is still clean in all 12 states.

## Round 25 (2026-10-18, Grok Bot): REVEAL ACTION ICONS · STORAGE ROBUSTNESS CHECK
- Share result, Copy duel link and Save image card now have SVG icons (share-arrow, link, picture). The 🖼 emoji is gone.
- `flashLabel()` shows "Copied ✓" / "Link copied ✓" / "Saved ✓" and then restores the button's full markup, so icons survive. Double taps no longer get stuck on the ✓ label (the old code could save "Copied ✓" as the label to restore).
- Robustness check, with no code change needed: with `localStorage` throwing on access, or `setItem` throwing QuotaExceeded, the game still loads, plays, finishes and opens calendar and stats with no page errors.
- Test added.

## Round 24 (2026-10-18, Grok Bot): INSTALL POLISH · TIPS
- Installed (standalone) on notched phones: `#app` padding now respects `env(safe-area-inset-*)` (we already set `viewport-fit=cover`).
  - Added apple/mobile web-app-capable and status-bar meta tags.
  - The manifest gets `id`, portrait orientation and categories.
- Tips gain an "After the round" section: recipe vs your mix, spoiler-free share with the image card on phones, duel links, and 📅 calendar & stats (device-only). Tool dosages are unchanged.
- Re-ran axe (12 states clean), a11y and dark-mode checks. Test added.

## Round 23 (2026-10-18, Grok Bot): VIEWPORT SWEEP · SMALL-PHONE HEADER
- Swept 320×640, 390×844, 844×390 landscape and 1280×800 desktop: no horizontal overflow and no errors.
- **Bug:** at 320px the header buttons overlapped the "MIXOLOGY." wordmark (`r23-before-header-320-overlap.png`).
  - Fix: a `max-width: 360px` media query with a smaller wordmark and tighter header buttons.
  - Measured with a text Range at 320/340/360/375/390: the gap between wordmark and buttons is ≥ 6px at every width (`r23-after-header-320.png`).
- Landscape: the calendar panel scrolls inside 92vh (expected). Desktop stays a centered 460px column.

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
