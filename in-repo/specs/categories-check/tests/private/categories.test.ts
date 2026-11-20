import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATEGORIES,
  UNCATEGORIZED,
  all,
  any,
  blocksAtLeast,
  bug,
  carriedAtLeast,
  classify,
  commentsAtLeast,
  createClassifier,
  deadlineWithin,
  duplicatesAtLeast,
  evaluate,
  neverInSprint,
  notInSprint,
  openAtLeast,
  priorityAtMost,
  quietAtLeast,
  resolveCategories,
  signal,
  silent,
  unassigned,
  votesAtLeast,
  watchersAtLeast,
  type Category,
  type CategoryConfig,
  type CategoryMatch,
  type IssueFacts,
  type ResolvedCategory,
  type Rule,
  type Thresholds,
} from "../../src/selection/index.js";

/**
 * Hidden tests for the category registry, the merge of board overrides and
 * the classifier. Every facts value is the spec's "plain facts" with the
 * listed fields changed.
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

const IDS = [
  "left-behind",
  "always-next-sprint",
  "quietly-wanted",
  "holding-others-up",
  "paper-cuts",
  "deadline-exposed",
];

const LABELS: Record<string, string> = {
  "left-behind": "Left behind",
  "always-next-sprint": "Always next sprint",
  "quietly-wanted": "Quietly wanted",
  "holding-others-up": "Holding others up",
  "paper-cuts": "Paper cuts",
  "deadline-exposed": "Deadline exposed",
};

const WHY: Record<string, string> = {
  "left-behind":
    "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
  "always-next-sprint": "Already planned and wanted; the only blocker is capacity.",
  "quietly-wanted":
    "Shows demand that the priority field hides, which justifies a higher bounty.",
  "holding-others-up": "One bounty unblocks several tickets the team will do in-house.",
  "paper-cuts":
    "Small, self-contained bugs are what agents fix most reliably, and users notice when they're gone.",
  "deadline-exposed": "The deadline justifies paying now rather than waiting for capacity.",
};

const DEFAULTS: Record<string, Thresholds> = {
  "left-behind": { minAgeDays: 180, minQuietDays: 90 },
  "always-next-sprint": { minSprints: 2 },
  "quietly-wanted": { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 },
  "holding-others-up": { minBlocked: 1 },
  "paper-cuts": { minAgeDays: 90 },
  "deadline-exposed": { withinDays: 30 },
};

function n(t: Thresholds, key: string): number {
  return t[key] ?? Number.NaN;
}

/** The `rule(t)` column of the registry table, built from the public signals. */
const DOCUMENTED_RULES: Record<string, (t: Thresholds) => Rule> = {
  "left-behind": (t) =>
    all(openAtLeast(n(t, "minAgeDays")), neverInSprint, unassigned, silent(quietAtLeast(n(t, "minQuietDays")))),
  "always-next-sprint": (t) => carriedAtLeast(n(t, "minSprints")),
  "quietly-wanted": (t) =>
    all(
      any(
        votesAtLeast(n(t, "minVotes")),
        watchersAtLeast(n(t, "minWatchers")),
        commentsAtLeast(n(t, "minComments")),
        duplicatesAtLeast(n(t, "minDuplicates")),
      ),
      priorityAtMost("low"),
    ),
  "holding-others-up": (t) => all(blocksAtLeast(n(t, "minBlocked")), unassigned),
  "paper-cuts": (t) => all(bug, silent(priorityAtMost("medium")), openAtLeast(n(t, "minAgeDays"))),
  "deadline-exposed": (t) => all(deadlineWithin(n(t, "withinDays")), silent(unassigned), notInSprint),
};

function entry(resolved: readonly ResolvedCategory[], id: string): ResolvedCategory {
  const found = resolved.find((c) => c.id === id);
  assert.ok(found, `no entry for ${id}`);
  return found;
}

function custom(id: string, label: string, build: (t: Thresholds) => Rule, defaults: Thresholds = {}): Category {
  return { id, label, why: `Why ${id}.`, defaults, rule: build };
}

/** A custom category whose rule function records each call. */
function spyCategory(
  id: string,
  label: string,
  defaults: Thresholds,
  build: (t: Thresholds) => Rule,
): { category: Category; calls: Thresholds[] } {
  const calls: Thresholds[] = [];
  return {
    category: {
      id,
      label,
      why: `Why ${id}.`,
      defaults,
      rule: (t) => {
        calls.push(t);
        return build(t);
      },
    },
    calls,
  };
}

