/* Misnomer — game controller (DOM wiring, state, saves, duels, share).
 * Pure color logic lives in engine.js; data in colors.js.
 * Exposes window.MISNOMER for inspection/automated playtests. */
'use strict';

const E = window.MisnomerEngine;
const BANK = window.MISNOMER_COLORS;
// Round 77 (Franklin): every color's scoring target is the color its whole-drop
// recipe renders (thex), so matching the official recipe scores 100%. `hex`
// stays the raw named value (it still decides how well a recipe represents
// the name); everything the player sees as "the official color" uses thex.
for (const c of BANK) c.thex = E.recipeHex(c.recipe);
// Round 8: daily-eligible = the solver's best recipe scores >= par
// (engine.isDailyEligible / PAR_PCT) — no hard-coded ΔE threshold.
const POOL = BANK.filter(c => !c.retired && E.isDailyEligible(c.de)); // round 66: retired names stay resolvable (BANK_BY_NAME) but never play again
const BANK_BY_NAME = new Map(BANK.map(c => [c.name, c]));
const SCHEDULE = window.MIXOLOGY_SCHEDULE || [];

/* Round 8: the daily color comes from the FROZEN schedule (schedule.js,
 * tools/build-schedule.js), so pool changes never move past days, duel
 * links, or today's color. Past the schedule's horizon it falls back to
 * the seeded picker over the pool. */
function colorForDay(day) {
  const c = BANK_BY_NAME.get(SCHEDULE[day]);
  return c || POOL[E.pickDailyIndex(day, POOL.length)];
}
/* Round 93 (Franklin): DUO days. Two named colors in one daily: two tries at
 * each (4 in all), the best try per color counts and the day's score is the
 * AVERAGE of the two (rounded). The end screen draws a picture (a pumpkin) in
 * the official colors next to the same picture in the player's two mixes.
 * Color 1 is always the frozen schedule's color for that day (so nothing in
 * schedule.js moves); only color 2 is added. Keyed by the internal day, i.e.
 * the player's LOCAL date like every daily. Only #14 (Sat 2026-10-31) for now.
 * Nothing duo-related is shown on any other day (no spoilers before it). */
const DUO_DAYS = {
  669: { id: 'halloween-2026', label: 'Halloween', emoji: '\u{1F383}', title: 'Halloween Duo', motif: 'pumpkin',
    colors: ['pumpkin', 'midnight purple'], roles: ['the pumpkin', 'the face and stem'] }
};
const _duoCache = {};
function duoFor(day) {
  const d = DUO_DAYS[day]; if (!d) return null;
  if (!_duoCache[day]) {
    const cols = d.colors.map(n => BANK_BY_NAME.get(n));
    if (cols.some(c => !c) || cols[0].name !== colorForDay(day).name) return null; // misconfigured: play a normal day
    _duoCache[day] = Object.assign({}, d, { day, colors: cols });
  }
  return _duoCache[day];
}
const currentDay = () => E.dayNumber(new Date()) + 1; // display/share day number (#1 = 2025-01-01)
let DAY = currentDay();             // mutable: rolls over in an open tab (see checkDayRollover)
let todayColor = colorForDay(DAY);

/* Two tools only: Dropper (one drop per click) and Pour Bucket (press and
 * hold to pour). Their dosages appear ONLY in the Tips overlay.
 * Round 6 — THE PERCENTAGE POT: the pot state is a composition
 * {r, y, b, k, w} of percentages summing to exactly 100 (fresh pot is
 * 100% white). One drop = 1 unit = 1% of the pot; dosing displaces the
 * rest proportionally (engine.addUnits). There is no cap and no refusal:
 * the pot can never overflow and never gets stuck. */
/* Round 9: TWO attempts per round (daily and practice), best one counts.
 * The early-finish "lock in" button is gone: the round ends by itself
 * after the 2nd seal. Best-of replaces last-counts so a strong first
 * attempt can never be thrown away by the forced second one. */
const MAX_ATTEMPTS = 2;
function bestAttempt(atts) {
  let best = null;
  for (const a of atts || []) if (!best || a.pct > best.pct) best = a; // ties: earliest
  return best;
}
/* The attempt a saved day was scored on: rounds before round 9 scored
 * the LAST attempt (rec.pct/rec.hex record it); from round 9, the best. */
function scoredAttempt(rec) {
  return rec.attempts.find(a => a.hex === rec.hex && a.pct === rec.pct) || bestAttempt(rec.attempts);
}
const TOOLS = { dropper: 1, pour: 1 }; // every dose is one unit; pouring repeats on a timer
const POUR_TICK_HZ = 30; // pour timer ticks per second; how many units land per tick follows E.pourUnitsAt (round 62 ramp)
const PIGMENT_HEX = { r: '#D6282E', y: '#FFCD00', b: '#1C4096', k: '#141416', w: '#FFFFFF' };
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const BUCKET_KEYS = ['r', 'y', 'b', 'k', 'w']; // 'w' is the white bucket
const BUCKET_EL = { r: 'bucket-r', y: 'bucket-y', b: 'bucket-b', k: 'bucket-k', w: 'bucket-base' };

/* ---------------- save layer (write-on-change over localStorage) ------- */
const SAVE_KEY = 'misnomer.save.v1';
function defaultSave() {
  return { v: 2, streak: 0, parStreak: 0, lastDay: null, days: {}, wip: null, muted: false, practiceRounds: 0 };
}
/* Round-6 migration (save v1 -> v2): v1 stored DROPS vectors
 * ({r, y, b, k, base} — paint accumulated in a growing pot). v2 stores
 * PERCENTAGE compositions ({r, y, b, k, w} summing to 100). A v1 vector
 * normalizes to the composition it represented, so finished days, the
 * streak and any in-progress pot survive the model transplant. */
function dropsToComp(d) {
  if (!d) return { ...E.FRESH_COMP };
  return E.normalizeComp({ r: d.r || 0, y: d.y || 0, b: d.b || 0, k: d.k || 0, w: d.base || 0 });
}
function migrateSave(data) {
  if (!data || data.v >= 2) return data;
  if (data.wip && data.wip.pot && data.wip.pot.base != null) {
    data.wip.pot = dropsToComp(data.wip.pot);
  }
  if (data.wip && Array.isArray(data.wip.attempts)) {
    for (const att of data.wip.attempts) {
      if (att.drops) { att.comp = dropsToComp(att.drops); delete att.drops; }
    }
  }
  if (data.days) {
    for (const day of Object.values(data.days)) {
      if (day && Array.isArray(day.attempts)) {
        for (const att of day.attempts) {
          if (att.drops) { att.comp = dropsToComp(att.drops); delete att.drops; }
        }
      }
    }
  }
  data.v = 2;
  return data;
}
let saveWasMigrated = false;
const store = {
  data: (() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const merged = Object.assign(defaultSave(), parsed);
        merged.v = parsed.v || 1; // pre-v2 saves carry v:1 (or none)
        const out = migrateSave(merged);
        if (out.v > (parsed.v || 1)) saveWasMigrated = true;
        return out;
      }
    } catch (e) { /* fresh start */ }
    return defaultSave();
  })(),
  _t: null,
  persistSoon() {
    clearTimeout(this._t);
    this._t = setTimeout(() => this.persist(), 200);
  },
  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) { /* private mode etc. */ }
  }
};
window.addEventListener('pagehide', () => store.persist());
/* Write a migrated save straight back, so the on-disk format is always
 * current and the migration only ever runs once. */
if (saveWasMigrated) store.persist();

/* ---------------- tiny sound (WebAudio, mute-respecting) --------------- */
let actx = null;
function beep(freq, dur, type, vol, when) {
  if (store.data.muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + (when || 0);
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* sound is optional */ }
}
const sfx = {
  dose() { beep(220 + Math.random() * 60, 0.05, 'square', 0.025); },
  pour(k = 0) { beep(110 + 50 * k + Math.random() * 40, 0.12 - 0.04 * k, 'sine', 0.03); }, // soft glug while pouring; r64: quicker and higher as the pour speeds up
  seal() { beep(150, 0.09, 'triangle', 0.06); },
  pick() { beep(660, 0.035, 'sine', 0.025); }, // round 27: soft tick on pigment/tool change
  undo() { beep(440, 0.05, 'sine', 0.03); beep(330, 0.06, 'sine', 0.025, 0.045); }, // round 44: a small falling two-note
  reveal() { [523, 659, 784].forEach((f, i) => beep(f, 0.16, 'sine', 0.05, i * 0.09)); },
  // round 15: tiered finish. Par adds a fourth note, 95%+ a sparkle run.
  par() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'sine', 0.05, i * 0.09)); },
  discover() { [880, 1175, 1568].forEach((f, i) => beep(f, 0.12, 'triangle', 0.045, i * 0.07)); }, // round 69
  ace() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep(f, 0.2, i > 3 ? 'triangle' : 'sine', 0.05, i * 0.075)); }
};

/* ---------------- round state ------------------------------------------ */
function freshPot() { return { ...E.FRESH_COMP }; }
let selectedBucket = 'r';
let selectedTool = 'pour'; // round 7: the Pour Bucket is the default tool; the Dropper is the switch-to
let round = null; // {mode, color, pot, undo:[], attempts:[], finished}

function newRound(mode, color) {
  gestureOpen = false;
  round = { mode, color, day: DAY, pot: freshPot(), undo: [], attempts: [], finished: false };
  const dd = mode === 'daily' ? duoFor(DAY) : null; // round 93
  if (dd) { round.duo = { def: dd, idx: 0, parts: [null, null] }; round.color = dd.colors[0]; }
  renderAll();
}
function mixHex() { return E.mixColor(round.pot); }
function targetLab() { return E.hexToLab(round.color.thex); } // round 77: the recipe color

/* Undo is GESTURE-based (round 6): one snapshot per press or hold, so a
 * whole pour — however many units — is a single Undo step. (The old
 * per-drop undo stack needed up to 90 clicks to take back one pour;
 * see tools/stuck-diagnosis-round5.md.) A gesture opens on a press /
 * pour start and closes on release or on the next discrete action. */
let gestureOpen = false;
function beginGesture() {
  if (gestureOpen || !round) return;
  gestureOpen = true;
  if (round.mode === 'daily' && !round.finished) trackDaily('start', round.day); // round 78: first dose of the day
  round.undo.push({ snapshot: { ...round.pot } });
}
function endGesture() { gestureOpen = false; }

/* Round 81 (Franklin): a first-time player sees "Hold to pour" on the empty
 * pot until their first drop, then never again in this browser. Static
 * label (pointer-events none), no pot effects; only a short fade on
 * dismissal. Anyone with a saved day or a day in progress never sees it. */
const POURED_KEY = 'mixology.poured.v1';
const potHint = { on: false };
function initPotHint() {
  let poured = false; try { poured = !!localStorage.getItem(POURED_KEY); } catch (e) { poured = true; }
  const hasHistory = Object.keys(store.data.days || {}).length > 0 || !!store.data.wip;
  potHint.on = !poured && !hasHistory;
}
function potIsEmpty() { return !!round && E.isEmptyComp(round.pot); } // round 83: the fresh pot is empty
function potHintShown() { return potHint.on && !!round && !round.finished && potIsEmpty(); }
function markPoured() {
  if (!potHint.on) return;
  potHint.on = false;
  try { localStorage.setItem(POURED_KEY, '1'); } catch (e) { /* private mode */ }
}
function renderPotHint() {
  const el = $('pot-hint'); if (!el) return;
  const show = potHintShown();
  if (show) { clearTimeout(el._t); el.hidden = false; el.classList.add('show'); return; }
  if (el.hidden) return;
  el.classList.remove('show'); // CSS fades it out (instant under reduced motion)
  clearTimeout(el._t); el._t = setTimeout(() => { if (!potHintShown()) el.hidden = true; }, REDUCED_MOTION ? 0 : 400);
}

/* Apply ONE unit (one drop = 1% of the pot) of the selected pigment.
 * Displacement is the engine's job (addUnits renormalizes to 100). */
function applyUnit(silent) {
  round.pot = E.addUnits(round.pot, selectedBucket, 1);
  markPoured(); // round 81: the first drop retires the "Hold to pour" label for good
  if (!silent) sfx.dose();
  renderAll(); persistWip();
}

/* Dose the SELECTED pigment by one drop — exactly what one pot press
 * with the Dropper does. dose() with no argument doses the current
 * selection; dose(bucketKey) selects that pigment first (playtest
 * convenience). The white pigment's key is 'w'. One call = one gesture
 * = one undo step. Always lands: the percentage pot has no cap. */
function dose(bucket, silent) {
  if (!round || round.finished) return false;
  if (bucket) selectedBucket = bucket;
  beginGesture();
  applyUnit(silent);
  endGesture();
  return true;
}
function undo() {
  stopPour(); stopRemove();
  if (!round || round.finished || !round.undo.length) return;
  const last = round.undo.pop();
  if (last.snapshot) round.pot = last.snapshot;
  else if (last.key) round.pot = E.addUnits(round.pot, last.key, -last.n); // legacy entry
  sfx.undo(); buzz(8);
  renderAll(); persistWip();
}
function resetPot() {
  stopPour();
  if (!round || round.finished) return;
  round.undo.push({ snapshot: { ...round.pot } });
  round.pot = freshPot();
  renderAll(); persistWip();
}

/* ---------------- dosing animation + pour ------------------------------- */
/* Dosing visuals. The Dropper (an SVG rig, see dropAnim) squeezes and a drop
 * falls toward the pot. The Pour Bucket tilts and a stream in the pigment
 * color runs from the bucket lip to the pot (drawStream). Round 67 (Franklin):
 * NOTHING is drawn on or in the pot. No swirl, bloom, ripple, splash or color
 * spot; the pot surface only eases to the new mix color (CSS transition).
 * Transform/opacity only, skipped under reduced motion. Light haptics on phones. */
let pourTimer = null;
const FX_PIGMENT = k => PIGMENT_HEX[k] || '#FFFFFF';
function rgba(hex, a) { const [r, g, b] = E.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function buzz(ms) { // ms: number or vibration pattern
  // Round 41: skip until the player has interacted. Browsers block it anyway and
  // log a console warning (e.g. when an old save is migrated on load).
  const ua = navigator.userActivation;
  if (ua && !ua.hasBeenActive) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* optional */ } }
/* Geometry: points in #stage px. The surface circle comes from layout. */
function surfaceGeom() {
  const stage = $('stage'), surf = $('pot-surface');
  if (!stage || !surf) return null;
  const sr = stage.getBoundingClientRect(), pr = surf.getBoundingClientRect();
  return { cx: pr.left - sr.left + pr.width / 2, cy: pr.top - sr.top + pr.height / 2, r: pr.width / 2, left: pr.left - sr.left, top: pr.top - sr.top, stageH: sr.height };
}
/* Round 9: the stream leaves the TILTED bucket's lip (#bucket-lip,
 * measured after the CSS rotation) and arcs into the pot. */
function pointOf(el) {
  const st = $('stage').getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - st.left + r.width / 2, y: r.top - st.top + r.height / 2 };
}
function pourImpact() {
  const g = surfaceGeom();
  if (!g) return null;
  return { x: g.cx + g.r * 0.3, y: g.cy - g.r * 0.22, g };
}
/* Round 67 (Franklin): nothing is drawn on or in the pot. The ripple, bloom
 * and splash effects are removed; the pot only eases to the new color. */
/* Round 9: the Dropper is a graphic over the pot — the bulb squeezes,
 * a drop swells at the glass tip, then falls into the pot. */
