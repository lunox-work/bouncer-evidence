import assert from "node:assert/strict";
import { test } from "node:test";

import { keptDocuments } from "../src/sources.js";

/** A document at path whose text is length "x" characters. */
function xs(path: string, length: number) {
  return { path, bytes: length, text: "x".repeat(length) };
}

test("[happy-6] line endings are normalized and the text trimmed", () => {
  assert.deepEqual(
    keptDocuments([
      {
        path: "README.md",
        bytes: 41,
        text: "  Line one\r\nLine two\rLine three\n\n",
      },
    ]),
    {
      documents: [
        {
          path: "README.md",
          bytes: 41,
          text: "Line one\nLine two\nLine three",
          truncated: false,
        },
      ],
      omitted: 0,
    },
  );
});

test("[happy-6] a CR before a CRLF gives two line feeds, bytes is copied and the input is not mutated", () => {
  const input = [{ path: "x.md", bytes: 999, text: "a\r\r\nb\r\n\r\nc" }];
  const before = structuredClone(input);
  assert.deepEqual(keptDocuments(input), {
    documents: [{ path: "x.md", bytes: 999, text: "a\n\nb\n\nc", truncated: false }],
    omitted: 0,
  });
  assert.deepEqual(input, before);
});

test("[unhappy-4] a blank document is dropped and counted", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "blank.md", bytes: 6, text: "  \r\n\t " },
      { path: "real.md", bytes: 3, text: "abc" },
    ]),
    {
      documents: [{ path: "real.md", bytes: 3, text: "abc", truncated: false }],
      omitted: 1,
    },
  );
});

test("[unhappy-4] every blank document is counted, wherever it sits", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "empty.md", bytes: 0, text: "" },
      { path: "real.md", bytes: 3, text: "abc" },
      { path: "lines.md", bytes: 4, text: "\n\r\n\r" },
    ]),
    {
      documents: [{ path: "real.md", bytes: 3, text: "abc", truncated: false }],
      omitted: 2,
    },
  );
});

test("[boundary-13] the per-document cap", () => {
  const cases: [number, number, boolean][] = [
    [1, 1, false],
    [12000, 12000, false],
    [12001, 12000, true],
    [30000, 12000, true],
  ];
  for (const [length, kept, truncated] of cases) {
    const result = keptDocuments([xs("docs/a.md", length)]);
    assert.equal(result.documents.length, 1, `length ${length}`);
    assert.equal(result.documents[0]!.text, "x".repeat(kept), `length ${length}`);
    assert.equal(result.documents[0]!.truncated, truncated, `length ${length}`);
    assert.equal(result.omitted, 0, `length ${length}`);
  }
});

test("[boundary-13] the cap applies to the text after line endings are normalized", () => {
  // 18000 characters as written, 11999 after CRLF becomes LF and the trim.
  const result = keptDocuments([
    { path: "docs/a.md", bytes: 18000, text: "x\r\n".repeat(6000) },
  ]);
  assert.equal(result.documents[0]!.text, "x\n".repeat(6000).trim());
  assert.equal(result.documents[0]!.text.length, 11999);
  assert.equal(result.documents[0]!.truncated, false);
});

test("[boundary-14] whitespace trimmed away does not count against the cap", () => {
  const result = keptDocuments([
    { path: "docs/a.md", bytes: 12006, text: `   ${"x".repeat(12000)}   ` },
  ]);
  assert.equal(result.documents[0]!.text, "x".repeat(12000));
  assert.equal(result.documents[0]!.truncated, false);
});

test("[boundary-14] text one past the cap after trimming is still cut", () => {
  const result = keptDocuments([
    { path: "docs/a.md", bytes: 12005, text: `\n\t ${"x".repeat(12001)}\n` },
  ]);
  assert.equal(result.documents[0]!.text, "x".repeat(12000));
  assert.equal(result.documents[0]!.truncated, true);
});

test("[boundary-15] the total cap cuts the document that reaches it and drops the rest", () => {
  const result = keptDocuments([
    xs("a.md", 12000),
    xs("b.md", 12000),
    xs("c.md", 12000),
    xs("d.md", 11000),
    xs("e.md", 5000),
    xs("f.md", 1),
  ]);
  assert.deepEqual(
    result.documents.map((d) => d.path),
    ["a.md", "b.md", "c.md", "d.md", "e.md"],
  );
  assert.deepEqual(
    result.documents.map((d) => d.text.length),
    [12000, 12000, 12000, 11000, 1000],
  );
  assert.deepEqual(
    result.documents.map((d) => d.truncated),
    [false, false, false, false, true],
  );
  assert.equal(result.omitted, 1);
});

test("[boundary-15] a document that exactly fills the room left is not truncated", () => {
  const result = keptDocuments([
    xs("a.md", 12000),
    xs("b.md", 12000),
    xs("c.md", 12000),
    xs("d.md", 11999),
    { path: "e.md", bytes: 1, text: "y" },
    { path: "f.md", bytes: 1, text: "z" },
  ]);
  assert.deepEqual(
    result.documents.map((d) => [d.path, d.text.length, d.truncated]),
    [
      ["a.md", 12000, false],
      ["b.md", 12000, false],
      ["c.md", 12000, false],
      ["d.md", 11999, false],
      ["e.md", 1, false],
    ],
  );
  assert.equal(result.documents[4]!.text, "y");
  assert.equal(result.omitted, 1);
});

test("[boundary-16] four full documents fill the total exactly", () => {
  const result = keptDocuments(
    ["a.md", "b.md", "c.md", "d.md", "e.md"].map((path) => xs(path, 12000)),
  );
  assert.deepEqual(result.documents, [
    { path: "a.md", bytes: 12000, text: "x".repeat(12000), truncated: false },
    { path: "b.md", bytes: 12000, text: "x".repeat(12000), truncated: false },
    { path: "c.md", bytes: 12000, text: "x".repeat(12000), truncated: false },
    { path: "d.md", bytes: 12000, text: "x".repeat(12000), truncated: false },
  ]);
  assert.equal(result.omitted, 1);
});

test("[boundary-16] the number of documents is not capped", () => {
  const input = Array.from({ length: 20 }, (_, i) => xs(`d${i}.md`, 1));
  const result = keptDocuments(input);
  assert.deepEqual(
    result.documents.map((d) => d.path),
    input.map((d) => d.path),
  );
  assert.equal(result.omitted, 0);
});

test("[boundary-17] a cut falls at the code-unit count, even inside a surrogate pair", () => {
  const result = keptDocuments([
    { path: "docs/a.md", bytes: 12007, text: `${"x".repeat(11999)}😀tail` },
  ]);
  assert.equal(result.documents[0]!.text, `${"x".repeat(11999)}\uD83D`);
  assert.equal(result.documents[0]!.text.length, 12000);
  assert.equal(result.documents[0]!.truncated, true);
});

test("[boundary-17] a surrogate pair that ends at the cap is kept whole", () => {
  const result = keptDocuments([
    { path: "docs/a.md", bytes: 12006, text: `${"x".repeat(11998)}😀tail` },
  ]);
  assert.equal(result.documents[0]!.text, `${"x".repeat(11998)}😀`);
  assert.equal(result.documents[0]!.truncated, true);
});

test("[boundary-18] no documents", () => {
  assert.deepEqual(keptDocuments([]), { documents: [], omitted: 0 });
});

test("[boundary-18] only blank documents keep nothing and count each", () => {
  assert.deepEqual(
    keptDocuments([
      { path: "a.md", bytes: 1, text: " " },
      { path: "b.md", bytes: 2, text: "\r\n" },
    ]),
    { documents: [], omitted: 2 },
  );
});
