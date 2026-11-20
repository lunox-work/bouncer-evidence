import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  EvaluationCommand,
  EvaluationExecResult,
  EvaluationJob,
  EvaluationProvider,
  StagedFile,
} from "sandbox-factory";
import { EVALUATION_JOBS_MAX, limitJobs } from "../src/evaluation/limit.js";

// ---------------------------------------------------------------------------
// Fixtures: a hand-driven fake provider, promise tracking and flushing.
// ---------------------------------------------------------------------------

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Enough macrotask turns that any pending handoff would have happened. */
async function flush(): Promise<void> {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise<void>((done) => setImmediate(done));
  }
}

interface Tracked<T> {
  readonly promise: Promise<T>;
  settled: boolean;
  fulfilled: boolean;
  value: T | undefined;
  error: unknown;
}

/** Records how a promise settles (and keeps a rejection from going unhandled). */
function track<T>(promise: Promise<T>): Tracked<T> {
  const tracked: Tracked<T> = {
    promise,
    settled: false,
    fulfilled: false,
    value: undefined,
    error: undefined,
  };
  promise.then(
    (value) => {
      tracked.settled = true;
      tracked.fulfilled = true;
      tracked.value = value;
    },
    (error: unknown) => {
      tracked.settled = true;
      tracked.error = error;
    },
  );
  return tracked;
}

/** The value a promise rejects with; fails the test if it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail("expected the promise to reject");
}

function neverAborted(): AbortSignal {
  return new AbortController().signal;
}

const execResult: EvaluationExecResult = {
  exitCode: 0,
  timedOut: false,
  outputTruncated: false,
  stdout: "",
  stderr: "",
  durationMs: 1,
};

interface JobBehaviour {
  stage(files: readonly StagedFile[]): Promise<void>;
  exec(command: EvaluationCommand): Promise<EvaluationExecResult>;
  read(path: string): Promise<string | null>;
  destroy(): Promise<void>;
}

interface FakeJob {
  readonly job: EvaluationJob;
  /** What the underlying methods return; a test replaces these to control results. */
  readonly behaviour: JobBehaviour;
  readonly calls: {
    readonly stage: (readonly StagedFile[])[];
    readonly exec: EvaluationCommand[];
    readonly read: string[];
    destroy: number;
  };
}

function fakeJob(id: string, extra: Record<string, unknown> = {}): FakeJob {
  const behaviour: JobBehaviour = {
    stage: async () => undefined,
    exec: async () => execResult,
    read: async () => null,
    destroy: async () => undefined,
  };
  const calls: FakeJob["calls"] = { stage: [], exec: [], read: [], destroy: 0 };
  const job: EvaluationJob = Object.assign(
    {
      id,
      environment: { provider: "fake", environmentId: null, templateDigest: null },
      stage(files: readonly StagedFile[]) {
        calls.stage.push(files);
        return behaviour.stage(files);
      },
      exec(command: EvaluationCommand) {
        calls.exec.push(command);
        return behaviour.exec(command);
      },
      read(path: string) {
        calls.read.push(path);
        return behaviour.read(path);
      },
      destroy() {
        calls.destroy += 1;
        return behaviour.destroy();
      },
    },
    extra,
  );
  return { job, behaviour, calls };
}

interface CreateCall {
  readonly label: string;
  readonly signal: AbortSignal;
  readonly result: Deferred<EvaluationJob>;
}

interface FakeProvider {
  readonly provider: EvaluationProvider;
  readonly calls: CreateCall[];
  /** Labels whose create throws the mapped value synchronously. */
  readonly syncErrors: Map<string, unknown>;
  labels(): string[];
  call(label: string): CreateCall;
  /** Resolves the underlying create for `label` with a new fake job. */
  resolve(label: string, extra?: Record<string, unknown>): FakeJob;
}

