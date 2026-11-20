# Limit concurrent evaluation jobs on a worker

A worker runs evaluation jobs through an `EvaluationProvider` (from
`sandbox-factory`, defined in `packages/core/src/sandbox/build.ts`): `create`
returns an `EvaluationJob` that is staged, executed, read and finally
destroyed. Ticket #104 says at most two evaluation jobs may run at once on a
worker. This change adds a new module, `apps/worker/src/evaluation/limit.ts`,
with a wrapper `limitJobs(provider, max)` that returns an `EvaluationProvider`
whose `create` holds one of `max` slots for each job from the moment the
wrapped `create` is called (or a slot is handed to it) until that job's
`destroy()` settles. Callers
beyond the cap wait, first in first out, until a slot is handed to them.

## Exports of `apps/worker/src/evaluation/limit.ts` (new file)

```ts
import type { EvaluationProvider } from "sandbox-factory";

/** The number of evaluation jobs a worker runs at once. */
export const EVALUATION_JOBS_MAX = 2;

/** Wraps `provider` so at most `max` of its jobs are alive at once. */
export function limitJobs(provider: EvaluationProvider, max: number): EvaluationProvider;
```

Nothing else is exported. Types used are the repository's own:
`EvaluationProvider`, `EvaluationJob`, `EvaluationCommand`,
`EvaluationExecResult`, `StagedFile` from `sandbox-factory`.

Existing exports keep their behaviour unchanged: `createLocalProcessProvider`,
`runProcess` and `LocalProcessOptions` in
`apps/worker/src/evaluation/local-process.ts`, and every export of
`sandbox-factory`. Wiring `limitJobs(createLocalProcessProvider(),
EVALUATION_JOBS_MAX)` into `apps/worker/src/main.ts` is the intended use but is
not checked by the scenarios below.

## Terms

- **Slot**: one unit of the cap. A call to the wrapped `create` *holds* a slot
  from the moment it is granted one: synchronously, during the wrapped
  `create` call itself, when a slot is free, or when a release hands it a
  slot. The underlying `provider.create` is called for it afterwards, on a
  later microtask, never synchronously inside the wrapped `create` call.
- **Free slot**: a slot is free when the number of held slots is less than
  `max` (plain `held < max` comparison, no validation or rounding of `max`).
- **Waiter**: a call to the wrapped `create` that found no free slot and is
  queued; the underlying `provider.create` has not been called for it.
