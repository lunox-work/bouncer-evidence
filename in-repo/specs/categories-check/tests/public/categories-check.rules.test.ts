import assert from "node:assert/strict";
import { test } from "node:test";

import {
  all,
  any,
  blocksAtLeast,
  bug,
  carriedAtLeast,
  commentsAtLeast,
  deadlineWithin,
  duplicatesAtLeast,
  evaluate,
  neverInSprint,
  notInSprint,
  openAtLeast,
  priorityAtMost,
  quietAtLeast,
  signal,
  silent,
  unassigned,
  votesAtLeast,
  watchersAtLeast,
  type IssueFacts,
  type Rule,
  type Signal,
} from "../src/selection/index.js";

/**
 * The rule language and the named signals. Every facts value is the spec's
 * "plain facts" with the listed fields changed.
 */

const PLAIN_FACTS: IssueFacts = {
  ageDays: 0,
  daysSinceUpdate: 0,
  assigned: false,
  inSprint: false,
  closedSprintCount: 0,
  carriedSince: null,
  votes: 0,
  watchers: 0,
  duplicateLinks: 0,
  blocksOpenCount: 0,
  commentCount: null,
  priorityName: null,
  priorityRank: "none",
  isBug: false,
  dueInDays: null,
  release: null,
};

function facts(overrides: Partial<IssueFacts> = {}): IssueFacts {
  return { ...PLAIN_FACTS, ...overrides };
}

/** A signal that counts how often its test runs. */
function spy(id: string, result: boolean): { signal: Signal; calls: () => number } {
  let count = 0;
  return {
    signal: signal(
      id,
      () => {
        count += 1;
        return result;
      },
      () => id,
    ),
    calls: () => count,
  };
}

test("[happy-7] signal builds a signal and silent keeps its id and test but describes nothing", () => {
  const s = signal("old", (f) => f.ageDays > 1, (f) => "old " + f.ageDays);
  const q = silent(s);
  const five = facts({ ageDays: 5 });
  assert.equal(s.id, "old");
  assert.equal(q.id, "old");
  assert.equal(q.test(five), true);
  assert.equal(q.describe(five), null);
  assert.equal(s.describe(five), "old 5");
});

test("[happy-7] a silenced signal still fails where the original fails", () => {
  const s = signal("old", (f) => f.ageDays > 1, (f) => "old " + f.ageDays);
  const q = silent(s);
  const one = facts({ ageDays: 1 });
  assert.equal(s.test(one), false);
  assert.equal(q.test(one), false);
  assert.equal(silent(openAtLeast(1)).id, "open-at-least");
  assert.deepEqual(evaluate(silent(openAtLeast(1)), facts({ ageDays: 3 })), {
    matched: true,
    clauses: [],
  });
});

test("[happy-8] a matching signal contributes its description", () => {
  assert.deepEqual(evaluate(openAtLeast(10), facts({ ageDays: 12 })), {
    matched: true,
    clauses: ["open 12 days"],
  });
});

test("[happy-8] a signal matching exactly at its threshold contributes its description", () => {
  assert.deepEqual(evaluate(openAtLeast(10), facts({ ageDays: 10 })), {
    matched: true,
    clauses: ["open 10 days"],
  });
});

test("[unhappy-3] a failing signal contributes nothing", () => {
  assert.deepEqual(evaluate(openAtLeast(10), facts({ ageDays: 9 })), {
    matched: false,
    clauses: [],
  });
});

test("[unhappy-3] a failing custom signal contributes nothing even with a description", () => {
  const never = signal("never", () => false, () => "should not appear");
  assert.deepEqual(evaluate(never, PLAIN_FACTS), { matched: false, clauses: [] });
});

test("[happy-9] nested rules collect clauses depth-first", () => {
  const rule = all(
    openAtLeast(30),
    any(votesAtLeast(3), duplicatesAtLeast(1), watchersAtLeast(5)),
    silent(unassigned),
  );
  assert.deepEqual(evaluate(rule, facts({ votes: 4, watchers: 6, ageDays: 40 })), {
    matched: true,
    clauses: ["open 40 days", "4 votes", "6 watchers"],
  });
});

