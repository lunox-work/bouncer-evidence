/**
 * Hidden tests for `setupSteps` and `setupComplete` (spec.md, "Home setup
 * stage and getting-started checklist"). Every scenario starts from the base
 * facts "nothing connected" and changes only the fields it names.
 */

import { expect, test } from "vitest";

import {
  setupComplete,
  setupStage,
  setupSteps,
  type SetupFacts,
  type SetupStep,
  type SetupStepId,
} from "../../src/features/onboarding/setup";

/** The fields a scenario changes from the base facts "nothing connected". */
interface Changes {
  readonly jira?: Partial<SetupFacts["jira"]>;
  readonly github?: Partial<SetupFacts["github"]>;
  readonly proposals?: number;
  readonly bounties?: number;
  readonly canManage?: boolean;
}

/** The base facts "nothing connected", changed only in the fields given. */
const facts = (changes: Changes = {}): SetupFacts => ({
  jira: {
    available: true,
    connected: 0,
    broken: 0,
    boards: 0,
    ...changes.jira,
  },
  github: {
    available: true,
    connected: 0,
    repositories: 0,
    ...changes.github,
  },
  proposals: changes.proposals ?? 0,
  bounties: changes.bounties ?? 0,
  canManage: changes.canManage ?? true,
});

const step = (id: SetupStepId, done: boolean, current: boolean): SetupStep => ({
  id,
  done,
  current,
});

const ids = (steps: readonly SetupStep[]) => steps.map((s) => s.id);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** The checklist as the spec's rules define it. */
function expectedSteps(given: SetupFacts): SetupStep[] {
  const jira = given.jira.connected > 0;
  const github = given.github.connected > 0 || given.github.repositories > 0;
  const order: SetupStepId[] =
    github && !jira ? ["github", "size", "jira"] : ["jira", "github", "size"];
  const listed = order.filter(
    (id) =>
      id === "size" ||
      (id === "jira" ? given.jira.available : given.github.available),
  );
  const done: Record<SetupStepId, boolean> = {
    jira: given.jira.connected > 0,
    github: given.github.repositories > 0,
    size: given.proposals > 0,
  };
  const first = listed.findIndex((id) => !done[id]);
  return listed.map((id, i) => step(id, done[id], i === first));
}

const COUNTS = [
  0,
  -0,
  1,
  4,
  0.5,
  Number.MIN_VALUE,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

/** Every combination of the fields the checklist reads, the rest varied. */
const GRID: readonly SetupFacts[] = (() => {
  const githubCounts = [0, 1, 0.5, -1, Number.NaN];
  const grid: SetupFacts[] = [];
  let i = 0;
  for (const jiraAvailable of [true, false])
    for (const githubAvailable of [true, false])
      for (const connected of COUNTS)
        for (const githubConnected of githubCounts)
          for (const repositories of COUNTS)
            for (const proposals of COUNTS) {
              i += 1;
              grid.push(
                facts({
                  jira: {
                    available: jiraAvailable,
                    connected,
                    broken: COUNTS[i % COUNTS.length],
                    boards: COUNTS[(i * 3) % COUNTS.length],
                  },
                  github: {
                    available: githubAvailable,
                    connected: githubConnected,
                    repositories,
                  },
                  proposals,
                  bounties: COUNTS[(i * 7) % COUNTS.length],
                  canManage: i % 2 === 0,
                }),
              );
            }
  return grid;
})();

/** Up to five facts where `check` fails, for a readable failure. */
function mismatches(check: (given: SetupFacts) => string | null): string[] {
  const wrong: string[] = [];
  for (const given of GRID) {
    const problem = check(given);
    if (problem !== null && wrong.length < 5) {
      wrong.push(`${JSON.stringify(given)}: ${problem}`);
    }
  }
  return wrong;
}

// --- @happy -----------------------------------------------------------------

test("[happy-2] hidden: nothing connected lists every step to do, starting with Jira", () => {
  expect(setupSteps(facts())).toStrictEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", false, false),
  ]);
});

