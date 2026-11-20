import assert from "node:assert/strict";
import { test } from "node:test";
import {
  RECENT_JIRA_READ_MS,
  issueKey,
  recentReads,
} from "../src/jira/recent.js";

/** The Background's fake clock: starts at 1000, and a test can move it. */
function fakeClock(start = 1000) {
  let reading = start;
  return {
    now: () => reading,
    at(next: number) {
      reading = next;
    },
  };
}

/** A clock that records each call, and that a test can move. */
function countingClock(start = 1000) {
  let reading = start;
  const clock = {
    calls: 0,
    now: () => {
      clock.calls += 1;
      return reading;
    },
    at(next: number) {
      reading = next;
    },
  };
  return clock;
}

// ---------------------------------------------------------------- happy-1

test("[happy-1] RECENT_JIRA_READ_MS equals 60000", () => {
  assert.equal(RECENT_JIRA_READ_MS, 60000);
});

test("[happy-1] a ttlMs of RECENT_JIRA_READ_MS keeps an entry for 59999 ms and expires it at 60000 ms", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: RECENT_JIRA_READ_MS, now: clock.now });
  cache.set("k", "v");
  clock.at(1000 + RECENT_JIRA_READ_MS - 1);
  assert.equal(cache.get("k"), "v");
  clock.at(1000 + RECENT_JIRA_READ_MS);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- happy-2

test("[happy-2] with no ttlMs, an entry set at 1000 is fresh at 60999 and gone at 61000", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "v");
  clock.at(60999);
  assert.equal(cache.get("k"), "v");
  clock.at(61000);
  assert.equal(cache.get("k"), undefined);
});

test("[happy-2] with no ttlMs, an entry set at reading 0 is fresh at 59999 and gone at exactly 60000", () => {
  const clock = fakeClock(0);
  const cache = recentReads<string>({ now: clock.now, max: 5 });
  cache.set("k", "v");
  clock.at(59999);
  assert.equal(cache.get("k"), "v");
  clock.at(60000);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- happy-3

test("[happy-3] with no options, an entry read right away on the wall clock is returned", (t) => {
  t.mock.method(Date, "now", () => 1000);
  const cache = recentReads<string>();
  cache.set("k", "v");
  assert.equal(cache.get("k"), "v");
});

test("[happy-3] with no options, Date.now drives expiry: fresh 59999 ms later, gone 60000 ms later", (t) => {
  let wall = 1000;
  t.mock.method(Date, "now", () => wall);
  const cache = recentReads<string>();
  cache.set("k", "v");
  wall = 60999;
  assert.equal(cache.get("k"), "v");
  wall = 61000;
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- happy-4

test("[happy-4] reading an entry at 1400 does not extend its life past 1500", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(1400);
  assert.equal(cache.get("k"), "v");
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
});

test("[happy-4] reading an entry at its last fresh moment, 1499, still lets it expire at 1500", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(1100);
  assert.equal(cache.get("k"), "v");
  clock.at(1499);
  assert.equal(cache.get("k"), "v");
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- happy-5

test("[happy-5] reading the oldest entry does not protect it from eviction", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("b", "B");
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
});

test("[happy-5] with max 1, an entry read just before another set is still evicted", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 1 });
  cache.set("a", "A");
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("a"), "A");
  cache.set("b", "B");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
});

// ---------------------------------------------------------------- happy-6

test("[happy-6] set calls now once, and get on a present key calls it once more", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "v");
  assert.equal(clock.calls, 1);
  assert.equal(cache.get("k"), "v");
  assert.equal(clock.calls, 2);
});

test("[happy-6] set calls now exactly once also when it evicts or replaces, and get on an evicted key not at all", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ now: clock.now, max: 1 });
  cache.set("a", "A");
  assert.equal(clock.calls, 1);
  cache.set("b", "B");
  assert.equal(clock.calls, 2);
  cache.set("b", "B2");
  assert.equal(clock.calls, 3);
  assert.equal(cache.get("b"), "B2");
  assert.equal(clock.calls, 4);
  assert.equal(cache.get("a"), undefined);
  assert.equal(clock.calls, 4);
});