function dropAnim() {
  if (REDUCED_MOTION) return;
  const stage = $('stage'), g = surfaceGeom(), tipEl = $('dropper-tip'), rig = $('dropper-rig');
  if (!stage || !g || !tipEl) return;
  const color = FX_PIGMENT(selectedBucket);
  const tip = pointOf(tipEl);
  const land = { x: g.cx + g.r * 0.12, y: g.cy - g.r * 0.05 };
  rig.classList.remove('squeeze'); void rig.offsetWidth; rig.classList.add('squeeze');
  const d = document.createElement('div');
  d.className = 'fdrop';
  d.style.left = tip.x + 'px'; d.style.top = tip.y + 'px';
  d.style.background = color;
  $('fx').appendChild(d);
  const dx = land.x - tip.x, dy = land.y - tip.y;
  try {
    const a = d.animate([
      { transform: 'translate(0,0) scale(.15)', opacity: 1 },
      { transform: 'translate(0,0) scale(1)', opacity: 1, offset: .42 },
      { transform: `translate(${dx * 0.25}px,${dy * 0.18}px) scale(.95,1.1)`, opacity: 1, offset: .62, easing: 'cubic-bezier(.5,0,1,.7)' },
      { transform: `translate(${dx}px,${dy}px) scale(.9,1.2)`, opacity: 1 }
    ], { duration: 460, easing: 'ease-in' });
    a.onfinish = () => { d.remove(); buzz(8); }; // the drop ends at the surface: no ripple/bloom/splash (r67)
  } catch (e) { d.remove(); }
  setTimeout(() => d.remove(), 900);
}
function pourFx(tick) { // r67: no visuals on the pot surface; keep the light haptic
  if (tick % 6 === 0) buzz(5);
}
let streamRaf = 0, streamOn = false;
function drawStream() {
  const lipEl = $('bucket-lip'), hit = pourImpact();
  if (!lipEl || !hit) return;
  const st = $('stage'), lip = pointOf(lipEl);
  const svg = $('fx-svg');
  svg.setAttribute('viewBox', `0 0 ${st.clientWidth} ${st.clientHeight}`);
  // leaves the lip moving toward the pot, then falls (quadratic arc)
  const t = performance.now() / 1000, wob = Math.sin(t * 19) * 1.5;
  const cx = lip.x + (hit.x - lip.x) * 0.55, cy = lip.y + 2;
  const d = `M${lip.x.toFixed(1)} ${lip.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${(hit.x + wob).toFixed(1)} ${hit.y.toFixed(1)}`;
  for (const id of ['stream-outline', 'stream-main', 'stream-flow']) $(id).setAttribute('d', d);
}
function streamLoop() {
  if (!streamOn) return;
  drawStream();
  streamRaf = requestAnimationFrame(streamLoop);
}
function startPour() {
  if (!round || round.finished || pourTimer) return;
  beginGesture(); // the whole hold is ONE undo step
  const color = FX_PIGMENT(selectedBucket);
  $('stream-main').style.stroke = color;
  const stage = $('stage');
  stage.classList.add('pouring');
  streamOn = true;
  streamLoop();
  // paint reaches the pot once the bucket has tilted (~120 ms); the
  // first unit lands immediately so a quick tap still doses
  applyUnit();
  let ticks = 0, poured = 0; const t0 = performance.now();
  const streamDelay = REDUCED_MOTION ? 0 : 110;
  stage._streamT = setTimeout(() => { if (pourTimer) stage.classList.add('streaming'); }, streamDelay);
  sfx.pour();
  pourTimer = setInterval(() => {
    if (!round || round.finished) { stopPour(); return; }
    // round 62: the rate ramps from 30/s to 90/s. Whole units land to catch up
    // with the curve, at most 6 per tick so a stalled tab can't dump a bucket.
    const sec = (performance.now() - t0) / 1000;
    const n = Math.min(6, Math.floor(E.pourUnitsAt(sec)) - poured);
    if (n > 0) { // no cap exists: a pour can only be stopped by release
      for (let i = 0; i < n; i++) round.pot = E.addUnits(round.pot, selectedBucket, 1);
      poured += n; renderAll(); persistWip();
    }
    // the stream thickens with the rate (8 to 13 px core)
    const k = (E.pourRateAt(sec) - E.POUR_RATE_START) / (E.POUR_RATE_MAX - E.POUR_RATE_START);
    $('stream-main').style.strokeWidth = (8 + 5 * k).toFixed(2); $('stream-outline').style.strokeWidth = (10 + 6 * k).toFixed(2);
    ticks++;
    if (stage.classList.contains('streaming')) pourFx(ticks);
    if (ticks % (k > 0.5 ? 3 : 5) === 0) sfx.pour(k);
  }, 1000 / POUR_TICK_HZ);
}
function stopPour() {
  if (pourTimer) { clearInterval(pourTimer); pourTimer = null; }
  endGesture();
  const stage = $('stage');
  if (stage) {
    clearTimeout(stage._streamT);
    stage.classList.remove('pouring', 'streaming');
  }
  streamOn = false;
  cancelAnimationFrame(streamRaf);
  for (const id of ['stream-main', 'stream-outline']) { const el = $(id); if (el) el.style.strokeWidth = ''; }
}

/* Round 68 (Franklin): take a paint OUT. Every disc holding paint gets a small
 * "−" badge (its own button, outside the disc so it is not hit by mistake when
 * picking a paint). A tap takes out 1 unit (about 1% of the pot) and the rest
 * renormalize. A hold keeps removing on the Pour Bucket's ramp (30/s up to 90/s,
 * E.pourUnitsAt) until release or until that paint reaches 0. One press or hold
 * is ONE undo step. The selection does not change. */
let removeTimer = null, removeKey = null;
function removeOne(key) {
  round.pot = E.removeUnits(round.pot, key, 1);
}
function startRemove(key) {
  if (!round || round.finished || removeTimer) return;
  stopPour();
  if (!(round.pot[key] > 0)) return;
  beginGesture();
  removeKey = key;
  removeOne(key); sfx.undo(); buzz(6);
  renderAll(); persistWip();
  let removed = 0; const t0 = performance.now();
  removeTimer = setInterval(() => {
    if (!round || round.finished || !(round.pot[key] > 0)) { stopRemove(); return; }
    const sec = (performance.now() - t0) / 1000;
    const n = Math.min(6, Math.floor(E.pourUnitsAt(sec)) - removed);
    if (n > 0) {
      for (let i = 0; i < n && round.pot[key] > 0; i++) removeOne(key);
      removed += n; renderAll(); persistWip();
      if (!(round.pot[key] > 0)) { buzz(12); stopRemove(); }
    }
  }, 1000 / POUR_TICK_HZ);
}
function stopRemove() {
  if (removeTimer) { clearInterval(removeTimer); removeTimer = null; }
  if (removeKey && round) {
    const pct = E.displayPercents(round.pot)[removeKey];
    announce(`${PIG_NAMES[removeKey]} is now ${pct} of the pot`);
  }
  removeKey = null;
  endGesture();
}
/** Playtest/keyboard: one tap of the remove badge (one undo step). */
function removePaint(key) {
  if (!round || round.finished || !(round.pot[key] > 0)) return false;
  startRemove(key); stopRemove();
  return true;
}

function seal() {
  stopPour(); stopRemove();
  if (!round || round.finished || round.attempts.length >= MAX_ATTEMPTS) return null;
  if (E.isEmptyComp(round.pot)) return null; // round 83: an empty pot can't be submitted
  // round 77: scored against the official recipe; an exact recipe match
  // (disc numbers equal to the recipe's) is 100%
  const sc = E.scoreMix(round.pot, round.color.recipe);
  const att = { comp: { ...round.pot }, hex: sc.hex, pct: sc.pct, de: sc.de };
  if (sc.exact) att.exact = true;
  round.attempts.push(att);
  if (!(round.duo && round.duo.idx > 0)) { // round 93: on a duo day a1 is color 1's first try only
    if (round.mode === 'daily' && round.attempts.length === 1) trackScore('a1', round.day, sc.pct); // round 83
  }
  justSealed = round.attempts.length - 1;
  sfx.seal();
  announce(`Attempt ${round.attempts.length} submitted: ${att.pct}% accuracy.` + (round.attempts.length === 1 && round.attempts.length < MAX_ATTEMPTS ? ` Hint: ${hintText(att)}.` : ''));
  if (round.duo && round.duo.idx === 0 && round.attempts.length >= MAX_ATTEMPTS) duoAdvance(); // round 93: color 1 done, on to color 2
  else if (round.attempts.length >= MAX_ATTEMPTS) finish(); // finish() has its own tiered haptic
  else { buzz(18); renderAll(); persistWip(); } // round 56: a firm tap for a non-final seal
  return att;
}

/* Round 77 (Franklin): one plain-words hint after attempt 1, until attempt 2
 * is submitted (engine.mixHint). Never in share text, duel links or the card. */
function hintText(att) { return att && att.hex ? E.mixHint(E.hexToLab(att.hex), targetLab(), att.pct) : ''; }
function hintHTML(att) {
  const t = hintText(att);
  return t ? `<span id="hint" class="hint"><span class="hint-k">Hint</span> ${escapeHtml(t)}</span>` : '';
}

/* Round 78 (Franklin): anonymous play counts via analytics.js. A no-op while
 * ANALYTICS_CODE is empty, when analytics.js is blocked, and for opted-out
 * browsers. Only puzzle numbers and coarse buckets: never a name or a score. */
const MA = window.MixAnalytics;
function track(name) { try { if (MA) MA.track(name); } catch (e) { /* never break the game */ } }
function trackDaily(kind, day) { const n = E.publicNumber(day); if (n) track(`${kind}-#${n}`); }
function trackReturn() {
  if (!MA) return;
  const f = firstPlayedDay(); if (f == null) return;
  const b = MA.returnBucket(DAY - f); if (b) track('return-day-' + b);
}
/* Round 83: difficulty numbers (attempt-1 score, final score, how far the
 * final mix's disc numbers are from the recipe's, how many paints it uses).
 * Built from numbers by analytics.js helpers; no name ever goes in. */
function trackScore(stage, day, score) {
  if (!MA) return;
  const n = E.publicNumber(day), lbl = MA.scoreLabel(score);
  if (n && lbl) track(`pct-#${n}-${stage}-${lbl}`);
}
function trackMix(day, mix, target) {
  if (!MA || !mix || !target) return;
  const n = E.publicNumber(day); if (!n) return;
  const mine = E.displayPercents(mix), off = MA.offBucket(MA.recipeOff(mine, E.displayPercents(target))), pc = MA.paintCount(mine);
  if (off) track(`off-#${n}-${off}`);
  if (pc) track(`paints-#${n}-${pc}`);
}
function trackFinish(day, pct) {
  if (!MA) return;
  trackDaily('finish', day);
  track('score-band-' + MA.scoreBand(pct));
  const st = MA.stepBucket(liveStreaks().streak); if (st) track('streak-' + st);
  const pd = MA.stepBucket(Object.keys(store.data.days).length); if (pd) track('played-days-' + pd);
  trackReturn();
}

function finish() {
  stopPour();
  if (!round || round.finished || !round.attempts.length) return;
  if (round.duo) return finishDuo(); // round 93: a duo day (two colors) is saved and scored by finishDuo()
  round.finished = true;
  streakAtStart = store.data.streak || 0;
  const final = bestAttempt(round.attempts);
  if (round.mode === 'daily') {
    const s = store.data;
    const day = round.day; // the round's own day — it may have started before midnight
    const already = !!s.days[day];
    s.days[day] = {
      date: E.dateKey(new Date()), name: round.color.name,
      attempts: round.attempts, pct: final.pct, de: final.de,
      band: E.bandForDeltaE(final.de), hex: final.hex, scoring: 'best'
    };
    if (!already) {
      const par = final.pct >= E.PAR_PCT;
      if (s.lastDay === day - 1) {
        s.streak += 1;
        s.parStreak = par ? s.parStreak + 1 : 0;
      } else if (s.lastDay == null || s.lastDay < day) {
        s.streak = 1;
        s.parStreak = par ? 1 : 0;
      }
      if (s.lastDay == null || day > s.lastDay) s.lastDay = day;
    }
    s.wip = null;
    store.persistSoon();
  }
  // Round 84 (Franklin): practice counts for NOTHING persistent: no save write
  // (the old practiceRounds counter is no longer bumped), no Collection
  // discovery or best %, no star, no recipe unlock, no stats or analytics.
  const streakBefore = round.mode === 'daily' ? streakAtStart : null;
  announce(`Round complete. Your best attempt scored ${final.pct}%, ${E.bandForDeltaE(final.de)}.`);
  if (final.pct >= 95) sfx.ace(); else if (final.pct >= E.PAR_PCT) sfx.par(); else sfx.reveal();
  renderAll();
  maybeShowDuel();
  scrollRevealIntoView();
  revealEntrance(final.pct);
  celebrate(final.pct, round.mode === 'daily' && store.data.streak > (streakBefore || 0));
  if (round.mode === 'daily') queueDiscoveryToasts(collectRound(round.attempts, round.color.name)); // round 69: announced only now, at the reveal; round 84: dailies only
  if (round.mode === 'daily') trackFinish(round.day, final.pct); // round 78
  if (round.mode === 'daily') { trackScore('final', round.day, final.pct); trackMix(round.day, final.comp, round.color.recipe); } // round 83
}
/* Round 93: the end of a duo day (daily rounds only; duo state never exists in
 * practice). ONE day record: name/attempts/hex are color 1's, so every older
 * reader (transfer merge, collection backfill, spoiler rule) keeps working; pct
 * and de are the averages; `duo` holds both colors. The streak rules are the
 * same as finish(): a duo day is simply that day's play. */
function finishDuo() {
  const duo = round.duo;
  round.finished = true;
  streakAtStart = store.data.streak || 0;
  duo.parts[1] = round.attempts;
  const finals = duo.parts.map(p => bestAttempt(p));
  const sum = duoSummary(finals);
  const s = store.data;
  const day = round.day;
  const already = !!s.days[day];
  const rec = {
    date: E.dateKey(new Date()), name: duo.def.colors[0].name,
    attempts: duo.parts[0], pct: sum.pct, de: sum.de,
    band: E.bandForDeltaE(sum.de), hex: finals[0].hex, scoring: 'best',
    duo: { id: duo.def.id, names: duo.def.colors.map(c => c.name), parts: duo.parts,
      pcts: finals.map(f => f.pct), hexes: finals.map(f => f.hex), des: finals.map(f => f.de) }
  };
  s.days[day] = rec;
  if (!already) {
    const par = sum.pct >= E.PAR_PCT;
    if (s.lastDay === day - 1) { s.streak += 1; s.parStreak = par ? s.parStreak + 1 : 0; }
    else if (s.lastDay == null || s.lastDay < day) { s.streak = 1; s.parStreak = par ? 1 : 0; }
    if (s.lastDay == null || day > s.lastDay) s.lastDay = day;
  }
  s.wip = null;
  store.persistSoon();
  announce(`Duo complete. ${titleCase(duo.def.colors[0].name)} ${finals[0].pct}%, ${titleCase(duo.def.colors[1].name)} ${finals[1].pct}%. Average ${sum.pct}%.`);
  if (sum.pct >= 95) sfx.ace(); else if (sum.pct >= E.PAR_PCT) sfx.par(); else sfx.reveal();
  renderAll();
  maybeShowDuel();
  scrollRevealIntoView();
  revealEntrance(sum.pct);
  celebrate(sum.pct, store.data.streak > streakAtStart);
  if (round.mode === 'daily') { // always true (duo state only exists on a daily); kept explicit like finish()
    const fresh = []; // both colors collect
    duo.def.colors.forEach((c, i) => { for (const n of collectRound(duo.parts[i], c.name)) if (!fresh.includes(n)) fresh.push(n); });
    queueDiscoveryToasts(fresh);
    trackFinish(day, sum.pct); // score-band etc. from the average
    trackScore('final', day, sum.pct);
    trackScore('c2', day, finals[1].pct);
    trackMix(day, finals[0].comp, duo.def.colors[0].recipe); // off-/paints- describe color 1 (the scheduled color)
  }
}

