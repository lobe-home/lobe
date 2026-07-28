// Enhancement: Show the role's user count as a text label instead of an avatar pile.
//
// On the ODC Portal "organization role" page, the users holding a role are shown as a
// Neo AvatarGroup — a row of avatar circles ending in a "99+" counter, with the real
// figure ("111 users have this role") tucked away in a hover tooltip. This surfaces
// that figure directly: it hides the avatar pile, replaces the "99+" counter with the
// tooltip's text, hides the now-redundant tooltip, and dresses the result up as a
// little LOBE "stamp" — the bee mascot plus LOBE's honey/gold palette. (Showing the
// mascot on the page needs assets/lobe.svg listed under web_accessible_resources.)
//
// Only the COLOURS + mascot are the stamp; the label's size stays either way. With
// "Mark LOBE changes" off, the honey/gold surface simply isn't applied, so the label
// keeps the page's own background/text colour — correct in the ODC Portal's dark theme
// too, rather than an imposed light chip. LOBE adds no colour of its own when off.
//
// The page loads the avatars and count asynchronously (Neo SkeletonLoader), so the
// counter and its tooltip text only appear once data arrives. The runner re-invokes
// apply() on DOM mutations; every step is idempotent (a marker attribute) and routed
// through `ctx`, so switching the enhancement off restores the original "99+" text,
// unhides the tooltip, and drops the marker — no reload.

(function () {
  // The tooltip bubble belonging to an avatar-group counter. It normally lives inside
  // the same .ds-tooltip block; if the tooltip has been moved elsewhere, fall back to
  // matching it by the block's id prefix ("…-Wrapper" -> "…-TooltipWrapper").
  function relatedTooltip(counter) {
    const block = counter.closest(".ds-tooltip");
    if (!block) return null;
    const inside = block.querySelector(".ds-tooltip-tooltip");
    if (inside) return inside;
    const prefix = block.id && block.id.replace(/-Wrapper$/, "");
    return prefix ? document.getElementById(prefix + "-TooltipWrapper") : null;
  }

  OSEnhance.register({
    id: "avatar-group-role-summary",
    title: "Role users as a text summary",
    description:
      "On the organization role page, hides the avatar pile and its hover tooltip and " +
      "shows the full \"... users have this role\" count as a larger label in place of " +
      "the \"99+\" counter.",

    // Only the singular role DETAIL page (…/organizationrole?roleid=…), not the plural
    // LIST page (…/organizationroles). The (?!s) stops "organizationrole" from also
    // matching inside "organizationroles".
    match: /\/usersaccess\/organizationrole(?!s)/i,

    css: `
      /* Hide the avatar pile — the summary text stands in for it. */
      .avatar-group-list { display: none !important; }

      /* Reshape the "99+" counter into a readable summary label. This block is the
         FUNCTIONAL part — size, SHAPE, layout and type so the full count fits — and
         applies whether or not the stamp is on, so the shape stays constant either way.
         (The native counter is a round badge; stretched to the text it goes elliptical,
         so we pin border-radius here to keep the same rounded-rectangle in both states.)
         No colours here, so with marks off the label keeps the page's OWN background/
         text colour (correct in ODC Portal's dark theme too); nothing is imposed. */
      .avatar-group-counter {
        display: inline-flex !important;
        align-items: center !important;
        gap: 7px !important;
        width: auto !important;
        min-width: 340px !important;             /* fixed minimum width */
        height: auto !important;
        padding: 6px 30px !important;
        border-radius: 18px !important;          /* shape — kept constant on/off */
        overflow: visible !important;
        justify-content: center !important;      /* centre the bee + text in the wider chip */
        white-space: nowrap !important;
        font-size: 16px !important;
        font-weight: 700 !important;
        letter-spacing: 0.02em !important;       /* widens the text itself a touch */
        line-height: 1.5 !important;
      }
      .avatar-group-counter > span { font-size: inherit !important; color: inherit !important; }

      /* The LOBE stamp — the coloured surface ONLY — while marking is on (i.e. <html>
         has no .ose-marks-off): the honey/gold fill, border and shadow (via the shared
         --lobe-* palette). With marks off none of it applies, so the label shows in the
         page's native colours — same shape/size, just no LOBE colour. */
      :root:not(.ose-marks-off) .avatar-group-counter {
        border: 2px solid var(--lobe-gold) !important;
        background: var(--lobe-honey) !important;
        color: var(--lobe-ink) !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14) !important;
      }
      /* Bump the shared bee (.ose-lobe-stamp, 18px) up for this larger chip. */
      .avatar-group-counter .ose-lobe-stamp { width: 22px !important; height: 22px !important; }
    `,

    // ctx-routed so the runner can restore the counter text, unhide the tooltip, and
    // remove the marker when this is switched off — no reload.
    apply(ctx) {
      for (const counter of document.querySelectorAll(".avatar-group-counter")) {
        if (counter.hasAttribute("data-ose-role-summary")) continue; // idempotent

        const tip = relatedTooltip(counter);
        const text = tip && tip.textContent.trim();
        if (!text) continue; // tooltip/text not loaded yet — retry on next mutation

        const span = counter.querySelector("span[data-expression]") || counter;
        const prev = span.textContent;
        span.textContent = text;
        ctx.onCleanup(() => { span.textContent = prev; });

        // Stamp the LOBE bee in front of the text (shared mascot factory).
        const stamp = OSEnhance.stamp.bee(document);
        counter.insertBefore(stamp, counter.firstChild);
        ctx.onCleanup(() => stamp.remove());

        ctx.setStyle(tip, "display", "none", "important"); // hide the related tooltip
        ctx.setAttr(counter, "data-ose-role-summary", "1"); // marker (cleaned on revert)
      }
    }
  });
})();