function fakeProvider(
  options: { auto?: boolean; extra?: Record<string, unknown> } = {},
): FakeProvider {
  const calls: CreateCall[] = [];
  const syncErrors = new Map<string, unknown>();
  const call = (label: string): CreateCall => {
    const found = calls.find((entry) => entry.label === label);
    assert.ok(found, `underlying create was not called for ${label}`);
    return found;
  };
  const resolve = (label: string, extra?: Record<string, unknown>): FakeJob => {
    const made = fakeJob(label, extra);
    call(label).result.resolve(made.job);
    return made;
  };
  const provider: EvaluationProvider = Object.assign(
    {
      name: "fake",
      create(spec: { readonly label: string; readonly signal: AbortSignal }) {
        const result = deferred<EvaluationJob>();
        calls.push({ label: spec.label, signal: spec.signal, result });
        if (syncErrors.has(spec.label)) throw syncErrors.get(spec.label);
        if (options.auto) result.resolve(fakeJob(spec.label).job);
        return result.promise;
      },
    },
    options.extra ?? {},
  );
  return {
    provider,
    calls,
    syncErrors,
    labels: () => calls.map((entry) => entry.label),
    call,
    resolve,
  };
}

/** Creates a job through `limited`, resolves its underlying create, and returns both. */
async function hold(
  limited: EvaluationProvider,
  fake: FakeProvider,
  label: string,
  signal: AbortSignal = neverAborted(),
): Promise<{ job: EvaluationJob; underlying: FakeJob }> {
  const pending = limited.create({ label, signal });
  await flush();
  const underlying = fake.resolve(label);
  return { job: await pending, underlying };
}

function labelsUpTo(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `j${index + 1}`);
}

// ---------------------------------------------------------------------------
// @happy
// ---------------------------------------------------------------------------

test("[happy-1] EVALUATION_JOBS_MAX is the number 2", () => {
  assert.equal(EVALUATION_JOBS_MAX, 2);
});

test("[happy-1] using EVALUATION_JOBS_MAX as the cap lets exactly two creates through", async () => {
  const fake = fakeProvider({ auto: true });
  const limited = limitJobs(fake.provider, EVALUATION_JOBS_MAX);
  const third = labelsUpTo(3).map((label) =>
    track(limited.create({ label, signal: neverAborted() })),
  )[2];
  await flush();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  assert.equal(third?.settled, false);
});

test("[happy-2] limitJobs with max 3 calls the underlying create for a, b, c in order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  for (const label of ["a", "b", "c"]) {
    track(limited.create({ label, signal: neverAborted() }));
  }
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
});

test("[happy-2] with max 3 a fourth create waits even though EVALUATION_JOBS_MAX is 2", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  const created = ["a", "b", "c", "d"].map((label) =>
    track(limited.create({ label, signal: neverAborted() })),
  );
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  assert.equal(created[3]?.settled, false);
});

test("[happy-3] wrapping calls no underlying create and returns synchronously", async () => {
  const fake = fakeProvider();
  let limited: EvaluationProvider | undefined;
  assert.doesNotThrow(() => {
    limited = limitJobs(fake.provider, 2);
  });
  assert.ok(limited);
  assert.equal(typeof limited.create, "function");
  assert.equal(fake.calls.length, 0);
  await flush();
  assert.equal(fake.calls.length, 0);
});

test("[happy-3] wrapping a provider whose create throws neither throws nor calls create", async () => {
  let createCalls = 0;
  const provider: EvaluationProvider = {
    name: "fake",
    create() {
      createCalls += 1;
      throw new Error("must not be called");
    },
  };
  let limited: EvaluationProvider | undefined;
  assert.doesNotThrow(() => {
    limited = limitJobs(provider, 2);
  });
  assert.ok(limited);
  await flush();
  assert.equal(createCalls, 0);
});

test("[happy-4] the wrapped provider has exactly name and create, with the underlying name", () => {
  const fake = fakeProvider({ extra: { region: "eu" } });
  const limited = limitJobs(fake.provider, 2);
  assert.deepEqual(Object.keys(limited).sort(), ["create", "name"]);
  assert.equal(limited.name, "fake");
  assert.equal("region" in limited, false);
});

test("[happy-4] an extra method on the provider is dropped from the wrapper", () => {
  const fake = fakeProvider({ extra: { close: () => undefined } });
  const limited = limitJobs(fake.provider, 2);
  assert.deepEqual(Object.keys(limited).sort(), ["create", "name"]);
  assert.equal("close" in limited, false);
  assert.equal(limited.name, "fake");
  assert.notEqual(limited, fake.provider);
});

