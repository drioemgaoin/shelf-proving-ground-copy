# T3 Rules

## interactive-states
**Source:** States
**Rule:** Every interactive element has: default, hover, focus-visible, active, disabled.

For each interactive element (button, link, input, select, checkbox, radio, toggle), verify all five states are visually distinct: default, hover, focus-visible, active, disabled. A violation is any interactive element missing a visible treatment for one or more states. Correct: each state is visually distinguishable from the others — hover shows a color or elevation change, focus-visible shows a focus ring, active shows a pressed effect, disabled is dimmed with pointer-events off.

---

## data-view-states
**Source:** States
**Rule:** Every data view has: loading, empty, error, populated.

For each data-driven view (lists, grids, detail panels), verify all four states render correctly: loading (skeleton or spinner), empty (empty-state message or CTA), error (error message with retry), populated (real content). A violation is any data view missing one or more states or showing a blank/broken screen for that state. Correct: each state is a designed, intentional screen — no raw fallbacks, no missing states.

---

## reserved-space-late-loading
**Source:** Layout
**Rule:** Late-loading content (images, async data) has reserved space.

During loading states (use ?fixture=slow), check that every image container, async data region, and skeleton placeholder has explicit dimensions or aspect-ratio so content does not shift when it loads. A violation is any late-loading area that causes visible layout jump or has no placeholder/skeleton reserving its space. Correct: every async content area shows a skeleton or placeholder of the same dimensions as the final content.

---

## visible-container-spacing
**Source:** Layout
**Rule:** Grid and list gaps produce visible spacing between items. Child elements do not overflow their grid/flex cells.

For each grid or list layout, verify that gaps between items are visually perceptible in both light and dark modes. Check that no child element overflows its container cell to cover the gap — look for cards, panels, or list items that appear to touch when the CSS specifies a gap. Compare row spacing to column spacing: if columns have visible gaps but rows do not, a child is likely overflowing vertically (common cause: height: 100% with padding and no box-sizing: border-box). A violation is any layout where declared gaps are visually absent or uneven between axes. Correct: gaps are uniformly visible between all adjacent items in both directions.

---

## overlay-position-matches-spec
**Source:** Anchored overlays
**Rule:** An anchored overlay is any element visually pinned to a specific position on its parent surface (badge in a card corner, close button on a dialog, notification dot on an icon). The spec description determines the positioning method.

For each overlay element (badge, indicator, dot, tag, close button) visible on a surface, check that its rendered position matches the spec description. If the spec says 'top-right', the element must be visually in the top-right corner of its surface, not the bottom-right or inline-end of a flow. A violation is any overlay whose rendered position does not match the position described in the spec or CLAUDE.md.

---

## design-intent-verification
**Source:** Spec fidelity
**Rule:** Visual QA must verify that rendered output matches the spec's design-intent descriptions in CLAUDE.md, not just the rules. A rendered component that satisfies all rules but contradicts the spec is a failure.

Read the product spec in CLAUDE.md. For each component described with visual intent (color, position, shape, layout, animation direction), verify the rendered output matches the description. Check: (1) color intent — if the spec names a color treatment (colored, accent, danger), the rendered element must not be neutral/gray, (2) position intent — if the spec names a position (top-right, bottom-center, right on desktop), the rendered element must be at that position, (3) shape intent — if the spec names a shape (pill, circle, rounded), the rendered element must have that shape, (4) behavior intent — if the spec names a behavior (auto-dismiss, slide from right), the behavior must match. A violation is any rendered component whose appearance contradicts a visual description in the spec, even if it passes all other rules.

---

## focus-management
**Source:** Accessibility floor (WCAG 2.2 AA)
**Rule:** Focus is always visible, never hidden under sticky elements. It moves into dialogs, is trapped while open, and returns to the trigger on close.

Tab through all interactive elements on the page. For each focused element, check that the focus ring is fully visible — not clipped, obscured by sticky headers/footers, or hidden behind overlapping elements. A violation is any focused element whose focus indicator is partially or fully hidden. Correct: every focus ring is fully visible with no occlusion from any layer.

