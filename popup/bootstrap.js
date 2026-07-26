// bootstrap.js — the popup's single entry point.
//
// Instead of hard-coding a <script> tag per enhancement (a list that would have to
// be kept in sync with the manifest by hand), we read the list from the manifest —
// the SAME `content_scripts[0].js` the pages use — and inject those scripts into the
// popup, minus the content-script-only runner.js, then popup.js. So the enhancement
// list lives in exactly one place: manifest.json. Adding an enhancement needs no
// change here.
//
// Scripts are injected with async=false so they execute in manifest order
// (registry.js → categories.js → enhancement files → popup.js), just like the
// content scripts do.

(function () {
  const cs = (chrome.runtime.getManifest().content_scripts || [])[0] || {};
  const files = (cs.js || []).filter((f) => !/(^|\/)runner\.js$/.test(f));
  files.push("popup/popup.js"); // popup logic runs last, once the registry is built

  const head = document.head || document.documentElement;
  for (const f of files) {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL(f);
    s.async = false; // preserve execution order
    head.appendChild(s);
  }
})();
