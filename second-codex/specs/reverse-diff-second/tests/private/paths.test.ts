import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function headers(from: string, to = from): string {
  return `diff --git a/${from} b/${to}\n--- a/${from}\n+++ b/${to}\n`;
}

// Extends public "file headers: every public path in the header lines becomes the real path".
test("[happy-1] distinct old and new file paths and several file blocks are all mapped", () => {
  const table: NameTable = [
    { kind: "path", public: "view/old.ts", real: "engine/before.ts" },
    { kind: "path", public: "view/new.ts", real: "engine/after.ts" },
    { kind: "path", public: "view/other.ts", real: "support/last.ts" },
  ];
  const body = "@@ -1 +1 @@\n-old\n+new\n";
  const result = reverseMapDiff(
    headers("view/old.ts", "view/new.ts") + body + headers("view/other.ts") + body,
    table,
  );
  assert.equal(result.diff, headers("engine/before.ts", "engine/after.ts") + body + headers("support/last.ts") + body);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] transport prefixes are distinct from a and b segments in actual file names", () => {
  const table: NameTable = [
    { kind: "path", public: "a/b/visible.ts", real: "b/a/original.ts" },
    { kind: "path", public: "b/a/visible.ts", real: "a/b/original.ts" },
  ];
  const result = reverseMapDiff(headers("a/b/visible.ts", "b/a/visible.ts"), table);
  assert.equal(result.diff, headers("b/a/original.ts", "a/b/original.ts"));
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] file names containing regex punctuation are matched literally", () => {
  const table: NameTable = [
    { kind: "path", public: "view/a+b[1].ts", real: "source/result(1).ts" },
    { kind: "path", public: "view/plain.ts", real: "source/plain.ts" },
  ];
  const result = reverseMapDiff(
    headers("view/a+b[1].ts") + headers("view/plainXts") + headers("view/plain.ts"),
    table,
  );
  assert.equal(result.diff, headers("source/result(1).ts") + headers("view/plainXts") + headers("source/plain.ts"));
  assert.deepEqual(result.unmapped, ["view/plainXts"]);
});

test("[happy-1] identifier entries do not rename file header components", () => {
  const table: NameTable = [
    { kind: "identifier", public: "View", real: "Model" },
    { kind: "path", public: "pkg/View.ts", real: "source/View.ts" },
  ];
  const result = reverseMapDiff(headers("pkg/View.ts") + "@@ -1 +1 @@ View\n-View\n+View()\n", table);
  assert.equal(result.diff, headers("source/View.ts") + "@@ -1 +1 @@ Model\n-Model\n+Model()\n");
  assert.deepEqual(result.unmapped, []);
});

// Extends public "directory entry: maps every path under the directory".
test("[happy-2] multiple directories map many deeply nested descendants while preserving each suffix", () => {
  const table: NameTable = [
    { kind: "path", public: "external/api", real: "lib/internal/services" },
    { kind: "path", public: "widgets", real: "ui/components" },
  ];
  const suffixes = ["index.ts", "one/two/three/four/five/item.ts", "tests/a.test.ts", "data/config.json"];
  const input = suffixes.map((suffix) => headers(`external/api/${suffix}`) + headers(`widgets/${suffix}`)).join("");
  const expected = suffixes.map((suffix) => headers(`lib/internal/services/${suffix}`) + headers(`ui/components/${suffix}`)).join("");
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, expected);
  assert.deepEqual(result.unmapped, []);
});

// Extends public "directory entry: matches whole path segments only, so ledgers/x.ts is not mapped".
test("[happy-2] directory prefixes cannot consume part of a segment or match later in the path", () => {
  const table: NameTable = [{ kind: "path", public: "cache/api", real: "src/server" }];
  const misses = ["cache/apis/x.ts", "cache/api-old/x.ts", "cache/api.ts", "other/cache/api/x.ts", "cache/apix/deep/y.ts"];
  const input = headers("cache/api/x.ts") + misses.map((path) => headers(path)).join("");
  const result = reverseMapDiff(input, table);
  assert.equal(result.diff, headers("src/server/x.ts") + misses.map((path) => headers(path)).join(""));
  assert.deepEqual(result.unmapped, misses);
});

// Extends public "file headers: a file entry does not map a longer file name that shares its prefix".
test("[happy-2] several near matches of a file path stay untouched beside an exact match", () => {
  const table: NameTable = [{ kind: "path", public: "pub/item.ts", real: "src/item.ts" }];
  const misses = ["pub/item.tsx", "pub/item.ts.bak", "pub/item.ts-old", "pub/itemXts", "pub/item.t"];
  const result = reverseMapDiff(misses.map((path) => headers(path)).join("") + headers("pub/item.ts"), table);
  assert.equal(result.diff, misses.map((path) => headers(path)).join("") + headers("src/item.ts"));
  assert.deepEqual(result.unmapped, misses);
});

test("[happy-2] only the covering directory prefix changes when its name repeats in the suffix", () => {
  const table: NameTable = [{ kind: "path", public: "mask", real: "real/source" }];
  const result = reverseMapDiff(headers("mask/mask/deep/mask.ts") + headers("mask/x/mask/file.ts"), table);
  assert.equal(result.diff, headers("real/source/mask/deep/mask.ts") + headers("real/source/x/mask/file.ts"));
  assert.deepEqual(result.unmapped, []);
});

test("[happy-1] a header maps to its entry's real path even when that path is another public name", () => {
  const table: NameTable = [
    { kind: "path", public: "one.ts", real: "two.ts" },
    { kind: "path", public: "two.ts", real: "three.ts" },
    { kind: "path", public: "three.ts", real: "final.ts" },
  ];
  const result = reverseMapDiff(headers("one.ts") + headers("two.ts") + headers("three.ts"), table);
  assert.equal(result.diff, headers("two.ts") + headers("three.ts") + headers("final.ts"));
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] an identity directory entry still covers its descendants for reporting purposes", () => {
  const table: NameTable = [{ kind: "path", public: "stable", real: "stable" }];
  const diff = headers("stable/a.ts") + headers("stable/deep/b.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-2] path segment spelling is case sensitive", () => {
  const table: NameTable = [{ kind: "path", public: "Public/Api", real: "source/api" }];
  const diff = headers("Public/Api/x.ts") + headers("public/Api/x.ts") + headers("Public/api/x.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, headers("source/api/x.ts") + headers("public/Api/x.ts") + headers("Public/api/x.ts"));
  assert.deepEqual(result.unmapped, ["public/Api/x.ts", "Public/api/x.ts"]);
});