// Extends "[happy-2] a workspace with nothing connected has every step to do,
// starting with Jira": the fields that never mark a step done, set high.
test("[happy-2] hidden: broken sites, boards, bounties and permissions leave every step to do", () => {
  expect(
    setupSteps(
      facts({
        jira: { broken: 3, boards: 8 },
        bounties: 12,
        canManage: false,
      }),
    ),
  ).toStrictEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", false, false),
  ]);
});

test("[happy-3] hidden: connecting Jira finishes its step and GitHub is current", () => {
  expect(setupSteps(facts({ jira: { connected: 1 } }))).toStrictEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", false, false),
  ]);
});

// Extends "[happy-3] connecting Jira finishes its step and moves on to
// GitHub": more sites, no boards needed, and bounties that change nothing.
test("[happy-3] hidden: any number of Jira sites finishes its step without boards", () => {
  for (const connected of [2, 9, 1000, Number.POSITIVE_INFINITY]) {
    expect(
      setupSteps(facts({ jira: { connected, boards: 0 }, bounties: 3 })),
    ).toStrictEqual([
      step("jira", true, false),
      step("github", false, true),
      step("size", false, false),
    ]);
  }
});

test("[happy-4] hidden: each row of the order table lists the stage's order", () => {
  const rows: ReadonlyArray<[Changes, SetupStepId[]]> = [
    [{}, ["jira", "github", "size"]],
    [{ jira: { connected: 1 } }, ["jira", "github", "size"]],
    [{ github: { repositories: 1 } }, ["github", "size", "jira"]],
    [
      { jira: { connected: 1 }, github: { repositories: 1 } },
      ["jira", "github", "size"],
    ],
  ];
  for (const [changes, order] of rows) {
    expect(ids(setupSteps(facts(changes)))).toEqual(order);
  }
});

// Extends "[happy-4] the order of the steps follows the stage": the github
// order must follow the stage, not "a repository and no Jira step done" or
// "github.repositories > 0" alone.
test("[happy-4] hidden: the order follows the stage when the stage comes from other counts", () => {
  const rows: ReadonlyArray<[Changes, SetupStepId[]]> = [
    [{ github: { connected: 0.5 } }, ["github", "size", "jira"]],
    [{ github: { connected: 3, repositories: Number.NaN } }, ["github", "size", "jira"]],
    [{ jira: { connected: -1 }, github: { repositories: 1 } }, ["github", "size", "jira"]],
    [{ jira: { connected: Number.NaN }, github: { connected: 2 } }, ["github", "size", "jira"]],
    [{ jira: { broken: 4, boards: 2 }, github: { repositories: 3 } }, ["github", "size", "jira"]],
    [{ github: { repositories: 1 }, proposals: 5 }, ["github", "size", "jira"]],
    [{ jira: { connected: 0.5 }, github: { connected: 1 } }, ["jira", "github", "size"]],
    [{ jira: { connected: 2 }, github: { connected: 1, repositories: 0 } }, ["jira", "github", "size"]],
    [{ github: { connected: -1, repositories: -1 } }, ["jira", "github", "size"]],
    [{ proposals: 3, bounties: 2 }, ["jira", "github", "size"]],
  ];
  for (const [changes, order] of rows) {
    expect(ids(setupSteps(facts(changes)))).toEqual(order);
  }
});

// Extends "[happy-4] the order of the steps follows the stage": every
// combination of counts with both tools offered.
test("[happy-4] hidden: with both tools offered the order is the stage's for every combination", () => {
  const wrong = mismatches((given) => {
    if (!given.jira.available || !given.github.available) return null;
    const order =
      setupStage(given) === "github"
        ? ["github", "size", "jira"]
        : ["jira", "github", "size"];
    const actual = ids(setupSteps(given));
    return JSON.stringify(actual) === JSON.stringify(order)
      ? null
      : `listed ${actual.join(", ")}`;
  });
  expect(wrong).toEqual([]);
});

test("[happy-5] hidden: in the github stage size comes before Jira and is current", () => {
  expect(setupSteps(facts({ github: { repositories: 2 } }))).toStrictEqual([
    step("github", true, false),
    step("size", false, true),
    step("jira", false, false),
  ]);
});

