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
} from "../../src/selection/index.js";

/**
 * Hidden tests for the rule language and the named signals. Every facts
 * value is the spec's "plain facts" with the listed fields changed.
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

type Result = { matched: boolean; clauses: string[] };

/** A signal that counts how often its test runs. */
function spy(id: string, result: boolean, clause: string | null = id): { signal: Signal; calls: () => number } {
  let count = 0;
  return {
    signal: signal(
      id,
      () => {
        count += 1;
        return result;
      },
      () => clause,
    ),
    calls: () => count,
  };
}

function always(id: string, clause: string | null = id): Signal {
  return signal(id, () => true, () => clause);
}

function never(id: string, clause: string | null = id): Signal {
  return signal(id, () => false, () => clause);
}

// Extends "[happy-7] signal builds a signal and silent keeps its id and test but describes nothing".
test("[happy-7] signal keeps the given id, test and describe for other parts", () => {
  const s = signal("votes-big", (f) => f.votes >= 10, (f) => `${f.votes} big`);
  assert.equal(s.id, "votes-big");
  assert.equal(s.test(facts({ votes: 10 })), true);
  assert.equal(s.test(facts({ votes: 9 })), false);
  assert.equal(s.describe(facts({ votes: 12 })), "12 big");
  const n = signal("", () => false, () => null);
  assert.equal(n.id, "");
  assert.equal(n.test(PLAIN_FACTS), false);
  assert.equal(n.describe(PLAIN_FACTS), null);
});

test("[happy-7] silent of a built-in signal keeps its id and test and describes nothing", () => {
  const q = silent(bug);
  assert.equal(q.id, "bug");
  const lowBug = facts({ isBug: true, priorityName: "Low" });
  assert.equal(q.test(lowBug), true);
  assert.equal(q.test(PLAIN_FACTS), false);
  assert.equal(q.describe(lowBug), null);
  assert.deepEqual(evaluate(bug, lowBug), { matched: true, clauses: ["Low-priority bug"] });

  const p = silent(priorityAtMost("medium"));
  assert.equal(p.id, "priority-at-most-medium");
  assert.equal(p.test(facts({ priorityRank: "medium", priorityName: "Medium" })), true);
  assert.equal(p.test(facts({ priorityRank: "high", priorityName: "High" })), false);
});

test("[happy-7] silent of a silent signal still keeps the id and test", () => {
  const s = signal("old", (f) => f.ageDays > 1, (f) => "old " + f.ageDays);
  const qq = silent(silent(s));
  assert.equal(qq.id, "old");
  assert.equal(qq.test(facts({ ageDays: 2 })), true);
  assert.equal(qq.test(facts({ ageDays: 1 })), false);
  assert.equal(qq.describe(facts({ ageDays: 2 })), null);
  assert.equal(s.describe(facts({ ageDays: 2 })), "old 2");
});

// Extends "[happy-8] a matching signal contributes its description": other signals and values.
test("[happy-8] other matching signals contribute their descriptions", () => {
  const cases: [Rule, Partial<IssueFacts>, string][] = [
    [openAtLeast(1000), { ageDays: 2500 }, "open 2500 days"],
    [quietAtLeast(30), { daysSinceUpdate: 45 }, "no update in 45 days"],
    [votesAtLeast(3), { votes: 7 }, "7 votes"],
    [watchersAtLeast(5), { watchers: 12 }, "12 watchers"],
    [blocksAtLeast(2), { blocksOpenCount: 9 }, "blocks 9 open tickets"],
    [always("custom", "custom clause"), {}, "custom clause"],
  ];
  for (const [rule, overrides, clause] of cases) {
    assert.deepEqual(evaluate(rule, facts(overrides)), { matched: true, clauses: [clause] }, clause);
  }
});

// Extends "[unhappy-3] a failing signal contributes nothing": other failing signals and combinators.
test("[unhappy-3] other failing signals and rules contribute nothing", () => {
  const cases: [Rule, Partial<IssueFacts>][] = [
    [watchersAtLeast(10), { watchers: 9 }],
    [quietAtLeast(30), { daysSinceUpdate: 29 }],
    [carriedAtLeast(3), { closedSprintCount: 2, carriedSince: "June" }],
    [openAtLeast(1), { ageDays: 0 }],
    [all(openAtLeast(1), votesAtLeast(5)), { ageDays: 5, votes: 4 }],
    [any(votesAtLeast(5), watchersAtLeast(5)), { votes: 4, watchers: 4 }],
    [any(never("a"), never("b"), never("c")), {}],
  ];
  for (const [rule, overrides] of cases) {
    assert.deepEqual(evaluate(rule, facts(overrides)), { matched: false, clauses: [] }, JSON.stringify(overrides));
  }
});

