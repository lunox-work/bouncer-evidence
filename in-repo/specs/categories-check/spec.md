# Outsourcing categories: facts, rules, signals and the category registry

A backlog run used to take the ten oldest tickets. Now it reads the whole
board and sizes every open ticket that fits at least one outsourcing
category, and it records why each one was picked. This spec covers only the
pure, dependency-free part of that change. It lives in the new folder
`packages/core/src/selection/`:

- `facts.ts` turns a ticket as read from the tracker (`SelectionIssue`) into
  plain numbers and flags (`IssueFacts`), measured against a `now` the caller
  passes in.
- `rules.ts` holds the small rule language. A rule is a named `Signal`, or an
  `all` or `any` of rules. Evaluating a rule gives "matched" plus the reason
  clauses.
- `signals.ts` holds the named signals that categories are built from.
- `categories.ts` holds the registry of six categories, the merge of board
  overrides (`resolveCategories`) and the classifier.
- `index.ts` re-exports the four modules.

Nothing here reads a clock, the network, a database or the file system. The
only "current time" is the `now: Date` argument of `factsFor`. All other
inputs are plain values. Out of scope: the Jira read, the board settings
schema, the run plan, the UI, and the `ticketCap` / `unassignedOnly` rename.
These existing exports keep their behaviour unchanged:
`packages/core/src/bounty.ts` (including `BountySelection`),
`packages/core/src/handle.ts`, and the package root
`packages/core/src/index.ts`. This spec requires no change to any of them.

## Exports

`packages/core/src/selection/facts.ts`, exactly as the ticket gives it:

```ts
export interface SelectionLink {
    readonly type: string;
    readonly direction: "inward" | "outward";
    readonly statusCategory: string;
}
export interface SelectionClosedSprint {
    readonly startDate: string | null;
    readonly endDate: string | null;
}
export interface SelectionRelease {
    readonly name: string;
    readonly releaseDate: string | null;
    readonly released: boolean;
}
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
export type PriorityRank = "low" | "medium" | "high" | "none";
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
export const PRIORITY_RANKS: Readonly<Record<string, PriorityRank>> = {
    lowest: "low", trivial: "low", low: "low", minor: "low",
    medium: "medium", normal: "medium",
};
export const BUG_ISSUE_TYPES: readonly string[] = ["bug", "defect"];
export function factsFor(issue: SelectionIssue, now: Date): IssueFacts;
```

`PRIORITY_RANKS` has exactly the six lower-case keys shown. Any other
non-blank priority name ranks `"high"`.

`packages/core/src/selection/rules.ts`, exactly as the ticket gives it:

```ts
export interface Signal {
    readonly id: string;
    readonly test: (facts: IssueFacts) => boolean;
    readonly describe: (facts: IssueFacts) => string | null;
}
export type Rule = Signal | { readonly all: readonly Rule[] } | { readonly any: readonly Rule[] };
export function all(...rules: Rule[]): Rule;
export function any(...rules: Rule[]): Rule;
export function silent(signal: Signal): Signal;
export function signal(id: string, test: Signal["test"], describe: Signal["describe"]): Signal;
export interface Evaluation {
    readonly matched: boolean;
    readonly clauses: readonly string[];
}
export function evaluate(rule: Rule, facts: IssueFacts): Evaluation;
```

`packages/core/src/selection/signals.ts`, exactly as the ticket gives it.
The ids and descriptions are fixed by this spec:

| export | `id` | `test(facts)` is true when | `describe(facts)` returns |
|---|---|---|---|
| `unassigned` | `"unassigned"` | `!assigned` | `"unassigned"` |
| `neverInSprint` | `"never-in-sprint"` | `!inSprint && closedSprintCount === 0` | `"never in a sprint"` |
| `notInSprint` | `"not-in-sprint"` | `!inSprint` | `"not in any sprint"` |
| `bug` | `"bug"` | `isBug` | `"{priorityName}-priority bug"`, or `"bug"` when `priorityName` is null |
| `openAtLeast(days)` | `"open-at-least"` | `ageDays >= days` | `"open {ageDays} day(s)"` |
| `quietAtLeast(days)` | `"quiet-at-least"` | `daysSinceUpdate >= days` | `"no update in {daysSinceUpdate} day(s)"` |
| `carriedAtLeast(sprints)` | `"carried-at-least"` | `closedSprintCount >= sprints` | `"carried over {closedSprintCount} sprint(s)"` plus `" since {carriedSince}"` when `carriedSince` is not null |
| `votesAtLeast(votes)` | `"votes-at-least"` | `votes >= n` | `"{votes} vote(s)"` |
| `watchersAtLeast(watchers)` | `"watchers-at-least"` | `watchers >= n` | `"{watchers} watcher(s)"` |
| `duplicatesAtLeast(links)` | `"duplicates-at-least"` | `duplicateLinks >= n` | `"{duplicateLinks} duplicate(s) linked"` |
| `commentsAtLeast(comments)` | `"comments-at-least"` | `commentCount !== null && commentCount >= n` | `"{commentCount} comment(s)"` |
| `blocksAtLeast(tickets)` | `"blocks-at-least"` | `blocksOpenCount >= n` | `"blocks {blocksOpenCount} open ticket(s)"` |
| `priorityAtMost(rank)` | `"priority-at-most-{rank}"` (`"priority-at-most-low"`, `"priority-at-most-medium"`) | `priorityRank` is `"low"`, or is `"medium"` and `rank` is `"medium"` | `"priority {priorityName}"`, or `"priority unset"` when `priorityName` is null |
| `deadlineWithin(days)` | `"deadline-within"` | `0 <= dueInDays <= days`, or `0 <= release.inDays <= days` | see the Deadline rule |

