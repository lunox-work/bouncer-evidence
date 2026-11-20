import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  DEFAULT_ISSUE_TYPE,
  TICKET_LIMITS,
  type TicketContent,
  ticketSpecHash,
} from "../../src/ticket.js";

/**
 * Hidden checks for ticketSpecHash: SHA-256 of
 * JSON.stringify([normalized title, normalized description, normalized
 * issueType]), UTF-8 encoded, as 64 lowercase hex characters. Expected values
 * are computed here from already-normalized literals with node:crypto.
 */

const STORY_HASH =
  "412c518dd58be9028f3217a5290f893d8af0077953903a8ccaf6f2fb79f853ea";
const BUG_HASH =
  "7eb97fbde6a96dc9fc204b244410d928f6403c3ffd663240b97f1fb63efda9d7";

/** The fingerprint of three fields that are already normalized. */
function expected(title: string, description: string, issueType: string): string {
  return createHash("sha256")
    .update(JSON.stringify([title, description, issueType]), "utf8")
    .digest("hex");
}

// extends: "[happy-5] ticketSpecHash returns the known fingerprint for title, description and type"
test("[happy-5] fingerprints of other ordinary specs match SHA-256 of the JSON tuple", async () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ["Add CSV export", "Users can export the table as CSV.", "Story"],
    ["Fix login", "The login button does nothing.", "Bug"],
    ["Epic", "Many things", "Epic"],
    ["Title", "Description", "Task"],
    ["Description", "Title", "Story"],
    ["x", "y", "z"],
  ];
  for (const [t, d, i] of cases) {
    assert.equal(await ticketSpecHash(t, d, i), expected(t, d, i), JSON.stringify([t, d, i]));
  }
});

// extends: "[happy-5] known fingerprints for single-letter fields and an empty description"
test("[happy-5] fingerprints of multi-line, quoted, escaped and non-ASCII specs match SHA-256 of the UTF-8 JSON tuple", async () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ["Steps", "1. open\n  2. click\n\n3. done", "Bug"],
    ['Say "hi"', 'He said "no" \\ then left', "Story"],
    ["Tab\tinside", "a\tb", "Task"],
    ["Café résumé", "日本語の説明", "Story"],
    ["Emoji 😀", "🦀 crab", "Bug"],
    ["Café", "Ａ", "Task"],
    ["<script>", "</script>&amp;", "Story"],
    ["\u0001ctl", "nul\u0000byte", "Task"],
    ["[1,2]", '{"a":1}', "null"],
  ];
  for (const [t, d, i] of cases) {
    assert.equal(await ticketSpecHash(t, d, i), expected(t, d, i), JSON.stringify([t, d, i]));
  }
});

// extends: "[happy-5] ticketSpecHash returns the known fingerprint for title, description and type"
test("[happy-5] fingerprints of specs at the field limits and beyond match SHA-256 of the JSON tuple", async () => {
  const title = "T".repeat(TICKET_LIMITS.title);
  const description = Array.from({ length: 1000 }, (_, i) => `line ${i} 😀`)
    .join("\n")
    .padEnd(TICKET_LIMITS.description, "d");
  const issueType = "I".repeat(TICKET_LIMITS.issueType);
  assert.equal(
    await ticketSpecHash(title, description, issueType),
    expected(title, description, issueType),
  );
  const huge = "word ".repeat(40_000).trim();
  assert.equal(await ticketSpecHash(huge, huge, huge), expected(huge, huge, huge));
});

// extends: "[happy-6] a noisy spec hashes equal to its clean form in every field"
test("[happy-6] noise in only the title, only the description or only the issue type is normalized away", async () => {
  assert.equal(await ticketSpecHash("  Title\r\n", "Description", "Story"), STORY_HASH);
  assert.equal(await ticketSpecHash("Title", "\r\n\t Description \t\r\n", "Story"), STORY_HASH);
  assert.equal(await ticketSpecHash("Title", "Description", "\tStory  "), STORY_HASH);
  assert.equal(await ticketSpecHash("Title", "Description", "\r\nBug\r"), BUG_HASH);
});

// extends: "[happy-6] trailing whitespace and CRLF do not change the fingerprint"
test("[happy-6] a multi-line description with CRLF, CR and trailing spaces hashes as its normalized form", async () => {
  const noisy = "  Steps:  \r\n  1. open\t\r  2. click   \r\n\r\n\r\nDone \r\n";
  const clean = "Steps:\n  1. open\n  2. click\n\n\nDone";
  const hash = await ticketSpecHash("Repro\t", noisy, "Bug\r\n");
  assert.equal(hash, expected("Repro", clean, "Bug"));
  assert.equal(hash, await ticketSpecHash("Repro", clean, "Bug"));
});

