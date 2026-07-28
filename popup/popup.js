// popup.js — groups registered enhancements into category tabs and lets the user
// toggle each on/off.
//
// The popup reads the enhancement registry DIRECTLY (popup.html loads registry.js,
// categories.js and every enhancement file), so it always shows the full list on
// any page — it never messages a content script. It figures out which
// enhancements are "on this page" from the active tab's URL, and toggling just
// writes chrome.storage.sync, which the page's content script observes and acts on.

const STORAGE_KEY = "enabledEnhancements";
const MARK_KEY = "markChanges"; // "Mark LOBE changes on page" (Settings) — default ON
const ALL_ID = "all"; // synthetic first tab listing every enhancement

const els = {
  tabs: document.getElementById("tabs"),
  categoryHeader: document.getElementById("categoryHeader"),
  panel: document.getElementById("panel"),
  empty: document.getElementById("empty"),
  reloadBar: document.getElementById("reloadBar"),
  reloadBtn: document.getElementById("reloadBtn"),
  fsUp: document.getElementById("fsUp"),
  fsDown: document.getElementById("fsDown"),
  fsValue: document.getElementById("fsValue"),
  addSiteBanner: document.getElementById("addSiteBanner"),
  addSiteText: document.getElementById("addSiteText"),
  addSiteSwitch: document.getElementById("addSiteSwitch"),
  sitesView: document.getElementById("sitesView"),
  sitesList: document.getElementById("sitesList"),
  manageSites: document.getElementById("manageSites"),
  sitesBack: document.getElementById("sitesBack"),
  settingsView: document.getElementById("settingsView"),
  openSettings: document.getElementById("openSettings"),
  settingsBack: document.getElementById("settingsBack"),
  markChangesSwitch: document.getElementById("markChangesSwitch")
};

let activeTab = null;
let byCategory = new Map(); // category id -> enhancements[]
let categoryLabels = new Map(); // category id -> display label
let selectedCategory = null;

// --- Popup text size (adjustable + persisted in chrome.storage.sync) ------------
const FS_KEY = "popupFontScale";
const FS_MIN = 0.9, FS_MAX = 1.6, FS_STEP = 0.1;
let fontScale = 1;

// Set the --fs CSS variable that every font-size multiplies by (see popup.css).
function applyFontScale(value) {
  fontScale = Math.min(FS_MAX, Math.max(FS_MIN, Math.round(value * 10) / 10));
  document.documentElement.style.setProperty("--fs", String(fontScale));
  els.fsValue.textContent = Math.round(fontScale * 100) + "%";
}
async function setFontScale(value) {
  applyFontScale(value);
  await chrome.storage.sync.set({ [FS_KEY]: fontScale });
}

// --- Per-domain opt-in (self-hosted / custom OutSystems domains) ----------------
// Host permissions are per-device, so the granted-domain list lives in
// chrome.storage.LOCAL (not sync). The background worker registers the actual
// content scripts; the popup handles the permission prompt (needs a user gesture).
let currentUrl = "";
let currentHost = "";
let currentSite = ""; // currentHost reduced to "*.registrable.domain"
let userDomains = new Set();

// Turn a manifest match pattern into a RegExp so we can tell if the current page is
// already covered by a built-in host (no need to offer "enable" there).
function matchPatternToRegExp(pattern) {
  if (pattern === "<all_urls>") return /^https?:\/\//i;
  const m = /^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/.exec(pattern);
  if (!m) return /$^/;
  const [, scheme, host, path] = m;
  const esc = (s) => s.replace(/[.+^${}()|[\]\\?]/g, "\\$&");
  let re = "^" + (scheme === "*" ? "https?" : scheme) + "://";
  if (host === "*") re += "[^/]+";
  else if (host.startsWith("*.")) re += "(?:[^/]+\\.)?" + esc(host.slice(2));
  else re += esc(host);
  re += path.split("*").map(esc).join(".*") + "$";
  return new RegExp(re, "i");
}
function builtinMatches() {
  return ((chrome.runtime.getManifest().content_scripts || [])[0] || {}).matches || [];
}
const BUILTIN_RES = builtinMatches().map(matchPatternToRegExp);
function isBuiltinCovered(url) { return BUILTIN_RES.some((r) => r.test(url)); }
function hostOf(url) { try { return new URL(url).hostname; } catch { return ""; } }

