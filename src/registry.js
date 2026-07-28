// registry.js — the shared registry every enhancement plugs into.
// Loaded FIRST (before categories.js, the enhancement files, and runner.js).
//
// An enhancement is a plain object with an `id`, a `category`, a `match`, and at
// least one of `css` and `apply`:
//
//   {
//     id:          "unique-kebab-id",        // required, unique
//     title:       "Human readable name",    // shown in the popup
//     description: "What it does and why",    // shown in the popup (the trust story)
//     match:       <matcher>,                 // required: RegExp | string | fn(url) | array
//
//     css:         "<css text>",              // optional: injected as a <style> while active,
//                  // or (url) => "<css text>" //           cleanly removed when turned off
//
//     apply(ctx)   { ... }                    // optional: JS run on load + on DOM mutations;
//                  //                          // MUST be idempotent (check before you write)
//
//     revert()     { ... }                    // optional: undo apply()'s changes (see below)
//
//     revertsLive: false                       // optional: set false ONLY if apply() changes
//                  //                          // the DOM without ctx/revert and so can't be
//                  //                          // undone without a page reload (defaults true)
//   }
//
// The category is NOT a property — it's taken from the folder the file lives in
// (src/enhancements/<category>/…), so it's declared exactly once. register() reads
// it from the running script's URL (see below).
//
// Prefer `css` for anything styling can express — it's declarative and reversible.
// Reach for `apply()` only when you must change the DOM beyond CSS's reach.
//
// Live revert (turning an enhancement off without a page reload):
//   - CSS enhancements always revert live (the <style> is just removed).
//   - A JS enhancement reverts live if it makes its changes through the `ctx`
//     passed to apply(ctx) (see OSEnhance.makeCtx below) and/or defines revert().
//   - A JS enhancement that changes the DOM directly, with no ctx/revert, can't be
//     undone automatically, so the popup asks for a reload when it's switched off.

// Initialised defensively so load order between this file and categories.js
// doesn't matter — neither clobbers the other.
window.OSEnhance = window.OSEnhance || {};
OSEnhance._enhancements = OSEnhance._enhancements || [];
OSEnhance.categories = OSEnhance.categories || [];

OSEnhance.register = function (enhancement) {
  if (!enhancement || !enhancement.id) {
    console.warn("[OSEnhance] Ignored an enhancement with no id:", enhancement);
    return;
  }
  const hasCss = enhancement.css != null;
  const hasApply = typeof enhancement.apply === "function";
  if (!hasCss && !hasApply) {
    console.warn(
      "[OSEnhance] Ignored enhancement (needs `css` and/or `apply()`):",
      enhancement.id
    );
    return;
  }
  if (OSEnhance._enhancements.some((e) => e.id === enhancement.id)) {
    console.warn("[OSEnhance] Ignored duplicate enhancement id:", enhancement.id);
    return;
  }

  // Category comes from the folder the file lives in (src/enhancements/<category>/…),
  // never a property — so it's declared once. We read it from the running script's
  // URL, which is available in the popup (where the files are injected as <script>
  // elements). In the content-script context document.currentScript is null and the
  // category stays unset; that's fine — only the popup groups by category, the
  // runner never reads it.
  const src = (document.currentScript && document.currentScript.src) || "";
  const folder = /\/enhancements\/([^/]+)\//.exec(src);
  if (folder) {
    const cat = folder[1];
    const known = OSEnhance.categories.some((c) => c.id === cat);
    if (!known) {
      console.warn(
        "[OSEnhance] '" + enhancement.id + "' is in unknown category folder '" +
          cat + "' — filed under 'uncategorized'."
      );
    }
    enhancement.category = known ? cat : "uncategorized";
  }

  OSEnhance._enhancements.push(enhancement);
};

// Does `matcher` match `url`? Shared by the runner (to decide what to apply) and
// the popup (to show which enhancements are active on the current tab).
//   matcher can be: a RegExp, a substring string, a fn(url)->bool, or an array
//   of any of those (matches if ANY element matches).
OSEnhance.urlMatches = function (matcher, url) {
  if (Array.isArray(matcher)) return matcher.some((m) => OSEnhance.urlMatches(m, url));
  if (matcher instanceof RegExp) return matcher.test(url);
  if (typeof matcher === "function") return !!matcher(url);
  if (typeof matcher === "string") return url.indexOf(matcher) !== -1;
  return false;
};

