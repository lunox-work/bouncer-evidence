import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";
import type { Step } from "../../src/index.js";

function step(keyword: Step["keyword"], text: string, line: number): Step {
  return { keyword, text, line, docString: null, table: null };
}

function file(lines: string[], eol = "\n"): string {
  return lines.join(eol) + eol;
}

// Extends "a doc string and a table belong to the step before them".
test("[boundary-1] separate doc strings remove their own indentation and preserve deeper whitespace", () => {
  const text = file([
    "Feature: Indentation", "Scenario: Two documents", "Given first",
    "  \"\"\"", "  root  ", "     child\t", "  tail", "  \"\"\"",
    "When second", "       \"\"\"", "       top", "         nested", "       \"\"\"",
    "Then plain",
  ], "\r\n");
  assert.deepEqual(parseFeature(text).scenarios[0].steps, [
    { ...step("Given", "first", 3), docString: ["root  ", "   child\t", "tail"] },
    { ...step("When", "second", 9), docString: ["top", "  nested"] },
    step("Then", "plain", 14),
  ]);
});

// Extends "a doc string and a table belong to the step before them".
test("[boundary-1] an empty doc string is an empty array and does not attach to later steps", () => {
  assert.deepEqual(parseFeature(file([
    "Feature: Empty document", "Scenario: Empty", "Given document", "    \"\"\"", "    \"\"\"",
    "And no attachment", "Scenario: Next", "Then still no attachment",
  ])).scenarios, [
    { name: "Empty", line: 2, tags: [], steps: [
      { ...step("Given", "document", 3), docString: [] }, step("And", "no attachment", 6),
    ] },
    { name: "Next", line: 7, tags: [], steps: [step("Then", "still no attachment", 8)] },
  ]);
});

// Extends "a doc string and a table belong to the step before them".
test("[boundary-1] opening quotes at column one remove no content indentation", () => {
  const text = file([
    "Feature: Flush quotes", "Scenario: Literal indentation", "  Given text", '\"\"\"',
    "    indented", "\twith a tab", "plain", '\"\"\"', "  Then done",
  ]);
  assert.deepEqual(parseFeature(text).scenarios[0].steps, [
    { ...step("Given", "text", 3), docString: ["    indented", "\twith a tab", "plain"] },
    step("Then", "done", 9),
  ]);
});

// Extends "a doc string and a table belong to the step before them".
test("[boundary-1] tab-indented quotes remove that prefix while preserving deeper tabs and spaces", () => {
  const text = file([
    "Feature: Tabbed documents", "\tScenario: Document", "\t\tAnd payload", '\t\t\"\"\"',
    "\t\troot", "\t\t\tchild", "\t\t  spaced", '\t\t\"\"\"', "\t\tBut plain",
  ], "\r\n");
  assert.deepEqual(parseFeature(text).scenarios[0].steps, [
    { ...step("And", "payload", 3), docString: ["root", "\tchild", "  spaced"] },
    step("But", "plain", 9),
  ]);
});

// Extends "lines inside a doc string are never read as keywords, comments or tags".
test("[boundary-1] multiple documents keep all keyword forms literal and resume normal parsing after closing", () => {
  const text = file([
    "Feature: Literal forms", "Scenario: First", "Given one", '  \"\"\"',
    "  When literal", "  Then literal", "  And literal", "  But literal", "  * literal",
    "  @not-real @also-not-real", "  # Scenario Outline: literal", "  | x | y |", '  \"\"\"',
    "@real", "Scenario: Second", "But two", '    \"\"\"',
    "    Feature: third feature is literal", "    Background: literal", "    Scenario: literal",
    "    Scenario Outline: literal", "    Given literal", "    # literal", "    @literal", '    \"\"\"',
    "Then after", "Scenario: Third", "* plain",
  ]);
  assert.deepEqual(parseFeature(text), {
    name: "Literal forms", background: null,
    scenarios: [
      { name: "First", line: 2, tags: [], steps: [
        { ...step("Given", "one", 3), docString: ["When literal", "Then literal", "And literal", "But literal",
          "* literal", "@not-real @also-not-real", "# Scenario Outline: literal", "| x | y |"] },
      ] },
      { name: "Second", line: 15, tags: ["@real"], steps: [
        { ...step("But", "two", 16), docString: ["Feature: third feature is literal", "Background: literal",
          "Scenario: literal", "Scenario Outline: literal", "Given literal", "# literal", "@literal"] },
        step("Then", "after", 26),
      ] },
      { name: "Third", line: 27, tags: [], steps: [step("*", "plain", 28)] },
    ],
  });
});

