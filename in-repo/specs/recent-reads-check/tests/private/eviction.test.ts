import assert from "node:assert/strict";
import { test } from "node:test";
import { recentReads } from "../../src/jira/recent.js";

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

// Extends "[happy-5] reading the oldest entry does not protect it from eviction": max 3, the two oldest
// read repeatedly; least-recently-used eviction would drop "c" instead.
test("[happy-5] with max 3, the two oldest entries are evicted in insertion order even after many reads of them", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  for (let i = 0; i < 3; i += 1) {
    assert.equal(cache.get("a"), "A");
    assert.equal(cache.get("b"), "B");
  }
  cache.set("d", "D");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
  cache.set("e", "E");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
  assert.equal(cache.get("e"), "E");
});

// Extends "[happy-5] with max 1, an entry read just before another set is still evicted": reads at later
// readings do not move the entry either.
test("[happy-5] reading the oldest entry at a later reading does not protect it from eviction", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  cache.set("a", "A");
  clock.at(2000);
  cache.set("b", "B");
  clock.at(3000);
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
});

// Extends "[happy-8] re-setting a key moves it to the newest eviction position": re-set a middle key.
// Order goes a,b,c -> a,c,b -> c,b,d -> b,d,e; keeping b in place would evict it before c.
test("[happy-8] with max 3, re-setting the middle key makes the last-inserted other key go before it", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A");
  cache.set("b", "B1");
  cache.set("c", "C");
  cache.set("b", "B2");
  cache.set("d", "D");
  cache.set("e", "E");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("b"), "B2");
  assert.equal(cache.get("d"), "D");
  assert.equal(cache.get("e"), "E");
});

// Extends "[happy-8] a re-set oldest key outlives every key inserted before its re-set": re-sets of several
// keys define a new eviction order.
test("[happy-8] re-setting c then a then b in a full cache makes c, a, b the eviction order", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A1");
  cache.set("b", "B1");
  cache.set("c", "C1");
  cache.set("c", "C2");
  cache.set("a", "A2");
  cache.set("b", "B2");
  cache.set("x", "X");
  assert.equal(cache.get("c"), undefined);
  assert.equal(cache.get("a"), "A2");
  cache.set("y", "Y");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B2");
  cache.set("z", "Z");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("x"), "X");
  assert.equal(cache.get("y"), "Y");
  assert.equal(cache.get("z"), "Z");
});

// Extends "[happy-9] each set past max evicts exactly one entry, oldest first": more keys, larger max.
test("[happy-9] with max 5, after 12 sets only the last 5 keys remain", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ now: clock.now, max: 5 });
  for (let i = 0; i < 12; i += 1) cache.set(`k${i}`, i);
  for (let i = 0; i < 7; i += 1) assert.equal(cache.get(`k${i}`), undefined, `k${i}`);
  for (let i = 7; i < 12; i += 1) assert.equal(cache.get(`k${i}`), i, `k${i}`);
});

// Extends "[happy-9] with max 3, setting a fourth key evicts the first inserted": insertion order and
// stored-at order differ (the clock moved back), and eviction follows insertion order.
test("[happy-9] eviction follows insertion order, not the earliest stored-at", () => {
  const clock = fakeClock(2000);
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  cache.set("a", "A");
  clock.at(1000);
  cache.set("b", "B");
  clock.at(1500);
  cache.set("c", "C");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
});

// Extends "[happy-9] …": a new key evicts exactly one entry, checked before and after each set.
test("[happy-9] with max 3, each new key past max removes only the single oldest entry", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  cache.set("d", "D");
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
  cache.set("e", "E");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), "C");
});

// Extends "[boundary-5] re-setting a key in a full cache evicts nothing": max 3, every key re-set in turn.
test("[boundary-5] with max 3, re-setting each of the three keys evicts none of them", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A1");
  cache.set("b", "B1");
  cache.set("c", "C1");
  cache.set("c", "C2");
  cache.set("a", "A2");
  cache.set("b", "B2");
  assert.equal(cache.get("a"), "A2");
  assert.equal(cache.get("b"), "B2");
  assert.equal(cache.get("c"), "C2");
});

// Extends "[boundary-5] with max 1, re-setting the only key keeps it…": re-setting the newest key many
// times in a full cache never evicts the oldest.
test("[boundary-5] re-setting the newest key ten times in a full cache keeps the oldest entry", () => {
  const clock = countingClock();
  const cache = recentReads<number>({ now: clock.now, max: 2 });
  cache.set("a", 0);
  cache.set("b", 0);
  for (let i = 1; i <= 10; i += 1) cache.set("b", i);
  assert.equal(cache.get("a"), 0);
  assert.equal(cache.get("b"), 10);
  assert.equal(clock.calls, 14);
});

// Extends "[boundary-6] two unread expired entries still fill max…": with max 3 and three expired entries,
// one new key evicts only the oldest; the other two expired entries are still held (get on a present
// key calls now once; on a missing key it does not).
test("[boundary-6] with max 3 full of expired entries, one new key evicts only the oldest and the other two stay held", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 3 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  clock.at(2000);
  cache.set("d", "D");
  const before = clock.calls;
  assert.equal(cache.get("a"), undefined);
  assert.equal(clock.calls, before);
  assert.equal(cache.get("b"), undefined);
  assert.equal(clock.calls, before + 1);
  assert.equal(cache.get("c"), undefined);
  assert.equal(clock.calls, before + 2);
  assert.equal(cache.get("d"), "D");
});

