/**
 * Recent Jira reads: a small in-memory store with an age limit and a size
 * limit, plus a helper that builds the key for one issue. No I/O; the only
 * clock is the `now` option, which defaults to `Date.now`.
 */

/** How long an issue read is reused: one minute. */
export const RECENT_JIRA_READ_MS = 60000;

/** A store of recent reads: entries expire once their age reaches `ttlMs`, and a full store evicts the entry inserted earliest. */
export interface RecentReads<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
}

/**
 * Returns a new, independent `RecentReads<T>`. `ttlMs` defaults to
 * `RECENT_JIRA_READ_MS`, `now` to `Date.now`, and `max` to 1000; options are
 * never validated, and this never throws.
 */
export function recentReads<T>(
  _options: {
    ttlMs?: number;
    now?: () => number;
    max?: number;
  } = {},
): RecentReads<T> {
  throw new Error("not implemented");
}

/** The cache key for one issue: the three ids joined with `"\n"`, unescaped. Never throws. */
export function issueKey(
  _organizationId: string,
  _connectionId: string,
  _issueId: string,
): string {
  throw new Error("not implemented");
}