const VARIED_FACTS: IssueFacts[] = [
  PLAIN_FACTS,
  facts({ ageDays: 200, daysSinceUpdate: 120 }),
  facts({ ageDays: 200, daysSinceUpdate: 89 }),
  facts({ ageDays: 400, daysSinceUpdate: 400, assigned: true }),
  facts({ ageDays: 400, daysSinceUpdate: 400, closedSprintCount: 1, carriedSince: "May" }),
  facts({ ageDays: 400, daysSinceUpdate: 400, inSprint: true }),
  facts({ closedSprintCount: 2, carriedSince: "June" }),
  facts({ closedSprintCount: 5, carriedSince: null, inSprint: true, assigned: true }),
  facts({ votes: 3, priorityRank: "low", priorityName: "Low" }),
  facts({ watchers: 5, commentCount: 5, duplicateLinks: 1, votes: 3, priorityRank: "low", priorityName: "Minor" }),
  facts({ votes: 9, priorityRank: "medium", priorityName: "Medium" }),
  facts({ commentCount: 4, watchers: 4, votes: 2, priorityRank: "low", priorityName: "Lowest" }),
  facts({ blocksOpenCount: 1 }),
  facts({ blocksOpenCount: 4, assigned: true }),
  facts({ isBug: true, priorityRank: "medium", priorityName: "Normal", ageDays: 90 }),
  facts({ isBug: true, priorityRank: "high", priorityName: "High", ageDays: 900 }),
  facts({ isBug: true, priorityRank: "low", priorityName: null, ageDays: 95 }),
  facts({ dueInDays: 0 }),
  facts({ dueInDays: 30, assigned: true }),
  facts({ dueInDays: 30, inSprint: true }),
  facts({ release: { name: "R", inDays: 12 }, dueInDays: -4 }),
  facts({ release: { name: "R", inDays: 31 } }),
];

const ALT_THRESHOLDS: Record<string, Thresholds> = {
  "left-behind": { minAgeDays: 10, minQuietDays: 400 },
  "always-next-sprint": { minSprints: 5 },
  "quietly-wanted": { minVotes: 9, minWatchers: 1, minDuplicates: 3, minComments: 0 },
  "holding-others-up": { minBlocked: 4 },
  "paper-cuts": { minAgeDays: 900 },
  "deadline-exposed": { withinDays: 0 },
};

// Extends "[happy-11] every registry entry has its documented why text and defaults":
// each entry's rule(t) evaluates as the documented rule, for default and other thresholds.
test("[happy-11] each registry rule evaluates as its documented rule for default and other thresholds", () => {
  for (const category of CATEGORIES) {
    const documented = DOCUMENTED_RULES[category.id];
    const alt = ALT_THRESHOLDS[category.id];
    assert.ok(documented && alt, category.id);
    for (const t of [category.defaults, alt]) {
      const built = category.rule(t);
      const expected = documented(t);
      for (const f of VARIED_FACTS) {
        assert.deepEqual(evaluate(built, f), evaluate(expected, f), `${category.id} ${JSON.stringify(t)} ${JSON.stringify(f)}`);
      }
    }
  }
});

test("[happy-11] registry rules give the documented clauses for sample tickets", () => {
  const byId = (id: string): Category => {
    const c = CATEGORIES.find((x) => x.id === id);
    assert.ok(c, id);
    return c;
  };
  assert.deepEqual(
    evaluate(byId("left-behind").rule({ minAgeDays: 10, minQuietDays: 5 }), facts({ ageDays: 11, daysSinceUpdate: 5 })),
    { matched: true, clauses: ["open 11 days", "never in a sprint", "unassigned"] },
  );
  assert.deepEqual(
    evaluate(byId("always-next-sprint").rule({ minSprints: 1 }), facts({ closedSprintCount: 1, carriedSince: "May" })),
    { matched: true, clauses: ["carried over 1 sprint since May"] },
  );
  assert.deepEqual(
    evaluate(
      byId("quietly-wanted").rule({ minVotes: 1, minWatchers: 1, minDuplicates: 1, minComments: 1 }),
      facts({ votes: 1, watchers: 1, duplicateLinks: 1, commentCount: 1, priorityRank: "low", priorityName: "Trivial" }),
    ),
    { matched: true, clauses: ["1 vote", "1 watcher", "1 comment", "1 duplicate linked", "priority Trivial"] },
  );
  assert.deepEqual(
    evaluate(byId("holding-others-up").rule({ minBlocked: 3 }), facts({ blocksOpenCount: 2 })),
    { matched: false, clauses: [] },
  );
  assert.deepEqual(
    evaluate(byId("paper-cuts").rule({ minAgeDays: 1 }), facts({ isBug: true, priorityRank: "low", priorityName: "Minor", ageDays: 1 })),
    { matched: true, clauses: ["Minor-priority bug", "open 1 day"] },
  );
  assert.deepEqual(
    evaluate(byId("deadline-exposed").rule({ withinDays: 60 }), facts({ dueInDays: 45 })),
    { matched: true, clauses: ["due in 45 days", "not in any sprint"] },
  );
  assert.equal(UNCATEGORIZED, "uncategorized");
  assert.ok(!resolveCategories().some((c) => c.id === UNCATEGORIZED));
});

