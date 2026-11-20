import assert from "node:assert/strict";
import { test } from "node:test";

import { jiraContextFields, type JiraContext } from "../../src/sources.js";

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

const OUTPUT_KEYS = [
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
];

// Extends "[happy-7] a fully populated issue": the output order is fixed,
// not the order of the context's own keys.
test("[happy-7] the output order is fixed whatever order the context's keys are in", () => {
  const entries: [string, unknown][] = Object.entries(
    jira({
      issueType: "Story",
      status: "To Do",
      statusCategory: "new",
      priority: "Low",
      labels: ["a", "b", "c"],
      components: ["Web", "API"],
      fixVersions: ["1.0", "1.1"],
      parentKey: "OPS-3",
      dueDate: "2027-01-31",
      storyPoints: 2.5,
      originalEstimateSeconds: 7200,
      remainingEstimateSeconds: 900,
      votes: 1,
      watchers: 12,
      subtaskCount: 1,
      links: [{ type: "Duplicate", direction: "inward", key: "OPS-4", done: true }],
      updated: "2026-01-01T00:00:00.000Z",
      key: "OPS-7",
    }),
  ).reverse();
  const reversed = Object.fromEntries(entries) as unknown as JiraContext;
  const result = jiraContextFields(reversed);
  assert.deepEqual(Object.keys(result), OUTPUT_KEYS);
  assert.deepEqual(result, {
    issueType: "Story",
    status: "To Do",
    priority: "Low",
    labels: ["a", "b", "c"],
    components: ["Web", "API"],
    fixVersions: ["1.0", "1.1"],
    dueDate: "2027-01-31",
    storyPoints: 2.5,
    originalEstimateHours: 2,
    remainingEstimateHours: 0.3,
    votes: 1,
    watchers: 12,
    subtasks: 1,
    hasParent: true,
    links: [{ type: "Duplicate", direction: "inward", done: true }],
  });
});

test("[happy-7] many links keep their order and lose only their keys", () => {
  const result = jiraContextFields(
    jira({
      links: [
        { type: "Relates", direction: "inward", key: "A-1", done: true },
        { type: "Blocks", direction: "outward", key: null, done: false },
        { type: "Clones", direction: "outward", key: "B-2", done: true },
        { type: "Blocks", direction: "inward", key: "C-3", done: false },
      ],
    }),
  );
  assert.deepEqual(result, {
    links: [
      { type: "Relates", direction: "inward", done: true },
      { type: "Blocks", direction: "outward", done: false },
      { type: "Clones", direction: "outward", done: true },
      { type: "Blocks", direction: "inward", done: false },
    ],
  });
  const json = JSON.stringify(result);
  for (const hidden of ["A-1", "B-2", "C-3", "PAY-9"])
    assert.ok(!json.includes(hidden), hidden);
});

test("[happy-7] a partly set issue keeps the fixed order among the keys present", () => {
  const result = jiraContextFields(
    jira({
      links: [{ type: "Blocks", direction: "outward", key: "X-1", done: false }],
      parentKey: "X-0",
      subtaskCount: 4,
      watchers: 2,
      fixVersions: ["3"],
      priority: "Low",
    }),
  );
  assert.deepEqual(Object.keys(result), [
    "priority",
    "fixVersions",
    "watchers",
    "subtasks",
    "hasParent",
    "links",
  ]);
});

// Extends "[boundary-19] an issue with nothing set gives an empty object":
// the never-shown fields stay hidden even when set to "" .
test("[boundary-19] never-shown fields stay hidden whatever their value", () => {
  assert.deepEqual(
    jiraContextFields(jira({ key: "", statusCategory: "", updated: "" })),
    {},
  );
  assert.deepEqual(
    jiraContextFields(
      jira({ key: "ZZ-1", statusCategory: "indeterminate", updated: "x" }),
    ),
    {},
  );
});