// Extends "[happy-9] nested rules collect clauses depth-first": deeper nesting, and a
// failing nested all whose matching children must not leak clauses into an any.
test("[happy-9] deeper nesting collects clauses depth-first", () => {
  const rule = any(
    all(always("a1"), any(never("x"), always("a2"), always("a3")), silent(always("s"))),
    never("b"),
    all(always("c1"), all(always("c2"), always("c3"))),
  );
  assert.deepEqual(evaluate(rule, PLAIN_FACTS), {
    matched: true,
    clauses: ["a1", "a2", "a3", "c1", "c2", "c3"],
  });
});

test("[happy-9] a failing child of any contributes no clauses even if its own children matched", () => {
  const rule = any(all(openAtLeast(30), votesAtLeast(10)), watchersAtLeast(5));
  assert.deepEqual(evaluate(rule, facts({ ageDays: 40, watchers: 6, votes: 0 })), {
    matched: true,
    clauses: ["6 watchers"],
  });
});

test("[happy-9] an any lists every matching child in order, not only the first", () => {
  const rule = all(
    any(never("n1"), always("m1"), never("n2"), always("m2"), always("m3")),
    always("tail"),
  );
  assert.deepEqual(evaluate(rule, PLAIN_FACTS), {
    matched: true,
    clauses: ["m1", "m2", "m3", "tail"],
  });
});

test("[happy-9] a failing outer all drops clauses of matching nested children", () => {
  const rule = all(any(always("a"), always("b")), all(always("c"), never("d")));
  assert.deepEqual(evaluate(rule, PLAIN_FACTS), { matched: false, clauses: [] });
});

// Extends "[unhappy-4] all keeps evaluating after its first child fails": the spy
// sits deep, after several failures, and any also evaluates every child.
test("[unhappy-4] all evaluates every child once, past several failures and into nested rules", () => {
  const z1 = spy("z1", true);
  const z2 = spy("z2", false);
  const z3 = spy("z3", true);
  const result = evaluate(
    all(never("a"), never("b"), any(z1.signal, z2.signal), all(z3.signal)),
    PLAIN_FACTS,
  );
  assert.deepEqual(result, { matched: false, clauses: [] });
  assert.equal(z1.calls(), 1);
  assert.equal(z2.calls(), 1);
  assert.equal(z3.calls(), 1);
});

test("[unhappy-4] any evaluates every child even after one matches", () => {
  const z = spy("z", false);
  const w = spy("w", true);
  const result = evaluate(any(always("first"), z.signal, w.signal), PLAIN_FACTS);
  assert.deepEqual(result, { matched: true, clauses: ["first", "w"] });
  assert.equal(z.calls(), 1);
  assert.equal(w.calls(), 1);
});

test("[unhappy-4] a failing all whose spies all match still has no clauses", () => {
  const spies = [spy("p", true), spy("q", true), spy("r", true)];
  const result = evaluate(
    all(...spies.map((s) => s.signal), votesAtLeast(1)),
    PLAIN_FACTS,
  );
  assert.deepEqual(result, { matched: false, clauses: [] });
  for (const s of spies) assert.equal(s.calls(), 1);
});

// Extends "[boundary-10] empty combinators nest as their match results".
test("[boundary-10] empty combinators inside rules with clauses", () => {
  assert.deepEqual(evaluate(all(openAtLeast(1), all()), facts({ ageDays: 5 })), {
    matched: true,
    clauses: ["open 5 days"],
  });
  assert.deepEqual(evaluate(any(any(), openAtLeast(1)), facts({ ageDays: 5 })), {
    matched: true,
    clauses: ["open 5 days"],
  });
  assert.deepEqual(evaluate(all(openAtLeast(1), any()), facts({ ageDays: 5 })), {
    matched: false,
    clauses: [],
  });
  assert.deepEqual(evaluate(all(all(), all(all())), PLAIN_FACTS), { matched: true, clauses: [] });
  assert.deepEqual(evaluate(any(any(), any(any())), PLAIN_FACTS), { matched: false, clauses: [] });
});

