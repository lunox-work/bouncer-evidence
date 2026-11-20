import assert from "node:assert/strict";
import { test } from "node:test";

import {
  factsFor,
  type IssueFacts,
  type SelectionIssue,
} from "../src/selection/index.js";

/**
 * `factsFor`: a ticket as read from the tracker, reduced to plain numbers and
 * flags against a fixed `now`. Every issue is the spec's "plain issue" with
 * the listed fields changed.
 */

const NOW = new Date("2026-11-20T12:00:00.000Z");

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

function factsOf(overrides: Partial<SelectionIssue> = {}): IssueFacts {
  return factsFor(issue(overrides), NOW);
}

test("[happy-1] the plain issue yields the plain facts and is left unchanged", () => {
  const input = issue();
  const before = structuredClone(input);
  assert.deepEqual(factsFor(input, NOW), PLAIN_FACTS);
  assert.deepEqual(input, before);
});

test("[happy-1] a plain issue with an explicit null comment count also yields the plain facts", () => {
  assert.deepEqual(factsOf({ commentCount: null }), PLAIN_FACTS);
});

test("[unhappy-1] an invalid now is not rejected and gives the plain facts", () => {
  let result: IssueFacts | undefined;
  assert.doesNotThrow(() => {
    result = factsFor(issue(), new Date("not a date"));
  });
  assert.deepEqual(result, PLAIN_FACTS);
});

test("[unhappy-1] an invalid now does not throw even when the issue carries dates", () => {
  assert.doesNotThrow(() =>
    factsFor(
      issue({
        created: "2026-05-01T12:00:00.000Z",
        updated: "2026-08-01T12:00:00.000Z",
        dueDate: "2026-12-01",
        closedSprints: [{ startDate: "2026-06-01T00:00:00.000Z", endDate: null }],
        releases: [{ name: "2.4", releaseDate: "2026-12-02", released: false }],
      }),
      new Date("not a date"),
    ),
  );
});

test("[happy-2] ageDays and daysSinceUpdate come from created and updated", () => {
  const facts = factsOf({
    created: "2026-05-01T12:00:00.000Z",
    updated: "2026-08-01T12:00:00.000Z",
  });
  assert.equal(facts.ageDays, 203);
  assert.equal(facts.daysSinceUpdate, 111);
});

test("[happy-2] daysSinceUpdate counts whole elapsed days, rounded down", () => {
  assert.equal(factsOf({ updated: "2026-11-19T12:00:00.000Z" }).daysSinceUpdate, 1);
  assert.equal(factsOf({ updated: "2026-11-19T12:00:00.001Z" }).daysSinceUpdate, 0);
  assert.equal(factsOf({ updated: "2026-11-18T12:00:00.001Z" }).daysSinceUpdate, 1);
});

test("[boundary-1] elapsed days round down and never go below zero", () => {
  const cases: [string | null, number][] = [
    ["2026-11-19T12:00:00.000Z", 1],
    ["2026-11-19T12:00:00.001Z", 0],
    ["2026-11-20T12:00:00.000Z", 0],
    ["2026-12-01T00:00:00.000Z", 0],
    ["yesterday", 0],
    [null, 0],
  ];
  for (const [created, ageDays] of cases) {
    assert.equal(factsOf({ created }).ageDays, ageDays, `created ${String(created)}`);
  }
});

test("[boundary-1] a created date one millisecond in the future gives an age of 0", () => {
  assert.equal(factsOf({ created: "2026-11-20T12:00:00.001Z" }).ageDays, 0);
});

test("[unhappy-2] an unparseable updated date counts as just updated", () => {
  const facts = factsOf({ created: "2025-01-01T00:00:00.000Z", updated: "garbage" });
  assert.equal(facts.ageDays, 688);
  assert.equal(facts.daysSinceUpdate, 0);
});

