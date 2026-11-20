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

// Extends "[happy-11] get returns the very object that was set, mutable and not frozen": arrays, maps and
// functions come back by reference, and the returned value can be extended.
test("[happy-11] arrays, maps and functions are returned by reference and stay extensible", () => {
  const clock = fakeClock();
  const cache = recentReads<unknown>({ now: clock.now });
  const list = [1, 2];
  const map = new Map([["a", 1]]);
  const fn = () => 42;
  cache.set("list", list);
  cache.set("map", map);
  cache.set("fn", fn);
  assert.equal(cache.get("list"), list);
  assert.equal(cache.get("map"), map);
  assert.equal(cache.get("fn"), fn);
  (cache.get("list") as number[]).push(3);
  assert.deepEqual(list, [1, 2, 3]);
  assert.equal(Object.isFrozen(cache.get("list")), false);
  assert.equal(Object.isExtensible(cache.get("map")), true);
});

// Extends "[happy-11] one object stored under two keys…": writes through the returned reference reach the
// original, and the reference survives later reads at other readings.
test("[happy-11] a nested object written through the returned reference changes the original", () => {
  const clock = fakeClock();
  const cache = recentReads<{ issue: { fields: { summary: string } } }>({ now: clock.now });
  const obj = { issue: { fields: { summary: "old" } } };
  cache.set("k", obj);
  clock.at(30_000);
  const got = cache.get("k");
  assert.equal(got, obj);
  if (got) got.issue.fields.summary = "new";
  assert.equal(obj.issue.fields.summary, "new");
  clock.at(60_999);
  assert.equal(cache.get("k")?.issue, obj.issue);
  assert.equal(Object.isFrozen(obj.issue), false);
});

// Extends "[boundary-10] a stored undefined reads back as undefined": a stored undefined is an entry, so it
// takes a slot and is the one evicted first.
test("[boundary-10] a stored undefined takes a slot in a full cache", () => {
  const clock = fakeClock();
  const cache = recentReads<string | undefined>({ now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("u", undefined);
  cache.set("b", "B");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("u"), undefined);
  assert.equal(cache.get("b"), "B");
});

// Extends "[boundary-10] storing undefined over a value replaces it…": get of a stored undefined is a present
// key, so it calls now once; set calls it once.
test("[boundary-10] set of undefined calls now once, and get of the stored undefined calls now once", () => {
  const clock = countingClock();
  const cache = recentReads<string | undefined>({ now: clock.now });
  cache.set("u", undefined);
  assert.equal(clock.calls, 1);
  assert.equal(cache.get("u"), undefined);
  assert.equal(clock.calls, 2);
});

// Extends "[boundary-10] …": a stored undefined replaced by a value reads back as the value.
test("[boundary-10] a value set over a stored undefined is returned", () => {
  const clock = fakeClock();
  const cache = recentReads<string | undefined>({ now: clock.now });
  cache.set("k", undefined);
  cache.set("k", "v");
  assert.equal(cache.get("k"), "v");
});

// Extends "[boundary-11] 0, \"\", false and null are returned as stored": falsy values are present entries when
// re-set in a full cache (nothing evicted) and after time passes.
test("[boundary-11] re-setting a key holding 0 in a full cache evicts nothing, and falsy values survive time", () => {
  const clock = fakeClock();
  const cache = recentReads<unknown>({ now: clock.now, max: 2 });
  cache.set("zero", 0);
  cache.set("empty", "");
  cache.set("zero", false);
  clock.at(60_999);
  assert.equal(cache.get("empty"), "");
  assert.equal(cache.get("zero"), false);
});

// Extends "[boundary-11] NaN and -0 are returned as stored": 0n, and get on each falsy value calls now once.
test("[boundary-11] 0n, null and false are present entries: each get returns them and calls now once", () => {
  const clock = countingClock();
  const cache = recentReads<unknown>({ now: clock.now });
  cache.set("big", 0n);
  cache.set("nil", null);
  cache.set("no", false);
  assert.equal(clock.calls, 3);
  assert.equal(cache.get("big"), 0n);
  assert.equal(cache.get("nil"), null);
  assert.equal(cache.get("no"), false);
  assert.equal(clock.calls, 6);
});

// Extends "[boundary-12] keys differing in case or leading whitespace…": Unicode forms and mixed case.
test("[boundary-12] keys differing in Unicode normalization form or in mixed case are separate entries", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  const composed = "café";
  const decomposed = "café";
  cache.set(composed, "nfc");
  assert.equal(cache.get(decomposed), undefined);
  cache.set(decomposed, "nfd");
  cache.set("Proj-1", "mixed");
  assert.equal(cache.get(composed), "nfc");
  assert.equal(cache.get(decomposed), "nfd");
  assert.equal(cache.get("Proj-1"), "mixed");
  assert.equal(cache.get("PROJ-1"), undefined);
  assert.equal(cache.get("proj-1"), undefined);
});

// Extends "[boundary-12] keys differing only by trailing whitespace…": newline and non-breaking space variants,
// and keys named after Object.prototype members.
test("[boundary-12] keys differing by a newline or a non-breaking space, and keys like __proto__, are separate entries", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "plain");
  cache.set("k\n", "newline");
  cache.set("k ", "nbsp");
  cache.set("__proto__", "proto");
  cache.set("constructor", "ctor");
  assert.equal(cache.get("k"), "plain");
  assert.equal(cache.get("k\n"), "newline");
  assert.equal(cache.get("k "), "nbsp");
  assert.equal(cache.get("\nk"), undefined);
  assert.equal(cache.get("__proto__"), "proto");
  assert.equal(cache.get("constructor"), "ctor");
  assert.equal(cache.get("toString"), undefined);
});

// Extends "[boundary-13] the empty string is a valid key": "" takes a slot and is evicted like any other key.
test("[boundary-13] the empty key takes a slot, is evicted first when oldest, and expires on time", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now, max: 2 });
  cache.set("", "empty");
  cache.set("a", "A");
  cache.set("b", "B");
  assert.equal(cache.get(""), undefined);
  cache.set("", "again");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get(""), "again");
  clock.at(1500);
  assert.equal(cache.get(""), undefined);
});

// Extends "[boundary-13] the empty key and a single-space key are separate entries": re-setting "" in a full
// cache evicts nothing, and get of a present "" calls now once.
test("[boundary-13] re-setting the empty key in a full cache evicts nothing and reads call now once", () => {
  const clock = countingClock();
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  cache.set("a", "A");
  cache.set("", "v1");
  cache.set("", "v2");
  assert.equal(clock.calls, 3);
  assert.equal(cache.get(""), "v2");
  assert.equal(clock.calls, 4);
  assert.equal(cache.get("a"), "A");
});