"(s)": the noun is singular when the number is exactly 1 and plural
otherwise ("1 vote", "0 votes", "2 votes"). The factories do not validate
their argument. A `NaN` threshold makes every `>=` comparison false.

`packages/core/src/selection/categories.ts`, exactly as the ticket gives it:

```ts
export type Thresholds = Readonly<Record<string, number>>;
export interface Category {
    readonly id: string;
    readonly label: string;
    readonly why: string;
    readonly defaults: Thresholds;
    readonly rule: (thresholds: Thresholds) => Rule;
}
export const CATEGORIES: readonly Category[];
export const UNCATEGORIZED = "uncategorized";
export interface CategorySettings {
    readonly enabled?: boolean | undefined;
    readonly thresholds?: Readonly<Record<string, number | null | undefined>> | undefined;
}
export type CategoryConfig = Readonly<Record<string, CategorySettings | undefined>>;
export interface ResolvedCategory {
    readonly id: string;
    readonly label: string;
    readonly why: string;
    readonly enabled: boolean;
    readonly thresholds: Thresholds;
}
export interface CategoryMatch {
    readonly id: string;
    readonly label: string;
    readonly reason: string;
}
export function resolveCategories(config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): ResolvedCategory[];
export function createClassifier(config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): (facts: IssueFacts) => CategoryMatch[];
export function classify(facts: IssueFacts, config: CategoryConfig = {}, categories: readonly Category[] = CATEGORIES): CategoryMatch[];
```

`CATEGORIES` holds these six entries, in this order:

| # | `id` | `label` | `defaults` | `rule(t)` |
|---|---|---|---|---|
| 1 | `left-behind` | `Left behind` | `{ minAgeDays: 180, minQuietDays: 90 }` | `all(openAtLeast(t.minAgeDays), neverInSprint, unassigned, silent(quietAtLeast(t.minQuietDays)))` |
| 2 | `always-next-sprint` | `Always next sprint` | `{ minSprints: 2 }` | `carriedAtLeast(t.minSprints)` |
| 3 | `quietly-wanted` | `Quietly wanted` | `{ minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 }` | `all(any(votesAtLeast(t.minVotes), watchersAtLeast(t.minWatchers), commentsAtLeast(t.minComments), duplicatesAtLeast(t.minDuplicates)), priorityAtMost("low"))` |
| 4 | `holding-others-up` | `Holding others up` | `{ minBlocked: 1 }` | `all(blocksAtLeast(t.minBlocked), unassigned)` |
| 5 | `paper-cuts` | `Paper cuts` | `{ minAgeDays: 90 }` | `all(bug, silent(priorityAtMost("medium")), openAtLeast(t.minAgeDays))` |
| 6 | `deadline-exposed` | `Deadline exposed` | `{ withinDays: 30 }` | `all(deadlineWithin(t.withinDays), silent(unassigned), notInSprint)` |

`why` texts, by id:

- `left-behind`: `"The team has shown it won't reach this, so outsourcing takes nothing off the roadmap."`
- `always-next-sprint`: `"Already planned and wanted; the only blocker is capacity."`
- `quietly-wanted`: `"Shows demand that the priority field hides, which justifies a higher bounty."`
- `holding-others-up`: `"One bounty unblocks several tickets the team will do in-house."`
- `paper-cuts`: `"Small, self-contained bugs are what agents fix most reliably, and users notice when they're gone."`
- `deadline-exposed`: `"The deadline justifies paying now rather than waiting for capacity."`

`packages/core/src/selection/index.ts` contains only
`export * from "./facts.js"`, `"./rules.js"`, `"./signals.js"` and
`"./categories.js"`. Every export listed above is importable from it.

All functions are synchronous and pure. None of them mutates its arguments.
Because nothing is asynchronous and
nothing is shared between calls, calls cannot overlap. There are no
`@concurrency` scenarios.

