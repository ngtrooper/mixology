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
  const STEP_BUCKETS = [1, 2, 3, 5, 7, 14, 30]; // streak-N: largest step <= n; 30 means "30+"

  /** 1,2,3,5,7,14,30+ bucket label for a count (null for < 1). */
  function stepBucket(n) {
    n = Math.floor(Number(n));
    if (!Number.isFinite(n) || n < 1) return null;
    let b = 1; for (const s of STEP_BUCKETS) if (n >= s) b = s;
    return b === 30 ? '30+' : String(b);
  }
  /** score-#N-<tier>: the star tier names (diamond 100, gold 97+, silver 90+, bronze 85+) or none. */
  function scoreBand(pct) {
    const n = Math.round(Number(pct));
    if (!Number.isFinite(n)) return 'none';
    return n >= 100 ? 'diamond' : n >= 97 ? 'gold' : n >= 90 ? 'silver' : n >= 85 ? 'bronze' : 'none';
  }
  /* Round 99 (Franklin, v1.37.0): trimmed event set. The round-83 difficulty events
   * (pct-#N-*, off-#N-*, paints-#N-*), return-day-*, played-days-*, score-band-* and
   * open are no longer sent; score-#N-<tier> (one row per finished puzzle) replaces
   * score-band-* and pct-*. Kept names are unchanged so GoatCounter history lines up. */
  /** Only these shapes may ever leave the browser (no names, no free text). */
  const EVENT_RE = /^(first-visit|known-player|share|duel-open|start-#\d{1,5}|finish-#\d{1,5}|duo-c2-#\d{1,5}|score-#\d{1,5}-(none|bronze|silver|gold|diamond)|streak-(1|2|3|5|7|14|30\+))$/;
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

  /** Round 98: has `name` already been sent on `dayKey` (read-only)? */
  function sentToday(storage, name, dayKey) {
    let rec = null;
    try { rec = JSON.parse(storage.getItem(SENT_KEY) || 'null'); } catch (e) { rec = null; }
    return !!(rec && rec.day === dayKey && Array.isArray(rec.sent) && rec.sent.includes(name));
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
   *  '<kind>:pending' so this browser's own later writes (its first daily event,
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
  let gcReady = false, injected = false; const queued = new Set(); // round 98
  function flush() {
    const gc = root.goatcounter;
    if (!gcReady || !gc || typeof gc.count !== 'function') return false; // round 98: only once count.js is loaded AND set up
    while (queue.length) {
      const name = queue.shift();
      if (EVER_EVENTS.includes(name)) { // round 95: claim the permanent flag only as it is really sent
        const st = safeStorage();
        try { if (isSentEver(st.getItem(EVER_KEY))) continue; st.setItem(EVER_KEY, name + '|' + todayKey()); } catch (e) { continue; }
      } else if (!claimOncePerDay(safeStorage(), name, todayKey())) continue; // round 98: the daily flag is claimed only as it is really sent
      try { gc.count({ path: name, title: name, event: true }); } catch (e) { /* swallow */ }
    }
    return true;
  }
  function kick() {
    if (!flush() && !timer) {
      timer = setInterval(() => { if (flush() || ++tries > 60 || !enabled) { clearInterval(timer); timer = null; } }, 500);
    }
  }
  /* Round 98 (Franklin, tracking cleanup):
   *  - count.js is injected only once transfer.js knows the page STAYS (MixTransfer.pending
   *    resolved false). A brand-new browser is bounced once through the bridge
   *    (ngtrooper.github.io/mixology-move) and back; before, that sent a page view on the way
   *    out AND one on the way back, and the way-out page burnt the day's `open` flag before
   *    count.js could send it, so new players' `open` was never counted.
   *  - the visitor's real referrer (e.g. Instagram) is kept across that bounce (sessionStorage),
   *    instead of every new visitor showing up as "from ngtrooper.github.io".
   *  - the query string (duel links carry a mix code) is never sent: count.js's automatic
   *    page view is off (no_onload) and its `q` field is reduced to utm_* / ref only. */
  const REF_KEY = 'mixology.analytics.ref.v1', OLD_HOST = 'ngtrooper.github.io';
  const refHost = r => ((/^https?:\/\/([^/?#:]+)/i.exec(String(r || '')) || [])[1] || '').toLowerCase();
  /** The referrer to report. `bridged` = this load came back from the bridge / an import link. */
  function pickReferrer(docRef, bridged, ss) {
    docRef = String(docRef || '');
    if (bridged && refHost(docRef) === OLD_HOST) {
      let saved = null; try { saved = ss && ss.getItem(REF_KEY); } catch (e) { saved = null; }
      return saved == null ? '' : saved; // '' = direct (no referrer)
    }
    try { if (ss) ss.setItem(REF_KEY, docRef); } catch (e) { /* ignore */ }
    return docRef;
  }
  /** Only campaign tags (utm_*, ref) may leave the browser from the query string. */
  function cleanQuery(q) {
    const keep = String(q || '').replace(/^\?/, '').split('&').filter(kv => /^(utm_(source|medium|campaign|content|term)|ref)=/i.test(kv) && kv.length <= 120);
    return keep.length ? '?' + keep.join('&') : '';
  }
  function countPageview(path) {
    const gc = root.goatcounter, d = root.document;
    const go = () => { try { gc.count({ path }); } catch (e) { /* swallow */ } };
    if (!d || !('visibilityState' in d) || d.visibilityState === 'visible') return go();
    const f = () => { if (d.visibilityState !== 'visible') return; d.removeEventListener('visibilitychange', f); go(); };
    d.addEventListener('visibilitychange', f);
  }
  function inject(path) {
    try {
      if (injected || !enabled) return; injected = true;
      const s = root.document.createElement('script');
      s.async = true; s.src = SCRIPT_SRC;
      s.setAttribute('data-goatcounter', `https://${encodeURIComponent(ANALYTICS_CODE)}.goatcounter.com/count`);
      s.onload = () => {
        try {
          const gc = root.goatcounter;
          if (!enabled || !gc || typeof gc.count !== 'function') return;
          if (typeof gc.get_data === 'function' && !gc.get_data.__mix) {
            const orig = gc.get_data;
            gc.get_data = function () { const dd = orig.apply(this, arguments); if (dd) dd.q = cleanQuery(dd.q); return dd; };
            gc.get_data.__mix = true;
          }
          gcReady = true;
          countPageview(path);
          kick();
        } catch (e) { /* never break the game */ }
      };
      s.onerror = () => { enabled = false; queue = []; reason = 'blocked'; }; // ad blocker / offline: just stop
      (root.document.head || root.document.documentElement).appendChild(s);
    } catch (e) { enabled = false; reason = 'error'; }
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
      const T = root.MixTransfer, li = T && T.lastImport; // round 95: transfer.js ran first
      everPending = everKind(storage, !!(li && li.ok && li.changed && li.days > 0)); // decided before game.js touches storage
      let ss = null; try { ss = root.sessionStorage; } catch (e) { ss = null; }
      const path = loc.pathname || '/';
      // page views are sent by inject() (no_onload): path without the query string, real referrer
      root.goatcounter = Object.assign({}, root.goatcounter, { path, no_onload: true, referrer: pickReferrer(root.document.referrer, !!li, ss) });
      const p = T && T.pending;
      if (p && typeof p.then === 'function') {
        let done = false; const once = f => v => { if (!done) { done = true; f(v); } };
        p.then(once(left => { if (!left) inject(path); }), once(() => inject(path)));
        (root.setTimeout || setTimeout)(once(() => inject(path)), 8000); // a hung check never loses the count
      } else inject(path);
    } catch (e) { enabled = false; reason = 'error'; }
  }
  /** Fire-and-forget. Unknown or malformed names are dropped. */
  function track(name) {
    try {
      if (!enabled || !validEvent(name)) return false;
      if (queued.has(name) || sentToday(safeStorage(), name, todayKey())) return false; // round 98: claimed in flush()
      queued.add(name); queue.push(name);
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

  const api = { ANALYTICS_CODE, OPTOUT_KEY, SENT_KEY, SCRIPT_SRC, stepBucket, scoreBand, validEvent, disabledReason, claimOncePerDay, sentToday, localHost, track, pickReferrer, cleanQuery, REF_KEY,
    EVER_KEY, EVER_EVENTS, hasHistory, everKind, trackEver,
    get enabled() { return enabled; }, get reason() { return reason; }, get everPending() { return everPending; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.MixAnalytics = api; start(); }
})(typeof window !== 'undefined' ? window : globalThis);
