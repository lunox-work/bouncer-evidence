import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkHandle,
  isValidHandle,
  normalizeHandle,
  toHandleCase,
} from "../../src/handle.js";

const LENGTH_REASON = "Must be between 3 and 30 characters.";
const CHARSET_REASON = "Can use letters, numbers, hyphens and underscores only.";

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

// Every code point String.prototype.trim removes, besides the ASCII space.
const TRIMMED_WHITESPACE = [
  "\t",
  "\n",
  "\u000B",
  "\u000C",
  "\r",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  " ",
  "　",
  "﻿",
];

function label(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);
}

// Extends "[happy-2] toHandleCase removes surrounding whitespace and lowercases":
// other mixes of case, digits and separators.
test("[happy-2] toHandleCase trims and lowercases other typed values", () => {
  const cases: Array<[string, string]> = [
    ["\t\tDana Rivers\n", "dana rivers"],
    ["MiXeD", "mixed"],
    ["123ABC", "123abc"],
    ["  -_-  ", "-_-"],
    ["   X   ", "x"],
    ["ADMIN", "admin"],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(toHandleCase(raw), expected, label(raw));
  }
});

// Extends "[boundary-2] toHandleCase removes every kind of trimmed whitespace and keeps inner characters":
// each whitespace code point trim removes, on both ends.
test("[boundary-2] toHandleCase removes each whitespace code point that trim removes, on both ends", () => {
  for (const ws of TRIMMED_WHITESPACE) {
    assert.equal(toHandleCase(`${ws}AbC${ws}`), "abc", `U+${ws.charCodeAt(0).toString(16)}`);
    assert.equal(toHandleCase(`${ws}${ws}${ws}`), "", `U+${ws.charCodeAt(0).toString(16)}`);
  }
  assert.equal(toHandleCase(TRIMMED_WHITESPACE.join("") + "Dana" + TRIMMED_WHITESPACE.join("")), "dana");
});

test("[boundary-2] toHandleCase keeps characters that trim does not remove and inner whitespace", () => {
  const cases: Array<[string, string]> = [
    // U+200B ZERO WIDTH SPACE is not whitespace for trim.
    ["​Abc", "​abc"],
    ["Abc​", "abc​"],
    ["A B", "a b"],
    ["A\tB", "a\tb"],
    [" A  B ", "a  b"],
    ["A\nB", "a\nb"],
    ["a.b@c!", "a.b@c!"],
    ["-_-", "-_-"],
  ];
  for (const [raw, expected] of cases) {
    assert.equal(toHandleCase(raw), expected, label(raw));
  }
});

test("[boundary-2] toHandleCase does not normalize, strip diacritics or replace characters", () => {
  // Decomposed stays decomposed, precomposed stays precomposed.
  assert.equal(toHandleCase("Á"), "á");
  assert.equal(toHandleCase("Á").length, 2);
  assert.equal(toHandleCase("É"), "é");
  assert.equal(toHandleCase("É").length, 1);
  assert.equal(toHandleCase("ß"), "ß");
  assert.equal(toHandleCase("STRASSE"), "strasse");
  assert.equal(toHandleCase("\u{1F600}"), "\u{1F600}");
});

test("[boundary-2] toHandleCase equals trim then toLowerCase across varied input", () => {
  for (const raw of [
    "ẞ",
    "ΟΔΟΣ",
    "İIıi",
    "KΩÅ",
    "  ÀBÇ 　",
    "Å",
    "  \u{10400}\u{10428} ",
  ]) {
    assert.equal(toHandleCase(raw), raw.trim().toLowerCase(), label(raw));
  }
});

// Extends "[boundary-3] toHandleCase lowercases U+0130 to i plus combining dot, length 2":
// repeated U+0130, and plain I is not lowercased the Turkish way.
test("[boundary-3] each U+0130 adds a code unit when lowercased", () => {
  const five = toHandleCase("İ".repeat(5));
  assert.equal(five, "i̇".repeat(5));
  assert.equal(five.length, 10);
  const mixed = toHandleCase(" AİB ");
  assert.equal(mixed, "ai̇b");
  assert.equal(mixed.length, 4);
});

