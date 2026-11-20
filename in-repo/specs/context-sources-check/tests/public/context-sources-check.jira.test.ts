import assert from "node:assert/strict";
import { test } from "node:test";

import {
  jiraContextFields,
  renderSourceContext,
  type GithubContext,
  type JiraContext,
} from "../src/sources.js";

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

test("[happy-7] a fully populated issue", () => {
  const result = jiraContextFields(FULL);
  assert.deepEqual(result, {
    issueType: "Bug",
    status: "In Progress",
    priority: "High",
    labels: ["backend", "payments"],
    components: ["API"],
    fixVersions: ["2.4.0"],
    dueDate: "2026-12-01",
    storyPoints: 5,
    originalEstimateHours: 1.5,
    remainingEstimateHours: 0.5,
    votes: 3,
    watchers: 7,
    subtasks: 2,
    hasParent: true,
    links: [
      { type: "Blocks", direction: "outward", done: false },
      { type: "Relates", direction: "inward", done: true },
    ],
  });
  assert.deepEqual(Object.keys(result), [
    "issueType",
    "status",
    "priority",
    "labels",
    "components",
    "fixVersions",
    "dueDate",
    "storyPoints",
    "originalEstimateHours",
    "remainingEstimateHours",
    "votes",
    "watchers",
    "subtasks",
    "hasParent",
    "links",
  ]);
  const json = JSON.stringify(result);
  for (const hidden of [
    "PAY-12",
    "PAY-1",
    "PAY-13",
    "indeterminate",
    "2026-11-18T09:30:00.000Z",
  ])
    assert.ok(!json.includes(hidden), hidden);
});

test("[happy-7] links are new objects and the context is not mutated", () => {
  const context = structuredClone(FULL);
  const result = jiraContextFields(context);
  const links = result.links as readonly object[];
  assert.notEqual(links, context.links);
  assert.notEqual(links[0], context.links[0]);
  assert.notEqual(result, context);
  assert.deepEqual(context, FULL);
});

test("[boundary-19] an issue with nothing set gives an empty object", () => {
  assert.deepEqual(jiraContextFields(jira()), {});
});

test("[boundary-19] keys, status category, update time and parent key are never shown", () => {
  assert.deepEqual(
    jiraContextFields(
      jira({
        key: "PAY-77",
        statusCategory: "done",
        updated: "2026-11-18T09:30:00.000Z",
      }),
    ),
    {},
  );
  assert.deepEqual(jiraContextFields(jira({ parentKey: "PAY-1" })), {
    hasParent: true,
  });
});

test("[boundary-20] zero and empty-string values are shown, a zero subtask count is not", () => {
  assert.deepEqual(
    jiraContextFields(
      jira({
        status: "",
        storyPoints: 0,
        originalEstimateSeconds: 0,
        votes: 0,
        subtaskCount: 0,
      }),
    ),
    { status: "", storyPoints: 0, originalEstimateHours: 0, votes: 0 },
  );
});

test("[boundary-20] the other zero and empty-string fields are shown, in order", () => {
  const result = jiraContextFields(
    jira({
      watchers: 0,
      remainingEstimateSeconds: 0,
      dueDate: "",
      priority: "",
      issueType: "",
    }),
  );
  assert.deepEqual(result, {
    issueType: "",
    priority: "",
    dueDate: "",
    remainingEstimateHours: 0,
    watchers: 0,
  });
  assert.deepEqual(Object.keys(result), [
    "issueType",
    "priority",
    "dueDate",
    "remainingEstimateHours",
    "watchers",
  ]);
});

test("[boundary-21] estimates are converted to hours rounded to 0.1", () => {
  const cases: [number, number][] = [
    [3600, 1],
    [5400, 1.5],
    [4500, 1.3],
    [180, 0.1],
    [179, 0],
    [36000, 10],
  ];
  for (const [seconds, hours] of cases) {
    assert.equal(
      jiraContextFields(jira({ originalEstimateSeconds: seconds }))
        .originalEstimateHours,
      hours,
      `${seconds} seconds`,
    );
  }
});

test("[boundary-21] remaining estimates round half up the same way", () => {
  const cases: [number, number][] = [
    [1620, 0.5],
    [4500, 1.3],
    [179, 0],
    [180, 0.1],
  ];
  for (const [seconds, hours] of cases) {
    assert.deepEqual(
      jiraContextFields(jira({ remainingEstimateSeconds: seconds })),
      { remainingEstimateHours: hours },
      `${seconds} seconds`,
    );
  }
});

