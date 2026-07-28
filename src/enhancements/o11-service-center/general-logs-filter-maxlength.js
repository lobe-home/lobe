// Enhancement: Raise a filter input's maxlength on the General/Error Logs pages.
//
// On General_Logs.aspx and Error_Logs.aspx a column filter <input> (the message/text
// filter) is capped at maxlength=50, too short to paste longer search values into. This
// bumps it to 500. Both pages place that filter in the same column, so its input shares
// the stable id tail "_wtContentColumn3_wtInput1".
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
    // id kept as-is (not renamed to a generic name) so existing opt-ins — stored by
    // id — keep working now that it also covers Error Logs.
    id: "general-logs-filter-maxlength",
    title: "Longer filter field on General & Error Logs",
    description:
      "On the General Logs and Error Logs pages, raises the max length of the message " +
      "column filter input from 50 to 500 characters, so you can paste longer search values.",

    match: /\/servicecenter\/(?:General|Error)_Logs\.aspx/i,

    // A light LOBE touch on the field comes from the shared .ose-lobe-field class
    // (the gold left bar — the same accent used on every field LOBE affects), added
    // in apply() below.
    apply(ctx) {
      for (const input of document.querySelectorAll(INPUT_SEL)) {
        ctx.addClass(input, "ose-lobe-field"); // shared LOBE accent; removed on revert
        if (input.getAttribute("maxlength") === NEW_MAX) continue; // idempotent
        ctx.setAttr(input, "maxlength", NEW_MAX); // restores the original on revert
      }
    }
  });
})();
