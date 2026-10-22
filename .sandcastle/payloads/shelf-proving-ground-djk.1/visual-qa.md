# T3 Rules

## interactive-states
**Source:** .claude/rules/ui-base.md > States
**Rule:** Every interactive element has: default, hover, focus-visible, active, disabled.

For each interactive element (button, link, input, select, checkbox, radio, toggle), verify all five states are visually distinct: default, hover, focus-visible, active, disabled. A violation is any interactive element missing a visible treatment for one or more states. Correct: each state is visually distinguishable from the others — hover shows a color or elevation change, focus-visible shows a focus ring, active shows a pressed effect, disabled is dimmed with pointer-events off.

---

## data-view-states
**Source:** .claude/rules/ui-base.md > States
**Rule:** Every data view has: loading, empty, error, populated.

For each data-driven view (lists, grids, detail panels), verify all four states render correctly: loading (skeleton or spinner), empty (empty-state message or CTA), error (error message with retry), populated (real content). A violation is any data view missing one or more states or showing a blank/broken screen for that state. Correct: each state is a designed, intentional screen — no raw fallbacks, no missing states.

---

## reserved-space-late-loading
**Source:** .claude/rules/ui-base.md > Layout
**Rule:** Late-loading content (images, async data) has reserved space.

During loading states (use ?fixture=slow), check that every image container, async data region, and skeleton placeholder has explicit dimensions or aspect-ratio so content does not shift when it loads. A violation is any late-loading area that causes visible layout jump or has no placeholder/skeleton reserving its space. Correct: every async content area shows a skeleton or placeholder of the same dimensions as the final content.

---

## visible-container-spacing
**Source:** .claude/rules/ui-base.md > Layout
**Rule:** Grid and list gaps produce visible spacing between items. Child elements do not overflow their grid/flex cells.

For each grid or list layout, verify that gaps between items are visually perceptible in both light and dark modes. Check that no child element overflows its container cell to cover the gap — look for cards, panels, or list items that appear to touch when the CSS specifies a gap. Compare row spacing to column spacing: if columns have visible gaps but rows do not, a child is likely overflowing vertically (common cause: height: 100% with padding and no box-sizing: border-box). A violation is any layout where declared gaps are visually absent or uneven between axes. Correct: gaps are uniformly visible between all adjacent items in both directions.

---

## focus-management
**Source:** .claude/rules/ui-base.md > Accessibility floor (WCAG 2.2 AA)
**Rule:** Focus is always visible, never hidden under sticky elements. It moves into dialogs, is trapped while open, and returns to the trigger on close.

Tab through all interactive elements on the page. For each focused element, check that the focus ring is fully visible — not clipped, obscured by sticky headers/footers, or hidden behind overlapping elements. A violation is any focused element whose focus indicator is partially or fully hidden. Correct: every focus ring is fully visible with no occlusion from any layer.

---

## works-at-200-zoom
**Source:** .claude/rules/ui-base.md > Accessibility floor (WCAG 2.2 AA)
**Rule:** Works at 200% zoom.

Capture screenshots at 200% browser zoom (viewport scaled to half dimensions: 160×406 for mobile, 384×512 for tablet, 640×400 for desktop). Check that all content is readable, no text is clipped or overlapping, no interactive elements are unreachable or off-screen, and no horizontal scrollbar appears. A violation is any content that is truncated, overlapping, or inaccessible at 200% zoom. Correct: the page remains fully functional and readable with all content accessible.

---

## truncated-text-full-value
**Source:** .claude/rules/ui-base.md > Content
**Rule:** Truncated text always has a way to see the full value.

For each element with text-overflow: ellipsis or -webkit-line-clamp, check that hovering or tapping reveals the full text (tooltip, expanded view, or drawer). Use ?fixture=long to stress-test truncation. A violation is any truncated text with no disclosure mechanism — the user has no way to read the full value. Correct: every truncated element has a hover tooltip, tap-to-expand, or navigates to a detail view showing the full text.

---

## toast-pattern
**Source:** .claude/rules/ui-project.md > Product patterns
**Rule:** **Toasts**: bottom-center, 4 seconds, auto-dismiss. Used to confirm success (e.g. "Book added").

When a toast notification is visible, verify it appears at bottom-center of the viewport, auto-dismisses after approximately 4 seconds, and is used only for success confirmations (e.g., 'Book added'). A violation is a toast that appears in any other position, does not auto-dismiss, or is used for errors or warnings. Correct: toast appears bottom-center, disappears after ~4 seconds without user interaction.

---

## form-validation-pattern
**Source:** .claude/rules/ui-project.md > Product patterns
**Rule:** **Form validation**: validate on blur and on submit. Error text below the field, uses `--shelf-fgColor-danger`.

For each form field, verify that validation runs on blur (tab away from an invalid field shows error) and on submit (submitting with invalid fields shows all errors). Error text must appear below the field, not above or inline. A violation is a form that only validates on submit, only on blur, shows errors in the wrong position, or shows no error for invalid input. Correct: blur triggers per-field validation, submit triggers full-form validation, error text renders directly below its field.

---

## drawer-slide-direction
**Source:** .claude/rules/ui-project.md > Product patterns
**Rule:** **Drawer**: slides from right on desktop, from bottom on mobile. Uses `--shelf-bgColor-raised` and `--shelf-shadow-lg`. Backdrop uses `--shelf-bgColor-overlay`.

Open the drawer on desktop (>=1024px) and verify it slides in from the right edge. Open the drawer on mobile (<768px) and verify it slides up from the bottom as a bottom sheet. A violation is a drawer that slides from the wrong direction for the viewport, or appears without a slide animation. Correct: desktop drawer enters from the right, mobile drawer enters from the bottom.

---

## dialog-pattern
**Source:** .claude/rules/ui-project.md > Product patterns
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
