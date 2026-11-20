import assert from "node:assert/strict";
import { test } from "node:test";

import {
  renderSourceContext,
  type GithubContext,
  type JiraContext,
} from "../../src/sources.js";

/** A JiraContext with key "PAY-9", every nullable field null, every list empty and subtaskCount 0. */
function jira(overrides: Partial<JiraContext> = {}): JiraContext {
  return {
    key: "PAY-9",
    issueType: null,
    status: null,
    statusCategory: null,
    priority: null,
    labels: [],
    components: [],
    fixVersions: [],
    parentKey: null,
    dueDate: null,
    storyPoints: null,
    originalEstimateSeconds: null,
    remainingEstimateSeconds: null,
    votes: null,
    watchers: null,
    subtaskCount: 0,
    links: [],
    updated: null,
    ...overrides,
  };
}

function github(overrides: Partial<GithubContext> = {}): GithubContext {
  return {
    fullName: "acme/pay",
    branch: "main",
    commitSha: "abc123",
    documents: [],
    omitted: 0,
    ...overrides,
  };
}

const FULL: JiraContext = {
  key: "PAY-12",
  issueType: "Bug",
  status: "In Progress",
  statusCategory: "indeterminate",
  priority: "High",
  labels: ["backend", "payments"],
  components: ["API"],
  fixVersions: ["2.4.0"],
  parentKey: "PAY-1",
  dueDate: "2026-12-01",
  storyPoints: 5,
  originalEstimateSeconds: 5400,
  remainingEstimateSeconds: 1800,
  votes: 3,
  watchers: 7,
  subtaskCount: 2,
  links: [
    { type: "Blocks", direction: "outward", key: "PAY-13", done: false },
    { type: "Relates", direction: "inward", key: null, done: true },
  ],
  updated: "2026-11-18T09:30:00.000Z",
};

// Extends "[happy-8] both sources render, Jira first": every Jira field in
// the compact JSON, and three documents.
test("[happy-8] a fully populated issue and three documents render exactly", () => {
  const result = renderSourceContext({
    jira: FULL,
    github: {
      fullName: "zeta/ledger",
      branch: "release-9",
      commitSha: "deadbeefcafe",
      omitted: 4321,
      documents: [
        { path: "README.md", bytes: 3, text: "One", truncated: false },
        { path: "docs/b.md", bytes: 80000, text: "Two", truncated: true },
        { path: "src/README.md", bytes: 5, text: "Three", truncated: false },
      ],
    },
  });
  assert.equal(
    result,
    "Jira fields:\n" +
      '{"issueType":"Bug","status":"In Progress","priority":"High",' +
      '"labels":["backend","payments"],"components":["API"],' +
      '"fixVersions":["2.4.0"],"dueDate":"2026-12-01","storyPoints":5,' +
      '"originalEstimateHours":1.5,"remainingEstimateHours":0.5,' +
      '"votes":3,"watchers":7,"subtasks":2,"hasParent":true,' +
      '"links":[{"type":"Blocks","direction":"outward","done":false},' +
      '{"type":"Relates","direction":"inward","done":true}]}' +
      "\n\nRepository documents:" +
      "\n\n--- README.md ---\nOne" +
      "\n\n--- docs/b.md (cut short) ---\nTwo" +
      "\n\n--- src/README.md ---\nThree",
  );
  for (const hidden of [
    "PAY-12",
    "PAY-1",
    "PAY-13",
    "indeterminate",
    "2026-11-18",
    "zeta/ledger",
    "release-9",
    "deadbeefcafe",
    "4321",
  ])
    assert.ok(!result.includes(hidden), hidden);
});

test("[happy-8] Jira strings are escaped as JSON.stringify escapes them", () => {
  assert.equal(
    renderSourceContext({
      jira: jira({ issueType: 'Say "hi"\n', labels: ["a\\b", "tab\there"] }),
      github: github({
        documents: [{ path: "x.md", bytes: 1, text: "X", truncated: false }],
      }),
    }),
    'Jira fields:\n{"issueType":"Say \\"hi\\"\\n","labels":["a\\\\b","tab\\there"]}' +
      "\n\nRepository documents:\n\n--- x.md ---\nX",
  );
});

// Extends "[happy-9] documents alone": more documents, text as stored
// including inner and trailing line breaks of a middle document.
test("[happy-9] five documents alone render in order with their text as stored", () => {
  const result = renderSourceContext({
    jira: null,
    github: github({
      documents: [
        { path: "README.md", bytes: 1, text: "one\n", truncated: false },
        { path: "docs/a b.md", bytes: 1, text: "--- not a header ---", truncated: true },
        { path: "docs/c.md", bytes: 1, text: "\tthree\r\n", truncated: true },
        { path: "lib/README.md", bytes: 1, text: "four", truncated: false },
        { path: "notes.md", bytes: 1, text: "five", truncated: false },
      ],
    }),
  });
  assert.equal(
    result,
    "Repository documents:" +
      "\n\n--- README.md ---\none\n" +
      "\n\n--- docs/a b.md (cut short) ---\n--- not a header ---" +
      "\n\n--- docs/c.md (cut short) ---\n\tthree\r\n" +
      "\n\n--- lib/README.md ---\nfour" +
      "\n\n--- notes.md ---\nfive",
  );
});

// Extends "[boundary-23] nothing to render".
test("[boundary-23] a repository without documents renders nothing whatever its names", () => {
  for (const repo of [
    github({ fullName: "", branch: "", commitSha: "", omitted: 0 }),
    github({ fullName: "big/repo", branch: "dev", commitSha: "f".repeat(40), omitted: 999 }),
  ])
    assert.equal(renderSourceContext({ jira: null, github: repo }), "");
});

// Extends "[boundary-24] a Jira context with no fields set still renders
// its section": with documents after it, and with only hidden fields set.
test("[boundary-24] an empty Jira section is followed by the documents section", () => {
  assert.equal(
    renderSourceContext({
      jira: jira({ key: "PAY-77", statusCategory: "done", updated: "2026-01-01" }),
      github: github({
        documents: [{ path: "a.md", bytes: 1, text: "A", truncated: false }],
      }),
    }),
    "Jira fields:\n{}\n\nRepository documents:\n\n--- a.md ---\nA",
  );
});

test("[boundary-24] a Jira context with only hidden fields set renders an empty object", () => {
  const result = renderSourceContext({
    jira: jira({ key: "OPS-5", statusCategory: "new", updated: "2026-02-02T00:00:00.000Z" }),
    github: github({ omitted: 12 }),
  });
  assert.equal(result, "Jira fields:\n{}");
});
