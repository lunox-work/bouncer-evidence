import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { specHash, toIssueSpec } from "../../src/spec.js";

const SIGN_IN = "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"; // "Fix login", "Users can sign in."
const SUMMARY_ONLY = "84047eac0cb2f4449e8697ff60678c27258b6e6bd061b6ecde086731d22676be"; // "Fix login", ""
const EMPTY = "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d"; // "", ""

const TRUNCATED = "\n[truncated]";

type Fields = Parameters<typeof toIssueSpec>[1];

/** The digest the spec defines for two already-normalised parts. */
function sha(summary: string, description: string): string {
  return createHash("sha256").update(summary + "\u0000" + description, "utf8").digest("hex");
}

/** An ADF document holding the given block nodes. */
function doc(...content: unknown[]): Record<string, unknown> {
  return { type: "doc", version: 1, content };
}

/** An ADF paragraph holding one text node. */
function para(text: string): Record<string, unknown> {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const SIX_KEYS = ["descriptionText", "issueType", "key", "specHash", "summary", "updated"];

// --- field by field ------------------------------------------------------------

// Extends "[happy-5] a complete payload maps field by field": other values in every field,
// with a multi-block ADF description.
test("[happy-5] another complete payload maps field by field", async () => {
  const spec = await toIssueSpec("OPS-4521", {
    summary: "Rotate API keys",
    description: doc(para("Rotate every key."), para("Revoke the old ones.")),
    issuetype: { name: "Story" },
    updated: "2025-01-31T23:59:59.999-0500",
  });
  assert.deepEqual(
    { ...spec },
    {
      key: "OPS-4521",
      summary: "Rotate API keys",
      descriptionText: "Rotate every key.\n\nRevoke the old ones.",
      issueType: "Story",
      updated: "2025-01-31T23:59:59.999-0500",
      specHash: sha("Rotate API keys", "Rotate every key.\n\nRevoke the old ones."),
    },
  );
});

// Extends "[happy-5] the result has exactly the six spec properties, even when fields carry
// extras": own keys include non-enumerable and symbol keys, so none may be hidden there.
test("[happy-5] the result's own property keys, enumerable or not, are exactly the six", async () => {
  const fields = {
    summary: "Fix login",
    description: doc(para("Users can sign in.")),
    issuetype: { name: "Bug", id: "10001" },
    updated: "2026-11-01T10:00:00.000+0000",
    description_raw: "x",
    key: "OTHER-9",
    id: "10042",
    renderedFields: { description: "<p>x</p>" },
  } as Fields;
  const spec = await toIssueSpec("PROJ-1", fields);
  assert.deepEqual(
    Reflect.ownKeys(spec).map(String).sort(),
    SIX_KEYS,
  );
  assert.equal(spec.key, "PROJ-1");
  assert.equal(spec.specHash, SIGN_IN);
});

// Extends "[boundary-5] an empty or padded key is returned as given, not validated".
test("[boundary-5] keys with other odd shapes are returned exactly as given", async () => {
  const keys = ["proj-1\n", "PROJ_1", "ПРОЕКТ-7", "a/b?c=d", "K".repeat(500), "0", "\t"];
  for (const key of keys) {
    assert.equal((await toIssueSpec(key, {})).key, key, JSON.stringify(key));
  }
});

// Extends "[boundary-5] an ordinary key is returned as given": the key is not part of the hash.
test("[boundary-5] the key is returned as given and does not enter the hash", async () => {
  const fields = { summary: "Fix login", description: "Users can sign in." };
  const one = await toIssueSpec("PROJ-1", fields);
  const two = await toIssueSpec("  other key  ", fields);
  assert.equal(one.key, "PROJ-1");
  assert.equal(two.key, "  other key  ");
  assert.equal(one.specHash, SIGN_IN);
  assert.equal(two.specHash, SIGN_IN);
});

// Extends "[unhappy-2] a number or array summary becomes an empty string": other non-strings,
// and the default is "" in the hash too, not a stringified value.
test("[unhappy-2] boolean, object, zero and function summaries become an empty string", async () => {
  const values: unknown[] = [true, false, 0, {}, { toString: () => "Fix login" }, () => "Fix login", ["Fix", "login"]];
  for (const summary of values) {
    const spec = await toIssueSpec("PROJ-1", { summary });
    assert.equal(spec.summary, "", String(summary));
    assert.equal(spec.specHash, EMPTY, String(summary));
  }
});

// Extends "[unhappy-2] a missing or null summary becomes an empty string": with a description
// present, the hash is of "" and the description.
test("[unhappy-2] a non-string summary with a description hashes as an empty summary", async () => {
  const spec = await toIssueSpec("PROJ-1", { summary: 42, description: "Fix login" });
  assert.equal(spec.summary, "");
  assert.equal(spec.specHash, sha("", "Fix login"));
});

// Extends "[boundary-6] a summary with a trailing CRLF is returned raw": other padding and
// internal whitespace stay in the returned summary and are only normalised in the hash.
test("[boundary-6] other padded and multi-line summaries are returned raw and normalised only in the hash", async () => {
  const cases: Array<[string, string]> = [
    ["\tFix login\n", "Fix login"],
    ["\r\n\r\nFix login \t", "Fix login"],
    ["Fix login  \r\n  more", "Fix login\n  more"],
    ["Fix  login", "Fix  login"],
  ];
  for (const [summary, normalised] of cases) {
    const spec = await toIssueSpec("PROJ-1", { summary });
    assert.equal(spec.summary, summary, JSON.stringify(summary));
    assert.equal(spec.specHash, sha(normalised, ""), JSON.stringify(summary));
  }
});

// Extends "[boundary-6] a string summary is returned untrimmed": a whitespace-only summary is
// kept as is and hashes as empty.
test("[boundary-6] a whitespace-only summary is returned as is and hashes as empty", async () => {
  const spec = await toIssueSpec("PROJ-1", { summary: " \t\r\n " });
  assert.equal(spec.summary, " \t\r\n ");
  assert.equal(spec.specHash, EMPTY);
});

// Extends "[unhappy-3] an issue type with a missing, null or numeric name becomes Task".
test("[unhappy-3] boolean, object and array issue type names become Task", async () => {
  const names: unknown[] = [true, false, {}, ["Bug"], { name: "Bug" }];
  for (const name of names) {
    assert.equal((await toIssueSpec("PROJ-1", { issuetype: { name } })).issueType, "Task", JSON.stringify(name));
  }
});

// Extends "[unhappy-3] a missing or null issue type becomes Task": an issue type that is not an
// object has no name, so it is Task too.
test("[unhappy-3] an issue type that is a string, number or array has no name and becomes Task", async () => {
  const values: unknown[] = ["Bug", 7, [{ name: "Bug" }], true];
  for (const issuetype of values) {
    const spec = await toIssueSpec("PROJ-1", { issuetype } as Fields);
    assert.equal(spec.issueType, "Task", JSON.stringify(issuetype));
  }
});

// Extends "[boundary-7] a whitespace-only issue type name is a string and is kept as it is".
test("[boundary-7] any string issue type name, padded or unusual, is kept exactly", async () => {
  const names = ["Story", "Sub-task", "  Bug  ", "task", "Épica", "\n"];
  for (const name of names) {
    assert.equal((await toIssueSpec("PROJ-1", { issuetype: { name } })).issueType, name, JSON.stringify(name));
  }
});

// Extends "[unhappy-4] a numeric updated becomes null": other non-strings.
test("[unhappy-4] boolean, object, Date, array and zero updated values become null", async () => {
  const values: unknown[] = [true, {}, new Date(0), ["2026-11-01"], 0, Number.NaN];
  for (const updated of values) {
    assert.equal((await toIssueSpec("PROJ-1", { updated })).updated, null, String(updated));
  }
});

// Extends "[boundary-8] a non-date or empty updated string is passed through without parsing".
test("[boundary-8] other date-like and blank updated strings are passed through untouched", async () => {
  const values = ["2026-11-01", "   ", "1700000000000", " 2026-11-01T10:00:00Z\n", "yesterday"];
  for (const updated of values) {
    assert.equal((await toIssueSpec("PROJ-1", { updated })).updated, updated, JSON.stringify(updated));
  }
});

// Extends "[unhappy-5] empty fields give an empty spec": the key still comes from the call,
// and the result has exactly the six properties.
test("[unhappy-5] empty fields with another key give an empty spec under that key", async () => {
  for (const key of ["ABC-7", ""]) {
    const spec = await toIssueSpec(key, {});
    assert.deepEqual(
      { ...spec },
      {
        key,
        summary: "",
        descriptionText: "",
        issueType: "Task",
        updated: null,
        specHash: EMPTY,
      },
    );
    assert.deepEqual(Reflect.ownKeys(spec).map(String).sort(), SIX_KEYS);
  }
});

// Extends "[unhappy-6] other wrong types everywhere also resolve with defaults": yet other
// wrong types, including non-object issue types and an ADF-looking but broken description.
test("[unhappy-6] still other wrong types everywhere resolve with defaults", async () => {
  const variants: unknown[] = [
    { summary: [], description: 0, issuetype: "Bug", updated: Number.NaN },
    { summary: null, description: { type: "doc", content: null }, issuetype: 7, updated: [] },
    { summary: 1, description: { type: "doc", content: [{ type: "paragraph", content: "x" }] }, issuetype: { name: { toString: () => "Bug" } }, updated: { toString: () => "2026" } },
  ];
  for (const fields of variants) {
    const spec = await toIssueSpec("PROJ-1", fields as Fields);
    assert.equal(spec.key, "PROJ-1");
    assert.equal(spec.summary, "");
    assert.equal(spec.descriptionText, "");
    assert.equal(spec.issueType, "Task");
    assert.equal(spec.updated, null);
    assert.equal(spec.specHash, EMPTY);
  }
});

// --- specHash in the result ------------------------------------------------------

// Extends "[happy-6] the result's hash matches a direct call on its own fields": the hash is
// of the tidied descriptionText, not the raw string, for tabs, CR and padding.
test("[happy-6] the result's hash is of the tidied descriptionText, not the raw description", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "  Users\tcan \r sign\t\tin.  ",
  });
  assert.equal(spec.descriptionText, "Users can sign in.");
  assert.equal(spec.specHash, await specHash(spec.summary, spec.descriptionText));
  assert.equal(spec.specHash, SIGN_IN);
});

