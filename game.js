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
  reveal() { [523, 659, 784].forEach((f, i) => beep(f, 0.16, 'sine', 0.05, i * 0.09)); }
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
function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* optional */ } }
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
  sfx.seal();
  if (round.attempts.length >= MAX_ATTEMPTS) finish();
  else { renderAll(); persistWip(); }
  return att;
}

function finish() {
  stopPour();
  if (!round || round.finished || !round.attempts.length) return;
  round.finished = true;
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
  sfx.reveal();
  renderAll();
  maybeShowDuel();
  scrollRevealIntoView();
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
  if (mine) {
    card.innerHTML =
      `<b>Duel — #${incomingDuel.day} “${escapeHtml(theirColor.name)}”</b>` +
      `<div class="swatches">` +
      `<div class="dsw"><div style="background:${incomingDuel.hex}"></div>Them · ${incomingDuel.pct}%</div>` +
      `<div class="dsw"><div style="background:${mine.hex}"></div>You · ${mine.pct}%</div></div>` +
      `<div style="margin-top:6px">${mine.pct > incomingDuel.pct ? 'You take this one. 🏆'
        : mine.pct < incomingDuel.pct ? 'They take this one — rematch tomorrow.'
        : 'Dead heat. 🤝'}</div>`;
  } else if (incomingDuel.day >= DAY) { // today (or a friend a timezone ahead) — never spoil
    card.innerHTML = `<b>A friend has already mixed today's color.</b>` +
      `<div>Finish your round to see how you stack up — no spoilers until then.</div>`;
  } else {
    card.innerHTML =
      `<b>A duel from #${incomingDuel.day} — “${escapeHtml(theirColor.name)}”</b>` +
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
    `🎨 MIXOLOGY #${day} — "${rec.name.toUpperCase()}"`,
    'My mix: ██████',
    `${rec.pct}% accuracy — ${rec.band} · Tries: ${rec.attempts.map(a => a.pct + '%').join(' · ')}`,
    `🔥 Streak ${s.streak}` + (s.parStreak >= 2 ? ` · Par streak ${s.parStreak}` : ''),
    duelUrlFor(final, day)
  ];
  return lines.join('\n');
}
async function doShare(btn, text, okLabel) {
  const done = () => { const old = btn.textContent; btn.textContent = okLabel; setTimeout(() => { btn.textContent = old; }, 1600); };
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { /* fall through to copy */ }
  }
  try { await navigator.clipboard.writeText(text); done(); }
  catch (e) { window.prompt('Copy your result:', text); }
}

