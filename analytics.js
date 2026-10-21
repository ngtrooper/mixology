/* Mixology analytics (round 78, Franklin): private, cookieless play counts via
 * GoatCounter (https://www.goatcounter.com/help). Internal only; nothing in
 * the game depends on it.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ TO TURN ON: put the GoatCounter site code here (the "<code>" part of │
 * │ https://<code>.goatcounter.com). Empty string = analytics OFF: no    │
 * │ script is loaded and no network request is ever made.                │
 * └──────────────────────────────────────────────────────────────────────┘ */
const ANALYTICS_CODE = 'ngtrooper';

/* Never counted: an empty code; localhost / private hosts / file:// (and
 * GoatCounter itself skips local addresses); automated browsers
 * (navigator.webdriver, i.e. headless test runs); `?noanalytics` in the URL,
 * which also sets a permanent opt-out flag for this browser (`?analytics=on`
 * clears it); the opt-out flag `localStorage['mixology.noanalytics.v1'] = '1'`;
 * and GoatCounter's own `localStorage['skipgc'] = 't'`.
 *
 * Events are anonymous strings: puzzle numbers, scores and coarse buckets
 * only, never a color name, recipe or hex (round 83 added the score and
 * recipe-distance numbers, see below). Each event is sent at most once
 * per day per browser (sent-flags in localStorage, reset each local day).
 * Everything is wrapped in try/catch: offline, ad blockers, a blocked or
 * broken count.js, or full storage can never break or delay the game.
 *
 * Round 95 (Franklin): an exact all-time count of unique browsers. Two
 * once-EVER events, sent at most once per browser for good (their own
 * permanent flag `mixology.analytics.ever.v1`, never the daily sent-flags):
 *   first-visit   the browser had NO Mixology history when it first loaded
 *                 the game after round 95 (a truly new browser);
 *   known-player  it already had history from before (a save, collection,
 *                 welcome/pour flag or analytics sent-flags), so existing
 *                 players are counted once too.
 * Unique browsers since the round-95 deploy = first-visit + known-player.
 * The kind is decided when analytics.js loads, i.e. AFTER transfer.js merged
 * any #import= link and BEFORE game.js writes anything, so a player arriving
 * with a transferred save counts as known-player. If transfer.js is about to
 * leave the page (bridge pull / https hop / migration), nothing is sent: the
 * page it comes back to decides (bridge returns with the save -> known-player,
 * with #import-none -> first-visit). The flag is written only when the event
 * is actually handed to GoatCounter, so a blocked count.js retries next load;
 * until then it holds the decision as '<kind>:pending' (see everKind).
 * The flag is per origin and is NOT carried by save transfer (unknown key). */