/* Round 17: screen-reader announcements (polite live region). It only
 * repeats what is already on screen (the attempt %), nothing more. */
function announce(msg) {
  const el = $('sr-announce'); if (!el) return;
  el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 30);
}
/* Round 15: feel. Confetti at 95%+ (skipped under reduced motion), haptics
 * scaled to the result, and a flame bump when the daily streak grows. */
let streakAtStart = 0;
let justSealed = -1;
/* Round 18: the reveal arrives instead of just appearing. The card fades
 * up, the two swatches slide in from their sides, and the % counts up.
 * Only on a fresh finish (a reload shows it settled); none under reduced motion. */
function revealEntrance(pct) {
  const el = $('reveal'); if (!el || REDUCED_MOTION) return;
  el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
  setTimeout(() => el.classList.remove('enter'), 1200);
  const out = round && round.duo ? $('dr-avg') : $('reveal-pct'), t0 = performance.now(), D = 750; // round 93: the duo average counts up
  const step = now => {
    const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
    out.textContent = Math.round(pct * e) + '%';
    if (k < 1) requestAnimationFrame(step); else out.textContent = pct + '%';
  };
  requestAnimationFrame(step);
}
function celebrate(pct, streakGrew) {
  if (pct >= 95) { buzz([14, 50, 14, 50, 28]); confetti(); }
  else if (pct >= E.PAR_PCT) buzz([14, 50, 22]);
  else buzz(12);
  if (streakGrew) {
    const f = document.querySelector('#streak-display .flame');
    if (f && !REDUCED_MOTION) { f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump'); }
  }
}
function confetti() {
  if (REDUCED_MOTION || !document.body.animate) return;
  const layer = document.createElement('div');
  layer.className = 'confetti'; layer.setAttribute('aria-hidden', 'true');
  const cols = [round && round.color.thex, '#D6282E', '#FFCD00', '#1C4096', '#ffffff', '#b3541e'].filter(Boolean);
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('i');
    const w = 6 + Math.random() * 6, h = w * (0.4 + Math.random() * 0.8);
    s.style.cssText = `width:${w}px;height:${h}px;background:${cols[i % cols.length]};left:${W / 2}px;top:${H * 0.38}px;border-radius:${Math.random() < 0.3 ? '50%' : '2px'}`;
    layer.appendChild(s);
    const ang = Math.random() * Math.PI * 2, v = 120 + Math.random() * 260;
    const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v - 160;
    s.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${360 * Math.random()}deg)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx * 1.3}px, ${dy + H * 0.7}px) rotate(${720 * Math.random()}deg)`, opacity: 0 }
    ], { duration: 1500 + Math.random() * 900, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 2600);
}
/* Round 8: on phones the reveal sits below the fold — bring it up. */
function scrollRevealIntoView() {
  if (round && round.duo) { setTimeout(() => window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' }), 80); return; } // round 93: the duo reveal replaces the play area
  const el = $('reveal');
  if (!el || el.style.display === 'none') return;
  setTimeout(() => el.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' }), 80);
}

function persistWip() {
  if (round && round.mode === 'daily' && !round.finished) {
    // Round 8: the WIP carries its color's name, so a WIP can never be
    // scored against a different color (schedule or pool changes).
    store.data.wip = { day: round.day, name: round.color.name, attempts: round.attempts, pot: { ...round.pot } };
    if (round.duo) { // round 93: a duo WIP is filed under the day's color (color 1) and remembers where it is
      store.data.wip.name = round.duo.def.colors[0].name; store.data.wip.duoIdx = round.duo.idx; store.data.wip.duoParts = round.duo.parts;
    }
    store.persistSoon();
  }
}

/* ---------------- duel links ------------------------------------------- */
/* Round 8: links carry NO hex. `x` is the player's % composition (r.y.b.k.w
 * as %x10 integers) masked with a day-seeded keystream, 2 base36 chars
 * per share — not cryptography (the engine can always render a recipe),
 * but nothing in a posted link reads as a color any more, and the page
 * renders the friend's mix only after the visitor finishes that day.
 * Legacy links (?m=<hex>&q=a.b.c.d.e) still parse. */
function duelUrlFor(final, day) {
  // round 86: one place decides the link's base (this page until the domain is live)
  const base = window.MixTransfer ? window.MixTransfer.shareBase(location) : location.href.split(/[?#]/)[0];
  // round 77: s=2 marks a score made against the new 100%-reachable target
  return `${base}?d=${day}&p=${final.pct}&x=${E.encodeDuelComp(final.comp, day)}&s=2`;
}
function parseDuel() {
  const p = new URLSearchParams(location.search);
  if (!p.has('d') || !p.has('p')) return null;
  const day = parseInt(p.get('d'), 10);
  let comp = null, hex = null;
  if (p.has('x')) comp = E.decodeDuelComp(p.get('x'), day);
  else if (p.has('q')) { // legacy round-6 link: dotted base36 %x10
    const parts = p.get('q').split('.').map(s => parseInt(s, 36) || 0);
    const pct10 = i => (parts[i] || 0) / 10;
    comp = E.normalizeComp({ r: pct10(0), y: pct10(1), b: pct10(2), k: pct10(3), w: parts.length > 4 ? pct10(4) : 100 });
  }
  const legacyHex = /^[0-9a-f]{6}$/i.test(p.get('m') || '') ? '#' + p.get('m').toUpperCase() : null;
  // Legacy links keep showing the hex the friend actually saw (the
  // mixing model has changed since); new links render from the recipe.
  hex = legacyHex || (comp ? E.mixColor(comp) : null);
  let pct = parseInt(p.get('p'), 10);
  if (!hex || !isFinite(day) || !isFinite(pct)) return null;
  // round 93: a duo day's link also carries the friend's color-2 mix (y); p is their average
  const comp2 = DUO_DAYS[day] && p.has('y') ? E.decodeDuelComp(p.get('y'), day) : null;
  const hex2 = comp2 ? E.mixColor(comp2) : null;
  if (DUO_DAYS[day]) return { day, hex, hex2, pct: clamp01(pct), comp, comp2, rescored: false, duo: true };
  // round 77: links made before the recipe-color target (no s=2) scored against
  // the raw named color. When the friend's mix is in the link, rescore it the
  // way the visitor is scored now, so the duel compares like with like.
  const rescored = p.get('s') !== '2' && !!comp && !legacyHex;
  if (rescored) { const c = colorForDay(day); if (c) pct = E.scoreMix(comp, c.recipe).pct; }
  return { day, hex, pct: clamp01(pct), comp, rescored };
}
function clamp01(v) { return Math.max(0, Math.min(100, v)); }
const incomingDuel = parseDuel();
function maybeShowDuel() {
  const card = document.getElementById('duel-card');
  if (!incomingDuel || !isFinite(incomingDuel.day)) { card.style.display = 'none'; return; }
  const theirColor = colorForDay(incomingDuel.day);
  const mine = store.data.days[incomingDuel.day];
  const dd = incomingDuel.duo ? duoFor(incomingDuel.day) : null;
  if (dd) { // round 93: a duo day's duel: averages, each side's two mixes as a split swatch
    const split = (a, b) => b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a;
    const title = `${dayTag(incomingDuel.day) || shortDate(incomingDuel.day)} ${dd.emoji} ${escapeHtml(dd.title)}`;
    card.style.display = 'block';
    card.className = mine ? 'done' : (incomingDuel.day >= DAY ? 'pending' : 'past');
    if (mine) {
      const win = mine.pct > incomingDuel.pct ? 'you' : mine.pct < incomingDuel.pct ? 'them' : 'tie';
      const myHex = mine.duo ? split(mine.duo.hexes[0], mine.duo.hexes[1]) : mine.hex;
      card.innerHTML = `<b>Duel · ${title}</b><div class="swatches">` +
        `<div class="dsw${win === 'them' ? ' win' : ''}"><div style="background:${split(incomingDuel.hex, incomingDuel.hex2)}"></div>Them · <strong>${incomingDuel.pct}%</strong></div>` +
        `<div class="dsw${win === 'you' ? ' win' : ''}"><div style="background:${myHex}"></div>You · <strong>${mine.pct}%</strong></div></div>` +
        `<div class="dverdict">${win === 'you' ? 'You take this one. 🏆' : win === 'them' ? 'They take this one. Rematch tomorrow.' : 'Dead heat. 🤝'}</div>`;
    } else if (incomingDuel.day >= DAY) {
      card.innerHTML = `<b>A friend has already mixed today's color.</b><div>Finish your round to see how you stack up — no spoilers until then.</div>`;
    } else {
      card.innerHTML = `<b>A duel from ${title}</b><div class="swatches"><div class="dsw"><div style="background:${split(incomingDuel.hex, incomingDuel.hex2)}"></div>Their average · ${incomingDuel.pct}%</div></div>` +
        `<div style="margin-top:6px">You didn't play that day — today's color is up top.</div>`;
    }
    return;
  }
  card.style.display = 'block';
  card.className = mine ? 'done' : (incomingDuel.day >= DAY ? 'pending' : 'past');
  if (mine) {
    const win = mine.pct > incomingDuel.pct ? 'you' : mine.pct < incomingDuel.pct ? 'them' : 'tie';
    card.innerHTML =
      `<b>Duel · ${dayTag(incomingDuel.day) || shortDate(incomingDuel.day)} “${escapeHtml(titleCase(theirColor.name))}”</b>` +
      `<div class="swatches">` +
      `<div class="dsw${win === 'them' ? ' win' : ''}"><div style="background:${incomingDuel.hex}"></div>Them · <strong>${incomingDuel.pct}%</strong></div>` +
      `<div class="dsw${win === 'you' ? ' win' : ''}"><div style="background:${mine.hex}"></div>You · <strong>${mine.pct}%</strong></div></div>` +
      `<div class="dverdict">${win === 'you' ? 'You take this one. 🏆'
        : win === 'them' ? 'They take this one. Rematch tomorrow.'
        : 'Dead heat. 🤝'}</div>`;
  } else if (incomingDuel.day >= DAY) { // today (or a friend a timezone ahead) — never spoil
    card.innerHTML = `<b>A friend has already mixed today's color.</b>` +
      `<div>Finish your round to see how you stack up — no spoilers until then.</div>`;
  } else {
    card.innerHTML =
      `<b>A duel from ${dayTag(incomingDuel.day) || shortDate(incomingDuel.day)} — “${escapeHtml(theirColor.name)}”</b>` +
      `<div class="swatches"><div class="dsw"><div style="background:${incomingDuel.hex}"></div>Their mix · ${incomingDuel.pct}%</div></div>` +
      `<div style="margin-top:6px">You didn't play that day — today's color is up top.</div>`;
  }
}
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- share ------------------------------------------------- */
/* Round 87 (Franklin): sharing is IMAGE ONLY. The Share button sends just the
 * PNG result card: no text, no link. This single short line (never the color's
 * name, no URL) is the last resort when no image can be made at all. */
function shareLine(day) {
  day = day || (round && round.mode === 'daily' ? round.day : DAY);
  const rec = store.data.days[day];
  if (!rec) return '';
  return `🎨 MIXOLOGY ${dayTag(day) || shortDate(day)} — ${rec.pct}%`;
}
/* Round 25: buttons carry SVG icons, so a temporary "Copied ✓" label must
 * restore the button's markup, not just its text. Guarded against double taps. */
function flashLabel(btn, label) {
  if (!btn.dataset.html) btn.dataset.html = btn.innerHTML;
  btn.textContent = label;
  clearTimeout(btn._flashT);
  btn._flashT = setTimeout(() => { btn.innerHTML = btn.dataset.html; delete btn.dataset.html; }, 1600);
}
/* Duel links (unchanged): a native sheet gets the challenge line + the link;
 * otherwise the link is copied. */
async function doShare(btn, text, okLabel, nativeText) {
  const done = () => flashLabel(btn, okLabel);
  if (navigator.share && nativeText) {
    try { await navigator.share({ text: nativeText, url: text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); done(); }
  catch (e) { window.prompt('Copy your result:', text); }
}
/* Round 87: Share result = the PNG card ONLY (files, no text, no url).
 * Fallbacks, in order: copy the image to the clipboard, download it, and only
 * if no image can be made, copy shareLine(). The card is drawn ahead of time
 * at the reveal so the share sheet opens inside the tap's user activation. */
let cardCache = { key: '', p: null, file: null };
function prepareShareCard(day) {
  const rec = store.data.days[day]; if (!rec) return null;
  const key = [day, rec.pct, (rec.attempts || []).length, store.data.streak, store.data.parStreak].join(':');
  if (cardCache.key !== key) {
    const c = { key, p: null, file: null };
    c.p = shareCardFile(day).then(f => (c.file = f));
    cardCache = c;
  }
  return cardCache.p;
}
function downloadFile(f) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function shareImage(btn, day) {
  if (!store.data.days[day]) return;
  const p = prepareShareCard(day);
  const file = cardCache.file || (p ? await p : null);
  if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  if (file && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]); flashLabel(btn, 'Image copied ✓'); return; }
    catch (e) { /* next fallback */ }
  }
  if (file) { downloadFile(file); flashLabel(btn, 'Image saved ✓'); return; }
  const line = shareLine(day);
  try { await navigator.clipboard.writeText(line); flashLabel(btn, 'Copied ✓'); }
  catch (e) { window.prompt('Copy your result:', line); }
}

/* Round 12: a 1080x1080 PNG result card, drawn on a canvas.
 * SPOILER-FREE by design. It shows the number, the hook line, %, band, tries
 * and streak, but never the color's name, the player's mix color, the
 * official color or a recipe,
 * so a friend who hasn't played yet can't read the answer off the image. */