test("[happy-5] a create under the cap forwards label and signal and resolves with the job", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const signal = neverAborted();
  const created = limited.create({ label: "sbv_1/odd label", signal });
  await flush();
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0]?.label, "sbv_1/odd label");
  assert.equal(fake.calls[0]?.signal, signal);
  fake.resolve("sbv_1/odd label");
  const job = await created;
  assert.equal(job.id, "sbv_1/odd label");
});

test("[happy-5] the create that takes the last free slot also forwards its own signal", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const first = neverAborted();
  const second = neverAborted();
  const createdA = limited.create({ label: "a", signal: first });
  const createdB = limited.create({ label: "b", signal: second });
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(fake.call("a").signal, first);
  assert.equal(fake.call("b").signal, second);
  fake.resolve("a");
  fake.resolve("b");
  assert.equal((await createdA).id, "a");
  assert.equal((await createdB).id, "b");
});

test("[happy-6] a resolved exec does not free the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  await a.job.exec({ argv: ["npm", "test"] });
  const b = track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

test("[happy-6] resolved stage, exec and read together do not free the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  await a.job.stage([{ path: "dir/hello.txt", text: "hello" }]);
  await a.job.exec({ argv: ["npm", "test"] });
  await a.job.read("package-lock.json");
  const b = track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

test("[happy-7] the wrapped job has exactly the six members and is a new object", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const created = limited.create({ label: "a", signal: neverAborted() });
  await flush();
  const underlying = fake.resolve("a", { debugUrl: "http://debug.invalid" });
  const jobA = await created;
  assert.deepEqual(Object.keys(jobA).sort(), [
    "destroy",
    "environment",
    "exec",
    "id",
    "read",
    "stage",
  ]);
  assert.equal(jobA.id, "a");
  assert.equal(jobA.environment, underlying.job.environment);
  assert.equal("debugUrl" in jobA, false);
  assert.notEqual(jobA, underlying.job);
});

test("[happy-7] an extra method on the underlying job is dropped from the wrapped job", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const created = limited.create({ label: "a", signal: neverAborted() });
  await flush();
  const underlying = fake.resolve("a", { pause: () => undefined });
  const jobA = await created;
  assert.equal("pause" in jobA, false);
  assert.equal(Object.keys(jobA).length, 6);
  assert.deepEqual(jobA.environment, {
    provider: "fake",
    environmentId: null,
    templateDigest: null,
  });
  assert.equal(jobA.environment, underlying.job.environment);
});

test("[happy-8] stage and exec forward their argument object and return the underlying result", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 2), fake, "a");
  const files = [{ path: "dir/hello.txt", text: "hello" }];
  underlying.behaviour.stage = async () => undefined;
  assert.equal(await job.stage(files), undefined);
  assert.equal(underlying.calls.stage.length, 1);
  assert.equal(underlying.calls.stage[0], files);

  const command = { argv: ["node", "script.js"], cwd: "dir" };
  const result: EvaluationExecResult = {
    exitCode: 3,
    timedOut: false,
    outputTruncated: false,
    stdout: "none\n",
    stderr: "",
    durationMs: 12,
  };
  underlying.behaviour.exec = async () => result;
  assert.equal(await job.exec(command), result);
  assert.equal(underlying.calls.exec.length, 1);
  assert.equal(underlying.calls.exec[0], command);
});

test("[happy-8] read forwards its path and returns the underlying text or null", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 2), fake, "a");
  underlying.behaviour.read = async (path) => (path === "package-lock.json" ? "{}" : null);
  assert.equal(await job.read("package-lock.json"), "{}");
  assert.equal(await job.read("missing.txt"), null);
  assert.deepEqual(underlying.calls.read, ["package-lock.json", "missing.txt"]);
});

