import assert from "node:assert/strict";
import { test } from "node:test";

import * as handleModule from "../src/handle.js";
import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  checkHandle,
  handleStemFromEmail,
  isValidHandle,
  normalizeHandle,
  toHandleCase,
  toHandleStem,
} from "../src/handle.js";
import * as core from "../src/index.js";

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

const HANDLE_EXPORTS = [
  "HANDLE_MAX_LENGTH",
  "HANDLE_MIN_LENGTH",
  "checkHandle",
  "handleStemFromEmail",
  "isValidHandle",
  "normalizeHandle",
  "toHandleCase",
  "toHandleStem",
] as const;

function label(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
}

// ---------------------------------------------------------------------------
// Rule: The length bounds are the constants 3 and 30, both inclusive

test("[happy-1] HANDLE_MIN_LENGTH is 3 and HANDLE_MAX_LENGTH is 30", () => {
  assert.equal(HANDLE_MIN_LENGTH, 3);
  assert.equal(HANDLE_MAX_LENGTH, 30);
});

test("[happy-1] the length constants are plain numbers, not strings", () => {
  assert.equal(typeof HANDLE_MIN_LENGTH, "number");
  assert.equal(typeof HANDLE_MAX_LENGTH, "number");
  assert.ok(Object.is(HANDLE_MIN_LENGTH, 3));
  assert.ok(Object.is(HANDLE_MAX_LENGTH, 30));
});

test("[boundary-1] checkHandle accepts lengths at each bound and rejects just past them", () => {
  const cases: Array<[string, "ok" | "length"]> = [
    ["ab", "length"],
    ["abc", "ok"],
    ["x".repeat(30), "ok"],
    ["x".repeat(31), "length"],
    ["", "length"],
  ];
  for (const [handle, expected] of cases) {
    const result = checkHandle(handle);
    if (expected === "ok") {
      assert.deepEqual(result, OK, label(handle));
    } else {
      assert.equal(result.status, "invalid", label(handle));
      assert.equal(
        result.status === "invalid" ? result.problem : undefined,
        "length",
        label(handle),
      );
    }
  }
});

test("[boundary-1] the empty handle is a length rejection with the length reason", () => {
  assert.deepEqual(checkHandle(""), LENGTH);
  assert.deepEqual(checkHandle("x".repeat(HANDLE_MIN_LENGTH - 1)), LENGTH);
  assert.deepEqual(checkHandle("x".repeat(HANDLE_MAX_LENGTH + 1)), LENGTH);
});

// ---------------------------------------------------------------------------
// Rule: toHandleCase trims with String.prototype.trim and lowercases

test("[happy-2] toHandleCase removes surrounding whitespace and lowercases", () => {
  assert.equal(toHandleCase("  FeverSoul  "), "feversoul");
});

test("[happy-2] toHandleCase leaves an already trimmed lowercase value unchanged", () => {
  assert.equal(toHandleCase("feversoul"), "feversoul");
  assert.equal(toHandleCase("FEVERSOUL"), "feversoul");
});

test("[boundary-2] toHandleCase removes every kind of trimmed whitespace and keeps inner characters", () => {
  const cases: Array<[string, string]> = [
    [" Dana\t", "dana"],
    ["\n Ada \r\n", "ada"],
    ["Fever Soul", "fever soul"],
    ["Rivers.Dana", "rivers.dana"],
    ["ÀBC", "àbc"],
    ["   ", ""],
    ["", ""],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(toHandleCase(raw), expected, label(raw));
  }
});

test("[boundary-2] toHandleCase trims Unicode whitespace that String.prototype.trim removes", () => {
  assert.equal(toHandleCase(" ﻿Abc　"), "abc");
  assert.equal(toHandleCase("  "), "");
  assert.equal(toHandleCase("\tA B\n"), "a b");
});

test("[boundary-3] toHandleCase lowercases U+0130 to i plus combining dot, length 2", () => {
  const result = toHandleCase("İ");
  assert.equal(result, "i̇");
  assert.equal(result.length, 2);
});

test("[boundary-3] toHandleCase lowercasing of U+0130 inside a word lengthens the string", () => {
  const result = toHandleCase("İstanbul");
  assert.equal(result, "i̇stanbul");
  assert.equal(result.length, 9);
});

test("[boundary-4] toHandleCase is idempotent", () => {
  assert.equal(toHandleCase(toHandleCase("  ÀBc-D_9 ")), "àbc-d_9");
});

