import { test } from "node:test";
import assert from "node:assert/strict";
import { reverseMapDiff, type NameTable } from "../../src/index.js";

function header(path = "src/main.ts"): string {
  return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n`;
}

// Extends public "hunk content: whole-word identifiers are mapped in context, removed, added lines and the @@ text".
test("[happy-3] several identifiers map at every occurrence across multiple hunk ranges and suffixes", () => {
  const table: NameTable = [
    { kind: "identifier", public: "Parcel", real: "Shipment" },
    { kind: "identifier", public: "Box", real: "Container" },
    { kind: "identifier", public: "openBox", real: "unpack" },
  ];
  const diff = header() + [
    "@@ -123,2 +456,2 @@ function openBox(Parcel, Box) {",
    " Parcel a = Box.make(Parcel);",
    "-openBox(Parcel, Box);",
    "+openBox(Box, Parcel, Parcel);",
    "@@ -900 +1000 @@ Parcel Box openBox",
    "-Box(Parcel)",
    "+Parcel(Box)",
    "",
  ].join("\n");
  const expected = header() + [
    "@@ -123,2 +456,2 @@ function unpack(Shipment, Container) {",
    " Shipment a = Container.make(Shipment);",
    "-unpack(Shipment, Container);",
    "+unpack(Container, Shipment, Shipment);",
    "@@ -900 +1000 @@ Shipment Container unpack",
    "-Container(Shipment)",
    "+Shipment(Container)",
    "",
  ].join("\n");
  assert.equal(reverseMapDiff(diff, table).diff, expected);
});

// Extends public "hunk content: words containing the public name are left, while it is mapped at line edges".
test("[happy-3] whole words map beside punctuation but not inside longer identifier words", () => {
  const table: NameTable = [{ kind: "identifier", public: "Token", real: "Lexeme" }];
  const input = header() + [
    "@@ -1,2 +1,2 @@ Token(Token)",
    " MyToken TokenList Tokens Token2 2Token _Token Token_ Token_Token",
    "-Token + Token.Token(Token); [Token] {Token}",
    "+Token,Token;Token:Token = !Token ? Token : Token",
    "",
  ].join("\n");
  const expected = header() + [
    "@@ -1,2 +1,2 @@ Lexeme(Lexeme)",
    " MyToken TokenList Tokens Token2 2Token _Token Token_ Token_Token",
    "-Lexeme + Lexeme.Lexeme(Lexeme); [Lexeme] {Lexeme}",
    "+Lexeme,Lexeme;Lexeme:Lexeme = !Lexeme ? Lexeme : Lexeme",
    "",
  ].join("\n");
  assert.equal(reverseMapDiff(input, table).diff, expected);
});

test("[happy-3] header-like added and removed code stays hunk content and path entries do not rewrite code", () => {
  const table: NameTable = [
    { kind: "path", public: "visible", real: "original" },
    { kind: "identifier", public: "Mask", real: "Actual" },
  ];
  const diff = header("visible/file.ts") + [
    "@@ -1,4 +1,4 @@ Mask",
    "--- a/visible/Mask.ts",
    "-const p = 'visible/Mask.ts';",
    "+++ b/visible/Mask.ts",
    "+const p = 'visible/Mask.ts';",
    " rename from visible/Mask.ts",
    " diff --git a/visible/Mask.ts b/visible/Mask.ts",
    "",
  ].join("\n");
  const expected = header("original/file.ts") + [
    "@@ -1,4 +1,4 @@ Actual",
    "--- a/visible/Actual.ts",
    "-const p = 'visible/Actual.ts';",
    "+++ b/visible/Actual.ts",
    "+const p = 'visible/Actual.ts';",
    " rename from visible/Actual.ts",
    " diff --git a/visible/Actual.ts b/visible/Actual.ts",
    "",
  ].join("\n");
  const result = reverseMapDiff(diff, table);
  assert.equal(result.diff, expected);
  assert.deepEqual(result.unmapped, []);
});

test("[happy-3] identifiers in file names and index metadata are preserved while code words map", () => {
  const table: NameTable = [{ kind: "identifier", public: "abcdef0", real: "Revision" }];
  const diff = "diff --git a/abcdef0.ts b/abcdef0.ts\n" +
    "index abcdef0..fedcba9 100644\n--- a/abcdef0.ts\n+++ b/abcdef0.ts\n" +
    "@@ -1 +1 @@ abcdef0\n-abcdef0\n+abcdef0(abcdef0)\n";
  const expected = "diff --git a/abcdef0.ts b/abcdef0.ts\n" +
    "index abcdef0..fedcba9 100644\n--- a/abcdef0.ts\n+++ b/abcdef0.ts\n" +
    "@@ -1 +1 @@ Revision\n-Revision\n+Revision(Revision)\n";
  assert.equal(reverseMapDiff(diff, table).diff, expected);
});

test("[happy-3] dozens of identifier entries and repeated long lines map across two files", () => {
  const table: NameTable = Array.from({ length: 48 }, (_, i) => ({
    kind: "identifier" as const, public: `Word${i}`, real: `Original${i}`,
  })).reverse();
  const publicWords = Array.from({ length: 48 }, (_, i) => `Word${i}`).join(", ");
  const realWords = Array.from({ length: 48 }, (_, i) => `Original${i}`).join(", ");
  const untouched = " Word0List PreWord47 Word12Word13";
  const inputBody = `@@ -1,2 +1,2 @@ Word47\n ${publicWords}\n-${publicWords}\n+${publicWords}${untouched}\n`;
  const expectedBody = `@@ -1,2 +1,2 @@ Original47\n ${realWords}\n-${realWords}\n+${realWords}${untouched}\n`;
  const result = reverseMapDiff(header("a.ts") + inputBody + header("b.ts") + inputBody, table);
  assert.equal(result.diff, header("a.ts") + expectedBody + header("b.ts") + expectedBody);
});

// Extends public "one pass: a replaced name is not replaced again".
test("[boundary-3] a six-name chain substitutes original tokens once throughout a hunk", () => {
  const table: NameTable = [
    { kind: "identifier", public: "Six", real: "Five" },
    { kind: "identifier", public: "Five", real: "Four" },
    { kind: "identifier", public: "Four", real: "Three" },
    { kind: "identifier", public: "Three", real: "Two" },
    { kind: "identifier", public: "Two", real: "One" },
    { kind: "identifier", public: "One", real: "Zero" },
  ];
  const body = "@@ -1,2 +1,2 @@ Six(One)\n One Two Three Four Five Six\n-Six(Five, Four)\n+Three(Two, One, Six)\n";
  const expected = "@@ -1,2 +1,2 @@ Five(Zero)\n Zero One Two Three Four Five\n-Five(Four, Three)\n+Two(One, Zero, Five)\n";
  assert.equal(reverseMapDiff(header() + body, table).diff, header() + expected);
});

// Extends public "one pass: the result does not depend on table order".
test("[boundary-3] cyclic identifier mappings work in every table permutation", () => {
  const entries: NameTable = [
    { kind: "identifier", public: "North", real: "East" },
    { kind: "identifier", public: "East", real: "South" },
    { kind: "identifier", public: "South", real: "North" },
  ];
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const diff = header() + "@@ -1 +1 @@ North\n-East(South, North)\n+South(North, East, South)\n";
  const expected = header() + "@@ -1 +1 @@ East\n-South(North, East)\n+North(East, South, North)\n";
  for (const order of orders) {
    assert.equal(reverseMapDiff(diff, order.map((i) => entries[i]!)).diff, expected);
  }
});

test("[boundary-3] swaps and identity entries remain one pass across successive files and hunks", () => {
  const table: NameTable = [
    { kind: "identifier", public: "Left", real: "Right" },
    { kind: "identifier", public: "Right", real: "Left" },
    { kind: "identifier", public: "Stay", real: "Stay" },
  ];
  const inputBody = "@@ -1 +1 @@ Left\n-Left(Right, Stay)\n+Right(Left, Stay)\n" +
    "@@ -10 +10 @@ Right\n-Right\n+Left\n";
  const expectedBody = "@@ -1 +1 @@ Right\n-Right(Left, Stay)\n+Left(Right, Stay)\n" +
    "@@ -10 +10 @@ Left\n-Left\n+Right\n";
  assert.equal(
    reverseMapDiff(header("first.ts") + inputBody + header("second.ts") + inputBody, table).diff,
    header("first.ts") + expectedBody + header("second.ts") + expectedBody,
  );
});

test("[happy-3] distinct case spellings are separate identifier words", () => {
  const table: NameTable = [
    { kind: "identifier", public: "Node", real: "Vertex" },
    { kind: "identifier", public: "node", real: "vertex" },
  ];
  const diff = header() + "@@ -1 +1 @@ NODE Node node\n-Node(node, NODE)\n+node(Node, nOdE)\n";
  const expected = header() + "@@ -1 +1 @@ NODE Vertex vertex\n-Vertex(vertex, NODE)\n+vertex(Vertex, nOdE)\n";
  assert.equal(reverseMapDiff(diff, table).diff, expected);
});