test("[boundary-3] lowercasing is locale-independent: plain I becomes i, not dotless i", () => {
  assert.equal(toHandleCase("I"), "i");
  assert.equal(toHandleCase("ISTANBUL"), "istanbul");
  assert.equal(toHandleCase("İI"), "i̇i");
});

// Extends "[boundary-4] toHandleCase is idempotent":
// other inputs, including ones whose lowercasing changes the length.
test("[boundary-4] toHandleCase applied twice equals applied once for Unicode and padded input", () => {
  for (const raw of [
    "İİ",
    "KIM",
    "  X 　",
    "ẞ",
    "Á",
    " Fever Soul ",
    "​ Abc ​",
  ]) {
    const once = toHandleCase(raw);
    assert.equal(toHandleCase(once), once, label(raw));
  }
  assert.equal(toHandleCase(toHandleCase("　FEVER-Soul_1 ")), "fever-soul_1");
});

// Extends "[happy-4] normalizeHandle stores the handle lowercase and keeps casing for display":
// Unicode padding and inner mixed case.
test("[happy-4] normalizeHandle display drops Unicode padding and keeps the typed casing", () => {
  const padded = normalizeHandle(" 　FeverSoul\t");
  assert.deepEqual(padded, { status: "ok", handle: "feversoul", display: "FeverSoul" });
  assert.deepEqual(Object.keys(padded).sort(), ["display", "handle", "status"]);
  assert.deepEqual(normalizeHandle("fEVERsOUL"), {
    status: "ok",
    handle: "feversoul",
    display: "fEVERsOUL",
  });
  assert.deepEqual(normalizeHandle(" Dana_Rivers-2 "), {
    status: "ok",
    handle: "dana_rivers-2",
    display: "Dana_Rivers-2",
  });
});

// Extends "[happy-5] normalizeHandle accepts several inputs":
// more casings, separators and padding kinds.
test("[happy-5] normalizeHandle accepts other mixed inputs", () => {
  const cases: Array<[string, string, string]> = [
    ["_Dana_", "_dana_", "_Dana_"],
    ["---", "---", "---"],
    [" Z9_ ", "z9_", "Z9_"],
    ["0".repeat(30), "0".repeat(30), "0".repeat(30)],
    [" AbC ", "abc", "AbC"],
    ["XXX", "xxx", "XXX"],
    ["\r\nA-B-C\r\n", "a-b-c", "A-B-C"],
    ["dana2", "dana2", "dana2"],
  ];
  for (const [raw, handle, display] of cases) {
    assert.deepEqual(normalizeHandle(raw), { status: "ok", handle, display }, label(raw));
  }
});

// Extends "[boundary-8] normalizeHandle lowercases before the charset check (Kelvin sign)":
// Kelvin sign in other positions and at the maximum length.
test("[boundary-8] Kelvin signs anywhere are lowercased to k before the charset check", () => {
  assert.deepEqual(normalizeHandle("aKb"), { status: "ok", handle: "akb", display: "aKb" });
  assert.deepEqual(normalizeHandle("  KIM  "), { status: "ok", handle: "kim", display: "KIM" });
  assert.deepEqual(normalizeHandle("K".repeat(30)), {
    status: "ok",
    handle: "k".repeat(30),
    display: "K".repeat(30),
  });
  assert.deepEqual(normalizeHandle("K".repeat(31)), LENGTH);
});