- **Release**: the held count goes down by one, or, if there is a waiter, the
  slot is handed directly to the oldest waiter (the held count stays the same
  and that waiter's underlying `create` is called).
- **Settled**: a promise has resolved or rejected.

In the scenarios, a *fake provider* is an `EvaluationProvider` named `"fake"`
whose `create` records each call (label and signal) and returns a promise the
test resolves or rejects by hand; each job it resolves with has `id` equal to
the label, `environment` `{ provider: "fake", environmentId: null,
templateDigest: null }`, and `stage`, `exec`, `read`, `destroy` functions that
record their calls and whose results the test controls. "Flushing" means
awaiting enough microtask/macrotask turns (for example `await new
Promise((r) => setImmediate(r))`) that any pending handoff would have happened.
"Immediately" in a scenario means "after flushing, with no job destroyed in
between", not synchronously inside the wrapped `create` call.

```gherkin
Feature: limitJobs caps how many evaluation jobs of a provider are alive at once

  Background:
    Given a fake provider named "fake"
    And a signal from a new AbortController that is never aborted, unless a scenario says otherwise

  Rule: EVALUATION_JOBS_MAX is the number 2 and limitJobs only uses the max it is given

    @happy
    Scenario: The exported constant is 2
      When EVALUATION_JOBS_MAX is read
      Then it equals 2

    @happy
    Scenario: limitJobs takes its cap from the max argument, not from EVALUATION_JOBS_MAX
      Given limited = limitJobs(fake, 3)
      When create is called with labels "a", "b", "c" without resolving any underlying create
      Then the underlying create has been called 3 times, with labels "a", "b", "c" in that order

    @happy
    Scenario: Wrapping has no side effects
      When limitJobs(fake, 2) is called
      Then the underlying create has been called 0 times
      And the call returns synchronously, without throwing

  Rule: The wrapped provider exposes exactly name and create; name is the underlying provider's name

    @happy
    Scenario: Wrapped provider shape
      Given fake also has an extra own property "region" with value "eu"
      When limited = limitJobs(fake, 2)
      Then Object.keys(limited) sorted is ["create", "name"]
      And limited.name equals "fake"
      And limited has no property "region"

  Rule: create forwards label and signal unchanged to the underlying create while a slot is free

    @happy
    Scenario: A create under the cap calls through immediately
      Given limited = limitJobs(fake, 2)
      When limited.create({ label: "sbv_1/odd label", signal }) is called
      Then the underlying create has been called once with label "sbv_1/odd label" and the same signal object
      And when the underlying create resolves with job "sbv_1/odd label", the wrapped create resolves with a job whose id is "sbv_1/odd label"

    @boundary
    Scenario: The slot is taken synchronously but the underlying create is called on a later microtask
      Given limited = limitJobs(fake, 1)
      When limited.create({ label: "a", signal }) and limited.create({ label: "b", signal }) are called in the same synchronous turn
      Then right after both calls return, the underlying create has been called 0 times
      When flushing
      Then the underlying create has been called once, for "a"
      And the wrapped create for "b" is still pending

    @boundary
    Scenario Outline: How many creates call through before any job is destroyed
      Given limited = limitJobs(fake, <max>)
      When create is called <calls> times with labels "j1" … "j<calls>" and every underlying create that is called resolves
      And flushing
      Then the underlying create has been called <through> times
      And <waiting> wrapped create promises are still pending

      Examples:
        | max | calls | through | waiting |
        | 1   | 1     | 1       | 0       |
        | 1   | 2     | 1       | 1       |
        | 2   | 2     | 2       | 0       |
        | 2   | 3     | 2       | 1       |
        | 2   | 5     | 2       | 3       |
        | 3   | 4     | 3       | 1       |

  Rule: max is not validated; a slot is free exactly when held < max

    @boundary
    Scenario Outline: Unusual max values follow the held < max comparison
      Given limited = limitJobs(fake, <max>)
      When create is called 3 times with labels "j1", "j2", "j3"
      And flushing
      Then the underlying create has been called <through> times
      And limitJobs did not throw

      Examples:
        | max      | through |
        | 0        | 0       |
        | -1       | 0       |
        | NaN      | 0       |
        | 1.5      | 2       |
        | Infinity | 3       |

    @unhappy
    Scenario: With max 0 a create waits until its signal aborts
      Given limited = limitJobs(fake, 0)
      And a controller whose signal is not aborted
      When limited.create({ label: "never", signal: controller.signal }) is called
      And flushing
      Then the wrapped create promise is still pending
      And the underlying create has been called 0 times
      When controller.abort(new Error("stop")) is called
      Then the wrapped create rejects with that same Error("stop")

  Rule: A slot is held until the job's destroy() settles, not when its exec, stage or read finishes

    @happy
    Scenario: Finishing exec does not free the slot
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And jobA.exec({ argv: ["npm", "test"] }) has resolved
      When limited.create({ label: "b", signal }) is called
      And flushing
      Then the create for "b" is still pending
      And the underlying create has been called once, for "a"

    @boundary
    Scenario: The slot is freed when destroy settles, not when it starts
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And limited.create({ label: "b", signal }) is waiting
      When jobA.destroy() is called and the underlying destroy is still pending
      And flushing
      Then the underlying create has not been called for "b"
      When the underlying destroy resolves
      And flushing
      Then the underlying create has been called for "b"
      And jobA.destroy() resolved with undefined

  Rule: Waiters are served first in first out; a freed slot goes to the oldest waiter

    @concurrency
    Scenario: Waiters get slots in the order they called create
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And limited.create is called for "b", then "c", then "d", all waiting
      When jobA is destroyed
      Then the underlying create is called for "b" and not for "c" or "d"
      When the job for "b" resolves and is destroyed
      Then the underlying create is called for "c" and not for "d"
      When the job for "c" resolves and is destroyed
      Then the underlying create is called for "d"

    @concurrency
    Scenario: A create made after a slot was handed off waits behind existing waiters
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And limited.create({ label: "b", signal }) is waiting
      When await jobA.destroy() completes
      And limited.create({ label: "c", signal }) is called
      And flushing
      Then the underlying create has been called for "b"
      And the underlying create has not been called for "c"

    @concurrency
    Scenario: The underlying create never has more than max jobs alive under overlapping calls
      Given limited = limitJobs(fake, 2)
      And the fake counts alive jobs: +1 when its create is called, -1 when a job's destroy settles
      When 10 creates are started at once with labels "j1" … "j10", and each job, once created, runs one exec and is then destroyed, with underlying calls resolving in arbitrary order
      Then all 10 wrapped creates resolve
      And the fake's alive count never exceeds 2
      And the underlying create is called in label order "j1" … "j10"

  Rule: If the underlying create rejects, the slot is released and the same error is rethrown

    @unhappy
    Scenario: A failed create frees its slot for the next waiter
      Given limited = limitJobs(fake, 1)
      And limited.create({ label: "a", signal }) is called
      And limited.create({ label: "b", signal }) is waiting
      When the underlying create for "a" rejects with error E = new Error("mkdtemp failed")
      Then the wrapped create for "a" rejects with the same object E
      And the underlying create is called for "b"

    @unhappy
    Scenario: A failed create with no waiter leaves the slot free
      Given limited = limitJobs(fake, 1)
      And the underlying create for "a" rejects with Error("boom")
      And the wrapped create for "a" has rejected with that error
      When limited.create({ label: "b", signal }) is called
      Then the underlying create is called for "b" immediately

    @unhappy
    Scenario: A create that throws synchronously is treated the same as one that rejects
      Given the fake's create throws Error("sync") synchronously instead of returning a promise
      And limited = limitJobs(fake, 1)
      When limited.create({ label: "a", signal }) is called
      Then it returns a promise that rejects with that same Error("sync")
      And a following limited.create({ label: "b", signal }) calls the underlying create immediately

  Rule: A waiter whose signal aborts leaves the queue and rejects with signal.reason

    @unhappy
    Scenario: Aborting a waiter rejects it and skips it in the queue
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And controllerB's signal is passed to limited.create({ label: "b", ... }), which is waiting
      And limited.create({ label: "c", signal }) is waiting
      When controllerB.abort(reason R = new Error("cancelled")) is called
      Then the wrapped create for "b" rejects with the same object R
      When jobA is destroyed
      Then the underlying create is called for "c"
      And the underlying create is never called for "b"

    @unhappy
    Scenario: Aborting a waiter without a reason rejects with the signal's default reason
      Given limited = limitJobs(fake, 1) with one job held
      And a waiter for "b" with controllerB.signal
      When controllerB.abort() is called with no argument
      Then the wrapped create for "b" rejects with controllerB.signal.reason, a DOMException named "AbortError"

    @boundary
    Scenario: Aborting after the slot was handed over does not affect the wrapper
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And limited.create({ label: "b", signal: controllerB.signal }) is waiting
      When jobA is destroyed and the underlying create has been called for "b"
      And controllerB.abort(new Error("late")) is called
      And the underlying create for "b" resolves with job "b"
      Then the wrapped create for "b" resolves with a job whose id is "b"
      And the slot stays held until that job's destroy settles

  Rule: An already-aborted signal is only checked when the caller would have to wait

    @boundary
    Scenario: Already aborted with a free slot still calls through
      Given limited = limitJobs(fake, 1)
      And a controller already aborted with reason Error("gone")
      When limited.create({ label: "a", signal: controller.signal }) is called
      Then the underlying create is called with label "a" and that aborted signal
      And when the underlying create resolves with job "a", the wrapped create resolves with a job whose id is "a"

    @unhappy
    Scenario: Already aborted with no free slot rejects without queueing
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And a controller already aborted with reason R = new Error("gone")
      When limited.create({ label: "b", signal: controller.signal }) is called
      Then it rejects with the same object R
      When jobA is destroyed
      And limited.create({ label: "c", signal }) is called
      Then the underlying create is called for "c" immediately
      And the underlying create is never called for "b"

  Rule: The wrapped job exposes exactly id, environment, stage, exec, read and destroy, forwarding each unchanged

    @happy
    Scenario: Wrapped job shape and values
      Given the fake's job for "a" also has an extra own property "debugUrl"
      And limited = limitJobs(fake, 2)
      When jobA = await limited.create({ label: "a", signal })
      Then Object.keys(jobA) sorted is ["destroy", "environment", "exec", "id", "read", "stage"]
      And jobA.id equals "a"
      And jobA.environment is the same object as the underlying job's environment
      And jobA has no property "debugUrl"
      And jobA is not the same object as the underlying job

    @happy
    Scenario Outline: Job methods forward their argument and return the underlying result
      Given jobA = await limitJobs(fake, 2).create({ label: "a", signal })
      And the underlying job's <method> resolves with <result>
      When jobA.<method>(<argument>) is called
      Then the underlying <method> was called once with the same argument object
      And the wrapped call resolves with the same value <result>

      Examples:
        | method | argument                                   | result                                                                                                     |
        | stage  | [{ path: "dir/hello.txt", text: "hello" }] | undefined                                                                                                  |
        | exec   | { argv: ["node", "script.js"], cwd: "dir" } | { exitCode: 3, timedOut: false, outputTruncated: false, stdout: "none\n", stderr: "", durationMs: 12 } |
        | read   | "package-lock.json"                        | "{}"                                                                                                       |
        | read   | "missing.txt"                              | null                                                                                                       |

    @unhappy
    Scenario Outline: Job method errors propagate unchanged and do not free the slot
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And the underlying <method> rejects with E = new Error("<message>")
      When jobA.<method>(<argument>) is called
      Then it rejects with the same object E
      And a following limited.create({ label: "b", signal }) is still pending after flushing

      Examples:
        | method | argument                         | message                         |
        | stage  | [{ path: "../x", text: "" }]     | Path ../x leaves the job directory. |
        | exec   | { argv: [] }                     | A command needs an executable.  |
        | read   | "../etc"                         | Path ../etc leaves the job directory. |

    @boundary
    Scenario: Calls after destroy are forwarded with no check
      Given jobA = await limitJobs(fake, 1).create({ label: "a", signal })
      And await jobA.destroy() has completed
      When jobA.exec({ argv: ["node", "-v"] }), jobA.stage([]) and jobA.read("x") are called
      Then each is forwarded to the underlying job once and resolves with the underlying result

  Rule: destroy releases the slot exactly once, even if it throws or is called again

    @unhappy
    Scenario: A throwing destroy still frees the slot and rethrows
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And limited.create({ label: "b", signal }) is waiting
      And the underlying destroy rejects with E = new Error("rm failed")
      When jobA.destroy() is called
      Then it rejects with the same object E
      And the underlying create is called for "b"

    @boundary
    Scenario: A second destroy forwards again but does not release a second slot
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And limited.create is waiting for "b", then for "c"
      When await jobA.destroy() and then await jobA.destroy() again
      Then the underlying destroy has been called 2 times
      And the underlying create has been called for "b"
      And the underlying create has not been called for "c"

    @concurrency
    Scenario: Two overlapping destroy calls release only once
      Given limited = limitJobs(fake, 1)
      And jobA = await limited.create({ label: "a", signal })
      And limited.create is waiting for "b", then for "c"
      When jobA.destroy() is called twice without awaiting in between, and both underlying destroys resolve
      Then the underlying destroy has been called 2 times
      And the underlying create has been called for "b" but not for "c"

  Rule: Each limitJobs call has its own counter and queue

    @happy
    Scenario: Two wrappers do not share a cap
      Given first = limitJobs(fake, 1) and second = limitJobs(fake, 1)
      When first.create({ label: "a", signal }) and second.create({ label: "b", signal }) are called
      Then the underlying create is called for both "a" and "b" immediately
      And a third call first.create({ label: "c", signal }) waits while "a" is alive
```

## Decided:

- Waiters are queued first-in-first-out, and the oldest waiter is handed the freed slot directly (a later caller cannot take it first).
  - Ticket: silent.
  - Instead: Use a different order, such as priority-based or LIFO, or let all waiters race.
- A slot is released only when destroy() settles, whether it succeeds or throws; it is not released when exec (or stage/read) finishes.
  - Ticket: "At most two evaluation jobs run at once on a worker (limitJobs)."
  - Instead: Release the slot when the job's last exec or run completes, or when destroy() starts.
- If provider.create throws or rejects, the slot is released and the same error is rethrown to the caller; a synchronous throw is treated like a rejection.
  - Ticket: silent.
  - Instead: Keep the slot held, or wrap or retry the error.
- A waiter whose signal aborts is removed from the queue and its create rejects with signal.reason; aborts after the slot is handed over are left to the underlying provider.
  - Ticket: silent.
  - Instead: Ignore the abort and keep waiting, or reject with a generic error such as a new AbortError.
- An already-aborted signal is only checked on the waiting path: with a free slot the underlying create is called anyway; with the cap reached the create rejects with signal.reason without queueing.
  - Ticket: silent.
  - Instead: Check the signal before anything else and always reject when it is already aborted.
- Each destroy() call forwards to the underlying destroy(), but the slot is released only once, including when calls overlap.
  - Ticket: silent.
  - Instead: Make destroy idempotent and call the underlying destroy only once, or let a second call release again.
- If the underlying destroy throws, the slot is still released and the same error propagates.
  - Ticket: silent.
  - Instead: Keep the slot held because the job may still be alive, or swallow the error.
- max is not validated: a slot is free when held < max, so max <= 0 or NaN makes every create wait until its signal aborts, 1.5 allows two jobs, Infinity is unlimited.
  - Ticket: silent.
  - Instead: Throw a RangeError for a max below 1 or a non-integer max.
- The counter and queue are local to each limitJobs call, so each wrapped provider has its own cap.
  - Ticket: "At most two evaluation jobs run at once on a worker (limitJobs)."
  - Instead: Use a module-level shared counter so the cap holds across all providers on the worker.
- limitJobs uses only the max argument it is given; EVALUATION_JOBS_MAX is exported (value 2) but is not a default.
  - Ticket: "At most two evaluation jobs run at once on a worker (limitJobs)."
  - Instead: Default max to EVALUATION_JOBS_MAX when it is omitted.
- The wrapper exposes only name and create on the provider, and id, environment, stage, exec, read and destroy on the job; other members are dropped, and the job is a new object.
  - Ticket: silent.
  - Instead: Spread the provider and job objects so extra properties are kept.
- exec, read and stage after destroy are forwarded to the underlying job with no check.
  - Ticket: silent.
  - Instead: Reject calls made after destroy.
- The wrapped provider's name is the underlying provider's name, and label and signal reach the underlying create unchanged.
  - Ticket: silent.
  - Instead: Give the wrapper its own name (such as "limited:fake") or derive a new signal per job.
- Errors from stage, exec and read propagate unchanged and never free the slot.
- A free slot is claimed synchronously during the wrapped create call, so two creates made in the same synchronous turn with max 1 let only the first through; the underlying create is then called on a later microtask, never synchronously inside the wrapped create.
  - Ticket: silent.
  - Instead: Call the underlying create synchronously inside the wrapped create, or count a slot as held only once the underlying create has been called.
  - Ticket: silent.
  - Instead: Release the slot (or destroy the job) when a job method fails.
