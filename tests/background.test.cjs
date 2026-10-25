const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../extension/core.js");
function worker(saved = {}) {
  let listener;
  const store = structuredClone(saved), alarms = new Map();
  const ignore = { addListener() {} };
  const browser = {
    runtime: { id: "test", onMessage: { addListener(fn) { listener = fn; } }, onStartup: ignore, onInstalled: ignore },
    storage: { local: {
      async get(key) { await new Promise((r) => setTimeout(r, 1)); return { [key]: structuredClone(store[key]) }; },
      async set(value) { Object.assign(store, structuredClone(value)); }
    } },
    alarms: { onAlarm: ignore, async get(key) { return alarms.get(key); }, async create(key, value) { alarms.set(key, { scheduledTime: value.when }); }, async clear(key) { alarms.delete(key); } }
  };
  const context = vm.createContext({ browser, FeedWindowCore: core, console });
  vm.runInContext(fs.readFileSync(require.resolve("../extension/background.js"), "utf8"), context);
  return { store, alarms, send(message) { return new Promise((resolve) => listener({ channel: "feed-window", site: "x", ...message }, { id: "test" }, resolve)); } };
}
test("simultaneous starts across tabs consume one slot, and survive a worker restart", async () => {
  let background = worker();
  const results = await Promise.all(Array.from({ length: 20 }, () => background.send({ type: "START" })));
  for (const result of results) { assert.equal(result.ok, true); assert.equal(result.state.used, 1); }
  assert.equal(background.alarms.size, 1);
  background = worker(background.store);
  const result = await background.send({ type: "GET" });
  assert.equal(result.state.used, 1);
  assert.equal(result.state.active, true);
  assert.equal(background.alarms.size, 1);
});
test("error does not poison subsequent queue operations", async () => {
  const background = worker();
  assert.equal((await background.send({ type: "SETTINGS", settings: { minutes: 0, sessions: 3 } })).ok, false);
  assert.equal((await background.send({ type: "START" })).state.used, 1);
  assert.equal((await background.send({ type: "STOP" })).state.active, false);
});

test("each service has its own allowance, with a single earliest-expiry alarm", async () => {
  const background = worker();
  const x = await background.send({ type: "START", site: "x" });
  const ig = await background.send({ type: "GET", site: "instagram" });
  assert.equal(x.state.active, true);
  assert.equal(ig.state.active, false);
  assert.equal(ig.state.remaining, 3);
  await background.send({ type: "START", site: "instagram" });
  await background.send({ type: "STOP", site: "x" });
  assert.equal((await background.send({ type: "GET", site: "instagram" })).state.active, true);
  assert.equal(background.alarms.size, 1);
});
