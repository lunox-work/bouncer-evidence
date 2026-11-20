import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeature } from "../../src/index.js";
import type { Feature, Step } from "../../src/index.js";

function step(keyword: Step["keyword"], text: string, line: number): Step {
  return { keyword, text, line, docString: null, table: null };
}

function file(lines: string[], eol = "\n"): string {
  return lines.join(eol) + eol;
}

// Extends "returns the feature name and its scenarios with their steps and lines in file order".
test("[happy-1] many scenarios with repeated names and noncanonical keyword order remain ordered", () => {
  const lines = ["Feature: Batch: 重复", ""];
  const expected: Feature = { name: "Batch: 重复", background: null, scenarios: [] };
  const keywords: Step["keyword"][] = ["But", "*", "And", "Then", "When", "Given"];
  for (let i = 0; i < 32; i++) {
    const name = i % 2 === 0 ? "Repeated" : `Item ${32 - i}`;
    lines.push(`  Scenario: ${name}`);
    const scenario: Feature["scenarios"][number] = {
      name, line: lines.length, tags: [], steps: [],
    };
    for (let j = 0; j < 18; j++) {
      const keyword = keywords[j % keywords.length];
      const text = `item ${i}, step ${j}: Given @literal #literal | literal`;
      lines.push(`    ${keyword} ${text}`);
      scenario.steps.push(step(keyword, text, lines.length));
    }
    expected.scenarios.push(scenario);
    lines.push("");
  }
  assert.deepEqual(parseFeature(file(lines)), expected);
});

// Extends "reads CRLF line endings and tab indentation without leaking \\r into names or texts".
test("[happy-1] CRLF and mixed space-tab indentation apply to feature and every keyword", () => {
  const text = file([
    " \tFeature: Café: 支付", "\t ", " \t Scenario: Z: λ",
    "\t But déjà vu", " \t* 星", "\t  And literal: Feature: other",
    " \t Then @value #value", "\t When a | b", " \tGiven τέλος",
    "", "\t Scenario: A", "\t\tThen done",
  ], "\r\n");
  assert.deepEqual(parseFeature(text), {
    name: "Café: 支付", background: null,
    scenarios: [
      { name: "Z: λ", line: 3, tags: [], steps: [
        step("But", "déjà vu", 4), step("*", "星", 5),
        step("And", "literal: Feature: other", 6), step("Then", "@value #value", 7),
        step("When", "a | b", 8), step("Given", "τέλος", 9),
      ] },
      { name: "A", line: 11, tags: [], steps: [step("Then", "done", 12)] },
    ],
  });
});

// Extends "a step's text is what follows the keyword and exactly one space".
test("[happy-1] every keyword preserves extra leading internal and trailing payload whitespace", () => {
  const payloads: [Step["keyword"], string][] = [
    ["*", "   stars  inside  "], ["But", "\tleading tab\t"],
    ["And", "  # a literal comment"], ["Then", " @a @b"],
    ["When", "a\tb  c   "], ["Given", "    Scenario: literal"],
  ];
  const lines = ["Feature: Whitespace", "Scenario: Payloads"];
  const expected = payloads.map(([keyword, text], i) => {
    lines.push(` \t${keyword} ${text}`);
    return step(keyword, text, i + 3);
  });
  assert.deepEqual(parseFeature(file(lines)).scenarios[0].steps, expected);
});

// Extends "returns the feature name and its scenarios with their steps and lines in file order".
test("[happy-1] long feature names scenario names and step payloads are not truncated", () => {
  const featureName = "Inventory" + " section".repeat(128);
  const scenarioName = "Case" + ":detail".repeat(128);
  const payload = "Ω #literal @tag | cell | Scenario Outline: literal ".repeat(256) + "end";
  assert.deepEqual(parseFeature(file([
    `Feature: ${featureName}`, `Scenario: ${scenarioName}`, `Then ${payload}`,
  ])), {
    name: featureName, background: null,
    scenarios: [{ name: scenarioName, line: 2, tags: [], steps: [step("Then", payload, 3)] }],
  });
});

// Extends "returns the feature name and its scenarios with their steps and lines in file order".
test("[happy-1] separate parse calls do not retain names tags steps or background state", () => {
  const firstText = file([
    "Feature: First", "Background:", "Given shared", "@first",
    "Scenario: First case", "Then first result",
  ]);
  const firstExpected: Feature = {
    name: "First", background: [step("Given", "shared", 3)],
    scenarios: [{ name: "First case", line: 5, tags: ["@first"], steps: [step("Then", "first result", 6)] }],
  };
  const first = parseFeature(firstText);
  assert.deepEqual(first, firstExpected);
  assert.deepEqual(parseFeature(file(["Feature: Second", "Scenario: Fresh", "* second result"])), {
    name: "Second", background: null,
    scenarios: [{ name: "Fresh", line: 2, tags: [], steps: [step("*", "second result", 3)] }],
  });
  assert.deepEqual(first, firstExpected);
  assert.deepEqual(parseFeature(firstText), firstExpected);
});

