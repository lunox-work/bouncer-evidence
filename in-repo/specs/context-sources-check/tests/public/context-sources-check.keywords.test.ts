import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONTEXT_DOCUMENT_BYTES_MAX,
  CONTEXT_DOCUMENT_CHARS,
  CONTEXT_DOCUMENTS_MAX,
  CONTEXT_SOURCES,
  CONTEXT_TOTAL_CHARS,
  NO_CONTEXT,
  contextKeywords,
} from "../src/sources.js";

test("[happy-1] the constants hold the decided values", () => {
  assert.deepEqual([...CONTEXT_SOURCES], ["jira", "github"]);
  assert.deepEqual(NO_CONTEXT, { jira: null, github: null });
  assert.equal(CONTEXT_DOCUMENTS_MAX, 12);
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 262144);
  assert.equal(CONTEXT_DOCUMENT_CHARS, 12000);
  assert.equal(CONTEXT_TOTAL_CHARS, 48000);
});

test("[happy-1] the total cap holds exactly four full documents", () => {
  assert.equal(CONTEXT_DOCUMENT_BYTES_MAX, 256 * 1024);
  assert.equal(CONTEXT_TOTAL_CHARS, 4 * CONTEXT_DOCUMENT_CHARS);
});

test("[happy-2] keywords are drawn from a title", () => {
  assert.deepEqual(contextKeywords("Fix the Login flow for OAuth2 login"), [
    "login",
    "flow",
    "oauth2",
  ]);
  assert.deepEqual(contextKeywords("2024 roadmap"), ["2024", "roadmap"]);
  assert.deepEqual(contextKeywords("Café-menu README_update"), [
    "menu",
    "readme",
    "update",
  ]);
  assert.deepEqual(contextKeywords("Add with-from this"), [
    "with",
    "from",
    "this",
  ]);
});

test("[happy-2] repeats in any case keep the first, and four characters is enough", () => {
  assert.deepEqual(contextKeywords("LOGIN login Login abcd abc"), [
    "login",
    "abcd",
  ]);
  // Non-ASCII letters separate, so "Ünïcode" leaves "n" and "code".
  assert.deepEqual(contextKeywords("Ünïcode a1b2c3"), ["code", "a1b2c3"]);
});

test("[boundary-1] titles that give no keywords", () => {
  assert.deepEqual(contextKeywords(""), []);
  assert.deepEqual(contextKeywords("API bug"), []);
  assert.deepEqual(contextKeywords("  --- !! "), []);
});

test("[boundary-1] underscores and hyphens split words below four characters", () => {
  assert.deepEqual(contextKeywords("abc_def-ghi.jkl"), []);
  assert.deepEqual(contextKeywords("éééé ñ"), []);
});
