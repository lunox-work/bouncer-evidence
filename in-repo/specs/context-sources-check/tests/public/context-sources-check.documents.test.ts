import assert from "node:assert/strict";
import { test } from "node:test";

import { contextDocuments } from "../src/sources.js";

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

test("[happy-3] Markdown files of every accepted extension are candidates", () => {
  assert.deepEqual(
    contextDocuments(
      files("README.MD", "docs/guide.mdx", "docs/notes.markdown"),
    ),
    {
      paths: ["README.MD", "docs/guide.mdx", "docs/notes.markdown"],
      omitted: 0,
    },
  );
});

test("[happy-3] accepted extensions match in mixed letter case", () => {
  assert.deepEqual(contextDocuments(files("a/B.Mdx", "c.MarkDown")), {
    paths: ["c.MarkDown", "a/B.Mdx"],
    omitted: 0,
  });
});

test("[unhappy-1] code and non-Markdown text are never documents", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "README",
        "README.txt",
        "docs/guide.rst",
        "docs/a.adoc",
        "src/main.ts",
      ),
    ),
    { paths: [], omitted: 0 },
  );
});

test("[unhappy-1] only the last extension counts", () => {
  assert.deepEqual(
    contextDocuments(
      files("README.md.txt", "docs/notes.mdown", "docs/guide.md.bak"),
    ),
    { paths: [], omitted: 0 },
  );
});

test("[unhappy-2] boilerplate stems are dropped wherever they are", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "README.md",
        "CHANGELOG.md",
        "LICENSE.md",
        "Licence.markdown",
        "CODE_OF_CONDUCT.md",
        "docs/security.md",
        "packages/a/HISTORY.md",
        "CONTRIBUTORS.md",
        "AUTHORS.md",
        "NOTICE.md",
        "COPYING.md",
        "CHANGES.md",
        "CODEOWNERS.md",
      ),
    ),
    { paths: ["README.md"], omitted: 0 },
  );
});

test("[unhappy-2] boilerplate stems are dropped under every Markdown extension", () => {
  assert.deepEqual(
    contextDocuments(
      files("SECURITY.mdx", "docs/License.MARKDOWN", "a/b/notice.md", "docs/guide.md"),
    ),
    { paths: ["docs/guide.md"], omitted: 0 },
  );
});

test("[boundary-2] near-boilerplate names are kept", () => {
  assert.deepEqual(
    contextDocuments(
      files("code-of-conduct.md", "CHANGELOG.old.md", "docs/licensing.md"),
    ).paths,
    ["docs/licensing.md", "CHANGELOG.old.md", "code-of-conduct.md"],
  );
});

test("[boundary-2] a stem that only contains a boilerplate word is kept", () => {
  assert.deepEqual(
    contextDocuments(
      files("security-policy.md", "licenses.md", "docs/authors-guide.md"),
    ),
    {
      paths: ["docs/authors-guide.md", "licenses.md", "security-policy.md"],
      omitted: 0,
    },
  );
});

test("[unhappy-3] skipped directories hide their documents", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "node_modules/pkg/README.md",
        "vendor/lib/guide.md",
        "docs/examples/intro.md",
        "build/notes.md",
        "test/fixtures/sample.md",
        ".github/PULL_REQUEST_TEMPLATE.md",
        ".github/ISSUE_TEMPLATE/bug.md",
        "packages/web/.github/CONTRIBUTING.md",
      ),
    ),
    { paths: [], omitted: 0 },
  );
});

test("[unhappy-3] every skipped directory name hides its documents", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "bower_components/a.md",
        "third_party/x/a.md",
        "Pods/a.md",
        ".venv/a.md",
        "venv/a.md",
        "dist/a.md",
        "out/a.md",
        "target/a.md",
        "__fixtures__/a.md",
        "testdata/a.md",
        "example/a.md",
        "docs/a.md",
      ),
    ),
    { paths: ["docs/a.md"], omitted: 0 },
  );
});

test("[boundary-3] only directory segments are checked, and case must match", () => {
  assert.deepEqual(
    contextDocuments(files("docs/examples.md", "Vendor/guide.md")).paths,
    ["docs/examples.md", "Vendor/guide.md"],
  );
});

test("[boundary-3] near-skipped directory names and file names are kept", () => {
  assert.deepEqual(
    contextDocuments(
      files("node_modules.md", "GitHub/notes.md", ".GITHUB/a.md", "Build/a.md"),
    ),
    {
      paths: ["node_modules.md", ".GITHUB/a.md", "Build/a.md", "GitHub/notes.md"],
      omitted: 0,
    },
  );
});