function drawShareCard(day) {
  const rec = store.data.days[day];
  if (!rec) return null;
  if (rec.duo && duoFor(day)) return drawDuoShareCard(day, rec); // round 93
  const S = 1080, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  x.fillStyle = '#f6f1e7'; x.fillRect(0, 0, S, S);
  x.fillStyle = '#fffdf8'; x.strokeStyle = '#ddd3c0'; x.lineWidth = 4;
  roundRect(x, 60, 60, S - 120, S - 120, 48); x.fill(); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#1c1a17'; x.font = `800 64px ${sans}`;
  if ('letterSpacing' in x) x.letterSpacing = '10px';
  x.fillText('MIXOLOGY', S / 2 - 12, 190);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  const ww = x.measureText('MIXOLOGY').width;
  x.fillStyle = '#b3541e'; x.beginPath(); x.arc(S / 2 + ww / 2 + 30, 180, 9, 0, 7); x.fill();
  x.fillStyle = '#7a7264'; x.font = `500 34px ${sans}`;
  x.fillText([dayTag(day), shortDate(day)].filter(Boolean).join(' · '), S / 2, 250);
  x.fillStyle = '#1c1a17'; x.font = `italic 62px Georgia, "Times New Roman", serif`;
  x.fillText('How well do you know your colors?', S / 2, 390);
  x.font = `800 250px ${sans}`; x.fillText(`${rec.pct}%`, S / 2, 650);
  x.font = `800 44px ${sans}`;
  if ('letterSpacing' in x) x.letterSpacing = '6px';
  x.fillText(String(rec.band || '').toUpperCase(), S / 2, 730);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  // try pips: neutral ink, filled to each attempt's %, so no color leaks
  const tries = rec.attempts || [], pw = 300, ph = 26, gap = 40;
  const tx0 = S / 2 - (tries.length * pw + (tries.length - 1) * gap) / 2;
  tries.forEach((a, i) => {
    const px = tx0 + i * (pw + gap), py = 822, best = a.pct === rec.pct;
    x.font = `${best ? 800 : 600} 30px ${sans}`; x.fillStyle = best ? '#1c1a17' : '#7a7264';
    x.fillText(`Try ${i + 1} · ${a.pct}%`, px + pw / 2, py - 16);
    x.fillStyle = '#efe8da'; roundRect(x, px, py, pw, ph, ph / 2); x.fill();
    x.save(); roundRect(x, px, py, pw, ph, ph / 2); x.clip();
    x.fillStyle = best ? '#1c1a17' : '#9a917f'; x.fillRect(px, py, pw * Math.max(0, Math.min(100, a.pct)) / 100, ph); x.restore();
  });
  const s = store.data;
  x.fillStyle = '#1c1a17'; x.font = `600 38px ${sans}`;
  x.fillText(`🔥 Streak ${s.streak}` + (s.parStreak >= 2 ? `  ·  Par streak ${s.parStreak}` : ''), S / 2, 940);
  // round 87 (Franklin): a small wordmark; the image is shared on its own, with no link
  x.font = `600 30px ${sans}`;
  if ('letterSpacing' in x) x.letterSpacing = '1px';
  const wm = 'mixologydaily.com', wmw = x.measureText(wm).width;
  x.fillStyle = '#b3541e'; x.beginPath(); x.arc(S / 2 - wmw / 2 - 18, 980, 7, 0, 7); x.fill();
  x.fillStyle = '#7a7264'; x.fillText(wm, S / 2 + 6, 990);
  if ('letterSpacing' in x) x.letterSpacing = '0px';
  return c;
}
function roundRect(x, l, t, w, h, r) {
  x.beginPath(); x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
  x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
}
function shareCardFile(day) {
  return new Promise(res => {
    let c = null; try { c = drawShareCard(day); } catch (e) { c = null; }
    if (!c || !c.toBlob) return res(null);
    c.toBlob(b => res(b ? new File([b], `mixology-${dayTag(day).replace('#', '') || day}.png`, { type: 'image/png' }) : null), 'image/png');
  });
}
async function saveShareCard(btn) {
  const day = round && round.mode === 'daily' ? round.day : DAY;
  const f = await shareCardFile(day); if (!f) return;
  downloadFile(f);
  flashLabel(btn, 'Saved ✓');
}

/* ---------------- duo days (round 93) ----------------------------------- */
/* The summary a duo is scored on: average % (rounded) and average ΔE (band). */
function duoSummary(finals) {
  return { pct: Math.round((finals[0].pct + finals[1].pct) / 2), de: Math.round((finals[0].de + finals[1].de) / 2 * 100) / 100,
    hex: finals[0].hex, comp: finals[0].comp };
}
/* After color 1's 2nd try: color 1 is locked in (its official color stays hidden
 * until the end), the pot empties and color 2 starts. */
function duoAdvance() {
  const d = round.duo;
  d.parts[0] = round.attempts.slice();
  const b = bestAttempt(d.parts[0]);
  d.idx = 1; round.color = d.def.colors[1];
  round.attempts = []; round.pot = freshPot(); round.undo = [];
  selectedTool = 'pour';
  d.flash = true;
  if (round.mode === 'daily') { trackScore('c1', round.day, b.pct); trackDaily('duo-c2', round.day); } // round 93
  sfx.reveal(); buzz([14, 50, 14]);
  announce(`Color 1 done: ${b.pct}%. Color 2 of 2 is called ${titleCase(round.color.name)}.`);
  persistWip(); renderAll();
  window.scrollTo({ top: 0, behavior: 'auto' });
}
/* The pumpkin: 5 lobes in color 1, stem + carved face in color 2. One light and
 * shade overlay for both pumpkins, so only the paint differs. A thin outline in
 * --pk-line (dark in light mode, light in dark mode) keeps a dark stem or body
 * readable on the dark card. */
const PK_LOBES = [[58, 112, 48, 60], [142, 112, 48, 60], [80, 110, 42, 66], [120, 110, 42, 66], [100, 109, 34, 68]];
const PK_STEM = 'M93 48 C91 34 95 20 106 9 C110 6 117 9 116 14 C107 24 105 34 107 48 Z';
const PK_FACE = ['M58 92 L84 92 L71 70 Z', 'M116 92 L142 92 L129 70 Z', 'M93 112 L107 112 L100 100 Z', 'M48 124 C60 134 140 134 152 124 C150 150 128 162 100 162 C72 162 50 150 48 124 Z'];
const PK_TEETH = ['M74 132 L82 146 L90 133 Z', 'M110 133 L118 146 L126 132 Z'];
const PK_RIDGES = ['M66 50 C44 80 44 140 66 172', 'M134 50 C156 80 156 140 134 172', 'M86 44 C76 80 76 140 86 176', 'M114 44 C124 80 124 140 114 176'];
let pumpkinSeq = 0;
function pumpkinSVG(c1, c2, label) {
  const id = 'pk' + (++pumpkinSeq);
  const lobes = PK_LOBES.map(([cx, cy, rx, ry]) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/>`).join('');
  return `<svg class="pk" viewBox="-4 2 208 182" role="img" aria-label="${escapeHtml(label)}">` +
    `<defs><radialGradient id="${id}g" cx="38%" cy="32%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>` +
    `<clipPath id="${id}c">${lobes}</clipPath></defs>` +
    `<ellipse cx="100" cy="176" rx="74" ry="5" class="pk-shadow"/>` +
    `<path d="${PK_STEM}" fill="${c2}" class="pk-line"/>` +
    `<g class="pk-line pk-out">${lobes}</g><g fill="${c1}">${lobes}</g>` +
    `<g clip-path="url(#${id}c)"><rect x="0" y="30" width="200" height="160" fill="url(#${id}g)"/>` +
    `<g fill="none" stroke="#000" stroke-opacity=".16" stroke-width="2.5" stroke-linecap="round">${PK_RIDGES.map(d => `<path d="${d}"/>`).join('')}</g></g>` +
    `<g fill="${c2}" class="pk-face">${PK_FACE.map(d => `<path d="${d}"/>`).join('')}</g>` +
    `<g fill="${c1}">${PK_TEETH.map(d => `<path d="${d}"/>`).join('')}</g></svg>`;
}
/* The same pumpkin on a canvas (share card), drawn with Path2D so the card stays
 * synchronous like the daily card. (cx, top) is the top centre, w the width. */
function drawPumpkin(x, cx, top, w, c1, c2) {
  const k = w / 200;
  x.save(); x.translate(cx - 100 * k, top); x.scale(k, k);
  x.fillStyle = 'rgba(0,0,0,.10)'; x.beginPath(); x.ellipse(100, 176, 74, 6, 0, 0, 7); x.fill();
  x.lineJoin = 'round';
  x.fillStyle = c2; x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2;
  const stem = new Path2D(PK_STEM); x.fill(stem); x.stroke(stem);
  const body = new Path2D(); for (const [ex, ey, rx, ry] of PK_LOBES) { body.moveTo(ex + rx, ey); body.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); }
  x.lineWidth = 3; x.stroke(body);
  x.fillStyle = c1; for (const [ex, ey, rx, ry] of PK_LOBES) { x.beginPath(); x.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2); x.fill(); }
  x.save(); x.clip(body, 'nonzero');
  const g = x.createRadialGradient(76, 85, 0, 76, 85, 150);
  g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  x.fillStyle = g; x.fillRect(0, 30, 200, 160);
  x.strokeStyle = 'rgba(0,0,0,.16)'; x.lineWidth = 2.5; x.lineCap = 'round';
  for (const d of PK_RIDGES) x.stroke(new Path2D(d));
  x.restore();
  x.fillStyle = c2; for (const d of PK_FACE) x.fill(new Path2D(d));
  x.fillStyle = c1; for (const d of PK_TEETH) x.fill(new Path2D(d));
  x.restore();
}
/* Duo share card: the daily card's frame, the player's pumpkin (their two mixes),
 * the average, one neutral bar per color. No names, no official colors, no recipe. */
function drawDuoShareCard(day, rec) {
  const dd = duoFor(day);
  const S = 1080, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  const sans = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  const ls = v => { if ('letterSpacing' in x) x.letterSpacing = v; };
  x.fillStyle = '#f6f1e7'; x.fillRect(0, 0, S, S);
  x.fillStyle = '#fffdf8'; x.strokeStyle = '#ddd3c0'; x.lineWidth = 4;
  roundRect(x, 60, 60, S - 120, S - 120, 48); x.fill(); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  x.fillStyle = '#1c1a17'; x.font = `800 64px ${sans}`;
  ls('10px'); x.fillText('MIXOLOGY', S / 2 - 12, 175); ls('0px');
  const ww = x.measureText('MIXOLOGY').width;
  x.fillStyle = '#b3541e'; x.beginPath(); x.arc(S / 2 + ww / 2 + 30, 165, 9, 0, 7); x.fill();
  x.font = `800 34px ${sans}`; ls('5px'); x.fillText(dd.title.toUpperCase(), S / 2, 238); ls('0px');
  x.fillStyle = '#7a7264'; x.font = `500 30px ${sans}`;
  x.fillText([dayTag(day), shortDate(day)].filter(Boolean).join(' · '), S / 2, 284);
  try { drawPumpkin(x, 320, 318, 400, rec.duo.hexes[0], rec.duo.hexes[1]); } catch (e) { /* the card still works without it */ }
  x.fillStyle = '#7a7264'; x.font = `600 28px ${sans}`; x.fillText('my pumpkin', 320, 722);
  x.fillStyle = '#1c1a17'; x.font = `800 210px ${sans}`; x.fillText(`${rec.pct}%`, 760, 560);
  x.font = `800 30px ${sans}`; ls('4px'); x.fillText('AVG OF 2 COLORS', 760, 620); ls('0px');
  x.fillStyle = '#7a7264';
  let tf = 34; do { x.font = `italic ${tf}px Georgia, "Times New Roman", serif`; } while (x.measureText('How well do you know your colors?').width > 450 && --tf > 20); // fits whatever serif the phone has
  x.fillText('How well do you know your colors?', 760, 680);
  const pw = 360, ph = 26, gap = 60, x0 = S / 2 - (2 * pw + gap) / 2;
  rec.duo.pcts.forEach((p, i) => {
    const px = x0 + i * (pw + gap), py = 830;
    x.font = `800 30px ${sans}`; x.fillStyle = '#1c1a17';
    x.fillText(`Color ${i + 1} · ${p}%`, px + pw / 2, py - 16);
    x.fillStyle = '#efe8da'; roundRect(x, px, py, pw, ph, ph / 2); x.fill();
    x.save(); roundRect(x, px, py, pw, ph, ph / 2); x.clip();
    x.fillStyle = '#1c1a17'; x.fillRect(px, py, pw * Math.max(0, Math.min(100, p)) / 100, ph); x.restore();
  });
  const s = store.data;
  x.fillStyle = '#1c1a17'; x.font = `600 36px ${sans}`;
  x.fillText(`🔥 Streak ${s.streak}` + (s.parStreak >= 2 ? `  ·  Par streak ${s.parStreak}` : ''), S / 2, 935);
  x.font = `600 30px ${sans}`; ls('1px');
  const wm = 'mixologydaily.com', wmw = x.measureText(wm).width;
  x.fillStyle = '#b3541e'; x.beginPath(); x.arc(S / 2 - wmw / 2 - 18, 980, 7, 0, 7); x.fill();
  x.fillStyle = '#7a7264'; x.fillText(wm, S / 2 + 6, 990); ls('0px');
  return c;
}
function renderDuoProgress() {
  const el = $('duo-progress'); if (!el) return;
  const d = round && round.duo;
  if (!d || round.finished) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  el.innerHTML = d.def.colors.map((c, i) => {
    const done = d.parts[i] ? bestAttempt(d.parts[i]) : null, cur = i === d.idx;
    return `<span class="dp${cur ? ' cur' : ''}${done ? ' done' : ''}"><b>${i + 1}</b>${escapeHtml(titleCase(c.name))}${done ? ` · ${done.pct}%` : ''}</span>`;
  }).join('<span class="dp-plus" aria-hidden="true">+</span>');
}
function duoRecipesHTML(dd, finals) {
  return dd.colors.map((c, i) => `<div class="dr-rh">${escapeHtml(titleCase(c.name))}</div>` + recipesHTML(c, finals[i])).join('');
}
function renderDuoReveal(dd, parts) {
  const finals = parts.map(p => bestAttempt(p)), sum = duoSummary(finals);
  $('reveal-h').textContent = `${dd.emoji} ${dd.title}`;
  $('dr-true').innerHTML = pumpkinSVG(dd.colors[0].thex, dd.colors[1].thex, `${dd.label} pumpkin in the official colors`);
  $('dr-mine').innerHTML = pumpkinSVG(finals[0].hex, finals[1].hex, 'Your pumpkin in the colors you mixed');
  $('dr-true-cap').textContent = dd.label;
  $('dr-rows').innerHTML = dd.colors.map((c, i) => {
    const f = finals[i];
    return `<div class="dr-row"><span class="dr-sw" style="background:${c.thex}" title="Official"></span><span class="dr-sw" style="background:${f.hex}" title="Yours"></span>` +
      `<span class="dr-name">${escapeHtml(titleCase(c.name))}<small>${parts[i].map(a => a.pct + '%').join(' → ')}</small></span><span class="dr-pct">${f.pct}%</span></div>`;
  }).join('');
  $('dr-avg').textContent = sum.pct + '%';
  $('dr-band').textContent = `average of 2 colors · ${E.bandForDeltaE(sum.de)}`;
  $('reveal-recipes').innerHTML = duoRecipesHTML(dd, finals);
}

/* ---------------- rendering -------------------------------------------- */
const $ = id => document.getElementById(id);
/* Round 33: headline-style title case. Small joining words stay lower case
 * unless first ("A Dash of Red"), and slashes count as word
 * breaks ("Green/Yellow"). The stored name is never changed. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
function titleCase(s) {
  let first = true;
  return String(s).replace(/[A-Za-z\u00C0-\u024F][\w\u00C0-\u024F'’]*/g, w => {
    const out = !first && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1);
    first = false; return out;
  });
}
/* Round 65 (Franklin, overrides the old no-counts lock): each paint disc shows
 * the pot's live % of that paint (largest-remainder whole numbers that sum to
 * 100; round 68: no "<1%", traces snap to 0 in the engine). renderAll runs on every pour tick, so the DOM write is coalesced
 * into one per animation frame. The aria-label carries the same number. */
