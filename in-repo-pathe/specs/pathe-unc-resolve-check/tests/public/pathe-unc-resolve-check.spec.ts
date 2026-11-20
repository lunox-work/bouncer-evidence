import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { format, normalize, relative, resolve } from "../src/_path";

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

// `resolve` is typed `(...paths: string[])`; the spec passes undefined and null too.
const UNDEFINED = undefined as unknown as string;
const NULL = null as unknown as string;

// --- Rule: base segment matching _UNC_REGEX gives "//" + normalized remainder ---

it("[happy-1] a single backslash or slash UNC argument keeps its prefix", () => {
  expect(resolve(String.raw`\\server\share`)).toBe("//server/share");
  expect(resolve("//server/share")).toBe("//server/share");
  expect(resolve(String.raw`\\server\share\file`)).toBe("//server/share/file");
  expect(resolve("//server/share/file")).toBe("//server/share/file");
  expect(resolve(String.raw`\\server/share/file`)).toBe("//server/share/file");
});

it("[happy-1] a single UNC argument with only a server or with redundant segments keeps its prefix", () => {
  expect(resolve("//server")).toBe("//server");
  expect(resolve("//server//share///x/")).toBe("//server/share/x");
  expect(resolve("//server/share/./a/../b")).toBe("//server/share/b");
});

it("[boundary-1] a trailing separator after a UNC path is dropped", () => {
  expect(resolve("//server/share/")).toBe("//server/share");
});

it("[boundary-1] a trailing backslash after a UNC path is dropped", () => {
  // Follows from boundary-1 together with the forward-slash rule.
  expect(resolve("\\\\server\\share\\")).toBe("//server/share");
});

it("[boundary-2] a bare UNC prefix gives a bare //", () => {
  expect(resolve("//")).toBe("//");
  expect(resolve(String.raw`\\`)).toBe("//");
});

it("[boundary-2] climbing out of a UNC path to an empty remainder gives a bare //", () => {
  expect(resolve("//server/share", "../..")).toBe("//");
});

// --- Rule: forward slashes always, including the prefix ---

it("[happy-2] a backslash UNC base with a backslash relative segment comes back with //", () => {
  expect(resolve(String.raw`\\server\share\file`, String.raw`..\path`)).toBe("//server/share/path");
});

it("[happy-2] mixed-separator UNC bases come back with //", () => {
  expect(resolve(String.raw`\\server/share/file`, "../path")).toBe("//server/share/path");
  expect(resolve(String.raw`//server\share\file`, String.raw`..\path`)).toBe("//server/share/path");
});

// --- Rule: relative segments after a UNC base resolve under it ---

it("[happy-3] a relative segment joins onto a UNC base", () => {
  expect(resolve(String.raw`\\server\share\file`, String.raw`..\path`)).toBe("//server/share/path");
  expect(resolve("//server/share/file", "../path")).toBe("//server/share/path");
});

it("[happy-3] several relative segments and dot segments join onto a UNC base", () => {
  expect(resolve("//server/share/a", "b", "../c")).toBe("//server/share/a/c");
  expect(resolve("//server/share", "./a/./b")).toBe("//server/share/a/b");
});

it("[boundary-3] empty, undefined and null segments after a UNC base are skipped", () => {
  expect(resolve("//server/share", "", UNDEFINED, NULL, "x")).toBe("//server/share/x");
});

it("[boundary-3] trailing empty, undefined and null segments after a UNC base are skipped", () => {
  // Skipped segments contribute nothing, so the result is that of the UNC base alone.
  expect(resolve("//server/share", "", UNDEFINED, NULL)).toBe("//server/share");
});

// --- Rule: ".." can climb above share and server ---

it("[boundary-4] a single .. removes the share component", () => {
  expect(resolve("//server/share", "..")).toBe("//server");
});

it("[boundary-4] .. inside the base, and climbing past the server, are not clamped", () => {
  expect(resolve("//server/share/..", "x")).toBe("//server/x");
  expect(resolve("//server/share", "../../..")).toBe("//");
});

// --- Rule: UNC status comes from the base segment only ---

it("[happy-4] a later absolute posix segment drops the UNC prefix", () => {
  expect(resolve("//server/share", "/tmp/file")).toBe("/tmp/file");
});

it("[happy-4] a later drive or backslash-rooted segment drops the UNC prefix", () => {
  expect(resolve("//server/share", String.raw`C:\foo`)).toBe("C:/foo");
  expect(resolve(String.raw`\\server\share`, String.raw`\tmp`)).toBe("/tmp");
});

it("[happy-5] a UNC segment after an earlier posix absolute segment becomes the base", () => {
  expect(resolve("/foo", "//server/share", "x")).toBe("//server/share/x");
});

it("[happy-5] a UNC segment after a drive or another UNC segment becomes the base", () => {
  expect(resolve(String.raw`C:\foo`, String.raw`\\server\share`, "x")).toBe("//server/share/x");
  expect(resolve("//server/share", String.raw`\\other\s2`, "f")).toBe("//other/s2/f");
});

it("[boundary-5] a / root joined to a relative segment is not UNC", () => {
  expect(resolve("/", "foo")).toBe("/foo");
  expect(resolve("\\", String.raw`foo\bar`)).toBe("/foo/bar");
});

it("[boundary-5] a / root followed by an absolute segment is not UNC", () => {
  expect(resolve("/", "/path")).toBe("/path");
});

// --- Rule: three or more leading separators collapse to exactly "//" ---

it("[boundary-6] three leading slashes collapse to exactly //", () => {
  expect(resolve("///a")).toBe("//a");
});

