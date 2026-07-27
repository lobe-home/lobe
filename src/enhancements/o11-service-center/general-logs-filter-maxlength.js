// Enhancement: Raise a filter input's maxlength on the General Logs page.
//
// On General_Logs.aspx a column filter <input> is capped at maxlength=50, too short to
// paste longer search values into. This bumps it to 500.
//
// OutSystems input ids look like "wt28_..._wtContentColumn3_wtInput1": the leading
// "wt<n>_" parts are auto-generated and can change when the app is republished, so we
// match on the stable, developer-named tail only. The page re-renders its filter row
// via AJAX, so the runner re-invokes apply() on DOM mutations; the change is idempotent
// and routed through ctx, so switching the enhancement off restores the original
// maxlength — no reload.

(function () {
  // Match the stable tail of the id (skips the volatile "wt<n>_" prefix). Shorten to
  // '[id$="_wtInput1"]' if the widget ever gets renamed — though that's less specific.
  const INPUT_SEL = 'input[id$="_wtContentColumn3_wtInput1"]';
  const NEW_MAX = "500";

  OSEnhance.register({
    id: "general-logs-filter-maxlength",
    title: "Longer filter field on General Logs",
    description:
      "On the General Logs page, raises the max length of the column filter input from " +
      "50 to 500 characters, so you can paste longer search values.",

    match: /\/servicecenter\/General_Logs\.aspx/i,

    // A light LOBE touch on the field: honey/gold accent + focus glow (LOBE palette,
    // see popup.css). A full, reusable stamp/branding pass is planned separately.
    css: `
      ${INPUT_SEL} {
        border: 1.5px solid #e7a92b !important;   /* LOBE gold */
        background: #fffdf7 !important;           /* LOBE off-white */
        border-radius: 6px !important;
      }
      ${INPUT_SEL}:focus {
        outline: none !important;
        border-color: #a9781a !important;         /* LOBE deep gold */
        box-shadow: 0 0 0 3px rgba(231, 169, 43, 0.25) !important; /* honey glow */
      }
    `,

    apply(ctx) {
      for (const input of document.querySelectorAll(INPUT_SEL)) {
        if (input.getAttribute("maxlength") === NEW_MAX) continue; // idempotent
        ctx.setAttr(input, "maxlength", NEW_MAX); // restores the original on revert
      }
    }
  });
})();
