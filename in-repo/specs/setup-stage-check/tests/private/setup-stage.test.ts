/**
 * Hidden tests for `setupStage` (spec.md, "Home setup stage and
 * getting-started checklist"). Every scenario starts from the base facts
 * "nothing connected" and changes only the fields it names.
 */

import { expect, test } from "vitest";

import {
  setupStage,
  type SetupFacts,
  type SetupStage,
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

/** The stage as the spec's rules define it. */
const expectedStage = (given: SetupFacts): SetupStage => {
  const jira = given.jira.connected > 0;
  const github = given.github.connected > 0 || given.github.repositories > 0;
  if (jira && github) return "both";
  if (jira) return "jira";
  if (github) return "github";
  return "barebone";
};

const COUNTS = [
  0,
  -0,
  1,
  3,
  0.5,
  Number.MIN_VALUE,
  -1,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.NEGATIVE_INFINITY,
];

/** Every combination of the counts the stage reads, with the rest varied. */
const GRID: readonly SetupFacts[] = (() => {
  const grid: SetupFacts[] = [];
  let i = 0;
  for (const jiraAvailable of [true, false])
    for (const githubAvailable of [true, false])
      for (const connected of COUNTS)
        for (const githubConnected of COUNTS)
          for (const repositories of COUNTS) {
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
                proposals: COUNTS[(i * 7) % COUNTS.length],
                bounties: COUNTS[(i * 11) % COUNTS.length],
                canManage: i % 2 === 0,
              }),
            );
          }
  return grid;
})();

// --- @happy -----------------------------------------------------------------