// Extends "skips comments, descriptions and blank lines, and gives tags to the next scenario".
test("[happy-2] several tag batches target successive scenarios and never leak to untagged ones", () => {
  const text = file([
    "Feature: Tags", "  A longer description.", "  It mentions @words and #symbols.",
    "\t", "\t@red @blue", "\t# between tag lines", "", "  @green",
    "Scenario: First", "Given first", "@next:batch @slow", "\t ", "# wait",
    "Scenario: Second", "When second", "", "Scenario: Third", "Then third",
    "@last", "Scenario: Fourth", "But fourth", "Scenario: Fifth", "* fifth",
  ], "\r\n");
  const feature = parseFeature(text);
  // Tag ordering is not specified; only membership and ownership are asserted.
  const normalized = feature.scenarios.map((scenario) => ({ ...scenario, tags: [...scenario.tags].sort() }));
  assert.deepEqual(normalized, [
    { name: "First", line: 9, tags: ["@blue", "@green", "@red"], steps: [step("Given", "first", 10)] },
    { name: "Second", line: 14, tags: ["@next:batch", "@slow"], steps: [step("When", "second", 15)] },
    { name: "Third", line: 17, tags: [], steps: [step("Then", "third", 18)] },
    { name: "Fourth", line: 20, tags: ["@last"], steps: [step("But", "fourth", 21)] },
    { name: "Fifth", line: 22, tags: [], steps: [step("*", "fifth", 23)] },
  ]);
});

// Extends "skips comments, descriptions and blank lines, and gives tags to the next scenario".
test("[happy-2] several spaces between tags do not create empty tag entries", () => {
  const feature = parseFeature(file([
    "Feature: Space-separated tags", " \t@zulu   @alpha     @middle", "@delta  @beta",
    "Scenario: Tagged", "Given tagged", "Scenario: Clear", "Then clear",
  ]));
  assert.deepEqual([...feature.scenarios[0].tags].sort(), ["@alpha", "@beta", "@delta", "@middle", "@zulu"]);
  assert.deepEqual(feature.scenarios[0].steps, [step("Given", "tagged", 5)]);
  assert.deepEqual(feature.scenarios[1], {
    name: "Clear", line: 6, tags: [], steps: [step("Then", "clear", 7)],
  });
});

// Extends "comments that look like keywords are skipped and tags from several tag lines all go to the next scenario".
test("[happy-2] indented comment lookalikes and blank lines do not change the current step owner", () => {
  const text = file([
    "Feature: Comments", "Scenario: Original", "Given # text @tag is literal",
    " \t# Feature: ignored", "\t# Background:", " # Scenario Outline: ignored",
    " # \"\"\"", " # | ignored |", " # @ignored", "\t ", "Then still original",
    "@one", "# Scenario: ignored", "", "@two @three", "\t# Given ignored",
    "Scenario: Target", "* next", "Scenario: Clear", "And clear",
  ]);
  const feature = parseFeature(text);
  assert.equal(feature.background, null);
  assert.equal(feature.scenarios.length, 3);
  assert.deepEqual(feature.scenarios[0], {
    name: "Original", line: 2, tags: [],
    steps: [step("Given", "# text @tag is literal", 3), step("Then", "still original", 11)],
  });
  assert.deepEqual([...feature.scenarios[1].tags].sort(), ["@one", "@three", "@two"]);
  assert.deepEqual(feature.scenarios[1].steps, [step("*", "next", 18)]);
  assert.deepEqual(feature.scenarios[2], {
    name: "Clear", line: 19, tags: [], steps: [step("And", "clear", 20)],
  });
});

// Extends "skips comments, descriptions and blank lines, and gives tags to the next scenario".
test("[happy-2] feature description ends at a background and whitespace-only lines are skipped everywhere", () => {
  assert.deepEqual(parseFeature(file([
    "Feature: Described", "Words that are not step keywords.", "  More prose: details.",
    "\t ", " \tBackground:", "\t", "# background comment", "\tGiven base",
    "  ", "Scenario: Active", "\t# comment", "\t ", "Then final", "  ",
  ])), {
    name: "Described", background: [step("Given", "base", 8)],
    scenarios: [{ name: "Active", line: 10, tags: [], steps: [step("Then", "final", 13)] }],
  });
});

// Extends "returns the background's steps on their own, not copied into the scenarios".
test("[happy-3] all six keywords in a long background remain separate from three scenarios", () => {
  assert.deepEqual(parseFeature(file([
    "Feature: Shared", "\tBackground:", "\tGiven base", "\tWhen prepared", "",
    "\tThen ready", "\t# comment", "\tAnd extra", "\tBut guarded", "\t* wildcard",
    "Scenario: Third", "Then third", "Scenario: First", "When first", "Scenario: Second", "But second",
  ], "\r\n")), {
    name: "Shared",
    background: [step("Given", "base", 3), step("When", "prepared", 4), step("Then", "ready", 6),
      step("And", "extra", 8), step("But", "guarded", 9), step("*", "wildcard", 10)],
    scenarios: [
      { name: "Third", line: 11, tags: [], steps: [step("Then", "third", 12)] },
      { name: "First", line: 13, tags: [], steps: [step("When", "first", 14)] },
      { name: "Second", line: 15, tags: [], steps: [step("But", "second", 16)] },
    ],
  });
});

// Extends "a background with no steps is an empty list, not null".
test("[happy-3] a comment-only background stays empty when tagged and untagged scenarios follow", () => {
  assert.deepEqual(parseFeature(file([
    "Feature: Vacant setup", "\tBackground:", "  ", "\t# Given is only a comment",
    "\t", "@case", "Scenario: Tagged", "Given local", "Scenario: Other", "Then other",
  ], "\r\n")), {
    name: "Vacant setup", background: [], scenarios: [
      { name: "Tagged", line: 7, tags: ["@case"], steps: [step("Given", "local", 8)] },
      { name: "Other", line: 9, tags: [], steps: [step("Then", "other", 10)] },
    ],
  });
});
