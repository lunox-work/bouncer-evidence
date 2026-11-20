/**
 * A cap on how many evaluation jobs of a provider are alive at once
 * (ticket #104: at most two evaluation jobs run at once on a worker).
 */

import type { EvaluationProvider } from "sandbox-factory";

/** The number of evaluation jobs a worker runs at once. */
export const EVALUATION_JOBS_MAX = 2;

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
  _provider: EvaluationProvider,
  _max: number,
): EvaluationProvider {
  throw new Error("not implemented");
}
