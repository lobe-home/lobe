// Enhancement: quick date-range picker (clock icon + menu) on log pages.
//
// Service Center's monitoring log pages (Error_Logs, General_Logs, Screen_Logs,
// ScreenRequests_Logs, NativeApps_Log, …) all filter by a shared From/To timestamp
// — setting it on one log is reflected on the others. Each is typed (or picked from
// a calendar) as "YYYY-MM-DD HH:mm:SS". This adds a small clock button to the filter
// row; clicking it opens a two-section menu:
//   • "Last …"  — relative ranges (15 minutes … 7 days): From = now minus the range,
//                 To left empty (open-ended, "up to now").
//   • "On …"    — a specific day out of the last eight: From = that day 00:00:00,
//                 To = that day 23:59:59 (the whole day).
// Picking any item immediately runs the filter.
//
// It targets all of these pages with one selector set. Their filter markup differs
// only in ways we already tolerate: the To field is "...Filter_ToDate" on some and
// "...Filter_ToDate2" on others (matched with id*=), and the Filter button is
// "...wtbtn2"/"...wtButton2" and sometimes carries Is_Default, sometimes only
// btn-primary, sometimes data-testid="filter_btn" — we try all three.
//
// For the "Last" ranges To is cleared (no upper bound): the sidebar clock has no
// seconds, so an explicit To could round just below the newest log and hide it.
// The "On" ranges set an explicit whole-day To on purpose (a bounded day).
//
// TIMEZONE — the important bit. Log timestamps and the From/To fields are in the
// SERVER's timezone, not the browser's, so we must anchor "now" to the server's
// clock. Service Center already prints the server's current local time in its left
// sidebar (e.g. "08:30 Sun 2026-07-26"); we read it straight from there. That's the
// server's own wall clock in its own timezone — no offset math, and it's correct
// for any environment whatever timezone the server runs in. We pull out the first
// time-looking and first date-looking token (no weekday assumption, so it survives
// UI localization). The sidebar value is rendered at page load, so we add the time
// elapsed since load (performance.now()) to keep "now" current on a long-open tab.
// The "On" day list is derived from that same server date.
//
// The fields are plain <input type="text"> (a calendar widget attaches only on
// click), so writing .value + dispatching input/change events is enough for the
// platform to submit the value on the "Filter" postback we trigger.
//
// The inputs'/button's ids carry volatile auto-generated wt* prefixes, so we match
// on stable suffixes/classes. Elements are re-queried at click time, so the picker
// keeps working after OutSystems re-renders the filter area on a postback.

