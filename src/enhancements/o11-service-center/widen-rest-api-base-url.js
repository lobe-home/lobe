// Enhancement: Widen the Base URL field on the REST Web Reference edit page.
//
// The field sits in a fixed-size wrapper:
//   <div class="OSInline" style="width:300px; height:32px">
//     <span ...InputAjaxRfrsh><input ...BaseURLInput> <validation msg></span>
//   </div>
// Widening only the <input> makes it overflow that 300px/32px box, so anything
// after it (a copy button, the validation message) wraps and gets clipped. So we
// also relax the WRAPPER: let it size to its content (width:auto) and grow
// vertically (height:auto), and push the validation message onto its own line so
// it doesn't stretch the row. The wrapper then fits exactly "input (+ trailing
// control)", whatever the input's width.
//
// This wrapper relaxation is shared verbatim with the copy-button enhancement so
// that each one works correctly on its own, regardless of the other being on.
//
// The full ids (e.g. wt82_..._wtBaseURLInput) have volatile, auto-generated wt*
// segments, so we match only the stable "BaseURLInput" tail with an ends-with
// selector, and select the wrapper via :has(). The widening is CSS; a small apply()
// adds the shared LOBE field accent (.ose-lobe-field). Both toggle off cleanly (no
// reload) — the <style> is removed and the class is dropped via ctx.

OSEnhance.register({
  id: "widen-rest-api-base-url",
  title: "Widen REST API Base URL input",
  description:
    "On consumed API page, widen the Base URL input (300 -> 800px)." +
    "Targets the field by its stable id suffix, wtBaseURLInput.",

  // Any Service Center REST Web Reference edit page, on any OutSystems host.
  match: /\/servicecenter\/eSpace_RestWebReference_Edit\.aspx/i,

  // Match only the id's stable tail; the leading wt* segments are auto-generated.
  css: `
    /* --- Shared wrapper relaxation (identical in the copy-button enhancement) ---
       Drop the fixed 300px/32px box: let the wrapper size to its content and grow
       vertically, and put the validation message on its own line so it doesn't
       stretch the row. :has() picks only our field's wrapper, not the label's. */
    .OSInline:has(input[id$="BaseURLInput"]) {
      width: auto !important;
      height: auto !important;
    }
    .OSInline:has(input[id$="BaseURLInput"]) .ValidationMessage {
      display: block !important;
    }
    /* --- This enhancement's own change: widen the input. --- */
    input[id$="BaseURLInput"] {
      width: 800px !important;
    }
  `,

  // Widening is otherwise invisible, so mark the field with the shared LOBE input
  // accent (the gold left bar in .ose-lobe-field) — the same accent used on every
  // field LOBE touches. Added via ctx so it reverts live when switched off.
  apply(ctx) {
    for (const input of document.querySelectorAll('input[id$="BaseURLInput"]')) {
      ctx.addClass(input, "ose-lobe-field");
    }
  }
});
