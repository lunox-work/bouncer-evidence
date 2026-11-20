import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_ISSUE_TYPE,
  TICKET_LIMITS,
  TICKET_ORIGINS,
  TICKET_SPEC_HASH_VERSION,
  type TicketContent,
  clampTicketTitle,
  normalizeSpecText,
  ticketKey,
  ticketSpecHash,
} from "../src/ticket.js";

/**
 * The native ticket rules: origins, limits, title clamping, the spec
 * fingerprint and the key a ticket is shown under, defined once in
 * `packages/core/src/ticket.ts`.
 */

const STORY_HASH =
  "412c518dd58be9028f3217a5290f893d8af0077953903a8ccaf6f2fb79f853ea";
const BUG_HASH =
  "7eb97fbde6a96dc9fc204b244410d928f6403c3ffd663240b97f1fb63efda9d7";
const HIGH = "\uD83D";
const EMOJI = "😀";

// ---------------------------------------------------------------- constants

test("[happy-1] TICKET_ORIGINS is manual then jira, DEFAULT_ISSUE_TYPE is Task, hash version is 1", () => {
  assert.deepEqual(TICKET_ORIGINS, ["manual", "jira"]);
  assert.equal(DEFAULT_ISSUE_TYPE, "Task");
  assert.equal(TICKET_SPEC_HASH_VERSION, 1);
});

test("[happy-1] the constants have exactly these values and types, with no extra origins", () => {
  assert.equal(TICKET_ORIGINS.length, 2);
  assert.equal(TICKET_ORIGINS[0], "manual");
  assert.equal(TICKET_ORIGINS[1], "jira");
  assert.equal(typeof TICKET_SPEC_HASH_VERSION, "number");
  assert.notEqual(DEFAULT_ISSUE_TYPE, "task");
});

test("[happy-2] TICKET_LIMITS deep-equals the six documented limits", () => {
  assert.deepEqual(TICKET_LIMITS, {
    title: 255,
    description: 20000,
    issueType: 64,
    priority: 64,
    labels: 20,
    label: 64,
  });
});

test("[happy-2] TICKET_LIMITS has exactly six keys and no limit for components", () => {
  assert.deepEqual(Object.keys(TICKET_LIMITS).sort(), [
    "description",
    "issueType",
    "label",
    "labels",
    "priority",
    "title",
  ]);
  assert.equal(Object.hasOwn(TICKET_LIMITS, "components"), false);
  assert.equal(TICKET_LIMITS.labels, 20);
  assert.equal(TICKET_LIMITS.label, 64);
});

// ---------------------------------------------------------- clampTicketTitle

test("[happy-3] ordinary, empty and whitespace-padded titles are returned exactly as given", () => {
  for (const title of [
    "Add CSV export",
    "",
    "  Add CSV export  ",
    "Add   CSV\texport",
  ]) {
    assert.equal(clampTicketTitle(title), title, JSON.stringify(title));
  }
});

test("[happy-3] a title exactly at 255 code units, including one ending in a complete pair, is kept", () => {
  const plain = "a".repeat(255);
  assert.equal(clampTicketTitle(plain), plain);
  const withPair = "a".repeat(253) + EMOJI;
  assert.equal(withPair.length, 255);
  assert.equal(clampTicketTitle(withPair), withPair);
});

test("[boundary-1] a trailing lone high surrogate is dropped from a title that fits", () => {
  assert.equal(clampTicketTitle("a".repeat(254) + HIGH), "a".repeat(254));
  assert.equal(clampTicketTitle("ab" + HIGH), "ab");
});

test("[boundary-1] a title that is only a lone high surrogate becomes empty", () => {
  assert.equal(clampTicketTitle(HIGH), "");
});

test("[boundary-2] a title of 256 code units is cut to the first 255", () => {
  const result = clampTicketTitle("a".repeat(256));
  assert.equal(result, "a".repeat(255));
  assert.equal(result.length, 255);
});

test("[boundary-2] a long cut keeps leading and trailing whitespace and complete pairs", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["a".repeat(300), "a".repeat(255)],
    [" ".repeat(10) + "a".repeat(300), " ".repeat(10) + "a".repeat(245)],
    ["a".repeat(254) + "  b", "a".repeat(254) + " "],
    ["a".repeat(253) + EMOJI + "b", "a".repeat(253) + EMOJI],
  ];
  for (const [title, expected] of cases) {
    const result = clampTicketTitle(title);
    assert.equal(result, expected);
    assert.equal(result.length, 255);
  }
});

test("[boundary-3] a cut that would split a surrogate pair drops the lone high surrogate", () => {
  const title = "a".repeat(254) + EMOJI;
  assert.equal(title.length, 256);
  const result = clampTicketTitle(title);
  assert.equal(result, "a".repeat(254));
  assert.equal(result.length, 254);
});

test("[boundary-3] the split-pair cut appends no ellipsis or other text", () => {
  const result = clampTicketTitle("a".repeat(254) + EMOJI);
  assert.equal(result.endsWith("…"), false);
  assert.equal(result.endsWith("..."), false);
  assert.equal(/^a*$/.test(result), true);
});

