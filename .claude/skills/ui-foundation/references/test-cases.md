# UI Foundation test cases

Run each scenario in a fresh `/ui-foundation` session. Give the persona answers at the interview step. Check whether the generated accent lands in the expected family.

A hit in the "Red flag" column means the interview failed to constrain the output.

| # | Scenario | Personality adjectives | Expected accent family | Red flag |
|---|----------|----------------------|----------------------|----------|
| 1 | **Personal reading list** (Shelf) | cozy, personal, bookish | Warm: amber, terracotta, sage, deep teal | Navy / corporate blue |
| 2 | **Finance dashboard** | trustworthy, precise, clean | Cool blue or teal (legit here) | Pink, orange |
| 3 | **Kids' game** | fun, colorful, bouncy | Vivid warm: orange, magenta, lime | Muted, navy, gray |
| 4 | **Developer tool** | sharp, fast, no-nonsense | Electric: violet, cyan, green | Pastel, warm brown |
| 5 | **Wellness / meditation app** | calm, natural, breathing room | Muted earth: sage, sand, dusty rose | Saturated, sharp |
| 6 | **E-commerce storefront** | reliable, inviting, action-oriented | Action color: orange, green CTA | Gray, muted |

## How to evaluate

1. Start `/ui-foundation` in setup mode.
2. At the personality question, give the adjectives from column 3.
3. Accept recommended answers for all other questions.
4. Check the generated `--<ns>-base-accent-*` primitives in `tokens.css`.
5. **Pass**: accent hue falls in the expected family. **Fail**: accent hue matches a red flag.

## What a failure means

If 2+ scenarios produce the same hue family (especially blue), the interview is not differentiating. Likely causes:
- The template still contains literal color values (bias anchor)
- The personality question is not early enough or not weighted heavily enough
- The bias-check rule is missing or not firing