test("[boundary-4] size decides whether a Markdown file is a candidate", () => {
  const cases: [number, string[]][] = [
    [0, []],
    [-1, []],
    [1, ["docs/a.md"]],
    [262144, ["docs/a.md"]],
    [262145, []],
  ];
  for (const [size, paths] of cases) {
    assert.deepEqual(
      contextDocuments([{ path: "docs/a.md", size }]),
      { paths, omitted: 0 },
      `size ${size}`,
    );
  }
});

test("[boundary-4] files skipped for size do not count against the cap", () => {
  const chosen = numbered(12);
  const result = contextDocuments([
    ...files(...chosen),
    { path: "docs/empty.md", size: 0 },
    { path: "docs/huge.md", size: 262145 },
  ]);
  assert.deepEqual(result, { paths: chosen, omitted: 0 });
});

test("[happy-4] tiers order documents when no keywords are given", () => {
  assert.deepEqual(contextDocuments(files(...TIERED)), {
    paths: TIERED_RANKED,
    omitted: 0,
  });
});

test("[happy-4] every root guide stem ranks after the root README and before docs", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "docs/CONTRIBUTING.md",
        "Overview.md",
        "development.md",
        "DESIGN.md",
        "CONVENTIONS.md",
        "CLAUDE.md",
        "ARCHITECTURE.md",
        "AGENTS.md",
        "CONTRIBUTING.md",
        "README.md",
      ),
    ),
    {
      paths: [
        "README.md",
        "AGENTS.md",
        "ARCHITECTURE.md",
        "CLAUDE.md",
        "CONTRIBUTING.md",
        "CONVENTIONS.md",
        "DESIGN.md",
        "Overview.md",
        "development.md",
        "docs/CONTRIBUTING.md",
      ],
      omitted: 0,
    },
  );
});

test("[happy-5] a keyword moves a document up about one and a half tiers", () => {
  assert.deepEqual(contextDocuments(files(...TIERED), ["auth"]).paths, [
    "README.md",
    "CONTRIBUTING.md",
    "packages/auth/README.md",
    "docs/limit.md",
    "docs/setup.md",
    "packages/auth/notes.md",
  ]);
});

test("[happy-5] a path that matches several keywords is boosted once", () => {
  assert.deepEqual(contextDocuments(files(...TIERED), ["auth", "notes"]), {
    paths: [
      "README.md",
      "CONTRIBUTING.md",
      "packages/auth/README.md",
      "docs/limit.md",
      "docs/setup.md",
      "packages/auth/notes.md",
    ],
    omitted: 0,
  });
});

test("[boundary-5] a boosted document never passes the root README", () => {
  assert.deepEqual(
    contextDocuments(files("docs/setup.md", "SETUP.md", "README.md"), [
      "setup",
    ]).paths,
    ["README.md", "docs/setup.md", "SETUP.md"],
  );
});

test("[boundary-5] a boosted root guide floors at the score of a boosted docs document", () => {
  assert.deepEqual(
    contextDocuments(
      files("docs/design.md", "DESIGN.md", "CONTRIBUTING.md", "README.md"),
      ["design"],
    ).paths,
    ["README.md", "DESIGN.md", "docs/design.md", "CONTRIBUTING.md"],
  );
});

test("[boundary-6] docs directories in any case and at any depth outrank module READMEs", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "src/README.md",
        "packages/web/docs/api.md",
        "Docs/Intro.md",
        "docs/README.md",
        "documentation/x.md",
      ),
    ).paths,
    [
      "Docs/Intro.md",
      "docs/README.md",
      "documentation/x.md",
      "packages/web/docs/api.md",
      "src/README.md",
    ],
  );
});

test("[boundary-6] doc, adr and adrs directories count as docs; a root file named docs does not", () => {
  assert.deepEqual(
    contextDocuments(
      files("docs.md", "lib/README.md", "x/Adrs/2.md", "a/DOC/x.md", "ADR/1.md"),
    ).paths,
    ["ADR/1.md", "a/DOC/x.md", "x/Adrs/2.md", "lib/README.md", "docs.md"],
  );
});

test("[boundary-7] ties fall to the shallower path, then path order", () => {
  assert.deepEqual(
    contextDocuments(
      files("guides/deep/x.md", "guides/y.md", "readme.markdown", "README.md"),
    ).paths,
    ["README.md", "readme.markdown", "guides/y.md", "guides/deep/x.md"],
  );
});

