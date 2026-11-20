import { expect, test } from "vitest";

import {
  setupComplete,
  setupStage,
  setupSteps,
  type SetupFacts,
  type SetupStage,
  type SetupStep,
  type SetupStepId,
} from "../src/features/onboarding/setup";

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

/** The invariants of the current step, for any list setupSteps returns. */
function expectOneCurrentAtMost(steps: readonly SetupStep[]) {
  const current = steps.filter((s) => s.current);
  expect(current.length).toBeLessThanOrEqual(1);
  for (const s of current) expect(s.done).toBe(false);
  if (steps.some((s) => !s.done)) expect(current).toHaveLength(1);
}

// Tables of the spec, as facts, reused where a scenario covers "every row of
// every table in this spec" or "any facts in this spec".

const STAGE_ROWS: ReadonlyArray<[Changes, SetupStage]> = [
  [{}, "barebone"],
  [{ jira: { connected: 1 } }, "jira"],
  [{ jira: { connected: 3 } }, "jira"],
  [{ github: { repositories: 1 } }, "github"],
  [{ github: { connected: 2, repositories: 5 } }, "github"],
  [{ jira: { connected: 1 }, github: { repositories: 1 } }, "both"],
  [{ jira: { connected: 2 }, github: { connected: 1 } }, "both"],
];

const BROKEN_ROWS: ReadonlyArray<[Changes, SetupStage]> = [
  [{ jira: { broken: 3 } }, "barebone"],
  [{ jira: { broken: 2 }, github: { repositories: 1 } }, "github"],
  [{ jira: { connected: 1, broken: 4 } }, "jira"],
];

const UNOFFERED_STAGE_ROWS: ReadonlyArray<[Changes, SetupStage]> = [
  [{ jira: { available: false, connected: 1 } }, "jira"],
  [{ github: { available: false, repositories: 1 } }, "github"],
  [
    {
      jira: { available: false, connected: 1 },
      github: { available: false, repositories: 1 },
    },
    "both",
  ],
  [{ jira: { available: false }, github: { available: false } }, "barebone"],
];

const IGNORED_ROWS: ReadonlyArray<[Changes, SetupStage]> = [
  [
    { jira: { boards: 5 }, proposals: 10, bounties: 4, canManage: false },
    "barebone",
  ],
  [{ jira: { connected: 1 }, canManage: true }, "jira"],
  [{ jira: { connected: 1 }, canManage: false }, "jira"],
];

const MALFORMED_ROWS: ReadonlyArray<[Changes, SetupStage]> = [
  [{ jira: { connected: -1 } }, "barebone"],
  [{ jira: { connected: Number.NaN } }, "barebone"],
  [{ github: { connected: -2, repositories: -1 } }, "barebone"],
  [{ github: { repositories: 0.5 } }, "github"],
];

const ORDER_ROWS: ReadonlyArray<[Changes, SetupStepId[]]> = [
  [{}, ["jira", "github", "size"]],
  [{ jira: { connected: 1 } }, ["jira", "github", "size"]],
  [{ github: { repositories: 1 } }, ["github", "size", "jira"]],
  [
    { jira: { connected: 1 }, github: { repositories: 1 } },
    ["jira", "github", "size"],
  ],
];

const UNOFFERED_STEP_ROWS: ReadonlyArray<[Changes, SetupStepId[]]> = [
  [{ jira: { available: false } }, ["github", "size"]],
  [{ github: { available: false } }, ["jira", "size"]],
  [{ jira: { available: false }, github: { available: false } }, ["size"]],
  [
    { jira: { available: false }, github: { repositories: 1 } },
    ["github", "size"],
  ],
  [{ github: { available: false, repositories: 1 } }, ["size", "jira"]],
  [
    {
      jira: { available: false, connected: 1 },
      github: { available: false, repositories: 1 },
    },
    ["size"],
  ],
];

