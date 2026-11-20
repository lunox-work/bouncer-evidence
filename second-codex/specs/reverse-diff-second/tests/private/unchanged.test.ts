import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

test("[boundary-4] the empty diff stays empty with either an empty or nonempty table", () => {
  const tables: NameTable[] = [[], [
    { kind: "path", public: "pub", real: "src" },
    { kind: "identifier", public: "Public", real: "Private" },
  ]];
  for (const table of tables) {
    const result = reverseMapDiff("", table);
    assert.equal(result.diff, "");
    assert.deepEqual(result.unmapped, []);
  }
});

// Extends public "unchanged: lines without public names, no-newline markers and a missing final newline are kept".
test("[boundary-4] a complete diff with no matching names retains blank lines tabs and trailing spaces", () => {
  const table: NameTable = [
    { kind: "path", public: "absent", real: "elsewhere" },
    { kind: "identifier", public: "Absent", real: "Elsewhere" },
  ];
  const diff = [
    "diff --git a/docs/text.txt b/docs/text.txt",
    "index 0123456..abcdef0 100644",
    "--- a/docs/text.txt",
    "+++ b/docs/text.txt",
    "@@ -1,4 +1,4 @@ keep this suffix  ",
    " \t leading  spaces\t ",
    " ",
    "-old\t  ",
    "+new\t  ",
    " last\tline  ",
    "\\ No newline at end of file",
  ].join("\n");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, diff);
});

test("[boundary-4] mapping the final hunk line or final file header does not append a newline", () => {
  const table: NameTable = [
    { kind: "path", public: "pub", real: "src" },
    { kind: "identifier", public: "Visible", real: "Original" },
  ];
  const inputHeader = "diff --git a/pub/file.ts b/pub/file.ts\n--- a/pub/file.ts\n+++ b/pub/file.ts";
  const expectedHeader = "diff --git a/src/file.ts b/src/file.ts\n--- a/src/file.ts\n+++ b/src/file.ts";
  const cases = [
    [inputHeader, expectedHeader],
    [inputHeader + "\n@@ -1 +1 @@\n-Visible\n+Visible", expectedHeader + "\n@@ -1 +1 @@\n-Original\n+Original"],
    [inputHeader + "\n@@ -1 +1 @@ Visible\n Visible", expectedHeader + "\n@@ -1 +1 @@ Original\n Original"],
  ];
  for (const [input, expected] of cases) {
    assert.equal(reverseMapDiff(input!, table).diff, expected);
  }
});

// Extends public "unchanged: CRLF and LF line endings are each kept on mapped and unmapped lines".
test("[boundary-4] mixed line endings survive multiple files renames hunk suffixes and EOF markers", () => {
  const table: NameTable = [
    { kind: "path", public: "pub", real: "src" },
    { kind: "identifier", public: "View", real: "Model" },
  ];
  const diff = "diff --git a/pub/a.ts b/pub/b.ts\r\n" +
    "similarity index 90%\nrename from pub/a.ts\r\nrename to pub/b.ts\n" +
    "--- a/pub/a.ts\r\n+++ b/pub/b.ts\r\n" +
    "@@ -1,2 +1,2 @@ View\n View\r\n-View\n\\ No newline at end of file\r\n" +
    "+View\r\n\\ No newline at end of file\n" +
    "diff --git a/pub/c.ts b/pub/c.ts\n--- a/pub/c.ts\r\n+++ b/pub/c.ts\n" +
    "@@ -1 +1 @@ View\r\n-unchanged  \t\r\n+View";
  const expected = "diff --git a/src/a.ts b/src/b.ts\r\n" +
    "similarity index 90%\nrename from src/a.ts\r\nrename to src/b.ts\n" +
    "--- a/src/a.ts\r\n+++ b/src/b.ts\r\n" +
    "@@ -1,2 +1,2 @@ Model\n Model\r\n-Model\n\\ No newline at end of file\r\n" +
    "+Model\r\n\\ No newline at end of file\n" +
    "diff --git a/src/c.ts b/src/c.ts\n--- a/src/c.ts\r\n+++ b/src/c.ts\n" +
    "@@ -1 +1 @@ Model\r\n-unchanged  \t\r\n+Model";
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, expected);
  assert.deepEqual(result.unmapped, []);
});

test("[boundary-4] no-newline markers remain literal even when their words are identifier public names", () => {
  const table: NameTable = [
    { kind: "identifier", public: "No", real: "Yes" },
    { kind: "identifier", public: "newline", real: "separator" },
    { kind: "identifier", public: "file", real: "document" },
  ];
  const prefix = "diff --git a/data.txt b/data.txt\n--- a/data.txt\n+++ b/data.txt\n@@ -1 +1 @@\n";
  const diff = prefix + "-No newline file\n\\ No newline at end of file\n+file newline No\n\\ No newline at end of file";
  const expected = prefix + "-Yes separator document\n\\ No newline at end of file\n+document separator Yes\n\\ No newline at end of file";
  assert.equal(reverseMapDiff(diff, table).diff, expected);
});

test("[boundary-4] an empty table preserves a multi-hunk diff byte for byte while still reporting file paths", () => {
  const diff = "diff --git a/z.ts b/z.ts\n--- a/z.ts\n+++ b/z.ts\n" +
    "@@ -1 +1 @@ first\n-Alpha\n+Beta\n" +
    "@@ -20,2 +20,2 @@ second\r\n same\r\n-old\r\n+new\r\n" +
    "diff --git a/a.ts b/a.ts\r\n--- a/a.ts\r\n+++ b/a.ts\r\n" +
    "@@ -1 +1 @@\r\n-before\r\n+after\r\n\\ No newline at end of file";
  const result = reverseMapDiff(diff, []);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, ["z.ts", "a.ts"]);
});