// Extends "[happy-6]": an ADF description rendered with Markdown-like markers is what is hashed.
test("[happy-6] the result's hash matches a direct call on an ADF-rendered descriptionText", async () => {
  const spec = await toIssueSpec("PROJ-2", {
    summary: "Checklist",
    description: doc(
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Steps" }] },
      { type: "bulletList", content: [{ type: "listItem", content: [para("One")] }] },
    ),
  });
  assert.equal(spec.descriptionText, "## Steps\n\n- One");
  assert.equal(spec.specHash, await specHash(spec.summary, spec.descriptionText));
  assert.equal(spec.specHash, sha("Checklist", "## Steps\n\n- One"));
});

// Extends "[happy-6]": a CR-bearing string tidies to " \n", whose trailing space the hash removes.
test("[happy-6] the result's hash matches a direct call when descriptionText has a space before a line feed", async () => {
  const spec = await toIssueSpec("PROJ-1", { summary: "Fix login", description: "Users can\r\nsign in." });
  assert.equal(spec.descriptionText, "Users can \nsign in.");
  assert.equal(spec.specHash, await specHash(spec.summary, spec.descriptionText));
  assert.equal(spec.specHash, sha("Fix login", "Users can\nsign in."));
});

// Extends "[happy-7] the same spec from a plain string and from ADF hashes the same":
// multi-paragraph and hard-break content.
test("[happy-7] paragraphs and hard breaks in ADF hash the same as the equivalent plain string", async () => {
  const pairs: Array<[string, unknown, string]> = [
    ["Line one\n\nLine two", doc(para("Line one"), para("Line two")), "Line one\n\nLine two"],
    [
      "Line one\nLine two",
      doc({ type: "paragraph", content: [{ type: "text", text: "Line one" }, { type: "hardBreak" }, { type: "text", text: "Line two" }] }),
      "Line one\nLine two",
    ],
  ];
  for (const [plain, adf, text] of pairs) {
    const fromString = await toIssueSpec("PROJ-1", { summary: "Fix login", description: plain });
    const fromAdf = await toIssueSpec("PROJ-1", { summary: "Fix login", description: adf });
    assert.equal(fromString.descriptionText, text);
    assert.equal(fromAdf.descriptionText, text);
    assert.equal(fromString.specHash, sha("Fix login", text));
    assert.equal(fromAdf.specHash, sha("Fix login", text));
  }
});