// Optional helpers for JS-based enhancements (apply()). CSS-based ones don't need these.
OSEnhance.util = OSEnhance.util || {
  // Set a CSS property with !important, but only if it isn't already that value.
  setImportant(el, prop, value) {
    if (el && el.style.getPropertyValue(prop) !== value) {
      el.style.setProperty(prop, value, "important");
    }
  },
  // Iterate elements matching a selector (defaults to whole document).
  each(selector, fn, root) {
    (root || document).querySelectorAll(selector).forEach(fn);
  }
};

// OSEnhance.stamp — the shared LOBE "stamp" toolkit, so every enhancement can carry
// LOBE's look without copy-pasting the palette or the mascot markup.
//
//   • stamp.palette  — LOBE's honey/gold colours (kept here as the single source).
//   • stamp.baseCss  — a small stylesheet the runner injects ONCE while any enhancement
//                      is active. It declares the --lobe-* CSS variables (so an
//                      enhancement's own css can just use var(--lobe-gold) etc.) and a
//                      a few reusable classes:
//                        .ose-lobe-stamp    the bee mascot, sized to sit inline
//                        .ose-lobe-field    a subtle accent on a field tweaked in place
//                        .ose-lobe-mark     "pure LOBE decoration" — hidden when the
//                                           user turns off "Mark LOBE changes"
//                        .ose-lobe-corner   the global "LOBE is active here" corner badge
//                      It also carries the .ose-marks-off master switch (see below): the
//                      runner sets it on <html> to strip all LOBE styling live.
//   • stamp.bee(doc) — mint the LOBE bee mascot <img> (a web-accessible resource) for a
//                      JS enhancement (or the runner) to drop onto the UI it injects.
//
// Enhancements reference these instead of repeating colours, so the branding stays
// consistent and lives in one place.
OSEnhance.stamp = OSEnhance.stamp || (function () {
  const palette = {
    honey: "#fbf5e7",       // chip / badge / control fill
    honeyHover: "#f0e3c4",  // control hover/active fill (deeper honey)
    gold: "#e7a92b",        // border / accent / field bar
    ink: "#a9781a",         // text/ink on honey
    // Dark-theme variants — mirror the popup's prefers-color-scheme palette
    // (popup.css: --card #2a251e, --accent / --accent-ink #f6c445).
    dark: {
      honey: "#2a251e",
      honeyHover: "#38322a",
      gold: "#f6c445",
      ink: "#f6c445"
    }
  };

  const baseCss = `
    :root {
      --lobe-honey: ${palette.honey};
      --lobe-honey-hover: ${palette.honeyHover};
      --lobe-gold: ${palette.gold};
      --lobe-ink: ${palette.ink};
    }
    /* The bee mascot, sized to sit inline with text. */
    .ose-lobe-stamp {
      width: 18px; height: 18px; flex: 0 0 auto;
      display: inline-block; vertical-align: middle;
    }
    /* The consistent LOBE accent for ANY input an enhancement affects: a thin gold
       bar down the field's left edge. Reused on every touched field so they match
       (apply it with ctx.addClass(input, "ose-lobe-field")). */
    .ose-lobe-field {
      box-shadow: inset 3px 0 0 var(--lobe-gold) !important;
    }
    /* The global "LOBE is active here" corner badge — added by the runner whenever at
       least one enhancement is active on the page, so even enhancements that only hide
       content (nothing of their own to stamp) are still accounted for. */
    .ose-lobe-corner {
      position: fixed; right: 14px; bottom: 14px; z-index: 2147483000;
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 11px 5px 8px;
      background: var(--lobe-honey);
      border: 1.5px solid var(--lobe-gold);
      border-radius: 999px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      color: var(--lobe-ink);
      font: 600 12px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      letter-spacing: 0.02em;
      cursor: default; user-select: none;
      opacity: 0.9;
    }
    .ose-lobe-corner:hover { opacity: 1; }
    .ose-lobe-corner .ose-lobe-stamp { width: 17px; height: 17px; }
    .ose-lobe-corner-count {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 16px; height: 16px; padding: 0 4px; box-sizing: border-box;
      background: var(--lobe-gold); color: #fff;
      border-radius: 999px; font-size: 11px; font-weight: 700;
    }

    /* "Mark LOBE changes on page" master switch (the popup's Settings). When the user
       turns it OFF the runner adds .ose-marks-off to <html>, and LOBE does as LITTLE as
       possible: it removes the decoration it added ITSELF — the bees, the corner badge,
       any .ose-lobe-mark, and the .ose-lobe-field accent bar. It deliberately does NOT
       remap the palette to any default (no forced neutral, no forced transparent): the
       page keeps whatever it natively had. Each enhancement stops applying its OWN LOBE
       colours by gating its colour rules behind :root:not(.ose-marks-off) while
       keeping its functional size/layout (an enhancement may still opt to style its
       own off-state — that's its choice, not an automatic default). */
    :root.ose-marks-off .ose-lobe-stamp,
    :root.ose-marks-off .ose-lobe-mark,
    :root.ose-marks-off .ose-lobe-corner { display: none !important; }
    :root.ose-marks-off .ose-lobe-field { box-shadow: none !important; }

    /* Dark theme — the stamp follows the browser's light/dark preference the same way
       the popup does (@media prefers-color-scheme, mirroring popup.css): swap the LOBE
       palette to its dark variants. Placed last so these win by source order. */
    @media (prefers-color-scheme: dark) {
      :root {
        --lobe-honey: ${palette.dark.honey};
        --lobe-honey-hover: ${palette.dark.honeyHover};
        --lobe-gold: ${palette.dark.gold};
        --lobe-ink: ${palette.dark.ink};
      }
      /* White reads on the medium gold in light; on the brighter dark-gold it doesn't,
         so the corner-badge count uses dark text in dark mode. */
      .ose-lobe-corner-count { color: #211e19; }
    }
  `;

  // Mint the LOBE bee mascot <img> (assets/lobe.svg is web-accessible). Callers insert
  // it and, in JS enhancements, register their own cleanup to remove it.
  function bee(doc) {
    const d = doc || document;
    const img = d.createElement("img");
    img.className = "ose-lobe-stamp";
    img.alt = "LOBE";
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      img.src = chrome.runtime.getURL("assets/lobe.svg");
    }
    return img;
  }

  return { palette, baseCss, bee };
})();

