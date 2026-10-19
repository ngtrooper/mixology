#!/usr/bin/env node
/* Round 77 (Franklin): WHOLE-DROP RECIPES. Run after tools/solve-recipes.js.
 *
 * The disc numbers the player sees are whole percents, so a recipe with
 * 8.5% red could never be matched by eye, and the old target (the raw XKCD /
 * CSS hex) was often a color the five paints cannot make exactly, which
 * capped scores at 95-99%. This pass rounds every solver recipe to WHOLE
 * percents (sum 100; each paint 0 or >= 1%): it searches every integer
 * composition within ±2% per paint of the rounded solver recipe (repeated
 * from the best one until it settles) and keeps the one closest (CIEDE2000) to the named hex. `de` is recomputed from the new
 * recipe (it still measures how well the recipe represents the NAME, and
 * still decides daily eligibility). The scoring target of a color is now
 * the color its recipe renders (engine.recipeHex), so the recipe scores 100%.
 *
 * Rewrites colors.js in place; prints a summary. Idempotent.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');
const FILE = path.join(__dirname, '..', 'colors.js');
const bank = require(FILE);
const K = ['r', 'y', 'b', 'k', 'w'];
const labOf = comp => E.hexToLab(E.mixColor(comp));

function wholeDrop(c) {
  const T = E.hexToLab(c.hex);
  let base = K.map(k => Math.round(c.recipe[k] || 0));
  const R = [-2, -1, 0, 1, 2];
  let best = null, bd = Infinity;
  // repeat the ±2 neighborhood search from the best so far until it settles,
  // so a rerun on its own output changes nothing (idempotent)
  for (let pass = 0; pass < 50; pass++) {
  const before = bd;
  for (const a of R) for (const b of R) for (const d of R) for (const e of R) {
    const v = [base[0] + a, base[1] + b, base[2] + d, base[3] + e];
    if (v.some(x => x < 0)) continue;
    const w = 100 - v[0] - v[1] - v[2] - v[3];
    if (w < 0) continue;
    const comp = { r: v[0], y: v[1], b: v[2], k: v[3], w };
    const de = E.deltaE2000(labOf(comp), T);
    if (de < bd - 1e-9) { bd = de; best = comp; }
  }
  if (!(bd < before - 1e-9)) break;
  base = K.map(k => best[k]);
  }
  return { recipe: best, de: Math.round(bd * 100) / 100 };
}

let changed = 0, eligFlip = 0;
const out = bank.map(c => {
  let r = wholeDrop(c);
  for (let i = 0; i < 10; i++) { const n = wholeDrop({ ...c, recipe: r.recipe }); if (K.every(k => n.recipe[k] === r.recipe[k])) break; r = n; } // settle fully
  if (K.some(k => r.recipe[k] !== c.recipe[k])) changed++;
  if (E.isDailyEligible(r.de) !== E.isDailyEligible(c.de)) eligFlip++;
  const o = { name: c.name, hex: c.hex, recipe: r.recipe, de: r.de };
  for (const k of Object.keys(c)) if (!(k in o)) o[k] = c[k];
  return o;
});
let src = fs.readFileSync(FILE, 'utf8');
const start = src.indexOf('const MISNOMER_COLORS = '), end = src.indexOf('];', start) + 2;
src = src.slice(0, start) + 'const MISNOMER_COLORS = ' + JSON.stringify(out) + ';' + src.slice(end);
if (!src.includes('whole-drop-recipes.js')) src = src.replace('Do not hand-edit; rerun the tools.', 'Do not hand-edit; rerun the tools.\n   Round 77: recipes are WHOLE percents (tools/whole-drop-recipes.js, run last);\n   the scoring target of a color is the color its recipe renders.');
fs.writeFileSync(FILE, src);
console.log(`whole-drop recipes: ${out.length} colors, ${changed} recipes changed, ${eligFlip} eligibility flips`);
