const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const core = require("../extension/core.js");
const targets = require("../extension/targets.js");

test("a storage invalidation during an in-flight read is refreshed instead of discarded", async () => {
  const requests = [], attributes = new Map();
  let changed;
  const window = { addEventListener() {} };
  window.top = window;
  const html = { getAttribute(name) { return attributes.get(name); }, setAttribute(name, value) { attributes.set(name, value); } };
  const context = vm.createContext({
    window, location: { hostname: "x.com", pathname: "/home" },
    document: { documentElement: html, body: null, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    FeedWindowTargets: targets,
    browser: {
      runtime: { sendMessage(message) { return new Promise((resolve) => requests.push({ message, resolve })); } },
      storage: { onChanged: { addListener(fn) { changed = fn; } } }
    },
    MutationObserver: class { observe() {} },
    setInterval() {}, requestAnimationFrame(fn) { fn(); }, console
  });
  vm.runInContext(fs.readFileSync(require.resolve("../extension/content.js"), "utf8"), context);
  assert.equal(requests.length, 1);
  changed({ feedWindowState: {} }, "local");
  assert.equal(requests.length, 1);
  const now = Date.now();
  requests[0].resolve({ ok: true, state: core.view(core.normalize(null, now), "x", now) });
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].message.type, "GET");
  const unlocked = core.transition(null, { type: "START", site: "x" }, now);
  requests[1].resolve({ ok: true, state: core.view(unlocked, "x", now) });
  await new Promise(setImmediate);
  assert.equal(attributes.get("data-fw-x"), "open");
});
