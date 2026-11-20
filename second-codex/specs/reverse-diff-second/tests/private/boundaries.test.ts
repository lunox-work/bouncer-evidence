import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function headers(path: string): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
}

function rename(from: string, to: string): string {
  return `diff --git a/${from} b/${to}\nsimilarity index 100%\nrename from ${from}\nrename to ${to}\n`;
}

// Extends public "renames: rename from and rename to lines are mapped".
test("[boundary-1] renames across directories and exact file entries map each side independently", () => {
  const table: NameTable = [
    { kind: "path", public: "outgoing", real: "old/module" },
    { kind: "path", public: "incoming", real: "new/module" },
    { kind: "path", public: "incoming/special.ts", real: "special/location.ts" },
  ];
  const diff = rename("outgoing/deep/a.ts", "incoming/deep/b.ts") +
    rename("outgoing/c.ts", "incoming/special.ts") +
    rename("incoming/d.ts", "outgoing/e.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, rename("old/module/deep/a.ts", "new/module/deep/b.ts") +
    rename("old/module/c.ts", "special/location.ts") + rename("new/module/d.ts", "old/module/e.ts"));
  assert.deepEqual(result.unmapped, []);
});

// Extends public "new and deleted files: /dev/null headers are left as they are".
test("[boundary-1] multiple creations and deletions keep both null header forms and map all real paths", () => {
  const table: NameTable = [
    { kind: "path", public: "public", real: "source" },
    { kind: "identifier", public: "Draft", real: "Record" },
  ];
  const newFile = (path: string, word: string) =>
    `diff --git a/${path} b/${path}\nnew file mode 100644\nindex 0000000..aabbccd\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1 @@\n+${word}\n`;
  const deletedFile = (path: string, word: string) =>
    `diff --git a/${path} b/${path}\ndeleted file mode 100644\nindex aabbccd..0000000\n--- a/${path}\n+++ /dev/null\n@@ -1 +0,0 @@\n-${word}\n`;
  const diff = newFile("public/deep/new.ts", "Draft") + deletedFile("public/old.ts", "Draft") +
    newFile("public/second.ts", "Draft") + deletedFile("public/deep/last.ts", "Draft");
  const expected = newFile("source/deep/new.ts", "Record") + deletedFile("source/old.ts", "Record") +
    newFile("source/second.ts", "Record") + deletedFile("source/deep/last.ts", "Record");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, expected);
});

test("[boundary-1] null headers remain unchanged when the name table is empty", () => {
  const diff = "diff --git a/z/new.ts b/z/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/z/new.ts\n@@ -0,0 +1 @@\n+new\n" +
    "diff --git a/a/old.ts b/a/old.ts\ndeleted file mode 100644\n--- a/a/old.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-old\n";
  const result = reverseMapDiff(diff, []);
  assert.equal(result.diff, diff);
});

// Extends public "most specific path entry wins over a covering directory entry" and
// "most specific path entry wins regardless of table order, and siblings use the directory entry".
test("[boundary-2] four overlapping path levels choose the longest covering entry in multiple table orders", () => {
  const entries: NameTable = [
    { kind: "path", public: "pub", real: "original/very/long/root" },
    { kind: "path", public: "pub/deep", real: "middle" },
    { kind: "path", public: "pub/deep/core", real: "x" },
    { kind: "path", public: "pub/deep/core/main.ts", real: "entry.ts" },
  ];
  const diff = headers("pub/deep/core/main.ts") + headers("pub/deep/core/other.ts") +
    headers("pub/deep/side.ts") + headers("pub/root.ts") + headers("pub/deep/core/main.ts");
  const expected = headers("entry.ts") + headers("x/other.ts") + headers("middle/side.ts") +
    headers("original/very/long/root/root.ts") + headers("entry.ts");
  for (const order of [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1], [1, 3, 0, 2]]) {
    const result = reverseMapDiff(diff, order.map((i) => entries[i]!));
    assert.equal(result.diff, expected);
    assert.deepEqual(result.unmapped, []);
  }
});

test("[boundary-2] a longer partial-segment candidate cannot defeat a shorter covering directory", () => {
  const table: NameTable = [
    { kind: "path", public: "pub/core.ts", real: "special.ts" },
    { kind: "path", public: "pub/module", real: "module-real" },
    { kind: "path", public: "pub", real: "src" },
  ];
  const result = reverseMapDiff(headers("pub/core.tsx") + headers("pub/modules/x.ts") + headers("pub/core.ts"), table);
  assert.equal(result.diff, headers("src/core.tsx") + headers("src/modules/x.ts") + headers("special.ts"));
  assert.deepEqual(result.unmapped, []);
});

test("[boundary-2] rename metadata uses the same specificity rule as ordinary file headers", () => {
  const table: NameTable = [
    { kind: "path", public: "pub", real: "base" },
    { kind: "path", public: "pub/nested", real: "deeper" },
    { kind: "path", public: "pub/nested/one.ts", real: "special/first.ts" },
    { kind: "path", public: "pub/two.ts", real: "special/second.ts" },
  ];
  const diff = rename("pub/nested/one.ts", "pub/two.ts") + rename("pub/nested/other.ts", "pub/root.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, rename("special/first.ts", "special/second.ts") + rename("deeper/other.ts", "base/root.ts"));
  assert.deepEqual(result.unmapped, []);
});
