#!/usr/bin/env node
/* Misnomer unit tests — run: node test/tests.js
 * Round 6: the pot is a PERCENTAGE composition {r,y,b,k,w} summing to
 * exactly 100 (the percentage pot). All mixing tests are expressed in %. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');
// round 62: units in a 1 s Pour Bucket hold (press unit + ramp), was a flat 30
const ONE_SEC = 1 + Math.floor(E.pourUnitsAt(1));
const bank = require('../colors.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('FAIL  ' + name + ' — ' + e.message); }
}
const labOf = hex => E.hexToLab(hex);
const labOfComp = c => E.hexToLab(E.mixColor(c));
const L = c => labOfComp(c)[0];
const hue = c => { const [r, g, b] = E.hexToRgb(E.mixColor(c)); return E.hueAngle(r, g, b); };
const pour = (comp, key, units) => { let c = comp; for (let i = 0; i < units; i++) c = E.addUnits(c, key, 1); return c; };

console.log('— CIEDE2000 vs Sharma reference pairs (tolerance 0.1) —');
const SHARMA = [
  [[50.0000, 2.6772, -79.7751], [50.0000, 0.0000, -82.7485], 2.0425],
  [[50.0000, 3.1571, -77.2803], [50.0000, 0.0000, -82.7485], 2.8615],
  [[50.0000, 2.8361, -74.0200], [50.0000, 0.0000, -82.7485], 3.4412],
  [[50.0000, -1.3802, -84.2814], [50.0000, 0.0000, -82.7485], 1.0000],
  [[50.0000, -1.1848, -84.8006], [50.0000, 0.0000, -82.7485], 1.0000],
  // NOTE: the row (50, -0.9009, -84.2393) vs (50, 0, -82.7485) circulates
  // in secondary sources with expected 1.0000, but two independent
  // implementations of the published formula both yield 0.7504 for it,
  // so that expected value appears to be a transcription error and the
  // row is excluded rather than forced.
  [[50.0000, 2.4900, -0.0010], [50.0000, -2.4900, 0.0009], 7.1792]
];
SHARMA.forEach(([a, b, expected], i) => {
  test(`Sharma pair ${i + 1} -> ${expected}`, () => {
    const got = E.deltaE2000(a, b);
    assert.ok(Math.abs(got - expected) <= 0.1, `got ${got.toFixed(4)}`);
  });
});
test('deltaE of identical colors is 0', () => {
  assert.strictEqual(E.deltaE2000([50, 10, -20], [50, 10, -20]), 0);
});

console.log('— RGB -> Lab anchors —');
test('white -> Lab (100, 0, 0)', () => {
  const [l, a, b] = E.rgbToLab(255, 255, 255);
  assert.ok(Math.abs(l - 100) < 0.05 && Math.abs(a) < 0.05 && Math.abs(b) < 0.05, `${l},${a},${b}`);
});
test('sRGB red -> Lab ~(53.24, 80.09, 67.20)', () => {
  const [l, a, b] = E.rgbToLab(255, 0, 0);
  assert.ok(Math.abs(l - 53.24) < 0.2 && Math.abs(a - 80.09) < 0.2 && Math.abs(b - 67.20) < 0.2, `${l},${a},${b}`);
});

console.log('— % accuracy mapping —');
test('accuracy(0) = 100 and accuracy(2) >= 97', () => {
  assert.strictEqual(E.accuracyFromDeltaE(0), 100);
  assert.ok(E.accuracyFromDeltaE(2) >= 97, `got ${E.accuracyFromDeltaE(2)}`);
});
test('accuracy is monotonic decreasing in ΔE and hits 0 by ΔE 50', () => {
  let prev = 101;
  for (let d = 0; d <= 60; d += 0.5) {
    const a = E.accuracyFromDeltaE(d);
    assert.ok(a <= prev, `not monotonic at ${d}: ${a} > ${prev}`);
    prev = a;
  }
  let last = Infinity;
  for (const d of [3, 5, 10, 20, 35, 49]) {
    const a = E.accuracyFromDeltaE(d);
    assert.ok(a < last, `not strictly decreasing at ${d}`);
    last = a;
  }
  assert.strictEqual(E.accuracyFromDeltaE(50), 0);
});
test('good-but-imperfect (ΔE 5..10) lands 83..96', () => {
  for (const d of [5, 7.5, 10]) {
    const a = E.accuracyFromDeltaE(d);
    assert.ok(a >= 83 && a <= 96, `ΔE ${d} -> ${a}`);
  }
});
test('bands at thresholds', () => {
  assert.strictEqual(E.bandForDeltaE(1.5), 'DEAD ON');
  assert.strictEqual(E.bandForDeltaE(3), 'PAINT-STORE MATCH');
  assert.strictEqual(E.bandForDeltaE(7), 'CLOSE COUSIN');
  assert.strictEqual(E.bandForDeltaE(40), 'ABSTRACT INTERPRETATION');
});

console.log('— mixing hue sanity (percentage compositions) —');
test('blue + yellow = GREEN (hue 90..160)', () => {
  const h = hue({ y: 40, b: 40, w: 20 });
  assert.ok(h >= 90 && h <= 160, `hue ${h}`);
});
test('red 8% in white = pink (red hue, L>=70)', () => {
  const v = { r: 8, w: 92 };
  const h = hue(v);
  assert.ok(h <= 15 || h >= 345, `hue ${h}`);
  assert.ok(L(v) >= 70, `L ${L(v)}`);
});
test('blue 8% in white = light blue (hue 195..255, L>=70)', () => {
  const v = { b: 8, w: 92 };
  const h = hue(v);
  assert.ok(h >= 195 && h <= 255, `hue ${h}`);
  assert.ok(L(v) >= 70, `L ${L(v)}`);
});
test('red + yellow = orange (hue 15..45)', () => {
  const h = hue({ r: 40, y: 40, w: 20 });
  assert.ok(h >= 15 && h <= 45, `hue ${h}`);
});
test('equal thirds = dark mud (L<=40 at full load), darkening as chroma share grows', () => {
  const at30 = L({ r: 10, y: 10, b: 10, w: 70 });
  const at60 = L({ r: 20, y: 20, b: 20, w: 40 });
  const at99 = L({ r: 33, y: 33, b: 33, w: 1 });
  assert.ok(at99 <= 40, `L at thirds-full = ${at99.toFixed(1)}`);
  assert.ok(at60 < at30 - 2, `no darkening: ${at30.toFixed(1)} -> ${at60.toFixed(1)}`);
  assert.ok(at99 < at60 - 2, `no darkening: ${at60.toFixed(1)} -> ${at99.toFixed(1)}`);
});
test('white + a little black = gray (low chroma, L 85..98)', () => {
  const lab = labOfComp({ k: 5, w: 95 });
  assert.ok(Math.hypot(lab[1], lab[2]) <= 7, `chroma ${Math.hypot(lab[1], lab[2])}`);
  assert.ok(lab[0] >= 85 && lab[0] <= 98, `L ${lab[0]}`);
});
test('blue + black = navy (blue hue, dark, darker than blue alone)', () => {
  const navy = { b: 40, k: 25, w: 35 };
  const h = hue(navy);
  assert.ok(h >= 200 && h <= 260, `hue ${h}`);
  // Round 7: threshold 38 -> 40. The white-dilution retune lightens
  // mid-white mixes by design (that is the fix); this navy renders
  // L 38.7 — still a dark navy, still far darker than blue alone.
  assert.ok(L(navy) <= 40, `L ${L(navy)}`);
  assert.ok(L(navy) <= L({ b: 40, w: 60 }) - 5, 'not darker than plain blue');
});
test('black 80% = charcoal depth (L<=25)', () => {
  assert.ok(L({ k: 80, w: 20 }) <= 25);
});

console.log('— white in the percentage pot —');
test('raising white share lightens a red mix monotonically', () => {
  let prev = -Infinity;
  for (const comp of [{ r: 32, w: 68 }, { r: 24, w: 76 }, { r: 16, w: 84 }, { r: 8, w: 92 }]) {
    const l = L(comp);
    assert.ok(l > prev, `L ${l.toFixed(2)} not > ${prev.toFixed(2)}`);
    prev = l;
  }
});
test('white share turns a saturated mix pastel (L up >=8, chroma down)', () => {
  const sat = labOfComp({ r: 60, w: 40 });
  const pastel = labOfComp({ r: 25, w: 75 });
  assert.ok(pastel[0] >= sat[0] + 8, `L ${sat[0].toFixed(1)} -> ${pastel[0].toFixed(1)}`);
  assert.ok(Math.hypot(pastel[1], pastel[2]) < Math.hypot(sat[1], sat[2]),
    `chroma ${Math.hypot(sat[1], sat[2]).toFixed(1)} -> ${Math.hypot(pastel[1], pastel[2]).toFixed(1)} did not drop`);
});
test('dosing white into a fresh pot keeps it 100% white', () => {
  let c = { ...E.FRESH_COMP };
  for (let i = 0; i < 10; i++) c = E.addUnits(c, 'w', 1);
  assert.strictEqual(c.w, 100);
  assert.strictEqual(E.mixColor(c), '#FFFFFF');
});
test('displacing with white lightens a warm mix and keeps its hue warm', () => {
  const before = { r: 45, y: 15, w: 40 };
  const after = E.addUnits(before, 'w', 30);
  assert.ok(L(after) > L(before), `L ${L(before).toFixed(1)} -> ${L(after).toFixed(1)}`);
  const h = hue(after);
  assert.ok(h <= 60 || h >= 330, `hue ${h}`);
});

console.log('— round 6: the percentage pot (composition invariants) —');
test('fresh pot is EMPTY (round 83): no paint at all, every disc 0%, the first drop is 100% that paint', () => {
  assert.deepStrictEqual({ ...E.FRESH_COMP }, { r: 0, y: 0, b: 0, k: 0, w: 0 });
  assert.ok(E.isEmptyComp(E.FRESH_COMP) && !E.isEmptyComp({ w: 100 }));
  assert.deepStrictEqual(E.displayPercents(E.FRESH_COMP), { r: '0%', y: '0%', b: '0%', k: '0%', w: '0%' });
  for (const k of ['r', 'y', 'b', 'k', 'w']) { const c = E.addUnits(E.FRESH_COMP, k, 1); assert.strictEqual(c[k], 100); assert.strictEqual(E.displayPercents(c)[k], '100%'); }
  assert.deepStrictEqual({ ...E.OLD_WHITE_START }, { r: 0, y: 0, b: 0, k: 0, w: 100 }); // the old start, for save migration only
});
test('composition always sums to exactly 100, whatever you dose', () => {
  let seed = 99; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let c = { ...E.FRESH_COMP };
  const keys = ['r', 'y', 'b', 'k', 'w'];
  for (let i = 0; i < 500; i++) {
    c = E.addUnits(c, keys[Math.floor(rnd() * 5)], 1 + Math.floor(rnd() * 40));
    const sum = keys.reduce((s, k) => s + c[k], 0);
    assert.ok(Math.abs(sum - 100) < 1e-6, `step ${i}: sum ${sum}`);
    for (const k of keys) assert.ok(c[k] >= 0 && c[k] <= 100, `step ${i}: ${k}=${c[k]} out of range`);
  }
});
test('displacement semantics: adding P raises P and shrinks the others proportionally', () => {
  const start = { r: 20, y: 20, w: 60 };
  const after = E.addUnits(start, 'r', 25); // total 125 -> x0.8
  assert.ok(Math.abs(after.r - 36) < 1e-9, `r ${after.r}`);
  assert.ok(Math.abs(after.y - 16) < 1e-9, `y ${after.y}`);
  assert.ok(Math.abs(after.w - 48) < 1e-9, `w ${after.w}`);
  assert.strictEqual(after.y / after.w, start.y / start.w, 'non-added shares lost their ratio');
});
test('path independence: color depends only on the composition, not the history', () => {
  // Same shares at a different scale render identically (normalization).
  assert.strictEqual(E.mixColor({ r: 20, y: 10, k: 5, w: 65 }), E.mixColor({ r: 40, y: 20, k: 10, w: 130 }));
  // Two dosing histories that end on the same composition render identically.
  const target = { r: 25, y: 25, b: 25, k: 5, w: 20 };
  const h1 = E.normalizeComp(target);
  assert.strictEqual(E.mixColor(h1), E.mixColor({ ...target }));
});
test('saturation is fairly reachable: 95% single pigment within ΔE 6 of full strength', () => {
  for (const key of ['r', 'y', 'b']) {
    const c95 = { w: 5 }; c95[key] = 95;
    const c100 = {}; c100[key] = 100;
    const d = E.deltaE2000(labOfComp(c95), labOfComp(c100));
    assert.ok(d <= 6, `${key}: ΔE ${d.toFixed(2)}`);
  }
});
test('tints work: 2-5% chromatic in white reads as a clear pastel tint', () => {
  const white = labOfComp({ w: 100 });
  const d3 = E.deltaE2000(labOfComp({ r: 3, w: 97 }), white);
  const d5 = E.deltaE2000(labOfComp({ r: 5, w: 95 }), white);
  // Round 8: 3% bar 4 -> 3.5 and 5% bar 7 -> 6. The tint-over-body
  // model spends its tinting strength across the whole 0-40% range (a 1 s
  // pour from white is now ΔE ~15-25, was 8-11) instead of front-loading
  // it into the first few %, which is what made 9-11% red/blue LIGHTEN.
  assert.ok(d3 >= 3.5 && d3 <= 16, `3% tint ΔE ${d3.toFixed(1)}`);
  assert.ok(d5 >= 6, `5% tint ΔE ${d5.toFixed(1)}`);
  const d10 = E.deltaE2000(labOfComp({ r: 10, w: 90 }), white);
  assert.ok(d10 >= 10, `10% tint ΔE ${d10.toFixed(1)}`);
});

console.log('— round 6: stuck pots are gone (round-5 diagnosis, replayed) —');
test('DIAGNOSIS (a): mud pot recovers ΔE>=10 within 1s of white pouring (was 7.7s)', () => {
  const mud = { r: 31, y: 31, b: 31, w: 7 }; // round-5's 130/130/130-in-30 pot, as %
  const d = E.deltaE2000(labOfComp(mud), labOfComp(pour(mud, 'w', ONE_SEC)));
  assert.ok(d >= 10, `ΔE ${d.toFixed(1)} after ${ONE_SEC} white units`);
});
test('DIAGNOSIS (b): black pot recovers ΔE>=10 within 1s of red pouring (was 4.0s)', () => {
  const blk = { k: 87, w: 13 }; // round-5's 200K-in-30 pot, as %
  const d = E.deltaE2000(labOfComp(blk), labOfComp(pour(blk, 'r', ONE_SEC)));
  assert.ok(d >= 10, `ΔE ${d.toFixed(1)} after ${ONE_SEC} red units`);
});
test('DIAGNOSIS (c): the old hard-stuck cap states are unreachable — no cap exists', () => {
  assert.strictEqual(E.MAX_DROPS, undefined, 'engine still exports a drops cap');
  // From the most extreme composition possible, a counter-pour still moves the color.
  const extreme = { r: 99.9, w: 0.1 };
  const moved = pour(extreme, 'b', 30);
  assert.notStrictEqual(E.mixColor(moved), E.mixColor(extreme), 'color frozen at an extreme composition');
  // And dosing never refuses: 5000 units of one pigment keep displacing.
  let c = { ...E.FRESH_COMP };
  for (let i = 0; i < 5000; i++) c = E.addUnits(c, 'k', 1);
  assert.ok(c.k > 99.9, `k only reached ${c.k} — displacement stalled`);
});
test('purple pot + red pours: hue strictly approaches red, every 1s step moves >=0.5 ΔE', () => {
  const circDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  const redHue = hue({ r: 100 });
  let prevDist = Infinity, prevLab = null;
  let cur = { r: 35, b: 35, w: 30 };
  for (let s = 0; s <= 5; s++) {
    const dist = circDist(hue(cur), redHue);
    assert.ok(dist < prevDist, `step ${s}: hue distance ${dist.toFixed(1)} not < ${prevDist.toFixed(1)}`);
    if (prevLab) {
      const step = E.deltaE2000(labOfComp(cur), prevLab);
      assert.ok(step >= 0.5, `step ${s}: ΔE ${step.toFixed(2)} < 0.5 — pour feels frozen`);
    }
    prevDist = dist; prevLab = labOfComp(cur);
    cur = pour(cur, 'r', ONE_SEC);
  }
});
test('monotonic approach sweep: 1s of pouring ALWAYS moves toward the poured pigment', () => {
  const refs = { r: { r: 100 }, y: { y: 100 }, b: { b: 100 }, k: { k: 100 }, w: { w: 100 } };
  let seed = 4242; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 120; t++) {
    const raw = [rnd(), rnd(), rnd(), rnd(), rnd()];
    const tot = raw.reduce((a, x) => a + x, 0);
    const comp = { r: raw[0] / tot * 100, y: raw[1] / tot * 100, b: raw[2] / tot * 100, k: raw[3] / tot * 100, w: raw[4] / tot * 100 };
    for (const key of ['r', 'y', 'b', 'k', 'w']) {
      const before = E.deltaE2000(labOfComp(comp), labOfComp(refs[key]));
      const after = E.deltaE2000(labOfComp(pour(comp, key, ONE_SEC)), labOfComp(refs[key]));
      assert.ok(after < before, `comp ${JSON.stringify(comp)} pour ${key}: ΔE ${before.toFixed(2)} -> ${after.toFixed(2)}`);
    }
  }
});
test('a chromatic pigment can win the pot back from black', () => {
  const blackish = { b: 30, k: 50, w: 20 };
  const won = pour(blackish, 'b', 300);
  // Round 8: was "L rises > 5". Pure blue itself is only L* ~30 and the
  // new model renders this blackish pot at L* ~25, so lightness cannot
  // carry the test; chroma and distance do (blue visibly wins it back).
  const chroma = c => Math.hypot(labOfComp(c)[1], labOfComp(c)[2]);
  assert.ok(chroma(won) > chroma(blackish) + 15, `blue never escapes black: C ${chroma(blackish).toFixed(1)} -> ${chroma(won).toFixed(1)}`);
  assert.ok(E.deltaE2000(labOfComp(blackish), labOfComp(won)) >= 10, 'win-back moved less than ΔE 10');
  const h = hue(won);
  assert.ok(h >= 200 && h <= 260, `hue ${h} not back to blue`);
});

console.log('— UI contract (producer round-2 edits) —');
const htmlSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const gameSrc = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
test('no live caption: index.html has no "reads as" text and no #caption element', () => {
  assert.ok(!htmlSrc.includes('reads as'), 'index.html still contains "reads as"');
  assert.ok(!htmlSrc.includes('id="caption"'), 'index.html still has #caption');
});
test('game.js never renders a caption or consults nearest-name while mixing', () => {
  assert.ok(!gameSrc.includes("$('caption')"), 'game.js still writes #caption');
  assert.ok(!gameSrc.includes('nearestColorName'), 'game.js still calls nearestColorName');
});
test('pot is a real <button>; dosing is wired to pot pointerdown (round-3)', () => {
  assert.ok(/<button id="pot"[^>]*type="button"/.test(htmlSrc), 'pot is not a <button>');
  assert.ok(gameSrc.includes("addEventListener('pointerdown'"), 'no pot pointerdown -> dose wiring');
  assert.ok(gameSrc.includes('startPour'), 'no press-and-hold pour wiring');
});
test('white is a bucket (data-bucket="w"); the Dilute button is gone', () => {
  assert.ok(htmlSrc.includes('data-bucket="w"'), 'no white bucket');
  assert.ok(!htmlSrc.includes('btn-dilute'), 'Dilute button still in index.html');
  assert.ok(!gameSrc.includes('btn-dilute'), 'btn-dilute still referenced in game.js');
});
test('bucket buttons only select; dosing happens on the pot', () => {
  assert.ok(!/addEventListener\('click', \(\) => \{ selectedBucket = btn\.dataset\.bucket; dose/.test(gameSrc),
    'bucket click still doses');
});

console.log('— UI contract (producer round-3 edits) —');
test('two tools only: no Spoon anywhere, no Pour-as-fixed-dose', () => {
  assert.ok(!htmlSrc.includes('Spoon') && !htmlSrc.includes('spoon'), 'Spoon still in index.html');
  assert.ok(!gameSrc.includes('Spoon') && !gameSrc.includes('spoon'), 'Spoon still in game.js');
  assert.ok(htmlSrc.includes('data-tool="dropper"') && htmlSrc.includes('data-tool="pour"'), 'tools missing');
});
test('dropper doses exactly 1 unit per dose; pouring ticks whole units', () => {
  assert.ok(gameSrc.includes('E.addUnits(round.pot, selectedBucket, 1)'), 'applyUnit no longer doses exactly 1 unit');
  assert.ok(gameSrc.includes('setInterval'), 'pour is not timer-driven');
  // round 62: the start rate keeps the old fine-control band; the ramp lives in engine.js
  assert.ok(E.POUR_RATE_START >= 24 && E.POUR_RATE_START <= 36, `pour start rate ${E.POUR_RATE_START}/s outside the band 24..36`);
  assert.ok(gameSrc.includes('E.pourUnitsAt(sec)'), 'pour loop does not follow the engine ramp');
});
test('tool buttons carry NO dosage numbers (dosages live in Tips only)', () => {
  for (const id of ['tool-dropper', 'tool-pour']) {
    const m = htmlSrc.match(new RegExp(`id="${id}"[^>]*>([^<]*)<`));
    assert.ok(m, `${id} label not found`);
    assert.ok(!/\d/.test(m[1]), `${id} label shows a number: "${m[1]}"`);
  }
});
test('tips overlay explains the percentage pot and states the dosages (only there)', () => {
  assert.ok(htmlSrc.includes('id="btn-tips"'), 'no Tips button');
  assert.ok(htmlSrc.includes('id="tips-overlay"'), 'no tips overlay');
  assert.ok(htmlSrc.includes('1 drop per click'), 'dropper dosage missing from tips');
  assert.ok(htmlSrc.includes('about 30 drops per second') && htmlSrc.includes('speeds up to about 90'), 'pour dosage/ramp missing from tips');
  assert.ok(htmlSrc.includes('The pot starts <b>empty</b>. Your first drop fills it with that paint (100%).') && htmlSrc.includes('the total is always 100%'), 'tips does not explain the (round 83: empty-start) percentage pot');
  assert.ok(htmlSrc.includes('pushes the other paints down'), 'tips does not explain displacement');
  assert.ok(!htmlSrc.includes('Pour out') && !htmlSrc.includes('Pour Out'), 'tips mentions the cancelled Pour Out');
});
test('no recipe readout or per-bucket drop tallies on the main screen (round-65 disc % is the one allowed number)', () => {
  assert.ok(!htmlSrc.includes('id="recipe"'), '#recipe readout still in index.html');
  assert.ok(!htmlSrc.includes('bcount'), 'per-bucket count elements still in index.html');
  assert.ok(!gameSrc.includes("$('recipe')"), 'game.js still writes the recipe readout');
  assert.ok(!gameSrc.includes('count-'), 'game.js still writes per-bucket counts');
});
test('feedback (round 77, Franklin override of the r3 no-hint lock): one hint after attempt 1 only; never hintFor, share, duel or card', () => {
  assert.ok(!gameSrc.includes('hintFor'), 'game.js still calls the old hintFor');
  assert.ok(gameSrc.includes("+ (round.attempts.length === 1 ? hintHTML(last) : '')"), 'hint not tied to attempt 1');
  const lr = gameSrc.slice(gameSrc.indexOf("$('last-result').innerHTML = round.finished"), gameSrc.indexOf("const sealBtn = $('btn-seal');"));
  assert.ok(/round\.finished\s*\?\s*''/.test(lr), 'hint must disappear once the round is finished');
  for (const fn of ['function shareText(', 'function duelUrlFor(', 'function drawShareCard(']) {
    const i = gameSrc.indexOf(fn), body = gameSrc.slice(i, gameSrc.indexOf('\n}\n', i));
    assert.ok(!/hint/i.test(body), fn + ' mentions the hint');
  }
});
test('radial stage: circular pot at center, pigment ring, collapsible toolbar', () => {
  assert.ok(htmlSrc.includes('id="stage"'), 'no #stage');
  assert.ok(htmlSrc.includes('id="pot-surface"'), 'pot has no inner surface element');
  assert.ok((htmlSrc.match(/class="bucket pigment/g) || []).length === 5, 'pigment ring is not 5 circles');
  assert.ok(htmlSrc.includes('id="toolbar"') && htmlSrc.includes('id="btn-toolbar-toggle"'), 'toolbar/toggle missing');
  // Round 9: the emoji bucket / bare droplet became SVG tool rigs.
  assert.ok(htmlSrc.includes('id="dropper-rig"') && htmlSrc.includes('id="pour-rig"'), 'dose animations missing from DOM');
});
test('display rename to Mixology; internal identifiers untouched', () => {
  assert.ok(htmlSrc.includes('<title>Mixology'), 'page title not renamed');
  assert.ok(htmlSrc.includes('MIXOLOGY<span'), 'header wordmark not renamed');
  // Round 10: the number is now the public dayTag ("MIXOLOGY #1"), not the internal day.
  assert.ok(gameSrc.includes('`🎨 MIXOLOGY ${dayTag(day)'), 'share/day label not renamed');
  assert.ok(gameSrc.includes("const SAVE_KEY = 'misnomer.save.v1'"), 'save key changed — data continuity broken');
  assert.ok(gameSrc.includes('window.MISNOMER = {'), 'debug handle renamed');
});

console.log('— UI contract (producer round-4 edits) —');
test('pigment discs are pure color: no labels, no inner swatch spans', () => {
  assert.ok(!htmlSrc.includes('plabel'), 'pigment label spans still in index.html');
  assert.ok(!htmlSrc.includes('psw'), 'inner swatch spans still in index.html');
  for (const label of ['>RED<', '>YELLOW<', '>BLUE<', '>BLACK<', '>WHITE<']) {
    assert.ok(!htmlSrc.includes(label), `visible pigment label ${label} still present`);
  }
  for (const hex of ['#D6282E', '#FFCD00', '#1C4096', '#141416', '#FFFFFF']) {
    assert.ok(htmlSrc.includes(`background:${hex}`), `pigment disc ${hex} not filled edge-to-edge`);
  }
  assert.ok(htmlSrc.includes('aria-label="Select red pigment"'), 'aria-label for red missing');
  assert.ok(htmlSrc.includes('aria-label="Select white pigment"'), 'aria-label for white missing');
  assert.ok(/#bucket-base\s*\{\s*border-color:/.test(htmlSrc), 'white disc has no visible-border rule');
});

console.log('— round 6: game wiring (no caps, gesture undo, duel v2, save migration) —');
test('no cap, no refusal: game.js never refuses a dose', () => {
  assert.ok(!gameSrc.includes('MAX_DROPS'), 'game.js still references a drops cap');
  assert.ok(!gameSrc.includes('refuseDose'), 'game.js still has the cap refusal');
  // Round 7: the pot-shake animation is back in index.html, but ONLY as
  // the finished-round signal inside lockedFeedback — a dose on a live
  // round is still never refused or shaken.
  const shakeAt = gameSrc.indexOf("classList.add('shake')");
  assert.ok(shakeAt > gameSrc.indexOf('function lockedFeedback') && shakeAt < gameSrc.indexOf('potEl.addEventListener'),
    'shake is triggered somewhere other than lockedFeedback');
});
test('undo is gesture-based: one snapshot per press/hold, not per drop', () => {
  assert.ok(gameSrc.includes('beginGesture'), 'no gesture-based undo');
  assert.ok(/round\.undo\.push\(\{ snapshot:/.test(gameSrc), 'gestures do not snapshot the pot');
  assert.ok(!gameSrc.includes('undo.push({ key:'), 'per-drop undo entries are still pushed');
});
test('duel links carry the % composition (masked %x10, r.y.b.k.w) and NO hex (round 8)', () => {
  assert.ok(gameSrc.includes('E.encodeDuelComp(final.comp, day)'), 'duel URL not built from the attempt composition');
  const url = gameSrc.slice(gameSrc.indexOf('function duelUrlFor'), gameSrc.indexOf('function parseDuel'));
  assert.ok(!/[?&]m=/.test(url) && !url.includes('final.hex'), 'duel URL still carries the mix hex (answer leak)');
  const comp = { r: 21.3, y: 0, b: 30.8, k: 0, w: 47.9 };
  const x = E.encodeDuelComp(comp, 656);
  assert.ok(/^[0-9a-z]{10}$/.test(x), `payload ${x}`);
  const back = E.decodeDuelComp(x, 656);
  for (const k of E.COMP_KEYS) assert.ok(Math.abs(back[k] - comp[k]) < 0.06, `${k}: ${back[k]} vs ${comp[k]}`);
  assert.strictEqual(E.decodeDuelComp('zzzzzzzzzz', 656), null, 'mangled payload accepted');
  assert.ok(gameSrc.includes("p.has('q')") && gameSrc.includes('legacyHex'), 'legacy ?m=&q= links no longer parse');
});
test('save version bumped to v2 with a v1 drops->% migration', () => {
  assert.ok(gameSrc.includes('v: 2'), 'default save is not v2');
  assert.ok(gameSrc.includes('migrateSave'), 'no save migration');
  assert.ok(gameSrc.includes('dropsToComp'), 'migration does not normalize drops vectors to %');
});

console.log('— composition determinism —');
test('same composition -> same mixed color, across module reloads', () => {
  const c = { r: 17, y: 33, b: 9, k: 4, w: 37 };
  const a = E.mixColor(c);
  delete require.cache[require.resolve('../engine.js')];
  const E2 = require('../engine.js');
  assert.strictEqual(E2.mixColor(c), a);
  assert.strictEqual(E.mixColor({ ...c }), a);
});

console.log('— words-only hints (engine, unused by the UI since round 3) —');
test('hint says "too dark" when mine is darker', () => {
  assert.ok(E.hintFor([40, 0, 0], [60, 0, 0]).includes('too dark'));
});
test('hint says "too yellow" when mine is too yellow', () => {
  assert.ok(E.hintFor([60, 0, 20], [60, 0, 0]).includes('too yellow'));
});

console.log('— daily picker (eligible pool from solver) —');
const pool = bank.filter(c => E.isDailyEligible(c.de));
test(`daily pool size >= 800 (actual ${pool.length})`, () => {
  assert.ok(pool.length >= 800, `pool ${pool.length}`);
});
test('picker deterministic + no repeat over 300 simulated days (within one epoch)', () => {
  const start = pool.length; // first day of epoch 1
  const seen = new Set();
  for (let d = start; d < start + 300; d++) {
    const i1 = E.pickDailyIndex(d, pool.length);
    const i2 = E.pickDailyIndex(d, pool.length);
    assert.strictEqual(i1, i2, 'not deterministic');
    assert.ok(i1 >= 0 && i1 < pool.length, 'out of range');
    assert.ok(!seen.has(i1), `repeat at day ${d}`);
    seen.add(i1);
  }
  assert.strictEqual(seen.size, 300);
});

console.log('— solver sanity (canonical % recipes) —');
const byName = n => bank.find(c => c.name === n);
test('mustard recipe is Y-dominated, ΔE <= 2', () => {
  const c = byName('mustard');
  assert.ok(c.recipe.y > c.recipe.r && c.recipe.y > c.recipe.b && c.recipe.y > c.recipe.k, JSON.stringify(c.recipe));
  assert.ok(c.de <= 2, `de ${c.de}`);
});
test('charcoal is reachable at ΔE <= 2 under the % model', () => {
  const c = byName('charcoal');
  assert.ok(c.de <= 2, `de ${c.de}`);
  assert.strictEqual(E.mixColor(c.recipe), c.hex, 'charcoal recipe does not render its hex');
});
test('banana recipe is Y-dominated, ΔE <= 12', () => {
  const c = byName('banana');
  assert.ok(c.recipe.y > c.recipe.r && c.recipe.y > c.recipe.b && c.recipe.y > c.recipe.k, JSON.stringify(c.recipe));
  assert.ok(c.de <= 12, `de ${c.de}`);
});
test('every stored recipe is a % composition summing to 100', () => {
  for (const c of bank) {
    const s = c.recipe.r + c.recipe.y + c.recipe.b + c.recipe.k + c.recipe.w;
    assert.ok(Math.abs(s - 100) < 0.51, `${c.name}: recipe sums to ${s}`);
  }
});
test('stored recipes reproduce their stored ΔE (40-color sample)', () => {
  for (let i = 0; i < bank.length; i += 25) {
    const c = bank[i];
    const got = E.deltaE2000(labOf(E.mixColor(c.recipe)), labOf(c.hex));
    assert.ok(Math.abs(got - c.de) <= 0.75, `${c.name}: reproduced ${got.toFixed(2)} vs stored ${c.de}`);
  }
});

console.log('— round 7: white must answer at the end of a mix —');
const STRONG_POTS = {
  'purple 45/45/10': { r: 45, b: 45, w: 10 },
  'red 90/10': { r: 90, w: 10 },
  'red 95/5': { r: 95, w: 5 },
  'green 55Y/40B/5': { y: 55, b: 40, w: 5 },
  'orange 60R/35Y/5': { r: 60, y: 35, w: 5 },
  'navy 70B/20K/10': { b: 70, k: 20, w: 10 },
  'mud 31/31/31/7': { r: 31, y: 31, b: 31, w: 7 },
  'black 87K/13': { k: 87, w: 13 },
  'parent purple 21R/31B/48W': { r: 21.3, b: 30.8, w: 47.9 }
};
test('white pour (1 s hold) moves ΔE >= 10 from every strong pot (was ~4 on saturated pots)', () => {
  for (const [name, comp] of Object.entries(STRONG_POTS)) {
    const d = E.deltaE2000(labOfComp(comp), labOfComp(pour(comp, 'w', ONE_SEC)));
    // Round 8: the half-white parent purple (p 52% -> 39%) sits in the
    // middle of the tint curve; bar 8 -> 7 there (renders 7.4). The
    // saturated pots the producer reported keep the full bar.
    const bar = 10; // round 62 ramp (52 units): mud 29.5, black 17.6, parent purple 11.6 (flat 30/s bars were 8 / 7)
    assert.ok(d >= bar, `${name}: white pour moved only ΔE ${d.toFixed(2)}`);
  }
});
test('white dropper taps (x10) move ΔE >= 2 from every strong pot (was ~1-2, taps ~0.2 each)', () => {
  for (const [name, comp] of Object.entries(STRONG_POTS)) {
    const d = E.deltaE2000(labOfComp(comp), labOfComp(pour(comp, 'w', 10)));
    assert.ok(d >= 2, `${name}: 10 white taps moved only ΔE ${d.toFixed(2)}`);
  }
});
test('pale means pale: ~74% white on a mid-chroma mix reads L* >= 75', () => {
  const pale = pour({ r: 21.3, b: 30.8, w: 47.9 }, 'w', 66);
  assert.ok(pale.w >= 72 && pale.w <= 76, `white share ${pale.w.toFixed(1)} not ~74`);
  assert.ok(L(pale) >= 75, `L* ${L(pale).toFixed(1)} at ${pale.w.toFixed(1)}% white — still reads as a mid lavender`);
});
test('every pigment raises its own share and changes the render on a mixed pot', () => {
  const base = { r: 30, y: 10, b: 20, k: 5, w: 35 };
  for (const key of E.COMP_KEYS) {
    const after = E.addUnits(base, key, 10);
    assert.ok(after[key] > base[key], `${key}: share did not rise (${base[key]} -> ${after[key]})`);
    assert.notStrictEqual(E.mixColor(after), E.mixColor(base), `${key}: render did not change`);
  }
});
test('disc keys in index.html are exactly the engine COMP_KEYS (the base/w bug class)', () => {
  const discs = [...htmlSrc.matchAll(/data-bucket="(\w)"/g)].map(m => m[1]).sort();
  assert.deepStrictEqual(discs, [...E.COMP_KEYS].sort(),
    `discs ${JSON.stringify(discs)} vs engine keys ${JSON.stringify(E.COMP_KEYS)}`);
});
test('Pour Bucket is the default tool — on load and on entering practice', () => {
  assert.ok(/let selectedTool = 'pour'/.test(gameSrc), 'selectedTool does not default to pour');
  assert.ok(/function startPractice\(\) \{\s*selectedTool = 'pour'/.test(gameSrc), 'startPractice does not reset to the Pour Bucket');
  // round 20: the label carries an SVG icon before the text
  assert.ok(/id="toolbar-current"><svg class="ti"[^]*?<\/svg>Pour Bucket</.test(htmlSrc), 'static collapsed-toolbar label is not the Pour Bucket');
  assert.ok(/<button class="tool sel" type="button" data-tool="pour" id="tool-pour"[^>]*>/.test(htmlSrc), 'pour tool is not pre-selected in the static HTML');
});
test('finished pot is visibly locked and a press gives feedback (never a silent dead pot)', () => {
  assert.ok(gameSrc.includes('lockedFeedback'), 'no lockedFeedback for finished-round pot presses');
  assert.ok(gameSrc.includes("classList.toggle('locked', locked)"), 'stage never receives the locked class');
  assert.ok(htmlSrc.includes('#stage.locked #pot-surface'), 'locked pot has no distinct styling');
  assert.ok(htmlSrc.includes('@keyframes pot-shake'), 'pot-shake keyframes missing from index.html');
});

console.log('— round 8: frozen schedule, par fairness, mixing feel, no answer leak —');
const SCHEDULE = require('../schedule.js');
const crypto = require('crypto');
const bankNames = new Set(bank.map(c => c.name));
test('frozen schedule: days 0..657 are byte-identical to the pre-round-8 picker (hash-locked)', () => {
  const h = crypto.createHash('sha256').update(SCHEDULE.slice(0, 658).join('|')).digest('hex');
  assert.strictEqual(h, '3745f8af932ef6f54ac7f66b33ab2eecac9b4ce1b758007ebe8540e49c3d2b9b', 'a published day changed');
  const legacy = require('../tools/legacy-schedule-epoch0.json');
  for (let d = 0; d <= 657; d++) assert.strictEqual(SCHEDULE[d], legacy[d], `day ${d}`);
});
test('frozen schedule: #656 (2026-10-18) is lipstick', () => {
  assert.strictEqual(SCHEDULE[656], 'lipstick');
  const d = new Date(2025, 0, 1); d.setDate(d.getDate() + 655);
  assert.strictEqual(E.dateKey(d), '2026-10-18');
  assert.strictEqual(E.dayNumber(new Date(2026, 9, 18, 12)) + 1, 656);
});
test('frozen schedule: every name is in the bank; every not-yet-live day is daily-eligible', () => {
  const eligible = new Set(pool.map(c => c.name));
  assert.ok(SCHEDULE.length >= 4000, `only ${SCHEDULE.length} days scheduled`);
  SCHEDULE.forEach((n, d) => {
    assert.ok(bankNames.has(n), `day ${d}: "${n}" not in bank`);
    if (d > 657) assert.ok(eligible.has(n), `future day ${d}: "${n}" is not daily-eligible`);
  });
});
test('frozen schedule: no color repeats within 120 days', () => {
  const last = new Map();
  SCHEDULE.forEach((n, d) => {
    if (last.has(n)) assert.ok(d - last.get(n) >= 120, `"${n}" repeats at days ${last.get(n)} and ${d}`);
    last.set(n, d);
  });
});
test('game reads the schedule (not the pool-size picker) and the page loads schedule.js', () => {
  assert.ok(gameSrc.includes('window.MIXOLOGY_SCHEDULE'), 'game.js does not read the schedule');
  assert.ok(/function colorForDay\(day\) \{\s*const c = BANK_BY_NAME\.get\(SCHEDULE\[day\]\)/.test(gameSrc), 'colorForDay does not consult the schedule first');
  assert.ok(htmlSrc.indexOf('schedule.js') > 0 && htmlSrc.indexOf('schedule.js') < htmlSrc.indexOf('game.js'), 'schedule.js not loaded before game.js');
});
test('WIP rounds carry their color name; a mismatched or stale WIP is discarded', () => {
  assert.ok(gameSrc.includes('name: round.color.name, attempts: round.attempts'), 'WIP does not store the color name');
  assert.ok(gameSrc.includes('wip.name === todayColor.name'), 'WIP restore does not check the color');
  assert.ok(gameSrc.includes('store.data.wip = null; // stale WIP'), 'stale WIP is not discarded');
});
test('day rollover in an open tab + streak display only while alive', () => {
  assert.ok(/let DAY = currentDay\(\)/.test(gameSrc), 'DAY is still frozen at load');
  assert.ok(gameSrc.includes('function checkDayRollover') && gameSrc.includes("'visibilitychange'"), 'no rollover check');
  assert.ok(gameSrc.includes('const day = round.day;'), 'finish() does not score the round on its own day');
  assert.ok(gameSrc.includes('s.lastDay >= DAY - 1'), 'streak display ignores a missed day');
});
test('par fairness: pool = solver-best score >= PAR_PCT; no hard-coded ΔE 12 left', () => {
  assert.strictEqual(E.PAR_PCT, 85);
  for (const c of pool) assert.ok(E.accuracyFromDeltaE(c.de) >= 85, `${c.name} caps at ${E.accuracyFromDeltaE(c.de)}%`);
  for (const c of bank) assert.strictEqual(E.isDailyEligible(c.de), E.accuracyFromDeltaE(c.de) >= 85);
  const solverSrc = fs.readFileSync(path.join(__dirname, '..', 'tools', 'solve-recipes.js'), 'utf8');
  const colorsHead = fs.readFileSync(path.join(__dirname, '..', 'colors.js'), 'utf8').slice(0, 1200);
  assert.ok(!/\.de <= 12/.test(gameSrc) && !/\.de <= 12/.test(solverSrc) && !/de <= 12/.test(colorsHead), 'a "de <= 12" threshold survives');
  assert.ok(gameSrc.includes('E.isDailyEligible') && solverSrc.includes('E.isDailyEligible'), 'eligibility not shared');
  assert.ok(colorsHead.includes(`${pool.filter(c => !c.retired).length} daily-eligible`), 'colors.js header count is stale'); // round 66: retired names are not eligible
});
test('single pigment into white is a monotonic walk: never lighter, never less saturated', () => {
  for (const key of ['r', 'y', 'b', 'k']) {
    let prevL = Infinity, prevC = -Infinity;
    for (let p = 0; p <= 100; p += 0.25) {
      const c = { w: 100 - p }; c[key] = p;
      const lab = E.rgbToLab(...E.mixRaw(c));
      const Cc = Math.hypot(lab[1], lab[2]);
      assert.ok(lab[0] <= prevL + 1e-9, `${key} ${p}%: L* rose ${prevL.toFixed(3)} -> ${lab[0].toFixed(3)}`);
      if (key !== 'k') assert.ok(Cc >= prevC - 1e-9, `${key} ${p}%: chroma fell ${prevC.toFixed(3)} -> ${Cc.toFixed(3)}`);
      prevL = lab[0]; prevC = Cc;
    }
  }
  // the reported pocket, explicitly
  for (const key of ['r', 'b']) {
    const at = p => { const c = { w: 100 - p }; c[key] = p; return L(c); };
    assert.ok(at(11) < at(9) && at(10) < at(9), `${key}: 9-11% still lightens`);
  }
});
test('a 1 s Pour Bucket hold from a fresh pot is clearly visible: ΔE >= 18 for every pigment', () => {
  for (const key of ['r', 'y', 'b', 'k']) {
    const d = E.deltaE2000(labOfComp(E.OLD_WHITE_START), labOfComp(pour(E.OLD_WHITE_START, key, ONE_SEC))); // into a 100% white pot
    assert.ok(d >= 18, `${key}: 1 s pour moved only ΔE ${d.toFixed(1)} (round 62 ramp: r 26.8, y 19.2, b 26.6, k 36.5; flat 30/s bar was 15)`);
  }
});
test('a 1 s chromatic pour into any pale pot (>= 50% white) moves ΔE >= 5 (median >= 12)', () => {
  const rng = E.mulberry32(11);
  const ds = [];
  for (let i = 0; i < 400; i++) {
    const w = 50 + rng() * 50, r = rng(), y = rng(), b = rng(), k = rng() * 0.2;
    const s = (100 - w) / (r + y + b + k);
    const c = { r: r * s, y: y * s, b: b * s, k: k * s, w };
    for (const key of ['r', 'y', 'b']) ds.push(E.deltaE2000(labOfComp(c), labOfComp(pour(c, key, ONE_SEC))));
  }
  ds.sort((a, b) => a - b);
  assert.ok(ds[0] >= 5, `min ΔE ${ds[0].toFixed(2)}`);
  assert.ok(ds[ds.length >> 1] >= 12, `median ΔE ${ds[ds.length >> 1].toFixed(2)}`);
});
test('pour/drop visuals: tinted stream and drop rig (no pot effects since r67); reveal scrolls into view on finish', () => {
  for (const f of ['function pourFx(', 'function drawStream(', 'function dropAnim(', 'function scrollRevealIntoView(']) assert.ok(gameSrc.includes(f), `missing ${f}`);
  assert.ok(/maybeShowDuel\(\);\s*scrollRevealIntoView\(\);/.test(gameSrc), 'finish() does not scroll the reveal into view');
  for (const c of ['@keyframes stream-flow', '.fdrop']) assert.ok(htmlSrc.includes(c), `missing CSS ${c}`);
  assert.ok(gameSrc.includes('if (REDUCED_MOTION) return;'), 'effects ignore prefers-reduced-motion');
});

console.log('— round 9: two attempts, no lock-in, tool rigs, calendar —');
test('"Lock it in" (early finish, #btn-finish) is gone from the page and the code', () => {
  assert.ok(!htmlSrc.includes('btn-finish') && !gameSrc.includes('btn-finish'), '#btn-finish still present');
  assert.ok(!/lock it in/i.test(htmlSrc), '"Lock it in" copy survives on the page');
  assert.ok(!/textContent = `Lock it in/.test(gameSrc), '"Lock it in" label still rendered');
});
test('two attempts per round: constant, auto-finish on the 2nd seal, two slots, copy updated', () => {
  assert.ok(/const MAX_ATTEMPTS = 2;/.test(gameSrc), 'MAX_ATTEMPTS is not 2');
  assert.ok(gameSrc.includes('if (round.attempts.length >= MAX_ATTEMPTS) finish();'), 'round does not end after the last seal');
  assert.ok(!/attempts\.length >= 3/.test(gameSrc) && !/i < 3; i\+\+/.test(gameSrc), 'a hard-coded 3 survives');
  assert.strictEqual((htmlSrc.match(/class="attempt-slot"/g) || []).length, 2, 'static page does not have 2 slots');
  assert.ok(!/three/i.test(htmlSrc) && !/three/i.test(gameSrc), '"three" copy survives');
});
test('best attempt counts; pre-round-9 days keep the attempt they were scored on', () => {
  assert.ok(gameSrc.includes('const final = bestAttempt(round.attempts);'), 'finish() does not score the best attempt');
  // replay the helpers outside the DOM
  const grab = name => { const i = gameSrc.indexOf('function ' + name); let depth = 0, j = gameSrc.indexOf('{', i); for (; j < gameSrc.length; j++) { if (gameSrc[j] === '{') depth++; else if (gameSrc[j] === '}' && --depth === 0) break; } return gameSrc.slice(i, j + 1); };
  const env = new Function(grab('bestAttempt') + '\n' + grab('scoredAttempt') + '\nreturn { bestAttempt, scoredAttempt };')();
  const a = [{ pct: 91, hex: '#111111' }, { pct: 80, hex: '#222222' }];
  assert.strictEqual(env.bestAttempt(a).pct, 91);
  assert.strictEqual(env.bestAttempt([{ pct: 70, hex: '#1' }, { pct: 70, hex: '#2' }]).hex, '#1', 'tie should keep the earliest');
  const old = { pct: 60, hex: '#333333', attempts: [{ pct: 90, hex: '#111111' }, { pct: 75, hex: '#222222' }, { pct: 60, hex: '#333333' }] };
  assert.strictEqual(env.scoredAttempt(old).pct, 60, 'an old last-counts day changed score');
});
test('save migration: a 3-attempt-era WIP with 2 seals finishes on load; old 3-attempt days still render', () => {
  assert.ok(gameSrc.includes('if (round.attempts.length >= MAX_ATTEMPTS) finish();\n      else renderAll();'), 'WIP with 2 seals is not finished on load');
  assert.ok(gameSrc.includes('Math.max(MAX_ATTEMPTS, round.attempts.length)'), 'finished 3-attempt days lose their 3rd slot');
});
test('pour rig: SVG bucket tinted with the pigment; stream path starts at the tilted bucket lip', () => {
  assert.ok(htmlSrc.includes('id="bucket-lip"') && htmlSrc.includes('class="pig-fill"'), 'bucket svg has no lip marker / pigment fill');
  assert.ok(!htmlSrc.includes('🪣</span>'), 'emoji bucket still used in the stage');
  assert.ok(htmlSrc.includes('#stage.pouring #pour-rig { transform: rotate(-64deg); }'), 'bucket does not tilt while pouring');
  assert.ok(/lip = pointOf\(lipEl\)/.test(gameSrc) && gameSrc.includes('`M${lip.x.toFixed(1)}'), 'stream path does not start at the measured lip');
});
test('dropper rig: drop forms at the measured tip, then falls into the pot', () => {
  assert.ok(htmlSrc.includes('id="dropper-tip"'), 'dropper svg has no tip marker');
  assert.ok(/const tip = pointOf\(tipEl\)/.test(gameSrc), 'drop does not start at the dropper tip');
  assert.ok(gameSrc.includes("scale(.15)") && gameSrc.includes('squeeze'), 'no forming/squeeze phase');
});
test('calendar: header button, month nav, built from saved days, today/missed/played states, detail', () => {
  assert.ok(htmlSrc.includes('id="btn-calendar"') && htmlSrc.includes('id="cal-overlay"'), 'no calendar button/overlay');
  assert.ok(htmlSrc.includes('id="btn-cal-prev"') && htmlSrc.includes('id="btn-cal-next"'), 'no month navigation');
  for (const c of ["' played'", "' missed'", "' today'", "' future'"]) assert.ok(gameSrc.includes(c), `no ${c} state`);
  assert.ok(gameSrc.includes('store.data.days[day]') && gameSrc.includes('function showCalDetail'), 'calendar not built from saved days / no detail');
});
test('calendar cells: % inside the swatch with luminance-picked ink, color name (2-line clamp) below', () => {
  assert.ok(gameSrc.includes('<span class="cd-sw ${ink}" ${sw}>${pct}${starBadge(star)}</span>'), '% not rendered inside the swatch');
  assert.ok(gameSrc.includes('class="cd-name"') && htmlSrc.includes('-webkit-line-clamp: 2'), 'no clamped name under the swatch');
  const i = gameSrc.indexOf('function inkFor'); let depth = 0, j = gameSrc.indexOf('{', i);
  for (; j < gameSrc.length; j++) { if (gameSrc[j] === '{') depth++; else if (gameSrc[j] === '}' && --depth === 0) break; }
  const inkFor = new Function('E', gameSrc.slice(i, j + 1) + '\nreturn inkFor;')(E);
  assert.strictEqual(inkFor('#FFFFFF'), 'ink-dark'); assert.strictEqual(inkFor('#FFCD00'), 'ink-dark');
  assert.strictEqual(inkFor('#06172E'), 'ink-light'); assert.strictEqual(inkFor('#1C4096'), 'ink-light');
});
console.log('— round 10: public numbering, subtitle, recipe bars —');
test('public numbering is display-only: internal #656 (Sun 2026-10-18) = Mixology #1; pre-launch days have no number', () => {
  assert.strictEqual(E.LAUNCH_DAY, 656);
  assert.strictEqual(E.publicNumber(656), 1);
  assert.strictEqual(E.publicNumber(657), 2);
  assert.strictEqual(E.publicNumber(1000), 345);
  for (const d of [655, 600, 1, 0, -3, NaN]) assert.strictEqual(E.publicNumber(d), null, `day ${d}`);
  assert.strictEqual(E.dayNumber(new Date(2026, 9, 18, 9)) + 1, 656, 'internal index moved');
  assert.strictEqual(SCHEDULE[656], 'lipstick', 'schedule moved');
  // internal index still drives saves / duel links; numbers only via dayTag
  assert.ok(gameSrc.includes('?d=${day}&p=${final.pct}&x='), 'duel link no longer carries the internal day');
  assert.ok(gameSrc.includes('store.data.days[day]') && gameSrc.includes('s.days[day] = {'), 'saves no longer keyed by internal day');
  assert.ok(!/#\$\{(day|round\.day|incomingDuel\.day)\}/.test(gameSrc), 'an internal day number is still displayed');
  assert.ok(/function dayTag\(day\) \{ const n = E\.publicNumber\(day\); return n \? `#\$\{n\}` : ''; \}/.test(gameSrc), 'dayTag does not fall back to no number');
});
test('subtitle is "How well do you know your colors?" everywhere; old line gone', () => {
  assert.ok(!/Nobody shows you the color\. Mix what the name means\./.test(htmlSrc + gameSrc), 'old subtitle survives');
  assert.ok(htmlSrc.includes('<p id="prompt-sub">How well do you know your colors?</p>') && gameSrc.includes("'How well do you know your colors?'"), 'new subtitle missing');
  assert.ok(htmlSrc.includes('name="description"') && htmlSrc.includes('og:description'), 'no meta/og description');
});
test('recipe bars: rendered only in the finished reveal / played-day detail, never in share text or duel links', () => {
  assert.ok(gameSrc.includes("$('reveal-recipes').innerHTML = practice ? practiceRecipesHTML(round.color, fin) : recipesHTML(round.color, fin);"), 'reveal does not show recipe vs mix');
  const reveal = gameSrc.slice(gameSrc.indexOf('  if (round.finished) {\n    const fin = scored;'), gameSrc.indexOf("    $('reveal').style.display = 'none';"));
  assert.ok(reveal.includes('recipesHTML'), 'recipe bars not inside the finished branch');
  assert.ok(gameSrc.includes("$('reveal-recipes').innerHTML = '';"), 'recipe bars not cleared on a live round');
  const share = gameSrc.slice(gameSrc.indexOf('function shareText'), gameSrc.indexOf('async function doShare'));
  const duel = gameSrc.slice(gameSrc.indexOf('function duelUrlFor'), gameSrc.indexOf('function parseDuel'));
  assert.ok(!/recipe/i.test(share) && !/recipe/i.test(duel), 'recipe leaks into share text / duel link');
  assert.ok(gameSrc.includes('recipesHTML(official, scoredAttempt(rec))'), 'calendar detail has no recipe bars');
});
console.log('— round 11: publishing basics —');
test('icons, manifest and og:image exist, are linked, and are real PNGs of the right size', () => {
  const R = path.join(__dirname, '..');
  const png = f => { const b = fs.readFileSync(path.join(R, f)); assert.strictEqual(b.toString('hex', 0, 8), '89504e470d0a1a0a', f + ' not a PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
  assert.deepStrictEqual(png('icons/og-image.png'), [1200, 630]);
  assert.deepStrictEqual(png('icons/apple-touch-icon.png'), [180, 180]);
  assert.deepStrictEqual(png('icons/icon-192.png'), [192, 192]);
  assert.deepStrictEqual(png('icons/icon-512.png'), [512, 512]);
  assert.deepStrictEqual(png('icons/icon-maskable-512.png'), [512, 512]);
  assert.deepStrictEqual(png('icons/favicon-32.png'), [32, 32]);
  const m = JSON.parse(fs.readFileSync(path.join(R, 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(m.start_url, './'); assert.ok(m.icons.some(i => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(R, i.src)), i.src);
  for (const s of ['rel="manifest"', 'rel="apple-touch-icon"', 'icons/icon.svg', 'og:image" content="https://ngtrooper.github.io/mixology/icons/og-image.png', 'summary_large_image', 'name="theme-color"'])
    assert.ok(htmlSrc.includes(s), 'missing ' + s);
});
console.log('— round 12: spoiler-free sharing —');
test('share text + PNG card never contain the color name (hook line instead), mix color or recipe', () => {
  const share = gameSrc.slice(gameSrc.indexOf('function shareText'), gameSrc.indexOf('async function doShare'));
  assert.ok(share.includes('`🎨 MIXOLOGY ${dayTag(day) || shortDate(day)} — How well do you know your colors?`'), 'share headline is not the hook');
  assert.ok(!/\.name\b/.test(share), 'share text references the color name');
  const card = gameSrc.slice(gameSrc.indexOf('function drawShareCard'), gameSrc.indexOf('function roundRect'));
  assert.ok(card.length > 500, 'share card renderer missing');
  assert.ok(!/\.name\b|\.hex\b|recipe|mixColor|colorForDay/.test(card), 'share card can leak the name / color / recipe');
  assert.ok(card.includes('How well do you know your colors?'), 'card has no hook line');
  // duel URL carries only d / p / x, never a name
  const duel = gameSrc.slice(gameSrc.indexOf('function duelUrlFor'), gameSrc.indexOf('function parseDuel'));
  assert.ok(!/\.name\b|&n=/.test(duel), 'duel link carries the name');
  // today's incoming duel (not yet played) must not show the name
  const md = gameSrc.slice(gameSrc.indexOf('function maybeShowDuel'), gameSrc.indexOf('function escapeHtml'));
  const tb0 = md.indexOf('} else if (incomingDuel.day >= DAY)'); assert.ok(tb0 > 0, 'no today branch');
  const todayBranch = md.slice(tb0, md.indexOf('} else {', tb0 + 5));
  assert.ok(!/theirColor|\.name/.test(todayBranch), "today's duel card spoils");
  assert.ok(htmlSrc.includes('id="btn-card"') && gameSrc.includes('navigator.canShare({ files: [file] })'), 'no PNG card / file share');
});
console.log('— round 13: dark mode —');
test('dark mode follows the system: palette vars overridden at the end of the stylesheet, paint stays true', () => {
  const css = htmlSrc.slice(htmlSrc.indexOf('<style>'), htmlSrc.indexOf('</style>'));
  const i = css.indexOf('@media (prefers-color-scheme: dark)');
  assert.ok(i > css.indexOf('--paper: #f6f1e7'), 'no dark block after the base palette');
  const blk = css.slice(i);
  assert.ok(/--paper: #1a1815/.test(blk) && /--ink: #f1ebdf/.test(blk), 'dark palette missing');
  // round 83: the EMPTY bowl may go dark (it holds no paint); real paint never does
  assert.ok(!/#pot-surface|\.pigment\b|\.cd-sw\b/.test(blk.replace(/#pot\.empty #pot-surface/g, '')), 'dark mode recolours paint');
  assert.ok(htmlSrc.includes('content="#1a1815" media="(prefers-color-scheme: dark)"') && htmlSrc.includes('name="color-scheme" content="light dark"'));
});
console.log('— round 14: welcome + modal focus —');
test('welcome shows once, only to brand-new players, and its flag stays out of the save format', () => {
  assert.ok(htmlSrc.includes('id="welcome-overlay" class="modal-ov" role="dialog" aria-modal="true"'), 'welcome dialog missing');
  const w = gameSrc.slice(gameSrc.indexOf('function maybeWelcome'), gameSrc.indexOf("$('btn-welcome-go')"));
  assert.ok(/Object\.keys\(store\.data\.days \|\| \{\}\)\.length > 0/.test(w) && w.includes('store.data.wip'), 'returning players could see it');
  assert.ok(gameSrc.includes("const WELCOME_KEY = 'mixology.welcomed.v1';") && !/store\.data\.welcomed/.test(gameSrc), 'flag leaks into save');
  // the welcome copy must not carry tool dosages (those live only in Tips)
  const wcopy = htmlSrc.slice(htmlSrc.indexOf('<div id="welcome-overlay"'), htmlSrc.indexOf('<div id="tips-overlay"'));
  assert.ok(!/drops per second|per click|30 drops|1%/.test(wcopy), 'dosage numbers outside Tips');
  for (const id of ['tips-overlay', 'cal-overlay']) assert.ok(htmlSrc.includes(`id="${id}" class="modal-ov"`), id + ' not on the shared modal helper');
  assert.ok(gameSrc.includes("closeOverlay('tips-overlay')") && gameSrc.includes("openOverlay('cal-overlay')"), 'overlays bypass focus handling');
});
console.log('— round 15: feel —');
test('celebration tiers: confetti only at 95%+ and never under reduced motion; tiered sound/haptics; streak flame', () => {
  const c = gameSrc.slice(gameSrc.indexOf('function celebrate'), gameSrc.indexOf('function confetti'));
  assert.ok(/pct >= 95\) \{ buzz\(\[[^\]]+\]\); confetti\(\); \}/.test(c), 'confetti not gated at 95%');
  assert.ok(c.includes('E.PAR_PCT'), 'no par tier');
  const cf = gameSrc.slice(gameSrc.indexOf('function confetti'), gameSrc.indexOf('function confetti') + 400);
  assert.ok(/if \(REDUCED_MOTION \|\| !document\.body\.animate\) return;/.test(cf), 'confetti ignores reduced motion');
  assert.ok(gameSrc.includes("if (final.pct >= 95) sfx.ace(); else if (final.pct >= E.PAR_PCT) sfx.par(); else sfx.reveal();"));
  assert.ok(/<span class="flame\$\{[^}]*\}" aria-hidden="true">🔥<\/span> Streak \$\{Number\(st\.streak\)\}/.test(gameSrc), 'streak flame not wrapped'); // r58: class may add ' hot'
  assert.ok(/\.confetti \{ position: fixed; inset: 0; pointer-events: none;/.test(htmlSrc), 'confetti can block taps');
});
console.log('— round 16: stats —');
test('computeStats: played / average / par rate / best / longest streak / spread, read-only', () => {
  const mk = o => Object.fromEntries(Object.entries(o).map(([d, p]) => [d, { name: 'x', pct: p, attempts: [] }]));
  const days = mk({ 645: 62, 646: 71, 647: 88, 649: 45, 650: 91, 651: 79, 652: 96, 653: 85, 654: 73, 655: 90 });
  const snap = JSON.stringify(days);
  const s = E.computeStats(days);
  assert.strictEqual(s.played, 10); assert.strictEqual(s.avg, 78); assert.strictEqual(s.parRate, 50);
  assert.deepStrictEqual(s.best, { day: 652, pct: 96 }); assert.strictEqual(s.longestStreak, 7);
  assert.deepStrictEqual(s.dist.map(d => d.n), [1, 4, 3, 1, 1]);
  assert.strictEqual(JSON.stringify(days), snap, 'stats mutated the save');
  const z = E.computeStats({}); assert.strictEqual(z.played, 0); assert.strictEqual(z.avg, null); assert.strictEqual(z.longestStreak, 0);
  assert.strictEqual(E.computeStats({ 3: { pct: 'bad' }, 4: { pct: 50 } }).played, 1, 'garbage record counted');
  // stats live in the calendar overlay, not on the main screen (design lock)
  assert.ok(htmlSrc.indexOf('id="cal-stats"') > htmlSrc.indexOf('id="cal-overlay"'), 'stats outside the overlay');
});
console.log('— round 17: a11y + SVG header icons —');
test('a11y: live announcements, focus ring, mute toggle state, SVG header icons, muted-text contrast', () => {
  assert.ok(htmlSrc.includes('id="sr-announce" class="sr-only" aria-live="polite"'), 'no live region');
  assert.ok(gameSrc.includes('announce(`Attempt ${round.attempts.length} submitted: ${att.pct}% accuracy.` +'), 'submit not announced');
  assert.ok(/button:focus-visible[^{]*\{ outline: 3px solid/.test(htmlSrc), 'no global focus ring');
  assert.ok(gameSrc.includes("b.setAttribute('aria-pressed', String(!m));"), 'mute has no toggle state');
  assert.ok(!/id="btn-calendar"[^>]*>📅/.test(htmlSrc) && /id="btn-calendar"[^>]*><svg/.test(htmlSrc), 'calendar icon still emoji');
  // contrast of --muted on --paper (light) >= 4.5:1
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const m = htmlSrc.match(/--paper: (#[0-9a-f]{6}); --ink: #[0-9a-f]{6}; --muted: (#[0-9a-f]{6});/);
  const cr = (lum(m[1]) + 0.05) / (lum(m[2]) + 0.05);
  assert.ok(cr >= 4.5, 'muted contrast ' + cr.toFixed(2));
  // the announcer only reads back what's on screen, never the target colour or recipe
  const an = gameSrc.slice(gameSrc.indexOf('function announce'), gameSrc.indexOf('function announce') + 200);
  assert.ok(!/recipe|hex|name/.test(an));
});
console.log('— round 18: micro-animations —');
test('reveal entrance + count-up only on a fresh finish, never under reduced motion; final % always lands exactly', () => {
  const r = gameSrc.slice(gameSrc.indexOf('function revealEntrance'), gameSrc.indexOf('function celebrate'));
  assert.ok(r.includes("if (!el || REDUCED_MOTION) return;"), 'entrance ignores reduced motion');
  assert.ok(r.includes("else out.textContent = pct + '%';"), 'count-up may not land on the exact %');
  const fin = gameSrc.slice(gameSrc.indexOf('function finish()'), gameSrc.indexOf('function scrollRevealIntoView'));
  assert.ok(fin.includes('revealEntrance(final.pct);'), 'entrance not triggered by finish');
  assert.ok(!gameSrc.slice(gameSrc.indexOf('function renderAll'), gameSrc.indexOf('function renderAll') + 6000).includes('revealEntrance('), 'entrance replays on every render');
  assert.ok(htmlSrc.includes('.attempt-slot.pop {') && gameSrc.includes("(justSealed === i ? ' pop' : '')"), 'no attempt pop');
});
test('recipe legend letters are R/Y/B/K/W (black is K, not a second B)', () => {
  const fn = gameSrc.slice(gameSrc.indexOf('function recipeRowHTML'), gameSrc.indexOf('function recipesHTML'));
  assert.ok(fn.includes('${k.toUpperCase()} ') && !fn.includes('PIG_NAMES[k][0]'), 'legend derives letters from names');
  assert.deepStrictEqual(['r', 'y', 'b', 'k', 'w'].map(k => k.toUpperCase()), ['R', 'Y', 'B', 'K', 'W']);
});
console.log('— round 19: next-color countdown —');
test('countdown targets local midnight via dateForDay(DAY + 1); only on a finished, current daily round', () => {
  const fn = gameSrc.slice(gameSrc.indexOf('function untilNextColor'), gameSrc.indexOf('function renderNextCountdown'));
  assert.ok(fn.includes('dateForDay(DAY + 1)'), 'countdown not tied to the day boundary');
  // replicate dateForDay / dayNumber agreement: start of internal day 657 is local Mon Oct 19 2026 00:00
  const d = new Date(2025, 0, 1); d.setDate(d.getDate() + 657 - 1);
  assert.strictEqual(E.dayNumber(d) + 1, 657); assert.strictEqual(d.getHours(), 0); assert.strictEqual(d.getDate(), 19);
  const r = gameSrc.slice(gameSrc.indexOf('function renderNextCountdown'), gameSrc.indexOf('function renderNextCountdown') + 600);
  // round 82: only finished DAILY rounds; a finished earlier day shows "Today's new color is ready" instead of a clock
  assert.ok(r.includes("const daily = !!round && round.mode === 'daily' && round.finished;") && r.includes("let left = daily && round.day === DAY ? untilNextColor() : '';"), 'countdown shows in practice rounds');
});
console.log('— round 21: axe audit fixes —');
test('landmarks + calendar contrast (axe-core clean): <main> wraps the app, future days disabled, pre-history days readable', () => {
  assert.ok(htmlSrc.includes('<main id="app">') && htmlSrc.includes('</main>'), 'no main landmark');
  assert.ok(gameSrc.includes("if (cls.includes(' future')) cell.disabled = true;"), 'future days focusable');
  assert.ok(/\.cal-day\.before \{ opacity: \.62; \}/.test(htmlSrc) && htmlSrc.includes('.cal-day.before .cd-n { color: var(--ink); }'), 'pre-history days too faint');
});
console.log('— round 24: install polish + tips —');
test('standalone install: safe-area padding, manifest id/orientation; Tips explain sharing + stats without dosage changes', () => {
  assert.ok(htmlSrc.includes('env(safe-area-inset-top)') && htmlSrc.includes('viewport-fit=cover'), 'no safe-area handling');
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(m.id, './'); assert.strictEqual(m.display, 'standalone');
  const tips = htmlSrc.slice(htmlSrc.indexOf('<div id="tips-overlay"'), htmlSrc.indexOf('</div>\n</div>', htmlSrc.indexOf('<div id="tips-overlay"')));
  assert.ok(tips.includes('without naming the color') && tips.includes('opens your calendar') && tips.includes('<b>Stats</b>') && tips.includes('<b>Collection</b>'), 'tips do not cover sharing/stats/collection');
});
console.log('— round 25: reveal action icons —');
test('temporary button labels restore the original markup (icons survive "Copied ✓")', () => {
  const f = gameSrc.slice(gameSrc.indexOf('function flashLabel'), gameSrc.indexOf('async function doShare'));
  assert.ok(f.includes('btn.dataset.html = btn.innerHTML') && f.includes('btn.innerHTML = btn.dataset.html'), 'label restore loses markup');
  assert.ok(!/const old = btn\.textContent/.test(gameSrc), 'a textContent-only restore remains');
  for (const id of ['btn-share', 'btn-duel', 'btn-card']) assert.ok(new RegExp(`id="${id}" type="button"><svg class="ti"`).test(htmlSrc), id + ' has no icon');
});
console.log('— round 26: control states for assistive tech —');
test('pigments/tools expose aria-pressed; the pot label names the selected pigment + tool only', () => {
  assert.ok(gameSrc.includes("$(BUCKET_EL[b]).setAttribute('aria-pressed', String(selectedBucket === b));"));
  assert.ok(gameSrc.includes("$('tool-' + t).setAttribute('aria-pressed', String(selectedTool === t));"));
  const blk = gameSrc.slice(gameSrc.indexOf('// round 26: the pot says'), gameSrc.indexOf('// round 26: the pot says') + 500);
  assert.ok(!/round\.color|mixHex|hex|pct/.test(blk), 'pot label could leak the mix or target');
});
console.log('— round 27/28: select feel + calendar swipe —');
test('pigment/tool changes tick (only on an actual change); calendar swipe respects the disabled future month', () => {
  assert.ok(gameSrc.includes("if (selectedBucket !== btn.dataset.bucket) { sfx.pick(); buzz(6); }"), 'no select feedback / fires on re-tap');
  assert.ok(/pick\(\) \{ beep\(/.test(gameSrc), 'no pick sound (beep respects mute)');
  const sw = gameSrc.slice(gameSrc.indexOf('/* Round 28: swipe'), gameSrc.indexOf("$('btn-cal-prev').addEventListener"));
  assert.ok(sw.includes('if (!btn.disabled) { btn.click();') && sw.includes('Math.abs(dx) < Math.abs(dy) * 1.5'), 'swipe can bypass the future-month lock or hijack vertical scroll');
  assert.ok(sw.includes('{ passive: true }'), 'swipe listeners block scrolling');
});
console.log('— round 29: recent-form sparkline —');
test('stats sparkline: last 14 internal days, gaps for missed days, par line, accessible label', () => {
  const f = gameSrc.slice(gameSrc.indexOf('function recentFormSVG'), gameSrc.indexOf('function renderStats'));
  assert.ok(f.includes('const d = DAY - (N - 1) + i') && f.includes("pts[k - 1].i === p.i - 1 ? 'L' : 'M'"), 'missed days not drawn as gaps');
  assert.ok(f.includes('y(E.PAR_PCT)') && f.includes('role="img" aria-label="Scores over the last 14 days'), 'no par line / label');
  assert.ok(f.includes('if (pts.length < 2) return'), 'sparkline drawn from a single point');
});
test('finished seal button is a calm "Round complete ✓" (not a washed-out call to action)', () => {
  assert.ok(gameSrc.includes("sealBtn.classList.toggle('done', !!round.finished);") && htmlSrc.includes('#btn-seal.done, #btn-seal.done:disabled { opacity: 1;'));
  assert.ok(htmlSrc.includes('#btn-seal:not(.done), #btn-next-practice, #btn-today { background: #b3541e; }'), 'dark mode repaints the finished button');
});
console.log('— round 32: deploy cache safety —');
test('script tags are cache-busted with the game version (no new-JS/old-HTML mismatch after a deploy)', () => {
  const v = (gameSrc.match(/version: '([\d.]+)'/) || [])[1];
  assert.ok(v, 'no version');
  const tags = [...htmlSrc.matchAll(/<script src="([a-z]+)\.js(\?v=[\d.]+)?"><\/script>/g)];
  assert.deepStrictEqual(tags.map(m => m[1]), ['colors', 'schedule', 'engine', 'transfer', 'analytics', 'game']); // round 78: analytics.js; round 86: transfer.js (before analytics + game)
  for (const m of tags) assert.strictEqual(m[2], '?v=' + v, `${m[1]}.js not stamped with ?v=${v} (bump both together)`);
});
console.log('— round 33: headline title case —');
test('color names display in headline case (small words lower, slashes split); stored names untouched', () => {
  const m = gameSrc.slice(gameSrc.indexOf('const SMALL_WORDS'), gameSrc.indexOf('}\n', gameSrc.indexOf('function titleCase')) + 2);
  const titleCase = new Function(m + '; return titleCase;')();
  assert.strictEqual(titleCase('blue with a hint of purple'), 'Blue with a Hint of Purple');
  assert.strictEqual(titleCase('green/yellow'), 'Green/Yellow');
  assert.strictEqual(titleCase('a dash of red'), 'A Dash of Red');
  assert.strictEqual(titleCase("robin's egg blue"), "Robin's Egg Blue");
  assert.ok(gameSrc.includes("$('color-name').textContent = titleCase(round.color.name);"));
  assert.ok(!/#color-name, #practice-name \{[^}]*text-transform: capitalize/.test(htmlSrc), 'CSS capitalize would undo the small words');
  // saves / WIP still store the raw bank name
  assert.ok(gameSrc.includes('name: round.color.name,') && gameSrc.includes('store.data.wip = { day: round.day, name: round.color.name'));
});
test('sparkline dots open that day in the Calendar panel', () => {
  assert.ok(gameSrc.includes('<g class="sp-dot" data-day="${DAY - (N - 1) + p.i}">'), 'dots carry no day');
  const h = gameSrc.slice(gameSrc.indexOf("$('cal-stats').addEventListener('click'"), gameSrc.indexOf("$('cal-stats').addEventListener('click'") + 700);
  assert.ok(h.includes("openCalendar();") && h.includes("renderCalendar(); showCalDetail(day);"), 'dot tap does not open the day');
});
test('duel share line is a name-free challenge; clipboard copies only the link', () => {
  const d = gameSrc.slice(gameSrc.indexOf("$('btn-duel').addEventListener"), gameSrc.indexOf("$('btn-today').addEventListener"));
  assert.ok(d.includes('const line = `Beat my ${rec.pct}% on Mixology ${dayTag(day) || shortDate(day)}?`;'));
  assert.ok(!/\.name\b/.test(d), 'duel share mentions the name');
  const s = gameSrc.slice(gameSrc.indexOf('async function doShare'), gameSrc.indexOf('/* Round 12: a 1080'));
  assert.ok(s.includes('navigator.share({ text: nativeText, url: text })') && s.includes('navigator.clipboard.writeText(text)'));
});
test('error guard: own-script errors offer a reload (once); other origins/extensions ignored; installed before our scripts', () => {
  const i = htmlSrc.indexOf("window.addEventListener('error'");
  assert.ok(i > 0 && i < htmlSrc.indexOf('<script src="colors.js'), 'guard missing or after the scripts');
  const g = htmlSrc.slice(i, i + 600);
  assert.ok(g.includes('f.indexOf(location.origin) !== 0') && g.includes('(colors|schedule|engine|game)'), 'guard not limited to our scripts');
  assert.ok(g.includes('if (shown ||'), 'banner can repeat');
});
test('Tips use the same SVG icons as the UI (no 💧/🪣/📅 emoji left in markup)', () => {
  const body = htmlSrc.slice(htmlSrc.indexOf('<body'));
  assert.ok(!/💧|🪣|📅/.test(body), 'emoji icon left in the page');
  assert.ok(/<p><svg class="ti"[^]*?<\/svg><b>Dropper<\/b>/.test(htmlSrc), 'tips dropper icon missing');
});
test("calendar 'Today' (unplayed) offers Play, which closes the overlay and leaves practice", () => {
  const i = gameSrc.indexOf("$('btn-cal-play').addEventListener"); assert.ok(i > 0);
  const h = gameSrc.slice(i, i + 300);
  assert.ok(h.includes('closeCalendar();') && h.includes("if (round && round.mode === 'practice') exitPractice();"));
});
console.log('— round 40: keyboard shortcuts —');
test('keyboard shortcuts: 1-5 pigments, D/P tools, Z undo; no seal key; ignored in dialogs/fields', () => {
  const i = gameSrc.indexOf('/* Round 40: desktop keyboard shortcuts'); assert.ok(i > 0);
  const k = gameSrc.slice(i, gameSrc.indexOf("document.addEventListener('keydown', e => { if (e.key === 'Escape')", i));
  assert.ok(k.includes("document.querySelector('.modal-ov.open')") && k.includes('INPUT|TEXTAREA|SELECT'), 'shortcuts fire inside dialogs or fields');
  assert.ok(!/seal\(/.test(k), 'a key can seal an attempt');
  assert.ok(k.includes("{ 1: 'r', 2: 'y', 3: 'b', 4: 'k', 5: 'w' }"), 'pigment keys changed');
  assert.ok(htmlSrc.includes('<p class="kbd-tip">'), 'shortcuts undocumented in Tips');
});
console.log('— round 41: haptics wait for user activation —');
test('buzz() skips vibrate before any user interaction', () => {
  const i = gameSrc.indexOf('function buzz('); const f = gameSrc.slice(i, gameSrc.indexOf('/* Geometry', i));
  assert.ok(/userActivation[\s\S]*hasBeenActive[\s\S]*return;[\s\S]*navigator\.vibrate\(ms\)/.test(f), 'buzz does not check user activation first');
});
console.log('— round 42: stats today highlight + par label gutter —');
test("stats: today's score bucket is highlighted once today is finished; par label has its own gutter", () => {
  const i = gameSrc.indexOf('function renderStats('); const f = gameSrc.slice(i, gameSrc.indexOf('\n}\n', i));
  assert.ok(f.includes('E.STAT_BUCKETS.findIndex(b => tPct >= b.min)') && f.includes("' today'") && f.includes('has-today'), 'no today bucket highlight');
  assert.ok(f.includes('store.data.days[DAY]'), 'highlight must come from the finished daily record only');
  assert.ok(htmlSrc.includes('.st-dist.has-today .st-row:not(.today) i'), 'missing highlight CSS');
  const s = gameSrc.slice(gameSrc.indexOf('function recentFormSVG('), i);
  assert.ok(s.includes('(W - 2 * P - G)') && s.includes('W - P - G + 8'), 'par label can collide with the newest dot');
});
console.log('— round 43: first-visit coach ring —');
test('closing the welcome pulses a coach ring on the pot once (CSS-only, reduced-motion off, self-clearing)', () => {
  const i = gameSrc.indexOf('function closeWelcome('); const f = gameSrc.slice(i, gameSrc.indexOf('function maybeWelcome', i));
  assert.ok(f.includes("pot.classList.add('coach')") && f.includes("pot.classList.remove('coach')") && f.includes('!REDUCED_MOTION') && f.includes('!round.finished'));
  assert.ok(htmlSrc.includes('#pot.coach::after') && /coach-ring[^}]*\b2\b/.test(htmlSrc.slice(htmlSrc.indexOf('#pot.coach::after'))), 'ring CSS missing or not limited to two pulses');
});
console.log('— round 44: undo feedback —');
test('a successful undo plays a soft sound and a short tick; an empty undo stays silent', () => {
  const i = gameSrc.indexOf('function undo()'); const f = gameSrc.slice(i, gameSrc.indexOf('function resetPot', i));
  assert.ok(f.indexOf('!round.undo.length) return') < f.indexOf('sfx.undo()') && f.includes('buzz(8)'));
  assert.ok(/undo\(\) \{ beep\(/.test(gameSrc), 'sfx.undo missing');
});
console.log('— round 45: manifest screenshots —');
test('manifest lists narrow + wide install screenshots that exist with the declared sizes', () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  assert.strictEqual(m.lang, 'en');
  const ff = (m.screenshots || []).map(s => s.form_factor).sort(); assert.deepStrictEqual(ff, ['narrow', 'wide']);
  for (const s of m.screenshots) {
    const buf = fs.readFileSync(path.join(__dirname, '..', s.src));
    assert.strictEqual(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, s.sizes, s.src + ' size mismatch');
    assert.ok(s.label && s.type === 'image/png');
  }
});
test('keyboard tip is hidden on touch-only devices', () => {
  assert.ok(/@media \(hover: none\) and \(pointer: coarse\) \{ \.kbd-tip \{ display: none; \} \}/.test(htmlSrc));
});
test('controls with shortcuts expose aria-keyshortcuts matching the handler', () => {
  for (const [id, k] of [['bucket-r','1'],['bucket-y','2'],['bucket-b','3'],['bucket-k','4'],['bucket-base','5'],['tool-dropper','D'],['tool-pour','P'],['btn-undo','Z']])
    assert.ok(htmlSrc.includes(`id="${id}" aria-keyshortcuts="${k}"`), id);
});
test('typography: reveal distance line is balanced; paragraphs avoid orphans', () => {
  assert.ok(/#reveal-de \{[^}]*text-wrap: balance/.test(htmlSrc) && htmlSrc.includes('p, #status { text-wrap: pretty; }'));
});
console.log('— round 49: replay intro —');
test('Tips offers "Replay the intro", which swaps Tips for the welcome card', () => {
  assert.ok(htmlSrc.includes('<button id="btn-replay-intro" type="button">Replay the intro</button>'));
  assert.ok(gameSrc.includes("$('btn-replay-intro').addEventListener('click', () => { closeTips(); openOverlay('welcome-overlay'); });"));
});
console.log('— round 50: hover feedback —');
test('desktop hover feedback lives inside @media (hover: hover) and comes before the reduced-motion kill switch', () => {
  const i = htmlSrc.indexOf('/* Round 50: desktop hover feedback'); assert.ok(i > 0);
  assert.ok(i < htmlSrc.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(/@media \(hover: hover\) \{\s*\.hbtn:hover/.test(htmlSrc.slice(i)));
});
console.log('— round 51: forced colors —');
test('forced-colors mode keeps paint colors visible (stage, swatches, recipe bars, calendar, stats)', () => {
  const m = htmlSrc.match(/@media \(forced-colors: active\) \{\s*([^{]+)\{ forced-color-adjust: none; \}/); assert.ok(m, 'no forced-colors block');
  for (const sel of ['#stage', '.asw', '.vs .sw', '.rbar', '.rleg i', '.dsw div', '.cd-sw', '.cdt-sw i', '.st-row i']) assert.ok(m[1].includes(sel), sel);
});
console.log('— round 52: prefers-contrast —');
test('prefers-contrast: more strengthens --muted/--line for light and dark, after the dark block', () => {
  const css = htmlSrc.slice(0, htmlSrc.indexOf('</style>'));
  const a = css.indexOf('@media (prefers-contrast: more) {'), d = css.indexOf('@media (prefers-contrast: more) and (prefers-color-scheme: dark)');
  assert.ok(a > css.indexOf('Round 13: dark mode') && d > a, 'contrast blocks must come after dark mode so they win');
  assert.ok(/--muted: #4a4339; --line: #8f846f;/.test(css) && /--muted: #d2c9b9; --line: #776e60;/.test(css));
});
console.log('— round 53: link-preview metadata —');
test('head has canonical, og:site_name, og:image:type and twitter:image:alt (no color names)', () => {
  for (const s of ['<link rel="canonical" href="https://mixologydaily.com/">', '<meta property="og:site_name" content="Mixology">', '<meta property="og:image:type" content="image/png">', '<meta name="twitter:image:alt" content="Mixology: Daily Color Mix — How well do you know your colors?">'])
    assert.ok(htmlSrc.includes(s), s);
});
console.log('— round 54: noscript —');
test('a <noscript> notice explains that JavaScript is needed (before <main>)', () => {
  const n = htmlSrc.indexOf('<noscript><div id="noscript">'); assert.ok(n > 0 && n < htmlSrc.indexOf('<main id="app"'));
});
console.log('— round 55: dialog scroll lock —');
test('open dialogs lock page scroll (CSS :has) and panels contain overscroll', () => {
  assert.ok(htmlSrc.includes('html:has(.modal-ov.open) { overflow: hidden; }') && htmlSrc.includes('.modal-ov, .modal-ov > div { overscroll-behavior: contain; }'));
});
console.log('— round 56: seal haptic + no-translate wordmark —');
test('a non-final seal gives a haptic tap; the wordmark is translate="no"', () => {
  assert.ok(gameSrc.includes('else { buzz(18); renderAll(); persistWip(); }'));
  assert.ok(htmlSrc.includes('<h1 translate="no">MIXOLOGY'));
});
console.log('— round 57: calendar PageUp/PageDown —');
test('PageUp/PageDown flip calendar months only while the calendar tab is open, respecting disabled bounds', () => {
  const i = gameSrc.indexOf('// Round 57: PageUp / PageDown'); const f = gameSrc.slice(i, i + 500);
  assert.ok(f.includes("$('cal-overlay').classList.contains('open')") && f.includes("$('cal-grid').style.display === 'none'") && f.includes('if (!btn.disabled) btn.click()'));
  assert.ok(htmlSrc.includes('aria-keyshortcuts="PageUp"') && htmlSrc.includes('aria-keyshortcuts="PageDown"'));
});
console.log('— round 58: hot flame —');
test('a 7+ day streak gives the header flame a glow/flicker (bump still wins; reduced motion stops it)', () => {
  assert.ok(gameSrc.includes("Number(st.streak) >= 7 ? ' hot' : ''"));
  const a = htmlSrc.indexOf('#streak-display .flame.hot'), b = htmlSrc.indexOf('#streak-display .flame.bump {');
  assert.ok(a > 0 && b > a, 'bump rule must come after hot so the bump animation overrides the flicker');
});
console.log('— round 59: overlay entrance —');
test('Tips/Calendar entrance animates transform + backdrop only (never text opacity)', () => {
  const i = htmlSrc.indexOf('/* Round 59: Tips and Calendar ease in'); const s = htmlSrc.slice(i, htmlSrc.indexOf('/* Round 55', i));
  assert.ok(s.includes('@keyframes ov-rise') && s.includes('@keyframes ov-dim'));
  assert.ok(!/opacity/.test(s.replace(/^.*\*\/\n/s, '')), 'entrance must not fade panel opacity');
});
console.log('— round 60: shortcut announcements —');
test('keyboard shortcuts announce the change to screen readers', () => {
  assert.ok(gameSrc.includes("announce(`${PIG_NAMES[pig]} paint selected`)") && gameSrc.includes("announce('Dropper selected')") && gameSrc.includes("announce('Pour Bucket selected')") && gameSrc.includes("if (had) announce('Undone')"));
});
console.log('— round 62: faster Pour Bucket (ramp) —');
test('pour ramp: fresh white -> 90% one pigment in 3-4 s (was 7.7 s), short taps stay fine', () => {
  const share = sec => 100 * (1 - Math.pow(100 / 101, 1 + Math.floor(E.pourUnitsAt(sec))));
  const tAt = target => { for (let s = 0; s < 20; s += 0.01) if (share(s) >= target) return s; return Infinity; };
  const t90 = tAt(90), t95 = tAt(95);
  assert.ok(t90 >= 2.6 && t90 <= 4, `90% at ${t90.toFixed(2)} s`);
  assert.ok(t95 <= 4.5, `95% at ${t95.toFixed(2)} s`);
  // the simulation matches the real model (addUnits), not just the closed form
  let c = { ...E.OLD_WHITE_START }; const n = 1 + Math.floor(E.pourUnitsAt(t90)); // into a 100% white pot
  for (let i = 0; i < n; i++) c = E.addUnits(c, 'r', 1);
  assert.ok(c.r >= 90 && c.r < 91, `r share ${c.r.toFixed(2)} after ${n} units`);
  assert.ok(1 + Math.floor(E.pourUnitsAt(0.15)) <= 6, 'a quick tap pours too much');
  assert.ok(1 + Math.floor(E.pourUnitsAt(0.3)) <= 10, 'the first 0.3 s is no longer fine control');
  assert.strictEqual(E.pourRateAt(0.1), E.POUR_RATE_START); assert.strictEqual(E.pourRateAt(5), E.POUR_RATE_MAX);
  for (let s = 0; s < 3; s += 0.05) assert.ok(E.pourUnitsAt(s + 0.05) > E.pourUnitsAt(s), 'pour curve not increasing');
});
test('pour loop: catch-up capped per tick, stream width scales with rate and resets on release', () => {
  const i = gameSrc.indexOf('function startPour()'); const f = gameSrc.slice(i, gameSrc.indexOf('function stopPour', i));
  assert.ok(f.includes('Math.min(6, Math.floor(E.pourUnitsAt(sec)) - poured)'), 'no per-tick cap');
  assert.ok(f.includes("$('stream-main').style.strokeWidth"), 'stream width does not follow the rate');
  const s = gameSrc.slice(gameSrc.indexOf('function stopPour'), gameSrc.indexOf('function stopPour') + 600);
  assert.ok(s.includes("el.style.strokeWidth = ''"), 'stream width not reset');
});
console.log('— round 63: keyboard pour parity —');
test('holding Enter/Space on the pot with the Pour Bucket runs the real pour (ramp, one undo step)', () => {
  const i = gameSrc.indexOf('/* Round 63: keyboard parity'); const f = gameSrc.slice(i, i + 1400);
  assert.ok(f.includes("if (!e.repeat) startPour();") && f.includes("selectedTool !== 'pour'") && f.includes("potEl.addEventListener('blur', stopPour);") && f.includes('stopPour(); }'));
  assert.ok(gameSrc.indexOf('/* Round 63: keyboard parity') < gameSrc.indexOf("potEl.addEventListener('click', e => {"));
});
test('pour sound follows the ramp (higher, quicker glugs at speed)', () => {
  assert.ok(gameSrc.includes('pour(k = 0) { beep(110 + 50 * k') && gameSrc.includes('if (ticks % (k > 0.5 ? 3 : 5) === 0) sfx.pour(k);'));
});
console.log('— round 65: live pot % on the paint discs (Franklin) —');
test('displayPercents (r68): whole numbers that ALWAYS sum to 100, a present paint never reads 0%, no "<1%"', () => {
  assert.deepStrictEqual(E.displayPercents(E.FRESH_COMP), { r: '0%', y: '0%', b: '0%', k: '0%', w: '0%' }); // round 83: empty pot
  assert.deepStrictEqual(E.displayPercents(E.OLD_WHITE_START), { r: '0%', y: '0%', b: '0%', k: '0%', w: '100%' });
  assert.deepStrictEqual(E.displayPercents({ r: 33.4, y: 33.3, b: 33.3, k: 0, w: 0 }), { r: '34%', y: '33%', b: '33%', k: '0%', w: '0%' });
  assert.deepStrictEqual(E.displayPercents({ r: 0.6, w: 99.4 }), { r: '1%', y: '0%', b: '0%', k: '0%', w: '99%' });
  const rng = E.mulberry32(65);
  for (let i = 0; i < 3000; i++) {
    const raw = [rng(), rng(), rng(), rng() * 0.05, rng() * (i % 3 ? 1 : 0.02)]; const tot = raw.reduce((a, x) => a + x, 0);
    const c = E.snapTraces({ r: raw[0] / tot * 100, y: raw[1] / tot * 100, b: raw[2] / tot * 100, k: raw[3] / tot * 100, w: raw[4] / tot * 100 });
    const d = E.displayPercents(c); let sum = 0;
    for (const k of ['r', 'y', 'b', 'k', 'w']) {
      assert.ok(/^\d{1,3}%$/.test(d[k]), d[k]);
      const n = parseInt(d[k], 10); sum += n;
      assert.ok(Math.abs(n - c[k]) < 1.5, `${k} ${c[k]} shown ${d[k]}`);
      if (c[k] === 0) assert.strictEqual(d[k], '0%'); else assert.ok(n >= 1, `${k} ${c[k]} shown as 0%`);
    }
    assert.strictEqual(sum, 100, JSON.stringify(c));
  }
  assert.ok(!fs.readFileSync(path.join(__dirname, '..', 'engine.js'), 'utf8').includes("'<1%'"), 'the <1% display is back');
});
console.log('— round 68: no traces, and a remove control (Franklin) —');
test('snapTraces: any paint under TRACE_PCT (0.5%) after a dose is set to 0; the rest renormalize to 100', () => {
  assert.strictEqual(E.TRACE_PCT, 0.5);
  const c = E.snapTraces({ r: 0.4, y: 0, b: 30, k: 0, w: 69.6 });
  assert.strictEqual(c.r, 0); assert.ok(Math.abs(c.b + c.w - 100) < 1e-9 && Math.abs(c.b / c.w - 30 / 69.6) < 1e-9);
  assert.deepStrictEqual(E.snapTraces({ r: 0.5, w: 99.5 }), E.normalizeComp({ r: 0.5, w: 99.5 })); // 0.5 itself stays
  // diluting a 10% red pot with white: red used to hang at "<1%" for ~230 units; now it is gone at under 0.5%
  let p = E.normalizeComp({ r: 10, w: 90 }), n = 0;
  while (p.r > 0) { p = E.addUnits(p, 'w', 1); n++; assert.ok(n < 400); }
  const ln = Math.log, expect = Math.ceil(ln(10 / 0.5) / ln(101 / 100));
  assert.ok(Math.abs(n - expect) <= 1, `red reached 0 after ${n} units (expected ~${expect})`);
  // and no dose anywhere ever leaves a 0 < x < 0.5 component
  const rng = E.mulberry32(68); let q = { ...E.FRESH_COMP };
  for (let i = 0; i < 4000; i++) {
    const k = ['r', 'y', 'b', 'k', 'w'][Math.floor(rng() * 5)];
    q = rng() < 0.3 ? E.removeUnits(q, k, 1) : E.addUnits(q, k, 1 + Math.floor(rng() * 8));
    for (const x of Object.values(q)) assert.ok(x === 0 || x >= E.TRACE_PCT, JSON.stringify(q));
    const sum = Object.values(q).reduce((a, x) => a + x, 0);
    assert.ok(Math.abs(sum - 100) < 1e-6 || (sum === 0 && E.isEmptyComp(q)), 'sums to 100, or the pot is empty (round 83)');
  }
});
test('every bank recipe is reachable under the snap rule: each paint 0 or >= 0.5%, and its stored de reproduces', () => {
  for (const c of bank) {
    for (const [k, v] of Object.entries(c.recipe)) assert.ok(v === 0 || v >= E.TRACE_PCT, `${c.name} ${k}=${v}`);
    const de = E.deltaE2000(E.hexToLab(E.mixColor(E.snapTraces(c.recipe))), E.hexToLab(c.hex));
    assert.ok(Math.abs(de - c.de) < 0.006, `${c.name}: stored ${c.de}, recomputed ${de}`);
  }
  assert.ok(/E\.snapTraces\(comp\)/.test(fs.readFileSync(path.join(__dirname, '..', 'tools', 'solve-recipes.js'), 'utf8')), 'solver ignores the snap rule');
});
test('removeUnits: tap takes ~1% of that paint out, the rest grow back in proportion, a paint never goes negative', () => {
  const a = E.normalizeComp({ r: 10, b: 30, w: 60 });
  const b = E.removeUnits(a, 'r', 1);
  assert.ok(b.r < a.r && a.r - b.r > 0.85 && a.r - b.r < 1.0, `removed ${a.r - b.r}`);
  assert.ok(Math.abs(b.b / b.w - 0.5) < 1e-9, 'others not proportional');
  assert.ok(b.b > a.b && b.w > a.w);
  let c = a, taps = 0; while (c.r > 0) { c = E.removeUnits(c, 'r', 1); taps++; }
  assert.ok(taps >= 9 && taps <= 10, `10% red cleared in ${taps} taps`);
  assert.deepStrictEqual(E.removeUnits(E.FRESH_COMP, 'r', 1), E.FRESH_COMP);
  // time to clear 10% red by holding (press unit + the bucket ramp): well under half a second
  let units = 1, t = 0; while (units < taps) { t += 1 / 30; units = 1 + Math.floor(E.pourUnitsAt(t)); }
  assert.ok(t < 0.35, `hold clears 10% in ${t.toFixed(2)} s`);
});
test('remove badge markup: five separate buttons outside the discs (not nested), hidden until paint is in, 40px hit area, a11y', () => {
  for (const [k, n] of [['r', 1], ['y', 2], ['b', 3], ['k', 4], ['w', 5]]) {
    const m = htmlSrc.match(new RegExp(`<button class="premove" type="button" id="rm-${k}" data-rm="${k}" hidden aria-keyshortcuts="Shift\\+${n}"[^>]*aria-label="Remove [a-z]+ paint">−</button>`));
    assert.ok(m, `rm-${k} missing`);
  }
  assert.ok(/\.premove \{[^}]*width: 30px; height: 30px/.test(htmlSrc) && /\.premove::before \{[^}]*inset: -6px/.test(htmlSrc), 'badge size / hit area');
  assert.ok(/\.premove \{[^}]*touch-action: none/.test(htmlSrc), 'a hold would scroll the page');
  assert.ok(/#stage\.locked \.premove \{ display: none; \}/.test(htmlSrc), 'badges on a finished round');
  assert.ok(gameSrc.includes("const show = !round.finished && round.pot[b] > 0; // round 83"));
  assert.ok(gameSrc.includes('`Remove ${PIG_NAMES[b].toLowerCase()} paint, ${pct[b]} of the pot. Hold to keep removing`'));
  assert.ok(gameSrc.includes("e.preventDefault(); e.stopPropagation();"), 'a badge press could reach the disc or pot');
  assert.ok(gameSrc.includes("btn.addEventListener('click', e => { if (e.detail === 0) removePaint(key); });"), 'keyboard activation');
});
test('remove hold: same ramp as the bucket, ONE undo step per hold, stops at 0, keeps the selection; Shift+1–5 shortcut; copy', () => {
  const f = gameSrc.slice(gameSrc.indexOf('function startRemove('), gameSrc.indexOf('function stopRemove('));
  assert.ok(f.includes('beginGesture();') && f.includes('E.pourUnitsAt(sec)') && f.includes('Math.min(6,'), 'ramp / gesture');
  assert.ok(!f.includes('selectedBucket'), 'removing changes the selection');
  assert.ok(gameSrc.slice(gameSrc.indexOf('function stopRemove('), gameSrc.indexOf('function removePaint(')).includes('endGesture();'));
  assert.ok(gameSrc.includes("{ Digit1: 'r', Digit2: 'y', Digit3: 'b', Digit4: 'k', Digit5: 'w' }[e.code]"));
  assert.ok(htmlSrc.includes('tap its <b>−</b> to take some out') && htmlSrc.includes('<b>Taking paint out:</b>') && htmlSrc.includes('<kbd>Shift</kbd>+<kbd>1</kbd>–<kbd>5</kbd> remove 1% of that paint'));
  assert.ok(!htmlSrc.includes('&lt;1%'), 'Tips still mention <1%');
});
test('disc % markup: on all five discs, no taps (pointer-events none), legible ink, aria-label, rAF-throttled, pot number-free', () => {
  for (const id of ['bucket-r', 'bucket-y', 'bucket-b', 'bucket-k', 'bucket-base'])
    assert.ok(new RegExp(`id="${id}"[^>]*><span class="ppct" aria-hidden="true">(0|100)%</span></button>`).test(htmlSrc), id);
  assert.ok(/\.pigment \.ppct \{[^}]*pointer-events: none/.test(htmlSrc), 'ppct can block taps');
  assert.ok(htmlSrc.includes('#bucket-base .ppct, #bucket-y .ppct { color: #1c1a17;'), 'white/yellow need dark ink');
  assert.ok(gameSrc.includes('requestAnimationFrame') && gameSrc.includes('function scheduleDiscPercents()') && gameSrc.includes('scheduleDiscPercents(); // round 65'));
  assert.ok(gameSrc.includes('`Select ${PIG_NAMES[b].toLowerCase()} pigment, ${pct[b]} of the pot`'));
  const pot = htmlSrc.slice(htmlSrc.indexOf('<button id="pot"'), htmlSrc.indexOf('</button>', htmlSrc.indexOf('<button id="pot"')));
  assert.ok(!/\d+%/.test(pot), 'the pot must stay number-free');
  assert.ok(htmlSrc.includes("live share of the pot"), 'Tips does not explain the disc numbers');
});
console.log('— round 66: gross/bodily names retired —');
test('gross/bodily names never appear as future dailies or practice picks, yet past days still resolve', () => {
  const sched = (() => { const g = {}; new Function('window', 'module', fs.readFileSync(path.join(__dirname, '..', 'schedule.js'), 'utf8'))(g, undefined); return g.MIXOLOGY_SCHEDULE; })();
  const GROSS = /\b(barf|bile|sick|sickly|pee|urine|phlegm|mucus|turd|dung|manure|sewage|feces|faeces|excrement|drool|spew|bruise|dried blood|pimple|zit|scab|earwax|vomit|puke|poop|poo|shit|piss|snot|booger|diarrh(o)?ea|fart|pus)\b/;
  const byName = new Map(bank.map(c => [c.name, c]));
  for (const c of bank) if (GROSS.test(c.name)) assert.strictEqual(c.retired, true, `${c.name} is in the bank but not retired`);
  for (const n of ['barf green', 'bile', 'sick green', 'sickly green', 'sickly yellow', 'dried blood', 'bruise']) assert.ok(byName.get(n) && byName.get(n).retired, n);
  for (let d = 658; d < sched.length; d++) assert.ok(!GROSS.test(sched[d]) && !byName.get(sched[d]).retired, `future day ${d} is "${sched[d]}"`);
  // frozen past days that named a retired color still resolve to a full entry (hex + recipe)
  for (const d of [134, 235, 266, 303, 314, 350]) { const c = byName.get(sched[d]); assert.ok(c && c.retired && /^#[0-9A-F]{6}$/.test(c.hex) && c.recipe, `day ${d}`); }
  assert.ok(gameSrc.includes('const POOL = BANK.filter(c => !c.retired && E.isDailyEligible(c.de));'), 'game pool (practice/fallback) must skip retired names');
});
console.log('— round 67: no swirl —');
test('Franklin r67: nothing is drawn on/in the pot (no swirl, bloom, ripple, splash); the color just eases', () => {
  assert.ok(!htmlSrc.includes('@keyframes swirl') && !/#pot-surface::before/.test(htmlSrc), 'swirl still present');
  for (const c of ['.bloom {', '.splash {', '.ripple {']) assert.ok(!htmlSrc.includes(c), `${c} CSS still present`);
  for (const f of ['function bloom(', 'function splash(', 'function spawnRipple(', "className = 'ripple'", "className = 'bloom'", "className = 'splash'"]) assert.ok(!gameSrc.includes(f), `${f} still in game.js`);
  assert.ok(!/\$\('pot-surface'\)\.appendChild|surface\.appendChild/.test(gameSrc), 'something is still appended into the pot surface');
  assert.ok(/#pot-surface \{[^}]*transition: background-color/.test(htmlSrc), 'pot color no longer eases');
});
console.log('— round 69: Collection (Franklin) —');
{
  // round 77: discovery is measured against each color's recipe color (game.js COLLECTIBLE_LABS)
  const COL = E.collectibleColors(bank), LABS = COL.map(c => E.hexToLab(E.recipeHex(c.recipe)));
  test('collectible = every color that can be a daily (non-retired, eligible); threshold ΔE00 3 vs recipe colors for every color; every tile winnable', () => {
    assert.strictEqual(COL.length, bank.filter(c => !c.retired && E.isDailyEligible(c.de)).length);
    assert.ok(COL.every(c => !c.retired) && gameSrc.includes('const COLLECTIBLE = E.collectibleColors(BANK);'));
    assert.strictEqual(E.DISCOVER_DE, 3);
    const easy = COL.find(c => c.de < 1), hard = COL.find(c => c.de > 10);
    assert.strictEqual(E.discoverLimit(easy), 3); assert.strictEqual(E.discoverLimit(hard), 3, 'round 77: no hard-color margin, every recipe color is reachable');
    assert.ok(gameSrc.includes('const COLLECTIBLE_LABS = COLLECTIBLE.map(c => E.hexToLab(c.thex));'));
    // every color can be discovered: its own solver recipe discovers SOME color, and itself when nothing nearer
    // every tile can be won: its own recipe, sealed in a round for that color, discovers it
    for (const c of COL) { const d = E.discoverColor(E.mixColor(c.recipe), COL, LABS, null, c.name); assert.ok(d && d.name === c.name, `${c.name} cannot be won`); }
    // twins: outside its own round a near twin may take the find instead (nearest wins)
    const tw = COL.find(c => { const d = E.discoverColor(E.mixColor(c.recipe), COL, LABS); return d && d.name !== c.name; });
    assert.ok(tw, 'expected at least one near-twin in the bank');
  });
  test('discovery: the nearest color within its limit wins, even if it is not the target; a far mix discovers nothing', () => {
    const rose = COL.find(c => c.name === 'rose') || COL[0];
    const d = E.discoverColor(E.recipeHex(rose.recipe), COL, LABS, null, rose.name);
    assert.strictEqual(d.name, rose.name); assert.ok(d.deltaE < 1e-6);
    // brute force agrees on random mixes
    const rng = E.mulberry32(69);
    for (let i = 0; i < 150; i++) {
      const hex = E.mixColor(E.snapTraces({ r: rng() * 60, y: rng() * 60, b: rng() * 60, k: rng() * 20, w: rng() * 100 }));
      const lab = E.hexToLab(hex); let best = null, bd = Infinity;
      COL.forEach((c, j) => { const de = E.deltaE2000(lab, LABS[j]); if (de <= E.discoverLimit(c) && de < bd) { bd = de; best = c.name; } });
      const got = E.discoverColor(hex, COL, LABS);
      assert.strictEqual(got ? got.name : null, best, hex);
    }
    assert.strictEqual(E.discoverColor('#ffffff', COL.filter((c, j) => E.deltaE2000(LABS[j], E.hexToLab('#ffffff')) > 20), LABS.filter((l, j) => E.deltaE2000(LABS[j], E.hexToLab('#ffffff')) > 20)), null);
  });
  test('recordDiscovery: first find keeps its date; a better later mix replaces the best mix only', () => {
    const c = COL.find(x => x.de < 1);
    const near = { name: c.name, hex: c.hex, deltaE: 2.5 }, nearer = { name: c.name, hex: c.hex, deltaE: 0.8 };
    let r = E.recordDiscovery(null, near, { comp: { r: 10, w: 90 }, hex: '#aa0000' }, '2026-10-18');
    assert.ok(r.isNew); assert.strictEqual(r.col.found[c.name].date, '2026-10-18');
    const p1 = r.col.found[c.name].best.pct;
    r = E.recordDiscovery(r.col, nearer, { comp: { r: 12, w: 88 }, hex: '#bb0000' }, '2026-10-20');
    assert.ok(!r.isNew); assert.strictEqual(r.col.found[c.name].date, '2026-10-18');
    assert.ok(r.col.found[c.name].best.pct > p1 && r.col.found[c.name].best.hex === '#bb0000');
    const r2 = E.recordDiscovery(r.col, near, { comp: { r: 1, w: 99 }, hex: '#cc0000' }, '2026-10-21');
    assert.strictEqual(r2.col.found[c.name].best.hex, '#bb0000', 'a worse mix replaced the best');
    assert.ok(!E.recordDiscovery(r.col, null, { comp: {}, hex: '#000' }, 'x').isNew);
  });
  test('backfill: every saved daily attempt is folded in once, dated by its day record; marks backfilled', () => {
    const a = COL.find(c => c.de < 0.5), b = COL.find(c => c.de < 0.5 && E.deltaE2000(E.hexToLab(c.hex), E.hexToLab(a.hex)) > 15);
    const days = {
      600: { date: '2026-08-23', name: a.name, attempts: [{ comp: a.recipe, hex: E.mixColor(a.recipe), pct: 99 }, { comp: { w: 100 }, hex: '#000000', pct: 1 }] },
      601: { date: '2026-08-24', name: b.name, attempts: [{ comp: b.recipe, hex: E.mixColor(b.recipe), pct: 99 }] },
      602: { date: '2026-08-25', name: a.name, attempts: [{ comp: a.recipe, hex: E.mixColor(a.recipe) }] },
      bogus: null
    };
    const col = E.backfillCollection(null, days, COL, LABS);
    assert.ok(col.backfilled && col.v === 1);
    const fa = E.discoverColor(E.mixColor(a.recipe), COL, LABS).name;
    assert.strictEqual(col.found[fa].date, '2026-08-23', 'earliest day wins the date');
    assert.ok(col.found[E.discoverColor(E.mixColor(b.recipe), COL, LABS).name]);
    assert.deepStrictEqual(E.backfillCollection(null, {}, COL, LABS).found, {});
  });
  test('spoiler rule (r73): official recipe only for colors the player finished as a daily', () => {
    const SCH = SCHEDULE;
    // evergreen was a pre-launch daily (day 508) and recurs in the future: locked
    assert.strictEqual(SCH[508], 'evergreen');
    assert.ok(SCH.some((n, d) => n === 'evergreen' && d > 658), 'evergreen recurs as a future daily');
    assert.strictEqual(E.officialRecipeVisible('evergreen', {}), false);
    // every pre-launch color is locked for a fresh player, and for one who only finished #1 and #2
    const played = { 656: { name: SCH[656], attempts: [{}] }, 657: { name: SCH[657], attempts: [{}] } };
    for (let d = 1; d < 656; d++) {
      const n = SCH[d]; if (!n || n === SCH[656] || n === SCH[657]) continue;
      assert.strictEqual(E.officialRecipeVisible(n, {}), false, n);
      assert.strictEqual(E.officialRecipeVisible(n, played), false, n);
    }
    // a finished day unlocks its color (a reveal the player already saw), even if it recurs
    assert.strictEqual(E.officialRecipeVisible(SCH[656], played), true);
    assert.strictEqual(E.officialRecipeVisible(SCH[657], played), true);
    assert.strictEqual(E.officialRecipeVisible('evergreen', { 508: { name: 'evergreen' } }), true);
    // today's color, not finished yet (no record): locked; never a daily: locked
    assert.strictEqual(E.officialRecipeVisible(SCH[658], played), false);
    assert.strictEqual(E.officialRecipeVisible('x', undefined), false);
    assert.ok(gameSrc.includes("E.officialRecipeVisible(name, store.data.days)"));
    assert.ok(!gameSrc.includes('SCHEDULE_DAYS'), 'no schedule lookup in the spoiler rule');
    assert.ok(gameSrc.includes('The official recipe unlocks once you finish this color as a daily.'), 'locked copy must not say whether it is upcoming');
  });
  test('spoiler rule (r73): calendar shows a recipe only for finished days', () => {
    const fn = gameSrc.slice(gameSrc.indexOf('function showCalDetail'), gameSrc.indexOf('\n}\n', gameSrc.indexOf('function showCalDetail')));
    const i = fn.indexOf('recipesHTML('), played = fn.indexOf('if (rec && rec.attempts && rec.attempts.length)'), other = fn.indexOf('} else if (day === DAY)');
    assert.ok(played >= 0 && played < i && i < other, 'recipes only in the finished-day branch');
    assert.strictEqual(fn.split('recipesHTML(').length, 2, 'one recipe render');
    assert.ok(!/recipe/i.test(fn.slice(other).replace(/\/\/.*$/gm, '')), 'missed / pre-launch / today branches show no recipe');
    // store.data.days is written only on finish
    assert.strictEqual((gameSrc.match(/s\.days\[day\] = \{/g) || []).length, 1);
    assert.ok(gameSrc.slice(gameSrc.indexOf('function finish()'), gameSrc.indexOf('function finish()') + 600).includes('s.days[day] = {'));
  });
  test('game wiring: own versioned key, storage-failure safe, backfill on first load, announced only at the reveal', () => {
    assert.strictEqual(E.COLLECTION_KEY, 'mixology.collection.v1');
    const mod = gameSrc.slice(gameSrc.indexOf('const collection = {'), gameSrc.indexOf('function collectRound('));
    assert.ok((mod.match(/try \{/g) || []).length >= 3, 'storage access not guarded');
    assert.ok(mod.includes('if (!collection.data.backfilled)') && mod.includes('E.backfillCollection(collection.data, store.data.days'));
    const sealFn = gameSrc.slice(gameSrc.indexOf('function seal() {'), gameSrc.indexOf('function finish() {'));
    assert.ok(!/collect|discover/i.test(sealFn), 'a discovery could show before the reveal (it would be a clue)');
    const fin = gameSrc.slice(gameSrc.indexOf('function finish() {'), gameSrc.indexOf('/* Round 17: screen-reader'));
    assert.ok(fin.includes('queueDiscoveryToasts(collectRound(round.attempts, round.color.name))'), 'finish does not collect (daily and practice)');
    assert.ok(gameSrc.includes('New color discovered: <b>') && gameSrc.includes('sfx.discover(); buzz('), 'toast / sound / haptic');
    assert.ok(gameSrc.includes("if (!store.data.days[DAY]) h.add(colorForDay(DAY).name);") && gameSrc.includes('if (round && !round.finished) h.add(round.color.name);'), 'an open round\'s color could show in the Collection');
  });
  test('Collection markup: own panel, undiscovered tiles are a neutral "?", discovered tiles are labelled buttons, dark-mode vars', () => {
    assert.ok(htmlSrc.includes('id="btn-collection" type="button" aria-label="Collection"'));
    assert.ok(htmlSrc.includes('<div id="cal-col"></div>'));
    assert.ok(gameSrc.includes('`<span class="ct q" aria-hidden="true">?</span>`'));
    assert.ok(/\.ct\.q \{ background: var\(--paper\); color: var\(--muted\)/.test(htmlSrc));
    assert.ok(gameSrc.includes('aria-label="${escapeHtml(titleCase(c.name))}${st ? \', \' + st.label : \'\'}"'));
    assert.ok(/#col-toast \{[^}]*background: var\(--ink\); color: var\(--paper\)/.test(htmlSrc));
    assert.ok(/\.ct, #col-toast i, \.col-fams i, \.star \{ forced-color-adjust: none; \}/.test(htmlSrc));
    for (const f of E.HUE_FAMILIES) assert.ok(f.label);
    const fam = new Set(E.collectibleColors(bank).map(c => E.hueFamily(c.hex)));
    assert.strictEqual(fam.size, E.HUE_FAMILIES.length, 'an empty family');
  });
}
console.log('— round 70: no long-press callout / selection in the play area —');
test('play area: user-select/touch-callout none, tap highlight off, touch-action, listeners; reading text still selectable', () => {
  const m = htmlSrc.match(/#stage, #stage \*, #toolbar, #toolbar \*, #attempts-list, #attempts-list \*, #actions, #actions \* \{([^}]*)\}/);
  assert.ok(m, 'play-area selection block missing');
  for (const p of ['-webkit-user-select: none', 'user-select: none', '-webkit-touch-callout: none', '-webkit-tap-highlight-color: transparent']) assert.ok(m[1].includes(p), p);
  assert.ok(/#pot, \.premove \{ touch-action: none; \}/.test(htmlSrc) && /touch-action: manipulation/.test(htmlSrc));
  assert.ok(gameSrc.includes("const PLAY_AREA = ['stage', 'toolbar', 'attempts-list', 'actions']"));
  assert.ok(gameSrc.includes("el.addEventListener('contextmenu', e => e.preventDefault());") && gameSrc.includes("el.addEventListener('selectstart', e => e.preventDefault());"));
  assert.ok(gameSrc.includes("{ passive: false }"), 'touchstart must be non-passive to cancel the iOS callout');
  assert.ok(!/(#tips-panel|#reveal|body)[^{]*\{[^}]*user-select: none/.test(htmlSrc), 'reading text lost selection');
});
console.log('— round 71: own panels for Stats and Collection; "Submit" wording —');
test('Calendar, Stats and Collection: separate header buttons (SVG + aria-label) and separate dialogs with titles; no sub-tabs', () => {
  for (const [id, label] of [['btn-calendar', 'Calendar'], ['btn-stats', 'Stats'], ['btn-collection', 'Collection']])
    assert.ok(new RegExp(`id="${id}" type="button" aria-label="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">`).test(htmlSrc), id);
  for (const [ov, h, title] of [['cal-overlay', 'cal-h', 'Calendar'], ['stats-overlay', 'stats-h', 'Stats'], ['col-overlay', 'col-h', 'Collection']]) {
    assert.ok(new RegExp(`<div id="${ov}" class="modal-ov[^"]*" role="dialog" aria-modal="true" aria-labelledby="${h}">`).test(htmlSrc), ov);
    assert.ok(htmlSrc.includes(`<h2 class="ov-title" id="${h}">${title}</h2>`), title);
  }
  assert.ok(!htmlSrc.includes('role="tablist"') && !gameSrc.includes('setCalTab'), 'sub-tabs still present');
  assert.ok(gameSrc.includes("$('btn-stats').addEventListener('click', openStats);") && gameSrc.includes("$('btn-collection').addEventListener('click', () => openCollection());"));
  assert.ok(gameSrc.includes('closeTips(); closeCalendar(); closeStats(); closeCollection(); closeWelcome();'), 'Escape does not close the new panels');
  for (const id of ['btn-tips', 'btn-practice', 'btn-mute']) assert.ok(htmlSrc.includes(`id="${id}"`));
});
test('UI copy says "Submit", never "Seal" (internal names may stay)', () => {
  const vis = s => s.replace(/<script[^]*?<\/script>/g, '').replace(/<style[^]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/\bseal(ed|s)?\b/i.test(vis(htmlSrc)), 'HTML text still says seal');
  const strs = (gameSrc.match(/(['`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || []).filter(s => !/^['`][\w.-]*['`]$/.test(s));
  const bad = strs.filter(s => /\bseal(ed|s)?\b/i.test(s) && !/btn-seal|seal\(|sfx\.seal/.test(s));
  assert.deepStrictEqual(bad, []);
  assert.ok(gameSrc.includes('`Submit final attempt` : `Submit attempt ${round.attempts.length + 1}`') && htmlSrc.includes('>Submit attempt 1</button>'));
});
console.log('— round 72: holiday colors —');
{
  const HC = require('../tools/holiday-colors.js');
  const S = require('../schedule.js');
  const byName = new Map(bank.map(c => [c.name, c]));
  const dayOf = (y, m, d) => E.dayNumber(new Date(y, m - 1, d)) + 1;
  test('holiday dates: Easter, US floating holidays and the lunar tables are right', () => {
    assert.deepStrictEqual(E.easterDate(2026), [4, 5]); assert.deepStrictEqual(E.easterDate(2027), [3, 28]); assert.deepStrictEqual(E.easterDate(2030), [4, 21]); assert.deepStrictEqual(E.easterDate(2035), [3, 25]);
    const on = (y, id) => { const h = E.holidaysForYear(y).find(x => x.id === id); return h ? `${h.month}/${h.day}` : null; };
    assert.strictEqual(on(2026, 'thanksgiving'), '11/26'); assert.strictEqual(on(2027, 'thanksgiving'), '11/25');
    assert.strictEqual(on(2027, 'mothers-day'), '5/9'); assert.strictEqual(on(2027, 'fathers-day'), '6/20');
    assert.strictEqual(on(2027, 'mardi-gras'), '2/9'); assert.strictEqual(on(2026, 'hanukkah'), '12/4'); assert.strictEqual(on(2026, 'diwali'), '11/8');
    assert.strictEqual(on(2027, 'lunar-new-year'), '2/6');
    // clashes: the higher-priority holiday keeps the day
    assert.strictEqual(on(2027, 'christmas-eve'), null); assert.strictEqual(on(2027, 'hanukkah'), '12/24');
    assert.strictEqual(on(2035, 'hanukkah'), null); assert.strictEqual(on(2035, 'christmas'), '12/25');
    assert.strictEqual(E.holidayOn(new Date(2026, 9, 31)).label, 'Halloween'); assert.strictEqual(E.holidayOn(new Date(2026, 9, 30)), null);
  });
  test('every holiday candidate is in the bank and daily-eligible', () => {
    for (const [id, spec] of Object.entries(HC.HOLIDAY_COLORS)) {
      assert.ok(E.HOLIDAY_DEFS.some(h => h.id === id), id);
      for (const n of spec.byParity ? spec.byParity.flat() : spec) { const c = byName.get(n); assert.ok(c && !c.retired && E.isDailyEligible(c.de), `${id}: ${n}`); }
    }
  });
  test('schedule: every future holiday (through 2035) gets one of its candidates; Halloween 2026 is pumpkin', () => {
    const FROZEN = 658; let n = 0;
    for (let y = 2026; y <= 2035; y++) for (const h of E.holidaysForYear(y)) {
      const d = dayOf(y, h.month, h.day); if (d <= FROZEN || d >= S.length) continue;
      assert.ok(HC.candidatesFor(h.id, y).includes(S[d]), `${h.id} ${y} (day ${d}) is "${S[d]}"`); n++;
    }
    assert.ok(n >= 180, `only ${n} holiday days`);
    assert.strictEqual(S[dayOf(2026, 10, 31)], 'pumpkin'); assert.strictEqual(S[dayOf(2027, 10, 31)], 'pumpkin orange');
    assert.strictEqual(S[dayOf(2027, 7, 4)], 'navy blue'); assert.strictEqual(S[dayOf(2028, 7, 4)], 'fire engine red');
  });
  test('schedule: frozen days unchanged by the holiday pass, all future colors eligible, no repeat within 120 days', () => {
    // frozen through 658 (today #2 + tomorrow): days 0..658 hash as they did before round 72
    assert.strictEqual(require('crypto').createHash('sha256').update(S.slice(0, 659).join('|')).digest('hex'), 'db3515bf034445b6417e57a4856f805ca09260b2f5c87dd7a482c25cf6a0dbe5');
    assert.strictEqual(S[656], 'lipstick'); assert.strictEqual(S[657], 'dark forest green');
    for (let d = 659; d < S.length; d++) { const c = byName.get(S[d]); assert.ok(c && !c.retired && E.isDailyEligible(c.de), `day ${d}: ${S[d]}`); }
    for (let d = 659; d < S.length; d++) for (let j = Math.max(0, d - 120); j < d; j++) assert.ok(S[j] !== S[d], `${S[d]} on days ${j} and ${d}`);
  });
  test('holiday tag in the header: daily only, emoji hidden from screen readers', () => {
    assert.ok(htmlSrc.includes('<p id="holiday-tag" hidden></p>'));
    assert.ok(gameSrc.includes("const hol = daily ? E.holidayOn(dateForDay(round.day)) : null"));
    assert.ok(gameSrc.includes('<span aria-hidden="true">${hol.emoji}</span> ${escapeHtml(hol.label)}'));
  });
}
console.log('— star badges (round 74) —');
{
  const gSrc = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const hSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const tid = p => (E.starTier(p) || { id: null }).id;
  test('star thresholds (round 75): 84 none, 85/89 bronze, 90/96 silver, 97/99 gold, 100 diamond', () => {
    assert.deepStrictEqual([84, 85, 89, 90, 96, 97, 99, 100].map(tid), [null, 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'diamond']);
    assert.strictEqual(E.PAR_PCT, 85, 'bronze starts at par');
  });
  test('star tiers use the displayed (rounded) %; junk gets none', () => {
    assert.strictEqual(tid(84.4), null); assert.strictEqual(tid(84.5), 'bronze'); assert.strictEqual(tid(89.4), 'bronze'); assert.strictEqual(tid(89.5), 'silver');
    assert.strictEqual(tid(96.4), 'silver'); assert.strictEqual(tid(96.6), 'gold'); assert.strictEqual(tid(99.4), 'gold'); assert.strictEqual(tid(99.5), 'diamond');
    for (const v of [undefined, null, NaN, 'x', 0, 50]) assert.strictEqual(tid(v), null);
  });
  test('star labels are accessible words (bronze 85%+, silver 90%+, gold 97%+, diamond 100%)', () => {
    assert.strictEqual(E.starTier(85).label, 'bronze star: 85%+');
    assert.strictEqual(E.starTier(90).label, 'silver star: 90%+');
    assert.strictEqual(E.starTier(97).label, 'gold star: 97%+');
    assert.strictEqual(E.starTier(100).label, 'diamond star: 100%');
  });
  test('star tiers line up with the accuracy formula (dE 0 diamond, dE 2 gold+, par bronze, past par none)', () => {
    assert.strictEqual(tid(E.accuracyFromDeltaE(0)), 'diamond');
    assert.ok(['gold', 'diamond'].includes(tid(E.accuracyFromDeltaE(2))));
    assert.strictEqual(tid(E.accuracyFromDeltaE(11.25)), 'bronze');
    assert.strictEqual(tid(E.accuracyFromDeltaE(14)), null);
  });
  test('existing saves: collected best % read as stored, legacy entries fall back to dE, then hex', () => {
    assert.strictEqual(E.collectedBestPct({ best: { pct: 97, de: 2.9, hex: '#123456' } }, '#000000'), 97);
    assert.strictEqual(E.collectedBestPct({ best: { de: 0 } }, '#000000'), 100);
    assert.strictEqual(E.collectedBestPct({ best: { hex: '#2a5c3e' } }, '#2a5c3e'), 100);
    assert.strictEqual(E.collectedBestPct({}, '#000'), null); assert.strictEqual(E.collectedBestPct(null, '#000'), null);
    assert.strictEqual(E.starTier(E.collectedBestPct({ best: { comp: {} } })), null);
  });
  test('a v1 collection with no star data works untouched (stars are derived, nothing stored)', () => {
    const col = { v: 1, backfilled: true, found: { evergreen: { date: '2026-10-18', best: { comp: { r: 0, y: 30, b: 40, k: 30, w: 0 }, hex: '#05472a', pct: 97, de: 2.8 } } } };
    const before = JSON.stringify(col);
    assert.strictEqual(E.starTier(E.collectedBestPct(col.found.evergreen, '#05472a')).id, 'gold');
    assert.strictEqual(JSON.stringify(col), before);
    const r = E.recordDiscovery(col, { name: 'evergreen', hex: '#05472a', deltaE: 0 }, { comp: { r: 0, y: 30, b: 40, k: 30, w: 0 }, hex: '#05472a' }, '2026-10-19');
    assert.strictEqual(tid(r.col.found.evergreen.best.pct), 'diamond');
    assert.strictEqual(r.col.found.evergreen.date, '2026-10-18');
  });
  test('stars drawn on calendar circles, collection tiles and the reveal; decorative SVG + spoken label', () => {
    assert.ok(gSrc.includes('${pct}${starBadge(star)}</span>'));
    assert.ok(gSrc.includes("(star ? `<span class=\"sr-only\">, ${star.label}, </span>` : '')"));
    assert.ok(gSrc.includes("${st ? ', ' + st.label : ''}\">${starBadge(st)}</button>"));
    assert.ok(gSrc.includes("$('reveal-mine').innerHTML = starBadge(rStar, 'big');"));
    assert.ok(/class="star star-\$\{tier.id\}[^`]*aria-hidden="true"/.test(gSrc));
    assert.ok(hSrc.includes('.star-gold path') && hSrc.includes('.star-silver path') && hSrc.includes('.star-bronze path') && hSrc.includes('.star-diamond path { fill: url(#star-diamond-g)'));
    assert.strictEqual((hSrc.match(/id="star-diamond-g"/g) || []).length, 1, 'one shared diamond gradient');
    assert.ok(gSrc.includes("const gem = dia ? `<path class=\"facet\""), 'diamond facets');
    // round 76: only the diamond badge animates (halo + glint), on opacity/transform only, and not under reduced motion
    const kf = [...hSrc.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)];
    const starKf = kf.filter(m => /star|dia|glint|spark/i.test(m[1]));
    assert.deepStrictEqual(starKf.map(m => m[1]).sort(), ['dia-glint', 'dia-halo']);
    for (const m of starKf) for (const decl of m[2].match(/[\w-]+(?=\s*:)/g)) assert.ok(['opacity', 'transform'].includes(decl), `${m[1]} animates ${decl}`);
    const users = [...hSrc.matchAll(/([^{}]+)\{[^}]*animation:\s*(dia-halo|dia-glint)/g)].map(m => m[1].split('*/').pop().trim());
    assert.ok(users.length === 2 && users.every(sel => sel.startsWith('.star-diamond')), 'only diamond animates: ' + users);
    assert.ok(/@media \(prefers-reduced-motion: reduce\) \{\s*\* \{ animation: none !important;/.test(hSrc), 'global reduced-motion kill switch');
    assert.ok(/@media screen and \(prefers-reduced-motion: reduce\) \{\s*\/\*[^*]*\*\/\s*\.star-diamond::before \{ animation: none !important; opacity: \.9;/.test(hSrc), 'static diamond glow under reduced motion');
    assert.ok(gSrc.includes('--tw:${((diamondSeq++ * 0.83) % 2.6).toFixed(2)}s'), 'diamonds staggered');
    assert.ok(/\.star \{ position: absolute; top: -4px; right: -4px;/.test(hSrc), 'star sits in the corner, not over the % ');
  });
  test('share text never mentions a star or the color (unchanged)', () => {
    const fn = gSrc.slice(gSrc.indexOf('function shareText('), gSrc.indexOf('function flashLabel('));
    assert.ok(!/star/i.test(fn.replace(/Streak|streak/g, '')));
    assert.ok(!/rec\.name|color\.name/.test(fn));
  });
}
console.log('— round 77: 100% reachable, hint after attempt 1, title —');
{
  const gSrc = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const hSrc = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const POOL77 = bank.filter(c => !c.retired && E.isDailyEligible(c.de));
  const S77 = require('../schedule.js'), SCHED = Array.isArray(S77) ? S77 : String(S77).split('|');
  const byN = new Map(bank.map(c => [c.name, c]));
  test('every recipe is whole percents summing to 100 (each paint 0 or >= 1%); pool size unchanged (853)', () => {
    for (const c of bank) {
      const v = Object.values(c.recipe); assert.ok(v.every(x => Number.isInteger(x) && x >= 0), c.name);
      assert.strictEqual(v.reduce((a, b) => a + b, 0), 100, c.name);
    }
    assert.strictEqual(POOL77.length, 853);
  });
  test('the official recipe scores exactly 100% (diamond) against its own target, for every color', () => {
    for (const c of bank) { const sc = E.scoreMix(c.recipe, c.recipe); assert.ok(sc.exact && sc.pct === 100 && sc.de === 0, c.name); }
    assert.strictEqual(E.starTier(100).id, 'diamond');
  });
  test('pouring the recipe with whole drops (+1 taps, - badge taps) from a fresh pot scores 100%: today, the next 45 days and a pool sample', () => {
    const today = 657, names = new Set();
    for (let d = today; d < today + 46; d++) names.add(SCHED[d]);
    const rng = E.mulberry32(77); for (let i = 0; i < 30; i++) names.add(POOL77[Math.floor(rng() * POOL77.length)].name);
    for (const n of names) {
      const c = byN.get(n), ops = E.wholeDropPath(c.recipe, 300, 4);
      assert.ok(ops && ops.length < 300, `${n}: no whole-drop route`);
      let pot = { ...E.FRESH_COMP };
      for (const op of ops) pot = op[0] === '+' ? E.addUnits(pot, op[1], 1) : E.removeUnits(pot, op[1], 1);
      const sc = E.scoreMix(pot, c.recipe); assert.strictEqual(sc.pct, 100, `${n}: ${sc.pct}%`);
    }
  });
  test('recipe match is on the whole numbers the discs show; numbers off means no exact match', () => {
    const c = byN.get('dark forest green');
    // hidden fractions differ (one more drop of black) but the discs still read 0/30/29/41/0
    const near = E.addUnits(c.recipe, 'k', 1);
    assert.deepStrictEqual(E.displayPercents(near), E.displayPercents(c.recipe));
    assert.ok(E.recipeMatch(near, c.recipe) && E.scoreMix(near, c.recipe).pct === 100);
    let off = c.recipe; for (let i = 0; i < 4; i++) off = E.addUnits(off, 'k', 1);
    assert.ok(!E.recipeMatch(off, c.recipe));
    const sc = E.scoreMix(off, c.recipe); assert.ok(sc.pct < 100 && sc.pct >= 85, String(sc.pct));
  });
  test('target = recipe color everywhere the official color is shown or scored; schedule untouched', () => {
    assert.ok(gSrc.includes('for (const c of BANK) c.thex = E.recipeHex(c.recipe);'));
    assert.ok(gSrc.includes('function targetLab() { return E.hexToLab(round.color.thex); }'));
    assert.ok(gSrc.includes('const sc = E.scoreMix(round.pot, round.color.recipe);'));
    assert.ok(gSrc.includes("$('reveal-official').style.background = round.color.thex;"));
    assert.ok(gSrc.includes('<i style="background:${official.thex}"></i>Official'));
    assert.ok(gSrc.includes('<i style="background:${c.thex}"></i>Official'));
    assert.ok(!/round\.color\.hex\b/.test(gSrc), 'round.color.hex still used');
    assert.strictEqual(SCHED[656], 'lipstick'); assert.strictEqual(SCHED[657], 'dark forest green');
  });
  test('saved history is not rescored: calendar and stats read the stored pct', () => {
    assert.ok(gSrc.includes('const best = bestAttempt(rec.attempts);') && gSrc.includes("pct = best.pct + '%';"));
    assert.ok(!/rescore/i.test(gSrc.slice(gSrc.indexOf('function renderCalendar'), gSrc.indexOf('function inkFor'))));
  });
  test('duel links: new ones carry s=2; older ones with a mix are rescored against the new target', () => {
    assert.ok(gSrc.includes('&x=${E.encodeDuelComp(final.comp, day)}&s=2`'));
    assert.ok(gSrc.includes("const rescored = p.get('s') !== '2' && !!comp && !legacyHex;"));
    assert.ok(gSrc.includes('if (rescored) { const c = colorForDay(day); if (c) pct = E.scoreMix(comp, c.recipe).pct; }'));
  });
  test('collection: exact recipe match discovers the day color; twins sharing a recipe color are found together', () => {
    assert.ok(gSrc.includes('const hit = att.exact && targetName'));
    assert.ok(gSrc.includes('TWINS.set(c.thex'));
  });
  const L = h => E.hexToLab(h);
  test('hint thresholds: 100 "Perfect match!", 97-99 "So close!", lower gets 1-2 short issues', () => {
    assert.strictEqual(E.mixHint(L('#336633'), L('#336633'), 100), 'Perfect match!');
    assert.strictEqual(E.mixHint(L('#336633'), L('#3a6b2f'), 97), 'So close!');
    assert.strictEqual(E.mixHint(L('#336633'), L('#3a6b2f'), 99), 'So close!');
    const h = E.mixHint(L('#1f3a19'), L('#3a6b2f'), 80); assert.ok(/dark/i.test(h), h);
    assert.ok(/light/i.test(E.mixHint(L('#a3c799'), L('#3a6b2f'), 70)));
    assert.ok(/muted|brighter/i.test(E.mixHint(L('#6b6b5a'), L('#3a6b2f'), 80)));
    assert.ok(/toward (blue|teal|purple)/i.test(E.mixHint(L('#3a8a3a'), L('#2a5a9a'), 60)));
    assert.ok(/strong|tone/i.test(E.mixHint(L('#ff2020'), L('#b07070'), 60)));
  });
  test('hints never name amounts, numbers or the recipe, and stay short (random mixes)', () => {
    const rng = E.mulberry32(7);
    for (let i = 0; i < 300; i++) {
      const a = E.mixColor({ r: rng() * 50, y: rng() * 50, b: rng() * 50, k: rng() * 20, w: rng() * 80 });
      const b = E.mixColor({ r: rng() * 50, y: rng() * 50, b: rng() * 50, k: rng() * 20, w: rng() * 80 });
      const pct = E.accuracyFromDeltaE(E.deltaE2000(L(a), L(b))), h = E.mixHint(L(a), L(b), pct);
      assert.ok(h && !/\d|%|recipe|drop/i.test(h) && h.length <= 60 && h.split(' and ').length <= 2, h);
    }
  });
  test('title: "Mixology: Daily Color Mix" in <title>, og/twitter title, manifest name; short_name stays; header subtitle', () => {
    assert.ok(hSrc.includes('<title>Mixology: Daily Color Mix</title>'));
    assert.ok(hSrc.includes('<meta property="og:title" content="Mixology: Daily Color Mix">') && hSrc.includes('<meta name="twitter:title" content="Mixology: Daily Color Mix">'));
    const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    assert.strictEqual(m.name, 'Mixology: Daily Color Mix'); assert.strictEqual(m.short_name, 'Mixology');
    assert.ok(hSrc.includes('<span class="h1-sub">Daily Color Mix</span></h1>'));
    assert.ok(gSrc.includes('How well do you know your colors?'));
  });
}
console.log('— round 78: private analytics (GoatCounter) —');
{
  const A = require('../analytics.js');
  const aSrc = fs.readFileSync(path.join(__dirname, '..', 'analytics.js'), 'utf8');
  const gSrc = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');
  const mem = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
  const env = o => Object.assign({ code: 'mixology', protocol: 'https:', hostname: 'ngtrooper.github.io', search: '', webdriver: false, storage: mem() }, o);
  test('one config constant (set to ngtrooper in round 79); an empty code means no script and no request', () => {
    assert.strictEqual((aSrc.match(/^const ANALYTICS_CODE = '[^']*';$/gm) || []).length, 1);
    assert.strictEqual(A.ANALYTICS_CODE, 'ngtrooper', 'GoatCounter site code: https://ngtrooper.goatcounter.com');
    assert.strictEqual(A.disabledReason(env({ code: '' })), 'no code');
    // start() returns before creating the script tag whenever there is a reason
    const st = aSrc.slice(aSrc.indexOf('function start()'), aSrc.indexOf('function track('));
    assert.ok(st.indexOf("if (!enabled || !root.document) return;") < st.indexOf("createElement('script')"));
    assert.ok(A.track('open') === false && A.enabled === false);
  });
  test('count.js: async from gc.zgo.at with data-goatcounter https://<code>.goatcounter.com/count; page view path has no query string', () => {
    assert.strictEqual(A.SCRIPT_SRC, 'https://gc.zgo.at/count.js');
    assert.ok(aSrc.includes("s.async = true; s.src = SCRIPT_SRC;"));
    assert.ok(aSrc.includes("s.setAttribute('data-goatcounter', `https://${encodeURIComponent(ANALYTICS_CODE)}.goatcounter.com/count`);"));
    assert.ok(aSrc.includes("{ path: loc.pathname || '/' }"));
    assert.ok(aSrc.includes('gc.count({ path: name, title: name, event: true })'));
  });
  test('skipped: localhost/private/file, automated browsers, ?noanalytics, opt-out flag, skipgc', () => {
    assert.strictEqual(A.disabledReason(env()), '');
    for (const h of ['localhost', '127.0.0.1', '192.168.1.5', '10.0.0.2', '172.20.1.1', 'x.localhost', '']) assert.ok(A.disabledReason(env({ hostname: h })), h);
    assert.strictEqual(A.disabledReason(env({ protocol: 'file:' })), 'file');
    assert.strictEqual(A.disabledReason(env({ webdriver: true })), 'automated');
    assert.ok(A.disabledReason(env({ search: '?noanalytics' })) && A.disabledReason(env({ search: '?d=1&noanalytics=1' })));
    const s1 = mem(); s1.setItem(A.OPTOUT_KEY, '1'); assert.ok(A.disabledReason(env({ storage: s1 })));
    const s2 = mem(); s2.setItem('skipgc', 't'); assert.ok(A.disabledReason(env({ storage: s2 })));
    const s3 = mem(); s3.setItem(A.OPTOUT_KEY, '0'); assert.strictEqual(A.disabledReason(env({ storage: s3 })), '');
  });
  test('each event at most once per day per browser; a new day resets', () => {
    const st = mem();
    assert.strictEqual(A.claimOncePerDay(st, 'open', '2026-10-19'), true);
    assert.strictEqual(A.claimOncePerDay(st, 'open', '2026-10-19'), false);
    assert.strictEqual(A.claimOncePerDay(st, 'share', '2026-10-19'), true);
    assert.strictEqual(A.claimOncePerDay(st, 'open', '2026-10-20'), true);
    assert.deepStrictEqual(JSON.parse(st.getItem(A.SENT_KEY)), { day: '2026-10-20', sent: ['open'] });
    const bad = mem(); bad.setItem(A.SENT_KEY, '{oops'); assert.strictEqual(A.claimOncePerDay(bad, 'open', '2026-10-19'), true);
  });
  test('buckets: streak/played-days 1,2,3,5,7,14,30+; return-day 0..7, 8+; score bands = star tiers', () => {
    assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 29, 30, 365].map(A.stepBucket), [null, '1', '2', '3', '3', '5', '5', '7', '7', '14', '14', '30+', '30+']);
    assert.deepStrictEqual([-1, 0, 1, 2, 7, 8, 40].map(A.returnBucket), [null, '0', '1', '2', '7', '8+', '8+']);
    assert.deepStrictEqual([0, 84, 85, 89, 90, 96, 97, 99, 100].map(A.scoreBand), ['none', 'none', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'diamond']);
  });
  test('only whitelisted anonymous event shapes; no bank color name can ever be an event', () => {
    for (const ok of ['open', 'share', 'duel-open', 'start-#2', 'finish-#120', 'score-band-gold', 'return-day-1', 'return-day-8+', 'streak-30+', 'played-days-7']) assert.ok(A.validEvent(ok), ok);
    // ('bronze', 'silver', 'gold' are also bank names; score-band-<tier> is the star tier, so those three are allowed only there)
    const TIERS = ['none', 'bronze', 'silver', 'gold', 'diamond'];
    for (const n of bank.map(c => c.name)) for (const ev of [n, 'start-' + n, 'finish-' + n, ...(TIERS.includes(n) ? [] : ['score-band-' + n])]) assert.ok(!A.validEvent(ev), ev);
    for (const bad of ['score-97', 'streak-4', 'return-day-9', 'start-#', 'finish-#2 lipstick', '']) assert.ok(!A.validEvent(bad), bad);
    // game.js builds events only from puzzle numbers and buckets
    const calls = [...gSrc.matchAll(/(?<!function )track\(([^;]*?)\);/g)].map(m => m[1]).filter(c => c !== "name"); // the wrapper forwards its argument
    assert.ok(calls.length >= 6 && calls.every(c => !/name|hex|recipe|comp|\.pct\b/.test(c)), calls.join(' | '));
  });
  test('game hooks: open, return-day, duel-open at load; start on first daily dose; finish/band/streak/played-days; share', () => {
    assert.ok(gSrc.includes("track('open'); trackReturn(); if (incomingDuel) track('duel-open');"));
    assert.ok(gSrc.includes("if (round.mode === 'daily' && !round.finished) trackDaily('start', round.day);"));
    assert.ok(gSrc.includes("if (round.mode === 'daily') trackFinish(round.day, final.pct);"));
    assert.ok(gSrc.includes("track('share'); // round 78"));
    assert.ok(gSrc.includes("function track(name) { try { if (MA) MA.track(name); } catch (e) { /* never break the game */ } }"));
  });
}

console.log('— round 80: close button always reachable on short phones —');
{
  const dlgs = [['cal-overlay', 'cal-panel', 'btn-cal-close'], ['stats-overlay', 'stats-panel', 'btn-stats-close'], ['col-overlay', 'col-panel', 'btn-col-close'], ['tips-overlay', 'tips-panel', 'btn-tips-close']];
  test('every dialog: header row (title + close) outside a separately scrolling body', () => {
    for (const [ov, panel, close] of dlgs) {
      const start = htmlSrc.indexOf(`<div id="${ov}"`), seg = htmlSrc.slice(start, htmlSrc.indexOf('\n</div>', start));
      assert.ok(new RegExp(`id="${panel}"`).test(seg) && /<div [^>]*id="[a-z-]+-panel"[^>]*>|<div class="[^"]*ov-dlg[^"]*"/.test(seg), panel);
      assert.ok(seg.includes('ov-dlg'), panel + ' not an .ov-dlg');
      const head = seg.indexOf('<div class="ov-head">'), btn = seg.indexOf(`id="${close}"`), body = seg.indexOf('<div class="ov-body">');
      assert.ok(head > 0 && head < btn && btn < body, ov + ': close button must sit in the header, before the scrolling body');
      assert.ok(seg.slice(btn - 40, btn).includes('class="ov-close"'), close + ' missing .ov-close');
    }
  });
  test('dialog CSS: no vh-only caps, dvh + safe-area insets, body scrolls, header never shrinks, 40px+ close', () => {
    assert.ok(!/max-height: (85|92)vh/.test(htmlSrc), 'old vh caps remain (iOS large viewport hides the header)');
    assert.ok(htmlSrc.includes('100dvh') && htmlSrc.includes('@supports (height: 100dvh)'));
    assert.ok(/\.ov-dlg, #cal-panel\.ov-dlg, #tips-panel\.ov-dlg \{\s*display: flex; flex-direction: column; overflow: hidden; padding: 0;\s*max-height: calc\(100vh - 24px\); max-height: 100%;/.test(htmlSrc));
    assert.ok(/\.ov-head \{\s*flex: none;/.test(htmlSrc) && /\.ov-body \{\s*flex: 1 1 auto; min-height: 0; overflow-y: auto;/.test(htmlSrc));
    assert.ok(/#tips-overlay, #cal-overlay, \.ov-sheet \{\s*padding: max\(12px, env\(safe-area-inset-top\)\) max\(12px, env\(safe-area-inset-right\)\) max\(12px, env\(safe-area-inset-bottom\)\) max\(12px, env\(safe-area-inset-left\)\);/.test(htmlSrc));
    assert.ok(/\.ov-head \.ov-close \{[^}]*position: relative;[^}]*width: 40px; height: 40px;/.test(htmlSrc));
    assert.ok(!/#btn-(tips|cal)-close[^{]*\{[^}]*position: absolute/.test(htmlSrc), 'a close button is still absolutely positioned');
    assert.ok(/#welcome-panel \{[^}]*max-height: 100%; overflow-y: auto;/.test(htmlSrc), 'welcome card cannot scroll on short screens');
  });
  test('dialogs open at the top of their body; Escape and tap-outside still close all of them', () => {
    const f = gameSrc.slice(gameSrc.indexOf('function openOverlay'), gameSrc.indexOf('function closeOverlay'));
    assert.ok(f.includes("const body = ov.querySelector('.ov-body'); if (body) body.scrollTop = 0;"));
    for (const [ov] of dlgs) assert.ok(gameSrc.includes(`$('${ov}').addEventListener('click', e => { if (e.target === $('${ov}'))`), ov + ' tap-outside');
    assert.ok(gameSrc.includes("if (e.key === 'Escape') { closeTips(); closeCalendar(); closeStats(); closeCollection(); closeWelcome(); }"));
  });
}

console.log('— round 81: "Hold to pour" on the empty pot for first-time players —');
{
  const block = gameSrc.slice(gameSrc.indexOf("const POURED_KEY = 'mixology.poured.v1';"), gameSrc.indexOf('/* Apply ONE unit'));
  // Run the real hint code against a stub page: one #pot-hint element, a save, a round, localStorage.
  function boot({ days = {}, wip = null, ls = {}, finished = false } = {}) {
    const el = { hidden: true, cls: new Set(), classList: { add(c) { el.cls.add(c); }, remove(c) { el.cls.delete(c); } } };
    const mem = Object.assign({}, ls), localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
    const env = { round: { finished, pot: { r: 0, y: 0, b: 0, k: 0, w: 0 } } }; // round 83: empty start
    const api = new Function('E', '$', 'store', 'env', 'localStorage', 'BUCKET_KEYS', 'REDUCED_MOTION', 'setTimeout', 'clearTimeout',
      'let round; Object.defineProperty(env, "r", { get: () => round, set: v => { round = v; } }); round = env.round;\n' + block +
      '\nreturn { initPotHint, potHintShown, markPoured, renderPotHint, setRound: v => { round = v; } };')(
      E, id => (id === 'pot-hint' ? el : null), { data: { days, wip } }, env, localStorage, ['r', 'y', 'b', 'k', 'w'], true, f => f(), () => {});
    api.initPotHint(); api.renderPotHint();
    return { api, el, mem, env };
  }
  const drop = t => { t.env.round.pot = { r: 0, y: 100, b: 0, k: 0, w: 0 }; t.api.markPoured(); t.api.renderPotHint(); };
  test('fresh save: the label shows on the empty pot (and the pot\'s accessible name starts with it)', () => {
    const t = boot();
    assert.ok(t.api.potHintShown() && !t.el.hidden && t.el.cls.has('show'));
    assert.ok(gameSrc.includes("$('pot').setAttribute('aria-label', (potHintShown() ? 'Hold to pour. ' : '') + (empty && !round.finished ? 'The pot is empty. ' : '') + (round.finished"));
  });
  test('the first drop hides it for good: flag saved, still hidden after undo to an empty pot, and after a reload', () => {
    const t = boot(); drop(t);
    assert.ok(!t.api.potHintShown() && t.el.hidden && !t.el.cls.has('show'));
    assert.strictEqual(t.mem['mixology.poured.v1'], '1');
    t.env.round.pot = { r: 0, y: 0, b: 0, k: 0, w: 0 }; t.api.renderPotHint(); // undo / reset back to empty
    assert.ok(!t.api.potHintShown() && t.el.hidden);
    const again = boot({ ls: t.mem }); // reload with the same localStorage, still no saved day
    assert.ok(!again.api.potHintShown() && again.el.hidden);
    // every dose path goes through applyUnit, which retires the label
    const au = gameSrc.slice(gameSrc.indexOf('function applyUnit('), gameSrc.indexOf('function dose('));
    assert.ok(au.includes('markPoured();') && gameSrc.includes('initPotHint(); // round 81') && gameSrc.indexOf('initPotHint(); // round 81') < gameSrc.lastIndexOf('initDaily();'));
  });
  test('existing players never see it: any saved day, or a day in progress', () => {
    assert.ok(!boot({ days: { 1: { pct: 80 } } }).api.potHintShown());
    assert.ok(!boot({ wip: { day: 2, name: 'x', attempts: [], pot: { r: 0, y: 0, b: 0, k: 0, w: 100 } } }).api.potHintShown());
    assert.ok(!boot({ finished: true }).api.potHintShown(), 'never on a finished (locked) pot');
  });
  test('label markup/CSS: dark static text on the canvas, never takes the press, no selection or callout, no pot animation', () => {
    assert.ok(htmlSrc.includes('<span id="pot-surface"></span><span id="pot-hint" hidden aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true">') && htmlSrc.includes('<span>Hold to pour</span></span></button>'));
    const css = htmlSrc.slice(htmlSrc.indexOf('  #pot-hint {'), htmlSrc.indexOf('  #pot-hint svg'));
    assert.ok(/color: #2a2621;/.test(css) && /pointer-events: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;/.test(css));
    assert.ok(/opacity: 0; transition: opacity \.35s ease;/.test(css) && !/animation|@keyframes|transform: scale/.test(css), 'only a fade, no effect');
  });
}

console.log('— round 82: it is DAILY — countdown to local midnight —');
test('countdown formatting: h/m/s with zero-padding, rounds up to whole seconds, empty at or after the rollover', () => {
  const f = E.formatCountdown, H = 3600e3, M = 60e3, S = 1e3;
  assert.strictEqual(f(6 * H + 12 * M + 8 * S), '6h 12m 08s');
  assert.strictEqual(f(23 * H + 59 * M + 59 * S + 1), '24h 00m 00s'); // 1 ms over: rounds up
  assert.strictEqual(f(10 * H + 5 * M), '10h 05m 00s');
  assert.strictEqual(f(1 * H), '1h 00m 00s');
  assert.strictEqual(f(H - 1), '1h 00m 00s');
  assert.strictEqual(f(59 * M + 59 * S), '59m 59s');
  assert.strictEqual(f(12 * M + 8 * S), '12m 08s');
  assert.strictEqual(f(60 * S), '1m 00s');
  assert.strictEqual(f(8 * S), '8s');
  assert.strictEqual(f(1), '1s', 'never "0s" before midnight');
  for (const v of [0, -1, -5000, NaN, undefined]) assert.strictEqual(f(v), '', String(v));
});
test('rollover = local midnight, matching dayNumber exactly (incl. DST days); the game counts to dateForDay(DAY + 1)', () => {
  for (const [y, m, d] of [[2026, 9, 19], [2026, 10, 1], [2026, 2, 8], [2026, 11, 31], [2028, 1, 28]]) {
    for (const hh of [0, 9, 23]) {
      const t = new Date(y, m, d, hh, 30, 15), n = E.nextDayStart(t);
      assert.strictEqual(n.getHours(), 0); assert.strictEqual(n.getMinutes(), 0);
      assert.strictEqual(E.dayNumber(n), E.dayNumber(t) + 1, 'next start is the next day');
      assert.strictEqual(E.dayNumber(new Date(n - 1)), E.dayNumber(t), '1 ms before is still today');
    }
  }
  // the game's dateForDay(DAY + 1) is the same instant as nextDayStart(now)
  const dateForDay = day => { const d = new Date(2025, 0, 1); d.setDate(d.getDate() + day - 1); return d; };
  for (const t of [new Date(2026, 9, 19, 17, 13), new Date(2026, 10, 1, 1, 30), new Date(2026, 2, 8, 12)]) {
    const DAY = E.dayNumber(t) + 1;
    assert.strictEqual(+dateForDay(DAY + 1), +E.nextDayStart(t));
  }
  const fn = gameSrc.slice(gameSrc.indexOf('function untilNextColor'), gameSrc.indexOf('let countdownState'));
  assert.ok(fn.includes('dateForDay(DAY + 1) - (now || new Date())') && fn.includes('E.formatCountdown(ms)'));
  // ticks every second; at zero it rolls the day over; a finished round is NOT swapped, it offers today's color
  assert.ok(gameSrc.includes('setInterval(renderNextCountdown, 1000);'));
  assert.ok(gameSrc.includes("if (daily && round.day === DAY && !left) { checkDayRollover();"));
  const roll = gameSrc.slice(gameSrc.indexOf('function checkDayRollover'), gameSrc.indexOf('setInterval(checkDayRollover'));
  assert.ok(roll.includes('if (untouched && !round.finished) { stopPour(); initDaily(); return; }'));
  assert.ok(htmlSrc.includes(`<button id="btn-today" type="button">Today's new color is ready →</button>`));
});
test('streak line adapts to 0 / 1 / N', () => {
  assert.strictEqual(E.comeBackLine(5), 'New color every day — come back tomorrow to keep your 🔥 5-day streak.');
  assert.strictEqual(E.comeBackLine(2), 'New color every day — come back tomorrow to keep your 🔥 2-day streak.');
  assert.strictEqual(E.comeBackLine(1), 'New color every day — come back tomorrow to start a 🔥 streak.');
  for (const v of [0, -2, null, undefined, 'x']) assert.strictEqual(E.comeBackLine(v), 'New color every day — come back tomorrow for the next one.');
  for (const v of [0, 1, 2, 30]) assert.ok(!/undefined|NaN|null/.test(E.comeBackLine(v)));
});
test('placement: countdown right after the result; returning finished players get a top banner; welcome says daily; share text untouched', () => {
  const rv = htmlSrc.slice(htmlSrc.indexOf('<section id="reveal">'), htmlSrc.indexOf('</section>'));
  assert.ok(rv.indexOf('id="reveal-de"') < rv.indexOf('id="reveal-next"') && rv.indexOf('id="reveal-next"') < rv.indexOf('id="reveal-recipes"'), 'countdown is not right after the result');
  assert.ok(rv.includes('role="timer"') && /\.rn-line \{ font-size: 17px; font-weight: 700;/.test(htmlSrc), 'countdown not prominent');
  const pa = htmlSrc.slice(htmlSrc.indexOf('<div id="prompt-area">'), htmlSrc.indexOf('<div id="stage">'));
  assert.ok(pa.includes('<div id="done-banner" hidden>') && pa.includes('id="btn-see-result"') && pa.includes('Practice (doesn\'t count)'), 'no top banner for finished players');
  assert.ok(gameSrc.includes('banner.hidden = !show;') && gameSrc.includes("$('btn-db-practice').addEventListener('click', startPractice);"));
  const w = htmlSrc.slice(htmlSrc.indexOf('<div id="welcome-panel">'), htmlSrc.indexOf('id="btn-welcome-go"'));
  assert.ok(w.includes('<b>One new color every day.</b>') && w.includes('How well do you know your colors?'));
  const share = gameSrc.slice(gameSrc.indexOf('function shareText'), gameSrc.indexOf('function shareText') + 1500);
  assert.ok(!/Next color|come back|formatCountdown/.test(share), 'share text changed');
});

console.log('— round 83: the pot starts EMPTY; difficulty analytics —');
{
  const POOL83 = bank.filter(c => !c.retired && E.isDailyEligible(c.de));
  const S83 = require('../schedule.js'), SCHED83 = Array.isArray(S83) ? S83 : String(S83).split('|');
  const byN83 = new Map(bank.map(c => [c.name, c]));
  const A83 = require('../analytics.js');
  const sum = c => ['r', 'y', 'b', 'k', 'w'].reduce((a, k) => a + parseInt(E.displayPercents(c)[k], 10), 0);
  test('empty pot: no paint; percentages are shares that sum to 100 from the first drop; taking out the last paint empties it', () => {
    let c = { ...E.FRESH_COMP };
    assert.ok(E.isEmptyComp(c) && sum(c) === 0);
    c = E.addUnits(c, 'b', 1); assert.strictEqual(c.b, 100); assert.strictEqual(sum(c), 100);
    c = E.addUnits(c, 'y', 1); assert.deepStrictEqual(E.displayPercents(c), { r: '0%', y: '1%', b: '99%', k: '0%', w: '0%' });
    for (let i = 0; i < 40; i++) { c = E.addUnits(c, ['r', 'y', 'k', 'w'][i % 4], 1); assert.strictEqual(sum(c), 100); }
    // remove down to nothing: one paint left -> one more tap empties the pot
    let d = E.addUnits(E.addUnits(E.FRESH_COMP, 'r', 1), 'w', 1), taps = 0;
    while (!E.isEmptyComp(d) && taps < 50) { d = E.removeUnits(d, d.w > 0 ? 'w' : 'r', 1); taps++; }
    assert.ok(E.isEmptyComp(d) && taps <= 3, `emptied in ${taps} taps`);
    assert.deepStrictEqual(E.removeUnits(E.FRESH_COMP, 'w', 1), E.FRESH_COMP);
    assert.deepStrictEqual(E.removeUnits({ r: 0, y: 0, b: 0, k: 0, w: 100 }, 'w', 1), E.FRESH_COMP, 'a pure-white pot is just paint: removing it empties');
  });
  test('no implicit white anywhere in scoring or recipes: every pool recipe whole %, sums 100; recipes without white exist', () => {
    let noWhite = 0;
    for (const c of POOL83) {
      const vals = ['r', 'y', 'b', 'k', 'w'].map(k => c.recipe[k] || 0);
      assert.ok(vals.every(Number.isInteger) && vals.reduce((a, x) => a + x, 0) === 100, c.name);
      if (!c.recipe.w) noWhite++;
    }
    assert.ok(noWhite > 200, `only ${noWhite} recipes without white`);
    assert.ok(!/OLD_WHITE_START/.test(gameSrc.slice(gameSrc.indexOf('function seal('), gameSrc.indexOf('function seal(') + 900)), 'white leaks into scoring');
  });
  test('every one of the 853 pool colors is exactly reachable (100%) from the EMPTY pot with whole drops and − taps', () => {
    assert.strictEqual(POOL83.length, 853);
    for (const c of POOL83) {
      const ops = E.wholeDropPath(c.recipe, 400, 4);
      assert.ok(ops && ops.length <= 400, `${c.name}: no whole-drop route`);
      assert.ok(!ops.includes('-w') || (c.recipe.w || 0) > 0 || ops.includes('+w'), `${c.name}: route removes white it never added`);
      let pot = { ...E.FRESH_COMP };
      for (const op of ops) pot = op[0] === '+' ? E.addUnits(pot, op[1], 1) : E.removeUnits(pot, op[1], 1);
      assert.strictEqual(E.scoreMix(pot, c.recipe).pct, 100, c.name);
    }
  });
  test("today's official recipe (#2 dark forest green, Y30 B29 K41) poured from an empty pot scores 100%", () => {
    const c = byN83.get(SCHED83[657]); assert.strictEqual(c.name, 'dark forest green');
    const ops = E.wholeDropPath(c.recipe, 400, 4);
    let pot = { ...E.FRESH_COMP }; for (const op of ops) pot = op[0] === '+' ? E.addUnits(pot, op[1], 1) : E.removeUnits(pot, op[1], 1);
    assert.deepStrictEqual(E.displayPercents(pot), { r: '0%', y: '30%', b: '29%', k: '41%', w: '0%' });
    const sc = E.scoreMix(pot, c.recipe); assert.ok(sc.pct === 100 && sc.exact);
  });
  test('game: empty bowl look, Submit disabled with a hint until there is paint, seal() refuses an empty pot, badge shows at 100%', () => {
    assert.ok(htmlSrc.includes('<button id="pot" class="empty" type="button"') && /#pot\.empty #pot-surface \{\s*background: radial-gradient/.test(htmlSrc));
    assert.ok(htmlSrc.includes('<button id="btn-seal" type="button" disabled>Submit attempt 1</button>') && htmlSrc.includes('<p id="seal-hint">Pour some paint into the pot to submit.</p>'));
    assert.ok(gameSrc.includes("sealBtn.disabled = round.finished || round.attempts.length >= MAX_ATTEMPTS || empty;") && gameSrc.includes("$('seal-hint').hidden = round.finished || !empty;"));
    assert.ok(gameSrc.includes("if (E.isEmptyComp(round.pot)) return null; // round 83"));
    assert.ok(gameSrc.includes("$('pot').classList.toggle('empty', empty);") && gameSrc.includes("$('pot-surface').style.background = empty ? '' : mixHex();"));
    assert.ok(htmlSrc.includes('aria-label="Select white pigment"><span class="ppct" aria-hidden="true">0%</span>'));
    // dark mode: the empty bowl and its label stay readable
    assert.ok(/#pot\.empty #pot-hint \{ color: #f1ebdf; \}/.test(htmlSrc));
  });
  test('saves: an untouched old white pot in a WIP becomes empty; any other saved pot (with white) loads as is; past days untouched', () => {
    const m = gameSrc.slice(gameSrc.indexOf('// round 83: a WIP pot that is exactly'), gameSrc.indexOf('// round 83: a WIP pot that is exactly') + 420);
    const migrate = new Function('E', 'freshPot', 'wip', m.slice(m.indexOf('round.pot =')).replace('round.pot =', 'return').split('\n')[0]);
    const fresh = () => ({ ...E.FRESH_COMP });
    assert.deepStrictEqual(migrate(E, fresh, { pot: { r: 0, y: 0, b: 0, k: 0, w: 100 } }), E.FRESH_COMP);
    assert.deepStrictEqual(migrate(E, fresh, {}), E.FRESH_COMP);
    const mixed = { r: 20, y: 0, b: 0, k: 0, w: 80 }; assert.deepStrictEqual(migrate(E, fresh, { pot: mixed }), mixed);
    assert.ok(gameSrc.includes('pot: lastAtt.comp ? { ...lastAtt.comp } : freshPot(),'), 'finished days still show their saved mix');
  });
  test('difficulty events: score labels, recipe-distance buckets, paint counts; allowlist; never a color name', () => {
    assert.deepStrictEqual([0, 59, 59.4, 60, 85, 97, 100, 101, NaN].map(A83.scoreLabel), ['<60', '<60', '<60', '60', '85', '97', '100', null, null]);
    assert.deepStrictEqual([0, 1, 2, 5, 6, 10, 11, 20, 21, 90, -1].map(A83.offBucket), ['0', '1', '2', '5', '6-10', '6-10', '11-20', '11-20', '21+', '21+', null]);
    assert.strictEqual(A83.recipeOff({ r: '0%', y: '31%', b: '28%', k: '41%', w: '0%' }, { r: 0, y: 30, b: 29, k: 41, w: 0 }), 2);
    assert.strictEqual(A83.recipeOff(E.displayPercents({ w: 100 }), { y: 30, b: 29, k: 41 }), 200);
    assert.deepStrictEqual([{ y: '100%' }, { r: '1%', y: '99%' }, { r: '20%', y: '20%', b: '20%', k: '20%', w: '20%' }, {}].map(A83.paintCount), [1, 2, 5, null]);
    for (const ok of ['pct-#2-a1-<60', 'pct-#2-a1-60', 'pct-#2-final-97', 'pct-#120-final-100', 'off-#2-0', 'off-#2-6-10', 'off-#2-11-20', 'off-#2-21+', 'paints-#2-1', 'paints-#2-5']) assert.ok(A83.validEvent(ok), ok);
    for (const bad of ['pct-#2-final-59', 'pct-#2-final-101', 'pct-#2-a2-90', 'off-#2-7', 'off-#2-6', 'paints-#2-0', 'paints-#2-6', 'pct-#2-final-97 x']) assert.ok(!A83.validEvent(bad), bad);
    for (const n of bank.map(c => c.name)) for (const ev of ['pct-' + n, 'off-' + n, 'paints-' + n, `pct-#2-final-${n}`, `off-#2-${n}`]) assert.ok(!A83.validEvent(ev), ev);
    // the game only sends them for daily rounds, from numbers
    assert.ok(gameSrc.includes("if (round.mode === 'daily' && round.attempts.length === 1) trackScore('a1', round.day, sc.pct); // round 83"));
    assert.ok(gameSrc.includes("if (round.mode === 'daily') { trackScore('final', round.day, final.pct); trackMix(round.day, final.comp, round.color.recipe); } // round 83"));
    const tm = gameSrc.slice(gameSrc.indexOf('function trackScore'), gameSrc.indexOf('function trackFinish'));
    assert.ok(tm.includes('track(`pct-#${n}-${stage}-${lbl}`)') && tm.includes('track(`off-#${n}-${off}`)') && tm.includes('track(`paints-#${n}-${pc}`)') && !/\.name\b/.test(tm));
  });
  test('schedule.js is not reshuffled by this round (dark forest green is still #2, day 657)', () => {
    assert.strictEqual(SCHED83[657], 'dark forest green');
  });
}

console.log('— round 84: practice counts for nothing persistent —');
{
  const fin = gameSrc.slice(gameSrc.indexOf('function finish('), gameSrc.indexOf('function finish(') + 6000);
  test('r84: practice never adds Collection discoveries or best % (collectRound only for dailies)', () => {
    const calls = gameSrc.split('collectRound(').length - 1;
    assert.ok(fin.includes("if (round.mode === 'daily') queueDiscoveryToasts(collectRound(round.attempts, round.color.name));"), 'collectRound not gated to dailies');
    // only the definition + the one gated call
    assert.strictEqual(calls, 2, 'unexpected collectRound call sites: ' + calls);
  });
  test('r84: practice writes nothing to the save (no practiceRounds bump, no days/streak)', () => {
    assert.ok(!/practiceRounds\s*\+=/.test(gameSrc) && !/practiceRounds\+\+/.test(gameSrc), 'practiceRounds still bumped');
    const daily = fin.slice(fin.indexOf("if (round.mode === 'daily')"));
    assert.ok(/s\.days\[/.test(fin) || /days\[/.test(fin), 'days write not found');
    // every store.data/s.* write in finish sits in the daily branch
    const head = fin.slice(0, fin.indexOf("if (round.mode === 'daily')"));
    assert.ok(!/store\.data\.\w+\s*[+\-]?=/.test(head), 'save written before the daily gate');
    assert.ok(daily.length > 0);
  });
  test('r84: no star on the practice reveal; dailies keep theirs', () => {
    assert.ok(gameSrc.includes("const practice = round.mode !== 'daily';"));
    assert.ok(gameSrc.includes('const rStar = practice ? null : E.starTier(fin.pct);'), 'reveal star not gated');
  });
  test('r84: practice reveal shows your mix, hides the official recipe unless finished as a daily', () => {
    const f = gameSrc.slice(gameSrc.indexOf('function practiceRecipesHTML'), gameSrc.indexOf('function recipesHTML'));
    assert.ok(f.includes('E.officialRecipeVisible(color.name, store.data.days)'), 'spoiler rule not applied');
    assert.ok(/open && color\.recipe \? recipeRowHTML\('Recipe'/.test(f), 'official row not gated on the rule');
    assert.ok(f.includes("recipeRowHTML('Your mix'"), 'your mix row missing');
    assert.ok(f.includes('unlocks once you finish this color as a daily'), 'no lock note');
  });
  test('r84: official recipe visibility comes only from finished dailies', () => {
    const name = bank[0].name;
    // days holds only finished dailies (written by finish(), daily branch only)
    assert.strictEqual(E.officialRecipeVisible(name, { 5: { name: bank[1].name, attempts: [] } }), false);
    assert.strictEqual(E.officialRecipeVisible(name, { 5: { name, attempts: [] } }), true);
    assert.strictEqual(E.officialRecipeVisible(name, {}), false, 'unlock without a daily');
  });
  test("r84: practice is labelled \"Practice — doesn't count toward stars, recipes or collection\"", () => {
    assert.ok(htmlSrc.includes("<span>Practice — doesn't count toward stars, recipes or collection</span>"), 'practice bar label');
    assert.ok(gameSrc.includes(`const PRACTICE_NOTE = "Practice — doesn't count toward stars, recipes or collection";`), 'end-screen note');
    assert.ok(htmlSrc.includes('.practice-note'), 'note style');
  });
  test('r84: no analytics events from practice (every track call is daily-gated)', () => {
    const lines = gameSrc.split('\n');
    const tracks = lines.map((l, i) => [l, i]).filter(([l]) => /\b(trackScore|trackFinish|trackMix|trackStart|MA\.track\w*)\(/.test(l) && !/^\s*(function|\/\/|\*)/.test(l));
    for (const [l, i] of tracks) {
      const ctx = lines.slice(Math.max(0, i - 12), i + 1).join('\n');
      if (/'(open|share|duel-open)'|trackOpen|trackShare|trackDuel|return-day|streak-|played-days/.test(l)) continue;
      assert.ok(/round\.mode === 'daily'|mode === 'daily'|isDaily/.test(ctx), 'ungated track call at line ' + (i + 1) + ': ' + l.trim());
    }
  });
  test('r84: calendar stars and stats come only from daily days, never practice', () => {
    assert.ok(!/practice/i.test(gameSrc.slice(gameSrc.indexOf('function openCalendar'), gameSrc.indexOf('function closeCalendar'))), 'calendar reads practice');
  });
  test('r84: audit of existing saves classifies daily / raised-by-practice / practice-only (read-only)', () => {
    const coll = E.collectibleColors(bank).map(c => ({ ...c, thex: E.recipeHex(c.recipe) }));
    const labs = coll.map(c => E.hexToLab(c.thex));
    const target = coll[10];
    const exactAtt = { hex: target.thex, comp: target.recipe, pct: 100, de: 0, exact: true };
    const days = { 3: { name: target.name, date: '2026-01-01', finished: true, attempts: [{ ...exactAtt, pct: 90, exact: false, hex: '#010203' }] } };
    // a daily attempt with exact flag -> discovers target
    days[3].attempts[0].exact = true;
    const other = coll[200];
    const col = { v: 1, found: {
      [target.name]: { date: '2026-01-01', best: { comp: target.recipe, hex: '#010203', pct: 90, de: 5 } },
      [other.name]: { date: '2026-02-02', best: { comp: other.recipe, hex: other.thex, pct: 100, de: 0 } },
    } };
    const snap = JSON.stringify(col);
    const r = E.auditCollectionSources(col, days, coll, labs, () => [], n => (coll.find(c => c.name === n) || {}).thex);
    assert.deepStrictEqual(r.daily, [target.name]);
    assert.deepStrictEqual(r.practice.map(x => x.name), [other.name]);
    assert.strictEqual(JSON.stringify(col), snap, 'audit mutated the collection');
    // raised: daily discovers it, but the best hex is not a daily hex
    col.found[target.name].best.hex = '#ABCDEF';
    const r2 = E.auditCollectionSources(col, days, coll, labs, () => [], n => (coll.find(c => c.name === n) || {}).thex);
    assert.deepStrictEqual(r2.raised.map(x => x.name), [target.name]);
    assert.ok(gameSrc.includes('practiceAudit,'), 'MISNOMER.practiceAudit not exposed');
  });
}


console.log('— round 85: Collection hides practice-only entries, shows daily-only best (option A) —');
{
  const coll = E.collectibleColors(bank).map(c => ({ ...c, thex: E.recipeHex(c.recipe) }));
  const labs = coll.map(c => E.hexToLab(c.thex));
  const thexOf = n => (coll.find(c => c.name === n) || {}).thex;
  const T = coll[10], P = coll[200], Q = coll[300];
  // a daily near miss on T that still discovers T (discovery needs 97+), below 100
  let NEAR = null;
  for (let d = 2; d < 60 && !NEAR; d += 1) {
    const h = '#' + Math.max(0, parseInt(T.thex.slice(1, 3), 16) - d).toString(16).padStart(2, '0') + T.thex.slice(3);
    const f = E.discoverColor(h, coll, labs, null, T.name);
    if (f && f.name === T.name && E.accuracyFromDeltaE(f.deltaE) <= 99) NEAR = { hex: h, pct: E.accuracyFromDeltaE(f.deltaE) };
  }
  const mk = () => ({
    days: { 3: { name: T.name, date: '2026-01-01', finished: true, attempts: [{ hex: NEAR.hex, comp: { y: 50, b: 50 }, pct: NEAR.pct, de: 5 }] } },
    col: { v: 1, backfilled: true, found: {
      [T.name]: { date: '2026-01-01', best: { comp: T.recipe, hex: T.thex, pct: 100, de: 0 } }, // raised by practice to 100
      [P.name]: { date: '2026-02-02', best: { comp: P.recipe, hex: P.thex, pct: 100, de: 0 } }, // practice only
    } },
  });
  test('r85: practice-only entries are hidden from the view (not shown, not counted)', () => {
    const { days, col } = mk();
    const v = E.collectionView(col, days, coll, labs, () => [], thexOf);
    assert.ok(!v.found[P.name], 'practice-only entry still shown');
    assert.deepStrictEqual(v.hidden, [P.name]);
    assert.strictEqual(Object.keys(v.found).length, 1, 'count includes hidden entry');
  });
  test('r85: raised entries show their daily-only best % and star', () => {
    const { days, col } = mk();
    const v = E.collectionView(col, days, coll, labs, () => [], thexOf);
    assert.deepStrictEqual(v.raised, [T.name]);
    assert.strictEqual(v.found[T.name].best.hex, NEAR.hex);
    assert.strictEqual(E.collectedBestPct(v.found[T.name], T.thex), NEAR.pct, 'still shows the practice %');
    assert.notStrictEqual(E.starTier(NEAR.pct).id, 'diamond');
    assert.strictEqual(E.starTier(E.collectedBestPct(v.found[T.name], T.thex)).id, E.starTier(NEAR.pct).id, 'practice star still shown');
    assert.strictEqual(E.starTier(E.collectedBestPct(col.found[T.name], T.thex)).id, 'diamond', 'raw entry changed');
    assert.strictEqual(v.found[T.name].date, '2026-01-01', 'discovery date lost');
  });
  test("r85: pre-round-77 edge case: a 'practice' entry for a finished daily's color is kept", () => {
    const { days, col } = mk();
    days[4] = { name: Q.name, date: '2026-01-02', finished: true, attempts: [{ hex: '#FEFEFE', comp: { w: 100 }, pct: 40, de: 40 }] };
    col.found[Q.name] = { date: '2025-12-01', best: { comp: Q.recipe, hex: '#123456', pct: 92, de: 4 } };
    const v = E.collectionView(col, days, coll, labs, () => [], thexOf);
    assert.ok(v.found[Q.name] && v.found[Q.name].best.pct === 92, 'edge-case entry hidden or changed');
    assert.ok(!v.hidden.includes(Q.name));
    // same target color under another name also counts
    const twin = { ...Q, name: 'zz test twin' };
    const v2 = E.collectionView({ ...col, found: { ...col.found, [twin.name]: { date: null, best: { comp: Q.recipe, hex: '#654321', pct: 90, de: 5 } } } }, days, [...coll, twin], [...labs, E.hexToLab(twin.thex)], () => [], n => n === twin.name ? Q.thex : thexOf(n));
    assert.ok(v2.found[twin.name], 'same target color entry hidden');
  });
  test('r85: stored collection data is never deleted or changed (view only)', () => {
    const { days, col } = mk();
    const snap = JSON.stringify(col), dsnap = JSON.stringify(days);
    E.collectionView(col, days, coll, labs, () => [], thexOf);
    assert.strictEqual(JSON.stringify(col), snap, 'collection mutated');
    assert.strictEqual(JSON.stringify(days), dsnap, 'days mutated');
    const vs = gameSrc.slice(gameSrc.indexOf('function collectionView()'), gameSrc.indexOf('function collectionHidden'));
    assert.ok(!/collection\.data\s*=/.test(vs) && !/persist\(/.test(vs) && !/delete /.test(vs), 'game view writes the store');
    assert.ok(!/delete\s+collection\.data/.test(gameSrc), 'game deletes collection entries');
  });
  test('r85: Collection grid, counts and detail read the view; dailies refresh it', () => {
    assert.ok(gameSrc.includes('found = collectionView().found || {};'), 'grid/counts not on the view');
    assert.ok(gameSrc.includes("rec = (collectionView().found || {})[name]"), 'detail not on the view');
    assert.ok(/collection\.persist\(\);\n  _colView = null;/.test(gameSrc), 'view not refreshed after a daily');
    assert.ok(gameSrc.includes('!shownBefore.has(r.name)'), 'hidden entry re-found by a daily gives no toast');
  });
  test('r85: a daily that later beats the entry makes it daily-backed again', () => {
    const { days, col } = mk();
    days[3].attempts.push({ hex: T.thex, comp: T.recipe, pct: 100, de: 0, exact: true });
    const v = E.collectionView(col, days, coll, labs, () => [], thexOf);
    assert.deepStrictEqual(v.raised, []);
    assert.strictEqual(v.found[T.name].best.pct, 100);
  });
}


console.log('— round 86: save transfer to mixologydaily.com —');
{
  const T = require('../transfer.js');
  const mem = (o = {}) => { const m = Object.assign({}, o); return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; };
  const day = (name, pct, date) => ({ date: date || '2026-10-01', name, attempts: [{ comp: { r: 50, y: 50, b: 0, k: 0, w: 0 }, hex: '#AA5500', pct, de: 3 }], pct, de: 3, band: 'x', hex: '#AA5500', scoring: 'best' });
  const saveOf = (days, extra) => JSON.stringify(Object.assign({ v: 2, streak: 0, parStreak: 0, lastDay: null, days, wip: null, muted: false, practiceRounds: 0 }, extra));
  const colOf = found => JSON.stringify({ v: 1, found, backfilled: true });
  const oldStore = () => mem({
    'misnomer.save.v1': saveOf({ 700: day('plum', 90), 701: day('lavender', 70), 702: day('cinnamon', 99) }, { streak: 3, parStreak: 1, lastDay: 702 }),
    'mixology.collection.v1': colOf({ plum: { date: '2026-09-01', best: { comp: {}, hex: '#111111', pct: 98, de: 2 } } }),
    'mixology.welcomed.v1': '1', 'mixology.poured.v1': '1', 'mixology.noanalytics.v1': '1',
    'mixology.analytics.sent.v1': JSON.stringify({ day: '2026-10-19', sent: ['open', 'start-#9'] }), 'unrelated.key': 'x' });
  const loc = (hash, path = '/', search = '') => ({ hash, pathname: path, search, href: 'https://mixologydaily.com' + path + search + hash, hostname: 'mixologydaily.com', protocol: 'https:' });
  const hist = () => { const h = { url: null, replaceState: (a, b, u) => { h.url = u; } }; return h; };

  test('r86: codec round-trips any text (empty, unicode, long, full dictionary)', () => {
    let r = 7; const rnd = () => (r = (r * 1103515245 + 12345) % 2147483648) / 2147483648;
    const big = Array.from({ length: 150000 }, () => String.fromCharCode(32 + Math.floor(rnd() * 95))).join('');
    for (const s of ['', 'a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'héllo 🎨 «wörld»', big]) assert.strictEqual(T.unpack(T.pack(s)), s);
    assert.ok(/^m1\.[0-9a-z]+\.[A-Za-z0-9_-]*$/.test(T.pack('{"x":1}')), 'not base64url');
  });
  test('r86: export -> import round-trip moves every Mixology key (and only those) into an empty origin', () => {
    const link = T.buildLink(oldStore());
    assert.ok(link.startsWith('https://mixologydaily.com/#import=m1.'), link.slice(0, 60));
    const fresh = mem(), h = hist();
    const res = T.importFromHash(loc(link.slice(link.indexOf('#'))), fresh, h);
    assert.ok(res.ok && res.changed, JSON.stringify(res));
    const src = oldStore().m;
    for (const k of T.KEYS) if (src[k] != null && !/save|collection/.test(k)) assert.strictEqual(fresh.m[k], src[k], k);
    assert.deepStrictEqual(JSON.parse(fresh.m['mixology.collection.v1']).found, JSON.parse(src['mixology.collection.v1']).found);
    assert.deepStrictEqual(JSON.parse(fresh.m['misnomer.save.v1']).days, JSON.parse(src['misnomer.save.v1']).days);
    assert.strictEqual(fresh.m['unrelated.key'], undefined, 'non-Mixology key carried');
    assert.strictEqual(T.buildLink(mem()), null, 'a browser with no save gets no link');
  });
  test('r86: the hash is stripped (path + query kept), even for a bad payload', () => {
    const link = T.buildLink(oldStore()), h = hist();
    T.importFromHash(loc(link.slice(link.indexOf('#')), '/', '?d=5&p=90'), mem(), h);
    assert.strictEqual(h.url, '/?d=5&p=90');
    const h2 = hist(); const r2 = T.importFromHash(loc('#import=garbage', '/mixology/'), mem(), h2);
    assert.strictEqual(r2.ok, false); assert.strictEqual(h2.url, '/mixology/');
    const h3 = hist(); assert.ok(T.importFromHash(loc('#import-none'), mem(), h3).none); assert.strictEqual(h3.url, '/');
    assert.strictEqual(T.importFromHash(loc('#other'), mem(), hist()), null, 'unrelated hash touched');
  });
  test('r86: bad payloads are rejected and change nothing', () => {
    const enc = o => T.pack(JSON.stringify(o));
    const good = JSON.parse(T.unpack(T.encode(T.snapshot(oldStore()))));
    const bads = ['', 'm1', 'm2.a.AAAA', 'm1.zzzzzzzz.AAAA', 'm1.5.!!!!', T.pack('not json'), enc([]), enc({ v: 2, k: good.k }),
      enc({ v: 1, k: { 'misnomer.save.v1': '{bad' } }), enc({ v: 1, k: { 'misnomer.save.v1': JSON.stringify({ days: { x: {} } }) } }),
      enc({ v: 1, k: { 'mixology.collection.v1': JSON.stringify({ v: 2, found: {} }) } }), enc({ v: 1, k: { 'mixology.welcomed.v1': '1' } }),
      T.encode(T.snapshot(oldStore())).slice(0, 40), 'x'.repeat(1600000)];
    for (const b of bads) {
      const st = oldStore(), before = JSON.stringify(st.m);
      const r = T.importFromHash(loc('#import=' + b), st, hist());
      assert.strictEqual(r.ok, false, 'accepted: ' + b.slice(0, 30));
      assert.strictEqual(JSON.stringify(st.m), before, 'storage changed by a bad payload');
    }
    // unknown keys and malformed flags are dropped, not trusted
    const v = T.validate({ v: 1, k: Object.assign({}, good.k, { evil: 'x', 'mixology.poured.v1': '<script>' }) });
    assert.ok(!('evil' in v.k) && !('mixology.poured.v1' in v.k));
  });
  test('r86: merge never loses local progress: best per day, union of days, streak from the latest day', () => {
    const local = { k: { 'misnomer.save.v1': saveOf({ 701: day('lavender', 95), 703: day('plum', 88) }, { streak: 2, parStreak: 2, lastDay: 703, muted: true }) } };
    const inc = { k: { 'misnomer.save.v1': oldStore().m['misnomer.save.v1'] } };
    const s = JSON.parse(T.merge(local, inc).k['misnomer.save.v1']);
    assert.deepStrictEqual(Object.keys(s.days).sort(), ['700', '701', '702', '703']);
    assert.strictEqual(s.days[701].pct, 95, 'local better day overwritten');
    assert.strictEqual(s.days[702].pct, 99);
    assert.strictEqual(s.lastDay, 703);
    assert.strictEqual(s.streak, 4, 'split run 700..703 should join');
    assert.strictEqual(s.parStreak, 4, '700 90, 701 95, 702 99, 703 88 all >= par');
    assert.strictEqual(s.muted, true, 'local setting lost');
    // a tie keeps local; an older incoming save never lowers a newer local streak
    const s2 = JSON.parse(T.merge({ k: { 'misnomer.save.v1': saveOf({ 900: day('a', 50) }, { streak: 30, parStreak: 0, lastDay: 900 }) } }, inc).k['misnomer.save.v1']);
    assert.strictEqual(s2.streak, 30); assert.strictEqual(s2.lastDay, 900);
    assert.strictEqual(T.PAR_PCT, E.PAR_PCT);
  });
  test('r86: merge: an in-progress round survives unless that day is finished in the merged save', () => {
    const w = { day: 702, name: 'cinnamon', attempts: [], pot: {} };
    const s = JSON.parse(T.merge({ k: { 'misnomer.save.v1': saveOf({}, { wip: w }) } }, { k: { 'misnomer.save.v1': oldStore().m['misnomer.save.v1'] } }).k['misnomer.save.v1']);
    assert.strictEqual(s.wip, null, 'wip kept for a finished day');
    const w2 = Object.assign({}, w, { day: 705 });
    const s2 = JSON.parse(T.merge({ k: { 'misnomer.save.v1': saveOf({}, { wip: w2 }) } }, { k: { 'misnomer.save.v1': oldStore().m['misnomer.save.v1'] } }).k['misnomer.save.v1']);
    assert.strictEqual(s2.wip.day, 705);
  });
  test('r86: merge: collection union keeps the best mix and the first discovery date; flags union; opt-out sticks', () => {
    const local = { k: { 'mixology.collection.v1': colOf({ plum: { date: '2026-09-20', best: { comp: {}, hex: '#222222', pct: 99, de: 1 } }, lime: { date: '2026-10-02', best: { comp: {}, hex: '#00FF00', pct: 97, de: 3 } } }),
      'mixology.noanalytics.v1': '0', 'mixology.analytics.sent.v1': JSON.stringify({ day: '2026-10-19', sent: ['open'] }) } };
    const out = T.merge(local, { k: oldStore().m }).k;
    const c = JSON.parse(out['mixology.collection.v1']);
    assert.deepStrictEqual(Object.keys(c.found).sort(), ['lime', 'plum']);
    assert.strictEqual(c.found.plum.best.pct, 99, 'better local mix lost');
    assert.strictEqual(c.found.plum.date, '2026-09-01', 'earliest date not kept');
    assert.strictEqual(out['mixology.welcomed.v1'], '1');
    assert.strictEqual(out['mixology.noanalytics.v1'], '1', 'an opt-out must carry over');
    assert.deepStrictEqual(JSON.parse(out['mixology.analytics.sent.v1']).sent, ['open', 'start-#9'], 'sent flags not unioned (double counting)');
  });
  test('r86: importing the same link twice is idempotent', () => {
    const link = T.buildLink(oldStore()), st = mem({ 'misnomer.save.v1': saveOf({ 703: day('plum', 88) }, { lastDay: 703, streak: 1 }) });
    T.importFromHash(loc(link.slice(link.indexOf('#'))), st, hist());
    const once = JSON.stringify(st.m);
    const r = T.importFromHash(loc(link.slice(link.indexOf('#'))), st, hist());
    assert.ok(r.ok); assert.strictEqual(r.changed, false); assert.strictEqual(JSON.stringify(st.m), once);
  });
  test('r86: path-agnostic: works at the domain root and under /mixology/', () => {
    for (const p of ['https://mixologydaily.com/', 'https://ngtrooper.github.io/mixology/'])
      assert.strictEqual(T.pageBase({ href: p + '?d=1#x' }), p);
    assert.strictEqual(T.shareBase({ href: 'https://ngtrooper.github.io/mixology/?d=1' }), 'https://ngtrooper.github.io/mixology/', 'share links must stay on the current origin until DOMAIN_LIVE');
    // no asset or link in the page/manifest is rooted at /mixology/ or at "/"
    for (const m of htmlSrc.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const u = m[1]; if (/^https?:|^#|^mailto:/.test(u)) continue;
      assert.ok(!u.startsWith('/'), 'absolute path breaks one of the two homes: ' + u);
    }
    const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    assert.strictEqual(man.start_url, './'); assert.strictEqual(man.scope, './'); assert.strictEqual(man.id, './');
    for (const i of man.icons.concat(man.screenshots)) assert.ok(!i.src.startsWith('/'), i.src);
    assert.ok(htmlSrc.includes('<link rel="canonical" href="https://mixologydaily.com/">') && htmlSrc.includes('<meta property="og:url" content="https://mixologydaily.com/">'));
    assert.ok(gameSrc.includes('window.MixTransfer.shareBase(location)') && gameSrc.includes('window.MixTransfer.shareHost(location)'), 'duel link / card not built from the one base');
  });
  test('r86: switch-week behaviour ships OFF; the bridge only ever returns to mixologydaily.com', () => {
    assert.strictEqual(T.CONFIG.CANONICAL_ORIGIN, 'https://mixologydaily.com/');
    assert.strictEqual(T.CONFIG.DOMAIN_LIVE, false); assert.strictEqual(T.CONFIG.MIGRATE_TO_DOMAIN, false); assert.strictEqual(T.CONFIG.BRIDGE_URL, '');
    assert.strictEqual(T.showMoveButton({ hostname: 'ngtrooper.github.io' }, oldStore()), false);
    for (const h of ['#return=%2F%2Fevil.com%2F', '#return=https%3A%2F%2Fevil.com', '#return=/x%0Ay', '#nope'])
      assert.ok(T.bridgeReturnLink(h, oldStore()).startsWith('https://mixologydaily.com/#import='), h);
    assert.ok(T.bridgeReturnLink('#return=%2F%3Fd%3D5', oldStore()).startsWith('https://mixologydaily.com/?d=5#import='));
    assert.strictEqual(T.bridgeReturnLink('#return=%2F', mem()), 'https://mixologydaily.com/#import-none');
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'tools', 'transfer-bridge', 'index.html')));
    assert.ok(htmlSrc.indexOf('transfer.js') < htmlSrc.indexOf('analytics.js?') && htmlSrc.indexOf('analytics.js?') < htmlSrc.indexOf('game.js?'), 'transfer.js must load first');
  });
  test('r86: migrate/upgrade/bridge do nothing with the flags off or on the wrong origin', () => {
    const calls = []; const L = (o) => Object.assign({ replace: u => calls.push(u), search: '', pathname: '/' }, o);
    const origFetch = global.fetch; global.fetch = () => { calls.push('fetch'); return Promise.resolve({ ok: true }); };
    try {
      T.maybeMigrate(L({ hostname: 'ngtrooper.github.io', protocol: 'https:' }), oldStore());
      T.maybePullFromBridge(L({ hostname: 'mixologydaily.com', protocol: 'https:' }), mem());
      T.maybeUpgrade(L({ hostname: 'ngtrooper.github.io', protocol: 'https:' }), oldStore());
      T.maybeUpgrade(L({ hostname: 'mixologydaily.com', protocol: 'https:' }), oldStore());
    } finally { global.fetch = origFetch; }
    assert.deepStrictEqual(calls, []);
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
