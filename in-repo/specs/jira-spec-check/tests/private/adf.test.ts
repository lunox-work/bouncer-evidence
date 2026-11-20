import assert from "node:assert/strict";
import { test } from "node:test";

import { toIssueSpec } from "../../src/spec.js";

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

function bullets(...items: unknown[]): Record<string, unknown> {
  return { type: "bulletList", content: items };
}

function heading(level: unknown, ...content: unknown[]): Record<string, unknown> {
  return { type: "heading", attrs: { level }, content };
}

/** `count` nested wrapper nodes, cycling through `types`, the innermost holding `inner`. */
function nested(count: number, inner: unknown, types: string[] = ["panel"]): Record<string, unknown> {
  let node: unknown = inner;
  for (let i = 0; i < count; i++) {
    node = { type: types[i % types.length], content: [node] };
  }
  return node as Record<string, unknown>;
}

// --- paragraphs and inline content ------------------------------------------------

// Extends "[happy-9] paragraphs become blocks separated by a blank line, empty ones dropped":
// more paragraphs, in order, with empty and whitespace-only ones in several places.
test("[happy-9] many paragraphs keep their order and drop every empty one", async () => {
  const description = doc(
    para(),
    p("One"),
    p("   "),
    p("Two\t "),
    para(),
    para(),
    p("Three"),
    para(text("Four"), text("   ")),
    p("Five"),
    p(" \t"),
  );
  assert.equal(await textOf(description), "One\n\nTwo\n\nThree\n\nFour\n\nFive");
});

// Extends "[happy-9] a doc of only empty paragraphs gives an empty descriptionText".
test("[happy-9] paragraphs with no content key, empty text nodes or tab-only text give an empty descriptionText", async () => {
  const description = doc({ type: "paragraph" }, para(text("")), para(text("\t\t"), text(" ")));
  assert.equal(await textOf(description), "");
});

// Extends "[happy-10] text runs are joined as they are, ignoring marks and keeping their
// spacing": other marks, more runs, and inner spacing in a later block.
test("[happy-10] many runs with code, underline and colour marks are joined with their spacing kept", async () => {
  const description = doc(
    p("Intro"),
    para(
      text("Run  "),
      text("the", [{ type: "code" }]),
      text("\t"),
      text("tests", [{ type: "underline" }, { type: "textColor", attrs: { color: "#ff0000" } }]),
      text("   then "),
      text("ship", [{ type: "strike" }, { type: "subsup", attrs: { type: "sub" } }]),
      text("!"),
    ),
  );
  assert.equal(await textOf(description), "Intro\n\nRun  the\ttests   then ship!");
});

// Extends "[happy-10]": text runs inside a heading are joined the same way, marks ignored.
test("[happy-10] text runs with marks in a heading are joined with their spacing kept", async () => {
  const description = doc(heading(2, text("Big  "), text("goal", [{ type: "em" }]), text(" here")));
  assert.equal(await textOf(description), "## Big  goal here");
});

// Extends "[happy-11] a hard break becomes a line feed inside its block": several breaks, a
// break in a heading, and a break in a later paragraph.
test("[happy-11] several hard breaks become line feeds inside their own block", async () => {
  const description = doc(
    para(text("A"), { type: "hardBreak" }, { type: "hardBreak" }, text("B"), { type: "hardBreak" }, text("C")),
    heading(1, text("Goal"), { type: "hardBreak" }, text("More")),
  );
  assert.equal(await textOf(description), "A\n\nB\nC\n\n# Goal\nMore");
});

// Extends "[happy-11] a hard break at the end of a block is trailing whitespace and is removed".
test("[happy-11] several trailing hard breaks are removed with the block's trailing whitespace", async () => {
  const description = doc(
    para(text("First"), { type: "hardBreak" }, { type: "hardBreak" }, text("  ")),
    p("Second"),
  );
  assert.equal(await textOf(description), "First\n\nSecond");
});

// Extends "[happy-12] inline references with their attribute contribute their label": several
// references in one paragraph, and labels that are not the stated examples.
test("[happy-12] several inline references in one paragraph each contribute their label", async () => {
  const description = doc(
    para(
      text("Ask "),
      { type: "mention", attrs: { id: "1", text: "@Grace" } },
      text(" and "),
      { type: "mention", attrs: { id: "2", text: "@Linus" } },
      text(" "),
      { type: "emoji", attrs: { shortName: ":rocket:" } },
      text(" by "),
      { type: "date", attrs: { timestamp: "1767225600000" } },
      text(" re "),
      { type: "inlineCard", attrs: { url: "https://example.test/x" } },
      text(" status "),
      { type: "status", content: [text("IN REVIEW")] },
    ),
  );
  assert.equal(
    await textOf(description),
    "Ask @Grace and @Linus :rocket: by 1767225600000 re https://example.test/x status IN REVIEW",
  );
});