```gherkin
Feature: Classify tickets into outsourcing categories with a reason

  Background:
    Given now is "2026-11-20T12:00:00.000Z"
    And "the plain issue" is this SelectionIssue:
      | field         | value  |
      | assignee      | null   |
      | priority      | null   |
      | issueType     | "Task" |
      | created       | null   |
      | updated       | null   |
      | dueDate       | null   |
      | sprint        | null   |
      | closedSprints | []     |
      | votes         | null   |
      | watchers      | null   |
      | commentCount  | absent |
      | links         | []     |
      | releases      | []     |
    And "the plain facts" are this IssueFacts:
      | field             | value  |
      | ageDays           | 0      |
      | daysSinceUpdate   | 0      |
      | assigned          | false  |
      | inSprint          | false  |
      | closedSprintCount | 0      |
      | carriedSince      | null   |
      | votes             | 0      |
      | watchers          | 0      |
      | duplicateLinks    | 0      |
      | blocksOpenCount   | 0      |
      | commentCount      | null   |
      | priorityName      | null   |
      | priorityRank      | "none" |
      | isBug             | false  |
      | dueInDays         | null   |
      | release           | null   |
    # Unless a scenario says otherwise, issues are the plain issue with the
    # listed fields changed, facts are the plain facts with the listed fields
    # changed, and factsFor is called with now.

  Rule: factsFor of the plain issue gives the plain facts

    @happy
    Scenario: The plain issue yields neutral facts
      When factsFor is called with the plain issue and now
      Then the result deep-equals the plain facts
      And the plain issue is unchanged

    @unhappy
    Scenario: An invalid now is not rejected
      When factsFor is called with the plain issue and new Date("not a date")
      Then it does not throw
      And the result deep-equals the plain facts

  Rule: ageDays and daysSinceUpdate are whole elapsed days, rounded down; an unknown, unparseable or future date gives 0

    @happy
    Scenario: Age and quiet time come from created and updated
      When factsFor is called with created "2026-05-01T12:00:00.000Z" and updated "2026-08-01T12:00:00.000Z"
      Then ageDays is 203
      And daysSinceUpdate is 111

    @boundary
    Scenario Outline: Elapsed days round down and never go below zero
      When factsFor is called with created <created>
      Then ageDays is <ageDays>

      Examples:
        | created                    | ageDays |
        | "2026-11-19T12:00:00.000Z" | 1       |
        | "2026-11-19T12:00:00.001Z" | 0       |
        | "2026-11-20T12:00:00.000Z" | 0       |
        | "2026-12-01T00:00:00.000Z" | 0       |
        | "yesterday"                | 0       |
        | null                       | 0       |

    @unhappy
    Scenario: An unknown updated date counts as just updated
      When factsFor is called with created "2025-01-01T00:00:00.000Z" and updated "garbage"
      Then ageDays is 688
      And daysSinceUpdate is 0

  Rule: assigned is true for any non-null assignee, blank or not

    @boundary
    Scenario Outline: Assignee to assigned
      When factsFor is called with assignee <assignee>
      Then assigned is <assigned>

      Examples:
        | assignee | assigned |
        | "acc-1"  | true     |
        | "  "     | true     |
        | ""       | true     |
        | null     | false    |

  Rule: inSprint is true for any current sprint whose state is not exactly "closed"; closedSprintCount is the number of closed sprints; carriedSince is the month of the earliest closed sprint

    @boundary
    Scenario Outline: Sprint state to inSprint
      When factsFor is called with sprint <sprint>
      Then inSprint is <inSprint>

      Examples:
        | sprint                 | inSprint |
        | { state: "active" }    | true     |
        | { state: "future" }    | true     |
        | { state: "" }          | true     |
        | { state: "closed" }    | false    |
        | { state: " CLOSED " }  | true     |
        | null                   | false    |

    @happy
    Scenario: carriedSince is the UTC month name of the earliest closed sprint
      When factsFor is called with closedSprints:
        | startDate                  | endDate                    |
        | "2026-07-01T09:00:00.000Z" | "2026-07-15T09:00:00.000Z" |
        | null                       | "2026-06-14T23:30:00.000Z" |
        | "bad"                      | null                       |
      Then closedSprintCount is 3
      And carriedSince is "June"

    @boundary
    Scenario: A sprint from an earlier year names the year
      When factsFor is called with closedSprints:
        | startDate                  | endDate                    |
        | "2026-02-02T09:00:00.000Z" | "2026-02-16T09:00:00.000Z" |
        | "2025-12-01T00:00:00.000Z" | "2025-12-15T00:00:00.000Z" |
      Then closedSprintCount is 2
      And carriedSince is "December 2025"

    @boundary
    Scenario: No parseable sprint date leaves carriedSince null
      When factsFor is called with closedSprints [{ startDate: null, endDate: null }]
      Then closedSprintCount is 1
      And carriedSince is null

  Rule: votes and watchers that are null become 0; commentCount that is absent or null becomes null; any other number is kept as given

    @boundary
    Scenario Outline: Counts with missing values
      When factsFor is called with votes <votes>, watchers <watchers> and commentCount <comments>
      Then the facts have votes <fv>, watchers <fw> and commentCount <fc>

      Examples:
        | votes | watchers | comments  | fv | fw | fc   |
        | 4     | 6        | 7         | 4  | 6  | 7    |
        | null  | null     | null      | 0  | 0  | null |
        | 0     | Infinity | undefined | 0  | Infinity | null |

  Rule: blocksOpenCount counts outward links whose type contains "block" and whose status category is not exactly "done"; duplicateLinks counts inward links whose type contains "duplicate"; link type matches are case-insensitive substring matches

    @happy
    Scenario: Links are counted by type, direction and status
      When factsFor is called with links:
        | type       | direction | statusCategory |
        | "Blocks"   | outward   | "In Progress"  |
        | "Blocker"  | outward   | "new"          |
        | "Blocks"   | outward   | "done"         |
        | "Blocks"   | outward   | "Done"         |
        | "Blocks"   | inward    | "new"          |
        | "Duplicate"| inward    | "Done"         |
        | "Duplicate"| outward   | "new"          |
        | "Relates"  | outward   | "new"          |
      Then blocksOpenCount is 3
      And duplicateLinks is 1

  Rule: Priority is trimmed, looked up lower-cased in PRIORITY_RANKS, any other non-blank name ranks "high", and a missing or blank priority ranks "none"

    @happy
    Scenario Outline: Priority name to rank
      When factsFor is called with priority <priority>
      Then priorityName is <name> and priorityRank is <rank>

      Examples:
        | priority    | name       | rank     |
        | "Lowest"    | "Lowest"   | "low"    |
        | " TRIVIAL " | "TRIVIAL"  | "low"    |
        | "Minor"     | "Minor"    | "low"    |
        | "Low"       | "Low"      | "low"    |
        | "Medium"    | "Medium"   | "medium" |
        | "normal"    | "normal"   | "medium" |
        | "High"      | "High"     | "high"   |
        | "P2"        | "P2"       | "high"   |
        | "  "        | null       | "none"   |
        | null        | null       | "none"   |

  Rule: isBug is true only when the trimmed, lower-cased issue type is in BUG_ISSUE_TYPES

    @boundary
    Scenario Outline: Issue type to isBug
      When factsFor is called with issueType <type>
      Then isBug is <isBug>

      Examples:
        | type       | isBug |
        | "Bug"      | true  |
        | " DEFECT " | true  |
        | "Incident" | false |
        | "Bugfix"   | false |
        | "Task"     | false |

  Rule: dueInDays and release.inDays are UTC calendar days from now's date to the target's date, negative when past; release is the unreleased release with the smallest inDays that is 0 or more, the first in input order on a tie

    @boundary
    Scenario Outline: Due date to dueInDays
      When factsFor is called with dueDate <due>
      Then dueInDays is <days>

      Examples:
        | due                         | days |
        | "2026-11-20"                | 0    |
        | "2026-11-21"                | 1    |
        | "2026-12-20"                | 30   |
        | "2026-11-19"                | -1   |
        | "2026-11-25T23:00:00.000Z"  | 5    |
        | "soon"                      | null |
        | null                        | null |

    @happy
    Scenario: The nearest upcoming unreleased release is chosen
      When factsFor is called with releases:
        | name  | releaseDate  | released |
        | "2.3" | "2026-11-10" | false    |
        | "2.5" | "2026-12-15" | false    |
        | "2.4" | "2026-12-02" | false    |
        | "2.2" | "2026-11-25" | true     |
        | "3.0" | null         | false    |
      Then release is { name: "2.4", inDays: 12 }

    @boundary
    Scenario: Only released, past or undated releases leaves release null
      When factsFor is called with releases:
        | name  | releaseDate  | released |
        | "2.2" | "2026-11-25" | true     |
        | "2.3" | "2026-11-19" | false    |
        | "3.0" | null         | false    |
      Then release is null

  Rule: signal builds a Signal from its parts; silent keeps the id and test but describes nothing

    @happy
    Scenario: signal and silent
      Given s = signal("old", f => f.ageDays > 1, f => "old " + f.ageDays)
      When silent(s) is taken as q
      Then s.id is "old" and q.id is "old"
      And q.test(the plain facts with ageDays 5) is true
      And q.describe(the plain facts with ageDays 5) is null
      And s.describe(the plain facts with ageDays 5) is still "old 5"

  Rule: evaluate gives a matched signal's description as its only clause, unless it is null; all evaluates every child, matches when every child matches and then joins the children's clauses in order; any matches when at least one child matches and joins the clauses of every matching child in order; an unmatched rule has no clauses

    @happy
    Scenario: A matching signal contributes its description
      When evaluate(openAtLeast(10), the plain facts with ageDays 12) is called
      Then the result is { matched: true, clauses: ["open 12 days"] }

    @unhappy
    Scenario: A failing signal contributes nothing
      When evaluate(openAtLeast(10), the plain facts with ageDays 9) is called
      Then the result is { matched: false, clauses: [] }

    @happy
    Scenario: Nested rules collect clauses depth-first
      Given facts are the plain facts with votes 4, watchers 6, ageDays 40
      When evaluate is called with all(openAtLeast(30), any(votesAtLeast(3), duplicatesAtLeast(1), watchersAtLeast(5)), silent(unassigned))
      Then the result is { matched: true, clauses: ["open 40 days", "4 votes", "6 watchers"] }

    @unhappy
    Scenario: all with one failing child has no clauses but still evaluates every child
      Given facts are the plain facts with ageDays 40
      And a spy signal z whose test returns true
      When evaluate is called with all(openAtLeast(30), votesAtLeast(3), z)
      Then the result is { matched: false, clauses: [] }
      And z.test was called once

    @boundary
    Scenario: Empty combinators
      Then evaluate(all(), the plain facts) is { matched: true, clauses: [] }
      And evaluate(any(), the plain facts) is { matched: false, clauses: [] }

    @boundary
    Scenario: A null description adds no clause, an empty one is kept, and equal clauses are kept
      Given e = signal("e", () => true, () => "")
      And n = signal("n", () => true, () => null)
      And d = signal("d", () => true, () => "same")
      When evaluate(all(e, n, d, d), the plain facts) is called
      Then the result is { matched: true, clauses: ["", "same", "same"] }

  Rule: Counting signals pass at or above their threshold and describe the fact with a singular noun only for exactly 1

    @boundary
    Scenario Outline: Threshold edges and wording
      When evaluate(<signal>, the plain facts with <fact>) is called
      Then the result is <result>

      Examples:
        | signal                   | fact                                          | result                                                         |
        | openAtLeast(1)           | ageDays 1                                     | { matched: true, clauses: ["open 1 day"] }                     |
        | quietAtLeast(90)         | daysSinceUpdate 90                            | { matched: true, clauses: ["no update in 90 days"] }           |
        | quietAtLeast(90)         | daysSinceUpdate 89                            | { matched: false, clauses: [] }                                |
        | carriedAtLeast(2)        | closedSprintCount 2, carriedSince "June"      | { matched: true, clauses: ["carried over 2 sprints since June"] } |
        | carriedAtLeast(1)        | closedSprintCount 1, carriedSince null        | { matched: true, clauses: ["carried over 1 sprint"] }          |
        | votesAtLeast(0)          | votes 0                                       | { matched: true, clauses: ["0 votes"] }                        |
        | watchersAtLeast(5)       | watchers 4                                    | { matched: false, clauses: [] }                                |
        | duplicatesAtLeast(1)     | duplicateLinks 1                              | { matched: true, clauses: ["1 duplicate linked"] }             |
        | commentsAtLeast(5)       | commentCount 5                                | { matched: true, clauses: ["5 comments"] }                     |
        | blocksAtLeast(1)         | blocksOpenCount 1                             | { matched: true, clauses: ["blocks 1 open ticket"] }           |
        | blocksAtLeast(1)         | blocksOpenCount 3                             | { matched: true, clauses: ["blocks 3 open tickets"] }          |
        | openAtLeast(NaN)         | ageDays 500                                   | { matched: false, clauses: [] }                                |

    @unhappy
    Scenario: A missing comment count never satisfies the comments signal
      When evaluate(commentsAtLeast(0), the plain facts) is called
      Then the result is { matched: false, clauses: [] }

  Rule: Flag signals test one fact each; neverInSprint also needs no closed sprints

    @happy
    Scenario Outline: Flag signals
      When evaluate(<signal>, the plain facts with <fact>) is called
      Then the result is <result>

      Examples:
        | signal        | fact                 | result                                          |
        | unassigned    | assigned false       | { matched: true, clauses: ["unassigned"] }      |
        | unassigned    | assigned true        | { matched: false, clauses: [] }                 |
        | notInSprint   | closedSprintCount 4  | { matched: true, clauses: ["not in any sprint"] } |
        | notInSprint   | inSprint true        | { matched: false, clauses: [] }                 |
        | neverInSprint | closedSprintCount 0  | { matched: true, clauses: ["never in a sprint"] } |
        | neverInSprint | closedSprintCount 1  | { matched: false, clauses: [] }                 |
        | neverInSprint | inSprint true        | { matched: false, clauses: [] }                 |
        | bug           | isBug true           | { matched: true, clauses: ["bug"] }             |
        | bug           | isBug true, priorityName "Low" | { matched: true, clauses: ["Low-priority bug"] } |

  Rule: priorityAtMost("low") passes only rank "low"; priorityAtMost("medium") passes "low" and "medium"; "high" and "none" never pass

    @boundary
    Scenario Outline: Priority ceiling
      When evaluate(priorityAtMost(<ceiling>), the plain facts with priorityRank <rank> and priorityName <name>) is called
      Then matched is <matched> and clauses are <clauses>

      Examples:
        | ceiling  | rank     | name     | matched | clauses             |
        | "low"    | "low"    | "Minor"  | true    | ["priority Minor"]  |
        | "low"    | "medium" | "Medium" | false   | []                  |
        | "medium" | "low"    | "Low"    | true    | ["priority Low"]    |
        | "medium" | "medium" | "Normal" | true    | ["priority Normal"] |
        | "medium" | "high"   | "High"   | false   | []                  |
        | "medium" | "none"   | null     | false   | []                  |

  Rule: deadlineWithin passes when the due date or the chosen release is between 0 and days ahead, inclusive; overdue never passes; the description is "due today" / "due in N day(s)" or "release NAME today" / "release NAME in N day(s)"; when both hold it names only the sooner, and the due date on a tie

    @boundary
    Scenario Outline: Deadline window
      When evaluate(deadlineWithin(30), the plain facts with <fact>) is called
      Then the result is <result>

      Examples:
        | fact                                                | result                                                                     |
        | dueInDays 0                                         | { matched: true, clauses: ["due today"] }                                  |
        | dueInDays 1                                         | { matched: true, clauses: ["due in 1 day"] }                               |
        | dueInDays 30                                        | { matched: true, clauses: ["due in 30 days"] }                             |
        | dueInDays 31                                        | { matched: false, clauses: [] }                                            |
        | dueInDays -1                                        | { matched: false, clauses: [] }                                            |
        | release { name: "2.4", inDays: 0 }                  | { matched: true, clauses: ["release 2.4 today"] }                          |
        | dueInDays 5, release { name: "2.4", inDays: 12 }    | { matched: true, clauses: ["due in 5 days"] }                              |
        | dueInDays 20, release { name: "2.4", inDays: 12 }   | { matched: true, clauses: ["release 2.4 in 12 days"] }                     |
        | dueInDays 12, release { name: "2.4", inDays: 12 }   | { matched: true, clauses: ["due in 12 days"] }                             |
        | dueInDays -3, release { name: "2.4", inDays: 12 }   | { matched: true, clauses: ["release 2.4 in 12 days"] }                     |
        | dueInDays 40, release { name: "2.4", inDays: 12 }   | { matched: true, clauses: ["release 2.4 in 12 days"] }                     |

  Rule: CATEGORIES is the registry of six categories in the documented order, with the documented ids, labels, why texts and defaults; UNCATEGORIZED is "uncategorized" and is not a category id

    @happy
    Scenario: Registry contents
      Then CATEGORIES.map(c => c.id) is ["left-behind", "always-next-sprint", "quietly-wanted", "holding-others-up", "paper-cuts", "deadline-exposed"]
      And CATEGORIES.map(c => c.label) is ["Left behind", "Always next sprint", "Quietly wanted", "Holding others up", "Paper cuts", "Deadline exposed"]
      And the defaults of "quietly-wanted" are { minVotes: 3, minWatchers: 5, minDuplicates: 1, minComments: 5 }
      And UNCATEGORIZED is "uncategorized"
      And no category in CATEGORIES has id "uncategorized"

  Rule: resolveCategories returns one entry per category in registry order; a category is enabled unless its settings have enabled === false; each default threshold is replaced by an override only when that override is a finite number; keys not in the defaults and settings for unknown ids are ignored

    @happy
    Scenario: No config gives the defaults, all enabled
      When resolveCategories() is called
      Then it returns 6 entries in registry order, each with enabled true and thresholds deep-equal to its defaults
      And the entry for "left-behind" is { id: "left-behind", label: "Left behind", why: "The team has shown it won't reach this, so outsourcing takes nothing off the roadmap.", enabled: true, thresholds: { minAgeDays: 180, minQuietDays: 90 } }

    @happy
    Scenario: Overrides merge threshold by threshold
      When resolveCategories is called with:
        """
        {
          "left-behind": { "thresholds": { "minAgeDays": 365 } },
          "paper-cuts": { "enabled": false },
          "quietly-wanted": { "enabled": true, "thresholds": { "minVotes": 0, "minWatchers": -2 } }
        }
        """
      Then "left-behind" has enabled true and thresholds { minAgeDays: 365, minQuietDays: 90 }
      And "paper-cuts" has enabled false and thresholds { minAgeDays: 90 }
      And "quietly-wanted" has thresholds { minVotes: 0, minWatchers: -2, minComments: 5, minDuplicates: 1 }

    @unhappy
    Scenario: Invalid, removed and unknown overrides fall back or are dropped without an error
      When resolveCategories is called with:
        | category          | settings                                                                        |
        | left-behind       | { thresholds: { minAgeDays: null, minQuietDays: NaN, colour: 7 } }              |
        | holding-others-up | { enabled: undefined, thresholds: { minBlocked: Infinity } }                    |
        | deadline-exposed  | { thresholds: { withinDays: "10" } }                                            |
        | always-next-sprint| undefined                                                                       |
        | made-up           | { enabled: false, thresholds: { x: 1 } }                                        |
        | uncategorized     | { enabled: true }                                                               |
      Then it does not throw and returns 6 entries in registry order
      And "left-behind" has thresholds { minAgeDays: 180, minQuietDays: 90 } with no "colour" key
      And "holding-others-up" has enabled true and thresholds { minBlocked: 1 }
      And "deadline-exposed" has thresholds { withinDays: 30 }
      And "always-next-sprint" has enabled true and thresholds { minSprints: 2 }
      And no entry has id "made-up" or "uncategorized"

    @boundary
    Scenario: A custom registry replaces the built-in one
      Given a custom category { id: "c", label: "C", why: "W", defaults: { n: 1 }, rule: t => openAtLeast(t.n) }
      When resolveCategories({ c: { thresholds: { n: 4 } } }, [the custom category]) is called
      Then it returns [{ id: "c", label: "C", why: "W", enabled: true, thresholds: { n: 4 } }]

  Rule: The classifier returns one CategoryMatch per enabled category whose rule matches, in registry order; reason is the clauses joined with ", " with the first letter upper-cased, or the category's label when there are no clauses; no match gives []

    @happy
    Scenario Outline: Each built-in category with default thresholds
      When classify(the plain facts with <facts>) is called
      Then the result is [{ id: <id>, label: <label>, reason: <reason> }]

      Examples:
        | facts                                                            | id                   | label                | reason                                          |
        | ageDays 200, daysSinceUpdate 120                                 | "left-behind"        | "Left behind"        | "Open 200 days, never in a sprint, unassigned"  |
        | closedSprintCount 3, carriedSince "June", inSprint true          | "always-next-sprint" | "Always next sprint" | "Carried over 3 sprints since June"             |
        | votes 4, watchers 6, priorityRank "low", priorityName "Minor"    | "quietly-wanted"     | "Quietly wanted"     | "4 votes, 6 watchers, priority Minor"           |
        | blocksOpenCount 2                                                | "holding-others-up"  | "Holding others up"  | "Blocks 2 open tickets, unassigned"             |
        | isBug true, priorityRank "medium", priorityName "Medium", ageDays 100 | "paper-cuts"    | "Paper cuts"         | "Medium-priority bug, open 100 days"            |
        | dueInDays 5                                                      | "deadline-exposed"   | "Deadline exposed"   | "Due in 5 days, not in any sprint"              |

    @boundary
    Scenario Outline: Built-in categories that do not match
      When classify(the plain facts with <facts>) is called
      Then the result is []

      Examples:
        | facts                                                                  | why it fails                         |
        | (none)                                                                 | the plain facts fit nothing          |
        | ageDays 200, daysSinceUpdate 89                                        | Left behind needs 90 quiet days      |
        | ageDays 200, daysSinceUpdate 120, closedSprintCount 1, carriedSince null | Left behind needs no sprint history |
        | ageDays 200, daysSinceUpdate 120, assigned true                        | Left behind needs no assignee        |
        | closedSprintCount 1                                                    | Always next sprint needs 2           |
        | votes 10, priorityRank "medium", priorityName "Medium"                 | Quietly wanted needs low priority    |
        | votes 10, priorityRank "none"                                          | no priority is not low               |
        | votes 2, watchers 4, commentCount 4, priorityRank "low", priorityName "Low" | no demand signal reaches its threshold |
        | blocksOpenCount 2, assigned true                                       | Holding others up needs no assignee  |
        | isBug true, priorityRank "high", priorityName "High", ageDays 100      | Paper cuts needs medium or lower     |
        | isBug true, priorityRank "none", ageDays 100                           | no priority is excluded              |
        | isBug true, priorityRank "low", priorityName "Low", ageDays 89         | Paper cuts needs 90 days             |
        | dueInDays -2                                                           | overdue is not Deadline exposed      |
        | dueInDays 5, inSprint true                                             | Deadline exposed needs no sprint     |
        | dueInDays 5, assigned true                                             | Deadline exposed needs no assignee   |

    @happy
    Scenario: Several matches come back in registry order
      Given facts are the plain facts with ageDays 200, daysSinceUpdate 120, blocksOpenCount 1, dueInDays 0
      When classify(facts) is called
      Then the result is:
        | id                | label             | reason                                         |
        | left-behind       | Left behind       | Open 200 days, never in a sprint, unassigned   |
        | holding-others-up | Holding others up | Blocks 1 open ticket, unassigned               |
        | deadline-exposed  | Deadline exposed  | Due today, not in any sprint                   |

    @happy
    Scenario: Board overrides change what matches
      Given facts are the plain facts with ageDays 200, daysSinceUpdate 120, blocksOpenCount 1
      When classify(facts, { "left-behind": { thresholds: { minAgeDays: 365 } }, "holding-others-up": { enabled: false } }) is called
      Then the result is []

    @boundary
    Scenario: A matched rule with only silent clauses falls back to the label
      Given a custom category { id: "q", label: "Q", why: "Just because.", defaults: {}, rule: () => silent(unassigned) }
      When classify(the plain facts, {}, [the custom category]) is called
      Then the result is [{ id: "q", label: "Q", reason: "Q" }]

  Rule: createClassifier resolves the config and builds each enabled category's rule once, when it is created; the returned function keeps no state between calls, and classify(facts, config, categories) equals createClassifier(config, categories)(facts)

    @happy
    Scenario: Rules are built once and disabled rules never
      Given custom categories a and b whose rule functions are spies returning unassigned
      When createClassifier({ b: { enabled: false } }, [a, b]) is called
      And the returned function is called 3 times with the plain facts
      Then a.rule was called exactly once, with thresholds deep-equal to a's defaults
      And b.rule was never called
      And every call returned [{ id: "a", label: a.label, reason: "Unassigned" }]

    @happy
    Scenario: One classifier gives the same answers as classify, in any call order
      Given k = createClassifier()
      And f1 = the plain facts with blocksOpenCount 2
      And f2 = the plain facts
      Then k(f1), k(f2), k(f1) deep-equal classify(f1), classify(f2), classify(f1)

    @boundary
    Scenario: Changing a config object after creation does not change the classifier
      Given config = { "holding-others-up": { enabled: true } } as a mutable object
      And k = createClassifier(config)
      When config["holding-others-up"] is replaced by { enabled: false }
      Then k(the plain facts with blocksOpenCount 1) still returns the "holding-others-up" match
```

