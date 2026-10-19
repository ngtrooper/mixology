#!/usr/bin/env node
/* Build colors.js — the Misnomer color bank.
   Sources:
   1. XKCD color survey list (tools/xkcd-rgb.txt) — CC0 public domain
      (file header: https://creativecommons.org/publicdomain/zero/1.0/).
      Filtered for family-friendly, evocative names.
   2. CSS/X11 named colors (W3C spec data, public domain) — only names
      not already present (normalized) in the XKCD set.
   3. Hand-authored additions (deep shades the black bucket unlocks). */
'use strict';
const fs = require('fs');
const path = require('path');

const BANNED = ['vomit', 'puke', 'poop', 'poo', 'shit', 'piss', 'snot',
  'booger', 'diarrhea', 'diarrhoea', 'fart', 'pus', 'spunk', 'jizz'];

function norm(name) {
  return name.toLowerCase().replace(/[\s\-']+/g, '');
}

const bank = new Map(); // normName -> {name, hex}
function add(name, hex, source) {
  const key = norm(name);
  if (bank.has(key)) return false;
  bank.set(key, { name: name.toLowerCase(), hex: hex.toUpperCase(), source });
  return true;
}

// --- 1. XKCD -------------------------------------------------------------
const xkcdPath = path.join(__dirname, 'xkcd-rgb.txt');
const lines = fs.readFileSync(xkcdPath, 'utf8').split('\n');
let xkcdTotal = 0, xkcdKept = 0;
const filteredOut = [];
for (const line of lines) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const parts = t.split('\t');
  if (parts.length < 2) continue;
  const name = parts[0].trim().toLowerCase();
  const hex = parts[1].trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) continue;
  xkcdTotal++;
  if (BANNED.some(b => name.includes(b))) { filteredOut.push(name); continue; }
  if (add(name, hex, 'xkcd')) xkcdKept++;
}

// --- 2. CSS/X11 additions (spec values, only if name is new) -------------
const CSS = {
  'alice blue': '#F0F8FF', 'antique white': '#FAEBD7', 'aquamarine': '#7FFFD4',
  'azure': '#F0FFFF', 'beige': '#F5F5DC', 'bisque': '#FFE4C4',
  'blanched almond': '#FFEBCD', 'burly wood': '#DEB887', 'cadet blue': '#5F9EA0',
  'chartreuse': '#7FFF00', 'chocolate': '#D2691E', 'coral': '#FF7F50',
  'cornflower blue': '#6495ED', 'cornsilk': '#FFF8DC', 'dark goldenrod': '#B8860B',
  'dark khaki': '#BDB76B', 'dark salmon': '#E9967A', 'dark sea green': '#8FBC8F',
  'floral white': '#FFFAF0', 'gainsboro': '#DCDCDC', 'ghost white': '#F8F8FF',
  'goldenrod': '#DAA520', 'honeydew': '#F0FFF0', 'hot pink': '#FF69B4',
  'indian red': '#CD5C5C', 'ivory': '#FFFFF0', 'khaki': '#F0E68C',
  'lavender': '#E6E6FA', 'lavender blush': '#FFF0F5', 'lawn green': '#7CFC00',
  'lemon chiffon': '#FFFACD', 'light coral': '#F08080', 'light cyan': '#E0FFFF',
  'light goldenrod yellow': '#FAFAD2', 'light pink': '#FFB6C1',
  'light salmon': '#FFA07A', 'light sea green': '#20B2AA',
  'light steel blue': '#B0C4DE', 'linen': '#FAF0E6',
  'medium aquamarine': '#66CDAA', 'medium orchid': '#BA55D3',
  'medium purple': '#9370DB', 'medium sea green': '#3CB371',
  'medium slate blue': '#7B68EE', 'medium spring green': '#00FA9A',
  'medium turquoise': '#48D1CC', 'medium violet red': '#C71585',
  'mint cream': '#F5FFFA', 'misty rose': '#FFE4E1', 'moccasin': '#FFE4B5',
  'old lace': '#FDF5E6', 'olive drab': '#6B8E23', 'pale goldenrod': '#EEE8AA',
  'pale green': '#98FB98', 'pale turquoise': '#AFEEEE',
  'pale violet red': '#DB7093', 'papaya whip': '#FFEFD5',
  'peach puff': '#FFDAB9', 'peru': '#CD853F', 'plum': '#DDA0DD',
  'powder blue': '#B0E0E6', 'rosy brown': '#BC8F8F', 'royal blue': '#4169E1',
  'saddle brown': '#8B4513', 'salmon': '#FA8072', 'sandy brown': '#F4A460',
  'sea green': '#2E8B57', 'seashell': '#FFF5EE', 'sienna': '#A0522D',
  'sky blue': '#87CEEB', 'slate blue': '#6A5ACD', 'snow': '#FFFAFA',
  'spring green': '#00FF7F', 'steel blue': '#4682B4', 'tan': '#D2B48C',
  'thistle': '#D8BFD8', 'tomato': '#FF6347', 'turquoise': '#40E0D0',
  'violet': '#EE82EE', 'wheat': '#F5DEB3', 'white smoke': '#F5F5F5',
  'yellow green': '#9ACD32'
};
let cssAdded = 0;
for (const [n, h] of Object.entries(CSS)) if (add(n, h, 'css')) cssAdded++;