// Extends "[boundary-9] whitespace outside the handle does not count toward the maximum length":
// Unicode padding and long padding.
test("[boundary-9] long and Unicode padding is ignored for both length bounds", () => {
  const max = normalizeHandle(" ".repeat(5) + "x".repeat(30) + "　".repeat(5));
  assert.deepEqual(max, { status: "ok", handle: "x".repeat(30), display: "x".repeat(30) });
  assert.deepEqual(normalizeHandle(" ".repeat(50) + "abc"), { status: "ok", handle: "abc", display: "abc" });
  assert.deepEqual(normalizeHandle("\n".repeat(100) + "AbC" + "\t".repeat(100)), {
    status: "ok",
    handle: "abc",
    display: "AbC",
  });
  assert.deepEqual(normalizeHandle(" " + "x".repeat(31) + " "), LENGTH);
});

// Extends "[unhappy-5] a normalizeHandle rejection equals checkHandle of the normalized text":
// inputs where lowercasing changes the length, and other padding.
test("[unhappy-5] the length is judged on the lowercased text, which U+0130 lengthens", () => {
  const cases: Array<[string, typeof LENGTH | typeof CHARSET]> = [
    // 20 code units raw, 40 once lowercased.
    ["İ".repeat(20), LENGTH],
    // 2 code units raw, 4 once lowercased.
    ["İ".repeat(2), CHARSET],
    ["İ", LENGTH],
    ["İ".repeat(15), CHARSET],
    ["İ".repeat(16), LENGTH],
    // 30 code units raw, 31 once lowercased.
    ["x".repeat(29) + "İ", LENGTH],
  ];
  for (const [raw, expected] of cases) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, checkHandle(toHandleCase(raw)), label(raw));
    assert.deepEqual(result, expected, label(raw));
    assert.deepEqual(Object.keys(result).sort(), ["problem", "reason", "status"], label(raw));
  }
});

test("[unhappy-5] other rejected inputs carry no handle or display and match checkHandle", () => {
  const cases: Array<[string, typeof LENGTH | typeof CHARSET]> = [
    ["  A.B  ", CHARSET],
    ["X".repeat(29) + "!", CHARSET],
    [" ab ", LENGTH],
    ["​abc", CHARSET],
    ["a b c", CHARSET],
    ["\t\n", LENGTH],
    ["\u{1F600}", LENGTH],
    ["Dana\u{1F600}", CHARSET],
  ];
  for (const [raw, expected] of cases) {
    const result = normalizeHandle(raw);
    assert.deepEqual(result, checkHandle(toHandleCase(raw)), label(raw));
    assert.deepEqual(result, expected, label(raw));
    assert.equal("handle" in result, false, label(raw));
    assert.equal("display" in result, false, label(raw));
  }
});

// Extends "[happy-6] isValidHandle is true for inputs normalizeHandle accepts":
// Unicode padding, Kelvin-only and route-like input.
test("[happy-6] isValidHandle is true for Unicode-padded, Kelvin-only and separator input", () => {
  for (const raw of [
    " Abc ",
    "KKK",
    "　" + "X".repeat(30) + "　",
    "ADMIN",
    "__PROTO__",
    "-_-",
    "﻿Dana﻿",
  ]) {
    assert.equal(isValidHandle(raw), true, label(raw));
    assert.equal(normalizeHandle(raw).status, "ok", label(raw));
  }
});

// Extends "[unhappy-6] isValidHandle is false for inputs normalizeHandle rejects":
// inputs whose length changes on lowercasing, inner newlines, untrimmed zero-width space.
test("[unhappy-6] isValidHandle is false where lowercasing or untrimmed characters make input invalid", () => {
  for (const raw of [
    "İİ",
    "İ".repeat(16),
    "x".repeat(29) + "İ",
    " " + "x".repeat(31),
    "a\nb",
    "K".repeat(31),
    "​abc",
    "ab ",
    "\u{1F600}\u{1F600}",
  ]) {
    assert.equal(isValidHandle(raw), false, label(raw));
    assert.equal(normalizeHandle(raw).status, "invalid", label(raw));
  }
});
