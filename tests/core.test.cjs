const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../extension/core.js");
const targets = require("../extension/targets.js");
const change = (raw, action, now) => core.transition(raw, { site: "x", ...action }, now);
const view = (raw, now) => core.view(raw, "x", now);
const start = new Date(2026, 9, 25, 12).getTime();
test("defaults, repeated starts, exact expiry and daily cap", () => {
  let state = change(null, { type: "START" }, start);
  assert.equal(state.pools.x.used, 1);
  assert.equal(state.pools.x.activeUntil, start + 300_000);
  state = change(state, { type: "START" }, start + 10);
  assert.equal(state.pools.x.used, 1);
  assert.equal(state.pools.x.activeUntil, start + 300_000);
  assert.equal(view(state, start + 299_999).active, true);
  assert.equal(view(state, start + 300_000).active, false);
  state = change(state, { type: "START" }, start + 300_000);
  state = change(state, { type: "START" }, start + 600_000);
  assert.equal(state.pools.x.used, 3);
  assert.throws(() => change(state, { type: "START" }, start + 900_000), /使い切り/);
});
test("reload retains state; stop does not refund; settings do not reset usage or stretch running session", () => {
  let state = change(null, { type: "START" }, start);
  state = change(JSON.parse(JSON.stringify(state)), { type: "GET" }, start + 20);
  assert.equal(state.pools.x.used, 1);
  state = change(state, { type: "SETTINGS", settings: { minutes: 1, sessions: 5 } }, start + 30);
  assert.equal(state.pools.x.activeUntil, start + 300_000);
  state = change(state, { type: "STOP" }, start + 40);
  assert.equal(state.pools.x.used, 1);
  state = change(state, { type: "START" }, start + 50);
  assert.equal(state.pools.x.activeUntil, start + 60_050);
  assert.equal(state.pools.x.used, 2);
});
test("midnight closes a running session and renews slots", () => {
  const now = new Date(2026, 9, 25, 23, 59).getTime();
  let state = change(null, { type: "START" }, now);
  assert.equal(state.pools.x.activeUntil, core.midnight(now));
  state = change(state, { type: "GET" }, core.midnight(now));
  assert.equal(state.pools.x.used, 0);
  assert.equal(state.pools.x.activeUntil, 0);
  assert.equal(state.settings.minutes, 5);
});
test("backwards clock does not reset count or revive an expired session", () => {
  let state = change(null, { type: "START" }, start);
  state = change(state, { type: "GET" }, start + 300_000);
  state = change(state, { type: "GET" }, start - 86_400_000);
  assert.equal(state.pools.x.used, 1);
  assert.equal(state.pools.x.activeUntil, 0);
});
test("invalid settings rejected; lowering limit below usage prevents new sessions", () => {
  for (const minutes of [0, -1, 121, 1.5, "5", NaN, Infinity]) {
    assert.throws(() => core.settings({ minutes, sessions: 3 }));
  }
  for (const sessions of [0, -1, 31, 1.5, "3"]) {
    assert.throws(() => core.settings({ minutes: 5, sessions }));
  }
  let state = change(null, { type: "START" }, start);
  state = change(state, { type: "START" }, start + 300_000);
  state = change(state, { type: "SETTINGS", settings: { minutes: 5, sessions: 1 } }, start + 600_000);
  assert.equal(view(state, start + 600_000).remaining, 0);
  assert.throws(() => change(state, { type: "START" }, start + 600_000));
});
test("scope and timeline language detection", () => {
  assert.equal(targets.site("www.instagram.com"), "instagram");
  assert.equal(targets.site("x.com.evil.example"), null);
  for (const path of ["/reel/abc/", "/reels/", "/person/reels/", "/reels/audio/1/"]) assert.equal(targets.isReel(path), true);
  for (const path of ["/direct/inbox/", "/p/abc/", "/person/", "/"]) assert.equal(targets.isReel(path), false);
  assert.equal(targets.xMode([]), "unknown");
  assert.equal(targets.xMode([{ label: "おすすめ", selected: true }, { label: "フォロー中", selected: false }]), "for-you");
  assert.equal(targets.xMode([{ label: "おすすめ", selected: false }, { label: "フォロー中", selected: true }]), "following");
});

test("X and Instagram have independent counts and unlocks", () => {
  let state = core.transition(null, { type: "START", site: "x" }, start);
  assert.equal(core.view(state, "x", start).used, 1);
  assert.equal(core.view(state, "instagram", start).used, 0);
  assert.equal(core.view(state, "instagram", start).active, false);
  state = core.transition(state, { type: "START", site: "instagram" }, start + 30_000);
  state = core.transition(state, { type: "STOP", site: "x" }, start + 40_000);
  assert.equal(core.view(state, "x", start + 40_000).active, false);
  assert.equal(core.view(state, "instagram", start + 40_000).active, true);
  assert.equal(core.view(state, "instagram", start + 40_000).used, 1);
});
