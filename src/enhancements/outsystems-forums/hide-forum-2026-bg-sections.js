// Enhancement: Hide two background/marketing sections on the OutSystems forums.
//
// The forums home (www.outsystems.com/forums) shows two full-width sections with
// classes "one-2026-vertical-bg" and "one-2026-bg". This hides them so the forum
// content is less cluttered. CSS-based, so it toggles off cleanly (no reload).

OSEnhance.register({
  id: "hide-forum-2026-bg-sections",
  title: "Hide forum background sections",
  description:
    "Hides the one-2026 forum banners for a cleaner, less cluttered page.",

  // The OutSystems community forums.
  match: /outsystems\.com\/forums/i,

  css: `
    .one-2026-vertical-bg,
    .one-2026-bg {
      display: none !important;
    }
  `
});
