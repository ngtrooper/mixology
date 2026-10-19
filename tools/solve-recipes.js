#!/usr/bin/env node
/* Canonical recipe solver (build time only — never shipped to browser).
 *
 * Round 6: the pot is a PERCENTAGE composition {r,y,b,k,w} summing to
 * 100 (the percentage pot — see engine.js). For every bank color, find
 * the composition whose mixed color minimizes CIEDE2000 to the color's
 * official hex, under the exact engine mixing model. Method: shared
 * coarse grid (4% steps over r/y/b/k, w = remainder) -> CIE76 prefilter
 * -> CIEDE2000 on the best candidates -> deterministic coordinate
 * descent by TRANSFERS (move δ from one component to another, keeping
 * the sum at 100) at step sizes 4 / 2 / 1 / 0.5 / 0.25 %. Stored
 * recipes are rounded to 0.1% and the stored de is recomputed from the
 * rounded recipe, so a stored recipe always reproduces its stored de.
 * A color is DAILY-ELIGIBLE when best ΔE00 <= 12.
 *
 * Also grounds each color in the ISCC-NBS standard: nearest of the 267
 * published ISCC-NBS centroid colors (tools/nbs-iscc-raw.txt — the
 * Voluntocracy/Foster reconversion of Mundie's centroids) is recorded
 * as `iscc` when within ΔE00 10.
 *
 * Rewrites colors.js with {name, hex, recipe, de, iscc?} and writes
 * tools/recipe-report.json with the ΔE distribution.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');
const bank = require('../colors.js');

const KEYS = ['r', 'y', 'b', 'k', 'w'];

// ---------- ISCC-NBS centroids ----------
const isccRaw = fs.readFileSync(path.join(__dirname, 'nbs-iscc-raw.txt'), 'utf8');
const iscc = [];
for (const line of isccRaw.split('\n')) {
  const m = line.match(/^([A-Za-z_]+)\s+(#[0-9A-Fa-f]{6})\s*$/);
  if (m) iscc.push({ name: m[1].replace(/_/g, ' '), hex: m[2].toUpperCase(), lab: E.hexToLab(m[2]) });
}
console.log(`ISCC-NBS centroids parsed: ${iscc.length}`);

// ---------- coarse grid over compositions ----------
const STEP = 4;
const grid = []; // {comp, lab}
for (let r = 0; r <= 100; r += STEP)
  for (let y = 0; y <= 100 - r; y += STEP)
    for (let b = 0; b <= 100 - r - y; b += STEP)
      for (let k = 0; k <= 100 - r - y - b; k += STEP) {
        const comp = { r, y, b, k, w: 100 - r - y - b - k };
        grid.push({ comp, lab: E.hexToLab(E.mixColor(comp)) });
      }
console.log(`coarse grid mixes: ${grid.length}`);

function deOf(comp, targetLab) {
  return E.deltaE2000(E.hexToLab(E.mixColor(comp)), targetLab);
}

function solve(targetLab) {
  // CIE76 prefilter -> top 24 -> CIEDE2000
  const scored = [];
  for (const g of grid) {
    const d76 = (targetLab[0] - g.lab[0]) ** 2 + (targetLab[1] - g.lab[1]) ** 2 + (targetLab[2] - g.lab[2]) ** 2;
    scored.push([d76, g]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  let best = null, bestDe = Infinity;
  for (let i = 0; i < 40 && i < scored.length; i++) {
    const de = E.deltaE2000(scored[i][1].lab, targetLab);
    if (de < bestDe) { bestDe = de; best = { ...scored[i][1].comp }; }
  }
  // coordinate descent by transfers (sum stays exactly 100)
  for (const step of [4, 2, 1, 0.5, 0.25, 0.125]) {
    let improved = true;
    while (improved) {
      improved = false;
      for (const from of KEYS) {
        for (const to of KEYS) {
          if (from === to) continue;
          const delta = Math.min(step, best[from]);
          if (delta <= 0) continue;
          const cand = { ...best };
          cand[from] -= delta;
          cand[to] += delta;
          const de = deOf(cand, targetLab);
          if (de < bestDe - 1e-9) { bestDe = de; best = cand; improved = true; }
        }
      }
    }
  }
  return { recipe: best, de: bestDe };
}

/** Round to 0.1% keeping the sum at exactly 100 (residual lands on w). */
function roundRecipe(comp) {
  const out = {};
  let sum = 0;
  for (const key of ['r', 'y', 'b', 'k']) {
    out[key] = Math.round(comp[key] * 10) / 10;
    sum += out[key];
  }
  out.w = Math.round((100 - sum) * 10) / 10;
  if (out.w < 0) { out.w = 0; }
  return E.normalizeComp(out);
}

