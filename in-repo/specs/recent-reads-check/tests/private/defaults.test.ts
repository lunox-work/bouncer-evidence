import assert from "node:assert/strict";
import { test } from "node:test";
import { RECENT_JIRA_READ_MS, recentReads } from "../../src/jira/recent.js";

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

// Extends "[happy-1] a ttlMs of RECENT_JIRA_READ_MS keeps an entry for 59999 ms…":
// another stored-at, and the constant read alongside a working cache.
test("[happy-1] RECENT_JIRA_READ_MS is 60000, and as a ttlMs it expires an entry stored at 5000000 exactly 60000 later", () => {
  const clock = fakeClock(5_000_000);
  const cache = recentReads<string>({ ttlMs: RECENT_JIRA_READ_MS, now: clock.now, max: 3 });
  cache.set("k", "v");
  assert.equal(RECENT_JIRA_READ_MS, 60000);
  clock.at(5_059_999);
  assert.equal(cache.get("k"), "v");
  clock.at(5_060_000);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[happy-2] with no ttlMs, an entry set at 1000 is fresh at 60999…": an epoch-sized stored-at.
test("[happy-2] with no ttlMs, an entry stored at an epoch-sized reading lives exactly 60000 ms", () => {
  const start = 1_763_600_000_000;
  const clock = fakeClock(start);
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "v");
  clock.at(start + 30_000);
  assert.equal(cache.get("k"), "v");
  clock.at(start + 59_999);
  assert.equal(cache.get("k"), "v");
  clock.at(start + 60_000);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[happy-2] … set at reading 0 …": max given and ttlMs missing, several keys stored at different readings.
test("[happy-2] with no ttlMs and max 3, each key expires 60000 ms after its own stored-at", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 3 });
  cache.set("a", "A");
  clock.at(11_000);
  cache.set("b", "B");
  clock.at(60_999);
  assert.equal(cache.get("a"), "A");
  clock.at(61_000);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("b"), "B");
  clock.at(70_999);
  assert.equal(cache.get("b"), "B");
  clock.at(71_000);
  assert.equal(cache.get("b"), undefined);
});

// Extends "[happy-3] with no options, Date.now drives expiry…": another wall reading and the call count on Date.now.
test("[happy-3] with no options, Date.now is read once per set and once per get of a present key", (t) => {
  let wall = 1_763_600_000_000;
  let calls = 0;
  t.mock.method(Date, "now", () => {
    calls += 1;
    return wall;
  });
  const cache = recentReads<string>();
  const before = calls;
  cache.set("k", "v");
  assert.equal(calls - before, 1);
  assert.equal(cache.get("k"), "v");
  assert.equal(calls - before, 2);
  assert.equal(cache.get("absent"), undefined);
  assert.equal(calls - before, 2);
  wall += 60_000;
  assert.equal(cache.get("k"), undefined);
  assert.equal(calls - before, 3);
});

// Extends "[happy-3] with no options, an entry read right away…": ttlMs given but no now still uses Date.now.
test("[happy-3] with ttlMs given and no now, expiry follows Date.now", (t) => {
  let wall = 2_000_000;
  t.mock.method(Date, "now", () => wall);
  const cache = recentReads<string>({ ttlMs: 500 });
  cache.set("k", "v");
  wall = 2_000_499;
  assert.equal(cache.get("k"), "v");
  wall = 2_000_500;
  assert.equal(cache.get("k"), undefined);
});

// Extends "[boundary-1] with no max, the cache holds 1000 entries…": many more sets than 1000.
test("[boundary-1] with no max, after 2000 sets exactly the last 1000 keys remain", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 2000; i += 1) cache.set(`k${i}`, i);
  assert.equal(cache.get("k0"), undefined);
  assert.equal(cache.get("k999"), undefined);
  assert.equal(cache.get("k1000"), 1000);
  assert.equal(cache.get("k1500"), 1500);
  assert.equal(cache.get("k1999"), 1999);
});

// Extends "[boundary-1] with no max, re-setting a key in a full 1000-entry cache evicts nothing":
// the re-set key moves to the newest position, so the next new key evicts k1, not k0.
test("[boundary-1] with no max, re-setting the oldest key of a full cache makes the next new key evict the second oldest", () => {
  const clock = fakeClock();
  const cache = recentReads<number>({ now: clock.now });
  for (let i = 0; i < 1000; i += 1) cache.set(`k${i}`, i);
  cache.set("k0", -1);
  cache.set("k1000", 1000);
  assert.equal(cache.get("k0"), -1);
  assert.equal(cache.get("k1"), undefined);
  assert.equal(cache.get("k2"), 2);
  assert.equal(cache.get("k1000"), 1000);
});

// Extends "[boundary-2] ttlMs and max given as undefined…": now given as undefined falls back to Date.now.
test("[boundary-2] now given as undefined takes its default, Date.now", (t) => {
  let wall = 3_000_000;
  t.mock.method(Date, "now", () => wall);
  const cache = recentReads<string>({ ttlMs: 500, now: undefined, max: 2 });
  cache.set("k", "v");
  wall = 3_000_499;
  assert.equal(cache.get("k"), "v");
  wall = 3_000_500;
  assert.equal(cache.get("k"), undefined);
});

// Extends "[boundary-2] max given as undefined holds 1000 entries…": ttlMs undefined alongside an explicit max.
test("[boundary-2] ttlMs given as undefined with max 2: the default ttl and the given max both apply", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: undefined, now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("b", "B");
  cache.set("c", "C");
  assert.equal(cache.get("a"), undefined);
  clock.at(60_999);
  assert.equal(cache.get("b"), "B");
  clock.at(61_000);
  assert.equal(cache.get("c"), undefined);
});

// Extends "[boundary-2] …": everything given as undefined at once, including now.
test("[boundary-2] all three options given as undefined behave like no options", (t) => {
  let wall = 4_000_000;
  t.mock.method(Date, "now", () => wall);
  const cache = recentReads<number>({ ttlMs: undefined, now: undefined, max: undefined });
  for (let i = 0; i < 1001; i += 1) cache.set(`k${i}`, i);
  assert.equal(cache.get("k0"), undefined);
  assert.equal(cache.get("k1"), 1);
  wall = 4_059_999;
  assert.equal(cache.get("k1000"), 1000);
  wall = 4_060_000;
  assert.equal(cache.get("k1000"), undefined);
});