## Decided:

- Bug types: an issue is a bug only when its trimmed, lower-cased type is exactly `"bug"` or `"defect"`.
  - Ticket: silent.
  - Instead: also accept other defect-like type names (e.g. "incident", "problem"), or let each board configure the list.
- Priority ranking: lowest/trivial/low/minor rank `low` and medium/normal rank `medium`, matched case-insensitively. Every other non-blank name ranks `high`.
  - Ticket: silent.
  - Instead: rank unknown names as medium or none, or read the tracker's priority ordering instead of matching names.
- No priority: a missing or blank priority ranks `"none"`, which never passes `priorityAtMost`. Unprioritised tickets are therefore never Quietly wanted or Paper cuts.
  - Ticket: silent.
  - Instead: treat an unset priority as low, so unprioritised tickets can qualify.
- Paper cuts priority: accepts low or medium (`priorityAtMost("medium")`). The priority check is silent in the reason, but the bug clause names the priority ("Medium-priority bug").
  - Ticket: silent.
  - Instead: accept low only, or any priority, or make the cut-off a threshold.
- Quietly wanted: matches when any of votes ≥ 3, watchers ≥ 5, comments ≥ 5 or duplicates ≥ 1 holds, and only when the priority is low. Every demand signal that holds is listed in the reason.
  - Ticket: silent.
  - Instead: require several demand signals together, use other default numbers, or allow medium priority.