test("[happy-9] an any with one matching child contributes only that child's clause", () => {
  const rule = all(
    openAtLeast(30),
    any(votesAtLeast(3), duplicatesAtLeast(1), watchersAtLeast(5)),
    silent(unassigned),
  );
  assert.deepEqual(evaluate(rule, facts({ votes: 2, watchers: 6, ageDays: 40 })), {
    matched: true,
    clauses: ["open 40 days", "6 watchers"],
  });
});

test("[unhappy-4] all with one failing child has no clauses but still evaluates every child", () => {
  const z = spy("z", true);
  const result = evaluate(all(openAtLeast(30), votesAtLeast(3), z.signal), facts({ ageDays: 40 }));
  assert.deepEqual(result, { matched: false, clauses: [] });
  assert.equal(z.calls(), 1);
});

test("[unhappy-4] all keeps evaluating after its first child fails", () => {
  const z = spy("z", true);
  const result = evaluate(all(votesAtLeast(3), openAtLeast(30), z.signal), facts({ ageDays: 40 }));
  assert.deepEqual(result, { matched: false, clauses: [] });
  assert.equal(z.calls(), 1);
});

test("[boundary-10] an empty all matches and an empty any does not", () => {
  assert.deepEqual(evaluate(all(), PLAIN_FACTS), { matched: true, clauses: [] });
  assert.deepEqual(evaluate(any(), PLAIN_FACTS), { matched: false, clauses: [] });
});

test("[boundary-10] empty combinators nest as their match results", () => {
  assert.deepEqual(evaluate(all(any()), PLAIN_FACTS), { matched: false, clauses: [] });
  assert.deepEqual(evaluate(any(all()), PLAIN_FACTS), { matched: true, clauses: [] });
});

test("[boundary-11] a null description adds no clause, an empty one is kept, and equal clauses are kept", () => {
  const e = signal("e", () => true, () => "");
  const n = signal("n", () => true, () => null);
  const d = signal("d", () => true, () => "same");
  assert.deepEqual(evaluate(all(e, n, d, d), PLAIN_FACTS), {
    matched: true,
    clauses: ["", "same", "same"],
  });
});

test("[boundary-11] any also keeps empty and repeated clauses and drops null ones", () => {
  const e = signal("e", () => true, () => "");
  const n = signal("n", () => true, () => null);
  const d = signal("d", () => true, () => "same");
  assert.deepEqual(evaluate(any(d, n, e, d), PLAIN_FACTS), {
    matched: true,
    clauses: ["same", "", "same"],
  });
  assert.deepEqual(evaluate(n, PLAIN_FACTS), { matched: true, clauses: [] });
});

test("[boundary-12] counting signals pass at their threshold with singular nouns only for 1", () => {
  const cases: [Rule, Partial<IssueFacts>, { matched: boolean; clauses: string[] }][] = [
    [openAtLeast(1), { ageDays: 1 }, { matched: true, clauses: ["open 1 day"] }],
    [quietAtLeast(90), { daysSinceUpdate: 90 }, { matched: true, clauses: ["no update in 90 days"] }],
    [quietAtLeast(90), { daysSinceUpdate: 89 }, { matched: false, clauses: [] }],
    [
      carriedAtLeast(2),
      { closedSprintCount: 2, carriedSince: "June" },
      { matched: true, clauses: ["carried over 2 sprints since June"] },
    ],
    [
      carriedAtLeast(1),
      { closedSprintCount: 1, carriedSince: null },
      { matched: true, clauses: ["carried over 1 sprint"] },
    ],
    [votesAtLeast(0), { votes: 0 }, { matched: true, clauses: ["0 votes"] }],
    [watchersAtLeast(5), { watchers: 4 }, { matched: false, clauses: [] }],
    [duplicatesAtLeast(1), { duplicateLinks: 1 }, { matched: true, clauses: ["1 duplicate linked"] }],
    [commentsAtLeast(5), { commentCount: 5 }, { matched: true, clauses: ["5 comments"] }],
    [blocksAtLeast(1), { blocksOpenCount: 1 }, { matched: true, clauses: ["blocks 1 open ticket"] }],
    [blocksAtLeast(1), { blocksOpenCount: 3 }, { matched: true, clauses: ["blocks 3 open tickets"] }],
    [openAtLeast(NaN), { ageDays: 500 }, { matched: false, clauses: [] }],
  ];
  for (const [rule, overrides, expected] of cases) {
    assert.deepEqual(evaluate(rule, facts(overrides)), expected, JSON.stringify(overrides));
  }
});