// Extends "[happy-12] no config resolves to the defaults, all enabled, in registry order":
// the whole resolved list, entry by entry.
test("[happy-12] every resolved entry deep-equals its documented id, label, why, enabled and defaults", () => {
  const expected = IDS.map((id) => ({
    id,
    label: LABELS[id],
    why: WHY[id],
    enabled: true,
    thresholds: DEFAULTS[id],
  }));
  assert.deepEqual(resolveCategories(), expected);
  assert.deepEqual(resolveCategories(undefined, undefined), expected);
  assert.deepEqual(resolveCategories({}, CATEGORIES), expected);
});

// Extends "[happy-13] overrides merge threshold by threshold": a disabled category still
// merges its thresholds, every key of a category overridden, and other categories untouched.
test("[happy-13] a disabled category still merges its threshold overrides", () => {
  const resolved = resolveCategories({
    "paper-cuts": { enabled: false, thresholds: { minAgeDays: 10 } },
    "deadline-exposed": { enabled: false },
  });
  assert.deepEqual(entry(resolved, "paper-cuts"), {
    id: "paper-cuts",
    label: "Paper cuts",
    why: WHY["paper-cuts"],
    enabled: false,
    thresholds: { minAgeDays: 10 },
  });
  assert.equal(entry(resolved, "deadline-exposed").enabled, false);
  assert.deepEqual(entry(resolved, "deadline-exposed").thresholds, { withinDays: 30 });
});

test("[happy-13] every threshold of every category can be overridden at once", () => {
  const config: CategoryConfig = {
    "left-behind": { enabled: true, thresholds: { minAgeDays: 1e9, minQuietDays: 0.25 } },
    "always-next-sprint": { thresholds: { minSprints: -3 } },
    "quietly-wanted": { thresholds: { minVotes: 10, minWatchers: 20, minDuplicates: 30, minComments: 40 } },
    "holding-others-up": { thresholds: { minBlocked: 0 } },
    "paper-cuts": { thresholds: { minAgeDays: 7 } },
    "deadline-exposed": { thresholds: { withinDays: 365 } },
  };
  const before = structuredClone(config);
  const resolved = resolveCategories(config);
  assert.deepEqual(
    resolved.map((c) => [c.id, c.enabled, c.thresholds]),
    [
      ["left-behind", true, { minAgeDays: 1e9, minQuietDays: 0.25 }],
      ["always-next-sprint", true, { minSprints: -3 }],
      ["quietly-wanted", true, { minVotes: 10, minWatchers: 20, minDuplicates: 30, minComments: 40 }],
      ["holding-others-up", true, { minBlocked: 0 }],
      ["paper-cuts", true, { minAgeDays: 7 }],
      ["deadline-exposed", true, { withinDays: 365 }],
    ],
  );
  assert.deepEqual(config, before);
});

test("[happy-13] an override for one category leaves the others at their defaults", () => {
  const resolved = resolveCategories({ "holding-others-up": { thresholds: { minBlocked: 3 } } });
  for (const c of resolved) {
    if (c.id === "holding-others-up") {
      assert.deepEqual(c.thresholds, { minBlocked: 3 });
    } else {
      assert.deepEqual(c.thresholds, DEFAULTS[c.id], c.id);
    }
    assert.equal(c.enabled, true, c.id);
  }
});