// --- descriptions that are not strings or ADF -----------------------------------

// Extends "[unhappy-7] an array, an empty object or a doc without usable content becomes an
// empty descriptionText": other unusable shapes.
test("[unhappy-7] other unusable descriptions become an empty descriptionText", async () => {
  const values: unknown[] = [
    0,
    false,
    Number.NaN,
    { type: "doc", content: null },
    { type: "doc", content: {} },
    { type: "doc", content: 5 },
    { type: "doc", content: [] },
    { content: "x" },
    { version: 1 },
  ];
  for (const description of values) {
    const spec = await toIssueSpec("PROJ-1", { summary: "Fix login", description });
    assert.equal(spec.descriptionText, "", JSON.stringify(description));
    assert.equal(spec.specHash, SUMMARY_ONLY, JSON.stringify(description));
  }
});

// --- plain-string descriptions ---------------------------------------------------

// Extends "[happy-8] spaces around line feeds, CR, edge line feeds and blank strings are
// tidied": other mixes of tabs, CR and line feeds.
test("[happy-8] runs of spaces, tabs and CR become one space while every line feed is kept", async () => {
  const cases: Array<[string, string]> = [
    ["a\t\tb", "a b"],
    ["a\rb", "a b"],
    ["a\r\rb", "a b"],
    ["a \t \r b", "a b"],
    ["a\r\n\r\nb", "a \n \nb"],
    ["a\n \nb", "a\n \nb"],
    ["Line one\n\n\nLine two", "Line one\n\n\nLine two"],
    ["a\n\t\tb", "a\n b"],
    ["\t\n\t", ""],
    ["\r\n", ""],
    ["\t Users can sign in. \r", "Users can sign in."],
  ];
  for (const [description, expected] of cases) {
    const spec = await toIssueSpec("PROJ-1", { description });
    assert.equal(spec.descriptionText, expected, JSON.stringify(description));
  }
});

