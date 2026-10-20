/* Mixology save transfer (round 86, Franklin): moving from
 * ngtrooper.github.io/mixology/ to https://mixologydaily.com/.
 *
 * localStorage is per origin, so the save has to travel in a link:
 *   https://mixologydaily.com/#import=m1.<bytes>.<data>
 * where <data> is the UTF-8 JSON snapshot of every Mixology key, LZW-packed
 * into base64url (fragments are never sent to a server, and browsers keep
 * a fragment across GitHub's 301). The new origin validates it, MERGES it
 * into what is already there (never loses local progress), strips the hash
 * and shows "Your progress moved over ✓". Importing twice changes nothing.
 *
 * Loaded BEFORE analytics.js and game.js, so an import lands before the game
 * reads its save and before analytics reads its once-per-day flags.
 * Everything here is synchronous and wrapped in try/catch: a bad link can
 * never break the game. All switch-week behaviour ships OFF (see CONFIG and
 * /workspace/research/mixology_domain_switch.md). */
(function (root) {
  'use strict';
  const CONFIG = {
    CANONICAL_ORIGIN: 'https://mixologydaily.com/',
    OLD_HOST: 'ngtrooper.github.io',
    // true once mixologydaily.com serves the game over HTTPS: share/duel links,
    // the share card and the "Move my progress" button switch to the domain
    DOMAIN_LIVE: true, // round 89: mixologydaily.com is live (custom domain set 2026-10-19)
    // switch week: send github.io visitors to the domain (with their save)
    MIGRATE_TO_DOMAIN: false,
    // pull bridge: a page on another ngtrooper.github.io path (same origin as
    // the old game, so it can still read the old save after GitHub's 301)
    BRIDGE_URL: 'https://ngtrooper.github.io/mixology-move/', // round 88: live (repo ngtrooper/mixology-move)
  };
  const SAVE_KEY = 'misnomer.save.v1', COLLECTION_KEY = 'mixology.collection.v1';
  const KEYS = [SAVE_KEY, COLLECTION_KEY, 'mixology.welcomed.v1', 'mixology.poured.v1',
    'mixology.noanalytics.v1', 'mixology.analytics.sent.v1', 'skipgc'];
  const BRIDGE_CHECKED_KEY = 'mixology.bridge.checked.v1';
  const PAR_PCT = 85; // = engine PAR_PCT (tested)
  const MAX_LINK = 1500000, MAX_BYTES = 4000000;

  /* ---------- codec: UTF-8 bytes -> LZW (9..16-bit codes) -> base64url ---------- */
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B64I = (() => { const m = {}; for (let i = 0; i < 64; i++) m[B64[i]] = i; return m; })();
  const DICT_MAX = 65536;
  // width of the j-th code: codes emitted so far can be at most 255 + j
  const widthFor = j => Math.min(16, 32 - Math.clz32(256 + j));
  function utf8(s) { return new TextEncoder().encode(s); }
  function unutf8(b) { return new TextDecoder('utf-8', { fatal: true }).decode(b); }
  function pack(str) {
    const bytes = utf8(str), out = [];
    let acc = 0, n = 0;
    const put = (v, w) => { for (let i = w - 1; i >= 0; i--) { acc = (acc << 1) | ((v >> i) & 1); if (++n === 6) { out.push(B64[acc]); acc = 0; n = 0; } } };
    if (bytes.length) {
      const dict = new Map(); let next = 256, j = 0, w = bytes[0];
      for (let i = 1; i < bytes.length; i++) {
        const b = bytes[i], k = w * 256 + b, hit = dict.get(k);
        if (hit !== undefined) { w = hit; continue; }
        put(w, widthFor(j++));
        if (next < DICT_MAX) dict.set(k, next++);
        w = b;
      }
      put(w, widthFor(j));
    }
    if (n) out.push(B64[acc << (6 - n)]);
    return 'm1.' + bytes.length.toString(36) + '.' + out.join('');
  }
  function unpack(s) {
    const m = /^m1\.([0-9a-z]{1,8})\.([A-Za-z0-9_-]*)$/.exec(String(s || ''));
    if (!m) throw new Error('format');
    const total = parseInt(m[1], 36), data = m[2];
    if (!(total >= 0 && total <= MAX_BYTES)) throw new Error('size');
    let pos = 0, acc = 0, n = 0;
    const get = w => { let v = 0; for (let i = 0; i < w; i++) { if (!n) { if (pos >= data.length) throw new Error('truncated'); acc = B64I[data[pos++]]; n = 6; } v = (v << 1) | ((acc >> --n) & 1); } return v; };
    const out = new Uint8Array(total); let len = 0;
    const emit = arr => { if (len + arr.length > total) throw new Error('overflow'); out.set(arr, len); len += arr.length; };
    if (total) {
      const dict = []; for (let i = 0; i < 256; i++) dict.push([i]);
      let j = 0, c = get(widthFor(j++));
      if (c > 255) throw new Error('code');
      let w = dict[c]; emit(w);
      while (len < total) {
        c = get(widthFor(j++));
        let e;
        if (c < dict.length) e = dict[c];
        else if (c === dict.length) e = w.concat(w[0]);
        else throw new Error('code');
        emit(e);
        if (dict.length < DICT_MAX) dict.push(w.concat(e[0]));
        w = e;
      }
    }
    return unutf8(out);
  }

  /* ---------- snapshot / validation ---------- */
  function snapshot(storage) {
    const k = {};
    for (const key of KEYS) { try { const v = storage.getItem(key); if (v != null) k[key] = String(v); } catch (e) { /* skip */ } }
    return { v: 1, k };
  }
  function parseJSON(s) { try { return JSON.parse(s); } catch (e) { return undefined; } }
  const isObj = o => !!o && typeof o === 'object' && !Array.isArray(o);
  function validSave(o) {
    if (!isObj(o) || (o.days != null && !isObj(o.days))) return false;
    for (const [d, r] of Object.entries(o.days || {})) {
      if (!/^-?\d{1,6}$/.test(d) || !isObj(r) || typeof r.name !== 'string' || (r.attempts != null && !Array.isArray(r.attempts))) return false;
    }
    return true;
  }
  function validCollection(o) { return isObj(o) && o.v === 1 && isObj(o.found) && Object.values(o.found).every(e => isObj(e) && isObj(e.best)); }
  function validSent(o) { return isObj(o) && typeof o.day === 'string' && Array.isArray(o.sent) && o.sent.every(x => typeof x === 'string'); }
  /** Throws on anything that is not a well-formed Mixology snapshot. Unknown
   *  keys are dropped; malformed flags are dropped; a malformed save or
   *  collection rejects the whole link. */
  function validate(snap) {
    if (!isObj(snap) || snap.v !== 1 || !isObj(snap.k)) throw new Error('shape');
    const k = {};
    for (const [key, val] of Object.entries(snap.k)) {
      if (!KEYS.includes(key) || typeof val !== 'string') continue;
      if (key === SAVE_KEY) { if (!validSave(parseJSON(val))) throw new Error('save'); }
      else if (key === COLLECTION_KEY) { if (!validCollection(parseJSON(val))) throw new Error('collection'); }
      else if (key === 'mixology.analytics.sent.v1') { if (!validSent(parseJSON(val))) continue; }
      else if (!/^[01t]$/.test(val)) continue;
      k[key] = val;
    }
    if (!k[SAVE_KEY] && !k[COLLECTION_KEY]) throw new Error('empty');
    return { v: 1, k };
  }
  function encode(snap) { return pack(JSON.stringify(snap)); }
  function decode(str) {
    if (typeof str !== 'string' || str.length > MAX_LINK) throw new Error('size');
    const snap = parseJSON(unpack(str));
    return validate(snap);
  }

  /* ---------- merge (pure) ---------- */
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : -1);
  function runEndingAt(days, last, pred) {
    let n = 0; for (let d = last; days[d] && pred(days[d]); d--) n++; return n;
  }
  /** Never loses local progress: days are unioned (best % per day wins, a tie
   *  keeps local), streaks follow the latest played day and are re-derived
   *  from the merged days, so a run split across two origins joins up. */
  function mergeSave(L, I) {
    if (!isObj(I)) return L; if (!isObj(L)) return I;
    const days = Object.assign({}, L.days || {}); let changed = false;
    for (const [d, r] of Object.entries(I.days || {})) {
      if (!days[d] || num(r.pct) > num(days[d].pct)) { days[d] = r; changed = true; }
    }
    const lL = L.lastDay == null ? -Infinity : Number(L.lastDay), lI = I.lastDay == null ? -Infinity : Number(I.lastDay);
    const lastDay = Math.max(lL, lI);
    const side = (lI > lL) ? I : (lL > lI) ? L : null;
    const keep = f => side ? num(side[f]) : Math.max(num(L[f]), num(I[f]));
    const out = Object.assign({}, I, L, { days, v: Math.max(num(L.v), num(I.v), 1) });
    if (Number.isFinite(lastDay)) {
      out.lastDay = lastDay;
      out.streak = Math.max(0, keep('streak'), runEndingAt(days, lastDay, () => true));
      out.parStreak = Math.max(0, keep('parStreak'), runEndingAt(days, lastDay, r => num(r.pct) >= PAR_PCT));
    }
    let wip = L.wip || I.wip || null;
    if (wip && (!isObj(wip) || days[wip.day])) wip = null;
    out.wip = wip;
    if ('muted' in L) out.muted = L.muted;
    out.practiceRounds = Math.max(0, num(L.practiceRounds), num(I.practiceRounds));
    return { save: out, changed };
  }
  function mergeCollection(L, I, daysChanged) {
    if (!validCollection(I)) return L; if (!validCollection(L)) return Object.assign({}, I, { backfilled: false });
    const found = Object.assign({}, L.found);
    for (const [n, e] of Object.entries(I.found)) {
      const l = found[n];
      if (!l) { found[n] = e; continue; }
      const best = num(e.best.pct) > num(l.best.pct) ? e.best : l.best;
      const dates = [l.date, e.date].filter(Boolean).sort();
      found[n] = Object.assign({}, l, { best, date: dates[0] || l.date || null });
    }
    // a merged-in day may hold finds the backfill can add (it only ever adds)
    return { v: 1, found, backfilled: daysChanged ? false : !!L.backfilled };
  }
  function mergeSent(L, I) {
    if (!validSent(I)) return L; if (!validSent(L)) return I;
    if (L.day !== I.day) return L.day > I.day ? L : I;
    return { day: L.day, sent: L.sent.concat(I.sent.filter(x => !L.sent.includes(x))) };
  }
  /** Merge an incoming snapshot into a local one; returns the new key map. */
  function merge(local, incoming) {
    const L = (local && local.k) || {}, I = (incoming && incoming.k) || {}, k = Object.assign({}, L);
    let daysChanged = false;
    if (I[SAVE_KEY]) {
      const r = mergeSave(parseJSON(L[SAVE_KEY]), parseJSON(I[SAVE_KEY]));
      const s = r && r.save ? r.save : r; daysChanged = r && r.save ? r.changed : !L[SAVE_KEY];
      k[SAVE_KEY] = JSON.stringify(s);
    }
    if (I[COLLECTION_KEY]) k[COLLECTION_KEY] = JSON.stringify(mergeCollection(parseJSON(L[COLLECTION_KEY]), parseJSON(I[COLLECTION_KEY]), daysChanged));
    for (const f of ['mixology.welcomed.v1', 'mixology.poured.v1']) if (I[f] === '1') k[f] = '1';
    if (I['mixology.noanalytics.v1'] === '1') k['mixology.noanalytics.v1'] = '1'; // an opt-out always carries over
    else if (I['mixology.noanalytics.v1'] && !L['mixology.noanalytics.v1']) k['mixology.noanalytics.v1'] = I['mixology.noanalytics.v1'];
    if (I.skipgc === 't') k.skipgc = 't';
    if (I['mixology.analytics.sent.v1']) k['mixology.analytics.sent.v1'] = JSON.stringify(mergeSent(parseJSON(L['mixology.analytics.sent.v1']), parseJSON(I['mixology.analytics.sent.v1'])));
    return { v: 1, k };
  }
  function hasSave(storage) {
    try {
      const s = parseJSON(storage.getItem(SAVE_KEY)), c = parseJSON(storage.getItem(COLLECTION_KEY));
      return !!((s && (Object.keys(s.days || {}).length || s.wip)) || (c && c.found && Object.keys(c.found).length));
    } catch (e) { return false; }
  }

  // same data regardless of key order (the game re-saves with its own order)
  function stable(v) { return Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : isObj(v) ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v); }
  function sameValue(a, b) {
    if (a === b) return true; if (a == null || b == null) return false;
    const x = parseJSON(a), y = parseJSON(b);
    if (x === undefined || y === undefined) return false;
    const strip = o => (isObj(o) && 'backfilled' in o ? Object.assign({}, o, { backfilled: null }) : o); // the game's backfill flag is not data
    return stable(strip(x)) === stable(strip(y));
  }
  /* ---------- import (new origin) ---------- */
  let lastImport = null;
  /** Reads #import=<payload> (or the bridge's #import-none), merges, strips the hash. */
  function importFromHash(loc, storage, hist) {
    const h = String((loc && loc.hash) || '');
    const m = /^#import(?:=([^&]*)|-none)$/.exec(h);
    if (!m) return null;
    let res;
    try {
      if (m[1] == null) res = { ok: true, none: true, changed: false };
      else {
        const incoming = decode(decodeURIComponent(m[1]));
        const local = snapshot(storage), merged = merge(local, incoming);
        let changed = false;
        for (const [key, val] of Object.entries(merged.k)) if (!sameValue(local.k[key], val)) { storage.setItem(key, val); changed = true; }
        res = { ok: true, changed, days: Object.keys((parseJSON(incoming.k[SAVE_KEY]) || {}).days || {}).length };
      }
    } catch (e) { res = { ok: false, error: String(e && e.message || e) }; }
    try { if (hist && hist.replaceState) hist.replaceState(null, '', String(loc.pathname || '/') + String(loc.search || '')); } catch (e) { /* ignore */ }
    return res;
  }

  /* ---------- export (old origin) ---------- */
  function buildLink(storage, opts) {
    const o = opts || {}, base = o.base || CONFIG.CANONICAL_ORIGIN, search = o.search || '';
    if (!hasSave(storage)) return null;
    return base + search + '#import=' + encode(snapshot(storage));
  }
  function pageBase(loc) { return String(loc.href || '').split(/[?#]/)[0]; }
  /** Where share/duel links point: the domain once it is live, else this page. */
  function shareBase(loc) { return CONFIG.DOMAIN_LIVE ? CONFIG.CANONICAL_ORIGIN : pageBase(loc || root.location); }
  function shareHost(loc) { return shareBase(loc).replace(/^https?:\/\//, '').replace(/\/$/, ''); }
  const canonicalHost = () => CONFIG.CANONICAL_ORIGIN.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  function isOldOrigin(loc) { return (loc || root.location).hostname === CONFIG.OLD_HOST; }
  function showMoveButton(loc, storage) { return CONFIG.DOMAIN_LIVE && isOldOrigin(loc) && hasSave(storage); }
  /** Reachable = the domain answers over HTTPS (opaque no-cors fetch resolves). */
  function reachable(url, ms) {
    if (!root.fetch) return Promise.resolve(false);
    return Promise.race([
      root.fetch(url + 'manifest.webmanifest?ping=' + Date.now(), { mode: 'no-cors', cache: 'no-store' }).then(() => true, () => false),
      new Promise(r => setTimeout(() => r(false), ms || 4000)),
    ]);
  }
  /** Switch week (MIGRATE_TO_DOMAIN): github.io -> domain, with the save if any. */
  function maybeMigrate(loc, storage) {
    loc = loc || root.location;
    if (!CONFIG.MIGRATE_TO_DOMAIN || !isOldOrigin(loc)) return Promise.resolve(false);
    return reachable(CONFIG.CANONICAL_ORIGIN).then(ok => {
      if (!ok) return false;
      const search = String(loc.search || '');
      const link = buildLink(storage, { search }) || (CONFIG.CANONICAL_ORIGIN + search);
      loc.replace(link); return true;
    });
  }
  /** Before Enforce HTTPS, GitHub may send people to http://mixologydaily.com,
   *  a different origin from https. Hop to https (with anything saved here)
   *  as soon as https answers. */
  function maybeUpgrade(loc, storage) {
    loc = loc || root.location;
    if (loc.protocol !== 'http:' || loc.hostname !== canonicalHost()) return Promise.resolve(false);
    return reachable(CONFIG.CANONICAL_ORIGIN).then(ok => {
      if (!ok) return false;
      const search = String(loc.search || ''), path = String(loc.pathname || '/').replace(/^\//, '');
      loc.replace(buildLink(storage, { base: CONFIG.CANONICAL_ORIGIN + path, search }) || (CONFIG.CANONICAL_ORIGIN + path + search)); return true;
    });
  }
  /** Pull bridge: on the domain, a browser with no save asks the bridge (once)
   *  whether the old origin has one. Only if the bridge page answers. */
  function maybePullFromBridge(loc, storage) {
    loc = loc || root.location;
    if (!CONFIG.BRIDGE_URL || loc.hostname !== canonicalHost() || loc.protocol !== 'https:' || hasSave(storage)) return Promise.resolve(false);
    try { if (storage.getItem(BRIDGE_CHECKED_KEY)) return Promise.resolve(false); } catch (e) { return Promise.resolve(false); }
    if (!root.fetch) return Promise.resolve(false);
    return root.fetch(CONFIG.BRIDGE_URL + 'ping.txt?t=' + Date.now(), { cache: 'no-store' }).then(r => {
      if (!r.ok) return false;
      try { storage.setItem(BRIDGE_CHECKED_KEY, '1'); } catch (e) { return false; }
      loc.replace(CONFIG.BRIDGE_URL + '#return=' + encodeURIComponent(String(loc.pathname || '/') + String(loc.search || '')));
      return true;
    }, () => false);
  }
  /** Used by the bridge page: the link back to the domain (fixed origin, so a
   *  save can only ever be sent to mixologydaily.com). */
  function bridgeReturnLink(hash, storage) {
    const m = /^#return=(.*)$/.exec(String(hash || ''));
    let path = '/';
    if (m) { try { const p = decodeURIComponent(m[1]); if (/^\/(?!\/)[^\s#\\]*$/.test(p)) path = p; } catch (e) { /* default */ } }
    const base = CONFIG.CANONICAL_ORIGIN.replace(/\/$/, '') + path;
    if (!hasSave(storage)) return base + '#import-none';
    return base + '#import=' + encode(snapshot(storage));
  }

  const api = { CONFIG, KEYS, SAVE_KEY, COLLECTION_KEY, BRIDGE_CHECKED_KEY, PAR_PCT, pack, unpack, snapshot, validate, encode, decode,
    mergeSave, mergeCollection, mergeSent, merge, hasSave, importFromHash, buildLink, pageBase, shareBase, shareHost, isOldOrigin,
    showMoveButton, reachable, maybeMigrate, maybeUpgrade, maybePullFromBridge, bridgeReturnLink,
    get lastImport() { return lastImport; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined' && !root.MIX_TRANSFER_NO_AUTO) {
    root.MixTransfer = api;
    try {
      lastImport = importFromHash(root.location, root.localStorage, root.history);
      if (!lastImport) {
        maybeUpgrade(root.location, root.localStorage).then(done => done || maybeMigrate(root.location, root.localStorage))
          .then(done => done || maybePullFromBridge(root.location, root.localStorage)).catch(() => {});
      }
    } catch (e) { /* never break the game */ }
  } else if (typeof window !== 'undefined') root.MixTransfer = api;
})(typeof window !== 'undefined' ? window : globalThis);