test("[unhappy-2] a missing or future updated date also counts as just updated", () => {
  assert.equal(
    factsOf({ created: "2025-01-01T00:00:00.000Z", updated: null }).daysSinceUpdate,
    0,
  );
  assert.equal(
    factsOf({ created: "2025-01-01T00:00:00.000Z", updated: "2027-01-01T00:00:00.000Z" })
      .daysSinceUpdate,
    0,
  );
});

test("[boundary-2] any non-null assignee, blank or not, is assigned", () => {
  const cases: [string | null, boolean][] = [
    ["acc-1", true],
    ["  ", true],
    ["", true],
    [null, false],
  ];
  for (const [assignee, assigned] of cases) {
    assert.equal(factsOf({ assignee }).assigned, assigned, `assignee ${JSON.stringify(assignee)}`);
  }
});

test("[boundary-2] an assignee changes only the assigned fact", () => {
  assert.deepEqual(factsOf({ assignee: "" }), { ...PLAIN_FACTS, assigned: true });
});

test("[boundary-3] inSprint is true for any current sprint whose state is not exactly closed", () => {
  const cases: [{ state: string } | null, boolean][] = [
    [{ state: "active" }, true],
    [{ state: "future" }, true],
    [{ state: "" }, true],
    [{ state: "closed" }, false],
    [{ state: " CLOSED " }, true],
    [null, false],
  ];
  for (const [sprint, inSprint] of cases) {
    assert.equal(factsOf({ sprint }).inSprint, inSprint, `sprint ${JSON.stringify(sprint)}`);
  }
});

test("[boundary-3] the closed check is case-sensitive", () => {
  assert.equal(factsOf({ sprint: { state: "Closed" } }).inSprint, true);
  assert.equal(factsOf({ sprint: { state: "closed " } }).inSprint, true);
});

test("[happy-3] carriedSince is the UTC month name of the earliest closed sprint", () => {
  const facts = factsOf({
    closedSprints: [
      { startDate: "2026-07-01T09:00:00.000Z", endDate: "2026-07-15T09:00:00.000Z" },
      { startDate: null, endDate: "2026-06-14T23:30:00.000Z" },
      { startDate: "bad", endDate: null },
    ],
  });
  assert.equal(facts.closedSprintCount, 3);
  assert.equal(facts.carriedSince, "June");
});

test("[happy-3] carriedSince uses the UTC month, not the month of the written offset", () => {
  // 2026-06-30T23:30-02:00 is 2026-07-01T01:30Z.
  const facts = factsOf({
    closedSprints: [
      { startDate: "2026-06-30T23:30:00.000-02:00", endDate: null },
      { startDate: "bad", endDate: "2026-08-10T00:00:00.000Z" },
    ],
  });
  assert.equal(facts.closedSprintCount, 2);
  assert.equal(facts.carriedSince, "July");
});

test("[boundary-4] a sprint from an earlier year names the year", () => {
  const facts = factsOf({
    closedSprints: [
      { startDate: "2026-02-02T09:00:00.000Z", endDate: "2026-02-16T09:00:00.000Z" },
      { startDate: "2025-12-01T00:00:00.000Z", endDate: "2025-12-15T00:00:00.000Z" },
    ],
  });
  assert.equal(facts.closedSprintCount, 2);
  assert.equal(facts.carriedSince, "December 2025");
});

test("[boundary-4] the year is compared in UTC, so a late-December local time in the current UTC year omits it", () => {
  // 2025-12-31T23:30-01:00 is 2026-01-01T00:30Z, the same UTC year as now.
  const facts = factsOf({
    closedSprints: [{ startDate: "2025-12-31T23:30:00.000-01:00", endDate: null }],
  });
  assert.equal(facts.closedSprintCount, 1);
  assert.equal(facts.carriedSince, "January");
});

test("[boundary-5] no parseable sprint date leaves carriedSince null", () => {
  const facts = factsOf({ closedSprints: [{ startDate: null, endDate: null }] });
  assert.equal(facts.closedSprintCount, 1);
  assert.equal(facts.carriedSince, null);
});