// Extends "[happy-8] plain-string descriptions have whitespace runs collapsed": non-ASCII text
// and longer content are kept apart from whitespace.
test("[happy-8] a long multi-line plain string keeps its words and line feeds", async () => {
  const lines: string[] = [];
  const expected: string[] = [];
  for (let i = 0; i < 50; i++) {
    lines.push(`Línea  ${i}\tcon   espacios`);
    expected.push(`Línea ${i} con espacios`);
  }
  const spec = await toIssueSpec("PROJ-1", { description: lines.join("\n") });
  assert.equal(spec.descriptionText, expected.join("\n"));
});

// --- the cap -------------------------------------------------------------------------

// Extends "[boundary-13] a string at the cap is kept, one over is truncated, and trailing spaces
// are tidied first": collapsing and leading trim also happen before the cap.
test("[boundary-13] whitespace collapsed and trimmed before the cap can bring a long string under it", async () => {
  const collapsed = await toIssueSpec("PROJ-1", { description: "a".repeat(10000) + "      " + "a".repeat(9999) });
  assert.equal(collapsed.descriptionText, "a".repeat(10000) + " " + "a".repeat(9999));

  const leading = await toIssueSpec("PROJ-1", { description: "   \n " + "a".repeat(20000) });
  assert.equal(leading.descriptionText, "a".repeat(20000));

  const trailingNewline = await toIssueSpec("PROJ-1", { description: "a".repeat(20000) + "\n" });
  assert.equal(trailingNewline.descriptionText, "a".repeat(20000));
});