// Extends "[happy-5] in the github stage the size step comes before Jira":
// more repositories, an account as well, and the github stage reached by an
// account alone, where github is still to do.
test("[happy-5] hidden: in the github stage the steps keep github, size, jira whatever is done", () => {
  expect(
    setupSteps(facts({ github: { connected: 2, repositories: 40 } })),
  ).toStrictEqual([
    step("github", true, false),
    step("size", false, true),
    step("jira", false, false),
  ]);
  expect(
    setupSteps(facts({ github: { connected: 1 }, proposals: 1 })),
  ).toStrictEqual([
    step("github", false, true),
    step("size", true, false),
    step("jira", false, false),
  ]);
  expect(
    setupSteps(facts({ github: { repositories: 5 }, proposals: 3, bounties: 2 })),
  ).toStrictEqual([
    step("github", true, false),
    step("size", true, false),
    step("jira", false, true),
  ]);
});

test("[happy-6] hidden: each row of the completion table gives its result", () => {
  const rows: ReadonlyArray<[Changes, boolean]> = [
    [{}, false],
    [{ jira: { connected: 1 }, github: { repositories: 1 }, proposals: 1 }, true],
    [{ jira: { connected: 1 }, github: { repositories: 1 }, proposals: 0 }, false],
    [{ jira: { connected: 1 }, github: { connected: 1 }, proposals: 1 }, false],
    [{ github: { repositories: 1 }, proposals: 1 }, false],
    [{ jira: { available: false }, github: { repositories: 1 }, proposals: 1 }, true],
    [{ jira: { connected: 1 }, github: { available: false }, proposals: 1 }, true],
    [{ jira: { available: false }, github: { available: false }, proposals: 1 }, true],
    [{ jira: { available: false }, github: { available: false } }, false],
  ];
  for (const [changes, complete] of rows) {
    expect(setupComplete(facts(changes))).toBe(complete);
  }
});

// Extends "[happy-6] completion follows the listed steps": other
// combinations, where completion must read the listed steps, not the stage
// or the raw counts.
test("[happy-6] hidden: completion follows the listed steps in other combinations", () => {
  const rows: ReadonlyArray<[Changes, boolean]> = [
    // GitHub unoffered, github stage from the account; the jira step is listed and not done.
    [{ github: { available: false, connected: 1 }, proposals: 1 }, false],
    // Jira unoffered; an account without a repository leaves github to do.
    [{ jira: { available: false }, github: { connected: 1 }, proposals: 1 }, false],
    // Jira unoffered but connected; every listed step done.
    [
      { jira: { available: false, connected: 1 }, github: { repositories: 1 }, proposals: 1 },
      true,
    ],
    // A broken site cannot hold back a checklist that does not list Jira.
    [
      { jira: { available: false, broken: 3 }, github: { repositories: 1 }, proposals: 1 },
      true,
    ],
    [{ jira: { available: false }, github: { available: false }, proposals: 0.5 }, true],
    [{ jira: { available: false }, github: { available: false }, proposals: Number.NaN }, false],
    [{ jira: { available: false }, github: { available: false }, bounties: 9 }, false],
    [{ jira: { connected: 1 }, github: { available: false }, proposals: -1 }, false],
    [{ github: { available: false, repositories: 1 }, proposals: 1 }, false],
    [
      {
        jira: { connected: 3, boards: 0 },
        github: { connected: 0, repositories: 2 },
        proposals: 7,
        canManage: false,
      },
      true,
    ],
  ];
  for (const [changes, complete] of rows) {
    expect(setupComplete(facts(changes))).toBe(complete);
  }
});

// Extends "[happy-6] completion follows the listed steps": every
// combination, against the spec's rules.
test("[happy-6] hidden: completion matches the spec's listed steps for every combination", () => {
  const wrong = mismatches((given) => {
    const expected = expectedSteps(given).every((s) => s.done);
    const actual = setupComplete(given);
    return actual === expected ? null : `complete ${String(actual)}`;
  });
  expect(wrong).toEqual([]);
});

// --- @boundary --------------------------------------------------------------

