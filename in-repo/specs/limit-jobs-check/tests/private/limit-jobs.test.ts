import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  EvaluationCommand,
  EvaluationExecResult,
  EvaluationJob,
  EvaluationProvider,
  StagedFile,
} from "sandbox-factory";
import { EVALUATION_JOBS_MAX, limitJobs } from "../../src/evaluation/limit.js";

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

const fakeEnvironment = () => ({
  provider: "fake",
  environmentId: null,
  templateDigest: null,
});

interface JobBehaviour {
  stage(files: readonly StagedFile[]): Promise<void>;
  exec(command: EvaluationCommand): Promise<EvaluationExecResult>;
  read(path: string): Promise<string | null>;
  destroy(): Promise<void>;
}

interface FakeJob {
  readonly job: EvaluationJob;
  readonly behaviour: JobBehaviour;
  readonly calls: {
    readonly stage: (readonly StagedFile[])[];
    readonly exec: EvaluationCommand[];
    readonly read: string[];
    destroy: number;
  };
}

function fakeJob(
  id: string,
  options: {
    extra?: Record<string, unknown>;
    environment?: EvaluationJob["environment"];
  } = {},
): FakeJob {
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
      environment: options.environment ?? fakeEnvironment(),
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
    options.extra ?? {},
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
  readonly syncErrors: Map<string, unknown>;
  labels(): string[];
  call(label: string): CreateCall;
  resolve(label: string): FakeJob;
}

function fakeProvider(
  options: { auto?: boolean; name?: string; extra?: Record<string, unknown> } = {},
): FakeProvider {
  const calls: CreateCall[] = [];
  const syncErrors = new Map<string, unknown>();
  const call = (label: string): CreateCall => {
    const found = calls.find((entry) => entry.label === label);
    assert.ok(found, `underlying create was not called for ${label}`);
    return found;
  };
  const resolve = (label: string): FakeJob => {
    const made = fakeJob(label);
    call(label).result.resolve(made.job);
    return made;
  };
  const provider: EvaluationProvider = Object.assign(
    {
      name: options.name ?? "fake",
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

function waiting(
  limited: EvaluationProvider,
  label: string,
  signal: AbortSignal = neverAborted(),
): Tracked<EvaluationJob> {
  return track(limited.create({ label, signal }));
}

// ---------------------------------------------------------------------------
// @happy
// ---------------------------------------------------------------------------

// Extends "[happy-1] using EVALUATION_JOBS_MAX as the cap lets exactly two creates through".
test("[happy-1] with EVALUATION_JOBS_MAX as the cap, two of four call through and a destroy serves only the third", async () => {
  assert.equal(typeof EVALUATION_JOBS_MAX, "number");
  assert.equal(EVALUATION_JOBS_MAX, 2);
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, EVALUATION_JOBS_MAX);
  const created = labelsUpTo(4).map((label) => waiting(limited, label));
  await flush();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  const j1 = fake.resolve("j1");
  await created[0]?.promise;
  await (created[0]?.value as EvaluationJob).destroy();
  await flush();
  assert.equal(j1.calls.destroy, 1);
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assert.equal(created[3]?.settled, false);
});

// Extends "[happy-2] limitJobs with max 3 calls the underlying create for a, b, c in order".
test("[happy-2] max 5 lets five of seven creates through in call order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 5);
  const created = labelsUpTo(7).map((label) => waiting(limited, label));
  await flush();
  assert.deepEqual(fake.labels(), labelsUpTo(5));
  assert.equal(created[5]?.settled, false);
  assert.equal(created[6]?.settled, false);
});

// Extends "[happy-2] with max 3 a fourth create waits": a cap below EVALUATION_JOBS_MAX.
test("[happy-2] max 1 lets only one create through even though EVALUATION_JOBS_MAX is 2", async () => {
  const fake = fakeProvider({ auto: true });
  const limited = limitJobs(fake.provider, 1);
  const created = ["a", "b", "c"].map((label) => waiting(limited, label));
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  assert.equal(created[1]?.settled, false);
  assert.equal(created[2]?.settled, false);
});

// Extends "[happy-2] with max 3 a fourth create waits": the fourth slot is max-based after a destroy.
test("[happy-2] max 4: destroying one of four held jobs lets the fifth through while the sixth waits", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 4);
  const held = [];
  for (const label of labelsUpTo(4)) held.push(await hold(limited, fake, label));
  const fifth = waiting(limited, "j5");
  const sixth = waiting(limited, "j6");
  await flush();
  assert.deepEqual(fake.labels(), labelsUpTo(4));
  await held[2]?.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), labelsUpTo(5));
  assert.equal(fifth.settled, false);
  assert.equal(sixth.settled, false);
});

// Extends "[happy-3] wrapping calls no underlying create and returns synchronously".
test("[happy-3] wrapping with max 0, NaN and Infinity calls nothing; the first create is the first underlying call", async () => {
  const fake = fakeProvider();
  const wrapped: EvaluationProvider[] = [];
  for (const max of [0, Number.NaN, Infinity]) {
    assert.doesNotThrow(() => {
      wrapped.push(limitJobs(fake.provider, max));
    });
  }
  await flush();
  assert.equal(fake.calls.length, 0);
  const unlimited = wrapped[2];
  assert.ok(unlimited);
  waiting(unlimited, "first");
  await flush();
  assert.deepEqual(fake.labels(), ["first"]);
});

// Extends "[happy-3] wrapping a provider whose create throws neither throws nor calls create".
test("[happy-3] wrapping one provider five times takes no slot from any wrapper", async () => {
  const fake = fakeProvider();
  let last: EvaluationProvider | undefined;
  for (let index = 0; index < 5; index += 1) last = limitJobs(fake.provider, 1);
  assert.ok(last);
  assert.equal(fake.calls.length, 0);
  const created = waiting(last, "a");
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  fake.resolve("a");
  await flush();
  assert.equal(created.fulfilled, true);
});

// Extends "[happy-4] the wrapped provider has exactly name and create, with the underlying name".
test("[happy-4] the wrapper takes another provider name and drops several extra members", () => {
  const fake = fakeProvider({
    name: "hosted-sandbox",
    extra: { region: "eu", close: () => undefined, template: { digest: "sha256:1" } },
  });
  const limited = limitJobs(fake.provider, 2);
  assert.deepEqual(Object.keys(limited).sort(), ["create", "name"]);
  assert.equal(limited.name, "hosted-sandbox");
  assert.equal("region" in limited, false);
  assert.equal("close" in limited, false);
  assert.equal("template" in limited, false);
});