test("[boundary-12] each counting signal has its id and singular wording at exactly 1", () => {
  const cases: [Signal, string, Partial<IssueFacts>, string][] = [
    [openAtLeast(1), "open-at-least", { ageDays: 1 }, "open 1 day"],
    [quietAtLeast(1), "quiet-at-least", { daysSinceUpdate: 1 }, "no update in 1 day"],
    [carriedAtLeast(1), "carried-at-least", { closedSprintCount: 1, carriedSince: "March" }, "carried over 1 sprint since March"],
    [votesAtLeast(1), "votes-at-least", { votes: 1 }, "1 vote"],
    [watchersAtLeast(1), "watchers-at-least", { watchers: 1 }, "1 watcher"],
    [duplicatesAtLeast(0), "duplicates-at-least", { duplicateLinks: 0 }, "0 duplicates linked"],
    [commentsAtLeast(1), "comments-at-least", { commentCount: 1 }, "1 comment"],
    [blocksAtLeast(0), "blocks-at-least", { blocksOpenCount: 0 }, "blocks 0 open tickets"],
  ];
  for (const [s, id, overrides, clause] of cases) {
    assert.equal(s.id, id);
    assert.deepEqual(evaluate(s, facts(overrides)), { matched: true, clauses: [clause] }, id);
  }
  assert.deepEqual(evaluate(carriedAtLeast(NaN), facts({ closedSprintCount: 9 })), {
    matched: false,
    clauses: [],
  });
});

test("[unhappy-5] a missing comment count never satisfies the comments signal", () => {
  assert.deepEqual(evaluate(commentsAtLeast(0), PLAIN_FACTS), { matched: false, clauses: [] });
});

test("[unhappy-5] a comment count of 0 does satisfy a threshold of 0", () => {
  assert.deepEqual(evaluate(commentsAtLeast(0), facts({ commentCount: 0 })), {
    matched: true,
    clauses: ["0 comments"],
  });
});

test("[happy-10] flag signals test one fact each", () => {
  const cases: [Rule, Partial<IssueFacts>, { matched: boolean; clauses: string[] }][] = [
    [unassigned, { assigned: false }, { matched: true, clauses: ["unassigned"] }],
    [unassigned, { assigned: true }, { matched: false, clauses: [] }],
    [notInSprint, { closedSprintCount: 4 }, { matched: true, clauses: ["not in any sprint"] }],
    [notInSprint, { inSprint: true }, { matched: false, clauses: [] }],
    [neverInSprint, { closedSprintCount: 0 }, { matched: true, clauses: ["never in a sprint"] }],
    [neverInSprint, { closedSprintCount: 1 }, { matched: false, clauses: [] }],
    [neverInSprint, { inSprint: true }, { matched: false, clauses: [] }],
    [bug, { isBug: true }, { matched: true, clauses: ["bug"] }],
    [bug, { isBug: true, priorityName: "Low" }, { matched: true, clauses: ["Low-priority bug"] }],
  ];
  for (const [rule, overrides, expected] of cases) {
    assert.deepEqual(evaluate(rule, facts(overrides)), expected, JSON.stringify(overrides));
  }
});

test("[happy-10] flag signals carry their ids and bug fails for a non-bug", () => {
  assert.equal(unassigned.id, "unassigned");
  assert.equal(neverInSprint.id, "never-in-sprint");
  assert.equal(notInSprint.id, "not-in-sprint");
  assert.equal(bug.id, "bug");
  assert.deepEqual(evaluate(bug, facts({ isBug: false, priorityName: "Low" })), {
    matched: false,
    clauses: [],
  });
});