// Extends "[boundary-13] a string at the cap is kept, one over is truncated": far over the cap,
// and over the cap with line feeds.
test("[boundary-13] a string far over the cap keeps exactly its first 20,000 code units", async () => {
  const long = await toIssueSpec("PROJ-1", { description: "c".repeat(100000) });
  assert.equal(long.descriptionText, "c".repeat(20000) + TRUNCATED);

  const lines = "x" + "abc\n".repeat(6000); // tidied: 24,000 code units; code unit 20,000 is a "c"
  const spec = await toIssueSpec("PROJ-1", { description: lines });
  assert.equal(spec.descriptionText, lines.slice(0, 20000) + TRUNCATED);
});

// Extends "[boundary-13] ADF text over the cap is truncated, counting the block separator":
// heading markers count, trailing whitespace is removed first, and three blocks are joined first.
test("[boundary-13] ADF markers and separators count toward the cap; trailing whitespace does not", async () => {
  const heading = (n: number) => doc({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "h".repeat(n) }] });
  assert.equal((await toIssueSpec("PROJ-1", { description: heading(19998) })).descriptionText, "# " + "h".repeat(19998));
  assert.equal(
    (await toIssueSpec("PROJ-1", { description: heading(19999) })).descriptionText,
    "# " + "h".repeat(19998) + TRUNCATED,
  );

  const padded = await toIssueSpec("PROJ-1", { description: doc(para("b".repeat(20000) + "     ")) });
  assert.equal(padded.descriptionText, "b".repeat(20000));

  const three = await toIssueSpec("PROJ-1", {
    description: doc(para("a".repeat(7000)), para("b".repeat(7000)), para("c".repeat(7000))),
  });
  assert.equal(
    three.descriptionText,
    "a".repeat(7000) + "\n\n" + "b".repeat(7000) + "\n\n" + "c".repeat(5996) + TRUNCATED,
  );
});

// Extends "[boundary-14] the cap counts UTF-16 code units and may split a surrogate pair":
// text made only of astral characters, and the same split from ADF.
test("[boundary-14] astral-only text is capped at 20,000 code units, not 20,000 characters", async () => {
  const atCap = await toIssueSpec("PROJ-1", { description: "\u{1F600}".repeat(10000) });
  assert.equal(atCap.descriptionText, "\u{1F600}".repeat(10000));

  const over = await toIssueSpec("PROJ-1", { description: "\u{1F600}".repeat(10001) });
  assert.equal(over.descriptionText, "\u{1F600}".repeat(10000) + TRUNCATED);

  const oneMore = await toIssueSpec("PROJ-1", { description: "\u{1F600}".repeat(10000) + "a" });
  assert.equal(oneMore.descriptionText, "\u{1F600}".repeat(10000) + TRUNCATED);
});

// Extends "[boundary-14] the cap counts UTF-16 code units and may split a surrogate pair".
test("[boundary-14] ADF text and longer astral tails are split mid-pair at the cap too", async () => {
  const adf = await toIssueSpec("PROJ-1", { description: doc(para("a".repeat(19999) + "\u{1F600}")) });
  assert.equal(adf.descriptionText, "a".repeat(19999) + "\uD83D" + TRUNCATED);

  const tail = await toIssueSpec("PROJ-1", { description: "a".repeat(19999) + "\u{1F600}\u{1F389}\u{1F680}" });
  assert.equal(tail.descriptionText, "a".repeat(19999) + "\uD83D" + TRUNCATED);
});

// Extends "[boundary-14]": the hash of a split pair is the hash of the capped text, lone
// surrogate included.
test("[boundary-14] the hash of a split surrogate pair is specHash of the capped text", async () => {
  const spec = await toIssueSpec("PROJ-1", { summary: "Fix login", description: "a".repeat(19999) + "\u{1F600}" });
  assert.equal(spec.specHash, await specHash("Fix login", "a".repeat(19999) + "\uD83D" + TRUNCATED));
});

