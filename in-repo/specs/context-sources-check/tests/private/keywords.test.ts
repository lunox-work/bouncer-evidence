import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTEXT_DOCUMENT_BYTES_MAX,
  CONTEXT_DOCUMENT_CHARS,
  CONTEXT_DOCUMENTS_MAX,
  CONTEXT_SOURCES,
  CONTEXT_TOTAL_CHARS,
  NO_CONTEXT,
  contextDocuments,
  contextDrift,
  contextKeywords,
  keptDocuments,
} from "../../src/sources.js";

// Extends "[happy-1] the constants hold the decided values": the constants
// are the ones the functions apply, not just declared values.
test("[happy-1] CONTEXT_DOCUMENTS_MAX is the number of paths contextDocuments keeps", () => {
  assert.equal(CONTEXT_DOCUMENTS_MAX, 12);
  const docs = Array.from({ length: 20 }, (_, i) => ({
    path: `docs/n${String(i).padStart(2, "0")}.md`,
    size: 10,
  }));
  const result = contextDocuments(docs);
  assert.equal(result.paths.length, CONTEXT_DOCUMENTS_MAX);
  assert.equal(result.omitted, 20 - CONTEXT_DOCUMENTS_MAX);
});

test("[happy-1] CONTEXT_DOCUMENT_BYTES_MAX is the largest candidate size", () => {
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 262144);
  assert.deepEqual(
    contextDocuments([
      { path: "docs/at.md", size: CONTEXT_DOCUMENT_BYTES_MAX },
      { path: "docs/over.md", size: CONTEXT_DOCUMENT_BYTES_MAX + 1 },
    ]),
    { paths: ["docs/at.md"], omitted: 0 },
  );
});

test("[happy-1] CONTEXT_DOCUMENT_CHARS and CONTEXT_TOTAL_CHARS are the caps keptDocuments applies", () => {
  assert.equal(CONTEXT_DOCUMENT_CHARS, 12000);
  assert.equal(CONTEXT_TOTAL_CHARS, 48000);
  const result = keptDocuments(
    Array.from({ length: 6 }, (_, i) => ({
      path: `d${i}.md`,
      bytes: 20000,
      text: "x".repeat(20000),
    })),
  );
  assert.ok(
    result.documents.every((d) => d.text.length === CONTEXT_DOCUMENT_CHARS),
  );
  assert.equal(
    result.documents.reduce((sum, d) => sum + d.text.length, 0),
    CONTEXT_TOTAL_CHARS,
  );
  assert.equal(result.omitted, 2);
});

test("[happy-1] CONTEXT_SOURCES and NO_CONTEXT name the sources contextDrift judges", () => {
  assert.deepEqual([...CONTEXT_SOURCES], ["jira", "github"]);
  const drift = contextDrift({ jira: 1, github: 1 }, NO_CONTEXT);
  for (const source of CONTEXT_SOURCES)
    assert.deepEqual(drift[source], { uses: null, current: 1 }, source);
  assert.deepEqual(NO_CONTEXT, { jira: null, github: null });
});

// Extends "[happy-2] keywords are drawn from a title": more words, later
// repeats, digits, and every kind of separator.
test("[happy-2] later repeats are dropped and first-seen order is kept across a long title", () => {
  assert.deepEqual(
    contextKeywords("beta Alpha BETA gamma alpha delta Gamma epsilon beta"),
    ["beta", "alpha", "gamma", "delta", "epsilon"],
  );
});

test("[happy-2] long words and digit runs are kept, there is no upper length", () => {
  assert.deepEqual(
    contextKeywords("Refactor internationalization layer 12345 123 x9y8 v2.0.1"),
    ["refactor", "internationalization", "layer", "12345", "x9y8"],
  );
});

test("[happy-2] common words are kept, there is no stopword list", () => {
  assert.deepEqual(contextKeywords("that with from have been they"), [
    "that",
    "with",
    "from",
    "have",
    "been",
    "they",
  ]);
});

test("[happy-2] every punctuation and whitespace character separates", () => {
  assert.deepEqual(
    contextKeywords("path/to:file.name\tnext\nline,comma;semi(paren)[brak]{brace}+plus@home#hash"),
    [
      "path",
      "file",
      "name",
      "next",
      "line",
      "comma",
      "semi",
      "paren",
      "brak",
      "brace",
      "plus",
      "home",
      "hash",
    ],
  );
});

test("[happy-2] underscores, hyphens and accented letters split words", () => {
  assert.deepEqual(contextKeywords("snake_case_name x-ray-vision"), [
    "snake",
    "case",
    "name",
    "vision",
  ]);
  // "naïve" and "résumé" break into pieces shorter than four.
  assert.deepEqual(contextKeywords("naïve résumé tests"), ["tests"]);
  assert.deepEqual(contextKeywords("login-login_LOGIN.Login"), ["login"]);
});

// Extends "[boundary-1] titles that give no keywords".
test("[boundary-1] titles of only short pieces, non-ASCII letters or whitespace give no keywords", () => {
  assert.deepEqual(contextKeywords("a ab abc ABC Fix"), []);
  assert.deepEqual(contextKeywords("ÀÉÎÕÜ ÆØÅ ñññ abc_de_fgh"), []);
  assert.deepEqual(contextKeywords("\t\n\r   "), []);
  assert.deepEqual(contextKeywords("abc-abc-abc.abc"), []);
  assert.deepEqual(contextKeywords("日本語のタイトル"), []);
});
