<p align="center">
  <img src="assets/lobe.svg" alt="LOBE — a glum little bee" width="120" />
</p>

# Contributing to LOBE

The technical guide to how the extension is put together and how to add an
enhancement. (For what LOBE is and how to use it, see the [README](README.md).)

> **Current policy:** pull requests are limited to collaborators for now — the
> project is early and isn't set up to review outside code yet. If you have an idea
> or a fix, please open a [Discussion](../../discussions) first; that's genuinely
> the most useful way to contribute right now.

## How it works

`registry.js`, `categories.js` and the enhancement files load in **two** places:
as content scripts on matching pages (with `runner.js`), and inside the popup (so
it has the full list). `runner.js` is content-script-only.

| File | Role |
|------|------|
| `src/registry.js`                  | Defines `OSEnhance.register(...)`, `OSEnhance.urlMatches(...)`, `OSEnhance.makeCtx(...)`, `OSEnhance.stamp` (the shared LOBE branding toolkit — see "LOBE styling"), and a couple of optional helpers. Loads first. |
| `src/categories.js`                | The canonical, ordered list of categories. Loads second. |
| `src/enhancements/<category>/*.js` | Enhancement files, in the subfolder for their category. A file calls `OSEnhance.register({...})` once per enhancement — usually one, but a file may register several related ones (see below). |
| `src/runner.js`                    | **Content script only.** Picks the enhancements matching the current URL that the user has switched on (everything is off by default), injects their CSS and/or runs their `apply(ctx)`, re-syncs (debounced) whenever OutSystems re-renders the page, and reverts live when toggled off. Also injects the shared LOBE stamp stylesheet, shows the global corner badge, and applies the "Mark LOBE changes" setting (see "LOBE styling"). |
| `popup/`                           | Toolbar popup UI, one tab per category. `bootstrap.js` reads the script list from the manifest and injects the registry + enhancements (minus `runner.js`), then `popup.js` reads them directly (no messaging). |
| `src/background.js`                | Service worker for the **per-domain opt-in**: registers content scripts for user-granted domains and re-asserts them on install/startup (see "Coverage / matched hosts"). |

The popup reads the enhancement registry directly (it loads the same registry and
enhancement files) and works out "on this page" from the active tab's URL. It does
**not** talk to the page's content script, so it always shows the full list.
Toggling simply writes `chrome.storage.sync`; the content script on each matching
page observes that and applies/reverts live.

Enabling an enhancement always applies immediately. Disabling one reverts
immediately too, as long as the framework knows how to undo it:

- **CSS** enhancements always revert live (the injected `<style>` is removed).
- **JavaScript** enhancements revert live when they make their changes through the
  `ctx` passed to `apply(ctx)` (or define a `revert()`), which is the recommended
  style — see below.
