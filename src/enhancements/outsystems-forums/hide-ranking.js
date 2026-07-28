// Enhancement: Hide the ranking / gamification section on the OutSystems forums.
//
// The forums LIST (home + pagination) shows a "gamefication-section" block
// (points/ranking). This hides it for a cleaner, less distracting page. It does NOT
// appear on discussion detail pages, so we don't match those. CSS-based, so it toggles
// off cleanly (no reload). Class spelling matches the page as-is ("gamefication").

OSEnhance.register({
  id: "hide-ranking",
  title: "Hide forum ranking section",
  description:
    "Hides the ranking / gamification section on the OutSystems forums list.",

  // The forums LIST only — /forums/ or /forums/?page=N (and the no-slash /forums).
  // The (?:\?|#|$) requires end-of-path, a query, or a hash right after /forums/, so
  // deeper paths like /forums/discussion/<id>/… (a single discussion) don't match —
  // the ranking section isn't there.
  match: /outsystems\.com\/forums\/?(?:\?|#|$)/i,

  css: `
    .gamefication-section {
      display: none !important;
    }
  `
});
