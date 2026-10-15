// Shared CLI argument parsing for all .sandcastle scripts.

const args = process.argv.slice(2);

/** Return the value after `--name`, or undefined if absent. */
export function flag(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

/** Return true if `--name` is present (no value expected). */
export function hasFlag(name: string): boolean {
  return args.includes(`--${name}`);
}

/** Return the first positional argument (not starting with `--`). */
export function positional(): string | undefined {
  return args.find((a) => !a.startsWith("--"));
}