test("[boundary-4] toHandleCase applied twice equals applied once for whitespace and dotted I", () => {
  for (const raw of ["\n Ada \r\n", "İ", "   ", "", " Dana\t"]) {
    assert.equal(toHandleCase(toHandleCase(raw)), toHandleCase(raw), label(raw));
  }
});

// ---------------------------------------------------------------------------
// Rule: checkHandle validates its argument exactly as given

test("[happy-3] checkHandle accepts lowercase handles of allowed characters", () => {
  for (const handle of ["feversoul", "a-b_c9", "123", "dana2"]) {
    assert.deepEqual(checkHandle(handle), OK, label(handle));
  }
});

test("[happy-3] checkHandle success is exactly { status: ok } at both length bounds", () => {
  for (const handle of ["abc", "x".repeat(30), "0".repeat(30)]) {
    const result = checkHandle(handle);
    assert.deepEqual(result, OK, label(handle));
    assert.deepEqual(Object.keys(result), ["status"], label(handle));
  }
});

test("[unhappy-1] checkHandle does not normalize uppercase or padded input", () => {
  const cases: Array<[string, "length" | "charset"]> = [
    ["FeverSoul", "charset"],
    [" abc", "charset"],
    ["abc ", "charset"],
    ["  ab  ", "charset"],
    [" a ", "charset"],
    [" a", "length"],
  ];
  for (const [handle, problem] of cases) {
    const result = checkHandle(handle);
    assert.equal(result.status, "invalid", label(handle));
    assert.equal(
      result.status === "invalid" ? result.problem : undefined,
      problem,
      label(handle),
    );
  }
});

test("[unhappy-1] padded input at the edge of the length range counts its whitespace", () => {
  assert.deepEqual(checkHandle(" a"), LENGTH);
  assert.deepEqual(checkHandle(" a "), CHARSET);
  assert.deepEqual(checkHandle("FeverSoul"), CHARSET);
  assert.deepEqual(checkHandle(" " + "x".repeat(30)), LENGTH);
});

// ---------------------------------------------------------------------------
// Rule: Only a-z, 0-9, "-" and "_" are allowed

test("[unhappy-2] checkHandle reports any other character as a charset problem", () => {
  for (const handle of [
    "has space",
    "has/slash",
    "has@at",
    "has.dot",
    "ab!",
    "ééé",
    "abc\n",
    "a b",
  ]) {
    assert.deepEqual(checkHandle(handle), CHARSET, label(handle));
  }
});

test("[unhappy-2] characters adjacent to the allowed ranges are charset problems", () => {
  // ASCII neighbours of a-z, 0-9, "-" and "_", plus uppercase letters.
  for (const ch of ["`", "{", "/", ":", ",", ".", "^", "A", "Z", "@", "["]) {
    const handle = `ab${ch}`;
    assert.deepEqual(checkHandle(handle), CHARSET, label(handle));
  }
});

// ---------------------------------------------------------------------------
// Rule: A hyphen or underscore may appear anywhere

test("[boundary-5] checkHandle accepts separators at the edges or in runs", () => {
  for (const handle of ["---", "___", "-abc-", "_abc_", "a--b", "-user"]) {
    assert.deepEqual(checkHandle(handle), OK, label(handle));
  }
});

test("[boundary-5] checkHandle accepts handles made only of separators at both length bounds", () => {
  for (const handle of ["-_-", "-".repeat(30), "_".repeat(30), "a__b--c"]) {
    assert.deepEqual(checkHandle(handle), OK, label(handle));
  }
});

// ---------------------------------------------------------------------------
// Rule: No handle is reserved

test("[boundary-6] checkHandle accepts names a route might use", () => {
  for (const handle of ["admin", "api", "settings", "new"]) {
    assert.deepEqual(checkHandle(handle), OK, label(handle));
  }
});

test("[boundary-6] route-like names are accepted through normalizeHandle and isValidHandle", () => {
  assert.deepEqual(normalizeHandle("Admin"), {
    status: "ok",
    handle: "admin",
    display: "Admin",
  });
  assert.equal(isValidHandle("API"), true);
  assert.equal(isValidHandle(" settings "), true);
});

// ---------------------------------------------------------------------------
// Rule: Length is checked first, in UTF-16 code units

test("[unhappy-3] a handle that breaks both rules reports length", () => {
  for (const handle of ["a!", "x".repeat(30) + "!", "\u{1F600}", "  "]) {
    assert.deepEqual(checkHandle(handle), LENGTH, label(handle));
  }
});