let discPctRaf = 0;
function scheduleDiscPercents() {
  if (discPctRaf) return;
  const raf = window.requestAnimationFrame || (f => setTimeout(f, 16));
  discPctRaf = raf(() => { discPctRaf = 0; renderDiscPercents(); });
}
function renderDiscPercents() {
  if (!round) return;
  const pct = E.displayPercents(round.pot);
  for (const b of BUCKET_KEYS) {
    const btn = $(BUCKET_EL[b]); if (!btn) continue;
    const el = btn.querySelector('.ppct'); if (el && el.textContent !== pct[b]) el.textContent = pct[b];
    btn.setAttribute('aria-label', `Select ${PIG_NAMES[b].toLowerCase()} pigment, ${pct[b]} of the pot`);
    // round 68: the remove badge shows only when taking this paint out would change the pot
    const rm = $('rm-' + b); if (!rm) continue;
    const show = !round.finished && round.pot[b] > 0; // round 83: also at 100%, taking out the last paint empties the pot
    if (rm.hidden === show) rm.hidden = !show;
    rm.setAttribute('aria-label', `Remove ${PIG_NAMES[b].toLowerCase()} paint, ${pct[b]} of the pot. Hold to keep removing`);
  }
}
function renderAll() {
  if (!round) return;
  const daily = round.mode === 'daily';
  const duo = round.duo || null; // round 93
  $('color-name').textContent = titleCase(round.color.name);
  $('prompt-kicker').textContent = duo ? `Color ${duo.idx + 1} of 2 is called` : daily ? "Today's color is called" : 'Practice color';
  $('prompt-sub').textContent = duo ? `Mix ${duo.def.roles[duo.idx]}. Two tries, best one counts.`
    : daily
    ? 'How well do you know your colors?'
    : 'Free round — the reveal is instant, the streak is safe.';
  renderDuoProgress();
  if (duo && duo.flash) {
    duo.flash = false;
    const pa = $('prompt-area');
    if (pa && !REDUCED_MOTION) { pa.classList.remove('duo-pop'); void pa.offsetWidth; pa.classList.add('duo-pop'); }
  }
  $('app').classList.toggle('duo-done', !!(duo && round.finished));
  $('practice-bar').style.display = daily ? 'none' : 'block';
  $('btn-practice').textContent = daily ? 'Practice' : '← Daily';
  // round 72: each part stays whole; on a narrow phone the date wraps to its own
  // line instead of running under the header buttons (#120+ at 320px)
  const dayParts = daily
    ? [dayTag(round.day) ? `MIXOLOGY ${dayTag(round.day)}` : 'MIXOLOGY', dateForDay(round.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })]
    : ['Practice mode'];
  const dayHtml = dayParts.map(s => `<span class="nw">${escapeHtml(s)}</span>`).join(' · ');
  if ($('day-label').innerHTML !== dayHtml) $('day-label').innerHTML = dayHtml;
  // round 72: a small holiday tag on holiday days (the color name is already public)
  const hol = daily ? E.holidayOn(dateForDay(round.day)) : null, hTag = $('holiday-tag');
  if (hTag) {
    hTag.hidden = !hol;
    if (hol && duo) hol.label = duo.def.title; // round 93: "🎃 Halloween Duo" (holidayOn returns a fresh object)
    const html = hol ? `<span aria-hidden="true">${hol.emoji}</span> ${escapeHtml(hol.label)}` : '';
    if (hTag.innerHTML !== html) hTag.innerHTML = html;
  }
  const st = liveStreaks();
  $('streak-display').innerHTML = st.streak > 0
    ? `<span class="flame${Number(st.streak) >= 7 ? ' hot' : ''}" aria-hidden="true">🔥</span> Streak ${Number(st.streak)}` + (st.parStreak > 0 ? ` · <span title="Days in a row at ${E.PAR_PCT}%+">Par streak ${Number(st.parStreak)}</span>` : '')
    : '';
  const stale = daily && round.day !== DAY;
  if (stale && !round.finished) $('prompt-sub').textContent = "A new day's color is out — finish this one, then play today's.";

  // Round 83: an empty pot shows an empty bowl (CSS #pot.empty), not white paint
  const empty = E.isEmptyComp(round.pot);
  $('pot').classList.toggle('empty', empty);
  $('pot-surface').style.background = empty ? '' : mixHex();

  for (const b of BUCKET_KEYS) {
    $(BUCKET_EL[b]).classList.toggle('sel', selectedBucket === b);
    $(BUCKET_EL[b]).setAttribute('aria-pressed', String(selectedBucket === b)); // round 26
  }
  scheduleDiscPercents(); // round 65
  for (const t of Object.keys(TOOLS)) {
    $('tool-' + t).classList.toggle('sel', selectedTool === t);
    $('tool-' + t).setAttribute('aria-pressed', String(selectedTool === t));
  }
  { // round 26: the pot says what a press will do (the selected pigment and tool, which are already visible)
    const pn = { r: 'red', y: 'yellow', b: 'blue', k: 'black', w: 'white' }[selectedBucket] || 'paint';
    $('pot').setAttribute('aria-label', (potHintShown() ? 'Hold to pour. ' : '') + (empty && !round.finished ? 'The pot is empty. ' : '') + (round.finished ? 'Pot (round complete)'
      : selectedTool === 'pour' ? `Pour ${pn} into the pot (hold to keep pouring)` : `Add one drop of ${pn} to the pot`));
    renderPotHint(); // round 81
  }
  { // round 20: same SVG icon as the selected tool button
    const src = $('tool-' + selectedTool).querySelector('svg');
    $('toolbar-current').innerHTML = (src ? src.outerHTML : '') + (selectedTool === 'dropper' ? 'Dropper' : 'Pour Bucket');
  }
  // Round 9: show the selected tool's rig over the pot, tinted with the pigment
  $('stage').classList.toggle('tool-pour', selectedTool === 'pour');
  $('stage').classList.toggle('tool-dropper', selectedTool === 'dropper');
  document.querySelectorAll('#fx .pig-fill').forEach(el => el.setAttribute('fill', PIGMENT_HEX[selectedBucket]));

  // Round 9: two slots. A finished pre-round-9 day can hold 3 attempts —
  // show them all (a 3rd slot is created on demand, removed otherwise).
  const nSlots = Math.max(MAX_ATTEMPTS, round.attempts.length);
  const list = $('attempts-list');
  while (list.children.length < nSlots) { const d = document.createElement('div'); d.id = 'slot-' + list.children.length; list.appendChild(d); }
  while (list.children.length > nSlots) list.lastElementChild.remove();
  const scored = round.finished ? finalOfRound() : null;
  for (let i = 0; i < nSlots; i++) {
    const slot = $('slot-' + i), att = round.attempts[i];
    if (att) {
      slot.className = 'attempt-slot filled' + (scored === att ? ' best' : '') + (justSealed === i ? ' pop' : '');
      slot.innerHTML = `<div class="asw" style="background:${att.hex}"></div><div class="apct">${att.pct}%</div><div>attempt ${i + 1}</div>`;
    } else {
      slot.className = 'attempt-slot';
      slot.textContent = `Attempt ${i + 1}`;
    }
  }
  justSealed = -1;

  const last = round.attempts[round.attempts.length - 1];
  $('last-result').innerHTML = round.finished
    ? ''
    : last
      ? `Attempt ${round.attempts.length} submitted: <b>${last.pct}% accuracy</b>` + (round.attempts.length === 1 ? hintHTML(last) : '')
      : duo ? (duo.idx === 0 ? 'Two colors today, two tries each. Your average is your score.' : `Color 1 locked in. Now ${titleCase(round.color.name)}.`)
      : 'Dose the pot, then submit an attempt. Two per round — your best one counts.';

  const sealBtn = $('btn-seal');
  sealBtn.disabled = round.finished || round.attempts.length >= MAX_ATTEMPTS || empty; // round 83: nothing to submit yet
  $('seal-hint').hidden = round.finished || !empty;
  sealBtn.classList.toggle('done', !!round.finished); // round 31: calm finished state
  sealBtn.textContent = round.finished ? 'Round complete ✓'
    : duo && duo.idx === 0 && round.attempts.length === MAX_ATTEMPTS - 1 ? 'Submit & go to color 2 →'
    : round.attempts.length === MAX_ATTEMPTS - 1 ? `Submit final attempt` : `Submit attempt ${round.attempts.length + 1}`;

  const locked = round.finished;
  for (const id of ['btn-undo', 'btn-reset']) $(id).disabled = locked;
  $('stage').classList.toggle('locked', locked);

  if (round.finished) {
    const fin = scored;
    $('reveal').style.display = 'block';
    $('reveal-official').style.background = round.color.thex;
    $('reveal-mine').style.background = fin.hex;
    const practice = round.mode !== 'daily';
    const rStar = practice ? null : E.starTier(fin.pct); // round 74: star on your mix at the reveal; round 84: never in practice
    $('reveal-mine').innerHTML = starBadge(rStar, 'big');
    $('reveal-mine').setAttribute('aria-label', rStar ? 'Your mix earned a ' + rStar.label : '');
    if (rStar) $('reveal-mine').setAttribute('role', 'img'); else $('reveal-mine').removeAttribute('role');
    $('reveal-pct').textContent = fin.pct + '%';
    $('reveal-band').textContent = E.bandForDeltaE(fin.de);
    $('reveal-de').textContent = fin.exact || (fin.pct === 100 && fin.de === 0)
      ? `you matched the official ${titleCase(round.color.name)} recipe exactly`
      : `accuracy · perceptual distance ΔE ${fin.de} from the official ${titleCase(round.color.name)}`;
    $('reveal').classList.toggle('duo', !!duo);
    if (duo) renderDuoReveal(duo.def, duo.parts); // round 93: pumpkins, both colors, the average
    else {
      $('reveal-h').textContent = 'The reveal';
      $('reveal-recipes').innerHTML = practice ? practiceRecipesHTML(round.color, fin) : recipesHTML(round.color, fin);
    }
    $('btn-next-practice').style.display = round.mode === 'practice' ? 'block' : 'none';
    $('reveal-actions').style.display = round.mode === 'daily' ? 'flex' : 'none';
    $('card-row').style.display = round.mode === 'daily' ? 'block' : 'none';
    if (round.mode === 'daily') prepareShareCard(round.day); // round 87: ready before the Share tap
  } else {
    $('reveal').style.display = 'none';
    $('reveal').classList.remove('duo');
    $('reveal-recipes').innerHTML = '';
  }
  renderNextCountdown(); // round 82: reveal countdown + the top "done for today" banner
  $('app').classList.toggle('playing', !round.finished); // round 87: sticky Submit only while playing
  fitStage();
}

/* Round 87 (iPhone tester): on a phone the whole round, down to "Submit
 * attempt", fits the screen. CSS sizes the stage (pot + paint ring, scaled as
 * one piece, never squashed) from 100dvh minus everything else on the page;
 * this measures "everything else" (--fit-chrome) once per round and on
 * resize, so a banner, a practice line or a long name are all accounted for.
 * Phones only (max-width 600px); desktop is untouched. */
const FIT_MQ = window.matchMedia ? window.matchMedia('(max-width: 600px)') : null;
let fitRound = null;
function fitStage(force) {
  try {
    const app = $('app'), st = $('stage');
    if (!force && fitRound === round) return;
    fitRound = round;
    if (!FIT_MQ || !FIT_MQ.matches || round.finished) { if (!round.finished) app.style.removeProperty('--fit-chrome'); return; }
    const hint = $('seal-hint'), end = hint && !hint.hidden ? hint : $('actions');
    const endBottom = end.getBoundingClientRect().bottom + window.scrollY;
    const chrome = endBottom - st.getBoundingClientRect().height + 8; // 8px breathing room under the last line
    app.style.setProperty('--fit-chrome', Math.round(chrome) + 'px');
  } catch (e) { /* layout nicety only */ }
}
let fitT = null;
window.addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => fitStage(true), 120); });

/* The attempt this round is scored on (saved day record wins for daily). */
function finalOfRound() {
  if (round.duo) return bestAttempt(round.attempts); // round 93: the slots show color 2's tries
  const rec = round.mode === 'daily' ? store.data.days[round.day] : null;
  return rec ? scoredAttempt(rec) : bestAttempt(round.attempts);
}

/* Round 8: a streak only counts while it is alive — after a missed day
 * the header shows nothing (the stored number resets on the next finish). */
function liveStreaks() {
  const s = store.data;
  const alive = s.lastDay != null && s.lastDay >= DAY - 1;
  return { streak: alive ? s.streak : 0, parStreak: alive ? s.parStreak : 0 };
}
/* Round 10: official recipe vs the player's mix, as segmented bars. Only
 * ever rendered after a round is finished (reveal, calendar detail of a
 * played day) — never in share text or duel links. */
const PIG_NAMES = { r: 'Red', y: 'Yellow', b: 'Blue', k: 'Black', w: 'White' };
function recipeRowHTML(label, sub, comp) {
  if (!comp) return '';
  const c = E.normalizeComp(comp);
  const keys = BUCKET_KEYS.filter(k => c[k] >= 0.5);
  const bar = keys.map(k => `<span class="${k}" style="width:${c[k].toFixed(2)}%;background:${PIGMENT_HEX[k]}" title="${PIG_NAMES[k]} ${Math.round(c[k])}%"></span>`).join('');
  const dp = E.displayPercents(c); // round 77: whole numbers, exactly as the discs show them
  const leg = keys.map(k => `<span><i style="background:${PIGMENT_HEX[k]}"></i>${k.toUpperCase()} ${dp[k]}</span>`).join('');
  return `<div class="rrow"><div class="rl">${label}${sub ? `<b>${sub}</b>` : ''}</div><div class="rbar" role="img" aria-label="${label}: ${keys.map(k => PIG_NAMES[k] + ' ' + Math.round(c[k]) + '%').join(', ')}">${bar}</div><div class="rleg">${leg}</div></div>`;
}
/* Round 84: the end of a practice round. Your mix always; the official recipe
 * only if you have finished this color as a daily (round 73 spoiler rule). */
const PRACTICE_NOTE = "Practice — doesn't count toward stars, recipes or collection";
function practiceRecipesHTML(color, att) {
  if (!color) return '';
  const open = E.officialRecipeVisible(color.name, store.data.days);
  return (open && color.recipe ? recipeRowHTML('Recipe', '100%', color.recipe) : '') +
    (att && att.comp ? recipeRowHTML('Your mix', `${att.pct}%`, att.comp) : '') +
    (open || (att && att.exact) ? '' : '<p class="col-lock">The official recipe unlocks once you finish this color as a daily.</p>') +
    `<p class="practice-note">${PRACTICE_NOTE}.</p>`;
}
function recipesHTML(color, att) {
  if (!color || !color.recipe) return '';
  // round 77: the recipe IS the target (100%); whole-number legend like the discs
  return recipeRowHTML('Recipe', '100%', color.recipe) +
    (att && att.comp ? recipeRowHTML('Your mix', `${att.pct}%`, att.comp) : '');
}

/* Round 10: public label for a day — "#1" from launch (internal 656), or
 * '' before launch (date only, never #0 / negatives). */
