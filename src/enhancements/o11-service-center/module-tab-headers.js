// Enhancement: A second line of summary text under each Module tab title.
//
// On Service Center's Module detail page (eSpace_Edit.aspx) the detail tabs —
// Versions, Dependencies, Single Sign-On, Solutions, Integrations, Tenants, Site
// Properties, Timers, Operation — are just bare titles. Their panels all render in
// the DOM at once (only aria-hidden toggles), so the interesting figure on each tab
// can be surfaced up in its header without opening it. This adds a small muted line
// under each title with a per-tab summary, e.g. Versions -> "last v48 · running v46",
// Dependencies -> "7 producers · 0 consumers" + "⚠ 1 producer outdated".
//
// Only the COLOUR of the summary is the LOBE stamp: with "Mark LOBE changes" off the
// line stays (it's useful info, not decoration) in the page's own muted colour; with
// marking on it takes LOBE's gold ink. Size/layout are ungated so the line is present
// either way.
//
// Robustness: OutSystems' wt* ids are volatile, so every reader anchors on stable
// hooks — the tab's `data-tab` value, table id suffixes (id$="…"), and table-header
// LABEL text (never a fixed column index; e.g. the Versions "Verified" column carries
// the same tick icon as "Published", so the running version is found by the
// "Published" header, not "a row with a tick"). Tabs can be absent on a given module;
// we drive off the header items that are actually present and skip any tab with no
// reader or no panel — never an error. apply() is idempotent (a per-item key attr) and
// routed through ctx, and the runner re-runs it on DOM mutations, so async panels
// (Site Properties loads late) get their line as soon as the data arrives.

