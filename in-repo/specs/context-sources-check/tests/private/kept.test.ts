import assert from "node:assert/strict";
import { test } from "node:test";

import { keptDocuments } from "../../src/sources.js";

/** A document at path whose text is length "x" characters. */
function xs(path: string, length: number) {
  return { path, bytes: length, text: "x".repeat(length) };
}

/** Each kept document as [path, kept length, truncated]. */
function shape(result: ReturnType<typeof keptDocuments>) {
  return result.documents.map((d) => [d.path, d.text.length, d.truncated]);
}

// Extends "[happy-6] line endings are normalized and the text trimmed".
test("[happy-6] trimming removes Unicode whitespace as String.prototype.trim does", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 20, text: "﻿  Title 　\t" },
    ]),
    {
      documents: [{ path: "a.md", bytes: 20, text: "Title", truncated: false }],
      omitted: 0,
    },
  );
});

test("[happy-6] inner whitespace is kept and every CR becomes one LF", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 1, text: "  a  \r\n\r\n  b  \n" },
      { path: "b.md", bytes: 2, text: "a\r\rb\n\rc\r\n\nd" },
      { path: "c.md", bytes: 3, text: "p q\tr" },
    ]),
    {
      documents: [
        { path: "a.md", bytes: 1, text: "a  \n\n  b", truncated: false },
        { path: "b.md", bytes: 2, text: "a\n\nb\n\nc\n\nd", truncated: false },
        { path: "c.md", bytes: 3, text: "p q\tr", truncated: false },
      ],
      omitted: 0,
    },
  );
});

test("[happy-6] documents keep the order given and bytes as given, never recomputed", () => {
  const result = keptDocuments([
    { path: "z.md", bytes: 0, text: "zed" },
    { path: "a.md", bytes: 123456, text: "ay" },
    { path: "m.md", bytes: 7, text: "\u{1F600}" },
  ]);
  assert.deepEqual(result, {
    documents: [
      { path: "z.md", bytes: 0, text: "zed", truncated: false },
      { path: "a.md", bytes: 123456, text: "ay", truncated: false },
      { path: "m.md", bytes: 7, text: "\u{1F600}", truncated: false },
    ],
    omitted: 0,
  });
});

// Extends "[unhappy-4] a blank document is dropped and counted".
test("[unhappy-4] a document of only Unicode whitespace is blank", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "nbsp.md", bytes: 9, text: " ﻿　 " },
      { path: "real.md", bytes: 1, text: "r" },
    ]),
    {
      documents: [{ path: "real.md", bytes: 1, text: "r", truncated: false }],
      omitted: 1,
    },
  );
});

test("[unhappy-4] blank documents take no room and are counted with those dropped for room", () => {
  const result = keptDocuments([
    { path: "b1.md", bytes: 1, text: " " },
    xs("a.md", 12000),
    { path: "b2.md", bytes: 2, text: "\r\n" },
    xs("b.md", 12000),
    xs("c.md", 12000),
    xs("d.md", 12000),
    { path: "b3.md", bytes: 1, text: "\t" },
    xs("e.md", 1),
  ]);
  assert.deepEqual(shape(result), [
    ["a.md", 12000, false],
    ["b.md", 12000, false],
    ["c.md", 12000, false],
    ["d.md", 12000, false],
  ]);
  assert.equal(result.omitted, 4);
});

// Extends "[boundary-13] the per-document cap": a cut by the per-document
// cap does not end the run, and the cut text is not trimmed again.
test("[boundary-13] documents after one cut by the per-document cap are still kept", () => {
  const result = keptDocuments([
    xs("a.md", 30000),
    xs("b.md", 5),
    xs("c.md", 12001),
    xs("d.md", 7),
  ]);
  assert.deepEqual(shape(result), [
    ["a.md", 12000, true],
    ["b.md", 5, false],
    ["c.md", 12000, true],
    ["d.md", 7, false],
  ]);
  assert.equal(result.omitted, 0);
});

