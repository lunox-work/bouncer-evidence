# Recent Jira reads: a small time-limited cache in `apps/api/src/jira/recent.ts`

Ticket #104 ("faster flows, phases 0–4") makes some Jira reads cheaper. A Jira site's
field list is kept for an hour. A proposal's page and a context's status read an issue
at most once a minute. Approvals still read the issue live. This spec covers only the
new module `apps/api/src/jira/recent.ts`: an in-memory store for recent reads, with an
age limit and a size limit, plus a helper that builds the key for one issue. The module
has no I/O. Its only clock is the `now` option, which defaults to `Date.now`, the same
default `src/sizing/retrying.ts` and `src/github/webhook.ts` use. Connecting the cache to
the routes (the one-hour field list, the one-minute issue reads, approvals skipping the
cache) is outside this spec, and no existing export in `apps/api` changes.

## Exports of `apps/api/src/jira/recent.ts` (new file)

```ts
/** How long an issue read is reused: one minute. */
export const RECENT_JIRA_READ_MS = 60000;

export interface RecentReads<T> {
    get(key: string): T | undefined;
    set(key: string, value: T): void;
}

export function recentReads<T>(options: {
    ttlMs?: number;
    now?: () => number;
    max?: number;
} = {}): RecentReads<T>;

export function issueKey(organizationId: string, connectionId: string, issueId: string): string;
```

The module exports nothing else. A test may use these names only.

- `RECENT_JIRA_READ_MS` is the number `60000`.
- `recentReads(options)` returns a new, independent `RecentReads<T>`. Two caches never
  share entries.
  - `ttlMs` defaults to `RECENT_JIRA_READ_MS`.
  - `now` defaults to `Date.now`.
  - `max` defaults to `1000`.
  - A property that is missing or `undefined` gets its default (`??` semantics). Options
    are never validated, and `recentReads` never throws.
- Each entry holds the value plus the `now()` reading taken when `set` stored it (its
  "stored-at").
- `set(key, value)`:
  1. If `key` is already present, removes that entry first. This happens whether the
     entry is fresh or expired.
  2. If the number of entries is still `>= max` and at least one entry exists, removes
     the entry inserted earliest (first in insertion order). It removes at most one.
  3. Calls `now()` exactly once, and inserts `key` as the newest entry, with the new
     value and that reading as its stored-at.

  `set` returns `undefined`.
- `get(key)`:
  - If no entry exists for `key`, returns `undefined` without calling `now()`.
  - Otherwise calls `now()` exactly once and computes `age = now() - storedAt`.
    - If `age >= ttlMs`, deletes the entry and returns `undefined`.
    - Otherwise returns the stored value itself: the same reference, not a copy and not
      frozen.

  `get` never changes an entry's stored-at or its insertion position.
- Expired entries that nobody reads stay in the cache. They count toward `max` until
  `get` or eviction removes them. Nothing sweeps them.
- Keys are compared as exact strings: case-sensitive, no trimming. `""` is a valid key.
- `issueKey(o, c, i)` returns `o + "\n" + c + "\n" + i`. It does no escaping and no
  validation, and it never throws.