// Extends "[happy-12] inline references with their attribute contribute their label": an emoji
// carrying both shortName and text contributes its shortName.
test("[happy-12] an emoji with both shortName and text contributes its shortName", async () => {
  const description = doc(para(text("Ask "), { type: "emoji", attrs: { shortName: ":tada:", text: "🎉", id: "1f389" } }, text(" now")));
  assert.equal(await textOf(description), "Ask :tada: now");
});

// Extends "[happy-12] inline references missing their attribute fall back": references with no
// attrs at all.
test("[happy-12] inline references with no attrs at all fall back", async () => {
  const cases: Array<[unknown, string]> = [
    [{ type: "mention" }, "Ask @unknown now"],
    [{ type: "emoji" }, "Ask  now"],
    [{ type: "inlineCard" }, "Ask  now"],
    [{ type: "date", attrs: {} }, "Ask  now"],
  ];
  for (const [node, expected] of cases) {
    assert.equal(await textOf(doc(para(text("Ask "), node, text(" now")))), expected, JSON.stringify(node));
  }
});

// Extends "[happy-12]": inline references inside a heading and a list item.
test("[happy-12] inline references contribute their label inside headings and list items", async () => {
  const description = doc(
    heading(3, text("For "), { type: "mention", attrs: { id: "1", text: "@Ada" } }),
    bullets(listItem(para(text("See "), { type: "inlineCard", attrs: { url: "https://acme.atlassian.net/browse/PROJ-9" } }))),
  );
  assert.equal(await textOf(description), "### For @Ada\n\n- See https://acme.atlassian.net/browse/PROJ-9");
});

// Extends "[happy-13] a block card at block level contributes nothing": between blocks and
// repeated, it leaves no empty block or stray separator.
test("[happy-13] block cards between and around blocks leave no trace", async () => {
  const card = { type: "blockCard", attrs: { url: "https://acme.atlassian.net/browse/PROJ-2" } };
  const description = doc(card, p("Above"), card, card, p("Below"), card);
  assert.equal(await textOf(description), "Above\n\nBelow");
});

// --- headings ----------------------------------------------------------------------

// Extends "[boundary-9] headings get one # per level for levels 1 through 6": levels 3 to 5,
// which the visible cases skip.
test("[boundary-9] headings at levels 3, 4 and 5 get that many #", async () => {
  assert.equal(await textOf(doc(heading(3, text("Goal")))), "### Goal");
  assert.equal(await textOf(doc(heading(4, text("Goal")))), "#### Goal");
  assert.equal(await textOf(doc(heading(5, text("Goal")))), "##### Goal");
});

// Extends "[boundary-9] heading levels are clamped, numeric strings read, and anything else is
// level 1": other out-of-range numbers and numeric strings.
test("[boundary-9] other out-of-range levels clamp and other numeric strings are read", async () => {
  assert.equal(await textOf(doc(heading(7, text("Goal")))), "###### Goal");
  assert.equal(await textOf(doc(heading(100, text("Goal")))), "###### Goal");
  assert.equal(await textOf(doc(heading(-3, text("Goal")))), "# Goal");
  assert.equal(await textOf(doc(heading("5", text("Goal")))), "##### Goal");
  assert.equal(await textOf(doc(heading("10", text("Goal")))), "###### Goal");
  assert.equal(await textOf(doc(heading(null, text("Goal")))), "# Goal");
  assert.equal(await textOf(doc({ type: "heading", content: [text("Goal")] })), "# Goal");
});

// Extends "[boundary-9]": several headings of different levels are separate blocks.
test("[boundary-9] headings of several levels in one doc each get their own markers", async () => {
  const description = doc(heading(1, text("Title")), p("Intro"), heading(4, text("Detail")), heading(8, text("Deep")));
  assert.equal(await textOf(description), "# Title\n\nIntro\n\n#### Detail\n\n###### Deep");
});