test("[happy-9] two wrappers of one provider each let their own job through", async () => {
  const fake = fakeProvider();
  const first = limitJobs(fake.provider, 1);
  const second = limitJobs(fake.provider, 1);
  const a = first.create({ label: "a", signal: neverAborted() });
  track(second.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels().sort(), ["a", "b"]);
  fake.resolve("a");
  await a;
  const c = track(first.create({ label: "c", signal: neverAborted() }));
  await flush();
  assert.equal(c.settled, false);
  assert.equal(fake.labels().includes("c"), false);
});

test("[happy-9] destroying a job of one wrapper does not free a slot in the other", async () => {
  const fake = fakeProvider();
  const first = limitJobs(fake.provider, 1);
  const second = limitJobs(fake.provider, 1);
  const a = await hold(first, fake, "a");
  const b = await hold(second, fake, "b");
  const c = track(first.create({ label: "c", signal: neverAborted() }));
  await flush();
  await b.job.destroy();
  await flush();
  assert.equal(fake.labels().includes("c"), false);
  assert.equal(c.settled, false);
  await a.job.destroy();
  await flush();
  assert.equal(fake.labels().includes("c"), true);
});

// ---------------------------------------------------------------------------
// @boundary
// ---------------------------------------------------------------------------

test("[boundary-1] with max 1 the first same-turn create takes the slot, called on a later microtask", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  track(limited.create({ label: "a", signal: neverAborted() }));
  const b = track(limited.create({ label: "b", signal: neverAborted() }));
  assert.equal(fake.calls.length, 0);
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  assert.equal(b.settled, false);
});

test("[boundary-1] with max 2 three same-turn creates let the first two through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  track(limited.create({ label: "a", signal: neverAborted() }));
  track(limited.create({ label: "b", signal: neverAborted() }));
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  assert.equal(fake.calls.length, 0);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

async function callThrough(
  max: number,
  calls: number,
): Promise<{ through: number; waiting: number }> {
  const fake = fakeProvider({ auto: true });
  const limited = limitJobs(fake.provider, max);
  const created = labelsUpTo(calls).map((label) =>
    track(limited.create({ label, signal: neverAborted() })),
  );
  await flush();
  return {
    through: fake.calls.length,
    waiting: created.filter((entry) => !entry.settled).length,
  };
}

test("[boundary-2] creates beyond the cap wait (max 2 of 3, max 2 of 5, max 3 of 4)", async () => {
  assert.deepEqual(await callThrough(2, 3), { through: 2, waiting: 1 });
  assert.deepEqual(await callThrough(2, 5), { through: 2, waiting: 3 });
  assert.deepEqual(await callThrough(3, 4), { through: 3, waiting: 1 });
});

test("[boundary-2] creates up to the cap all call through, one more waits (max 1 of 1, 1 of 2, 2 of 2)", async () => {
  assert.deepEqual(await callThrough(1, 1), { through: 1, waiting: 0 });
  assert.deepEqual(await callThrough(1, 2), { through: 1, waiting: 1 });
  assert.deepEqual(await callThrough(2, 2), { through: 2, waiting: 0 });
});

async function throughFor(max: number): Promise<number> {
  const fake = fakeProvider({ auto: true });
  let limited: EvaluationProvider | undefined;
  assert.doesNotThrow(() => {
    limited = limitJobs(fake.provider, max);
  });
  assert.ok(limited);
  for (const label of labelsUpTo(3)) {
    track(limited.create({ label, signal: neverAborted() }));
  }
  await flush();
  return fake.calls.length;
}

test("[boundary-3] max 1.5 lets two creates through and Infinity lets all three through", async () => {
  assert.equal(await throughFor(1.5), 2);
  assert.equal(await throughFor(Infinity), 3);
});

test("[boundary-3] max 0, -1 and NaN let no create through and do not throw", async () => {
  assert.equal(await throughFor(0), 0);
  assert.equal(await throughFor(-1), 0);
  assert.equal(await throughFor(Number.NaN), 0);
});

test("[boundary-4] the slot is freed when the underlying destroy settles, not when it starts", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  const destroying = deferred<void>();
  a.underlying.behaviour.destroy = () => destroying.promise;
  const destroyed = track(a.job.destroy());
  await flush();
  assert.equal(fake.labels().includes("b"), false);
  destroying.resolve();
  await flush();
  assert.equal(fake.labels().includes("b"), true);
  assert.equal(destroyed.fulfilled, true);
  assert.equal(destroyed.value, undefined);
});