test("[unhappy-3] uppercase or symbol handles out of range report only length", () => {
  for (const handle of ["X".repeat(31), "A!", "!", "é".repeat(31)]) {
    assert.deepEqual(checkHandle(handle), LENGTH, label(handle));
  }
});

test("[boundary-7] a 3-code-unit handle of 2 code points passes length and fails charset", () => {
  assert.equal("a\u{1F600}".length, 3);
  assert.deepEqual(checkHandle("a\u{1F600}"), CHARSET);
});

test("[boundary-7] surrogate pairs count as two units toward the upper bound", () => {
  // 29 + 2 = 31 code units: too long, though only 30 code points.
  assert.deepEqual(checkHandle("x".repeat(29) + "\u{1F600}"), LENGTH);
  // 28 + 2 = 30 code units: in range, so the emoji is a charset problem.
  assert.deepEqual(checkHandle("x".repeat(28) + "\u{1F600}"), CHARSET);
});

// ---------------------------------------------------------------------------
// Rule: A rejection is exactly { status, problem, reason }

test("[unhappy-4] each problem carries its own reason and nothing else", () => {
  assert.deepEqual(checkHandle("ab"), {
    status: "invalid",
    problem: "length",
    reason: "Must be between 3 and 30 characters.",
  });
  assert.deepEqual(checkHandle("has.dot"), {
    status: "invalid",
    problem: "charset",
    reason: "Can use letters, numbers, hyphens and underscores only.",
  });
});

test("[unhappy-4] the reason is the same fixed sentence regardless of the offending handle", () => {
  for (const handle of ["", "x".repeat(31), "a", "\u{1F600}"]) {
    const result = checkHandle(handle);
    assert.deepEqual(result, LENGTH, label(handle));
    assert.deepEqual(Object.keys(result).sort(), ["problem", "reason", "status"]);
  }
  for (const handle of ["ABC", "a b", "x".repeat(29) + "!"]) {
    const result = checkHandle(handle);
    assert.deepEqual(result, CHARSET, label(handle));
    assert.deepEqual(Object.keys(result).sort(), ["problem", "reason", "status"]);
  }
});

// ---------------------------------------------------------------------------
// Rule: normalizeHandle applies toHandleCase, then checkHandle

test("[happy-4] normalizeHandle stores the handle lowercase and keeps casing for display", () => {
  assert.deepEqual(normalizeHandle("  FeverSoul  "), {
    status: "ok",
    handle: "feversoul",
    display: "FeverSoul",
  });
});

test("[happy-4] normalizeHandle keeps an all-uppercase display while lowercasing the handle", () => {
  const result = normalizeHandle("FEVERSOUL");
  assert.deepEqual(result, {
    status: "ok",
    handle: "feversoul",
    display: "FEVERSOUL",
  });
  assert.deepEqual(Object.keys(result).sort(), ["display", "handle", "status"]);
});

test("[happy-5] normalizeHandle accepts several inputs", () => {
  const cases: Array<[string, string, string]> = [
    ["feversoul", "feversoul", "feversoul"],
    ["\tA-b_C9\n", "a-b_c9", "A-b_C9"],
    ["X".repeat(30), "x".repeat(30), "X".repeat(30)],
    ["  abc  ", "abc", "abc"],
  ];
  for (const [raw, handle, display] of cases) {
    assert.deepEqual(
      normalizeHandle(raw),
      { status: "ok", handle, display },
      label(raw),
    );
  }
});

test("[happy-5] normalizeHandle accepts a mixed-case handle at the minimum length", () => {
  assert.deepEqual(normalizeHandle("AbC"), {
    status: "ok",
    handle: "abc",
    display: "AbC",
  });
  assert.deepEqual(normalizeHandle(" -_- "), {
    status: "ok",
    handle: "-_-",
    display: "-_-",
  });
});

test("[boundary-8] normalizeHandle lowercases before the charset check (Kelvin sign)", () => {
  assert.deepEqual(normalizeHandle("Kim"), {
    status: "ok",
    handle: "kim",
    display: "Kim",
  });
});

test("[boundary-8] a handle made only of Kelvin signs normalizes to ASCII k", () => {
  assert.deepEqual(normalizeHandle("KKK"), {
    status: "ok",
    handle: "kkk",
    display: "KKK",
  });
});

