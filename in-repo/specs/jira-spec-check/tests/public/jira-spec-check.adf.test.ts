import assert from "node:assert/strict";
import { test } from "node:test";

import { toIssueSpec } from "../src/spec.js";

/** The descriptionText toIssueSpec builds from this description. */
async function textOf(description: unknown): Promise<string> {
  return (await toIssueSpec("PROJ-1", { description })).descriptionText;
}

function doc(...content: unknown[]): Record<string, unknown> {
  return { type: "doc", version: 1, content };
}

function text(value: string, marks?: unknown[]): Record<string, unknown> {
  return marks === undefined ? { type: "text", text: value } : { type: "text", text: value, marks };
}

function para(...content: unknown[]): Record<string, unknown> {
  return { type: "paragraph", content };
}

function p(value: string): Record<string, unknown> {
  return para(text(value));
}

function listItem(...content: unknown[]): Record<string, unknown> {
  return { type: "listItem", content };
}

/** A doc holding `panels` nested panel nodes, the innermost holding `inner`. */
function nestedPanels(panels: number, inner: unknown): Record<string, unknown> {
  let node: unknown = inner;
  for (let i = 0; i < panels; i++) {
    node = { type: "panel", content: [node] };
  }
  return node as Record<string, unknown>;
}

// --- paragraphs and inline content ------------------------------------------------

test("[happy-9] paragraphs become blocks separated by a blank line, empty ones dropped", async () => {
  const description = doc(p("Users can sign in."), para(), p("With SSO.   "));
  assert.equal(await textOf(description), "Users can sign in.\n\nWith SSO.");
});

test("[happy-9] a doc of only empty paragraphs gives an empty descriptionText", async () => {
  assert.equal(await textOf(doc(para(), para(), p("   "))), "");
});

test("[happy-10] text runs are joined as they are, ignoring marks and keeping their spacing", async () => {
  const description = doc(para(text("Sign in  with "), text("SSO", [{ type: "strong" }]), text(".")));
  assert.equal(await textOf(description), "Sign in  with SSO.");
});

test("[happy-10] link and emphasis marks are ignored too", async () => {
  const description = doc(
    para(
      text("Sign in "),
      text("here", [{ type: "link", attrs: { href: "https://acme.test" } }, { type: "em" }]),
      text("."),
    ),
  );
  assert.equal(await textOf(description), "Sign in here.");
});

test("[happy-11] a hard break becomes a line feed inside its block", async () => {
  const description = doc(para(text("Line one"), { type: "hardBreak" }, text("Line two")));
  assert.equal(await textOf(description), "Line one\nLine two");
});

test("[happy-11] a hard break at the end of a block is trailing whitespace and is removed", async () => {
  const description = doc(para(text("Line one"), { type: "hardBreak" }));
  assert.equal(await textOf(description), "Line one");
});

test("[happy-12] inline references with their attribute contribute their label", async () => {
  const cases: Array<[unknown, string]> = [
    [{ type: "mention", attrs: { id: "1", text: "@Ada" } }, "Ask @Ada now"],
    [{ type: "emoji", attrs: { shortName: ":tada:" } }, "Ask :tada: now"],
    [
      { type: "inlineCard", attrs: { url: "https://acme.atlassian.net/browse/PROJ-2" } },
      "Ask https://acme.atlassian.net/browse/PROJ-2 now",
    ],
    [{ type: "date", attrs: { timestamp: "1700000000000" } }, "Ask 1700000000000 now"],
    [{ type: "status", content: [text("DONE")] }, "Ask DONE now"],
  ];
  for (const [node, expected] of cases) {
    assert.equal(await textOf(doc(para(text("Ask "), node, text(" now")))), expected, JSON.stringify(node));
  }
});

test("[happy-12] inline references missing their attribute fall back", async () => {
  const cases: Array<[unknown, string]> = [
    [{ type: "mention", attrs: { id: "1" } }, "Ask @unknown now"],
    [{ type: "emoji", attrs: {} }, "Ask  now"],
    [{ type: "inlineCard", attrs: {} }, "Ask  now"],
    [{ type: "date" }, "Ask  now"],
  ];
  for (const [node, expected] of cases) {
    assert.equal(await textOf(doc(para(text("Ask "), node, text(" now")))), expected, JSON.stringify(node));
  }
});

test("[happy-13] a block card at block level contributes nothing", async () => {
  const description = {
    type: "doc",
    content: [p("See:"), { type: "blockCard", attrs: { url: "https://acme.atlassian.net/browse/PROJ-2" } }],
  };
  assert.equal(await textOf(description), "See:");
});

