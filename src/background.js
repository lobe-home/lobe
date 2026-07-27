// background.js — service worker for per-domain opt-in.
//
// LOBE runs automatically on the built-in OutSystems hosts (the static
// content_scripts in manifest.json). For a self-hosted / custom OutSystems domain,
// the user grants access from the popup (Chrome's own per-site permission prompt);
// we then register a content script for that domain at runtime here.
//
// A user-added "site" is the subdomain-wildcarded registrable domain — e.g. adding a
// page on apps.acme.com grants "*.acme.com", matching the built-in convention
// ("*.outsystemscloud.com") so one grant covers Service Center, the apps, LifeTime,
// etc. The popup computes that shape; here we just work with the granted origins.
//
// The list of user-added sites lives in chrome.storage.LOCAL (not sync) because host
// permissions are per-device — a domain granted on one machine isn't granted on
// another, so the list shouldn't sync and stomp on the other device.
//
// The scripts we inject on a granted site are exactly the ones the built-in hosts use
// — read from the manifest so there's no second list to maintain.

const USER_DOMAINS_KEY = "userDomains";

function scriptFiles() {
  const cs = (chrome.runtime.getManifest().content_scripts || [])[0] || {};
  return cs.js || [];
}
const patternFor = (site) => `https://${site}/*`;
const regId = (site) => "user:" + site;

// Hosts covered by the built-in content scripts (e.g. "*.outsystemscloud.com"), read
// from the manifest so there's no second list. Used to tell built-in grants apart
// from user-added ones in chrome.permissions.getAll().
function builtinMatchHosts() {
  const cs = (chrome.runtime.getManifest().content_scripts || [])[0] || {};
  const set = new Set();
  for (const m of cs.matches || []) {
    const mm = /^https?:\/\/([^/]+)/.exec(m);
    if (mm) set.add(mm[1]);
  }
  return set;
}

const BUILTIN_HOSTS = builtinMatchHosts();

// Does a built-in match host (e.g. "*.outsystems.com") cover this host? Host-level, so
// a bare "www.outsystems.com" grant counts as covered by a "*.outsystems.com" built-in
// — otherwise a leftover per-host grant would get re-registered as a user site.
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
// those aren't treated as user sites.
const siteFromOrigin = (origin) => {
  const m = /^https:\/\/([^/]+)\//.exec(origin);
  const host = m && m[1];
  if (!host || host === "*") return null;
  const testHost = host.startsWith("*.") ? "sample." + host.slice(2) : host;
  if (testHost.includes("*")) return null;
  return builtinCoversHost(testHost) ? null : host;
};

async function getUserSites() {
  const r = await chrome.storage.local.get({ [USER_DOMAINS_KEY]: [] });
  return r[USER_DOMAINS_KEY] || [];
}
function setUserSites(list) {
  return chrome.storage.local.set({ [USER_DOMAINS_KEY]: list });
}

// Register the content script for a site (idempotent).
async function ensureRegistered(site) {
  const id = regId(site);
  const existing = await chrome.scripting
    .getRegisteredContentScripts({ ids: [id] })
    .catch(() => []);
  if (existing && existing.length) return;
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [patternFor(site)],
      js: scriptFiles(),
      runAt: "document_idle",
      allFrames: false,
      persistAcrossSessions: true
    }
  ]);
}

async function unregister(site) {
  await chrome.scripting
    .unregisterContentScripts({ ids: [regId(site)] })
    .catch(() => {});
}

async function enableSite(site) {
  await ensureRegistered(site);
  const list = await getUserSites();
  if (!list.includes(site)) await setUserSites([...list, site]);
  // Apply to any already-open tabs of this site, so it works without a reload.
  const tabs = await chrome.tabs.query({ url: patternFor(site) }).catch(() => []);
  for (const t of tabs) {
    if (t.id != null) {
      chrome.scripting
        .executeScript({ target: { tabId: t.id }, files: scriptFiles() })
        .catch(() => {});
    }
  }
}

async function disableSite(site) {
  await unregister(site);
  const list = await getUserSites();
  if (list.includes(site)) await setUserSites(list.filter((s) => s !== site));
}

// Tell the runner in any open tab of this site to fully revert — done BEFORE the
// permission is revoked, since afterward we can no longer find its tabs by URL.
async function teardownTabs(site) {
  const tabs = await chrome.tabs.query({ url: patternFor(site) }).catch(() => []);
  for (const t of tabs) {
    if (t.id != null) chrome.tabs.sendMessage(t.id, { ose: "teardown" }).catch(() => {});
  }
}

// On install/update/startup: re-assert registrations for sites that are still
// permission-granted, and drop any that aren't. This is what makes grants survive
// extension updates and browser restarts, and self-heals if a permission was revoked
// via Chrome's own settings.
async function reconcile() {
  // Source of truth: the host permissions Chrome actually has granted right now
  // (user sites only — the built-in content-script hosts are ignored). This also
  // recovers a grant that got stranded (permission held but never registered/stored).
  const all = await chrome.permissions.getAll().catch(() => ({ origins: [] }));
  const granted = new Set();
  for (const origin of all.origins || []) {
    const site = siteFromOrigin(origin);
    if (site) granted.add(site);
  }
  const stored = await getUserSites();
  for (const site of stored) if (!granted.has(site)) await unregister(site);
  for (const site of granted) await ensureRegistered(site).catch(() => {});
  const finalList = [...granted];
  const changed =
    finalList.length !== stored.length || finalList.some((s) => !stored.includes(s));
  if (changed) await setUserSites(finalList);
}

chrome.runtime.onInstalled.addListener(reconcile);
chrome.runtime.onStartup.addListener(reconcile);
// Also run whenever the worker spins up (covers manual extension reloads, which don't
// reliably fire onInstalled/onStartup).
reconcile();

// The popup only asks Chrome to add/remove the host permission (needs a user gesture).
// We react to the grant/revoke here — so it works even if the popup closes when Chrome
// shows its prompt, and it also covers permissions changed via Chrome's own settings.
chrome.permissions.onAdded.addListener((perms) => {
  for (const origin of perms.origins || []) {
    const site = siteFromOrigin(origin);
    if (site) enableSite(site);
  }
});

chrome.permissions.onRemoved.addListener((perms) => {
  for (const origin of perms.origins || []) {
    const site = siteFromOrigin(origin);
    if (site) disableSite(site);
  }
});

// The popup routes "disable" through here so we can tear down the runner in any open
// tab BEFORE revoking the host permission (onRemoved then unregisters + unstores).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.cmd !== "disable" || !msg.site) return;
  (async () => {
    await teardownTabs(msg.site);
    await chrome.permissions.remove({ origins: [patternFor(msg.site)] }).catch(() => {});
    sendResponse({ ok: true });
  })();
  return true; // async response
});
