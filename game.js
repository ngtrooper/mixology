/* Misnomer — game controller (DOM wiring, state, saves, duels, share).
 * Pure color logic lives in engine.js; data in colors.js.
 * Exposes window.MISNOMER for inspection/automated playtests. */
'use strict';

const E = window.MisnomerEngine;
const BANK = window.MISNOMER_COLORS;
// Round 8: daily-eligible = the solver's best recipe scores >= par
// (engine.isDailyEligible / PAR_PCT) — no hard-coded ΔE threshold.
const POOL = BANK.filter(c => E.isDailyEligible(c.de));
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
const POUR_RATE = 30; // units (drops) per second while held with the Pour Bucket
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
  pour() { beep(110 + Math.random() * 40, 0.12, 'sine', 0.03); }, // soft glug while pouring
  seal() { beep(150, 0.09, 'triangle', 0.06); },
  pick() { beep(660, 0.035, 'sine', 0.025); }, // round 27: soft tick on pigment/tool change
  reveal() { [523, 659, 784].forEach((f, i) => beep(f, 0.16, 'sine', 0.05, i * 0.09)); },
  // round 15: tiered finish. Par adds a fourth note, 95%+ a sparkle run.
  par() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'sine', 0.05, i * 0.09)); },
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
  renderAll();
}
function mixHex() { return E.mixColor(round.pot); }
function targetLab() { return E.hexToLab(round.color.hex); }

/* Undo is GESTURE-based (round 6): one snapshot per press or hold, so a
 * whole pour — however many units — is a single Undo step. (The old
 * per-drop undo stack needed up to 90 clicks to take back one pour;
 * see tools/stuck-diagnosis-round5.md.) A gesture opens on a press /
 * pour start and closes on release or on the next discrete action. */
let gestureOpen = false;
function beginGesture() {
  if (gestureOpen || !round) return;
  gestureOpen = true;
  round.undo.push({ snapshot: { ...round.pot } });
}
function endGesture() { gestureOpen = false; }

/* Apply ONE unit (one drop = 1% of the pot) of the selected pigment.
 * Displacement is the engine's job (addUnits renormalizes to 100). */
