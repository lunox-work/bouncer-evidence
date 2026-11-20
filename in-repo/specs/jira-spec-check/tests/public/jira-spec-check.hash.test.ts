import assert from "node:assert/strict";
import { test } from "node:test";

import { ISSUE_FIELDS } from "../src/mapping.js";
import { SPEC_FIELDS, specHash, toIssueSpec } from "../src/spec.js";

/** Digests stated by the spec. */
const SIGN_IN = "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"; // "Fix login", "Users can sign in."
const SIGN_IN_BANG = "9ba38dc958e4a1832554dbc2936804134d46ac0f5f293418ae0d9254bf45dc5b"; // "Fix login", "Users can sign in!"
const TWO_LINES = "1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb"; // "Fix login", "Users can\nsign in."
const SUMMARY_ONLY = "84047eac0cb2f4449e8697ff60678c27258b6e6bd061b6ecde086731d22676be"; // "Fix login", ""
const DESCRIPTION_ONLY = "426a102db604005a62f8debd08c8f7e0acce47499320d961ced3d317e0a40880"; // "", "Fix login"
const EMPTY = "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d"; // "", ""

// --- SPEC_FIELDS and ISSUE_FIELDS -------------------------------------------

test("[happy-1] SPEC_FIELDS is summary, description, issuetype, updated", () => {
  assert.deepEqual([...SPEC_FIELDS], ["summary", "description", "issuetype", "updated"]);
});

test("[happy-1] SPEC_FIELDS has exactly four entries, with description second", () => {
  assert.equal(SPEC_FIELDS.length, 4);
  assert.equal(SPEC_FIELDS.indexOf("description"), 1);
});

test("[happy-2] ISSUE_FIELDS keeps its eleven fields in order", () => {
  assert.deepEqual(
    [...ISSUE_FIELDS],
    [
      "summary",
      "status",
      "assignee",
      "priority",
      "issuetype",
      "labels",
      "created",
      "updated",
      "duedate",
      "parent",
      "project",
    ],
  );
});

test("[happy-2] ISSUE_FIELDS still omits the description", () => {
  assert.equal(ISSUE_FIELDS.includes("description"), false);
});

// --- specHash digests ---------------------------------------------------------

test("[happy-3] known non-empty inputs give known digests", async () => {
  assert.equal(await specHash("Fix login", "Users can sign in."), SIGN_IN);
  assert.equal(await specHash("Fix login", "Users can sign in!"), SIGN_IN_BANG);
  assert.equal(await specHash("Fix login", "Users can\nsign in."), TWO_LINES);
});

test("[happy-3] known digests when one or both parts are empty", async () => {
  assert.equal(await specHash("Fix login", ""), SUMMARY_ONLY);
  assert.equal(await specHash("", "Fix login"), DESCRIPTION_ONLY);
  assert.equal(await specHash("", ""), EMPTY);
});

test("[boundary-1] the digest is 64 lowercase hex characters", async () => {
  assert.match(await specHash("Fix login", "Users can sign in."), /^[0-9a-f]{64}$/);
});

test("[boundary-1] the digest of two empty parts is still 64 lowercase hex characters", async () => {
  assert.match(await specHash("", ""), /^[0-9a-f]{64}$/);
});

test("[boundary-2] the separator keeps the summary from moving into the description", async () => {
  assert.notEqual(await specHash("Fix login", ""), await specHash("", "Fix login"));
});

test("[boundary-2] the separator keeps a split point from moving within the pair", async () => {
  assert.notEqual(await specHash("ab", "c"), await specHash("a", "bc"));
});

test("[happy-4] the same input gives the same digest on two calls", async () => {
  const first = await specHash("Fix login", "Users can sign in.");
  const second = await specHash("Fix login", "Users can sign in.");
  assert.equal(first, SIGN_IN);
  assert.equal(second, SIGN_IN);
});

test("[happy-4] a call on other input in between does not change the digest", async () => {
  const first = await specHash("Fix login", "Users can sign in.");
  await specHash("Something else", "entirely");
  const second = await specHash("Fix login", "Users can sign in.");
  assert.equal(first, SIGN_IN);
  assert.equal(second, SIGN_IN);
});

// --- normalisation before hashing --------------------------------------------