// ---------------------------------------------------------------- happy-7

test("[happy-7] re-setting a key at 1400 restarts its age: fresh at 1899, gone at 1900", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "old");
  clock.at(1400);
  cache.set("k", "new");
  clock.at(1899);
  assert.equal(cache.get("k"), "new");
  clock.at(1900);
  assert.equal(cache.get("k"), undefined);
});

test("[happy-7] re-setting a key at its last fresh moment, 1499, keeps it until 1998 and expires it at 1999", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "old");
  clock.at(1499);
  cache.set("k", "new");
  clock.at(1998);
  assert.equal(cache.get("k"), "new");
  clock.at(1999);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- happy-8

test("[happy-8] re-setting a key moves it to the newest eviction position", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  cache.set("a", "A1");
  cache.set("b", "B");
  cache.set("a", "A2");
  cache.set("c", "C");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), "A2");
  assert.equal(cache.get("c"), "C");
});

test("[happy-8] a re-set oldest key outlives every key that was inserted before its re-set", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A1");
  cache.set("b", "B");
  cache.set("c", "C");
  cache.set("a", "A2");
  cache.set("d", "D");
  cache.set("e", "E");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("a"), "A2");
  assert.equal(cache.get("d"), "D");
  assert.equal(cache.get("e"), "E");
});

// ---------------------------------------------------------------- happy-9

test("[happy-9] with max 3, setting a fourth key evicts the first inserted", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  cache.set("d", "D");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
});

test("[happy-9] each set past max evicts exactly one entry, oldest first", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  cache.set("d", "D");
  cache.set("e", "E");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
  assert.equal(cache.get("e"), "E");
});

// ---------------------------------------------------------------- happy-10

test("[happy-10] a one-hour ttlMs keeps a field list until 3600999 and drops it at 3601000", () => {
  const clock = fakeClock();
  const cache = recentReads<string[]>({ ttlMs: 3600000, now: clock.now });
  cache.set("site", ["summary", "status"]);
  clock.at(3600999);
  assert.deepEqual(cache.get("site"), ["summary", "status"]);
  clock.at(3601000);
  assert.equal(cache.get("site"), undefined);
});

test("[happy-10] a one-hour field-list cache still hits after a default issue cache on the same clock has expired", () => {
  const clock = fakeClock();
  const fields = recentReads<string[]>({ ttlMs: 3600000, now: clock.now });
  const issues = recentReads<string>({ now: clock.now });
  fields.set("site", ["summary", "status"]);
  issues.set("site", "issue");
  clock.at(61000);
  assert.equal(issues.get("site"), undefined);
  assert.deepEqual(fields.get("site"), ["summary", "status"]);
});

// ---------------------------------------------------------------- happy-11

test("[happy-11] get returns the very object that was set, mutable and not frozen", () => {
  const clock = fakeClock();
  const cache = recentReads<{ n: number }>({ now: clock.now });
  const obj = { n: 1 };
  cache.set("k", obj);
  assert.equal(cache.get("k"), obj);
  obj.n = 2;
  assert.equal(cache.get("k")?.n, 2);
  assert.equal(Object.isFrozen(cache.get("k")), false);
});

test("[happy-11] one object stored under two keys is the same reference from both", () => {
  const clock = fakeClock();
  const cache = recentReads<{ n: number }>({ now: clock.now });
  const obj = { n: 1 };
  cache.set("x", obj);
  cache.set("y", obj);
  const fromX = cache.get("x");
  assert.equal(fromX, obj);
  assert.equal(cache.get("y"), obj);
  if (fromX) fromX.n = 3;
  assert.equal(cache.get("y")?.n, 3);
});

// ---------------------------------------------------------------- happy-12

test("[happy-12] issueKey joins organizationId, connectionId and issueId with \\n", () => {
  assert.equal(issueKey("org_1", "jcn_1", "10001"), "org_1\njcn_1\n10001");
  assert.equal(issueKey("org_1", "jcn_2", "10001"), "org_1\njcn_2\n10001");
  assert.equal(issueKey("org_2", "jcn_1", "PROJ-7"), "org_2\njcn_1\nPROJ-7");
});