// Extends "[happy-4] an extra method on the provider is dropped": create lives on a prototype.
test("[happy-4] a class-instance provider whose create is on its prototype still yields own name and create", async () => {
  const seen: string[] = [];
  class HostedProvider implements EvaluationProvider {
    readonly name = "class-provider";
    readonly region = "us";
    create(spec: { readonly label: string; readonly signal: AbortSignal }): Promise<EvaluationJob> {
      seen.push(spec.label);
      return Promise.resolve(fakeJob(spec.label).job);
    }
  }
  const limited = limitJobs(new HostedProvider(), 2);
  assert.deepEqual(Object.keys(limited).sort(), ["create", "name"]);
  assert.equal(limited.name, "class-provider");
  assert.equal("region" in limited, false);
  const job = await limited.create({ label: "p", signal: neverAborted() });
  assert.deepEqual(seen, ["p"]);
  assert.equal(job.id, "p");
});

// Extends "[happy-5] a create under the cap forwards label and signal and resolves with the job".
test("[happy-5] three creates under max 3 forward their own empty, unicode and spaced labels and signals", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  const labels = ["", "sbv_ü/✓ label", "  spaced  "];
  const signals = labels.map(() => neverAborted());
  const created = labels.map((label, index) =>
    limited.create({ label, signal: signals[index] as AbortSignal }),
  );
  await flush();
  assert.deepEqual(fake.labels(), labels);
  labels.forEach((label, index) => {
    assert.equal(fake.calls[index]?.signal, signals[index]);
    fake.resolve(label);
  });
  const jobs = await Promise.all(created);
  assert.deepEqual(
    jobs.map((job) => job.id),
    labels,
  );
});

// Extends "[happy-5] a create under the cap forwards label and signal": id comes from the job, not the label.
test("[happy-5] the wrapped job's id is the underlying job's id even when it differs from the label", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const created = limited.create({ label: "sbv_1/odd label", signal: neverAborted() });
  await flush();
  fake.call("sbv_1/odd label").result.resolve(fakeJob("job-42").job);
  assert.equal((await created).id, "job-42");
});

// Extends "[happy-6] a resolved exec does not free the slot".
test("[happy-6] with max 2, several resolved execs on both jobs keep a third create waiting", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = await hold(limited, fake, "a");
  const b = await hold(limited, fake, "b");
  for (let run = 0; run < 3; run += 1) {
    await a.job.exec({ argv: ["npm", "test"] });
    await b.job.exec({ argv: ["npm", "run", "lint"] });
  }
  const c = waiting(limited, "c");
  await flush();
  assert.equal(a.underlying.calls.exec.length, 3);
  assert.equal(b.underlying.calls.exec.length, 3);
  assert.equal(c.settled, false);
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

// Extends "[happy-6] resolved stage, exec and read together do not free the slot".
test("[happy-6] concurrent stage, exec and read calls that all resolve do not free the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  await Promise.all([
    a.job.exec({ argv: ["npm", "ci"] }),
    a.job.exec({ argv: ["npm", "test"] }),
    a.job.stage([{ path: "a.txt", text: "a" }]),
    a.job.read("out.txt"),
    a.job.read("package-lock.json"),
  ]);
  const b = waiting(limited, "b");
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

// Extends "[happy-7] the wrapped job has exactly the six members and is a new object".
test("[happy-7] a job with other id and environment values and several extras keeps only the six members", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const created = limited.create({ label: "a", signal: neverAborted() });
  await flush();
  const environment = {
    provider: "hosted",
    environmentId: "env-9",
    templateDigest: "sha256:abc",
  };
  const underlying = fakeJob("custom-id", {
    environment,
    extra: { debugUrl: "http://debug.invalid", pause: () => undefined, logs: [] },
  });
  fake.call("a").result.resolve(underlying.job);
  const job = await created;
  assert.deepEqual(Object.keys(job).sort(), [
    "destroy",
    "environment",
    "exec",
    "id",
    "read",
    "stage",
  ]);
  assert.equal(job.id, "custom-id");
  assert.equal(job.environment, environment);
  assert.equal("debugUrl" in job, false);
  assert.equal("pause" in job, false);
  assert.equal("logs" in job, false);
  assert.notEqual(job, underlying.job);
  for (const method of ["stage", "exec", "read", "destroy"] as const) {
    assert.equal(typeof job[method], "function");
  }
});

// Extends "[happy-7] an extra method on the underlying job is dropped": methods live on a prototype.
test("[happy-7] a class-instance job whose methods are on its prototype yields six own members that still forward", async () => {
  const log: string[] = [];
  const environment = fakeEnvironment();
  class ProtoJob implements EvaluationJob {
    readonly environment = environment;
    readonly secret = "x";
    constructor(readonly id: string) {}
    stage(): Promise<void> {
      log.push("stage");
      return Promise.resolve();
    }
    exec(): Promise<EvaluationExecResult> {
      log.push("exec");
      return Promise.resolve(execResult);
    }
    read(): Promise<string | null> {
      log.push("read");
      return Promise.resolve("text");
    }
    destroy(): Promise<void> {
      log.push("destroy");
      return Promise.resolve();
    }
  }
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const created = limited.create({ label: "a", signal: neverAborted() });
  await flush();
  fake.call("a").result.resolve(new ProtoJob("a"));
  const job = await created;
  assert.deepEqual(Object.keys(job).sort(), [
    "destroy",
    "environment",
    "exec",
    "id",
    "read",
    "stage",
  ]);
  assert.equal("secret" in job, false);
  assert.equal(job.environment, environment);
  assert.equal(await job.exec({ argv: ["node"] }), execResult);
  assert.equal(await job.read("f"), "text");
  assert.equal(await job.stage([]), undefined);
  await job.destroy();
  assert.deepEqual(log, ["exec", "read", "stage", "destroy"]);
});

// Extends "[happy-8] stage and exec forward their argument object and return the underlying result".
test("[happy-8] exec forwards a command with env and limits and returns a result with a null exit code", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 2), fake, "a");
  const command: EvaluationCommand = {
    argv: ["npm", "test", "--", "--grep", "x"],
    cwd: "pkg/inner",
    env: { CI: "1", EXTRA: "yes" },
    limits: { timeoutMs: 5000, maxOutputBytes: 1024 },
  };
  const result: EvaluationExecResult = {
    exitCode: null,
    timedOut: true,
    outputTruncated: true,
    stdout: "partial",
    stderr: "killed\n",
    durationMs: 5000,
  };
  underlying.behaviour.exec = async () => result;
  assert.equal(await job.exec(command), result);
  assert.equal(underlying.calls.exec.length, 1);
  assert.equal(underlying.calls.exec[0], command);
});

