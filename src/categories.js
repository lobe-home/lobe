// categories.js — the canonical set of enhancement categories, in display order.
// Loaded right after registry.js and before the enhancement files.
//
// To add a category:
//   1. Add an entry here (id is kebab-case, label is what the popup shows).
//   2. Create the matching subfolder src/enhancements/<id>/.
//   3. Give enhancements in it `category: "<id>"`.

window.OSEnhance = window.OSEnhance || {};

OSEnhance.categories = [
  { id: "o11-service-center", label: "O11 Service Center" },
  { id: "o11-lifetime",       label: "O11 LifeTime" },
  { id: "o11-applications",   label: "O11 Applications" },
  { id: "odc-applications",   label: "ODC Applications" },
  { id: "odc-portal",         label: "ODC Portal" },
  { id: "outsystems-forums",  label: "OutSystems Forums" }
];
