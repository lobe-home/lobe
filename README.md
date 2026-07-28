<p align="center">
  <img src="assets/lobe.svg" alt="LOBE — a glum little bee" width="140" />
</p>

# LOBE  (🔊 LOH-bee)

**L**ightweight **O**utSystems **B**rowser **E**nhancements

A small Chrome extension that applies little enhancements to OutSystems platform
frontends (Service Center, Lifetime, ODC Portal, Community pages, etc.).

> Unofficial and community-maintained, not affiliated with or endorsed by
> OutSystems. It only tweaks how these pages look in *your* browser.

No build step, no dependencies, nothing leaves your browser.

## Status & feedback

This is an early **work in progress** — free to use as-is.

Got feedback, a question, or an idea? Head to [**Discussions**](../../discussions) —
that's the place for it, and it's genuinely welcome. You're also free to fork it and
tinker.

Pull requests are limited to collaborators for now, so please share thoughts in
Discussions rather than sending code — the project is still finding its feet and
isn't set up to take code contributions yet. Curious how it's built, or want to add
an enhancement? See **[CONTRIBUTING.md](CONTRIBUTING.md)**.

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and select this folder
4. Click the toolbar icon and switch on the enhancements you want

## The popup

Enhancements are **opt-in**: everything starts off, and nothing runs until you
switch it on — including any enhancement added in a later update. Pick the ones you
find useful and trust.

The toolbar popup lets you:

- See the **full** list of enhancements, grouped into category tabs.
- Ones that apply to the current page are tagged with a small blue dot.
- Read each enhancement's description before trusting it.
- Toggle any enhancement on or off, or use **Enable all / Disable all** to flip
  everything at once.
- Adjust the popup's **text size** (the A− / A+ control in the footer) if you'd
  like it larger.
- Your choices are saved in `chrome.storage.sync`, so they follow you across
  signed-in browsers.

The popup follows your system's **light or dark theme** automatically.

**Spotting LOBE's changes:** where LOBE alters a page it marks the change with its
honey-and-gold styling and a little bee, and shows a small **LOBE** badge in the
corner of any page it's active on (hover it to see what's on). Prefer the pages
looking untouched? Open **Settings** in the footer and switch off **"Mark LOBE
changes on page"** — the enhancements keep working, the LOBE styling just disappears
(live, on every open tab).

**Self-hosted or custom domains:** LOBE runs automatically on the standard OutSystems
cloud hosts. On any *other* domain that looks like an OutSystems page, the popup
shows a **"Run LOBE on this site"** switch — flip it on, approve Chrome's per-site
prompt, and it works there from then on. Review or remove the sites you've added via
**Sites** in the footer.

## Permissions

- `storage` — remembers which enhancements you've turned on (synced across your browsers).
- `activeTab` — lets the popup talk to the current tab and reload it on request.
- `clipboardWrite` — lets enhancements put text on your clipboard.

## License

See `LICENSE`.

## Enhancements

The current list lives in the extension itself — open the toolbar popup to see every
enhancement (grouped by category, with a description for each), or browse
`src/enhancements/`.
