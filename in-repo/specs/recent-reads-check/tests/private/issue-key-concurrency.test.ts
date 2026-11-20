import assert from "node:assert/strict";
import { test } from "node:test";
import { issueKey, recentReads } from "../../src/jira/recent.js";

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

// Extends "[happy-12] issueKey joins organizationId, connectionId and issueId with \n": other ids, computed
// from the spec's formula rather than a table.
test("[happy-12] issueKey returns o + \"\\n\" + c + \"\\n\" + i for other ids, including long ones", () => {
  const cases: Array<[string, string, string]> = [
    ["org_9f3a", "jcn_77", "20480"],
    ["ORG", "JCN", "abc-123"],
    ["o".repeat(500), "c".repeat(300), "i".repeat(200)],
    ["007", "0", "00"],
  ];
  for (const [o, c, i] of cases) {
    assert.equal(issueKey(o, c, i), o + "\n" + c + "\n" + i);
  }
});

// Extends "[happy-12] issueKey keeps whitespace, case and other characters…": separators and escapes that a
// sanitizing or encoding implementation would change.
test("[happy-12] issueKey leaves backslashes, quotes, carriage returns, colons and emoji untouched", () => {
  assert.equal(issueKey("a\\nb", "\"c\"", "d\r"), "a\\nb\n\"c\"\nd\r");
  assert.equal(issueKey("org:1", "jcn|1", "\u{1F600}"), "org:1\njcn|1\n\u{1F600}");
  assert.equal(issueKey("[\"a\"]", "{}", "%0A"), "[\"a\"]\n{}\n%0A");
});

// Extends "[happy-13] an issueKey-keyed cache hits for the same ids…": several issues across organizations
// and connections, each kept apart.
test("[happy-13] an issueKey-keyed cache keeps six id triples apart", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  const triples: Array<[string, string, string]> = [];
  for (const o of ["org_1", "org_2"]) {
    for (const c of ["jcn_1", "jcn_2"]) {
      triples.push([o, c, "10001"]);
    }
  }
  triples.push(["org_1", "jcn_1", "10002"]);
  triples.push(["org_1", "jcn_1", "PROJ-7"]);
  triples.forEach(([o, c, i], n) => cache.set(issueKey(o, c, i), `issue ${n}`));
  triples.forEach(([o, c, i], n) => assert.equal(cache.get(issueKey(o, c, i)), `issue ${n}`));
  assert.equal(cache.get(issueKey("org_3", "jcn_1", "10001")), undefined);
});

// Extends "[happy-13] … misses for another issue and for the ids in another order": an issueKey entry expires
// on the default one-minute ttl, and a re-read after expiry misses.
test("[happy-13] an issueKey-keyed entry is reused within a minute and missed from 60000 ms on", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set(issueKey("org_1", "jcn_1", "10001"), "issue A");
  clock.at(60_999);
  assert.equal(cache.get(issueKey("org_1", "jcn_1", "10001")), "issue A");
  clock.at(61_000);
  assert.equal(cache.get(issueKey("org_1", "jcn_1", "10001")), undefined);
});

// Extends "[boundary-14] issueKey with only the connection id empty…": each other position empty.
test("[boundary-14] issueKey keeps both separators when the first, the last, or two ids are empty", () => {
  assert.equal(issueKey("", "jcn_1", "10001"), "\njcn_1\n10001");
  assert.equal(issueKey("org_1", "jcn_1", ""), "org_1\njcn_1\n");
  assert.equal(issueKey("", "", "10001"), "\n\n10001");
  assert.equal(issueKey("org_1", "", ""), "org_1\n\n");
});

// Extends "[boundary-14] issueKey(\"\", \"\", \"\") returns \"\\n\\n\"": keys from empty ids work as cache keys, apart from "".
test("[boundary-14] the all-empty issue key is a cache key separate from the empty string", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now });
  cache.set(issueKey("", "", ""), "empties");
  assert.equal(cache.get(""), undefined);
  assert.equal(cache.get("\n\n"), "empties");
  assert.equal(cache.get(issueKey("", "", "x")), undefined);
});

// Extends "[unhappy-6] ids containing a newline are not escaped…": more colliding triples.
test("[unhappy-6] newlines in any position, or at the ends of ids, produce colliding keys", () => {
  assert.equal(issueKey("a", "b", "c\nd"), "a\nb\nc\nd");
  assert.equal(issueKey("x\n", "y", "z"), "x\n\ny\nz");
  assert.equal(issueKey("x", "", "y\nz"), "x\n\ny\nz");
  assert.equal(issueKey("\n", "", ""), "\n\n\n");
  assert.equal(issueKey("", "\n", ""), "\n\n\n");
});

