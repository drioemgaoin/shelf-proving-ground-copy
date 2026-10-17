/**
 * Custom sink loader for the rules monitoring system.
 * Dynamically imports a user-provided module and validates its exports.
 */

/**
 * Load a custom sink from an absolute module path.
 * @param {string} absolutePath
 * @returns {Promise<import('./sink.mjs').Sink>}
 */
export async function loadCustomSink(absolutePath) {
  const mod = await import(absolutePath);
  const factory = mod.createSink ?? mod.default;

  if (typeof factory !== 'function') {
    throw new Error(`Custom sink at ${absolutePath} must export createSink() or a default function`);
  }

  const sink = factory();

  for (const method of ['write', 'query', 'close']) {
    if (typeof sink[method] !== 'function') {
      throw new Error(`Custom sink missing required method: ${method}`);
    }
  }

  return sink;
}
