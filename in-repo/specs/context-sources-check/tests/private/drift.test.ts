import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPROVED_TASK_SCHEMA_VERSION,
  approvedTaskReadiness,
  type ApprovedTaskSnapshot,
} from "../../src/sandbox/approved-task.js";
import {
  NO_CONTEXT,
  contextDrift,
  keptDocuments,
  renderSourceContext,
  type ContextVersions,
  type JiraContext,
} from "../../src/sources.js";

// Extends "[happy-10] drift per source": the same table for github, with
// jira left out.
test("[happy-10] drift per source, for github", () => {
  const cases: [number | null, number | null, object | null][] = [
    [3, 3, null],
    [3, 2, { uses: 2, current: 3 }],
    [3, null, { uses: null, current: 3 }],
    [null, 2, null],
    [null, null, null],
    [2, 3, null],
  ];
  for (const [current, used, drift] of cases) {
    const result = contextDrift(
      { jira: null, github: current },
      { jira: null, github: used },
    );
    assert.deepEqual(result.github, drift, `current ${current}, used ${used}`);
    assert.equal(result.jira, null, `current ${current}, used ${used}`);
  }
});

test("[happy-10] version 0 is a version, not an absence", () => {
  assert.deepEqual(
    contextDrift({ jira: 0, github: 1 }, { jira: null, github: 0 }),
    { jira: { uses: null, current: 0 }, github: { uses: 0, current: 1 } },
  );
  assert.deepEqual(
    contextDrift({ jira: 0, github: 0 }, { jira: 0, github: 0 }),
    { jira: null, github: null },
  );
});

test("[happy-10] large and far-apart versions compare as numbers", () => {
  assert.deepEqual(
    contextDrift({ jira: 10, github: 1000 }, { jira: 9, github: 999 }),
    { jira: { uses: 9, current: 10 }, github: { uses: 999, current: 1000 } },
  );
  assert.deepEqual(
    contextDrift({ jira: 9, github: 2 }, { jira: 10, github: 100 }),
    { jira: null, github: null },
  );
  assert.deepEqual(contextDrift({ jira: 100, github: null }, { jira: 1, github: null }), {
    jira: { uses: 1, current: 100 },
    github: null,
  });
});

// Extends "[happy-11] sources are judged independently": each source's
// outcome comes from its own pair only.
test("[happy-11] each mix of outcomes across the two sources", () => {
  const cases: [ContextVersions, ContextVersions, object][] = [
    [
      { jira: 5, github: 1 },
      { jira: 6, github: null },
      { jira: null, github: { uses: null, current: 1 } },
    ],
    [
      { jira: null, github: 2 },
      { jira: 1, github: 1 },
      { jira: null, github: { uses: 1, current: 2 } },
    ],
    [
      { jira: 3, github: 3 },
      { jira: null, github: 3 },
      { jira: { uses: null, current: 3 }, github: null },
    ],
    [
      { jira: 4, github: null },
      { jira: 2, github: 7 },
      { jira: { uses: 2, current: 4 }, github: null },
    ],
  ];
  for (const [current, used, expected] of cases)
    assert.deepEqual(
      contextDrift(current, used),
      expected,
      JSON.stringify([current, used]),
    );
});

test("[happy-11] contextDrift does not mutate its arguments", () => {
  const current = { jira: 2, github: 5 };
  const used = { jira: 1, github: null };
  contextDrift(current, used);
  assert.deepEqual(current, { jira: 2, github: 5 });
  assert.deepEqual(used, { jira: 1, github: null });
});

// Extends "[boundary-25] a step made before any context was kept".
test("[boundary-25] a step with no context is behind on every source the overview holds", () => {
  assert.deepEqual(contextDrift({ jira: 3, github: 8 }, NO_CONTEXT), {
    jira: { uses: null, current: 3 },
    github: { uses: null, current: 8 },
  });
  assert.deepEqual(contextDrift({ jira: null, github: 1 }, NO_CONTEXT), {
    jira: null,
    github: { uses: null, current: 1 },
  });
  assert.deepEqual(NO_CONTEXT, { jira: null, github: null });
});

/** A ready version-3 snapshot without context. */
function readySnapshot(): ApprovedTaskSnapshot {
  return {
    schemaVersion: 3,
    title: "Fix the thing",
    summary: "It is broken.",
    spec: {
      proposalId: "bpr_1",
      specRevision: 2,
      specHash: "s".repeat(64),
      draft: {
        feature: "Thing",
        background: [],
        scenarios: [
          {
            id: "s1",
            kind: "happy-path" as never,
            title: "works",
            steps: [{ keyword: "Given", text: "x" }],
            origin: "draft",
          },
        ],
        openQuestions: [],
        assumptions: [],
      },
    },
    pricing: {
      proposalId: "bpr_1",
      proposalRevision: 3,
      complexity: "M",
      amountMinor: 10500,
      currency: "USD",
      status: "approved",
      decidedAt: null,
    },
    selectedBy: "user_1",
    selectedAt: "2026-10-02T00:00:00.000Z",
    bountyId: "bty_1",
  };
}

// Extends "[boundary-26] context does not change readiness or the schema
// version": a snapshot frozen with documents kept by keptDocuments.
test("[boundary-26] a snapshot frozen with kept documents and Jira fields stays ready at version 3", () => {
  const content: JiraContext = {
    key: "PAY-9",
    issueType: "Bug",
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
  };
  const kept = keptDocuments([
    { path: "README.md", bytes: 9, text: " Hello\r\n" },
    { path: "blank.md", bytes: 1, text: " " },
  ]);
  const context = {
    jira: { version: 4, content },
    github: {
      version: 2,
      content: {
        fullName: "acme/pay",
        branch: "main",
        commitSha: "abc123",
        documents: kept.documents,
        omitted: kept.omitted,
      },
    },
  };
  assert.equal(
    renderSourceContext({ jira: content, github: context.github.content }),
    'Jira fields:\n{"issueType":"Bug"}\n\nRepository documents:\n\n--- README.md ---\nHello',
  );
  const snapshot = readySnapshot();
  const withContext = { ...snapshot, context };
  assert.deepEqual(approvedTaskReadiness(withContext), {
    ready: true,
    reasons: [],
  });
  const blank = { ...snapshot, summary: " " };
  const blankWithContext = { ...blank, context };
  assert.deepEqual(
    approvedTaskReadiness(blankWithContext),
    approvedTaskReadiness(blank),
  );
  assert.equal(APPROVED_TASK_SCHEMA_VERSION, 3);
});
