import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import { ISSUE_FIELDS } from "../../src/mapping.js";
import { SPEC_FIELDS, specHash, toIssueSpec } from "../../src/spec.js";

const SIGN_IN = "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"; // "Fix login", "Users can sign in."
const SIGN_IN_BANG = "9ba38dc958e4a1832554dbc2936804134d46ac0f5f293418ae0d9254bf45dc5b"; // "Fix login", "Users can sign in!"
const TWO_LINES = "1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb"; // "Fix login", "Users can\nsign in."
const SUMMARY_ONLY = "84047eac0cb2f4449e8697ff60678c27258b6e6bd061b6ecde086731d22676be"; // "Fix login", ""
const DESCRIPTION_ONLY = "426a102db604005a62f8debd08c8f7e0acce47499320d961ced3d317e0a40880"; // "", "Fix login"
const EMPTY = "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d"; // "", ""

/**
 * The digest the spec defines for two parts that are already normalised:
 * lowercase hex SHA-256 of summary, U+0000 and description, as UTF-8.
 */
function sha(summary: string, description: string): string {
  return createHash("sha256").update(summary + "\u0000" + description, "utf8").digest("hex");
}

/** A raw issue's fields, with more than a spec read needs. */
function fullFields(): Record<string, unknown> {
  return {
    summary: "Fix login",
    description: {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Users can sign in." }] }],
    },
    issuetype: { name: "Bug" },
    updated: "2026-11-01T10:00:00.000+0000",
    status: { name: "Open", statusCategory: { key: "new" } },
    assignee: { displayName: "Ada" },
    priority: { name: "High" },
    labels: ["auth"],
    created: "2026-10-01T10:00:00.000+0000",
    duedate: "2026-12-01",
    parent: { key: "PROJ-0" },
    project: { key: "PROJ" },
  };
}

function pick(source: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in source) out[k] = source[k];
  }
  return out;
}

// --- SPEC_FIELDS and ISSUE_FIELDS -------------------------------------------

