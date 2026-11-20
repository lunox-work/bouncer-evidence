import { expect, test } from "vitest";
import { withBase } from "../../src/utils";

// Extends "[boundary-9] withBase no longer resolves .. in its input":
// several "..", ".." in the middle, a base with a trailing slash.
test("[boundary-9] withBase keeps every .. in its input literally", () => {
  expect(withBase("a/../b", "/x")).toBe("/x/a/../b");
  expect(withBase("../../a", "/x/y/")).toBe("/x/y/../../a");
  expect(withBase("..", "/base")).toBe("/base/..");
});

// Extends "[boundary-9] withBase joins input onto base with a single slash":
// doubled slashes in the input are not collapsed, only one leading "/" is removed.
test("[boundary-9] withBase strips only one leading slash and keeps inner doubled slashes", () => {
  expect(withBase("//a", "/base")).toBe("/base//a");
  expect(withBase("a//b", "/x")).toBe("/x/a//b");
  expect(withBase("./a", "/x")).toBe("/x/a");
  expect(withBase("a/", "/base/")).toBe("/base/a/");
});