test("[boundary-13] a cut ending in whitespace keeps it", () => {
  const result = keptDocuments([
    {
      path: "a.md",
      bytes: 12010,
      text: `${"x".repeat(11999)} ${"y".repeat(5)}`,
    },
    {
      path: "b.md",
      bytes: 12010,
      text: `${"x".repeat(11999)}\r\nyy`,
    },
  ]);
  assert.equal(result.documents[0]!.text, `${"x".repeat(11999)} `);
  assert.equal(result.documents[0]!.truncated, true);
  assert.equal(result.documents[1]!.text, `${"x".repeat(11999)}\n`);
  assert.equal(result.documents[1]!.truncated, true);
});

test("[boundary-13] a document of exactly the cap after normalizing is kept whole", () => {
  // 12000 characters once each CRLF is one LF; 15999 as written.
  const result = keptDocuments([
    { path: "a.md", bytes: 15999, text: `${"ab\r\n".repeat(3999)}abZ` },
  ]);
  const expected = `${"ab\n".repeat(3999)}abZ`;
  assert.equal(expected.length, 12000);
  assert.equal(result.documents[0]!.text, expected);
  assert.equal(result.documents[0]!.truncated, false);
});

// Extends "[boundary-14] whitespace trimmed away does not count against the
// cap": neither against the per-document cap nor the total.
test("[boundary-14] trimmed CRLFs and Unicode whitespace do not count against the cap", () => {
  const result = keptDocuments([
    {
      path: "a.md",
      bytes: 12010,
      text: `\r\n ${"x".repeat(12000)}﻿\r\n`,
    },
  ]);
  assert.deepEqual(result.documents, [
    { path: "a.md", bytes: 12010, text: "x".repeat(12000), truncated: false },
  ]);
});

test("[boundary-14] trimmed whitespace does not count against the total", () => {
  const padded = (path: string) => ({
    path,
    bytes: 12010,
    text: `     ${"x".repeat(12000)}     `,
  });
  const result = keptDocuments([
    padded("a.md"),
    padded("b.md"),
    padded("c.md"),
    padded("d.md"),
    { path: "e.md", bytes: 1, text: "y" },
  ]);
  assert.deepEqual(shape(result), [
    ["a.md", 12000, false],
    ["b.md", 12000, false],
    ["c.md", 12000, false],
    ["d.md", 12000, false],
  ]);
  assert.equal(result.omitted, 1);
});

// Extends "[boundary-15] the total cap cuts the document that reaches it and
// drops the rest": only the kept length counts against the total.
test("[boundary-15] the total counts kept lengths, not lengths as written", () => {
  const result = keptDocuments(
    ["a.md", "b.md", "c.md", "d.md", "e.md"].map((p) => xs(p, 30000)),
  );
  assert.deepEqual(shape(result), [
    ["a.md", 12000, true],
    ["b.md", 12000, true],
    ["c.md", 12000, true],
    ["d.md", 12000, true],
  ]);
  assert.equal(result.omitted, 1);
});

test("[boundary-15] the room left is the smaller cap and the next is cut to it", () => {
  const result = keptDocuments([
    xs("a.md", 5000),
    xs("b.md", 47000),
    xs("c.md", 10),
    xs("d.md", 12000),
    xs("e.md", 12000),
    xs("f.md", 9000),
    xs("g.md", 2),
  ]);
  // Kept so far: 5000, 12000, 10, 12000, 12000 = 41010; room 6990.
  assert.deepEqual(shape(result), [
    ["a.md", 5000, false],
    ["b.md", 12000, true],
    ["c.md", 10, false],
    ["d.md", 12000, false],
    ["e.md", 12000, false],
    ["f.md", 6990, true],
  ]);
  assert.equal(result.omitted, 1);
});