// Extends "[boundary-11] any also keeps empty and repeated clauses and drops null ones".
test("[boundary-11] whitespace and repeated clauses survive nesting; null ones do not", () => {
  const sp = always("sp", " ");
  const n = always("n", null);
  const d = always("d", "same");
  assert.deepEqual(evaluate(all(sp, any(d, n), all(n, d), sp), PLAIN_FACTS), {
    matched: true,
    clauses: [" ", "same", "same", " "],
  });
  assert.deepEqual(evaluate(all(n, n, n), PLAIN_FACTS), { matched: true, clauses: [] });
  assert.deepEqual(evaluate(all(votesAtLeast(0), votesAtLeast(0)), PLAIN_FACTS), {
    matched: true,
    clauses: ["0 votes", "0 votes"],
  });
});

// Extends "[boundary-12] counting signals pass at their threshold with singular nouns only for 1":
// one below each threshold, other values, NaN for every factory.
test("[boundary-12] each counting signal fails one below its threshold", () => {
  const cases: [Rule, Partial<IssueFacts>][] = [
    [openAtLeast(10), { ageDays: 9 }],
    [quietAtLeast(1), { daysSinceUpdate: 0 }],
    [carriedAtLeast(2), { closedSprintCount: 1, carriedSince: "May" }],
    [votesAtLeast(3), { votes: 2 }],
    [watchersAtLeast(1), { watchers: 0 }],
    [duplicatesAtLeast(2), { duplicateLinks: 1 }],
    [commentsAtLeast(6), { commentCount: 5 }],
    [blocksAtLeast(2), { blocksOpenCount: 1 }],
  ];
  for (const [rule, overrides] of cases) {
    assert.deepEqual(evaluate(rule, facts(overrides)), { matched: false, clauses: [] }, JSON.stringify(overrides));
  }
});

test("[boundary-12] counting signals use plural nouns for 0 and for 2 or more", () => {
  const cases: [Rule, Partial<IssueFacts>, string][] = [
    [openAtLeast(0), { ageDays: 0 }, "open 0 days"],
    [openAtLeast(0), { ageDays: 2 }, "open 2 days"],
    [quietAtLeast(0), { daysSinceUpdate: 0 }, "no update in 0 days"],
    [quietAtLeast(0), { daysSinceUpdate: 1 }, "no update in 1 day"],
    [carriedAtLeast(0), { closedSprintCount: 0 }, "carried over 0 sprints"],
    [carriedAtLeast(3), { closedSprintCount: 3, carriedSince: "December 2025" }, "carried over 3 sprints since December 2025"],
    [carriedAtLeast(1), { closedSprintCount: 1, carriedSince: "June" }, "carried over 1 sprint since June"],
    [votesAtLeast(2), { votes: 2 }, "2 votes"],
    [watchersAtLeast(0), { watchers: 0 }, "0 watchers"],
    [watchersAtLeast(2), { watchers: 2 }, "2 watchers"],
    [duplicatesAtLeast(1), { duplicateLinks: 2 }, "2 duplicates linked"],
    [commentsAtLeast(0), { commentCount: 0 }, "0 comments"],
    [commentsAtLeast(2), { commentCount: 11 }, "11 comments"],
    [blocksAtLeast(1), { blocksOpenCount: 2 }, "blocks 2 open tickets"],
  ];
  for (const [rule, overrides, clause] of cases) {
    assert.deepEqual(evaluate(rule, facts(overrides)), { matched: true, clauses: [clause] }, clause);
  }
});

test("[boundary-12] a NaN threshold makes every counting signal fail", () => {
  const big = facts({
    ageDays: 1e6,
    daysSinceUpdate: 1e6,
    closedSprintCount: 1e6,
    votes: 1e6,
    watchers: 1e6,
    duplicateLinks: 1e6,
    commentCount: 1e6,
    blocksOpenCount: 1e6,
  });
  const nan = Number.NaN;
  for (const s of [
    quietAtLeast(nan),
    votesAtLeast(nan),
    watchersAtLeast(nan),
    duplicatesAtLeast(nan),
    commentsAtLeast(nan),
    blocksAtLeast(nan),
    openAtLeast(nan),
    carriedAtLeast(nan),
  ]) {
    assert.deepEqual(evaluate(s, big), { matched: false, clauses: [] }, s.id);
  }
});

test("[boundary-12] negative and fractional thresholds are compared as given", () => {
  assert.deepEqual(evaluate(votesAtLeast(-1), PLAIN_FACTS), { matched: true, clauses: ["0 votes"] });
  assert.deepEqual(evaluate(openAtLeast(1.5), facts({ ageDays: 1 })), { matched: false, clauses: [] });
  assert.deepEqual(evaluate(openAtLeast(1.5), facts({ ageDays: 2 })), { matched: true, clauses: ["open 2 days"] });
  assert.deepEqual(evaluate(watchersAtLeast(Infinity), facts({ watchers: 1e9 })), { matched: false, clauses: [] });
});