// Extends "[boundary-6] an unread expired entry that is not the oldest still counts…": max 3, the expired
// entry in the middle; dropping expired entries first would keep "a" and lose "b" instead.
test("[boundary-6] with max 3 and an expired entry in the middle, a new key evicts the oldest fresh entry", () => {
  const clock = fakeClock(1400);
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 3 });
  cache.set("a", "A");
  clock.at(1000);
  cache.set("b", "B");
  clock.at(1400);
  cache.set("c", "C");
  clock.at(1500);
  cache.set("d", "D");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
});

// Extends "[boundary-6] an unread expired entry that is not the oldest still counts…": the count on now shows
// the expired entry is still held after a set that had room (get on a present key calls now; on a missing one it does not).
test("[boundary-6] a set that has room leaves an unread expired entry in the cache", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 3 });
  cache.set("a", "A");
  clock.at(2000);
  cache.set("b", "B");
  const before = clock.calls;
  assert.equal(cache.get("a"), undefined);
  assert.equal(clock.calls, before + 1);
  assert.equal(cache.get("a"), undefined);
  assert.equal(clock.calls, before + 1);
});

// Extends "[boundary-7] an expired entry that get removed frees its slot…": max 3, the freed slot is the
// middle one, so the next set evicts nothing and the one after evicts the oldest.
test("[boundary-7] with max 3, after get removes the middle expired entry one set fits and the next evicts the oldest", () => {
  const clock = fakeClock(1400);
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 3 });
  cache.set("a", "A");
  clock.at(1000);
  cache.set("b", "B");
  clock.at(1400);
  cache.set("c", "C");
  clock.at(1500);
  assert.equal(cache.get("b"), undefined);
  cache.set("d", "D");
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
  cache.set("e", "E");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
  assert.equal(cache.get("e"), "E");
});

// Extends "[boundary-7] when get removes the newer, expired entry…": two expired entries removed by get free two slots.
test("[boundary-7] after get removes two expired entries from a full cache of 3, two new keys fit beside the fresh one", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 3 });
  cache.set("a", "A");
  cache.set("b", "B");
  clock.at(1400);
  cache.set("c", "C");
  clock.at(1600);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), undefined);
  cache.set("d", "D");
  cache.set("e", "E");
  assert.equal(cache.get("c"), "C");
  assert.equal(cache.get("d"), "D");
  assert.equal(cache.get("e"), "E");
});

// Extends "[boundary-8] with max 1, only the last key set is kept": a longer run of keys.
test("[boundary-8] with max 1, after six different keys only the sixth remains", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 1 });
  const keys = ["a", "b", "c", "d", "e", "f"];
  for (const key of keys) cache.set(key, key.toUpperCase());
  for (const key of keys.slice(0, 5)) assert.equal(cache.get(key), undefined, key);
  assert.equal(cache.get("f"), "F");
});

// Extends "[boundary-8] with max 1, setting a key again after it was evicted…": every set checked as it happens.
test("[boundary-8] with max 1, each set replaces the single entry immediately", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ now: clock.now, max: 1 });
  for (let i = 0; i < 5; i += 1) {
    cache.set(`k${i}`, i);
    assert.equal(cache.get(`k${i}`), i);
    if (i > 0) assert.equal(cache.get(`k${i - 1}`), undefined);
  }
});

// Extends "[unhappy-5] a max of 0 or -1 still keeps the newest entry": re-setting the only key keeps it.
test("[unhappy-5] with max 0 or -1, re-setting the only key keeps it with the new value", () => {
  for (const max of [0, -1]) {
    const clock = fakeClock();
    const cache = recentReads<string>({ now: clock.now, max });
    cache.set("a", "A1");
    cache.set("a", "A2");
    assert.equal(cache.get("a"), "A2", `max ${max}`);
  }
});

// Extends "[unhappy-5] a max of -1000 keeps only the newest entry across several sets": -Infinity, a longer
// run with a returning key.
test("[unhappy-5] with max -Infinity or 0, a run of sets keeps only the newest, including a key that returns", () => {
  for (const max of [-Infinity, 0]) {
    const clock = fakeClock();
    const cache = recentReads<string>({ now: clock.now, max });
    cache.set("a", "A1");
    cache.set("b", "B");
    cache.set("c", "C");
    cache.set("a", "A2");
    assert.equal(cache.get("b"), undefined, `max ${max}`);
    assert.equal(cache.get("c"), undefined, `max ${max}`);
    assert.equal(cache.get("a"), "A2", `max ${max}`);
  }
});

// Extends "[unhappy-5] …": with max 0, set calls now exactly once per call, and the evicted key is missing.
test("[unhappy-5] with max 0, each set calls now once and a get of the evicted key calls it not at all", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ now: clock.now, max: 0 });
  cache.set("a", "A");
  cache.set("b", "B");
  assert.equal(clock.calls, 2);
  assert.equal(cache.get("a"), undefined);
  assert.equal(clock.calls, 2);
  assert.equal(cache.get("b"), "B");
  assert.equal(clock.calls, 3);
});
