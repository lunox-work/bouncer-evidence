import assert from "node:assert/strict";
import { test } from "node:test";

import { contextDocuments } from "../../src/sources.js";

/** Files of size 10 at the given paths, in the given order. */
function files(...paths: string[]): { path: string; size: number }[] {
  return paths.map((path) => ({ path, size: 10 }));
}

/** The files of "Tiers order documents when no keywords are given". */
const TIERED = [
  "packages/auth/notes.md",
  "packages/auth/README.md",
  "docs/setup.md",
  "docs/limit.md",
  "CONTRIBUTING.md",
  "README.md",
];

const TIERED_RANKED = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/limit.md",
  "docs/setup.md",
  "packages/auth/README.md",
  "packages/auth/notes.md",
];

/** "docs/a01.md", "docs/a02.md", … up to count. */
function numbered(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `docs/a${String(i + 1).padStart(2, "0")}.md`,
  );
}

/** Twelve candidates, one per ranking rule, in the order they rank. */
const MIXED_RANKED = [
  "README.md", // tier 0
  "CLAUDE.md", // tier 1
  "development.md", // tier 1
  "doc/intro.md", // tier 2, depth 2
  "packages/api/documentation/usage.md", // tier 2, depth 4
  "lib/README.mdx", // tier 3, depth 2
  "packages/api/README.md", // tier 3, depth 3
  "GUIDE.md", // tier 4: a root document that is not a guide
  "README-dev.md", // tier 4: stem "readme-dev"
  "readme.old.md", // tier 4: stem "readme.old"
  "mydocs/a.md", // tier 4: "mydocs" is not a docs directory
  "src/CONTRIBUTING.md", // tier 4: a guide stem below the root
];

// Extends "[happy-3] Markdown files of every accepted extension are candidates".
test("[happy-3] accepted extensions in any case and at any depth are all ranked", () => {
  assert.deepEqual(
    contextDocuments(
      files("a/b/c.Md", "notes.mArKdOwN", "docs/Guide.MDX", "README.markdown"),
    ),
    {
      paths: ["README.markdown", "docs/Guide.MDX", "notes.mArKdOwN", "a/b/c.Md"],
      omitted: 0,
    },
  );
});

test("[happy-3] leaving out the keywords is the same as passing none", () => {
  const input = files(...TIERED, "docs/x.mdx", "lib/y.markdown");
  assert.deepEqual(contextDocuments(input), contextDocuments(input, []));
});

// Extends "[unhappy-1] code and non-Markdown text are never documents":
// a suffix match on ".md" is not enough, the extension is what extensionOf
// gives, and a dot-file has none.
test("[unhappy-1] dot-files and look-alike extensions are not documents", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        ".md",
        "docs/.mdx",
        ".markdown",
        "README.",
        "docs/guide.md~",
        "notes.mdx.orig",
        "docs/readme.MD.txt",
        "docs/x.markdownx",
        "x.mmd",
        "docs/a.html",
        "src/index.mdx.ts",
        "LICENSE",
      ),
    ),
    { paths: [], omitted: 0 },
  );
});

test("[unhappy-1] non-documents are not counted as omitted when the cap is reached", () => {
  const code = Array.from({ length: 13 }, (_, i) => `src/m${i}.ts`);
  const docs = numbered(13);
  assert.deepEqual(contextDocuments(files(...code, ...docs, "notes.txt")), {
    paths: docs.slice(0, 12),
    omitted: 1,
  });
});

// Extends "[unhappy-2] boilerplate stems are dropped wherever they are".
test("[unhappy-2] every boilerplate stem is dropped at depth, in any case and extension", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "docs/api/Changelog.mdx",
        "packages/x/LICENCE.markdown",
        "a/b/c/d/Codeowners.MD",
        "docs/HISTORY.md",
        "src/COPYING.mdx",
        "lib/authors.md",
        "x/Contributors.markdown",
        "y/NOTICE.MD",
        "z/changes.md",
        "w/Code_Of_Conduct.md",
        "v/security.mdx",
        "u/license.md",
        "docs/x.md",
      ),
    ),
    { paths: ["docs/x.md"], omitted: 0 },
  );
});

test("[unhappy-2] boilerplate files are not counted as omitted when the cap is reached", () => {
  const docs = numbered(12);
  assert.deepEqual(
    contextDocuments(
      files(
        "CHANGELOG.md",
        "LICENSE.md",
        "SECURITY.md",
        ...docs,
        "docs/history.md",
        "docs/notice.mdx",
        "AUTHORS.markdown",
      ),
    ),
    { paths: docs, omitted: 0 },
  );
});

