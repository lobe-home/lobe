// Enhancement: Add a copy-to-clipboard button after the Base URL input.
//
// On Service Center's REST Web Reference edit page, this drops a small copy icon
// right after the Base URL field. Clicking it copies the field's current value to
// the clipboard and briefly shows a checkmark.
//
// Uses both `css` (button styling, removed cleanly when disabled) and `apply()`
// (injects the button + wires the click — behaviour CSS can't do). Wrapped in an
// IIFE so its helper constants don't leak into the shared content-script scope.

(function () {
  const TARGET = 'input[id$="BaseURLInput"]';

  const COPY_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"></rect>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

  const CHECK_SVG =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>';

  function isTarget(el) {
    return el && el.tagName === "INPUT" && /BaseURLInput$/.test(el.id);
  }

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

  OSEnhance.register({
    id: "copy-rest-webreference-base-url",
    title: "Copy button for Base URL",
    description:
      "On consumed API details page, adds a copy-to-clipboard button after the Base URL input.",

    match: /\/servicecenter\/eSpace_RestWebReference_Edit\.aspx/i,

    css: `
      /* --- Shared wrapper relaxation (identical in the widen enhancement) ---
         The field's wrapper is a fixed 300px/32px box, which makes the button
         wrap to a clipped second line. Let the wrapper size to its content and
         grow vertically, and put the validation message on its own line, so the
         button sits inline right after the input — even when the widen
         enhancement is off. :has() picks only our field's wrapper. */
      .OSInline:has(input[id$="BaseURLInput"]) {
        width: auto !important;
        height: auto !important;
      }
      .OSInline:has(input[id$="BaseURLInput"]) .ValidationMessage {
        display: block !important;
      }

      /* --- This enhancement's own element: the copy button. ---
         Its base look is a plain neutral button (this is a LOBE-injected control, so
         it needs SOME styling to be usable — that's this enhancement's own choice, not
         a global default). The LOBE honey/gold is layered on only while marking is on
         (below), so with marks off the button is just a plain grey button. */
      .ose-copy-btn {
        /* border-box so total width stays a predictable 26px (the page has no
           CSS reset that would otherwise let padding/border expand it). */
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
        margin-left: 6px;
        padding: 4px;
        width: 26px;
        height: 26px;
        color: #444;
        background: #fff;
        border: 1px solid #bbb;
        border-radius: 5px;
        cursor: pointer;
        line-height: 0;
      }
      .ose-copy-btn:hover { background: #f0f0f0; border-color: #888; }
      /* Green "copied!" confirmation — success reads clearer than brand here. */
      .ose-copy-btn.ose-copied { color: #1f7a34; border-color: #1f7a34; }

      /* LOBE stamp: honey/gold, only while marking is on (too small to hold the bee). */
      :root:not(.ose-marks-off) .ose-copy-btn {
        color: var(--lobe-ink);
        background: var(--lobe-honey);
        border-color: var(--lobe-gold);
      }
      :root:not(.ose-marks-off) .ose-copy-btn:hover {
        background: var(--lobe-honey-hover);
        border-color: var(--lobe-ink);
      }
    `,

    // Uses ctx so the framework can remove the button (and its listener) when the
    // enhancement is switched off — no page reload needed.
    apply(ctx) {
      // Remove orphaned buttons left behind if OutSystems re-rendered the field.
      OSEnhance.util.each(".ose-copy-btn", (btn) => {
        if (!isTarget(btn.previousElementSibling)) btn.remove();
      });

      OSEnhance.util.each(TARGET, (input) => {
        // Idempotent: skip if our button is already right after this input.
        const next = input.nextElementSibling;
        if (next && next.classList && next.classList.contains("ose-copy-btn")) return;

        const btn = ctx.createElement("button", {
          type: "button",
          class: "ose-copy-btn",
          title: "Copy URL",
          "aria-label": "Copy URL",
          html: COPY_SVG
        });
        ctx.on(btn, "click", (e) => {
          e.preventDefault();
          copyText(input.value).then(
            () => flash(btn),
            (err) => console.error("[OSEnhance] copy failed:", err)
          );
        });
        ctx.insertAfter(input, btn);
      });
    }
  });
})();