- Left behind: needs age ≥ 180 days, never in a sprint (current or closed), unassigned, and no update for ≥ 90 days. The quiet period is checked but left out of the reason.
  - Ticket: silent.
  - Instead: use different thresholds, drop the quiet-period test, or allow tickets with sprint history.
- Links: link type names match by case-insensitive substring "block" or "duplicate". Blocks counts only outward links whose status category is not exactly "done" (case-sensitive, untrimmed). Duplicates counts only inward links.
  - Ticket: silent.
  - Instead: match exact link type names, count both directions for duplicates, or count all blocked tickets regardless of status.
- Unknown or future dates: `ageDays` and `daysSinceUpdate` are 0 when the date is missing, unparseable or in the future, so such tickets fail the age and quiet tests.
  - Ticket: silent.
  - Instead: return null and exclude the ticket explicitly, or treat unknown age as very old.
- Deadline exposed: matches only when the due date or the chosen release is 0 to 30 days ahead, so overdue never matches. It also needs the ticket out of any active or future sprint, and unassigned. The assignment check is silent in the reason.
  - Ticket: silent.
  - Instead: include overdue tickets, ignore sprint membership, or require the ticket to be unassigned in the reason.
- In a sprint / carried over: `inSprint` is true for any current sprint whose state is not "closed". Always next sprint matches on ≥ 2 closed sprints, whether or not the ticket is in a sprint now.
  - Ticket: silent.
  - Instead: count only active/future states explicitly, and require the ticket to be in a sprint now for Always next sprint.