```gherkin
Feature: Recent Jira reads cache

  Background:
    Given a fake clock "clock" whose reading starts at 1000 and that a test can advance
    And "now" is a function that returns the clock's current reading

  Rule: The constants and defaults are fixed values

    @happy
    Scenario: RECENT_JIRA_READ_MS is one minute
      Then RECENT_JIRA_READ_MS equals 60000

    @happy
    Scenario: With no ttlMs, an entry lives for RECENT_JIRA_READ_MS
      Given cache = recentReads<string>({ now })
      When cache.set("k", "v") at reading 1000
      Then cache.get("k") at reading 60999 returns "v"
      And cache.get("k") at reading 61000 returns undefined

    @boundary
    Scenario: With no max, the cache holds 1000 entries
      Given cache = recentReads<number>({ now })
      When cache.set("k0", 0), cache.set("k1", 1), …, cache.set("k999", 999) are called in that order
      Then cache.get("k0") returns 0 and cache.get("k999") returns 999
      When cache.set("k1000", 1000) is called
      Then cache.get("k0") returns undefined
      And cache.get("k1") returns 1
      And cache.get("k1000") returns 1000

    @happy
    Scenario: With no options, the cache works on the wall clock
      Given cache = recentReads<string>()
      When cache.set("k", "v")
      Then cache.get("k") called right away returns "v"

    @boundary
    Scenario: An option given as undefined takes its default
      Given cache = recentReads<string>({ ttlMs: undefined, now, max: undefined })
      When cache.set("k", "v") at reading 1000
      Then cache.get("k") at reading 60999 returns "v"
      And cache.get("k") at reading 61000 returns undefined

  Rule: An entry is fresh while its age is below ttlMs, and expires when its age reaches ttlMs

    @boundary
    Scenario Outline: Freshness at and around the TTL
      Given cache = recentReads<string>({ ttlMs: 500, now })
      And cache.set("k", "v") at reading 1000
      When cache.get("k") is called at reading <reading>
      Then it returns <result>

      Examples:
        | reading | result    |
        | 1000    | "v"       |
        | 1499    | "v"       |
        | 1500    | undefined |
        | 1501    | undefined |
        | 999     | "v"       |

    @boundary
    Scenario: A negative age, after the clock moved backwards, counts as fresh
      Given cache = recentReads<string>({ ttlMs: 500, now })
      And cache.set("k", "v") at reading 1000
      When cache.get("k") is called at reading 0
      Then it returns "v"

  Rule: get neither refreshes nor reorders an entry, and deletes an entry it finds expired

    @happy
    Scenario: Reading an entry does not extend its life
      Given cache = recentReads<string>({ ttlMs: 500, now })
      And cache.set("k", "v") at reading 1000
      When cache.get("k") is called at reading 1400 and returns "v"
      Then cache.get("k") at reading 1500 returns undefined

    @happy
    Scenario: Reading an entry does not protect it from eviction
      Given cache = recentReads<string>({ now, max: 2 })
      And cache.set("a", "A") then cache.set("b", "B")
      When cache.get("a") returns "A"
      And cache.set("c", "C")
      Then cache.get("a") returns undefined
      And cache.get("b") returns "B"
      And cache.get("c") returns "C"

    @unhappy
    Scenario: An expired entry stays gone after the clock moves backwards
      Given cache = recentReads<string>({ ttlMs: 500, now })
      And cache.set("k", "v") at reading 1000
      When cache.get("k") at reading 1500 returns undefined
      Then cache.get("k") at reading 1000 returns undefined

    @unhappy
    Scenario: A missing key returns undefined and does not call now
      Given a counting clock "now" that returns 1000 and records each call
      And cache = recentReads<string>({ now })
      When cache.get("absent") is called
      Then it returns undefined
      And now was called 0 times

    @happy
    Scenario: get on a present key calls now once, and set calls now once
      Given a counting clock "now" that returns 1000 and records each call
      And cache = recentReads<string>({ now })
      When cache.set("k", "v")
      Then now was called 1 time
      When cache.get("k") returns "v"
      Then now was called 2 times

  Rule: Setting a key that exists replaces its value, gives it a fresh stored-at, and makes it newest

    @happy
    Scenario: Re-setting a key restarts its age
      Given cache = recentReads<string>({ ttlMs: 500, now })
      And cache.set("k", "old") at reading 1000
      When cache.set("k", "new") at reading 1400
      Then cache.get("k") at reading 1899 returns "new"
      And cache.get("k") at reading 1900 returns undefined

    @happy
    Scenario: Re-setting a key moves it to the newest eviction position
      Given cache = recentReads<string>({ now, max: 2 })
      And cache.set("a", "A1") then cache.set("b", "B")
      When cache.set("a", "A2")
      And cache.set("c", "C")
      Then cache.get("b") returns undefined
      And cache.get("a") returns "A2"
      And cache.get("c") returns "C"

    @boundary
    Scenario: Re-setting a key in a full cache evicts nothing
      Given cache = recentReads<string>({ now, max: 2 })
      And cache.set("a", "A") then cache.set("b", "B1")
      When cache.set("b", "B2")
      Then cache.get("a") returns "A"
      And cache.get("b") returns "B2"

    @unhappy
    Scenario: Re-setting an expired key stores it fresh
      Given cache = recentReads<string>({ ttlMs: 500, now })
      And cache.set("k", "old") at reading 1000
      When cache.set("k", "new") at reading 2000
      Then cache.get("k") at reading 2000 returns "new"

  Rule: When the cache is full, set evicts the entry inserted earliest (FIFO)

    @happy
    Scenario: The first inserted key is evicted first
      Given cache = recentReads<string>({ now, max: 3 })
      And cache.set("a", "A"), cache.set("b", "B"), cache.set("c", "C") in that order
      When cache.set("d", "D")
      Then the results are:
        | key | cache.get(key) |
        | a   | undefined      |
        | b   | "B"            |
        | c   | "C"            |
        | d   | "D"            |

    @boundary
    Scenario: Expired entries count toward max until they are removed
      Given cache = recentReads<string>({ ttlMs: 500, now, max: 2 })
      And cache.set("a", "A") at reading 1000
      And cache.set("b", "B") at reading 1000
      When the clock reads 2000, at which point "a" and "b" are both expired and neither has been read
      And cache.set("c", "C") at reading 2000
      And cache.set("d", "D") at reading 2000
      Then cache.get("c") returns "C"
      And cache.get("d") returns "D"

    @boundary
    Scenario: An expired entry that get removed frees its slot
      Given cache = recentReads<string>({ ttlMs: 500, now, max: 2 })
      And cache.set("a", "A") at reading 1000
      And cache.set("b", "B") at reading 1400
      When cache.get("a") at reading 1500 returns undefined
      And cache.set("c", "C") at reading 1500
      Then cache.get("b") at reading 1500 returns "B"
      And cache.get("c") at reading 1500 returns "C"

  Rule: Options are not validated; out-of-range values have these effects

    @unhappy
    Scenario Outline: A ttlMs of zero or less makes every entry expire at once
      Given cache = recentReads<string>({ ttlMs: <ttlMs>, now })
      When cache.set("k", "v") at reading 1000
      Then cache.get("k") at reading 1000 returns undefined

      Examples:
        | ttlMs |
        | 0     |
        | -1    |
        | -5000 |

    @unhappy
    Scenario Outline: A max of zero or less still keeps the newest entry
      Given cache = recentReads<string>({ now, max: <max> })
      When cache.set("a", "A")
      Then cache.get("a") returns "A"
      When cache.set("b", "B")
      Then cache.get("a") returns undefined
      And cache.get("b") returns "B"

      Examples:
        | max |
        | 0   |
        | -1  |

    @boundary
    Scenario: A max of 1 keeps only the last key set
      Given cache = recentReads<string>({ now, max: 1 })
      When cache.set("a", "A") then cache.set("b", "B")
      Then cache.get("a") returns undefined
      And cache.get("b") returns "B"

    @boundary
    Scenario: A ttlMs of Infinity never expires
      Given cache = recentReads<string>({ ttlMs: Infinity, now })
      When cache.set("k", "v") at reading 1000
      Then cache.get("k") at reading 1000000000 returns "v"

    @happy
    Scenario: The one-hour field-list lifetime is just a ttlMs
      Given cache = recentReads<string[]>({ ttlMs: 3600000, now })
      When cache.set("site", ["summary", "status"]) at reading 1000
      Then cache.get("site") at reading 3600999 returns ["summary", "status"]
      And cache.get("site") at reading 3601000 returns undefined

  Rule: Values are stored as given and returned by reference

    @happy
    Scenario: get returns the very object that was set
      Given cache = recentReads<{ n: number }>({ now })
      And obj = { n: 1 }
      When cache.set("k", obj)
      Then cache.get("k") is the same reference as obj
      When obj.n is set to 2
      Then cache.get("k").n equals 2
      And Object.isFrozen(cache.get("k")) is false

    @boundary
    Scenario: A stored undefined looks the same as a miss
      Given cache = recentReads<string | undefined>({ now })
      When cache.set("k", undefined)
      Then cache.get("k") returns undefined

    @boundary
    Scenario: Falsy values other than undefined are returned as stored
      Given cache = recentReads<unknown>({ now })
      When cache.set("zero", 0), cache.set("empty", ""), cache.set("no", false) and cache.set("nil", null)
      Then the results are:
        | key   | cache.get(key) |
        | zero  | 0              |
        | empty | ""             |
        | no    | false          |
        | nil   | null           |

  Rule: Keys are exact strings

    @boundary
    Scenario: Keys differing in case or whitespace are separate entries
      Given cache = recentReads<string>({ now })
      When cache.set("PROJ-1", "upper") and cache.set("proj-1", "lower")
      Then cache.get("PROJ-1") returns "upper"
      And cache.get("proj-1") returns "lower"
      And cache.get(" PROJ-1") returns undefined

    @boundary
    Scenario: The empty string is a valid key
      Given cache = recentReads<string>({ now })
      When cache.set("", "v")
      Then cache.get("") returns "v"

  Rule: Each cache is independent, and interleaved calls resolve in call order

    @concurrency
    Scenario: Two caches never share entries
      Given first = recentReads<string>({ now }) and second = recentReads<string>({ now })
      When first.set("k", "one")
      Then second.get("k") returns undefined
      And first.get("k") returns "one"

    @concurrency
    Scenario: Interleaved writers to one key: the last set wins
      Given cache = recentReads<string>({ now })
      And two callers each found cache.get("k") returning undefined and each started a read
      When the second caller's read finishes first and it calls cache.set("k", "second") at reading 1000
      And the first caller's read finishes and it calls cache.set("k", "first") at reading 1200
      Then cache.get("k") returns "first"
      And at ttl 60000 that entry is gone at reading 61200, not at 61000

    @concurrency
    Scenario: A stored promise is shared, not re-created, by every reader
      Given cache = recentReads<Promise<string>>({ now })
      And p = Promise.resolve("issue")
      When cache.set("k", p)
      Then two calls to cache.get("k") both return p by reference

  Rule: issueKey joins the three ids with newlines, unescaped

    @happy
    Scenario Outline: The key is organizationId, connectionId and issueId separated by "\n"
      When issueKey(<organizationId>, <connectionId>, <issueId>) is called
      Then it returns <key>

      Examples:
        | organizationId | connectionId | issueId | key                     |
        | "org_1"        | "jcn_1"      | "10001" | "org_1\njcn_1\n10001"   |
        | "org_1"        | "jcn_2"      | "10001" | "org_1\njcn_2\n10001"   |
        | "org_2"        | "jcn_1"      | "PROJ-7" | "org_2\njcn_1\nPROJ-7"  |

    @boundary
    Scenario: Empty ids are accepted
      When issueKey("", "", "") is called
      Then it returns "\n\n"

    @unhappy
    Scenario: An id containing a newline is not escaped, so keys can collide
      When issueKey("a\nb", "c", "d") and issueKey("a", "b\nc", "d") are called
      Then both return "a\nb\nc\nd"

    @happy
    Scenario: issueKey keys a cache per organization, connection and issue
      Given cache = recentReads<string>({ now })
      When cache.set(issueKey("org_1", "jcn_1", "10001"), "issue A")
      Then cache.get(issueKey("org_1", "jcn_1", "10001")) returns "issue A"
      And cache.get(issueKey("org_2", "jcn_1", "10001")) returns undefined
      And cache.get(issueKey("org_1", "jcn_2", "10001")) returns undefined
```

