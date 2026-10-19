#!/usr/bin/env node
/* Round 69: measure the Collection discovery rate for a few DISCOVER_DE
 * thresholds under simple player models. Usage: node tools/discovery-rate.js
 * Player model: for a daily target, the player's mix is the solver recipe with
 * each paint's share scaled by a lognormal error (sigma by skill), and some
 * chance of a stray extra paint; then snapped like the real pot. Two seals per
 * round. Reports: target accuracy (sanity), P(a seal discovers anything),
 * P(the target itself), and the collection size after 30 / 90 / 365 rounds. */
'use strict';
const E = require('../engine.js');
const BANK = require('../colors.js');
const POOL = BANK.filter(c => !c.retired && E.isDailyEligible(c.de));
const KEYS = ['r', 'y', 'b', 'k', 'w'];
function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function playerMix(target, sigma, rng) {
  const c = {};
  for (const k of KEYS) c[k] = target.recipe[k] * Math.exp(sigma * gauss(rng));
  if (rng() < 0.3) { const k = KEYS[Math.floor(rng() * 5)]; c[k] += 2 + rng() * 10 * sigma; }
  return E.snapTraces(c);
}
const SKILLS = { casual: 0.9, regular: 0.6, sharp: 0.35 };
const out = {};
for (const T of [2, 3, 4, 5]) {
  const coll = E.collectibleColors(BANK), labs = coll.map(c => E.hexToLab(c.hex));
  out[T] = { collectible: coll.length };
  for (const [skill, sigma] of Object.entries(SKILLS)) {
    const rng = E.mulberry32(69 + T * 7 + Math.round(sigma * 100));
    let seals = 0, hits = 0, own = 0, acc = 0; const found = new Set(); const sizes = {};
    for (let round = 1; round <= 365; round++) {
      const target = POOL[Math.floor(rng() * POOL.length)];
      for (let s = 0; s < 2; s++) {
        const comp = playerMix(target, sigma * (s ? 0.8 : 1), rng), hex = E.mixColor(comp);
        acc += E.accuracyFromDeltaE(E.deltaE2000(E.hexToLab(hex), E.hexToLab(target.hex)));
        const d = E.discoverColor(hex, coll, labs, T, target.name); seals++;
        if (d) { hits++; if (d.name === target.name) own++; found.add(d.name); }
      }
      if ([30, 90, 365].includes(round)) sizes[round] = found.size;
    }
    out[T][skill] = { avgAcc: Math.round(acc / seals), perSeal: Math.round(100 * hits / seals) + '%', targetItself: Math.round(100 * own / seals) + '%', after30: sizes[30], after90: sizes[90], after365: sizes[365] };
  }
}
console.log(JSON.stringify(out, null, 1));