test("[happy-12] issueKey keeps whitespace, case and other characters in the ids as given", () => {
  assert.equal(issueKey(" Org ", "JCN\t1", "ü-1"), " Org \nJCN\t1\nü-1");
});

// ---------------------------------------------------------------- happy-13

test("[happy-13] an issueKey-keyed cache hits for the same ids and misses for another organization or connection", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set(issueKey("org_1", "jcn_1", "10001"), "issue A");
  assert.equal(cache.get(issueKey("org_1", "jcn_1", "10001")), "issue A");
  assert.equal(cache.get(issueKey("org_2", "jcn_1", "10001")), undefined);
  assert.equal(cache.get(issueKey("org_1", "jcn_2", "10001")), undefined);
});

test("[happy-13] an issueKey-keyed cache misses for another issue and for the ids in another order", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set(issueKey("org_1", "jcn_1", "10001"), "issue A");
  assert.equal(cache.get(issueKey("org_1", "jcn_1", "10002")), undefined);
  assert.equal(cache.get(issueKey("jcn_1", "org_1", "10001")), undefined);
  assert.equal(cache.get(issueKey("org_1", "jcn_1", "10001")), "issue A");
});

// ---------------------------------------------------------------- boundary-1

test("[boundary-1] with no max, the cache holds 1000 entries and the 1001st evicts the first", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 1000; i += 1) cache.set(`k${i}`, i);
  assert.equal(cache.get("k0"), 0);
  assert.equal(cache.get("k999"), 999);
  cache.set("k1000", 1000);
  assert.equal(cache.get("k0"), undefined);
  assert.equal(cache.get("k1"), 1);
  assert.equal(cache.get("k1000"), 1000);
});

test("[boundary-1] with no max, re-setting a key in a full 1000-entry cache evicts nothing", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 1000; i += 1) cache.set(`k${i}`, i);
  cache.set("k500", -500);
  assert.equal(cache.get("k0"), 0);
  assert.equal(cache.get("k500"), -500);
  assert.equal(cache.get("k999"), 999);
});

// ---------------------------------------------------------------- boundary-2

test("[boundary-2] ttlMs and max given as undefined take their defaults: fresh at 60999, gone at 61000", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: undefined, now: clock.now, max: undefined });
  cache.set("k", "v");
  clock.at(60999);
  assert.equal(cache.get("k"), "v");
  clock.at(61000);
  assert.equal(cache.get("k"), undefined);
});

test("[boundary-2] max given as undefined holds 1000 entries, and the 1001st evicts the first", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ ttlMs: undefined, now: clock.now, max: undefined });
  for (let i = 0; i < 1000; i += 1) cache.set(`k${i}`, i);
  assert.equal(cache.get("k0"), 0);
  cache.set("k1000", 1000);
  assert.equal(cache.get("k0"), undefined);
  assert.equal(cache.get("k1"), 1);
  assert.equal(cache.get("k1000"), 1000);
});

// ---------------------------------------------------------------- boundary-3

test("[boundary-3] with ttlMs 500 and stored-at 1000: fresh at 1000, 1499 and 999; gone at 1500 and 1501", () => {
  const rows: Array<[number, string | undefined]> = [
    [1000, "v"],
    [1499, "v"],
    [1500, undefined],
    [1501, undefined],
    [999, "v"],
  ];
  for (const [reading, result] of rows) {
    const clock = fakeClock();
    const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
    cache.set("k", "v");
    clock.at(reading);
    assert.equal(cache.get("k"), result, `reading ${reading}`);
  }
});

test("[boundary-3] with ttlMs 1, an entry is fresh at age 0 and gone at age 1", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 1, now: clock.now });
  cache.set("k", "v");
  assert.equal(cache.get("k"), "v");
  clock.at(1001);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- boundary-4

