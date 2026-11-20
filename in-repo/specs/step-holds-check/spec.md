# Hold each bounty step until the steps before it are approved

A bounty is made in three steps, `scope` → `price` → `sandbox`
(`BOUNTY_STEPS` in `packages/core/src/stages.ts`). Today any step can be
changed at any time. This change adds two pure functions to
`packages/core/src/stages.ts`. They decide when a later step is **held**:
it cannot be changed until every step before it is approved. They also give
the one sentence the API (409 `step_held` with `heldBy`) and the web page
both show. The price waits on the scope, and the sandbox waits on both.
Going back (unapproving, removing, unpublishing) is never held. The API and
web wiring are out of scope for this spec. Only the core functions are
specified here, and they can be tested by calling them directly.

## Exports

Added to `packages/core/src/stages.ts`. The package root re-exports them
through the existing `export * from "./stages.js"` in
`packages/core/src/index.ts`:

```ts
export function stepHeldBy(
  step: "price" | "sandbox",
  bounty: {
    readonly version: number;
    readonly approval: { readonly version: number } | null;
  },
  proposal: { readonly status: string } | null,
): "scope" | "price" | null;

export function stepHeldReason(
  step: "price" | "sandbox",
  heldBy: "scope" | "price",
): string;
```

- `stepHeldBy` returns the earliest step that is not approved and holds
  `step`, or `null` when `step` is not held. It never returns `undefined`.
- `stepHeldReason` returns the exact sentence for a hold. It is one of these
  three strings, with no surrounding whitespace:
  - `"Approve the scope before changing the price."`
  - `"Approve the scope and the price before changing the sandbox."`
  - `"Approve the price before changing the sandbox."`
- Both functions are synchronous and pure. They keep no state, read no
  clock, never mutate their arguments and never throw for inputs of the
  declared types. The only check on inputs is the TypeScript types, as
  elsewhere in `stages.ts`. They do not check at runtime for values outside
  those types.
- The scope counts as approved exactly when the existing
  `scopeApproved(bounty)` is true (`approval !== null &&
  approval.version === version`).
- The price counts as approved exactly when `proposal !== null &&
  proposal.status === "approved"`. The match is exact and case-sensitive.
  The repository's proposal statuses are `"proposed"` and `"approved"`.
  Any other string counts as not approved.
- No other export is added to `stages.ts`. In particular, no constants are
  exported for the sentences. (The same change adds `REQUIRED_BUILDERS` and
  `snapshotBuilt` to `packages/core/src/analysis.ts`, which the package root
  also re-exports. They are outside this seam and recorded only under
  `Decided:`.)

These existing exports keep their behaviour unchanged: `BOUNTY_STEPS`,
`BountyStep`, `BountyStages`, `StageDrift`, `stageDrift`, `scopeVersionOf`,
`scopeApproved`, `BOUNTY_STATUSES`, `BountyStatus`, `bountyStatus`.