- Missing comment count: a null `commentCount` never satisfies `commentsAtLeast`, even with a threshold of 0.
  - Ticket: silent.
  - Instead: treat missing comments as 0 and fail the same way, or drop the comment criterion until it can be read.
- Invalid or unknown overrides: overrides that are not finite numbers (null, undefined, NaN, ±Infinity, strings) fall back to the default without an error. Keys missing from the category's defaults are dropped, and settings for unknown category ids are ignored. Any finite number is accepted, including 0 and negative values.
  - Ticket: "a null in an update removes the setting instead of being stored."
  - Instead: throw a validation error on an unknown key or a bad value, or accept 0 or negative values only within a range.
- Day arithmetic: age and quiet time are whole elapsed 24-hour periods, rounded down. Due and release distances are differences between UTC calendar dates.
  - Ticket: silent.
  - Instead: use calendar days for everything, or round to the nearest day, or use the local time zone.
- Invalid `now`: `factsFor` does not validate `now` and does not throw on an invalid Date. With no dates on the issue it returns the plain facts.
  - Ticket: silent.
  - Instead: throw a `RangeError` on an invalid `now`.
- Assignee: any non-null assignee counts as assigned, including a blank or whitespace-only one.
  - Ticket: silent.
  - Instead: treat a blank assignee as unassigned.