test("[boundary-15] one character of room keeps one character, cut", () => {
  const result = keptDocuments([
    xs("a.md", 12000),
    xs("b.md", 12000),
    xs("c.md", 12000),
    xs("d.md", 11999),
    { path: "e.md", bytes: 3, text: "abc" },
    { path: "f.md", bytes: 1, text: "z" },
  ]);
  assert.deepEqual(result.documents[4], {
    path: "e.md",
    bytes: 3,
    text: "a",
    truncated: true,
  });
  assert.equal(result.documents.length, 5);
  assert.equal(result.omitted, 1);
});

// Extends "[boundary-16] four full documents fill the total exactly": every
// document after the total is full is dropped and counted.
test("[boundary-16] every document after four full ones is dropped and counted", () => {
  const result = keptDocuments([
    ...["a.md", "b.md", "c.md", "d.md"].map((p) => xs(p, 12000)),
    xs("e.md", 1),
    xs("f.md", 12000),
    xs("g.md", 3),
  ]);
  assert.deepEqual(
    result.documents.map((d) => d.path),
    ["a.md", "b.md", "c.md", "d.md"],
  );
  assert.ok(result.documents.every((d) => !d.truncated));
  assert.equal(result.omitted, 3);
});

test("[boundary-16] forty-eight documents of 1000 fill the total exactly", () => {
  const input = Array.from({ length: 50 }, (_, i) => xs(`d${i}.md`, 1000));
  const result = keptDocuments(input);
  assert.deepEqual(
    result.documents.map((d) => d.path),
    input.slice(0, 48).map((d) => d.path),
  );
  assert.ok(result.documents.every((d) => d.text.length === 1000 && !d.truncated));
  assert.equal(result.omitted, 2);
});

// Extends "[boundary-17] a cut falls at the code-unit count, even inside a
// surrogate pair": the cut by the total splits a pair the same way.
test("[boundary-17] a cut by the total splits a surrogate pair at the room left", () => {
  const result = keptDocuments([
    xs("a.md", 12000),
    xs("b.md", 12000),
    xs("c.md", 12000),
    xs("d.md", 11000),
    { path: "e.md", bytes: 1010, text: `${"x".repeat(999)}\u{1F600}tail` },
  ]);
  // Room for e.md is 1000, which ends between the two halves of the emoji.
  assert.equal(result.documents[4]!.text, `${"x".repeat(999)}\uD83D`);
  assert.equal(result.documents[4]!.text.length, 1000);
  assert.equal(result.documents[4]!.truncated, true);

  const tight = keptDocuments([
    xs("a.md", 12000),
    xs("b.md", 12000),
    xs("c.md", 12000),
    xs("d.md", 11999),
    { path: "e.md", bytes: 8, text: "\u{1F600}abc" },
  ]);
  assert.equal(tight.documents[4]!.text, "\uD83D");
  assert.equal(tight.documents[4]!.text.length, 1);
  assert.equal(tight.documents[4]!.truncated, true);
  assert.equal(tight.omitted, 0);
});

test("[boundary-17] a run of emoji is cut at 12000 code units, between pairs or mid-pair", () => {
  const result = keptDocuments([
    { path: "e.md", bytes: 40000, text: "\u{1F600}".repeat(6000) + "\u{1F601}" },
  ]);
  assert.equal(result.documents[0]!.text, "\u{1F600}".repeat(6000));
  assert.equal(result.documents[0]!.truncated, true);
  const odd = keptDocuments([
    { path: "o.md", bytes: 40000, text: `y${"\u{1F600}".repeat(6000)}` },
  ]);
  assert.equal(odd.documents[0]!.text, `y${"\u{1F600}".repeat(5999)}\uD83D`);
  assert.equal(odd.documents[0]!.text.length, 12000);
  assert.equal(odd.documents[0]!.truncated, true);
});

// Extends "[boundary-18] no documents".
test("[boundary-18] an empty frozen list gives nothing kept and nothing omitted", () => {
  const input: readonly { path: string; bytes: number; text: string }[] =
    Object.freeze([]);
  assert.deepEqual(keptDocuments(input), { documents: [], omitted: 0 });
  assert.deepEqual(keptDocuments(input), { documents: [], omitted: 0 });
});
