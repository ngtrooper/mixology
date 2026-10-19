/* Misnomer engine — pure logic, no DOM. Loadable in browser and Node.
 *
 * MIXING MODEL — THE PERCENTAGE POT (round 6, producer's design)
 * --------------------------------------------------------------
 * The pot is ALWAYS 100% full. State is a composition vector
 * {r, y, b, k, w} of percentages summing to exactly 100 (fresh pot:
 * w = 100). A "drop" is 1 unit = 1% of the pot: dosing pigment P by n
 * units does P += n, then the whole vector is renormalized x100/(100+n)
 * — the added paint pushes the others down proportionally, so the total
 * never exceeds 100 and there is NO cap, no refusal, no overflow.
 * Color is a pure function of the composition (path independence: the
 * same % always renders the same hex, whatever order the drops came in).
 *
 * Why this replaced the drops-accumulation model (rounds 1-5): volume
 * lock-in. The old pot only ever grew, so past a few hundred drops each
 * new drop was a tiny share — recovery pours crawled (diagnosis,
 * tools/stuck-diagnosis-round5.md: mud pot needed 7.7 s of white pouring
 * to move ΔE 10; black pot 4.0 s) and at the per-pigment cap recovery
 * became IMPOSSIBLE (hard-stuck states). In the percentage pot every
 * unit moves a share by ~(100 - share)/100 regardless of history, so
 * response is uniform from any state: the same scenarios now recover
 * ΔE >= 10 within ~1 s of counter-pouring, and cap states are
 * unreachable by construction.
 *
 * % -> color mapping:
 * 1. Chroma C = r + y + b. Strength s = C / (C + 12 * (1 - C/100)) —
 *    s(0)=0, s(100)=1 exactly, so a 100% pigment IS its cube corner
 *    and 95% lands within ~ΔE 1 of it (the last 5% is the asymptote
 *    tax). Cube coordinates are s x shape(share), share = pigment/C,
 *    shape(x) = 1 - (1-x)^4: pair shares are boosted toward their
 *    pairwise corner (50/50 -> 0.94 of s), which is what lets the
 *    trilinear RYB cube render saturated greens/oranges/violets.
 *    Corners are hand-tuned to behave like school paint:
 *      blue + yellow -> GREEN, red + yellow -> orange,
 *      red + blue -> violet, red + yellow + blue -> muddy brown.
 * 2. Mud pull: balanced mixes (all three primaries present) are pulled
 *    toward the mud corner, scaled by balance x how much of the
 *    non-black pot is chroma (C/(C+w)) — white breaks mud fast, which
 *    is the mud-pot recovery path above.
 * 3. Black damper: kd = k / (k + 25 * (1 - k/100)) scales the color
 *    toward near-black — direct shade control (navy, charcoal) whose
 *    strength is share-based, so a chromatic pigment poured long
 *    enough always wins the pot back from black.
 * 4. White blend: the result blends toward white by
 *    0.6 * tw^1.0 * (1 - 0.85 * kd), where tw = w / (w + pigment).
 *    Small chromatic shares in white read as clear pastel tints
 *    (3% red -> ΔE ~7 from white).
 * 5. White dilution (round 7): white also DILUTES the cube
 *    coordinates themselves. dil = 1 - dilAmt * cfade(C), where
 *    twc = w / (w + C + k) is white's share of the whole pot,
 *    dilAmt ramps 0 -> 0.58 as twc goes 0.06 -> 0.55 and keeps
 *    growing by a 0.18 tail to 100% white (a mostly-white pot must
 *    keep answering white pours), and cfade(C) = clamp(C/15)
 *    fades the effect in only once the pot carries a real
 *    chromatic load (cfade reaches full at C = 11). Why: white
 *    has no cube coordinate, so
 *    before round 7 it acted ONLY through the capped blend (4) and
 *    the slow strength shrink — on a strong late mix, adding white
 *    "at the end" moved ΔE ~4 in a full second of pouring and
 *    ~0.2 per dropper tap (producer: "the color wasn't changing").
 *    Dilution makes white cut a loaded mix the way real white
 *    paint does — desaturating as it lightens — while cfade keeps
 *    whisper-light tints (C < 15) at full strength and the window
 *    keeps near-saturated pots (twc < 0.06) untouched, so 95%
 *    saturation still lands within ~ΔE 2 of full strength.
 *    Acceptance (round 7): from ANY composition, 1 s of white
 *    pouring moves ΔE >= 8 and 10 white dropper taps move ΔE >= 2;
 *    at ~74% white a mid-chroma mix reads pale (L* >= 75).
 * 6. ROUND 8 — TINT OVER BODY (supersedes 4 and 5). Notes 4-5
 *    whitened twice (dilution x blend), so pigment poured into white
 *    barely showed (2 s of red = 45% red rendered #F5CACC pale pink)
 *    and cfade made 9-11% red/blue get LIGHTER as pigment went in.
 *    Now the pigments-only part of the pot (r,y,b,k renormalized,
 *    white removed) renders a BODY with rules 1-3 (mud drive still
 *    sees the real white share, so white still breaks mud), and white
 *    acts once: an OKLab blend from white toward the body by
 *    t(p), p = pigment share, a cubic Hermite 0->1 with start slope
 *    TINT_C (r/y/b) / TINT_K (black), share-weighted, and end slope
 *    TINT_END. Body is independent of white and t is strictly
 *    increasing, so a single pigment into white is a monotonic walk
 *    (asserted in tests). 1 s pour from white: ΔE r 20.9 / y 15.0 /
 *    b 18.4 / k 24.7 (round 7: 11.1 / 11.4 / 8.0 / 25.6).
 *
 * SCORING
 * -------
 * accuracy = clamp(round(100 * max(0, 1 - (dE00/50)^1.25)), 0, 100),
 * where dE00 is CIEDE2000 in CIELAB. Monotonic decreasing in dE00.
 * Checkpoints: dE 2 -> 98 (>=97 as required), dE 5 -> 94, dE 10 -> 87,
 * dE 20 -> 68, dE 35 -> 36, dE 50+ -> 0. A good-but-imperfect mix
 * (dE 4-10) lands 87-96.
 */
'use strict';