// ---------- solve the bank ----------
const t0 = Date.now();
const out = [];
const buckets = { '<=2': 0, '2-5': 0, '5-8': 0, '8-12': 0, '>12': 0 };
let isccHits = 0;
for (const c of bank) {
  const targetLab = E.hexToLab(c.hex);
  const { recipe } = solve(targetLab);
  const rounded = roundRecipe(recipe);
  const de = deOf(rounded, targetLab); // stored de = the rounded recipe's de
  // nearest ISCC-NBS centroid (grounding reference)
  let bestIscc = null, bestIsccDe = Infinity;
  for (const s of iscc) {
    const d = E.deltaE2000(targetLab, s.lab);
    if (d < bestIsccDe) { bestIsccDe = d; bestIscc = s; }
  }
  const entry = { name: c.name, hex: c.hex, recipe: rounded, de: Math.round(de * 100) / 100 };
  if (bestIsccDe <= 10) { entry.iscc = bestIscc.name; isccHits++; }
  out.push(entry);
  if (de <= 2) buckets['<=2']++;
  else if (de <= 5) buckets['2-5']++;
  else if (de <= 8) buckets['5-8']++;
  else if (de <= 12) buckets['8-12']++;
  else buckets['>12']++;
}
const eligible = out.filter(c => c.de <= 12);
const worst = [...out].sort((a, b) => b.de - a.de).slice(0, 15)
  .map(c => ({ name: c.name, hex: c.hex, de: c.de, recipe: c.recipe }));

const file = `/* Misnomer color bank — generated by tools/build-bank.js + tools/solve-recipes.js.
   Do not hand-edit; rerun the tools.
   Sources: XKCD color survey list (CC0 public domain) as official values,
   CSS/X11 spec names (public domain) as filler, hand-authored additions.
   recipe = canonical PERCENTAGE composition {r,y,b,k,w} (sums to 100)
   minimizing CIEDE2000 under the engine mixing model (the percentage
   pot, round 6); de = that minimum. Daily-eligible: de <= 12.
   iscc = nearest ISCC-NBS centroid name (grounding reference) when close.
   ${out.length} colors, ${eligible.length} daily-eligible. */
'use strict';
const MISNOMER_COLORS = ${JSON.stringify(out)};
if (typeof module !== 'undefined' && module.exports) module.exports = MISNOMER_COLORS;
if (typeof window !== 'undefined') window.MISNOMER_COLORS = MISNOMER_COLORS;
`;
fs.writeFileSync(path.join(__dirname, '..', 'colors.js'), file);
fs.writeFileSync(path.join(__dirname, 'recipe-report.json'), JSON.stringify({
  total: out.length, eligible: eligible.length, buckets, isccGrounded: isccHits, worst
}, null, 2));
console.log(`solved ${out.length} colors in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('ΔE distribution:', JSON.stringify(buckets));
console.log(`daily-eligible (ΔE<=12): ${eligible.length} / ${out.length}`);
console.log(`ISCC-NBS grounded (nearest centroid ΔE<=10): ${isccHits}`);
console.log('worst fits:', worst.slice(0, 8).map(c => `${c.name} ${c.de}`).join(' · '));
