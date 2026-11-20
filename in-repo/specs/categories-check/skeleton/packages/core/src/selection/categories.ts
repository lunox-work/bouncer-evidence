/**
 * The registry of outsourcing categories, the merge of board overrides
 * (`resolveCategories`) and the classifier.
 */

import type { IssueFacts } from "./facts.js";
import type { Rule } from "./rules.js";

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

/** The six built-in categories, in registry order. */
export const CATEGORIES: readonly Category[] = [
  {
    id: "left-behind",
    label: "Left behind",
    why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.",
    defaults: { minAgeDays: 180, minQuietDays: 90 },
    rule: (_thresholds: Thresholds): Rule => {
      throw new Error("not implemented");
    },
  },
  {
    id: "always-next-sprint",
    label: "Always next sprint",
    why: "Already planned and wanted; the only blocker is capacity.",
    defaults: { minSprints: 2 },
    rule: (_thresholds: Thresholds): Rule => {
      throw new Error("not implemented");
    },
  },
  {
    id: "quietly-wanted",
    label: "Quietly wanted",
    why: "Shows demand that the priority field hides, which justifies a higher bounty.",
    defaults: { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 },
    rule: (_thresholds: Thresholds): Rule => {
      throw new Error("not implemented");
    },
  },
  {
    id: "holding-others-up",
    label: "Holding others up",
    why: "One bounty unblocks several tickets the team will do in-house.",
    defaults: { minBlocked: 1 },
    rule: (_thresholds: Thresholds): Rule => {
      throw new Error("not implemented");
    },
  },
  {
    id: "paper-cuts",
    label: "Paper cuts",
    why: "Small, self-contained bugs are what agents fix most reliably, and users notice when they're gone.",
    defaults: { minAgeDays: 90 },
    rule: (_thresholds: Thresholds): Rule => {
      throw new Error("not implemented");
    },
  },
  {
    id: "deadline-exposed",
    label: "Deadline exposed",
    why: "The deadline justifies paying now rather than waiting for capacity.",
    defaults: { withinDays: 30 },
    rule: (_thresholds: Thresholds): Rule => {
      throw new Error("not implemented");
    },
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

/**
 * One entry per category in registry order, merged with the board's
 * overrides. Invalid, removed and unknown overrides fall back or are dropped
 * without an error.
 */
export function resolveCategories(_config: CategoryConfig = {}, _categories: readonly Category[] = CATEGORIES): ResolvedCategory[] {
  throw new Error("not implemented");
}

/**
 * Resolves the config and builds each enabled category's rule once, now; the
 * returned function gives one match per enabled category whose rule matches,
 * in registry order, and keeps no state between calls.
 */
export function createClassifier(_config: CategoryConfig = {}, _categories: readonly Category[] = CATEGORIES): (facts: IssueFacts) => CategoryMatch[] {
  throw new Error("not implemented");
}

/** The categories `facts` fits; equals `createClassifier(config, categories)(facts)`. */
export function classify(_facts: IssueFacts, _config: CategoryConfig = {}, _categories: readonly Category[] = CATEGORIES): CategoryMatch[] {
  throw new Error("not implemented");
}