- A JavaScript enhancement that edits the DOM directly and declares
  `revertsLive: false` can't be auto-undone, so the popup shows a **Reload page**
  button when you turn it off (only when it's active on the current page).

## The enhancement contract

Each enhancement declares what it changes:

- **`css`** : a string (or `url => string`) injected as a `<style>` tag while the
  enhancement is active, and removed when it's turned off. A rule with `!important`
  overrides the platform's own inline styles. Prefer this whenever styling can do
  the job — it's declarative and cleanly reversible.
- **`apply(ctx)`** : JavaScript run on load and on every DOM mutation, for changes
  that CSS can't express. It must be **idempotent**. Make changes through `ctx`
  (below) so they revert live when the enhancement is switched off.
- **`revert()`** : optional. An explicit undo for `apply()`, if you'd rather not
  use `ctx`. Providing either `ctx` cleanups or `revert()` makes the enhancement
  toggle off without a page reload.
- **`revertsLive: false`** : optional. Set this only if your `apply()` changes the
  DOM without `ctx`/`revert` and genuinely needs a page reload to undo. It makes
  the popup show the **Reload page** prompt on disable. Defaults to `true`.

An enhancement can use either `css` or `apply` (or both); at least one is required.

### One file, one or several enhancements

A file usually registers a single enhancement, but it can call `register()` more
than once — handy for grouping tightly-related tweaks (and it keeps the manifest
list shorter, since a file is one line there regardless of how many enhancements it
holds).

Two rules:

- **They share the file's category** (the folder), since category is read from the
  file's path. So only group enhancements that belong in the same category.
- **Register synchronously at load** (top-level or in an IIFE) — the normal pattern.
  Don't defer a `register()` into a `setTimeout`/promise, or it can't tell which
  folder (category) it came from.

Each still needs its own unique `id`, and each shows up as its own toggle in the popup.

## Categories

Enhancements are grouped into categories, defined once in `src/categories.js`
(id + display label, in the order the popup shows them):

| id | label |
|----|-------|
| `o11-service-center` | O11 Service Center |
| `o11-lifetime`       | O11 LifeTime |
| `o11-applications`   | O11 Applications |
| `odc-applications`   | ODC Applications |
| `odc-portal`         | ODC Portal |
| `outsystems-forums`  | OutSystems Forums |

Each category has a matching subfolder under `src/enhancements/`, and an
enhancement's category is simply the folder it lives in — read from the file's own
path, so there's no `category` property to keep in sync. The popup renders one tab
per category.

A category entry may also carry an optional **`match`** — a hint (same matcher types
as an enhancement: `RegExp | string | fn | array`, see `OSEnhance.urlMatches`) for
which tab the popup opens on. When no enhancement applies to the current page, the
popup opens the first category whose `match` covers the URL — so a developer anywhere
in Service Center lands on that category even on a page LOBE doesn't specifically
patch. An enhancement that *is* live on the page still wins over these hints. (Use a
`RegExp` for case-insensitive path matches, e.g. `[/\/servicecenter\//i]`.)

To add a category: add an entry to `src/categories.js` and create the matching
`src/enhancements/<id>/` subfolder.

## Add a new enhancement

1. Create `src/enhancements/<category>/your-enhancement-name.js` in the subfolder
   for its category. (Or add another `register()` call to an existing file to group
   it with related enhancements — see "One file, one or several enhancements" above.)

   A **CSS** enhancement (preferred when styling can do it):

   ```js
   OSEnhance.register({
     id: "your-enhancement-name",       // unique, kebab-case
     title: "Short human name",
     description: "What it does and why.",
     match: /\/servicecenter\/SomePage\.aspx/i,  // RegExp | string | fn(url) | array
     css: `
       form input { width: 800px !important; }
     `
   });
   ```

   A **JavaScript** enhancement (when you need to touch the DOM). Make changes
   through `ctx` so they're undone automatically when the enhancement is switched
   off:

   ```js
   OSEnhance.register({
     id: "your-enhancement-name",
     title: "Short human name",
     description: "What it does and why.",
     match: /\/servicecenter\/SomePage\.aspx/i,
     apply(ctx) {
       // MUST be idempotent, it runs on load AND on every DOM mutation.
       OSEnhance.util.each("form .some-toolbar", (bar) => {
         if (bar.querySelector(".my-btn")) return;          // already added?
         const btn = ctx.createElement("button", { class: "my-btn", text: "Hi" });
         ctx.on(btn, "click", () => alert("hi"));            // listener auto-removed
         ctx.append(bar, btn);                              // node auto-removed
       });
     }
   });
   ```

2. Add the file to `manifest.json` → `content_scripts[0].js`, **between**
   `categories.js` and `runner.js`. That's the only list to maintain: the popup
   reads the same list from the manifest (via `bootstrap.js`), so there's nothing
   to update there.

   If the enhancement targets a host not already covered, also add that host to
   `content_scripts[0].matches` in `manifest.json`.

3. Reload the extension at `chrome://extensions`.

### The `ctx` passed to `apply(ctx)`

Route DOM changes through `ctx` and the framework undoes them when the enhancement
is switched off (each records its own teardown):

- `ctx.createElement(tag, props)` — `props` may include `class`, `text`, `html`,
  `style: { prop: val }`, and any other attribute. (Creation needs no cleanup.)
- `ctx.insertAfter(ref, el)` / `ctx.append(parent, el)` — insert `el`; removed on teardown.
- `ctx.on(el, type, handler, opts?)` — add a listener; removed on teardown.
- `ctx.setStyle(el, prop, value, priority?)` — set inline style; prior value restored.
- `ctx.setAttr(el, name, value)` — set an attribute; prior value restored.
- `ctx.addClass(el, cls)` — add a class; removed on teardown.
- `ctx.onCleanup(fn)` — register any custom teardown (the escape hatch).

### Other helpers

Optional conveniences for use inside `apply()`:

- `OSEnhance.util.setImportant(el, prop, value)` — set a CSS property `!important`,
  only writing when it isn't already that value (cheap + idempotent).
- `OSEnhance.util.each(selector, fn, root?)` — iterate matching elements.

### LOBE styling (the "stamp")

LOBE marks its changes with a consistent honey-and-gold look plus its bee mascot, so
it's clear at a glance which tweaks on a page are LOBE's. That styling is centralised
in **`OSEnhance.stamp`** (in `registry.js`) — reach for it instead of hardcoding
colours, and your enhancement will match the rest and respect the user's toggle (below).

- **`stamp.baseCss`** — a stylesheet the runner injects once while any enhancement is
  active. It declares the palette as CSS variables (`--lobe-honey`,
  `--lobe-honey-hover`, `--lobe-gold`, `--lobe-ink`), so your `css` can just use
  `var(--lobe-gold)` etc. The palette is **theme-aware**: it swaps to LOBE's dark
  variants under `@media (prefers-color-scheme: dark)`, the same way the popup themes
  itself — so as long as you drive colour through the variables, your stamp follows
  light/dark automatically. It also provides a few reusable classes:
  - `.ose-lobe-field` — the shared input accent (a thin gold left bar). Put it on any
    field you touch — `ctx.addClass(input, "ose-lobe-field")` — so every affected
    field looks the same.
  - `.ose-lobe-stamp` — inline sizing for the bee mascot (see `stamp.bee()`).
  - `.ose-lobe-mark` — tag *purely decorative* elements you add with this, so they
    hide when the user turns marking off.
- **`stamp.bee(doc?)`** — mints the bee mascot `<img>` (the web-accessible
  `assets/lobe.svg`). Insert it and register cleanup, e.g.
  `const bee = OSEnhance.stamp.bee(); node.prepend(bee); ctx.onCleanup(() => bee.remove());`
- **The corner badge** — the runner shows a global "LOBE is active here" badge on any
  page where something's on; you don't need to do anything for it.

**The "Mark LOBE changes on page" toggle.** The popup's Settings overlay has one
switch (default on, stored in `chrome.storage.sync` under `markChanges`). When it's
off, the runner adds `.ose-marks-off` to `<html>` and LOBE does as *little* as
possible: it hides the decoration it added itself (bees, corner badge, `.ose-lobe-mark`
elements, the `.ose-lobe-field` bar) and otherwise **imposes nothing** — no forced
neutral, no forced transparent. The page keeps whatever it natively had.

So when you add colour, **gate it so it only applies while marking is on** — put the
colour rules under `:root:not(.ose-marks-off) <your-selector>` and keep the enhancement's
*functional* size/layout ungated:

```css
/* Functional — always: size the label to fit the text, no colours. */
.my-widget { min-width: 340px; padding: 6px 30px; font-size: 16px; }
/* LOBE stamp — only while marking is on: the colours. */
:root:not(.ose-marks-off) .my-widget {
  background: var(--lobe-honey); color: var(--lobe-ink); border: 1px solid var(--lobe-gold);
}
```

For an element that already exists on the page, that means with marks off it keeps its
own native colours (correct in the page's light/dark theme). For an element LOBE itself
injects (which has no native styling), give it a plain base look and layer the LOBE
colours on top with the same gate — that base is your enhancement's own choice, not a
global default. Either way: **drive colour through the `--lobe-*` variables, never
hardcode it, keep size/layout separate, and gate the colour.**

### Guidelines for shareable enhancements

- Put the file in the right category subfolder — that folder *is* its category
  (there's no `category` property to set).
- Use **`OSEnhance.stamp`** for any LOBE styling (colours, the bee, field accents)
  rather than hardcoding — it stays consistent and respects the "Mark LOBE changes"
  toggle (see "LOBE styling").
- Prefer `css` over `apply()` when styling can do the job, it's reversible and
  toggles off without a reload.
- In `apply()`, make DOM changes through `ctx` (or provide `revert()`) so the
  enhancement also toggles off live.
- Keep `apply()` **idempotent**: check before you write; never append/duplicate nodes blindly.
- Scope `match` as narrowly as makes sense so enhancements don't fire on unrelated pages.
- Prefer overriding style/layout over changing behavior or data.
- Write a clear `description`, it's how other people decide to trust the enhancement.

## Coverage / matched hosts

`manifest.json`'s `content_scripts[0].matches` lists the **built-in** hosts LOBE
runs on automatically: `*.outsystemscloud.com`, `*.outsystemsenterprise.com`, and
`www.outsystems.com/forums`. Edit that list only to change the defaults shipped to
everyone.

End users don't edit the manifest. For a **self-hosted / custom OutSystems domain**
they enable LOBE from the popup ("Run LOBE on this site"). That uses
`optional_host_permissions` + a Chrome per-site permission prompt; `background.js`
then registers a content script for that domain (the same script list, read from the
manifest) and re-asserts it on update/startup. The granted-domain list lives in
`chrome.storage.local` — host permissions are per-device, so it isn't synced.