test("[happy-1] hidden: each row of the stage table gives its stage", () => {
  const rows: ReadonlyArray<[Changes, SetupStage]> = [
    [{}, "barebone"],
    [{ jira: { connected: 1 } }, "jira"],
    [{ jira: { connected: 3 } }, "jira"],
    [{ github: { repositories: 1 } }, "github"],
    [{ github: { connected: 2, repositories: 5 } }, "github"],
    [{ jira: { connected: 1 }, github: { repositories: 1 } }, "both"],
    [{ jira: { connected: 2 }, github: { connected: 1 } }, "both"],
  ];
  for (const [changes, stage] of rows) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

// Extends "[happy-1] each combination of connections gives its stage":
// other counts, and the combination of all three counts present.
test("[happy-1] hidden: large and mixed counts give the stage of what is connected", () => {
  expect(setupStage(facts({ jira: { connected: 250 } }))).toBe("jira");
  expect(setupStage(facts({ github: { connected: 40 } }))).toBe("github");
  expect(setupStage(facts({ github: { repositories: 900 } }))).toBe("github");
  expect(
    setupStage(
      facts({
        jira: { connected: 7 },
        github: { connected: 3, repositories: 12 },
      }),
    ),
  ).toBe("both");
  expect(
    setupStage(facts({ jira: { connected: 1 }, github: { connected: 1 } })),
  ).toBe("both");
  expect(
    setupStage(
      facts({ jira: { connected: 4 }, github: { repositories: 2 } }),
    ),
  ).toBe("both");
});

// Extends "[happy-1] each combination of connections gives its stage": a
// stage table tuned to the visible rows misses most of these combinations.
test("[happy-1] hidden: the stage follows the connection rule across every combination of counts", () => {
  const wrong: string[] = [];
  for (const given of GRID) {
    const actual = setupStage(given);
    const expected = expectedStage(given);
    if (actual !== expected && wrong.length < 5) {
      wrong.push(`${JSON.stringify(given)} gave ${actual}, not ${expected}`);
    }
  }
  expect(wrong).toEqual([]);
});

// The spec: "It is pure: same facts, same answer." An implementation that
// remembers an earlier call (a sticky stage) fails here.
test("[happy-1] hidden: the stage does not depend on earlier calls", () => {
  const sequence: ReadonlyArray<[Changes, SetupStage]> = [
    [{ jira: { connected: 1 }, github: { repositories: 1 } }, "both"],
    [{}, "barebone"],
    [{ github: { connected: 1 } }, "github"],
    [{ jira: { connected: 2 } }, "jira"],
    [{}, "barebone"],
    [{ jira: { connected: 1 }, github: { repositories: 1 } }, "both"],
    [{ github: { connected: 1 } }, "github"],
  ];
  for (let round = 0; round < 3; round += 1) {
    for (const [changes, stage] of sequence) {
      expect(setupStage(facts(changes))).toBe(stage);
    }
  }
});

// --- @boundary --------------------------------------------------------------

test("[boundary-1] hidden: a GitHub account with no repository picked is the github stage", () => {
  expect(setupStage(facts({ github: { connected: 1, repositories: 0 } }))).toBe(
    "github",
  );
});

// Extends "[boundary-1] a GitHub account with no repository picked is already
// the github stage": other account counts, and repository counts that are
// absent in other ways.
test("[boundary-1] hidden: any GitHub account count above zero stages as github without a repository", () => {
  for (const connected of [2, 17, 0.25, Number.MIN_VALUE]) {
    expect(setupStage(facts({ github: { connected, repositories: 0 } }))).toBe(
      "github",
    );
  }
  for (const repositories of [-1, Number.NaN, -0, Number.NEGATIVE_INFINITY]) {
    expect(
      setupStage(facts({ github: { connected: 1, repositories } })),
    ).toBe("github");
  }
});

test("[boundary-2] hidden: each row of the unoffered-tool table stages by its counts", () => {
  const rows: ReadonlyArray<[Changes, SetupStage]> = [
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
  for (const [changes, stage] of rows) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

// Extends "[boundary-2] a tool the server does not offer still stages by its
// counts": other combinations of availability and counts.
test("[boundary-2] hidden: availability never moves the stage in any combination", () => {
  const counts: readonly Changes[] = [
    {},
    { jira: { connected: 2 } },
    { github: { connected: 3 } },
    { github: { repositories: 4 } },
    { jira: { connected: 1 }, github: { connected: 1 } },
    { jira: { connected: -1 }, github: { repositories: Number.NaN } },
  ];
  const expected: readonly SetupStage[] = [
    "barebone",
    "jira",
    "github",
    "github",
    "both",
    "barebone",
  ];
  counts.forEach((changes, i) => {
    for (const jiraAvailable of [true, false])
      for (const githubAvailable of [true, false]) {
        expect(
          setupStage(
            facts({
              ...changes,
              jira: { ...changes.jira, available: jiraAvailable },
              github: { ...changes.github, available: githubAvailable },
            }),
          ),
        ).toBe(expected[i]);
      }
  });
});

test("[boundary-3] hidden: each row of the ignored-fields table keeps its stage", () => {
  const rows: ReadonlyArray<[Changes, SetupStage]> = [
    [
      { jira: { boards: 5 }, proposals: 10, bounties: 4, canManage: false },
      "barebone",
    ],
    [{ jira: { connected: 1 }, canManage: true }, "jira"],
    [{ jira: { connected: 1 }, canManage: false }, "jira"],
  ];
  for (const [changes, stage] of rows) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

// Extends "[boundary-3] boards, proposals, bounties and permissions do not
// move the stage": boards without a connection (a "boards mean Jira"
// shortcut) and odd values of the ignored fields in every stage.
test("[boundary-3] hidden: boards, proposals, bounties and permissions never move any stage", () => {
  const ignored: readonly Changes[] = [
    { jira: { boards: 12 } },
    { proposals: 6 },
    { bounties: 9 },
    { canManage: false },
    { jira: { boards: Number.NaN }, proposals: -4, bounties: Infinity },
    { jira: { boards: 3 }, proposals: 3, bounties: 3, canManage: false },
  ];
  const stages: ReadonlyArray<[Changes, SetupStage]> = [
    [{}, "barebone"],
    [{ jira: { connected: 1 } }, "jira"],
    [{ github: { connected: 1 } }, "github"],
    [{ jira: { connected: 1 }, github: { repositories: 1 } }, "both"],
  ];
  for (const extra of ignored)
    for (const [changes, stage] of stages) {
      expect(
        setupStage(
          facts({
            ...extra,
            ...changes,
            jira: { ...extra.jira, ...changes.jira },
            github: { ...extra.github, ...changes.github },
          }),
        ),
      ).toBe(stage);
    }
});

// --- @unhappy ---------------------------------------------------------------

test("[unhappy-1] hidden: each row of the broken-site table stays where it would be", () => {
  const rows: ReadonlyArray<[Changes, SetupStage]> = [
    [{ jira: { broken: 3 } }, "barebone"],
    [{ jira: { broken: 2 }, github: { repositories: 1 } }, "github"],
    [{ jira: { connected: 1, broken: 4 } }, "jira"],
  ];
  for (const [changes, stage] of rows) {
    expect(setupStage(facts(changes))).toBe(stage);
  }
});

// Extends "[unhappy-1] only broken Jira sites leave the workspace where it
// would be without them": broken sites with boards, with a malformed
// connected count, and with GitHub connected by repositories.
test("[unhappy-1] hidden: broken sites with boards and malformed connections never stage as Jira", () => {
  expect(setupStage(facts({ jira: { broken: 1, boards: 6 } }))).toBe(
    "barebone",
  );
  expect(
    setupStage(facts({ jira: { connected: -1, broken: 5, boards: 2 } })),
  ).toBe("barebone");
  expect(
    setupStage(facts({ jira: { connected: Number.NaN, broken: 1 } })),
  ).toBe("barebone");
  expect(
    setupStage(
      facts({
        jira: { broken: 8, boards: 1 },
        github: { connected: 2, repositories: 3 },
      }),
    ),
  ).toBe("github");
  expect(
    setupStage(
      facts({
        jira: { available: false, broken: 2 },
        github: { repositories: 1 },
      }),
    ),
  ).toBe("github");
  expect(
    setupStage(
      facts({ jira: { connected: 2, broken: 2 }, github: { repositories: 4 } }),
    ),
  ).toBe("both");
});

test("[unhappy-2] hidden: each row of the malformed-count table is read without throwing", () => {
  const rows: ReadonlyArray<[Changes, SetupStage]> = [
    [{ jira: { connected: -1 } }, "barebone"],
    [{ jira: { connected: Number.NaN } }, "barebone"],
    [{ github: { connected: -2, repositories: -1 } }, "barebone"],
    [{ github: { repositories: 0.5 } }, "github"],
  ];
  for (const [changes, stage] of rows) {
    const given = facts(changes);
    expect(() => setupStage(given)).not.toThrow();
    expect(setupStage(given)).toBe(stage);
  }
});

// Extends "[unhappy-2] malformed counts are read without throwing": the
// malformed values on other fields and in other combinations. A truthiness
// test (`if (count)`) takes -1 as present; `>= 1` takes fractions as absent.
test("[unhappy-2] hidden: malformed counts on every field are absent and fractions present", () => {
  const rows: ReadonlyArray<[Changes, SetupStage]> = [
    [{ github: { connected: -1 } }, "barebone"],
    [{ github: { connected: Number.NaN } }, "barebone"],
    [{ github: { repositories: Number.NaN } }, "barebone"],
    [{ jira: { connected: -0.5 } }, "barebone"],
    [{ jira: { connected: Number.NEGATIVE_INFINITY } }, "barebone"],
    [{ jira: { connected: 0.5 } }, "jira"],
    [{ github: { connected: 0.5 } }, "github"],
    [{ jira: { connected: -3 }, github: { connected: 2 } }, "github"],
    [{ jira: { connected: 1 }, github: { connected: -1 } }, "jira"],
    [
      { jira: { connected: 1 }, github: { connected: Number.NaN, repositories: -5 } },
      "jira",
    ],
    [{ jira: { connected: 0.1 }, github: { repositories: 0.1 } }, "both"],
    [
      {
        jira: { connected: Number.NaN },
        github: { connected: Number.NaN, repositories: Number.NaN },
        proposals: Number.NaN,
      },
      "barebone",
    ],
  ];
  for (const [changes, stage] of rows) {
    const given = facts(changes);
    expect(() => setupStage(given)).not.toThrow();
    expect(setupStage(given)).toBe(stage);
  }
});
