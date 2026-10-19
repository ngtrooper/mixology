/* Misnomer — game controller (DOM wiring, state, saves, duels, share).
 * Pure color logic lives in engine.js; data in colors.js.
 * Exposes window.MISNOMER for inspection/automated playtests. */
'use strict';

const E = window.MisnomerEngine;
const BANK = window.MISNOMER_COLORS;
const POOL = BANK.filter(c => c.de <= 12); // daily-eligible (solver ΔE <= 12)

const DAY = E.dayNumber(new Date()) + 1; // display/share day number (#1 = 2025-01-01)
const todayIdx = E.pickDailyIndex(DAY, POOL.length);
const todayColor = POOL[todayIdx];

/* Two tools only: Dropper (one drop per click) and Pour Bucket (press and
 * hold to pour). Their dosages appear ONLY in the Tips overlay.
 * Round 6 — THE PERCENTAGE POT: the pot state is a composition
 * {r, y, b, k, w} of percentages summing to exactly 100 (fresh pot is
 * 100% white). One drop = 1 unit = 1% of the pot; dosing displaces the
 * rest proportionally (engine.addUnits). There is no cap and no refusal:
 * the pot can never overflow and never gets stuck. */
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
  round = { mode, color, pot: freshPot(), undo: [], attempts: [], finished: false };
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
let pourTimer = null;
function spawnRipple() {
  if (REDUCED_MOTION) return;
  const surface = $('pot-surface');
  if (!surface) return;
  const r = document.createElement('div');
  r.className = 'ripple';
  surface.appendChild(r);
  try {
    const a = r.animate([
      { transform: 'translate(-50%,-50%) scale(.2)', opacity: .8 },
      { transform: 'translate(-50%,-50%) scale(1.05)', opacity: 0 }
    ], { duration: 480, easing: 'ease-out' });
    a.onfinish = () => r.remove();
  } catch (e) { /* animation is decorative */ }
  setTimeout(() => r.remove(), 750);
}
function dropAnim() {
  if (REDUCED_MOTION) return;
  const d = $('droplet'), stage = $('stage');
  if (!d || !stage) return;
  d.style.background = PIGMENT_HEX[selectedBucket];
  d.style.display = 'block';
  const fall = Math.max(40, stage.clientHeight * 0.26);
  try {
    if (d._anim) d._anim.cancel();
    const a = d.animate([
      { transform: `translate(-50%,-12px) rotate(45deg)`, opacity: 0 },
      { transform: `translate(-50%,${fall * 0.35}px) rotate(45deg)`, opacity: 1, offset: .25 },
      { transform: `translate(-50%,${fall}px) rotate(45deg)`, opacity: 1 }
    ], { duration: 330, easing: 'cubic-bezier(.5,0,.9,.6)' });
    d._anim = a;
    a.onfinish = () => { d.style.display = 'none'; spawnRipple(); };
  } catch (e) { d.style.display = 'none'; }
}
function startPour() {
  if (!round || round.finished || pourTimer) return;
  beginGesture(); // the whole hold is ONE undo step
  applyUnit();
  dropAnim();
  $('stage').classList.add('pouring');
  $('pour-stream').style.background = PIGMENT_HEX[selectedBucket];
  let ticks = 0;
  pourTimer = setInterval(() => {
    if (!round || round.finished) { stopPour(); return; }
    applyUnit(true); // no cap exists — a pour can only be stopped by release
    if (++ticks % 3 === 0) spawnRipple();
  }, 1000 / POUR_RATE);
}
function stopPour() {
  if (pourTimer) { clearInterval(pourTimer); pourTimer = null; }
  endGesture();
  const stage = $('stage');
  if (stage) stage.classList.remove('pouring');
}

function seal() {
  stopPour();
  if (!round || round.finished || round.attempts.length >= 3) return null;
  const hex = mixHex();
  const de = E.deltaE2000(E.hexToLab(hex), targetLab());
  const att = {
    comp: { ...round.pot }, hex,
    pct: E.accuracyFromDeltaE(de), de: Math.round(de * 10) / 10
  };
  round.attempts.push(att);
  sfx.seal();
  if (round.attempts.length >= 3) finish();
  else { renderAll(); persistWip(); }
  return att;
}