test("[boundary-4] after the clock moves back to 0, a negative age counts as fresh", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(0);
  assert.equal(cache.get("k"), "v");
});

test("[boundary-4] a hugely negative age is fresh, and the entry still expires once its age reaches ttlMs", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(-1_000_000);
  assert.equal(cache.get("k"), "v");
  clock.at(1499);
  assert.equal(cache.get("k"), "v");
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- boundary-5

test("[boundary-5] re-setting a key in a full cache evicts nothing", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("b", "B1");
  cache.set("b", "B2");
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("b"), "B2");
});

test("[boundary-5] with max 1, re-setting the only key keeps it with the new value", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 1 });
  cache.set("a", "A1");
  cache.set("a", "A2");
  assert.equal(cache.get("a"), "A2");
});

// ---------------------------------------------------------------- boundary-6

test("[boundary-6] two unread expired entries still fill max, and two new keys both fit", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("b", "B");
  clock.at(2000);
  cache.set("c", "C");
  cache.set("d", "D");
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
});

test("[boundary-6] an unread expired entry that is not the oldest still counts, so a set evicts the oldest fresh entry", () => {
  const clock = fakeClock(1400);
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 2 });
  cache.set("a", "A");
  clock.at(1000);
  cache.set("b", "B");
  clock.at(1500);
  cache.set("c", "C");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), "C");
});

// ---------------------------------------------------------------- boundary-7

test("[boundary-7] an expired entry that get removed frees its slot for the next set", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 2 });
  cache.set("a", "A");
  clock.at(1400);
  cache.set("b", "B");
  clock.at(1500);
  assert.equal(cache.get("a"), undefined);
  cache.set("c", "C");
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
});

test("[boundary-7] when get removes the newer, expired entry, the next set keeps the older, fresh one", () => {
  const clock = fakeClock(1400);
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 2 });
  cache.set("a", "A");
  clock.at(1000);
  cache.set("b", "B");
  clock.at(1500);
  assert.equal(cache.get("b"), undefined);
  cache.set("c", "C");
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("c"), "C");
});

// ---------------------------------------------------------------- boundary-8

test("[boundary-8] with max 1, only the last key set is kept", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 1 });
  cache.set("a", "A");
  cache.set("b", "B");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
});

test("[boundary-8] with max 1, setting a key again after it was evicted brings it back and evicts the other", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 1 });
  cache.set("a", "A1");
  cache.set("b", "B");
  cache.set("a", "A2");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), "A2");
});

// ---------------------------------------------------------------- boundary-9

test("[boundary-9] with ttlMs Infinity, an entry is still fresh at reading 1000000000", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: Infinity, now: clock.now });
  cache.set("k", "v");
  clock.at(1000000000);
  assert.equal(cache.get("k"), "v");
});

test("[boundary-9] with ttlMs Infinity, an entry is still fresh at Number.MAX_SAFE_INTEGER", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: Infinity, now: clock.now });
  cache.set("k", "v");
  clock.at(Number.MAX_SAFE_INTEGER);
  assert.equal(cache.get("k"), "v");
});

// ---------------------------------------------------------------- boundary-10

test("[boundary-10] a stored undefined reads back as undefined", () => {
  const clock = fakeClock();
  const cache = recentReads<string | undefined>({ now: clock.now });
  cache.set("k", undefined);
  assert.equal(cache.get("k"), undefined);
});

test("[boundary-10] storing undefined over a value replaces it, so the key reads as undefined", () => {
  const clock = fakeClock();
  const cache = recentReads<string | undefined>({ now: clock.now });
  cache.set("k", "v");
  cache.set("k", undefined);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- boundary-11

test("[boundary-11] 0, \"\", false and null are returned as stored", () => {
  const clock = fakeClock();
  const cache = recentReads<unknown>({ now: clock.now });
  cache.set("zero", 0);
  cache.set("empty", "");
  cache.set("no", false);
  cache.set("nil", null);
  assert.equal(cache.get("zero"), 0);
  assert.equal(cache.get("empty"), "");
  assert.equal(cache.get("no"), false);
  assert.equal(cache.get("nil"), null);
});

test("[boundary-11] NaN and -0 are returned as stored", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ now: clock.now });
  cache.set("nan", NaN);
  cache.set("negzero", -0);
  assert.equal(cache.get("nan"), NaN);
  assert.equal(cache.get("negzero"), -0);
});

