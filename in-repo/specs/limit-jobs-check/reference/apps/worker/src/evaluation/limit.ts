/**
 * A cap on how many evaluation jobs of a provider are alive at once
 * (ticket #104: at most two evaluation jobs run at once on a worker).
 */

import type {
  EvaluationCommand,
  EvaluationJob,
  EvaluationProvider,
  StagedFile,
} from "sandbox-factory";

/** The number of evaluation jobs a worker runs at once. */
export const EVALUATION_JOBS_MAX = 2;

interface Waiter {
  /** Called when a released slot is handed to this waiter. */
  readonly grant: () => void;
}

/**
 * Wraps `provider` so at most `max` of its jobs are alive at once.
 *
 * Each job holds one of `max` slots from the moment the wrapped `create`
 * is granted one until that job's `destroy()` settles; callers beyond the
 * cap wait, first in first out. The returned `create` rejects with the same
 * error when the underlying `create` throws or rejects, and a waiting
 * caller rejects with `signal.reason` when its signal aborts.
 */
export function limitJobs(
  provider: EvaluationProvider,
  max: number,
): EvaluationProvider {
  let held = 0;
  const waiters: Waiter[] = [];

  /** Hands the slot to the oldest waiter, or frees it when none waits. */
  function release(): void {
    const next = waiters.shift();
    if (next === undefined) held -= 1;
    else next.grant();
  }

  function wrap(job: EvaluationJob): EvaluationJob {
    let released = false;
    return {
      id: job.id,
      environment: job.environment,
      stage: (files: readonly StagedFile[]) => job.stage(files),
      exec: (command: EvaluationCommand) => job.exec(command),
      read: (path: string) => job.read(path),
      destroy: async () => {
        try {
          await job.destroy();
        } finally {
          if (!released) {
            released = true;
            release();
          }
        }
      },
    };
  }

  /** Calls the underlying create on a later microtask for a held slot. */
  function start(spec: {
    readonly label: string;
    readonly signal: AbortSignal;
  }): Promise<EvaluationJob> {
    return Promise.resolve()
      .then(() => provider.create(spec))
      .then(wrap, (error: unknown) => {
        release();
        throw error;
      });
  }

  return {
    name: provider.name,
    create(spec) {
      if (held < max) {
        held += 1;
        return start(spec);
      }
      const { signal } = spec;
      if (signal.aborted) return Promise.reject(signal.reason);
      return new Promise<EvaluationJob>((resolve, reject) => {
        const waiter: Waiter = {
          grant: () => {
            signal.removeEventListener("abort", onAbort);
            resolve(start(spec));
          },
        };
        function onAbort(): void {
          const index = waiters.indexOf(waiter);
          if (index === -1) return;
          waiters.splice(index, 1);
          reject(signal.reason);
        }
        signal.addEventListener("abort", onAbort, { once: true });
        waiters.push(waiter);
      });
    },
  };
}