## Decided:

- An entry expires when its age is `>= ttlMs`, so it is already gone at exactly 60000 ms.
  - Ticket: "A proposal's page and the context's status read an issue at most once a minute"
  - Instead: Treat it as expired only when its age is strictly greater than ttlMs, so it stays valid at exactly the TTL.
- `max` defaults to 1000 entries.
  - Ticket: silent.
  - Instead: Use a different default, or no limit at all.
- A full cache evicts the entry inserted earliest (FIFO) to make room for a new key.
  - Ticket: silent.
  - Instead: Evict the least recently used entry, drop expired entries first, or reject the new entry.
- Setting an existing key deletes the old entry and reinserts it with a fresh stored-at at the newest position.
  - Ticket: silent.
  - Instead: Overwrite the value in place and keep its position, or keep the original timestamp.
- `get` never changes an entry's stored-at or order, so reads never extend its life.
  - Ticket: silent.
  - Instead: Refresh recency on read (LRU), or slide the expiry window.
- `get` deletes an expired entry and returns `undefined`. Expired entries nobody reads stay until eviction.
  - Ticket: silent.
  - Instead: Leave it in place, or sweep expired entries periodically or on set.
- Options are not validated. A `ttlMs` of 0 or less expires every entry at once. A `max` of 0 or less still keeps the newest entry, the way a `max` of 1 does.
  - Ticket: silent.
  - Instead: Throw on invalid options, or treat a ttl or max of 0 as disabling the cache.