- Sprint state comparison: the "closed" check compares the exact string "closed" (no trimming, case-sensitive).
  - Ticket: silent.
  - Instead: trim and compare case-insensitively.
- `carriedSince`: the English UTC month name of the earliest closed sprint ("June"), with the year added when it differs from now's UTC year ("December 2025"), using each sprint's start date or else its end date when the start is missing or unparseable. It is null when no date parses.
  - Ticket: silent.
  - Instead: use the most recent sprint, a `YYYY-MM-DD` date, or only start dates.
- Missing counts: votes and watchers that are null become 0. A comment count that is absent or null becomes null. Any other number, including a non-finite one, is kept as given.
  - Ticket: silent.
  - Instead: keep null for votes/watchers too, or turn non-finite counts into 0 or null.
- Which release counts: the unreleased release with a parseable date today or later and the fewest days ahead, the first in input order on a tie. Past-due unreleased releases are ignored rather than making the ticket overdue.
  - Ticket: silent.
  - Instead: take the earliest unreleased release even when it is past due, or the release listed first.
- Rule evaluation: an empty `all` matches and an empty `any` does not. `all` and `any` both evaluate every child. `any` lists the clauses of all children that match. Clauses come in depth-first order and are not deduplicated. A null description adds no clause, but an empty string is kept as a clause.
  - Ticket: silent.
  - Instead: have `all` stop at the first failure and `any` at the first match, deduplicate clauses, drop empty clauses, or treat empty combinators as errors.