test("[happy-13] a doc holding only a block card gives an empty descriptionText", async () => {
  const description = doc({ type: "blockCard", attrs: { url: "https://acme.atlassian.net/browse/PROJ-2" } });
  assert.equal(await textOf(description), "");
});

// --- headings ----------------------------------------------------------------------

test("[boundary-9] headings get one # per level for levels 1 through 6", async () => {
  const heading = (attrs: unknown) => doc({ type: "heading", attrs, content: [text("Goal")] });
  assert.equal(await textOf(heading({ level: 1 })), "# Goal");
  assert.equal(await textOf(heading({ level: 2 })), "## Goal");
  assert.equal(await textOf(heading({ level: 6 })), "###### Goal");
});

test("[boundary-9] heading levels are clamped, numeric strings read, and anything else is level 1", async () => {
  const heading = (attrs: unknown) => doc({ type: "heading", attrs, content: [text("Goal")] });
  assert.equal(await textOf(heading({ level: 9 })), "###### Goal");
  assert.equal(await textOf(heading({ level: 0 })), "# Goal");
  assert.equal(await textOf(heading({ level: "3" })), "### Goal");
  assert.equal(await textOf(heading({ level: "x" })), "# Goal");
  assert.equal(await textOf(heading({})), "# Goal");
});

test("[boundary-10] a heading with no content is dropped", async () => {
  const description = doc({ type: "heading", attrs: { level: 2 } }, p("Body"));
  assert.equal(await textOf(description), "Body");
});

test("[boundary-10] a heading with an empty content array is dropped", async () => {
  const description = doc({ type: "heading", attrs: { level: 2 }, content: [] }, p("Body"));
  assert.equal(await textOf(description), "Body");
});

// --- lists -----------------------------------------------------------------------------

test("[happy-14] bullet list items are - blocks, with an item's later blocks indented two spaces", async () => {
  const description = doc({
    type: "bulletList",
    content: [
      listItem(p("First"), { type: "bulletList", content: [listItem(p("Nested"))] }),
      listItem(p("Second"), p("continued")),
    ],
  });
  assert.equal(await textOf(description), "- First\n\n  - Nested\n\n- Second\n\n  continued");
});

test("[happy-14] a bullet list with one single-paragraph item is one - block", async () => {
  const description = doc({ type: "bulletList", content: [listItem(p("Only"))] });
  assert.equal(await textOf(description), "- Only");
});

test("[boundary-11] ordered list items are numbered from 1 when attrs.order is absent or 1", async () => {
  const ordered = (attrs: unknown) =>
    doc({ type: "orderedList", attrs, content: [listItem(p("Alpha")), listItem(p("Beta"))] });
  assert.equal(await textOf(ordered({})), "1. Alpha\n\n2. Beta");
  assert.equal(await textOf(ordered({ order: 1 })), "1. Alpha\n\n2. Beta");
});

test("[boundary-11] ordered list items start at a numeric attrs.order, and from 1 otherwise", async () => {
  const ordered = (attrs: unknown) =>
    doc({ type: "orderedList", attrs, content: [listItem(p("Alpha")), listItem(p("Beta"))] });
  assert.equal(await textOf(ordered({ order: 3 })), "3. Alpha\n\n4. Beta");
  assert.equal(await textOf(ordered({ order: "x" })), "1. Alpha\n\n2. Beta");
});

test("[happy-15] task items become checkboxes, ticked only when state is DONE", async () => {
  const description = doc({
    type: "taskList",
    content: [
      { type: "taskItem", attrs: { localId: "a", state: "DONE" }, content: [text("Write tests")] },
      { type: "taskItem", attrs: { localId: "b", state: "TODO" }, content: [text("Ship")] },
      { type: "taskItem", content: [text("Announce")] },
    ],
  });
  assert.equal(await textOf(description), "- [x] Write tests\n\n- [ ] Ship\n\n- [ ] Announce");
});

test("[happy-15] a lowercase done state is not DONE and stays unticked", async () => {
  const description = doc({
    type: "taskList",
    content: [{ type: "taskItem", attrs: { localId: "a", state: "done" }, content: [text("Ship")] }],
  });
  assert.equal(await textOf(description), "- [ ] Ship");
});

// --- tables, code, quotes, rules, media ------------------------------------------------

test("[happy-16] table rows become pipe-separated blocks, a cell's blocks joined by one space", async () => {
  const description = doc({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", content: [p("Field")] },
          { type: "tableHeader", content: [p("Value")] },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [p("Owner")] },
          { type: "tableCell", content: [p("Ada"), p("Lovelace")] },
        ],
      },
    ],
  });
  assert.equal(await textOf(description), "| Field | Value |\n\n| Owner | Ada Lovelace |");
});