test("[boundary-12] signal ids do not depend on the threshold and each factory keeps its own threshold", () => {
  assert.equal(openAtLeast(5).id, "open-at-least");
  assert.equal(quietAtLeast(30).id, "quiet-at-least");
  assert.equal(carriedAtLeast(4).id, "carried-at-least");
  assert.equal(votesAtLeast(7).id, "votes-at-least");
  assert.equal(watchersAtLeast(8).id, "watchers-at-least");
  assert.equal(duplicatesAtLeast(9).id, "duplicates-at-least");
  assert.equal(commentsAtLeast(10).id, "comments-at-least");
  assert.equal(blocksAtLeast(11).id, "blocks-at-least");
  const ten = openAtLeast(10);
  const twenty = openAtLeast(20);
  assert.deepEqual(evaluate(ten, facts({ ageDays: 15 })), { matched: true, clauses: ["open 15 days"] });
  assert.deepEqual(evaluate(twenty, facts({ ageDays: 15 })), { matched: false, clauses: [] });
  const v2 = votesAtLeast(2);
  votesAtLeast(50);
  assert.equal(v2.test(facts({ votes: 3 })), true);
});

// Extends "[unhappy-5] a missing comment count never satisfies the comments signal":
// thresholds below 0 that a "missing counts as 0" shortcut would pass.
test("[unhappy-5] a missing comment count fails even negative and infinite-negative thresholds", () => {
  for (const n of [-1, -100, -Infinity, 0.5, Number.NaN]) {
    assert.deepEqual(evaluate(commentsAtLeast(n), PLAIN_FACTS), { matched: false, clauses: [] }, String(n));
  }
  assert.deepEqual(evaluate(any(commentsAtLeast(-1), votesAtLeast(1)), PLAIN_FACTS), {
    matched: false,
    clauses: [],
  });
});

// Extends "[happy-10] flag signals test one fact each": other combinations of facts.
test("[happy-10] flag signals with other combinations of facts", () => {
  const cases: [Rule, Partial<IssueFacts>, Result][] = [
    [unassigned, { assigned: false, inSprint: true, isBug: true }, { matched: true, clauses: ["unassigned"] }],
    [notInSprint, { inSprint: false, closedSprintCount: 0 }, { matched: true, clauses: ["not in any sprint"] }],
    [notInSprint, { inSprint: true, closedSprintCount: 0 }, { matched: false, clauses: [] }],
    [neverInSprint, { inSprint: true, closedSprintCount: 0 }, { matched: false, clauses: [] }],
    [neverInSprint, { inSprint: false, closedSprintCount: 5 }, { matched: false, clauses: [] }],
    [neverInSprint, { inSprint: false, closedSprintCount: 0, assigned: true }, { matched: true, clauses: ["never in a sprint"] }],
    [bug, { isBug: true, priorityName: "P2" }, { matched: true, clauses: ["P2-priority bug"] }],
    [bug, { isBug: true, priorityName: "Very High", priorityRank: "high" }, { matched: true, clauses: ["Very High-priority bug"] }],
    [bug, { isBug: false }, { matched: false, clauses: [] }],
    [unassigned, { assigned: true, inSprint: false }, { matched: false, clauses: [] }],
  ];
  for (const [rule, overrides, expected] of cases) {
    assert.deepEqual(evaluate(rule, facts(overrides)), expected, JSON.stringify(overrides));
  }
});

// Extends "[boundary-13] priorityAtMost passes ranks up to its ceiling and never high or none".
test("[boundary-13] priorityAtMost with the remaining rank and name combinations", () => {
  const cases: ["low" | "medium", IssueFacts["priorityRank"], string | null, Result][] = [
    ["low", "low", "Lowest", { matched: true, clauses: ["priority Lowest"] }],
    ["low", "low", " trivial", { matched: true, clauses: ["priority  trivial"] }],
    ["low", "high", "Low", { matched: false, clauses: [] }],
    ["low", "none", null, { matched: false, clauses: [] }],
    ["medium", "medium", "Medium", { matched: true, clauses: ["priority Medium"] }],
    ["medium", "low", null, { matched: true, clauses: ["priority unset"] }],
    ["medium", "high", "Minor", { matched: false, clauses: [] }],
    ["medium", "none", "Low", { matched: false, clauses: [] }],
  ];
  for (const [ceiling, priorityRank, priorityName, expected] of cases) {
    assert.deepEqual(
      evaluate(priorityAtMost(ceiling), facts({ priorityRank, priorityName })),
      expected,
      `${ceiling} / ${priorityRank} / ${String(priorityName)}`,
    );
  }
});