// Extends "[boundary-10] a heading with no content is dropped": between paragraphs, with no
// attrs, or holding only an empty text node or non-objects.
test("[boundary-10] headings with no text anywhere in a doc are dropped", async () => {
  const description = doc(
    p("A"),
    { type: "heading", attrs: { level: 2 } },
    { type: "heading" },
    p("B"),
    heading(3, text("")),
    heading(1, null, 42),
    p("C"),
  );
  assert.equal(await textOf(description), "A\n\nB\n\nC");
});

// --- lists -----------------------------------------------------------------------------

// Extends "[happy-14] bullet list items are - blocks, with an item's later blocks indented two
// spaces": three levels of nesting, so indentation accumulates.
test("[happy-14] three levels of bullet nesting indent two spaces per level", async () => {
  const description = doc(bullets(listItem(p("A"), bullets(listItem(p("B"), bullets(listItem(p("C"))))))));
  assert.equal(await textOf(description), "- A\n\n  - B\n\n    - C");
});

// Extends "[happy-14] a bullet list with one single-paragraph item is one - block": many items,
// mixed with items holding several blocks.
test("[happy-14] many bullet items each become a - block, later blocks indented", async () => {
  const description = doc(
    bullets(
      listItem(p("One")),
      listItem(p("Two"), p("two b"), p("two c")),
      listItem(p("Three")),
      listItem(p("Four"), bullets(listItem(p("Four a")), listItem(p("Four b")))),
      listItem(p("Five")),
    ),
  );
  assert.equal(
    await textOf(description),
    "- One\n\n- Two\n\n  two b\n\n  two c\n\n- Three\n\n- Four\n\n  - Four a\n\n  - Four b\n\n- Five",
  );
});

// Extends "[happy-14]": a bullet list between paragraphs, and an ordered list nested in a bullet.
test("[happy-14] a bullet list between paragraphs, holding a nested ordered list", async () => {
  const description = doc(
    p("Before"),
    bullets(listItem(p("Item"), { type: "orderedList", content: [listItem(p("Step one")), listItem(p("Step two"))] })),
    p("After"),
  );
  assert.equal(await textOf(description), "Before\n\n- Item\n\n  1. Step one\n\n  2. Step two\n\nAfter");
});

// Extends "[boundary-11] ordered list items start at a numeric attrs.order": other start
// numbers and more items, so a two-item lookup is not enough.
test("[boundary-11] ordered lists number every item on from a numeric attrs.order", async () => {
  const ordered = (attrs: unknown, ...labels: string[]) =>
    doc({ type: "orderedList", attrs, content: labels.map((l) => listItem(p(l))) });
  assert.equal(await textOf(ordered({ order: 7 }, "A", "B", "C")), "7. A\n\n8. B\n\n9. C");
  assert.equal(await textOf(ordered({ order: 10 }, "Alpha", "Beta")), "10. Alpha\n\n11. Beta");
  assert.equal(await textOf(ordered({ order: 2 }, "Only")), "2. Only");
});

// Extends "[boundary-11] ordered list items are numbered from 1 when attrs.order is absent":
// a long list with no attrs key at all reaches two-digit numbers.
test("[boundary-11] a twelve-item ordered list with no attrs numbers 1 to 12", async () => {
  const labels = Array.from({ length: 12 }, (_, i) => `Item ${i + 1}`);
  const description = doc({ type: "orderedList", content: labels.map((l) => listItem(p(l))) });
  assert.equal(await textOf(description), labels.map((l, i) => `${i + 1}. ${l}`).join("\n\n"));
});

// Extends "[boundary-11] ... and from 1 otherwise": other non-numeric orders.
test("[boundary-11] boolean and object orders number from 1", async () => {
  for (const order of [true, {}, { value: 3 }]) {
    const description = doc({ type: "orderedList", attrs: { order }, content: [listItem(p("Alpha")), listItem(p("Beta"))] });
    assert.equal(await textOf(description), "1. Alpha\n\n2. Beta", JSON.stringify(order));
  }
});

// Extends "[happy-15] task items become checkboxes, ticked only when state is DONE": more items,
// other orders, other state values and inline content.
test("[happy-15] many task items in mixed order are ticked only for DONE", async () => {
  const item = (state: unknown, ...content: unknown[]) =>
    state === undefined ? { type: "taskItem", content } : { type: "taskItem", attrs: { state }, content };
  const description = doc({
    type: "taskList",
    content: [
      item("TODO", text("One")),
      item("DONE", text("Two "), text("done", [{ type: "strong" }])),
      item(null, text("Three")),
      item("DONE", text("Ask "), { type: "mention", attrs: { id: "1", text: "@Ada" } }),
      item(true, text("Five")),
      item(" DONE", text("Six")),
      item(undefined, text("Seven")),
    ],
  });
  assert.equal(
    await textOf(description),
    "- [ ] One\n\n- [x] Two done\n\n- [ ] Three\n\n- [x] Ask @Ada\n\n- [ ] Five\n\n- [ ] Six\n\n- [ ] Seven",
  );
});