test("[boundary-5] unparseable start and end dates also leave carriedSince null", () => {
  const facts = factsOf({
    closedSprints: [
      { startDate: "bad", endDate: "worse" },
      { startDate: "", endDate: null },
    ],
  });
  assert.equal(facts.closedSprintCount, 2);
  assert.equal(facts.carriedSince, null);
});

test("[boundary-6] null votes and watchers become 0, a missing comment count becomes null, numbers are kept", () => {
  const cases: [
    Partial<SelectionIssue>,
    { votes: number; watchers: number; commentCount: number | null },
  ][] = [
    [{ votes: 4, watchers: 6, commentCount: 7 }, { votes: 4, watchers: 6, commentCount: 7 }],
    [{ votes: null, watchers: null, commentCount: null }, { votes: 0, watchers: 0, commentCount: null }],
    [
      { votes: 0, watchers: Infinity, commentCount: undefined },
      { votes: 0, watchers: Infinity, commentCount: null },
    ],
  ];
  for (const [input, expected] of cases) {
    const facts = factsOf(input);
    assert.deepEqual(
      { votes: facts.votes, watchers: facts.watchers, commentCount: facts.commentCount },
      expected,
    );
  }
});

test("[boundary-6] a comment count of 0 is kept as 0, not turned into null", () => {
  const facts = factsOf({ votes: 0, watchers: 0, commentCount: 0 });
  assert.equal(facts.votes, 0);
  assert.equal(facts.watchers, 0);
  assert.equal(facts.commentCount, 0);
});

test("[happy-4] links are counted by type, direction and status", () => {
  const facts = factsOf({
    links: [
      { type: "Blocks", direction: "outward", statusCategory: "In Progress" },
      { type: "Blocker", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "outward", statusCategory: "done" },
      { type: "Blocks", direction: "outward", statusCategory: "Done" },
      { type: "Blocks", direction: "inward", statusCategory: "new" },
      { type: "Duplicate", direction: "inward", statusCategory: "Done" },
      { type: "Duplicate", direction: "outward", statusCategory: "new" },
      { type: "Relates", direction: "outward", statusCategory: "new" },
    ],
  });
  assert.equal(facts.blocksOpenCount, 3);
  assert.equal(facts.duplicateLinks, 1);
});

test("[happy-4] link types match as case-insensitive substrings and the done check is exact", () => {
  const facts = factsOf({
    links: [
      { type: "is BLOCKED by", direction: "outward", statusCategory: "new" },
      { type: "Blocks", direction: "outward", statusCategory: " done" },
      { type: "Blocks", direction: "outward", statusCategory: "done" },
      { type: "IS DUPLICATED BY", direction: "inward", statusCategory: "done" },
      { type: "Cloners", direction: "inward", statusCategory: "new" },
    ],
  });
  assert.equal(facts.blocksOpenCount, 2);
  assert.equal(facts.duplicateLinks, 1);
});

test("[happy-5] priority names map to ranks, trimmed and case-insensitive", () => {
  const cases: [string | null, string | null, IssueFacts["priorityRank"]][] = [
    ["Lowest", "Lowest", "low"],
    [" TRIVIAL ", "TRIVIAL", "low"],
    ["Minor", "Minor", "low"],
    ["Low", "Low", "low"],
    ["Medium", "Medium", "medium"],
    ["normal", "normal", "medium"],
    ["High", "High", "high"],
    ["P2", "P2", "high"],
    ["  ", null, "none"],
    [null, null, "none"],
  ];
  for (const [priority, name, rank] of cases) {
    const facts = factsOf({ priority });
    assert.equal(facts.priorityName, name, `priority ${JSON.stringify(priority)}`);
    assert.equal(facts.priorityRank, rank, `priority ${JSON.stringify(priority)}`);
  }
});

test("[happy-5] an empty priority ranks none and an unknown name ranks high", () => {
  const empty = factsOf({ priority: "" });
  assert.equal(empty.priorityName, null);
  assert.equal(empty.priorityRank, "none");
  const unknown = factsOf({ priority: " Blocker " });
  assert.equal(unknown.priorityName, "Blocker");
  assert.equal(unknown.priorityRank, "high");
});