test("[happy-16] a one-row, one-cell table is a single pipe-wrapped block", async () => {
  const description = doc({
    type: "table",
    content: [{ type: "tableRow", content: [{ type: "tableCell", content: [p("Only")] }] }],
  });
  assert.equal(await textOf(description), "| Only |");
});

test("[happy-17] a code block with a string language is fenced with it", async () => {
  const description = doc({ type: "codeBlock", attrs: { language: "ts" }, content: [text("const a = 1;")] });
  assert.equal(await textOf(description), "```ts\nconst a = 1;\n```");
});

test("[happy-17] a code block with no or a non-string language is fenced bare", async () => {
  const code = (attrs: unknown) => doc({ type: "codeBlock", attrs, content: [text("const a = 1;")] });
  assert.equal(await textOf(code({})), "```\nconst a = 1;\n```");
  assert.equal(await textOf(code({ language: 5 })), "```\nconst a = 1;\n```");
});

test("[happy-18] a quote prefixes each block with > and joins them with single line feeds", async () => {
  const description = doc({ type: "blockquote", content: [p("First"), p("Second")] });
  assert.equal(await textOf(description), "> First\n> Second");
});

test("[happy-18] a quote with one paragraph is one > line", async () => {
  const description = doc({ type: "blockquote", content: [p("Only")] });
  assert.equal(await textOf(description), "> Only");
});

test("[happy-19] a rule becomes --- between blocks", async () => {
  const description = doc(p("Above"), { type: "rule" }, p("Below"));
  assert.equal(await textOf(description), "Above\n\n---\n\nBelow");
});

test("[happy-19] a doc holding only a rule is ---", async () => {
  assert.equal(await textOf(doc({ type: "rule" })), "---");
});

test("[happy-20] media becomes a placeholder naming how many items it holds", async () => {
  assert.equal(
    await textOf(doc({ type: "mediaSingle", content: [{ type: "media", attrs: { id: "m1" } }] })),
    "[media]",
  );
  assert.equal(
    await textOf(doc({ type: "mediaGroup", content: [{ type: "media" }, { type: "media" }, { type: "media" }] })),
    "[media x3]",
  );
});

test("[happy-20] an empty media group names zero items", async () => {
  assert.equal(await textOf(doc({ type: "mediaGroup", content: [] })), "[media x0]");
});

// --- unknown nodes -----------------------------------------------------------------------

test("[unhappy-8] a container or unknown node with text is read through", async () => {
  assert.equal(
    await textOf(doc({ type: "panel", attrs: { panelType: "info" }, content: [p("Note")] })),
    "Note",
  );
  assert.equal(await textOf(doc({ type: "futureThing", text: "Hello" })), "Hello");
});

test("[unhappy-8] an unknown node with empty text uses its children, and one with neither or no type still works", async () => {
  assert.equal(await textOf(doc({ type: "futureThing", text: "", content: [p("Child")] })), "Child");
  assert.equal(await textOf(doc({ type: "futureThing" })), "");
  assert.equal(await textOf(doc({ text: "No type" })), "No type");
});

test("[unhappy-9] children that are not objects are skipped", async () => {
  const description = { type: "doc", content: [42, null, "stray", true, para(null, text("Kept"))] };
  assert.equal(await textOf(description), "Kept");
});

test("[unhappy-9] a doc whose children are all non-objects gives an empty descriptionText", async () => {
  assert.equal(await textOf({ type: "doc", content: [42, null, "stray", true] }), "");
});

// --- depth -------------------------------------------------------------------------------

test("[boundary-12] paragraph text at depth 12 and at depth 49 is read", async () => {
  assert.equal(await textOf(doc(nestedPanels(10, p("Deep")))), "Deep");
  assert.equal(await textOf(doc(nestedPanels(47, p("Deep")))), "Deep");
});

test("[boundary-12] paragraph text at depth 50 and at depth 5002 is dropped", async () => {
  assert.equal(await textOf(doc(nestedPanels(48, p("Deep")))), "");
  assert.equal(await textOf(doc(nestedPanels(5000, p("Deep")))), "");
});

test("[unhappy-10] shallow content survives next to a branch that is too deep", async () => {
  const description = doc(p("Shallow"), nestedPanels(60, p("Deep")));
  assert.equal(await textOf(description), "Shallow");
});

test("[unhappy-10] shallow content on both sides of a too-deep branch survives", async () => {
  const description = doc(p("Shallow"), nestedPanels(60, p("Deep")), p("After"));
  assert.equal(await textOf(description), "Shallow\n\nAfter");
});
