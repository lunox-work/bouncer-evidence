/**
 * Pure analysis rules for repository snapshots analysed by the Graphify
 * worker: the vocabulary a run is described in, the parameters it takes,
 * what happens when its worker lease expires, and the canonical JSON form
 * its cache key is built from. This module stays dependency-free.
 */

/** The statuses an analysis run moves through, in order. */
export const ANALYSIS_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

/** The error codes a failed analysis run is reported with. */
export const ANALYSIS_ERROR_CODES = [
  "too_large",
  "too_many_files",
  "source_unavailable",
  "tool_failed",
  "tool_timeout",
  "upload_failed",
  "worker_lost",
  "cancelled",
] as const;
export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number];

/** The kinds of artifact an analysis run produces. */
export const ARTIFACT_KINDS = [
  "graph_json",
  "graph_html",
  "report_md",
  "wiki_page",
  "manifest",
  "other",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/** The pinned Graphify tool version an analysis runs with. */
export const GRAPHIFY_TOOL_VERSION = "graphifyy@0.4.18+driver-1";

/**
 * The parameters an analysis takes: a bare readonly number, with no
 * validation, bounds or default.
 */
export interface AnalysisParams {
  readonly deadlineMinutes: number;
}

/**
 * What happens to an analysis whose worker lease expired: re-queued with
 * `attempt + 1` while `attempt < maxAttempts`, otherwise failed with
 * `attempt` unchanged. Inputs are not validated or coerced; returns a new
 * object with exactly the keys `status` and `attempt`.
 */
export function expiredAnalysis(
  _attempt: number,
  _maxAttempts: number,
): {
  status: "queued" | "failed";
  attempt: number;
} {
  throw new Error("not implemented");
}

/**
 * The canonical JSON text of a value, with no whitespace and object keys
 * sorted by UTF-16 code unit at every level, so equal parameters always give
 * the same cache key. Never mutates its input.
 *
 * Throws an `Error` with the message `Cache parameters must be JSON values.`
 * for `undefined`, a function or a symbol at any depth; throws the
 * `TypeError` `JSON.stringify` throws for a bigint at any depth; a cyclic
 * value throws the engine's `RangeError`.
 */
export function canonicalJson(_value: unknown): string {
  throw new Error("not implemented");
}
