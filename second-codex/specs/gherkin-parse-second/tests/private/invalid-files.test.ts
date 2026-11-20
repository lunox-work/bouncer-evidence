import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature, ParseError } from "../../src/index.js";

function file(lines: string[], eol = "\n"): string {
  return lines.join(eol) + eol;
}

function errorAt(text: string, line: number): ParseError {
  let caught: unknown;
  try {
    parseFeature(text);
  } catch (error: unknown) {
    caught = error;
  }
  if (!(caught instanceof ParseError)) {
    throw new assert.AssertionError({ message: `Expected ParseError at line ${line}, got ${String(caught)}` });
  }
  assert.equal(caught.line, line);
  assert.match(caught.message, new RegExp(`line ${line}(?!\\d)`));
  return caught;
}

function unsupported(error: ParseError): void {
  assert.match(error.message, /support/i);
}

// Extends "a second Feature: line fails at that line".
test("[unhappy-1] a duplicate feature in the description region is not swallowed as prose", () => {
  errorAt(file([
    "Feature: Original", "  Some description.", "", " \tFeature: Duplicate",
    "Scenario: Later", "Given never reached",
  ]), 4);
});

// Extends "a second Feature: line fails at that line".
test("[unhappy-1] a duplicate feature after a background attachment fails outside the doc string", () => {
  errorAt(file([
    "Feature: Original", "Background:", "Given a document", '    \"\"\"',
    "    Feature: literal inside the document", '    \"\"\"', "And a row", " | a | b |",
    "", "# boundary", "\tFeature: Duplicate", "Scenario: Too late", "Then no",
  ], "\r\n"), 11);
});

// Extends "error lines count from 1 across CRLF line endings and blank lines".
test("[unhappy-1] long CRLF input counts whitespace and comment lines before a duplicate feature", () => {
  const lines = ["Feature: Long file", "Scenario: Active", "Given valid"];
  for (let i = 0; i < 55; i++) lines.push("", "\t ", `\t# ignored ${i}`);
  lines.push(" \tFeature: Duplicate");
  errorAt(file(lines, "\r\n"), 169);
});

// Extends "content before any Feature: line fails at the first such line".
test("[unhappy-1] arbitrary content before a late feature fails at its first physical line", () => {
  errorAt(file([
    "", "\t ", "", "  A description cannot precede the feature", "Scenario: Orphan", "Feature: Late",
  ], "\r\n"), 4);
});

// Extends "content before any Feature: line fails at the first such line".
test("[unhappy-1] background and every step keyword are rejected as first content", () => {
  for (const content of ["Background:", "Given orphan", "When orphan", "Then orphan", "And orphan", "But orphan", "* orphan"]) {
    errorAt(file(["\t", ` \t${content}`, "Feature: Late", "Scenario: Case", "Given fine"]), 2);
  }
});

// Extends "a step before any Background: or Scenario: fails at that line".
test("[unhappy-1] an orphan step immediately after the feature cannot be treated as description", () => {
  for (const keyword of ["Given", "When", "Then", "And", "But", "*"]) {
    errorAt(file(["Feature: Orphans", ` \t${keyword} no owner`, "Scenario: Later", "Then fine"]), 2);
  }
});

// Extends "a step before any Background: or Scenario: fails at that line".
test("[unhappy-1] multiple tags and comments do not supply an owner for an orphan step", () => {
  errorAt(file([
    "Feature: Tagged orphan", "Description before tags.", "@one @two", "", "# ignored",
    "@three", "\t", "# still no owner", "", "\tBut orphan", "Scenario: Too late", "Then fine",
  ], "\r\n"), 10);
});

// Extends "a line inside a scenario that is none of the recognised forms fails at that line".
test("[unhappy-1] unrecognized text before a scenario's first step is not a description", () => {
  errorAt(file([
    "Feature: No scenario prose", "  Feature prose is fine.", "Scenario: Active", "",
    "# a comment", "\tThis scenario prose is invalid", "Given later",
  ]), 6);
});

// Extends "a line inside a scenario that is none of the recognised forms fails at that line".
test("[unhappy-1] step keyword prefixes are not recognized as whole keywords", () => {
  for (const line of ["Givenly wrong", "Whenever wrong", "Thenish wrong", "Anderson wrong", "Butter wrong", "** wrong"]) {
    errorAt(file(["Feature: Tokens", "Scenario: Active", "Given valid", ` \t${line}`, "Then later"]), 4);
  }
});