- Any `T` can be stored, including `undefined`. A stored `undefined` looks the same as a miss, and there is no `has()`.
  - Ticket: silent.
  - Instead: Return a wrapper or add a has() method to tell a miss from a cached undefined, or reject undefined values.
- `get` returns the stored value by reference, without cloning or freezing it.
  - Ticket: silent.
  - Instead: Return a clone, or freeze the value.
- `issueKey` joins the ids with `"\n"` and does no escaping or validation, so ids that contain a newline can collide.
  - Ticket: silent.
  - Instead: Use another separator, or encode or escape each part (for example JSON.stringify of a tuple), or validate the ids.
- `issueKey` accepts empty ids. `issueKey("", "", "")` is `"\n\n"`.
  - Ticket: silent.
  - Instead: Throw on an empty id.
- With no `now` given, ages come from `Date.now` (the wall clock), so clock adjustments can shift them.
  - Ticket: silent.
  - Instead: Use a monotonic clock such as performance.now().
- A negative age (the clock went backwards since `set`) counts as fresh.
  - Ticket: silent.
  - Instead: Treat a negative age as expired, or clamp it to zero and keep expiry relative to the latest reading.
- Re-setting an existing key in a full cache removes the old entry before the size check, so nothing else is evicted.
  - Ticket: silent.
  - Instead: Check size before removing the old entry, which evicts the oldest other entry needlessly.
