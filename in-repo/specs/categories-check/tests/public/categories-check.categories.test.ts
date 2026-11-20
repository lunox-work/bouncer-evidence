import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CATEGORIES,
  UNCATEGORIZED,
  all,
  classify,
  createClassifier,
  openAtLeast,
  resolveCategories,
  silent,
  unassigned,
  type Category,
  type CategoryConfig,
  type CategoryMatch,
  type IssueFacts,
  type ResolvedCategory,
  type Rule,
  type Thresholds,
} from "../src/selection/index.js";

/**
 * The category registry, the merge of board overrides and the classifier.
 * Every facts value is the spec's "plain facts" with the listed fields
 * changed.
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

function entry(resolved: readonly ResolvedCategory[], id: string): ResolvedCategory {
  const found = resolved.find((c) => c.id === id);
  assert.ok(found, `no entry for ${id}`);
  return found;
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

test("[happy-11] the registry holds six categories in the documented order", () => {
  assert.deepEqual(CATEGORIES.map((c) => c.id), IDS);
  assert.deepEqual(CATEGORIES.map((c) => c.label), [
    "Left behind",
    "Always next sprint",
    "Quietly wanted",
    "Holding others up",
    "Paper cuts",
    "Deadline exposed",
  ]);
  assert.deepEqual(CATEGORIES.find((c) => c.id === "quietly-wanted")?.defaults, {
    minVotes: 3,
    minWatchers: 5,
    minDuplicates: 1,
    minComments: 5,
  });
  assert.equal(UNCATEGORIZED, "uncategorized");
  assert.ok(!CATEGORIES.some((c) => c.id === "uncategorized"));
});

test("[happy-11] every registry entry has its documented why text and defaults", () => {
  assert.equal(CATEGORIES.length, 6);
  for (const category of CATEGORIES) {
    assert.equal(category.why, WHY[category.id], category.id);
    assert.deepEqual(category.defaults, DEFAULTS[category.id], category.id);
  }
});

test("[happy-12] no config resolves to the defaults, all enabled, in registry order", () => {
  const resolved = resolveCategories();
  assert.equal(resolved.length, 6);
  assert.deepEqual(resolved.map((c) => c.id), IDS);
  for (const [i, c] of resolved.entries()) {
    assert.equal(c.enabled, true, c.id);
    assert.deepEqual(c.thresholds, CATEGORIES[i]?.defaults, c.id);
  }
  assert.deepEqual(entry(resolved, "left-behind"), {
    id: "left-behind",
    label: "Left behind",
    why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
    enabled: true,
    thresholds: { minAgeDays: 180, minQuietDays: 90 },
  });
});

test("[happy-12] an empty config resolves the same as no config, with each label and why", () => {
  const resolved = resolveCategories({});
  assert.deepEqual(resolved, resolveCategories());
  for (const [i, c] of resolved.entries()) {
    assert.equal(c.label, CATEGORIES[i]?.label);
    assert.equal(c.why, CATEGORIES[i]?.why);
  }
});

test("[happy-13] overrides merge threshold by threshold", () => {
  const resolved = resolveCategories({
    "left-behind": { thresholds: { minAgeDays: 365 } },
    "paper-cuts": { enabled: false },
    "quietly-wanted": { enabled: true, thresholds: { minVotes: 0, minWatchers: -2 } },
  });
  assert.deepEqual(resolved.map((c) => c.id), IDS);
  const leftBehind = entry(resolved, "left-behind");
  assert.equal(leftBehind.enabled, true);
  assert.deepEqual(leftBehind.thresholds, { minAgeDays: 365, minQuietDays: 90 });
  const paperCuts = entry(resolved, "paper-cuts");
  assert.equal(paperCuts.enabled, false);
  assert.deepEqual(paperCuts.thresholds, { minAgeDays: 90 });
  assert.deepEqual(entry(resolved, "quietly-wanted").thresholds, {
    minVotes: 0,
    minWatchers: -2,
    minComments: 5,
    minDuplicates: 1,
  });
});

test("[happy-13] zero, fractional and negative overrides are accepted and other categories keep their defaults", () => {
  const resolved = resolveCategories({
    "left-behind": { thresholds: { minAgeDays: 0, minQuietDays: -1.5 } },
  });
  assert.deepEqual(entry(resolved, "left-behind").thresholds, { minAgeDays: 0, minQuietDays: -1.5 });
  assert.deepEqual(entry(resolved, "paper-cuts"), {
    id: "paper-cuts",
    label: "Paper cuts",
    why: WHY["paper-cuts"],
    enabled: true,
    thresholds: { minAgeDays: 90 },
  });
});

test("[unhappy-6] invalid, removed and unknown overrides fall back or are dropped without an error", () => {
  const config = {
    "left-behind": { thresholds: { minAgeDays: null, minQuietDays: NaN, colour: 7 } },
    "holding-others-up": { enabled: undefined, thresholds: { minBlocked: Infinity } },
    "deadline-exposed": { thresholds: { withinDays: "10" } },
    "always-next-sprint": undefined,
    "made-up": { enabled: false, thresholds: { x: 1 } },
    uncategorized: { enabled: true },
  } as unknown as CategoryConfig;
  let resolved: ResolvedCategory[] = [];
  assert.doesNotThrow(() => {
    resolved = resolveCategories(config);
  });
  assert.deepEqual(resolved.map((c) => c.id), IDS);
  const leftBehind = entry(resolved, "left-behind");
  assert.deepEqual(leftBehind.thresholds, { minAgeDays: 180, minQuietDays: 90 });
  assert.ok(!("colour" in leftBehind.thresholds));
  const holding = entry(resolved, "holding-others-up");
  assert.equal(holding.enabled, true);
  assert.deepEqual(holding.thresholds, { minBlocked: 1 });
  assert.deepEqual(entry(resolved, "deadline-exposed").thresholds, { withinDays: 30 });
  const always = entry(resolved, "always-next-sprint");
  assert.equal(always.enabled, true);
  assert.deepEqual(always.thresholds, { minSprints: 2 });
  assert.ok(!resolved.some((c) => c.id === "made-up" || c.id === "uncategorized"));
});

test("[unhappy-6] a negative infinite override falls back and the config is not mutated", () => {
  const config: CategoryConfig = {
    "paper-cuts": { thresholds: { minAgeDays: -Infinity } },
    "always-next-sprint": { thresholds: { minSprints: undefined } },
  };
  const before = structuredClone(config);
  const resolved = resolveCategories(config);
  assert.deepEqual(entry(resolved, "paper-cuts").thresholds, { minAgeDays: 90 });
  assert.deepEqual(entry(resolved, "always-next-sprint").thresholds, { minSprints: 2 });
  assert.deepEqual(config, before);
});

test("[boundary-15] a custom registry replaces the built-in one", () => {
  const custom: Category = {
    id: "c",
    label: "C",
    why: "W",
    defaults: { n: 1 },
    rule: (t) => openAtLeast(t.n ?? NaN),
  };
  assert.deepEqual(resolveCategories({ c: { thresholds: { n: 4 } } }, [custom]), [
    { id: "c", label: "C", why: "W", enabled: true, thresholds: { n: 4 } },
  ]);
});

test("[boundary-15] an empty registry resolves to nothing and built-in ids are ignored by a custom one", () => {
  assert.deepEqual(resolveCategories({ "left-behind": { enabled: false } }, []), []);
  const custom: Category = {
    id: "c",
    label: "C",
    why: "W",
    defaults: { n: 1 },
    rule: (t) => openAtLeast(t.n ?? NaN),
  };
  assert.deepEqual(
    resolveCategories({ "left-behind": { thresholds: { minAgeDays: 1 } } }, [custom]),
    [{ id: "c", label: "C", why: "W", enabled: true, thresholds: { n: 1 } }],
  );
});

test("[happy-14] each built-in category matches with its default thresholds and reason", () => {
  const cases: [Partial<IssueFacts>, string, string, string][] = [
    [{ ageDays: 200, daysSinceUpdate: 120 }, "left-behind", "Left behind", "Open 200 days, never in a sprint, unassigned"],
    [
      { closedSprintCount: 3, carriedSince: "June", inSprint: true },
      "always-next-sprint",
      "Always next sprint",
      "Carried over 3 sprints since June",
    ],
    [
      { votes: 4, watchers: 6, priorityRank: "low", priorityName: "Minor" },
      "quietly-wanted",
      "Quietly wanted",
      "4 votes, 6 watchers, priority Minor",
    ],
    [{ blocksOpenCount: 2 }, "holding-others-up", "Holding others up", "Blocks 2 open tickets, unassigned"],
    [
      { isBug: true, priorityRank: "medium", priorityName: "Medium", ageDays: 100 },
      "paper-cuts",
      "Paper cuts",
      "Medium-priority bug, open 100 days",
    ],
    [{ dueInDays: 5 }, "deadline-exposed", "Deadline exposed", "Due in 5 days, not in any sprint"],
  ];
  for (const [overrides, id, label, reason] of cases) {
    assert.deepEqual(classify(facts(overrides)), [{ id, label, reason }], id);
  }
});

test("[happy-14] each built-in category matches exactly at its default thresholds", () => {
  const cases: [Partial<IssueFacts>, string, string, string][] = [
    [{ ageDays: 180, daysSinceUpdate: 90 }, "left-behind", "Left behind", "Open 180 days, never in a sprint, unassigned"],
    [
      { closedSprintCount: 2, carriedSince: null },
      "always-next-sprint",
      "Always next sprint",
      "Carried over 2 sprints",
    ],
    [
      { duplicateLinks: 1, priorityRank: "low", priorityName: "Low" },
      "quietly-wanted",
      "Quietly wanted",
      "1 duplicate linked, priority Low",
    ],
    [
      { commentCount: 5, priorityRank: "low", priorityName: "Minor" },
      "quietly-wanted",
      "Quietly wanted",
      "5 comments, priority Minor",
    ],
    [{ blocksOpenCount: 1 }, "holding-others-up", "Holding others up", "Blocks 1 open ticket, unassigned"],
    [
      { isBug: true, priorityRank: "low", priorityName: "Low", ageDays: 90 },
      "paper-cuts",
      "Paper cuts",
      "Low-priority bug, open 90 days",
    ],
    [{ dueInDays: 30 }, "deadline-exposed", "Deadline exposed", "Due in 30 days, not in any sprint"],
    [
      { release: { name: "2.4", inDays: 0 } },
      "deadline-exposed",
      "Deadline exposed",
      "Release 2.4 today, not in any sprint",
    ],
  ];
  for (const [overrides, id, label, reason] of cases) {
    assert.deepEqual(classify(facts(overrides)), [{ id, label, reason }], JSON.stringify(overrides));
  }
});

test("[boundary-16] built-in categories that do not match give an empty result", () => {
  const cases: Partial<IssueFacts>[] = [
    {},
    { ageDays: 200, daysSinceUpdate: 89 },
    { ageDays: 200, daysSinceUpdate: 120, closedSprintCount: 1, carriedSince: null },
    { ageDays: 200, daysSinceUpdate: 120, assigned: true },
    { closedSprintCount: 1 },
    { votes: 10, priorityRank: "medium", priorityName: "Medium" },
    { votes: 10, priorityRank: "none" },
    { votes: 2, watchers: 4, commentCount: 4, priorityRank: "low", priorityName: "Low" },
    { blocksOpenCount: 2, assigned: true },
    { isBug: true, priorityRank: "high", priorityName: "High", ageDays: 100 },
    { isBug: true, priorityRank: "none", ageDays: 100 },
    { isBug: true, priorityRank: "low", priorityName: "Low", ageDays: 89 },
    { dueInDays: -2 },
    { dueInDays: 5, inSprint: true },
    { dueInDays: 5, assigned: true },
  ];
  for (const overrides of cases) {
    assert.deepEqual(classify(facts(overrides)), [], JSON.stringify(overrides));
  }
});

test("[boundary-16] one step below each default threshold gives an empty result", () => {
  const cases: Partial<IssueFacts>[] = [
    { ageDays: 179, daysSinceUpdate: 120 },
    { dueInDays: 31 },
    { release: { name: "2.4", inDays: 31 } },
    { release: { name: "2.4", inDays: -1 } },
    { votes: 2, watchers: 4, commentCount: null, duplicateLinks: 0, priorityRank: "low", priorityName: "Low" },
    { blocksOpenCount: 0 },
    { isBug: false, priorityRank: "low", priorityName: "Low", ageDays: 100 },
  ];
  for (const overrides of cases) {
    assert.deepEqual(classify(facts(overrides)), [], JSON.stringify(overrides));
  }
});

test("[happy-15] several matches come back in registry order", () => {
  const result = classify(
    facts({ ageDays: 200, daysSinceUpdate: 120, blocksOpenCount: 1, dueInDays: 0 }),
  );
  assert.deepEqual(result, [
    { id: "left-behind", label: "Left behind", reason: "Open 200 days, never in a sprint, unassigned" },
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 1 open ticket, unassigned" },
    { id: "deadline-exposed", label: "Deadline exposed", reason: "Due today, not in any sprint" },
  ]);
});

test("[happy-15] a bug with low priority and demand fits both quietly wanted and paper cuts, in order", () => {
  const result = classify(
    facts({ isBug: true, priorityRank: "low", priorityName: "Low", ageDays: 100, votes: 3 }),
  );
  assert.deepEqual(result, [
    { id: "quietly-wanted", label: "Quietly wanted", reason: "3 votes, priority Low" },
    { id: "paper-cuts", label: "Paper cuts", reason: "Low-priority bug, open 100 days" },
  ]);
});

test("[happy-16] board overrides change what matches", () => {
  const result = classify(facts({ ageDays: 200, daysSinceUpdate: 120, blocksOpenCount: 1 }), {
    "left-behind": { thresholds: { minAgeDays: 365 } },
    "holding-others-up": { enabled: false },
  });
  assert.deepEqual(result, []);
});

test("[happy-16] a raised threshold still matches at its new value", () => {
  const result = classify(facts({ ageDays: 365, daysSinceUpdate: 120, blocksOpenCount: 1 }), {
    "left-behind": { thresholds: { minAgeDays: 365 } },
    "holding-others-up": { enabled: false },
  });
  assert.deepEqual(result, [
    { id: "left-behind", label: "Left behind", reason: "Open 365 days, never in a sprint, unassigned" },
  ]);
});

test("[boundary-17] a matched rule with only silent clauses falls back to the label", () => {
  const custom: Category = {
    id: "q",
    label: "Q",
    why: "Just because.",
    defaults: {},
    rule: () => silent(unassigned),
  };
  assert.deepEqual(classify(PLAIN_FACTS, {}, [custom]), [{ id: "q", label: "Q", reason: "Q" }]);
});

test("[boundary-17] a matched empty all also falls back to the label", () => {
  const custom: Category = {
    id: "q",
    label: "Q",
    why: "Just because.",
    defaults: {},
    rule: () => all(),
  };
  assert.deepEqual(classify(facts({ assigned: true }), {}, [custom]), [
    { id: "q", label: "Q", reason: "Q" },
  ]);
});

test("[happy-17] rules are built once at creation and disabled rules never", () => {
  const a = spyCategory("a", "A label", { n: 3 }, () => unassigned);
  const b = spyCategory("b", "B label", { m: 4 }, () => unassigned);
  const k = createClassifier({ b: { enabled: false } }, [a.category, b.category]);
  const results: CategoryMatch[][] = [k(PLAIN_FACTS), k(PLAIN_FACTS), k(PLAIN_FACTS)];
  assert.equal(a.calls.length, 1);
  assert.deepEqual(a.calls[0], { n: 3 });
  assert.equal(b.calls.length, 0);
  for (const result of results) {
    assert.deepEqual(result, [{ id: "a", label: "A label", reason: "Unassigned" }]);
  }
});

test("[happy-17] the rule is built at creation, before any call, with the merged thresholds", () => {
  const a = spyCategory("a", "A label", { n: 3, m: 1 }, () => unassigned);
  createClassifier({ a: { thresholds: { n: 7 } } }, [a.category]);
  assert.equal(a.calls.length, 1);
  assert.deepEqual(a.calls[0], { n: 7, m: 1 });
});

test("[happy-18] one classifier gives the same answers as classify, in any call order", () => {
  const k = createClassifier();
  const f1 = facts({ blocksOpenCount: 2 });
  const f2 = facts();
  assert.deepEqual([k(f1), k(f2), k(f1)], [classify(f1), classify(f2), classify(f1)]);
  assert.deepEqual(k(f1), [
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 2 open tickets, unassigned" },
  ]);
  assert.deepEqual(k(f2), []);
});

test("[happy-18] a configured classifier equals classify with the same config", () => {
  const config: CategoryConfig = { "holding-others-up": { enabled: false } };
  const k = createClassifier(config);
  const f1 = facts({ blocksOpenCount: 2, dueInDays: 3 });
  assert.deepEqual(k(f1), classify(f1, config));
  assert.deepEqual(k(f1), [
    { id: "deadline-exposed", label: "Deadline exposed", reason: "Due in 3 days, not in any sprint" },
  ]);
});

test("[boundary-18] changing a config object after creation does not change the classifier", () => {
  const config: Record<string, { enabled?: boolean }> = { "holding-others-up": { enabled: true } };
  const k = createClassifier(config);
  config["holding-others-up"] = { enabled: false };
  assert.deepEqual(k(facts({ blocksOpenCount: 1 })), [
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 1 open ticket, unassigned" },
  ]);
});

test("[boundary-18] changing a threshold inside the config after creation does not change the classifier", () => {
  const thresholds: Record<string, number> = { minBlocked: 1 };
  const k = createClassifier({ "holding-others-up": { thresholds } });
  thresholds["minBlocked"] = 5;
  assert.deepEqual(k(facts({ blocksOpenCount: 1 })), [
    { id: "holding-others-up", label: "Holding others up", reason: "Blocks 1 open ticket, unassigned" },
  ]);
});
