function show(enabled) {
  if (typeof enabled !== "boolean") return;
  document.body.classList.toggle("state-on", enabled);
  document.body.classList.toggle("state-off", !enabled);
}
document.querySelector(".open-preferences").addEventListener("click", () => {
  window.webkit.messageHandlers.controller.postMessage("open-preferences");
});