// Extends "[boundary-2] near-boilerplate names are kept": a boilerplate word
// as a directory, or as the stem with more after it, is not boilerplate.
test("[boundary-2] a boilerplate word as a directory name does not drop the file", () => {
  assert.deepEqual(
    contextDocuments(
      files("security/guide.md", "changelog/notes.md", "license/README.md"),
    ),
    {
      paths: ["license/README.md", "changelog/notes.md", "security/guide.md"],
      omitted: 0,
    },
  );
});

test("[boundary-2] stems that only begin with a boilerplate word are kept", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "security.policy.md",
        "changelog_v2.md",
        "authors-list.mdx",
        "LICENSE.txt.md",
      ),
    ),
    {
      paths: [
        "LICENSE.txt.md",
        "authors-list.mdx",
        "changelog_v2.md",
        "security.policy.md",
      ],
      omitted: 0,
    },
  );
});

// Extends "[unhappy-3] skipped directories hide their documents": every
// skipped name, deep in the tree, including docs directories beneath them.
test("[unhappy-3] skipped directories hide documents at any depth", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "a/b/c/node_modules/d/README.md",
        "x/y/target/z.md",
        "pkg/out/a.md",
        "lib/Pods/x.md",
        "src/.venv/notes.md",
        "docs/dist/api.md",
        "docs/build/x.md",
        "deep/testdata/case/a.md",
        "a/example/README.md",
        "x/third_party/y.md",
        "p/bower_components/q.md",
        "r/__fixtures__/s.md",
        "q/fixtures/x.md",
        "w/venv/a.md",
        "k/vendor/a.md",
        "deep/.github/workflows/README.md",
        "site/examples/docs/intro.md",
        "docs/guide.md",
      ),
    ),
    { paths: ["docs/guide.md"], omitted: 0 },
  );
});

test("[unhappy-3] skipped documents are not counted as omitted when the cap is reached", () => {
  const docs = numbered(12);
  assert.deepEqual(
    contextDocuments(
      files(
        "node_modules/a/README.md",
        ...docs,
        ".github/CONTRIBUTING.md",
        "vendor/x/docs/a.md",
      ),
    ),
    { paths: docs, omitted: 0 },
  );
});

// Extends "[boundary-3] only directory segments are checked, and case must
// match": a lower-cased comparison would drop "pods/".
test("[boundary-3] skipped names in another case, or as file names, are kept", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "pods/a.md",
        "NODE_MODULES/a.md",
        "Venv/a.md",
        ".Github/a.md",
        "Examples/a.md",
        "Fixtures/a.md",
        "docs/vendor.md",
        "docs/.github.md",
        "dist.md",
        "build.mdx",
      ),
    ),
    {
      paths: [
        "docs/.github.md",
        "docs/vendor.md",
        "build.mdx",
        "dist.md",
        ".Github/a.md",
        "Examples/a.md",
        "Fixtures/a.md",
        "NODE_MODULES/a.md",
        "Venv/a.md",
        "pods/a.md",
      ],
      omitted: 0,
    },
  );
});

// Extends "[boundary-4] size decides whether a Markdown file is a candidate".
test("[boundary-4] files at the byte limit fill the cap while empty and oversized ones are skipped uncounted", () => {
  const docs = numbered(13);
  assert.deepEqual(
    contextDocuments([
      { path: "README.md", size: 262145 },
      ...docs.map((path) => ({ path, size: 262144 })),
      { path: "docs/zero.md", size: 0 },
      { path: "docs/neg.md", size: -100 },
      { path: "docs/huge.md", size: 1_000_000_000 },
    ]),
    { paths: docs.slice(0, 12), omitted: 1 },
  );
});

// Extends "[happy-4] tiers order documents when no keywords are given":
// twelve files, one per rule, including near-misses of each tier.
test("[happy-4] near-misses of each tier fall to the last tier", () => {
  const input = [...MIXED_RANKED].reverse();
  assert.deepEqual(contextDocuments(files(...input)), {
    paths: MIXED_RANKED,
    omitted: 0,
  });
});

test("[happy-4] a README under a docs directory at any depth ranks as docs, not as a module README", () => {
  assert.deepEqual(
    contextDocuments(
      files("a/b/c/README.md", "a/b/docs/c/README.md", "z/README.md"),
    ).paths,
    ["a/b/docs/c/README.md", "z/README.md", "a/b/c/README.md"],
  );
});

// Extends "[happy-5] a keyword moves a document up about one and a half
// tiers": the boost is 3 score points, so a boosted docs document passes an
// unboosted root guide, and a boosted plain document passes a module README.
test("[happy-5] a boosted docs document passes an unboosted root guide", () => {
  assert.deepEqual(contextDocuments(files(...TIERED), ["setup"]), {
    paths: [
      "README.md",
      "docs/setup.md",
      "CONTRIBUTING.md",
      "docs/limit.md",
      "packages/auth/README.md",
      "packages/auth/notes.md",
    ],
    omitted: 0,
  });
});

