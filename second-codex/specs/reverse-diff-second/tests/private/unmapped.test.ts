import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function headers(from: string, to = from): string {
  return `diff --git a/${from} b/${to}\n--- a/${from}\n+++ b/${to}\n`;
}

// Extends public "unmapped: a path no entry covers is left untouched and reported once".
test("[unhappy-1] repeated uncovered paths are deduplicated across separate file blocks and both header sides", () => {
  const table: NameTable = [{ kind: "path", public: "pub", real: "src" }];
  const diff = headers("missing/z.ts", "missing/a.ts") + headers("pub/known.ts") +
    headers("missing/a.ts", "missing/z.ts") + headers("missing/z.ts") +
    headers("missing/third.ts", "missing/a.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, headers("missing/z.ts", "missing/a.ts") + headers("src/known.ts") +
    headers("missing/a.ts", "missing/z.ts") + headers("missing/z.ts") + headers("missing/third.ts", "missing/a.ts"));
  assert.deepEqual(result.unmapped, ["missing/z.ts", "missing/a.ts", "missing/third.ts"]);
});

test("[unhappy-1] identifier entries with matching names do not count as path coverage", () => {
  const table: NameTable = [
    { kind: "identifier", public: "Widget", real: "Component" },
    { kind: "identifier", public: "api", real: "internal" },
  ];
  const diff = headers("Widget") + "@@ -1 +1 @@ Widget\n-Widget(api)\n+api(Widget)\n" + headers("api/file.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, headers("Widget") + "@@ -1 +1 @@ Component\n-Component(internal)\n+internal(Component)\n" + headers("api/file.ts"));
  assert.deepEqual(result.unmapped, ["Widget", "api/file.ts"]);
});

test("[unhappy-1] coverage is determined from input public paths even when mapped and unmapped outputs coincide", () => {
  const table: NameTable = [{ kind: "path", public: "mask", real: "actual" }];
  const diff = headers("mask/x.ts") + headers("actual/x.ts") + headers("mask/y.ts") +
    headers("actual/z.ts") + headers("actual/x.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, headers("actual/x.ts") + headers("actual/x.ts") + headers("actual/y.ts") +
    headers("actual/z.ts") + headers("actual/x.ts"));
  assert.deepEqual(result.unmapped, ["actual/x.ts", "actual/z.ts"]);
});

test("[unhappy-1] pure rename diffs report uncovered source and destination paths and skip covered sides", () => {
  const table: NameTable = [{ kind: "path", public: "pub", real: "src" }];
  const rename = (from: string, to: string) =>
    `diff --git a/${from} b/${to}\nsimilarity index 100%\nrename from ${from}\nrename to ${to}\n`;
  const diff = rename("unseen/z.ts", "unseen/a.ts") + rename("pub/from.ts", "unseen/z.ts") +
    rename("unseen/c.ts", "pub/to.ts");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, rename("unseen/z.ts", "unseen/a.ts") + rename("src/from.ts", "unseen/z.ts") +
    rename("unseen/c.ts", "src/to.ts"));
  assert.deepEqual(result.unmapped, ["unseen/z.ts", "unseen/a.ts", "unseen/c.ts"]);
});

test("[unhappy-1] report paths retain literal a and b segments and case distinctions", () => {
  const diff = headers("a/b/file.ts", "b/a/file.ts") + headers("Docs/readme.md") +
    headers("docs/readme.md") + headers("a/b/file.ts");
  const result = reverseMapDiff(diff, []);
  assert.equal(result.diff, diff);
  assert.deepEqual(result.unmapped, ["a/b/file.ts", "b/a/file.ts", "Docs/readme.md", "docs/readme.md"]);
});

// Extends public "unmapped: paths are reported in the order they first appear, skipping mapped ones".
test("[unhappy-1] a long stream of interleaved covered files and repeated misses keeps global encounter order", () => {
  const table: NameTable = [{ kind: "path", public: "covered", real: "source" }];
  const misses = Array.from({ length: 64 }, (_, i) => `missing/file${(i * 17) % 64}.ts`);
  let diff = "";
  let expected = "";
  for (let i = 0; i < misses.length; i++) {
    const path = misses[i]!;
    const previous = misses[Math.max(0, i - 3)]!;
    diff += headers(`covered/deep/${i}.ts`) + headers(path) + headers(previous);
    expected += headers(`source/deep/${i}.ts`) + headers(path) + headers(previous);
  }
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, expected);
  assert.deepEqual(result.unmapped, misses);
});
