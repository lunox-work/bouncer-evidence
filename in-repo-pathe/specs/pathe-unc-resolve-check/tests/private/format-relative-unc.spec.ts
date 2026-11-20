import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { format, relative } from "../../src/_path";

// Background: unless a test says otherwise, process.cwd returns "C:\Windows\path\only".
let originalCwd: typeof process.cwd;

beforeEach(() => {
  originalCwd = process.cwd;
  process.cwd = vi.fn(() => String.raw`C:\Windows\path\only`);
});

afterEach(() => {
  process.cwd = originalCwd;
});

function setCwd(value: string) {
  process.cwd = vi.fn(() => value);
}

// ---------------------------------------------------------------------------
// happy-9: format with a UNC root keeps the prefix
// ---------------------------------------------------------------------------

// Extends "[happy-9] format with a UNC root keeps the prefix": name + ext instead of base.
it("[happy-9] format with a backslash UNC root and name and ext keeps the prefix", () => {
  expect(format({ root: String.raw`\\srv\sh`, name: "report", ext: "pdf" })).toBe(
    "//srv/sh/report.pdf",
  );
  expect(format({ root: "//srv/sh", name: "notes", ext: ".md" })).toBe("//srv/sh/notes.md");
});

// Extends "[happy-9] format with a backslash UNC root and dir keeps the prefix": deeper and relative dirs.
it("[happy-9] format with a UNC root and a deeper or relative dir keeps the prefix", () => {
  expect(format({ root: "//srv/sh/", dir: "//srv/sh/a/b", base: "c.txt" })).toBe(
    "//srv/sh/a/b/c.txt",
  );
  expect(format({ root: "//srv/sh", dir: "sub/dir", base: "x" })).toBe("//srv/sh/sub/dir/x");
});

// format follows resolve: the base segment decides, so a UNC dir after a "/" root keeps the
// prefix, and an absolute non-UNC dir after a UNC root drops it.
it("[happy-9] format takes the UNC prefix from the segment resolve stops at", () => {
  expect(format({ root: "/", dir: "//srv/sh", base: "f" })).toBe("//srv/sh/f");
  expect(format({ root: "//srv/sh", dir: "/tmp", base: "f" })).toBe("/tmp/f");
});

// ---------------------------------------------------------------------------
// happy-10: relative between UNC paths
// (The relative path between two UNC paths is the same whether or not resolve keeps
// the prefix, so these outcomes match the behaviour before the change.)
// ---------------------------------------------------------------------------

// Extends "[happy-10] relative between paths on the same UNC share": deeper paths, other separators.
it("[happy-10] relative between deeper paths on the same UNC share", () => {
  expect(relative("//server/share/a/b/c", "//server/share/a/x")).toBe("../../x");
  expect(relative(String.raw`\\server\share\a`, "//server/share/a/b")).toBe("b");
  expect(relative("//server/share/a", "//server/share/a")).toBe("");
});

// Extends "[happy-10] relative between paths on different UNC shares of a server": different servers.
it("[happy-10] relative between paths on different UNC servers", () => {
  expect(relative("//s1/share/a", "//s2/share/a")).toBe("../../../s2/share/a");
});

it("[happy-10] relative between relative arguments under a UNC working directory", () => {
  setCwd("//server/share/dir");
  expect(relative("a", "b")).toBe("../b");
  expect(relative("a/b", "//server/share/x")).toBe("../../../x");
});