test("[boundary-4] hidden: a GitHub account with no repository leaves the github step current", () => {
  expect(
    setupSteps(facts({ github: { connected: 1, repositories: 0 } })),
  ).toStrictEqual([
    step("github", false, true),
    step("size", false, false),
    step("jira", false, false),
  ]);
});

// Extends "[boundary-4] a connected GitHub account with no repository leaves
// the github step to do": more accounts, absent repository counts of other
// kinds, sizing done, and Jira unoffered.
test("[boundary-4] hidden: GitHub accounts without a repository never finish the github step", () => {
  for (const repositories of [-1, Number.NaN, Number.NEGATIVE_INFINITY]) {
    expect(
      setupSteps(facts({ github: { connected: 6, repositories } })),
    ).toStrictEqual([
      step("github", false, true),
      step("size", false, false),
      step("jira", false, false),
    ]);
  }
  expect(
    setupSteps(facts({ github: { connected: 1 }, proposals: 2 })),
  ).toStrictEqual([
    step("github", false, true),
    step("size", true, false),
    step("jira", false, false),
  ]);
  expect(
    setupSteps(facts({ jira: { available: false }, github: { connected: 1 } })),
  ).toStrictEqual([step("github", false, true), step("size", false, false)]);
});

test("[boundary-5] hidden: bounties without proposals leave the size step current", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 0,
        bounties: 7,
      }),
    ),
  ).toStrictEqual([
    step("jira", true, false),
    step("github", true, false),
    step("size", false, true),
  ]);
});

// Extends "[boundary-5] bounties without proposals do not finish the size
// step": huge bounties, malformed proposals, and a checklist of size alone.
test("[boundary-5] hidden: any number of bounties never finishes the size step", () => {
  for (const proposals of [0, -2, Number.NaN]) {
    expect(
      setupSteps(
        facts({
          jira: { connected: 1 },
          github: { repositories: 1 },
          proposals,
          bounties: Number.MAX_SAFE_INTEGER,
        }),
      ),
    ).toStrictEqual([
      step("jira", true, false),
      step("github", true, false),
      step("size", false, true),
    ]);
  }
  expect(
    setupSteps(
      facts({
        jira: { available: false },
        github: { available: false },
        bounties: 50,
      }),
    ),
  ).toStrictEqual([step("size", false, true)]);
});

test("[boundary-6] hidden: each row of the unoffered-step table keeps the stage's order", () => {
  const rows: ReadonlyArray<[Changes, SetupStepId[]]> = [
    [{ jira: { available: false } }, ["github", "size"]],
    [{ github: { available: false } }, ["jira", "size"]],
    [{ jira: { available: false }, github: { available: false } }, ["size"]],
    [{ jira: { available: false }, github: { repositories: 1 } }, ["github", "size"]],
    [{ github: { available: false, repositories: 1 } }, ["size", "jira"]],
    [
      {
        jira: { available: false, connected: 1 },
        github: { available: false, repositories: 1 },
      },
      ["size"],
    ],
  ];
  for (const [changes, order] of rows) {
    expect(ids(setupSteps(facts(changes)))).toEqual(order);
  }
});

// Extends "[boundary-6] unavailable tools drop their steps and keep the
// stage's order for the rest": the stages the table does not combine with
// each unoffered tool.
test("[boundary-6] hidden: unoffered tools drop their steps in the jira and both stages too", () => {
  const rows: ReadonlyArray<[Changes, SetupStepId[]]> = [
    [{ jira: { available: false, connected: 1 } }, ["github", "size"]],
    [{ jira: { connected: 1 }, github: { available: false } }, ["jira", "size"]],
    [
      { jira: { connected: 1 }, github: { available: false, connected: 1 } },
      ["jira", "size"],
    ],
    [
      { jira: { available: false, connected: 1 }, github: { connected: 1 } },
      ["github", "size"],
    ],
    [{ github: { available: false, connected: 2 } }, ["size", "jira"]],
    [
      { jira: { available: false }, github: { available: false, connected: 1 } },
      ["size"],
    ],
    [
      { jira: { available: false, connected: 1 }, github: { available: false } },
      ["size"],
    ],
  ];
  for (const [changes, order] of rows) {
    expect(ids(setupSteps(facts(changes)))).toEqual(order);
  }
});

