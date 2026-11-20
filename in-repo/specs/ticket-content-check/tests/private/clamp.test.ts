import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  DEFAULT_ISSUE_TYPE,
  TICKET_LIMITS,
  TICKET_ORIGINS,
  TICKET_SPEC_HASH_VERSION,
  clampTicketTitle,
  ticketSpecHash,
} from "../../src/ticket.js";

/**
 * Hidden checks for the constants and for clampTicketTitle. The constants are
 * already defined in the stub, so each constant test also goes through a
 * function of the module that uses the constant.
 */

const HIGH = "\uD83D";
const LOW = "\uDE00";
const EMOJI = "😀";

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// ---------------------------------------------------------------- constants

// extends: "[happy-1] TICKET_ORIGINS is manual then jira, DEFAULT_ISSUE_TYPE is Task, hash version is 1"
// extends: "[happy-1] the constants have exactly these values and types, with no extra origins"
test("[happy-1] DEFAULT_ISSUE_TYPE hashes as the literal Task, with origins manual then jira and version 1", async () => {
  assert.deepEqual([...TICKET_ORIGINS], ["manual", "jira"]);
  assert.equal(TICKET_ORIGINS.indexOf("manual"), 0);
  assert.equal(TICKET_ORIGINS.indexOf("jira"), 1);
  assert.equal(TICKET_SPEC_HASH_VERSION, 1);
  assert.equal(DEFAULT_ISSUE_TYPE, "Task");
  assert.equal(
    await ticketSpecHash("A", "B", DEFAULT_ISSUE_TYPE),
    "94df515b9e448e7e65fc04e923fd2407d34b2b4b0176f7b9dd5695d858c83cd1",
  );
  assert.equal(
    await ticketSpecHash("Title", "Description", DEFAULT_ISSUE_TYPE),
    sha256Hex(JSON.stringify(["Title", "Description", "Task"])),
  );
});

// extends: "[happy-2] TICKET_LIMITS deep-equals the six documented limits"
// extends: "[happy-2] TICKET_LIMITS has exactly six keys and no limit for components"
test("[happy-2] TICKET_LIMITS.title is the length clampTicketTitle cuts to, and the limits are exactly the six entries", () => {
  assert.deepEqual(
    Object.entries(TICKET_LIMITS).sort(([a], [b]) => (a < b ? -1 : 1)),
    [
      ["description", 20000],
      ["issueType", 64],
      ["label", 64],
      ["labels", 20],
      ["priority", 64],
      ["title", 255],
    ],
  );
  const cut = clampTicketTitle("x".repeat(TICKET_LIMITS.title * 4));
  assert.equal(cut.length, TICKET_LIMITS.title);
  assert.equal(cut.length, 255);
});

// ---------------------------------------------------------- clampTicketTitle

// extends: "[happy-3] ordinary, empty and whitespace-padded titles are returned exactly as given"
test("[happy-3] other short titles are returned unchanged: unicode, emoji pairs, control and blank text", () => {
  for (const title of [
    "a",
    " ",
    "\t\n",
    " ".repeat(255),
    "Fix login 😀",
    EMOJI,
    EMOJI + EMOJI,
    "Café — résumé",
    "Café",
    "日本語のタイトル",
    "Line one\nLine two",
    "trailing tab\t",
    "A" + HIGH + "b",
    HIGH + "abc",
    "ab" + LOW,
    LOW,
  ]) {
    assert.equal(clampTicketTitle(title), title, JSON.stringify(title));
  }
});

// extends: "[happy-3] a title exactly at 255 code units, including one ending in a complete pair, is kept"
test("[happy-3] titles of exactly 255 code units made of many pairs or non-ASCII text are kept", () => {
  const cases = [
    "a" + EMOJI.repeat(127),
    EMOJI.repeat(127) + "a",
    "é".repeat(255),
    "日".repeat(255),
    " ".repeat(100) + "b".repeat(155),
    "é".repeat(127) + "e",
  ];
  for (const title of cases) {
    assert.equal(title.length, 255);
    assert.equal(clampTicketTitle(title), title, JSON.stringify(title.slice(0, 8)));
  }
});

// extends: "[happy-3] ordinary, empty and whitespace-padded titles are returned exactly as given"
test("[happy-3] titles of every length from 0 to 255 code units are returned unchanged", () => {
  for (let n = 0; n <= 255; n += 1) {
    const title = "x".repeat(n);
    assert.equal(clampTicketTitle(title), title, String(n));
  }
});

// extends: "[boundary-1] a trailing lone high surrogate is dropped from a title that fits"
test("[boundary-1] a trailing lone high surrogate is dropped from short titles of other contents", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["a" + HIGH, "a"],
    ["Fix login " + HIGH, "Fix login "],
    ["  " + HIGH, "  "],
    [EMOJI + HIGH, EMOJI],
    ["\uDBFF".padStart(2, "z"), "z"],
    ["x\uD800", "x"],
    ["a".repeat(100) + HIGH, "a".repeat(100)],
  ];
  for (const [title, expected] of cases) {
    assert.equal(clampTicketTitle(title), expected, JSON.stringify(title));
  }
});

