import assert from "node:assert/strict";
import { test } from "node:test";

import { specHash, toIssueSpec } from "../src/spec.js";

const SIGN_IN = "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"; // "Fix login", "Users can sign in."
const SUMMARY_ONLY = "84047eac0cb2f4449e8697ff60678c27258b6e6bd061b6ecde086731d22676be"; // "Fix login", ""
const EMPTY = "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d"; // "", ""

const TRUNCATED = "\n[truncated]";

/** An ADF document holding the given block nodes. */
function doc(...content: unknown[]): Record<string, unknown> {
  return { type: "doc", version: 1, content };
}

/** An ADF paragraph holding one text node. */
function para(text: string): Record<string, unknown> {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

// --- field by field ------------------------------------------------------------

test("[happy-5] a complete payload maps field by field", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: doc(para("Users can sign in.")),
    issuetype: { name: "Bug" },
    updated: "2026-11-01T10:00:00.000+0000",
  });
  assert.deepEqual(
    { ...spec },
    {
      key: "PROJ-1",
      summary: "Fix login",
      descriptionText: "Users can sign in.",
      issueType: "Bug",
      updated: "2026-11-01T10:00:00.000+0000",
      specHash: SIGN_IN,
    },
  );
});

test("[happy-5] the result has exactly the six spec properties, even when fields carry extras", async () => {
  const fields = {
    summary: "Fix login",
    description: doc(para("Users can sign in.")),
    issuetype: { name: "Bug" },
    updated: "2026-11-01T10:00:00.000+0000",
    status: { name: "Open" },
    labels: ["a"],
  };
  const spec = await toIssueSpec("PROJ-1", fields);
  assert.deepEqual(Object.keys(spec).sort(), [
    "descriptionText",
    "issueType",
    "key",
    "specHash",
    "summary",
    "updated",
  ]);
});

test("[boundary-5] an ordinary key is returned as given", async () => {
  assert.equal((await toIssueSpec("PROJ-1", {})).key, "PROJ-1");
  assert.equal((await toIssueSpec("10001", {})).key, "10001");
});

test("[boundary-5] an empty or padded key is returned as given, not validated", async () => {
  assert.equal((await toIssueSpec("", {})).key, "");
  assert.equal((await toIssueSpec(" proj-1 ", {})).key, " proj-1 ");
});

test("[unhappy-2] a missing or null summary becomes an empty string", async () => {
  assert.equal((await toIssueSpec("PROJ-1", {})).summary, "");
  assert.equal((await toIssueSpec("PROJ-1", { summary: null })).summary, "");
});

test("[unhappy-2] a number or array summary becomes an empty string", async () => {
  assert.equal((await toIssueSpec("PROJ-1", { summary: 42 })).summary, "");
  assert.equal((await toIssueSpec("PROJ-1", { summary: ["Fix"] })).summary, "");
});

test("[boundary-6] a string summary is returned untrimmed, and only the hash sees it normalised", async () => {
  const spec = await toIssueSpec("PROJ-1", { summary: "  Fix login  " });
  assert.equal(spec.summary, "  Fix login  ");
  assert.equal(spec.specHash, SUMMARY_ONLY);
});

test("[boundary-6] a summary with a trailing CRLF is returned raw and hashes as the bare summary", async () => {
  const spec = await toIssueSpec("PROJ-1", { summary: "Fix login\r\n" });
  assert.equal(spec.summary, "Fix login\r\n");
  assert.equal(spec.specHash, SUMMARY_ONLY);
});

test("[unhappy-3] a missing or null issue type becomes Task", async () => {
  assert.equal((await toIssueSpec("PROJ-1", {})).issueType, "Task");
  assert.equal((await toIssueSpec("PROJ-1", { issuetype: null })).issueType, "Task");
});

test("[unhappy-3] an issue type with a missing, null or numeric name becomes Task", async () => {
  assert.equal((await toIssueSpec("PROJ-1", { issuetype: {} })).issueType, "Task");
  assert.equal((await toIssueSpec("PROJ-1", { issuetype: { name: null } })).issueType, "Task");
  assert.equal((await toIssueSpec("PROJ-1", { issuetype: { name: 3 } })).issueType, "Task");
});

test("[boundary-7] an empty-string issue type name is kept as it is", async () => {
  assert.equal((await toIssueSpec("PROJ-1", { issuetype: { name: "" } })).issueType, "");
});

test("[boundary-7] a whitespace-only issue type name is a string and is kept as it is", async () => {
  assert.equal((await toIssueSpec("PROJ-1", { issuetype: { name: "  " } })).issueType, "  ");
});