// Extends "[boundary-6] unavailable tools drop their steps and keep the
// stage's order for the rest": every combination of availability and counts.
test("[boundary-6] hidden: the listed ids match the spec for every combination of availability and counts", () => {
  const wrong = mismatches((given) => {
    const expected = ids(expectedSteps(given));
    const actual = ids(setupSteps(given));
    return JSON.stringify(actual) === JSON.stringify(expected)
      ? null
      : `listed ${actual.join(", ")}, not ${expected.join(", ")}`;
  });
  expect(wrong).toEqual([]);
});

test("[boundary-7] hidden: with Jira unoffered the current step is GitHub", () => {
  expect(setupSteps(facts({ jira: { available: false } }))).toStrictEqual([
    step("github", false, true),
    step("size", false, false),
  ]);
});

// Extends "[boundary-7] the current step is chosen among the steps that are
// listed": a current step picked before dropping would fall on the dropped
// github step here.
test("[boundary-7] hidden: a dropped github step is never the current one", () => {
  expect(
    setupSteps(facts({ github: { available: false, connected: 1 }, proposals: 1 })),
  ).toStrictEqual([step("size", true, false), step("jira", false, true)]);
  expect(
    setupSteps(facts({ github: { available: false, connected: 1 } })),
  ).toStrictEqual([step("size", false, true), step("jira", false, false)]);
  expect(
    setupSteps(facts({ github: { available: false }, proposals: 1 })),
  ).toStrictEqual([step("jira", false, true), step("size", true, false)]);
  expect(
    setupSteps(facts({ jira: { available: false }, github: { available: false } })),
  ).toStrictEqual([step("size", false, true)]);
});

test("[boundary-8] hidden: an unoffered Jira connection stages as jira and lists no jira step", () => {
  const given = facts({ jira: { available: false, connected: 1 } });
  expect(setupStage(given)).toBe("jira");
  expect(setupSteps(given)).toStrictEqual([
    step("github", false, true),
    step("size", false, false),
  ]);
});

// Extends "[boundary-8] a Jira connection on a server that no longer offers
// Jira stages as jira but lists no jira step": more sites, sizing done, and
// the both stage with every listed step done.
test("[boundary-8] hidden: an unoffered Jira connection with other steps done lists no jira step", () => {
  const sized = facts({ jira: { available: false, connected: 5 }, proposals: 2 });
  expect(setupStage(sized)).toBe("jira");
  expect(setupSteps(sized)).toStrictEqual([
    step("github", false, true),
    step("size", true, false),
  ]);

  const done = facts({
    jira: { available: false, connected: 1 },
    github: { connected: 1, repositories: 3 },
    proposals: 1,
  });
  expect(setupStage(done)).toBe("both");
  expect(setupSteps(done)).toStrictEqual([
    step("github", true, false),
    step("size", true, false),
  ]);
});

test("[boundary-9] hidden: a later done step does not move the current step past GitHub", () => {
  expect(
    setupSteps(facts({ jira: { connected: 1 }, proposals: 2 })),
  ).toStrictEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", true, false),
  ]);
});

// Extends "[boundary-9] a later done step does not move the current step past
// an earlier one": other stages, and an earlier step to do after a run of
// done ones. "The step after the last done one" gets these wrong.
test("[boundary-9] hidden: the current step is the first not-done one in every stage", () => {
  expect(
    setupSteps(
      facts({ jira: { connected: 1 }, github: { connected: 1 }, proposals: 4 }),
    ),
  ).toStrictEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", true, false),
  ]);
  expect(
    setupSteps(facts({ github: { connected: 1 }, proposals: 1 })),
  ).toStrictEqual([
    step("github", false, true),
    step("size", true, false),
    step("jira", false, false),
  ]);
  expect(
    setupSteps(facts({ github: { repositories: 1, connected: 0 }, proposals: 0.5 })),
  ).toStrictEqual([
    step("github", true, false),
    step("size", true, false),
    step("jira", false, true),
  ]);
  expect(
    setupSteps(
      facts({ jira: { available: false }, github: { connected: 1 }, proposals: 1 }),
    ),
  ).toStrictEqual([step("github", false, true), step("size", true, false)]);
});