function shortDate(day) { return dateForDay(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function dayTag(day) { const n = E.publicNumber(day); return n ? `#${n}` : ''; }
function dateForDay(day) { const d = new Date(2025, 0, 1); d.setDate(d.getDate() + day - 1); return d; }

/* Round 8: the day rolls over in an open tab. An untouched or finished
 * daily round switches to the new color; a round in progress keeps its
 * own day (it still scores and streaks as that day) and offers today's
 * color once it is finished. */
function checkDayRollover() {
  const d = currentDay();
  if (d === DAY) return;
  DAY = d;
  todayColor = colorForDay(DAY);
  if (round && round.mode === 'daily') {
    // Untouched rounds switch to the new color. Round 82: a FINISHED round
    // stays on screen and offers "Today's new color is ready" instead of
    // swapping under the player.
    const untouched = !round.attempts.length && !round.undo.length;
    if (untouched && !round.finished) { stopPour(); initDaily(); return; }
  }
  renderAll();
}
setInterval(checkDayRollover, 20000);
setInterval(renderNextCountdown, 1000); // round 82: the countdown ticks each second
/* Round 19, round 82: "Next color in 6h 12m 08s". It counts down to the next
 * local midnight, the same boundary dayNumber() uses (dateForDay(DAY + 1)
 * is local 00:00 of the next day); '' once it is reached. */
function untilNextColor(now) {
  const ms = dateForDay(DAY + 1) - (now || new Date());
  return E.formatCountdown(ms);
}
let countdownState = '';
function renderNextCountdown() {
  const el = $('reveal-next'), banner = $('done-banner'); if (!el || !banner) return;
  const daily = !!round && round.mode === 'daily' && round.finished;
  let left = daily && round.day === DAY ? untilNextColor() : '';
  if (daily && round.day === DAY && !left) { checkDayRollover(); left = round.day === DAY ? untilNextColor() : ''; } // midnight just passed
  const ready = daily && round.day !== DAY; // finished an earlier day; today's color is out
  const show = daily && (ready || !!left);
  el.style.display = show ? 'block' : 'none';
  banner.hidden = !show;
  $('btn-today').style.display = ready ? 'block' : 'none';
  if (!show) { countdownState = ''; return; }
  const streak = liveStreaks().streak;
  el.classList.toggle('ready', ready);
  $('rn-lbl').textContent = ready ? "Today's new color is ready" : 'Next color in';
  $('rn-clock').textContent = left;
  // the streak line and the banner only change on a state change, not every tick
  const state = (ready ? 'r' : 'c') + streak + ':' + round.day;
  if (state !== countdownState) {
    countdownState = state;
    $('rn-streak').textContent = ready
      ? (streak >= 1 ? `Play it to keep your 🔥 ${streak}-day streak going.` : 'A new color is out. Same name for everyone.')
      : E.comeBackLine(streak);
    $('db-head').textContent = ready ? "✓ You finished that day's color" : "✓ You've played today's color";
    $('btn-see-result').textContent = ready ? "Play today's color →" : 'See your result ↓';
  }
  $('db-next').innerHTML = ready ? "Today's new color is ready." : `Next color in <b>${left}</b>`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayRollover(); });
window.addEventListener('focus', checkDayRollover);

/* ---------------- calendar (round 9) -------------------------------------
 * Built from store.data.days — the per-day records every finished daily
 * round has written since v1 (keyed by day number), so existing history
 * shows up with no migration. Practice rounds are not recorded. */
let calMonth = null; // Date at the 1st of the shown month
function dayOfDate(d) { return E.dayNumber(d) + 1; }
function firstPlayedDay() {
  const ks = Object.keys(store.data.days).map(Number).filter(isFinite);
  return ks.length ? Math.min(...ks) : null;
}
function openCalendar() {
  stopPour();
  const t = dateForDay(DAY);
  calMonth = new Date(t.getFullYear(), t.getMonth(), 1);
  renderCalendar();
  showCalDetail(DAY);
  closeOverlay('stats-overlay'); closeOverlay('col-overlay');
  openOverlay('cal-overlay');
}
function closeCalendar() { closeOverlay('cal-overlay'); }

/* Round 16: Stats (no counts on the main screen; design lock). Everything is
 * computed from local day records. Round 71 (Franklin): Stats and Collection
 * are their own panels with their own header buttons, not Calendar sub-tabs. */
function openStats() {
  stopPour(); stopRemove();
  closeOverlay('cal-overlay'); closeOverlay('col-overlay');
  renderStats();
  openOverlay('stats-overlay');
}
function closeStats() { closeOverlay('stats-overlay'); }
/* Round 29: "Last 14 days" sparkline. Each played day is a dot at its %,
 * missed days are gaps, and a dashed line marks par. Local data only. */
function recentFormSVG() {
  const N = 14, W = 300, H = 78, P = 8, G = 22, days = store.data.days || {};
  const pts = [];
  for (let i = 0; i < N; i++) { const d = DAY - (N - 1) + i, r = days[d]; if (r && Number.isFinite(Number(r.pct))) pts.push({ i, pct: Number(r.pct) }); }
  if (pts.length < 2) return '';
  const lo = Math.min(40, Math.floor(Math.min(...pts.map(p => p.pct)) / 10) * 10); // zoom to where scores live
  const x = i => P + i * (W - 2 * P - G) / (N - 1), y = v => H - P - ((Math.max(lo, Math.min(100, v)) - lo) / (100 - lo)) * (H - 2 * P);
  let path = '';
  pts.forEach((p, k) => { path += (k && pts[k - 1].i === p.i - 1 ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.pct).toFixed(1); });
  // r42: the par label sits in its own right gutter (G) so the newest dot never covers it
  // round 35: each dot (with a bigger invisible hit area) opens that day in the Calendar tab
  const dots = pts.map(p => `<g class="sp-dot" data-day="${DAY - (N - 1) + p.i}"><circle cx="${x(p.i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="11" class="hit"/><circle cx="${x(p.i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="3.2" class="${p.pct >= E.PAR_PCT ? 'par' : ''}"/></g>`).join('');
  return `<div class="st-h">Last 14 days</div><svg class="st-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores over the last 14 days: ${pts.map(p => p.pct + '%').join(', ')}">` +
    `<line x1="${P}" x2="${W - P - G + 4}" y1="${y(E.PAR_PCT).toFixed(1)}" y2="${y(E.PAR_PCT).toFixed(1)}" class="parline"/>` +
    `<text x="${W - P - G + 8}" y="${y(E.PAR_PCT).toFixed(1)}" dominant-baseline="middle">par</text>` +
    `<path d="${path}"/>${dots}</svg>`;
}
function renderStats() {
  const s = E.computeStats(store.data.days), live = liveStreaks();
  const tile = (v, l) => `<div class="st-tile"><b>${v}</b><span>${l}</span></div>`;
  const max = Math.max(1, ...s.dist.map(d => d.n));
  const bestLabel = s.best ? `${s.best.pct}%` : '—';
  // Round 42: like other daily games, the bucket holding today's score stands
  // out once today is finished (rows dim; see .st-dist.has-today).
  const tRec = store.data.days[DAY], tPct = tRec ? Number(tRec.pct) : NaN;
  const todayBucket = Number.isFinite(tPct) ? E.STAT_BUCKETS.findIndex(b => tPct >= b.min) : -1;
  $('cal-stats').innerHTML = s.played === 0
    ? `<p class="st-empty">No finished days yet. Your stats appear after your first daily round.</p>`
    : `<div class="st-grid">${tile(s.played, 'played')}${tile(s.avg + '%', 'average')}${tile(s.parRate + '%', `at par (${E.PAR_PCT}%+)`)}${tile(bestLabel, 'best')}</div>` +
      `<div class="st-grid trio">${tile('🔥 ' + live.streak, 'current streak')}${tile(Math.max(s.longestStreak, live.streak), 'longest streak')}${tile(live.parStreak, `par streak (${E.PAR_PCT}%+)`)}</div>` +
      recentFormSVG() +
      `<div class="st-h">Score spread</div><div class="st-dist${todayBucket >= 0 ? ' has-today' : ''}" role="list">` +
      s.dist.map((d, i) => `<div class="st-row${i === todayBucket ? ' today' : ''}" role="listitem" aria-label="${d.label}%: ${d.n}${i === todayBucket ? ', includes today' : ''}"><span>${d.label}</span><i style="width:${Math.max(d.n ? 8 : 0, 100 * d.n / max)}%"></i><em>${d.n}</em></div>`).join('') +
      `</div>`;
}

/* Round 14 a11y: a shared modal helper. On open it remembers the focused
 * element and moves focus into the panel (the close button); Tab and
 * Shift+Tab wrap inside it; on close focus returns to where it was. */
const overlayReturn = {};
function overlayFocusables(ov) {
  return [...ov.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && el.offsetParent !== null);
}
function openOverlay(id) {
  const ov = $(id); if (!ov) return;
  if (!ov.classList.contains('open')) {
    overlayReturn[id] = document.activeElement;
    // round 80: a dialog always opens at the top of its scrolling body
    const body = ov.querySelector('.ov-body'); if (body) body.scrollTop = 0;
  }
  ov.classList.add('open');
  const f = overlayFocusables(ov); const first = ov.querySelector('[data-autofocus]') || f[0];
  if (first) try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); }
}
function closeOverlay(id) {
  const ov = $(id); if (!ov || !ov.classList.contains('open')) return;
  ov.classList.remove('open');
  const r = overlayReturn[id]; overlayReturn[id] = null;
  if (r && r.focus && document.contains(r)) try { r.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}
document.addEventListener('keydown', e => {
  if (e.key !== 'Tab') return;
  const ov = document.querySelector('.modal-ov.open'); if (!ov) return;
  const f = overlayFocusables(ov); if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
});
/* Round 74 (Franklin): star badge markup. The SVG is decorative (aria-hidden);
 * each caller adds the tier's words to its own accessible name. */
const STAR_PATH = 'M12 2.6l2.8 6.1 6.6.7-4.9 4.5 1.4 6.6L12 17.2l-5.9 3.3 1.4-6.6-4.9-4.5 6.6-.7z';
const STAR_FACETS = 'M12 4.2V12.4M19.4 10L12 12.4M16.9 19.2L12 12.4M7.1 19.2L12 12.4M4.6 10L12 12.4';
const STAR_GLINT = 'M12 0l2.2 9.8L24 12l-9.8 2.2L12 24l-2.2-9.8L0 12l9.8-2.2z'; // 4-point glint
let diamondSeq = 0;
function starBadge(tier, extra) {
  if (!tier) return '';
  // round 75: the diamond star is icy (shared gradient #star-diamond-g in
  // index.html), with facet lines and a small static sparkle
  // round 76: diamond also gets a halo (::before) and a separate glint element,
  // both animated on opacity/transform only, each badge offset by a rolling
  // delay so several diamonds never blink in unison
  const dia = tier.id === 'diamond';
  const gem = dia ? `<path class="facet" d="${STAR_FACETS}"/>` : '';
  const glint = dia ? `<span class="glint"><svg viewBox="0 0 24 24"><path d="${STAR_GLINT}"/></svg></span>` : '';
  const delay = dia ? ` style="--tw:${((diamondSeq++ * 0.83) % 2.6).toFixed(2)}s"` : '';
  return `<span class="star star-${tier.id}${extra ? ' ' + extra : ''}" data-star="${tier.id}" title="${tier.label}" aria-hidden="true"${delay}><svg viewBox="0 0 24 24"><path d="${STAR_PATH}"/>${gem}</svg>${glint}</span>`;
}
function renderCalendar() {
  const grid = $('cal-grid');
  grid.innerHTML = '';
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  $('cal-title').textContent = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const today = dateForDay(DAY);
  $('btn-cal-prev').disabled = y < 2025 || (y === 2025 && m === 0);
  $('btn-cal-next').disabled = y > today.getFullYear() || (y === today.getFullYear() && m >= today.getMonth());
  const first = firstPlayedDay();
  const lead = new Date(y, m, 1).getDay();
  for (let i = 0; i < lead; i++) { const b = document.createElement('div'); b.className = 'cal-day blank'; grid.appendChild(b); }
  const nDays = new Date(y, m + 1, 0).getDate();
  for (let dd = 1; dd <= nDays; dd++) {
    const day = dayOfDate(new Date(y, m, dd));
    const rec = store.data.days[day];
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.dataset.day = day;
    let cls = 'cal-day';
    let sw = '', pct = '', ink = '', name = '', star = null;
    if (rec && rec.duo && Array.isArray(rec.duo.hexes) && rec.duo.hexes.length === 2) { // round 93: a duo day: both mixes, the average
      const p = Number(rec.pct);
      cls += ' played duo' + (p >= E.PAR_PCT ? ' par' : '');
      sw = `style="background:linear-gradient(135deg, ${rec.duo.hexes[0]} 50%, ${rec.duo.hexes[1]} 50%)"`;
      pct = p + '%';
      ink = inkFor(rec.duo.hexes[0]);
      name = (DUO_DAYS[day] && DUO_DAYS[day].title) || 'Duo';
      star = E.starTier(p);
    } else if (rec && rec.attempts && rec.attempts.length) {
      const best = bestAttempt(rec.attempts);
      cls += ' played' + (best.pct >= E.PAR_PCT ? ' par' : '');
      sw = `style="background:${best.hex}"`;
      pct = best.pct + '%';
      ink = inkFor(best.hex);
      name = rec.name || '';
      star = E.starTier(best.pct); // round 74
    } else if (day > DAY || day < 1) cls += ' future';
    else if (first != null && day >= first && day < DAY) cls += ' missed';
    else if (day < DAY) cls += ' before';
    if (day === DAY) cls += ' today';
    cell.className = cls;
    if (cls.includes(' future')) cell.disabled = true; // round 21: nothing to show, so not focusable
    // round 71: "Thursday, October 1, 2026" carries the visible day number as-is
    // ("Thu Oct 01 2026" did not: axe label-content-name-mismatch)
    const longDate = new Date(y, m, dd).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    // a played day is named by its content (hidden full date + day, score, name);
    // other days by the full date
    if (!pct) cell.setAttribute('aria-label', longDate);
    cell.innerHTML = (pct ? `<span class="sr-only">${escapeHtml(longDate)}: </span>` : '') + `<span class="cd-n">${dd}</span><span class="cd-sw ${ink}" ${sw}>${pct}${starBadge(star)}</span>` +
      (star ? `<span class="sr-only">, ${star.label}, </span>` : '') +
      `<span class="cd-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
    if (!/future/.test(cls)) cell.addEventListener('click', () => showCalDetail(day));
    else cell.disabled = true;
    grid.appendChild(cell);
  }
}
/* Legible % on a swatch: WCAG relative luminance picks dark or light ink
 * (whichever contrasts more). */
function inkFor(hex) {
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [r, g, b] = E.hexToRgb(hex);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? 'ink-dark' : 'ink-light';
}
function showCalDetail(day) {
  document.querySelectorAll('.cal-day.sel').forEach(c => c.classList.remove('sel'));
  const cell = document.querySelector(`.cal-day[data-day="${day}"]`);
  if (cell) cell.classList.add('sel');
  const rec = store.data.days[day];
  const when = dateForDay(day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const el = $('cal-detail');
  const dd = rec && rec.duo && Array.isArray(rec.duo.parts) ? duoFor(day) : null;
  if (dd && rec.duo.parts.every(p => Array.isArray(p) && p.length)) { // round 93: a played duo day
    const finals = rec.duo.parts.map(p => bestAttempt(p));
    el.innerHTML = `<div class="cdt-title">${dayTag(day) ? dayTag(day) + ' · ' : ''}${dd.emoji} ${escapeHtml(dd.title)}</div>` +
      `<div class="cdt-sub">${escapeHtml(when)} · average ${rec.pct}% · ${E.bandForDeltaE(Number(rec.de) || 0)}</div>` +
      `<div class="cdt-pk"><figure>${pumpkinSVG(dd.colors[0].thex, dd.colors[1].thex, 'Official pumpkin')}<figcaption>${escapeHtml(dd.label)}</figcaption></figure><figure>${pumpkinSVG(finals[0].hex, finals[1].hex, 'Your pumpkin')}<figcaption>Yours</figcaption></figure></div>` +
      dd.colors.map((c, i) => `<div class="cdt-row"><span class="cdt-sw"><i style="background:${c.thex}"></i>${escapeHtml(titleCase(c.name))}</span>` +
        rec.duo.parts[i].map((a, j) => `<span class="cdt-sw${a === finals[i] ? ' best' : ''}"><i style="background:${a.hex}"></i>Try ${j + 1}: <b>${a.pct}%</b></span>`).join('') + `</div>`).join('') +
      duoRecipesHTML(dd, finals);
  } else if (rec && rec.attempts && rec.attempts.length) {
    const best = bestAttempt(rec.attempts);
    const official = BANK_BY_NAME.get(rec.name) || colorForDay(day);
    el.innerHTML = `<div class="cdt-title">${dayTag(day) ? dayTag(day) + ' · ' : ''}“${escapeHtml(titleCase(rec.name))}”</div>` +
      `<div class="cdt-sub">${escapeHtml(when)} · best ${best.pct}% · ${E.bandForDeltaE(best.de)}</div>` +
      `<div class="cdt-row"><span class="cdt-sw"><i style="background:${official.thex}"></i>Official</span>` +
      rec.attempts.map((a, i) => `<span class="cdt-sw${a === best ? ' best' : ''}"><i style="background:${a.hex}"></i>Try ${i + 1}: <b>${a.pct}%</b></span>`).join('') +
      `</div>` + recipesHTML(official, scoredAttempt(rec));
  } else if (day === DAY) {
    el.innerHTML = `<div class="cdt-title">Today${dayTag(day) ? ' · ' + dayTag(day) : ''}</div><div class="cdt-sub">${escapeHtml(when)} · not played yet — today's color is waiting.</div>` +
      `<button type="button" id="btn-cal-play">Play today's color →</button>`; // round 39
    $('btn-cal-play').addEventListener('click', () => {
      closeCalendar();
      if (round && round.mode === 'practice') exitPractice();
      window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
    });
  } else if (day < DAY && day >= 1) {
    // round 73: a missed or pre-launch day shows its name only, never its
    // official recipe (the color may recur as a future daily)
    el.innerHTML = `<div class="cdt-title">${dayTag(day) ? dayTag(day) + ' · ' : ''}missed</div><div class="cdt-sub">${escapeHtml(when)} · the color was “${escapeHtml(titleCase(colorForDay(day).name))}”.</div>`;
  } else {
    el.innerHTML = '';
  }
}

/* ---------------- Collection (round 69, Franklin) ---------------------- */
/* A Pokédex of the bank (engine: DISCOVER_DE, discoverColor, recordDiscovery,
 * backfillCollection, officialRecipeVisible). Its own versioned key
 * (mixology.collection.v1); the save (misnomer.save.v1) is untouched. Storage can
 * fail (private mode, quota): the collection then lives in memory for the
 * session. Discoveries are worked out per SEALED attempt but only announced
 * at the reveal (finish), because naming the color nearest your mix before
 * the reveal would tell you how close you are (design lock: no clues). */
const COLLECTIBLE = E.collectibleColors(BANK);
// round 77: discovery is measured against each color's recipe color (thex), the same
// target the daily scores against; names that share one recipe color are twins
const COLLECTIBLE_LABS = COLLECTIBLE.map(c => E.hexToLab(c.thex));
const TWINS = new Map();
for (const c of COLLECTIBLE) TWINS.set(c.thex, (TWINS.get(c.thex) || []).concat(c.name));
const collection = {
  data: (() => {
    try {
      const raw = localStorage.getItem(E.COLLECTION_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.v === 1 && p.found && typeof p.found === 'object') return p;
      }
    } catch (e) { /* unreadable or blocked: start empty */ }
    return { v: 1, found: {}, backfilled: false };
  })(),
  persist() {
    try { localStorage.setItem(E.COLLECTION_KEY, JSON.stringify(this.data)); } catch (e) { /* memory only */ }
  }
};
// first load: everything the player has already sealed counts
if (!collection.data.backfilled) {
  try { collection.data = E.backfillCollection(collection.data, store.data.days, COLLECTIBLE, COLLECTIBLE_LABS); }
  catch (e) { collection.data.backfilled = true; }
  collection.persist();
}
/** Fold a finished round's attempts in; returns the newly discovered names. */
function collectRound(attempts, targetName) {
  const fresh = [], when = E.dateKey(new Date());
  const shownBefore = new Set(Object.keys(collectionView().found)); // round 85: a hidden practice-only entry found by a daily is new to the player
  for (const att of attempts || []) {
    const found = E.discoverColor(att.hex, COLLECTIBLE, COLLECTIBLE_LABS, null, targetName);
    // round 77: an exact match of the day's recipe discovers the day's color even
    // if the disc numbers hide tiny fractions; twins (same recipe color) come along
    const hit = att.exact && targetName && BANK_BY_NAME.get(targetName) ? { name: targetName, hex: BANK_BY_NAME.get(targetName).thex, deltaE: 0 } : found;
    const names = hit ? [hit.name, ...(TWINS.get(BANK_BY_NAME.get(hit.name).thex) || []).filter(n => n !== hit.name)] : [];
    for (const n of names) {
      const r = E.recordDiscovery(collection.data, { ...hit, name: n }, att, when);
      collection.data = r.col;
      if ((r.isNew || !shownBefore.has(r.name)) && !fresh.includes(r.name)) fresh.push(r.name);
    }
  }
  collection.persist();
  _colView = null;
  return fresh;
}
/* Round 84: read-only audit of collection entries that practice may have made
 * or raised (before round 84 practice rounds were collected too). Nothing is
 * changed; see E.auditCollectionSources. */
