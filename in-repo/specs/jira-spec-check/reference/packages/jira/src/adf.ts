/**
 * Atlassian Document Format (ADF) to plain, Markdown-like text.
 *
 * Jira Cloud sends an issue's description as an ADF tree on `/rest/api/3`, and
 * as a plain string on older endpoints and some server configurations. Both
 * become one string here, so the spec read and its fingerprint do not care
 * which one arrived.
 *
 * Like `mapping.ts`, everything is defensive: the tree is client content that
 * this package does not control, so an unknown node is read through rather than
 * rejected, a non-object child is skipped, a missing attribute falls back, and
 * nothing here throws.
 *
 * Two bounds keep a hostile or broken document cheap to read:
 *
 * - Depth. Nothing deeper than `MAX_DEPTH` is visited, so text in a paragraph
 *   is read only while its text node is at depth 49 or less (the document is
 *   depth 0; each `content` level adds one). Deeper branches are dropped
 *   silently, and a 10,000-level chain costs 50 stack frames, not 10,000.
 * - Length. The result is capped at `MAX_TEXT_LENGTH` UTF-16 code units, with
 *   `TRUNCATED` appended past that.
 */

/** The deepest node that is read. A text node at this depth is still read. */
const MAX_DEPTH = 49;

/** The cap on the returned text, in UTF-16 code units. */
const MAX_TEXT_LENGTH = 20_000;

/** Appended to text cut at the cap, so a reader can tell it was cut. */
const TRUNCATED = "\n[truncated]";

/** Blocks are separated by one blank line. */
const BLOCK_SEPARATOR = "\n\n";

/** How far an item's later blocks are indented under its marker. */
const LIST_INDENT = "  ";

type AdfNode = Record<string, unknown>;

