#!/usr/bin/env node
/* Frozen daily schedule builder (round 8). Writes schedule.js:
 * MIXOLOGY_SCHEDULE[day] = color name, day = display day number
 * (#1 = 2025-01-01 local, the same DAY game.js shows).
 *
 * WHY: the old picker shuffled over POOL.length, so ANY pool change
 * (a re-solve, a fairness filter) reshuffled every day — past days,
 * duel links, and today's color for players mid-round. The schedule is
 * now data, and this tool only ever touches days that are not yet live.
 *
 * Rules:
 *  - Days <= FREEZE_THROUGH are copied verbatim from the existing
 *    schedule.js (or, on the first build, from the legacy picker output
 *    tools/legacy-schedule-epoch0.json = the v1 algorithm over the
 *    810-color ΔE<=12 pool, days 0..809). Never edited, eligible or not.
 *  - FREEZE_THROUGH defaults to (local today's DAY + 1) so a player in
 *    any timezone already on "tomorrow" keeps their color. Override:
 *    node tools/build-schedule.js --freeze-through=700
 *  - Later days keep their existing entry if it is still daily-eligible
 *    (engine.isDailyEligible); an ineligible entry is replaced by a
 *    seeded pick among eligible colors not used within ±REPEAT_GAP days.
 *  - Days past the existing schedule are filled with seeded shuffle-bags
 *    of the eligible pool, with no repeat inside REPEAT_GAP days across
 *    bag boundaries, out to HORIZON.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../engine.js');
const BANK = require('../colors.js');

const HORIZON = 4018;     // last scheduled DAY (~2035-12-31); game.js falls back to the picker past it
const REPEAT_GAP = 120;   // no color twice within this many days

const OUT = path.join(__dirname, '..', 'schedule.js');
const arg = process.argv.find(a => a.startsWith('--freeze-through='));
const FREEZE_THROUGH = arg ? parseInt(arg.split('=')[1], 10) : E.dayNumber(new Date()) + 1 + 1;

const byName = new Map(BANK.map(c => [c.name, c]));
const pool = BANK.filter(c => !c.retired && E.isDailyEligible(c.de)).map(c => c.name); // round 66: retired names never scheduled
const eligible = new Set(pool);

let existing;
if (fs.existsSync(OUT)) {
  const g = {};
  new Function('window', 'module', fs.readFileSync(OUT, 'utf8'))(g, undefined);
  existing = g.MIXOLOGY_SCHEDULE;
} else {
  existing = require('./legacy-schedule-epoch0.json');
}

const sched = new Array(HORIZON + 1).fill(null);
for (let d = 0; d <= HORIZON && d < existing.length; d++) {
  const name = existing[d];
  if (!byName.has(name)) {
    if (d <= FREEZE_THROUGH) throw new Error(`frozen day ${d} names "${name}", which is no longer in the bank`);
    continue;
  }
  if (d <= FREEZE_THROUGH || eligible.has(name)) sched[d] = name;
}

function usedNear(d) {
  const s = new Set();
  for (let i = Math.max(0, d - REPEAT_GAP); i <= Math.min(HORIZON, d + REPEAT_GAP); i++) if (i !== d && sched[i]) s.add(sched[i]);
  return s;
}

// ---- Round 72 (Franklin): holiday colors on holidays (future days only) ----
// For every holiday after FREEZE_THROUGH through HORIZON: pick a fitting
// daily-eligible color (tools/holiday-colors.js), rotating by year, avoiding a
// repeat within REPEAT_GAP of a frozen day or another holiday pick. Then the
// pick takes the day: any other (non-holiday, future) use of that color within
// REPEAT_GAP is cleared, and the displaced color moves into one of those
// cleared slots when it fits there; remaining holes are refilled from the bag.
const { candidatesFor } = require('./holiday-colors.js');
const dayOf = (y, m, d) => E.dayNumber(new Date(y, m - 1, d)) + 1;
const holidayDays = new Map(); // day -> { id, label, name, exception? }
const holidayExceptions = [];
{
  const firstYear = new Date(2025, 0, 1 + FREEZE_THROUGH).getFullYear(), lastYear = new Date(2025, 0, HORIZON).getFullYear();
  const list = [];
  for (let y = firstYear; y <= lastYear; y++) for (const h of E.holidaysForYear(y)) {
    const d = dayOf(y, h.month, h.day);
    if (d > FREEZE_THROUGH && d <= HORIZON) list.push({ d, y, h });
  }
  list.sort((a, b) => a.d - b.d);
  const picksNear = (name, d) => {
    for (const [hd, v] of holidayDays) if (v.name === name && Math.abs(hd - d) <= REPEAT_GAP) return true;
    for (let i = Math.max(0, d - REPEAT_GAP); i <= Math.min(FREEZE_THROUGH, d + REPEAT_GAP); i++) if (sched[i] === name) return true;
    return false;
  };
  for (const { d, y, h } of list) {
    const cands = candidatesFor(h.id, y).filter(n => eligible.has(n));
    if (!cands.length) { holidayExceptions.push(`${h.id} ${y}: no eligible candidate (skipped)`); continue; }
    // stable across rebuilds: keep the current entry when it is a valid candidate
    let name = cands.includes(sched[d]) && !picksNear(sched[d], d) ? sched[d] : cands.find(n => !picksNear(n, d));
    if (!name) { name = cands[0]; holidayExceptions.push(`${h.id} ${y} (day ${d}): "${name}" repeats within ${REPEAT_GAP} days of another holiday/frozen day`); }
    holidayDays.set(d, { id: h.id, label: h.label, name });
  }
  let moved = 0, cleared = 0;
  for (const [d, v] of holidayDays) {
    const displaced = sched[d];
    sched[d] = v.name;
    if (displaced === v.name) continue;
    const holes = [];
    for (let i = Math.max(FREEZE_THROUGH + 1, d - REPEAT_GAP); i <= Math.min(HORIZON, d + REPEAT_GAP); i++) {
      if (i !== d && sched[i] === v.name && !holidayDays.has(i)) { sched[i] = null; holes.push(i); cleared++; }
    }
    if (displaced) {
      for (const i of holes) {
        let clash = false;
        for (let j = Math.max(0, i - REPEAT_GAP); j <= Math.min(HORIZON, i + REPEAT_GAP); j++) if (j !== i && sched[j] === displaced) { clash = true; break; }
        if (!clash) { sched[i] = displaced; moved++; break; }
      }
    }
  }
  console.log(`holidays: ${holidayDays.size} future holiday days set, ${cleared} nearby repeats cleared, ${moved} displaced colors moved into them`);
  for (const x of holidayExceptions) console.log('  exception: ' + x);
}

// Fill gaps: replaced holes inside the existing range, then fresh bags.
let bag = [], bagNo = 0;
function nextFromBag(d) {
  const near = usedNear(d);
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!bag.length) {
      const rng = E.mulberry32(E.hashSeed('mixology-schedule-bag-' + bagNo++ + '-n' + pool.length));
      bag = pool.slice();
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    const idx = bag.findIndex(n => !near.has(n));
    if (idx >= 0) return bag.splice(idx, 1)[0];
    bag = [];
  }
  throw new Error(`no eligible color free of repeats near day ${d}`);
}
let replaced = 0, filled = 0;
for (let d = FREEZE_THROUGH + 1; d <= HORIZON; d++) {
  if (sched[d]) continue;
  sched[d] = nextFromBag(d);
  if (d < existing.length) replaced++; else filled++;
}
for (let d = 0; d <= FREEZE_THROUGH; d++) if (!sched[d]) throw new Error(`frozen day ${d} is empty`);

const file = `/* Mixology frozen daily schedule — generated by tools/build-schedule.js.
   Do not hand-edit. MIXOLOGY_SCHEDULE[day] = color name for display day
   #day (#1 = 2025-01-01, local time). Days <= ${FREEZE_THROUGH} were frozen when
   this file was last built; past days never change. ${HORIZON + 1} entries. */
'use strict';
const MIXOLOGY_SCHEDULE = ${JSON.stringify(sched.join('|'))}.split('|');
if (typeof module !== 'undefined' && module.exports) module.exports = MIXOLOGY_SCHEDULE;
if (typeof window !== 'undefined') window.MIXOLOGY_SCHEDULE = MIXOLOGY_SCHEDULE;
`;
fs.writeFileSync(OUT, file);
console.log(`schedule.js: days 0..${HORIZON}, frozen through ${FREEZE_THROUGH}, ` +
  `${replaced} future entries refilled (ineligible or cleared for a holiday pick), ${filled} new days filled; pool ${pool.length}`);
