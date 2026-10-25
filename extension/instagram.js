/* Allow one selected clip, while keeping the surrounding reel feed locked. */
(() => {
  "use strict";
  const targets = globalThis.FeedWindowTargets;
  const nextLabel = /^(next|previous)(?: reel| video)?$|^(次へ|前へ|次のリール|前のリール|次の動画|前の動画|↓|↑|⬇|⬆)$/i;
  globalThis.FeedWindowInstagram = function (isUnlocked) {
    let selection = null;
    let current = null;
    let touch = null;
    let touchMoved = false;
    let touchBlocked = false;
    let modalScope = null;
    let pendingPermalink = null;
    const frozen = new Map();
    const html = document.documentElement;
    const attr = (element, name, value) => {
      if (element.getAttribute(name) !== value) element.setAttribute(name, value);
    };
    function syncRoute() {
      let next = targets.reelSelection(selection, location.pathname);
      if (next !== selection && modalScope && targets.reelId(next.path) && !isUnlocked()) {
        next = { path: next.path, anchor: modalScope.id };
      }
      if (next !== selection) { clearSingle(); selection = next; }
    }
    function videoDialog() {
      if (!targets.instagramExempt(location.pathname)) return null;
      return [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].find((dialog) =>
        [...dialog.querySelectorAll("video")].some((video) => visibleArea(video) > 0)
      ) || null;
    }
    function single() {
      syncRoute();
      const id = targets.reelId(location.pathname);
      return !isUnlocked() && (id ? id === selection.anchor : !!videoDialog());
    }
    function blocked() {
      syncRoute();
      return !isUnlocked() && targets.isReel(location.pathname) && !single();
    }
    function clearSingle() {
      current = null;
      modalScope = null;
      for (const element of frozen.keys()) element.removeAttribute("data-fw-reel-scroller");
      frozen.clear();
      document.querySelectorAll("[data-fw-reel-current], [data-fw-reel-neighbor], [data-fw-reel-navigation]").forEach((element) => {
        for (const name of ["data-fw-reel-current", "data-fw-reel-neighbor", "data-fw-reel-navigation"]) element.removeAttribute(name);
      });
    }
    function inlineReels(exempt) {
      const wanted = new Set();
      if (!exempt) document.querySelectorAll('a[href*="/reel"]').forEach((link) => {
        let url;
        try { url = new URL(link.href, location.href); } catch { return; }
        if (targets.site(url.hostname) !== "instagram" || !targets.reelId(url.pathname)) return;
        wanted.add(link);
        const article = link.closest("article");
        if (article) wanted.add(article);
      });
      document.querySelectorAll("[data-fw-reel]").forEach((element) => {
        if (!wanted.has(element)) element.removeAttribute("data-fw-reel");
      });
      for (const element of wanted) attr(element, "data-fw-reel", "");
    }
    function visibleArea(video) {
      const r = video.getBoundingClientRect();
      return Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    }
    function navigation(element) {
      const label = element.getAttribute("aria-label") || element.getAttribute("title") ||
        element.querySelector("[aria-label]")?.getAttribute("aria-label") || element.textContent.trim();
      return nextLabel.test(label.trim());
    }
    function restoreScroll(element) {
      const position = frozen.get(element);
      if (!position) return;
      if (element.scrollTop !== position.top) element.scrollTop = position.top;
      if (element.scrollLeft !== position.left) element.scrollLeft = position.left;
    }
    function freeze(element) {
      if (!element || frozen.has(element)) return;
      frozen.set(element, { top: element.scrollTop, left: element.scrollLeft });
      attr(element, "data-fw-reel-scroller", "");
    }
    function protectSingle() {
      const videos = [...document.querySelectorAll("video")];
      const dialog = videoDialog();
      if (dialog && modalScope?.element !== dialog) {
        clearSingle();
        modalScope = { element: dialog, id: pendingPermalink };
        pendingPermalink = null;
      }
      if (!current?.isConnected) {
        current = videos.filter((video) => (!dialog || dialog.contains(video)) && visibleArea(video) > 0)
          .sort((a, b) => visibleArea(b) - visibleArea(a))[0] || null;
      }
      for (const video of videos) {
        if (video === current) {
          video.removeAttribute("data-fw-reel-neighbor");
          attr(video, "data-fw-reel-current", "");
        } else {
          video.removeAttribute("data-fw-reel-current");
          attr(video, "data-fw-reel-neighbor", "");
        }
      }
      if (current) {
        freeze(document.scrollingElement);
        for (let element = current.parentElement; element; element = element.parentElement) {
          const style = getComputedStyle(element);
          if ((element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) &&
              /auto|scroll|hidden/.test(style.overflowY + style.overflowX)) freeze(element);
        }
      }
      for (const element of frozen.keys()) restoreScroll(element);
      document.querySelectorAll('button, [role="button"], a[aria-label]').forEach((element) => {
        if (navigation(element)) attr(element, "data-fw-reel-navigation", "");
        else element.removeAttribute("data-fw-reel-navigation");
      });
    }
    function update() {
      syncRoute();
      const unlocked = isUnlocked();
      const selected = single();
      const exempt = unlocked || selected || targets.instagramExempt(location.pathname);
      attr(html, "data-fw-ig-single", String(selected));
      attr(html, "data-fw-ig-inline", exempt ? "open" : "blocked");
      inlineReels(exempt);
      if (selected) protectSingle();
      else if (current || frozen.size || document.querySelector("[data-fw-reel-neighbor]")) clearSingle();
      return blocked();
    }
    function shouldPause(media) {
      if (isUnlocked()) return false;
      if (blocked()) return true;
      if (single()) {
        if (!current?.isConnected) protectSingle();
        return media !== current;
      }
      return !targets.instagramExempt(location.pathname) && !!media.closest("[data-fw-reel]");
    }
    function elementAt(event) {
      return event.target instanceof Element ? event.target : event.target?.parentElement;
    }
    function editable(element) { return !!element?.closest('input, textarea, select, [contenteditable="true"], [role="slider"]'); }
    function auxiliaryScroll(element, dy, dx = 0) {
      // Comments/captions may scroll, but never chain their boundary into the feed.
      for (let node = element; node && node !== document.body; node = node.parentElement) {
        if (frozen.has(node) || node.querySelector("video")) return false;
        const style = getComputedStyle(node);
        if (dy && /auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
          return dy > 0 ? node.scrollTop + node.clientHeight < node.scrollHeight - 1 : node.scrollTop > 0;
        }
        if (dx && /auto|scroll/.test(style.overflowX) && node.scrollWidth > node.clientWidth + 1) {
          return dx > 0 ? node.scrollLeft + node.clientWidth < node.scrollWidth - 1 : node.scrollLeft > 0;
        }
      }
      return false;
    }
    function stop(event) {
      if (event.cancelable) event.preventDefault();
      event.stopImmediatePropagation();
    }
    document.addEventListener("wheel", (event) => {
      if (!single() || event.ctrlKey || event.metaKey) return;
      if (!auxiliaryScroll(elementAt(event), event.deltaY, event.deltaX)) stop(event);
      else event.stopImmediatePropagation();
    }, { capture: true, passive: false });
    document.addEventListener("touchstart", (event) => {
      touch = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
      touchMoved = false;
      touchBlocked = false;
    }, { capture: true, passive: true });
    document.addEventListener("touchmove", (event) => {
      if (!single() || !touch || event.touches.length !== 1) return;
      const point = event.touches[0];
      if (Math.abs(touch.y - point.clientY) + Math.abs(touch.x - point.clientX) > 3) touchMoved = true;
      if (!auxiliaryScroll(elementAt(event), touch.y - point.clientY, touch.x - point.clientX)) { touchBlocked = true; stop(event); }
      else event.stopImmediatePropagation();
      touch = { x: point.clientX, y: point.clientY };
    }, { capture: true, passive: false });
    document.addEventListener("touchend", (event) => {
      if (single() && touchMoved) {
        if (touchBlocked) stop(event);
        else event.stopImmediatePropagation();
      }
      touch = null;
    }, { capture: true, passive: false });
    document.addEventListener("keydown", (event) => {
      if (!single() || event.ctrlKey || event.metaKey || event.altKey) return;
      const element = elementAt(event);
      if (editable(element)) return;
      const directions = { ArrowDown: 1, PageDown: 1, End: 1, " ": 1, Spacebar: 1, ArrowUp: -1, PageUp: -1, Home: -1, ArrowLeft: -1, ArrowRight: 1 };
      const direction = directions[event.key];
      if (!direction) return;
      if ((event.key === " " || event.key === "Spacebar") && element?.closest('video, button, [role="button"]')) return;
      if (!auxiliaryScroll(element, direction)) stop(event);
      else event.stopImmediatePropagation();
    }, true);
    document.addEventListener("click", (event) => {
      const element = elementAt(event);
      const link = element?.closest("a[href]");
      let url = null;
      try { if (link) url = new URL(link.href, location.href); } catch { /* Invalid page links cannot grant access. */ }
      const id = url && targets.site(url.hostname) === "instagram" && targets.reelId(url.pathname);
      if (!single()) {
        if (id && targets.instagramExempt(location.pathname)) pendingPermalink = id;
        return;
      }
      const control = element?.closest('button, [role="button"], a[aria-label]');
      if (control && navigation(control)) { stop(event); return; }
      if (!link) return;
      if (id && id !== (modalScope?.id || selection.anchor)) stop(event);
    }, true);
    document.addEventListener("scroll", (event) => {
      if (single()) restoreScroll(event.target === document ? document.scrollingElement : event.target);
    }, true);
    document.addEventListener("ended", (event) => {
      if (single() && event.target === current) event.stopImmediatePropagation();
    }, true);
    return { update, blocked, single, shouldPause };
  };
})();