// Extends "[unhappy-6] colliding issue keys share one cache entry": a set under one triple overwrites the
// value stored under the colliding one.
test("[unhappy-6] setting a colliding issue key replaces the other triple's value", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ now: clock.now, max: 2 });
  cache.set(issueKey("a\nb", "c", "d"), "first");
  cache.set("other", "O");
  cache.set(issueKey("a", "b\nc", "d"), "second");
  assert.equal(cache.get(issueKey("a\nb", "c", "d")), "second");
  assert.equal(cache.get("other"), "O");
});

// Extends "[concurrency-1] a key set in one cache is not seen by another": caches with different ttls; a get
// that deletes an expired entry in one leaves the other's entry.
test("[concurrency-1] expiry and deletion in one cache leave the same key in another cache alone", () => {
  const clock = fakeClock();
  const short = recentReads<string>({ ttlMs: 500, now: clock.now });
  const long = recentReads<string>({ ttlMs: 5000, now: clock.now });
  short.set("k", "short");
  long.set("k", "long");
  clock.at(1500);
  assert.equal(short.get("k"), undefined);
  assert.equal(long.get("k"), "long");
  short.set("k", "short2");
  assert.equal(long.get("k"), "long");
  assert.equal(short.get("k"), "short2");
});

// Extends "[concurrency-1] evictions in one full cache never touch another cache's entries": three caches,
// filling one far past its max.
test("[concurrency-1] filling one of three caches past its max leaves the other two whole", () => {
  const clock = fakeClock();
  const caches = [0, 1, 2].map(() => recentReads<number>({ now: clock.now, max: 3 }));
  caches.forEach((cache, n) => cache.set("shared", n));
  for (let i = 0; i < 10; i += 1) caches[0]!.set(`k${i}`, i);
  assert.equal(caches[0]!.get("shared"), undefined);
  assert.equal(caches[1]!.get("shared"), 1);
  assert.equal(caches[2]!.get("shared"), 2);
  assert.equal(caches[1]!.get("k9"), undefined);
});

// Extends "[concurrency-2] interleaved writers to one key: the last set wins…": the last set happens at an
// earlier reading than the one before it; it still wins and its earlier stored-at counts.
test("[concurrency-2] the last set wins even when it carries an earlier reading, and expires from that reading", () => {
  const clock = fakeClock(1200);
  const cache = recentReads<string>({ now: clock.now });
  cache.set("k", "second");
  clock.at(1000);
  cache.set("k", "first");
  assert.equal(cache.get("k"), "first");
  clock.at(60_999);
  assert.equal(cache.get("k"), "first");
  clock.at(61_000);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[concurrency-2] two writers that set one key at the same reading…": three writers, interleaved with
// a write to another key; the last call wins.
test("[concurrency-2] three interleaved writers to one key: the third set wins and expires ttl after it", () => {
  const clock = fakeClock();
  const cache = recentReads<string>({ ttlMs: 500, now: clock.now });
  cache.set("k", "w1");
  clock.at(1100);
  cache.set("other", "O");
  cache.set("k", "w2");
  clock.at(1300);
  cache.set("k", "w3");
  assert.equal(cache.get("k"), "w3");
  clock.at(1799);
  assert.equal(cache.get("k"), "w3");
  clock.at(1800);
  assert.equal(cache.get("k"), undefined);
});

// Extends "[concurrency-3] a stored promise is returned by reference to every reader": a rejected promise is
// also returned as is, not unwrapped or replaced.
test("[concurrency-3] a stored rejected promise is returned by reference to two readers", async () => {
  const clock = fakeClock();
  const cache = recentReads<Promise<string>>({ now: clock.now });
  const p = Promise.reject(new Error("jira down"));
  p.catch(() => {});
  cache.set("k", p);
  const one = cache.get("k");
  clock.at(30_000);
  const two = cache.get("k");
  assert.equal(one, p);
  assert.equal(two, p);
  await assert.rejects(p, { message: "jira down" });
});

// Extends "[concurrency-3] a still-pending promise is shared by readers…": a non-promise thenable is not
// awaited or wrapped, and a replaced promise is not returned again.
test("[concurrency-3] a stored thenable comes back by reference, and re-setting the key shares the new promise instead", () => {
  const clock = fakeClock();
  const cache = recentReads<PromiseLike<string>>({ now: clock.now });
  const thenable: PromiseLike<string> = {
    then(onFulfilled) {
      return Promise.resolve(onFulfilled ? onFulfilled("issue") : "issue") as never;
    },
  };
  cache.set("k", thenable);
  assert.equal(cache.get("k"), thenable);
  assert.equal(cache.get("k"), thenable);
  const next = Promise.resolve("issue 2");
  cache.set("k", next);
  assert.equal(cache.get("k"), next);
  assert.equal(cache.get("k"), next);
});