// Extends "[unhappy-6] invalid, removed and unknown overrides fall back or are dropped without an error":
// other non-boolean enabled values and other non-number thresholds.
test("[unhappy-6] only enabled === false disables; null, 0, empty and the text false leave it enabled", () => {
  const config = {
    "left-behind": { enabled: null },
    "always-next-sprint": { enabled: 0 },
    "quietly-wanted": { enabled: "false" },
    "holding-others-up": { enabled: "" },
    "paper-cuts": {},
    "deadline-exposed": { enabled: false },
  } as unknown as CategoryConfig;
  let resolved: ResolvedCategory[] = [];
  assert.doesNotThrow(() => {
    resolved = resolveCategories(config);
  });
  assert.deepEqual(
    resolved.map((c) => [c.id, c.enabled]),
    [
      ["left-behind", true],
      ["always-next-sprint", true],
      ["quietly-wanted", true],
      ["holding-others-up", true],
      ["paper-cuts", true],
      ["deadline-exposed", false],
    ],
  );
});

test("[unhappy-6] booleans, arrays, objects, empty and numeric strings fall back to the default", () => {
  const config = {
    "quietly-wanted": { thresholds: { minVotes: true, minWatchers: [7], minDuplicates: {}, minComments: "" } },
    "left-behind": { thresholds: { minAgeDays: "365", minQuietDays: false } },
    "paper-cuts": { thresholds: { minAgeDays: Number.NaN, extra: 3 } },
    "always-next-sprint": { thresholds: {} },
    "holding-others-up": { thresholds: { minBlocked: -Infinity, toString: 4 } },
    "deadline-exposed": { thresholds: { withinDays: [] } },
  } as unknown as CategoryConfig;
  let resolved: ResolvedCategory[] = [];
  assert.doesNotThrow(() => {
    resolved = resolveCategories(config);
  });
  assert.deepEqual(
    resolved.map((c) => c.thresholds),
    IDS.map((id) => DEFAULTS[id]),
  );
  assert.deepEqual(Object.keys(entry(resolved, "paper-cuts").thresholds), ["minAgeDays"]);
  assert.deepEqual(Object.keys(entry(resolved, "holding-others-up").thresholds).sort(), ["minBlocked"]);
});

test("[unhappy-6] a valid override next to an invalid one is still applied", () => {
  const config = {
    "left-behind": { thresholds: { minAgeDays: 30, minQuietDays: "7", unknown: 1 } },
    "quietly-wanted": { thresholds: { minVotes: Infinity, minWatchers: 2 } },
  } as unknown as CategoryConfig;
  const resolved = resolveCategories(config);
  assert.deepEqual(entry(resolved, "left-behind").thresholds, { minAgeDays: 30, minQuietDays: 90 });
  assert.deepEqual(entry(resolved, "quietly-wanted").thresholds, {
    minVotes: 3,
    minWatchers: 2,
    minDuplicates: 1,
    minComments: 5,
  });
});

test("[unhappy-6] classify falls back to the default threshold for an invalid override", () => {
  const config = {
    "holding-others-up": { thresholds: { minBlocked: null } },
    "left-behind": { thresholds: { minAgeDays: Number.NaN, minQuietDays: "1" } },
  } as unknown as CategoryConfig;
  assert.deepEqual(classify(facts({ blocksOpenCount: 1 }), config), [
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 1 open ticket, unassigned" },
  ]);
  assert.deepEqual(classify(facts({ ageDays: 200, daysSinceUpdate: 50 }), config), []);
  assert.deepEqual(classify(facts({ ageDays: 180, daysSinceUpdate: 90 }), config), [
    { id: "left-behind", label: "Left behind", reason: "Open 180 days, never in a sprint, unassigned" },
  ]);
});

// Extends "[boundary-15] a custom registry replaces the built-in one": several custom
// categories in their own order, with unknown keys and disabled entries.
test("[boundary-15] a custom registry of several categories keeps its own order and rules", () => {
  const z = custom("z", "Zed", () => unassigned, { a: 1, b: 2 });
  const a = custom("a", "Ay", () => unassigned, {});
  const m = custom("m", "Em", () => unassigned, { k: 5 });
  const resolved = resolveCategories(
    {
      z: { thresholds: { b: 20, c: 30 } },
      a: { thresholds: { x: 1 } },
      m: { enabled: false, thresholds: { k: 6 } },
      "left-behind": { enabled: false },
    },
    [z, a, m],
  );
  assert.deepEqual(resolved, [
    { id: "z", label: "Zed", why: "Why z.", enabled: true, thresholds: { a: 1, b: 20 } },
    { id: "a", label: "Ay", why: "Why a.", enabled: true, thresholds: {} },
    { id: "m", label: "Em", why: "Why m.", enabled: false, thresholds: { k: 6 } },
  ]);
});

