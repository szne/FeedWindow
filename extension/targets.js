(function (root) {
  "use strict";
  function site(host) {
    if (/(^|\.)(x|twitter)\.com$/.test(host)) return "x";
    if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
    return null;
  }
  function isReel(path) {
    return /\/(reels?|reels_tab)(\/|$)/i.test(path);
  }
  function xMode(tabs) {
    const selected = tabs.find((tab) => tab.selected);
    if (!selected) return "unknown";
    const label = selected.label.replace(/\s+/g, " ").trim();
    if (/^(following|フォロー中|フォローしている|正在关注|正在關注|팔로잉)$/i.test(label)) return "following";
    // X places Following second. Keep language-independent detection within its home tablist.
    if (tabs.length === 2 && tabs.indexOf(selected) === 1) return "following";
    return "for-you";
  }
  const value = { site, isReel, xMode };
  root.FeedWindowTargets = value;
  if (typeof module === "object" && module.exports) module.exports = value;
})(globalThis);
