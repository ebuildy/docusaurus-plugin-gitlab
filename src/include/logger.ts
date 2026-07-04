/** A minimal debug logger for the build-time include pipeline. */
export interface IncludeLogger {
  debug(message: string): void;
}

const NOOP: IncludeLogger = { debug() {} };

type DocusaurusLogger = { info: (message: string) => void };

/**
 * Build the include-pipeline debug logger. When `enabled`, traces are printed
 * through Docusaurus's own logger (`@docusaurus/logger`) so they match the rest
 * of the build output; when disabled, a no-op is returned and `@docusaurus/logger`
 * is never loaded (it's an optional peer dependency, imported lazily here).
 *
 * Docusaurus's logger is CJS and has no debug level, so — via a defensive
 * `.default` unwrap for the ESM/CJS interop — traces go through `info` with a
 * `[gitlab-include]` prefix.
 */
export async function createIncludeLogger(enabled: boolean): Promise<IncludeLogger> {
  if (!enabled) return NOOP;
  const imported = (await import("@docusaurus/logger")).default as unknown as DocusaurusLogger & {
    default?: DocusaurusLogger;
  };
  const logger: DocusaurusLogger = imported.default ?? imported;
  return {
    debug(message: string) {
      logger.info(`[gitlab-include] ${message}`);
    },
  };
}
