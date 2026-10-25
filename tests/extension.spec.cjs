const { test, expect, chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../extension/core.js");
const targets = require("../extension/targets.js");
let context, worker, extensionId;
const errors = [];
const fixture = (body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>body{margin:0;font:15px -apple-system;background:white;color:#183d33}nav{position:fixed;left:20px;top:30px;width:200px}main{margin-left:240px;width:600px;min-height:900px;padding:20px;border:1px solid #eee}[role=tablist]{display:flex;gap:100px;padding:20px}article{padding:30px;border:1px solid #eee}button{padding:10px}</style></head><body>${body}</body></html>`;
const xFixture = fixture(`<nav>𝕏<br><a href="/home">ホーム</a><br><a href="/messages">メッセージ</a></nav><main data-testid="primaryColumn"><div role="tablist"><button role="tab" aria-selected="true" onclick="selectTab(this)">おすすめ</button><button role="tab" aria-selected="false" onclick="selectTab(this)">フォロー中</button></div><section role="region" aria-label="Timeline: Your Home Timeline"><article>タイムラインの投稿<video></video></article></section></main><script>function selectTab(tab){document.querySelectorAll('[role=tab]').forEach(t=>t.setAttribute('aria-selected',String(t===tab)))}</script>`);
const igFixture = fixture(`<nav>Instagram<br><a href="/">ホーム</a><br><a href="/reels/">リール</a><br><a href="/direct/inbox/">メッセージ</a></nav><main><article id="normal">通常の写真投稿<a href="/p/photo/">写真</a></article><article id="reel"><a href="/reel/example/">リールの投稿<video></video></a></article></main>`);
const singleFixture = fixture(`<nav>Instagram<br><a href="/direct/t/thread/">メッセージ</a><br><a href="/person/saved/all-posts/">保存済み</a></nav><main><div id="player" style="height:560px;overflow-y:auto;scroll-snap-type:y mandatory"><article id="one" style="height:560px;box-sizing:border-box;scroll-snap-align:start;padding:20px"><video id="current" width="300" height="230" controls></video><div id="comments" tabindex="0" style="height:90px;overflow-y:auto">${"<p>動画へのコメントです。</p>".repeat(30)}</div><input aria-label="コメントを入力"><button id="next" aria-label="Next reel" onclick="advance()">↓</button><a id="another" href="/reel/another/">別のリール</a></article><article id="two" style="height:560px;box-sizing:border-box;scroll-snap-align:start;padding:20px"><video id="neighbor" width="300" height="230" controls></video></article></div></main><script>window.advanceCount=0;function advance(){window.advanceCount++;document.querySelector('#player').scrollTop=560;history.pushState({},'', '/reel/next/')}document.addEventListener('wheel',e=>{if(e.deltaY)advance()});document.addEventListener('touchmove',advance);document.addEventListener('keydown',e=>{if(['ArrowDown','PageDown',' '].includes(e.key)&&!e.target.matches('input,textarea'))advance()});document.querySelector('#current').addEventListener('ended',advance);</script>`);
test.beforeAll(async () => {
  const extension = path.resolve(__dirname, "../dist/chrome");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true, viewport: { width: 1200, height: 850 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
  await context.route("https://x.com/**", (route) => route.fulfill({ contentType: "text/html", body: xFixture }));
  await context.route("https://www.instagram.com/**", (route) => route.fulfill({ contentType: "text/html", body: targets.reelId(new URL(route.request().url()).pathname) ? singleFixture : igFixture }));
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
});
test.afterAll(async () => { await context?.close(); });
test.beforeEach(async () => {
  for (const page of context.pages()) await page.close();
  await worker.evaluate(() => chrome.storage.local.clear());
});
async function send(page, type, site = "x", settings) {
  return page.evaluate((message) => chrome.runtime.sendMessage(message), { channel: "feed-window", type, site, settings });
}
async function popup() {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.locator("#remaining")).toHaveText("3");
  return page;
}
test("real extension: X Following stays available; unlock syncs tabs and leaves Instagram locked", async () => {
  const x = await context.newPage();
  await x.goto("https://x.com/home");
  await expect(x.locator("html")).toHaveAttribute("data-fw-x", "blocked");
  await expect(x.locator('[data-testid="primaryColumn"]')).toBeHidden();
  await expect(x.getByRole("heading", { name: "おすすめは、ひと休み。" })).toBeVisible();
  await x.getByRole("button", { name: "「フォロー中」を見る" }).click();
  await expect(x.locator("html")).toHaveAttribute("data-fw-x", "open");
  await expect(x.locator('[data-testid="primaryColumn"]')).toBeVisible();
  await x.getByRole("tab", { name: "おすすめ" }).click();
  await expect(x.locator("html")).toHaveAttribute("data-fw-x", "blocked");
  const x2 = await context.newPage(); await x2.goto("https://x.com/home");
  const ig = await context.newPage(); await ig.goto("https://www.instagram.com/reels/");
  await x.getByRole("button", { name: "5分だけ見る" }).click();
  await expect(x.locator("html")).toHaveAttribute("data-fw-x", "open");
  await expect(x2.locator("html")).toHaveAttribute("data-fw-x", "open");
  await expect(ig.locator("html")).toHaveAttribute("data-fw-ig", "blocked");
  await x2.reload();
  await expect(x2.locator("html")).toHaveAttribute("data-fw-x", "open");
  const ui = await context.newPage(); await ui.goto(`chrome-extension://${extensionId}/popup.html`);
  const status = await send(ui, "GET"); assertStatus(status);
  expect(status.state.used).toBe(1);
  await x.getByRole("button", { name: "今すぐ閉じる" }).click();
  await expect(x2.locator("html")).toHaveAttribute("data-fw-x", "blocked");
});
function assertStatus(response) { expect(response.ok).toBe(true); }
test("Instagram: DM clips remain visible while the home feed and reel collections stay locked", async () => {
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/");
  await expect(page.locator("#normal")).toBeVisible();
  await expect(page.locator("#reel")).toBeHidden();
  await page.evaluate(() => history.pushState({}, "", "/direct/inbox/"));
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("#reel")).toBeVisible();
  await page.evaluate(() => history.pushState({}, "", "/reel/abc/"));
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "true");
  await expect(page.locator("main")).toBeVisible();
  await page.evaluate(() => history.pushState({}, "", "/reel/next/"));
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig", "blocked");
  await page.goto("https://www.instagram.com/person/reels/");
  await expect(page.getByRole("heading", { name: "リールは、ひと休み。" })).toBeVisible();
  await page.getByRole("button", { name: "5分だけ見る" }).click();
  await expect(page.locator("main")).toBeVisible();
  await expect(page.locator("#reel")).toBeVisible();
});
test("popup settings persist, do not reset consumption, and services have separate caps", async () => {
  const page = await popup();
  await page.locator("#settings-panel summary").click();
  await page.locator("#minutes").fill("2");
  await page.locator("#sessions").fill("1");
  await page.getByRole("button", { name: "設定を保存" }).click();
  await expect(page.locator("#start")).toHaveText("2分だけ見る");
  await page.locator("#start").click();
  await expect(page.locator("#stop")).toBeVisible();
  await page.locator("#stop").click();
  await expect(page.locator("#remaining")).toHaveText("0");
  await expect(page.locator("#start")).toBeDisabled();
  await page.locator("#site-instagram").click();
  await expect(page.locator("#remaining")).toHaveText("1");
  await expect(page.locator("#start")).toBeEnabled();
  await page.reload();
  await expect(page.locator("#minutes")).toHaveValue("2");
  await expect(page.locator("#sessions")).toHaveValue("1");
});
test("absolute expiry re-blocks a visible page and pauses a playing reel", async () => {
  const ui = await popup();
  const response = await send(ui, "START", "instagram"); assertStatus(response);
  const page = await context.newPage(); await page.goto("https://www.instagram.com/reels/");
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig", "open");
  await page.evaluate(() => history.pushState({}, "", "/reel/autoplay/"));
  const raw = await worker.evaluate(async () => (await chrome.storage.local.get("feedWindowState")).feedWindowState);
  raw.pools.instagram.activeUntil = Date.now() + 1500;
  await worker.evaluate((value) => chrome.storage.local.set({ feedWindowState: value }), raw);
  await page.evaluate(async () => {
    const video = document.querySelector("video");
    const canvas = document.createElement("canvas");
    canvas.width = 80; canvas.height = 80;
    canvas.getContext("2d").fillRect(0, 0, 80, 80);
    video.srcObject = canvas.captureStream(5);
    video.muted = true;
    window.testVideoCanvas = canvas;
    await video.play();
  });
  expect(await page.locator("video").evaluate((video) => video.paused)).toBe(false);
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig", "blocked", { timeout: 4000 });
  await expect.poll(() => page.locator("video").evaluate((video) => video.paused)).toBe(true);
  await expect(page.getByRole("button", { name: "5分だけ見る" })).toBeVisible();
});
test("individual shared clips play for free while wheel, touch, keys, arrows and autoplay cannot advance", async () => {
  const ui = await popup();
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/reel/example/?igsh=shared");
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "true");
  await expect(page.locator("#current")).toBeVisible();
  await expect(page.locator("#neighbor")).toBeHidden();
  await expect(page.locator("#next")).toBeHidden();
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 80; canvas.height = 80;
    canvas.getContext("2d").fillRect(0, 0, 80, 80);
    window.testVideoCanvas = canvas;
    const video = document.querySelector("#current"); video.srcObject = canvas.captureStream(5); video.muted = true;
    await video.play();
  });
  expect(await page.locator("#current").evaluate((video) => video.paused)).toBe(false);
  await page.locator("#current").hover(); await page.mouse.wheel(0, 600);
  await page.keyboard.press("ArrowDown"); await page.keyboard.press("PageDown");
  await page.evaluate(() => {
    document.querySelector("#next").click();
    document.querySelector("#current").dispatchEvent(new Event("ended"));
    const target = document.querySelector("#current");
    const start = new Touch({ identifier: 1, target, clientX: 350, clientY: 350 });
    const end = new Touch({ identifier: 1, target, clientX: 350, clientY: 100 });
    target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [start] }));
    target.dispatchEvent(new TouchEvent("touchmove", { bubbles: true, cancelable: true, touches: [end] }));
    target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, cancelable: true, touches: [] }));
  });
  await page.locator("#another").click();
  expect(await page.evaluate(() => window.advanceCount)).toBe(0);
  expect(new URL(page.url()).pathname).toBe("/reel/example/");
  await page.locator("#player").evaluate((player) => { player.scrollTop = 560; });
  await expect.poll(() => page.locator("#player").evaluate((player) => player.scrollTop)).toBe(0);
  await page.locator("#comments").hover(); await page.mouse.wheel(0, 120);
  await expect.poll(() => page.locator("#comments").evaluate((comments) => comments.scrollTop)).toBeGreaterThan(0);
  await page.locator("#comments").evaluate((comments) => { comments.scrollTop = comments.scrollHeight; });
  await page.mouse.wheel(0, 800);
  const input = page.getByRole("textbox", { name: "コメントを入力" });
  await input.fill("hello"); await input.press("ArrowLeft");
  expect(await input.evaluate((element) => element.selectionStart)).toBe(4);
  expect(await page.evaluate(() => window.advanceCount)).toBe(0);
  const status = await send(ui, "GET", "instagram");
  expect(status.state.used).toBe(0); expect(status.state.remaining).toBe(3);
});
test("saved collections and bookmarked permalinks remain available without consuming an allowance", async () => {
  const ui = await popup(); const page = await context.newPage();
  for (const collection of ["/person/saved/", "/person/saved/all-posts/", "/person/saved/collection/123/", "/saved/"]) {
    await page.goto(`https://www.instagram.com${collection}`);
    await expect(page.locator("#reel")).toBeVisible();
    await page.locator('#reel a').click();
    await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "true");
    await expect(page.locator("#current")).toBeVisible();
  }
  await page.goto("https://www.instagram.com/reels/bookmarked/");
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "true");
  await page.reload();
  await expect(page.locator("#current")).toBeVisible();
  await page.goto("https://www.instagram.com/direct/t/thread/");
  await expect(page.locator("#reel")).toBeVisible();
  expect(await page.locator("html").getAttribute("data-fw-ig-single")).toBe("false");
  const status = await send(ui, "GET", "instagram"); expect(status.state.used).toBe(0);
  const raw = await worker.evaluate(async () => (await chrome.storage.local.get("feedWindowState")).feedWindowState);
  raw.pools.instagram.used = raw.settings.sessions;
  await worker.evaluate((value) => chrome.storage.local.set({ feedWindowState: value }), raw);
  await page.goto("https://www.instagram.com/reel/still-available/");
  await expect(page.locator("#current")).toBeVisible();
  expect((await send(ui, "GET", "instagram")).state.remaining).toBe(0);
});
test("a timed Instagram unlock permits continuous navigation, and ending it restores the gate", async () => {
  const ui = await popup(); const page = await context.newPage();
  await page.goto("https://www.instagram.com/reel/example/");
  await expect(page.locator("#next")).toBeHidden();
  await send(ui, "START", "instagram");
  await expect(page.locator("#next")).toBeVisible();
  await page.locator("#next").click();
  await expect.poll(() => page.evaluate(() => window.advanceCount)).toBe(1);
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig", "open");
  await send(ui, "STOP", "instagram");
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig", "blocked");
  await page.evaluate(() => history.pushState({}, "", "/direct/t/thread/"));
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "false");
  await expect(page.locator("#player")).not.toHaveAttribute("data-fw-reel-scroller", "");
  const status = await send(ui, "GET", "instagram"); expect(status.state.used).toBe(1);
});
test("a video dialog inside DM stays viewable without enabling scrolling through neighboring clips", async () => {
  const ui = await popup(); const page = await context.newPage();
  await page.goto("https://www.instagram.com/direct/t/thread/");
  await page.evaluate(() => {
    window.modalAdvance = 0;
    document.querySelector("#reel a").addEventListener("click", (event) => {
    event.preventDefault();
    const dialog = document.createElement("div"); dialog.id = "video-dialog"; dialog.setAttribute("role", "dialog");
    dialog.style.cssText = "position:fixed;inset:50px 50px 80px 240px;background:white;z-index:100";
    dialog.innerHTML = '<div id="modal-player" style="height:500px;overflow-y:auto"><div style="height:500px"><video id="modal-current" width="300" height="230" controls></video><button id="modal-next" aria-label="Next reel">Next</button></div><div style="height:500px"><video id="modal-neighbor" width="300" height="230"></video></div></div>';
    document.body.append(dialog);
    document.querySelector("#modal-next").addEventListener("click", () => window.modalAdvance++);
    });
  });
  await page.locator("#reel a").click();
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "true");
  await expect(page.locator("#modal-current")).toBeVisible();
  await expect(page.locator("#modal-neighbor")).toBeHidden();
  await page.locator("#modal-current").hover(); await page.mouse.wheel(0, 600);
  await page.evaluate(() => document.querySelector("#modal-next").click());
  expect(await page.evaluate(() => window.modalAdvance)).toBe(0);
  expect(await page.locator("#modal-player").evaluate((element) => element.scrollTop)).toBe(0);
  await page.evaluate(() => { history.pushState({}, "", "/reel/example/"); window.dispatchEvent(new PopStateEvent("popstate")); });
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig", "open");
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "true");
  await page.evaluate(() => history.pushState({}, "", "/direct/t/thread/"));
  await page.evaluate(() => document.querySelector("#video-dialog").remove());
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig-single", "false");
  await expect(page.locator("#reel")).toBeVisible();
  await page.locator("#reel").hover(); await page.mouse.wheel(0, 300);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect((await send(ui, "GET", "instagram")).state.used).toBe(0);
});
test("tomorrow renews the cap; no runtime errors; save review screenshots", async () => {
  const yesterday = Date.now() - 86_400_000;
  let raw = core.transition(null, { type: "START", site: "x" }, yesterday);
  raw.pools.x.used = 3;
  await worker.evaluate((value) => chrome.storage.local.set({ feedWindowState: value }), raw);
  const ui = await popup();
  await expect(ui.locator("#remaining")).toHaveText("3");
  fs.mkdirSync(path.resolve(__dirname, "../docs/screenshots"), { recursive: true });
  await ui.setViewportSize({ width: 360, height: 730 });
  await ui.locator("#settings-panel summary").click();
  await ui.screenshot({ path: path.resolve(__dirname, "../docs/screenshots/popup.png"), fullPage: true });
  const page = await context.newPage(); await page.goto("https://x.com/home");
  await expect(page.getByRole("heading", { name: "おすすめは、ひと休み。" })).toBeVisible();
  await page.screenshot({ path: path.resolve(__dirname, "../docs/screenshots/x-blocked.png") });
  expect(errors).toEqual([]);
});
