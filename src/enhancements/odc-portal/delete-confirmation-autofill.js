// Enhancement: Autofill the "type the name to confirm" field when deleting an app.
//
// On the ODC Portal, deleting an app or library opens a "Delete <Name>?" dialog
// with a text field you must fill with that exact name before the Delete button
// enables — a guardrail that's a small chore when you already meant to delete. This
// types the name in for you so the button enables. It deliberately does NOT click
// Delete: you still press the confirmation button yourself, so the safety step stays.
//
// The ODC Portal is a React-style app: it overrides the input's value setter, so a
// plain `input.value = …` doesn't register. We call the native prototype setter and
// dispatch the input/change events the framework listens for, or the Delete button
// stays disabled. The name is read from the dialog itself (the bold span in "Enter
// <b>Name</b> to confirm", else the "Delete <Name>?" title, else the input's value
// attribute), so nothing is hardcoded.
//
// The dialog appears asynchronously; LOBE's runner re-invokes apply() on DOM
// mutations, so it's caught as soon as it opens — no observer of our own. apply() is
// idempotent (a marker attribute set through ctx, so it clears on revert) and only
// fills once, so it never fights the user if they retype. The field also gets the
// shared LOBE accent (.ose-lobe-field) so it's clear LOBE filled it; both the marker
// and the accent are ctx-routed, so switching the enhancement off reverts live.

(function () {
  const INPUT_SEL = 'input[data-test-id="delete-popup-name-input"]';
  const FILLED_ATTR = "data-ose-delete-autofill";

  // Read the name the dialog wants typed, from the most reliable source down.
  function findName(input) {
    // 1) The bold name in "Enter <b>Name</b> to confirm".
    const block = input.closest(
      '[data-test-id="delete-popup-noissuefound-delete-confirmation"]'
    );
    const bold = block && block.querySelector(".font-bold");
    if (bold && bold.textContent.trim()) return bold.textContent.trim();

    // 2) The dialog title "Delete <Name>?".
    const dialog = input.closest('[data-test-id="popup-wrapper"]') || document;
    const title = dialog.querySelector('[data-test-id="delete-popup-noissuefound-title"]');
    const m = title && title.textContent.trim().match(/^Delete\s+(.+?)\??$/i);
    if (m && m[1]) return m[1].trim();

    // 3) Fallback: the value attribute rendered onto the input.
    const attr = input.getAttribute("value");
    return attr && attr.trim() ? attr.trim() : null;
  }

  // Set the value via the native setter, then fire the events the framework needs,
  // so it sees the change and enables the Delete button.
  function setFrameworkValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && typeof desc.set === "function") desc.set.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  OSEnhance.register({
    id: "delete-confirmation-autofill",
    title: "Autofill the delete confirmation name",
    description:
      "When you delete an app or library, types its name into the \"type the name " +
      "to confirm\" field so the Delete button enables. It never clicks Delete — you " +
      "still confirm the deletion yourself.",

    // The ODC Portal application/library DETAIL pages (…outsystems.dev/apps/application…
    // or …/apps/library…), where the delete dialog appears — not the /apps/ list page.
    // `\b` after each keyword keeps it off a hypothetical /apps/applications list.
    match: /\.outsystems\.dev\/apps\/(?:application|library)\b/i,

    // ctx-routed so the runner reverts live when switched off: the accent class drops
    // and the marker attribute is removed (the typed value is left as-is — it's a
    // transient dialog you opened yourself).
    apply(ctx) {
      for (const input of document.querySelectorAll(INPUT_SEL)) {
        ctx.addClass(input, "ose-lobe-field"); // shared LOBE accent; removed on revert
        if (input.getAttribute(FILLED_ATTR) === "1") continue; // fill once, then leave alone
        const name = findName(input);
        if (!name) continue; // dialog text not ready yet — retry on the next mutation
        input.focus();
        setFrameworkValue(input, name);
        ctx.setAttr(input, FILLED_ATTR, "1"); // marker (restored/removed on revert)
      }
    }
  });
})();