// Extends "[boundary-9] a later done step does not move the current step past
// an earlier one": every combination, against the spec's rules.
test("[boundary-9] hidden: done and current match the spec for every combination", () => {
  const wrong = mismatches((given) => {
    const expected = expectedSteps(given);
    const actual = setupSteps(given);
    return JSON.stringify(actual) === JSON.stringify(expected)
      ? null
      : `gave ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}`;
  });
  expect(wrong).toEqual([]);
});

test("[boundary-10] hidden: with every step done none is current", () => {
  expect(
    setupSteps(
      facts({ jira: { connected: 1 }, github: { repositories: 1 }, proposals: 1 }),
    ),
  ).toStrictEqual([
    step("jira", true, false),
    step("github", true, false),
    step("size", true, false),
  ]);
});

// Extends "[boundary-10] with every step done, none is current": larger and
// fractional counts, and shorter lists. "Leave the last step current" fails.
test("[boundary-10] hidden: every listed step done leaves none current, whatever the list", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 0.5 },
        github: { connected: 9, repositories: 30 },
        proposals: 200,
      }),
    ),
  ).toStrictEqual([
    step("jira", true, false),
    step("github", true, false),
    step("size", true, false),
  ]);
  expect(
    setupSteps(
      facts({ jira: { connected: 2 }, github: { available: false }, proposals: 1 }),
    ),
  ).toStrictEqual([step("jira", true, false), step("size", true, false)]);
  expect(
    setupSteps(
      facts({
        jira: { available: false },
        github: { available: false },
        proposals: 3,
      }),
    ),
  ).toStrictEqual([step("size", true, false)]);
});

test("[boundary-11] hidden: at most one current step, only a not-done one, across every combination", () => {
  const wrong = mismatches((given) => {
    const steps = setupSteps(given);
    const current = steps.filter((s) => s.current === true);
    if (current.length > 1) return "more than one current step";
    if (current.some((s) => s.done !== false)) return "a done step is current";
    if (steps.some((s) => s.done === false) && current.length !== 1)
      return "no current step while one is to do";
    if (steps.some((s) => typeof s.current !== "boolean" || typeof s.done !== "boolean"))
      return "done or current is not a boolean";
    return null;
  });
  expect(wrong).toEqual([]);
});

test("[boundary-12] hidden: a member who cannot manage sees the same jira-stage checklist", () => {
  const expected = [
    step("jira", true, false),
    step("github", false, true),
    step("size", false, false),
  ];
  expect(
    setupSteps(facts({ jira: { connected: 1 }, canManage: true })),
  ).toStrictEqual(expected);
  expect(
    setupSteps(facts({ jira: { connected: 1 }, canManage: false })),
  ).toStrictEqual(expected);
});

// Extends "[boundary-12] a member who cannot manage sees the same checklist":
// other stages, unoffered tools and a finished checklist.
test("[boundary-12] hidden: canManage never changes the checklist in any combination", () => {
  const wrong = mismatches((given) => {
    const managing = setupSteps({ ...given, canManage: true });
    const member = setupSteps({ ...given, canManage: false });
    return JSON.stringify(managing) === JSON.stringify(member)
      ? null
      : `${JSON.stringify(managing)} vs ${JSON.stringify(member)}`;
  });
  expect(wrong).toEqual([]);
  expect(
    setupSteps(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 1,
        canManage: false,
      }),
    ),
  ).toStrictEqual([
    step("jira", true, false),
    step("github", true, false),
    step("size", true, false),
  ]);
});