function applyUnit(silent) {
  round.pot = E.addUnits(round.pot, selectedBucket, 1);
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
  stopPour();
  if (!round || round.finished || !round.undo.length) return;
  const last = round.undo.pop();
  if (last.snapshot) round.pot = last.snapshot;
  else if (last.key) round.pot = E.addUnits(round.pot, last.key, -last.n); // legacy entry
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
/* Round 8 visuals: the paint is visible going IN. Dropper — a pigment
 * (round 9: an SVG dropper/bucket rig — see dropAnim/drawStream) lands with a tinted ripple, a small
 * splash and a pigment "bloom" that dissolves into the mix. Pour Bucket —
 * a flowing stream in the pigment colour runs from the bucket lip to an
 * impact point on the surface, which keeps blooming / rippling /
 * splashing while held; the surface swirls and its colour eases (CSS
 * transition) instead of snapping. Transform/opacity only; all of it is
 * skipped under prefers-reduced-motion. Light haptics on phones. */
let pourTimer = null;
const FX_PIGMENT = k => PIGMENT_HEX[k] || '#FFFFFF';
function rgba(hex, a) { const [r, g, b] = E.hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; }
function buzz(ms) { // ms: number or vibration pattern
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
function spawnRipple(color, x, y) { // x, y in surface % (default: centre)
  if (REDUCED_MOTION) return;
  const surface = $('pot-surface');
  if (!surface) return;
  const r = document.createElement('div');
  r.className = 'ripple';
  r.style.left = (x == null ? 50 : x) + '%';
  r.style.top = (y == null ? 50 : y) + '%';
  if (x != null) r.style.width = '40%';
  if (color) r.style.borderColor = rgba(color, color === PIGMENT_HEX.w ? 0.95 : 0.7);
  surface.appendChild(r);
  try {
    const a = r.animate([
      { transform: 'translate(-50%,-50%) scale(.15)', opacity: .9 },
      { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0 }
    ], { duration: 560, easing: 'ease-out' });
    a.onfinish = () => r.remove();
  } catch (e) { /* animation is decorative */ }
  setTimeout(() => r.remove(), 800);
}
function bloom(color, x, y, size) { // pigment dissolving into the mix
  if (REDUCED_MOTION) return;
  const surface = $('pot-surface');
  if (!surface) return;
  const d = document.createElement('div');
  d.className = 'bloom';
  d.style.left = x + '%'; d.style.top = y + '%';
  d.style.width = (size || 42) + '%';
  d.style.background = `radial-gradient(circle, ${rgba(color, .95)} 0 35%, ${rgba(color, .55)} 55%, ${rgba(color, 0)} 72%)`;
  surface.appendChild(d);
  try {
    const a = d.animate([
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: .95 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: .55, offset: .35 },
      { transform: 'translate(-50%,-50%) scale(1.5)', opacity: 0 }
    ], { duration: 900, easing: 'ease-out' });
    a.onfinish = () => d.remove();
  } catch (e) { /* decorative */ }
  setTimeout(() => d.remove(), 1100);
}
function splash(color, x, y, n) { // x, y in #stage px
  if (REDUCED_MOTION) return;
  const fx = $('fx');
  if (!fx) return;
  for (let i = 0; i < (n || 4); i++) {
    const p = document.createElement('div');
    p.className = 'splash';
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.background = color;
    fx.appendChild(p);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, dist = 10 + Math.random() * 16;
    const tx = Math.cos(ang) * dist, ty = Math.sin(ang) * dist;
    try {
      const a = p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(.9)`, opacity: 1, offset: .55 },
        { transform: `translate(calc(-50% + ${tx * 1.3}px), calc(-50% + ${ty * 0.2 + 8}px)) scale(.4)`, opacity: 0 }
      ], { duration: 420, easing: 'ease-out' });
      a.onfinish = () => p.remove();
    } catch (e) { /* decorative */ }
    setTimeout(() => p.remove(), 600);
  }
}
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
    a.onfinish = () => {
      d.remove();
      const xp = (land.x - g.left) / (g.r * 2) * 100, yp = (land.y - g.top) / (g.r * 2) * 100;
      spawnRipple(color, xp, yp);
      bloom(color, xp, yp, 34);
      splash(color, land.x, land.y, 4);
      buzz(8);
    };
  } catch (e) { d.remove(); }
  setTimeout(() => d.remove(), 900);
}
function pourFx(tick) {
  if (REDUCED_MOTION) return;
  const hit = pourImpact();
  if (!hit) return;
  const color = FX_PIGMENT(selectedBucket);
  const xp = (hit.x - hit.g.left) / (hit.g.r * 2) * 100, yp = (hit.y - hit.g.top) / (hit.g.r * 2) * 100;
  if (tick % 2 === 0) bloom(color, xp, yp, 46);
  if (tick % 3 === 0) spawnRipple(color, xp, yp);
  if (tick % 4 === 0) splash(color, hit.x, hit.y, 3);
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
  let ticks = 0;
  const streamDelay = REDUCED_MOTION ? 0 : 110;
  stage._streamT = setTimeout(() => { if (pourTimer) stage.classList.add('streaming'); }, streamDelay);
  sfx.pour();
  pourTimer = setInterval(() => {
    if (!round || round.finished) { stopPour(); return; }
    applyUnit(true); // no cap exists — a pour can only be stopped by release
    ticks++;
    if (stage.classList.contains('streaming')) pourFx(ticks);
    if (ticks % 5 === 0) sfx.pour();
  }, 1000 / POUR_RATE);
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
}

function seal() {
  stopPour();
  if (!round || round.finished || round.attempts.length >= MAX_ATTEMPTS) return null;
  const hex = mixHex();
  const de = E.deltaE2000(E.hexToLab(hex), targetLab());
  const att = {
    comp: { ...round.pot }, hex,
    pct: E.accuracyFromDeltaE(de), de: Math.round(de * 10) / 10
  };
  round.attempts.push(att);
  justSealed = round.attempts.length - 1;
  sfx.seal();
  announce(`Attempt ${round.attempts.length} sealed: ${att.pct}% accuracy.`);
  if (round.attempts.length >= MAX_ATTEMPTS) finish();
  else { renderAll(); persistWip(); }
  return att;
}

function finish() {
  stopPour();
  if (!round || round.finished || !round.attempts.length) return;
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
  } else {
    store.data.practiceRounds += 1;
    store.persistSoon();
  }
  const streakBefore = round.mode === 'daily' ? streakAtStart : null;
  announce(`Round complete. Your best attempt scored ${final.pct}%, ${E.bandForDeltaE(final.de)}.`);
  if (final.pct >= 95) sfx.ace(); else if (final.pct >= E.PAR_PCT) sfx.par(); else sfx.reveal();
  renderAll();
  maybeShowDuel();
  scrollRevealIntoView();
  revealEntrance(final.pct);
  celebrate(final.pct, round.mode === 'daily' && store.data.streak > (streakBefore || 0));
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
  const out = $('reveal-pct'), t0 = performance.now(), D = 750;
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
  const cols = [round && round.color.hex, '#D6282E', '#FFCD00', '#1C4096', '#ffffff', '#b3541e'].filter(Boolean);
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
  const el = $('reveal');
  if (!el || el.style.display === 'none') return;
  setTimeout(() => el.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'start' }), 80);
}

function persistWip() {
  if (round && round.mode === 'daily' && !round.finished) {
    // Round 8: the WIP carries its color's name, so a WIP can never be
    // scored against a different color (schedule or pool changes).
    store.data.wip = { day: round.day, name: round.color.name, attempts: round.attempts, pot: { ...round.pot } };
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
  const base = location.href.split(/[?#]/)[0];
  return `${base}?d=${day}&p=${final.pct}&x=${E.encodeDuelComp(final.comp, day)}`;
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
  const pct = parseInt(p.get('p'), 10);
  if (!hex || !isFinite(day) || !isFinite(pct)) return null;
  return { day, hex, pct: clamp01(pct), comp };
}
function clamp01(v) { return Math.max(0, Math.min(100, v)); }
const incomingDuel = parseDuel();
function maybeShowDuel() {
  const card = document.getElementById('duel-card');
  if (!incomingDuel || !isFinite(incomingDuel.day)) { card.style.display = 'none'; return; }
  const theirColor = colorForDay(incomingDuel.day);
  const mine = store.data.days[incomingDuel.day];
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
function shareText(day) {
  day = day || (round && round.mode === 'daily' ? round.day : DAY);
  const rec = store.data.days[day];
  if (!rec) return '';
  const final = scoredAttempt(rec);
  const s = store.data;
  const lines = [
    // Franklin: never put the color's name in shared text, only the hook.
    `🎨 MIXOLOGY ${dayTag(day) || shortDate(day)} — How well do you know your colors?`,
    'My mix: ██████',
    `${rec.pct}% accuracy — ${rec.band} · Tries: ${rec.attempts.map(a => a.pct + '%').join(' · ')}`,
    `🔥 Streak ${s.streak}` + (s.parStreak >= 2 ? ` · Par streak ${s.parStreak}` : ''),
    duelUrlFor(final, day)
  ];
  return lines.join('\n');
}
/* Round 25: buttons carry SVG icons, so a temporary "Copied ✓" label must
 * restore the button's markup, not just its text. Guarded against double taps. */
function flashLabel(btn, label) {
  if (!btn.dataset.html) btn.dataset.html = btn.innerHTML;
  btn.textContent = label;
  clearTimeout(btn._flashT);
  btn._flashT = setTimeout(() => { btn.innerHTML = btn.dataset.html; delete btn.dataset.html; }, 1600);
}
async function doShare(btn, text, okLabel, file, nativeText) {
  const done = () => flashLabel(btn, okLabel);
  if (navigator.share && nativeText) {
    try { await navigator.share({ text: nativeText, url: text }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  if (navigator.share && !nativeText) {
    // Round 12: attach the PNG card when the platform can share files.
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); done(); }
  catch (e) { window.prompt('Copy your result:', text); }
}

/* Round 12: a 1080x1080 PNG result card, drawn on a canvas.
 * SPOILER-FREE by design. It shows the number, the hook line, %, band, tries
 * and streak, but never the color's name, the player's mix color, the
 * official color or a recipe,
 * so a friend who hasn't played yet can't read the answer off the image. */
function drawShareCard(day) {
  const rec = store.data.days[day];
  if (!rec) return null;
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
  x.fillStyle = '#7a7264'; x.font = `500 30px ${sans}`;
  x.fillText('ngtrooper.github.io/mixology', S / 2, 990);
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
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  flashLabel(btn, 'Saved ✓');
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
function renderAll() {
  if (!round) return;
  const daily = round.mode === 'daily';
  $('color-name').textContent = titleCase(round.color.name);
  $('prompt-kicker').textContent = daily ? "Today's color is called" : 'Practice color';
  $('prompt-sub').textContent = daily
    ? 'How well do you know your colors?'
    : 'Free round — the reveal is instant, the streak is safe.';
  $('practice-bar').style.display = daily ? 'none' : 'block';
  $('btn-practice').textContent = daily ? 'Practice' : '← Daily';
  $('day-label').textContent = daily
    ? [dayTag(round.day) ? `MIXOLOGY ${dayTag(round.day)}` : 'MIXOLOGY', dateForDay(round.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })].join(' · ')
    : 'Practice mode';
  const st = liveStreaks();
  $('streak-display').innerHTML = st.streak > 0
    ? `<span class="flame" aria-hidden="true">🔥</span> Streak ${Number(st.streak)}` + (st.parStreak > 0 ? ` · <span title="Days in a row at ${E.PAR_PCT}%+">Par streak ${Number(st.parStreak)}</span>` : '')
    : '';
  const stale = daily && round.day !== DAY;
  if (stale && !round.finished) $('prompt-sub').textContent = "A new day's color is out — finish this one, then play today's.";
  $('btn-today').style.display = stale && round.finished ? 'block' : 'none';

  const hex = mixHex();
  $('pot-surface').style.background = hex;

  for (const b of BUCKET_KEYS) {
    $(BUCKET_EL[b]).classList.toggle('sel', selectedBucket === b);
    $(BUCKET_EL[b]).setAttribute('aria-pressed', String(selectedBucket === b)); // round 26
  }
  for (const t of Object.keys(TOOLS)) {
    $('tool-' + t).classList.toggle('sel', selectedTool === t);
    $('tool-' + t).setAttribute('aria-pressed', String(selectedTool === t));
  }
  { // round 26: the pot says what a press will do (the selected pigment and tool, which are already visible)
    const pn = { r: 'red', y: 'yellow', b: 'blue', k: 'black', w: 'white' }[selectedBucket] || 'paint';
    $('pot').setAttribute('aria-label', round.finished ? 'Pot (round complete)'
      : selectedTool === 'pour' ? `Pour ${pn} into the pot (hold to keep pouring)` : `Add one drop of ${pn} to the pot`);
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
      ? `Attempt ${round.attempts.length} sealed: <b>${last.pct}% accuracy</b>`
      : 'Dose the pot, then seal an attempt. Two per round — your best one counts.';

  const sealBtn = $('btn-seal');
  sealBtn.disabled = round.finished || round.attempts.length >= MAX_ATTEMPTS;
  sealBtn.classList.toggle('done', !!round.finished); // round 31: calm finished state
  sealBtn.textContent = round.finished ? 'Round complete ✓'
    : round.attempts.length === MAX_ATTEMPTS - 1 ? `Seal final attempt` : `Seal attempt ${round.attempts.length + 1}`;

  const locked = round.finished;
  for (const id of ['btn-undo', 'btn-reset']) $(id).disabled = locked;
  $('stage').classList.toggle('locked', locked);

  if (round.finished) {
    const fin = scored;
    $('reveal').style.display = 'block';
    $('reveal-official').style.background = round.color.hex;
    $('reveal-mine').style.background = fin.hex;
    $('reveal-pct').textContent = fin.pct + '%';
    $('reveal-band').textContent = E.bandForDeltaE(fin.de);
    $('reveal-de').textContent = `accuracy · perceptual distance ΔE ${fin.de} from the official ${titleCase(round.color.name)}`;
    $('reveal-recipes').innerHTML = recipesHTML(round.color, fin);
    $('btn-next-practice').style.display = round.mode === 'practice' ? 'block' : 'none';
    $('reveal-actions').style.display = round.mode === 'daily' ? 'flex' : 'none';
    $('card-row').style.display = round.mode === 'daily' ? 'block' : 'none';
    renderNextCountdown();
  } else {
    $('reveal').style.display = 'none';
    $('reveal-recipes').innerHTML = '';
  }
}

/* The attempt this round is scored on (saved day record wins for daily). */
function finalOfRound() {
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
  const leg = keys.map(k => `<span><i style="background:${PIGMENT_HEX[k]}"></i>${k.toUpperCase()} ${c[k] >= 9.95 ? Math.round(c[k]) : c[k].toFixed(1)}%</span>`).join('');
  return `<div class="rrow"><div class="rl">${label}${sub ? `<b>${sub}</b>` : ''}</div><div class="rbar" role="img" aria-label="${label}: ${keys.map(k => PIG_NAMES[k] + ' ' + Math.round(c[k]) + '%').join(', ')}">${bar}</div><div class="rleg">${leg}</div></div>`;
}
function recipesHTML(color, att) {
  if (!color || !color.recipe) return '';
  const best = E.accuracyFromDeltaE(color.de);
  return recipeRowHTML('Recipe', `best ${best}%`, color.recipe) +
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
    const untouched = !round.attempts.length && !round.undo.length;
    if (round.finished || untouched) { stopPour(); initDaily(); return; }
  }
  renderAll();
}
setInterval(() => { checkDayRollover(); renderNextCountdown(); }, 20000);
/* Round 19: "Next color in 3h 12m" under a finished daily reveal. It counts
 * down to local midnight, the same boundary dayNumber() uses. */
function untilNextColor(now) {
  const ms = dateForDay(DAY + 1) - (now || new Date());
  const m = Math.max(0, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${Math.max(1, m)}m`;
}
function renderNextCountdown() {
  const el = $('reveal-next'); if (!el) return;
  const show = round && round.finished && round.mode === 'daily' && round.day === DAY;
  el.style.display = show ? 'block' : 'none';
  if (show) el.textContent = `Next color in ${untilNextColor()}`;
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
  setCalTab('cal');
  openOverlay('cal-overlay');
}
function closeCalendar() { closeOverlay('cal-overlay'); }

/* Round 16: Stats tab inside the calendar overlay (no counts on the main
 * screen; design lock). Everything is computed from local day records. */
let calTab = 'cal';
function setCalTab(t) {
  calTab = t;
  for (const id of ['cal-head', 'cal-week', 'cal-grid', 'cal-detail']) $(id).style.display = t === 'cal' ? '' : 'none';
  $('cal-stats').style.display = t === 'stats' ? 'block' : 'none';
  $('tab-cal').setAttribute('aria-selected', String(t === 'cal'));
  $('tab-stats').setAttribute('aria-selected', String(t === 'stats'));
  if (t === 'stats') renderStats();
}
/* Round 29: "Last 14 days" sparkline. Each played day is a dot at its %,
 * missed days are gaps, and a dashed line marks par. Local data only. */
function recentFormSVG() {
  const N = 14, W = 300, H = 78, P = 8, days = store.data.days || {};
  const pts = [];
  for (let i = 0; i < N; i++) { const d = DAY - (N - 1) + i, r = days[d]; if (r && Number.isFinite(Number(r.pct))) pts.push({ i, pct: Number(r.pct) }); }
  if (pts.length < 2) return '';
  const lo = Math.min(40, Math.floor(Math.min(...pts.map(p => p.pct)) / 10) * 10); // zoom to where scores live
  const x = i => P + i * (W - 2 * P) / (N - 1), y = v => H - P - ((Math.max(lo, Math.min(100, v)) - lo) / (100 - lo)) * (H - 2 * P);
  let path = '';
  pts.forEach((p, k) => { path += (k && pts[k - 1].i === p.i - 1 ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.pct).toFixed(1); });
  // round 35: each dot (with a bigger invisible hit area) opens that day in the Calendar tab
  const dots = pts.map(p => `<g class="sp-dot" data-day="${DAY - (N - 1) + p.i}"><circle cx="${x(p.i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="11" class="hit"/><circle cx="${x(p.i).toFixed(1)}" cy="${y(p.pct).toFixed(1)}" r="3.2" class="${p.pct >= E.PAR_PCT ? 'par' : ''}"/></g>`).join('');
  return `<div class="st-h">Last 14 days</div><svg class="st-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scores over the last 14 days: ${pts.map(p => p.pct + '%').join(', ')}">` +
    `<line x1="${P}" x2="${W - P}" y1="${y(E.PAR_PCT).toFixed(1)}" y2="${y(E.PAR_PCT).toFixed(1)}" class="parline"/>` +
    `<text x="${W - P}" y="${(y(E.PAR_PCT) - 3).toFixed(1)}" text-anchor="end">par</text>` +
    `<path d="${path}"/>${dots}</svg>`;
}
function renderStats() {
  const s = E.computeStats(store.data.days), live = liveStreaks();
  const tile = (v, l) => `<div class="st-tile"><b>${v}</b><span>${l}</span></div>`;
  const max = Math.max(1, ...s.dist.map(d => d.n));
  const bestLabel = s.best ? `${s.best.pct}%` : '—';
  $('cal-stats').innerHTML = s.played === 0
    ? `<p class="st-empty">No finished days yet. Your stats appear after your first daily round.</p>`
    : `<div class="st-grid">${tile(s.played, 'played')}${tile(s.avg + '%', 'average')}${tile(s.parRate + '%', `at par (${E.PAR_PCT}%+)`)}${tile(bestLabel, 'best')}</div>` +
      `<div class="st-grid trio">${tile('🔥 ' + live.streak, 'current streak')}${tile(Math.max(s.longestStreak, live.streak), 'longest streak')}${tile(live.parStreak, `par streak (${E.PAR_PCT}%+)`)}</div>` +
      recentFormSVG() +
      `<div class="st-h">Score spread</div><div class="st-dist" role="list">` +
      s.dist.map(d => `<div class="st-row" role="listitem" aria-label="${d.label}%: ${d.n}"><span>${d.label}</span><i style="width:${Math.max(d.n ? 8 : 0, 100 * d.n / max)}%"></i><em>${d.n}</em></div>`).join('') +
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
  if (!ov.classList.contains('open')) overlayReturn[id] = document.activeElement;
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
    let sw = '', pct = '', ink = '', name = '';
    if (rec && rec.attempts && rec.attempts.length) {
      const best = bestAttempt(rec.attempts);
      cls += ' played' + (best.pct >= E.PAR_PCT ? ' par' : '');
      sw = `style="background:${best.hex}"`;
      pct = best.pct + '%';
      ink = inkFor(best.hex);
      name = rec.name || '';
    } else if (day > DAY || day < 1) cls += ' future';
    else if (first != null && day >= first && day < DAY) cls += ' missed';
    else if (day < DAY) cls += ' before';
    if (day === DAY) cls += ' today';
    cell.className = cls;
    if (cls.includes(' future')) cell.disabled = true; // round 21: nothing to show, so not focusable
    cell.setAttribute('aria-label', new Date(y, m, dd).toDateString() + (pct ? `, ${name}, best ${pct}` : ''));
    cell.innerHTML = `<span class="cd-n">${dd}</span><span class="cd-sw ${ink}" ${sw}>${pct}</span>` +
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
  if (rec && rec.attempts && rec.attempts.length) {
    const best = bestAttempt(rec.attempts);
    const official = BANK_BY_NAME.get(rec.name) || colorForDay(day);
    el.innerHTML = `<div class="cdt-title">${dayTag(day) ? dayTag(day) + ' · ' : ''}“${escapeHtml(titleCase(rec.name))}”</div>` +
      `<div class="cdt-sub">${escapeHtml(when)} · best ${best.pct}% · ${E.bandForDeltaE(best.de)}</div>` +
      `<div class="cdt-row"><span class="cdt-sw"><i style="background:${official.hex}"></i>Official</span>` +
      rec.attempts.map((a, i) => `<span class="cdt-sw${a === best ? ' best' : ''}"><i style="background:${a.hex}"></i>Try ${i + 1}: <b>${a.pct}%</b></span>`).join('') +
      `</div>` + recipesHTML(official, scoredAttempt(rec));
  } else if (day === DAY) {
    el.innerHTML = `<div class="cdt-title">Today${dayTag(day) ? ' · ' + dayTag(day) : ''}</div><div class="cdt-sub">${escapeHtml(when)} · not played yet — today's color is waiting.</div>`;
  } else if (day < DAY && day >= 1) {
    el.innerHTML = `<div class="cdt-title">${dayTag(day) ? dayTag(day) + ' · ' : ''}missed</div><div class="cdt-sub">${escapeHtml(when)} · the color was “${escapeHtml(titleCase(colorForDay(day).name))}”.</div>`;
  } else {
    el.innerHTML = '';
  }
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
  if (rec) {
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
      round.pot = wip.pot || freshPot();
      // Round 9 migration: a WIP saved under the 3-attempt rules may
      // already hold 2 sealed attempts — that is a complete round now,
      // so finish it (best of the attempts made counts; nothing lost).
      if (round.attempts.length >= MAX_ATTEMPTS) finish();
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
document.querySelectorAll('.tool[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => {
    stopPour();
    if (selectedTool !== btn.dataset.tool) { sfx.pick(); buzz(6); }
    selectedTool = btn.dataset.tool; renderAll();
  });
});
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
$('tab-cal').addEventListener('click', () => setCalTab('cal'));
$('tab-stats').addEventListener('click', () => setCalTab('stats'));
$('cal-stats').addEventListener('click', e => {
  const dot = e.target.closest && e.target.closest('.sp-dot'); if (!dot) return;
  const day = Number(dot.dataset.day); if (!Number.isFinite(day)) return;
  const d = dateForDay(day); calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  setCalTab('cal'); renderCalendar(); showCalDetail(day);
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
$('btn-tips-close').addEventListener('click', closeTips);
$('tips-overlay').addEventListener('click', e => { if (e.target === $('tips-overlay')) closeTips(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeTips(); closeCalendar(); closeWelcome(); } });
/* Round 14: first-visit welcome. Shown once per device, only to someone
 * with no saved days. The flag lives in its own key so the save format
 * (misnomer.save.v1) is untouched. */
const WELCOME_KEY = 'mixology.welcomed.v1';
function closeWelcome() {
  if (!$('welcome-overlay').classList.contains('open')) return;
  closeOverlay('welcome-overlay');
  try { localStorage.setItem(WELCOME_KEY, '1'); } catch (e) { /* private mode */ }
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
  const file = navigator.canShare ? await shareCardFile(day) : null;
  doShare(btn, shareText(), 'Copied ✓', file);
});
$('btn-card').addEventListener('click', ev => saveShareCard(ev.currentTarget));
$('btn-duel').addEventListener('click', ev => {
  const day = round && round.mode === 'daily' ? round.day : DAY;
  const rec = store.data.days[day];
  if (!rec) return;
  const url = duelUrlFor(scoredAttempt(rec), day);
  // Round 36: a native share sheet gets a one-line challenge (never the color's name).
  // The clipboard fallback still copies just the link, as the button says.
  const line = `Beat my ${rec.pct}% on Mixology ${dayTag(day) || shortDate(day)}?`;
  doShare(ev.currentTarget, url, 'Link copied ✓', null, line);
});
$('btn-today').addEventListener('click', () => { initDaily(); window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' }); });
$('btn-next-practice').addEventListener('click', startPractice);
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

initDaily();

/* ---------------- debug / playtest handle --------------------------------- */
window.MISNOMER = {
  drawShareCard,
  version: '1.10.4',
  get today() { return { day: DAY, name: todayColor.name }; },
  colorForDay: day => colorForDay(day).name,
  checkDayRollover, parseDuel, openCalendar, closeCalendar, MAX_ATTEMPTS,
  state() {
    return JSON.parse(JSON.stringify({
      mode: round.mode, finished: round.finished, colorName: round.color.name,
      targetHex: round.color.hex, // debug only — never rendered pre-reveal in the UI
      pot: round.pot, attempts: round.attempts,
      selectedBucket, selectedTool,
      day: round.day, streak: liveStreaks().streak, parStreak: liveStreaks().parStreak
    }));
  },
  selectBucket(b) { selectedBucket = b; renderAll(); },
  selectTool(t) { selectedTool = t; renderAll(); },
  dose, undo, resetPot, seal, finish,
  startPractice, exitPractice,
  newPractice: startPractice,
  shareText, maybeWelcome, WELCOME_KEY, untilNextColor, titleCase,
  engine: E, bank: BANK, pool: POOL
};
