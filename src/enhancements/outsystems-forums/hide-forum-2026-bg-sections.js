// Enhancement: Hide the marketing/campaign banners on the OutSystems forums.
//
// A campaign is re-skinned and RENAMED every promotion (e.g. "one-2026-bg", then
// "Dev-Day-India-2026-bg", …), so matching by class is fragile — it breaks on each new
// campaign. Instead we target the banners by POSITION, anchored on landmarks a campaign
// never touches. There are two:
//
// 1. TOP banner — the forums header block holds, in order: an optional campaign banner,
//    the "Forums" heading (a .heading1), then the stats / search / filters. We hide the
//    header's first child, but only when it sits BEFORE the heading (i.e. it's a banner);
//    if the heading is itself the first child (no banner that day), nothing is hidden.
//    The header container's id ends with "wtHeader" (stable page structure), and we use
//    the shared .heading1 UI class.
//
// 2. VERTICAL banner — the same promo shown vertically. It appears in the left menu on
//    the forums list, and inside a card whose id ends "wtAiBannerCard" on a discussion.
//    Both wrap a stable .vertical-main-container-event (only the campaign SKIN nested
//    inside, "vertical-<campaign>-bg", is renamed). We find that container and hide its
//    outer card/slot; keying off the event container means no real UI is hidden when no
//    campaign is running.
//
// apply() adds a class the css hides, routed through ctx so it reverts live; idempotent.

OSEnhance.register({
  // id kept as-is (opt-ins are stored by id); the display name is "Hide forum banner".
  id: "hide-forum-2026-bg-sections",
  title: "Hide forum banner",
  description:
    "Hides the forum marketing/campaign banners (the top banner and the vertical one " +
    "in the left menu) for a cleaner, less cluttered page.",

  // The OutSystems community forums — list and discussion pages (the banner is on both).
  match: /outsystems\.com\/forums/i,

  css: `
    .ose-hide-forum-banner { display: none !important; }
  `,

  apply(ctx) {
    // 1. Top banner: the header's first child, when it precedes the "Forums" heading.
    for (const header of document.querySelectorAll('[id$="wtHeader"]')) {
      const heading = header.querySelector(":scope > .heading1");
      const first = header.firstElementChild;
      // Hide the first child only when it precedes the heading (i.e. it's a banner);
      // if the heading is the first child there's no banner, so leave it alone.
      if (heading && first && first !== heading) {
        ctx.addClass(first, "ose-hide-forum-banner");
      }
    }

    // 2. Vertical banner (left menu on the list, and the "wtAiBannerCard" card on a
    // discussion): find the stable event container and hide its outer card/slot, so no
    // empty gap is left behind.
    for (const evt of document.querySelectorAll(".vertical-main-container-event")) {
      const slot =
        evt.closest('[id$="wtAiBannerCard"]') ||  // discussion: the banner card
        evt.closest(".menu-left-wrapper > *") ||   // list: the left-menu slot
        evt;                                        // fallback: the container itself
      ctx.addClass(slot, "ose-hide-forum-banner");
    }
  }
});
