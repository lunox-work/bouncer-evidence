import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  checkHandle,
  isValidHandle,
  normalizeHandle,
} from "../../src/handle.js";

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

const ALLOWED = "abcdefghijklmnopqrstuvwxyz0123456789-_";
const EMOJI = "\u{1F600}";

function label(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);
}

// Extends "[happy-1] HANDLE_MIN_LENGTH is 3 and HANDLE_MAX_LENGTH is 30":
// the constants are the bounds checkHandle actually enforces.
test("[happy-1] the length constants are 3 and 30 and are the inclusive bounds checkHandle enforces", () => {
  assert.equal(HANDLE_MIN_LENGTH, 3);
  assert.equal(HANDLE_MAX_LENGTH, 30);
  assert.deepEqual(checkHandle("q".repeat(HANDLE_MIN_LENGTH)), OK);
  assert.deepEqual(checkHandle("q".repeat(HANDLE_MAX_LENGTH)), OK);
  assert.deepEqual(checkHandle("q".repeat(HANDLE_MIN_LENGTH - 1)), LENGTH);
  assert.deepEqual(checkHandle("q".repeat(HANDLE_MAX_LENGTH + 1)), LENGTH);
});

// Extends "[boundary-1] checkHandle accepts lengths at each bound and rejects just past them":
// every length from 0 to 45, with letters, digits and separators.
test("[boundary-1] checkHandle sweep of every length from 0 to 45 accepts exactly 3 through 30", () => {
  for (const unit of ["a", "7", "-", "_", "z9"]) {
    for (let n = 0; n <= 45; n++) {
      const handle = unit.repeat(n).slice(0, n);
      const expected = n >= 3 && n <= 30 ? OK : LENGTH;
      assert.deepEqual(checkHandle(handle), expected, `${label(handle)} (length ${n})`);
    }
  }
});

test("[boundary-1] checkHandle rejects very long handles as length problems", () => {
  for (const handle of ["x".repeat(32), "x".repeat(100), "a".repeat(100000)]) {
    assert.deepEqual(checkHandle(handle), LENGTH, label(handle));
  }
});

// Extends "[happy-3] checkHandle accepts lowercase handles of allowed characters":
// every allowed character on its own, and all of them together.
test("[happy-3] checkHandle accepts each allowed character in every position", () => {
  for (const ch of ALLOWED) {
    for (const handle of [ch.repeat(3), `${ch}ab`, `a${ch}b`, `ab${ch}`]) {
      assert.deepEqual(checkHandle(handle), OK, label(handle));
    }
  }
});

test("[happy-3] checkHandle accepts the full alphabet plus digits at the maximum length", () => {
  const handle = "abcdefghijklmnopqrstuvwxyz0123";
  assert.equal(handle.length, 30);
  assert.deepEqual(checkHandle(handle), OK);
  for (const other of ["0123456789", "z_9-a", "999", "a1b2c3", "o-b_9"]) {
    const result = checkHandle(other);
    assert.deepEqual(result, OK, label(other));
    assert.deepEqual(Object.keys(result), ["status"], label(other));
  }
});

// Extends "[unhappy-1] checkHandle does not normalize uppercase or padded input":
// other whitespace, padding that only fits once trimmed, Kelvin sign.
test("[unhappy-1] checkHandle does not trim tabs, NBSP or other whitespace", () => {
  for (const handle of ["\tabc", "abc ", "　abc", "abc\r\n", "   ", "   "]) {
    assert.deepEqual(checkHandle(handle), CHARSET, label(handle));
  }
});

test("[unhappy-1] padding that pushes a valid handle past 30 is a length problem", () => {
  // Trimmed, these would be 29 and 30 characters: accepted.
  assert.deepEqual(checkHandle(" " + "x".repeat(29) + " "), LENGTH);
  assert.deepEqual(checkHandle(" " + "x".repeat(30)), LENGTH);
  assert.deepEqual(checkHandle("x".repeat(30) + "\t"), LENGTH);
  assert.deepEqual(checkHandle(" ".repeat(31)), LENGTH);
});

test("[unhappy-1] checkHandle does not lowercase ASCII or the Kelvin sign", () => {
  for (const handle of ["ABC", "Abc", "abC", "x".repeat(29) + "A", "Kim", "DANA2"]) {
    assert.deepEqual(checkHandle(handle), CHARSET, label(handle));
  }
});

test("[unhappy-1] padded input that is short by its own length reports length, not charset", () => {
  assert.deepEqual(checkHandle("\ta"), LENGTH);
  assert.deepEqual(checkHandle("A "), LENGTH);
  assert.deepEqual(checkHandle("  "), LENGTH);
});

// Extends "[unhappy-2] checkHandle reports any other character as a charset problem":
// every disallowed ASCII character, at every position.
test("[unhappy-2] every ASCII character outside a-z, 0-9, - and _ is a charset problem anywhere", () => {
  for (let code = 0; code < 128; code++) {
    const ch = String.fromCharCode(code);
    if (ALLOWED.includes(ch)) continue;
    for (const handle of [`${ch}ab`, `a${ch}b`, `ab${ch}`, `${ch}`.repeat(3)]) {
      assert.deepEqual(checkHandle(handle), CHARSET, `code ${code} in ${label(handle)}`);
    }
  }
});

test("[unhappy-2] newlines anywhere are charset problems, the pattern has no multiline flag", () => {
  for (const handle of ["abc\ndef", "\nabc", "abc\n", "a\nb", "abc\rdef", "abc def"]) {
    assert.deepEqual(checkHandle(handle), CHARSET, label(handle));
  }
});

