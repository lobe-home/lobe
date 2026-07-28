// Enhancement: Hide two background/marketing sections on the OutSystems forums.
//
// The forums home (www.outsystems.com/forums) shows two full-width sections with
// classes "one-2026-vertical-bg" and "one-2026-bg". This hides them so the forum
// content is less cluttered. CSS-based, so it toggles off cleanly (no reload).

OSEnhance.register({
  // id kept as-is; only the display name (title) changed — it's what the popup and the
  // corner badge show.
  id: "hide-forum-2026-bg-sections",
  title: "Hide forum banner",
  description:
    "Hides the forum marketing banner for a cleaner, less cluttered page.",

  // The OutSystems community forums.
  match: /outsystems\.com\/forums/i,

  css: `
    .one-2026-vertical-bg,
    .one-2026-bg {
      display: none !important;
    }
  `
});