function practiceAudit() {
  return E.auditCollectionSources(collection.data, store.data.days, COLLECTIBLE, COLLECTIBLE_LABS, n => {
    const c = BANK_BY_NAME.get(n); return c ? (TWINS.get(c.thex) || []) : [];
  }, n => (BANK_BY_NAME.get(n) || {}).thex);
}
/* Round 85 (Franklin, option A): the Collection shows a VIEW of the stored
 * data: practice-only entries left out, practice-raised entries at their
 * daily-only best. collection.data itself is never pruned (reversible).
 * Cached per (collection, days) state. */
let _colView = null, _colViewKey = '';
function collectionView() {
  const key = Object.keys(collection.data.found || {}).length + '|' + Object.keys(store.data.days).length + '|' + JSON.stringify(collection.data).length;
  if (_colView && key === _colViewKey) return _colView;
  const twinsOf = n => { const c = BANK_BY_NAME.get(n); return c ? (TWINS.get(c.thex) || []) : []; };
  try { _colView = E.collectionView(collection.data, store.data.days, COLLECTIBLE, COLLECTIBLE_LABS, twinsOf, n => (BANK_BY_NAME.get(n) || {}).thex); }
  catch (e) { _colView = { ...collection.data, hidden: [], raised: [] }; }
  _colViewKey = key;
  return _colView;
}
/* Names that must not show while a round is open: today's daily color until
 * today is finished, and the open round's own color. A collected one of these
 * shows as undiscovered (and is not counted) until then. */
function collectionHidden() {
  const h = new Set();
  if (!store.data.days[DAY]) h.add(colorForDay(DAY).name);
  if (round && !round.finished) h.add(round.color.name);
  return h;
}
let toastQueue = [], toastBusy = false;
function queueDiscoveryToasts(names) {
  if (!names.length) return;
  toastQueue.push(...names);
  if (!toastBusy) setTimeout(nextToast, 900); // after the reveal lands
}
function nextToast() {
  const el = $('col-toast'), name = toastQueue.shift();
  if (!el || !name) { toastBusy = false; return; }
  toastBusy = true;
  const c = BANK_BY_NAME.get(name);
  el.innerHTML = `<i style="background:${c ? c.thex : '#ccc'}" aria-hidden="true"></i><span>New color discovered: <b>${escapeHtml(titleCase(name))}</b>!</span>`;
  el.dataset.name = name;
  el.setAttribute('aria-label', `New color discovered: ${titleCase(name)}! Open the Collection`); // r77 axe: name contains the visible text
  el.hidden = false; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  announce(`New color discovered: ${titleCase(name)}!`);
  sfx.discover(); buzz([10, 40, 14]);
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.classList.remove('show'); el.hidden = true; setTimeout(nextToast, 250); }, 2600);
}
function openCollection(name) {
  stopPour(); stopRemove();
  closeOverlay('cal-overlay'); closeOverlay('stats-overlay');
  renderCollection();
  openOverlay('col-overlay');
  if (name) showCollectionDetail(name);
}
function closeCollection() { closeOverlay('col-overlay'); }
function renderCollection() {
  const hidden = collectionHidden(), found = collectionView().found || {}; // round 85: the view, not the raw store
  const has = c => !!found[c.name] && !hidden.has(c.name);
  const fams = E.HUE_FAMILIES.map(f => ({ ...f, colors: [] }));
  const byId = new Map(fams.map(f => [f.id, f]));
  for (const c of COLLECTIBLE) byId.get(E.hueFamily(c.thex)).colors.push(c);
  for (const f of fams) f.colors.sort((a, b) => E.hexToLab(b.thex)[0] - E.hexToLab(a.thex)[0]);
  const total = COLLECTIBLE.length, n = COLLECTIBLE.filter(has).length;
  const famRow = f => { const k = f.colors.filter(has).length; return `<li><span>${f.label}</span><i><b style="width:${(100 * k / Math.max(1, f.colors.length)).toFixed(1)}%"></b></i><em>${k}/${f.colors.length}</em></li>`; };
  $('cal-col').innerHTML =
    `<div class="col-count"><b>${n} / ${total}</b> discovered</div>` +
    `<p class="col-how">Every mix you submit discovers the named color nearest to it, if it comes close enough. It does not have to be the day's color.</p>` +
    `<ul class="col-fams" aria-label="Progress by color family">${fams.map(famRow).join('')}</ul>` +
    `<div id="col-detail" tabindex="-1"></div>` +
    fams.map(f => `<h2 class="col-h">${f.label} <span>${f.colors.filter(has).length}/${f.colors.length}</span></h2><div class="col-grid">` +
      f.colors.map(c => has(c)
        ? (st => `<button type="button" class="ct" data-name="${escapeHtml(c.name)}" style="background:${c.thex}" aria-label="${escapeHtml(titleCase(c.name))}${st ? ', ' + st.label : ''}">${starBadge(st)}</button>`)(E.collectionStar(c.name, store.data.days)) // round 94: stars only for colors that were a played day's target
        : `<span class="ct q" aria-hidden="true">?</span>`).join('') + `</div>`).join('');
  $('cal-col').querySelectorAll('.ct[data-name]').forEach(b => b.addEventListener('click', () => showCollectionDetail(b.dataset.name)));
}
function showCollectionDetail(name) {
  const el = $('col-detail'), rec = (collectionView().found || {})[name], c = BANK_BY_NAME.get(name);
  if (!el || !rec || !c || collectionHidden().has(name)) return;
  document.querySelectorAll('.ct.sel').forEach(x => x.classList.remove('sel'));
  const tile = [...document.querySelectorAll('.ct[data-name]')].find(x => x.dataset.name === name); if (tile) tile.classList.add('sel');
  const showRecipe = E.officialRecipeVisible(name, store.data.days); // round 73: only colors you finished as a daily
  const playedAsDaily = E.dailyStarPct(name, store.data.days) !== null; // round 94: a played day's target (duo: either color)
  const b = rec.best, bPct = E.collectedBestPct(rec, c.thex), bStar = E.collectionStar(name, store.data.days); // round 94: star from that color's own dailies only
  const when = rec.date ? new Date(rec.date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'before the Collection existed';
  el.innerHTML = `<div class="cdt-title">“${escapeHtml(titleCase(name))}”</div>` +
    `<div class="cdt-sub">Discovered ${escapeHtml(when)} · your best ${bPct}%${bStar ? ` · <span class="star-word">${starBadge(bStar, 'inline')}${bStar.id} star</span>` : ''}</div>` +
    `<div class="cdt-row"><span class="cdt-sw"><i style="background:${c.thex}"></i>Official</span><span class="cdt-sw best"><i style="background:${b.hex}"></i>Your best: <b>${bPct}%</b></span></div>` +
    recipeRowHTML('Your mix', bPct + '%', b.comp) +
    (playedAsDaily ? '' : `<p class="col-found">Found by a nearby mix. Stars are earned only on the color of the day.</p>`) + // round 94
    ((showRecipe || playedAsDaily) ? recipeRowHTML('Official', '', c.recipe) : `<p class="col-lock">The official recipe unlocks once you finish this color as a daily.</p>`);
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  el.scrollIntoView({ block: 'nearest', behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
}

/* ---------------- practice ---------------------------------------------- */
function startPractice() {
  selectedTool = 'pour'; // round 7: entering practice also lands on the Pour Bucket
  let c = todayColor;
  while (c.name === todayColor.name) c = POOL[Math.floor(Math.random() * POOL.length)];
  newRound('practice', c);
}
function exitPractice() {
  initDaily();
}

/* ---------------- init --------------------------------------------------- */
function initDaily() {
  const rec = store.data.days[DAY];
  const dd = duoFor(DAY);
  if (rec && dd && rec.duo && Array.isArray(rec.duo.parts) && rec.duo.parts.every(p => Array.isArray(p) && p.length)) { // round 93
    round = { mode: 'daily', color: dd.colors[1], day: DAY, finished: true, pot: freshPot(), undo: [], attempts: rec.duo.parts[1],
      duo: { def: dd, idx: 1, parts: rec.duo.parts } };
    renderAll();
  } else if (rec) {
    const lastAtt = scoredAttempt(rec);
    round = {
      mode: 'daily', color: todayColor, day: DAY, finished: true,
      pot: lastAtt.comp ? { ...lastAtt.comp } : freshPot(),
      undo: [], attempts: rec.attempts
    };
    renderAll();
  } else {
    newRound('daily', todayColor);
    const wip = store.data.wip;
    // Round 8: restore only a WIP for today's day AND today's color
    // (pre-round-8 WIPs carry no name; their day still pins the color,
    // because the frozen schedule preserved every pre-existing day).
    if (wip && wip.day === DAY && (!wip.name || wip.name === todayColor.name)) {
      round.attempts = (wip.attempts || []).slice(0, 3);
      // round 83: a WIP pot that is exactly the OLD untouched start (100% white)
      // becomes the new empty pot; any other saved pot loads as it is
      // (white in it is real paint the player kept).
      round.pot = !wip.pot || E.recipeMatch(wip.pot, E.OLD_WHITE_START) && Math.abs((wip.pot.w || 0) - 100) < 1e-9 ? freshPot() : wip.pot;
      if (round.duo && wip.duoIdx === 1 && Array.isArray(wip.duoParts) && Array.isArray(wip.duoParts[0]) && wip.duoParts[0].length) { // round 93: resume on color 2
        round.duo.idx = 1; round.duo.parts = [wip.duoParts[0], null]; round.color = round.duo.def.colors[1];
      }
      // Round 9 migration: a WIP saved under the 3-attempt rules may
      // already hold 2 sealed attempts — that is a complete round now,
      // so finish it (best of the attempts made counts; nothing lost).
      if (round.duo && round.duo.idx === 0 && round.attempts.length >= MAX_ATTEMPTS) duoAdvance(); // round 93
      else if (round.attempts.length >= MAX_ATTEMPTS) finish();
      else renderAll();
    } else if (wip) {
      store.data.wip = null; // stale WIP (old day or a different color): discard safely
      store.persistSoon();
    }
  }
  maybeShowDuel();
}

/* ---------------- events -------------------------------------------------- */
document.querySelectorAll('.bucket').forEach(btn => {
  btn.addEventListener('click', () => {
    stopPour();
    if (selectedBucket !== btn.dataset.bucket) { sfx.pick(); buzz(6); } // round 27: tactile select
    selectedBucket = btn.dataset.bucket; renderAll();
  });
});
// Round 68: remove badges. Pointer press = remove (hold ramps); the trailing
// click is ignored (detail > 0), so only keyboard activation removes from click.
document.querySelectorAll('.premove').forEach(btn => {
  const key = btn.dataset.rm;
  btn.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    startRemove(key);
  });
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(t, () => { if (removeTimer || removeKey) stopRemove(); });
  btn.addEventListener('click', e => { if (e.detail === 0) removePaint(key); });
  btn.addEventListener('contextmenu', e => e.preventDefault()); // a long press must not open a menu
});
document.querySelectorAll('.tool[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    stopPour();
    if (selectedTool !== btn.dataset.tool) { sfx.pick(); buzz(6); }
    selectedTool = btn.dataset.tool; renderAll();
  });
});
/* Round 70 (Franklin, urgent): iOS/Android long-press in the play area must not
 * select text, open the Copy / Look Up callout, show the magnifier or open a
 * context menu. CSS does most of it; these listeners are the belt and braces.
 * touchstart is only cancelled on the hold targets (pot, remove badges), which
 * act on pointerdown and take keyboard clicks only, so normal taps on discs,
 * tools and Seal still produce their click. */
