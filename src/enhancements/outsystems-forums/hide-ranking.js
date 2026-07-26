// Enhancement: Hide the ranking / gamification section on the OutSystems forums.
//
// The forums show a "gamefication-section" block (points/ranking). This hides it
// for a cleaner, less distracting page. CSS-based, so it toggles off cleanly (no
// reload). Class spelling matches the page as-is ("gamefication").

OSEnhance.register({
  id: "hide-ranking",
  title: "Hide forum ranking section",
  description:
    "Hides the ranking / gamification section on the OutSystems forums.",

  // The OutSystems community forums.
  match: /outsystems\.com\/forums/i,

  css: `
    .gamefication-section {
      display: none !important;
    }
  `
});
