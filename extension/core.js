/* Pure policy functions, shared by Safari, Chromium and the test suite. */
(function (root) {
  "use strict";
  const DEFAULTS = Object.freeze({ minutes: 5, sessions: 3 });
  const SITES = Object.freeze(["x", "instagram"]);
  function dayKey(now) {
    const d = new Date(now);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function midnight(now) {
    const d = new Date(now);
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }
  function settings(value) {
    if (!value || !Number.isInteger(value.minutes) || value.minutes < 1 || value.minutes > 120 ||
        !Number.isInteger(value.sessions) || value.sessions < 1 || value.sessions > 30) {
      throw new Error("時間は1〜120分、回数は1〜30回の整数で入力してください。");
    }
    return { minutes: value.minutes, sessions: value.sessions };
  }
  function normalizePool(raw, now) {
    const pool = {
      day: typeof raw?.day === "string" ? raw.day : dayKey(now),
      used: Number.isInteger(raw?.used) && raw.used >= 0 ? raw.used : 0,
      activeUntil: Number.isFinite(raw?.activeUntil) ? raw.activeUntil : 0,
      lastSeen: Number.isFinite(raw?.lastSeen) ? Math.max(raw.lastSeen, now) : now
    };
    // Moving the clock backwards cannot revive a session or reset today's count.
    const effectiveNow = pool.lastSeen;
    if (dayKey(effectiveNow) > pool.day) {
      pool.day = dayKey(effectiveNow);
      pool.used = 0;
      pool.activeUntil = 0;
    }
    if (pool.activeUntil <= effectiveNow) pool.activeUntil = 0;
    return pool;
  }
  function normalize(raw, now) {
    let config;
    try { config = settings(raw?.settings); } catch { config = { ...DEFAULTS }; }
    return { version: 1, settings: config, pools: Object.fromEntries(SITES.map((site) => [site, normalizePool(raw?.pools?.[site], now)])) };
  }
  function transition(raw, action, now = Date.now()) {
    if (!SITES.includes(action.site)) throw new Error("対象サービスを選んでください。");
    const state = normalize(raw, now);
    const pool = state.pools[action.site];
    if (action.type === "START" && !pool.activeUntil) {
      if (pool.used >= state.settings.sessions) throw new Error("今日の解放枠は使い切りました。また明日。");
      pool.used += 1;
      pool.activeUntil = Math.min(pool.lastSeen + state.settings.minutes * 60_000, midnight(pool.lastSeen));
    } else if (action.type === "STOP") {
      pool.activeUntil = 0;
    } else if (action.type === "SETTINGS") {
      state.settings = settings(action.settings);
    } else if (action.type !== "GET" && action.type !== "START") {
      throw new Error("不明な操作です。");
    }
    return state;
  }
  function view(state, site, now = Date.now()) {
    const normalized = normalize(state, now);
    const pool = normalized.pools[site];
    return {
      site, settings: normalized.settings, ...pool,
      remaining: Math.max(0, normalized.settings.sessions - pool.used),
      active: pool.activeUntil > Math.max(now, pool.lastSeen),
      remainingMs: Math.max(0, pool.activeUntil - Math.max(now, pool.lastSeen))
    };
  }
  const api = { DEFAULTS, SITES, dayKey, midnight, settings, normalize, transition, view };
  root.FeedWindowCore = api;
  if (typeof module === "object" && module.exports) module.exports = api;
})(globalThis);