- Reason text: clauses are joined with ", ", the first letter is upper-cased, and there is no trailing full stop. When a matched rule has no clauses, the reason is the category's `label`.
  - Ticket: silent.
  - Instead: join with "; " or " and ", leave the case alone, fall back to the `why`, or return an empty reason.
- Signal wording: the ids and descriptions are those in the signals table. Nouns are singular only for exactly 1. Same-day deadlines read "due today" / "release NAME today". When both deadlines hold, the clause names only the sooner one, and the due date on a tie. `bug` reads "{priority}-priority bug", or "bug" with no priority. `priorityAtMost` ids carry the rank: `priority-at-most-low`, `priority-at-most-medium`.
  - Ticket: silent.
  - Instead: always plural nouns, "due in 0 days", or naming both deadlines.
- Category ids, threshold names and the other rules: kebab-case ids as tabled. Threshold keys are `minAgeDays`, `minQuietDays`, `minSprints`, `minVotes`, `minWatchers`, `minDuplicates`, `minComments`, `minBlocked`, `withinDays`. Always next sprint uses a single signal. Holding others up needs ≥ 1 open blocked ticket and no assignee, and both appear in the reason. Paper cuts also needs age ≥ 90 days.
  - Ticket: silent.
  - Instead: camelCase or label-derived ids, a lower or no age floor on Paper cuts, or allowing assigned tickets in Holding others up.
- Results order and output: matches come back in registry order, at most one per category. A ticket that fits nothing gives `[]`; the caller files it under `UNCATEGORIZED`, and the classifier never returns that id.
  - Ticket: silent.
  - Instead: sort matches by strength, or return an `uncategorized` match when nothing fits.
- Enabled flag: a category is disabled only by `enabled === false`. Null or undefined leave it enabled.
  - Ticket: "a null in an update removes the setting instead of being stored."
  - Instead: require an explicit `true`, or reject non-boolean values.
- Classifier lifetime: `createClassifier` resolves the config and calls each enabled category's `rule` once, at creation. Later changes to the config object are not seen. The returned function holds no state, and since everything is synchronous no calls can overlap.
  - Ticket: silent.
  - Instead: re-resolve the config on every call, or cache results per facts object.
- Package surface: `selection/index.ts` re-exports the four modules. The package root `src/index.ts`, `bounty.ts` and `handle.ts` are unchanged by this spec.
  - Ticket: "maxTickets and excludeAssigned become ticketCap (optional, no default) and unassignedOnly (default false)."
  - Instead: re-export the selection modules from the package root and rename the `BountySelection` fields in this change.
