// categories.js — the canonical set of enhancement categories, in display order.
// Loaded right after registry.js and before the enhancement files.
//
// To add a category:
//   1. Add an entry here (id is kebab-case, label is what the popup shows).
//   2. Create the matching subfolder src/enhancements/<id>/.
//   3. Give enhancements in it `category: "<id>"`.  (folder-derived, see registry.js)
//
// Optional `match` — a hint for which tab the popup opens on. It uses the same matcher
// types as an enhancement (RegExp | string | fn | array; see OSEnhance.urlMatches).
// When NO enhancement applies to the current page, the popup opens the first category
// whose `match` covers the URL — so a developer sitting anywhere in Service Center
// lands on that category even on a page LOBE doesn't specifically patch. (An enhancement
// that IS live on the page still wins over these hints.)
// Note: a plain string is a case-sensitive substring test — use a RegExp for
// case-insensitive path matches like "/servicecenter/" vs "/ServiceCenter/".

window.OSEnhance = window.OSEnhance || {};

OSEnhance.categories = [
  { id: "o11-service-center", label: "O11 Service Center", match: [/\/servicecenter\//i] },
  { id: "o11-lifetime",       label: "O11 LifeTime" },
  { id: "o11-applications",   label: "O11 Applications" },
  { id: "odc-applications",   label: "ODC Applications" },
  { id: "odc-portal",         label: "ODC Portal" },
  { id: "outsystems-forums",  label: "OutSystems Forums" }
];