// --------------------------------------------------------- normalizeSpecText

test("[happy-4] line endings become LF and trailing spaces and tabs per line are removed", () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["Adds CSV.", "Adds CSV."],
    ["a\r\nb", "a\nb"],
    ["a\rb", "a\nb"],
    ["a  \nb\t", "a\nb"],
    ["  a  \r\n  b\t\r\r\nc  ", "a\n  b\n\nc"],
    ["\n\n  Title\n\n", "Title"],
  ];
  for (const [input, output] of cases) {
    assert.equal(normalizeSpecText(input), output, JSON.stringify(input));
  }
});

test("[happy-4] inner blank lines, inner spaces, case and Unicode forms are kept", () => {
  const cases: ReadonlyArray<string> = [
    "a\n\n\nb",
    "a    b",
    "Title",
    "Café",
    "Café",
  ];
  for (const input of cases) {
    assert.equal(normalizeSpecText(input), input, JSON.stringify(input));
  }
});

test("[boundary-4] empty text normalizes to the empty string", () => {
  assert.equal(normalizeSpecText(""), "");
});

test("[boundary-4] blank text of spaces, tabs and line endings normalizes to the empty string", () => {
  assert.equal(normalizeSpecText("   "), "");
  assert.equal(normalizeSpecText("\r\n\t\n "), "");
});

test("[boundary-5] normalizing the normalized text gives the same result", () => {
  const text = "  a  \r\n  b\t\r\r\nc  ";
  assert.equal(normalizeSpecText(normalizeSpecText(text)), "a\n  b\n\nc");
});

test("[boundary-5] normalizing is idempotent for already-trimmed and blank-line text", () => {
  for (const text of ["\n\n  Title\n\n", "a\r\n\r\n\r\nb  ", "   "]) {
    const once = normalizeSpecText(text);
    assert.equal(normalizeSpecText(once), once, JSON.stringify(text));
  }
});

// ------------------------------------------------------------ ticketSpecHash

test("[happy-5] ticketSpecHash returns the known fingerprint for title, description and type", async () => {
  assert.equal(
    await ticketSpecHash("Title", "Description", "Story"),
    STORY_HASH,
  );
  assert.equal(await ticketSpecHash("Title", "Description", "Bug"), BUG_HASH);
  assert.equal(
    await ticketSpecHash("Add export", "Adds CSV.", "Story"),
    "3b83fc961d8b052c4ebb2269255f29a3e901b27eb21f7452ea5f9ac5c5d77444",
  );
});

test("[happy-5] known fingerprints for single-letter fields and an empty description", async () => {
  assert.equal(
    await ticketSpecHash("A", "B", "Task"),
    "94df515b9e448e7e65fc04e923fd2407d34b2b4b0176f7b9dd5695d858c83cd1",
  );
  assert.equal(
    await ticketSpecHash("AB", "", "Task"),
    "478479f083fafe1c06010d88cf8b7eef432a9f2636bee89865269585ae1244ee",
  );
});

test("[happy-6] trailing whitespace and CRLF do not change the fingerprint", async () => {
  assert.equal(
    await ticketSpecHash("Title  ", "Description\r\n", "Story"),
    STORY_HASH,
  );
});

test("[happy-6] a noisy spec hashes equal to its clean form in every field", async () => {
  const clean = await ticketSpecHash("Title", "Description", "Story");
  assert.equal(
    await ticketSpecHash("Title  ", "Description\r\n", "Story"),
    clean,
  );
  assert.equal(
    await ticketSpecHash("\n Title\t", "\r\nDescription  \r", " Story \n"),
    clean,
  );
});

test("[happy-7] a lowercased issue type gives its own fingerprint", async () => {
  const lower = await ticketSpecHash("Title", "Description", "story");
  assert.equal(
    lower,
    "bb94137540cd9b69a86b24148004fd4c6568d336f7fb439cb04bce579c8c036d",
  );
  assert.notEqual(lower, STORY_HASH);
});

test("[happy-7] changing the case of the title or description changes the fingerprint", async () => {
  assert.notEqual(
    await ticketSpecHash("title", "Description", "Story"),
    STORY_HASH,
  );
  assert.notEqual(
    await ticketSpecHash("Title", "description", "Story"),
    STORY_HASH,
  );
});

test("[happy-8] tickets differing only in priority, labels, components and truncation share a fingerprint", async () => {
  const rich: TicketContent = {
    title: "Title",
    description: "Description",
    issueType: "Story",
    priority: "High",
    labels: ["a"],
    components: ["api"],
    inputTruncated: true,
  };
  const bare: TicketContent = {
    title: "Title",
    description: "Description",
    issueType: "Story",
    priority: null,
    labels: [],
    components: [],
    inputTruncated: false,
  };
  for (const content of [rich, bare]) {
    assert.equal(
      await ticketSpecHash(content.title, content.description, content.issueType),
      STORY_HASH,
    );
  }
});

