"use strict";
if (!globalThis.FeedWindowCore && typeof importScripts === "function") importScripts("core.js");
const api = globalThis.browser || globalThis.chrome;
const core = globalThis.FeedWindowCore;
const KEY = "feedWindowState";
let queue = Promise.resolve();

// One writer serializes all tabs and double clicks before reading persistent state.
function dispatch(message) {
  const result = queue.then(async () => {
    const raw = (await api.storage.local.get(KEY))[KEY];
    const state = core.transition(raw, message);
    // GET persists only meaningful changes, avoiding a storage event feedback loop.
    const comparable = (value) => value && JSON.stringify({ ...value, pools: Object.fromEntries(
      core.SITES.map((site) => [site, { ...value.pools?.[site], lastSeen: 0 }])
    ) });
    if (message.type !== "GET" || comparable(raw) !== comparable(state)) {
      await api.storage.local.set({ [KEY]: state });
    }
    const ends = core.SITES.map((site) => state.pools[site].activeUntil).filter(Boolean);
    const activeUntil = Math.min(...ends);
    if (ends.length) {
      const alarm = await api.alarms.get("feed-window-end");
      if (!alarm || alarm.scheduledTime !== activeUntil) {
        await api.alarms.create("feed-window-end", { when: activeUntil });
      }
    } else {
      await api.alarms.clear("feed-window-end");
    }
    return { ok: true, state: core.view(state, message.site) };
  });
  queue = result.catch(() => {});
  return result;
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.channel !== "feed-window") return;
  if (sender.id && sender.id !== api.runtime.id) return;
  dispatch(message).then(sendResponse, (error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
const refresh = () => dispatch({ type: "GET", site: "x" }).catch((error) => console.error("Feed Window:", error));
api.alarms.onAlarm.addListener((alarm) => { if (alarm.name === "feed-window-end") refresh(); });
api.runtime.onInstalled.addListener(refresh);
api.runtime.onStartup.addListener(refresh);
refresh();