(function () {
  const FROM_SEL = 'input[id$="Filter_FromDate"]';
  const TO_SEL = 'input[id*="Filter_ToDate"]';
  // The primary "Filter" submit button across the log pages: newer ones tag it
  // data-testid="filter_btn"; older ones mark it Is_Default; all of them give it
  // btn-primary (while Reset is only btn). Scoped to the filter block, any of these
  // resolves to the same button.
  const FILTER_BTN_SEL =
    'input[type="submit"][data-testid="filter_btn"], ' +
    'input[type="submit"].Is_Default, ' +
    'input[type="submit"].btn-primary';

  // Relative ranges for the "Last" section (hours; fractions for sub-hour ranges).
  // The section header supplies the word "Last", so the labels omit it.
  const RELATIVE = [
    { label: "15 minutes", hours: 0.25 },
    { label: "30 minutes", hours: 0.5 },
    { label: "1 hour", hours: 1 },
    { label: "2 hours", hours: 2 },
    { label: "12 hours", hours: 12 },
    { label: "24 hours", hours: 24 },
    { label: "3 days", hours: 72 },
    { label: "7 days", hours: 168 }
  ];

  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const CLOCK_SVG =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>';

  // First time-looking (HH:mm, optional :ss) and date-looking (YYYY-MM-DD) tokens.
  const TIME_RE = /(\d{1,2}):(\d{2})(?::(\d{2}))?/;
  const DATE_RE = /(\d{4})-(\d{2})-(\d{2})/;

  const pad = (n) => String(n).padStart(2, "0");

  // Read the server's current local time from the Service Center sidebar. Returns
  // a Date whose UTC fields hold the server's wall clock (so plain UTC arithmetic
  // on it stays free of any daylight-saving surprises), advanced by the time the
  // page has been open. Null if the sidebar time can't be found.
  function serverNowInstant() {
    const root =
      document.querySelector(".sc-content-left") ||
      document.querySelector('[id$="wtContentLeft"]') ||
      document.body;
    const text = root.textContent || "";
    const t = text.match(TIME_RE);
    const d = text.match(DATE_RE);
    if (!t || !d) return null;
    const rendered = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2], t[3] ? +t[3] : 0);
    return new Date(rendered + performance.now()); // + elapsed since page load
  }

  // The browser's "now" re-encoded so its UTC fields hold the local wall clock —
  // matches serverNowInstant()'s shape, used only as a fallback for the day list.
  function clientNowAsWall() {
    const n = new Date();
    return new Date(
      Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds())
    );
  }

  const ymd = (d) =>
    d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());

  // Format an instant's UTC fields (= server wall clock) as "YYYY-MM-DD HH:mm:SS".
  function fmt(instant) {
    return ymd(instant) + " " + pad(instant.getUTCHours()) + ":" +
      pad(instant.getUTCMinutes()) + ":" + pad(instant.getUTCSeconds());
  }

  // Write a value and let the platform (and any listeners) notice it.
  function setValue(input, value) {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Set From/To (toStr "" = no upper bound) and run the filter. Re-queries the live
  // fields/button so it works after OutSystems re-renders the filter area.
  function applyRange(fromStr, toStr) {
    const from = document.querySelector(FROM_SEL);
    const to = document.querySelector(TO_SEL);
    if (!from || !to) {
      console.warn("[OSEnhance] quick-range: From/To fields not found");
      return;
    }
    setValue(from, fromStr);
    setValue(to, toStr);
    const container = to.closest('[id$="FiltersContainer"]') || document;
    const filterBtn = container.querySelector(FILTER_BTN_SEL);
    if (filterBtn) filterBtn.click();
    else console.warn("[OSEnhance] quick-range: Filter button not found");
  }

  function applyLastHours(hours) {
    const now = serverNowInstant();
    if (!now) {
      console.warn("[OSEnhance] quick-range: could not read server time from the sidebar");
      return;
    }
    applyRange(fmt(new Date(now.getTime() - hours * 3600 * 1000)), "");
  }

  function applyDay(date) {
    applyRange(date + " 00:00:00", date + " 23:59:59");
  }

  // Build the "On" section: today and the previous seven days, from the server date.
  // (Eight entries — one per row of the "Last" column, so the two columns match.)
  function buildDays() {
    const base = serverNowInstant() || clientNowAsWall();
    const out = [];
    for (let k = 0; k < 8; k++) {
      const d = new Date(base.getTime() - k * 86400000);
      const date = ymd(d);
      const label =
        k === 0 ? "Today · " + date :
        k === 1 ? "Yesterday · " + date :
        WEEKDAYS[d.getUTCDay()] + " · " + date;
      out.push({ label, run: () => applyDay(date) });
    }
    return out;
  }

  OSEnhance.register({
    id: "quick-range-log-filters",
    title: "Quick date-range picker on log pages",
    description:
      "On Service Center's log pages, adds a clock button with a menu: 'Last' relative ranges (open-ended) and 'On' a specific day of the last eight (whole day). Picking one sets the dates (using the server's clock) and runs the filter.",

    // All Service Center monitoring log pages: Error_Logs, General_Logs,
    // Screen_Logs, ScreenRequests_Logs, NativeApps_Log, etc. — anything
    // /servicecenter/<name>_Log(s).aspx (the "s" is optional: some pages use
    // the singular "_Log", e.g. NativeApps_Log.aspx).
    match: /\/servicecenter\/\w+_Logs?\.aspx/i,

    css: `
      /* The toggle wears LOBE colours (shared --lobe-* vars from stamp.baseCss). */
      .ose-qr-toggle {
        box-sizing: border-box;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 0;
        color: var(--lobe-ink);
        background: var(--lobe-honey);
        border: 1px solid var(--lobe-gold);
        border-radius: 5px;
        cursor: pointer;
        line-height: 0;
      }
      .ose-qr-toggle:hover { background: var(--lobe-honey-hover); border-color: var(--lobe-ink); }
      .ose-qr-toggle[aria-expanded="true"] { background: var(--lobe-honey-hover); border-color: var(--lobe-ink); }

      /* Anchored to <body> and fixed-positioned so the filter row's overflow /
         stacking context can't clip it. It's a column: a LOBE-branded header on top,
         then the two sections side by side as columns (so it stays short). */
      .ose-qr-menu {
        position: fixed;
        z-index: 2147483000;
        padding: 6px;
        background: #fff;
        border: 1px solid var(--lobe-gold);
        border-radius: 6px;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
        display: none;
      }
      .ose-qr-menu.ose-open { display: flex; flex-direction: column; }
      /* LOBE stamp on the menu: the bee + a wordmark above the range columns. */
      .ose-qr-brand {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 2px 6px 6px;
        margin-bottom: 4px;
        border-bottom: 1px solid #eee;
        color: var(--lobe-ink);
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .ose-qr-cols { display: flex; gap: 4px; align-items: flex-start; }
      .ose-qr-group {
        display: flex;
        flex-direction: column;
        min-width: 168px;
      }
      .ose-qr-group + .ose-qr-group {
        margin-left: 2px;
        padding-left: 6px;
        border-left: 1px solid #eee;
      }
      .ose-qr-header {
        padding: 4px 10px 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #999;
      }
      .ose-qr-item {
        display: block;
        width: 100%;
        box-sizing: border-box;
        margin: 0;
        padding: 6px 10px 6px 18px;
        text-align: left;
        font-size: 13px;
        color: #333;
        background: none;
        border: 0;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
      }
      .ose-qr-item:hover { background: #f0f0f0; }
    `,

    // ctx-routed so switching this off removes the button, the menu, and (via the
    // onCleanup below) any open-state listeners — no reload.
    apply(ctx) {
      if (document.querySelector(".ose-qr-col")) return; // idempotent
      // Drop any menu orphaned on <body> by a previous render before re-inserting.
      document.querySelectorAll(".ose-qr-menu").forEach((m) => m.remove());

      const to = document.querySelector(TO_SEL);
      if (!to) return;
      const col = to.closest(".columns-item") || to.parentElement;
      if (!col) return;

      const wrap = ctx.createElement("div", { class: "columns-item ose-qr-col" });
      const toggle = ctx.createElement("button", {
        type: "button",
        class: "ose-qr-toggle",
        title: "Quick date range",
        "aria-label": "Quick date range",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        html: CLOCK_SVG
      });
      wrap.appendChild(toggle);

      const menu = ctx.createElement("div", { class: "ose-qr-menu", role: "menu" });

      // LOBE stamp: the bee + wordmark above the range columns. Tagged .ose-lobe-mark
      // (pure decoration) so it vanishes when "Mark LOBE changes" is turned off.
      const brand = ctx.createElement("div", { class: "ose-qr-brand ose-lobe-mark" });
      brand.appendChild(OSEnhance.stamp.bee(document));
      brand.appendChild(ctx.createElement("span", { text: "LOBE quick range" }));
      menu.appendChild(brand);

      const cols = ctx.createElement("div", { class: "ose-qr-cols" });
      const sections = [
        { header: "Last", items: RELATIVE.map((r) => ({ label: r.label, run: () => applyLastHours(r.hours) })) },
        { header: "On", items: buildDays() }
      ];
      sections.forEach((section) => {
        const group = ctx.createElement("div", { class: "ose-qr-group" });
        group.appendChild(ctx.createElement("div", { class: "ose-qr-header", text: section.header }));
        section.items.forEach((it) => {
          const item = ctx.createElement("button", {
            type: "button",
            class: "ose-qr-item",
            role: "menuitem",
            text: it.label
          });
          ctx.on(item, "click", () => {
            close();
            it.run();
          });
          group.appendChild(item);
        });
        cols.appendChild(group);
      });
      menu.appendChild(cols);

      let open = false;

      function position() {
        const rect = toggle.getBoundingClientRect();
        const mw = menu.offsetWidth;
        let left = rect.left;
        if (left + mw > window.innerWidth - 8) {
          left = Math.max(8, window.innerWidth - mw - 8);
        }
        menu.style.top = rect.bottom + 4 + "px";
        menu.style.left = left + "px";
      }
      function onDocDown(e) {
        if (!menu.contains(e.target) && !toggle.contains(e.target)) close();
      }
      function onKey(e) {
        if (e.key === "Escape") { close(); toggle.focus(); }
      }
      // Close when the PAGE scrolls/resizes (the fixed menu would detach), but not
      // when the scroll happens inside the menu itself.
      function onReflow(e) {
        if (e && e.target && menu.contains(e.target)) return;
        close();
      }

      function openMenu() {
        if (open) return;
        open = true;
        menu.classList.add("ose-open"); // visible first so offsetWidth is real
        position();
        toggle.setAttribute("aria-expanded", "true");
        document.addEventListener("mousedown", onDocDown, true);
        document.addEventListener("keydown", onKey, true);
        window.addEventListener("scroll", onReflow, true);
        window.addEventListener("resize", onReflow, true);
      }
      function close() {
        if (!open) return;
        open = false;
        menu.classList.remove("ose-open");
        toggle.setAttribute("aria-expanded", "false");
        document.removeEventListener("mousedown", onDocDown, true);
        document.removeEventListener("keydown", onKey, true);
        window.removeEventListener("scroll", onReflow, true);
        window.removeEventListener("resize", onReflow, true);
      }

      ctx.on(toggle, "click", (e) => {
        e.preventDefault();
        open ? close() : openMenu();
      });

      ctx.append(document.body, menu); // cleanup removes the menu
      ctx.insertAfter(col, wrap);      // cleanup removes the button
      ctx.onCleanup(close);            // drop listeners if disabled while open
    }
  });
})();