test("[unhappy-4] a missing or null updated becomes null", async () => {
  assert.equal((await toIssueSpec("PROJ-1", {})).updated, null);
  assert.equal((await toIssueSpec("PROJ-1", { updated: null })).updated, null);
});

test("[unhappy-4] a numeric updated becomes null", async () => {
  assert.equal((await toIssueSpec("PROJ-1", { updated: 1700000000000 })).updated, null);
});

test("[boundary-8] an ISO updated string is passed through", async () => {
  const spec = await toIssueSpec("PROJ-1", { updated: "2026-11-01T10:00:00.000+0000" });
  assert.equal(spec.updated, "2026-11-01T10:00:00.000+0000");
});

test("[boundary-8] a non-date or empty updated string is passed through without parsing", async () => {
  assert.equal((await toIssueSpec("PROJ-1", { updated: "not a date" })).updated, "not a date");
  assert.equal((await toIssueSpec("PROJ-1", { updated: "" })).updated, "");
});

test("[unhappy-5] empty fields give an empty spec", async () => {
  const spec = await toIssueSpec("PROJ-1", {});
  assert.deepEqual(
    { ...spec },
    {
      key: "PROJ-1",
      summary: "",
      descriptionText: "",
      issueType: "Task",
      updated: null,
      specHash: EMPTY,
    },
  );
});

test("[unhappy-5] fields whose keys are all explicitly undefined give the same empty spec", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: undefined,
    description: undefined,
    issuetype: undefined,
    updated: undefined,
  });
  assert.deepEqual(
    { ...spec },
    {
      key: "PROJ-1",
      summary: "",
      descriptionText: "",
      issueType: "Task",
      updated: null,
      specHash: EMPTY,
    },
  );
});

test("[unhappy-6] values of the wrong type everywhere still resolve with defaults", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: {},
    description: 42,
    issuetype: { name: [] },
    updated: false,
  });
  assert.equal(spec.summary, "");
  assert.equal(spec.descriptionText, "");
  assert.equal(spec.issueType, "Task");
  assert.equal(spec.updated, null);
});

test("[unhappy-6] other wrong types everywhere also resolve with defaults", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: true,
    description: false,
    issuetype: { name: {} },
    updated: {},
  });
  assert.equal(spec.summary, "");
  assert.equal(spec.descriptionText, "");
  assert.equal(spec.issueType, "Task");
  assert.equal(spec.updated, null);
  assert.equal(spec.specHash, EMPTY);
});

// --- specHash in the result ------------------------------------------------------

test("[happy-6] the result's hash matches a direct call on its own fields", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "Users  can sign in.",
  });
  assert.equal(spec.descriptionText, "Users can sign in.");
  assert.equal(spec.specHash, await specHash(spec.summary, spec.descriptionText));
  assert.equal(spec.specHash, SIGN_IN);
});

test("[happy-6] the result's hash matches a direct call on its raw, padded summary", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: "  Fix login  ",
    description: "Users can sign in.",
  });
  assert.equal(spec.summary, "  Fix login  ");
  assert.equal(spec.specHash, await specHash(spec.summary, spec.descriptionText));
  assert.equal(spec.specHash, SIGN_IN);
});

test("[happy-7] the same spec from a plain string and from ADF hashes the same", async () => {
  const fromString = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "Users can sign in.",
  });
  const fromAdf = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Users can sign in." }] }],
    },
  });
  assert.equal(fromString.specHash, SIGN_IN);
  assert.equal(fromAdf.specHash, SIGN_IN);
});

test("[happy-7] padding in the string and trailing spaces in the ADF text still hash the same", async () => {
  const fromString = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "  Users can sign in.  ",
  });
  const fromAdf = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: doc(para("Users can sign in.   ")),
  });
  assert.equal(fromString.specHash, SIGN_IN);
  assert.equal(fromAdf.specHash, SIGN_IN);
});

// --- descriptions that are not strings or ADF -----------------------------------

test("[unhappy-7] a missing or null description becomes an empty descriptionText", async () => {
  assert.equal((await toIssueSpec("PROJ-1", {})).descriptionText, "");
  assert.equal((await toIssueSpec("PROJ-1", { description: null })).descriptionText, "");
  assert.equal((await toIssueSpec("PROJ-1", { description: 42 })).descriptionText, "");
  assert.equal((await toIssueSpec("PROJ-1", { description: true })).descriptionText, "");
});