test("[boundary-13] hidden: setupComplete agrees with setupSteps across every combination", () => {
  const wrong = mismatches((given) => {
    const expected = setupSteps(given).every((s) => s.done);
    const actual = setupComplete(given);
    return actual === expected ? null : `complete ${String(actual)}`;
  });
  expect(wrong).toEqual([]);
  // The grid has both outcomes, so agreement is not trivially one-sided.
  expect(GRID.some((given) => setupComplete(given))).toBe(true);
  expect(GRID.some((given) => !setupComplete(given))).toBe(true);
});

test("[boundary-14] hidden: deeply frozen facts with Jira connected are accepted and unchanged", () => {
  const given = deepFreeze(facts({ jira: { connected: 1 } }));
  expect(setupStage(given)).toBe("jira");
  expect(setupSteps(given)).toStrictEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", false, false),
  ]);
  expect(setupComplete(given)).toBe(false);
  expect(given).toStrictEqual(facts({ jira: { connected: 1 } }));
});

// Extends "[boundary-14] deeply frozen facts are accepted and left
// unchanged": facts that are not frozen must be left unchanged too, so an
// implementation that cleans malformed counts in place fails here.
test("[boundary-14] hidden: unfrozen facts with malformed counts are left unchanged", () => {
  const changes: Changes = {
    jira: { connected: Number.NaN, broken: -2, boards: 0.5 },
    github: { connected: -1, repositories: 0.5 },
    proposals: Number.NEGATIVE_INFINITY,
    bounties: Number.NaN,
    canManage: false,
  };
  const given = facts(changes);
  const jira = given.jira;
  const github = given.github;
  setupStage(given);
  setupSteps(given);
  setupComplete(given);
  expect(given).toStrictEqual(facts(changes));
  expect(given.jira).toBe(jira);
  expect(given.github).toBe(github);
  expect(Object.keys(given).sort()).toEqual([
    "bounties",
    "canManage",
    "github",
    "jira",
    "proposals",
  ]);
});

// Extends "[boundary-14] deeply frozen facts are accepted and left
// unchanged": frozen facts in every stage, with both tools unoffered too.
test("[boundary-14] hidden: deeply frozen facts in every stage give the spec's answers", () => {
  const cases: readonly Changes[] = [
    {},
    { github: { repositories: 2 }, proposals: 1 },
    { jira: { connected: 1 }, github: { connected: 1, repositories: 1 }, proposals: 1 },
    { jira: { available: false }, github: { available: false }, proposals: 1 },
  ];
  for (const changes of cases) {
    const given = deepFreeze(facts(changes));
    const plain = facts(changes);
    expect(setupStage(given)).toBe(setupStage(plain));
    expect(setupSteps(given)).toStrictEqual(expectedSteps(plain));
    expect(setupComplete(given)).toBe(expectedSteps(plain).every((s) => s.done));
    expect(given).toStrictEqual(plain);
  }
});

test("[boundary-15] hidden: two calls with the same facts return their own arrays", () => {
  const given = facts({ github: { repositories: 1 } });
  const first = setupSteps(given);
  const second = setupSteps(given);
  expect(first).toStrictEqual(second);
  expect(first).not.toBe(second);
  first.forEach((s, i) => expect(s).not.toBe(second[i]));
  Reflect.set(first[1] as object, "current", false);
  Reflect.set(first[1] as object, "done", true);
  expect(second).toStrictEqual([
    step("github", true, false),
    step("size", false, true),
    step("jira", false, false),
  ]);
});

// Extends "[boundary-15] each call returns its own array": equal but distinct
// facts objects (a cache keyed by value), a third call after the first result
// was changed, and the exact keys for every combination of facts.
test("[boundary-15] hidden: changing a result never leaks into a later call with equal facts", () => {
  const changes: Changes = { jira: { connected: 1 }, proposals: 1 };
  const expected = [
    step("jira", true, false),
    step("github", false, true),
    step("size", true, false),
  ];
  const first = setupSteps(facts(changes));
  for (const s of first) {
    Reflect.set(s as object, "done", !s.done);
    Reflect.set(s as object, "current", !s.current);
    Reflect.set(s as object, "id", "github");
  }
  const second = setupSteps(facts(changes));
  expect(second).not.toBe(first);
  expect(second).toStrictEqual(expected);
  second.forEach((s, i) => expect(s).not.toBe(first[i]));
  expect(setupSteps(facts(changes))).toStrictEqual(expected);
});

