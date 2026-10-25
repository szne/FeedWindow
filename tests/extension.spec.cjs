const { test, expect, chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../extension/core.js");
let context, worker, extensionId;
const errors = [];
const fixture = (body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>body{margin:0;font:15px -apple-system;background:white;color:#183d33}nav{position:fixed;left:20px;top:30px;width:200px}main{margin-left:240px;width:600px;min-height:900px;padding:20px;border:1px solid #eee}[role=tablist]{display:flex;gap:100px;padding:20px}article{padding:30px;border:1px solid #eee}button{padding:10px}</style></head><body>${body}</body></html>`;
const xFixture = fixture(`<nav>𝕏<br><a href="/home">ホーム</a><br><a href="/messages">メッセージ</a></nav><main data-testid="primaryColumn"><div role="tablist"><button role="tab" aria-selected="true" onclick="selectTab(this)">おすすめ</button><button role="tab" aria-selected="false" onclick="selectTab(this)">フォロー中</button></div><section role="region" aria-label="Timeline: Your Home Timeline"><article>タイムラインの投稿<video></video></article></section></main><script>function selectTab(tab){document.querySelectorAll('[role=tab]').forEach(t=>t.setAttribute('aria-selected',String(t===tab)))}</script>`);
const igFixture = fixture(`<nav>Instagram<br><a href="/">ホーム</a><br><a href="/reels/">リール</a><br><a href="/direct/inbox/">メッセージ</a></nav><main><article id="normal">通常の写真投稿<a href="/p/photo/">写真</a></article><article id="reel"><a href="/reel/example/">リールの投稿<video></video></a></article></main>`);
test.beforeAll(async () => {
  const extension = path.resolve(__dirname, "../dist/chrome");
  context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true, viewport: { width: 1200, height: 850 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  extensionId = new URL(worker.url()).host;
  await context.route("https://x.com/**", (route) => route.fulfill({ contentType: "text/html", body: xFixture }));
  await context.route("https://www.instagram.com/**", (route) => route.fulfill({ contentType: "text/html", body: igFixture }));
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
test("Instagram: feed photos and DM work; direct links, profile reels, inline reels and SPA routes are blocked", async () => {
  const page = await context.newPage();
  await page.goto("https://www.instagram.com/");
  await expect(page.locator("#normal")).toBeVisible();
  await expect(page.locator("#reel")).toBeHidden();
  await page.goto("https://www.instagram.com/direct/inbox/");
  await expect(page.locator("main")).toBeVisible();
  await page.evaluate(() => history.pushState({}, "", "/reel/abc/"));
  await expect(page.locator("html")).toHaveAttribute("data-fw-ig", "blocked");
  await expect(page.locator("main")).toBeHidden();
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
