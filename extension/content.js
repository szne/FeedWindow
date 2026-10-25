(() => {
  "use strict";
  const api = globalThis.browser || globalThis.chrome;
  const targets = globalThis.FeedWindowTargets;
  const site = targets.site(location.hostname);
  if (!site || window.top !== window) return;
  let state = null;
  let busy = false;
  let refreshPending = false;
  let actionPending = null;
  let errorText = "";
  let host, shadow;
  let queued = false;
  let lastPath = location.pathname;
  const html = document.documentElement;
  const isActive = () => !!state && state.activeUntil > Date.now() && state.day === localDay();
  const instagram = site === "instagram" ? globalThis.FeedWindowInstagram(isActive) : null;
  function localDay() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function homeTabs() {
    const column = document.querySelector('[data-testid="primaryColumn"]');
    const list = column?.querySelector('[role="tablist"]');
    return list ? [...list.querySelectorAll('[role="tab"]')] : [];
  }
  function xFollowing() {
    return targets.xMode(homeTabs().map((tab) => ({
      label: tab.textContent || "", selected: tab.getAttribute("aria-selected") === "true"
    }))) === "following";
  }
  function blocked() {
    if (isActive()) return false;
    if (site === "x") return /^\/home\/?$/.test(location.pathname) && !xFollowing();
    return instagram.blocked();
  }
  function setAttribute(name, value) {
    if (html.getAttribute(name) !== value) html.setAttribute(name, value);
  }
  function enforce() {
    const locked = !isActive();
    const gate = instagram ? instagram.update() : blocked();
    setAttribute("data-fw-locked", String(locked));
    setAttribute("data-fw-x", site === "x" && gate ? "blocked" : "open");
    setAttribute("data-fw-ig", site === "instagram" && gate ? "blocked" : "open");
    if (gate || (site === "instagram" && locked)) pauseBlockedMedia();
    if (document.body) render(gate);
  }
  function shouldPause(video) {
    if (instagram) return instagram.shouldPause(video);
    if (isActive()) return false;
    if (blocked()) return site === "instagram" || !!video.closest('[data-testid="primaryColumn"]');
    return false;
  }
  function pauseBlockedMedia() {
    document.querySelectorAll("video, audio").forEach((media) => {
      if (!media.paused && shouldPause(media)) media.pause();
    });
  }
  document.addEventListener("play", (event) => {
    if ((event.target instanceof HTMLMediaElement) && shouldPause(event.target)) event.target.pause();
  }, true);
  function ensureUI() {
    if (host?.isConnected) return;
    host = document.createElement("div");
    host.id = "feed-window-root";
    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;color:#163d33;color-scheme:light;font-size:14px;line-height:1.6}
        *{box-sizing:border-box} [hidden]{display:none!important}
        .gate,.timer{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;color:#163d33;font-size:14px;line-height:1.6}
        .gate{background:#f5f7f0;border:1px solid #dce5d8;border-radius:24px;padding:44px 30px;text-align:center;box-shadow:0 10px 40px #163d330b;max-width:510px;margin:24px auto;max-height:calc(100vh - 130px);overflow:auto}
        .brand{font-size:11px;letter-spacing:.18em;font-weight:700;color:#547563;margin:0 0 26px}
        .symbol{width:52px;height:52px;border-radius:17px;background:#e2ebd9;display:grid;place-items:center;margin:0 auto 24px;font-size:26px}
        h2{font-size:25px;font-weight:650;line-height:1.5;letter-spacing:-.03em;margin:0 0 12px}
        p{margin:0 0 20px;color:#607367;font-size:13px} .count{font-size:13px;color:#365646;margin-bottom:16px}
        button,a{font:inherit} button{cursor:pointer;border:0;border-radius:13px;background:#245a43;color:white;padding:14px 22px;font-weight:650;min-height:44px}
        button:disabled{cursor:default;opacity:.5} button:focus-visible,a:focus-visible{outline:3px solid #be7b32;outline-offset:4px}
        .primary{width:100%}.secondary{display:inline-block;background:transparent;color:#365646;text-decoration:underline;margin-top:12px;padding:10px}
        .note{font-size:11px;margin:18px 0 0;color:#7b877c}.error{color:#9e3b25;font-size:12px;margin:12px 0 0}
        .timer{background:#f5f7f0;border:1px solid #dce5d8;border-radius:16px;box-shadow:0 6px 25px #0002;padding:12px 16px;display:flex;gap:16px;align-items:center}
        .timer strong{font-size:20px;font-variant-numeric:tabular-nums}.timer small{display:block;font-size:10px;letter-spacing:.08em;color:#607367}
        .timer button{font-size:12px;padding:8px 12px;min-height:36px}
        .single{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;font-size:11px;line-height:1.6;color:#365646;background:#f5f7f0;border:1px solid #dce5d8;border-radius:12px;padding:10px 14px;box-shadow:0 4px 18px #0001}
        @media(prefers-reduced-motion:no-preference){button{transition:background .15s}button:hover:not(:disabled){background:#347355}}
        @media(max-width:600px){.gate{padding:28px 20px;border-radius:18px;margin:10px}h2{font-size:22px}}
      </style>
      <section class="gate" aria-label="Feed Window 閲覧制限" hidden>
        <div class="brand">FEED WINDOW</div><div class="symbol" aria-hidden="true">◷</div>
        <h2></h2><p class="description"></p><div class="count"></div>
        <button class="primary" type="button"></button>
        <button class="secondary following" type="button" hidden>「フォロー中」を見る</button>
        <a class="secondary instagram-home" href="https://www.instagram.com/" hidden>ホームに戻る</a>
        <p class="note">サービスごとに独立した枠 / 毎日0時にリセット<br>設定はブラウザのツールバーの拡張ボタンから</p>
        <p class="error" role="status"></p>
      </section>
      <section class="timer" aria-label="Feed Window 解放中" hidden>
        <div><small>FEED WINDOW · 残り</small><strong></strong></div>
        <button type="button">今すぐ閉じる</button>
      </section>
      <section class="single" aria-label="Feed Window 個別再生" hidden>この動画はいつでも再生できます。<br>次のリールへのスクロールは停止中。</section>`;
    shadow.querySelector(".primary").addEventListener("click", () => command(state ? "START" : "GET"));
    shadow.querySelector(".timer button").addEventListener("click", () => command("STOP"));
    shadow.querySelector(".following").addEventListener("click", () => {
      const tabs = homeTabs();
      const following = tabs.find((tab) => /following|フォロー中/i.test(tab.textContent)) || tabs[1];
      if (following) following.click();
      schedule();
    });
    document.body.append(host);
  }
  function text(selector, value) {
    const el = shadow.querySelector(selector);
    if (el.textContent !== value) el.textContent = value;
  }
  function render(gate) {
    const selected = instagram?.single();
    if (!gate && !isActive() && !selected) {
      if (host) host.style.setProperty("display", "none", "important");
      return;
    }
    ensureUI();
    host.style.setProperty("display", "block", "important");
    shadow.querySelector(".gate").hidden = !gate;
    shadow.querySelector(".timer").hidden = gate || !isActive();
    shadow.querySelector(".single").hidden = gate || isActive() || !selected;
    if (gate) {
      const primary = site === "x" ? document.querySelector('[data-testid="primaryColumn"]') : document.querySelector('main, [role="main"]');
      const rect = primary?.getBoundingClientRect();
      const left = rect && rect.width > 100 ? Math.max(8, rect.left) : Math.max(12, (innerWidth - 540) / 2);
      host.style.setProperty("left", `${left}px`, "important");
      host.style.setProperty("width", `${Math.min(rect?.width > 100 ? rect.width : 540, innerWidth - left - 8)}px`, "important");
      host.style.setProperty("top", "80px", "important");
      host.style.setProperty("bottom", "auto", "important");
      host.style.setProperty("right", "auto", "important");
      const remaining = state?.day === localDay() ? state.remaining : state?.settings.sessions;
      text("h2", site === "x" ? "おすすめは、ひと休み。" : "リールは、ひと休み。");
      text(".description", instagram ? "DM・保存した動画はいつでも。連続閲覧だけを時間で区切ります。" : "見たいときだけ、時間を決めて開きましょう。");
      text(".count", state ? `今日の残り ${remaining} / ${state.settings.sessions} 回` : "解放枠を確認しています");
      text(".primary", !state ? "接続を再確認" : remaining > 0 ? `${state.settings.minutes}分だけ見る` : "今日はここまで。また明日。");
      shadow.querySelector(".primary").disabled = busy || (!!state && remaining <= 0);
      shadow.querySelector(".following").hidden = site !== "x" || homeTabs().length < 2;
      shadow.querySelector(".instagram-home").hidden = site !== "instagram";
      text(".error", errorText);
    } else {
      host.style.setProperty("left", "auto", "important");
      host.style.setProperty("top", "auto", "important");
      host.style.setProperty("right", "20px", "important");
      host.style.setProperty("bottom", "20px", "important");
      host.style.setProperty("width", "auto", "important");
      if (isActive()) {
        const seconds = Math.max(0, Math.ceil((state.activeUntil - Date.now()) / 1000));
        text(".timer strong", `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
        shadow.querySelector(".timer button").disabled = busy;
      }
    }
  }
  async function command(type) {
    if (busy) {
      if (type === "GET") refreshPending = true;
      else actionPending = type;
      return;
    }
    busy = true;
    enforce();
    try {
      const response = await api.runtime.sendMessage({ channel: "feed-window", type, site });
      if (!response?.ok) throw new Error(response?.error || "拡張機能に接続できません。ページを再読み込みしてください。");
      state = response.state;
      errorText = "";
    } catch (error) {
      errorText = error.message;
      // Never keep a feed open using a stale or missing response.
      if (!state || state.activeUntil <= Date.now()) state = null;
    } finally {
      busy = false;
      enforce();
      const action = actionPending;
      actionPending = null;
      if (action || refreshPending) {
        refreshPending = false;
        command(action || "GET");
      }
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enforce(); });
  }
  enforce();
  new MutationObserver(schedule).observe(html, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["aria-selected", "href"]
  });
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.feedWindowState) command("GET");
  });
  document.addEventListener("click", schedule, true);
  window.addEventListener("popstate", () => { enforce(); command("GET"); });
  window.addEventListener("resize", schedule);
  window.addEventListener("pageshow", () => { enforce(); command("GET"); });
  document.addEventListener("visibilitychange", () => { enforce(); if (!document.hidden) command("GET"); });
  setInterval(() => {
    if (lastPath !== location.pathname) { lastPath = location.pathname; command("GET"); }
    enforce();
  }, 250);
  setInterval(() => command("GET"), 10_000);
  command("GET");
})();
