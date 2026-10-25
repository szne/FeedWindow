"use strict";
const api = globalThis.browser || globalThis.chrome;
const $ = (id) => document.getElementById(id);
let state;
let busy = false;
let editing = false;
let selectedSite = "x";
function message(text, error = false) { $("message").textContent = text; $("message").classList.toggle("error", error); }
async function send(type, settings) {
  if (busy) return;
  busy = true;
  render();
  try {
    const response = await api.runtime.sendMessage({ channel: "feed-window", type, settings, site: selectedSite });
    if (!response?.ok) throw new Error(response?.error || "拡張機能に接続できません。");
    state = response.state;
    if (type === "SETTINGS") { editing = false; message("設定を保存しました。"); }
    else if (type !== "GET") message(type === "STOP" ? "閉じました。使用済みの回数は戻りません。" : `${selectedSite === "x" ? "Xのおすすめ" : "Instagramのリール"}を解放しました。`);
    if (!editing) { $("minutes").value = state.settings.minutes; $("sessions").value = state.settings.sessions; }
  } catch (error) { message(error.message, true); }
  finally { busy = false; render(); }
}
function render() {
  for (const site of ["x", "instagram"]) {
    $(`site-${site}`).setAttribute("aria-pressed", String(site === selectedSite));
    $(`site-${site}`).disabled = busy;
  }
  if (!state) return;
  const ms = Math.max(0, state.activeUntil - Date.now());
  const active = ms > 0;
  document.body.classList.toggle("active", active);
  $("date").textContent = new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date());
  $("status").textContent = active ? "解放中" : "制限中";
  $("hero-label").textContent = active ? "この時間を、大切に。" : "今日の残り";
  const seconds = Math.ceil(ms / 1000);
  $("remaining").textContent = active ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : state.remaining;
  $("unit").textContent = active ? "" : "回";
  $("summary").textContent = `${state.settings.minutes}分 × ${state.settings.sessions}回 / 日`;
  const signature = `${state.settings.sessions}:${state.remaining}`;
  if ($("slots").dataset.signature !== signature) {
    $("slots").replaceChildren(...Array.from({ length: state.settings.sessions }, (_, index) => {
      const slot = document.createElement("i"); slot.className = index < state.remaining ? "available" : ""; return slot;
    }));
    $("slots").dataset.signature = signature;
  }
  $("start").textContent = active ? "解放しています" : state.remaining > 0 ? `${state.settings.minutes}分だけ見る` : "今日はここまで。また明日。";
  $("start").disabled = busy || active || state.remaining <= 0;
  $("stop").hidden = !active;
  $("stop").disabled = busy;
  $("save").disabled = busy;
}
$("start").addEventListener("click", () => send("START"));
for (const site of ["x", "instagram"]) {
  $(`site-${site}`).addEventListener("click", () => {
    if (busy) return;
    selectedSite = site;
    state = undefined;
    $("start").disabled = true;
    $("remaining").textContent = "—";
    message("");
    send("GET");
  });
}
$("stop").addEventListener("click", () => send("STOP"));
$("settings-form").addEventListener("input", () => { editing = true; });
$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  send("SETTINGS", { minutes: Number($("minutes").value), sessions: Number($("sessions").value) });
});
api.storage.onChanged.addListener((changes, area) => { if (area === "local" && changes.feedWindowState) send("GET"); });
setInterval(render, 250);
setInterval(() => send("GET"), 2000);
(async () => {
  try {
    const tabs = await api.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.url && /(^|\.)instagram\.com$/.test(new URL(tabs[0].url).hostname)) selectedSite = "instagram";
  } catch { /* The selector still works without permission to read this tab. */ }
  send("GET");
})();