// Extends "[boundary-20] zero and empty-string values are shown, a zero
// subtask count is not": an empty parent key is still a parent, and an
// empty-string label still makes a non-empty list.
test("[boundary-20] an empty-string parent key still gives hasParent", () => {
  assert.deepEqual(jiraContextFields(jira({ parentKey: "" })), {
    hasParent: true,
  });
});

test("[boundary-20] every field at zero or empty string is shown, in order", () => {
  const result = jiraContextFields(
    jira({
      issueType: "",
      status: "",
      priority: "",
      labels: [""],
      dueDate: "",
      storyPoints: 0,
      originalEstimateSeconds: 0,
      remainingEstimateSeconds: 0,
      votes: 0,
      watchers: 0,
      subtaskCount: 0,
      parentKey: "",
      statusCategory: "",
    }),
  );
  assert.deepEqual(result, {
    issueType: "",
    status: "",
    priority: "",
    labels: [""],
    dueDate: "",
    storyPoints: 0,
    originalEstimateHours: 0,
    remainingEstimateHours: 0,
    votes: 0,
    watchers: 0,
    hasParent: true,
  });
  assert.deepEqual(Object.keys(result), [
    "issueType",
    "status",
    "priority",
    "labels",
    "dueDate",
    "storyPoints",
    "originalEstimateHours",
    "remainingEstimateHours",
    "votes",
    "watchers",
    "hasParent",
  ]);
});

test("[boundary-20] a subtask count of one is shown", () => {
  assert.deepEqual(jiraContextFields(jira({ subtaskCount: 1 })), {
    subtasks: 1,
  });
});

// Extends "[boundary-21] estimates are converted to hours rounded to 0.1":
// halves round up, not to even, and not through toFixed.
test("[boundary-21] halves of a tenth round up", () => {
  const cases: [number, number][] = [
    [900, 0.3], // 0.25 h
    [8820, 2.5], // 2.45 h
    [540, 0.2], // 0.15 h
    [2700, 0.8], // 0.75 h
  ];
  for (const [seconds, hours] of cases)
    assert.deepEqual(
      jiraContextFields(jira({ originalEstimateSeconds: seconds })),
      { originalEstimateHours: hours },
      `${seconds} seconds`,
    );
});

test("[boundary-21] hours follow Math.round(seconds / 360) / 10 where toFixed differs", () => {
  const cases: [number, number][] = [
    [1260, 0.4], // 0.35 h
    [5220, 1.5], // 1.45 h
    [4140, 1.2], // 1.15 h
    [11340, 3.2], // 3.15 h
  ];
  for (const [seconds, hours] of cases)
    assert.deepEqual(
      jiraContextFields(jira({ remainingEstimateSeconds: seconds })),
      { remainingEstimateHours: hours },
      `${seconds} seconds`,
    );
});

test("[boundary-21] small and large estimates, and both estimates at once", () => {
  const cases: [number, number][] = [
    [1, 0],
    [7199, 2],
    [359999, 100],
    [360000, 100],
  ];
  for (const [seconds, hours] of cases)
    assert.equal(
      jiraContextFields(jira({ originalEstimateSeconds: seconds }))
        .originalEstimateHours,
      hours,
      `${seconds} seconds`,
    );
  assert.deepEqual(
    jiraContextFields(
      jira({ originalEstimateSeconds: 900, remainingEstimateSeconds: 8820 }),
    ),
    { originalEstimateHours: 0.3, remainingEstimateHours: 2.5 },
  );
});

// Extends "[boundary-22] the returned label, component and version arrays
// are the context's own": all three at once, with several entries.
test("[boundary-22] all three lists are the context's own arrays in one result", () => {
  const context = jira({
    labels: ["ui", "web", "a11y"],
    components: ["Front", "Back"],
    fixVersions: ["1", "2", "3", "4"],
    issueType: "Task",
  });
  const result = jiraContextFields(context);
  assert.equal(result.labels, context.labels);
  assert.equal(result.components, context.components);
  assert.equal(result.fixVersions, context.fixVersions);
  assert.notEqual(result, context as unknown);
});
