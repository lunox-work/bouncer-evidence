# Home setup stage and getting-started checklist

Home becomes one page that changes with what a workspace has connected
(ticket #84). The decision of *which* home to show, and what the
getting-started checklist above it says, lives in a new, pure module
`apps/web/src/features/onboarding/setup.ts`. `useWorkspaceSetup` (not specified
here) reads the counts through the existing cache keys and hands them to this
module as a `SetupFacts` value; the module only computes. It imports no React,
no query client, no `fetch` and no clock, so a unit test imports it directly
(`../src/features/onboarding/setup`) and calls its exports with plain objects,
the way `test/analysis-labels.test.ts` calls `runDuration`.

The file is new, so no export of it has earlier behaviour to keep. The rest of
the ticket (removing `useConnections`, `useJira` reporting a server without
Jira as not offered, the page layouts, the `?repo=&area=` link, the board
page's scan) is outside this seam and outside this spec; every existing export
of other modules keeps its behaviour as far as this spec is concerned.

## Exports of `apps/web/src/features/onboarding/setup.ts`

Exactly as the ticket gives them:

```ts
export type SetupStage = "barebone" | "jira" | "github" | "both";

export interface SetupFacts {
    readonly jira: {
        readonly available: boolean;
        readonly connected: number;
        readonly broken: number;
        readonly boards: number;
    };
    readonly github: {
        readonly available: boolean;
        readonly connected: number;
        readonly repositories: number;
    };
    readonly proposals: number;
    readonly bounties: number;
    readonly canManage: boolean;
}

export function setupStage(facts: SetupFacts): SetupStage;

export type SetupStepId = "jira" | "github" | "size";

export interface SetupStep {
    readonly id: SetupStepId;
    readonly done: boolean;
    readonly current: boolean;
}

export function setupSteps(facts: SetupFacts): SetupStep[];

export function setupComplete(facts: SetupFacts): boolean;
```

Summary of the rules below:

- A count "is present" when it is `> 0`. Any other number (0, negative, `NaN`)
  is absent. Nothing throws.
- Jira is connected when `jira.connected > 0`. GitHub is connected when
  `github.connected > 0 || github.repositories > 0`.
- `setupStage`: both connected → `"both"`; only Jira → `"jira"`; only GitHub →
  `"github"`; neither → `"barebone"`. `available`, `broken`, `boards`,
  `proposals`, `bounties` and `canManage` are never read.
- `setupSteps`: order is `github, size, jira` when the stage is `"github"`, and
  `jira, github, size` otherwise; then the `jira` step is dropped when
  `jira.available` is false and the `github` step is dropped when
  `github.available` is false. `size` is always present.
  Step `jira` is done when `jira.connected > 0`; step `github` when
  `github.repositories > 0`; step `size` when `proposals > 0`.
  The first not-done step of the returned list is `current: true`; every other
  step is `current: false`; if all are done none is current.
  Each step is a fresh object with exactly the keys `id`, `done`, `current`.
- `setupComplete(facts)` is `setupSteps(facts).every(step => step.done)`.

```gherkin
Feature: Home setup stage and getting-started checklist
  setup.ts decides which home a workspace sees and what its checklist says,
  from the counts in a SetupFacts value. It is pure: same facts, same answer.

  Background:
    Given the base facts "nothing connected":
      | field               | value |
      | jira.available      | true  |
      | jira.connected      | 0     |
      | jira.broken         | 0     |
      | jira.boards         | 0     |
      | github.available    | true  |
      | github.connected    | 0     |
      | github.repositories | 0     |
      | proposals           | 0     |
      | bounties            | 0     |
      | canManage           | true  |
    And every scenario starts from the base facts and changes only the fields it names

  Rule: setupStage is decided by whether Jira and GitHub are connected, Jira by jira.connected > 0 and GitHub by github.connected > 0 or github.repositories > 0

    @happy
    Scenario: Each combination of connections gives its stage
      When setupStage is called with the base facts changed as in each row
      Then it returns the row's stage:
        | jira.connected | github.connected | github.repositories | stage    |
        | 0              | 0                | 0                   | barebone |
        | 1              | 0                | 0                   | jira     |
        | 3              | 0                | 0                   | jira     |
        | 0              | 0                | 1                   | github   |
        | 0              | 2                | 5                   | github   |
        | 1              | 0                | 1                   | both     |
        | 2              | 1                | 0                   | both     |

    @boundary
    Scenario: A GitHub account with no repository picked is already the github stage
      Given github.connected is 1 and github.repositories is 0
      When setupStage is called
      Then it returns "github"

  Rule: A broken Jira site does not count toward the stage; jira.broken is never read

    @unhappy
    Scenario: Only broken Jira sites leave the workspace where it would be without them
      When setupStage is called with the base facts changed as in each row
      Then it returns the row's stage:
        | jira.connected | jira.broken | github.repositories | stage    |
        | 0              | 3           | 0                   | barebone |
        | 0              | 2           | 1                   | github   |
        | 1              | 4           | 0                   | jira     |

  Rule: setupStage ignores available, boards, proposals, bounties and canManage

    @boundary
    Scenario: A tool the server does not offer still stages by its counts
      When setupStage is called with the base facts changed as in each row
      Then it returns the row's stage:
        | jira.available | jira.connected | github.available | github.repositories | stage    |
        | false          | 1              | true             | 0                   | jira     |
        | true           | 0              | false            | 1                   | github   |
        | false          | 1              | false            | 1                   | both     |
        | false          | 0              | false            | 0                   | barebone |

    @boundary
    Scenario: Boards, proposals, bounties and permissions do not move the stage
      When setupStage is called with the base facts changed as in each row
      Then it returns the row's stage:
        | jira.connected | jira.boards | proposals | bounties | canManage | stage    |
        | 0              | 5           | 10        | 4        | false     | barebone |
        | 1              | 0           | 0         | 0        | true      | jira     |
        | 1              | 0           | 0         | 0        | false     | jira     |

  Rule: A count is present only when it is greater than zero; negative and NaN counts are absent, fractions above zero are present, and nothing throws

    @unhappy
    Scenario: Malformed counts are read without throwing
      When setupStage is called with the base facts changed as in each row
      Then it does not throw and returns the row's stage:
        | jira.connected | github.connected | github.repositories | stage    |
        | -1             | 0                | 0                   | barebone |
        | NaN            | 0                | 0                   | barebone |
        | 0              | -2               | -1                  | barebone |
        | 0              | 0                | 0.5                 | github   |

    @unhappy
    Scenario: Malformed counts leave their steps not done
      Given jira.connected is -1, github.repositories is NaN and proposals is -3
      When setupSteps is called
      Then it does not throw and returns:
        | id     | done  | current |
        | jira   | false | true    |
        | github | false | false   |
        | size   | false | false   |

  Rule: Step jira is done when jira.connected > 0, step github when github.repositories > 0, step size when proposals > 0; nothing else marks a step done

    @happy
    Scenario: A workspace with nothing connected has every step to do, starting with Jira
      When setupSteps is called with the base facts
      Then it returns:
        | id     | done  | current |
        | jira   | false | true    |
        | github | false | false   |
        | size   | false | false   |

    @happy
    Scenario: Connecting Jira finishes its step and moves on to GitHub
      Given jira.connected is 1
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | jira   | true  | false   |
        | github | false | true    |
        | size   | false | false   |

    @boundary
    Scenario: A connected GitHub account with no repository leaves the github step to do
      Given github.connected is 1 and github.repositories is 0
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | github | false | true    |
        | size   | false | false   |
        | jira   | false | false   |

    @boundary
    Scenario: Bounties without proposals do not finish the size step
      Given jira.connected is 1, github.repositories is 1, proposals is 0 and bounties is 7
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | jira   | true  | false   |
        | github | true  | false   |
        | size   | false | true    |

    @unhappy
    Scenario: Broken Jira sites and boards do not finish the jira step
      Given jira.connected is 0, jira.broken is 2 and jira.boards is 3
      When setupSteps is called
      Then the step with id "jira" has done false and current true

  Rule: Steps are listed github, size, jira in the github stage and jira, github, size in every other stage

    @happy
    Scenario: The order follows the stage
      When setupSteps is called with the base facts changed as in each row
      Then the ids of the returned steps are, in order, the row's ids:
        | jira.connected | github.repositories | stage    | ids                |
        | 0              | 0                   | barebone | jira, github, size |
        | 1              | 0                   | jira     | jira, github, size |
        | 0              | 1                   | github   | github, size, jira |
        | 1              | 1                   | both     | jira, github, size |

    @happy
    Scenario: In the github stage the size step comes before Jira
      Given github.repositories is 2
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | github | true  | false   |
        | size   | false | true    |
        | jira   | false | false   |

  Rule: The step of a tool the server does not offer is left out; the size step is always listed

    @boundary
    Scenario: Unavailable tools drop their steps and keep the stage's order for the rest
      When setupSteps is called with the base facts changed as in each row
      Then the ids of the returned steps are, in order, the row's ids:
        | jira.available | github.available | jira.connected | github.repositories | ids          |
        | false          | true             | 0              | 0                   | github, size |
        | true           | false            | 0              | 0                   | jira, size   |
        | false          | false            | 0              | 0                   | size         |
        | false          | true             | 0              | 1                   | github, size |
        | true           | false            | 0              | 1                   | size, jira   |
        | false          | false            | 1              | 1                   | size         |

    @boundary
    Scenario: The current step is chosen among the steps that are listed
      Given jira.available is false
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | github | false | true    |
        | size   | false | false   |

    @boundary
    Scenario: A Jira connection on a server that no longer offers Jira stages as jira but lists no jira step
      Given jira.available is false and jira.connected is 1
      When setupStage is called
      Then it returns "jira"
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | github | false | true    |
        | size   | false | false   |

  Rule: The current step is the first not-done step in the listed order, even when a later step is already done; when every step is done no step is current

    @boundary
    Scenario: A later done step does not move the current step past an earlier one
      Given jira.connected is 1 and proposals is 2
      When setupSteps is called
      Then it returns:
        | id     | done  | current |
        | jira   | true  | false   |
        | github | false | true    |
        | size   | true  | false   |

    @boundary
    Scenario: With every step done, none is current
      Given jira.connected is 1, github.repositories is 1 and proposals is 1
      When setupSteps is called
      Then it returns:
        | id     | done | current |
        | jira   | true | false   |
        | github | true | false   |
        | size   | true | false   |

    @boundary
    Scenario: At most one step is current, and only a not-done one
      When setupSteps is called with any facts in this spec
      Then at most one returned step has current true
      And a step with current true has done false
      And exactly one step has current true whenever any step has done false

  Rule: canManage does not change the steps

    @boundary
    Scenario: A member who cannot manage sees the same checklist
      Given jira.connected is 1
      When setupSteps is called once with canManage true and once with canManage false
      Then both calls return:
        | id     | done  | current |
        | jira   | true  | false   |
        | github | false | true    |
        | size   | false | false   |

  Rule: setupComplete is true exactly when every listed step is done; an unoffered tool's step cannot hold it back

    @happy
    Scenario: Completion follows the listed steps
      When setupComplete is called with the base facts changed as in each row
      Then it returns the row's result:
        | jira.available | github.available | jira.connected | github.connected | github.repositories | proposals | complete |
        | true           | true             | 0              | 0                | 0                   | 0         | false    |
        | true           | true             | 1              | 0                | 1                   | 1         | true     |
        | true           | true             | 1              | 0                | 1                   | 0         | false    |
        | true           | true             | 1              | 1                | 0                   | 1         | false    |
        | true           | true             | 0              | 0                | 1                   | 1         | false    |
        | false          | true             | 0              | 0                | 1                   | 1         | true     |
        | true           | false            | 1              | 0                | 0                   | 1         | true     |
        | false          | false            | 0              | 0                | 0                   | 1         | true     |
        | false          | false            | 0              | 0                | 0                   | 0         | false    |

    @unhappy
    Scenario: Broken Jira sites never complete the checklist
      Given jira.broken is 1, jira.connected is 0, github.repositories is 1 and proposals is 1
      When setupComplete is called
      Then it returns false

    @boundary
    Scenario: setupComplete agrees with setupSteps
      When setupComplete and setupSteps are called with the same facts, for every row of every table in this spec
      Then setupComplete returns true exactly when every step setupSteps returns has done true

  Rule: The functions are pure; they do not change their input and return a new array of new step objects on every call

    @boundary
    Scenario: Deeply frozen facts are accepted and left unchanged
      Given the base facts with jira.connected 1, deeply frozen with Object.freeze
      When setupStage, setupSteps and setupComplete are each called with them
      Then none of them throws
      And the facts still equal the base facts with jira.connected 1

    @boundary
    Scenario: Each call returns its own array
      When setupSteps is called twice with the same facts
      Then the two results are deeply equal but not the same array
      And setting a property on a step of the first result leaves the second result unchanged
      And each step object has exactly the keys "id", "done" and "current"
```

## Decided:

1. A broken Jira site does not count toward the stage or the jira step; only `jira.connected > 0` counts and `jira.broken` is never read, so a workspace with only broken sites is `"barebone"`.
   - Ticket: silent.
   - Instead: Treat a broken site as connected for staging, or add a separate stage or flag that prompts reconnection.
2. A GitHub account with linked installations but no repository picked counts as the github stage: `github.repositories > 0 || github.connected > 0`.
   - Ticket: silent.
   - Instead: Require at least one repository for the github stage, so an account alone stays barebone.
3. The stage ignores `available`; it uses only the connected and repository counts.
   - Ticket: silent.
   - Instead: Treat an unavailable tool as not connected, whatever its counts say.
4. The github step is done only when `github.repositories > 0`; a connected account with no repository leaves it not done.
   - Ticket: silent.
   - Instead: Mark it done once `github.connected > 0`, matching the stage logic.
5. The size step is done when `proposals > 0`; bounties are not counted.
   - Ticket: silent.
   - Instead: Count bounties too, or count either proposals or bounties.
6. Steps are listed github, size, jira in the github stage, and jira, github, size in every other stage.
   - Ticket: silent.
   - Instead: Use one fixed order (jira, github, size) for every stage.
7. When the server does not offer Jira or GitHub, that tool's step is dropped and the remaining steps are still returned.
   - Ticket: silent.
   - Instead: Keep the step and mark it done or disabled, or return an empty list.
8. When every listed step is done, no step is current (all have `current: false`).
   - Ticket: silent.
   - Instead: Leave the last step marked current, or return no steps.
9. The current step is the first not-done step in the listed order; a later step can be done while an earlier one stays current.
   - Ticket: silent.
   - Instead: Mark the next step after the last completed one as current.
10. `setupComplete` is `every` step done over the listed steps, so it depends on availability: with both tools unavailable it is decided by the size step alone (and would be true for an empty list).
    - Ticket: silent.
    - Instead: Require at least one step to be done, or ignore tool availability when judging completion.
11. `canManage`, `jira.boards` and `bounties` affect neither the stage, nor the steps, nor completion.
    - Ticket: silent.
    - Instead: Require boards for the jira stage, or hide steps from users who cannot manage.
12. The jira step is done when `jira.connected > 0`, the same test the stage uses; boards are not required.
    - Ticket: silent.
    - Instead: Mark the jira step done only once the site has at least one board (`jira.boards > 0`).
13. A count is present only when it is `> 0`: negative and `NaN` counts are treated as absent, fractions above zero as present, and no function throws or validates.
    - Ticket: silent.
    - Instead: Reject non-integer or negative counts with a `RangeError`.
14. `setupComplete` reports only whether the checklist is done; whether a person has hidden it is not a fact here and is decided by the caller.
    - Ticket: "A getting-started checklist sits above every stage until it is done or hidden."
    - Instead: Add a `hidden` field to `SetupFacts` and have `setupComplete` (or `setupSteps` returning `[]`) account for it.
15. The functions are pure: they do not change their input (deeply frozen facts are accepted), and each `setupSteps` call returns a new array of new objects with exactly the keys `id`, `done`, `current`.
    - Ticket: silent.
    - Instead: Return shared, frozen step lists for each case, or let steps carry extra fields such as a label.