test("[boundary-13] priorityAtMost passes ranks up to its ceiling and never high or none", () => {
  const cases: ["low" | "medium", IssueFacts["priorityRank"], string | null, boolean, string[]][] = [
    ["low", "low", "Minor", true, ["priority Minor"]],
    ["low", "medium", "Medium", false, []],
    ["medium", "low", "Low", true, ["priority Low"]],
    ["medium", "medium", "Normal", true, ["priority Normal"]],
    ["medium", "high", "High", false, []],
    ["medium", "none", null, false, []],
  ];
  for (const [ceiling, priorityRank, priorityName, matched, clauses] of cases) {
    assert.deepEqual(
      evaluate(priorityAtMost(ceiling), facts({ priorityRank, priorityName })),
      { matched, clauses },
      `${ceiling} / ${priorityRank}`,
    );
  }
});

test("[boundary-13] priorityAtMost ids carry the rank, low never passes high or none, and a null name reads unset", () => {
  assert.equal(priorityAtMost("low").id, "priority-at-most-low");
  assert.equal(priorityAtMost("medium").id, "priority-at-most-medium");
  assert.equal(priorityAtMost("low").test(facts({ priorityRank: "high", priorityName: "High" })), false);
  assert.equal(priorityAtMost("low").test(facts({ priorityRank: "none" })), false);
  assert.equal(priorityAtMost("low").describe(facts({ priorityRank: "low", priorityName: null })), "priority unset");
});

test("[boundary-14] deadlineWithin passes 0 to days ahead and names the sooner deadline", () => {
  const release = (inDays: number) => ({ name: "2.4", inDays });
  const cases: [Partial<IssueFacts>, { matched: boolean; clauses: string[] }][] = [
    [{ dueInDays: 0 }, { matched: true, clauses: ["due today"] }],
    [{ dueInDays: 1 }, { matched: true, clauses: ["due in 1 day"] }],
    [{ dueInDays: 30 }, { matched: true, clauses: ["due in 30 days"] }],
    [{ dueInDays: 31 }, { matched: false, clauses: [] }],
    [{ dueInDays: -1 }, { matched: false, clauses: [] }],
    [{ release: release(0) }, { matched: true, clauses: ["release 2.4 today"] }],
    [{ dueInDays: 5, release: release(12) }, { matched: true, clauses: ["due in 5 days"] }],
    [{ dueInDays: 20, release: release(12) }, { matched: true, clauses: ["release 2.4 in 12 days"] }],
    [{ dueInDays: 12, release: release(12) }, { matched: true, clauses: ["due in 12 days"] }],
    [{ dueInDays: -3, release: release(12) }, { matched: true, clauses: ["release 2.4 in 12 days"] }],
    [{ dueInDays: 40, release: release(12) }, { matched: true, clauses: ["release 2.4 in 12 days"] }],
  ];
  for (const [overrides, expected] of cases) {
    assert.deepEqual(evaluate(deadlineWithin(30), facts(overrides)), expected, JSON.stringify(overrides));
  }
});

test("[boundary-14] deadlineWithin release edges, same-day tie and id", () => {
  assert.equal(deadlineWithin(30).id, "deadline-within");
  assert.deepEqual(evaluate(deadlineWithin(30), facts({ release: { name: "R1", inDays: 1 } })), {
    matched: true,
    clauses: ["release R1 in 1 day"],
  });
  assert.deepEqual(evaluate(deadlineWithin(30), facts({ release: { name: "R1", inDays: 30 } })), {
    matched: true,
    clauses: ["release R1 in 30 days"],
  });
  assert.deepEqual(evaluate(deadlineWithin(30), facts({ release: { name: "R1", inDays: 31 } })), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(
    evaluate(deadlineWithin(30), facts({ dueInDays: 0, release: { name: "R1", inDays: 0 } })),
    { matched: true, clauses: ["due today"] },
  );
  assert.deepEqual(
    evaluate(deadlineWithin(30), facts({ dueInDays: 31, release: { name: "R1", inDays: 31 } })),
    { matched: false, clauses: [] },
  );
});
