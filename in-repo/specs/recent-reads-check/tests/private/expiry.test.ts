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

// Extends "[boundary-3] with ttlMs 500 and stored-at 1000…": another ttl and stored-at, each reading in its own cache.
test("[boundary-3] with ttlMs 1000 and stored-at 5000: fresh at 5000, 5999 and 4000; gone at 6000 and 7000", () => {
  const rows: Array<[number, string | undefined]> = [
    [5000, "v"],
    [5999, "v"],
    [4000, "v"],
    [6000, undefined],
    [7000, undefined],
  ];
  for (const [reading, result] of rows) {
    const clock = fakeClock(5000);
    const cache = recentReads<string>({ ttlMs: 1000, now: clock.now });
    cache.set("k", "v");
    clock.at(reading);
    assert.equal(cache.get("k"), result, `reading ${reading}`);
  }
});

// Extends "[boundary-3] with ttlMs 1…": fractional readings, so an age just under ttlMs is still fresh.
test("[boundary-3] with ttlMs 500, a fractional age of 499.5 is fresh and 500 is gone", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(1499.5);
  assert.equal(cache.get("k"), "v");
  clock.at(1499.999);
  assert.equal(cache.get("k"), "v");
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[boundary-3] …": a fractional ttlMs.
test("[boundary-3] with ttlMs 250.5, age 250 is fresh and age 250.5 is gone", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 250.5, now: clock.now });
  cache.set("k", "v");
  clock.at(1250);
  assert.equal(cache.get("k"), "v");
  clock.at(1250.5);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[boundary-4] after the clock moves back to 0…": with the default ttl, an age of -60000 is fresh
// (its magnitude equals ttlMs, so a check on the absolute age would wrongly expire it).
test("[boundary-4] with the default ttl, an age of exactly -60000 counts as fresh", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "v");
  clock.at(-59_000);
  assert.equal(cache.get("k"), "v");
  clock.at(-1_000_000_000);
  assert.equal(cache.get("k"), "v");
});

// Extends "[boundary-4] a hugely negative age is fresh…": after a backwards read, expiry is still relative to stored-at.
test("[boundary-4] a read with a negative age neither moves stored-at nor delays expiry", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  clock.at(999.5);
  assert.equal(cache.get("k"), "v");
  clock.at(400);
  assert.equal(cache.get("k"), "v");
  clock.at(1499);
  assert.equal(cache.get("k"), "v");
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[boundary-9] with ttlMs Infinity…": a far larger reading, and repeated reads.
test("[boundary-9] with ttlMs Infinity, an entry is fresh at Number.MAX_VALUE and after the clock moves back", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: Infinity, now: clock.now });
  cache.set("k", "v");
  clock.at(Number.MAX_VALUE);
  assert.equal(cache.get("k"), "v");
  clock.at(-Number.MAX_VALUE);
  assert.equal(cache.get("k"), "v");
  clock.at(1e300);
  assert.equal(cache.get("k"), "v");
});

// Extends "[boundary-9] …": Infinity ttl does not lift the size limit.
test("[boundary-9] with ttlMs Infinity and max 2, entries never expire but the oldest is still evicted", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: Infinity, now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("b", "B");
  clock.at(1e15);
  assert.equal(cache.get("a"), "A");
  cache.set("c", "C");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
});

// Extends "[happy-4] reading an entry at 1400 does not extend its life past 1500": many reads,
// each well within ttlMs of the previous one (a sliding window would keep it alive).
test("[happy-4] reads every 100 ms from 1100 to 1400 do not keep an entry alive at 1500", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v");
  for (const reading of [1100, 1200, 1300, 1400]) {
    clock.at(reading);
    assert.equal(cache.get("k"), "v", `reading ${reading}`);
  }
  clock.at(1500);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[happy-4] reading an entry at its last fresh moment…": default ttl, two keys read at different times.
test("[happy-4] with the default ttl, reading one key near its end extends neither key", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("a", "A");
  clock.at(31_000);
  cache.set("b", "B");
  clock.at(60_999);
  assert.equal(cache.get("a"), "A");
  assert.equal(cache.get("b"), "B");
  clock.at(61_000);
  assert.equal(cache.get("a"), undefined);
  clock.at(90_999);
  assert.equal(cache.get("b"), "B");
  clock.at(91_000);
  assert.equal(cache.get("b"), undefined);
});