test("[happy-8] a ticket at the label count limit still hashes on its three spec fields only", async () => {
  const content: TicketContent = {
    title: "Title",
    description: "Description",
    issueType: "Story",
    priority: "x".repeat(TICKET_LIMITS.priority),
    labels: Array.from({ length: TICKET_LIMITS.labels }, (_, i) => `l${i}`),
    components: ["api", "web", "db"],
    inputTruncated: true,
  };
  assert.equal(
    await ticketSpecHash(content.title, content.description, content.issueType),
    STORY_HASH,
  );
});

test("[boundary-6] moving text from description into title changes the fingerprint", async () => {
  assert.notEqual(
    await ticketSpecHash("A", "B", "Task"),
    await ticketSpecHash("AB", "", "Task"),
  );
});

test("[boundary-6] a title that looks like a JSON field separator does not collide", async () => {
  assert.notEqual(
    await ticketSpecHash('A","B', "", "Task"),
    await ticketSpecHash("A", "B", "Task"),
  );
});

test("[boundary-7] all-empty fields hash to the known fingerprint", async () => {
  assert.equal(
    await ticketSpecHash("", "", ""),
    "799c55d702efedb7750db18b36386fc3a3f4be7dddcfb649adeb41a3ed0da228",
  );
});

test("[boundary-7] an empty issue type does not reject and is not replaced by the default", async () => {
  const empty = ticketSpecHash("", "", "");
  await assert.doesNotReject(empty);
  assert.notEqual(await empty, await ticketSpecHash("", "", DEFAULT_ISSUE_TYPE));
  assert.notEqual(await empty, await ticketSpecHash("", "", "Task"));
});

test("[boundary-8] a Unicode and emoji spec hashes to 64 lowercase hex characters", async () => {
  assert.match(
    await ticketSpecHash("Ünïcødé 😀", "line\nline", DEFAULT_ISSUE_TYPE),
    /^[0-9a-f]{64}$/,
  );
});

test("[boundary-8] empty, blank and long specs also hash to 64 lowercase hex characters", async () => {
  for (const [t, d, i] of [
    ["", "", ""],
    ["  ", "\r\n", "\t"],
    ["T".repeat(TICKET_LIMITS.title), "D".repeat(TICKET_LIMITS.description), "I".repeat(TICKET_LIMITS.issueType)],
  ] as const) {
    assert.match(await ticketSpecHash(t, d, i), /^[0-9a-f]{64}$/);
  }
});

test("[concurrency-1] three overlapping calls resolve to their own hashes in call order", async () => {
  const results = await Promise.all([
    ticketSpecHash("Title", "Description", "Story"),
    ticketSpecHash("Title", "Description", "Bug"),
    ticketSpecHash("Title", "Description", "Story"),
  ]);
  assert.deepEqual(results, [STORY_HASH, BUG_HASH, STORY_HASH]);
});

test("[concurrency-1] many interleaved overlapping calls each resolve to their own input's hash", async () => {
  const types = Array.from({ length: 20 }, (_, i) =>
    i % 2 === 0 ? "Story" : "Bug",
  );
  const results = await Promise.all(
    types.map((type) => ticketSpecHash("Title", "Description", type)),
  );
  assert.deepEqual(
    results,
    types.map((type) => (type === "Story" ? STORY_HASH : BUG_HASH)),
  );
});

// ------------------------------------------------------------------ ticketKey

test("[happy-9] a native ticket is keyed T-<number> and a Jira ticket by its jiraKey", () => {
  assert.equal(ticketKey({ number: 12 }), "T-12");
  assert.equal(ticketKey({ number: 12, jiraKey: "PROJ-7" }), "PROJ-7");
});

test("[happy-9] a null or undefined jiraKey falls back to T-<number>, for one and four digits", () => {
  assert.equal(ticketKey({ number: 12, jiraKey: undefined }), "T-12");
  assert.equal(ticketKey({ number: 12, jiraKey: null }), "T-12");
  assert.equal(ticketKey({ number: 1 }), "T-1");
  assert.equal(ticketKey({ number: 1000 }), "T-1000");
});

test("[boundary-9] an empty jiraKey is returned as the key", () => {
  assert.equal(ticketKey({ number: 12, jiraKey: "" }), "");
});

test("[boundary-9] a blank jiraKey is returned as given, untrimmed", () => {
  assert.equal(ticketKey({ number: 12, jiraKey: "  " }), "  ");
});

test("[boundary-10] small numbers are formatted without padding", () => {
  assert.equal(ticketKey({ number: 0 }), "T-0");
  assert.equal(ticketKey({ number: 7 }), "T-7");
});

test("[boundary-10] negative and fractional numbers are formatted without validation", () => {
  assert.doesNotThrow(() => ticketKey({ number: -3 }));
  assert.equal(ticketKey({ number: -3 }), "T--3");
  assert.doesNotThrow(() => ticketKey({ number: 2.5 }));
  assert.equal(ticketKey({ number: 2.5 }), "T-2.5");
});
