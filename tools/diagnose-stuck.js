#!/usr/bin/env node
/* Stuck-pot diagnosis — round-6 replay.
 *
 * Round 5 measured the DROPS model's failure (full record:
 * tools/stuck-diagnosis-round5.md): mud pot needed 231 drops = 7.7 s of
 * white pouring to move ΔE >= 10; black pot 119 drops = 4.0 s; and two
 * pots were HARD stuck at the per-pigment cap (recovery impossible).
 *
 * This script replays the same scenarios against the current engine —
 * the PERCENTAGE POT (round 6): the equivalent compositions (the old
 * pots expressed as %), counter-poured at the shipped 30 units/sec.
 * The old cap states cannot even be constructed anymore: there is no
 * cap, and every composition is displaced, never accumulated. */
'use strict';
const E = require('../engine.js');
const lab = c => E.hexToLab(E.mixColor(c));
const de = (a, b) => E.deltaE2000(lab(a), lab(b));
const pour = (comp, key, units) => { let c = comp; for (let i = 0; i < units; i++) c = E.addUnits(c, key, 1); return c; };

console.log('=== (a) MUD POT — old: 130R+130Y+130B in 30 base (= 31/31/31% + 7% white) ===');
const mud = { r: 31, y: 31, b: 31, k: 0, w: 7 };
console.log('start hex', E.mixColor(mud), 'Lab', lab(mud).map(x => x.toFixed(1)).join(','));
console.log(`pour WHITE 1s (30 units): ΔE moved ${de(mud, pour(mud, 'w', 30)).toFixed(1)}  (round 5: ΔE 10 needed 7.7 s)`);

console.log('\n=== (b) BLACK POT — old: 200K in 30 base (= 87% black, 13% white) ===');
const blk = { r: 0, y: 0, b: 0, k: 87, w: 13 };
console.log('start hex', E.mixColor(blk), 'Lab', lab(blk).map(x => x.toFixed(1)).join(','));
console.log(`pour RED 1s (30 units): ΔE moved ${de(blk, pour(blk, 'r', 30)).toFixed(1)}  (round 5: ΔE 10 needed 4.0 s)`);

console.log('\n=== (c) THE OLD HARD-STUCK STATES ===');
console.log('cap lock-in / volume ceiling: UNREACHABLE BY CONSTRUCTION — the engine');
console.log('exports no cap (MAX_DROPS =', E.MAX_DROPS, ') and dosing is displacement:');
let c = { ...E.FRESH_COMP };
for (let i = 0; i < 5000; i++) c = E.addUnits(c, 'k', 1);
console.log(`after 5000 consecutive black units: k = ${c.k.toFixed(2)}% (still displacing, never refused)`);
console.log('and it still recovers: pour white 1s from there moves ΔE',
  de(c, pour(c, 'w', 30)).toFixed(1));

console.log('\n=== (d) UNDO ===');
console.log('game.js undo is gesture-based (round 6): one snapshot per press/hold,');
console.log('so one Undo click takes back a whole pour (round 5: up to 90 clicks).');