// Hosts covered by the built-in content scripts (e.g. "*.outsystemscloud.com"), used
// to keep built-in grants out of the user-added list.
function builtinMatchHosts() {
  const set = new Set();
  for (const m of builtinMatches()) {
    const mm = /^https?:\/\/([^/]+)/.exec(m);
    if (mm) set.add(mm[1]);
  }
  return set;
}
const BUILTIN_HOSTS = builtinMatchHosts();

// Common second-level labels under a two-letter country TLD (co.uk, com.au, ...).
// A small heuristic — not the full public-suffix list — enough to avoid over-broad
// grants like "*.co.uk" for the usual cases.
const TWO_PART_SLD = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "gob", "or", "ne"]);

// Reduce a page host to a "site": the registrable domain, subdomain-wildcarded, so it
// matches the built-in convention (e.g. "*.outsystemscloud.com"). "www.acme.com",
// "apps.acme.com" and "acme.com" all become "*.acme.com" — one grant covers the whole
// OutSystems environment (Service Center, the apps, LifeTime, ...).
function siteFromHost(host) {
  const labels = String(host).split(".").filter(Boolean);
  if (labels.length <= 2) return "*." + labels.join(".");
  const twoPart =
    labels[labels.length - 1].length === 2 && TWO_PART_SLD.has(labels[labels.length - 2]);
  return "*." + labels.slice(twoPart ? -3 : -2).join(".");
}

// Does a built-in match host (e.g. "*.outsystems.com") cover this host? Host-level, so
// a bare "www.outsystems.com" grant counts as covered by a "*.outsystems.com" built-in
// — otherwise a leftover per-host grant would masquerade as a removable user site.
function builtinCoversHost(host) {
  for (const bh of BUILTIN_HOSTS) {
    if (bh === "*" || bh === host) return true;
    if (bh.startsWith("*.")) {
      const base = bh.slice(2);
      if (host === base || host.endsWith("." + base)) return true;
    }
  }
  return false;
}

// The user-added "site" from a granted origin like "https://*.example.com/*". Returns
// null for the broad optional pattern and anything a built-in host already covers, so
// those aren't shown as (or treated as) user-added sites.
function siteFromOrigin(origin) {
  const m = /^https:\/\/([^/]+)\//.exec(origin);
  const host = m && m[1];
  if (!host || host === "*") return null;
  const testHost = host.startsWith("*.") ? "sample." + host.slice(2) : host;
  if (testHost.includes("*")) return null;
  return builtinCoversHost(testHost) ? null : host;
}
// The set of user-granted sites, read straight from Chrome's live permissions —
// authoritative regardless of when the worker last reconciled.
async function loadGrantedSites() {
  const all = await chrome.permissions.getAll().catch(() => ({ origins: [] }));
  const set = new Set();
  for (const o of all.origins || []) {
    const s = siteFromOrigin(o);
    if (s) set.add(s);
  }
  return set;
}

// True when a granted site pattern already matches the current page.
function grantedCovers(url) {
  for (const site of userDomains) {
    if (matchPatternToRegExp(`https://${site}/*`).test(url)) return true;
  }
  return false;
}