const CUBE = {
  '000': [255, 255, 255], // white corner (no pigment)
  '100': [214, 40, 46],   // red
  '010': [255, 205, 0],   // yellow
  '001': [28, 64, 150],   // blue (ultramarine-leaning)
  '110': [247, 118, 18],  // red+yellow = orange
  '101': [122, 44, 148],  // red+blue = violet
  '011': [46, 164, 58],   // yellow+blue = GREEN (the make-or-break corner)
  '111': [52, 40, 34]     // all three = dark muddy brown
};
const BLACK_POINT = [10, 10, 12];

/* Percentage-pot tuning constants (see header). */
const STR_HALF = 12;      // strength curve half-point, in % of chroma
const SHARE_GAIN = 4;     // share shaping: 1 - (1 - share)^SHARE_GAIN
const BLACK_HALF = 25;    // black damper half-point, in % of black
const MUD_MAX = 0.9;      // max pull toward the mud corner
const MUD_START = 0.45;   // chroma/(chroma+white) where the mud pull starts
const TINT_C = 1.4;       // round 8: start slope of the tint curve for r/y/b (tinting strength)
const TINT_K = 2.0;       // round 8: start slope for black
const TINT_END = 1.0;     // round 8: end slope — how hard white answers on a loaded pot
/* Daily fairness (round 8): a color is daily-eligible only when its
 * solver-best recipe scores at least par. Single source of truth for
 * game.js, tools/solve-recipes.js and the colors.js header. */
const PAR_PCT = 85;
/* Round 65 (Franklin): live pot composition on the paint discs. Whole numbers
 * by largest-remainder rounding. Round 68: the pot never holds traces (see
 * snapTraces), so there is no "<1%" any more. Every paint that is in the pot
 * shows at least 1%, and the five numbers always add up to exactly 100. Pure
 * display helper; it never changes the pot. */
function displayPercents(comp) {
  const c = normalizeComp(comp), keys = ['r', 'y', 'b', 'k', 'w'];
  const fl = keys.map(k => Math.floor(c[k])), rem = keys.map((k, i) => c[k] - fl[i]);
  let left = 100 - fl.reduce((a, x) => a + x, 0);
  // a present paint is never shown as 0%
  keys.forEach((k, i) => { if (fl[i] === 0 && c[k] > 0) { fl[i] = 1; rem[i] = 0; left--; } });
  const order = keys.map((k, i) => i).sort((a, b) => rem[b] - rem[a] || a - b);
  for (const i of order) { if (left <= 0) break; if (rem[i] > 0) { fl[i]++; left--; } }
  while (left < 0) { // the forced 1%s are paid for by the biggest share
    const i = fl.indexOf(Math.max(...fl)); fl[i]--; left++;
  }
  const out = {};
  keys.forEach((k, i) => { out[k] = fl[i] + '%'; });
  return out;
}
/* Round 62: Pour Bucket ramp. A press starts at POUR_RATE_START units/s (fine
 * control for short taps), then from POUR_RAMP_FROM s to POUR_RAMP_TO s the
 * rate climbs linearly to POUR_RATE_MAX and holds there. Measured from a fresh
 * white pot with one pigment: 90% in about 3.0 s and 95% in about 3.8 s (was
 * 7.7 s and 10 s at a flat 30/s). Time to units only: the mixing model, the
 * solver and the pool work on compositions and are untouched. */
const POUR_RATE_START = 30, POUR_RATE_MAX = 90, POUR_RAMP_FROM = 0.3, POUR_RAMP_TO = 1.0;
/** Units poured after holding for `sec` seconds, not counting the first unit
 *  that lands on press. This is the integral of the rate curve. */
function pourUnitsAt(sec) {
  const t = Math.max(0, Number(sec) || 0), a = POUR_RAMP_FROM, b = POUR_RAMP_TO, r0 = POUR_RATE_START, r1 = POUR_RATE_MAX;
  if (t <= a) return r0 * t;
  if (t <= b) { const x = t - a; return r0 * a + r0 * x + (r1 - r0) / (b - a) * x * x / 2; }
  return r0 * a + (r0 + r1) / 2 * (b - a) + r1 * (t - b);
}
/** Instantaneous pour rate (units/s) after `sec` seconds held. */
function pourRateAt(sec) {
  const t = Math.max(0, Number(sec) || 0);
  if (t <= POUR_RAMP_FROM) return POUR_RATE_START;
  if (t >= POUR_RAMP_TO) return POUR_RATE_MAX;
  return POUR_RATE_START + (POUR_RATE_MAX - POUR_RATE_START) * (t - POUR_RAMP_FROM) / (POUR_RAMP_TO - POUR_RAMP_FROM);
}
/* Public numbering (round 10, display only): internal day #656
 * (Sun 2026-10-18) is "Mixology #1". Internal day indices, the schedule,
 * saves, streaks and duel links (d=) are untouched. Days before launch
 * have no public number (null) — show the date only. */