// ---------------------------------------------------------------- boundary-12

test("[boundary-12] keys differing in case or leading whitespace are separate entries", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("PROJ-1", "upper");
  cache.set("proj-1", "lower");
  assert.equal(cache.get("PROJ-1"), "upper");
  assert.equal(cache.get("proj-1"), "lower");
  assert.equal(cache.get(" PROJ-1"), undefined);
});

test("[boundary-12] keys differing only by trailing whitespace are separate entries", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("PROJ-1", "plain");
  assert.equal(cache.get("PROJ-1 "), undefined);
  assert.equal(cache.get("PROJ-1\t"), undefined);
  cache.set("PROJ-1 ", "spaced");
  assert.equal(cache.get("PROJ-1"), "plain");
  assert.equal(cache.get("PROJ-1 "), "spaced");
});

// ---------------------------------------------------------------- boundary-13

test("[boundary-13] the empty string is a valid key", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("", "v");
  assert.equal(cache.get(""), "v");
});

test("[boundary-13] the empty key and a single-space key are separate entries", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("", "empty");
  assert.equal(cache.get(" "), undefined);
  cache.set(" ", "space");
  assert.equal(cache.get(""), "empty");
  assert.equal(cache.get(" "), "space");
});

// ---------------------------------------------------------------- boundary-14

test("[boundary-14] issueKey(\"\", \"\", \"\") returns \"\\n\\n\"", () => {
  assert.equal(issueKey("", "", ""), "\n\n");
});

test("[boundary-14] issueKey with only the connection id empty keeps both separators", () => {
  assert.equal(issueKey("org_1", "", "10001"), "org_1\n\n10001");
});

// ---------------------------------------------------------------- unhappy-1

test("[unhappy-1] an entry found expired at 1500 stays gone when the clock moves back to 1000", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
  clock.at(1000);
  assert.equal(cache.get("k"), undefined);
});

test("[unhappy-1] an entry found expired stays gone even at a reading where its age would be negative", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
  clock.at(0);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- unhappy-2

test("[unhappy-2] get on a missing key returns undefined without calling now", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ now: clock.now });
  assert.equal(cache.get("absent"), undefined);
  assert.equal(clock.calls, 0);
});

test("[unhappy-2] after get deletes an expired entry, a further get on it does not call now", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  assert.equal(clock.calls, 1);
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
  assert.equal(clock.calls, 2);
  assert.equal(cache.get("k"), undefined);
  assert.equal(clock.calls, 2);
});

// ---------------------------------------------------------------- unhappy-3

test("[unhappy-3] re-setting an expired key at 2000 stores it fresh", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "old");
  clock.at(2000);
  cache.set("k", "new");
  assert.equal(cache.get("k"), "new");
});

test("[unhappy-3] re-setting a key at the reading it expires, 1500, keeps it until 1999 and drops it at 2000", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "old");
  clock.at(1500);
  cache.set("k", "new");
  assert.equal(cache.get("k"), "new");
  clock.at(1999);
  assert.equal(cache.get("k"), "new");
  clock.at(2000);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- unhappy-4

test("[unhappy-4] a ttlMs of 0, -1 or -5000 makes an entry expire at the reading it was set", () => {
  for (const ttlMs of [0, -1, -5000]) {
    const clock = fakeClock();
    const cache = recentReads<string>({ ttlMs, now: clock.now });
    cache.set("k", "v");
    assert.equal(cache.get("k"), undefined, `ttlMs ${ttlMs}`);
  }
});

test("[unhappy-4] a ttlMs just above zero keeps an entry at age 0 and drops it at age 1", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 0.5, now: clock.now });
  cache.set("k", "v");
  assert.equal(cache.get("k"), "v");
  clock.at(1001);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- unhappy-5