(function () {
  // Count the real data rows in an OutSystems list table. Its "empty" state is a
  // single <td colspan> placeholder row ("No items to show…"), which has one cell;
  // real rows have several — so cell count separates them without matching on the
  // (localisable) placeholder text.
  function countRows(table) {
    if (!table || !table.tBodies || !table.tBodies[0]) return 0;
    let n = 0;
    for (const r of table.tBodies[0].rows) if (r.cells.length > 1) n++;
    return n;
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many);
  }

  // --- Per-tab readers. Each takes the tab's panel element and returns the summary as
  // a string, an array of strings (one per subtitle line), or "" for no line. ---
  const READERS = {
    // Versions: surface the exception where the published (running) version isn't the
    // latest uploaded one. latest = max Version number; running = the Version whose
    // "Published" column carries the tick (located by header label, since "Verified"
    // uses the same tick icon). Quiet when they match.
    "tab-Versions"(panel) {
      const table = panel.querySelector('table[id$="wtListVersions"]');
      if (!table || !table.tHead || !table.tBodies[0]) return "";
      const heads = [...table.tHead.rows[0].cells].map((th) => th.textContent.trim());
      const verCol = heads.indexOf("Version");
      const pubCol = heads.indexOf("Published");
      if (verCol < 0) return "";
      let latest = null;
      let running = null;
      for (const row of table.tBodies[0].rows) {
        const cell = row.cells[verCol];
        if (!cell) continue;
        const num = parseInt(cell.textContent.trim(), 10);
        if (!Number.isFinite(num)) continue;
        if (latest === null || num > latest) latest = num;
        if (pubCol >= 0 && row.cells[pubCol] && row.cells[pubCol].querySelector(".osicon-tick")) {
          if (running === null || num > running) running = num;
        }
      }
      if (latest === null) return "";
      if (running === null) return "last v" + latest + " · not published";
      if (running === latest) return "v" + latest; // running IS the latest — nothing to flag
      return "last v" + latest + " · running v" + running;
    },

    // Dependencies: line 1 = producer/consumer counts (explicit zeros). Line 2 appears
    // only when something is outdated, and mirrors line 1's two columns so it stacks
    // underneath — `<outdated producers> outdated · <outdated consumers> outdated`, e.g.
    // "1 outdated · 0 outdated" under "7 producers · 2 consumers". The two sides mean
    // opposite things: an outdated PRODUCER means this module is stale and should be
    // republished; an outdated CONSUMER means downstream modules haven't caught up. The
    // flag is a red text cell after Published Status (the Published-Status ICON stays
    // "OK" even when outdated, so it's ignored); its word ("outdated") is read live.
    "tab-Dependencies"(panel) {
      const producers = panel.querySelector('table[id$="wtTableReferences"]');
      const consumers = panel.querySelector('table[id$="wtTableConsumers"]');
      const p = countRows(producers);
      const c = countRows(consumers);

      let label = "";
      const outdated = (table) => {
        if (!table || !table.tBodies || !table.tBodies[0]) return 0;
        let n = 0;
        for (const r of table.tBodies[0].rows) {
          const flag = r.querySelector('span[class*="text-error"]');
          if (flag && flag.textContent.trim()) {
            n++;
            if (!label) label = flag.textContent.replace(/[() ]/g, " ").trim();
          }
        }
        return n;
      };
      const pOut = outdated(producers);
      const cOut = outdated(consumers);

      const lines = [p + " producers · " + c + " consumers"];
      // Only when at least one side is outdated; mirror line 1's two columns so it lines
      // up underneath (producer count · consumer count, each tagged with the live word).
      if (pOut || cOut) {
        const word = label || "outdated";
        lines.push(pOut + " " + word + " · " + cOut + " " + word);
      }
      return lines;
    },

    // Single Sign-On: the module's User Provider, from the panel's lead sentence
    // ("This Module's User Provider is <X> and shares…"). The shared-modules list below
    // it is paginated and not actionable, so it's intentionally left out.
    "tab-UnifiedSet"(panel) {
      const m = /User Provider is\s+(.+?)\s+and shares/i.exec(panel.textContent || "");
      return m ? "provider: " + m[1].trim() : "";
    },

    // Solutions referencing this module.
    "tab-Solutions"(panel) {
      const n = countRows(panel.querySelector('table[id$="wtListSolutions"]'));
      return n ? plural(n, "solution", "solutions") : "none";
    },

    // Integrations: REST vs SOAP (protocol axis, summing exposed + consumed), with SAP
    // appended only when present. "none" when the module exposes/consumes nothing.
    "tab-WebServices"(panel) {
      const rows = (suffix) => countRows(panel.querySelector('table[id$="' + suffix + '"]'));
      const rest = rows("wtListExposedRestAPI") + rows("wtListRestWebReference");
      const soap = rows("wtListWebService") + rows("wtListWebReference");
      const sap = rows("wtListSapConnections");
      if (rest + soap + sap === 0) return "none";
      let s = rest + " REST · " + soap + " SOAP";
      if (sap > 0) s += " · " + sap + " SAP";
      return s;
    },

    // Tenants: the ENABLED tenants (rows whose Enabled column carries the tick). When
    // there are only one or two, name them (more useful than a bare number); with three
    // or more, just the count.
    "tab-Tenants"(panel) {
      const table = panel.querySelector('table[id$="wtListTenants"]');
      if (!table || !table.tBodies || !table.tBodies[0]) return "";
      const names = [];
      for (const r of table.tBodies[0].rows) {
        if (r.cells.length <= 1) continue; // skip the empty-state placeholder row
        if (!r.querySelector(".osicon-tick")) continue; // enabled only
        const link = r.querySelector("a");
        const name = (link ? link.textContent : r.cells[2] ? r.cells[2].textContent : "").trim();
        if (name) names.push(name);
      }
      if (names.length === 0) return "none";
      if (names.length < 3) return names.join(" · ");
      return names.length + " enabled";
    },

    // Site Properties (loads asynchronously — no line until its table arrives).
    "tab-SiteProperties"(panel) {
      const table = panel.querySelector('table[id*="SiteProperties"], table[id$="SSP"]');
      if (!table) return "";
      const n = countRows(table);
      return n ? plural(n, "property", "properties") : "none";
    },

    // Timers defined in this module.
    "tab-Timers"(panel) {
      const n = countRows(panel.querySelector('table[id$="wtListSharedTimers"]'));
      return n ? plural(n, "timer", "timers") : "none";
    }

    // tab-Runtime (Operation): intentionally no summary.
  };

  OSEnhance.register({
    id: "module-tab-headers",
    title: "Summary line under Module tabs",
    description:
      "On a Module's detail page, adds a small summary line under each tab title " +
      "(running vs latest version, producer/consumer counts and outdated flags, " +
      "integration protocols, tenant and timer counts, and so on).",

    match: /\/servicecenter\/eSpace_Edit\.aspx/i,

    css: `
      /* Stretch the tab items to equal height (the tallest tab — e.g. Dependencies with
         a "1 outdated · 0 outdated" second line) instead of each sizing to its own
         content. Two things depend on this: (a) every item's TOP is the row top, so all
         titles share one baseline even when one tab is taller; and (b) every item's
         BOTTOM reaches the header's grey bottom line, so the site's blue active-tab
         underline (drawn at the item's bottom edge) sits back on that grey line rather
         than floating above it. The items keep their content top-aligned (column flow),
         so the extra height on shorter tabs is just empty space below the text. */
      .tabs-header { align-items: stretch !important; }

      /* Functional layout (ungated): stack the summary line(s) under the tab title, and
         let each item stretch (height:auto + align-self:stretch) so the row above can
         equalise their heights. Only header items we've actually stamped become a
         column, so untouched tabs are unaffected. */
      .tabs-header-item:has(> .ose-tab-subtitle) {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        align-self: stretch !important;
        vertical-align: top !important;
        height: auto !important;
      }

      /* The summary line itself. Size/spacing/type are functional (always applied);
         only the COLOUR is the LOBE stamp. Base = the page's own colour, muted — so
         with marks off the line stays useful without imposing a LOBE look. */
      .ose-tab-subtitle {
        display: block;
        margin-top: 2px;
        font-size: 11px;
        font-weight: 400;
        line-height: 1.25;
        letter-spacing: normal;
        text-transform: none;
        white-space: nowrap;
        color: inherit;
        opacity: 0.6;
      }
      /* LOBE tint: gold ink while marking is on (i.e. <html> has no .ose-marks-off). */
      :root:not(.ose-marks-off) .ose-tab-subtitle {
        color: var(--lobe-ink);
        opacity: 1;
      }
    `,

    // ctx-routed so the runner removes the injected lines (and restores the marker
    // attribute) when the enhancement is switched off — no page reload.
    apply(ctx) {
      const header = document.querySelector(".tabs-header");
      const content = document.querySelector(".tabs-content");
      if (!header || !content) return;

      for (const item of header.querySelectorAll(".tabs-header-item[data-tab]")) {
        const tab = item.getAttribute("data-tab");
        const reader = READERS[tab];

        let lines = [];
        if (reader) {
          const panel = content.querySelector(
            '.tabs-content-item[data-tab="' + (window.CSS && CSS.escape ? CSS.escape(tab) : tab) + '"]'
          );
          if (panel) {
            const out = reader(panel);
            lines = typeof out === "string" ? (out ? [out] : []) : out;
          }
        }

        // Every tab gets at least one line so the whole row shares the two-line
        // layout and the titles stay on one baseline — even tabs with nothing to say
        // (Operation always; Site Properties until it's visited). An invisible nbsp
        // just holds the row height; it shows no text.
        if (lines.length === 0) lines = ["\u00a0"];

        // Rebuild only when the computed summary actually changed (keeps the
        // MutationObserver from looping and the cleanup list from growing).
        const key = lines.join("\n");
        if (item.getAttribute("data-ose-subtitle") === key) continue;

        item.querySelectorAll(":scope > .ose-tab-subtitle").forEach((n) => n.remove());
        for (const line of lines) {
          ctx.append(item, ctx.createElement("div", { class: "ose-tab-subtitle", text: line }));
        }
        ctx.setAttr(item, "data-ose-subtitle", key);
      }
    }
  });
})();