// Extends "[happy-14] each built-in category matches exactly at its default thresholds":
// other values, and every demand signal at once in the rule's order.
test("[happy-14] each built-in category matches other tickets with the documented reason", () => {
  const cases: [Partial<IssueFacts>, string, string][] = [
    [{ ageDays: 500, daysSinceUpdate: 400 }, "left-behind", "Open 500 days, never in a sprint, unassigned"],
    [
      { closedSprintCount: 2, carriedSince: "December 2025", assigned: true },
      "always-next-sprint",
      "Carried over 2 sprints since December 2025",
    ],
    [
      { votes: 3, watchers: 5, commentCount: 5, duplicateLinks: 1, priorityRank: "low", priorityName: "Low" },
      "quietly-wanted",
      "3 votes, 5 watchers, 5 comments, 1 duplicate linked, priority Low",
    ],
    [
      { duplicateLinks: 2, commentCount: 9, priorityRank: "low", priorityName: "Trivial" },
      "quietly-wanted",
      "9 comments, 2 duplicates linked, priority Trivial",
    ],
    [
      { watchers: 1, votes: 1, commentCount: 1, duplicateLinks: 1, priorityRank: "low", priorityName: null },
      "quietly-wanted",
      "1 duplicate linked, priority unset",
    ],
    [{ blocksOpenCount: 7, inSprint: true }, "holding-others-up", "Blocks 7 open tickets, unassigned"],
    [
      { isBug: true, priorityRank: "low", priorityName: "Trivial", ageDays: 365, assigned: true, inSprint: true },
      "paper-cuts",
      "Trivial-priority bug, open 365 days",
    ],
    [
      { isBug: true, priorityRank: "medium", priorityName: null, ageDays: 91 },
      "paper-cuts",
      "Bug, open 91 days",
    ],
    [
      { release: { name: "2.4", inDays: 30 }, dueInDays: -1 },
      "deadline-exposed",
      "Release 2.4 in 30 days, not in any sprint",
    ],
    [{ dueInDays: 1, release: { name: "v3", inDays: 1 } }, "deadline-exposed", "Due in 1 day, not in any sprint"],
  ];
  for (const [overrides, id, reason] of cases) {
    assert.deepEqual(classify(facts(overrides)), [{ id, label: LABELS[id], reason }], JSON.stringify(overrides));
  }
});

// Extends "[boundary-16] one step below each default threshold gives an empty result".
test("[boundary-16] more built-in near misses give an empty result", () => {
  const cases: Partial<IssueFacts>[] = [
    { ageDays: 200, daysSinceUpdate: 120, inSprint: true },
    { ageDays: 179, daysSinceUpdate: 89 },
    { closedSprintCount: 0, carriedSince: "June" },
    { votes: 100, priorityRank: "high", priorityName: "High" },
    { watchers: 50, commentCount: 50, duplicateLinks: 50, priorityRank: "none" },
    { votes: 2, watchers: 4, commentCount: 4, duplicateLinks: 0, priorityRank: "low", priorityName: "Low" },
    { votes: 0, watchers: 0, commentCount: null, duplicateLinks: 0, priorityRank: "low", priorityName: "Low" },
    { blocksOpenCount: 5, assigned: true },
    { isBug: false, priorityRank: "medium", priorityName: "Medium", ageDays: 500 },
    { isBug: true, priorityRank: "medium", priorityName: "Medium", ageDays: 89 },
    { isBug: true, priorityRank: "high", priorityName: "Blocker", ageDays: 1000 },
    { dueInDays: 31, release: { name: "x", inDays: 31 } },
    { dueInDays: 5, inSprint: true, assigned: true },
    { release: { name: "x", inDays: 5 }, inSprint: true },
    { release: { name: "x", inDays: 5 }, assigned: true },
  ];
  for (const overrides of cases) {
    assert.deepEqual(classify(facts(overrides)), [], JSON.stringify(overrides));
  }
});

// Extends "[happy-15] several matches come back in registry order": five matches at
// once, the other five-match combination, and a reversed registry.
test("[happy-15] five matches come back in registry order", () => {
  const f = facts({
    ageDays: 200,
    daysSinceUpdate: 120,
    votes: 3,
    priorityRank: "low",
    priorityName: "Low",
    blocksOpenCount: 2,
    isBug: true,
    dueInDays: 10,
  });
  assert.deepEqual(classify(f), [
    { id: "left-behind", label: "Left behind", reason: "Open 200 days, never in a sprint, unassigned" },
    { id: "quietly-wanted", label: "Quietly wanted", reason: "3 votes, priority Low" },
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 2 open tickets, unassigned" },
    { id: "paper-cuts", label: "Paper cuts", reason: "Low-priority bug, open 200 days" },
    { id: "deadline-exposed", label: "Deadline exposed", reason: "Due in 10 days, not in any sprint" },
  ]);
});