test("[unhappy-5] a max of 0 or -1 still keeps the newest entry", () => {
  for (const max of [0, -1]) {
    const clock = fakeClock();
    const cache = recentReads<string>({ now: clock.now, max });
    cache.set("a", "A");
    assert.equal(cache.get("a"), "A", `max ${max}`);
    cache.set("b", "B");
    assert.equal(cache.get("a"), undefined, `max ${max}`);
    assert.equal(cache.get("b"), "B", `max ${max}`);
  }
});

test("[unhappy-5] a max of -1000 keeps only the newest entry across several sets", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: -1000 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "C");
});

// ---------------------------------------------------------------- unhappy-6

test("[unhappy-6] ids containing a newline are not escaped, so two id triples collide", () => {
  assert.equal(issueKey("a\nb", "c", "d"), "a\nb\nc\nd");
  assert.equal(issueKey("a", "b\nc", "d"), "a\nb\nc\nd");
});

test("[unhappy-6] colliding issue keys share one cache entry", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set(issueKey("a\nb", "c", "d"), "first");
  assert.equal(cache.get(issueKey("a", "b\nc", "d")), "first");
  assert.equal(cache.get(issueKey("a", "b", "c\nd")), "first");
});

// ---------------------------------------------------------------- concurrency-1

test("[concurrency-1] a key set in one cache is not seen by another", () => {
  const clock = fakeClock();
  const first = recentReads<string>({ now: clock.now });
  const second = recentReads<string>({ now: clock.now });
  first.set("k", "one");
  assert.equal(second.get("k"), undefined);
  assert.equal(first.get("k"), "one");
});

test("[concurrency-1] evictions in one full cache never touch another cache's entries", () => {
  const clock = fakeClock();
  const first = recentReads<string>({ now: clock.now, max: 1 });
  const second = recentReads<string>({ now: clock.now, max: 1 });
  first.set("k", "one");
  second.set("k", "two");
  first.set("other", "three");
  assert.equal(first.get("k"), undefined);
  assert.equal(second.get("k"), "two");
  assert.equal(second.get("other"), undefined);
});

// ---------------------------------------------------------------- concurrency-2

test("[concurrency-2] interleaved writers to one key: the last set wins, and its stored-at counts", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  assert.equal(cache.get("k"), undefined);
  assert.equal(cache.get("k"), undefined);
  cache.set("k", "second");
  clock.at(1200);
  cache.set("k", "first");
  assert.equal(cache.get("k"), "first");
  clock.at(61000);
  assert.equal(cache.get("k"), "first");
  clock.at(61200);
  assert.equal(cache.get("k"), undefined);
});

test("[concurrency-2] two writers that set one key at the same reading: the later call wins", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "second");
  cache.set("k", "first");
  assert.equal(cache.get("k"), "first");
  clock.at(60999);
  assert.equal(cache.get("k"), "first");
  clock.at(61000);
  assert.equal(cache.get("k"), undefined);
});

// ---------------------------------------------------------------- concurrency-3

test("[concurrency-3] a stored promise is returned by reference to every reader", async () => {
  const clock = fakeClock();
  const cache = recentReads<Promise<string>>({ now: clock.now });
  const p = Promise.resolve("issue");
  cache.set("k", p);
  const one = cache.get("k");
  const two = cache.get("k");
  assert.equal(one, p);
  assert.equal(two, p);
  assert.equal(await one, "issue");
});

test("[concurrency-3] a still-pending promise is shared by readers, who all see its one result", async () => {
  const clock = fakeClock();
  const cache = recentReads<Promise<string>>({ now: clock.now });
  let resolve: (value: string) => void = () => {};
  const p = new Promise<string>((done) => {
    resolve = done;
  });
  cache.set("k", p);
  const one = cache.get("k");
  const two = cache.get("k");
  assert.equal(one, p);
  assert.equal(two, p);
  resolve("issue");
  assert.deepEqual(await Promise.all([one, two]), ["issue", "issue"]);
});
