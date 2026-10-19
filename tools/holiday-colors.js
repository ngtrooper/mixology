/* Round 72 (Franklin): themed daily colors for holidays. Every name must be in
 * the bank AND daily-eligible (a test enforces it). Candidates rotate by year
 * (year % length) so a holiday is not identical every year; build-schedule.js
 * takes the first candidate, from the rotated start, that does not repeat
 * within REPEAT_GAP days of another holiday pick or a frozen day.
 * `byParity` (Independence Day) alternates a red list and a blue list. */
'use strict';
const HOLIDAY_COLORS = {
  'new-year': ['gold', 'pale gold', 'silver'],
  'lunar-new-year': ['vermillion', 'red', 'golden yellow'],
  'groundhog': ['brown', 'chestnut', 'cocoa'],
  'valentines': ['rose', 'hot pink', 'rose pink'],
  'mardi-gras': ['royal purple', 'emerald green', 'golden yellow'],
  'pi-day': ['cherry', 'apple', 'butterscotch'],
  'st-patricks': ['shamrock', 'kelly green', 'irish green'],
  'easter': ['lavender', 'pastel yellow', 'egg shell', 'baby pink'],
  'earth-day': ['earth', 'leaf green', 'grass green'],
  'cinco-de-mayo': ['emerald', 'scarlet'],
  'mothers-day': ['carnation pink', 'carnation', 'blush pink'],
  'pride': ['magenta', 'orchid', 'medium purple'],
  'fathers-day': ['navy', 'denim', 'khaki'],
  'independence-day': { byParity: [['fire engine red', 'cherry red'], ['navy blue', 'royal blue']] },
  'halloween': ['pumpkin', 'pumpkin orange'],
  'diwali': ['marigold', 'saffron'],
  'thanksgiving': ['cranberry', 'cinnamon', 'burnt orange'],
  'hanukkah': ['sapphire', 'cobalt blue', 'royal blue'],
  'christmas-eve': ['evergreen', 'pine green', 'forest green'],
  'christmas': ['scarlet', 'crimson', 'cherry red']
};
/** Candidate list for a holiday in a given year, rotated so year Y starts at index Y % n. */
function candidatesFor(id, year) {
  const spec = HOLIDAY_COLORS[id]; if (!spec) return [];
  if (spec.byParity) { const main = spec.byParity[year % 2], other = spec.byParity[1 - year % 2]; return [...main, ...other]; }
  const k = year % spec.length; return [...spec.slice(k), ...spec.slice(0, k)];
}
module.exports = { HOLIDAY_COLORS, candidatesFor };