// Extends "[happy-8] read forwards its path and returns the underlying text or null".
test("[happy-8] read resolving with an empty string returns the empty string, not null", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 2), fake, "a");
  underlying.behaviour.read = async () => "";
  assert.equal(await job.read("empty.txt"), "");
  assert.deepEqual(underlying.calls.read, ["empty.txt"]);
});

// Extends "[happy-8] stage and exec forward their argument object": several files, a slow underlying call.
test("[happy-8] stage forwards a multi-file array once and resolves only with the slow underlying result", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 2), fake, "a");
  const staging = deferred<void>();
  underlying.behaviour.stage = () => staging.promise;
  const files: StagedFile[] = [
    { path: "package.json", text: "{}" },
    { path: "src/index.ts", text: "export {};" },
    { path: "test/a.test.ts", text: "" },
  ];
  const staged = track(job.stage(files));
  await flush();
  assert.equal(staged.settled, false);
  assert.equal(underlying.calls.stage.length, 1);
  assert.equal(underlying.calls.stage[0], files);
  staging.resolve();
  await flush();
  assert.equal(staged.fulfilled, true);
  assert.equal(staged.value, undefined);
  assert.equal(underlying.calls.stage.length, 1);
});

// Extends "[happy-8] read forwards its path ...": two jobs, each forwarding to its own underlying job.
test("[happy-8] methods of two wrapped jobs forward to their own underlying jobs", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = await hold(limited, fake, "a");
  const b = await hold(limited, fake, "b");
  a.underlying.behaviour.read = async () => "from a";
  b.underlying.behaviour.read = async () => "from b";
  assert.equal(await b.job.read("x"), "from b");
  assert.equal(await a.job.read("y"), "from a");
  const command = { argv: ["node", "b.js"] };
  await b.job.exec(command);
  assert.deepEqual(a.underlying.calls.read, ["y"]);
  assert.deepEqual(b.underlying.calls.read, ["x"]);
  assert.equal(a.underlying.calls.exec.length, 0);
  assert.equal(b.underlying.calls.exec[0], command);
});

// Extends "[happy-9] two wrappers of one provider each let their own job through": different providers.
test("[happy-9] wrappers of two different providers each have their own cap", async () => {
  const fakeA = fakeProvider();
  const fakeB = fakeProvider();
  const first = limitJobs(fakeA.provider, 1);
  await hold(first, fakeA, "a");
  const second = limitJobs(fakeB.provider, 1);
  const b = waiting(second, "b");
  const c = waiting(first, "c");
  const d = waiting(second, "d");
  await flush();
  assert.deepEqual(fakeA.labels(), ["a"]);
  assert.deepEqual(fakeB.labels(), ["b"]);
  assert.equal(b.settled, false);
  assert.equal(c.settled, false);
  assert.equal(d.settled, false);
});

// Extends "[happy-9] destroying a job of one wrapper does not free a slot in the other": separate queues.
test("[happy-9] a destroy in one wrapper serves only that wrapper's own waiter", async () => {
  const fake = fakeProvider();
  const first = limitJobs(fake.provider, 1);
  const second = limitJobs(fake.provider, 1);
  const a = await hold(first, fake, "a");
  const b = await hold(second, fake, "b");
  const c = waiting(first, "c");
  const d = waiting(second, "d");
  await flush();
  await b.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "d"]);
  assert.equal(c.settled, false);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "d", "c"]);
  assert.equal(d.settled, false);
});

// ---------------------------------------------------------------------------
// @boundary
// ---------------------------------------------------------------------------

// Extends "[boundary-1] with max 2 three same-turn creates let the first two through".
test("[boundary-1] max 3 with five same-turn creates: none synchronously, then the first three", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 3);
  const created = labelsUpTo(5).map((label) => waiting(limited, label));
  assert.equal(fake.calls.length, 0);
  await flush();
  assert.deepEqual(fake.labels(), ["j1", "j2", "j3"]);
  assert.equal(created[3]?.settled, false);
  assert.equal(created[4]?.settled, false);
});

// Extends "[boundary-1] with max 1 the first same-turn create takes the slot": a lone create with no cap pressure.
test("[boundary-1] a lone create under an Infinity cap does not call through synchronously", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, Infinity);
  waiting(limited, "solo");
  assert.equal(fake.calls.length, 0);
  await flush();
  assert.deepEqual(fake.labels(), ["solo"]);
});

// Extends "[boundary-2] creates beyond the cap wait (max 2 of 3, max 2 of 5, max 3 of 4)".
test("[boundary-2] max 4 of 9, max 1 of 6 and max 10 of 25: the first max labels call through, the rest wait", async () => {
  for (const [max, calls] of [
    [4, 9],
    [1, 6],
    [10, 25],
  ] as const) {
    const fake = fakeProvider({ auto: true });
    const limited = limitJobs(fake.provider, max);
    const created = labelsUpTo(calls).map((label) => waiting(limited, label));
    await flush();
    assert.deepEqual(fake.labels(), labelsUpTo(max), `max ${max} of ${calls}`);
    assert.equal(created.filter((entry) => entry.settled).length, max);
    assert.equal(
      created.slice(max).every((entry) => !entry.settled),
      true,
      `max ${max} of ${calls}`,
    );
  }
});

// Extends "[boundary-3] max 1.5 lets two creates through and Infinity lets all three through".
test("[boundary-3] max 1.2 lets two through and 2.7 lets three through, with no rounding", async () => {
  for (const [max, through] of [
    [1.2, 2],
    [2.7, 3],
  ] as const) {
    const fake = fakeProvider({ auto: true });
    let limited: EvaluationProvider | undefined;
    assert.doesNotThrow(() => {
      limited = limitJobs(fake.provider, max);
    });
    assert.ok(limited);
    for (const label of labelsUpTo(5)) waiting(limited, label);
    await flush();
    assert.equal(fake.calls.length, through, `max ${max}`);
  }
});

// Extends "[boundary-3] max 0, -1 and NaN let no create through and do not throw".
test("[boundary-3] max 0.5 lets one through and -Infinity none, without throwing", async () => {
  for (const [max, through] of [
    [0.5, 1],
    [-Infinity, 0],
  ] as const) {
    const fake = fakeProvider({ auto: true });
    let limited: EvaluationProvider | undefined;
    assert.doesNotThrow(() => {
      limited = limitJobs(fake.provider, max);
    });
    assert.ok(limited);
    for (const label of labelsUpTo(3)) waiting(limited, label);
    await flush();
    assert.equal(fake.calls.length, through, `max ${max}`);
  }
});

