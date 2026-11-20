import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PRIORITY_RANKS,
  factsFor,
  type IssueFacts,
  type SelectionIssue,
} from "../../src/selection/index.js";

/**
 * Hidden tests for `factsFor`. Every issue is the spec's "plain issue" with
 * the listed fields changed; `now` is fixed unless a test says otherwise.
 */

const NOW = new Date("2026-11-20T12:00:00.000Z");
const DAY = 86_400_000;

const PLAIN_ISSUE: SelectionIssue = {
  assignee: null,
  priority: null,
  issueType: "Task",
  created: null,
  updated: null,
  dueDate: null,
  sprint: null,
  closedSprints: [],
  votes: null,
  watchers: null,
  links: [],
  releases: [],
};

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

function issue(overrides: Partial<SelectionIssue> = {}): SelectionIssue {
  return { ...PLAIN_ISSUE, ...overrides };
}

function factsOf(overrides: Partial<SelectionIssue> = {}, now: Date = NOW): IssueFacts {
  return factsFor(issue(overrides), now);
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// Extends "[happy-1] the plain issue yields the plain facts and is left unchanged":
// a different now, and a rich issue whose arrays must not be reordered or changed.
test("[happy-1] the plain issue yields the plain facts for any valid now", () => {
  for (const now of [
    new Date("2030-01-01T00:00:00.000Z"),
    new Date("1999-06-15T08:30:00.000Z"),
    new Date(0),
  ]) {
    assert.deepEqual(factsFor(issue(), now), PLAIN_FACTS, now.toISOString());
  }
});

test("[happy-1] factsFor leaves a rich issue and its arrays unchanged", () => {
  const input = issue({
    assignee: "acc-9",
    priority: " Minor ",
    issueType: " Bug ",
    created: "2025-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
    dueDate: "2026-12-01",
    sprint: { state: "active" },
    closedSprints: [
      { startDate: "2026-07-01T00:00:00.000Z", endDate: null },
      { startDate: "2026-03-01T00:00:00.000Z", endDate: null },
      { startDate: null, endDate: "2026-05-01T00:00:00.000Z" },
    ],
    votes: 3,
    watchers: 4,
    commentCount: 5,
    links: [
      { type: "Relates", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "outward", statusCategory: "new" },
      { type: "Duplicate", direction: "inward", statusCategory: "done" },
    ],
    releases: [
      { name: "z", releaseDate: "2026-12-30", released: false },
      { name: "a", releaseDate: "2026-11-25", released: false },
      { name: "m", releaseDate: "2026-12-10", released: false },
    ],
  });
  const before = structuredClone(input);
  factsFor(input, NOW);
  assert.deepEqual(input, before);
  assert.deepEqual(
    input.releases.map((r) => r.name),
    ["z", "a", "m"],
  );
  assert.deepEqual(
    input.closedSprints.map((s) => s.startDate),
    ["2026-07-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z", null],
  );
});

test("[happy-1] a rich issue yields every fact at once", () => {
  const facts = factsOf({
    assignee: "acc-9",
    priority: " Minor ",
    issueType: " Bug ",
    created: "2026-11-10T12:00:00.000Z",
    updated: "2026-11-17T12:00:00.000Z",
    dueDate: "2026-11-23",
    sprint: { state: "future" },
    closedSprints: [{ startDate: "2026-09-02T00:00:00.000Z", endDate: null }],
    votes: 3,
    watchers: 4,
    commentCount: 5,
    links: [
      { type: "Blocks", direction: "outward", statusCategory: "new" },
      { type: "Duplicate", direction: "inward", statusCategory: "new" },
      { type: "Duplicate", direction: "inward", statusCategory: "new" },
    ],
    releases: [{ name: "R", releaseDate: "2026-11-27", released: false }],
  });
  assert.deepEqual(facts, {
    ageDays: 10,
    daysSinceUpdate: 3,
    assigned: true,
    inSprint: true,
    closedSprintCount: 1,
    carriedSince: "September",
    votes: 3,
    watchers: 4,
    duplicateLinks: 2,
    blocksOpenCount: 1,
    commentCount: 5,
    priorityName: "Minor",
    priorityRank: "low",
    isBug: true,
    dueInDays: 3,
    release: { name: "R", inDays: 7 },
  });
});

// Extends "[unhappy-1] an invalid now is not rejected and gives the plain facts":
// with only non-date fields set, an invalid now still gives their usual facts.
test("[unhappy-1] an invalid now with no dates on the issue still computes the non-date facts", () => {
  const bad = new Date(Number.NaN);
  let result: IssueFacts | undefined;
  assert.doesNotThrow(() => {
    result = factsFor(
      issue({
        assignee: "acc-1",
        priority: "Normal",
        issueType: "Defect",
        sprint: { state: "active" },
        votes: 2,
        watchers: 7,
        commentCount: 1,
        links: [{ type: "Blocks", direction: "outward", statusCategory: "new" }],
      }),
      bad,
    );
  });
  assert.deepEqual(result, {
    ...PLAIN_FACTS,
    assigned: true,
    priorityName: "Normal",
    priorityRank: "medium",
    isBug: true,
    inSprint: true,
    votes: 2,
    watchers: 7,
    commentCount: 1,
    blocksOpenCount: 1,
  });
});

test("[unhappy-1] an invalid now with an explicit null comment count gives the plain facts", () => {
  assert.deepEqual(factsFor(issue({ commentCount: null }), new Date("garbage")), PLAIN_FACTS);
});

// Extends "[happy-2] ageDays and daysSinceUpdate come from created and updated":
// other dates and another now.
test("[happy-2] ageDays and daysSinceUpdate for other dates", () => {
  const facts = factsOf({
    created: "2020-02-29T00:00:00.000Z",
    updated: "2026-11-01T18:00:00.000Z",
  });
  assert.equal(facts.ageDays, Math.floor((NOW.getTime() - Date.UTC(2020, 1, 29)) / DAY));
  assert.equal(facts.ageDays, 2456);
  assert.equal(facts.daysSinceUpdate, 18);
});

test("[happy-2] ageDays and daysSinceUpdate are measured against the given now", () => {
  const now = new Date("2027-03-01T00:00:00.000Z");
  const facts = factsOf(
    { created: "2026-05-01T12:00:00.000Z", updated: "2026-08-01T12:00:00.000Z" },
    now,
  );
  assert.equal(facts.ageDays, 303);
  assert.equal(facts.daysSinceUpdate, 211);
});

test("[happy-2] elapsed days are 24-hour periods, not calendar days", () => {
  // 13 hours before now, on the previous calendar day.
  assert.equal(factsOf({ created: "2026-11-19T23:00:00.000Z" }).ageDays, 0);
  // 2.5 days before now: rounded down, not to the nearest.
  assert.equal(factsOf({ updated: "2026-11-18T00:00:00.000Z" }).daysSinceUpdate, 2);
  // 1 ms short of 3 days.
  assert.equal(factsOf({ updated: "2026-11-17T12:00:00.001Z" }).daysSinceUpdate, 2);
  assert.equal(factsOf({ updated: "2026-11-17T12:00:00.000Z" }).daysSinceUpdate, 3);
});

// Extends "[boundary-1] elapsed days round down and never go below zero": more edges.
test("[boundary-1] more elapsed-day edges for ageDays", () => {
  const cases: [string | null, number][] = [
    ["2026-11-18T12:00:00.000Z", 2],
    ["2026-11-18T12:00:00.001Z", 1],
    ["2024-02-24T12:00:00.000Z", 1000],
    ["2030-01-01T00:00:00.000Z", 0],
    ["", 0],
    ["not a date at all", 0],
  ];
  for (const [created, ageDays] of cases) {
    assert.equal(factsOf({ created }).ageDays, ageDays, `created ${String(created)}`);
  }
});

test("[boundary-1] a future updated date is 0, also far in the future", () => {
  assert.equal(factsOf({ updated: "2026-11-20T12:00:00.001Z" }).daysSinceUpdate, 0);
  assert.equal(factsOf({ updated: "2099-01-01T00:00:00.000Z" }).daysSinceUpdate, 0);
});

// Extends "[unhappy-2] an unparseable updated date counts as just updated":
// the reverse (unparseable created, valid updated) and an empty string.
test("[unhappy-2] an unparseable created date gives age 0 while a valid updated date still counts", () => {
  const facts = factsOf({ created: "garbage", updated: "2026-10-21T12:00:00.000Z" });
  assert.equal(facts.ageDays, 0);
  assert.equal(facts.daysSinceUpdate, 30);
});

test("[unhappy-2] an empty updated date counts as just updated and does not copy the age", () => {
  const facts = factsOf({ created: "2026-01-01T12:00:00.000Z", updated: "" });
  assert.equal(facts.ageDays, 323);
  assert.equal(facts.daysSinceUpdate, 0);
});

// Extends "[boundary-2] any non-null assignee, blank or not, is assigned".
test("[boundary-2] tab, newline and the text null all count as assigned", () => {
  for (const assignee of ["\t", "\n", "null", "x"]) {
    assert.deepEqual(factsOf({ assignee }), { ...PLAIN_FACTS, assigned: true }, JSON.stringify(assignee));
  }
});

// Extends "[boundary-3] the closed check is case-sensitive".
test("[boundary-3] only the exact state closed leaves the ticket out of a sprint", () => {
  const cases: [string, boolean][] = [
    ["CLOSED", true],
    [" closed", true],
    ["closed\n", true],
    ["open", true],
    ["Active", true],
    ["closedd", true],
    ["closed", false],
  ];
  for (const [state, inSprint] of cases) {
    assert.equal(factsOf({ sprint: { state } }).inSprint, inSprint, JSON.stringify(state));
  }
});

test("[boundary-3] inSprint does not depend on closed sprints", () => {
  const facts = factsOf({
    sprint: null,
    closedSprints: [{ startDate: "2026-06-01T00:00:00.000Z", endDate: null }],
  });
  assert.equal(facts.inSprint, false);
  assert.equal(facts.closedSprintCount, 1);
  const active = factsOf({ sprint: { state: "active" } });
  assert.equal(active.inSprint, true);
  assert.equal(active.closedSprintCount, 0);
  assert.equal(active.carriedSince, null);
});

// Extends "[happy-3] carriedSince is the UTC month name of the earliest closed sprint":
// every month name, the earliest not first or last, and start preferred over end.
test("[happy-3] carriedSince names every month of the current year in English", () => {
  for (let m = 0; m < 12; m++) {
    const start = new Date(Date.UTC(2026, m, 15, 12)).toISOString();
    const facts = factsOf({ closedSprints: [{ startDate: start, endDate: null }] });
    assert.equal(facts.carriedSince, MONTHS[m], start);
  }
});

test("[happy-3] carriedSince picks the earliest sprint wherever it sits in the list", () => {
  const facts = factsOf({
    closedSprints: [
      { startDate: "2026-09-01T00:00:00.000Z", endDate: "2026-09-14T00:00:00.000Z" },
      { startDate: "2026-08-01T00:00:00.000Z", endDate: "2026-08-14T00:00:00.000Z" },
      { startDate: "2026-03-03T00:00:00.000Z", endDate: "2026-03-17T00:00:00.000Z" },
      { startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-14T00:00:00.000Z" },
      { startDate: "2026-05-01T00:00:00.000Z", endDate: "2026-05-14T00:00:00.000Z" },
    ],
  });
  assert.equal(facts.closedSprintCount, 5);
  assert.equal(facts.carriedSince, "March");
});

test("[happy-3] a sprint's start date is used even when its end date is earlier", () => {
  // Sprint 1 counts as May (start), sprint 2 as April; the end date March is not used.
  const facts = factsOf({
    closedSprints: [
      { startDate: "2026-05-10T00:00:00.000Z", endDate: "2026-03-01T00:00:00.000Z" },
      { startDate: "2026-04-01T00:00:00.000Z", endDate: null },
    ],
  });
  assert.equal(facts.closedSprintCount, 2);
  assert.equal(facts.carriedSince, "April");
});

test("[happy-3] an unparseable start falls back to the end date", () => {
  const facts = factsOf({
    closedSprints: [
      { startDate: "2026-04-01T00:00:00.000Z", endDate: null },
      { startDate: "not a date", endDate: "2026-02-20T00:00:00.000Z" },
      { startDate: "", endDate: "2026-03-20T00:00:00.000Z" },
    ],
  });
  assert.equal(facts.closedSprintCount, 3);
  assert.equal(facts.carriedSince, "February");
});

// Extends "[boundary-4] a sprint from an earlier year names the year":
// another now, a later year, and the earliest across several years.
test("[boundary-4] the earliest sprint across several years names its year", () => {
  const facts = factsOf({
    closedSprints: [
      { startDate: "2026-01-05T00:00:00.000Z", endDate: null },
      { startDate: "2024-07-08T00:00:00.000Z", endDate: null },
      { startDate: "2025-03-03T00:00:00.000Z", endDate: null },
    ],
  });
  assert.equal(facts.closedSprintCount, 3);
  assert.equal(facts.carriedSince, "July 2024");
});

test("[boundary-4] the year is compared with now's UTC year, whatever now is", () => {
  const now2030 = new Date("2030-01-05T12:00:00.000Z");
  assert.equal(
    factsOf({ closedSprints: [{ startDate: "2029-12-20T00:00:00.000Z", endDate: null }] }, now2030)
      .carriedSince,
    "December 2029",
  );
  assert.equal(
    factsOf({ closedSprints: [{ startDate: "2030-01-01T00:00:00.000Z", endDate: null }] }, now2030)
      .carriedSince,
    "January",
  );
  const now2025 = new Date("2025-12-31T12:00:00.000Z");
  assert.equal(
    factsOf({ closedSprints: [{ startDate: "2025-12-01T00:00:00.000Z", endDate: null }] }, now2025)
      .carriedSince,
    "December",
  );
});

test("[boundary-4] a sprint in a later year than now also names the year", () => {
  const facts = factsOf({
    closedSprints: [{ startDate: "2027-03-01T00:00:00.000Z", endDate: null }],
  });
  assert.equal(facts.carriedSince, "March 2027");
});

// Extends "[boundary-5] no parseable sprint date leaves carriedSince null".
test("[boundary-5] no closed sprints gives count 0 and carriedSince null", () => {
  const facts = factsOf({ closedSprints: [] });
  assert.equal(facts.closedSprintCount, 0);
  assert.equal(facts.carriedSince, null);
});

test("[boundary-5] many undated sprints are all counted and leave carriedSince null", () => {
  const facts = factsOf({
    closedSprints: Array.from({ length: 7 }, () => ({ startDate: null, endDate: null })),
  });
  assert.equal(facts.closedSprintCount, 7);
  assert.equal(facts.carriedSince, null);
});

test("[boundary-5] one parseable date among undated sprints sets carriedSince", () => {
  const facts = factsOf({
    closedSprints: [
      { startDate: null, endDate: null },
      { startDate: "bad", endDate: "worse" },
      { startDate: null, endDate: "2026-08-31T23:59:59.000Z" },
    ],
  });
  assert.equal(facts.closedSprintCount, 3);
  assert.equal(facts.carriedSince, "August");
});

// Extends "[boundary-6] null votes and watchers become 0, ...": non-finite and
// fractional numbers are kept as given.
test("[boundary-6] non-finite and fractional counts are kept as given", () => {
  const nan = factsOf({ votes: Number.NaN, watchers: -Infinity, commentCount: Infinity });
  assert.equal(nan.votes, Number.NaN);
  assert.equal(nan.watchers, -Infinity);
  assert.equal(nan.commentCount, Infinity);
  const odd = factsOf({ votes: 2.5, watchers: 100000, commentCount: Number.NaN });
  assert.equal(odd.votes, 2.5);
  assert.equal(odd.watchers, 100000);
  assert.equal(odd.commentCount, Number.NaN);
});

test("[boundary-6] a null vote count with a numeric watcher count converts only the null", () => {
  const facts = factsOf({ votes: null, watchers: 9, commentCount: 12 });
  assert.equal(facts.votes, 0);
  assert.equal(facts.watchers, 9);
  assert.equal(facts.commentCount, 12);
  const other = factsOf({ votes: 8, watchers: null });
  assert.equal(other.votes, 8);
  assert.equal(other.watchers, 0);
  assert.equal(other.commentCount, null);
});

// Extends "[happy-4] links are counted by type, direction and status": more links,
// other spellings.
test("[happy-4] many links are counted by substring, direction and exact done", () => {
  const facts = factsOf({
    links: [
      { type: "BLOCKS", direction: "outward", statusCategory: "new" },
      { type: "non-blocking", direction: "outward", statusCategory: "indeterminate" },
      { type: "Blocks", direction: "outward", statusCategory: "DONE" },
      { type: "Blocks", direction: "outward", statusCategory: "done " },
      { type: "Blocks", direction: "outward", statusCategory: "" },
      { type: "Blocks", direction: "outward", statusCategory: "done" },
      { type: "Blocks", direction: "inward", statusCategory: "new" },
      { type: "Block", direction: "inward", statusCategory: "new" },
      { type: "Duplicates", direction: "inward", statusCategory: "new" },
      { type: "is duplicated by", direction: "inward", statusCategory: "done" },
      { type: "DUPLICATE", direction: "inward", statusCategory: "In Progress" },
      { type: "Duplicate", direction: "outward", statusCategory: "new" },
      { type: "Dup", direction: "inward", statusCategory: "new" },
      { type: "Relates", direction: "inward", statusCategory: "new" },
      { type: "Bloc", direction: "outward", statusCategory: "new" },
    ],
  });
  assert.equal(facts.blocksOpenCount, 5);
  assert.equal(facts.duplicateLinks, 3);
});

test("[happy-4] a type naming both block and duplicate counts by direction", () => {
  const facts = factsOf({
    links: [
      { type: "Block-Duplicate", direction: "outward", statusCategory: "new" },
      { type: "Block-Duplicate", direction: "inward", statusCategory: "new" },
    ],
  });
  assert.equal(facts.blocksOpenCount, 1);
  assert.equal(facts.duplicateLinks, 1);
});

test("[happy-4] twenty open outward blocks are all counted", () => {
  const facts = factsOf({
    links: Array.from({ length: 20 }, () => ({
      type: "Blocks",
      direction: "outward" as const,
      statusCategory: "new",
    })),
  });
  assert.equal(facts.blocksOpenCount, 20);
  assert.equal(facts.duplicateLinks, 0);
});

// Extends "[happy-5] priority names map to ranks, trimmed and case-insensitive":
// other names, and names that are keys of Object.prototype.
test("[happy-5] other priority names map to ranks", () => {
  const cases: [string, string | null, IssueFacts["priorityRank"]][] = [
    ["LOWEST", "LOWEST", "low"],
    ["\tlow\n", "low", "low"],
    ["MINOR", "MINOR", "low"],
    ["trivial", "trivial", "low"],
    [" Normal ", "Normal", "medium"],
    ["MEDIUM", "MEDIUM", "medium"],
    ["Highest", "Highest", "high"],
    ["Critical", "Critical", "high"],
    ["Low Priority", "Low Priority", "high"],
    ["Med", "Med", "high"],
    ["\t \n", null, "none"],
  ];
  for (const [priority, name, rank] of cases) {
    const facts = factsOf({ priority });
    assert.equal(facts.priorityName, name, JSON.stringify(priority));
    assert.equal(facts.priorityRank, rank, JSON.stringify(priority));
  }
});

test("[happy-5] priority names that are Object.prototype keys rank high", () => {
  for (const priority of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    const facts = factsOf({ priority });
    assert.equal(facts.priorityName, priority);
    assert.equal(facts.priorityRank, "high", priority);
  }
});

test("[happy-5] PRIORITY_RANKS has exactly the six documented keys and factsFor ranks by them", () => {
  for (const key of Object.keys(PRIORITY_RANKS)) {
    assert.equal(factsOf({ priority: key.toUpperCase() }).priorityRank, PRIORITY_RANKS[key], key);
  }
  assert.deepEqual(PRIORITY_RANKS, {
    lowest: "low",
    trivial: "low",
    low: "low",
    minor: "low",
    medium: "medium",
    normal: "medium",
  });
});

// Extends "[boundary-7] mixed case counts as a bug, an empty type does not".
test("[boundary-7] other issue types to isBug", () => {
  const cases: [string, boolean][] = [
    ["bug", true],
    ["BUG", true],
    ["\tbug\n", true],
    ["defect", true],
    ["Defects", false],
    ["Bugs", false],
    ["Story", false],
    ["Bug Report", false],
    ["   ", false],
    ["constructor", false],
  ];
  for (const [issueType, isBug] of cases) {
    assert.equal(factsOf({ issueType }).isBug, isBug, JSON.stringify(issueType));
  }
});

// Extends "[boundary-8] dueInDays counts UTC calendar days from now's date":
// longer distances, month and year rollover, another now.
test("[boundary-8] dueInDays across months and years", () => {
  const cases: [string, number][] = [
    ["2027-01-01", 42],
    ["2026-11-30", 10],
    ["2026-12-01", 11],
    ["2026-01-01", -323],
    ["2027-11-20", 365],
    ["2026-11-10T00:00:00.000Z", -10],
  ];
  for (const [dueDate, days] of cases) {
    assert.equal(factsOf({ dueDate }).dueInDays, days, dueDate);
  }
});

test("[boundary-8] dueInDays uses now's UTC date whatever the time of day", () => {
  const lateNow = new Date("2026-11-20T23:59:59.999Z");
  assert.equal(factsOf({ dueDate: "2026-11-21" }, lateNow).dueInDays, 1);
  assert.equal(factsOf({ dueDate: "2026-11-20" }, lateNow).dueInDays, 0);
  const earlyNow = new Date("2026-11-20T00:00:00.000Z");
  assert.equal(factsOf({ dueDate: "2026-11-20T23:59:59.000Z" }, earlyNow).dueInDays, 0);
  assert.equal(factsOf({ dueDate: "2026-11-19T23:59:59.000Z" }, earlyNow).dueInDays, -1);
});

test("[boundary-8] dueInDays counts a leap day", () => {
  const now = new Date("2028-02-28T12:00:00.000Z");
  assert.equal(factsOf({ dueDate: "2028-03-01" }, now).dueInDays, 2);
  assert.equal(factsOf({ dueDate: "2028-02-29" }, now).dueInDays, 1);
});

test("[boundary-8] an empty or unparseable due date gives null", () => {
  assert.equal(factsOf({ dueDate: "" }).dueInDays, null);
  assert.equal(factsOf({ dueDate: "next week" }).dueInDays, null);
});

// Extends "[happy-6] the nearest upcoming unreleased release is chosen":
// another now, longer lists, ties later in the list.
test("[happy-6] the chosen release moves with now", () => {
  const releases = [
    { name: "2.3", releaseDate: "2026-11-10", released: false },
    { name: "2.5", releaseDate: "2026-12-15", released: false },
    { name: "2.4", releaseDate: "2026-12-02", released: false },
  ];
  assert.deepEqual(factsOf({ releases }, new Date("2026-12-03T00:00:00.000Z")).release, {
    name: "2.5",
    inDays: 12,
  });
  assert.deepEqual(factsOf({ releases }, new Date("2026-11-01T00:00:00.000Z")).release, {
    name: "2.3",
    inDays: 9,
  });
});

test("[happy-6] the nearest release is chosen from a long unsorted list", () => {
  const facts = factsOf({
    releases: [
      { name: "r9", releaseDate: "2027-06-01", released: false },
      { name: "r1", releaseDate: "2026-11-21", released: true },
      { name: "r7", releaseDate: "2027-01-15", released: false },
      { name: "r0", releaseDate: "2026-11-19", released: false },
      { name: "r5", releaseDate: "bad", released: false },
      { name: "r3", releaseDate: "2026-11-24", released: false },
      { name: "r4", releaseDate: "2026-11-24", released: false },
      { name: "r8", releaseDate: "2026-12-24", released: false },
    ],
  });
  assert.deepEqual(facts.release, { name: "r3", inDays: 4 });
});

test("[happy-6] a tie goes to the first in input order even after a farther release", () => {
  const facts = factsOf({
    releases: [
      { name: "far", releaseDate: "2027-01-01", released: false },
      { name: "first", releaseDate: "2026-12-05", released: false },
      { name: "second", releaseDate: "2026-12-05", released: false },
      { name: "third", releaseDate: "2026-12-05T20:00:00.000Z", released: false },
    ],
  });
  assert.deepEqual(facts.release, { name: "first", inDays: 15 });
});

test("[happy-6] a release with a time is measured by its UTC date", () => {
  const facts = factsOf({
    releases: [{ name: "late", releaseDate: "2026-11-20T00:00:01.000Z", released: false }],
  });
  assert.deepEqual(facts.release, { name: "late", inDays: 0 });
});

// Extends "[boundary-9] only released, past or undated releases leaves release null".
test("[boundary-9] no releases, or only released ones, leave release null", () => {
  assert.equal(factsOf({ releases: [] }).release, null);
  assert.equal(
    factsOf({
      releases: [
        { name: "a", releaseDate: "2026-11-20", released: true },
        { name: "b", releaseDate: "2026-12-20", released: true },
        { name: "c", releaseDate: "2027-12-20", released: true },
      ],
    }).release,
    null,
  );
});

test("[boundary-9] many past and undated unreleased releases leave release null", () => {
  assert.equal(
    factsOf({
      releases: [
        { name: "a", releaseDate: "2026-11-19T23:59:59.000Z", released: false },
        { name: "b", releaseDate: "2020-01-01", released: false },
        { name: "c", releaseDate: "", released: false },
        { name: "d", releaseDate: null, released: false },
      ],
    }).release,
    null,
  );
});