test("[boundary-9] whitespace outside the handle does not count toward the maximum length", () => {
  const result = normalizeHandle("  " + "x".repeat(30) + "  ");
  assert.equal(result.status, "ok");
  assert.equal(
    result.status === "ok" ? result.handle : undefined,
    "x".repeat(30),
  );
});

test("[boundary-9] whitespace outside the handle does not count toward the minimum length", () => {
  assert.deepEqual(normalizeHandle("\tab\n"), LENGTH);
  assert.deepEqual(normalizeHandle(" ".repeat(10) + "a"), LENGTH);
});

test("[unhappy-5] a normalizeHandle rejection equals checkHandle of the normalized text", () => {
  const cases: Array<[string, typeof LENGTH | typeof CHARSET]> = [
    ["   ", LENGTH],
    [" ab ", LENGTH],
    ["X".repeat(31), LENGTH],
    ["Fever Soul", CHARSET],
    ["İstanbul", CHARSET],
  ];
  for (const [raw, expected] of cases) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, checkHandle(toHandleCase(raw)), label(raw));
    assert.deepEqual(result, expected, label(raw));
    assert.equal("handle" in result, false, label(raw));
    assert.equal("display" in result, false, label(raw));
  }
});

test("[unhappy-5] padded too-long and too-short inputs are length rejections without handle or display", () => {
  for (const raw of [" " + "X".repeat(31) + " ", "Ab", ""]) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, LENGTH, label(raw));
    assert.deepEqual(Object.keys(result).sort(), ["problem", "reason", "status"]);
  }
});

// ---------------------------------------------------------------------------
// Rule: isValidHandle(raw) is true exactly when normalizeHandle(raw) is ok

test("[happy-6] isValidHandle is true for inputs normalizeHandle accepts", () => {
  for (const raw of ["feversoul", "FeverSoul", "  abc  ", "a-b_c9", "x".repeat(30)]) {
    assert.equal(isValidHandle(raw), true, label(raw));
  }
});

test("[happy-6] isValidHandle is true for padded mixed-case and Kelvin-sign input", () => {
  for (const raw of ["\tFeverSoul\n", "Kim", " " + "X".repeat(30) + " "]) {
    assert.equal(isValidHandle(raw), true, label(raw));
    assert.equal(normalizeHandle(raw).status, "ok", label(raw));
  }
});

test("[unhappy-6] isValidHandle is false for inputs normalizeHandle rejects", () => {
  for (const raw of ["", "   ", "ab", "x".repeat(31), "has.dot", "Fever Soul"]) {
    assert.equal(isValidHandle(raw), false, label(raw));
  }
});

test("[unhappy-6] isValidHandle is false for padded short input and dotted capital I", () => {
  for (const raw of [" ab ", "İstanbul", "a\u{1F600}"]) {
    assert.equal(isValidHandle(raw), false, label(raw));
    assert.equal(normalizeHandle(raw).status, "invalid", label(raw));
  }
});

// ---------------------------------------------------------------------------
// Rule: toHandleStem