const COMPLETE_ROWS: ReadonlyArray<[Changes, boolean]> = [
  [{}, false],
  [{ jira: { connected: 1 }, github: { repositories: 1 }, proposals: 1 }, true],
  [
    { jira: { connected: 1 }, github: { repositories: 1 }, proposals: 0 },
    false,
  ],
  [{ jira: { connected: 1 }, github: { connected: 1 }, proposals: 1 }, false],
  [{ github: { repositories: 1 }, proposals: 1 }, false],
  [
    { jira: { available: false }, github: { repositories: 1 }, proposals: 1 },
    true,
  ],
  [
    { jira: { connected: 1 }, github: { available: false }, proposals: 1 },
    true,
  ],
  [
    { jira: { available: false }, github: { available: false }, proposals: 1 },
    true,
  ],
  [{ jira: { available: false }, github: { available: false } }, false],
];

const SINGLE_FACTS: readonly Changes[] = [
  { github: { connected: 1, repositories: 0 } },
  {
    jira: { connected: -1 },
    github: { repositories: Number.NaN },
    proposals: -3,
  },
  { jira: { connected: 1 } },
  { jira: { connected: 1 }, github: { repositories: 1 }, bounties: 7 },
  { jira: { broken: 2, boards: 3 } },
  { github: { repositories: 2 } },
  { jira: { available: false } },
  { jira: { available: false, connected: 1 } },
  { jira: { connected: 1 }, proposals: 2 },
  { jira: { connected: 1 }, github: { repositories: 1 }, proposals: 1 },
  { jira: { connected: 1 }, canManage: false },
  { jira: { broken: 1 }, github: { repositories: 1 }, proposals: 1 },
];

const EVERY_SPEC_FACTS: readonly SetupFacts[] = [
  ...[
    ...STAGE_ROWS,
    ...BROKEN_ROWS,
    ...UNOFFERED_STAGE_ROWS,
    ...IGNORED_ROWS,
    ...MALFORMED_ROWS,
    ...ORDER_ROWS,
    ...UNOFFERED_STEP_ROWS,
    ...COMPLETE_ROWS,
  ].map(([changes]) => facts(changes)),
  ...SINGLE_FACTS.map((changes) => facts(changes)),
];

/** A fixed grid of odd and ordinary facts beyond the spec's tables. */
const GRID_FACTS: readonly SetupFacts[] = (() => {
  const counts = [0, 1, -1, Number.NaN, 0.5];
  const grid: SetupFacts[] = [];
  for (const jiraAvailable of [true, false])
    for (const githubAvailable of [true, false])
      for (const connected of counts)
        for (const githubConnected of [0, 1])
          for (const repositories of counts)
            for (const proposals of counts)
              grid.push(
                facts({
                  jira: { available: jiraAvailable, connected, broken: 1 },
                  github: {
                    available: githubAvailable,
                    connected: githubConnected,
                    repositories,
                  },
                  proposals,
                  bounties: 3,
                }),
              );
  return grid;
})();

// --- @happy -----------------------------------------------------------------

test("[happy-1] each combination of connections gives its stage", () => {
  for (const [changes, stage] of STAGE_ROWS) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

test("[happy-1] the smallest counts above zero still connect each tool", () => {
  const tiny = Number.MIN_VALUE;
  expect(setupStage(facts({ jira: { connected: tiny } }))).toBe("jira");
  expect(setupStage(facts({ github: { connected: tiny } }))).toBe("github");
  expect(setupStage(facts({ github: { repositories: tiny } }))).toBe("github");
  expect(
    setupStage(
      facts({
        jira: { connected: Number.MAX_SAFE_INTEGER },
        github: { repositories: tiny },
      }),
    ),
  ).toBe("both");
});

test("[happy-2] a workspace with nothing connected has every step to do, starting with Jira", () => {
  expect(setupSteps(facts())).toEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", false, false),
  ]);
});

