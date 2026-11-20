import assert from "node:assert/strict";
import { test } from "node:test";

import * as analysis from "../../src/analysis.js";
import {
  ANALYSIS_ERROR_CODES,
  ANALYSIS_STATUSES,
  ARTIFACT_KINDS,
  type AnalysisErrorCode,
  type AnalysisStatus,
  type ArtifactKind,
  canonicalJson,
  expiredAnalysis,
  GRAPHIFY_TOOL_VERSION,
} from "../../src/analysis.js";
import { BOUNTY_COMPLEXITIES, priceFor } from "../../src/bounty.js";
import { checkHandle, normalizeHandle } from "../../src/handle.js";
import * as core from "../../src/index.js";

/**
 * The vocabulary constants and the package index. The constants are read
 * through `../../src/index.js` as well as `../../src/analysis.js`: the spec
 * makes every analysis export importable from the index, and the same value
 * must come back from both paths.
 */

function fromIndex(name: string): unknown {
  const index: Record<string, unknown> = { ...core };
  return index[name];
}

const STATUSES = ["queued", "running", "succeeded", "failed"];
const ERROR_CODES = [
  "too_large",
  "too_many_files",
  "source_unavailable",
  "tool_failed",
  "tool_timeout",
  "upload_failed",
  "worker_lost",
  "cancelled",
];
const KINDS = [
  "graph_json",
  "graph_html",
  "report_md",
  "wiki_page",
  "manifest",
  "other",
];

// Extends "[happy-1] ANALYSIS_STATUSES lists the four statuses in order":
// the list read through the package index, element by element.
test("[happy-1] ANALYSIS_STATUSES read through the index lists queued, running, succeeded, failed", () => {
  const statuses = fromIndex("ANALYSIS_STATUSES");
  assert.deepEqual(statuses, STATUSES);
  assert.equal(statuses, ANALYSIS_STATUSES);
  const typed: readonly AnalysisStatus[] = ANALYSIS_STATUSES;
  assert.deepEqual([...typed], STATUSES);
  assert.equal(typed.indexOf("running"), 1);
  assert.equal(typed.indexOf("succeeded"), 2);
});

// Extends "[happy-2] ANALYSIS_ERROR_CODES lists the eight error codes in order".
test("[happy-2] ANALYSIS_ERROR_CODES read through the index lists the eight codes at their indices", () => {
  const codes = fromIndex("ANALYSIS_ERROR_CODES");
  assert.ok(Array.isArray(codes));
  assert.equal(codes.length, 8);
  assert.deepEqual(codes, ERROR_CODES);
  assert.equal(codes, ANALYSIS_ERROR_CODES);
  const typed: readonly AnalysisErrorCode[] = ANALYSIS_ERROR_CODES;
  ERROR_CODES.forEach((code, index) => {
    assert.equal(typed[index], code, `index ${index}`);
  });
});

// Extends "[happy-3] ARTIFACT_KINDS lists the six artifact kinds in order".
test("[happy-3] ARTIFACT_KINDS read through the index lists the six kinds in order", () => {
  const kinds = fromIndex("ARTIFACT_KINDS");
  assert.deepEqual(kinds, KINDS);
  assert.equal(kinds, ARTIFACT_KINDS);
  const typed: readonly ArtifactKind[] = ARTIFACT_KINDS;
  assert.equal(typed.indexOf("report_md"), 2);
  assert.equal(typed.indexOf("wiki_page"), 3);
  assert.equal(typed.indexOf("manifest"), 4);
});

// Extends "[happy-4] GRAPHIFY_TOOL_VERSION pins the Graphify driver".
test("[happy-4] GRAPHIFY_TOOL_VERSION read through the index is exactly graphifyy@0.4.18+driver-1", () => {
  assert.equal(fromIndex("GRAPHIFY_TOOL_VERSION"), "graphifyy@0.4.18+driver-1");
  assert.equal(GRAPHIFY_TOOL_VERSION, "graphifyy@0.4.18+driver-1");
});

// Extends "[boundary-1] the constant arrays are not frozen": the values the
// index hands out are plain, unfrozen arrays too.
test("[boundary-1] the constant arrays read through the index are plain unfrozen Arrays", () => {
  for (const name of [
    "ANALYSIS_STATUSES",
    "ANALYSIS_ERROR_CODES",
    "ARTIFACT_KINDS",
  ]) {
    const value = fromIndex(name);
    assert.equal(Array.isArray(value), true, name);
    assert.equal(Object.getPrototypeOf(value), Array.prototype, name);
    assert.equal(Object.isFrozen(value), false, name);
  }
  assert.equal(Object.getPrototypeOf(ANALYSIS_STATUSES), Array.prototype);
  assert.equal(Object.getPrototypeOf(ANALYSIS_ERROR_CODES), Array.prototype);
  assert.equal(Object.getPrototypeOf(ARTIFACT_KINDS), Array.prototype);
});

// Extends "[happy-5] the analysis exports are re-exported from the package index":
// the functions from the index work, not merely exist.
test("[happy-5] the functions imported from the index are the analysis functions and behave as them", () => {
  const indexExpired = fromIndex("expiredAnalysis");
  const indexCanonical = fromIndex("canonicalJson");
  assert.equal(indexExpired, expiredAnalysis);
  assert.equal(indexCanonical, canonicalJson);
  assert.equal(typeof indexExpired, "function");
  assert.equal(typeof indexCanonical, "function");
  const expired = indexExpired as typeof expiredAnalysis;
  const canonical = indexCanonical as typeof canonicalJson;
  assert.deepEqual(expired(1, 3), { status: "queued", attempt: 2 });
  assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

// Extends "[happy-5] the analysis exports are re-exported from the package index":
// the analysis module has exactly six runtime exports and the index carries
// every one of them, next to the unchanged existing exports.
test("[happy-5] the analysis module exports exactly six runtime names, all present in the index", () => {
  const names = Object.keys(analysis).sort();
  assert.deepEqual(names, [
    "ANALYSIS_ERROR_CODES",
    "ANALYSIS_STATUSES",
    "ARTIFACT_KINDS",
    "GRAPHIFY_TOOL_VERSION",
    "canonicalJson",
    "expiredAnalysis",
  ]);
  const own: Record<string, unknown> = { ...analysis };
  for (const name of names) {
    assert.equal(fromIndex(name), own[name], name);
  }
  assert.equal(fromIndex("checkHandle"), checkHandle);
  assert.equal(fromIndex("normalizeHandle"), normalizeHandle);
  assert.equal(fromIndex("priceFor"), priceFor);
  assert.equal(fromIndex("BOUNTY_COMPLEXITIES"), BOUNTY_COMPLEXITIES);
});
