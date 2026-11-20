/** The named signals that categories are built from. */

import type { IssueFacts } from "./facts.js";
import type { Signal } from "./rules.js";
import { signal } from "./rules.js";

/** `"{count} {noun}"`, with the noun singular only for exactly 1. */
function count(n: number, singular: string, plural: string = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Passes when the ticket is not assigned; describes "unassigned". */
export const unassigned: Signal = signal(
  "unassigned",
  (facts: IssueFacts): boolean => !facts.assigned,
  (): string | null => "unassigned",
);

/** Passes when the ticket is in no sprint now and was never in a closed one; describes "never in a sprint". */
export const neverInSprint: Signal = signal(
  "never-in-sprint",
  (facts: IssueFacts): boolean => !facts.inSprint && facts.closedSprintCount === 0,
  (): string | null => "never in a sprint",
);

/** Passes when the ticket is in no current sprint; describes "not in any sprint". */
export const notInSprint: Signal = signal(
  "not-in-sprint",
  (facts: IssueFacts): boolean => !facts.inSprint,
  (): string | null => "not in any sprint",
);

/** Passes when the ticket is a bug; describes "{priorityName}-priority bug", or "bug" with no priority. */
export const bug: Signal = signal(
  "bug",
  (facts: IssueFacts): boolean => facts.isBug,
  (facts: IssueFacts): string | null => (facts.priorityName === null ? "bug" : `${facts.priorityName}-priority bug`),
);

/** Id `"open-at-least"`: passes when `ageDays >= days`; describes "open {ageDays} day(s)". */
export function openAtLeast(days: number): Signal {
  return signal(
    "open-at-least",
    (facts) => facts.ageDays >= days,
    (facts) => `open ${count(facts.ageDays, "day")}`,
  );
}

/** Id `"quiet-at-least"`: passes when `daysSinceUpdate >= days`; describes "no update in {daysSinceUpdate} day(s)". */
export function quietAtLeast(days: number): Signal {
  return signal(
    "quiet-at-least",
    (facts) => facts.daysSinceUpdate >= days,
    (facts) => `no update in ${count(facts.daysSinceUpdate, "day")}`,
  );
}

/**
 * Id `"carried-at-least"`: passes when `closedSprintCount >= sprints`;
 * describes "carried over {closedSprintCount} sprint(s)", plus
 * " since {carriedSince}" when `carriedSince` is not null.
 */
export function carriedAtLeast(sprints: number): Signal {
  return signal(
    "carried-at-least",
    (facts) => facts.closedSprintCount >= sprints,
    (facts) =>
      `carried over ${count(facts.closedSprintCount, "sprint")}` +
      (facts.carriedSince === null ? "" : ` since ${facts.carriedSince}`),
  );
}

/** Id `"votes-at-least"`: passes when the votes reach `votes`; describes "{votes} vote(s)". */
export function votesAtLeast(votes: number): Signal {
  return signal(
    "votes-at-least",
    (facts) => facts.votes >= votes,
    (facts) => count(facts.votes, "vote"),
  );
}

/** Id `"watchers-at-least"`: passes when the watchers reach `watchers`; describes "{watchers} watcher(s)". */
export function watchersAtLeast(watchers: number): Signal {
  return signal(
    "watchers-at-least",
    (facts) => facts.watchers >= watchers,
    (facts) => count(facts.watchers, "watcher"),
  );
}

/** Id `"duplicates-at-least"`: passes when `duplicateLinks` reaches `links`; describes "{duplicateLinks} duplicate(s) linked". */
export function duplicatesAtLeast(links: number): Signal {
  return signal(
    "duplicates-at-least",
    (facts) => facts.duplicateLinks >= links,
    (facts) => `${count(facts.duplicateLinks, "duplicate")} linked`,
  );
}

/**
 * Id `"comments-at-least"`: passes when `commentCount` is not null and reaches
 * `comments`; describes "{commentCount} comment(s)".
 */
export function commentsAtLeast(comments: number): Signal {
  return signal(
    "comments-at-least",
    (facts) => facts.commentCount !== null && facts.commentCount >= comments,
    (facts) => count(facts.commentCount ?? 0, "comment"),
  );
}

/** Id `"blocks-at-least"`: passes when `blocksOpenCount` reaches `tickets`; describes "blocks {blocksOpenCount} open ticket(s)". */
export function blocksAtLeast(tickets: number): Signal {
  return signal(
    "blocks-at-least",
    (facts) => facts.blocksOpenCount >= tickets,
    (facts) => `blocks ${count(facts.blocksOpenCount, "open ticket")}`,
  );
}

/**
 * Id `"priority-at-most-{rank}"`: `"low"` passes only rank low, `"medium"`
 * passes low and medium; "high" and "none" never pass. Describes
 * "priority {priorityName}", or "priority unset" when `priorityName` is null.
 */
export function priorityAtMost(rank: "low" | "medium"): Signal {
  return signal(
    `priority-at-most-${rank}`,
    (facts) => facts.priorityRank === "low" || (facts.priorityRank === "medium" && rank === "medium"),
    (facts) => `priority ${facts.priorityName ?? "unset"}`,
  );
}

/** Whether `inDays` is between 0 and `days` ahead, inclusive. */
function within(inDays: number | null | undefined, days: number): inDays is number {
  return inDays !== null && inDays !== undefined && inDays >= 0 && inDays <= days;
}

/** "today" for 0 days, otherwise "in N day(s)". */
function when(inDays: number): string {
  return inDays === 0 ? "today" : `in ${count(inDays, "day")}`;
}

/**
 * Id `"deadline-within"`: passes when the due date or the chosen release is
 * between 0 and `days` ahead, inclusive. Describes "due today" / "due in N
 * day(s)" or "release NAME today" / "release NAME in N day(s)", naming only
 * the sooner when both hold, and the due date on a tie.
 */
export function deadlineWithin(days: number): Signal {
  return signal(
    "deadline-within",
    (facts) => within(facts.dueInDays, days) || within(facts.release?.inDays, days),
    (facts) => {
      const due = within(facts.dueInDays, days) ? facts.dueInDays : null;
      const release = facts.release !== null && within(facts.release.inDays, days) ? facts.release : null;
      if (release !== null && (due === null || release.inDays < due)) {
        return `release ${release.name} ${when(release.inDays)}`;
      }
      return due === null ? null : `due ${when(due)}`;
    },
  );
}
