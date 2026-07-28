// runner.js — loaded LAST, and ONLY as a content script (not in the popup). For
// each registered enhancement, decides whether it applies to this URL (and the user
// has switched it on — everything is off by default), then injects its CSS and/or
// runs its apply(ctx). Keeps everything
// in sync as the page mutates and as the user toggles enhancements (via
// chrome.storage) — including live teardown of JS enhancements that provide
// cleanup (via ctx) or a revert().
//
// The popup does NOT talk to this script; it reads the registry directly and
// writes chrome.storage.sync, which we observe below.

(function () {
  const reg = window.OSEnhance;
  if (!reg || !reg._enhancements) {
    console.error("[OSEnhance] registry.js did not load before runner.js");
    return;
  }

  const STORAGE_KEY = "enabledEnhancements";
  const MARK_KEY = "markChanges";   // "Mark LOBE changes on page" (Settings) — default ON
  // The current URL. On SPA platforms (e.g. the ODC Portal) navigation changes the URL
  // via the History API without reloading the content script, so this must be re-read,
  // not captured once — otherwise enhancements match the wrong (stale) page: they fail
  // to activate on SPA-navigated pages, and stay active (badge and all) after leaving.
  // sync() refreshes it every run.
  let href = location.href;
  let enabled = new Set(); // ids the user has switched ON (default: everything off)
  let markOn = true;       // show LOBE's stamp/branding (default ON; user can turn off)

  const injectedStyles = new Map(); // id -> <style> element
  const cleanups = new Map();       // id -> array of teardown fns (from ctx)
  const applied = new Set();        // ids whose apply() has run and not yet torn down
  let observer = null;              // MutationObserver, kept so teardown can disconnect it
  let sharedStyle = null;           // the one shared LOBE stamp stylesheet (stamp.baseCss)
  let corner = null;                // the global "LOBE is active here" corner badge

  const urlMatches = reg.urlMatches; // shared with the popup (defined in registry.js)

  function cssTextFor(e) {
    const css = typeof e.css === "function" ? e.css(href) : e.css;
    return typeof css === "string" ? css : "";
  }

  function injectCss(e) {
    const css = cssTextFor(e);
    if (!css) return;
    let el = injectedStyles.get(e.id);
    if (!el) {
      el = document.createElement("style");
      el.setAttribute("data-ose-id", e.id);
      (document.head || document.documentElement).appendChild(el);
      injectedStyles.set(e.id, el);
    }
    if (el.textContent !== css) el.textContent = css; // idempotent
  }

  function removeCss(id) {
    const el = injectedStyles.get(id);
    if (el) {
      el.remove();
      injectedStyles.delete(id);
    }
  }

  // Run a JS enhancement's teardown: its ctx cleanups (LIFO) then its revert().
  function teardownJs(e) {
    const list = cleanups.get(e.id);
    if (list) {
      for (let i = list.length - 1; i >= 0; i--) {
        try {
          list[i]();
        } catch (err) {
          console.error("[OSEnhance] cleanup failed:", e.id, err);
        }
      }
      cleanups.delete(e.id);
    }
    if (typeof e.revert === "function") {
      try {
        e.revert();
      } catch (err) {
        console.error("[OSEnhance] revert failed:", e.id, err);
      }
    }
  }

  // --- Shared LOBE branding -------------------------------------------------
  // The palette/classes every enhancement's stamp relies on live in one stylesheet
  // (stamp.baseCss), injected once while anything is active and removed when nothing
  // is. The corner badge is the global "LOBE is active here" marker — it covers even
  // enhancements that only hide content and so have nothing of their own to stamp.

  // Reflect the "Mark LOBE changes on page" setting on <html>. The class only bites
  // when stamp.baseCss is present (i.e. something is active), and the CSS does all the
  // work — so flipping the setting strips/restores every LOBE mark live, with no
  // re-sync. (We observe childList, not attributes, so toggling this class on <html>
  // doesn't feed the MutationObserver.)
  function applyMarkClass() {
    document.documentElement.classList.toggle("ose-marks-off", !markOn);
  }

  function ensureSharedStyle() {
    if (sharedStyle && sharedStyle.isConnected) return;
    sharedStyle = document.createElement("style");
    sharedStyle.setAttribute("data-ose-shared", "1");
    sharedStyle.textContent = (reg.stamp && reg.stamp.baseCss) || "";
    (document.head || document.documentElement).appendChild(sharedStyle);
  }
  function removeSharedStyle() {
    if (sharedStyle) {
      sharedStyle.remove();
      sharedStyle = null;
    }
  }

  function removeCorner() {
    if (corner) {
      corner.remove();
      corner = null;
    }
  }
  // Add the corner badge (once) and keep its count + tooltip in step with what's
  // active. Idempotent: only touches the DOM when a value actually changes, so it
  // never feeds the MutationObserver a reason to loop.
  function updateCorner(active) {
    if (!corner || !corner.isConnected) {
      corner = document.createElement("div");
      corner.className = "ose-lobe-corner";
      if (reg.stamp) corner.appendChild(reg.stamp.bee(document));
      const label = document.createElement("span");
      label.textContent = "LOBE";
      corner.appendChild(label);
      const count = document.createElement("span");
      count.className = "ose-lobe-corner-count";
      corner.appendChild(count);
      (document.body || document.documentElement).appendChild(corner);
    }
    const countEl = corner.querySelector(".ose-lobe-corner-count");
    const n = String(active.length);
    if (countEl && countEl.textContent !== n) countEl.textContent = n;
    const title =
      "LOBE active on this page:\n• " +
      active.map((e) => e.title || e.id).join("\n• ");
    if (corner.title !== title) corner.title = title;
  }

  function updateBranding(active) {
    if (!active.length) {
      removeCorner();
      removeSharedStyle();
      return;
    }
    ensureSharedStyle();
    updateCorner(active);
  }

  // Bring the page in line with which enhancements are on. Safe to call repeatedly.
  function sync() {
    href = location.href; // refresh for SPA navigations (see the `href` note above)
    const active = [];
    for (const e of reg._enhancements) {
      const on = urlMatches(e.match, href) && enabled.has(e.id);
      if (on) {
        active.push(e);
        if (e.css != null) injectCss(e);
        if (typeof e.apply === "function") {
          let list = cleanups.get(e.id);
          if (!list) {
            list = [];
            cleanups.set(e.id, list);
          }
          const ctx = reg.makeCtx((fn) => list.push(fn));
          try {
            e.apply(ctx);
          } catch (err) {
            console.error("[OSEnhance] Enhancement failed:", e.id, err);
          }
          applied.add(e.id);
        }
      } else {
        if (e.css != null) removeCss(e.id);
        if (applied.has(e.id)) {
          teardownJs(e);
          applied.delete(e.id);
        }
      }
    }
    updateBranding(active);
  }

  // React to toggles from the popup. The popup only writes chrome.storage.sync —
  // so toggling works regardless of this script's liveness, and the page updates live.
  function onStorageChanged(changes, area) {
    if (area !== "sync") return;
    if (changes[STORAGE_KEY]) {
      enabled = new Set(changes[STORAGE_KEY].newValue || []);
      sync();
    }
    if (changes[MARK_KEY]) {
      markOn = changes[MARK_KEY].newValue !== false; // absent/true => on
      applyMarkClass();
    }
  }
  chrome.storage.onChanged.addListener(onStorageChanged);

  // Full teardown, sent by the background worker when the user turns this whole
  // DOMAIN off (its host permission is being revoked). Reverts every enhancement the
  // same way switching one off does — removeCss + teardownJs — then goes dormant, so
  // a live tab is cleaned up immediately instead of only on its next reload.
  function teardownAll() {
    for (const e of reg._enhancements) {
      if (e.css != null) removeCss(e.id);
      if (applied.has(e.id)) {
        teardownJs(e);
        applied.delete(e.id);
      }
    }
    removeCorner();      // drop the global badge and shared stamp stylesheet too
    removeSharedStyle();
    document.documentElement.classList.remove("ose-marks-off");
    enabled = new Set(); // a stray sync() must not re-apply anything
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    observing = false;
    window.removeEventListener("popstate", sync);
    window.removeEventListener("hashchange", sync);
    chrome.storage.onChanged.removeListener(onStorageChanged);
    chrome.runtime.onMessage.removeListener(onMessage);
  }
  function onMessage(msg) {
    if (msg && msg.ose === "teardown") teardownAll();
  }
  chrome.runtime.onMessage.addListener(onMessage);

  let observing = false;
  function start() {
    const active = reg._enhancements.filter(
      (e) => urlMatches(e.match, href) && enabled.has(e.id)
    );
    if (active.length) {
      console.debug(
        "[OSEnhance] Active on this page:",
        active.map((e) => e.id).join(", ")
      );
    }
    sync();

    if (observing) return;
    observing = true;
    // Re-apply on DOM changes (OutSystems rebuilds chunks of the page after load).
    // Debounced to one run per frame. injectCss/apply are idempotent, so re-runs
    // triggered by our own edits settle immediately without looping.
    let scheduled = false;
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        sync();
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // SPA navigation changes the URL without a reload. The observer above already
    // catches the DOM changes a pushState navigation causes; also react to history
    // back/forward and hash changes directly, so we re-sync (and re-read href) promptly.
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
  }

  // Load the user's enabled set + the "mark changes" setting, then start. Nothing runs
  // until the user opts in; marking defaults ON.
  chrome.storage.sync.get({ [STORAGE_KEY]: [], [MARK_KEY]: true }, (res) => {
    enabled = new Set(res[STORAGE_KEY] || []);
    markOn = res[MARK_KEY] !== false;
    applyMarkClass();
    start();
  });
})();