// Extends "[happy-15]": a task list between paragraphs.
test("[happy-15] a task list between paragraphs keeps blocks separated by blank lines", async () => {
  const description = doc(
    p("Todo:"),
    { type: "taskList", content: [{ type: "taskItem", attrs: { state: "DONE" }, content: [text("Done")] }] },
    p("End"),
  );
  assert.equal(await textOf(description), "Todo:\n\n- [x] Done\n\nEnd");
});

// --- tables, code, quotes, rules, media ------------------------------------------------

// Extends "[happy-16] table rows become pipe-separated blocks, a cell's blocks joined by one
// space": three columns, three rows, a cell of three paragraphs.
test("[happy-16] a three-by-three table gives three pipe-separated rows", async () => {
  const row = (cellType: string, ...cells: unknown[][]) => ({
    type: "tableRow",
    content: cells.map((blocks) => ({ type: cellType, content: blocks })),
  });
  const description = doc({
    type: "table",
    attrs: { isNumberColumnEnabled: false, layout: "default" },
    content: [
      row("tableHeader", [p("Name")], [p("Role")], [p("Notes")]),
      row("tableCell", [p("Ada")], [p("Eng")], [p("First"), p("of"), p("many")]),
      row("tableCell", [p("Grace")], [para(text("Admiral", [{ type: "strong" }]))], [p("Navy")]),
    ],
  });
  assert.equal(
    await textOf(description),
    "| Name | Role | Notes |\n\n| Ada | Eng | First of many |\n\n| Grace | Admiral | Navy |",
  );
});

// Extends "[happy-16] a one-row, one-cell table": a table between paragraphs.
test("[happy-16] a table between paragraphs is its own run of row blocks", async () => {
  const description = doc(
    p("Before"),
    { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [p("X")] }, { type: "tableCell", content: [p("Y")] }] }] },
    p("After"),
  );
  assert.equal(await textOf(description), "Before\n\n| X | Y |\n\nAfter");
});

// Extends "[happy-17] a code block with a string language is fenced with it": other languages,
// multi-line code, several text nodes, and an empty-string language.
test("[happy-17] code blocks with other languages and multi-line content are fenced", async () => {
  const code = (attrs: unknown, ...content: unknown[]) => doc({ type: "codeBlock", attrs, content });
  assert.equal(
    await textOf(code({ language: "python" }, text("def f():\n    return 1"))),
    "```python\ndef f():\n    return 1\n```",
  );
  assert.equal(await textOf(code({ language: "sql" }, text("SELECT 1"), text(" FROM t;"))), "```sql\nSELECT 1 FROM t;\n```");
  assert.equal(await textOf(code({ language: "" }, text("x"))), "```\nx\n```");
});

// Extends "[happy-17] a code block with no or a non-string language is fenced bare": other
// non-string languages and a missing attrs key, between paragraphs.
test("[happy-17] code blocks with null, boolean or missing attrs are fenced bare between blocks", async () => {
  for (const attrs of [{ language: null }, { language: true }, { language: ["ts"] }, undefined]) {
    const block = attrs === undefined ? { type: "codeBlock", content: [text("x = 1")] } : { type: "codeBlock", attrs, content: [text("x = 1")] };
    assert.equal(await textOf(doc(p("Intro"), block, p("Outro"))), "Intro\n\n```\nx = 1\n```\n\nOutro", JSON.stringify(attrs));
  }
});

// Extends "[happy-18] a quote prefixes each block with > and joins them with single line feeds":
// more blocks, an empty paragraph among them, and the quote between other blocks.
test("[happy-18] a quote of several blocks between paragraphs gives > lines joined by single line feeds", async () => {
  const description = doc(
    p("Intro"),
    { type: "blockquote", content: [p("One"), para(), p("Two"), p("Three")] },
    p("Outro"),
  );
  assert.equal(await textOf(description), "Intro\n\n> One\n> Two\n> Three\n\nOutro");
});