test("[happy-15] a carried-over ticket matches every category except left behind, in order", () => {
  const f = facts({
    ageDays: 100,
    closedSprintCount: 2,
    carriedSince: "June",
    watchers: 5,
    priorityRank: "low",
    priorityName: "Minor",
    blocksOpenCount: 1,
    isBug: true,
    release: { name: "9.0", inDays: 3 },
  });
  assert.deepEqual(classify(f), [
    { id: "always-next-sprint", label: "Always next sprint", reason: "Carried over 2 sprints since June" },
    { id: "quietly-wanted", label: "Quietly wanted", reason: "5 watchers, priority Minor" },
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 1 open ticket, unassigned" },
    { id: "paper-cuts", label: "Paper cuts", reason: "Minor-priority bug, open 100 days" },
    { id: "deadline-exposed", label: "Deadline exposed", reason: "Release 9.0 in 3 days, not in any sprint" },
  ]);
});

test("[happy-15] matches follow the order of the registry passed in", () => {
  const f = facts({ ageDays: 200, daysSinceUpdate: 120, blocksOpenCount: 1, dueInDays: 0 });
  const reversed = [...CATEGORIES].reverse();
  assert.deepEqual(
    classify(f, {}, reversed).map((m) => m.id),
    ["deadline-exposed", "holding-others-up", "left-behind"],
  );
  const c1 = custom("c1", "One", () => always("one"));
  const c2 = custom("c2", "Two", () => never("two"));
  const c3 = custom("c3", "Three", () => any(always("three a"), always("three b")));
  assert.deepEqual(classify(PLAIN_FACTS, {}, [c3, c2, c1]), [
    { id: "c3", label: "Three", reason: "Three a, three b" },
    { id: "c1", label: "One", reason: "One" },
  ]);
});

test("[happy-15] the reason upper-cases only the first letter and keeps the rest as written", () => {
  const c = custom("mixed", "Mixed", () => all(always("mIxed Case"), always("rest STAYS")));
  assert.deepEqual(classify(PLAIN_FACTS, {}, [c]), [
    { id: "mixed", label: "Mixed", reason: "MIxed Case, rest STAYS" },
  ]);
  const d = custom("digits", "Digits", () => always("3 things"));
  assert.deepEqual(classify(PLAIN_FACTS, {}, [d]), [{ id: "digits", label: "Digits", reason: "3 things" }]);
});

function always(clause: string): Rule {
  return signal(clause, () => true, () => clause);
}

function never(clause: string): Rule {
  return signal(clause, () => false, () => clause);
}

// Extends "[happy-16] a raised threshold still matches at its new value": lowered and
// raised thresholds for every category.
test("[happy-16] lowered thresholds make each category match where the defaults do not", () => {
  const cases: [Partial<IssueFacts>, CategoryConfig, string, string][] = [
    [
      { ageDays: 50, daysSinceUpdate: 10 },
      { "left-behind": { thresholds: { minAgeDays: 30, minQuietDays: 5 } } },
      "left-behind",
      "Open 50 days, never in a sprint, unassigned",
    ],
    [
      { closedSprintCount: 1, carriedSince: "October" },
      { "always-next-sprint": { thresholds: { minSprints: 1 } } },
      "always-next-sprint",
      "Carried over 1 sprint since October",
    ],
    [
      { votes: 1, priorityRank: "low", priorityName: "Low" },
      { "quietly-wanted": { thresholds: { minVotes: 1 } } },
      "quietly-wanted",
      "1 vote, priority Low",
    ],
    [
      { commentCount: 0, priorityRank: "low", priorityName: "Low" },
      { "quietly-wanted": { thresholds: { minComments: 0 } } },
      "quietly-wanted",
      "0 comments, priority Low",
    ],
    [
      { isBug: true, priorityRank: "low", priorityName: "Low", ageDays: 10 },
      { "paper-cuts": { thresholds: { minAgeDays: 10 } } },
      "paper-cuts",
      "Low-priority bug, open 10 days",
    ],
    [
      { dueInDays: 45 },
      { "deadline-exposed": { thresholds: { withinDays: 60 } } },
      "deadline-exposed",
      "Due in 45 days, not in any sprint",
    ],
  ];
  for (const [overrides, config, id, reason] of cases) {
    assert.deepEqual(classify(facts(overrides), config), [{ id, label: LABELS[id], reason }], id);
  }
});