test("[boundary-4] a create made while destroy is still pending waits until it settles", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const destroying = deferred<void>();
  a.underlying.behaviour.destroy = () => destroying.promise;
  const destroyed = track(a.job.destroy());
  await flush();
  const b = track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  assert.equal(b.settled, false);
  destroying.resolve();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(destroyed.fulfilled, true);
});

test("[boundary-5] aborting after the slot was handed over leaves the create and slot alone", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = track(limited.create({ label: "b", signal: controllerB.signal }));
  await flush();
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  controllerB.abort(new Error("late"));
  await flush();
  fake.resolve("b");
  const jobB = await b.promise;
  assert.equal(jobB.id, "b");
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  assert.equal(c.settled, false);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  await jobB.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
});

test("[boundary-5] aborting after the wrapped create resolved keeps the job usable and the slot held", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const controller = new AbortController();
  const a = await hold(limited, fake, "a", controller.signal);
  controller.abort(new Error("late"));
  await flush();
  assert.equal(await a.job.read("package-lock.json"), null);
  assert.deepEqual(a.underlying.calls.read, ["package-lock.json"]);
  const b = track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

test("[boundary-6] an already-aborted signal with a free slot still calls through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const controller = new AbortController();
  controller.abort(new Error("gone"));
  const created = limited.create({ label: "a", signal: controller.signal });
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  assert.equal(fake.call("a").signal, controller.signal);
  fake.resolve("a");
  assert.equal((await created).id, "a");
});

test("[boundary-6] an already-aborted signal taking the last free slot still calls through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  await hold(limited, fake, "a");
  const controller = new AbortController();
  controller.abort(new Error("gone"));
  const created = limited.create({ label: "b", signal: controller.signal });
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(fake.call("b").signal, controller.signal);
  fake.resolve("b");
  assert.equal((await created).id, "b");
});

test("[boundary-7] stage, exec and read after destroy are forwarded and resolve with the underlying result", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 1), fake, "a");
  await job.destroy();
  const result: EvaluationExecResult = { ...execResult, stdout: "v22\n" };
  underlying.behaviour.exec = async () => result;
  underlying.behaviour.read = async () => "contents";
  const command = { argv: ["node", "-v"] };
  const files: StagedFile[] = [];
  assert.equal(await job.exec(command), result);
  assert.equal(await job.stage(files), undefined);
  assert.equal(await job.read("x"), "contents");
  assert.deepEqual(underlying.calls.exec, [command]);
  assert.equal(underlying.calls.exec[0], command);
  assert.equal(underlying.calls.stage.length, 1);
  assert.equal(underlying.calls.stage[0], files);
  assert.deepEqual(underlying.calls.read, ["x"]);
});

test("[boundary-7] a call after destroy that the underlying job rejects rejects with the same error", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 1), fake, "a");
  await job.destroy();
  const error = new Error("job directory is gone");
  underlying.behaviour.exec = async () => {
    throw error;
  };
  assert.equal(await rejection(job.exec({ argv: ["node", "-v"] })), error);
  assert.equal(underlying.calls.exec.length, 1);
});

test("[boundary-8] a second destroy is forwarded but releases no second slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  track(limited.create({ label: "b", signal: neverAborted() }));
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  await a.job.destroy();
  await a.job.destroy();
  await flush();
  assert.equal(a.underlying.calls.destroy, 2);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

test("[boundary-8] a second destroy after a rejected one is forwarded but releases nothing more", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  track(limited.create({ label: "b", signal: neverAborted() }));
  track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  const error = new Error("rm failed");
  a.underlying.behaviour.destroy = async () => {
    throw error;
  };
  assert.equal(await rejection(a.job.destroy()), error);
  a.underlying.behaviour.destroy = async () => undefined;
  await a.job.destroy();
  await flush();
  assert.equal(a.underlying.calls.destroy, 2);
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// @unhappy
// ---------------------------------------------------------------------------

test("[unhappy-1] with max 0 a create waits until its signal aborts, then rejects with the reason", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 0);
  const controller = new AbortController();
  const created = track(limited.create({ label: "never", signal: controller.signal }));
  await flush();
  assert.equal(created.settled, false);
  assert.equal(fake.calls.length, 0);
  const reason = new Error("stop");
  controller.abort(reason);
  assert.equal(await rejection(created.promise), reason);
});