test("[happy-2] negative zero counts are still nothing connected", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: -0 },
        github: { connected: -0, repositories: -0 },
        proposals: -0,
      }),
    ),
  ).toEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", false, false),
  ]);
});

test("[happy-3] connecting Jira finishes its step and moves on to GitHub", () => {
  expect(setupSteps(facts({ jira: { connected: 1 } }))).toEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", false, false),
  ]);
});

test("[happy-3] a fractional Jira connection above zero finishes its step", () => {
  expect(setupSteps(facts({ jira: { connected: 0.5 } }))).toEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", false, false),
  ]);
});

test("[happy-4] the order of the steps follows the stage", () => {
  for (const [changes, order] of ORDER_ROWS) {
    expect(ids(setupSteps(facts(changes)))).toEqual(order);
  }
});

test("[happy-4] a GitHub account alone puts the steps in the github stage's order", () => {
  expect(
    ids(setupSteps(facts({ github: { connected: 1, repositories: 0 } }))),
  ).toEqual(["github", "size", "jira"]);
});

test("[happy-5] in the github stage the size step comes before Jira", () => {
  expect(setupSteps(facts({ github: { repositories: 2 } }))).toEqual([
    step("github", true, false),
    step("size", false, true),
    step("jira", false, false),
  ]);
});

test("[happy-5] in the github stage with sizing done, Jira last is the current step", () => {
  expect(
    setupSteps(facts({ github: { repositories: 2 }, proposals: 1 })),
  ).toEqual([
    step("github", true, false),
    step("size", true, false),
    step("jira", false, true),
  ]);
});

test("[happy-6] completion follows the listed steps", () => {
  for (const [changes, complete] of COMPLETE_ROWS) {
    expect(setupComplete(facts(changes))).toBe(complete);
  }
});

test("[happy-6] fractional counts above zero complete the checklist, bounties alone do not", () => {
  expect(
    setupComplete(
      facts({
        jira: { connected: 0.5 },
        github: { repositories: 0.5 },
        proposals: 0.5,
      }),
    ),
  ).toBe(true);
  expect(
    setupComplete(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 0,
        bounties: 9,
      }),
    ),
  ).toBe(false);
});

// --- @boundary --------------------------------------------------------------

test("[boundary-1] a GitHub account with no repository picked is already the github stage", () => {
  expect(setupStage(facts({ github: { connected: 1, repositories: 0 } }))).toBe(
    "github",
  );
});

test("[boundary-1] a GitHub account with no repository and a Jira connection is both", () => {
  expect(
    setupStage(
      facts({
        jira: { connected: 1 },
        github: { connected: 1, repositories: 0 },
      }),
    ),
  ).toBe("both");
});

test("[boundary-2] a tool the server does not offer still stages by its counts", () => {
  for (const [changes, stage] of UNOFFERED_STAGE_ROWS) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

test("[boundary-2] an unoffered GitHub with only an account still stages as github", () => {
  expect(
    setupStage(
      facts({ github: { available: false, connected: 1, repositories: 0 } }),
    ),
  ).toBe("github");
});

test("[boundary-3] boards, proposals, bounties and permissions do not move the stage", () => {
  for (const [changes, stage] of IGNORED_ROWS) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

test("[boundary-3] large boards, proposals and bounties leave the github and both stages alone", () => {
  const ignored = {
    proposals: Number.MAX_SAFE_INTEGER,
    bounties: Number.MAX_SAFE_INTEGER,
    canManage: false,
  };
  expect(
    setupStage(
      facts({
        ...ignored,
        jira: { boards: Number.MAX_SAFE_INTEGER },
        github: { repositories: 1 },
      }),
    ),
  ).toBe("github");
  expect(
    setupStage(
      facts({
        ...ignored,
        jira: { connected: 1, boards: Number.MAX_SAFE_INTEGER },
        github: { connected: 1 },
      }),
    ),
  ).toBe("both");
});

test("[boundary-4] a connected GitHub account with no repository leaves the github step to do", () => {
  expect(
    setupSteps(facts({ github: { connected: 1, repositories: 0 } })),
  ).toEqual([
    step("github", false, true),
    step("size", false, false),
    step("jira", false, false),
  ]);
});

test("[boundary-4] in the both stage a GitHub account with no repository is the current step", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 1 },
        github: { connected: 5, repositories: 0 },
      }),
    ),
  ).toEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", false, false),
  ]);
});