function isNode(value: unknown): value is AdfNode {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A node's `content`, or nothing when it is missing or not an array. */
function childrenOf(node: AdfNode): readonly unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

/** A node's `attrs`, or an empty object when it is missing or not an object. */
function attrsOf(node: AdfNode): AdfNode {
  return isNode(node.attrs) ? node.attrs : {};
}

function stringAttr(node: AdfNode, name: string): string | undefined {
  const value = attrsOf(node)[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * Turns a description into plain text: an ADF document is rendered block by
 * block, a plain string is tidied, and anything else is `""`. The result is
 * capped at 20,000 UTF-16 code units.
 */
export function adfToText(document: unknown): string {
  let text: string;
  if (typeof document === "string") {
    text = tidyPlainText(document);
  } else if (isNode(document)) {
    text = blocksOf(document, 0).join(BLOCK_SEPARATOR);
  } else {
    text = "";
  }
  return capText(text);
}

/**
 * A plain-string description keeps its line feeds, has each run of other
 * whitespace (spaces, tabs, `\r`) replaced by one space, and is trimmed.
 */
function tidyPlainText(text: string): string {
  return text.replace(/[^\S\n]+/g, " ").trim();
}

/** Keeps the first 20,000 code units, marking the cut. May split a surrogate pair. */
function capText(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? text.slice(0, MAX_TEXT_LENGTH) + TRUNCATED
    : text;
}

/* -------------------------------------------------------------------------- */
/* Block level                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The blocks of each object in `nodes`, which sit at `depth`. Every block has
 * its trailing whitespace removed, and blocks left empty are dropped.
 */
function blocksOfAll(nodes: readonly unknown[], depth: number): string[] {
  const blocks: string[] = [];
  for (const node of nodes) {
    if (isNode(node)) {
      blocks.push(...blocksOf(node, depth));
    }
  }
  return blocks;
}

/** The blocks one block-level node at `depth` renders to, already tidied. */
function blocksOf(node: AdfNode, depth: number): string[] {
  if (depth > MAX_DEPTH) {
    return [];
  }
  return renderBlock(node, depth)
    .map((block) => block.trimEnd())
    .filter((block) => block !== "");
}

function renderBlock(node: AdfNode, depth: number): string[] {
  const inner = depth + 1;
  switch (node.type) {
    case "paragraph":
      return [inlineText(childrenOf(node), inner)];
    case "heading":
      return renderHeading(node, inner);
    case "bulletList":
      return renderList(node, inner, () => "- ");
    case "orderedList": {
      const start = orderOf(node);
      return renderList(node, inner, (index) => `${start + index}. `);
    }
    case "taskList":
      return renderTaskList(node, inner);
    case "table":
      return renderTable(node, inner);
    case "codeBlock": {
      const language = stringAttr(node, "language") ?? "";
      return [
        "```" + language + "\n" + inlineText(childrenOf(node), inner) + "\n```",
      ];
    }
    case "blockquote":
      return renderQuote(node, inner);
    case "rule":
      return ["---"];
    case "mediaSingle":
      return ["[media]"];
    case "mediaGroup":
      return [`[media x${childrenOf(node).filter(isNode).length}]`];
    default:
      // Unknown and container nodes (doc, panel, expand, layouts, a
      // block-level card, whatever Atlassian adds next): their own text if
      // they carry any, otherwise whatever their children render to.
      if (typeof node.text === "string" && node.text !== "") {
        return [node.text];
      }
      return blocksOfAll(childrenOf(node), inner);
  }
}

/** `#` per level, clamped to 1–6. A heading with no text is dropped. */
function renderHeading(node: AdfNode, inner: number): string[] {
  const text = inlineText(childrenOf(node), inner);
  if (text.trim() === "") {
    return [];
  }
  return ["#".repeat(headingLevel(node)) + " " + text];
}

/** `attrs.level` as a number or numeric string, clamped to 1–6; otherwise 1. */
function headingLevel(node: AdfNode): number {
  const raw = attrsOf(node).level;
  let level = Number.NaN;
  if (typeof raw === "number") {
    level = raw;
  } else if (typeof raw === "string" && raw.trim() !== "") {
    level = Number(raw);
  }
  if (!Number.isFinite(level)) {
    return 1;
  }
  return Math.min(6, Math.max(1, Math.trunc(level)));
}

/** The first number of an ordered list: a numeric `attrs.order`, or 1. */
function orderOf(node: AdfNode): number {
  const order = attrsOf(node).order;
  return typeof order === "number" && Number.isFinite(order)
    ? Math.trunc(order)
    : 1;
}

/**
 * Each list item is its own run of blocks: the first behind the marker, the
 * later ones indented under it. Objects that are not list items are read like
 * any other block.
 */
function renderList(
  node: AdfNode,
  inner: number,
  marker: (index: number) => string,
): string[] {
  const blocks: string[] = [];
  let index = 0;
  for (const child of childrenOf(node)) {
    if (!isNode(child)) {
      continue;
    }
    if (child.type !== "listItem") {
      blocks.push(...blocksOf(child, inner));
      continue;
    }
    const itemMarker = marker(index);
    index += 1;
    const itemBlocks = blocksOfAll(childrenOf(child), inner + 1);
    itemBlocks.forEach((block, position) => {
      blocks.push(
        position === 0
          ? itemMarker + indentLines(block, LIST_INDENT, false)
          : indentLines(block, LIST_INDENT, true),
      );
    });
  }
  return blocks;
}

/** A task item is a checkbox block, ticked only when its state is exactly `DONE`. */
function renderTaskList(node: AdfNode, inner: number): string[] {
  const blocks: string[] = [];
  for (const child of childrenOf(node)) {
    if (!isNode(child)) {
      continue;
    }
    if (child.type !== "taskItem") {
      blocks.push(...blocksOf(child, inner));
      continue;
    }
    const text = inlineText(childrenOf(child), inner + 1).trimEnd();
    if (text.trim() === "") {
      continue;
    }
    const box = stringAttr(child, "state") === "DONE" ? "[x]" : "[ ]";
    blocks.push(`- ${box} ` + indentLines(text, LIST_INDENT, false));
  }
  return blocks;
}

/** Each row is one pipe-separated block; a cell's blocks are joined by one space. */
function renderTable(node: AdfNode, inner: number): string[] {
  const rows: string[] = [];
  for (const row of childrenOf(node)) {
    if (!isNode(row)) {
      continue;
    }
    const cells: string[] = [];
    for (const cell of childrenOf(row)) {
      if (isNode(cell)) {
        cells.push(blocksOfAll(childrenOf(cell), inner + 2).join(" "));
      }
    }
    if (cells.length > 0) {
      rows.push("| " + cells.join(" | ") + " |");
    }
  }
  return rows;
}

/** Each block of a quote has `> ` on every line; the blocks are joined by single line feeds. */
function renderQuote(node: AdfNode, inner: number): string[] {
  const lines = blocksOfAll(childrenOf(node), inner)
    .join("\n")
    .split("\n")
    .map((line) => (line === "" ? ">" : "> " + line));
  return lines.length === 0 ? [] : [lines.join("\n")];
}

/**
 * Indents every non-empty line of `block` by `indent`, leaving empty lines
 * empty so no trailing whitespace is introduced. With `first` false the first
 * line is left alone, for a block that already sits behind a marker.
 */
function indentLines(block: string, indent: string, first: boolean): string {
  return block
    .split("\n")
    .map((line, index) =>
      (index === 0 && !first) || line === "" ? line : indent + line,
    )
    .join("\n");
}

/* -------------------------------------------------------------------------- */
/* Inline level                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The text of inline `nodes` at `depth`, joined as written. Marks are ignored
 * and spacing is kept; only plain-string descriptions are whitespace-tidied.
 */
function inlineText(nodes: readonly unknown[], depth: number): string {
  if (depth > MAX_DEPTH) {
    return "";
  }
  let text = "";
  for (const node of nodes) {
    if (isNode(node)) {
      text += inlineNodeText(node, depth);
    }
  }
  return text;
}

function inlineNodeText(node: AdfNode, depth: number): string {
  switch (node.type) {
    case "text":
      return typeof node.text === "string" ? node.text : "";
    case "hardBreak":
      return "\n";
    case "mention": {
      const label = stringAttr(node, "text");
      return label === undefined || label === "" ? "@unknown" : label;
    }
    case "emoji":
      return stringAttr(node, "shortName") ?? "";
    case "inlineCard":
      return stringAttr(node, "url") ?? "";
    case "date":
      return stringAttr(node, "timestamp") ?? "";
    case "status": {
      const text = inlineText(childrenOf(node), depth + 1);
      return text !== "" ? text : (stringAttr(node, "text") ?? "");
    }
    default:
      if (typeof node.text === "string" && node.text !== "") {
        return node.text;
      }
      return inlineText(childrenOf(node), depth + 1);
  }
}
