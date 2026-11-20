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
  options: {
    ttlMs?: number;
    now?: () => number;
    max?: number;
  } = {},
): RecentReads<T> {
  const ttlMs = options.ttlMs ?? RECENT_JIRA_READ_MS;
  const now = options.now ?? Date.now;
  const max = options.max ?? 1000;
  // A Map iterates in insertion order, so its first key is the earliest inserted.
  const entries = new Map<string, { value: T; storedAt: number }>();

  return {
    get(key: string): T | undefined {
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (now() - entry.storedAt >= ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key: string, value: T): void {
      entries.delete(key);
      if (entries.size >= max && entries.size > 0) {
        const oldest = entries.keys().next().value as string;
        entries.delete(oldest);
      }
      entries.set(key, { value, storedAt: now() });
    },
  };
}

/** The cache key for one issue: the three ids joined with `"\n"`, unescaped. Never throws. */
export function issueKey(
  organizationId: string,
  connectionId: string,
  issueId: string,
): string {
  return `${organizationId}\n${connectionId}\n${issueId}`;
}