test("[happy-5] a boosted plain document passes an unboosted module README", () => {
  assert.deepEqual(contextDocuments(files(...TIERED), ["notes"]).paths, [
    "README.md",
    "CONTRIBUTING.md",
    "docs/limit.md",
    "docs/setup.md",
    "packages/auth/notes.md",
    "packages/auth/README.md",
  ]);
});

test("[happy-5] a boosted plain document stays behind an unboosted docs document, however deep", () => {
  const input = files("src/README.md", "lib/auth.md", "a/b/docs/x.md");
  assert.deepEqual(contextDocuments(input).paths, [
    "a/b/docs/x.md",
    "src/README.md",
    "lib/auth.md",
  ]);
  assert.deepEqual(contextDocuments(input, ["auth"]).paths, [
    "a/b/docs/x.md",
    "lib/auth.md",
    "src/README.md",
  ]);
});

test("[happy-5] a keyword matches anywhere in the lowercased path, across segments and in the extension", () => {
  assert.deepEqual(contextDocuments(files(...TIERED), ["auth/n"]).paths, [
    "README.md",
    "CONTRIBUTING.md",
    "docs/limit.md",
    "docs/setup.md",
    "packages/auth/notes.md",
    "packages/auth/README.md",
  ]);
  assert.deepEqual(
    contextDocuments(files("src/README.md", "lib/b.mdx"), ["mdx"]).paths,
    ["lib/b.mdx", "src/README.md"],
  );
  assert.deepEqual(
    contextDocuments(files("src/README.md", "lib/SETUP.md"), ["setup"]).paths,
    ["lib/SETUP.md", "src/README.md"],
  );
});

test("[happy-5] a keyword listed twice still boosts once", () => {
  assert.deepEqual(
    contextDocuments(files(...TIERED), ["auth", "auth", "auth"]),
    contextDocuments(files(...TIERED), ["auth"]),
  );
  assert.deepEqual(
    contextDocuments(files(...TIERED), ["auth", "auth"]).paths,
    [
      "README.md",
      "CONTRIBUTING.md",
      "packages/auth/README.md",
      "docs/limit.md",
      "docs/setup.md",
      "packages/auth/notes.md",
    ],
  );
});

// Extends "[boundary-5] a boosted document never passes the root README".
test("[boundary-5] boosted READMEs and root guides never pass any root README", () => {
  assert.deepEqual(
    contextDocuments(
      files("AGENTS.md", "readme.mdx", "README.md"),
      ["agents", "readme"],
    ).paths,
    ["README.md", "readme.mdx", "AGENTS.md"],
  );
});

test("[boundary-5] a keyword matching every README lifts the docs README past the root guide only", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "docs/a.md",
        "src/README.md",
        "docs/README.md",
        "CONTRIBUTING.md",
        "README.md",
      ),
      ["readme"],
    ).paths,
    [
      "README.md",
      "docs/README.md",
      "CONTRIBUTING.md",
      "src/README.md",
      "docs/a.md",
    ],
  );
});

// Extends "[boundary-6] docs directories in any case and at any depth
// outrank module READMEs": the segment must be the whole name.
test("[boundary-6] directories that only contain a docs name are not docs directories", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "subdoc/a.md",
        "mydocs/a.md",
        "documents/a.md",
        "docs-site/a.md",
        "adr-notes/x.md",
        "src/README.md",
        "a/b/c/ADRS/z.md",
        "DOCUMENTATION/x/y.md",
      ),
    ).paths,
    [
      "DOCUMENTATION/x/y.md",
      "a/b/c/ADRS/z.md",
      "src/README.md",
      "adr-notes/x.md",
      "docs-site/a.md",
      "documents/a.md",
      "mydocs/a.md",
      "subdoc/a.md",
    ],
  );
});

// Extends "[boundary-7] ties fall to the shallower path, then path order".
test("[boundary-7] depth compares as a number, before path order", () => {
  assert.deepEqual(
    contextDocuments(
      files("a/a/a/a/a/a/a/a/a/b.md", "a/a/a/a/a/a/a/a/z.md"),
    ).paths,
    ["a/a/a/a/a/a/a/a/z.md", "a/a/a/a/a/a/a/a/a/b.md"],
  );
});

test("[boundary-7] path order is by UTF-16 code unit, including punctuation and surrogates", () => {
  assert.deepEqual(
    contextDocuments(files("a_b.md", "a.md", "a-b.md", "A.md")).paths,
    ["A.md", "a-b.md", "a.md", "a_b.md"],
  );
  // U+1F600 begins with the code unit 0xD83D, which is below 0xFF5E.
  assert.deepEqual(
    contextDocuments(files("～.md", "\u{1F600}.md")).paths,
    ["\u{1F600}.md", "～.md"],
  );
});