test("[unhappy-1] with max 0 aborting one waiter leaves another waiting", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 0);
  const first = new AbortController();
  const second = new AbortController();
  const a = track(limited.create({ label: "a", signal: first.signal }));
  const b = track(limited.create({ label: "b", signal: second.signal }));
  await flush();
  const reason = new Error("stop");
  first.abort(reason);
  assert.equal(await rejection(a.promise), reason);
  await flush();
  assert.equal(b.settled, false);
  assert.equal(fake.calls.length, 0);
});

test("[unhappy-2] a rejected underlying create rethrows the same error and frees the slot for the waiter", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = track(limited.create({ label: "a", signal: neverAborted() }));
  track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  const error = new Error("mkdtemp failed");
  fake.call("a").result.reject(error);
  assert.equal(await rejection(a.promise), error);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

test("[unhappy-2] a non-Error rejection is rethrown as the same value and the waiter gets the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = track(limited.create({ label: "a", signal: neverAborted() }));
  track(limited.create({ label: "b", signal: neverAborted() }));
  track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  const failure = { code: "EACCES" };
  fake.call("a").result.reject(failure);
  assert.equal(await rejection(a.promise), failure);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
});

test("[unhappy-3] after a failed create with no waiter the next create calls through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = limited.create({ label: "a", signal: neverAborted() });
  await flush();
  const error = new Error("boom");
  fake.call("a").result.reject(error);
  assert.equal(await rejection(a), error);
  track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

test("[unhappy-3] a failed create frees exactly one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = limited.create({ label: "a", signal: neverAborted() });
  await flush();
  const error = new Error("boom");
  fake.call("a").result.reject(error);
  assert.equal(await rejection(a), error);
  track(limited.create({ label: "b", signal: neverAborted() }));
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

test("[unhappy-4] a synchronously throwing create rejects with the same error and frees the slot", async () => {
  const fake = fakeProvider();
  const error = new Error("sync");
  fake.syncErrors.set("a", error);
  const limited = limitJobs(fake.provider, 1);
  const a = limited.create({ label: "a", signal: neverAborted() });
  assert.equal(typeof a.then, "function");
  assert.equal(await rejection(a), error);
  track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

test("[unhappy-4] a synchronously throwing create hands its slot to a waiter", async () => {
  const fake = fakeProvider();
  const error = new Error("sync");
  fake.syncErrors.set("a", error);
  const limited = limitJobs(fake.provider, 1);
  const a = track(limited.create({ label: "a", signal: neverAborted() }));
  const b = limited.create({ label: "b", signal: neverAborted() });
  await flush();
  assert.equal(await rejection(a.promise), error);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  fake.resolve("b");
  assert.equal((await b).id, "b");
});

test("[unhappy-5] an aborted waiter rejects with the reason and is skipped in the queue", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = track(limited.create({ label: "b", signal: controllerB.signal }));
  track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  const reason = new Error("cancelled");
  controllerB.abort(reason);
  assert.equal(await rejection(b.promise), reason);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "c"]);
});

test("[unhappy-5] an aborted only waiter takes no slot when the held job is destroyed", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = track(limited.create({ label: "b", signal: controllerB.signal }));
  await flush();
  const reason = new Error("cancelled");
  controllerB.abort(reason);
  assert.equal(await rejection(b.promise), reason);
  await a.job.destroy();
  await flush();
  track(limited.create({ label: "c", signal: neverAborted() }));
  const d = track(limited.create({ label: "d", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "c"]);
  assert.equal(d.settled, false);
});

test("[unhappy-6] aborting a waiter with no reason rejects with the signal's AbortError", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = track(limited.create({ label: "b", signal: controllerB.signal }));
  await flush();
  controllerB.abort();
  const error = await rejection(b.promise);
  assert.equal(error, controllerB.signal.reason);
  assert.ok(error instanceof DOMException);
  assert.equal(error.name, "AbortError");
});

