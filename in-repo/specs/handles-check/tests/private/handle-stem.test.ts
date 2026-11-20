import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HANDLE_MAX_LENGTH,
  HANDLE_MIN_LENGTH,
  checkHandle,
  handleStemFromEmail,
  toHandleStem,
} from "../../src/handle.js";

const OK = { status: "ok" } as const;
const EMOJI = "\u{1F600}";

function label(value: string): string {
  return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}...` : value);
}

function expectStems(cases: Array<[string, string]>, fn: (text: string) => string = toHandleStem): void {
  for (const [text, expected] of cases) {
    assert.equal(fn(text), expected, label(text));
  }
}

// Extends "[happy-7] toHandleStem turns free text into a stem":
// digits, punctuation runs, underscores and the Kelvin sign.
test("[happy-7] toHandleStem turns other free text into stems", () => {
  expectStems([
    ["Route 66", "route-66"],
    ["Hello, World!", "hello-world"],
    ["O'Brien & Sons", "o-brien-sons"],
    ["ACME_Corp", "acme_corp"],
    ["Ab1 Cd2", "ab1-cd2"],
    ["Kim", "kim"],
    ["Dana Rivers (Work)", "dana-rivers-work"],
  ]);
});

// Extends "[boundary-10] toHandleStem collapses runs of disallowed characters and keeps existing hyphens":
// Unicode runs, surrogate pairs, underscores between runs.
test("[boundary-10] runs of Unicode, whitespace and emoji collapse to one hyphen each", () => {
  expectStems([
    ["a  b", "a-b"],
    ["a\t\n\r b", "a-b"],
    [`a${EMOJI}${EMOJI}b`, "a-b"],
    [`a${EMOJI}-${EMOJI}b`, "a---b"],
    ["aéèêb", "a-b"],
    ["a" + "!".repeat(50) + "b", "a-b"],
  ]);
});

test("[boundary-10] hyphens and underscores between runs are kept, only edge hyphens trimmed", () => {
  expectStems([
    ["a!-!b", "a---b"],
    ["a._.b", "a-_-b"],
    ["a--.--b", "a-----b"],
    ["  -Acme-  ", "acme"],
    ["_-acme-_", "_-acme-_"],
    [".-_acme_-.", "_acme_"],
  ]);
});

// Extends "[boundary-11] a stem shorter than 3 gets the literal suffix -user":
// shorts produced by trimming, lowercasing and edge underscores.
test("[boundary-11] stems shortened by trimming get -user, stems of exactly 3 do not", () => {
  expectStems([
    ["ab", "ab-user"],
    ["A", "a-user"],
    ["-a-", "a-user"],
    ["ab-", "ab-user"],
    ["a!", "a-user"],
    [`${EMOJI}a`, "a-user"],
    ["_", "_-user"],
    ["-_-", "_-user"],
    ["--__--", "__-user"],
    ["---", "-user"],
    ["a-b", "a-b"],
    ["-a-b-", "a-b"],
    ["a.b", "a-b"],
  ]);
});

test("[boundary-11] lowercasing U+0130 decides whether the stem is short", () => {
  // "i" + U+0307: the combining dot becomes an edge hyphen and is trimmed.
  assert.equal(toHandleStem("İ"), "i-user");
  // "i" U+0307 "i" U+0307 becomes "i-i-", trimmed to "i-i": length 3, no suffix.
  assert.equal(toHandleStem("İİ"), "i-i");
});

// Extends "[boundary-12] toHandleStem handles a very long run of hyphens":
// long runs before letters, mixed with disallowed characters, long whitespace.
test("[boundary-12] long hyphen runs before, after and mixed with other characters", () => {
  const run = "-".repeat(100000);
  assert.equal(toHandleStem(run + "abc"), "abc");
  assert.equal(toHandleStem("x" + run), "x-user");
  assert.equal(toHandleStem(run + "ab" + run), "ab-user");
  assert.equal(toHandleStem(".-".repeat(100000)), "-user");
  assert.equal(toHandleStem(".".repeat(50000) + "-".repeat(50000) + "q"), "q-user");
  assert.equal(toHandleStem(" ".repeat(100000)), "-user");
  assert.equal(toHandleStem("a".repeat(100000)), "a".repeat(30));
  assert.equal(toHandleStem("-".repeat(200000) + "abc" + "-".repeat(200000)), "abc");
});

// Extends "[boundary-13] a stem longer than 30 is cut at 30 after trimming":
// leading hyphen runs, long repeated words, U+0130 and an underscore at the cut.
test("[boundary-13] long stems are cut at exactly 30 after the hyphen trim", () => {
  expectStems([
    ["-".repeat(40) + "x".repeat(40), "x".repeat(30)],
    ["x".repeat(30) + "-".repeat(10), "x".repeat(30)],
    ["x".repeat(30) + "!y", "x".repeat(30)],
    ["a".repeat(29) + "!!!b", "a".repeat(29) + "-"],
    ["a".repeat(28) + "-_b", "a".repeat(28) + "-_"],
    ["x".repeat(29) + "_y", "x".repeat(29) + "_"],
    ["X".repeat(35), "x".repeat(30)],
    ["ab ".repeat(1000), "ab-".repeat(10)],
    ["İ".repeat(20), "i-".repeat(15)],
  ]);
});

test("[boundary-13] a 31-character stem loses only its last character", () => {
  assert.equal(toHandleStem("abcdefghijklmnopqrstuvwxyz01234"), "abcdefghijklmnopqrstuvwxyz0123");
  assert.equal(toHandleStem("  abcdefghijklmnopqrstuvwxyz01234  "), "abcdefghijklmnopqrstuvwxyz0123");
});

// Extends "[happy-8] every stem passes checkHandle unchanged":
// a deterministic sweep of short strings over awkward characters, plus long inputs.
test("[happy-8] stems of every short combination of awkward characters pass checkHandle", () => {
  const alphabet = ["A", "-", "_", "!", " ", "İ", "x", EMOJI, "\uD800"];
  let texts: string[] = [""];
  const all: string[] = [""];
  for (let depth = 0; depth < 4; depth++) {
    const next: string[] = [];
    for (const prefix of texts) {
      for (const ch of alphabet) next.push(prefix + ch);
    }
    all.push(...next);
    texts = next;
  }
  for (const text of all) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), OK, label(text));
  }
});

test("[happy-8] stems of long and padded text pass checkHandle and stay within the bounds", () => {
  for (const text of [
    "-".repeat(31) + "ab",
    "a" + "-".repeat(100),
    "Ab" + "!".repeat(50),
    "İ".repeat(40),
    "ab ".repeat(1000),
    "\u0000",
    "_",
    "-_",
    "Dana Rivers & Co. Ltd. International Holdings",
  ]) {
    const stem = toHandleStem(text);
    assert.deepEqual(checkHandle(stem), OK, label(text));
    assert.ok(stem.length >= HANDLE_MIN_LENGTH && stem.length <= HANDLE_MAX_LENGTH, label(text));
  }
});

// Extends "[happy-9] handleStemFromEmail turns the local part into the stem":
// plus-tags, underscores, Kelvin sign, spaces in the local part.
test("[happy-9] handleStemFromEmail derives stems from other local parts", () => {
  expectStems(
    [
      ["Dana.Rivers+Tag@Example.TEST", "dana-rivers-tag"],
      ["\tDANA@x", "dana"],
      ["a_b@c", "a_b"],
      ["KIM@example.test", "kim"],
      ["First Last@example.test", "first-last"],
      ["dana+@example.test", "dana"],
    ],
    handleStemFromEmail,
  );
});

// Extends "[boundary-14] short or long local parts follow the stem rules":
// just past the maximum, two characters, trimmed to one, very long.
test("[boundary-14] other short and long local parts follow the stem rules", () => {
  expectStems(
    [
      ["x".repeat(31) + "@example.test", "x".repeat(30)],
      ["ab@example.test", "ab-user"],
      ["J@example.test", "j-user"],
      ["abc@", "abc"],
      ["-a-@x", "a-user"],
      ["a".repeat(29) + "-b@x", "a".repeat(29) + "-"],
      ["x".repeat(100000) + "@x", "x".repeat(30)],
      ["-".repeat(100000) + "@x", "-user"],
    ],
    handleStemFromEmail,
  );
});

// Extends "[unhappy-7] handleStemFromEmail does not reject malformed addresses":
// newlines in the domain, several @, @ at either end.
test("[unhappy-7] everything from the first @ on is ignored, even across newlines", () => {
  expectStems(
    [
      ["dana@example\ntest", "dana"],
      ["dana@\n\nmore\ntext", "dana"],
      ["a.b@c@d", "a-b"],
      ["jo@@dana", "jo-user"],
      ["dana@", "dana"],
      ["dana@\u0000", "dana"],
    ],
    handleStemFromEmail,
  );
});

test("[unhappy-7] malformed addresses with an empty or blank local part give -user", () => {
  expectStems(
    [
      ["@", "-user"],
      ["@@@", "-user"],
      [" @dana", "-user"],
      ["\n@dana", "-user"],
      ["@Dana.Rivers", "-user"],
    ],
    handleStemFromEmail,
  );
});

test("[unhappy-7] without an @ the whole string is the stem text", () => {
  for (const text of ["no.at.sign", "Rivers.Dana", "x".repeat(40), "jo", "İİ", "a b\nc"]) {
    assert.equal(handleStemFromEmail(text), toHandleStem(text), label(text));
  }
  assert.equal(handleStemFromEmail("no.at.sign"), "no-at-sign");
});