// Extends "[boundary-8] root documents that are not guides rank with every
// other document".
test("[boundary-8] guide stems below the root and root non-guides rank last, by depth", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "packages/x/ARCHITECTURE.md",
        "NOTES.md",
        "src/README.md",
        "contributing.old.md",
        "OVERVIEW.mdx",
        "Agents.markdown",
      ),
    ).paths,
    [
      "Agents.markdown",
      "OVERVIEW.mdx",
      "src/README.md",
      "NOTES.md",
      "contributing.old.md",
      "packages/x/ARCHITECTURE.md",
    ],
  );
});

// Extends "[boundary-9] uppercase keywords give no boost and an empty
// keyword does not reorder": an empty keyword boosts every path, and a path
// is boosted once, so beside it another keyword lifts nothing.
test("[boundary-9] beside an empty keyword, another keyword gives no relative lift", () => {
  assert.deepEqual(contextDocuments(files(...TIERED), ["", "auth"]), {
    paths: TIERED_RANKED,
    omitted: 0,
  });
  assert.deepEqual(contextDocuments(files(...TIERED), ["setup", ""]), {
    paths: TIERED_RANKED,
    omitted: 0,
  });
});

test("[boundary-9] keywords are not lowercased, so a capitalized keyword gives no boost", () => {
  assert.deepEqual(contextDocuments(files(...TIERED), ["Auth"]).paths, TIERED_RANKED);
  assert.deepEqual(contextDocuments(files(...TIERED), ["Setup", "NOTES"]).paths, TIERED_RANKED);
});

// Extends "[boundary-10] input order does not change the result": a larger
// set, several orders, with ties decided only by path order.
test("[boundary-10] every order of a larger input gives the same ranking", () => {
  const orders = [
    [...MIXED_RANKED],
    [...MIXED_RANKED].reverse(),
    [...MIXED_RANKED.slice(5), ...MIXED_RANKED.slice(0, 5)],
    MIXED_RANKED.filter((_, i) => i % 2 === 1).concat(
      MIXED_RANKED.filter((_, i) => i % 2 === 0),
    ),
  ];
  for (const order of orders)
    assert.deepEqual(contextDocuments(files(...order)), {
      paths: MIXED_RANKED,
      omitted: 0,
    });
});

test("[boundary-10] the order of keywords and of tied files does not matter", () => {
  const ties = ["docs/c.md", "docs/a.md", "docs/b.md", "docs/e.md", "docs/d.md"];
  assert.deepEqual(contextDocuments(files(...ties)).paths, [
    "docs/a.md",
    "docs/b.md",
    "docs/c.md",
    "docs/d.md",
    "docs/e.md",
  ]);
  assert.deepEqual(
    contextDocuments(files(...TIERED).reverse(), ["notes", "auth"]),
    contextDocuments(files(...TIERED), ["auth", "notes"]),
  );
});

// Extends "[boundary-11] a repeated entry takes a place each time it is
// listed": repeats crowd out others at the cap.
test("[boundary-11] many repeats of the root README push others past the cap", () => {
  const repeats = Array.from({ length: 8 }, () => "README.md");
  assert.deepEqual(contextDocuments(files(...TIERED, ...repeats)), {
    paths: [
      ...Array.from({ length: 9 }, () => "README.md"),
      "CONTRIBUTING.md",
      "docs/limit.md",
      "docs/setup.md",
    ],
    omitted: 2,
  });
});

test("[boundary-11] a repeated entry is a candidate only where it qualifies", () => {
  assert.deepEqual(
    contextDocuments([
      { path: "docs/a.md", size: 10 },
      { path: "docs/a.md", size: 0 },
      { path: "docs/a.md", size: 300000 },
      { path: "docs/a.md", size: 5 },
      { path: "src/main.ts", size: 10 },
      { path: "src/main.ts", size: 10 },
    ]),
    { paths: ["docs/a.md", "docs/a.md"], omitted: 0 },
  );
});

// Extends "[boundary-12] the cap on chosen documents".
test("[boundary-12] thirty candidates among non-candidates keep twelve and count eighteen", () => {
  const docs = numbered(30);
  assert.deepEqual(
    contextDocuments([
      ...files("src/main.ts", "CHANGELOG.md", "vendor/x.md", ".github/a.md"),
      ...files(...docs).reverse(),
      { path: "docs/zero.md", size: 0 },
      { path: "docs/big.md", size: 262145 },
    ]),
    { paths: docs.slice(0, 12), omitted: 18 },
  );
});

test("[boundary-12] the cap is applied after ranking, so the root README listed last is kept", () => {
  const docs = numbered(14);
  assert.deepEqual(contextDocuments(files(...docs, "README.md")), {
    paths: ["README.md", ...docs.slice(0, 11)],
    omitted: 3,
  });
});