// Extends "[boundary-3] max 1.5 lets two creates through": the fractional cap holds after a destroy too.
test("[boundary-3] with max 1.5 destroying one of two held jobs lets exactly the third through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1.5);
  const a = await hold(limited, fake, "a");
  await hold(limited, fake, "b");
  const c = waiting(limited, "c");
  const d = waiting(limited, "d");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  assert.equal(c.settled, false);
  assert.equal(d.settled, false);
});

// Extends "[boundary-4] the slot is freed when the underlying destroy settles, not when it starts".
test("[boundary-4] with max 2 a pending destroy serves no waiter across many turns, then exactly one", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = await hold(limited, fake, "a");
  await hold(limited, fake, "b");
  waiting(limited, "c");
  const d = waiting(limited, "d");
  await flush();
  const destroying = deferred<void>();
  a.underlying.behaviour.destroy = () => destroying.promise;
  const destroyed = track(a.job.destroy());
  for (let round = 0; round < 4; round += 1) await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  destroying.resolve();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  assert.equal(d.settled, false);
  assert.equal(destroyed.fulfilled, true);
  assert.equal(destroyed.value, undefined);
});

// Extends "[boundary-5] aborting after the slot was handed over leaves the create and slot alone".
test("[boundary-5] a slot granted synchronously stays granted when the signal aborts before the underlying create runs", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const controller = new AbortController();
  const a = track(limited.create({ label: "a", signal: controller.signal }));
  controller.abort(new Error("early"));
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  assert.equal(fake.call("a").signal, controller.signal);
  fake.resolve("a");
  await flush();
  assert.equal(a.fulfilled, true);
  assert.equal(a.value?.id, "a");
  const b = waiting(limited, "b");
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

// Extends "[boundary-5] aborting after the slot was handed over ...": the provider then rejects.
test("[boundary-5] after a late abort the underlying create's own rejection is rethrown, not the abort reason", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = waiting(limited, "b", controllerB.signal);
  await flush();
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  controllerB.abort(new Error("late"));
  await flush();
  assert.equal(b.settled, false);
  const providerError = new Error("provider saw the abort");
  fake.call("b").result.reject(providerError);
  assert.equal(await rejection(b.promise), providerError);
});

// Extends "[boundary-5] aborting after the wrapped create resolved keeps the job usable and the slot held".
test("[boundary-5] with max 2 a late abort on a handed-over job keeps its slot until that job is destroyed", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a1 = await hold(limited, fake, "a1");
  await hold(limited, fake, "a2");
  const controllerB = new AbortController();
  const b = waiting(limited, "b", controllerB.signal);
  await flush();
  await a1.job.destroy();
  await flush();
  controllerB.abort(new Error("late"));
  fake.resolve("b");
  await flush();
  assert.equal(b.fulfilled, true);
  const jobB = b.value as EvaluationJob;
  assert.equal(jobB.id, "b");
  const c = waiting(limited, "c");
  await flush();
  assert.equal(c.settled, false);
  assert.deepEqual(fake.labels(), ["a1", "a2", "b"]);
  await jobB.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a1", "a2", "b", "c"]);
});

// Extends "[boundary-6] an already-aborted signal with a free slot still calls through".
test("[boundary-6] with max Infinity three already-aborted creates all call through with their own signals", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, Infinity);
  const signals = [AbortSignal.abort(), AbortSignal.abort("why"), AbortSignal.abort(new Error("e"))];
  const created = signals.map((signal, index) =>
    limited.create({ label: `x${index}`, signal }),
  );
  await flush();
  assert.deepEqual(fake.labels(), ["x0", "x1", "x2"]);
  signals.forEach((signal, index) => {
    assert.equal(fake.calls[index]?.signal, signal);
    fake.resolve(`x${index}`);
  });
  const jobs = await Promise.all(created);
  assert.deepEqual(
    jobs.map((job) => job.id),
    ["x0", "x1", "x2"],
  );
});

// Extends "[boundary-6] an already-aborted signal taking the last free slot still calls through": slot freed by destroy.
test("[boundary-6] an already-aborted create after a destroy freed the only slot calls through", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  await a.job.destroy();
  await flush();
  const signal = AbortSignal.abort(new Error("gone"));
  const created = limited.create({ label: "b", signal });
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(fake.call("b").signal, signal);
  fake.resolve("b");
  assert.equal((await created).id, "b");
});

// Extends "[boundary-6] an already-aborted signal with a free slot still calls through": the provider rejects.
test("[boundary-6] already aborted with a free slot: the provider's rejection is rethrown and the slot freed", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const reason = new Error("gone");
  const created = track(limited.create({ label: "a", signal: AbortSignal.abort(reason) }));
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
  const providerError = new Error("aborted before start");
  fake.call("a").result.reject(providerError);
  assert.equal(await rejection(created.promise), providerError);
  waiting(limited, "b");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

// Extends "[boundary-7] stage, exec and read after destroy are forwarded ...": after a rejected destroy.
test("[boundary-7] after a rejected destroy, stage, exec and read are still forwarded and resolve", async () => {
  const fake = fakeProvider();
  const { job, underlying } = await hold(limitJobs(fake.provider, 1), fake, "a");
  const error = new Error("rm failed");
  underlying.behaviour.destroy = async () => {
    throw error;
  };
  assert.equal(await rejection(job.destroy()), error);
  underlying.behaviour.read = async () => "still here";
  const command = { argv: ["ls"] };
  const files = [{ path: "late.txt", text: "late" }];
  assert.equal(await job.exec(command), execResult);
  assert.equal(await job.stage(files), undefined);
  assert.equal(await job.read("late.txt"), "still here");
  assert.equal(underlying.calls.exec[0], command);
  assert.equal(underlying.calls.stage[0], files);
  assert.deepEqual(underlying.calls.read, ["late.txt"]);
});

// Extends "[boundary-7] stage, exec and read after destroy are forwarded": the slot went to another job.
test("[boundary-7] calls on a destroyed job go to its own underlying job, not the job that took its slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const b = limited.create({ label: "b", signal: neverAborted() });
  await flush();
  await a.job.destroy();
  await flush();
  const underlyingB = fake.resolve("b");
  await b;
  a.underlying.behaviour.read = async () => "a text";
  underlyingB.behaviour.read = async () => "b text";
  assert.equal(await a.job.read("r"), "a text");
  await a.job.exec({ argv: ["node", "-v"] });
  await a.job.exec({ argv: ["node", "-v"] });
  assert.deepEqual(a.underlying.calls.read, ["r"]);
  assert.equal(a.underlying.calls.exec.length, 2);
  assert.equal(underlyingB.calls.read.length, 0);
  assert.equal(underlyingB.calls.exec.length, 0);
});