// Extends "lines inside a doc string are never read as keywords, comments or tags".
test("[boundary-1] a long doc string with many apparent headers stays one attachment", () => {
  const literalLines: string[] = [];
  for (let i = 0; i < 40; i++) {
    literalLines.push(`Feature: fake ${i}`, `Scenario Outline: fake ${i}`, `@tag${i}`, `# comment ${i}`);
  }
  const lines = ["Feature: Large document", "Scenario: One", "* document", '   \"\"\"',
    ...literalLines.map((line) => `   ${line}`), '   \"\"\"', "Then finish"];
  const feature = parseFeature(file(lines, "\r\n"));
  assert.equal(feature.scenarios.length, 1);
  assert.deepEqual(feature.scenarios[0].tags, []);
  assert.deepEqual(feature.scenarios[0].steps, [
    { ...step("*", "document", 3), docString: literalLines },
    step("Then", "finish", 166),
  ]);
});

// Extends "a doc string and a table belong to the step before them".
test("[boundary-1] tables preserve empty cells and internal text while trimming each cell", () => {
  const text = file([
    "Feature: Cells", "Scenario: Rows", "When rows",
    " \t| left | middle | right | end |",
    "\t|  |  a  b  |\tλ\t|  |",
    "  | Given x | @literal | #literal | Scenario: literal |",
    "Then plain",
  ], "\r\n");
  assert.deepEqual(parseFeature(text).scenarios[0].steps, [
    { ...step("When", "rows", 3), table: [
      ["left", "middle", "right", "end"], ["", "a  b", "λ", ""],
      ["Given x", "@literal", "#literal", "Scenario: literal"],
    ] },
    step("Then", "plain", 7),
  ]);
});

// Extends "a doc string and a table belong to the step before them".
test("[boundary-1] many table rows and columns retain their order across separate steps", () => {
  const rows = Array.from({ length: 50 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => `r${49 - r}:c${8 - c}`));
  const lines = ["Feature: Large tables", "Scenario: Many cells", "But first table",
    ...rows.map((row) => `    | ${row.join(" | ")} |`),
    "And second table", "    | unique | value |", "* no table"];
  assert.deepEqual(parseFeature(file(lines)).scenarios[0].steps, [
    { ...step("But", "first table", 3), table: rows },
    { ...step("And", "second table", 54), table: [["unique", "value"]] },
    step("*", "no table", 56),
  ]);
});

// Extends "a doc string and a table belong to the step before them" and
// "returns the background's steps on their own, not copied into the scenarios".
test("[boundary-1] background attachments and scenario attachments have separate owners", () => {
  const text = file([
    "Feature: Shared attachments", "Background:", "Given setup document", '    \"\"\"',
    "    Background: literal", "    @not-a-scenario-tag", '    \"\"\"',
    "And setup rows", "    | setup | 17 |", "Scenario: Local",
    "When local rows", "    | local | 29 |", "Then local document", '  \"\"\"', "  value", '  \"\"\"',
    "Scenario: Other", "But plain",
  ], "\r\n");
  assert.deepEqual(parseFeature(text), {
    name: "Shared attachments", background: [
      { ...step("Given", "setup document", 3), docString: ["Background: literal", "@not-a-scenario-tag"] },
      { ...step("And", "setup rows", 8), table: [["setup", "17"]] },
    ],
    scenarios: [
      { name: "Local", line: 10, tags: [], steps: [
        { ...step("When", "local rows", 11), table: [["local", "29"]] },
        { ...step("Then", "local document", 13), docString: ["value"] },
      ] },
      { name: "Other", line: 17, tags: [], steps: [step("But", "plain", 18)] },
    ],
  });
});

// Extends "a doc string and a table belong to the step before them".
test("[boundary-1] a table at the end of a scenario does not get reused by the next scenario", () => {
  const feature = parseFeature(file([
    "Feature: End attachments", "Scenario: First", "* rows", " | A | B |", " | C | D |",
    "Scenario: Second", "Given plain", "When document", ' \"\"\"', " text", ' \"\"\"',
  ]));
  assert.deepEqual(feature.scenarios, [
    { name: "First", line: 2, tags: [], steps: [
      { ...step("*", "rows", 3), table: [["A", "B"], ["C", "D"]] },
    ] },
    { name: "Second", line: 6, tags: [], steps: [
      step("Given", "plain", 7), { ...step("When", "document", 8), docString: ["text"] },
    ] },
  ]);
});