test("[boundary-7] path order compares UTF-16 code units, not locale", () => {
  assert.deepEqual(contextDocuments(files("a.md", "_x.md", "B.md")).paths, [
    "B.md",
    "_x.md",
    "a.md",
  ]);
});

test("[boundary-8] root documents that are not guides rank with every other document", () => {
  assert.deepEqual(
    contextDocuments(
      files(
        "NOTES.md",
        "ARCHITECTURE.md",
        "docs/adr/0001.md",
        "adrs/0002.md",
        "src/README.md",
      ),
    ).paths,
    [
      "ARCHITECTURE.md",
      "adrs/0002.md",
      "docs/adr/0001.md",
      "src/README.md",
      "NOTES.md",
    ],
  );
});

test("[boundary-8] a module README outranks a root non-guide, a lowercase root guide outranks both", () => {
  assert.deepEqual(
    contextDocuments(
      files("ROADMAP.md", "packages/x/README.md", "contributing.mdx"),
    ).paths,
    ["contributing.mdx", "packages/x/README.md", "ROADMAP.md"],
  );
});

test("[boundary-9] uppercase keywords give no boost and an empty keyword does not reorder", () => {
  assert.deepEqual(
    contextDocuments(files("packages/auth/notes.md", "docs/setup.md"), [
      "",
      "AUTH",
    ]).paths,
    ["docs/setup.md", "packages/auth/notes.md"],
  );
});

test("[boundary-9] a lowercase keyword matches an uppercase path segment", () => {
  assert.deepEqual(
    contextDocuments(files("src/README.md", "packages/AUTH/notes.md")).paths,
    ["src/README.md", "packages/AUTH/notes.md"],
  );
  assert.deepEqual(
    contextDocuments(files("src/README.md", "packages/AUTH/notes.md"), [
      "auth",
    ]).paths,
    ["packages/AUTH/notes.md", "src/README.md"],
  );
});

test("[boundary-10] input order does not change the result", () => {
  assert.deepEqual(
    contextDocuments(files(...TIERED).reverse()),
    contextDocuments(files(...TIERED)),
  );
  assert.deepEqual(contextDocuments(files(...TIERED).reverse()), {
    paths: TIERED_RANKED,
    omitted: 0,
  });
});

test("[boundary-10] a rotated input gives the same result and the input is not mutated", () => {
  const input = files(...TIERED.slice(3), ...TIERED.slice(0, 3));
  const before = structuredClone(input);
  const keywords = ["auth"];
  assert.deepEqual(
    contextDocuments(input, keywords),
    contextDocuments(files(...TIERED), ["auth"]),
  );
  assert.deepEqual(input, before);
  assert.deepEqual(keywords, ["auth"]);
});

test("[boundary-11] a repeated entry takes a place each time it is listed", () => {
  assert.deepEqual(contextDocuments(files(...TIERED, "README.md")), {
    paths: [
      "README.md",
      "README.md",
      "CONTRIBUTING.md",
      "docs/limit.md",
      "docs/setup.md",
      "packages/auth/README.md",
      "packages/auth/notes.md",
    ],
    omitted: 0,
  });
});

test("[boundary-11] repeated entries count against the cap", () => {
  const repeated = Array.from({ length: 13 }, () => "docs/a.md");
  assert.deepEqual(contextDocuments(files(...repeated)), {
    paths: repeated.slice(0, 12),
    omitted: 1,
  });
});

test("[boundary-12] the cap on chosen documents", () => {
  const cases: [number, number, number][] = [
    [0, 0, 0],
    [11, 11, 0],
    [12, 12, 0],
    [13, 12, 1],
    [15, 12, 3],
  ];
  for (const [count, chosen, omitted] of cases) {
    const docs = numbered(count);
    assert.deepEqual(
      contextDocuments(files(...docs, "src/main.ts", "CHANGELOG.md")),
      { paths: docs.slice(0, chosen), omitted },
      `count ${count}`,
    );
  }
});

test("[boundary-12] the cap keeps the best ranked, so a boosted document displaces the last", () => {
  const docs = numbered(12);
  assert.deepEqual(
    contextDocuments(files(...docs, "packages/auth/README.md"), ["auth"]),
    { paths: ["packages/auth/README.md", ...docs.slice(0, 11)], omitted: 1 },
  );
});