it("[boundary-6] three leading backslashes with doubled inner separators collapse to exactly //", () => {
  expect(resolve(String.raw`\\\a\\b`)).toBe("//a/b");
});

// --- Rule: the UNC test applies to whichever segment ends the walk ---

it("[happy-6] a UNC working directory gives a UNC result for a relative argument", () => {
  setCwd(String.raw`\\server\share\dir`);
  expect(resolve("a")).toBe("//server/share/dir/a");
  setCwd("//server/share/dir");
  expect(resolve("a")).toBe("//server/share/dir/a");
});

it("[happy-6] a UNC working directory with .., no arguments, or a relative //. segment", () => {
  setCwd("//server/share/dir");
  expect(resolve("..", "x")).toBe("//server/share/x");
  expect(resolve()).toBe("//server/share/dir");
  setCwd("//server/share");
  expect(resolve("//./x")).toBe("//server/share/x");
});

it("[happy-7] an absolute non-UNC argument ignores a UNC working directory", () => {
  setCwd("//server/share/dir");
  expect(resolve("/x")).toBe("/x");
});

it("[happy-7] an absolute drive argument ignores a UNC working directory", () => {
  // Follows from the rule that a later absolute non-UNC segment drops the prefix,
  // and from absolute-argument results not depending on the working directory.
  setCwd("//server/share/dir");
  expect(resolve("//server/share", String.raw`C:\foo`)).toBe("C:/foo");
});

it("[boundary-7] a UNC argument ignores a non-UNC working directory", () => {
  setCwd(String.raw`C:\Windows\path\only`);
  expect(resolve("//server/share")).toBe("//server/share");
});

it("[boundary-7] a UNC argument ignores a posix working directory", () => {
  // Scenarios with an absolute argument return the same result under any working directory.
  setCwd("/home/user");
  expect(resolve("//server/share")).toBe("//server/share");
});

it("[boundary-8] a relative //. segment against a non-UNC working directory gets no prefix", () => {
  setCwd(String.raw`C:\Windows\path\only`);
  expect(resolve(String.raw`\\.\c:\temp\file`, String.raw`..\path`)).toBe(
    "C:/Windows/path/only/c:/temp/path",
  );
});

it("[unhappy-1] with an empty working directory a relative //. segment ends the walk and gets //", () => {
  setCwd("");
  expect(resolve("//./c:/temp/file", "../path")).toBe("//c:/temp/path");
});

it("[unhappy-1] with an empty working directory a //. segment that normalizes to nothing gives //", () => {
  setCwd("");
  expect(resolve("//./a", "..")).toBe("//");
  expect(resolve("//.")).toBe("//");
  expect(resolve("//..")).toBe("//..");
});

it("[unhappy-2] with an empty working directory and no UNC segments, . and ./ fall back to .", () => {
  setCwd("");
  expect(resolve(".", "./")).toBe(".");
});

it("[unhappy-2] with an empty working directory and no UNC segments, .. segments are kept", () => {
  setCwd("");
  expect(resolve("..", "..")).toBe("../..");
});

// --- Rule: the "//." device prefix is not kept by resolve ---

it("[boundary-9] resolve drops the . of a //. path where normalize keeps it", () => {
  setCwd("");
  expect(resolve(String.raw`\\.\c:\temp\file`, String.raw`..\path`)).toBe("//c:/temp/path");
  expect(normalize(String.raw`\\.\c:\temp\file\..\path`)).toBe("//./c:/temp/path");
});

it("[boundary-9] resolve on a single forward-slash //. path drops the .", () => {
  setCwd("");
  expect(resolve("//./c:/temp/file", "../path")).toBe("//c:/temp/path");
});

// --- Rule: results without a UNC base are unchanged ---

it("[happy-8] existing posix resolve results stay as they are", () => {
  expect(resolve("/", "/path")).toBe("/path");
  expect(resolve("/foo/bar", "./baz")).toBe("/foo/bar/baz");
  expect(resolve("/foo/bar", "..", ".", "./baz")).toBe("/foo/baz");
  expect(resolve("/foo/bar", "/tmp/file/")).toBe("/tmp/file");
});

it("[happy-8] existing windows resolve results stay as they are", () => {
  expect(resolve(String.raw`C:\foo\bar`, String.raw`.\baz`)).toBe("C:/foo/bar/baz");
  expect(resolve(String.raw`\foo\bar`, "\\tmp\\file\\")).toBe("/tmp/file");
  expect(resolve(String.raw`C:\Windows\path\only`, "../../reports")).toBe("C:/Windows/reports");
});

it("[happy-8] existing resolve results against the working directory stay as they are", () => {
  expect(resolve("wwwroot", "static_files\\png\\", String.raw`..\gif\image.gif`)).toBe(
    "C:/Windows/path/only/wwwroot/static_files/gif/image.gif",
  );
});

// --- Rule: relative and format follow the new resolve result ---

it("[happy-9] format with a UNC root keeps the prefix", () => {
  expect(format({ root: "//server/share", base: "f.txt" })).toBe("//server/share/f.txt");
});

it("[happy-9] format with a backslash UNC root and dir keeps the prefix", () => {
  expect(
    format({
      root: "\\\\server\\share\\",
      dir: String.raw`\\server\share\d`,
      base: "f.txt",
    }),
  ).toBe("//server/share/d/f.txt");
});

it("[happy-10] relative between paths on the same UNC share", () => {
  expect(relative("//server/share/a", "//server/share/b/c")).toBe("../b/c");
});

it("[happy-10] relative between paths on different UNC shares of a server", () => {
  expect(relative("//server/share/a", "//server/other")).toBe("../../other");
});