// Extends "[boundary-8] a second destroy is forwarded but releases no second slot": no waiters.
test("[boundary-8] a second destroy with no waiter leaves exactly one slot free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  await a.job.destroy();
  await a.job.destroy();
  await flush();
  assert.equal(a.underlying.calls.destroy, 2);
  waiting(limited, "b");
  const c = waiting(limited, "c");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

// Extends "[boundary-8] a second destroy is forwarded ...": three destroys, max 2, three waiters.
test("[boundary-8] three sequential destroys with max 2 serve only one of three waiters", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = await hold(limited, fake, "a");
  await hold(limited, fake, "b");
  waiting(limited, "c");
  const d = waiting(limited, "d");
  const e = waiting(limited, "e");
  await flush();
  await a.job.destroy();
  await a.job.destroy();
  await a.job.destroy();
  await flush();
  assert.equal(a.underlying.calls.destroy, 3);
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  assert.equal(d.settled, false);
  assert.equal(e.settled, false);
});

// Extends "[boundary-8] a second destroy after a rejected one ...": the second one rejects instead.
test("[boundary-8] a second destroy whose underlying destroy rejects rethrows that error and releases nothing", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  waiting(limited, "b");
  const c = waiting(limited, "c");
  await flush();
  await a.job.destroy();
  const error = new Error("already gone");
  a.underlying.behaviour.destroy = async () => {
    throw error;
  };
  assert.equal(await rejection(a.job.destroy()), error);
  await flush();
  assert.equal(a.underlying.calls.destroy, 2);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

// ---------------------------------------------------------------------------
// @unhappy
// ---------------------------------------------------------------------------

// Extends "[unhappy-1] with max 0 a create waits until its signal aborts, then rejects with the reason".
test("[unhappy-1] with max -1 and NaN a create waits until its signal aborts, then rejects with that reason", async () => {
  for (const max of [-1, Number.NaN]) {
    const fake = fakeProvider();
    const limited = limitJobs(fake.provider, max);
    const controller = new AbortController();
    const created = waiting(limited, "never", controller.signal);
    await flush();
    assert.equal(created.settled, false, `max ${max}`);
    const reason = new Error(`stop ${max}`);
    controller.abort(reason);
    assert.equal(await rejection(created.promise), reason);
    assert.equal(fake.calls.length, 0);
  }
});

// Extends "[unhappy-1] with max 0 a create waits until its signal aborts": a non-Error reason.
test("[unhappy-1] with max 0 a non-Error abort reason is rejected as the same value", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 0);
  const controller = new AbortController();
  const created = waiting(limited, "never", controller.signal);
  await flush();
  const reason = { code: "USER_CANCELLED" };
  controller.abort(reason);
  assert.equal(await rejection(created.promise), reason);
  assert.equal(fake.calls.length, 0);
});

// Extends "[unhappy-1] with max 0 aborting one waiter leaves another waiting".
test("[unhappy-1] with max 0 three waiters aborted newest first each reject with their own reason", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 0);
  const controllers = [new AbortController(), new AbortController(), new AbortController()];
  const created = controllers.map((controller, index) =>
    waiting(limited, `w${index}`, controller.signal),
  );
  await flush();
  const reasons = controllers.map((_, index) => new Error(`stop ${index}`));
  for (const index of [2, 1, 0]) {
    controllers[index]?.abort(reasons[index]);
    assert.equal(await rejection((created[index] as Tracked<EvaluationJob>).promise), reasons[index]);
    for (const other of created.slice(0, index)) assert.equal(other.settled, false);
  }
  assert.equal(fake.calls.length, 0);
});

// Extends "[unhappy-2] a rejected underlying create rethrows the same error and frees the slot for the waiter".
test("[unhappy-2] max 2: two failed creates hand slots to the two oldest of three waiters, with their own signals", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = waiting(limited, "a");
  const b = waiting(limited, "b");
  const signals = [neverAborted(), neverAborted(), neverAborted()];
  waiting(limited, "c", signals[0]);
  waiting(limited, "d", signals[1]);
  const e = waiting(limited, "e", signals[2]);
  await flush();
  const errorB = new Error("b failed");
  const errorA = new Error("a failed");
  fake.call("b").result.reject(errorB);
  assert.equal(await rejection(b.promise), errorB);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  fake.call("a").result.reject(errorA);
  assert.equal(await rejection(a.promise), errorA);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c", "d"]);
  assert.equal(fake.call("c").signal, signals[0]);
  assert.equal(fake.call("d").signal, signals[1]);
  assert.equal(e.settled, false);
});

// Extends "[unhappy-2] a rejected underlying create ...": exactly one waiter is served per failure.
test("[unhappy-2] a failed create hands its slot to exactly one of two waiters", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = waiting(limited, "a");
  waiting(limited, "b");
  const c = waiting(limited, "c");
  await flush();
  const error = new Error("mkdtemp failed");
  fake.call("a").result.reject(error);
  assert.equal(await rejection(a.promise), error);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

// Extends "[unhappy-3] a failed create frees exactly one slot": many failures in a row.
test("[unhappy-3] max 1: five failed creates in a row leave exactly one slot free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  for (let index = 0; index < 5; index += 1) {
    const label = `f${index}`;
    const created = limited.create({ label, signal: neverAborted() });
    await flush();
    const error = new Error(`boom ${index}`);
    fake.call(label).result.reject(error);
    assert.equal(await rejection(created), error);
  }
  waiting(limited, "b");
  const c = waiting(limited, "c");
  await flush();
  assert.deepEqual(fake.labels().slice(5), ["b"]);
  assert.equal(c.settled, false);
});

// Extends "[unhappy-3] after a failed create with no waiter the next create calls through": max 2.
test("[unhappy-3] max 2: both creates fail, then two new creates call through and a third waits", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = waiting(limited, "a");
  const b = waiting(limited, "b");
  await flush();
  fake.call("a").result.reject(new Error("a"));
  fake.call("b").result.reject(new Error("b"));
  await rejection(a.promise);
  await rejection(b.promise);
  waiting(limited, "c");
  waiting(limited, "d");
  const e = waiting(limited, "e");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c", "d"]);
  assert.equal(e.settled, false);
});

