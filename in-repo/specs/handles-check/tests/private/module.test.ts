import assert from "node:assert/strict";
import { test } from "node:test";

import * as handleModule from "../../src/handle.js";
import {
  checkHandle,
  handleStemFromEmail,
  isValidHandle,
  normalizeHandle,
  toHandleCase,
  toHandleStem,
} from "../../src/handle.js";
import * as core from "../../src/index.js";

const LENGTH_REASON = "Must be between 3 and 30 characters.";
const CHARSET_REASON = "Can use letters, numbers, hyphens and underscores only.";

const OK = { status: "ok" } as const;
const LENGTH = {
  status: "invalid",
  problem: "length",
  reason: LENGTH_REASON,
} as const;
const CHARSET = {
  status: "invalid",
  problem: "charset",
  reason: CHARSET_REASON,
} as const;

function label(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);
}

// Extends "[unhappy-8] hostile input returns a value from every export instead of throwing":
// lone surrogates in other positions, with the exact values each export returns.
test("[unhappy-8] lone surrogates pass through toHandleCase and are lowercased around", () => {
  assert.equal(toHandleCase("\uD800ABC"), "\uD800abc");
  assert.equal(toHandleCase("  \uDC00X  "), "\uDC00x");
  assert.equal(toHandleCase("\uDFFF\uD800"), "\uDFFF\uD800");
});

test("[unhappy-8] lone surrogates and control characters get the rejection their length implies", () => {
  // A surrogate pair plus a lone high surrogate: 3 code units.
  assert.deepEqual(checkHandle("😀\uD800"), CHARSET);
  assert.deepEqual(checkHandle("\uDC00"), LENGTH);
  assert.deepEqual(checkHandle("\u0000abc"), CHARSET);
  assert.deepEqual(checkHandle("\u0000".repeat(31)), LENGTH);
  const result = normalizeHandle("\uD800\uD800\uD800");
  assert.deepEqual(result, CHARSET);
  assert.deepEqual(result, checkHandle("\uD800\uD800\uD800"));
  assert.equal(isValidHandle("\uD800\uD800\uD800"), false);
  assert.equal(isValidHandle("\u0000abc\u0000"), false);
});

test("[unhappy-8] lone surrogates and noncharacters become hyphens in stems", () => {
  assert.equal(toHandleStem("ab\uD800cd"), "ab-cd");
  assert.equal(toHandleStem("\u0000abc"), "abc");
  assert.equal(toHandleStem("￿￾ab"), "ab-user");
  assert.equal(toHandleStem("\u0000".repeat(31)), "-user");
  assert.equal(handleStemFromEmail("\uD800@x"), "-user");
  assert.equal(handleStemFromEmail("ab\uDC00cd@\uD800"), "ab-cd");
});

// Extends "[boundary-15] earlier calls do not affect later ones":
// several accepted handles in a row and interleaved calls to every export.
test("[boundary-15] consecutive accepted handles are each accepted", () => {
  for (const handle of ["abc", "def", "ghi", "abc", "x".repeat(30), "abc", "a", "abc"]) {
    const expected = handle.length >= 3 ? OK : LENGTH;
    assert.deepEqual(checkHandle(handle), expected, label(handle));
  }
  for (let i = 0; i < 6; i++) {
    assert.equal(isValidHandle("dana"), true, `call ${i}`);
    assert.equal(isValidHandle("FeverSoul"), true, `call ${i}`);
  }
});

test("[boundary-15] interleaved calls to every export give the same results as fresh calls", () => {
  const first = normalizeHandle("FeverSoul");
  toHandleStem("-".repeat(1000) + "Acme Corp");
  handleStemFromEmail("a@b@c");
  checkHandle("has.dot");
  toHandleCase("  İ  ");
  assert.deepEqual(normalizeHandle("FeverSoul"), first);
  assert.deepEqual(first, { status: "ok", handle: "feversoul", display: "FeverSoul" });
  assert.equal(toHandleStem("Acme Corp"), "acme-corp");
  assert.equal(toHandleStem("Acme Corp"), "acme-corp");
  assert.equal(handleStemFromEmail("dana@example.test"), "dana");
  assert.equal(handleStemFromEmail("jo@example.test"), "jo-user");
  assert.equal(handleStemFromEmail("dana@example.test"), "dana");
  assert.deepEqual(checkHandle("dana2"), OK);
  assert.deepEqual(checkHandle("dana2"), OK);
});

// Extends "[happy-10] the handle exports are reachable from the core index as the same values":
// the index functions work, and the existing title rules keep their behaviour.
test("[happy-10] handle functions called through the core index behave as the module's", () => {
  const entry = core as Record<string, unknown>;
  for (const name of Object.keys(handleModule)) {
    assert.equal(entry[name], (handleModule as Record<string, unknown>)[name], name);
  }
  const viaIndex = entry as {
    HANDLE_MIN_LENGTH: number;
    HANDLE_MAX_LENGTH: number;
    checkHandle: typeof checkHandle;
    normalizeHandle: typeof normalizeHandle;
    toHandleStem: typeof toHandleStem;
    handleStemFromEmail: typeof handleStemFromEmail;
  };
  assert.equal(viaIndex.HANDLE_MIN_LENGTH, 3);
  assert.equal(viaIndex.HANDLE_MAX_LENGTH, 30);
  assert.deepEqual(viaIndex.checkHandle("abc"), OK);
  assert.deepEqual(viaIndex.normalizeHandle(" Dana "), { status: "ok", handle: "dana", display: "Dana" });
  assert.equal(viaIndex.toHandleStem("Acme Corp"), "acme-corp");
  assert.equal(viaIndex.handleStemFromEmail("jo@example.test"), "jo-user");
});

test("[happy-10] the existing title rules are unchanged alongside the handle exports", () => {
  const entry = core as Record<string, unknown>;
  assert.equal(typeof entry["isValidHandle"], "function");
  assert.equal(core.normalizeTitle("  buy milk  "), "buy milk");
  assert.throws(() => core.normalizeTitle("   "), core.InvalidTitleError);
  assert.equal(core.isValidTitle("ok"), true);
  assert.equal(core.isValidTitle(""), false);
  assert.equal(core.isTodoFilter("active"), true);
  assert.equal((entry["isValidHandle"] as typeof isValidHandle)("Dana"), true);
});