// Build the context object passed to apply(ctx). Every DOM change routed through
// it records how to undo itself via `pushCleanup(fn)`, so the runner can revert a
// JS enhancement live when it's switched off — no page reload. Changes you make
// directly (not via ctx) won't be reverted, and fall back to the reload prompt.
OSEnhance.makeCtx = function (pushCleanup) {
  return {
    // Register an arbitrary teardown callback (the escape hatch).
    onCleanup(fn) {
      if (typeof fn === "function") pushCleanup(fn);
    },

    // Create an element. Creation alone needs no cleanup; inserting it does.
    // props: { class, text, html, style:{prop:val}, "any-attr": val }
    createElement(tag, props) {
      const el = document.createElement(tag);
      if (props) {
        for (const key in props) {
          const val = props[key];
          if (key === "class" || key === "className") el.className = val;
          else if (key === "text") el.textContent = val;
          else if (key === "html") el.innerHTML = val;
          else if (key === "style" && val && typeof val === "object") {
            for (const p in val) el.style.setProperty(p, val[p]);
          } else el.setAttribute(key, val);
        }
      }
      return el;
    },

    // Insert `el` right after `ref`; removed on cleanup.
    insertAfter(ref, el) {
      ref.insertAdjacentElement("afterend", el);
      pushCleanup(() => el.remove());
      return el;
    },

    // Append `el` to `parent`; removed on cleanup.
    append(parent, el) {
      parent.appendChild(el);
      pushCleanup(() => el.remove());
      return el;
    },

    // Add an event listener; removed on cleanup. (Removing an inserted node also
    // drops its listeners, so this mainly matters for listeners on existing nodes.)
    on(el, type, handler, opts) {
      el.addEventListener(type, handler, opts);
      pushCleanup(() => el.removeEventListener(type, handler, opts));
      return el;
    },

    // Set an inline style property, restoring the previous value on cleanup.
    setStyle(el, prop, value, priority) {
      const prevValue = el.style.getPropertyValue(prop);
      const prevPriority = el.style.getPropertyPriority(prop);
      el.style.setProperty(prop, value, priority || "");
      pushCleanup(() => {
        if (prevValue) el.style.setProperty(prop, prevValue, prevPriority);
        else el.style.removeProperty(prop);
      });
      return el;
    },

    // Set an attribute, restoring the previous value (or removing it) on cleanup.
    setAttr(el, name, value) {
      const had = el.hasAttribute(name);
      const prev = el.getAttribute(name);
      el.setAttribute(name, value);
      pushCleanup(() => {
        if (had) el.setAttribute(name, prev);
        else el.removeAttribute(name);
      });
      return el;
    },

    // Add a class (if missing), removing it again on cleanup.
    addClass(el, cls) {
      if (!el.classList.contains(cls)) {
        el.classList.add(cls);
        pushCleanup(() => el.classList.remove(cls));
      }
      return el;
    }
  };
};
