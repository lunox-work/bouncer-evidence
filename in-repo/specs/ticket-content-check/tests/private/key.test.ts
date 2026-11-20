import assert from "node:assert/strict";
import { test } from "node:test";

import { ticketKey } from "../../src/ticket.js";

/**
 * Hidden checks for ticketKey: jiraKey unless it is null or undefined, and
 * otherwise "T-" followed by the number in decimal.
 */

// extends: "[happy-9] a native ticket is keyed T-<number> and a Jira ticket by its jiraKey"
test("[happy-9] native tickets of other numbers are keyed T-<number> with no padding or grouping", () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [2, "T-2"],
    [9, "T-9"],
    [10, "T-10"],
    [99, "T-99"],
    [100, "T-100"],
    [4321, "T-4321"],
    [1234567, "T-1234567"],
    [2147483648, "T-2147483648"],
  ];
  for (const [number, key] of cases) {
    assert.equal(ticketKey({ number }), key);
    assert.equal(ticketKey({ number, jiraKey: null }), key);
    assert.equal(ticketKey({ number, jiraKey: undefined }), key);
  }
});

// extends: "[happy-9] a native ticket is keyed T-<number> and a Jira ticket by its jiraKey"
test("[happy-9] a jiraKey is returned exactly as given, whatever the number", () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [1, "ABC-1"],
    [12, "PROJ-12"],
    [12, "OTHER-999"],
    [0, "ZERO-5"],
    [-3, "NEG-1"],
    [1000, "proj-7"],
    [5, "T-99"],
    [5, "LONGPROJECTKEY-123456"],
  ];
  for (const [number, jiraKey] of cases) {
    assert.equal(ticketKey({ number, jiraKey }), jiraKey);
  }
});

// extends: "[happy-9] a null or undefined jiraKey falls back to T-<number>, for one and four digits"
test("[happy-9] keys for a mix of native and Jira tickets are each computed from their own ticket", () => {
  const tickets = [
    { number: 3 },
    { number: 4, jiraKey: "JIRA-4" },
    { number: 5, jiraKey: null },
    { number: 6, jiraKey: "JIRA-60" },
    { number: 7, jiraKey: undefined },
  ];
  assert.deepEqual(tickets.map(ticketKey), ["T-3", "JIRA-4", "T-5", "JIRA-60", "T-7"]);
});

// extends: "[boundary-9] an empty jiraKey is returned as the key"
test("[boundary-9] an empty jiraKey is the key for other numbers too", () => {
  for (const number of [0, 1, 7, 1000, -3]) {
    assert.equal(ticketKey({ number, jiraKey: "" }), "");
  }
});

// extends: "[boundary-9] a blank jiraKey is returned as given, untrimmed"
test("[boundary-9] other blank and padded jiraKeys are returned as given, untrimmed", () => {
  for (const jiraKey of [" ", "\t", "\n", "   \t ", " PROJ-7 ", "PROJ-7\n", "0"]) {
    assert.equal(ticketKey({ number: 12, jiraKey }), jiraKey, JSON.stringify(jiraKey));
  }
});

// extends: "[boundary-10] negative and fractional numbers are formatted without validation"
test("[boundary-10] other negative and fractional numbers are formatted as String(number) without throwing", () => {
  const cases: ReadonlyArray<readonly [number, string]> = [
    [-1, "T--1"],
    [-1000, "T--1000"],
    [0.5, "T-0.5"],
    [0.1, "T-0.1"],
    [1.25, "T-1.25"],
    [-2.75, "T--2.75"],
    [12.0, "T-12"],
  ];
  for (const [number, key] of cases) {
    assert.doesNotThrow(() => ticketKey({ number }));
    assert.equal(ticketKey({ number }), key, String(number));
    assert.equal(ticketKey({ number, jiraKey: null }), key, String(number));
  }
});

// extends: "[boundary-10] small numbers are formatted without padding"
test("[boundary-10] zero and one- to three-digit numbers are not zero-padded, with null or undefined jiraKey", () => {
  for (const [number, key] of [
    [0, "T-0"],
    [3, "T-3"],
    [42, "T-42"],
    [512, "T-512"],
  ] as const) {
    assert.equal(ticketKey({ number, jiraKey: undefined }), key);
    assert.equal(ticketKey({ number, jiraKey: null }), key);
  }
});
