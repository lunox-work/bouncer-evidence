import assert from "node:assert/strict";
import { test } from "node:test";

import {
  APPROVED_TASK_SCHEMA_VERSION,
  approvedTaskReadiness,
  type ApprovedTaskSnapshot,
} from "../src/sandbox/approved-task.js";
import { NO_CONTEXT, contextDrift } from "../src/sources.js";

test("[happy-10] drift per source", () => {
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
      { jira: current, github: null },
      { jira: used, github: null },
    );
    assert.deepEqual(result.jira, drift, `current ${current}, used ${used}`);
    assert.equal(result.github, null, `current ${current}, used ${used}`);
  }
});

test("[happy-10] github drifts by the same rule", () => {
  assert.deepEqual(
    contextDrift({ jira: null, github: 3 }, { jira: null, github: null }),
    { jira: null, github: { uses: null, current: 3 } },
  );
  assert.deepEqual(
    contextDrift({ jira: null, github: 3 }, { jira: null, github: 4 }),
    { jira: null, github: null },
  );
});

test("[happy-11] sources are judged independently", () => {
  assert.deepEqual(
    contextDrift({ jira: 2, github: 5 }, { jira: 2, github: 4 }),
    { jira: null, github: { uses: 4, current: 5 } },
  );
});

test("[happy-11] both sources can be behind at once", () => {
  assert.deepEqual(
    contextDrift({ jira: 2, github: 5 }, { jira: 1, github: null }),
    { jira: { uses: 1, current: 2 }, github: { uses: null, current: 5 } },
  );
});

test("[boundary-25] a step made before any context was kept", () => {
  assert.deepEqual(contextDrift({ jira: 1, github: null }, NO_CONTEXT), {
    jira: { uses: null, current: 1 },
    github: null,
  });
});

test("[boundary-25] with no overview context nothing is behind, whatever the step used", () => {
  assert.deepEqual(contextDrift(NO_CONTEXT, { jira: 4, github: 1 }), {
    jira: null,
    github: null,
  });
  assert.deepEqual(contextDrift(NO_CONTEXT, NO_CONTEXT), {
    jira: null,
    github: null,
  });
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

test("[boundary-26] context does not change readiness or the schema version", () => {
  const snapshot = readySnapshot();
  const withContext = { ...snapshot, context: { jira: null, github: null } };
  assert.deepEqual(approvedTaskReadiness(snapshot), {
    ready: true,
    reasons: [],
  });
  assert.deepEqual(approvedTaskReadiness(withContext), {
    ready: true,
    reasons: [],
  });
  assert.equal(APPROVED_TASK_SCHEMA_VERSION, 3);
});

test("[boundary-26] a snapshot with both sources' context is read as without", () => {
  const snapshot = readySnapshot();
  const context = {
    jira: {
      version: 1,
      content: {
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
      },
    },
    github: {
      version: 2,
      content: {
        fullName: "acme/pay",
        branch: "main",
        commitSha: "abc123",
        documents: [],
        omitted: 0,
      },
    },
  };
  const withContext = { ...snapshot, context };
  assert.deepEqual(approvedTaskReadiness(withContext), {
    ready: true,
    reasons: [],
  });
  const notReady = { ...snapshot, title: " ", context };
  assert.deepEqual(
    approvedTaskReadiness(notReady),
    approvedTaskReadiness({ ...snapshot, title: " " }),
  );
});