// extends: "[happy-6] a noisy spec hashes equal to its clean form in every field"
test("[happy-6] whitespace the normalization keeps does change the fingerprint", async () => {
  // Leading indent after the first line, inner spaces and inner blank lines are kept.
  assert.notEqual(await ticketSpecHash("Title", "a\n  b", "Story"), await ticketSpecHash("Title", "a\nb", "Story"));
  assert.notEqual(await ticketSpecHash("Add  CSV", "D", "Story"), await ticketSpecHash("Add CSV", "D", "Story"));
  assert.notEqual(await ticketSpecHash("Title", "a\n\nb", "Story"), await ticketSpecHash("Title", "a\nb", "Story"));
  assert.equal(await ticketSpecHash("Title", "a\n  b", "Story"), expected("Title", "a\n  b", "Story"));
});

// extends: "[happy-7] a lowercased issue type gives its own fingerprint"
test("[happy-7] other casings of the issue type each give their own fingerprint", async () => {
  const hashes = new Set<string>();
  for (const issueType of ["Story", "story", "STORY", "sToRy", "Bug", "bug", "BUG"]) {
    const hash = await ticketSpecHash("Title", "Description", issueType);
    assert.equal(hash, expected("Title", "Description", issueType), issueType);
    hashes.add(hash);
  }
  assert.equal(hashes.size, 7);
});

// extends: "[happy-7] changing the case of the title or description changes the fingerprint"
test("[happy-7] upper-casing the title or description gives the fingerprint of the text as written", async () => {
  assert.equal(
    await ticketSpecHash("TITLE", "Description", "Story"),
    expected("TITLE", "Description", "Story"),
  );
  assert.equal(
    await ticketSpecHash("Title", "DESCRIPTION", "Story"),
    expected("Title", "DESCRIPTION", "Story"),
  );
  assert.notEqual(
    await ticketSpecHash("Straße", "Description", "Story"),
    await ticketSpecHash("STRASSE", "Description", "Story"),
  );
});

// extends: "[happy-8] a ticket at the label count limit still hashes on its three spec fields only"
// extends: "[happy-8] tickets differing only in priority, labels, components and truncation share a fingerprint"
test("[happy-8] tickets with other spec fields and very different extra fields share their spec fingerprint", async () => {
  const base = { title: "Fix login", description: "Button does nothing.", issueType: "Bug" };
  const variants: TicketContent[] = [
    { ...base, priority: null, labels: [], components: [], inputTruncated: false },
    { ...base, priority: "Highest", labels: ["auth", "ui"], components: ["web"], inputTruncated: false },
    {
      ...base,
      priority: "p".repeat(TICKET_LIMITS.priority),
      labels: Array.from({ length: TICKET_LIMITS.labels }, (_, i) => "l".repeat(TICKET_LIMITS.label - 1) + i),
      components: Array.from({ length: 100 }, (_, i) => `component-${i}`),
      inputTruncated: true,
    },
  ];
  const want = expected("Fix login", "Button does nothing.", "Bug");
  for (const content of variants) {
    assert.equal(await ticketSpecHash(content.title, content.description, content.issueType), want);
  }
});

// extends: "[boundary-6] moving text from description into title changes the fingerprint"
test("[boundary-6] moving text between any two fields changes the fingerprint", async () => {
  const groups: ReadonlyArray<ReadonlyArray<readonly [string, string, string]>> = [
    [["A", "B", "Task"], ["AB", "", "Task"], ["", "AB", "Task"], ["A", "", "BTask"], ["A", "BTask", ""]],
    [["Title", "Description", "Story"], ["TitleDescription", "", "Story"], ["Title", "DescriptionStory", ""]],
    [["a b", "c", "Task"], ["a", "b c", "Task"]],
    [["A", "B", "C"], ["B", "A", "C"], ["C", "B", "A"]],
  ];
  for (const group of groups) {
    const hashes = await Promise.all(group.map(([t, d, i]) => ticketSpecHash(t, d, i)));
    assert.equal(new Set(hashes).size, group.length, JSON.stringify(group));
    group.forEach(([t, d, i], n) => assert.equal(hashes[n], expected(t, d, i)));
  }
});

// extends: "[boundary-6] a title that looks like a JSON field separator does not collide"
test("[boundary-6] separator-looking text in any field hashes as JSON-escaped text, not as a field break", async () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ['A","B', "", "Task"],
    ["A", 'B","Task', ""],
    ["A|B", "", "Task"],
    ["A", "|B", "Task"],
    ["A\u0000B", "", "Task"],
    ["A", "\u0000B", "Task"],
    ["A\\", "B", "Task"],
    ['A\\"', "B", "Task"],
    ['["A"', '"B"]', "Task"],
  ];
  const plain = await ticketSpecHash("A", "B", "Task");
  for (const [t, d, i] of cases) {
    const hash = await ticketSpecHash(t, d, i);
    assert.equal(hash, expected(t, d, i), JSON.stringify([t, d, i]));
    assert.notEqual(hash, plain);
  }
});