// The current page is "addable" when it's an OutSystems page (matches an enhancement)
// on a domain that isn't built-in and isn't already covered by a user grant.
function currentSiteAddable() {
  const url = currentUrl;
  if (!/^https?:\/\//i.test(url) || !currentSite || isBuiltinCovered(url)) return false;
  if (grantedCovers(url)) return false;
  const reg = window.OSEnhance;
  return (reg._enhancements || []).some((e) => reg.urlMatches(e.match, url));
}

// The footer "Sites" link nudges the user when the current site can be added.
function updateSitesLink() {
  const addable = currentSiteAddable();
  els.manageSites.textContent = addable ? "Sites (add this one?)" : "Sites";
  els.manageSites.classList.toggle("has-suggestion", addable);
}

// The "add this site" banner at the bottom of the Sites view — shown only while the
// current site is addable (once added it appears under "Added by you" instead).
function renderAddSiteBanner() {
  if (currentSiteAddable()) {
    els.addSiteText.textContent =
      `This looks like an OutSystems page — run LOBE on ${currentSite}?`;
    els.addSiteSwitch.checked = false;
    els.addSiteBanner.hidden = false;
  } else {
    els.addSiteBanner.hidden = true;
  }
}

async function enableCurrentSite() {
  if (!currentSite) return false;
  // Just ask Chrome for the permission. The background worker listens for the grant
  // (permissions.onAdded) and does the registration, storage, and injecting into
  // open tabs — so it all still happens even if this popup closes on the prompt.
  let granted = false;
  try { granted = await chrome.permissions.request({ origins: [`https://${currentSite}/*`] }); }
  catch { granted = false; }
  if (granted) userDomains.add(currentSite);
  return granted;
}

async function disableSite(site) {
  // Route through the worker: it tears down the runner in any open tab of this site,
  // then revokes the permission (onRemoved unregisters + updates the stored list).
  try { await chrome.runtime.sendMessage({ cmd: "disable", site }); } catch {}
  userDomains.delete(site);
}

// The "add this site" switch only turns on — enabling asks Chrome for the host
// permission. Once granted the site moves into "Added by you", so refresh the view.
async function onAddSiteSwitchChange() {
  if (!els.addSiteSwitch.checked) return;
  const ok = await enableCurrentSite();
  if (ok) {
    renderSitesView();
    renderAddSiteBanner();
    updateSitesLink();
  } else {
    els.addSiteSwitch.checked = false;
  }
}

// --- Sites manager overlay ------------------------------------------------------
// Clean label for a site/match pattern: drop the "https://" prefix, a trailing "/*",
// and the leading "*." subdomain wildcard (every site has one) — so both
// "https://*.outsystems.com/*" and "*.outsystemscloud.com" read as bare domains.
function prettySite(pattern) {
  return pattern
    .replace(/^https?:\/\//, "")
    .replace(/\/\*$/, "")
    .replace(/^\*\./, "");
}

function siteRow(name, opts) {
  const { locked = false, host = null } = opts || {};
  const row = document.createElement("div");
  row.className = "site-row";

  const nm = document.createElement("span");
  nm.className = "site-name";
  nm.textContent = name;

  const label = document.createElement("label");
  label.className = "switch";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = true;
  if (locked) {
    input.disabled = true;
    label.title = "Built-in — always on";
  } else {
    label.title = "Remove this site";
    input.addEventListener("change", async () => {
      await disableSite(host); // it starts on, so a change here means "remove"
      renderSitesView();
      renderAddSiteBanner(); // removed site may become addable again
      updateSitesLink();
    });
  }
  const slider = document.createElement("span");
  slider.className = "slider";
  label.append(input, slider);

  row.append(nm, label);
  return row;
}

function renderSitesView() {
  els.sitesList.innerHTML = "";

  const builtinLabel = document.createElement("div");
  builtinLabel.className = "sites-group-label";
  builtinLabel.textContent = "Built-in";
  els.sitesList.appendChild(builtinLabel);
  for (const p of builtinMatches())
    els.sitesList.appendChild(siteRow(prettySite(p), { locked: true }));

  const addedLabel = document.createElement("div");
  addedLabel.className = "sites-group-label";
  addedLabel.textContent = "Added by you";
  els.sitesList.appendChild(addedLabel);

  const added = [...userDomains];
  if (!added.length) {
    const p = document.createElement("p");
    p.className = "site-empty";
    p.textContent =
      "No custom sites added yet. On a self-hosted OutSystems page, the popup offers to enable it here.";
    els.sitesList.appendChild(p);
  } else {
    for (const host of added) els.sitesList.appendChild(siteRow(prettySite(host), { host }));
  }
}

function showSites(show) {
  if (show) { renderSitesView(); renderAddSiteBanner(); }
  els.sitesView.hidden = !show;
}

function showSettings(show) {
  els.settingsView.hidden = !show;
}

// --- Settings overlay -----------------------------------------------------------
// A single global preference: "Mark LOBE changes on page" (default ON). The popup
// only writes chrome.storage.sync; each page's content script observes it and adds/
// removes LOBE's styling live (see runner.js / the .ose-marks-off switch).
async function initSettings() {
  const stored = await chrome.storage.sync.get({ [MARK_KEY]: true });
  els.markChangesSwitch.checked = stored[MARK_KEY] !== false; // absent/true => on
  els.markChangesSwitch.addEventListener("change", () => {
    chrome.storage.sync.set({ [MARK_KEY]: els.markChangesSwitch.checked });
  });
  els.openSettings.addEventListener("click", () => showSettings(true));
  els.settingsBack.addEventListener("click", () => showSettings(false));
}

function showEmpty(message) {
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
    enh.enabled = input.checked; // keep in-memory state in sync for counts + re-renders
    setEnabled(enh.id, input.checked, enh.needsReload, enh.matches);
    renderCategoryHeader(selectedCategory); // refresh the "N active" count
  });

  const slider = document.createElement("span");
  slider.className = "slider";

  label.appendChild(input);
  label.appendChild(slider);

  li.appendChild(info);
  li.appendChild(label);
  return li;
}