- `set` calls `now` exactly once, after it has removed the old entry and done any eviction. `get` calls it once for a present key and never for a missing one.
  - Ticket: silent.
  - Instead: Read the clock on every get, or leave the call count unspecified.
- An option given as `undefined` takes its default (`??` semantics), the same as a missing one.
  - Ticket: silent.
  - Instead: Use `undefined` as given, which for `ttlMs` would make the age check always false so entries never expire.
- Keys are exact, case-sensitive strings without trimming, and `""` is a valid key.
  - Ticket: silent.
  - Instead: Normalise keys (trim or lower-case), or reject the empty key.
- Each `recentReads()` call returns its own cache with no shared state. Interleaved `set`s on one key resolve in call order (last set wins), and in-flight reads are not de-duplicated.
  - Ticket: silent.
  - Instead: Share one store per process, or keep a pending-read map so overlapping misses share a single fetch.
- The spec covers only the `recent.ts` seam. Wiring it into routes (the one-hour field list, the one-minute issue reads, live approvals) is outside this spec, and no existing export changes.
  - Ticket: "A Jira site's field list is kept for an hour. A proposal's page and the context's status read an issue at most once a minute; approvals still read it live."
  - Instead: Specify the route-level caching in this change too, which needs Jira clients and stores that a unit test of this seam cannot reach.
