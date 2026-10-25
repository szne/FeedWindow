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
  function reelId(path) {
    const id = path.match(/^\/reels?\/([A-Za-z0-9_-]+)\/?$/)?.[1];
    return id && !/^(audio|create|saved|liked|following|videos|feed|tags)$/i.test(id) ? id : null;
  }
  function instagramExempt(path) {
    return /^\/direct(?:\/|$)/.test(path) || /(?:^|\/)saved(?:\/|$)/.test(path) || /^\/(?:p|tv)\/[^/]+\/?$/.test(path);
  }
  // A permalink selected outside the reel feed grants that one clip. Automatic
  // navigation inside the feed cannot turn the next clip into a fresh grant.
  function reelSelection(previous, path) {
    if (previous?.path === path) return previous;
    const id = reelId(path);
    const enteredFromOutside = !previous || !isReel(previous.path);
    return { path, anchor: id ? enteredFromOutside ? id : previous?.anchor || null : null };
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
  const value = { site, isReel, reelId, instagramExempt, reelSelection, xMode };
  root.FeedWindowTargets = value;
  if (typeof module === "object" && module.exports) module.exports = value;
})(globalThis);