// Extends "[unhappy-4] a synchronously throwing create rejects with the same error and frees the slot".
test("[unhappy-4] a synchronously thrown non-Error value is rejected as the same value and frees one slot", async () => {
  const fake = fakeProvider();
  const thrown = "sync failure";
  fake.syncErrors.set("a", thrown);
  const limited = limitJobs(fake.provider, 1);
  let created: Promise<EvaluationJob> | undefined;
  assert.doesNotThrow(() => {
    created = limited.create({ label: "a", signal: neverAborted() });
  });
  assert.ok(created);
  assert.equal(await rejection(created), thrown);
  waiting(limited, "b");
  const c = waiting(limited, "c");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

// Extends "[unhappy-4] a synchronously throwing create hands its slot to a waiter": max 2, two throws.
test("[unhappy-4] max 2: two synchronously throwing creates hand their slots to two waiters in order", async () => {
  const fake = fakeProvider();
  const errorA = new Error("sync a");
  const errorB = new Error("sync b");
  fake.syncErrors.set("a", errorA);
  fake.syncErrors.set("b", errorB);
  const limited = limitJobs(fake.provider, 2);
  const a = waiting(limited, "a");
  const b = waiting(limited, "b");
  waiting(limited, "c");
  waiting(limited, "d");
  const e = waiting(limited, "e");
  await flush();
  assert.equal(await rejection(a.promise), errorA);
  assert.equal(await rejection(b.promise), errorB);
  assert.deepEqual(fake.labels(), ["a", "b", "c", "d"]);
  assert.equal(e.settled, false);
});

// Extends "[unhappy-5] an aborted waiter rejects with the reason and is skipped in the queue": the middle waiter.
test("[unhappy-5] aborting the middle of three waiters skips only it", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const b = limited.create({ label: "b", signal: neverAborted() });
  const controllerC = new AbortController();
  const c = waiting(limited, "c", controllerC.signal);
  const d = limited.create({ label: "d", signal: neverAborted() });
  await flush();
  const reason = new Error("cancelled c");
  controllerC.abort(reason);
  assert.equal(await rejection(c.promise), reason);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  fake.resolve("b");
  await (await b).destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "d"]);
  fake.resolve("d");
  assert.equal((await d).id, "d");
});

// Extends "[unhappy-5] an aborted waiter ...": the oldest waiter aborts.
test("[unhappy-5] aborting the oldest of three waiters hands the next slot to the second", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = waiting(limited, "b", controllerB.signal);
  waiting(limited, "c");
  const d = waiting(limited, "d");
  await flush();
  const reason = new Error("cancelled b");
  controllerB.abort(reason);
  assert.equal(await rejection(b.promise), reason);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "c"]);
  assert.equal(d.settled, false);
});

// Extends "[unhappy-5] an aborted only waiter takes no slot": aborting frees no held slot.
test("[unhappy-5] aborting a waiter frees no slot: a create made afterwards still waits", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const b = waiting(limited, "b", controllerB.signal);
  await flush();
  const reason = new Error("cancelled");
  controllerB.abort(reason);
  assert.equal(await rejection(b.promise), reason);
  const c = waiting(limited, "c");
  await flush();
  assert.equal(c.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

// Extends "[unhappy-5] an aborted waiter ...": one signal shared by two waiters, with a non-Error reason.
test("[unhappy-5] a signal shared by two waiters rejects both with the same non-Error reason and skips both", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const shared = new AbortController();
  const b = waiting(limited, "b", shared.signal);
  const c = waiting(limited, "c", shared.signal);
  const d = waiting(limited, "d");
  await flush();
  const reason = "user cancelled";
  shared.abort(reason);
  assert.equal(await rejection(b.promise), reason);
  assert.equal(await rejection(c.promise), reason);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "d"]);
  assert.equal(d.settled, false);
});

// Extends "[unhappy-6] aborting a waiter with no reason rejects with the signal's AbortError": two waiters.
test("[unhappy-6] two waiters aborted with no reason each reject with their own signal's AbortError", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  await hold(limited, fake, "a");
  const controllerB = new AbortController();
  const controllerC = new AbortController();
  const b = waiting(limited, "b", controllerB.signal);
  const c = waiting(limited, "c", controllerC.signal);
  await flush();
  controllerC.abort();
  controllerB.abort();
  const errorB = await rejection(b.promise);
  const errorC = await rejection(c.promise);
  assert.equal(errorB, controllerB.signal.reason);
  assert.equal(errorC, controllerC.signal.reason);
  assert.notEqual(errorB, errorC);
  assert.ok(errorB instanceof DOMException);
  assert.equal(errorB.name, "AbortError");
  assert.ok(errorC instanceof DOMException);
  assert.equal(errorC.name, "AbortError");
});

// Extends "[unhappy-6] aborting a waiter with no reason ...": a waiter under max 0.
test("[unhappy-6] with max 0 abort() with no reason rejects with the signal's own AbortError", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 0);
  const controller = new AbortController();
  const created = waiting(limited, "never", controller.signal);
  await flush();
  controller.abort();
  const error = await rejection(created.promise);
  assert.equal(error, controller.signal.reason);
  assert.ok(error instanceof DOMException);
  assert.equal(error.name, "AbortError");
  assert.equal(fake.calls.length, 0);
});

// Extends "[unhappy-7] an already-aborted signal with no free slot rejects without queueing": default reason.
test("[unhappy-7] AbortSignal.abort() with no free slot rejects with that signal's reason before any destroy", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const signal = AbortSignal.abort();
  const b = waiting(limited, "b", signal);
  await flush();
  assert.equal(b.settled, true);
  assert.equal(b.fulfilled, false);
  assert.equal(b.error, signal.reason);
  assert.ok(b.error instanceof DOMException);
  await a.job.destroy();
  await flush();
  waiting(limited, "c");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "c"]);
});

// Extends "[unhappy-7] an already-aborted signal with no free slot ...": behind existing waiters.
test("[unhappy-7] an already-aborted create behind existing waiters rejects at once and is never called", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const b = limited.create({ label: "b", signal: neverAborted() });
  await flush();
  const reason = new Error("gone");
  const c = waiting(limited, "c", AbortSignal.abort(reason));
  await flush();
  assert.equal(c.error, reason);
  assert.equal(c.fulfilled, false);
  await a.job.destroy();
  await flush();
  fake.resolve("b");
  await (await b).destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  waiting(limited, "d");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "d"]);
});