test("[happy-7] toHandleStem turns free text into a stem", () => {
  const cases: Array<[string, string]> = [
    ["Acme Corp", "acme-corp"],
    ["rivers.dana+work", "rivers-dana-work"],
    ["dana", "dana"],
    ["dana\u{1F600}rivers", "dana-rivers"],
    ["Ünïcødé Ltd.", "n-c-d-ltd"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(toHandleStem(text), expected, label(text));
  }
});

test("[happy-7] toHandleStem lowercases uppercase text and joins words with one hyphen", () => {
  assert.equal(toHandleStem("ACME"), "acme");
  assert.equal(toHandleStem("Dana Rivers"), "dana-rivers");
  assert.equal(toHandleStem("a1_b2-c3"), "a1_b2-c3");
});

test("[boundary-10] toHandleStem collapses runs of disallowed characters and keeps existing hyphens", () => {
  const cases: Array<[string, string]> = [
    ["a..b", "a-b"],
    ["a.-b", "a--b"],
    ["--dana--rivers--", "dana--rivers"],
    ["  Acme  ", "acme"],
    ["_acme_", "_acme_"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(toHandleStem(text), expected, label(text));
  }
});

test("[boundary-10] separate runs around an existing hyphen each become one hyphen", () => {
  assert.equal(toHandleStem("a- -b"), "a---b");
  assert.equal(toHandleStem("a.-.b"), "a---b");
  assert.equal(toHandleStem("a !@#$%^&*() b"), "a-b");
  assert.equal(toHandleStem("a_b"), "a_b");
});

test("[boundary-11] a stem shorter than 3 gets the literal suffix -user", () => {
  const cases: Array<[string, string]> = [
    ["jo", "jo-user"],
    ["J", "j-user"],
    ["__", "__-user"],
    ["", "-user"],
    ["   ", "-user"],
    ["!!!", "-user"],
    ["-".repeat(200), "-user"],
  ];
  for (const [text, expected] of cases) {
    assert.equal(toHandleStem(text), expected, label(text));
  }
});

test("[boundary-11] a stem of exactly 3 gets no suffix, and trimming can make it short", () => {
  assert.equal(toHandleStem("abc"), "abc");
  assert.equal(toHandleStem("j!"), "j-user");
  assert.equal(toHandleStem("-jo-"), "jo-user");
  assert.equal(toHandleStem("!jo!"), "jo-user");
});

test("[boundary-12] toHandleStem handles a very long run of hyphens", () => {
  assert.equal(toHandleStem("-".repeat(100000)), "-user");
});

test("[boundary-12] toHandleStem handles long hyphen runs around and between letters", () => {
  const run = "-".repeat(100000);
  assert.equal(toHandleStem(run + "x" + run), "x-user");
  assert.equal(toHandleStem("a" + run + "b"), "a" + "-".repeat(29));
  assert.equal(toHandleStem(".".repeat(100000)), "-user");
});

test("[boundary-13] a stem longer than 30 is cut at 30 after trimming", () => {
  const cases: Array<[string, string]> = [
    ["x".repeat(40), "x".repeat(30)],
    ["x".repeat(30), "x".repeat(30)],
    ["a".repeat(29) + "-b", "a".repeat(29) + "-"],
    ["-".repeat(5) + "x".repeat(30), "x".repeat(30)],
  ];
  for (const [text, expected] of cases) {
    assert.equal(toHandleStem(text), expected, label(text));
  }
});

test("[boundary-13] hyphens are trimmed before the cut, not after", () => {
  assert.equal(toHandleStem("x".repeat(31)), "x".repeat(30));
  // Trailing run is trimmed before truncation: 29 characters remain.
  assert.equal(toHandleStem("x".repeat(29) + "!!"), "x".repeat(29));
  // The cut lands on a hyphen made from a disallowed run, which is kept.
  assert.equal(toHandleStem("x".repeat(29) + "!!y"), "x".repeat(29) + "-");
  assert.equal(toHandleStem("X".repeat(40)), "x".repeat(30));
});

test("[happy-8] every stem passes checkHandle unchanged", () => {
  for (const text of ["", "Rivers.Dana", "a".repeat(29) + "-b", "x".repeat(60), "\u{1F600}"]) {
    assert.deepEqual(checkHandle(toHandleStem(text)), OK, label(text));
  }
});

test("[happy-8] stems of Unicode, whitespace and hyphen-heavy text pass checkHandle", () => {
  for (const text of [
    "İstanbul",
    "Ünïcødé Ltd.",
    "   ",
    "-".repeat(200),
    "__",
    "x".repeat(29) + "!!y",
  ]) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), OK, label(text));
    assert.ok(stem.length >= HANDLE_MIN_LENGTH && stem.length <= HANDLE_MAX_LENGTH);
  }
});

// ---------------------------------------------------------------------------
// Rule: handleStemFromEmail

test("[happy-9] handleStemFromEmail turns the local part into the stem", () => {
  const cases: Array<[string, string]> = [
    ["dana@example.test", "dana"],
    ["rivers.dana+work@example.test", "rivers-dana-work"],
    ["Rivers.Dana@example.test", "rivers-dana"],
    [" Dana.Rivers@example.test", "dana-rivers"],
  ];
  for (const [email, expected] of cases) {
    assert.equal(handleStemFromEmail(email), expected, label(email));
  }
});

test("[happy-9] handleStemFromEmail ignores the domain entirely", () => {
  assert.equal(handleStemFromEmail("Dana@Example.Test"), "dana");
  assert.equal(handleStemFromEmail("dana@other.example"), "dana");
  assert.equal(handleStemFromEmail("DANA@x"), "dana");
});

test("[boundary-14] short or long local parts follow the stem rules", () => {
  const cases: Array<[string, string]> = [
    ["jo@example.test", "jo-user"],
    ["x".repeat(60) + "@example.test", "x".repeat(30)],
    ["-".repeat(200) + "@example.test", "-user"],
  ];
  for (const [email, expected] of cases) {
    assert.equal(handleStemFromEmail(email), expected, label(email));
  }
});