/* ---------------- rendering -------------------------------------------- */
const $ = id => document.getElementById(id);
function titleCase(s) { return s.replace(/\b\w/g, c => c.toUpperCase()); }
function renderAll() {
  if (!round) return;
  const daily = round.mode === 'daily';
  $('color-name').textContent = round.color.name;
  $('prompt-kicker').textContent = daily ? "Today's color is called" : 'Practice color';
  $('prompt-sub').textContent = daily
    ? 'Nobody shows you the color. Mix what the name means.'
    : 'Free round — the reveal is instant, the streak is safe.';
  $('practice-bar').style.display = daily ? 'none' : 'block';
  $('btn-practice').textContent = daily ? 'Practice' : '← Daily';
  $('day-label').textContent = daily
    ? `MIXOLOGY #${round.day} · ${dateForDay(round.day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
    : 'Practice mode';
  const st = liveStreaks();
  $('streak-display').textContent = st.streak > 0
    ? `🔥 Streak ${st.streak}` + (st.parStreak > 0 ? ` · Par streak ${st.parStreak} (${E.PAR_PCT}%+)` : '')
    : '';
  const stale = daily && round.day !== DAY;
  if (stale && !round.finished) $('prompt-sub').textContent = "A new day's color is out — finish this one, then play today's.";
  $('btn-today').style.display = stale && round.finished ? 'block' : 'none';

  const hex = mixHex();
  $('pot-surface').style.background = hex;

  for (const b of BUCKET_KEYS) {
    $(BUCKET_EL[b]).classList.toggle('sel', selectedBucket === b);
  }
  for (const t of Object.keys(TOOLS)) $('tool-' + t).classList.toggle('sel', selectedTool === t);
  $('toolbar-current').textContent = selectedTool === 'dropper' ? '💧 Dropper' : '🪣 Pour Bucket';
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
      slot.className = 'attempt-slot filled' + (scored === att ? ' best' : '');
      slot.innerHTML = `<div class="asw" style="background:${att.hex}"></div><div class="apct">${att.pct}%</div><div>attempt ${i + 1}</div>`;
    } else {
      slot.className = 'attempt-slot';
      slot.textContent = `Attempt ${i + 1}`;
    }
  }

  const last = round.attempts[round.attempts.length - 1];
  $('last-result').innerHTML = round.finished
    ? ''
    : last
      ? `Attempt ${round.attempts.length} sealed: <b>${last.pct}% accuracy</b>`
      : 'Dose the pot, then seal an attempt. Two per round — your best one counts.';

  const sealBtn = $('btn-seal');
  sealBtn.disabled = round.finished || round.attempts.length >= MAX_ATTEMPTS;
  sealBtn.textContent = round.finished ? 'Round complete'
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
    $('btn-next-practice').style.display = round.mode === 'practice' ? 'block' : 'none';
    $('reveal-actions').style.display = round.mode === 'daily' ? 'flex' : 'none';
  } else {
    $('reveal').style.display = 'none';
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
setInterval(checkDayRollover, 20000);
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
  $('cal-overlay').classList.add('open');
}
function closeCalendar() { $('cal-overlay').classList.remove('open'); }
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
    let sw = '', pct = '';
    if (rec && rec.attempts && rec.attempts.length) {
      const best = bestAttempt(rec.attempts);
      cls += ' played' + (best.pct >= E.PAR_PCT ? ' par' : '');
      sw = `style="background:${best.hex}"`;
      pct = best.pct + '%';
    } else if (day > DAY || day < 1) cls += ' future';
    else if (first != null && day >= first && day < DAY) cls += ' missed';
    else if (day < DAY) cls += ' before';
    if (day === DAY) cls += ' today';
    cell.className = cls;
    cell.setAttribute('aria-label', new Date(y, m, dd).toDateString() + (pct ? `, best ${pct}` : ''));
    cell.innerHTML = `<span class="cd-n">${dd}</span><span class="cd-sw" ${sw}></span><span class="cd-p">${pct}</span>`;
    if (!/future/.test(cls)) cell.addEventListener('click', () => showCalDetail(day));
    else cell.disabled = true;
    grid.appendChild(cell);
  }
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
    el.innerHTML = `<div class="cdt-title">#${day} · “${escapeHtml(titleCase(rec.name))}”</div>` +
      `<div class="cdt-sub">${escapeHtml(when)} · best ${best.pct}% · ${E.bandForDeltaE(best.de)}</div>` +
      `<div class="cdt-row"><span class="cdt-sw"><i style="background:${official.hex}"></i>Official</span>` +
      rec.attempts.map((a, i) => `<span class="cdt-sw${a === best ? ' best' : ''}"><i style="background:${a.hex}"></i>Try ${i + 1}: <b>${a.pct}%</b></span>`).join('') +
      `</div>`;
  } else if (day === DAY) {
    el.innerHTML = `<div class="cdt-title">Today · #${day}</div><div class="cdt-sub">${escapeHtml(when)} · not played yet — today's color is waiting.</div>`;
  } else if (day < DAY && day >= 1) {
    el.innerHTML = `<div class="cdt-title">#${day} · missed</div><div class="cdt-sub">${escapeHtml(when)} · the color was “${escapeHtml(titleCase(colorForDay(day).name))}”.</div>`;
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
  btn.addEventListener('click', () => { stopPour(); selectedBucket = btn.dataset.bucket; renderAll(); });
});
document.querySelectorAll('.tool[data-tool]').forEach(btn => {
  btn.addEventListener('click', () => { stopPour(); selectedTool = btn.dataset.tool; renderAll(); });
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
function closeTips() { $('tips-overlay').classList.remove('open'); }
$('btn-tips').addEventListener('click', () => $('tips-overlay').classList.add('open'));
$('btn-calendar').addEventListener('click', openCalendar);
$('btn-cal-close').addEventListener('click', closeCalendar);
$('cal-overlay').addEventListener('click', e => { if (e.target === $('cal-overlay')) closeCalendar(); });
$('btn-cal-prev').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); });
$('btn-cal-next').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); });
$('btn-tips-close').addEventListener('click', closeTips);
$('tips-overlay').addEventListener('click', e => { if (e.target === $('tips-overlay')) closeTips(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeTips(); closeCalendar(); } });
$('btn-undo').addEventListener('click', undo);
$('btn-reset').addEventListener('click', resetPot);
$('btn-seal').addEventListener('click', () => seal());
$('btn-share').addEventListener('click', ev => doShare(ev.currentTarget, shareText(), 'Copied ✓'));
$('btn-duel').addEventListener('click', ev => {
  const day = round && round.mode === 'daily' ? round.day : DAY;
  const rec = store.data.days[day];
  if (rec) doShare(ev.currentTarget, duelUrlFor(scoredAttempt(rec), day), 'Link copied ✓');
});
$('btn-today').addEventListener('click', () => { initDaily(); window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' }); });
$('btn-next-practice').addEventListener('click', startPractice);
$('btn-practice').addEventListener('click', () => {
  if (round && round.mode === 'practice') exitPractice(); else startPractice();
});
$('btn-mute').addEventListener('click', () => {
  store.data.muted = !store.data.muted;
  store.persistSoon();
  $('btn-mute').textContent = store.data.muted ? '🔇' : '🔊';
});
$('btn-mute').textContent = store.data.muted ? '🔇' : '🔊';

initDaily();

/* ---------------- debug / playtest handle --------------------------------- */
window.MISNOMER = {
  version: '1.7.0',
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
  shareText,
  engine: E, bank: BANK, pool: POOL
};
