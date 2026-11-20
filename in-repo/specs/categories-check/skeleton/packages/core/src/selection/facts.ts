/**
 * Turns a ticket as read from the tracker into plain numbers and flags,
 * measured against a `now` the caller passes in. Reads no clock.
 */

/** One issue link as read from the tracker. */
export interface SelectionLink {
  readonly type: string;
  readonly direction: "inward" | "outward";
  readonly statusCategory: string;
}

/** A closed sprint the ticket was carried through. */
export interface SelectionClosedSprint {
  readonly startDate: string | null;
  readonly endDate: string | null;
}

/** A release (fix version) the ticket is attached to. */
export interface SelectionRelease {
  readonly name: string;
  readonly releaseDate: string | null;
  readonly released: boolean;
}

/** A ticket as read from the tracker. */
export interface SelectionIssue {
  readonly assignee: string | null;
  readonly priority: string | null;
  readonly issueType: string;
  readonly created: string | null;
  readonly updated: string | null;
  readonly dueDate: string | null;
  readonly sprint: { readonly state: string } | null;
  readonly closedSprints: readonly SelectionClosedSprint[];
  readonly votes: number | null;
  readonly watchers: number | null;
  readonly commentCount?: number | null;
  readonly links: readonly SelectionLink[];
  readonly releases: readonly SelectionRelease[];
}

/** Where a priority name ranks; `"none"` for a missing or blank priority. */
export type PriorityRank = "low" | "medium" | "high" | "none";

/** A ticket reduced to plain numbers and flags, measured against `now`. */
export interface IssueFacts {
  readonly ageDays: number;
  readonly daysSinceUpdate: number;
  readonly assigned: boolean;
  readonly inSprint: boolean;
  readonly closedSprintCount: number;
  readonly carriedSince: string | null;
  readonly votes: number;
  readonly watchers: number;
  readonly duplicateLinks: number;
  readonly blocksOpenCount: number;
  readonly commentCount: number | null;
  readonly priorityName: string | null;
  readonly priorityRank: PriorityRank;
  readonly isBug: boolean;
  readonly dueInDays: number | null;
  readonly release: { readonly name: string; readonly inDays: number } | null;
}

/**
 * Lower-cased priority names that rank low or medium. Any other non-blank
 * priority name ranks `"high"`.
 */
export const PRIORITY_RANKS: Readonly<Record<string, PriorityRank>> = {
  lowest: "low", trivial: "low", low: "low", minor: "low",
  medium: "medium", normal: "medium",
};

/** Trimmed, lower-cased issue types that count as a bug. */
export const BUG_ISSUE_TYPES: readonly string[] = ["bug", "defect"];

/**
 * The facts of `issue` measured against `now`. Does not validate `now` and
 * does not throw on an invalid Date. Does not mutate `issue`.
 */
export function factsFor(_issue: SelectionIssue, _now: Date): IssueFacts {
  throw new Error("not implemented");
}
