/**
 * The registry of outsourcing categories, the merge of board overrides
 * (`resolveCategories`) and the classifier.
 */

import type { IssueFacts } from "./facts.js";
import type { Rule } from "./rules.js";
import { all, any, evaluate, silent } from "./rules.js";
import {
  blocksAtLeast,
  bug,
  carriedAtLeast,
  commentsAtLeast,
  deadlineWithin,
  duplicatesAtLeast,
  neverInSprint,
  notInSprint,
  openAtLeast,
  priorityAtMost,
  quietAtLeast,
  unassigned,
  votesAtLeast,
  watchersAtLeast,
} from "./signals.js";

/** Named numeric thresholds a category's rule is built from. */
export type Thresholds = Readonly<Record<string, number>>;

/** An outsourcing category: its default thresholds and how to build its rule from thresholds. */
export interface Category {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly defaults: Thresholds;
  readonly rule: (thresholds: Thresholds) => Rule;
}

/** The threshold named `key`; a missing one is `NaN`, which no signal passes. */
function at(thresholds: Thresholds, key: string): number {
  return thresholds[key] ?? Number.NaN;
}

/** The six built-in categories, in registry order. */
export const CATEGORIES: readonly Category[] = [
  {
    id: "left-behind",
    label: "Left behind",
    why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
    defaults: { minAgeDays: 180, minQuietDays: 90 },
    rule: (t: Thresholds): Rule =>
      all(openAtLeast(at(t, "minAgeDays")), neverInSprint, unassigned, silent(quietAtLeast(at(t, "minQuietDays")))),
  },
  {
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Already planned and wanted; the only blocker is capacity.",
    defaults: { minSprints: 2 },
    rule: (t: Thresholds): Rule => carriedAtLeast(at(t, "minSprints")),
  },
  {
    id: "quietly-wanted",
    label: "Quietly wanted",
    why: "Shows demand that the priority field hides, which justifies a higher bounty.",
    defaults: { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 },
    rule: (t: Thresholds): Rule =>
      all(
        any(
          votesAtLeast(at(t, "minVotes")),
          watchersAtLeast(at(t, "minWatchers")),
          commentsAtLeast(at(t, "minComments")),
          duplicatesAtLeast(at(t, "minDuplicates")),
        ),
        priorityAtMost("low"),
      ),
  },
  {
    id: "holding-others-up",
    label: "Holding others up",
    why: "One bounty unblocks several tickets the team will do in-house.",
    defaults: { minBlocked: 1 },
    rule: (t: Thresholds): Rule =>
      all(blocksAtLeast(at(t, "minBlocked")), unassigned),
  },
  {
    id: "paper-cuts",
    label: "Paper cuts",
    why: "Small, self-contained bugs are what agents fix most reliably, and users notice when they're gone.",
    defaults: { minAgeDays: 90 },
    rule: (t: Thresholds): Rule =>
      all(bug, silent(priorityAtMost("medium")), openAtLeast(at(t, "minAgeDays"))),
  },
  {
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "The deadline justifies paying now rather than waiting for capacity.",
    defaults: { withinDays: 30 },
    rule: (t: Thresholds): Rule =>
      all(deadlineWithin(at(t, "withinDays")), silent(unassigned), notInSprint),
  },
];

/** The bucket a caller files a ticket under when it fits no category; never a category id. */
export const UNCATEGORIZED = "uncategorized";

/** A board's override for one category. */
export interface CategorySettings {
  readonly enabled?: boolean | undefined;
  readonly thresholds?: Readonly<Record<string, number | null | undefined>> | undefined;
}

/** A board's overrides, by category id. */
export type CategoryConfig = Readonly<Record<string, CategorySettings | undefined>>;

/** A category with the board's overrides merged in. */
export interface ResolvedCategory {
  readonly id: string;
  readonly label: string;
  readonly why: string;
  readonly enabled: boolean;
  readonly thresholds: Thresholds;
}

/** One category a ticket fits, with the reason it was picked. */
export interface CategoryMatch {
  readonly id: string;
  readonly label: string;
  readonly reason: string;
}

/** The defaults, each replaced by the override for the same key when that is a finite number. */
function mergeThresholds(defaults: Thresholds, overrides: CategorySettings["thresholds"]): Thresholds {
  const merged: Record<string, number> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const override = overrides !== undefined && Object.hasOwn(overrides, key) ? overrides[key] : undefined;
    merged[key] = typeof override === "number" && Number.isFinite(override) ? override : fallback;
  }
  return merged;
}

/**
 * One entry per category in registry order, merged with the board's
 * overrides. Invalid, removed and unknown overrides fall back or are dropped
 * without an error.
 */
export function resolveCategories(config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): ResolvedCategory[] {
  return categories.map((category) => {
    const settings = Object.hasOwn(config, category.id) ? config[category.id] : undefined;
    return {
      id: category.id,
      label: category.label,
      why: category.why,
      enabled: settings?.enabled !== false,
      thresholds: mergeThresholds(category.defaults, settings?.thresholds),
    };
  });
}

/** The clauses joined with ", " and the first letter upper-cased, or `label` when there are none. */
function reasonFor(clauses: readonly string[], label: string): string {
  if (clauses.length === 0) return label;
  const joined = clauses.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Resolves the config and builds each enabled category's rule once, now; the
 * returned function gives one match per enabled category whose rule matches,
 * in registry order, and keeps no state between calls.
 */
export function createClassifier(config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): (facts: IssueFacts) => CategoryMatch[] {
  const resolved = resolveCategories(config, categories);
  const built: { readonly id: string; readonly label: string; readonly rule: Rule }[] = [];
  categories.forEach((category, index) => {
    const entry = resolved[index] as ResolvedCategory;
    if (entry.enabled) built.push({ id: entry.id, label: entry.label, rule: category.rule(entry.thresholds) });
  });
  return (facts: IssueFacts): CategoryMatch[] => {
    const matches: CategoryMatch[] = [];
    for (const { id, label, rule } of built) {
      const { matched, clauses } = evaluate(rule, facts);
      if (matched) matches.push({ id, label, reason: reasonFor(clauses, label) });
    }
    return matches;
  };
}

/** The categories `facts` fits; equals `createClassifier(config, categories)(facts)`. */
export function classify(facts: IssueFacts, config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): CategoryMatch[] {
  return createClassifier(config, categories)(facts);
}