test("[boundary-5] bounties without proposals do not finish the size step", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 0,
        bounties: 7,
      }),
    ),
  ).toEqual([
    step("jira", true, false),
    step("github", true, false),
    step("size", false, true),
  ]);
});

test("[boundary-5] in the github stage bounties without proposals leave size current", () => {
  expect(
    setupSteps(
      facts({ github: { repositories: 1 }, proposals: 0, bounties: 7 }),
    ),
  ).toEqual([
    step("github", true, false),
    step("size", false, true),
    step("jira", false, false),
  ]);
});

test("[boundary-6] unavailable tools drop their steps and keep the stage's order for the rest", () => {
  for (const [changes, order] of UNOFFERED_STEP_ROWS) {
    expect(ids(setupSteps(facts(changes)))).toEqual(order);
  }
});

test("[boundary-6] an unoffered GitHub with only an account keeps the github stage's order", () => {
  expect(
    ids(
      setupSteps(
        facts({ github: { available: false, connected: 1, repositories: 0 } }),
      ),
    ),
  ).toEqual(["size", "jira"]);
});

test("[boundary-7] the current step is chosen among the steps that are listed", () => {
  expect(setupSteps(facts({ jira: { available: false } }))).toEqual([
    step("github", false, true),
    step("size", false, false),
  ]);
});

test("[boundary-7] with GitHub unoffered and Jira done, size is the current step", () => {
  expect(
    setupSteps(facts({ jira: { connected: 1 }, github: { available: false } })),
  ).toEqual([step("jira", true, false), step("size", false, true)]);
});

test("[boundary-8] a Jira connection on a server that no longer offers Jira stages as jira but lists no jira step", () => {
  const given = facts({ jira: { available: false, connected: 1 } });
  expect(setupStage(given)).toBe("jira");
  expect(setupSteps(given)).toEqual([
    step("github", false, true),
    step("size", false, false),
  ]);
});

test("[boundary-8] an unoffered Jira connection with a repository stages as both and lists no jira step", () => {
  const given = facts({
    jira: { available: false, connected: 1 },
    github: { repositories: 1 },
  });
  expect(setupStage(given)).toBe("both");
  expect(setupSteps(given)).toEqual([
    step("github", true, false),
    step("size", false, true),
  ]);
});

test("[boundary-9] a later done step does not move the current step past an earlier one", () => {
  expect(setupSteps(facts({ jira: { connected: 1 }, proposals: 2 }))).toEqual([
    step("jira", true, false),
    step("github", false, true),
    step("size", true, false),
  ]);
});

test("[boundary-9] with only proposals, the first step stays current", () => {
  expect(setupSteps(facts({ proposals: 2 }))).toEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", true, false),
  ]);
});

test("[boundary-10] with every step done, none is current", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 1 },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toEqual([
    step("jira", true, false),
    step("github", true, false),
    step("size", true, false),
  ]);
});