test("[boundary-13] two priority ceilings coexist without sharing state", () => {
  const low = priorityAtMost("low");
  const medium = priorityAtMost("medium");
  const med = facts({ priorityRank: "medium", priorityName: "Normal" });
  assert.equal(low.test(med), false);
  assert.equal(medium.test(med), true);
  assert.equal(low.id, "priority-at-most-low");
  assert.equal(medium.id, "priority-at-most-medium");
});

// Extends "[boundary-14] deadlineWithin release edges, same-day tie and id": other windows.
test("[boundary-14] deadlineWithin with other window sizes", () => {
  const r = (name: string, inDays: number) => ({ name, inDays });
  const cases: [number, Partial<IssueFacts>, Result][] = [
    [0, { dueInDays: 0 }, { matched: true, clauses: ["due today"] }],
    [0, { dueInDays: 1 }, { matched: false, clauses: [] }],
    [0, { release: r("v1", 0) }, { matched: true, clauses: ["release v1 today"] }],
    [0, { release: r("v1", 1) }, { matched: false, clauses: [] }],
    [7, { dueInDays: 7 }, { matched: true, clauses: ["due in 7 days"] }],
    [7, { dueInDays: 8 }, { matched: false, clauses: [] }],
    [7, { dueInDays: 8, release: r("Q4 launch", 7) }, { matched: true, clauses: ["release Q4 launch in 7 days"] }],
    [7, { dueInDays: 3, release: r("v1", 8) }, { matched: true, clauses: ["due in 3 days"] }],
    [90, { dueInDays: 60 }, { matched: true, clauses: ["due in 60 days"] }],
    [90, { dueInDays: 60, release: r("v9", 45) }, { matched: true, clauses: ["release v9 in 45 days"] }],
    [Number.NaN, { dueInDays: 0, release: r("v1", 0) }, { matched: false, clauses: [] }],
  ];
  for (const [days, overrides, expected] of cases) {
    assert.deepEqual(evaluate(deadlineWithin(days), facts(overrides)), expected, `${days} ${JSON.stringify(overrides)}`);
  }
});

test("[boundary-14] deadlineWithin names the sooner deadline and the due date on a tie", () => {
  const r = (inDays: number) => ({ name: "R2", inDays });
  const cases: [Partial<IssueFacts>, Result][] = [
    [{ dueInDays: 5, release: r(0) }, { matched: true, clauses: ["release R2 today"] }],
    [{ dueInDays: 3, release: r(1) }, { matched: true, clauses: ["release R2 in 1 day"] }],
    [{ dueInDays: 3, release: r(3) }, { matched: true, clauses: ["due in 3 days"] }],
    [{ dueInDays: 1, release: r(1) }, { matched: true, clauses: ["due in 1 day"] }],
    [{ dueInDays: 1, release: r(25) }, { matched: true, clauses: ["due in 1 day"] }],
    [{ dueInDays: 0, release: r(2) }, { matched: true, clauses: ["due today"] }],
    [{ dueInDays: null, release: r(14) }, { matched: true, clauses: ["release R2 in 14 days"] }],
    [{ dueInDays: 14, release: null }, { matched: true, clauses: ["due in 14 days"] }],
  ];
  for (const [overrides, expected] of cases) {
    assert.deepEqual(evaluate(deadlineWithin(30), facts(overrides)), expected, JSON.stringify(overrides));
  }
});

test("[boundary-14] deadlineWithin never passes with only overdue, out-of-window or missing deadlines", () => {
  const cases: Partial<IssueFacts>[] = [
    {},
    { dueInDays: -30 },
    { release: { name: "old", inDays: -1 } },
    { dueInDays: -1, release: { name: "old", inDays: -1 } },
    { dueInDays: 31, release: { name: "far", inDays: 45 } },
    { dueInDays: -5, release: { name: "far", inDays: 31 } },
  ];
  for (const overrides of cases) {
    assert.deepEqual(evaluate(deadlineWithin(30), facts(overrides)), { matched: false, clauses: [] }, JSON.stringify(overrides));
  }
});

test("[boundary-14] two deadline windows coexist without sharing state", () => {
  const short = deadlineWithin(3);
  const long = deadlineWithin(30);
  const f = facts({ dueInDays: 10 });
  assert.equal(short.test(f), false);
  assert.equal(long.test(f), true);
  assert.equal(short.id, "deadline-within");
});
