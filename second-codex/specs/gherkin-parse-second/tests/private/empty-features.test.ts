import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";

// Extends "a file with only Feature: Empty parses with no scenarios and no background".
test("[boundary-2] a single indented feature with a different Unicode name is empty", () => {
  assert.deepEqual(parseFeature(" \tFeature: Inventory: 零\r\n"), {
    name: "Inventory: 零", background: null, scenarios: [],
  });
});

// Extends "an empty feature with no final newline, a description, comments and CRLF blank lines is valid".
// This extension uses terminated lines; it exercises longer descriptions and more whitespace.
test("[boundary-2] a longer empty feature skips descriptions comments and tab-only blank lines", () => {
  const lines = ["", "\t ", "Feature: Documentation only"];
  for (let i = 0; i < 24; i++) {
    lines.push(`  Paragraph ${i}: text with @words and #symbols.`, "\t# Scenario: ignored", " \t");
  }
  lines.push("# Background: ignored", "# Feature: ignored", "# Scenario Outline: ignored", "");
  assert.deepEqual(parseFeature(lines.join("\r\n") + "\r\n"), {
    name: "Documentation only", background: null, scenarios: [],
  });
});

// Extends "a file with only Feature: Empty parses with no scenarios and no background".
test("[boundary-2] several empty features parsed independently retain their own names", () => {
  const inputs = ["One", "Two: appendix", "三", "One"];
  const results = inputs.map((name) => parseFeature(`Feature: ${name}\n`));
  assert.deepEqual(results, inputs.map((name) => ({ name, background: null, scenarios: [] })));
});