test("[boundary-10] with every listed step done in the github stage, none is current", () => {
  expect(
    setupSteps(
      facts({
        jira: { available: false },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toEqual([step("github", true, false), step("size", true, false)]);
});

test("[boundary-11] at most one step is current, and only a not-done one, for the spec's facts", () => {
  for (const given of EVERY_SPEC_FACTS) {
    expectOneCurrentAtMost(setupSteps(given));
  }
});

test("[boundary-11] at most one step is current, and only a not-done one, across odd counts", () => {
  for (const given of GRID_FACTS) {
    expectOneCurrentAtMost(setupSteps(given));
  }
});

test("[boundary-12] a member who cannot manage sees the same checklist", () => {
  const expected = [
    step("jira", true, false),
    step("github", false, true),
    step("size", false, false),
  ];
  expect(
    setupSteps(facts({ jira: { connected: 1 }, canManage: true })),
  ).toEqual(expected);
  expect(
    setupSteps(facts({ jira: { connected: 1 }, canManage: false })),
  ).toEqual(expected);
});

test("[boundary-12] a member who cannot manage sees the same github stage checklist", () => {
  const expected = [
    step("github", true, false),
    step("size", false, true),
    step("jira", false, false),
  ];
  expect(
    setupSteps(facts({ github: { repositories: 1 }, canManage: true })),
  ).toEqual(expected);
  expect(
    setupSteps(facts({ github: { repositories: 1 }, canManage: false })),
  ).toEqual(expected);
});

test("[boundary-13] setupComplete agrees with setupSteps for every row in the spec", () => {
  for (const given of EVERY_SPEC_FACTS) {
    expect(setupComplete(given)).toBe(setupSteps(given).every((s) => s.done));
  }
});

test("[boundary-13] setupComplete agrees with setupSteps across odd counts", () => {
  for (const given of GRID_FACTS) {
    expect(setupComplete(given)).toBe(setupSteps(given).every((s) => s.done));
  }
});

test("[boundary-14] deeply frozen facts are accepted and left unchanged", () => {
  const given = deepFreeze(facts({ jira: { connected: 1 } }));
  expect(() => setupStage(given)).not.toThrow();
  expect(() => setupSteps(given)).not.toThrow();
  expect(() => setupComplete(given)).not.toThrow();
  expect(given).toEqual(facts({ jira: { connected: 1 } }));
});

test("[boundary-14] deeply frozen facts with an unoffered tool and odd counts are left unchanged", () => {
  const changes: Changes = {
    jira: { available: false, connected: Number.NaN, broken: 2 },
    github: { connected: 1, repositories: 0 },
    proposals: -1,
    canManage: false,
  };
  const given = deepFreeze(facts(changes));
  expect(setupStage(given)).toBe("github");
  expect(setupSteps(given)).toEqual([
    step("github", false, true),
    step("size", false, false),
  ]);
  expect(setupComplete(given)).toBe(false);
  expect(given).toEqual(facts(changes));
});

test("[boundary-15] each call returns its own array", () => {
  const given = facts({ jira: { connected: 1 } });
  const first = setupSteps(given);
  const second = setupSteps(given);
  expect(first).toEqual(second);
  expect(first).not.toBe(second);
  first.forEach((s, i) => expect(s).not.toBe(second[i]));
  const snapshot = second.map((s) => ({ ...s }));
  Reflect.set(first[0] as object, "done", !first[0]?.done);
  Reflect.set(first[0] as object, "current", !first[0]?.current);
  expect(second).toEqual(snapshot);
  for (const s of [...first, ...second]) {
    expect(Object.keys(s).sort()).toEqual(["current", "done", "id"]);
  }
});

test("[boundary-15] a one-step checklist is still a new array of a new object", () => {
  const given = facts({
    jira: { available: false },
    github: { available: false },
    proposals: 1,
  });
  const first = setupSteps(given);
  const second = setupSteps(given);
  expect(first).toEqual([step("size", true, false)]);
  expect(second).toEqual([step("size", true, false)]);
  expect(first).not.toBe(second);
  expect(first[0]).not.toBe(second[0]);
  first.push(step("jira", false, true));
  Reflect.set(first[0] as object, "done", false);
  expect(second).toEqual([step("size", true, false)]);
  expect(Object.keys(second[0] as object).sort()).toEqual([
    "current",
    "done",
    "id",
  ]);
});

// --- @unhappy ---------------------------------------------------------------

test("[unhappy-1] only broken Jira sites leave the workspace where it would be without them", () => {
  for (const [changes, stage] of BROKEN_ROWS) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

test("[unhappy-1] any number of broken Jira sites never moves the stage", () => {
  for (const broken of [Number.MAX_SAFE_INTEGER, -1, Number.NaN]) {
    expect(setupStage(facts({ jira: { broken } }))).toBe("barebone");
    expect(
      setupStage(
        facts({ jira: { broken }, github: { connected: 1, repositories: 0 } }),
      ),
    ).toBe("github");
    expect(
      setupStage(
        facts({ jira: { connected: 1, broken }, github: { connected: 1 } }),
      ),
    ).toBe("both");
  }
});

test("[unhappy-2] malformed counts are read without throwing", () => {
  for (const [changes, stage] of MALFORMED_ROWS) {
    const given = facts(changes);
    expect(() => setupStage(given)).not.toThrow();
    expect(setupStage(given)).toBe(stage);
  }
});

test("[unhappy-2] infinite and NaN counts everywhere are read without throwing", () => {
  const nothing = facts({
    jira: { connected: -Infinity, broken: Number.NaN, boards: Number.NaN },
    github: { connected: Number.NaN, repositories: -Infinity },
    proposals: Number.NaN,
    bounties: Number.NaN,
  });
  expect(() => setupStage(nothing)).not.toThrow();
  expect(setupStage(nothing)).toBe("barebone");
  expect(
    setupStage(
      facts({ jira: { connected: Number.NaN }, github: { connected: 0.5 } }),
    ),
  ).toBe("github");
  expect(
    setupStage(
      facts({
        jira: { connected: Infinity },
        github: { repositories: Number.NaN },
      }),
    ),
  ).toBe("jira");
});

test("[unhappy-3] malformed counts leave their steps not done", () => {
  const given = facts({
    jira: { connected: -1 },
    github: { repositories: Number.NaN },
    proposals: -3,
  });
  expect(() => setupSteps(given)).not.toThrow();
  expect(setupSteps(given)).toEqual([
    step("jira", false, true),
    step("github", false, false),
    step("size", false, false),
  ]);
});

test("[unhappy-3] malformed counts are not done while a fraction above zero is", () => {
  const given = facts({
    jira: { connected: -Infinity },
    github: { repositories: 0.5 },
    proposals: Number.NaN,
  });
  expect(() => setupSteps(given)).not.toThrow();
  expect(setupSteps(given)).toEqual([
    step("github", true, false),
    step("size", false, true),
    step("jira", false, false),
  ]);
});

test("[unhappy-4] broken Jira sites and boards do not finish the jira step", () => {
  const steps = setupSteps(
    facts({ jira: { connected: 0, broken: 2, boards: 3 } }),
  );
  const jira = steps.find((s) => s.id === "jira");
  expect(jira?.done).toBe(false);
  expect(jira?.current).toBe(true);
});

test("[unhappy-4] broken Jira sites and boards leave the jira step to do in the github stage", () => {
  expect(
    setupSteps(
      facts({
        jira: { connected: 0, broken: 2, boards: 3 },
        github: { repositories: 1 },
        proposals: 1,
      }),
    ),
  ).toEqual([
    step("github", true, false),
    step("size", true, false),
    step("jira", false, true),
  ]);
});

test("[unhappy-5] broken Jira sites never complete the checklist", () => {
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

test("[unhappy-5] many broken sites with boards, bounties and a GitHub account still do not complete", () => {
  expect(
    setupComplete(
      facts({
        jira: { broken: Number.MAX_SAFE_INTEGER, boards: 9, connected: 0 },
        github: { connected: 1, repositories: 1 },
        proposals: 1,
        bounties: 4,
      }),
    ),
  ).toBe(false);
});