const LAUNCH_DAY = 656;
function publicNumber(day) {
  const n = day - (LAUNCH_DAY - 1);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/* Round 16: stats from the saved day records ({ [internalDay]: {pct,...} }).
 * Pure and read-only, so it never changes the save. */
const STAT_BUCKETS = [
  { label: '95+', min: 95 }, { label: '85–94', min: 85 }, { label: '70–84', min: 70 },
  { label: '50–69', min: 50 }, { label: '<50', min: -Infinity }
];
function computeStats(days) {
  const recs = Object.keys(days || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b)
    .map(d => ({ day: d, pct: Number(days[d] && days[d].pct) })).filter(r => Number.isFinite(r.pct));
  const played = recs.length;
  const dist = STAT_BUCKETS.map(b => ({ label: b.label, n: 0 }));
  let sum = 0, par = 0, best = null, longest = 0, run = 0, prev = null;
  for (const r of recs) {
    sum += r.pct; if (r.pct >= PAR_PCT) par++;
    if (!best || r.pct > best.pct) best = r;
    dist[STAT_BUCKETS.findIndex(b => r.pct >= b.min)].n++;
    run = prev !== null && r.day === prev + 1 ? run + 1 : 1; prev = r.day;
    if (run > longest) longest = run;
  }
  return {
    played, avg: played ? Math.round(sum / played) : null,
    parRate: played ? Math.round(100 * par / played) : null,
    best: best ? { day: best.day, pct: best.pct } : null,
    longestStreak: longest, dist
  };
}

const COMP_KEYS = ['r', 'y', 'b', 'k', 'w'];
/* Round 83 (Franklin): the pot STARTS EMPTY. It used to start as 100% white
 * paint, and that white was real paint: it showed on the white disc, tinted
 * the mix and counted in the score, so a player who never meant to use
 * white had to pour it out. Now a fresh pot holds nothing (all zeros); the
 * first drop makes it 100% that paint, and from there dosing is the same
 * displacement model as always (renormalize to 100). Taking out the only
 * paint left empties the pot again. White is just a paint you add on purpose. */
const FRESH_COMP = { r: 0, y: 0, b: 0, k: 0, w: 0 };
const OLD_WHITE_START = { r: 0, y: 0, b: 0, k: 0, w: 100 }; // the pre-round-83 fresh pot (save migration only)
function isEmptyComp(comp) { return !comp || COMP_KEYS.every(k => !((Number(comp[k]) || 0) > 0)); }

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Any composition-like object -> percentages summing to exactly 100. */
function normalizeComp(comp) {
  const out = {};
  let total = 0;
  for (const key of COMP_KEYS) {
    out[key] = Math.max(0, (comp && comp[key]) || 0);
    total += out[key];
  }
  if (total <= 0) return { ...FRESH_COMP };
  const f = 100 / total;
  for (const key of COMP_KEYS) out[key] *= f;
  return out;
}

/* Round 68 (Franklin): no lingering traces. Diluting a paint only ever shrinks
 * it geometrically, so it used to hang at "<1%" for hundreds of units and never
 * reach 0. After every dose, any paint under TRACE_PCT of the pot is set to 0
 * and the rest renormalized, so the mix and the disc numbers agree. The solver
 * (tools/solve-recipes.js) works under the same rule, so every stored recipe
 * has each paint at 0 or at least TRACE_PCT and is reachable in play. */
const TRACE_PCT = 0.5;
function snapTraces(comp) {
  const out = normalizeComp(comp);
  let snapped = false;
  for (const key of COMP_KEYS) if (out[key] > 0 && out[key] < TRACE_PCT) { out[key] = 0; snapped = true; }
  return snapped ? normalizeComp(out) : out;
}

/**
 * Dose `key` by n units (n may be fractional or negative): the component
 * grows by n, then the whole pot renormalizes back to 100%. The added
 * paint displaces the rest proportionally; a negative n takes that paint
 * out (round 68 remove control) and the rest grows back. Traces snap to 0
 * (snapTraces). Pure; returns a new vector.
 */
function addUnits(comp, key, n) {
  const out = normalizeComp(comp);
  // round 83: removing from a pot whose only paint is `key` empties it
  if (n < 0 && COMP_KEYS.every(q => q === key || !(out[q] > 0))) return { ...FRESH_COMP };
  out[key] = Math.max(0, out[key] + n);
  return snapTraces(out);
}
/** Round 68: take `n` units of `key` out of the pot (the remove control). */
function removeUnits(comp, key, n) { return addUnits(comp, key, -Math.abs(n)); }

/** composition {r,y,b,k,w} (%) -> [R,G,B] 0..255 floats
 *
 * Round 8 ("tint-over-body", header note 6): the pigments-only part of
 * the pot (r, y, b, k renormalized to 100 — white removed) renders a
 * BODY color with the round-6 cube + mud + black-damper rules; white
 * then acts exactly once, as an OKLab blend from white toward that
 * body by a tinting curve t(p) of the pigment share p = 1 - w/100
 * (cubic Hermite, t(0) = 0, t(1) = 1, start slope = tinting strength,
 * end slope = how hard white answers). Because the body does not depend on white and t is
 * strictly increasing, pouring a single pigment into white is a
 * monotonic walk from white to that pigment's corner — no lightening
 * pockets (round 7's cfade dilution made 9-11% red/blue get LIGHTER).
 */
function bodyRaw(r, y, b, k, w) {
  const P = r + y + b + k;
  const f = 100 / P;
  const rr = r * f, yy = y * f, bb = b * f, kk = k * f;
  const C = rr + yy + bb;
  let out = [255, 255, 255];
  if (C > 1e-9) {
    const s = C / (C + STR_HALF * (1 - C / 100));
    const shape = share => 1 - Math.pow(1 - share, SHARE_GAIN);
    const cr = s * shape(rr / C), cy = s * shape(yy / C), cb = s * shape(bb / C);
    out = [0, 0, 0];
    for (const key of Object.keys(CUBE)) {
      const wr = key[0] === '1' ? cr : 1 - cr;
      const wy = key[1] === '1' ? cy : 1 - cy;
      const wb = key[2] === '1' ? cb : 1 - cb;
      const wgt = wr * wy * wb;
      if (wgt === 0) continue;
      const col = CUBE[key];
      out[0] += col[0] * wgt; out[1] += col[1] * wgt; out[2] += col[2] * wgt;
    }
    // Balanced mixes darken toward the mud corner; white (in the real
    // pot) breaks mud — drive is chroma's share of chroma + white.
    const balance = 3 * Math.min(r, y, b) / (r + y + b);
    const drive = (r + y + b) / (r + y + b + w);
    const mudAmt = MUD_MAX * balance * clamp((drive - MUD_START) / (1 - MUD_START), 0, 1);
    if (mudAmt > 0) {
      const mud = CUBE['111'];
      for (let i = 0; i < 3; i++) out[i] = out[i] * (1 - mudAmt) + mud[i] * mudAmt;
    }
  }
  // Share-based black damper, on the pigment-only body.
  const kd = kk <= 0 ? 0 : kk / (kk + BLACK_HALF * (1 - kk / 100));
  const dark = 1 - 0.94 * kd;
  for (let i = 0; i < 3; i++) out[i] = out[i] * dark + BLACK_POINT[i] * (1 - dark);
  return out;
}
function mixRaw(comp) {
  const c = normalizeComp(comp);
  const r = c.r, y = c.y, b = c.b, k = c.k, w = c.w;
  const P = r + y + b + k;
  if (P <= 1e-9) return [255, 255, 255];
  const body = bodyRaw(r, y, b, k, w);
  // Tinting curve: cubic Hermite from (0,0) to (1,1) with end slopes
  // TINT_START (how fast pigment tints white; black and chromatics
  // weighted by share) and TINT_END (how fast white answers at the end
  // of a loaded mix). Monotonic because s0^2 + s1^2 <= 9 (Fritsch-Carlson).
  const s0 = (TINT_C * (r + y + b) + TINT_K * k) / P;
  const s1 = TINT_END;
  const p = P / 100, p2 = p * p, p3 = p2 * p;
  const t = (-2 * p3 + 3 * p2) + s0 * (p3 - 2 * p2 + p) + s1 * (p3 - p2);
  // Blend in OKLab (white = L 1, a = b = 0): perceptually even tint
  // steps that keep hue (CIELAB drifts blue tints purple and red tints
  // salmon; plain sRGB blends read uneven). mixColor clamps to sRGB.
  const ok = rgbToOklab(body);
  return oklabToRgb([1 + (ok[0] - 1) * t, ok[1] * t, ok[2] * t]);
}

/** composition -> '#RRGGBB' */
function mixColor(comp) {
  const [r, g, b] = mixRaw(comp);
  const h = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return ('#' + h(r) + h(g) + h(b)).toUpperCase();
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) {
  const h = v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return ('#' + h(r) + h(g) + h(b)).toUpperCase();
}

/** sRGB (0..255) -> CIE XYZ (D65) */
function rgbToXyz(r, g, b) {
  const f = v => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const R = f(r), G = f(g), B = f(b);
  return [
    (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) * 100,
    (0.2126729 * R + 0.7151522 * G + 0.0721750 * B) * 100,
    (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) * 100
  ];
}

/** sRGB (0..255) -> CIELAB [L, a, b] (D65 white point) */
function rgbToLab(r, g, b) {
  const [x, y, z] = rgbToXyz(r, g, b);
  const Xn = 95.047, Yn = 100.0, Zn = 108.883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f(x / Xn), fy = f(y / Yn), fz = f(z / Zn);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** sRGB 0..255 <-> OKLab (Ottosson). Used only for the white tint blend. */
function srgbToLinear(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function linearToSrgb(v) { return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055); }
function rgbToOklab(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function oklabToRgb(lab) {
  const [L, a, b] = lab;
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076119010 * s].map(linearToSrgb);
}
/** CIELAB (D65) -> sRGB floats 0..255 (unclamped). */
function labToRgb(L, a, bb) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
  const inv = t => t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787;
  const X = 95.047 * inv(fx) / 100, Y = 100 * inv(fy) / 100, Z = 108.883 * inv(fz) / 100;
  const R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const G = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const g = v => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055);
  return [g(R), g(G), g(B)];
}
function hexToLab(hex) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

