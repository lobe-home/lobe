// Enhancement: Hide NEO AI contributions that haven't been made public.
//
// On a forum discussion each post can carry a "NEO, your AI Assistant" contribution
// (an AI-drafted answer). Some are published to the community; others are still
// moderator-only drafts — shown to moderators with a footer that reads
// "This is only visible to forum moderators." A moderator who just wants to read the
// published thread doesn't want those drafts in the way.
//
// Each contribution is wrapped in <span id="…wtAISolution_Wrapper"> (the leading wt*
// id segments are auto-generated, so we match the stable tail). There can be several
// per page (one per post), so we match them all and hide only the moderator-only ones.
// CSS can't test text, so apply() checks each wrapper for the moderator-only phrase and
// adds a class the css hides. It's re-evaluated on every render (a moderator can publish
// one, at which point the phrase is gone and it reappears), routed through ctx so it
// reverts live, and idempotent.

(function () {
  const WRAP_SEL = 'span[id$="wtAISolution_Wrapper"]';
  // The distinctive phrase shown only on a not-yet-public (moderator-only) contribution.
  const MOD_ONLY_RE = /only visible to forum moderators/i;

  OSEnhance.register({
    id: "hide-nonpublic-neo-contributions",
    title: "Hide non-public Neo contributions",
    description:
      "On a forum discussion, hides each NEO AI contribution that isn't public yet " +
      "(the ones marked \"only visible to forum moderators\"), so moderators aren't " +
      "shown drafts alongside the published answers.",

    // Forum discussion detail pages only (…/forums/discussion/<id>/…).
    match: /outsystems\.com\/forums\/discussion\//i,

    css: `
      .ose-neo-mod-only { display: none !important; }
    `,

    // Re-evaluated each render: add the hiding class to moderator-only contributions,
    // and drop it again from any that have since been made public (so it reappears).
    apply(ctx) {
      for (const wrapper of document.querySelectorAll(WRAP_SEL)) {
        if (MOD_ONLY_RE.test(wrapper.textContent || "")) {
          ctx.addClass(wrapper, "ose-neo-mod-only"); // idempotent; removed on revert
        } else {
          wrapper.classList.remove("ose-neo-mod-only");
        }
      }
    }
  });
})();