// Extends "[boundary-15] edits beyond the cap do not change the descriptionText or the hash":
// from ADF, with the hash checked against the capped text.
test("[boundary-15] edits beyond the cap in ADF change neither descriptionText nor the hash", async () => {
  const one = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: doc(para("a".repeat(20000)), para("first ending")),
  });
  const two = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: doc(para("a".repeat(20000)), para("a second, much longer ending"), para("and more")),
  });
  assert.equal(one.descriptionText, "a".repeat(20000) + TRUNCATED);
  assert.equal(two.descriptionText, one.descriptionText);
  assert.equal(one.specHash, two.specHash);
  assert.equal(one.specHash, sha("Fix login", "a".repeat(20000) + "\n[truncated]"));
});

// Extends "[boundary-15] edits beyond the cap do not change the descriptionText or the hash":
// a string description edited far past the cap, and its hash is not of the full text.
test("[boundary-15] a string edited far past the cap keeps the capped hash", async () => {
  const one = await toIssueSpec("PROJ-1", { summary: "Fix login", description: "a".repeat(20000) + "z".repeat(50000) });
  const two = await toIssueSpec("PROJ-1", { summary: "Fix login", description: "a".repeat(20000) + "y" });
  assert.equal(one.specHash, two.specHash);
  assert.equal(one.specHash, sha("Fix login", "a".repeat(20000) + "\n[truncated]"));
  assert.notEqual(one.specHash, sha("Fix login", "a".repeat(20000) + "z".repeat(50000)));
});

// --- concurrency ---------------------------------------------------------------

// Extends "[concurrency-2] overlapping toIssueSpec calls do not mix their fields": many calls
// with different fields, started together.
test("[concurrency-2] many overlapping toIssueSpec calls each get their own fields", async () => {
  const calls: Array<[string, Fields]> = [];
  for (let i = 0; i < 30; i++) {
    calls.push([
      `PROJ-${i}`,
      i % 2 === 0
        ? { summary: `Summary ${i}`, description: `Body  ${i}`, issuetype: { name: `Type ${i}` }, updated: `u${i}` }
        : { summary: `Summary ${i}`, description: doc(para(`Body ${i}`), para("x".repeat(i * 500))) },
    ]);
  }
  const results = await Promise.all(calls.map(([key, fields]) => toIssueSpec(key, fields)));
  results.forEach((spec, i) => {
    const descriptionText = i % 2 === 0 ? `Body ${i}` : `Body ${i}\n\n${"x".repeat(i * 500)}`;
    assert.deepEqual({ ...spec }, {
      key: `PROJ-${i}`,
      summary: `Summary ${i}`,
      descriptionText,
      issueType: i % 2 === 0 ? `Type ${i}` : "Task",
      updated: i % 2 === 0 ? `u${i}` : null,
      specHash: sha(`Summary ${i}`, descriptionText),
    });
  });
});

// Extends "[concurrency-2] overlapping toIssueSpec calls leave both fields objects unmodified":
// deeply frozen inputs, so any write to them rejects, and extra properties are left alone.
test("[concurrency-2] overlapping calls on deeply frozen fields resolve and leave them unmodified", async () => {
  const fieldsOne = deepFreeze({
    summary: "  Fix login  ",
    description: doc(
      para("Users can sign in.   "),
      { type: "bulletList", content: [{ type: "listItem", content: [para("Item")] }] },
    ),
    issuetype: { name: "Bug" },
    updated: "2026-11-01T10:00:00.000+0000",
    status: { name: "Open" },
  });
  const fieldsTwo = deepFreeze({ summary: "Fix login", description: "Users  can\tsign in.  " });
  const beforeOne = structuredClone(fieldsOne);
  const beforeTwo = structuredClone(fieldsTwo);
  const [first, second] = await Promise.all([
    toIssueSpec("PROJ-1", fieldsOne),
    toIssueSpec("PROJ-2", fieldsTwo),
  ]);
  assert.deepEqual(fieldsOne, beforeOne);
  assert.deepEqual(fieldsTwo, beforeTwo);
  assert.equal(first.summary, "  Fix login  ");
  assert.equal(first.descriptionText, "Users can sign in.\n\n- Item");
  assert.equal(first.specHash, sha("Fix login", "Users can sign in.\n\n- Item"));
  assert.equal(second.descriptionText, "Users can sign in.");
  assert.equal(second.specHash, SIGN_IN);
});