```gherkin
Feature: Holding a bounty step until the steps before it are approved
  stepHeldBy(step, bounty, proposal) names the earlier step that holds
  `step`, or null. stepHeldReason(step, heldBy) gives the sentence shown
  for that hold.

  Background:
    Given the scope is approved when bounty.approval is not null and bounty.approval.version equals bounty.version
    And the price is approved when proposal is not null and proposal.status is exactly "approved"

  Rule: The price step waits on the scope only

    @happy
    Scenario: The price is held by the scope until the scope's current version is approved
      When stepHeldBy is called with step "price" and these inputs
        | bounty.version | bounty.approval | proposal               | result  |
        | 2              | null            | null                   | "scope" |
        | 2              | { version: 2 }  | null                   | null    |
        | 2              | { version: 2 }  | { status: "proposed" } | null    |
        | 2              | { version: 2 }  | { status: "approved" } | null    |
      Then each call returns the result in its row

    @boundary
    Scenario: The price step ignores the proposal argument entirely
      Given bounty is { version: 3, approval: null }
      When stepHeldBy is called with step "price" and each proposal
        | proposal               | result  |
        | null                   | "scope" |
        | { status: "proposed" } | "scope" |
        | { status: "approved" } | "scope" |
      Then each call returns the result in its row
      # An approved proposal does not release the price step while the scope is unapproved.

    @boundary
    Scenario: A missing proposal never holds the price step
      Given bounty is { version: 1, approval: { version: 1 } }
      When stepHeldBy is called with step "price", that bounty and proposal null
      Then it returns null

  Rule: The scope counts as approved only at the version it is at now

    @unhappy
    Scenario: An approval of any other version leaves the scope unapproved
      When stepHeldBy is called with step "price", proposal null and these bounties
        | bounty.version | bounty.approval | result  |
        | 3              | { version: 2 }  | "scope" |
        | 2              | { version: 3 }  | "scope" |
        | 1              | { version: 1 }  | null    |
        | 0              | { version: 0 }  | null    |
      Then each call returns the result in its row
      # Version 3 approved at 2: the scope was changed after approval (for example Jira wrote a new version), so it is held.

  Rule: The sandbox step waits on both the scope and the price, and the scope is reported first

    @happy
    Scenario: The sandbox is held by the earliest step that is not approved
      When stepHeldBy is called with step "sandbox" and these inputs
        | bounty.version | bounty.approval | proposal               | result  |
        | 2              | null            | null                   | "scope" |
        | 2              | null            | { status: "proposed" } | "scope" |
        | 2              | null            | { status: "approved" } | "scope" |
        | 2              | { version: 1 }  | { status: "approved" } | "scope" |
        | 2              | { version: 2 }  | null                   | "price" |
        | 2              | { version: 2 }  | { status: "proposed" } | "price" |
        | 2              | { version: 2 }  | { status: "approved" } | null    |
      Then each call returns the result in its row

    @unhappy
    Scenario: Only the exact status "approved" counts as an approved price
      Given bounty is { version: 4, approval: { version: 4 } }
      When stepHeldBy is called with step "sandbox", that bounty and each proposal
        | proposal                 | result  |
        | { status: "approved" }   | null    |
        | { status: "Approved" }   | "price" |
        | { status: " approved" }  | "price" |
        | { status: "published" }  | "price" |
        | { status: "" }           | "price" |
      Then each call returns the result in its row

    @boundary
    Scenario: The proposal is read only from the third argument
      Given bounty is { version: 1, approval: { version: 1 }, proposal: { status: "approved" } } held in a variable
      When stepHeldBy is called with step "sandbox", that bounty and proposal null
      Then it returns "price"

  Rule: Only earlier steps are examined; a step's own state never releases or adds a hold

    @boundary
    Scenario: The result depends only on the earlier steps, never on the step's own state
      Given bounty is { version: 5, approval: { version: 5 } }
      And proposal is { status: "proposed" }
      When stepHeldBy is called with step "sandbox", that bounty and that proposal
      Then it returns "price"
      # This holds even if a sandbox is already published. Its state is not an input.
      When stepHeldBy is called with step "price", that bounty and that proposal
      Then it returns null

    @boundary
    Scenario: Calls keep no state between them
      Given bounty A is { version: 1, approval: null }
      And bounty B is { version: 1, approval: { version: 1 } }
      When stepHeldBy("sandbox", A, null) is called, then stepHeldBy("sandbox", B, { status: "approved" }), then stepHeldBy("sandbox", A, null) again
      Then the three calls return "scope", null and "scope"
      And neither bounty nor the proposal object has been changed

  Rule: stepHeldReason gives one fixed sentence per step, and for the sandbox varies by holder

    @happy
    Scenario: The sentence for each hold
      When stepHeldReason is called with
        | step      | heldBy  | result                                                          |
        | "price"   | "scope" | "Approve the scope before changing the price."                  |
        | "sandbox" | "scope" | "Approve the scope and the price before changing the sandbox."  |
        | "sandbox" | "price" | "Approve the price before changing the sandbox."                |
      Then each call returns the result in its row

    @unhappy
    Scenario: The price step held by "price", which stepHeldBy never returns, still gives the scope sentence
      When stepHeldReason is called with step "price" and heldBy "price"
      Then it returns "Approve the scope before changing the price."
      And it does not throw

    @happy
    Scenario: The two functions compose into the words shown to the user
      Given bounty is { version: 2, approval: { version: 2 } }
      And proposal is { status: "proposed" }
      When heldBy = stepHeldBy("sandbox", bounty, proposal)
      Then heldBy is "price"
      And stepHeldReason("sandbox", heldBy) returns "Approve the price before changing the sandbox."

  Rule: Existing stage functions keep their behaviour

    @happy
    Scenario: scopeApproved and bountyStatus are unchanged
      Then scopeApproved({ version: 3, approval: { version: 2 } }) returns false
      And scopeApproved({ version: 2, approval: { version: 2 } }) returns true
      And bountyStatus({ version: 2, approval: null, proposal: { status: "approved" }, sandbox: null }, new Date("2026-10-10T00:00:00Z")) returns "priced"
      And BOUNTY_STEPS equals ["scope", "price", "sandbox"]
```

