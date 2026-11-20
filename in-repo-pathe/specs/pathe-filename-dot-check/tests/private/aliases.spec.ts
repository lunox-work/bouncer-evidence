import { expect, it } from "vitest";

import { normalizeAliases, resolveAlias } from "../../src/utils";

const _aliases = {
  "@foo/bar": "@foo/bar/dist/index.mjs",
  "@foo/bar/utils": "@foo/bar/dist/utils.mjs",
  "@": "/root",
  bingpot: "@/bingpot/index.ts",
  test: "@bingpot/index.ts",
  "~": "/root/index.js",
  "~/": "/src",
  "~win": "C:/root/index.js",
  "~win/": "C:/src",
};

// Extends "[happy-5] resolveAlias is unchanged": the existing alias table in test/utils.spec.ts
it("[happy-5] resolveAlias resolves every alias of the existing table to its target", () => {
  const aliases = normalizeAliases(_aliases);
  for (const [from, to] of Object.entries(aliases)) {
    expect(resolveAlias(from, aliases), from).toBe(to);
  }
});

// Extends "[happy-5] resolveAlias is unchanged": aliases ending with "/"
it("[happy-5] resolveAlias respects aliases ending with a separator", () => {
  const aliases = normalizeAliases(_aliases);
  expect(resolveAlias("~/foo/bar", aliases)).toBe("/src/foo/bar");
  expect(resolveAlias("~win/foo/bar", aliases)).toBe("C:/src/foo/bar");
});

// Extends "[happy-5] resolveAlias is unchanged": the more specific alias wins in a raw map
it("[happy-5] resolveAlias prefers the more specific alias with deeper paths", () => {
  const aliases = {
    "~": "/root",
    "~assets": "/root/some/dir",
  };
  expect(resolveAlias("~assets/img/smth.jpg", aliases)).toBe(
    "/root/some/dir/img/smth.jpg",
  );
  expect(resolveAlias("~/smth.jpg", aliases)).toBe("/root/smth.jpg");
});

// Extends "[happy-6] normalizeAliases is unchanged"
it("[happy-6] normalizeAliases gives the existing table's normalised result", () => {
  expect(normalizeAliases(_aliases)).toEqual({
    "@": "/root",
    "@foo/bar": "@foo/bar/dist/index.mjs",
    "@foo/bar/utils": "@foo/bar/dist/utils.mjs",
    bingpot: "/root/bingpot/index.ts",
    test: "@bingpot/index.ts",
    "~": "/root/index.js",
    "~/": "/src",
    "~win": "C:/root/index.js",
    "~win/": "C:/src",
  });
});