/** CIEDE2000 color difference. Lab inputs [L,a,b]. (Sharma formulation.) */
function deltaE2000(lab1, lab2) {
  const [L1, a1, b1] = lab1, [L2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp;
  if (C1p * C2p === 0) dhp = 0;
  else {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp;
  if (C1p * C2p === 0) hbarp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
  else hbarp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
  const T = 1 - 0.17 * Math.cos((hbarp - 30) * rad)
    + 0.24 * Math.cos(2 * hbarp * rad)
    + 0.32 * Math.cos((3 * hbarp + 6) * rad)
    - 0.20 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  const dL = dLp / Sl, dC = dCp / Sc, dH = dHp / Sh;
  return Math.sqrt(dL * dL + dC * dC + dH * dH + Rt * dC * dH);
}

/** % accuracy from CIEDE2000 distance. See header for the mapping. */
function accuracyFromDeltaE(dE) {
  return clamp(Math.round(100 * Math.max(0, 1 - Math.pow(dE / 50, 1.25))), 0, 100);
}

/** Daily-eligible: the solver's best mix for this color scores >= par. */
function isDailyEligible(de) { return accuracyFromDeltaE(de) >= PAR_PCT; }

function bandForDeltaE(dE) {
  if (dE <= 2) return 'DEAD ON';
  if (dE <= 5) return 'PAINT-STORE MATCH';
  if (dE <= 10) return 'CLOSE COUSIN';
  if (dE <= 20) return 'SAME FAMILY';
  if (dE <= 35) return 'DISTANT RELATIVE';
  return 'ABSTRACT INTERPRETATION';
}

/** One words-only hint from the Lab delta (target - mine), dominant axis. */
function hintFor(mineLab, targetLab) {
  const dL = targetLab[0] - mineLab[0];
  const da = targetLab[1] - mineLab[1];
  const db = targetLab[2] - mineLab[2];
  const cands = [
    { mag: Math.abs(dL), text: dL > 0
        ? 'too dark — lighten it with white'
        : 'too light — deepen it with more pigment' },
    { mag: Math.abs(da), text: da > 0
        ? 'too green — warm it toward red'
        : 'too red — cool it toward green' },
    { mag: Math.abs(db), text: db > 0
        ? 'too blue — warm it with yellow'
        : 'too yellow — cool it with a little blue' }
  ];
  cands.sort((x, y) => y.mag - x.mag);
  const top = cands[0];
  if (top.mag < 1.2) return 'so close — trust your gut and nudge it a hair';
  const degree = top.mag >= 15 ? 'way ' : top.mag >= 7 ? 'noticeably ' : 'a touch ';
  // "a touch too yellow" reads naturally; heavier degrees replace "a touch".
  return (degree === 'a touch ' ? 'a touch ' : degree) + top.text;
}

/** RGB -> HSL hue angle in degrees (0..360), NaN for achromatic. */
function hueAngle(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d === 0) return NaN;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return (h + 360) % 360;
}

/* ---------------- Round 77 (Franklin): 100% is reachable ----------------
 * Recipes are whole percents (tools/whole-drop-recipes.js) and a color's
 * scoring target is the color its recipe renders, not the raw XKCD/CSS hex
 * (which the five paints often cannot make, so 100% was impossible). The
 * player sees whole-number disc percents (displayPercents); if the pot shows
 * exactly the official recipe's numbers, the attempt is an exact recipe
 * match and scores 100% (ΔE 0, DEAD ON) even if the hidden fractions differ
 * a little. Every pool recipe is reachable with whole drops from a fresh pot
 * (test: whole-drop reachability). */
function recipeHex(recipe) { return mixColor(recipe); }
function recipeMatch(comp, recipe) {
  if (!comp || !recipe) return false;
  const a = displayPercents(comp), b = displayPercents(recipe);
  return COMP_KEYS.every(k => a[k] === b[k]);
}
/** Score a pot against a color's official recipe -> {hex, pct, de, exact}. */
function scoreMix(comp, recipe) {
  const hex = mixColor(comp);
  if (recipeMatch(comp, recipe)) return { hex, pct: 100, de: 0, exact: true };
  const de = deltaE2000(hexToLab(hex), hexToLab(recipeHex(recipe)));
  return { hex, pct: accuracyFromDeltaE(de), de: Math.round(de * 10) / 10, exact: false };
}

/** Whole-drop route to a recipe (tests and tools only; the game never shows it).
 *  From a fresh pot, ops are exactly what the player can do: +1 unit of a paint
 *  (a dropper tap; a pour is a run of these) or -1 unit (a tap on its '-'
 *  badge). A small beam search returns ops like ['+b', '+y', '-w'] that end
 *  with the discs showing the recipe's numbers, or null. */
function wholeDropPath(recipe, maxSteps, beamWidth) {
  const R = {}; const d = displayPercents(recipe); for (const k of COMP_KEYS) R[k] = parseInt(d[k], 10);
  const far = c => COMP_KEYS.reduce((s, k) => s + Math.abs(c[k] - R[k]), 0);
  let beam = [{ x: { ...FRESH_COMP }, path: [] }]; const seen = new Set();
  for (let step = 0; step < (maxSteps || 400); step++) {
    const next = [];
    for (const st of beam) {
      if (recipeMatch(st.x, recipe)) return st.path;
      for (const k of COMP_KEYS) for (const n of [1, -1]) {
        if (n < 0 && !(st.x[k] > 0)) continue;
        const y = addUnits(st.x, k, n), key = COMP_KEYS.map(q => y[q].toFixed(3)).join();
        if (seen.has(key)) continue; seen.add(key);
        next.push({ x: y, path: st.path.concat((n > 0 ? '+' : '-') + k), d: far(y) });
      }
    }
    if (!next.length) return null;
    next.sort((a, b) => a.d - b.d); beam = next.slice(0, beamWidth || 8);
  }
  return null;
}

/* Round 77 (Franklin): ONE short hint after attempt 1, before attempt 2.
 * Words only, from the CIE LCh difference between the submitted mix and the
 * target: lightness (dark/light), chroma (muted/strong) and hue (which way
 * to lean, named by the hue family next door in that direction). The 1-2
 * biggest issues are kept, weighted like CIEDE2000 (chroma and hue shrink
 * for vivid colors). Never a paint amount or the recipe. 97%+ gets
 * 'So close!' and nothing else. */
const HINT_HUES = [[0, 'pink'], [20, 'red'], [50, 'orange'], [85, 'yellow'], [125, 'green'], [190, 'teal'], [240, 'blue'], [290, 'purple'], [335, 'pink']];
function hueWord(h) { let w = HINT_HUES[0][1]; for (const [a, n] of HINT_HUES) if (h >= a) w = n; return w; }
function lch(lab) { const C = Math.hypot(lab[1], lab[2]); return [lab[0], C, (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360]; }
function mixHint(mineLab, targetLab, pct) {
  if (Number(pct) >= 100) return 'Perfect match!';
  if (Number(pct) >= 97) return 'So close!';
  const [Lm, Cm, hm] = lch(mineLab), [Lt, Ct, ht] = lch(targetLab);
  const Cbar = (Cm + Ct) / 2, issues = [];
  const dL = Lt - Lm;
  issues.push({ w: Math.abs(dL), text: dL > 0 ? (Math.abs(dL) > 10 ? 'Too dark' : 'A bit too dark') : (Math.abs(dL) > 10 ? 'Too light' : 'A bit too light') });
  const dC = Ct - Cm;
  issues.push({ w: Math.abs(dC) / (1 + 0.045 * Cbar), text: dC > 0 ? (Ct < 12 ? 'Needs a touch more color' : 'Too muted, make it brighter') : (Ct < 6 ? 'Too colorful, tone it toward grey' : 'Too strong, tone it down') });
  if (Cm > 5 && Ct > 5) {
    let dh = ht - hm; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    const dH = 2 * Math.sqrt(Cm * Ct) * Math.sin(Math.abs(dh) * Math.PI / 360);
    let word = hueWord(ht);
    if (word === hueWord(hm)) word = hueWord((hm + Math.sign(dh) * 35 + 360) % 360);
    if (word === hueWord(hm)) word = hueWord(ht);
    issues.push({ w: dH / (1 + 0.015 * Cbar), text: `Shift it toward ${word}` });
  }
  const big = issues.filter(i => i.w >= 2.5).sort((a, b) => b.w - a.w);
  if (!big.length) return 'Close! Fine-tune it';
  const keep = big.slice(0, big[1] && big[1].w >= 0.5 * big[0].w ? 2 : 1);
  return keep.map((x, i) => i ? x.text.charAt(0).toLowerCase() + x.text.slice(1) : x.text).join(' and ');
}

/* ---------------- seeded RNG + daily picker ---------------- */

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Days since 2025-01-01 in LOCAL time for a Date (or now). */
function dayNumber(date) {
  const d = date ? new Date(date) : new Date();
  const start = new Date(2025, 0, 1);
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((a - start) / 86400000);
}
/* Round 82 (Franklin): the daily rollover is LOCAL midnight. dayNumber()
 * counts local calendar days, so the next color starts at the next local
 * 00:00 (built with the Date constructor, so DST days of 23 or 25 hours are
 * right). formatCountdown(ms) gives "6h 12m 08s", "12m 08s" or "8s",
 * rounding UP to whole seconds so it never reads 0s before the rollover;
 * it returns '' once the time is up. */
function nextDayStart(date) {
  const d = date ? new Date(date) : new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}
function formatCountdown(ms) {
  const t = Math.ceil(Number(ms) / 1000);
  if (!(t > 0)) return '';
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
  const ss = String(sec).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${ss}s`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${sec}s`;
}
/* The line under the countdown. streak = the live streak after today's finish. */
function comeBackLine(streak) {
  const n = Math.max(0, Math.floor(Number(streak) || 0));
  if (n >= 2) return `New color every day — come back tomorrow to keep your 🔥 ${n}-day streak.`;
  if (n === 1) return 'New color every day — come back tomorrow to start a 🔥 streak.';
  return 'New color every day — come back tomorrow for the next one.';
}
function dateKey(date) {
  const d = date ? new Date(date) : new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Daily picker: shuffle-bag over pool indices. Epoch = floor(day/N);
 * each epoch is an independent seeded shuffle, position = day mod N.
 * => deterministic per date; no repeat within an epoch (N days);
 * a repeat is possible across an epoch boundary, as with any
 * shuffle-bag — with N = 841 the boundary is ~2.3 years apart.
 */
function pickDailyIndex(day, poolSize) {
  if (poolSize <= 0) return -1;
  const epoch = Math.floor(day / poolSize);
  const pos = ((day % poolSize) + poolSize) % poolSize;
  const rng = mulberry32(hashSeed('misnomer-epoch-' + epoch + '-n' + poolSize));
  const arr = new Array(poolSize);
  for (let i = 0; i < poolSize; i++) arr[i] = i;
  for (let i = poolSize - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr[pos];
}

/** Nearest bank color (by CIEDE2000) to a Lab value; skips excludeNames. */
function nearestColorName(lab, bankLabs, bank, excludeNames) {
  let best = null, bestDe = Infinity;
  for (let i = 0; i < bank.length; i++) {
    if (excludeNames && excludeNames.has(bank[i].name)) continue;
    const bl = bankLabs[i];
    // cheap CIE76 prefilter before the full CIEDE2000
    const d76 = (lab[0] - bl[0]) ** 2 + (lab[1] - bl[1]) ** 2 + (lab[2] - bl[2]) ** 2;
    if (best && d76 > (bestDe * 1.6) ** 2) continue;
    const de = deltaE2000(lab, bl);
    if (de < bestDe) { bestDe = de; best = bank[i]; }
  }
  return best ? { name: best.name, hex: best.hex, deltaE: bestDe } : null;
}

/* ---------------- Collection (round 69, Franklin) ----------------
 * A Pokédex of the bank. Every sealed mix (daily or practice) discovers the
 * nearest collectible bank color when it lies within DISCOVER_DE (CIEDE2000),
 * even if that is not the round's target. If the mix is within reach of the
 * round's own target, the target is the one discovered (the bank has near twins,
 * like "bright green" and "fluorescent green" at 0.05 apart, and a twin could
 * otherwise never be found). Collectible = every color that can be a daily:
 * not retired and daily-eligible. Retired names and the ~120 colors the five
 * paints cannot make at par (neons, brights) are left out, so every tile can
 * be won. A color the paints cannot reach within DISCOVER_DE is found within
 * its own solver best + DISCOVER_HARD_MARGIN. Tuned with tools/discovery-rate.js (BUILD-REPORT round 69): the
 * bank is dense, so even at 3 about 2 in 3 seals land near some color; what 3
 * keeps meaningful is how many are NEW (about 35-40 after 30 days, about 300-335
 * of 853 after a year of dailies). At 5, about 9 in 10 seals hit something. */
const DISCOVER_DE = 3, DISCOVER_HARD_MARGIN = 1;
const COLLECTION_KEY = 'mixology.collection.v1';
/** The Collection: every color that can be a daily (the game's POOL). */
function collectibleColors(bank) { return bank.filter(c => !c.retired && isDailyEligible(c.de)); }
/** How close a mix must come to discover color c. Colors the five paints cannot
 *  reach within DISCOVER_DE (solver de) are found within their own best + a margin,
 *  so the whole Collection can be completed. */
function discoverLimit(c, maxDe) {
  // round 77: discovery is measured against each color's RECIPE color (game.js
  // passes recipe-color labs), which every pool recipe can hit exactly, so the
  // old hard-color margin (solver de + 1) is no longer needed
  return maxDe == null ? DISCOVER_DE : maxDe;
}
/* Hue families by CIE LCh: low chroma = neutrals, otherwise hue bins. */
const HUE_FAMILIES = [
  { id: 'red', label: 'Reds & pinks' }, { id: 'orange', label: 'Oranges & browns' },
  { id: 'yellow', label: 'Yellows' }, { id: 'green', label: 'Greens' },
  { id: 'teal', label: 'Teals & cyans' }, { id: 'blue', label: 'Blues' },
  { id: 'purple', label: 'Purples' }, { id: 'neutral', label: 'Neutrals' }
];
function hueFamily(hex) {
  const [L, a, b] = hexToLab(hex), C = Math.hypot(a, b);
  if (C < 8) return 'neutral';
  const h = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
  if (h < 40 || h >= 350) return 'red';
  if (h < 75) return 'orange';
  if (h < 105) return 'yellow';
  if (h < 175) return 'green';
  if (h < 235) return 'teal';
  if (h < 290) return 'blue';
  return 'purple';
}
/** The collectible color a mix discovers, or null. The round's target wins when
 *  the mix is within its discoverLimit; otherwise the nearest (CIEDE2000) of the
 *  colors whose limit the mix is within. */
function discoverColor(hex, collectible, labs, maxDe, targetName) {
  const lab = hexToLab(hex);
  let best = null, bestDe = Infinity;
  for (let i = 0; i < collectible.length; i++) {
    const lim = discoverLimit(collectible[i], maxDe);
    // no CIE76 prefilter: CIE76 can be ~8x CIEDE2000 near neutrals, and ~1000
    // CIEDE2000 evaluations per seal cost well under a millisecond
    const de = deltaE2000(lab, labs[i]);
    if (de > lim) continue;
    if (targetName && collectible[i].name === targetName) return { name: collectible[i].name, hex: collectible[i].hex, deltaE: de };
    if (de < bestDe) { bestDe = de; best = collectible[i]; }
  }
  return best ? { name: best.name, hex: best.hex, deltaE: bestDe } : null;
}
/** Fold one sealed mix into a collection object (pure: returns a new one, plus
 *  `isNew`). The best mix for a color is the most accurate one against it. */
function recordDiscovery(col, found, att, when) {
  const out = { v: 1, found: { ...((col && col.found) || {}) }, backfilled: !!(col && col.backfilled) };
  if (!found) return { col: out, isNew: false, name: null };
  const pct = accuracyFromDeltaE(found.deltaE);
  const prev = out.found[found.name];
  const best = { comp: normalizeComp(att.comp), hex: att.hex, pct, de: Math.round(found.deltaE * 10) / 10 };
  if (!prev) out.found[found.name] = { date: when, best };
  else if (pct > prev.best.pct) out.found[found.name] = { date: prev.date, best };
  return { col: out, isNew: !prev, name: found.name };
}
/** Backfill from saved daily records ({day: {date, attempts:[{comp, hex}]}}). */
function backfillCollection(col, days, collectible, labs) {
  let out = { v: 1, found: { ...((col && col.found) || {}) }, backfilled: true };
  const keys = Object.keys(days || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  for (const d of keys) {
    const rec = days[d];
    for (const att of (rec && rec.attempts) || []) {
      if (!att || !att.hex || !att.comp) continue;
      out = recordDiscovery(out, discoverColor(att.hex, collectible, labs, null, rec.name), att, rec.date || null).col;
    }
  }
  out.backfilled = true;
  return out;
}
/** Spoiler rule (round 73, Franklin): the official recipe of a collected color
 *  is shown only if the player has FINISHED a daily of that color (any record
 *  in their own save's `days`, written only by finish()). That is a reveal
 *  they already saw, so it stays visible even though colors recur later in
 *  the schedule. A color that was only a pre-launch daily (internal day < 656,
 *  before Mixology #1) or a missed day, or that is upcoming, stays locked: the
 *  old "was a daily before today" rule unlocked all 656 pre-launch colors, and
 *  those recur as future dailies (e.g. evergreen: days 508, 1454, ...). */
function officialRecipeVisible(name, finishedDays) {
  return Object.values(finishedDays || {}).some(r => !!r && r.name === name);
}

/* ---------------- Star badges (round 74, Franklin) ----------------
 * A small star in the corner of a swatch for a high score, using the same
 * rounded % the player sees. Round 75 tiers: 85-89 bronze, 90-96 silver,
 * 97-99 gold, 100 diamond (a higher tier replaces a lower one). Shown on Calendar day circles (that day's
 * best attempt), Collection tiles (best mix against that color) and the reveal.
 * Purely derived from saved scores: nothing new is stored, so old saves work. */
// round 75 (Franklin): re-pointed. 100 diamond, 97-99 gold, 90-96 silver, 85-89 bronze (85 = par).
const STAR_TIERS = [{ id: 'diamond', min: 100, label: 'diamond star: 100%' }, { id: 'gold', min: 97, label: 'gold star: 97%+' }, { id: 'silver', min: 90, label: 'silver star: 90%+' }, { id: 'bronze', min: 85, label: 'bronze star: 85%+' }];
function starTier(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return null;
  return STAR_TIERS.find(t => Math.round(n) >= t.min) || null;
}
/** The % a Collection entry's best mix scored against its color. Older or
 *  partial entries may lack pct: fall back to the stored ΔE, then to the mix
 *  hex vs the color's hex (normal accuracy formula). */
function collectedBestPct(entry, colorHex) {
  const b = entry && entry.best; if (!b) return null;
  if (Number.isFinite(Number(b.pct))) return Number(b.pct);
  if (Number.isFinite(Number(b.de))) return accuracyFromDeltaE(Number(b.de));
  if (b.hex && colorHex) return accuracyFromDeltaE(deltaE2000(hexToLab(b.hex), hexToLab(colorHex)));
  return null;
}

/* ---------------- Holidays (round 72, Franklin) ----------------
 * Holiday days get a themed daily color (tools/build-schedule.js) and a small
 * tag under the header. Pure date math plus fixed tables for the lunar dates
 * (sources: Wikipedia / HKO for Lunar New Year, Hebcal for the first Hanukkah
 * candle, drikpanchang / qppstudio for Diwali, Lakshmi Puja); years outside a
 * table simply have no such holiday. When two land on one day, the one listed
 * first wins (see HOLIDAY_PRIORITY). */
const LUNAR_NEW_YEAR = { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08' };
const HANUKKAH_FIRST_NIGHT = { 2026: '12-04', 2027: '12-24', 2028: '12-12', 2029: '12-01', 2030: '12-20', 2031: '12-09', 2032: '11-27', 2033: '12-16', 2034: '12-06', 2035: '12-25' };
const DIWALI = { 2026: '11-08', 2027: '10-29', 2028: '10-17', 2029: '11-05', 2030: '10-26', 2031: '11-14', 2032: '11-02', 2033: '10-22', 2034: '11-10', 2035: '10-30' };
/** Western (Gregorian) Easter Sunday, anonymous Gregorian algorithm. -> [month 1-12, day] */
function easterDate(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}
/** n-th weekday (0 = Sunday) of a month (1-12). */
function nthWeekday(y, month, weekday, n) {
  const first = new Date(Date.UTC(y, month - 1, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + 7 * (n - 1);
}
function md(s) { const [m, d] = s.split('-').map(Number); return [m, d]; }
function shiftDays(y, m, d, n) { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCMonth() + 1, t.getUTCDate()]; }
/* Listed in priority order: on a clash the earlier one keeps the day. */
const HOLIDAY_DEFS = [
  { id: 'christmas', label: 'Christmas', emoji: '🎄', on: y => [12, 25] },
  { id: 'hanukkah', label: 'Hanukkah', emoji: '🕎', on: y => HANUKKAH_FIRST_NIGHT[y] && md(HANUKKAH_FIRST_NIGHT[y]) },
  { id: 'christmas-eve', label: 'Christmas Eve', emoji: '✨', on: y => [12, 24] },
  { id: 'new-year', label: "New Year's Day", emoji: '🎉', on: y => [1, 1] },
  { id: 'lunar-new-year', label: 'Lunar New Year', emoji: '🧧', on: y => LUNAR_NEW_YEAR[y] && md(LUNAR_NEW_YEAR[y]) },
  { id: 'valentines', label: "Valentine's Day", emoji: '💝', on: y => [2, 14] },
  { id: 'mardi-gras', label: 'Mardi Gras', emoji: '🎭', on: y => { const [m, d] = easterDate(y); return shiftDays(y, m, d, -47); } },
  { id: 'groundhog', label: 'Groundhog Day', emoji: '🦫', on: y => [2, 2] },
  { id: 'pi-day', label: 'Pi Day', emoji: '🥧', on: y => [3, 14] },
  { id: 'st-patricks', label: "St. Patrick's Day", emoji: '☘️', on: y => [3, 17] },
  { id: 'easter', label: 'Easter', emoji: '🐣', on: y => easterDate(y) },
  { id: 'earth-day', label: 'Earth Day', emoji: '🌍', on: y => [4, 22] },
  { id: 'cinco-de-mayo', label: 'Cinco de Mayo', emoji: '🪅', on: y => [5, 5] },
  { id: 'mothers-day', label: "Mother's Day", emoji: '💐', on: y => [5, nthWeekday(y, 5, 0, 2)] },
  { id: 'pride', label: 'Pride Month', emoji: '🏳️‍🌈', on: y => [6, 1] },
  { id: 'fathers-day', label: "Father's Day", emoji: '👔', on: y => [6, nthWeekday(y, 6, 0, 3)] },
  { id: 'independence-day', label: 'Independence Day', emoji: '🎆', on: y => [7, 4] },
  { id: 'halloween', label: 'Halloween', emoji: '🎃', on: y => [10, 31] },
  { id: 'diwali', label: 'Diwali', emoji: '🪔', on: y => DIWALI[y] && md(DIWALI[y]) },
  { id: 'thanksgiving', label: 'Thanksgiving', emoji: '🦃', on: y => [11, nthWeekday(y, 11, 4, 4)] }
];
/** All holidays of a year as { id, label, emoji, month, day }, one per date (priority wins). */
function holidaysForYear(y) {
  const taken = new Set(), out = [];
  for (const h of HOLIDAY_DEFS) {
    const r = h.on(y); if (!r) continue;
    const key = r[0] * 100 + r[1]; if (taken.has(key)) continue;
    taken.add(key); out.push({ id: h.id, label: h.label, emoji: h.emoji, month: r[0], day: r[1] });
  }
  return out.sort((a, b) => a.month * 100 + a.day - (b.month * 100 + b.day));
}
/** The holiday on a local calendar date, or null. */
function holidayOn(date) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  return holidaysForYear(y).find(h => h.month === m && h.day === d) || null;
}

/* ---------------- duel link payload (round 8) ----------------
 * The player's % composition (r.y.b.k.w, %x10 integers) masked with a
 * day-seeded keystream, 2 base36 chars per share. Obfuscation, not
 * cryptography: it keeps hexes/recipes from being readable in a posted
 * link; the page only renders it after the visitor finishes that day. */
const DUEL_MOD = 1296; // 36^2
function duelKey(day) {
  const rng = mulberry32(hashSeed('mixology-duel-' + day));
  return [0, 1, 2, 3, 4].map(() => Math.floor(rng() * DUEL_MOD));
}
function encodeDuelComp(comp, day) {
  const key = duelKey(day);
  return [comp.r, comp.y, comp.b, comp.k, comp.w]
    .map((v, i) => ((Math.round(v * 10) + key[i]) % DUEL_MOD).toString(36).padStart(2, '0')).join('');
}
function decodeDuelComp(x, day) {
  if (!/^[0-9a-z]{10}$/i.test(x)) return null;
  const key = duelKey(day);
  const v = [0, 1, 2, 3, 4].map(i => ((parseInt(x.substr(i * 2, 2), 36) - key[i]) % DUEL_MOD + DUEL_MOD) % DUEL_MOD / 10);
  const total = v.reduce((a, b) => a + b, 0);
  if (total < 95 || total > 105) return null; // mangled link
  return normalizeComp({ r: v[0], y: v[1], b: v[2], k: v[3], w: v[4] });
}

const MisnomerEngine = {
  CUBE, COMP_KEYS, FRESH_COMP, OLD_WHITE_START, isEmptyComp,
  STR_HALF, SHARE_GAIN, BLACK_HALF, MUD_MAX, MUD_START,
  TINT_C, TINT_K, TINT_END, PAR_PCT, isDailyEligible, POUR_RATE_START, POUR_RATE_MAX, POUR_RAMP_FROM, POUR_RAMP_TO, pourUnitsAt, pourRateAt, displayPercents, TRACE_PCT, snapTraces, removeUnits, LAUNCH_DAY, publicNumber, computeStats, STAT_BUCKETS,
  normalizeComp, addUnits, mixRaw, mixColor, hexToRgb, rgbToHex, rgbToXyz, rgbToLab, labToRgb, rgbToOklab, oklabToRgb, hexToLab,
  deltaE2000, accuracyFromDeltaE, bandForDeltaE, hintFor, hueAngle,
  hashSeed, mulberry32, encodeDuelComp, decodeDuelComp, dayNumber, nextDayStart, formatCountdown, comeBackLine, dateKey, pickDailyIndex, nearestColorName,
  DISCOVER_DE, DISCOVER_HARD_MARGIN, discoverLimit, COLLECTION_KEY, collectibleColors, LUNAR_NEW_YEAR, HANUKKAH_FIRST_NIGHT, DIWALI, HOLIDAY_DEFS, easterDate, nthWeekday, holidaysForYear, holidayOn, HUE_FAMILIES, hueFamily, discoverColor, recordDiscovery, backfillCollection, officialRecipeVisible, recipeHex, recipeMatch, scoreMix, wholeDropPath, mixHint, hueWord, STAR_TIERS, starTier, collectedBestPct
};
if (typeof module !== 'undefined' && module.exports) module.exports = MisnomerEngine;
if (typeof window !== 'undefined') window.MisnomerEngine = MisnomerEngine;