test("[boundary-7] isBug is true only for the trimmed, lower-cased types bug and defect", () => {
  const cases: [string, boolean][] = [
    ["Bug", true],
    [" DEFECT ", true],
    ["Incident", false],
    ["Bugfix", false],
    ["Task", false],
  ];
  for (const [issueType, isBug] of cases) {
    assert.equal(factsOf({ issueType }).isBug, isBug, `issueType ${JSON.stringify(issueType)}`);
  }
});

test("[boundary-7] mixed case counts as a bug, an empty type does not", () => {
  assert.equal(factsOf({ issueType: "DeFeCt" }).isBug, true);
  assert.equal(factsOf({ issueType: "" }).isBug, false);
  assert.equal(factsOf({ issueType: "Sub-bug" }).isBug, false);
});

test("[boundary-8] dueInDays counts UTC calendar days from now's date, negative when past", () => {
  const cases: [string | null, number | null][] = [
    ["2026-11-20", 0],
    ["2026-11-21", 1],
    ["2026-12-20", 30],
    ["2026-11-19", -1],
    ["2026-11-25T23:00:00.000Z", 5],
    ["soon", null],
    [null, null],
  ];
  for (const [dueDate, days] of cases) {
    assert.equal(factsOf({ dueDate }).dueInDays, days, `dueDate ${String(dueDate)}`);
  }
});

test("[boundary-8] dueInDays compares UTC dates, not elapsed time", () => {
  assert.equal(factsOf({ dueDate: "2026-11-20T00:00:00.000Z" }).dueInDays, 0);
  assert.equal(factsOf({ dueDate: "2026-11-20T23:59:59.999Z" }).dueInDays, 0);
  assert.equal(factsOf({ dueDate: "2026-11-21T00:00:00.000Z" }).dueInDays, 1);
  // 2026-11-21T01:00+05:00 is 2026-11-20T20:00Z.
  assert.equal(factsOf({ dueDate: "2026-11-21T01:00:00.000+05:00" }).dueInDays, 0);
});

test("[happy-6] the nearest upcoming unreleased release is chosen", () => {
  const facts = factsOf({
    releases: [
      { name: "2.3", releaseDate: "2026-11-10", released: false },
      { name: "2.5", releaseDate: "2026-12-15", released: false },
      { name: "2.4", releaseDate: "2026-12-02", released: false },
      { name: "2.2", releaseDate: "2026-11-25", released: true },
      { name: "3.0", releaseDate: null, released: false },
    ],
  });
  assert.deepEqual(facts.release, { name: "2.4", inDays: 12 });
});

test("[happy-6] a release due today is chosen, and a tie goes to the first in input order", () => {
  assert.deepEqual(
    factsOf({
      releases: [
        { name: "later", releaseDate: "2026-11-21", released: false },
        { name: "today", releaseDate: "2026-11-20", released: false },
      ],
    }).release,
    { name: "today", inDays: 0 },
  );
  assert.deepEqual(
    factsOf({
      releases: [
        { name: "a", releaseDate: "2026-12-01", released: false },
        { name: "b", releaseDate: "2026-12-01", released: false },
      ],
    }).release,
    { name: "a", inDays: 11 },
  );
});

test("[boundary-9] only released, past or undated releases leaves release null", () => {
  const facts = factsOf({
    releases: [
      { name: "2.2", releaseDate: "2026-11-25", released: true },
      { name: "2.3", releaseDate: "2026-11-19", released: false },
      { name: "3.0", releaseDate: null, released: false },
    ],
  });
  assert.equal(facts.release, null);
});

test("[boundary-9] an unparseable release date leaves release null", () => {
  const facts = factsOf({
    releases: [{ name: "4.0", releaseDate: "someday", released: false }],
  });
  assert.equal(facts.release, null);
});