Decided:

- When both the scope and the price are unapproved, `stepHeldBy` checks the scope first and returns `"scope"` without looking at the price.
  Ticket: "The price waits on the scope, and the sandbox waits on both."
  Instead: Report the price as the holder, or return both holders.
- The scope counts as approved only through `scopeApproved`, so an approval of an older (or any other) version leaves the scope unapproved.
  Ticket: "A step can now be changed only once every step before it is approved."
  Instead: Treat any non-null approval as approved, even a stale one.
- The price counts as approved only when the proposal status is exactly `"approved"`. It is not checked against the current scope version.
  Ticket: "A step can now be changed only once every step before it is approved."
  Instead: Also require the proposal to be built on the current scope version, or accept other statuses such as published.
- A null proposal never holds the price step. It holds only the sandbox, with `"price"` as the holder.
  Ticket: silent.
  Instead: Hold the price step on the proposal too, or treat a missing proposal as unapproved for every step.
- For step `"price"`, `stepHeldBy` looks only at the scope and ignores the proposal argument.
  Ticket: "The price waits on the scope"
  Instead: Also hold the price when the proposal is in some in-progress state.
- `stepHeldReason("price", …)` returns "Approve the scope before changing the price." whatever `heldBy` is.
  Ticket: "so the API and the page refuse with the same words"
  Instead: Use different wording, or vary it by heldBy.
- `stepHeldReason("sandbox", "scope")` returns "Approve the scope and the price before changing the sandbox.", and `stepHeldReason("sandbox", "price")` returns "Approve the price before changing the sandbox."
  Ticket: "so the API and the page refuse with the same words"
  Instead: Use one generic sentence, or name the step by its label.
- `stepHeldReason("price", "price")`, a pair `stepHeldBy` never produces, returns the price step's scope sentence and does not throw.
  Ticket: silent.
  Instead: Throw, or return a message that matches heldBy.
- `stepHeldBy` looks only at earlier steps. It takes no input for the step's own state and holds whenever an earlier step is unapproved.
  Ticket: "A step can now be changed only once every step before it is approved."
  Instead: Skip the hold for read-only or already-complete steps.
- A snapshot counts as built (`snapshotBuilt(runs)` is true) when graphify has succeeded and every other required builder has finished as succeeded or failed. The deepwiki builder is excluded: `REQUIRED_BUILDERS` is `CONTEXT_BUILDERS` without `"deepwiki"`. (This is in `packages/core/src/analysis.ts`, outside this seam. It is recorded here and not specified by scenarios.)
  Ticket: silent.
  Instead: Require every builder to succeed, or leave deepwiki in.
- A snapshot with no runs is not built (`snapshotBuilt([])` is false), because no graphify run succeeded. (This is in `analysis.ts`, outside this seam. It is recorded here and not specified by scenarios.)
  Ticket: silent.
  Instead: Treat an empty run list as built.
- A planned bounty issue gets an optional onboarding flag that may be true, false or undefined. (This is in `packages/core/src/sizing.ts`, outside this seam. It is recorded here and not specified by scenarios.)
  Ticket: silent.
  Instead: Make the flag required, or leave the planned issue unchanged.
- The sentences are returned only by `stepHeldReason`. No string constants are exported for them.
  Ticket: "The new `stepHeldBy` and `stepHeldReason` in core decide this, so the API and the page refuse with the same words."
  Instead: Export the three sentences as named constants.
- `stepHeldBy` reads the proposal only from its third argument, never from a `proposal` field on `bounty` (unlike `bountyStatus`).
  Ticket: silent.
  Instead: Fall back to `bounty.proposal` when the third argument is null.
- There is no runtime validation. Inputs outside the declared types (for example step `"scope"`) are rejected only by the TypeScript compiler, and both functions never throw for typed inputs.
  Ticket: silent.
  Instead: Throw a `TypeError` for an unknown step or holder at runtime.
- Both functions are synchronous and stateless, so calls cannot overlap and the result depends only on the arguments. No `@concurrency` scenario applies.
  Ticket: silent.
  Instead: Cache results per bounty.
