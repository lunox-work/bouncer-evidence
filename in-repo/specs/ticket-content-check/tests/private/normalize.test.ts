import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeSpecText } from "../../src/ticket.js";

/**
 * Hidden checks for normalizeSpecText: line endings unified to LF, each
 * line's end trimmed, the whole text trimmed, and nothing else changed.
 */

// extends: "[happy-4] line endings become LF and trailing spaces and tabs per line are removed"
test("[happy-4] runs and mixes of CR, LF and CRLF each become one LF per line break", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["a\r\r\rb", "a\n\n\nb"],
    ["a\r\n\r\nb", "a\n\nb"],
    ["a\n\rb", "a\n\nb"],
    ["a\n\r\nb", "a\n\nb"],
    ["a\r\n\rb", "a\n\nb"],
    ["one\rtwo\nthree\r\nfour", "one\ntwo\nthree\nfour"],
    ["x\r\ny\r\nz", "x\ny\nz"],
  ];
  for (const [input, output] of cases) {
    assert.equal(normalizeSpecText(input), output, JSON.stringify(input));
  }
});

// extends: "[happy-4] line endings become LF and trailing spaces and tabs per line are removed"
test("[happy-4] trailing whitespace is removed from every line, and whitespace-only inner lines become empty", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["a \t \nb", "a\nb"],
    ["a\t\t\r\nb  \r\nc", "a\nb\nc"],
    ["a\n   \nb", "a\n\nb"],
    ["a\n\t\t\nb", "a\n\nb"],
    ["a  \r  \r\nb", "a\n\nb"],
    ["first   \nsecond\t\nthird \t", "first\nsecond\nthird"],
  ];
  for (const [input, output] of cases) {
    assert.equal(normalizeSpecText(input), output, JSON.stringify(input));
  }
});

// extends: "[happy-4] line endings become LF and trailing spaces and tabs per line are removed"
test("[happy-4] leading indentation is kept on every line but the first, which the whole-text trim removes", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["\t\r\n  a\n    b\n\tc", "a\n    b\n\tc"],
    ["  - item\n  - item\n    - nested", "- item\n  - item\n    - nested"],
    ["Steps:\r\n  1. open\r\n  2. click  \r\n", "Steps:\n  1. open\n  2. click"],
    ["\n\n\n   \n  body", "body"],
    ["x\n \ty", "x\n \ty"],
  ];
  for (const [input, output] of cases) {
    assert.equal(normalizeSpecText(input), output, JSON.stringify(input));
  }
});

// extends: "[happy-4] inner blank lines, inner spaces, case and Unicode forms are kept"
test("[happy-4] inner tabs, punctuation, case, compatibility characters and decomposed forms are kept", () => {
  for (const input of [
    "a\tb",
    "a \t b",
    "MiXeD CaSe",
    "ＡＢＣ",
    "ﬁle",
    "é",
    "Ångström",
    "Ångström",
    "😀 emoji",
    '"quoted" and \\back\\slash',
    "a\n\n\n\n\nb",
    "<b>html</b>",
  ]) {
    assert.equal(normalizeSpecText(input), input, JSON.stringify(input));
  }
});

// extends: "[happy-4] line endings become LF and trailing spaces and tabs per line are removed"
test("[happy-4] a long description of many CRLF lines with trailing spaces normalizes line by line", () => {
  const lines = Array.from({ length: 2000 }, (_, i) => `  line ${i}`);
  const input = lines.map((line) => `${line}  \t`).join("\r\n") + "\r\n\r\n";
  const expected = ["line 0", ...lines.slice(1)].join("\n");
  assert.equal(normalizeSpecText(input), expected);
});

// extends: "[boundary-4] empty text normalizes to the empty string"
// extends: "[boundary-4] blank text of spaces, tabs and line endings normalizes to the empty string"
test("[boundary-4] other blank texts of only spaces, tabs, CR and LF normalize to the empty string", () => {
  for (const input of [
    "\n",
    "\r",
    "\r\n",
    "\t",
    "\n\n\n",
    "\r\r\r",
    " \t \r \n \r\n ",
    " ".repeat(20_000),
    "\r\n".repeat(5_000),
  ]) {
    assert.equal(normalizeSpecText(input), "", JSON.stringify(input.slice(0, 12)));
  }
});

// extends: "[boundary-5] normalizing is idempotent for already-trimmed and blank-line text"
test("[boundary-5] normalizing again changes nothing for many other texts", () => {
  for (const text of [
    "",
    "a",
    "a\r\rb",
    "\r\n  x  \r\n\ty\t\r\n",
    "  - item\n  - item\n    - nested  ",
    "a\n\r\n\rb",
    "Ünïcødé 😀\r\n  next\t",
    "\t\t\n \n\t",
  ]) {
    const once = normalizeSpecText(text);
    assert.equal(normalizeSpecText(once), once, JSON.stringify(text));
  }
});

// extends: "[boundary-5] normalizing the normalized text gives the same result"
test("[boundary-5] normalizing three times gives the same result as once", () => {
  const text = "  a  \r\n  b\t\r\r\nc  ";
  const once = normalizeSpecText(text);
  assert.equal(once, "a\n  b\n\nc");
  assert.equal(normalizeSpecText(normalizeSpecText(once)), "a\n  b\n\nc");
});