const PLAY_AREA = ['stage', 'toolbar', 'attempts-list', 'actions'].map(id => $(id)).filter(Boolean);
for (const el of PLAY_AREA) {
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('selectstart', e => e.preventDefault());
  el.addEventListener('pointerdown', () => { // a stray selection elsewhere must not grow into the play area
    try { const s = window.getSelection(); if (s && s.rangeCount && !s.isCollapsed) s.removeAllRanges(); } catch (err) { /* ignore */ }
  }, true);
}
for (const el of [$('pot'), ...document.querySelectorAll('.premove')]) {
  if (el) el.addEventListener('touchstart', e => { if (e.cancelable) e.preventDefault(); }, { passive: false });
}
/* The pot IS the canvas. Press = dose (Dropper: one drop; Pour Bucket:
 * starts pouring). Release / cancel / lost capture = stop pouring.
 * Mouse/touch clicks arrive via pointerdown; the trailing click event is
 * ignored (detail > 0) so nothing double-doses — only keyboard activation
 * (click with detail === 0) doses from the click handler. */
const potEl = $('pot');
/* Pressing the pot after the round is finished must never be a silent
 * no-op (round 7: a player adding white "at the end" of a finished
 * round got a dead pot that looked exactly like a live one). Shake the
 * pot and take the player to the reveal instead. */
function lockedFeedback() {
  potEl.classList.remove('shake');
  void potEl.offsetWidth; // restart the shake animation
  potEl.classList.add('shake');
  const reveal = $('reveal');
  if (reveal && reveal.style.display !== 'none') {
    reveal.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'nearest' });
  }
}
potEl.addEventListener('pointerdown', e => {
  if (!round) return;
  if (round.finished) { lockedFeedback(); return; }
  e.preventDefault();
  try { potEl.setPointerCapture(e.pointerId); } catch (err) { /* not critical */ }
  if (selectedTool === 'pour') startPour();
  else { dose(); dropAnim(); }
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev =>
  potEl.addEventListener(ev, stopPour));
/* Round 63: keyboard parity for the Pour Bucket. Holding Enter or Space on the
 * pot pours exactly like holding a finger: the same ramp, and one undo step for
 * the whole hold. Before, key auto-repeat dosed about 30 separate single drops,
 * each its own undo step. Screen-reader activation (a synthetic click) still
 * doses once through the click handler below. */
potEl.addEventListener('keydown', e => {
  if ((e.key !== 'Enter' && e.key !== ' ') || !round || round.finished || selectedTool !== 'pour') return;
  e.preventDefault(); // no click: the hold itself doses
  if (!e.repeat) startPour();
});
potEl.addEventListener('keyup', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (pourTimer) { e.preventDefault(); stopPour(); }
});
potEl.addEventListener('blur', stopPour);
potEl.addEventListener('click', e => {
  if (e.detail !== 0 || !round) return; // keyboard only
  if (round.finished) { lockedFeedback(); return; }
  if (selectedTool === 'pour') dose();
  else { dose(); dropAnim(); }
});
/* Toolbar collapse/expand: the head (with the current tool) always shows. */
$('btn-toolbar-toggle').addEventListener('click', () => {
  const bar = $('toolbar');
  const collapsed = bar.classList.toggle('collapsed');
  const btn = $('btn-toolbar-toggle');
  btn.setAttribute('aria-expanded', String(!collapsed));
  btn.setAttribute('aria-label', collapsed ? 'Expand toolbar' : 'Collapse toolbar');
  btn.textContent = collapsed ? '▴' : '▾';
});
/* Tips overlay: open from the header; close via ✕, backdrop click, Escape. */
function closeTips() { closeOverlay('tips-overlay'); }
$('btn-tips').addEventListener('click', () => { stopPour(); openOverlay('tips-overlay'); });
$('btn-calendar').addEventListener('click', openCalendar);
$('btn-stats').addEventListener('click', openStats);
$('btn-collection').addEventListener('click', () => openCollection());
$('btn-stats-close').addEventListener('click', closeStats);
$('btn-col-close').addEventListener('click', closeCollection);
$('stats-overlay').addEventListener('click', e => { if (e.target === $('stats-overlay')) closeStats(); });
$('col-overlay').addEventListener('click', e => { if (e.target === $('col-overlay')) closeCollection(); });
$('col-toast').addEventListener('click', () => { const n = $('col-toast').dataset.name; openCollection(n); });
$('cal-stats').addEventListener('click', e => {
  const dot = e.target.closest && e.target.closest('.sp-dot'); if (!dot) return;
  const day = Number(dot.dataset.day); if (!Number.isFinite(day)) return;
  // round 71: a dot opens that day in the Calendar panel
  openCalendar();
  const d = dateForDay(day); calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendar(); showCalDetail(day);
});
$('btn-cal-close').addEventListener('click', closeCalendar);
$('cal-overlay').addEventListener('click', e => { if (e.target === $('cal-overlay')) closeCalendar(); });
/* Round 28: swipe the calendar grid left/right to change month (touch). */
(() => {
  const grid = $('cal-grid'); let sx = null, sy = null;
  grid.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  grid.addEventListener('touchend', e => {
    if (sx == null) return; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const btn = $(dx < 0 ? 'btn-cal-next' : 'btn-cal-prev');
    if (!btn.disabled) { btn.click(); buzz(6); }
  }, { passive: true });
})();
/* Round 34: the grid slides in from the side you're heading to. */
function slideCal(dir) {
  if (REDUCED_MOTION) return;
  const g = $('cal-grid'); g.classList.remove('slide-l', 'slide-r'); void g.offsetWidth;
  g.classList.add(dir < 0 ? 'slide-r' : 'slide-l');
}
$('btn-cal-prev').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); slideCal(-1); });
$('btn-cal-next').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); slideCal(1); });
// Round 57: PageUp / PageDown flip months while the calendar is open (date-picker convention)
document.addEventListener('keydown', e => {
  if ((e.key !== 'PageUp' && e.key !== 'PageDown') || !$('cal-overlay').classList.contains('open') || $('cal-grid').style.display === 'none') return;
  const btn = $(e.key === 'PageUp' ? 'btn-cal-prev' : 'btn-cal-next');
  e.preventDefault(); if (!btn.disabled) btn.click();
});
$('btn-tips-close').addEventListener('click', closeTips);
// Round 49: the welcome card can be reopened from Tips (it no longer auto-shows after the first visit)
$('btn-replay-intro').addEventListener('click', () => { closeTips(); openOverlay('welcome-overlay'); });
$('tips-overlay').addEventListener('click', e => { if (e.target === $('tips-overlay')) closeTips(); });
/* Round 40: desktop keyboard shortcuts. 1–5 pick red/yellow/blue/black/white
 * (ring order; round 68: Shift+1–5 removes 1% of that paint), D = Dropper, P = Pour Bucket, Z or Ctrl/Cmd+Z = Undo. There is
 * deliberately no seal key, so an attempt is never sealed by accident. Ignored
 * while a dialog is open, inside form fields, or with Alt / Ctrl+other. */
document.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || document.querySelector('.modal-ov.open')) return;
  const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (k === 'z' && !e.shiftKey) { if (round && !round.finished) { e.preventDefault(); const had = round.undo.length; undo(); if (had) announce('Undone'); } return; }
  if (mod) return;
  // round 68: Shift+1–5 takes 1% of that paint out
  const rmPig = e.shiftKey ? { Digit1: 'r', Digit2: 'y', Digit3: 'b', Digit4: 'k', Digit5: 'w' }[e.code] : null;
  if (rmPig) { e.preventDefault(); if (!removePaint(rmPig)) announce(`No ${PIG_NAMES[rmPig].toLowerCase()} to remove`); return; }
  const pig = { 1: 'r', 2: 'y', 3: 'b', 4: 'k', 5: 'w' }[e.key];
  // round 60: focus stays where it was, so say what changed for screen readers
  if (pig) { const btn = $(BUCKET_EL[pig]); if (btn) { btn.click(); announce(`${PIG_NAMES[pig]} paint selected`); } return; }
  if (k === 'd') { $('tool-dropper').click(); announce('Dropper selected'); }
  else if (k === 'p') { $('tool-pour').click(); announce('Pour Bucket selected'); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeTips(); closeCalendar(); closeStats(); closeCollection(); closeWelcome(); } });
/* Round 14: first-visit welcome. Shown once per device, only to someone
 * with no saved days. The flag lives in its own key so the save format
 * (misnomer.save.v1) is untouched. */
const WELCOME_KEY = 'mixology.welcomed.v1';
function closeWelcome() {
  if (!$('welcome-overlay').classList.contains('open')) return;
  closeOverlay('welcome-overlay');
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) { /* private mode */ }
  // Round 43: first-visit coach mark. Two soft rings pulse out of the pot to show
  // where to tap. CSS only, so reduced motion turns it off; it clears itself.
  const pot = $('pot');
  if (pot && round && !round.finished && !REDUCED_MOTION) {
    pot.classList.add('coach'); setTimeout(() => pot.classList.remove('coach'), 2600);
  }
}
function maybeWelcome() {
  let seen = false; try { seen = !!localStorage.getItem(WELCOME_KEY); } catch (e) { seen = true; }
  const hasHistory = Object.keys(store.data.days || {}).length > 0 || !!store.data.wip;
  if (seen || hasHistory) return;
  openOverlay('welcome-overlay');
}
$('btn-welcome-go').addEventListener('click', closeWelcome);
$('btn-welcome-tips').addEventListener('click', () => { closeWelcome(); openOverlay('tips-overlay'); });
$('welcome-overlay').addEventListener('click', e => { if (e.target === $('welcome-overlay')) closeWelcome(); });
maybeWelcome();
$('btn-undo').addEventListener('click', undo);
$('btn-reset').addEventListener('click', resetPot);
$('btn-seal').addEventListener('click', () => seal());
$('btn-share').addEventListener('click', async ev => {
  const btn = ev.currentTarget, day = round && round.mode === 'daily' ? round.day : DAY;
  track('share'); // round 78
  shareImage(btn, day); // round 87: image only
});
$('btn-card').addEventListener('click', ev => saveShareCard(ev.currentTarget));
$('btn-duel').addEventListener('click', ev => {
  const day = round && round.mode === 'daily' ? round.day : DAY;
  const rec = store.data.days[day];
  if (!rec) return;
  // round 93: a duo day's link carries the average (p), color 1's mix (x) and color 2's mix (y)
  const dParts = rec.duo && Array.isArray(rec.duo.parts) && rec.duo.parts.every(p => Array.isArray(p) && p.length) ? rec.duo.parts : null;
  const url = dParts ? duelUrlFor({ pct: rec.pct, comp: bestAttempt(dParts[0]).comp }, day) + `&y=${E.encodeDuelComp(bestAttempt(dParts[1]).comp, day)}`
    : duelUrlFor(scoredAttempt(rec), day);
  // Round 36: a native share sheet gets a one-line challenge (never the color's name).
  // The clipboard fallback still copies just the link, as the button says.
  const line = `Beat my ${rec.pct}% on Mixology ${dayTag(day) || shortDate(day)}?`;
  doShare(ev.currentTarget, url, 'Link copied ✓', line);
});
$('btn-today').addEventListener('click', () => { initDaily(); window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' }); });
$('btn-next-practice').addEventListener('click', startPractice);
// Round 82: the top banner for a player who already finished today
$('btn-see-result').addEventListener('click', () => {
  if (round && round.mode === 'daily' && round.day !== DAY) { $('btn-today').click(); return; }
  const r = $('reveal'); if (r) r.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' });
});
$('btn-db-practice').addEventListener('click', startPractice);
$('btn-practice').addEventListener('click', () => {
  if (round && round.mode === 'practice') exitPractice(); else startPractice();
});
/* Round 17: SVG speaker icon (on / muted) with a real toggle state. */
const ICON_SOUND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_MUTED = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function renderMute() {
  const b = $('btn-mute'), m = !!store.data.muted;
  b.innerHTML = m ? ICON_MUTED : ICON_SOUND;
  b.setAttribute('aria-pressed', String(!m));
  b.setAttribute('aria-label', m ? 'Sound is off. Turn sound on' : 'Sound is on. Turn sound off');
}
$('btn-mute').addEventListener('click', () => {
  store.data.muted = !store.data.muted;
  store.persistSoon();
  renderMute();
});
renderMute();

initPotHint(); // round 81: decided once, from the save as loaded
initDaily();
// round 78: anonymous counts (no-op until ANALYTICS_CODE is set in analytics.js)
track('open'); trackReturn(); if (incomingDuel) track('duel-open');
/* Round 86: save transfer to mixologydaily.com (transfer.js runs first and has
 * already merged any #import=... link into storage before this file loaded). */
(function transferUI() {
  const T = window.MixTransfer; if (!T) return;
  const imp = T.lastImport;
  if (imp && imp.ok && !imp.none) {
    const el = $('move-toast'); el.hidden = false;
    setTimeout(() => { el.hidden = true; }, 4500);
  }
  try {
    if (T.showMoveButton(location, localStorage)) {
      $('move-row').hidden = false;
      $('btn-move').addEventListener('click', () => { store.persist(); collection.persist(); const l = T.buildLink(localStorage, { search: location.search }); if (l) location.href = l; });
    }
  } catch (e) { /* ignore */ }
})();
try { if (MA && MA.enabled && $('privacy-note')) $('privacy-note').hidden = false; } catch (e) { /* ignore */ }

/* ---------------- debug / playtest handle --------------------------------- */
window.MISNOMER = {
  drawShareCard,
  version: '1.34.0',
  DUO_DAYS, duoFor: day => { const d = duoFor(day); return d && { id: d.id, title: d.title, names: d.colors.map(c => c.name), thex: d.colors.map(c => c.thex) }; },
  get today() { return { day: DAY, name: todayColor.name }; },
  colorForDay: day => colorForDay(day).name,
  checkDayRollover, parseDuel, openCalendar, closeCalendar, MAX_ATTEMPTS, practiceAudit,
  state() {
    return JSON.parse(JSON.stringify({
      mode: round.mode, finished: round.finished, colorName: round.color.name, duoIdx: round.duo ? round.duo.idx : null, duoParts: round.duo ? round.duo.parts : null,
      targetHex: round.color.thex, // debug only (round 77: the recipe color) — never rendered pre-reveal in the UI
      pot: round.pot, attempts: round.attempts,
      selectedBucket, selectedTool,
      day: round.day, streak: liveStreaks().streak, parStreak: liveStreaks().parStreak
    }));
  },
  selectBucket(b) { selectedBucket = b; renderAll(); },
  removePaint, // round 68
  collection: () => JSON.parse(JSON.stringify(collection.data)), // round 69 (raw, stored)
  collectionView: () => JSON.parse(JSON.stringify(collectionView())), // round 85 (what the Collection shows)
  openCollection,
  selectTool(t) { selectedTool = t; renderAll(); },
  dose, undo, resetPot, seal, finish,
  startPractice, exitPractice,
  newPractice: startPractice,
  shareLine, shareImage, maybeWelcome, WELCOME_KEY, untilNextColor, titleCase,
  engine: E, bank: BANK, pool: POOL
};