function finish() {
  stopPour();
  if (!round || round.finished || !round.attempts.length) return;
  round.finished = true;
  const final = round.attempts[round.attempts.length - 1];
  if (round.mode === 'daily') {
    const s = store.data;
    const already = !!s.days[DAY];
    s.days[DAY] = {
      date: E.dateKey(new Date()), name: round.color.name,
      attempts: round.attempts, pct: final.pct, de: final.de,
      band: E.bandForDeltaE(final.de), hex: final.hex
    };
    if (!already) {
      if (s.lastDay === DAY - 1) {
        s.streak += 1;
        s.parStreak = final.pct >= 85 ? s.parStreak + 1 : 0;
      } else if (s.lastDay !== DAY) {
        s.streak = 1;
        s.parStreak = final.pct >= 85 ? 1 : 0;
      }
      s.lastDay = DAY;
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
}

function persistWip() {
  if (round && round.mode === 'daily' && !round.finished) {
    store.data.wip = { day: DAY, attempts: round.attempts, pot: { ...round.pot } };
    store.persistSoon();
  }
}

/* ---------------- duel links ------------------------------------------- */
function duelUrlFor(final) {
  // Round 6: q carries the % composition as integers of %x10, base36,
  // in r.y.b.k.w order (e.g. 40% red -> 400 -> 'b4').
  const q = [final.comp.r, final.comp.y, final.comp.b, final.comp.k, final.comp.w]
    .map(v => Math.round(v * 10).toString(36)).join('.');
  const base = location.href.split(/[?#]/)[0];
  return `${base}?d=${DAY}&m=${final.hex.slice(1)}&p=${final.pct}&q=${q}`;
}
function parseDuel() {
  const p = new URLSearchParams(location.search);
  if (!p.has('d') || !p.has('m') || !p.has('p')) return null;
  const parts = (p.get('q') || '').split('.').map(s => parseInt(s, 36) || 0);
  const pct10 = i => (parts[i] || 0) / 10;
  return {
    day: parseInt(p.get('d'), 10),
    hex: '#' + (p.get('m') || 'FFFFFF').toUpperCase(),
    pct: parseInt(p.get('p'), 10),
    comp: { r: pct10(0), y: pct10(1), b: pct10(2), k: pct10(3), w: parts.length > 4 ? pct10(4) : 100 }
  };
}
const incomingDuel = parseDuel();
function colorForDay(day) {
  return POOL[E.pickDailyIndex(day, POOL.length)];
}
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
  } else if (incomingDuel.day === DAY) {
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
function shareText() {
  const rec = store.data.days[DAY];
  if (!rec) return '';
  const final = rec.attempts[rec.attempts.length - 1];
  const s = store.data;
  const lines = [
    `🎨 MIXOLOGY #${DAY} — "${rec.name.toUpperCase()}"`,
    'My mix: ██████',
    `${rec.pct}% accuracy — ${rec.band} · Attempts: ${rec.attempts.map(a => a.pct + '%').join(' → ')}`,
    `🔥 Streak ${s.streak}` + (s.parStreak >= 2 ? ` · Par streak ${s.parStreak}` : ''),
    duelUrlFor(final)
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
    ? `MIXOLOGY #${DAY} · ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`
    : 'Practice mode';
  const s = store.data;
  $('streak-display').textContent = s.streak > 0
    ? `🔥 Streak ${s.streak}` + (s.parStreak > 0 ? ` · Par streak ${s.parStreak} (85%+)` : '')
    : '';

  const hex = mixHex();
  $('pot-surface').style.background = hex;

  for (const b of BUCKET_KEYS) {
    $(BUCKET_EL[b]).classList.toggle('sel', selectedBucket === b);
  }
  for (const t of Object.keys(TOOLS)) $('tool-' + t).classList.toggle('sel', selectedTool === t);
  $('toolbar-current').textContent = selectedTool === 'dropper' ? '💧 Dropper' : '🪣 Pour Bucket';

  for (let i = 0; i < 3; i++) {
    const slot = $('slot-' + i), att = round.attempts[i];
    if (att) {
      slot.className = 'attempt-slot filled';
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
      : 'Dose the pot, then seal an attempt. Three per round.';

  const sealBtn = $('btn-seal'), finBtn = $('btn-finish');
  sealBtn.disabled = round.finished || round.attempts.length >= 3;
  sealBtn.textContent = round.finished ? 'Round complete' : `Seal attempt ${round.attempts.length + 1}`;
  finBtn.style.display = (!round.finished && round.attempts.length >= 1) ? 'block' : 'none';
  finBtn.textContent = `Lock it in (attempt ${round.attempts.length} counts)`;

  const locked = round.finished;
  for (const id of ['btn-undo', 'btn-reset']) $(id).disabled = locked;
  $('stage').classList.toggle('locked', locked);

  if (round.finished) {
    const fin = round.attempts[round.attempts.length - 1];
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
    const lastAtt = rec.attempts[rec.attempts.length - 1];
    round = {
      mode: 'daily', color: todayColor, finished: true,
      pot: lastAtt.comp ? { ...lastAtt.comp } : freshPot(),
      undo: [], attempts: rec.attempts
    };
    renderAll();
  } else {
    newRound('daily', todayColor);
    const wip = store.data.wip;
    if (wip && wip.day === DAY) {
      round.attempts = wip.attempts || [];
      round.pot = wip.pot || freshPot();
      renderAll();
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
$('btn-tips-close').addEventListener('click', closeTips);
$('tips-overlay').addEventListener('click', e => { if (e.target === $('tips-overlay')) closeTips(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTips(); });
$('btn-undo').addEventListener('click', undo);
$('btn-reset').addEventListener('click', resetPot);
$('btn-seal').addEventListener('click', () => seal());
$('btn-finish').addEventListener('click', () => finish());
$('btn-share').addEventListener('click', ev => doShare(ev.currentTarget, shareText(), 'Copied ✓'));
$('btn-duel').addEventListener('click', ev => {
  const rec = store.data.days[DAY];
  if (rec) doShare(ev.currentTarget, duelUrlFor(rec.attempts[rec.attempts.length - 1]), 'Link copied ✓');
});
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
  version: '1.5.0',
  today: { day: DAY, name: todayColor.name },
  state() {
    return JSON.parse(JSON.stringify({
      mode: round.mode, finished: round.finished, colorName: round.color.name,
      targetHex: round.color.hex, // debug only — never rendered pre-reveal in the UI
      pot: round.pot, attempts: round.attempts,
      selectedBucket, selectedTool,
      streak: store.data.streak, parStreak: store.data.parStreak
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