// extends: "[boundary-1] a title that is only a lone high surrogate becomes empty"
test("[boundary-1] other lone high surrogate code units alone become empty", () => {
  for (const unit of ["\uD800", "\uDB40", "\uDBFF"]) {
    assert.equal(clampTicketTitle(unit), "");
  }
});

// extends: "[boundary-1] a trailing lone high surrogate is dropped from a title that fits"
test("[boundary-1] a trailing lone low surrogate is not dropped from a title that fits", () => {
  assert.equal(clampTicketTitle("a".repeat(254) + LOW), "a".repeat(254) + LOW);
  assert.equal(clampTicketTitle("ab" + LOW), "ab" + LOW);
});

// extends: "[boundary-2] a title of 256 code units is cut to the first 255"
test("[boundary-2] very long titles are cut to their first 255 code units", () => {
  for (const n of [257, 510, 1000, 20_000, 100_000]) {
    const title = "abcdefghij".repeat(Math.ceil(n / 10)).slice(0, n);
    const result = clampTicketTitle(title);
    assert.equal(result, title.slice(0, 255), String(n));
    assert.equal(result.length, 255);
  }
});

// extends: "[boundary-2] a long cut keeps leading and trailing whitespace and complete pairs"
test("[boundary-2] a cut that ends in whitespace keeps it, and all-blank long titles stay blank", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    [" ".repeat(300), " ".repeat(255)],
    ["\t".repeat(256), "\t".repeat(255)],
    ["a".repeat(250) + " ".repeat(10), "a".repeat(250) + " ".repeat(5)],
    ["a".repeat(255) + "    ", "a".repeat(255)],
    [" ".repeat(255) + "abc", " ".repeat(255)],
    ["a".repeat(253) + "\n\nb", "a".repeat(253) + "\n\n"],
  ];
  for (const [title, expected] of cases) {
    const result = clampTicketTitle(title);
    assert.equal(result, expected, JSON.stringify(title.slice(-6)));
    assert.equal(result.length, 255);
  }
});

// extends: "[boundary-2] a long cut keeps leading and trailing whitespace and complete pairs"
test("[boundary-2] titles of many surrogate pairs or BMP characters are cut by code units, not code points", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["a" + EMOJI.repeat(128), "a" + EMOJI.repeat(127)],
    ["a" + EMOJI.repeat(200), "a" + EMOJI.repeat(127)],
    ["é".repeat(300), "é".repeat(255)],
    ["日".repeat(256), "日".repeat(255)],
    ["é".repeat(200), "é".repeat(127) + "e"],
    ["a".repeat(254) + LOW + "b", "a".repeat(254) + LOW],
    [HIGH + "a".repeat(300), HIGH + "a".repeat(254)],
  ];
  for (const [title, expected] of cases) {
    const result = clampTicketTitle(title);
    assert.equal(result, expected, JSON.stringify(title.slice(0, 4)));
    assert.equal(result.length, 255);
  }
});

// extends: "[boundary-2] a long cut keeps leading and trailing whitespace and complete pairs"
test("[boundary-2] a cut long title appends no ellipsis", () => {
  const result = clampTicketTitle("Word ".repeat(100));
  assert.equal(result, "Word ".repeat(51));
  assert.equal(result.length, 255);
  assert.equal(result.includes("…"), false);
});

// extends: "[boundary-3] a cut that would split a surrogate pair drops the lone high surrogate"
test("[boundary-3] a title of only surrogate pairs cut mid-pair drops the dangling high surrogate", () => {
  for (const count of [128, 129, 200, 1000]) {
    const result = clampTicketTitle(EMOJI.repeat(count));
    assert.equal(result, EMOJI.repeat(127), String(count));
    assert.equal(result.length, 254);
  }
});

// extends: "[boundary-3] the split-pair cut appends no ellipsis or other text"
// extends: "[boundary-3] a cut that would split a surrogate pair drops the lone high surrogate"
test("[boundary-3] a split pair after other text and with more text following drops only the high surrogate", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    [" ".repeat(254) + EMOJI, " ".repeat(254)],
    ["a".repeat(254) + EMOJI + "tail text", "a".repeat(254)],
    ["a".repeat(251) + "é" + EMOJI.repeat(5), "a".repeat(251) + "é" + EMOJI],
    ["b".repeat(254) + "🦀" + "b".repeat(50), "b".repeat(254)],
  ];
  for (const [title, expected] of cases) {
    const result = clampTicketTitle(title);
    assert.equal(result, expected);
    assert.equal(result.length, 254);
    assert.equal(result.endsWith("…"), false);
  }
});