test("[boundary-3] outer whitespace on either part leaves the hash unchanged", async () => {
  assert.equal(await specHash("Fix login   ", "Users can sign in."), SIGN_IN);
  assert.equal(await specHash("  Fix login", "Users can sign in."), SIGN_IN);
  assert.equal(await specHash("Fix login", "\n\nUsers can sign in.\r\n\r\n"), SIGN_IN);
  assert.equal(await specHash("Fix login", "Users can sign in.\t "), SIGN_IN);
});

test("[boundary-3] CRLF, lone CR and trailing whitespace before a line feed leave the hash unchanged", async () => {
  assert.equal(await specHash("Fix login", "Users can\r\nsign in."), TWO_LINES);
  assert.equal(await specHash("Fix login", "Users can\rsign in."), TWO_LINES);
  assert.equal(await specHash("Fix login", "Users can  \t\nsign in."), TWO_LINES);
});

test("[unhappy-1] changes to words, case or internal spacing change the hash", async () => {
  assert.notEqual(await specHash("Fix  login", "Users can sign in."), SIGN_IN);
  assert.notEqual(await specHash("fix login", "Users can sign in."), SIGN_IN);
  assert.notEqual(await specHash("Fix login", "Users  can sign in."), SIGN_IN);
});

test("[unhappy-1] leading indentation and extra blank lines change the hash", async () => {
  assert.notEqual(await specHash("Fix login", "Users can\n  sign in."), TWO_LINES);
  assert.notEqual(await specHash("Fix login", "Users can\n\nsign in."), TWO_LINES);
});

test("[boundary-4] NFC and NFD spellings of the summary hash differently", async () => {
  const nfc = "café";
  const nfd = "café";
  assert.notEqual(await specHash(nfc, ""), await specHash(nfd, ""));
});

test("[boundary-4] NFC and NFD spellings of the description hash differently", async () => {
  const nfc = "café";
  const nfd = "café";
  assert.notEqual(await specHash("", nfc), await specHash("", nfd));
});

// --- concurrency ---------------------------------------------------------------

test("[concurrency-1] overlapping specHash calls each resolve to their own digest", async () => {
  const results = await Promise.all([
    specHash("Fix login", "Users can sign in."),
    specHash("Fix login", "Users can sign in!"),
  ]);
  assert.deepEqual(results, [SIGN_IN, SIGN_IN_BANG]);
});

test("[concurrency-1] many interleaved specHash calls each resolve to their own digest", async () => {
  const inputs: Array<[string, string, string]> = [];
  for (let i = 0; i < 10; i++) {
    inputs.push(
      i % 2 === 0
        ? ["Fix login", "Users can sign in.", SIGN_IN]
        : ["", "", EMPTY],
    );
  }
  const results = await Promise.all(inputs.map(([s, d]) => specHash(s, d)));
  assert.deepEqual(
    results,
    inputs.map(([, , digest]) => digest),
  );
});

test("[concurrency-2] overlapping toIssueSpec calls do not mix their fields", async () => {
  const [first, second] = await Promise.all([
    toIssueSpec("PROJ-1", { summary: "Fix login", description: "Users can sign in." }),
    toIssueSpec("PROJ-2", {}),
  ]);
  assert.equal(first.key, "PROJ-1");
  assert.equal(first.summary, "Fix login");
  assert.equal(first.specHash, SIGN_IN);
  assert.equal(second.key, "PROJ-2");
  assert.equal(second.summary, "");
  assert.equal(second.specHash, EMPTY);
});

test("[concurrency-2] overlapping toIssueSpec calls leave both fields objects unmodified", async () => {
  const adf = {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text: "Users can sign in." }] }],
  };
  const fieldsOne = { summary: "Fix login", description: adf, issuetype: { name: "Bug" } };
  const fieldsTwo = {};
  const before = structuredClone(fieldsOne);
  const [first, second] = await Promise.all([
    toIssueSpec("PROJ-1", fieldsOne),
    toIssueSpec("PROJ-2", fieldsTwo),
  ]);
  assert.deepEqual(fieldsOne, before);
  assert.deepEqual(fieldsTwo, {});
  assert.equal(first.specHash, SIGN_IN);
  assert.equal(second.specHash, EMPTY);
});
