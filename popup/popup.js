// popup.js — groups registered enhancements into category tabs and lets the user
// toggle each on/off.
//
// The popup reads the enhancement registry DIRECTLY (popup.html loads registry.js,
// categories.js and every enhancement file), so it always shows the full list on
// any page — it never messages a content script. It figures out which
// enhancements are "on this page" from the active tab's URL, and toggling just
// writes chrome.storage.sync, which the page's content script observes and acts on.

const STORAGE_KEY = "enabledEnhancements";

const els = {
  subtitle: document.getElementById("subtitle"),
  tabs: document.getElementById("tabs"),
  categoryHeader: document.getElementById("categoryHeader"),
  panel: document.getElementById("panel"),
  empty: document.getElementById("empty"),
  reloadBar: document.getElementById("reloadBar"),
  reloadBtn: document.getElementById("reloadBtn"),
  bulk: document.getElementById("bulk"),
  enableAll: document.getElementById("enableAll"),
  disableAll: document.getElementById("disableAll")
};

let activeTab = null;
let byCategory = new Map(); // category id -> enhancements[]
let categoryLabels = new Map(); // category id -> display label
let selectedCategory = null;
let allEnhancements = []; // every enhancement (used by the bulk enable/disable)

function showEmpty(message) {
  els.subtitle.textContent = "";
  els.tabs.hidden = true;
  els.categoryHeader.hidden = true;
  els.panel.innerHTML = "";
  els.empty.hidden = false;
  els.empty.textContent = message;
}

async function setEnabled(id, enabled, needsReload, matches) {
  // Storage holds the ENABLED ids (opt-in): everything is off until switched on.
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: [] });
  const on = new Set(stored[STORAGE_KEY] || []);
  if (enabled) on.add(id);
  else on.delete(id);
  await chrome.storage.sync.set({ [STORAGE_KEY]: [...on] });
  // Almost everything reverts live. Only prompt for a reload when turning off an
  // enhancement that IS active on this page and is flagged as not live-revertable.
  if (!enabled && needsReload && matches) els.reloadBar.hidden = false;
}

// Enable or disable every enhancement at once (the header's Enable all / Disable all).
async function setAll(enable) {
  const ids = allEnhancements.map((e) => e.id);
  await chrome.storage.sync.set({ [STORAGE_KEY]: enable ? ids : [] });
  for (const e of allEnhancements) e.enabled = enable;
  // Enabling always applies live; disabling only needs a reload for a non-live
  // enhancement that's active on this page.
  els.reloadBar.hidden =
    enable || !allEnhancements.some((e) => e.needsReload && e.matches);
  renderPanel(selectedCategory);
}

// Enable or disable every enhancement in one category (the panel's per-category
// Enable all / Disable all). Merges with the stored set so other categories keep
// their state.
async function setCategoryAll(categoryId, enable) {
  const list = byCategory.get(categoryId) || [];
  if (!list.length) return;
  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: [] });
  const on = new Set(stored[STORAGE_KEY] || []);
  for (const e of list) {
    if (enable) on.add(e.id);
    else on.delete(e.id);
    e.enabled = enable;
  }
  await chrome.storage.sync.set({ [STORAGE_KEY]: [...on] });
  els.reloadBar.hidden = enable || !list.some((e) => e.needsReload && e.matches);
  renderPanel(categoryId);
}

