/**
 * Custom stylelint plugin with five rules:
 *
 * 1. shelf/keyframes-in-layer — @keyframes must be nested inside @layer.
 * 2. shelf/animation-properties — only transform and opacity allowed inside @keyframes.
 * 3. shelf/transition-properties — transition-property may only target transform/opacity.
 * 4. shelf/motion-token-values — duration and easing must use var() tokens, not raw values.
 * 5. shelf/viewport-tokens — @media queries must use @custom-media tokens, not raw breakpoints.
 *
 * See CODING_STANDARDS.md > Components and ui-base.md > Motion / Layout.
 */
import stylelint from 'stylelint';

const { createPlugin, utils } = stylelint;

// ─── Rule 1: keyframes-in-layer ─────────────────────────────────────

const keyframesRuleName = 'shelf/keyframes-in-layer';
const keyframesMessages = utils.ruleMessages(keyframesRuleName, {
  rejected: '@keyframes must be inside @layer. See CODING_STANDARDS.md > Components.',
});

const keyframesRule = (primary) => {
  return (root, result) => {
    if (!primary) return;

    root.walkAtRules('keyframes', (atRule) => {
      let parent = atRule.parent;
      let insideLayer = false;
      while (parent) {
        if (parent.type === 'atrule' && parent.name === 'layer') {
          insideLayer = true;
          break;
        }
        parent = parent.parent;
      }
      if (!insideLayer) {
        utils.report({
          message: keyframesMessages.rejected,
          node: atRule,
          result,
          ruleName: keyframesRuleName,
        });
      }
    });
  };
};
keyframesRule.meta = { url: '' };

// ─── Rule 2: animation-properties ───────────────────────────────────

const animPropsRuleName = 'shelf/animation-properties';
const animPropsMessages = utils.ruleMessages(animPropsRuleName, {
  rejected: (prop) =>
    `Only transform and opacity allowed in @keyframes, found: ${prop}. See ui-base.md > Motion.`,
});

const ALLOWED_KEYFRAME_PROPS = new Set(['transform', 'opacity']);

const animPropsRule = (primary) => {
  return (root, result) => {
    if (!primary) return;

    root.walkAtRules('keyframes', (atRule) => {
      atRule.walkDecls((decl) => {
        if (!ALLOWED_KEYFRAME_PROPS.has(decl.prop)) {
          utils.report({
            message: animPropsMessages.rejected(decl.prop),
            node: decl,
            result,
            ruleName: animPropsRuleName,
          });
        }
      });
    });
  };
};
animPropsRule.meta = { url: '' };

// ─── Rule 3: transition-properties ──────────────────────────────────

const transPropsRuleName = 'shelf/transition-properties';
const transPropsMessages = utils.ruleMessages(transPropsRuleName, {
  rejected: (prop) =>
    `Only transform and opacity may be transitioned, found: ${prop}. See ui-base.md > Motion.`,
});

const ALLOWED_TRANSITION_PROPS = new Set(['transform', 'opacity', 'none']);