---

## works-at-200-zoom
**Source:** Accessibility floor (WCAG 2.2 AA)
**Rule:** Works at 200% zoom.

Capture screenshots at 200% browser zoom (viewport scaled to half dimensions: 160×406 for mobile, 384×512 for tablet, 640×400 for desktop). Check that all content is readable, no text is clipped or overlapping, no interactive elements are unreachable or off-screen, and no horizontal scrollbar appears. A violation is any content that is truncated, overlapping, or inaccessible at 200% zoom. Correct: the page remains fully functional and readable with all content accessible.

---

## truncated-text-full-value
**Source:** Content
**Rule:** Truncated text always has a way to see the full value.

For each element with text-overflow: ellipsis or -webkit-line-clamp, check that hovering or tapping reveals the full text (tooltip, expanded view, or drawer). Use ?fixture=long to stress-test truncation. A violation is any truncated text with no disclosure mechanism — the user has no way to read the full value. Correct: every truncated element has a hover tooltip, tap-to-expand, or navigates to a detail view showing the full text.

---

## toast-pattern
**Source:** Product patterns
**Rule:** **Toasts**: bottom-center, 4 seconds, auto-dismiss. Used to confirm success (e.g. "Book added").

When a toast notification is visible, verify it appears at bottom-center of the viewport, auto-dismisses after approximately 4 seconds, and is used only for success confirmations (e.g., 'Book added'). A violation is a toast that appears in any other position, does not auto-dismiss, or is used for errors or warnings. Correct: toast appears bottom-center, disappears after ~4 seconds without user interaction.

---

## form-validation-pattern
**Source:** Product patterns
**Rule:** **Form validation**: validate on blur and on submit. Error text below the field, uses `--shelf-fgColor-danger`.

For each form field, verify that validation runs on blur (tab away from an invalid field shows error) and on submit (submitting with invalid fields shows all errors). Error text must appear below the field, not above or inline. A violation is a form that only validates on submit, only on blur, shows errors in the wrong position, or shows no error for invalid input. Correct: blur triggers per-field validation, submit triggers full-form validation, error text renders directly below its field.

---

## drawer-slide-direction
**Source:** Product patterns
**Rule:** **Drawer**: slides from right on desktop, from bottom on mobile. Uses `--shelf-bgColor-raised` and `--shelf-shadow-lg`. Backdrop uses `--shelf-bgColor-overlay`.

Open the drawer on desktop (>=1024px) and verify it slides in from the right edge. Open the drawer on mobile (<768px) and verify it slides up from the bottom as a bottom sheet. A violation is a drawer that slides from the wrong direction for the viewport, or appears without a slide animation. Correct: desktop drawer enters from the right, mobile drawer enters from the bottom.

---

## dialog-pattern
**Source:** Product patterns
**Rule:** **Dialog**: centered, focus-trapped, Escape closes. Uses `--shelf-bgColor-raised` and `--shelf-shadow-lg`.

When a dialog is open, verify it is visually centered both horizontally and vertically in the viewport. A violation is a dialog that is off-center, aligned to an edge, or positioned inconsistently across viewports. Correct: the dialog is centered in the viewport on all screen sizes.

---

### Monitoring Report (REQUIRED)

After evaluating all rules above, you MUST emit a structured report block at the end of your output. This block is parsed by the monitoring system to track rule effectiveness.

```
<!-- MONITOR_REPORT_START -->
{
  "evaluations": [
    { "ruleId": "<rule-id>", "outcome": "passed|violation_found", "file": "<file-or-null>", "details": { "description": "<brief>" } }
  ]
}
<!-- MONITOR_REPORT_END -->
```

Include one entry per rule you evaluated. Use "passed" if the rule was satisfied, "violation_found" if you detected a violation. The "file" field is the path of the violating file (or null for visual checks). The "details.description" is a brief explanation.