(function (root) {
  'use strict';
  const OPTOUT_KEY = 'mixology.noanalytics.v1';
  const SENT_KEY = 'mixology.analytics.sent.v1';
  const EVER_KEY = 'mixology.analytics.ever.v1'; // round 95: permanent once-ever flag (never reset)
  const EVER_EVENTS = ['first-visit', 'known-player'];
  const SCRIPT_SRC = 'https://gc.zgo.at/count.js';
  const STEP_BUCKETS = [1, 2, 3, 5, 7, 14, 30]; // streak-N / played-days-N: largest step <= n; 30 means "30+"

  /** 1,2,3,5,7,14,30+ bucket label for a count (null for < 1). */
  function stepBucket(n) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 1) return null;
    let b = 1; for (const s of STEP_BUCKETS) if (n >= s) b = s;
    return b === 30 ? '30+' : String(b);
  }
  /** return-day-<k>: days since this browser's first play; 0..7, then '8+'. */
  function returnBucket(days) {
    days = Math.floor(Number(days));
    if (!Number.isFinite(days) || days < 0) return null;
    return days >= 8 ? '8+' : String(days);
  }
  /** score-band-<tier>: the star tier names (diamond 100, gold 97+, silver 90+, bronze 85+) or none. */
  function scoreBand(pct) {
    const n = Math.round(Number(pct));
    if (!Number.isFinite(n)) return 'none';
    return n >= 100 ? 'diamond' : n >= 97 ? 'gold' : n >= 90 ? 'silver' : n >= 85 ? 'bronze' : 'none';
  }
  /* Round 83 (Franklin): anonymous difficulty data, to see whether it is too
   * hard and whether near-misses are 1-2% off. Numbers only, never a name:
   *   pct-#N-a1-<score> / pct-#N-final-<score>  score 60..100 exactly, '<60' below
   *   off-#N-<k>      L1 distance of the final (scored) mix from the official
   *                   recipe in whole disc percents: 0..5, 6-10, 11-20, 21+.
   *                   Both sum to 100, so k is always even: 2 = one paint 1%
   *                   too high and another 1% too low.
   *   paints-#N-<c>   how many paints (1-5) the final mix uses
   * Round 93 (duo days): duo-c2-#N when a player reaches color 2, and
   * pct-#N-c1-<score> / pct-#N-c2-<score> for each color's best try (final = the average). */
  function scoreLabel(pct) {
    const n = Math.round(Number(pct));
    if (!Number.isFinite(n) || n < 0 || n > 100) return null;
    return n < 60 ? '<60' : String(n);
  }
  function offBucket(k) {
    k = Math.round(Number(k));
    if (!Number.isFinite(k) || k < 0) return null;
    return k <= 5 ? String(k) : k <= 10 ? '6-10' : k <= 20 ? '11-20' : '21+';
  }
  const PAINTS = ['r', 'y', 'b', 'k', 'w'];
  const whole = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; }; // '30%' or 30 -> 30
  /** sum over the five paints of |mine - official| (whole percents, e.g. the disc numbers) */
  function recipeOff(mine, official) { return PAINTS.reduce((s, k) => s + Math.abs(whole(mine && mine[k]) - whole(official && official[k])), 0); }
  function paintCount(mine) { const c = PAINTS.filter(k => whole(mine && mine[k]) > 0).length; return c >= 1 ? c : null; }

  /** Only these shapes may ever leave the browser (no names, no free text). */
  const EVENT_RE = /^(open|first-visit|known-player|share|duel-open|start-#\d{1,5}|finish-#\d{1,5}|score-band-(none|bronze|silver|gold|diamond)|return-day-([0-7]|8\+)|streak-(1|2|3|5|7|14|30\+)|played-days-(1|2|3|5|7|14|30\+)|duo-c2-#\d{1,5}|pct-#\d{1,5}-(a1|final|c1|c2)-(<60|[6-9]\d|100)|off-#\d{1,5}-([0-5]|6-10|11-20|21\+)|paints-#\d{1,5}-[1-5])$/;
  function validEvent(name) { return typeof name === 'string' && EVENT_RE.test(name); }

  function localHost(h) {
    h = String(h || '').toLowerCase();
    return !h || h === 'localhost' || h === '0.0.0.0' || h === '[::1]' || /\.localhost$/.test(h) || /^127\./.test(h) ||
      /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);
  }
  /** Why analytics is off ('' when it is on). env = {code, protocol, hostname, search, webdriver, storage}. */
  function disabledReason(env) {
    if (!env.code) return 'no code';
    if (env.protocol === 'file:') return 'file';
    if (localHost(env.hostname)) return 'local';
    if (env.webdriver) return 'automated';
    const q = String(env.search || '');
    if (/[?&]noanalytics(=|&|$)/.test(q)) return 'opt-out (url)';
    try { if (env.storage && env.storage.getItem(OPTOUT_KEY) === '1') return 'opt-out'; } catch (e) { /* ignore */ }
    try { if (env.storage && env.storage.getItem('skipgc') === 't') return 'opt-out (skipgc)'; } catch (e) { /* ignore */ }
    return '';
  }
  /** Once-per-day gate. Returns true (and records it) the first time `name` is seen on `dayKey`. */
  function claimOncePerDay(storage, name, dayKey) {
    let rec = null;
    try { rec = JSON.parse(storage.getItem(SENT_KEY) || 'null'); } catch (e) { rec = null; }
    if (!rec || rec.day !== dayKey || !Array.isArray(rec.sent)) rec = { day: dayKey, sent: [] };
    if (rec.sent.includes(name)) return false;
    rec.sent.push(name);
    try { storage.setItem(SENT_KEY, JSON.stringify(rec)); } catch (e) { /* storage full: still send once this session */ }
    return true;
  }

  const memStore = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; })();
  /** Round 95: does this browser already have Mixology history (from before this load)? */
  function hasHistory(storage) {
    const get = k => { try { return storage.getItem(k); } catch (e) { return null; } };
    const json = k => { try { return JSON.parse(get(k) || 'null'); } catch (e) { return null; } };
    const save = json('misnomer.save.v1'), col = json('mixology.collection.v1');
    if (save && typeof save === 'object' && ((save.days && typeof save.days === 'object' && Object.keys(save.days).length) || save.wip)) return true;
    if (col && col.found && typeof col.found === 'object' && Object.keys(col.found).length) return true;
    if (get('mixology.welcomed.v1') === '1' || get('mixology.poured.v1') === '1') return true;
    return get(SENT_KEY) != null;
  }
  /** Round 95: which once-ever event this browser still owes (null if already
   *  sent or storage is not persistent). The decision is stored at once as
   *  '<kind>:pending' so this browser's own later writes (its first `open`,
   *  its save) can't turn a first visit into a "known player" if the event is
   *  only sent on a later load (bridge hop, blocked count.js). The one upgrade:
   *  a pending first-visit whose load brought in a transferred save (#import=)
   *  becomes known-player. `imported` = transfer.js merged a save this load. */
  function everKind(storage, imported) {
    let v = null;
    try { if (!storage || storage === memStore) return null; v = storage.getItem(EVER_KEY); } catch (e) { return null; }
    let kind;
    if (v) { const m = /^(first-visit|known-player):pending$/.exec(v); if (!m) return null; kind = m[1]; } // sent already
    else kind = hasHistory(storage) ? 'known-player' : 'first-visit';
    if (kind === 'first-visit' && imported) kind = 'known-player';
    try { storage.setItem(EVER_KEY, kind + ':pending'); } catch (e) { return null; }
    return kind;
  }
  const isSentEver = v => !!v && !/:pending$/.test(v);
  function safeStorage() { try { const s = root.localStorage; s.getItem(SENT_KEY); return s; } catch (e) { return memStore; } }
  function todayKey() { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }

  let enabled = false, reason = 'not started', queue = [], timer = null, tries = 0, everPending = null, everQueued = false;
  function flush() {
    const gc = root.goatcounter;
    if (!gc || typeof gc.count !== 'function') return false;
    while (queue.length) {
      const name = queue.shift();
      if (EVER_EVENTS.includes(name)) { // round 95: claim the permanent flag only as it is really sent
        const st = safeStorage();
        try { if (isSentEver(st.getItem(EVER_KEY))) continue; st.setItem(EVER_KEY, name + '|' + todayKey()); } catch (e) { continue; }
      }
      try { gc.count({ path: name, title: name, event: true }); } catch (e) { /* swallow */ }
    }
    return true;
  }
  function kick() {
    if (!flush() && !timer) {
      timer = setInterval(() => { if (flush() || ++tries > 60 || !enabled) { clearInterval(timer); timer = null; } }, 500);
    }
  }
  function start() {
    try {
      const loc = root.location || {}, storage = safeStorage(), q = String(loc.search || '');
      // `?noanalytics` opts this browser out for good; `?analytics=on` undoes it
      if (/[?&]noanalytics(=|&|$)/.test(q)) { try { storage.setItem(OPTOUT_KEY, '1'); } catch (e) { /* ignore */ } }
      if (/[?&]analytics=on(&|$)/.test(q)) { try { storage.setItem(OPTOUT_KEY, '0'); } catch (e) { /* ignore */ } }
      reason = disabledReason({ code: ANALYTICS_CODE, protocol: loc.protocol, hostname: loc.hostname, search: q, webdriver: !!(root.navigator && root.navigator.webdriver), storage });
      enabled = !reason;
      if (!enabled || !root.document) return;
      const li = root.MixTransfer && root.MixTransfer.lastImport; // round 95: transfer.js ran first
      everPending = everKind(storage, !!(li && li.ok && li.changed && li.days > 0)); // decided before game.js touches storage
      // the automatic page view is sent without the query string (duel links carry a mix code)
      root.goatcounter = Object.assign({}, root.goatcounter, { path: loc.pathname || '/' });
      const s = root.document.createElement('script');
      s.async = true; s.src = SCRIPT_SRC;
      s.setAttribute('data-goatcounter', `https://${encodeURIComponent(ANALYTICS_CODE)}.goatcounter.com/count`);
      s.onerror = () => { enabled = false; queue = []; reason = 'blocked'; }; // ad blocker / offline: just stop
      (root.document.head || root.document.documentElement).appendChild(s);
    } catch (e) { enabled = false; reason = 'error'; }
  }
  /** Fire-and-forget. Unknown or malformed names are dropped. */
  function track(name) {
    try {
      if (!enabled || !validEvent(name)) return false;
      if (!claimOncePerDay(safeStorage(), name, todayKey())) return false;
      queue.push(name);
      kick();
      return true;
    } catch (e) { return false; }
  }
  /** Round 95: send first-visit / known-player once ever (called with `open`).
   *  Waits for transfer.js's load-time redirect check; sends nothing if it
   *  navigates away (the page it lands on decides). */
  function trackEver() {
    try {
      if (!enabled || !everPending || everQueued) return false;
      const go = () => { try { if (!enabled || everQueued || !validEvent(everPending)) return; everQueued = true; queue.push(everPending); kick(); } catch (e) { /* ignore */ } };
      const T = root.MixTransfer, p = T && T.pending;
      if (p && typeof p.then === 'function') {
        let done = false; const once = f => v => { if (!done) { done = true; f(v); } };
        p.then(once(left => { if (!left) go(); }), once(go));
        setTimeout(once(go), 8000); // a hung check never loses the count
      } else go();
      return true;
    } catch (e) { return false; }
  }

  const api = { ANALYTICS_CODE, OPTOUT_KEY, SENT_KEY, SCRIPT_SRC, stepBucket, returnBucket, scoreBand, scoreLabel, offBucket, recipeOff, paintCount, validEvent, disabledReason, claimOncePerDay, localHost, track,
    EVER_KEY, EVER_EVENTS, hasHistory, everKind, trackEver,
    get enabled() { return enabled; }, get reason() { return reason; }, get everPending() { return everPending; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.MixAnalytics = api; start(); }
})(typeof window !== 'undefined' ? window : globalThis);
