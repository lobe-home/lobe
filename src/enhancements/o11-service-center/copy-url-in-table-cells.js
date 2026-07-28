// Enhancement: Add a small copy icon after plain-text URLs in table cells.
//
// On the eSpace details page (eSpace_Edit.aspx), several tabs list integrations
// whose endpoints show up as plain-text http(s) URLs inside <td> cells — they're
// just text, not links, so there's nothing to click to copy them. This drops a
// little copy icon (not a full button) right after each such URL.
//
// The URLs only appear after you pick a tab, and OutSystems rebuilds that content
// client-side. The runner re-invokes apply() on DOM mutations, so newly revealed
// cells get icons too; everything here is idempotent so those re-runs settle.
//
// Detection is deliberately conservative: only text that literally contains an
// http:// or https:// URL, and only inside <td> cells. We route the DOM changes
// through `ctx` (and re-merge the split text on cleanup) so switching the
// enhancement off removes every icon and restores the original text with no reload.

(function () {
  // http(s):// followed by non-whitespace, non-angle-bracket/quote characters.
  // Global so we can find every occurrence within a text node.
  const URL_RE = /https?:\/\/[^\s<>"']+/g;

  // Characters that commonly trail a URL in prose but aren't part of it.
  const TRAILING = /[.,;:!?)\]}>'"]+$/;

  const COPY_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  function flash(btn) {
    clearTimeout(btn._oseTimer);
    btn.classList.add("ose-copied");
    btn.innerHTML = CHECK_SVG;
    btn.title = "Copied!";
    btn._oseTimer = setTimeout(() => {
      btn.classList.remove("ose-copied");
      btn.innerHTML = COPY_SVG;
      btn.title = "Copy URL";
    }, 1200);
  }

  // Already handled if the node right after this text node is one of our icons.
  function isTagged(textNode) {
    const next = textNode.nextSibling;
    return (
      next &&
      next.nodeType === 1 &&
      next.classList &&
      next.classList.contains("ose-url-copy")
    );
  }

  OSEnhance.register({
    id: "copy-url-in-table-cells",
    title: "Copy icon for URLs in tables",
    description:
      "On the eSpace details page, adds a small copy icon after each plain-text http(s) URL shown in a table cell.",

    match: /\/servicecenter\/eSpace_Edit\.aspx/i,

    css: `
      .ose-url-copy {
        /* A bare inline icon — no border or background, so it reads as a hint
           next to the URL rather than a full button. border-box keeps its size
           predictable on a page with no CSS reset. */
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        vertical-align: middle;
        margin-left: 4px;
        padding: 0;
        border: 0;
        background: none;
        color: #8a8a8a;
        cursor: pointer;
        line-height: 0;
      }
      /* A gold hover is the LOBE cue — the icon is too small for the bee, and a
         permanent honey tint would be too loud inline in a table. */
      .ose-url-copy:hover { color: var(--lobe-ink); }
      .ose-url-copy.ose-copied { color: #1f7a34; }
    `,

    // ctx-routed so the runner can pull every icon (and re-merge the text we split)
    // when this is switched off — no reload needed.
    apply(ctx) {
      // Collect target text nodes first: mutating the DOM while a TreeWalker is
      // live is fragile, so we snapshot, then act.
      const targets = [];
      const cells = document.querySelectorAll("td");
      for (const cell of cells) {
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (!node.nodeValue || node.nodeValue.indexOf("http") === -1) {
              return NodeFilter.FILTER_REJECT;
            }
            // Skip text already inside a link or one of our own icons.
            const parent = node.parentNode;
            if (parent && parent.closest && parent.closest("a, .ose-url-copy")) {
              return NodeFilter.FILTER_REJECT;
            }
            URL_RE.lastIndex = 0;
            return URL_RE.test(node.nodeValue)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        });
        let n;
        while ((n = walker.nextNode())) targets.push(n);
      }

      for (const textNode of targets) {
        if (isTagged(textNode)) continue; // idempotent

        // Find the first URL in this node and trim trailing punctuation off it.
        URL_RE.lastIndex = 0;
        const m = URL_RE.exec(textNode.nodeValue);
        if (!m) continue;
        const start = m.index;
        let url = m[0].replace(TRAILING, "");
        if (!url) continue;
        const end = start + url.length;

        // Isolate the URL into its own text node so the icon lands right after it.
        // splitText(off): keeps [0,off) here, returns [off,len). Split off any
        // trailing text first, then the leading text, leaving `urlNode` = the URL.
        let urlNode = textNode;
        if (end < urlNode.nodeValue.length) urlNode.splitText(end);
        if (start > 0) urlNode = urlNode.splitText(start);

        const parent = urlNode.parentNode;
        if (!parent) continue;

        const btn = ctx.createElement("button", {
          type: "button",
          class: "ose-url-copy",
          title: "Copy URL",
          "aria-label": "Copy URL",
          html: COPY_SVG
        });
        ctx.on(btn, "click", (e) => {
          e.preventDefault();
          copyText(url).then(
            () => flash(btn),
            (err) => console.error("[OSEnhance] copy failed:", err)
          );
        });

        // Insert right after the URL node (text nodes have no insertAdjacentElement),
        // and register cleanup that removes the icon and re-merges the split text.
        parent.insertBefore(btn, urlNode.nextSibling);
        ctx.onCleanup(() => {
          btn.remove();
          parent.normalize();
        });
      }
    }
  });
})();