// Extends "[happy-18] a quote with one paragraph is one > line": two quotes in a row are two blocks.
test("[happy-18] two quotes in a row are separate blocks", async () => {
  const description = doc({ type: "blockquote", content: [p("A")] }, { type: "blockquote", content: [p("B"), p("C")] });
  assert.equal(await textOf(description), "> A\n\n> B\n> C");
});

// Extends "[happy-19] a rule becomes --- between blocks": rules at both ends and in a row.
test("[happy-19] rules at the start, end and in a row each become ---", async () => {
  const rule = { type: "rule" };
  assert.equal(await textOf(doc(rule, p("Mid"), rule)), "---\n\nMid\n\n---");
  assert.equal(await textOf(doc(p("A"), rule, rule, p("B"))), "A\n\n---\n\n---\n\nB");
});

// Extends "[happy-20] media becomes a placeholder naming how many items it holds": other counts,
// and media between paragraphs.
test("[happy-20] media groups of other sizes name their counts", async () => {
  const group = (n: number) => doc({ type: "mediaGroup", content: Array.from({ length: n }, (_, i) => ({ type: "media", attrs: { id: `m${i}` } })) });
  assert.equal(await textOf(group(2)), "[media x2]");
  assert.equal(await textOf(group(5)), "[media x5]");
  assert.equal(await textOf(group(12)), "[media x12]");
});

// Extends "[happy-20] media becomes a placeholder": mediaSingle and mediaGroup between other blocks.
test("[happy-20] media placeholders sit between other blocks as their own blocks", async () => {
  const description = doc(
    p("A"),
    { type: "mediaSingle", attrs: { layout: "center" }, content: [{ type: "media", attrs: { id: "m1", type: "file" } }] },
    p("B"),
    { type: "mediaGroup", content: [{ type: "media" }, { type: "media" }] },
  );
  assert.equal(await textOf(description), "A\n\n[media]\n\nB\n\n[media x2]");
});

// --- unknown nodes -----------------------------------------------------------------------

// Extends "[unhappy-8] an unknown node with empty text uses its children": a node with both
// non-empty text and children contributes its text only.
test("[unhappy-8] an unknown node with its own text uses the text, not its children", async () => {
  const description = doc({ type: "futureThing", text: "Own", content: [p("Child")] });
  assert.equal(await textOf(description), "Own");
});

// Extends "[unhappy-8] a container or unknown node with text is read through": unknown and
// container nodes with several children, nested in one another.
test("[unhappy-8] nested containers and unknown nodes are read through to all their blocks", async () => {
  const description = doc(
    {
      type: "layoutSection",
      content: [
        { type: "layoutColumn", attrs: { width: 50 }, content: [p("Left"), heading(2, text("Sub"))] },
        { type: "layoutColumn", attrs: { width: 50 }, content: [{ type: "expand", attrs: { title: "More" }, content: [p("Hidden")] }] },
      ],
    },
    { type: "futureThing", content: [p("A"), { type: "otherThing", text: "B" }, p("C")] },
  );
  assert.equal(await textOf(description), "Left\n\n## Sub\n\nHidden\n\nA\n\nB\n\nC");
});

// Extends "[unhappy-8] an unknown node with empty text uses its children": a non-string text
// is not its own text, so the children are used.
test("[unhappy-8] an unknown node whose text is not a string uses its children", async () => {
  assert.equal(await textOf(doc({ type: "futureThing", text: 42, content: [p("Child")] })), "Child");
  assert.equal(await textOf(doc({ type: "futureThing", text: null, content: [p("Child")] })), "Child");
});

// Extends "[unhappy-8]": an unknown node's own text has trailing whitespace removed like any block.
test("[unhappy-8] an unknown node's text is a block with trailing whitespace removed", async () => {
  assert.equal(await textOf(doc(p("Before"), { type: "futureThing", text: "Hello \t " }, p("After"))), "Before\n\nHello\n\nAfter");
});

// Extends "[unhappy-9] children that are not objects are skipped": non-objects inside lists,
// list items, tables, quotes and paragraphs.
test("[unhappy-9] non-object children are skipped at every level", async () => {
  const description = doc(
    { type: "bulletList", content: [null, 7, listItem("x", p("Item"), false), "y"] },
    { type: "blockquote", content: [undefined, p("Quoted"), 0] },
    {
      type: "table",
      content: [null, { type: "tableRow", content: ["z", { type: "tableCell", content: [null, p("Cell")] }] }],
    },
    para(42, "stray", text("Para"), null, true),
  );
  assert.equal(await textOf(description), "- Item\n\n> Quoted\n\n| Cell |\n\nPara");
});