test("[unhappy-7] an array, an empty object or a doc without usable content becomes an empty descriptionText", async () => {
  assert.equal((await toIssueSpec("PROJ-1", { description: [] })).descriptionText, "");
  assert.equal((await toIssueSpec("PROJ-1", { description: {} })).descriptionText, "");
  assert.equal(
    (await toIssueSpec("PROJ-1", { description: { type: "doc" } })).descriptionText,
    "",
  );
  assert.equal(
    (await toIssueSpec("PROJ-1", { description: { type: "doc", content: "x" } })).descriptionText,
    "",
  );
});

// --- plain-string descriptions ---------------------------------------------------

test("[happy-8] plain-string descriptions have whitespace runs collapsed and keep line feeds", async () => {
  const cases: Array<[string, string]> = [
    ["Users can sign in.", "Users can sign in."],
    ["Users  can\tsign   in.", "Users can sign in."],
    ["  Users can sign in.  ", "Users can sign in."],
    ["Line one\nLine two", "Line one\nLine two"],
    ["Line one\n\nLine two", "Line one\n\nLine two"],
  ];
  for (const [description, expected] of cases) {
    const spec = await toIssueSpec("PROJ-1", { description });
    assert.equal(spec.descriptionText, expected, JSON.stringify(description));
  }
});

test("[happy-8] spaces around line feeds, CR, edge line feeds and blank strings are tidied", async () => {
  const cases: Array<[string, string]> = [
    ["Line one  \n  Line two", "Line one \n Line two"],
    ["Line one\r\nLine two", "Line one \nLine two"],
    ["\n  Line one\n", "Line one"],
    ["   ", ""],
    ["", ""],
  ];
  for (const [description, expected] of cases) {
    const spec = await toIssueSpec("PROJ-1", { description });
    assert.equal(spec.descriptionText, expected, JSON.stringify(description));
  }
});

// --- the cap -------------------------------------------------------------------------

test("[boundary-13] a string at the cap is kept, one over is truncated, and trailing spaces are tidied first", async () => {
  const exact = await toIssueSpec("PROJ-1", { description: "a".repeat(20000) });
  assert.equal(exact.descriptionText, "a".repeat(20000));

  const over = await toIssueSpec("PROJ-1", { description: "a".repeat(20001) });
  assert.equal(over.descriptionText, "a".repeat(20000) + TRUNCATED);

  const padded = await toIssueSpec("PROJ-1", { description: "a".repeat(20000) + "   " });
  assert.equal(padded.descriptionText, "a".repeat(20000));
});

test("[boundary-13] ADF text over the cap is truncated, counting the block separator", async () => {
  const one = await toIssueSpec("PROJ-1", { description: doc(para("b".repeat(25000))) });
  assert.equal(one.descriptionText, "b".repeat(20000) + TRUNCATED);

  const two = await toIssueSpec("PROJ-1", {
    description: doc(para("a".repeat(10000)), para("b".repeat(10000))),
  });
  assert.equal(
    two.descriptionText,
    "a".repeat(10000) + "\n\n" + "b".repeat(9998) + TRUNCATED,
  );
});

test("[boundary-14] the cap counts UTF-16 code units and may split a surrogate pair", async () => {
  const spec = await toIssueSpec("PROJ-1", { description: "a".repeat(19999) + "\u{1F600}" });
  assert.equal(spec.descriptionText, "a".repeat(19999) + "\uD83D" + TRUNCATED);
});

test("[boundary-14] a surrogate pair ending exactly at the cap is kept whole", async () => {
  const spec = await toIssueSpec("PROJ-1", { description: "a".repeat(19998) + "\u{1F600}" });
  assert.equal(spec.descriptionText, "a".repeat(19998) + "\u{1F600}");
});

test("[boundary-15] edits beyond the cap do not change the descriptionText or the hash", async () => {
  const one = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "a".repeat(20000) + "first ending",
  });
  const two = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "a".repeat(20000) + "second ending",
  });
  assert.equal(one.descriptionText, two.descriptionText);
  assert.equal(one.specHash, two.specHash);
});

test("[boundary-15] the hash is taken from the capped text, so an edit inside the cap does change it", async () => {
  const one = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "a".repeat(20000) + "ending",
  });
  const two = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: "a".repeat(19999) + "b" + "ending",
  });
  assert.equal(one.descriptionText, "a".repeat(20000) + TRUNCATED);
  assert.equal(one.specHash, await specHash("Fix login", "a".repeat(20000) + TRUNCATED));
  assert.notEqual(one.specHash, two.specHash);
});