// extends: "[boundary-7] an empty issue type does not reject and is not replaced by the default"
test("[boundary-7] each empty field alone is hashed as empty, without rejecting or substituting a default", async () => {
  const cases: ReadonlyArray<readonly [string, string, string]> = [
    ["", "Description", "Story"],
    ["Title", "", "Story"],
    ["Title", "Description", ""],
    ["", "", "Task"],
    ["Title", "", ""],
  ];
  for (const [t, d, i] of cases) {
    const pending = ticketSpecHash(t, d, i);
    await assert.doesNotReject(pending);
    assert.equal(await pending, expected(t, d, i), JSON.stringify([t, d, i]));
  }
  assert.notEqual(
    await ticketSpecHash("Title", "Description", ""),
    await ticketSpecHash("Title", "Description", DEFAULT_ISSUE_TYPE),
  );
});

// extends: "[boundary-7] all-empty fields hash to the known fingerprint"
test("[boundary-7] blank fields normalize to empty and hash as all-empty fields", async () => {
  const allEmpty = "799c55d702efedb7750db18b36386fc3a3f4be7dddcfb649adeb41a3ed0da228";
  assert.equal(await ticketSpecHash("   ", "\r\n\t\n ", "\t"), allEmpty);
  assert.equal(await ticketSpecHash("\n", "", "  \r  "), allEmpty);
  assert.equal(allEmpty, expected("", "", ""));
});

// extends: "[boundary-8] a Unicode and emoji spec hashes to 64 lowercase hex characters"
test("[boundary-8] the Unicode and emoji spec hashes to the lowercase hex of its UTF-8 JSON tuple", async () => {
  const hash = await ticketSpecHash("Ünïcødé 😀", "line\nline", DEFAULT_ISSUE_TYPE);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash, expected("Ünïcødé 😀", "line\nline", "Task"));
});

// extends: "[boundary-8] empty, blank and long specs also hash to 64 lowercase hex characters"
test("[boundary-8] many varied specs all hash to 64 lowercase hex characters, never base64 or truncated", async () => {
  const inputs: Array<readonly [string, string, string]> = [];
  for (let n = 0; n < 40; n += 1) {
    inputs.push([`Title ${n}`, "é😀".repeat(n), n % 2 === 0 ? "Story" : "Bug"]);
  }
  for (const [t, d, i] of inputs) {
    const hash = await ticketSpecHash(t, d, i);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.equal(hash, expected(t, d, i));
  }
});

// extends: "[concurrency-1] three overlapping calls resolve to their own hashes in call order"
test("[concurrency-1] many overlapping calls with distinct inputs resolve in call order to their own hashes", async () => {
  const inputs = Array.from(
    { length: 60 },
    (_, n) => [`Title ${n % 7}`, `Description ${n % 5}`, (["Story", "Bug", "Task"] as const)[n % 3] ?? "Story"] as const,
  );
  const results = await Promise.all(inputs.map(([t, d, i]) => ticketSpecHash(t, d, i)));
  assert.deepEqual(
    results,
    inputs.map(([t, d, i]) => expected(t, d, i)),
  );
});

// extends: "[concurrency-1] many interleaved overlapping calls each resolve to their own input's hash"
test("[concurrency-1] overlapping calls sharing a title, or a description, or an issue type do not share results", async () => {
  const inputs: ReadonlyArray<readonly [string, string, string]> = [
    ["Same", "one", "Story"],
    ["Same", "two", "Story"],
    ["one", "Same", "Story"],
    ["two", "Same", "Story"],
    ["Title", "Description", "Story"],
    ["Title  ", "Description\r\n", "Story"],
    ["Title", "Description", "story"],
    ["", "", ""],
  ];
  const pending = inputs.map(([t, d, i]) => ticketSpecHash(t, d, i));
  const late = ticketSpecHash("Title", "Description", "Bug");
  const results = await Promise.all([...pending, late]);
  assert.deepEqual(results, [
    expected("Same", "one", "Story"),
    expected("Same", "two", "Story"),
    expected("one", "Same", "Story"),
    expected("two", "Same", "Story"),
    STORY_HASH,
    STORY_HASH,
    "bb94137540cd9b69a86b24148004fd4c6568d336f7fb439cb04bce579c8c036d",
    "799c55d702efedb7750db18b36386fc3a3f4be7dddcfb649adeb41a3ed0da228",
    BUG_HASH,
  ]);
});

// extends: "[concurrency-1] three overlapping calls resolve to their own hashes in call order"
test("[concurrency-1] calls started while others are pending, in reverse order, still resolve to their own hashes", async () => {
  const first = ticketSpecHash("Title", "Description", "Bug");
  const second = ticketSpecHash("Title", "Description", "Story");
  const secondResult = await second;
  const third = ticketSpecHash("Title", "Description", "Bug");
  assert.deepEqual([await third, secondResult, await first], [BUG_HASH, STORY_HASH, BUG_HASH]);
});