// Extends "[unhappy-9] a doc whose children are all non-objects gives an empty descriptionText":
// other non-object values, and a container holding only non-objects.
test("[unhappy-9] containers holding only non-object children contribute nothing", async () => {
  const description = doc(0, "", false, { type: "panel", content: [null, 1, "a"] }, p("Kept"), { type: "futureThing", content: [true] });
  assert.equal(await textOf(description), "Kept");
});

// --- depth -------------------------------------------------------------------------------

// Extends "[boundary-12] paragraph text at depth 12 and at depth 49 is read": the limit is on
// depth, not on how many panels wrap the text, so other wrapper types count the same.
test("[boundary-12] text at depth 49 under mixed wrapper types is read, at depth 50 it is dropped", async () => {
  const types = ["panel", "expand", "futureThing", "nestedExpand"];
  assert.equal(await textOf(doc(nested(47, p("Deep"), types))), "Deep");
  assert.equal(await textOf(doc(nested(48, p("Deep"), types))), "");
});

// Extends "[boundary-12] paragraph text at depth 12 and at depth 49 is read": other depths
// on either side of the limit.
test("[boundary-12] text at depths 2, 30 and 48 is read; at depths 51 and 100 it is dropped", async () => {
  assert.equal(await textOf(doc(p("Deep"))), "Deep");
  assert.equal(await textOf(doc(nested(28, p("Deep")))), "Deep");
  assert.equal(await textOf(doc(nested(46, p("Deep")))), "Deep");
  assert.equal(await textOf(doc(nested(49, p("Deep")))), "");
  assert.equal(await textOf(doc(nested(98, p("Deep")))), "");
});

// Extends "[boundary-12] paragraph text at depth 50 and at depth 5002 is dropped": a wide doc,
// so a limit on the number of nodes rather than their depth reads too little.
test("[boundary-12] many shallow paragraphs and one at depth 49 after them are all read", async () => {
  const shallow = Array.from({ length: 300 }, (_, i) => p(`P${i}`));
  const description = doc(...shallow, nested(47, p("Deep")));
  const expected = [...shallow.map((_, i) => `P${i}`), "Deep"].join("\n\n");
  assert.equal(await textOf(description), expected);
});

// Extends "[boundary-12]": depth counts list nodes too; a list item's paragraph text at depth
// 49 is read and at depth 50 dropped.
test("[boundary-12] depth counts bullet lists and list items like any other node", async () => {
  // doc(0) > bulletList(1) > listItem(2) > ... each pair adds two levels.
  const chain = (pairs: number, inner: unknown) => {
    let node: unknown = inner;
    for (let i = 0; i < pairs; i++) node = bullets(listItem(node));
    return node;
  };
  // 23 pairs (46 levels) + 1 panel puts the paragraph at 48 and its text at 49.
  const at49 = await textOf(doc(chain(23, { type: "panel", content: [p("Deep")] })));
  assert.match(at49, /Deep$/);
  // 24 pairs (48 levels) puts the paragraph at 49 and its text at 50.
  const at50 = await textOf(doc(chain(24, p("Deep"))));
  assert.equal(at50.includes("Deep"), false);
});

// Extends "[unhappy-10] shallow content on both sides of a too-deep branch survives": a far
// deeper branch, inside a list item, and next to a branch read at depth 49.
test("[unhappy-10] shallow and depth-49 content survive next to a very deep branch", async () => {
  const description = doc(
    p("Shallow"),
    nested(10000, p("Too deep")),
    nested(47, p("Edge")),
    bullets(listItem(p("Top"), nested(60, p("Deep")))),
    p("After"),
  );
  assert.equal(await textOf(description), "Shallow\n\nEdge\n\n- Top\n\nAfter");
});

// Extends "[unhappy-10] shallow content survives next to a branch that is too deep": the whole
// spec still resolves, with the hash of the shallow text only.
test("[unhappy-10] a too-deep branch leaves summary, other fields and hash intact", async () => {
  const spec = await toIssueSpec("PROJ-1", {
    summary: "Fix login",
    description: doc(p("Users can sign in."), nested(60, p("Deep"), ["panel", "expand"])),
    issuetype: { name: "Bug" },
  });
  assert.equal(spec.descriptionText, "Users can sign in.");
  assert.equal(spec.issueType, "Bug");
  assert.equal(spec.specHash, "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34");
});