// Extends "[unhappy-7] an already-aborted signal with no free slot ...": the slot was taken in the same turn.
test("[unhappy-7] a slot taken synchronously by a same-turn create leaves none for an already-aborted create", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  waiting(limited, "a");
  const reason = new Error("gone");
  const b = waiting(limited, "b", AbortSignal.abort(reason));
  assert.equal(await rejection(b.promise), reason);
  await flush();
  assert.deepEqual(fake.labels(), ["a"]);
});

// Extends "[unhappy-8] a rejected exec rethrows the same error and keeps the slot held": max 2.
test("[unhappy-8] max 2: failing exec on both held jobs keeps a third create waiting", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const jobs = [await hold(limited, fake, "a"), await hold(limited, fake, "b")];
  for (const entry of jobs) {
    const error = new Error(`A command needs an executable. (${entry.job.id})`);
    entry.underlying.behaviour.exec = async () => {
      throw error;
    };
    assert.equal(await rejection(entry.job.exec({ argv: [] })), error);
  }
  const c = waiting(limited, "c");
  await flush();
  assert.equal(c.settled, false);
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

// Extends "[unhappy-8] rejected stage and read rethrow the same errors and keep the slot held": non-Error values.
test("[unhappy-8] non-Error rejections from stage, exec and read propagate as the same values", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const stageFailure = { code: "EACCES" };
  const execFailure = "spawn failed";
  const readFailure = 42;
  a.underlying.behaviour.stage = () => Promise.reject(stageFailure);
  a.underlying.behaviour.exec = () => Promise.reject(execFailure);
  a.underlying.behaviour.read = () => Promise.reject(readFailure);
  assert.equal(await rejection(a.job.stage([{ path: "../x", text: "" }])), stageFailure);
  assert.equal(await rejection(a.job.exec({ argv: ["missing-binary"] })), execFailure);
  assert.equal(await rejection(a.job.read("../etc")), readFailure);
  const b = waiting(limited, "b");
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
});

// Extends "[unhappy-8] a rejected exec ... keeps the slot held": the slot is then freed only by destroy.
test("[unhappy-8] after failed stage, exec and read the slot stays held until destroy frees it", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  a.underlying.behaviour.stage = async () => {
    throw new Error("Path ../x leaves the job directory.");
  };
  a.underlying.behaviour.exec = async () => {
    throw new Error("A command needs an executable.");
  };
  a.underlying.behaviour.read = async () => {
    throw new Error("Path ../etc leaves the job directory.");
  };
  await rejection(a.job.stage([]));
  await rejection(a.job.exec({ argv: [] }));
  await rejection(a.job.read("../etc"));
  const b = waiting(limited, "b");
  await flush();
  assert.equal(b.settled, false);
  assert.deepEqual(fake.labels(), ["a"]);
  await a.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

// Extends "[unhappy-9] a rejecting destroy rethrows the same error and hands the slot to the waiter": max 2.
test("[unhappy-9] max 2: two rejecting destroys hand slots to two waiters in order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = await hold(limited, fake, "a");
  const b = await hold(limited, fake, "b");
  waiting(limited, "c");
  waiting(limited, "d");
  const e = waiting(limited, "e");
  await flush();
  const errorA = new Error("rm a failed");
  const errorB = new Error("rm b failed");
  a.underlying.behaviour.destroy = async () => {
    throw errorA;
  };
  b.underlying.behaviour.destroy = async () => {
    throw errorB;
  };
  assert.equal(await rejection(b.job.destroy()), errorB);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  assert.equal(await rejection(a.job.destroy()), errorA);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c", "d"]);
  assert.equal(e.settled, false);
});

// Extends "[unhappy-9] a rejecting destroy rethrows ...": two waiters, only the oldest served.
test("[unhappy-9] a rejecting destroy with two waiters serves only the oldest", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  waiting(limited, "b");
  const c = waiting(limited, "c");
  await flush();
  const error = new Error("rm failed");
  a.underlying.behaviour.destroy = async () => {
    throw error;
  };
  assert.equal(await rejection(a.job.destroy()), error);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

// Extends "[unhappy-9] a rejecting destroy with no waiter frees exactly one slot": a non-Error value.
test("[unhappy-9] a non-Error destroy rejection propagates as the same value and frees the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const failure = { code: "EBUSY" };
  a.underlying.behaviour.destroy = () => Promise.reject(failure);
  assert.equal(await rejection(a.job.destroy()), failure);
  waiting(limited, "b");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

// Extends "[unhappy-9] a rejecting destroy ...": the underlying destroy throws synchronously.
test("[unhappy-9] an underlying destroy that throws synchronously still frees the slot and the same error reaches the caller", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  waiting(limited, "b");
  await flush();
  const error = new Error("rm failed synchronously");
  a.underlying.behaviour.destroy = () => {
    throw error;
  };
  let outcome: unknown;
  try {
    outcome = await rejection(a.job.destroy());
  } catch (thrown) {
    outcome = thrown;
  }
  assert.equal(outcome, error);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
});

// ---------------------------------------------------------------------------
// @concurrency
// ---------------------------------------------------------------------------

// Extends "[concurrency-1] the oldest waiter gets the slot whichever held job is destroyed".
test("[concurrency-1] max 2 with six waiters: destroys in mixed order serve waiters in creation order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const created = labelsUpTo(8).map((label) => waiting(limited, label));
  await flush();
  assert.deepEqual(fake.labels(), ["j1", "j2"]);
  const destroyHeld = async (label: string): Promise<void> => {
    fake.resolve(label);
    await flush();
    const entry = created[Number(label.slice(1)) - 1];
    assert.equal(entry?.fulfilled, true);
    await (entry?.value as EvaluationJob).destroy();
    await flush();
  };
  const steps: [string, string][] = [
    ["j2", "j3"],
    ["j1", "j4"],
    ["j4", "j5"],
    ["j3", "j6"],
    ["j6", "j7"],
    ["j5", "j8"],
  ];
  for (const [destroyed, served] of steps) {
    await destroyHeld(destroyed);
    assert.equal(fake.labels().at(-1), served, `destroying ${destroyed}`);
  }
  assert.deepEqual(fake.labels(), labelsUpTo(8));
});

// Extends "[concurrency-1] waiters get slots in the order they called create": failure and destroy mixed.
test("[concurrency-1] slots freed by a failed create and by a destroy go to waiters in call order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a = waiting(limited, "a");
  const b = await hold(limited, fake, "b");
  waiting(limited, "c");
  waiting(limited, "d");
  const e = waiting(limited, "e");
  await flush();
  fake.call("a").result.reject(new Error("a failed"));
  await rejection(a.promise);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
  await b.job.destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c", "d"]);
  assert.equal(e.settled, false);
});