test("[boundary-22] the returned label, component and version arrays are the context's own", () => {
  const context = jira({ labels: ["ui"] });
  assert.equal(jiraContextFields(context).labels, context.labels);
});

test("[boundary-22] components and fix versions are the context's own arrays too", () => {
  const context = jira({ components: ["API"], fixVersions: ["2.4.0"] });
  const result = jiraContextFields(context);
  assert.equal(result.components, context.components);
  assert.equal(result.fixVersions, context.fixVersions);
});

test("[boundary-23] nothing to render", () => {
  assert.equal(renderSourceContext({ jira: null, github: null }), "");
  assert.equal(
    renderSourceContext({
      jira: null,
      github: github({ documents: [], omitted: 4 }),
    }),
    "",
  );
});

test("[boundary-23] a repository with no documents and nothing omitted renders nothing", () => {
  assert.equal(
    renderSourceContext({ jira: null, github: github({ omitted: 0 }) }),
    "",
  );
});

test("[boundary-24] a Jira context with no fields set still renders its section", () => {
  assert.equal(
    renderSourceContext({ jira: jira(), github: null }),
    "Jira fields:\n{}",
  );
});

test("[boundary-24] an empty Jira section with a document-less repository has no trailing newline", () => {
  assert.equal(
    renderSourceContext({ jira: jira(), github: github({ omitted: 3 }) }),
    "Jira fields:\n{}",
  );
});

test("[happy-8] both sources render, Jira first", () => {
  const result = renderSourceContext({
    jira: jira({
      key: "PAY-12",
      issueType: "Bug",
      labels: ["ui"],
      links: [
        { type: "Blocks", direction: "outward", key: "PAY-13", done: false },
      ],
    }),
    github: github({
      omitted: 2,
      documents: [
        { path: "README.md", bytes: 5, text: "Hello", truncated: false },
        { path: "docs/a.md", bytes: 90000, text: "Part", truncated: true },
      ],
    }),
  });
  assert.equal(
    result,
    [
      "Jira fields:",
      '{"issueType":"Bug","labels":["ui"],"links":[{"type":"Blocks","direction":"outward","done":false}]}',
      "",
      "Repository documents:",
      "",
      "--- README.md ---",
      "Hello",
      "",
      "--- docs/a.md (cut short) ---",
      "Part",
    ].join("\n"),
  );
  for (const hidden of ["PAY-12", "PAY-13", "acme/pay", "main", "abc123"])
    assert.ok(!result.includes(hidden), hidden);
});

test("[happy-8] Jira fields render as compact JSON and document text as stored", () => {
  assert.equal(
    renderSourceContext({
      jira: jira({ status: "Done", storyPoints: 0, parentKey: "PAY-1" }),
      github: github({
        documents: [
          { path: "a.md", bytes: 10, text: "  spaced\r\nline", truncated: false },
        ],
      }),
    }),
    'Jira fields:\n{"status":"Done","storyPoints":0,"hasParent":true}\n\nRepository documents:\n\n--- a.md ---\n  spaced\r\nline',
  );
});

test("[happy-9] documents alone", () => {
  assert.equal(
    renderSourceContext({
      jira: null,
      github: github({
        documents: [
          { path: "README.md", bytes: 5, text: "Hello", truncated: false },
        ],
      }),
    }),
    "Repository documents:\n\n--- README.md ---\nHello",
  );
});

test("[happy-9] documents alone never show the omitted count, repository, branch or commit", () => {
  const result = renderSourceContext({
    jira: null,
    github: {
      fullName: "zeta/omega",
      branch: "release-77",
      commitSha: "f00dfeed",
      omitted: 4321,
      documents: [
        { path: "docs/x.md", bytes: 1, text: "X", truncated: true },
        { path: "docs/y.md", bytes: 1, text: "Y", truncated: false },
      ],
    },
  });
  assert.equal(
    result,
    "Repository documents:\n\n--- docs/x.md (cut short) ---\nX\n\n--- docs/y.md ---\nY",
  );
  for (const hidden of ["zeta/omega", "release-77", "f00dfeed", "4321"])
    assert.ok(!result.includes(hidden), hidden);
});