// Extends "a line inside a scenario that is none of the recognised forms fails at that line".
test("[unhappy-1] a closed doc string does not make later unknown lines literal", () => {
  errorAt(file([
    "Feature: Resume checks", "Scenario: First", "Given doc", '  \"\"\"', "  plain prose is literal here",
    '  \"\"\"', "Then fine", "", "Scenario: Second", "When doc", '    \"\"\"',
    "    more literal prose", '    \"\"\"', "\tinvalid outside the doc string", "Then later",
  ], "\r\n"), 14);
});

// Extends "a line inside a scenario that is none of the recognised forms fails at that line".
test("[unhappy-1] an invalid line after a long table is rejected rather than consumed as a row", () => {
  const lines = ["Feature: Table boundary", "Scenario: Active", "Given rows"];
  for (let i = 0; i < 25; i++) lines.push(`  | row ${i} | value ${i} |`);
  lines.push("\t ", "  this is neither a table row nor a step", "Then later");
  errorAt(file(lines), 30);
});

// Extends "a doc string that is never closed fails at the line that opened it".
test("[unhappy-1] an unclosed CRLF doc string reports its opener despite later apparent errors", () => {
  errorAt(file([
    "Feature: Unclosed", "Scenario: First", "Given valid", "Then valid", "", "# padding",
    "Scenario: Second", "When doc", "", "# before opener", '      \"\"\"',
    "      Feature: literal", "      Scenario Outline: literal", "      @literal", "      # literal",
    "      Given literal", "      | literal | row |", "      arbitrary literal content",
  ], "\r\n"), 11);
});

// Extends "a doc string that is never closed fails at the line that opened it".
test("[unhappy-1] an opening delimiter on the final terminated line is still an unclosed document", () => {
  errorAt(file([
    "Feature: Abrupt end", "Scenario: Active", "Then document", '   \"\"\"',
  ]), 4);
});

// Extends "a doc string that is never closed fails at the line that opened it".
test("[unhappy-1] an unclosed background document reports the background opener", () => {
  errorAt(file([
    "Feature: Setup", "Background:", "Given document", '  \"\"\"', "  setup text",
    "  Scenario: this is inside the document", "  Then also literal",
  ], "\r\n"), 4);
});

// Extends "Scenario Outline: fails at its line, saying it is not supported".
test("[unhappy-1] a first scenario outline is unsupported even before any regular scenario", () => {
  unsupported(errorAt(file([
    "Feature: Outline", "Some feature prose.", "", "\tScenario Outline: First", "Given <value>",
  ]), 4));
});

// Extends "Scenario Outline: fails at its line, saying it is not supported".
test("[unhappy-1] tags and a long background do not hide an indented scenario outline", () => {
  const lines = ["Feature: Outline after setup", "Background:", "Given setup"];
  for (let i = 0; i < 18; i++) lines.push(`And setup ${i}`);
  lines.push("", "@examples @batch", "# between tags and outline", "\t ", " \tScenario Outline: Matrix", "Then <result>");
  unsupported(errorAt(file(lines, "\r\n"), 26));
});

// Extends "a second Feature: line fails at that line" and
// "a line inside a scenario that is none of the recognised forms fails at that line".
test("[unhappy-1] the first invalid line wins over later duplicate features and outlines", () => {
  errorAt(file([
    "Feature: Earliest", "Scenario: Active", "Given valid", "  invalid first",
    "Feature: Duplicate", "Scenario Outline: Unsupported", "When later",
  ]), 4);
});

// Extends "error lines count from 1 across CRLF line endings and blank lines".
test("[unhappy-1] ParseError instances constructed directly carry their own line and line message", () => {
  for (const line of [1, 12, 1037]) {
    const error = new ParseError("Invalid feature content", line);
    assert.ok(error instanceof Error);
    assert.ok(error instanceof ParseError);
    assert.equal(error.line, line);
    assert.match(error.message, new RegExp(`line ${line}(?!\\d)`));
  }
});

// Extends "a line inside a scenario that is none of the recognised forms fails at that line".
test("[unhappy-1] a failed parse does not corrupt a later valid parse or renumber its lines", () => {
  errorAt(file(["Feature: Broken", "Scenario: Broken", "Then valid", "bad"]), 4);
  assert.deepEqual(parseFeature(file(["Feature: Fresh", "Scenario: Fresh", "Then valid"])), {
    name: "Fresh", background: null,
    scenarios: [{ name: "Fresh", line: 2, tags: [], steps: [
      { keyword: "Then", text: "valid", line: 3, docString: null, table: null },
    ] }],
  });
  errorAt(file(["Feature: Broken again", "", "Scenario: Broken", "Given valid", "bad"]), 5);
});