test("[unhappy-6] aborting a waiter with an undefined reason rejects with the signal's AbortError", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = track(limited.create({ label: "b", signal: controllerB.signal }));
  await flush();
  controllerB.abort(undefined);
  const error = await rejection(b.promise);
  assert.equal(error, controllerB.signal.reason);
  assert.ok(error instanceof DOMException);
  assert.equal(error.name, "AbortError");
  assert.deepEqual(fake.labels(), ["a"]);
});

test("[unhappy-7] an already-aborted signal with no free slot rejects without queueing", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const controller = new AbortController();
  const reason = new Error("gone");
  controller.abort(reason);
  const b = limited.create({ label: "b", signal: controller.signal });
  assert.equal(await rejection(b), reason);
  await a.job.destroy();
  await flush();
  track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "c"]);
});

test("[unhappy-7] with max 0 an already-aborted signal rejects with its reason", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 0);
  const controller = new AbortController();
  const reason = new Error("gone");
  controller.abort(reason);
  const created = track(limited.create({ label: "b", signal: controller.signal }));
  await flush();
  assert.equal(created.settled, true);
  assert.equal(created.fulfilled, false);
  assert.equal(created.error, reason);
  assert.equal(fake.calls.length, 0);
});

test("[unhappy-8] a rejected exec rethrows the same error and keeps the slot held", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const error = new Error("A command needs an executable.");
  a.underlying.behaviour.exec = async () => {
    throw error;
  };
  assert.equal(await rejection(a.job.exec({ argv: [] })), error);
  const b = track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

test("[unhappy-8] rejected stage and read rethrow the same errors and keep the slot held", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const stageError = new Error("Path ../x leaves the job directory.");
  const readError = new Error("Path ../etc leaves the job directory.");
  a.underlying.behaviour.stage = async () => {
    throw stageError;
  };
  a.underlying.behaviour.read = async () => {
    throw readError;
  };
  assert.equal(await rejection(a.job.stage([{ path: "../x", text: "" }])), stageError);
  assert.equal(await rejection(a.job.read("../etc")), readError);
  const b = track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

test("[unhappy-9] a rejecting destroy rethrows the same error and hands the slot to the waiter", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  const error = new Error("rm failed");
  a.underlying.behaviour.destroy = async () => {
    throw error;
  };
  assert.equal(await rejection(a.job.destroy()), error);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

test("[unhappy-9] a rejecting destroy with no waiter frees exactly one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const error = new Error("rm failed");
  a.underlying.behaviour.destroy = async () => {
    throw error;
  };
  assert.equal(await rejection(a.job.destroy()), error);
  track(limited.create({ label: "b", signal: neverAborted() }));
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

// ---------------------------------------------------------------------------
// @concurrency
// ---------------------------------------------------------------------------

test("[concurrency-1] waiters get slots in the order they called create", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const b = limited.create({ label: "b", signal: neverAborted() });
  const c = limited.create({ label: "c", signal: neverAborted() });
  track(limited.create({ label: "d", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  fake.resolve("b");
  await (await b).destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  fake.resolve("c");
  await (await c).destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c", "d"]);
});

test("[concurrency-1] the oldest waiter gets the slot whichever held job is destroyed", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const first = await hold(limited, fake, "a1");
  const second = await hold(limited, fake, "a2");
  track(limited.create({ label: "c", signal: neverAborted() }));
  track(limited.create({ label: "d", signal: neverAborted() }));
  await flush();
  await second.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a1", "a2", "c"]);
  await first.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a1", "a2", "c", "d"]);
});

test("[concurrency-2] a create made after a handoff waits behind the waiter that got the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  track(limited.create({ label: "b", signal: neverAborted() }));
  await flush();
  await a.job.destroy();
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

test("[concurrency-2] creates made after a handoff wait behind the existing waiters in order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const b = limited.create({ label: "b", signal: neverAborted() });
  track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  await a.job.destroy();
  track(limited.create({ label: "d", signal: neverAborted() }));
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  fake.resolve("b");
  await (await b).destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
});

/**
 * Starts `count` creates at once; each job runs one exec and is destroyed.
 * Every underlying call waits in `pending` until the driver settles it, in
 * the order `pick` chooses.
 */
async function overlapping(
  max: number,
  count: number,
  pick: (step: number, length: number) => number,
): Promise<{ peak: number; order: string[]; created: string[]; done: boolean }> {
  const pending: (() => void)[] = [];
  const order: string[] = [];
  let alive = 0;
  let peak = 0;
  const provider: EvaluationProvider = {
    name: "fake",
    create({ label }) {
      order.push(label);
      alive += 1;
      peak = Math.max(peak, alive);
      return new Promise<EvaluationJob>((resolve) => {
        pending.push(() =>
          resolve({
            id: label,
            environment: { provider: "fake", environmentId: null, templateDigest: null },
            stage: () => new Promise<void>((done) => pending.push(() => done())),
            exec: () =>
              new Promise<EvaluationExecResult>((done) =>
                pending.push(() => done(execResult)),
              ),
            read: () => new Promise<string | null>((done) => pending.push(() => done(null))),
            destroy: () =>
              new Promise<void>((done) =>
                pending.push(() => {
                  alive -= 1;
                  done();
                }),
              ),
          }),
        );
      });
    },
  };
  const limited = limitJobs(provider, max);
  const created: string[] = [];
  const runs = labelsUpTo(count).map((label) =>
    track(
      (async () => {
        const job = await limited.create({ label, signal: neverAborted() });
        created.push(job.id);
        await job.exec({ argv: ["npm", "test"] });
        await job.destroy();
      })(),
    ),
  );
  for (let step = 0; step < 1000; step += 1) {
    await flush();
    if (pending.length === 0) break;
    const [settle] = pending.splice(pick(step, pending.length), 1);
    settle?.();
  }
  await flush();
  return { peak, order, created, done: runs.every((run) => run.fulfilled) };
}

test("[concurrency-3] ten overlapping jobs never have more than two alive underneath", async () => {
  const outcome = await overlapping(2, 10, (step, length) => (step * 7 + 3) % length);
  assert.equal(outcome.done, true);
  assert.deepEqual([...outcome.created].sort(), [...labelsUpTo(10)].sort());
  assert.ok(outcome.peak <= 2, `peak alive was ${outcome.peak}`);
  assert.deepEqual(outcome.order, labelsUpTo(10));
});

test("[concurrency-3] with max 1 and calls settled newest first, one job is alive at a time", async () => {
  const outcome = await overlapping(1, 5, (_step, length) => length - 1);
  assert.equal(outcome.done, true);
  assert.equal(outcome.created.length, 5);
  assert.ok(outcome.peak <= 1, `peak alive was ${outcome.peak}`);
  assert.deepEqual(outcome.order, labelsUpTo(5));
});

test("[concurrency-4] two overlapping destroy calls release only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  track(limited.create({ label: "b", signal: neverAborted() }));
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  const destroys: Deferred<void>[] = [];
  a.underlying.behaviour.destroy = () => {
    const next = deferred<void>();
    destroys.push(next);
    return next.promise;
  };
  const first = a.job.destroy();
  const second = a.job.destroy();
  await flush();
  for (const entry of destroys) entry.resolve();
  await Promise.all([first, second]);
  await flush();
  assert.equal(a.underlying.calls.destroy, 2);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

test("[concurrency-4] overlapping destroys where the first rejects still release only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  track(limited.create({ label: "b", signal: neverAborted() }));
  const c = track(limited.create({ label: "c", signal: neverAborted() }));
  await flush();
  const destroys: Deferred<void>[] = [];
  a.underlying.behaviour.destroy = () => {
    const next = deferred<void>();
    destroys.push(next);
    return next.promise;
  };
  const first = track(a.job.destroy());
  const second = track(a.job.destroy());
  await flush();
  assert.equal(destroys.length, 2);
  const error = new Error("rm failed");
  destroys[0]?.reject(error);
  destroys[1]?.resolve();
  await flush();
  assert.equal(first.error, error);
  assert.equal(second.fulfilled, true);
  assert.equal(a.underlying.calls.destroy, 2);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});