// Extends "[concurrency-2] a create made after a handoff waits behind the waiter that got the slot".
test("[concurrency-2] a create made in the same turn the underlying destroy resolves waits behind the waiter", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  const b = limited.create({ label: "b", signal: neverAborted() });
  await flush();
  const destroying = deferred<void>();
  a.underlying.behaviour.destroy = () => destroying.promise;
  const destroyed = a.job.destroy();
  await flush();
  destroying.resolve();
  const c = waiting(limited, "c");
  await destroyed;
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
  fake.resolve("b");
  await (await b).destroy();
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b", "c"]);
});

// Extends "[concurrency-2] a create made after a handoff ...": the handoff came from a failed create.
test("[concurrency-2] a create made as soon as a failed create's rejection is seen waits behind the waiter that got the slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = limited.create({ label: "a", signal: neverAborted() });
  waiting(limited, "b");
  await flush();
  let c: Tracked<EvaluationJob> | undefined;
  const error = new Error("mkdtemp failed");
  const observed = a.then(
    () => assert.fail("expected the create for a to reject"),
    (reason: unknown) => {
      c = waiting(limited, "c");
      return reason;
    },
  );
  fake.call("a").result.reject(error);
  assert.equal(await observed, error);
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c?.settled, false);
});

// Extends "[concurrency-2] creates made after a handoff wait behind the existing waiters in order": max 2.
test("[concurrency-2] max 2: creates made right after a handoff wait behind the existing waiters, then go in order", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 2);
  const a1 = await hold(limited, fake, "a1");
  const a2 = await hold(limited, fake, "a2");
  waiting(limited, "b");
  waiting(limited, "c");
  await flush();
  await a1.job.destroy();
  waiting(limited, "d");
  const e = waiting(limited, "e");
  await flush();
  assert.deepEqual(fake.labels(), ["a1", "a2", "b"]);
  await a2.job.destroy();
  waiting(limited, "f");
  await flush();
  assert.deepEqual(fake.labels(), ["a1", "a2", "b", "c"]);
  assert.equal(e.settled, false);
});

/**
 * Starts `count` creates at once; each job runs stage, exec and read and is
 * destroyed. Every underlying call waits in `pending` until the driver
 * settles it, in the order `pick` chooses.
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
            environment: fakeEnvironment(),
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
        await job.stage([{ path: "a.txt", text: label }]);
        await job.exec({ argv: ["npm", "test"] });
        await job.read("package-lock.json");
        await job.destroy();
      })(),
    ),
  );
  for (let step = 0; step < 5000; step += 1) {
    await flush();
    if (pending.length === 0) break;
    const [settle] = pending.splice(pick(step, pending.length), 1);
    settle?.();
  }
  await flush();
  return { peak, order, created, done: runs.every((run) => run.fulfilled) };
}

// Extends "[concurrency-3] ten overlapping jobs never have more than two alive underneath": max 3, fifteen jobs.
test("[concurrency-3] max 3 with fifteen jobs settled oldest first: peak exactly 3 and creates in label order", async () => {
  const outcome = await overlapping(3, 15, () => 0);
  assert.equal(outcome.done, true);
  assert.deepEqual([...outcome.created].sort(), [...labelsUpTo(15)].sort());
  assert.equal(outcome.peak, 3);
  assert.deepEqual(outcome.order, labelsUpTo(15));
});

// Extends "[concurrency-3] ten overlapping jobs ...": another arbitrary settle order, twelve jobs.
test("[concurrency-3] max 2 with twelve jobs settled in another arbitrary order: peak exactly 2 and creates in label order", async () => {
  const outcome = await overlapping(2, 12, (step, length) => (step * 5 + 1) % length);
  assert.equal(outcome.done, true);
  assert.equal(outcome.created.length, 12);
  assert.equal(outcome.peak, 2);
  assert.deepEqual(outcome.order, labelsUpTo(12));
});

// Extends "[concurrency-3] with max 1 and calls settled newest first ...": max 2, ten jobs, newest first.
test("[concurrency-3] max 2 with ten jobs settled newest first never has more than two alive", async () => {
  const outcome = await overlapping(2, 10, (_step, length) => length - 1);
  assert.equal(outcome.done, true);
  assert.equal(outcome.created.length, 10);
  assert.ok(outcome.peak <= 2, `peak alive was ${outcome.peak}`);
  assert.deepEqual(outcome.order, labelsUpTo(10));
});

// Extends "[concurrency-4] two overlapping destroy calls release only one slot": three, resolved in reverse.
test("[concurrency-4] three overlapping destroys resolved in reverse order release only one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  waiting(limited, "b");
  const c = waiting(limited, "c");
  const d = waiting(limited, "d");
  await flush();
  const destroys: Deferred<void>[] = [];
  a.underlying.behaviour.destroy = () => {
    const next = deferred<void>();
    destroys.push(next);
    return next.promise;
  };
  const all = [a.job.destroy(), a.job.destroy(), a.job.destroy()];
  await flush();
  assert.equal(destroys.length, 3);
  for (const entry of [...destroys].reverse()) {
    entry.resolve();
    await flush();
  }
  await Promise.all(all);
  await flush();
  assert.equal(a.underlying.calls.destroy, 3);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
  assert.equal(d.settled, false);
});

// Extends "[concurrency-4] two overlapping destroy calls ...": no waiters, then new creates.
test("[concurrency-4] overlapping destroys with no waiter leave exactly one slot free", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
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
  waiting(limited, "b");
  const c = waiting(limited, "c");
  await flush();
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});

// Extends "[concurrency-4] overlapping destroys where the first rejects ...": both reject.
test("[concurrency-4] two overlapping destroys that both reject each rethrow their own error and release one slot", async () => {
  const fake = fakeProvider();
  const limited = limitJobs(fake.provider, 1);
  const a = await hold(limited, fake, "a");
  waiting(limited, "b");
  const c = waiting(limited, "c");
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
  const errorFirst = new Error("rm failed once");
  const errorSecond = new Error("rm failed twice");
  destroys[1]?.reject(errorSecond);
  destroys[0]?.reject(errorFirst);
  await flush();
  assert.equal(first.error, errorFirst);
  assert.equal(second.error, errorSecond);
  assert.equal(a.underlying.calls.destroy, 2);
  assert.deepEqual(fake.labels(), ["a", "b"]);
  assert.equal(c.settled, false);
});