test("[happy-16] raised thresholds and disabled categories remove matches", () => {
  const cases: [Partial<IssueFacts>, CategoryConfig][] = [
    [{ blocksOpenCount: 2 }, { "holding-others-up": { thresholds: { minBlocked: 3 } } }],
    [{ closedSprintCount: 3 }, { "always-next-sprint": { thresholds: { minSprints: 4 } } }],
    [
      { votes: 4, watchers: 6, priorityRank: "low", priorityName: "Low" },
      { "quietly-wanted": { thresholds: { minVotes: 5, minWatchers: 7 } } },
    ],
    [{ dueInDays: 5 }, { "deadline-exposed": { thresholds: { withinDays: 4 } } }],
    [{ dueInDays: 5 }, { "deadline-exposed": { enabled: false } }],
    [
      { isBug: true, priorityRank: "low", priorityName: "Low", ageDays: 100 },
      { "paper-cuts": { thresholds: { minAgeDays: 101 } } },
    ],
    [{ ageDays: 200, daysSinceUpdate: 120 }, { "left-behind": { thresholds: { minQuietDays: 121 } } }],
  ];
  for (const [overrides, config] of cases) {
    assert.deepEqual(classify(facts(overrides), config), [], JSON.stringify(config));
  }
});

test("[happy-16] disabling one of several matches removes only that one", () => {
  const f = facts({ ageDays: 200, daysSinceUpdate: 120, blocksOpenCount: 1, dueInDays: 0 });
  const config: CategoryConfig = { "holding-others-up": { enabled: false } };
  const before = structuredClone(config);
  const fBefore = structuredClone(f);
  assert.deepEqual(classify(f, config), [
    { id: "left-behind", label: "Left behind", reason: "Open 200 days, never in a sprint, unassigned" },
    { id: "deadline-exposed", label: "Deadline exposed", reason: "Due today, not in any sprint" },
  ]);
  assert.deepEqual(config, before);
  assert.deepEqual(f, fBefore);
});

// Extends "[boundary-17] a matched empty all also falls back to the label":
// other silent-only rules, and a matched rule whose one clause is empty.
test("[boundary-17] other matched rules with only silent clauses fall back to the label", () => {
  const cases: Category[] = [
    custom("s1", "Silent pair", () => all(silent(unassigned), silent(notInSprint))),
    custom("s2", "Silent any", () => any(silent(unassigned), silent(bug))),
    custom("s3", "Null describe", () => signal("nd", () => true, () => null)),
  ];
  for (const c of cases) {
    assert.deepEqual(classify(PLAIN_FACTS, {}, [c]), [{ id: c.id, label: c.label, reason: c.label }], c.id);
  }
});

test("[boundary-17] a matched rule whose only clause is empty does not fall back to the label", () => {
  const c = custom("e", "E label", () => signal("e", () => true, () => ""));
  assert.deepEqual(classify(PLAIN_FACTS, {}, [c]), [{ id: "e", label: "E label", reason: "" }]);
});

test("[boundary-17] an unmatched silent-only rule gives no match", () => {
  const c = custom("q", "Q", () => silent(unassigned));
  assert.deepEqual(classify(facts({ assigned: true }), {}, [c]), []);
});

// Extends "[happy-17] rules are built once at creation and disabled rules never".
test("[happy-17] each classifier builds each enabled rule once, with merged and fallback thresholds", () => {
  const a = spyCategory("a", "A", { n: 3, m: 1 }, () => unassigned);
  const b = spyCategory("b", "B", { k: 2 }, () => notInSprint);
  const c = spyCategory("c", "C", { j: 9 }, () => bug);
  const config = {
    a: { thresholds: { n: 7, m: "x" } },
    c: { enabled: false },
  } as unknown as CategoryConfig;
  const k1 = createClassifier(config, [a.category, b.category, c.category]);
  const k2 = createClassifier(config, [a.category, b.category, c.category]);
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(k1(PLAIN_FACTS), [
      { id: "a", label: "A", reason: "Unassigned" },
      { id: "b", label: "B", reason: "Not in any sprint" },
    ]);
    assert.deepEqual(k2(facts({ assigned: true, inSprint: true })), []);
  }
  assert.equal(a.calls.length, 2);
  assert.equal(b.calls.length, 2);
  assert.equal(c.calls.length, 0);
  assert.deepEqual(a.calls[0], { n: 7, m: 1 });
  assert.deepEqual(b.calls[0], { k: 2 });
});