function makeRow(enh) {
  const li = document.createElement("li");
  if (!enh.matches) li.classList.add("inactive");

  const info = document.createElement("div");
  info.className = "info";

  const titleRow = document.createElement("div");
  titleRow.className = "title-row";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = enh.title;
  titleRow.appendChild(name);

  // A green dot marks an enhancement that applies to the current page. Rows that
  // don't apply are simply dimmed (see the `inactive` class) — no text badge.
  if (enh.matches) {
    const dot = document.createElement("span");
    dot.className = "row-dot";
    dot.title = "On this page";
    titleRow.appendChild(dot);
  }
  info.appendChild(titleRow);

  if (enh.description) {
    const desc = document.createElement("p");
    desc.className = "desc";
    desc.textContent = enh.description;
    info.appendChild(desc);
  }

  const label = document.createElement("label");
  label.className = "switch";
  label.title = enh.enabled ? "Enabled" : "Disabled";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = enh.enabled;
  input.addEventListener("change", () => {
    label.title = input.checked ? "Enabled" : "Disabled";
    setEnabled(enh.id, input.checked, enh.needsReload, enh.matches);
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  label.appendChild(input);
  label.appendChild(slider);

  li.appendChild(info);
  li.appendChild(label);
  return li;
}

// The category header row: always shows the category name; the Enable all /
// Disable all controls only appear when there are 2+ enhancements to act on.
function makeCategoryHeader(categoryId, withControls) {
  const bulk = document.createElement("div");
  bulk.className = "panel-bulk";

  const label = document.createElement("span");
  label.className = "panel-bulk-label";
  label.textContent = categoryLabels.get(categoryId) || categoryId;
  bulk.appendChild(label);

  if (withControls) {
    const enBtn = document.createElement("button");
    enBtn.type = "button";
    enBtn.className = "link-btn";
    enBtn.textContent = "Enable all";
    enBtn.addEventListener("click", () => setCategoryAll(categoryId, true));

    const sep = document.createElement("span");
    sep.className = "sep";
    sep.textContent = "·";

    const disBtn = document.createElement("button");
    disBtn.type = "button";
    disBtn.className = "link-btn";
    disBtn.textContent = "Disable all";
    disBtn.addEventListener("click", () => setCategoryAll(categoryId, false));

    bulk.append(enBtn, sep, disBtn);
  }
  return bulk;
}

function renderPanel(categoryId) {
  const list = byCategory.get(categoryId) || [];

  // Category header (name + optional Enable/Disable all) lives OUTSIDE the panel,
  // so it stays pinned while the list scrolls.
  els.categoryHeader.innerHTML = "";
  els.categoryHeader.appendChild(makeCategoryHeader(categoryId, list.length > 1));
  els.categoryHeader.hidden = false;

  els.panel.innerHTML = "";
  if (!list.length) {
    const p = document.createElement("p");
    p.className = "category-empty";
    p.textContent = "No enhancements in this category yet.";
    els.panel.appendChild(p);
    return;
  }

  // Active-on-this-page first within the category.
  const sorted = [...list].sort((a, b) => Number(b.matches) - Number(a.matches));
  const ul = document.createElement("ul");
  for (const enh of sorted) ul.appendChild(makeRow(enh));
  els.panel.appendChild(ul);
}

function selectCategory(categoryId) {
  selectedCategory = categoryId;
  for (const btn of els.tabs.children) {
    btn.classList.toggle("selected", btn.dataset.category === categoryId);
  }
  renderPanel(categoryId);
}

function renderTabs(categories) {
  els.tabs.innerHTML = "";
  for (const cat of categories) {
    const list = byCategory.get(cat.id) || [];
    const onPage = list.filter((e) => e.matches).length;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tab";
    btn.dataset.category = cat.id;

    const labelSpan = document.createElement("span");
    labelSpan.textContent = cat.label;
    btn.appendChild(labelSpan);

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = list.length ? `(${list.length})` : "(0)";
    btn.appendChild(count);

    if (onPage > 0) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.title = `${onPage} available on this page`;
      btn.appendChild(dot);
    }

    btn.addEventListener("click", () => selectCategory(cat.id));
    els.tabs.appendChild(btn);
  }
  els.tabs.hidden = false;
}

function render(categories, enhancements) {
  // Group by category, keeping any "uncategorized" strays as their own tab.
  byCategory = new Map();
  const order = [...categories];
  if (enhancements.some((e) => e.category === "uncategorized")) {
    order.push({ id: "uncategorized", label: "Uncategorized" });
  }
  categoryLabels = new Map(order.map((c) => [c.id, c.label]));
  for (const cat of order) byCategory.set(cat.id, []);
  for (const enh of enhancements) {
    if (!byCategory.has(enh.category)) byCategory.set(enh.category, []);
    byCategory.get(enh.category).push(enh);
  }

  const onPageTotal = enhancements.filter((e) => e.matches).length;
  els.subtitle.textContent = onPageTotal
    ? `${onPageTotal} available on this page · ${enhancements.length} total`
    : `None apply to this page · ${enhancements.length} available`;

  renderTabs(order);

  // Default to the first category with something active here, else the first
  // category that has any enhancements, else the very first tab.
  const firstOnPage = order.find((c) =>
    (byCategory.get(c.id) || []).some((e) => e.matches)
  );
  const firstNonEmpty = order.find((c) => (byCategory.get(c.id) || []).length);
  selectCategory((firstOnPage || firstNonEmpty || order[0]).id);
}

async function main() {
  const reg = window.OSEnhance;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;

  els.reloadBtn.addEventListener("click", async () => {
    if (activeTab) await chrome.tabs.reload(activeTab.id);
    window.close();
  });

  els.enableAll.addEventListener("click", () => setAll(true));
  els.disableAll.addEventListener("click", () => setAll(false));

  if (!reg || !reg._enhancements || !reg._enhancements.length) {
    showEmpty("No enhancements are registered.");
    return;
  }

  // The active tab's URL (readable via the activeTab permission granted when the
  // popup opens). Empty on pages we can't read (e.g. chrome://) — then nothing is
  // "on this page", but the full list still shows.
  const url = (tab && tab.url) || "";

  const stored = await chrome.storage.sync.get({ [STORAGE_KEY]: [] });
  const on = new Set(stored[STORAGE_KEY] || []); // opt-in: ids the user turned on

  const categories = reg.categories || [];
  const enhancements = reg._enhancements.map((e) => ({
    id: e.id,
    category: e.category,
    title: e.title || e.id,
    description: e.description || "",
    matches: reg.urlMatches(e.match, url),
    enabled: on.has(e.id),
    // Only JS enhancements explicitly flagged not-live-revertable need a reload.
    needsReload: typeof e.apply === "function" && e.revertsLive === false
  }));

  allEnhancements = enhancements;
  render(categories, enhancements);
  els.bulk.hidden = false;
}

main();