// Extends "[happy-7] re-setting a key at 1400 restarts its age…": the re-set happens at an earlier reading,
// so the new stored-at is earlier than the old one and expiry comes sooner.
test("[happy-7] re-setting a key after the clock moved back to 800 takes 800 as its stored-at", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "old");
  clock.at(800);
  cache.set("k", "new");
  clock.at(1299);
  assert.equal(cache.get("k"), "new");
  clock.at(1300);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[happy-7] re-setting a key at its last fresh moment…": several re-sets in a row; only the last stored-at counts.
test("[happy-7] after three re-sets, the entry expires ttlMs after the last one", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "v1");
  clock.at(1300);
  cache.set("k", "v2");
  clock.at(1700);
  cache.set("k", "v3");
  clock.at(2100);
  cache.set("k", "v4");
  clock.at(2599);
  assert.equal(cache.get("k"), "v4");
  clock.at(2600);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[happy-10] a one-hour ttlMs keeps a field list…": another stored-at, a read in the middle, and the same reference.
test("[happy-10] a one-hour field list stored at 7200000 is the same array until 10799999 and gone at 10800000", () => {
  const clock = fakeClock(7_200_000);
  const cache = recentReads<string[]>({ ttlMs: 3_600_000, now: clock.now });
  const fields = ["summary", "status", "assignee"];
  cache.set("site", fields);
  clock.at(9_000_000);
  assert.equal(cache.get("site"), fields);
  clock.at(10_799_999);
  assert.equal(cache.get("site"), fields);
  clock.at(10_800_000);
  assert.equal(cache.get("site"), undefined);
});

// Extends "[happy-10] a one-hour field-list cache still hits…": two sites stored at different readings.
test("[happy-10] two sites in a one-hour cache each expire an hour after their own set", () => {
  const clock = fakeClock();
  const cache = recentReads<string[]>({ ttlMs: 3_600_000, now: clock.now });
  cache.set("site-a", ["summary"]);
  clock.at(1_801_000);
  cache.set("site-b", ["status"]);
  clock.at(3_601_000);
  assert.equal(cache.get("site-a"), undefined);
  assert.deepEqual(cache.get("site-b"), ["status"]);
  clock.at(5_400_999);
  assert.deepEqual(cache.get("site-b"), ["status"]);
  clock.at(5_401_000);
  assert.equal(cache.get("site-b"), undefined);
});

// Extends "[unhappy-1] an entry found expired at 1500 stays gone…": the default ttl and an expiry read long after.
test("[unhappy-1] with the default ttl, an entry found expired at 500000 stays gone back at 1000 and at 30000", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "v");
  clock.at(500_000);
  assert.equal(cache.get("k"), undefined);
  clock.at(1000);
  assert.equal(cache.get("k"), undefined);
  clock.at(30_000);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[unhappy-1] … at a reading where its age would be negative": only the key that was read is deleted.
test("[unhappy-1] reading one expired key deletes it while another expired, unread key is still found when the clock moves back", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("a", "A");
  cache.set("b", "B");
  clock.at(1500);
  assert.equal(cache.get("a"), undefined);
  clock.at(1000);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
});

// Extends "[unhappy-2] get on a missing key returns undefined without calling now": names that live on
// Object.prototype are missing keys too.
test("[unhappy-2] keys named after Object.prototype members are missing in an empty cache and do not call now", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ now: clock.now });
  for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.equal(cache.get(key), undefined, key);
  }
  assert.equal(clock.calls, 0);
});