test("[boundary-15] hidden: every step has exactly the keys id, done and current for every combination", () => {
  const wrong = mismatches((given) => {
    for (const s of setupSteps(given)) {
      const keys = Object.keys(s).sort();
      if (JSON.stringify(keys) !== JSON.stringify(["current", "done", "id"]))
        return `keys ${keys.join(", ")}`;
    }
    return null;
  });
  expect(wrong).toEqual([]);
});

// --- @unhappy ---------------------------------------------------------------

test("[unhappy-3] hidden: the spec's malformed counts leave every step to do", () => {
  const given = facts({
    jira: { connected: -1 },
    github: { repositories: Number.NaN },
    proposals: -3,
  });
  expect(() => setupSteps(given)).not.toThrow();
  expect(setupSteps(given)).toStrictEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", false, false),
  ]);
});

// Extends "[unhappy-3] malformed counts leave their steps not done": the
// malformed values swapped between fields, in the github stage, and with
// Infinity, which is present.
test("[unhappy-3] hidden: malformed counts on any field leave that step not done", () => {
  const swapped = facts({
    jira: { connected: Number.NaN },
    github: { repositories: -3 },
    proposals: -1,
  });
  expect(() => setupSteps(swapped)).not.toThrow();
  expect(setupSteps(swapped)).toStrictEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", false, false),
  ]);

  const githubStage = facts({
    jira: { connected: Number.NEGATIVE_INFINITY },
    github: { connected: 1, repositories: -1 },
    proposals: Number.NaN,
  });
  expect(() => setupSteps(githubStage)).not.toThrow();
  expect(setupSteps(githubStage)).toStrictEqual([
    step("github", false, true),
    step("size", false, false),
    step("jira", false, false),
  ]);

  expect(
    setupSteps(
      facts({
        jira: { connected: -2 },
        github: { repositories: Number.NaN },
        proposals: Number.POSITIVE_INFINITY,
      }),
    ),
  ).toStrictEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", true, false),
  ]);
});

test("[unhappy-4] hidden: broken sites and boards leave the jira step to do and current", () => {
  const steps = setupSteps(
    facts({ jira: { connected: 0, broken: 2, boards: 3 } }),
  );
  const jira = steps.find((s) => s.id === "jira");
  expect(jira).toStrictEqual(step("jira", false, true));
});

// Extends "[unhappy-4] broken Jira sites and boards do not finish the jira
// step": many broken sites and boards, with a malformed connected count, and
// the whole list rather than the jira step alone.
test("[unhappy-4] hidden: many broken sites and boards never finish the jira step", () => {
  for (const connected of [0, -1, Number.NaN]) {
    expect(
      setupSteps(
        facts({
          jira: { connected, broken: 40, boards: 25 },
          proposals: 1,
        }),
      ),
    ).toStrictEqual([
      step("jira", false, true),
      step("github", false, false),
      step("size", true, false),
    ]);
  }
  expect(
    setupSteps(
      facts({
        jira: { broken: 3, boards: 3 },
        github: { connected: 1 },
      }),
    ),
  ).toStrictEqual([
    step("github", false, true),
    step("size", false, false),
    step("jira", false, false),
  ]);
});

test("[unhappy-5] hidden: a broken site with everything else done does not complete", () => {
  expect(
    setupComplete(
      facts({
        jira: { broken: 1, connected: 0 },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toBe(false);
});

// Extends "[unhappy-5] broken Jira sites never complete the checklist":
// broken sites with boards, with malformed connected counts, and with
// everything else at large counts.
test("[unhappy-5] hidden: broken sites never complete the checklist whatever else is done", () => {
  for (const connected of [0, -1, Number.NaN, Number.NEGATIVE_INFINITY]) {
    expect(
      setupComplete(
        facts({
          jira: { connected, broken: 5, boards: 12 },
          github: { connected: 3, repositories: 30 },
          proposals: 100,
          bounties: 50,
          canManage: false,
        }),
      ),
    ).toBe(false);
  }
});