test("[unhappy-2] Unicode letters, digits and lookalikes are charset problems", () => {
  for (const handle of [
    "ａbc", // fullwidth a
    "аbc", // Cyrillic a
    "١٢٣", // Arabic-Indic digits
    "²³¹", // superscript digits
    "ſab", // long s, case-folds to s
    "Kab", // Kelvin sign, case-folds to k
    "abı", // dotless i
    "abć", // combining acute
    "abß", // sharp s
    "ab\u0000c",
    "a‐b", // Unicode hyphen
    "a–b", // en dash
    "a＿b", // fullwidth low line
  ]) {
    assert.deepEqual(checkHandle(handle), CHARSET, label(handle));
  }
});

// Extends "[boundary-5] checkHandle accepts separators at the edges or in runs":
// other mixes of separators, at the minimum length.
test("[boundary-5] separators first, last, mixed and repeated are accepted at the minimum length", () => {
  for (const handle of ["-a-", "_-_", "__a", "a__", "9--", "--9", "-_-_-_", "a-_-b", "_9_", "--a--b--"]) {
    assert.deepEqual(checkHandle(handle), OK, label(handle));
  }
});

test("[boundary-5] separator-edged handles are accepted through normalizeHandle and isValidHandle", () => {
  assert.deepEqual(normalizeHandle(" -Dana_ "), { status: "ok", handle: "-dana_", display: "-Dana_" });
  assert.equal(isValidHandle("--__--"), true);
});

// Extends "[boundary-6] checkHandle accepts names a route might use":
// more route names and names that collide with object properties.
test("[boundary-6] other route names and object-property names are not reserved", () => {
  for (const handle of [
    "login",
    "www",
    "root",
    "null",
    "undefined",
    "user",
    "help",
    "about",
    "__proto__",
    "constructor",
    "tostring",
    "prototype",
    "hasownproperty",
    "valueof",
  ]) {
    assert.deepEqual(checkHandle(handle), OK, label(handle));
  }
});

test("[boundary-6] __proto__ and constructor normalize and validate like any other handle", () => {
  assert.deepEqual(normalizeHandle("__proto__"), { status: "ok", handle: "__proto__", display: "__proto__" });
  assert.deepEqual(normalizeHandle(" Constructor "), {
    status: "ok",
    handle: "constructor",
    display: "Constructor",
  });
  assert.equal(isValidHandle("__PROTO__"), true);
  assert.equal(isValidHandle("hasOwnProperty"), true);
});

// Extends "[unhappy-3] a handle that breaks both rules reports length":
// other bad characters at lengths out of range on both sides.
test("[unhappy-3] out-of-range handles of disallowed characters report only length", () => {
  for (const handle of [
    "!".repeat(31),
    "AB",
    "\u0000",
    " ",
    "éé",
    "a\n",
    "KK",
    "x".repeat(1000) + "!",
    "A".repeat(31),
    " ".repeat(40),
    EMOJI.repeat(16),
  ]) {
    assert.deepEqual(checkHandle(handle), LENGTH, label(handle));
  }
});

// Extends "[boundary-7] a 3-code-unit handle of 2 code points passes length and fails charset":
// emoji-only handles and combining marks near both bounds.
test("[boundary-7] emoji-only handles are judged by code units at both bounds", () => {
  // 2 code points, 4 code units: in range, so charset.
  assert.deepEqual(checkHandle(EMOJI + EMOJI), CHARSET);
  // 15 code points, 30 code units: in range, so charset.
  assert.deepEqual(checkHandle(EMOJI.repeat(15)), CHARSET);
  // 16 code points, 32 code units: too long, though 16 code points would fit.
  assert.deepEqual(checkHandle(EMOJI.repeat(16)), LENGTH);
});

test("[boundary-7] combining marks and lone surrogates each count as one code unit", () => {
  // "e" + U+0301 is one grapheme but two code units: too short.
  assert.deepEqual(checkHandle("é"), LENGTH);
  assert.deepEqual(checkHandle("ab́"), CHARSET);
  // 30 graphemes but 31 code units: too long.
  assert.deepEqual(checkHandle("x".repeat(29) + "é"), LENGTH);
  assert.deepEqual(checkHandle("x".repeat(28) + "é"), CHARSET);
  assert.deepEqual(checkHandle("ab\uD800"), CHARSET);
});

// Extends "[unhappy-4] each problem carries its own reason and nothing else":
// many handles, each rejection exactly three properties with its own sentence.
test("[unhappy-4] every rejection is exactly status, problem and the matching fixed reason", () => {
  const cases: Array<[string, typeof LENGTH | typeof CHARSET]> = [
    ["", LENGTH],
    ["a", LENGTH],
    ["!!", LENGTH],
    ["x".repeat(31), LENGTH],
    ["X".repeat(99), LENGTH],
    ["ABC", CHARSET],
    ["a.b", CHARSET],
    ["x".repeat(29) + "!", CHARSET],
    [" abc ", CHARSET],
    ["Kim", CHARSET],
  ];
  for (const [handle, expected] of cases) {
    const result = checkHandle(handle);
    assert.deepEqual(result, expected, label(handle));
    assert.deepEqual(Object.keys(result).sort(), ["problem", "reason", "status"], label(handle));
    if (result.status === "invalid") {
      assert.equal(
        result.reason,
        result.problem === "length" ? LENGTH_REASON : CHARSET_REASON,
        label(handle),
      );
    }
  }
});

test("[unhappy-4] the reason never includes the offending handle", () => {
  const long = checkHandle("q".repeat(40));
  const bad = checkHandle("bad!name");
  assert.equal(long.status === "invalid" ? long.reason : undefined, LENGTH_REASON);
  assert.equal(bad.status === "invalid" ? bad.reason : undefined, CHARSET_REASON);
});
