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

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES: readonly string[] = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** The timestamp of `value`, or `null` when it is missing or unparseable. */
function parseTime(value: string | null): number | null {
  if (value === null) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

/** Whole 24-hour periods from `value` to `now`, rounded down; 0 when unknown or in the future. */
function elapsedDays(value: string | null, now: number): number {
  const time = parseTime(value);
  if (time === null) return 0;
  const days = Math.floor((now - time) / DAY_MS);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

/** The UTC midnight of the calendar date `time` falls on. */
function utcDate(time: number): number {
  return Math.floor(time / DAY_MS) * DAY_MS;
}

/** UTC calendar days from now's date to the date of `value`; `null` when either is unknown. */
function calendarDaysUntil(value: string | null, now: number): number | null {
  const time = parseTime(value);
  if (time === null) return null;
  const days = Math.round((utcDate(time) - utcDate(now)) / DAY_MS);
  return Number.isFinite(days) ? days : null;
}

/** The UTC month of the earliest closed sprint, with its year when that differs from now's. */
function carriedSinceOf(sprints: readonly SelectionClosedSprint[], now: Date): string | null {
  let earliest: number | null = null;
  for (const sprint of sprints) {
    const time = parseTime(sprint.startDate) ?? parseTime(sprint.endDate);
    if (time !== null && (earliest === null || time < earliest)) earliest = time;
  }
  if (earliest === null) return null;
  const date = new Date(earliest);
  const month = MONTH_NAMES[date.getUTCMonth()] as string;
  const year = date.getUTCFullYear();
  return year === now.getUTCFullYear() ? month : `${month} ${year}`;
}

/** The unreleased release with the fewest days ahead (0 or more), the first on a tie. */
function nextRelease(releases: readonly SelectionRelease[], now: number): IssueFacts["release"] {
  let chosen: { readonly name: string; readonly inDays: number } | null = null;
  for (const release of releases) {
    if (release.released) continue;
    const inDays = calendarDaysUntil(release.releaseDate, now);
    if (inDays === null || inDays < 0) continue;
    if (chosen === null || inDays < chosen.inDays) chosen = { name: release.name, inDays };
  }
  return chosen;
}

/** A trimmed priority name, or `null` when it is missing or blank. */
function priorityNameOf(priority: string | null): string | null {
  const name = priority?.trim() ?? "";
  return name === "" ? null : name;
}

function priorityRankOf(name: string | null): PriorityRank {
  if (name === null) return "none";
  const key = name.toLowerCase();
  return Object.hasOwn(PRIORITY_RANKS, key) ? (PRIORITY_RANKS[key] as PriorityRank) : "high";
}

/**
 * The facts of `issue` measured against `now`. Does not validate `now` and
 * does not throw on an invalid Date. Does not mutate `issue`.
 */
export function factsFor(issue: SelectionIssue, now: Date): IssueFacts {
  const nowTime = now.getTime();
  const priorityName = priorityNameOf(issue.priority);
  let blocksOpenCount = 0;
  let duplicateLinks = 0;
  for (const link of issue.links) {
    const type = link.type.toLowerCase();
    if (link.direction === "outward" && type.includes("block") && link.statusCategory !== "done") {
      blocksOpenCount++;
    }
    if (link.direction === "inward" && type.includes("duplicate")) duplicateLinks++;
  }
  return {
    ageDays: elapsedDays(issue.created, nowTime),
    daysSinceUpdate: elapsedDays(issue.updated, nowTime),
    assigned: issue.assignee !== null,
    inSprint: issue.sprint !== null && issue.sprint.state !== "closed",
    closedSprintCount: issue.closedSprints.length,
    carriedSince: carriedSinceOf(issue.closedSprints, now),
    votes: issue.votes ?? 0,
    watchers: issue.watchers ?? 0,
    duplicateLinks,
    blocksOpenCount,
    commentCount: issue.commentCount ?? null,
    priorityName,
    priorityRank: priorityRankOf(priorityName),
    isBug: BUG_ISSUE_TYPES.includes(issue.issueType.trim().toLowerCase()),
    dueInDays: calendarDaysUntil(issue.dueDate, nowTime),
    release: nextRelease(issue.releases, nowTime),
  };
}