const transPropsRule = (primary) => {
  return (root, result) => {
    if (!primary) return;

    root.walkDecls((decl) => {
      // Check `transition-property` declarations.
      if (decl.prop === 'transition-property') {
        for (const raw of decl.value.split(',')) {
          const prop = raw.trim();
          if (prop && !ALLOWED_TRANSITION_PROPS.has(prop)) {
            utils.report({
              message: transPropsMessages.rejected(prop),
              node: decl,
              result,
              ruleName: transPropsRuleName,
            });
          }
        }
        return;
      }

      // Check `transition` shorthand — the property name is always the first
      // non-numeric, non-time, non-easing token in each comma-separated segment.
      if (decl.prop === 'transition') {
        for (const segment of decl.value.split(',')) {
          const tokens = segment.trim().split(/\s+/);
          // The property name is the first token that isn't a duration/delay
          // (contains digits or 'ms'/'s'), an easing keyword, or a cubic-bezier.
          const timingRe = /^(\d|\.)|^cubic-bezier|^steps\(/;
          const easingKeywords = new Set([
            'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear',
            'step-start', 'step-end',
          ]);
          const propName = tokens.find(
            (t) => !timingRe.test(t) && !easingKeywords.has(t),
          );
          if (propName && !ALLOWED_TRANSITION_PROPS.has(propName)) {
            utils.report({
              message: transPropsMessages.rejected(propName),
              node: decl,
              result,
              ruleName: transPropsRuleName,
            });
          }
        }
      }
    });
  };
};
transPropsRule.meta = { url: '' };

// ─── Rule 4: motion-token-values ────────────────────────────────────

const motionTokenRuleName = 'shelf/motion-token-values';
const motionTokenMessages = utils.ruleMessages(motionTokenRuleName, {
  rejected: (prop) =>
    `${prop} must use a var(--shelf-motion-*) token, not a raw value. See ui-base.md > Motion.`,
});

// Properties that carry duration or easing values and must use tokens.
const DURATION_PROPS = new Set([
  'transition-duration', 'animation-duration',
  'transition-delay', 'animation-delay',
  'transition-timing-function', 'animation-timing-function',
]);

// Raw time values: 200ms, 0.3s, 0s, etc.
const RAW_TIME_RE = /^\d+(\.\d+)?(ms|s)$/;

// Raw easing: keywords or cubic-bezier/steps.
const RAW_EASING_RE = /^(ease|ease-in|ease-out|ease-in-out|linear|cubic-bezier\(|steps\()/;

const motionTokenRule = (primary) => {
  return (root, result) => {
    if (!primary) return;

    root.walkDecls((decl) => {
      // Check longhand duration/easing properties.
      if (DURATION_PROPS.has(decl.prop)) {
        const val = decl.value.trim();
        // Allow var() references and 0s/0ms (zero duration is structural, like reduced-motion overrides).
        if (/^var\(/.test(val) || val === '0s' || val === '0ms') return;
        utils.report({
          message: motionTokenMessages.rejected(decl.prop),
          node: decl,
          result,
          ruleName: motionTokenRuleName,
        });
        return;
      }

      // Check transition/animation shorthand for raw time/easing values.
      if (decl.prop === 'transition' || decl.prop === 'animation') {
        for (const segment of decl.value.split(',')) {
          const tokens = segment.trim().split(/\s+/);
          for (const t of tokens) {
            // Skip property names and var() tokens.
            if (/^var\(/.test(t)) continue;
            if (t === 'none' || t === 'inherit' || t === 'initial' || t === 'unset') continue;

            // Flag raw time values (except 0s/0ms).
            if (RAW_TIME_RE.test(t) && t !== '0s' && t !== '0ms') {
              utils.report({
                message: motionTokenMessages.rejected(decl.prop),
                node: decl,
                result,
                ruleName: motionTokenRuleName,
              });
              return; // One report per declaration is enough.
            }

            // Flag raw easing values.
            if (RAW_EASING_RE.test(t)) {
              utils.report({
                message: motionTokenMessages.rejected(decl.prop),
                node: decl,
                result,
                ruleName: motionTokenRuleName,
              });
              return;
            }
          }
        }
      }
    });
  };
};
motionTokenRule.meta = { url: '' };

// ─── Rule 5: viewport-tokens ───────────────────────────────────────

const viewportRuleName = 'shelf/viewport-tokens';
const viewportMessages = utils.ruleMessages(viewportRuleName, {
  rejected:
    '@media queries must use @custom-media viewport tokens (e.g., @media (--viewport-md)), not raw breakpoint values. See @custom-media definitions in src/styles/tokens.css.',
});

// Matches raw numeric breakpoints: 768px, 48rem, 100vw, etc.
const RAW_BREAKPOINT_RE = /\d+(px|rem|em|vw|vh)\b/;

const viewportRule = (primary) => {
  return (root, result) => {
    if (!primary) return;

    root.walkAtRules('media', (atRule) => {
      if (RAW_BREAKPOINT_RE.test(atRule.params)) {
        utils.report({
          message: viewportMessages.rejected,
          node: atRule,
          result,
          ruleName: viewportRuleName,
        });
      }
    });
  };
};
viewportRule.meta = { url: '' };

// ─── Export ─────────────────────────────────────────────────────────

export default [
  createPlugin(keyframesRuleName, keyframesRule),
  createPlugin(animPropsRuleName, animPropsRule),
  createPlugin(transPropsRuleName, transPropsRule),
  createPlugin(motionTokenRuleName, motionTokenRule),
  createPlugin(viewportRuleName, viewportRule),
];