// Extends "[happy-1] SPEC_FIELDS is summary, description, issuetype, updated":
// the four listed fields are all a spec needs, so a read of only them gives the full spec.
test("[happy-1] fields restricted to SPEC_FIELDS give the same spec as the full raw fields", async () => {
  assert.deepEqual([...SPEC_FIELDS], ["summary", "description", "issuetype", "updated"]);
  const raw = fullFields();
  const full = await toIssueSpec("PROJ-1", raw);
  const requested = await toIssueSpec("PROJ-1", pick(raw, SPEC_FIELDS));
  assert.deepEqual({ ...requested }, { ...full });
  assert.deepEqual(
    { ...requested },
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

// Extends "[happy-2] ISSUE_FIELDS still omits the description":
// fields restricted to ISSUE_FIELDS carry no description, so the spec built from them has none.
test("[happy-2] fields restricted to ISSUE_FIELDS carry no description into a spec", async () => {
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
  assert.equal(ISSUE_FIELDS.includes("description"), false);
  const spec = await toIssueSpec("PROJ-1", pick(fullFields(), ISSUE_FIELDS));
  assert.equal(spec.summary, "Fix login");
  assert.equal(spec.descriptionText, "");
  assert.equal(spec.issueType, "Bug");
  assert.equal(spec.specHash, SUMMARY_ONLY);
});

// --- specHash digests ---------------------------------------------------------

// Extends "[happy-3] known non-empty inputs give known digests": inputs outside the
// table, so a lookup of the six stated digests is not enough.
test("[happy-3] other ASCII inputs give the SHA-256 of summary, NUL and description", async () => {
  const cases: Array<[string, string]> = [
    ["Fix logout", "Users can sign out."],
    ["Add SSO", "Support SAML.\nSupport OIDC."],
    ["a", "b"],
    ["Fix login", "Users can sign in"],
    ["PROJ-1", "x".repeat(5000)],
  ];
  for (const [summary, description] of cases) {
    assert.equal(await specHash(summary, description), sha(summary, description), JSON.stringify([summary, description]));
  }
});

// Extends "[happy-3] known non-empty inputs give known digests": non-ASCII text must be
// hashed as UTF-8, not Latin-1 or UTF-16.
test("[happy-3] non-ASCII text is hashed as UTF-8", async () => {
  const cases: Array<[string, string]> = [
    ["Corrigir login", "Usuários podem entrar."],
    ["ログイン修正", "ユーザーはサインインできます。"],
    ["Ship 🚀", "Party 🎉 time"],
    ["", "naïve café"],
  ];
  for (const [summary, description] of cases) {
    assert.equal(await specHash(summary, description), sha(summary, description), JSON.stringify([summary, description]));
  }
  assert.notEqual(
    await specHash("Ship 🚀", ""),
    createHash("sha256").update("Ship 🚀\u0000", "utf16le").digest("hex"),
  );
});

// Extends "[happy-3] known digests when one or both parts are empty": the separator is a
// single U+0000, so the empty-part digests are the hash of the other part plus or after NUL.
test("[happy-3] an empty part hashes as the other part joined by a lone NUL", async () => {
  assert.equal(await specHash("Add SSO", ""), createHash("sha256").update("Add SSO\u0000").digest("hex"));
  assert.equal(await specHash("", "Add SSO"), createHash("sha256").update("\u0000Add SSO").digest("hex"));
  assert.equal(await specHash("", ""), createHash("sha256").update("\u0000").digest("hex"));
});

// Extends "[boundary-1] the digest is 64 lowercase hex characters": non-ASCII, long and
// many different inputs all give 64 lowercase hex characters.
test("[boundary-1] digests of non-ASCII, long and varied inputs are 64 lowercase hex characters", async () => {
  const inputs: Array<[string, string]> = [
    ["ÉCRAN", "ÜBER"],
    ["😀", "😀"],
    ["x".repeat(30000), "y".repeat(30000)],
    ["UPPER CASE", "MIXED Case"],
  ];
  for (let i = 0; i < 20; i++) inputs.push([`Summary ${i}`, `Body ${i}`]);
  for (const [summary, description] of inputs) {
    const digest = await specHash(summary, description);
    assert.match(digest, /^[0-9a-f]{64}$/);
  }
});

// Extends "[boundary-2] the separator keeps a split point from moving within the pair":
// a space or line-feed separator would let these pairs collide.
test("[boundary-2] a split point moving across a space or line feed changes the digest", async () => {
  assert.notEqual(await specHash("a b", "c"), await specHash("a", "b c"));
  assert.notEqual(await specHash("a\nb", "c"), await specHash("a", "b\nc"));
  assert.notEqual(await specHash("Fix", "login"), await specHash("Fix login", ""));
  assert.notEqual(await specHash("Fix", "login"), await specHash("", "Fix login"));
  assert.equal(await specHash("a b", "c"), sha("a b", "c"));
  assert.equal(await specHash("a", "b c"), sha("a", "b c"));
});

// Extends "[boundary-2] the separator keeps the summary from moving into the description".
test("[boundary-2] summary-only and description-only digests are the stated ones and differ", async () => {
  const summaryOnly = await specHash("Fix login", "");
  const descriptionOnly = await specHash("", "Fix login");
  assert.equal(summaryOnly, SUMMARY_ONLY);
  assert.equal(descriptionOnly, DESCRIPTION_ONLY);
  assert.notEqual(summaryOnly, descriptionOnly);
});

// Extends "[happy-4] a call on other input in between does not change the digest":
// a cache keyed on only one part would return a stale digest here.
test("[happy-4] repeated calls interleaved with calls sharing one part keep their digests", async () => {
  for (let round = 0; round < 3; round++) {
    assert.equal(await specHash("Fix login", "Users can sign in."), SIGN_IN);
    assert.equal(await specHash("Fix login", "Users can sign in!"), SIGN_IN_BANG);
    assert.equal(await specHash("Fix login", ""), SUMMARY_ONLY);
    assert.equal(await specHash("", "Fix login"), DESCRIPTION_ONLY);
    assert.equal(await specHash("Fix login", "Users can\nsign in."), TWO_LINES);
  }
});

// --- normalisation before hashing --------------------------------------------

// Extends "[boundary-3] CRLF, lone CR and trailing whitespace before a line feed leave
// the hash unchanged": the same rules on the summary, and on many lines at once.
test("[boundary-3] line endings and trailing whitespace on every line of the summary are normalised", async () => {
  const expected = sha("Fix\nlogin", "");
  assert.equal(await specHash("Fix\r\nlogin", ""), expected);
  assert.equal(await specHash("Fix\rlogin", ""), expected);
  assert.equal(await specHash("Fix \t\nlogin", ""), expected);
  assert.equal(await specHash("Fix  \r\nlogin  \r\n", ""), expected);
  assert.equal(await specHash("\r\n  Fix\nlogin\t", ""), expected);
});

// Extends "[boundary-3] CRLF, lone CR and trailing whitespace before a line feed leave
// the hash unchanged": several lines, each with a different ending and trailing whitespace.
test("[boundary-3] a multi-line description with mixed endings and trailing whitespace hashes as its clean form", async () => {
  const clean = "One\nTwo\n\nThree\n  Four";
  const messy = "  \r\nOne \t\r\nTwo\r\r\nThree   \n  Four\t\t\r\n\r\n";
  assert.equal(await specHash("Fix login", messy), sha("Fix login", clean));
  assert.equal(await specHash(" Fix login\t", messy), sha("Fix login", clean));
});

// Extends "[boundary-3] outer whitespace on either part leaves the hash unchanged".
test("[boundary-3] outer whitespace on both parts at once leaves the hash unchanged", async () => {
  assert.equal(await specHash("\t Fix login \r\n", "\r\n\tUsers can sign in. \n\n"), SIGN_IN);
  assert.equal(await specHash("   ", "\n\t\r\n "), EMPTY);
  assert.equal(await specHash("Fix login\n\n\n", "   "), SUMMARY_ONLY);
});

// Extends "[unhappy-1] changes to words, case or internal spacing change the hash":
// the changed inputs hash to exactly their own digests, so nothing is collapsed or folded.
test("[unhappy-1] internal tabs, case and spacing are hashed as written", async () => {
  const cases: Array<[string, string]> = [
    ["Fix\tlogin", "Users can sign in."],
    ["FIX LOGIN", "Users can sign in."],
    ["Fix login", "Users\tcan sign in."],
    ["Fix login", "users can sign in."],
    ["Fix login", "Users can sign  in."],
  ];
  for (const [summary, description] of cases) {
    const digest = await specHash(summary, description);
    assert.notEqual(digest, SIGN_IN, JSON.stringify([summary, description]));
    assert.equal(digest, sha(summary, description), JSON.stringify([summary, description]));
  }
});

// Extends "[unhappy-1] leading indentation and extra blank lines change the hash":
// in the summary too, with more blank lines and deeper indentation.
test("[unhappy-1] indentation and blank-line counts in either part are kept in the hash", async () => {
  assert.equal(await specHash("Fix login", "Users can\n\n\nsign in."), sha("Fix login", "Users can\n\n\nsign in."));
  assert.notEqual(
    await specHash("Fix login", "Users can\n\n\nsign in."),
    await specHash("Fix login", "Users can\n\nsign in."),
  );
  assert.equal(await specHash("Fix login", "Users can\n\tsign in."), sha("Fix login", "Users can\n\tsign in."));
  assert.equal(await specHash("Fix\n  login", ""), sha("Fix\n  login", ""));
  assert.notEqual(await specHash("Fix\n  login", ""), await specHash("Fix\nlogin", ""));
  assert.notEqual(await specHash("Fix\n\nlogin", ""), await specHash("Fix\nlogin", ""));
});

// Extends "[boundary-4] NFC and NFD spellings of the summary hash differently": each
// spelling hashes to the digest of its own code points.
test("[boundary-4] NFC and NFD spellings each hash to the digest of their own code units", async () => {
  const nfc = "café";
  const nfd = "café";
  assert.equal(await specHash(nfc, ""), sha(nfc, ""));
  assert.equal(await specHash(nfd, ""), sha(nfd, ""));
  const nfcN = "España";
  const nfdN = "España";
  assert.equal(await specHash("", nfdN), sha("", nfdN));
  assert.notEqual(await specHash("", nfcN), await specHash("", nfdN));
});

// Extends "[boundary-4]": compatibility forms (NFKC) are not folded either.
test("[boundary-4] compatibility characters are not folded before hashing", async () => {
  assert.notEqual(await specHash("ﬁx login", ""), await specHash("fix login", ""));
  assert.equal(await specHash("ﬁx login", ""), sha("ﬁx login", ""));
  assert.notEqual(await specHash("Å", ""), await specHash("Å", ""));
});

// --- concurrency ---------------------------------------------------------------

// Extends "[concurrency-1] many interleaved specHash calls each resolve to their own
// digest": many distinct inputs, so shared state between calls shows up as a wrong digest.
test("[concurrency-1] many distinct overlapping specHash calls each resolve to their own digest in order", async () => {
  const inputs: Array<[string, string]> = [];
  for (let i = 0; i < 40; i++) {
    inputs.push([`Summary ${i}`, i % 3 === 0 ? "" : `Line ${i}\n${"z".repeat(i * 100)}`]);
  }
  const results = await Promise.all(inputs.map(([s, d]) => specHash(s, d)));
  assert.deepEqual(
    results,
    inputs.map(([s, d]) => sha(s, d)),
  );
});

// Extends "[concurrency-1] overlapping specHash calls": a long input started first must not
// resolve to or delay into the short one's digest.
test("[concurrency-1] a long and a short call started together resolve to their own digests", async () => {
  const long = "w".repeat(200000);
  const results = await Promise.all([
    specHash("Fix login", long),
    specHash("Fix login", "Users can sign in!"),
    specHash("Fix login", "Users can sign in."),
  ]);
  assert.deepEqual(results, [sha("Fix login", long), SIGN_IN_BANG, SIGN_IN]);
});