// The category header row: category name, a compact status (total · N active · M here)
// for the selected tab, then the Enable all / Disable all controls (only when there
// are 2+ enhancements to act on).
function makeCategoryHeader(categoryId, withControls) {
  const list = byCategory.get(categoryId) || [];
  const bulk = document.createElement("div");
  bulk.className = "panel-bulk";

  const label = document.createElement("span");
  label.className = "panel-bulk-label";
  label.textContent = categoryLabels.get(categoryId) || categoryId;
  bulk.appendChild(label);

  const active = list.filter((e) => e.enabled).length;
  const here = list.filter((e) => e.matches).length;
  const status = document.createElement("span");
  status.className = "panel-bulk-status";
  status.textContent = `${list.length} total · ${active} active · ${here} here`;
  bulk.appendChild(status);

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

// Render (or re-render) the pinned category header for the given category.
function renderCategoryHeader(categoryId) {
  const list = byCategory.get(categoryId) || [];
  els.categoryHeader.innerHTML = "";
  els.categoryHeader.appendChild(makeCategoryHeader(categoryId, list.length > 1));
  els.categoryHeader.hidden = false;
}

function renderPanel(categoryId) {
  const list = byCategory.get(categoryId) || [];

  // Category header (name + status + optional Enable/Disable all) lives OUTSIDE the
  // panel, so it stays pinned while the list scrolls.
  renderCategoryHeader(categoryId);

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
  // Group by category, keeping any "uncategorized" strays as their own tab. "All" is
  // a synthetic first tab holding every enhancement (same objects, so toggles stay in
  // sync with the real category tabs).
  byCategory = new Map();
  const realOrder = [...categories];
  if (enhancements.some((e) => e.category === "uncategorized")) {
    realOrder.push({ id: "uncategorized", label: "Uncategorized" });
  }
  const order = [{ id: ALL_ID, label: "All" }, ...realOrder];
  categoryLabels = new Map(order.map((c) => [c.id, c.label]));
  for (const cat of order) byCategory.set(cat.id, []);
  for (const enh of enhancements) {
    if (!byCategory.has(enh.category)) byCategory.set(enh.category, []);
    byCategory.get(enh.category).push(enh);
    byCategory.get(ALL_ID).push(enh);
  }

  renderTabs(order);

  // Which tab to open on, in priority order:
  //   1. the first real category with an enhancement live on this page;
  //   2. else the first category whose `match` hint covers the URL (e.g. anywhere in
  //      Service Center, even on a page LOBE doesn't specifically patch);
  //   3. else the All overview.
  const reg = window.OSEnhance;
  const firstOnPage = realOrder.find((c) =>
    (byCategory.get(c.id) || []).some((e) => e.matches)
  );
  const firstHinted = realOrder.find(
    (c) => c.match && reg.urlMatches(c.match, currentUrl)
  );
  selectCategory((firstOnPage || firstHinted || { id: ALL_ID }).id);
}

async function main() {
  const reg = window.OSEnhance;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;

  els.reloadBtn.addEventListener("click", async () => {
    if (activeTab) await chrome.tabs.reload(activeTab.id);
    window.close();
  });

  // Text-size control: apply the saved scale, then wire the +/- buttons.
  const fsStored = await chrome.storage.sync.get({ [FS_KEY]: 1 });
  applyFontScale(fsStored[FS_KEY]);
  els.fsUp.addEventListener("click", () => setFontScale(fontScale + FS_STEP));
  els.fsDown.addEventListener("click", () => setFontScale(fontScale - FS_STEP));

  // Per-domain opt-in: current site, granted domains, and the Sites manager.
  currentUrl = (tab && tab.url) || "";
  currentHost = hostOf(currentUrl);
  currentSite = currentHost ? siteFromHost(currentHost) : "";
  userDomains = await loadGrantedSites();
  els.addSiteSwitch.addEventListener("change", onAddSiteSwitchChange);
  els.manageSites.addEventListener("click", () => showSites(true));
  els.sitesBack.addEventListener("click", () => showSites(false));
  updateSitesLink();

  // Settings overlay ("Mark LOBE changes on page").
  await initSettings();

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

  render(categories, enhancements);
}

main();
