/** The named signals that categories are built from. */

import type { IssueFacts } from "./facts.js";
import type { Signal } from "./rules.js";

/** Passes when the ticket is not assigned; describes "unassigned". */
export const unassigned: Signal = {
  id: "unassigned",
  test: (_facts: IssueFacts): boolean => {
    throw new Error("not implemented");
  },
  describe: (_facts: IssueFacts): string | null => {
    throw new Error("not implemented");
  },
};

/** Passes when the ticket is in no sprint now and was never in a closed one; describes "never in a sprint". */
export const neverInSprint: Signal = {
  id: "never-in-sprint",
  test: (_facts: IssueFacts): boolean => {
    throw new Error("not implemented");
  },
  describe: (_facts: IssueFacts): string | null => {
    throw new Error("not implemented");
  },
};

/** Passes when the ticket is in no current sprint; describes "not in any sprint". */
export const notInSprint: Signal = {
  id: "not-in-sprint",
  test: (_facts: IssueFacts): boolean => {
    throw new Error("not implemented");
  },
  describe: (_facts: IssueFacts): string | null => {
    throw new Error("not implemented");
  },
};

/** Passes when the ticket is a bug; describes "{priorityName}-priority bug", or "bug" with no priority. */
export const bug: Signal = {
  id: "bug",
  test: (_facts: IssueFacts): boolean => {
    throw new Error("not implemented");
  },
  describe: (_facts: IssueFacts): string | null => {
    throw new Error("not implemented");
  },
};

/** Id `"open-at-least"`: passes when `ageDays >= days`; describes "open {ageDays} day(s)". */
export function openAtLeast(_days: number): Signal {
  throw new Error("not implemented");
}

/** Id `"quiet-at-least"`: passes when `daysSinceUpdate >= days`; describes "no update in {daysSinceUpdate} day(s)". */
export function quietAtLeast(_days: number): Signal {
  throw new Error("not implemented");
}

/**
 * Id `"carried-at-least"`: passes when `closedSprintCount >= sprints`;
 * describes "carried over {closedSprintCount} sprint(s)", plus
 * " since {carriedSince}" when `carriedSince` is not null.
 */
export function carriedAtLeast(_sprints: number): Signal {
  throw new Error("not implemented");
}

/** Id `"votes-at-least"`: passes when the votes reach `votes`; describes "{votes} vote(s)". */
export function votesAtLeast(_votes: number): Signal {
  throw new Error("not implemented");
}

/** Id `"watchers-at-least"`: passes when the watchers reach `watchers`; describes "{watchers} watcher(s)". */
export function watchersAtLeast(_watchers: number): Signal {
  throw new Error("not implemented");
}

/** Id `"duplicates-at-least"`: passes when `duplicateLinks` reaches `links`; describes "{duplicateLinks} duplicate(s) linked". */
export function duplicatesAtLeast(_links: number): Signal {
  throw new Error("not implemented");
}

/**
 * Id `"comments-at-least"`: passes when `commentCount` is not null and reaches
 * `comments`; describes "{commentCount} comment(s)".
 */
export function commentsAtLeast(_comments: number): Signal {
  throw new Error("not implemented");
}

/** Id `"blocks-at-least"`: passes when `blocksOpenCount` reaches `tickets`; describes "blocks {blocksOpenCount} open ticket(s)". */
export function blocksAtLeast(_tickets: number): Signal {
  throw new Error("not implemented");
}

/**
 * Id `"priority-at-most-{rank}"`: `"low"` passes only rank low, `"medium"`
 * passes low and medium; "high" and "none" never pass. Describes
 * "priority {priorityName}", or "priority unset" when `priorityName` is null.
 */
export function priorityAtMost(_rank: "low" | "medium"): Signal {
  throw new Error("not implemented");
}

/**
 * Id `"deadline-within"`: passes when the due date or the chosen release is
 * between 0 and `days` ahead, inclusive. Describes "due today" / "due in N
 * day(s)" or "release NAME today" / "release NAME in N day(s)", naming only
 * the sooner when both hold, and the due date on a tie.
 */
export function deadlineWithin(_days: number): Signal {
  throw new Error("not implemented");
}