// Extends "[unhappy-2] after get deletes an expired entry…": keys missing because they were never set, were
// evicted, or live in another cache.
test("[unhappy-2] in a populated cache, never-set and evicted keys return undefined without calling now", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  const other = recentReads<string>({ now: clock.now });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  other.set("z", "Z");
  const before = clock.calls;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("z"), undefined);
  assert.equal(cache.get("B"), undefined);
  assert.equal(cache.get("b "), undefined);
  assert.equal(clock.calls, before);
});

// Extends "[unhappy-3] re-setting an expired key at 2000 stores it fresh": the expired key is removed
// before the size check, so re-setting it in a full cache evicts nothing, even though it was inserted last.
test("[unhappy-3] re-setting an expired key in a full cache evicts nothing, and its new value lives a full ttl", () => {
  const clock = fakeClock(1500);
  const cache = recentReads<string>({ ttlMs: 1000, now: clock.now, max: 2 });
  cache.set("b", "B");
  clock.at(1000);
  cache.set("a", "old");
  clock.at(2000);
  cache.set("a", "new");
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("a"), "new");
  clock.at(2999);
  assert.equal(cache.get("a"), "new");
  clock.at(3000);
  assert.equal(cache.get("a"), undefined);
});

// Extends "[unhappy-3] re-setting a key at the reading it expires…": the re-set expired key becomes the newest.
test("[unhappy-3] a re-set expired key moves to the newest position, so the next new key evicts the other entry", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 2 });
  cache.set("a", "old");
  clock.at(1400);
  cache.set("b", "B");
  clock.at(1600);
  cache.set("a", "new");
  cache.set("c", "C");
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), "new");
  assert.equal(cache.get("c"), "C");
});

// Extends "[unhappy-4] a ttlMs of 0, -1 or -5000…": other values, other readings, and several keys.
test("[unhappy-4] a ttlMs of -Infinity or -0.5 also makes entries expire, at the set reading and after", () => {
  for (const ttlMs of [-Infinity, -0.5, 0]) {
    const clock = fakeClock();
    const cache = recentReads<string>({ ttlMs, now: clock.now });
    cache.set("a", "A");
    cache.set("b", "B");
    assert.equal(cache.get("a"), undefined, `ttlMs ${ttlMs}`);
    clock.at(5000);
    assert.equal(cache.get("b"), undefined, `ttlMs ${ttlMs}`);
  }
});

// Extends "[unhappy-4] a ttlMs just above zero…": a ttl of 0 does not disable the cache; set still stores
// (calls now once) and get finds the entry, then deletes it as expired.
test("[unhappy-4] with ttlMs 0, set still calls now once and get finds and deletes the expired entry", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ ttlMs: 0, now: clock.now });
  cache.set("k", "v");
  assert.equal(clock.calls, 1);
  assert.equal(cache.get("k"), undefined);
  assert.equal(clock.calls, 2);
  assert.equal(cache.get("k"), undefined);
  assert.equal(clock.calls, 2);
});

// Extends "[happy-6] set calls now exactly once also when it evicts or replaces…": a longer mix of calls.
test("[happy-6] now is called once per set and once per get of a present key, fresh or expired, across a mix of calls", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  assert.equal(clock.calls, 3);
  assert.equal(cache.get("a"), undefined);
  assert.equal(clock.calls, 3);
  assert.equal(cache.get("b"), "B");
  assert.equal(cache.get("c"), "C");
  assert.equal(clock.calls, 5);
  clock.at(1500);
  assert.equal(cache.get("b"), undefined);
  assert.equal(clock.calls, 6);
  cache.set("c", "C2");
  assert.equal(clock.calls, 7);
  assert.equal(cache.get("c"), "C2");
  assert.equal(clock.calls, 8);
});

// Extends "[happy-6] set calls now once, and get on a present key calls it once more": repeated gets each call it once.
test("[happy-6] five gets of one present key call now five times", () => {
  const clock = countingClock();
  const cache = recentReads<number>({ now: clock.now });
  cache.set("k", 7);
  for (let i = 0; i < 5; i += 1) assert.equal(cache.get("k"), 7);
  assert.equal(clock.calls, 6);
});