test("[happy-17] a classifier with every category disabled builds no rule and matches nothing", () => {
  const a = spyCategory("a", "A", {}, () => unassigned);
  const b = spyCategory("b", "B", {}, () => unassigned);
  const k = createClassifier({ a: { enabled: false }, b: { enabled: false } }, [a.category, b.category]);
  assert.deepEqual(k(PLAIN_FACTS), []);
  assert.deepEqual(k(PLAIN_FACTS), []);
  assert.equal(a.calls.length, 0);
  assert.equal(b.calls.length, 0);
});

// Extends "[happy-18] one classifier gives the same answers as classify, in any call order":
// a longer alternating sequence, custom registries, and no per-object caching.
test("[happy-18] a long alternating sequence equals classify call for call", () => {
  const k = createClassifier();
  const seq = [
    VARIED_FACTS[1],
    VARIED_FACTS[0],
    VARIED_FACTS[12],
    VARIED_FACTS[9],
    VARIED_FACTS[1],
    VARIED_FACTS[17],
    VARIED_FACTS[0],
    VARIED_FACTS[12],
    VARIED_FACTS[14],
    VARIED_FACTS[6],
  ];
  for (const f of seq) {
    assert.ok(f);
    assert.deepEqual(k(f), classify(f), JSON.stringify(f));
  }
});

test("[happy-18] a configured classifier over a custom registry equals classify with the same arguments", () => {
  const cats: Category[] = [
    custom("old", "Old", (t) => openAtLeast(n(t, "d")), { d: 10 }),
    custom("loud", "Loud", (t) => all(votesAtLeast(n(t, "v")), silent(unassigned)), { v: 2 }),
  ];
  const config: CategoryConfig = { old: { thresholds: { d: 20 } } };
  const k = createClassifier(config, cats);
  for (const f of [facts({ ageDays: 15, votes: 2 }), facts({ ageDays: 25 }), facts({ ageDays: 30, votes: 3, assigned: true })]) {
    assert.deepEqual(k(f), classify(f, config, cats), JSON.stringify(f));
  }
  assert.deepEqual(k(facts({ ageDays: 15, votes: 2 })), [{ id: "loud", label: "Loud", reason: "2 votes" }]);
  assert.deepEqual(k(facts({ ageDays: 25 })), [{ id: "old", label: "Old", reason: "Open 25 days" }]);
});

test("[happy-18] the classifier does not remember earlier answers for the same facts object", () => {
  const k = createClassifier();
  const f: { -readonly [K in keyof IssueFacts]: IssueFacts[K] } = { ...PLAIN_FACTS };
  assert.deepEqual(k(f), []);
  f.blocksOpenCount = 2;
  assert.deepEqual(k(f), [
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 2 open tickets, unassigned" },
  ]);
  f.assigned = true;
  assert.deepEqual(k(f), []);
});

test("[happy-18] a returned result changed by the caller does not affect later calls", () => {
  const k = createClassifier();
  const f = facts({ blocksOpenCount: 1 });
  const first = k(f) as CategoryMatch[];
  first.length = 0;
  assert.deepEqual(k(f), [
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 1 open ticket, unassigned" },
  ]);
});

// Extends "[boundary-18] changing a threshold inside the config after creation does not change the classifier".
test("[boundary-18] adding, deleting and editing config entries after creation changes nothing", () => {
  const config: Record<string, { enabled?: boolean; thresholds?: Record<string, number> }> = {
    "deadline-exposed": { enabled: false },
    "holding-others-up": { enabled: true },
  };
  const k = createClassifier(config);
  config["left-behind"] = { enabled: false };
  delete config["deadline-exposed"];
  const holding = config["holding-others-up"];
  assert.ok(holding);
  holding.enabled = false;
  holding.thresholds = { minBlocked: 50 };
  assert.deepEqual(k(facts({ ageDays: 200, daysSinceUpdate: 120, blocksOpenCount: 1, dueInDays: 3 })), [
    { id: "left-behind", label: "Left behind", reason: "Open 200 days, never in a sprint, unassigned" },
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 1 open ticket, unassigned" },
  ]);
});

test("[boundary-18] lowering a threshold after creation does not make the classifier match", () => {
  const thresholds: Record<string, number> = { minAgeDays: 365 };
  const config = { "left-behind": { thresholds } };
  const k = createClassifier(config);
  thresholds["minAgeDays"] = 1;
  assert.deepEqual(k(facts({ ageDays: 200, daysSinceUpdate: 120 })), []);
});