// --- 3. Hand-authored (deep shades, dark reds/wines, inks) ---------------
const AUTHORED = {
  'oxblood': '#4B0F14', 'claret': '#7F1734', 'garnet': '#831A29',
  'mahogany': '#4A1F16', 'espresso': '#2B160E', 'ink': '#101014',
  'midnight navy': '#0E1A33', 'deep navy': '#0A1E3C', 'petrol blue': '#005F6B',
  'deep teal': '#014D4E', 'forest floor': '#2E4B2F', 'pine forest': '#1E4634',
  'sagebrush': '#8A9471', 'burnt sienna': '#8F3B1F', 'raw umber': '#5C4633',
  'terracotta rose': '#B76E5D', 'dusty mauve': '#9B7E8E', 'plum noir': '#4E1A3D',
  'mulberry': '#72284F', 'boysenberry': '#6B3557', 'pomegranate': '#A61C30',
  'cranberry': '#A50E2E', 'bordeaux': '#80022D', 'charcoal blue': '#36454F',
  'graphite': '#383838', 'smoke': '#6E7B7B', 'pewter': '#8E9291',
  'basalt': '#2A2A2E', 'obsidian': '#0B0B10', 'onyx': '#0F0F12',
  'deep plum': '#3D0C2E', 'blackberry': '#3A2438', 'elderberry': '#3B2A4A',
  'juniper': '#3D5A45', 'kelp': '#35523B', 'swamp green': '#4A5D23',
  'wine red': '#8E1739', 'dark burgundy': '#4A0E1C', 'deep forest': '#12351F',
  'midnight green': '#0C3B2E', 'abyss blue': '#06172E', 'coal': '#17181A',
  'soot': '#211F1E', 'walnut': '#4F3626', 'cocoa bean': '#2E1A12'
};
let authoredAdded = 0;
for (const [n, h] of Object.entries(AUTHORED)) if (add(n, h, 'authored')) authoredAdded++;

const colors = [...bank.values()].sort((a, b) => a.name.localeCompare(b.name));
const out = `/* Misnomer color bank — generated by tools/build-bank.js. Do not hand-edit.
   Sources: XKCD color survey list (CC0 public domain, tools/xkcd-rgb.txt),
   CSS/X11 spec names (public domain), hand-authored additions.
   ${colors.length} colors. Entry: {name, hex} (+src in build log only). */
'use strict';
const MISNOMER_COLORS = ${JSON.stringify(colors.map(c => ({ name: c.name, hex: c.hex })), null, 0)};
if (typeof module !== 'undefined' && module.exports) module.exports = MISNOMER_COLORS;
if (typeof window !== 'undefined') window.MISNOMER_COLORS = MISNOMER_COLORS;
`;
fs.writeFileSync(path.join(__dirname, '..', 'colors.js'), out);
console.log(`XKCD lines parsed: ${xkcdTotal}, kept: ${xkcdKept}, filtered out (${filteredOut.length}): ${filteredOut.join(', ')}`);
console.log(`CSS added: ${cssAdded}, authored added: ${authoredAdded}`);
console.log(`TOTAL BANK: ${colors.length}`);