test("[boundary-14] local parts at the stem bounds are kept as they are", () => {
  assert.equal(handleStemFromEmail("x".repeat(30) + "@example.test"), "x".repeat(30));
  assert.equal(handleStemFromEmail("abc@example.test"), "abc");
  assert.equal(handleStemFromEmail("j@example.test"), "j-user");
});

test("[unhappy-7] handleStemFromEmail does not reject malformed addresses", () => {
  const cases: Array<[string, string]> = [
    ["@example.test", "-user"],
    ["a@b@c", "a-user"],
    ["no-at-sign", "no-at-sign"],
    ["", "-user"],
  ];
  for (const [email, expected] of cases) {
    assert.equal(handleStemFromEmail(email), expected, label(email));
  }
});

test("[unhappy-7] handleStemFromEmail uses the first @ and the whole string when there is none", () => {
  assert.equal(handleStemFromEmail("abc@def@ghi"), "abc");
  assert.equal(handleStemFromEmail("@@"), "-user");
  assert.equal(handleStemFromEmail("no at sign here"), "no-at-sign-here");
  assert.equal(handleStemFromEmail("Acme Corp"), toHandleStem("Acme Corp"));
});

// ---------------------------------------------------------------------------
// Rule: No export throws for any string input

test("[unhappy-8] hostile input returns a value from every export instead of throwing", () => {
  const hostile = "\u0000\uD800 @@ ￿";
  assert.equal(toHandleCase(hostile), "\u0000\uD800 @@ ￿");
  const checked = checkHandle(hostile);
  assert.deepEqual(checked, CHARSET);
  assert.deepEqual(normalizeHandle(hostile), checked);
  assert.equal(isValidHandle(hostile), false);
  assert.equal(toHandleStem(hostile), "-user");
  assert.equal(handleStemFromEmail(hostile), "-user");
});

test("[unhappy-8] lone surrogates and control characters never make an export throw", () => {
  for (const input of ["\uDC00", "\uD800", "\u0000", "￿￾", "\u0000".repeat(31)]) {
    assert.doesNotThrow(() => toHandleCase(input), label(input));
    assert.doesNotThrow(() => checkHandle(input), label(input));
    assert.doesNotThrow(() => normalizeHandle(input), label(input));
    assert.equal(isValidHandle(input), false, label(input));
    assert.deepEqual(checkHandle(toHandleStem(input)), OK, label(input));
    assert.deepEqual(checkHandle(handleStemFromEmail(input)), OK, label(input));
  }
});

test("[boundary-15] earlier calls do not affect later ones", () => {
  checkHandle("x".repeat(31));
  const first = normalizeHandle("  FeverSoul  ");
  assert.deepEqual(checkHandle("abc"), OK);
  assert.deepEqual(normalizeHandle("  FeverSoul  "), first);
});

test("[boundary-15] repeated calls with the same argument give equal results", () => {
  assert.deepEqual(checkHandle("ab"), LENGTH);
  assert.deepEqual(checkHandle("abc"), OK);
  assert.deepEqual(checkHandle("ab"), LENGTH);
  assert.equal(toHandleStem("jo"), "jo-user");
  assert.equal(toHandleStem("Acme Corp"), "acme-corp");
  assert.equal(toHandleStem("jo"), "jo-user");
  assert.equal(isValidHandle("ab"), false);
  assert.equal(isValidHandle("abc"), true);
  assert.equal(isValidHandle("ab"), false);
});

// ---------------------------------------------------------------------------
// Rule: The package entry re-exports the handle module

test("[happy-10] the handle exports are reachable from the core index as the same values", () => {
  const entry = core as Record<string, unknown>;
  const direct = handleModule as Record<string, unknown>;
  for (const name of HANDLE_EXPORTS) {
    assert.ok(name in entry, `index should export ${name}`);
    assert.equal(entry[name], direct[name], name);
  }
  assert.equal(core.normalizeTitle("  buy milk  "), "buy milk");
});

test("[happy-10] the handle module exports exactly the listed names, all re-exported", () => {
  const entry = core as Record<string, unknown>;
  assert.deepEqual(Object.keys(handleModule).sort(), [...HANDLE_EXPORTS].sort());
  for (const name of Object.keys(handleModule)) {
    assert.equal(entry[name], (handleModule as Record<string, unknown>)[name], name);
  }
  assert.equal(core.TITLE_MAX_LENGTH, 200);
  assert.equal(core.isTodoFilter("all"), true);
});
