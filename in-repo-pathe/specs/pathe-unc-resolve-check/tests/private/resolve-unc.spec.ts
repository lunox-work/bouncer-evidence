import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { normalize, resolve } from "../../src/_path";

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

// ---------------------------------------------------------------------------
// happy-1: a single UNC argument keeps its prefix
// ---------------------------------------------------------------------------

// Extends "[happy-1] a single backslash or slash UNC argument keeps its prefix": other names, deeper paths.
it("[happy-1] single UNC arguments with other server and share names keep the prefix", () => {
  expect(resolve(String.raw`\\fileserver01\public$\docs\report.pdf`)).toBe(
    "//fileserver01/public$/docs/report.pdf",
  );
  expect(resolve("//nas/media/video/2024/clip.mp4")).toBe("//nas/media/video/2024/clip.mp4");
  expect(resolve(String.raw`\\host`)).toBe("//host");
});

// Extends "[happy-1] a single backslash or slash UNC argument keeps its prefix":
// _UNC_REGEX matches two leading separators in any mix, so "\/" and "/\" count too.
it("[happy-1] a UNC prefix written as mixed slash and backslash keeps the prefix", () => {
  expect(resolve(String.raw`\/server/share`)).toBe("//server/share");
  expect(resolve(String.raw`/\server\share\x`)).toBe("//server/share/x");
});

// Shortcut: prepend one more "/" to the old result. The old result for "//c:/temp"
// was "c:/temp" (no leading slash), so that shortcut returns "/c:/temp".
it("[happy-1] a UNC path whose first component looks like a drive keeps the full // prefix", () => {
  expect(resolve("//c:/temp")).toBe("//c:/temp");
  expect(resolve(String.raw`\\c:\temp\file`)).toBe("//c:/temp/file");
});

// Extends "[happy-1] a single UNC argument with only a server or with redundant segments keeps its prefix".
it("[happy-1] a single UNC argument with dot segments and doubled separators normalizes its remainder", () => {
  expect(resolve("//server/share/.")).toBe("//server/share");
  expect(resolve(String.raw`\\server\\share\\\a\.\b\..\c`)).toBe("//server/share/a/c");
  expect(resolve("//server/share/a/b/c/../../d/./e")).toBe("//server/share/a/d/e");
});

// Extends "[happy-1] ...": a long UNC path with many components.
it("[happy-1] a long single UNC argument keeps every component and the prefix", () => {
  const parts = Array.from({ length: 60 }, (_, i) => `dir${i}`);
  expect(resolve(`\\\\server\\share\\${parts.join("\\")}`)).toBe(
    `//server/share/${parts.join("/")}`,
  );
});

// Scenarios with an absolute argument return the same result under any working directory.
it("[happy-1] a single UNC argument gives the same result under a posix or empty working directory", () => {
  setCwd("/home/user");
  expect(resolve(String.raw`\\server\share\file`)).toBe("//server/share/file");
  setCwd("");
  expect(resolve("//server/share/./a/../b")).toBe("//server/share/b");
});

// ---------------------------------------------------------------------------
// boundary-1: a trailing separator after a UNC path is dropped
// ---------------------------------------------------------------------------

// Extends "[boundary-1] a trailing separator after a UNC path is dropped".
it("[boundary-1] several trailing separators after a UNC path are dropped", () => {
  expect(resolve("//server/share///")).toBe("//server/share");
  expect(resolve(String.raw`\\srv\sh\dir\\`)).toBe("//srv/sh/dir");
  expect(resolve("//server/")).toBe("//server");
});

// Extends "[boundary-1] ...": the trailing separator sits on a later relative segment.
it("[boundary-1] a trailing separator on a relative segment after a UNC base is dropped", () => {
  expect(resolve("//server/share", "x/")).toBe("//server/share/x");
  expect(resolve(String.raw`\\server\share`, "a\\b\\")).toBe("//server/share/a/b");
});

it("[boundary-1] a trailing separator on a UNC working directory is dropped", () => {
  setCwd("//server/share/dir/");
  expect(resolve()).toBe("//server/share/dir");
});

// ---------------------------------------------------------------------------
// boundary-2: an empty normalized remainder gives a bare "//"
// ---------------------------------------------------------------------------

// Extends "[boundary-2] a bare UNC prefix gives a bare //": mixed separators.
it("[boundary-2] a bare mixed-separator UNC prefix gives a bare //", () => {
  expect(resolve(String.raw`\/`)).toBe("//");
  expect(resolve("/\\")).toBe("//");
});

// Extends "[boundary-2] climbing out of a UNC path to an empty remainder gives a bare //".
// Shortcut: fold the UNC case into normalize(), which turns an empty absolute path into "/".
it("[boundary-2] other ways of climbing to an empty UNC remainder give a bare //", () => {
  expect(resolve("//server", "..")).toBe("//");
  expect(resolve("//server/share/a", "../../..")).toBe("//");
  expect(resolve(String.raw`\\server\share`, String.raw`..\..`)).toBe("//");
  expect(resolve("//", ".")).toBe("//");
});

it("[boundary-2] a UNC working directory climbed to nothing gives a bare //", () => {
  setCwd("//server/share");
  expect(resolve("../..")).toBe("//");
  setCwd("//");
  expect(resolve()).toBe("//");
});

// ---------------------------------------------------------------------------
// happy-2: backslash and mixed UNC inputs come back with "//"
// ---------------------------------------------------------------------------

// Extends "[happy-2] a backslash UNC base with a backslash relative segment comes back with //".
it("[happy-2] a backslash UNC base with several backslash segments comes back with forward slashes only", () => {
  const result = resolve(String.raw`\\srv\sh`, String.raw`a\b`, String.raw`..\c\d`);
  expect(result).toBe("//srv/sh/a/c/d");
  expect(result.includes("\\")).toBe(false);
});

// Extends "[happy-2] mixed-separator UNC bases come back with //": other mixes.
it("[happy-2] other separator mixes in the base and the relative segments come back with //", () => {
  expect(resolve("//server/share/dir/file", String.raw`..\..\x\y`)).toBe("//server/share/x/y");
  expect(resolve(String.raw`/\server\share/dir`, String.raw`.\sub/f`)).toBe(
    "//server/share/dir/sub/f",
  );
});

// ---------------------------------------------------------------------------
// happy-3: relative segments join onto a UNC base
// ---------------------------------------------------------------------------

// Extends "[happy-3] several relative segments and dot segments join onto a UNC base": more items.
it("[happy-3] many relative segments join onto a UNC base", () => {
  expect(resolve("//server/share", "a", "b", "c", "d")).toBe("//server/share/a/b/c/d");
  expect(resolve("//server/share/a/b/c", "../../d", "./e/../f")).toBe("//server/share/a/d/f");
});

it("[happy-3] forty relative segments join onto a UNC base", () => {
  const segments = Array.from({ length: 40 }, (_, i) => `s${i}`);
  expect(resolve(String.raw`\\server\share`, ...segments)).toBe(
    `//server/share/${segments.join("/")}`,
  );
});

// Shortcut: keep the prefix only when the UNC path is the sole argument.
it("[happy-3] a relative segment after a UNC base keeps the prefix under any working directory", () => {
  setCwd("/home/user");
  expect(resolve("//server/share", "x")).toBe("//server/share/x");
  setCwd("");
  expect(resolve("//server/share/a", "../b")).toBe("//server/share/b");
});

// A relative "//." segment after a UNC base is joined under it; the base keeps the prefix.
it("[happy-3] a relative //. segment after a UNC base joins under it", () => {
  expect(resolve("//server/share", "//./x")).toBe("//server/share/x");
  expect(resolve("//server/share", "a", String.raw`\\.\b`)).toBe("//server/share/a/b");
});

// ---------------------------------------------------------------------------
// boundary-3: empty, undefined and null segments after a UNC base are skipped
// ---------------------------------------------------------------------------

// Extends "[boundary-3] empty, undefined and null segments after a UNC base are skipped": other orders.
it("[boundary-3] empty, undefined and null segments around and between segments are skipped", () => {
  expect(resolve(UNDEFINED, "//server/share", NULL, "", "x", "", UNDEFINED)).toBe(
    "//server/share/x",
  );
  expect(resolve("//server/share", "", "a", NULL, "b", UNDEFINED, "../c")).toBe(
    "//server/share/a/c",
  );
});

it("[boundary-3] only empty, undefined and null arguments fall through to a UNC working directory", () => {
  setCwd("//server/share/dir");
  expect(resolve("", UNDEFINED, NULL)).toBe("//server/share/dir");
});

// ---------------------------------------------------------------------------
// boundary-4: ".." removes share and server components
// ---------------------------------------------------------------------------

// Extends "[boundary-4] .. inside the base, and climbing past the server, are not clamped".
// Shortcut: clamp at //server/share as node's win32 resolve does.
it("[boundary-4] climbing past the server and then descending gives a new first component", () => {
  expect(resolve("//server/share/../../x")).toBe("//x");
  expect(resolve("//server/share", "../../../x")).toBe("//x");
  expect(resolve(String.raw`\\server\share`, String.raw`..\..\..\..\x`)).toBe("//x");
  expect(resolve("//server/share/a", "../../../other/s2")).toBe("//other/s2");
});

it("[boundary-4] .. inside the UNC base and in later segments together climb past the server", () => {
  expect(resolve("//server/share/..", "..")).toBe("//");
  expect(resolve("//server/share/a/..", "..", "y")).toBe("//server/y");
});

it("[boundary-4] .. from a relative argument climbs a UNC working directory past the share", () => {
  setCwd("//server/share/a/b");
  expect(resolve("../../..")).toBe("//server");
  expect(resolve("../../../../z")).toBe("//z");
});

// ---------------------------------------------------------------------------
// happy-4: a later absolute non-UNC segment drops the prefix
// ---------------------------------------------------------------------------

// Extends "[happy-4] a later drive or backslash-rooted segment drops the UNC prefix": other roots and more items.
// (Outcome has no "//" prefix, so it is the same as before the change.)
it("[happy-4] later absolute non-UNC segments followed by relative segments drop the prefix", () => {
  expect(resolve("//server/share", "/")).toBe("/");
  expect(resolve("//server/share", "D:/data", "x")).toBe("D:/data/x");
  expect(resolve(String.raw`\\server\share`, String.raw`c:\x`)).toBe("C:/x");
  expect(resolve("//server/share", "/tmp", "x")).toBe("/tmp/x");
  expect(resolve("/foo", "//server/share", "/bar")).toBe("/bar");
});

// Shortcut: carry the UNC flag over from any UNC segment seen during the walk.
it("[happy-4] a later absolute non-UNC segment drops the prefix even under a UNC working directory", () => {
  setCwd("//server/share/dir");
  expect(resolve("//server/share", "/tmp/file")).toBe("/tmp/file");
  expect(resolve("//a/b", "//c/d", String.raw`\tmp`)).toBe("/tmp");
});

// ---------------------------------------------------------------------------
// happy-5: a UNC segment after earlier absolute segments becomes the base
// ---------------------------------------------------------------------------

// Extends "[happy-5] a UNC segment after a drive or another UNC segment becomes the base": more items.
it("[happy-5] a UNC segment after several absolute segments becomes the base", () => {
  expect(resolve("/a", "/b", "//srv/sh")).toBe("//srv/sh");
  expect(resolve("//one/a", "/mid", "//two/b", "c")).toBe("//two/b/c");
  expect(resolve(String.raw`D:\x`, "/y", String.raw`\\srv\sh\dir`, "..", "f")).toBe("//srv/sh/f");
});

// Shortcut: test only the first argument for UNC.
it("[happy-5] a UNC segment after a relative first argument becomes the base", () => {
  expect(resolve("rel", "//srv/sh", "x")).toBe("//srv/sh/x");
});

// ---------------------------------------------------------------------------
// boundary-5: a "/" root joined to a relative segment is not UNC
// (Outcomes have no "//" prefix, so they are the same as before the change.)
// ---------------------------------------------------------------------------

// Shortcut: test the joined string, which for "/" alone is "//".
it("[boundary-5] a lone / or \\ root is not UNC", () => {
  expect(resolve("/")).toBe("/");
  expect(resolve("\\")).toBe("/");
  expect(resolve("/", "")).toBe("/");
});

// Extends "[boundary-5] a / root joined to a relative segment is not UNC": more segments.
it("[boundary-5] a / root joined to several relative segments is not UNC", () => {
  expect(resolve("/", "a", "b", "c")).toBe("/a/b/c");
  expect(resolve("\\", String.raw`a\b`, "..", "c")).toBe("/a/c");
  expect(resolve("/", "./foo")).toBe("/foo");
});

it("[boundary-5] a / working directory joined to a relative segment is not UNC", () => {
  setCwd("/");
  expect(resolve("foo")).toBe("/foo");
  expect(resolve()).toBe("/");
});

// ---------------------------------------------------------------------------
// boundary-6: three or more leading separators collapse to exactly "//"
// ---------------------------------------------------------------------------

// Extends "[boundary-6] three leading slashes collapse to exactly //": more separators, mixes.
it("[boundary-6] four or five leading separators collapse to exactly //", () => {
  expect(resolve("////a")).toBe("//a");
  expect(resolve("/////a/b/")).toBe("//a/b");
  expect(resolve("\\\\\\\\\\server\\share")).toBe("//server/share");
  expect(resolve(String.raw`/\/a`)).toBe("//a");
});

it("[boundary-6] three leading separators followed by relative segments collapse to exactly //", () => {
  expect(resolve("///a", "b")).toBe("//a/b");
  expect(resolve("///a", "..")).toBe("//");
  expect(resolve("///")).toBe("//");
});

it("[boundary-6] a working directory with three leading separators collapses to exactly //", () => {
  setCwd("///srv/dir");
  expect(resolve("x")).toBe("//srv/dir/x");
});

// ---------------------------------------------------------------------------
// happy-6: a UNC working directory gives a UNC result for relative arguments
// ---------------------------------------------------------------------------

// Extends "[happy-6] a UNC working directory gives a UNC result for a relative argument": more segments.
it("[happy-6] a UNC working directory with several relative arguments", () => {
  setCwd(String.raw`\\srv\sh`);
  expect(resolve("a", "b", "../c")).toBe("//srv/sh/a/c");
  setCwd(String.raw`/\srv\sh`);
  expect(resolve("a")).toBe("//srv/sh/a");
});

// Extends "[happy-6] a UNC working directory with .., no arguments, or a relative //. segment".
it("[happy-6] a UNC working directory with relative //. segments and empty arguments", () => {
  setCwd("//server/share/dir");
  expect(resolve("//./x")).toBe("//server/share/dir/x");
  expect(resolve("a", String.raw`\\.\b`)).toBe("//server/share/dir/a/b");
  expect(resolve("")).toBe("//server/share/dir");
});

// ---------------------------------------------------------------------------
// happy-7: an absolute non-UNC argument ignores a UNC working directory
// (Outcomes have no "//" prefix, so they are the same as before the change.)
// ---------------------------------------------------------------------------

// Extends "[happy-7] an absolute non-UNC argument ignores a UNC working directory": other roots and segments.
it("[happy-7] drive, root and backslash-rooted arguments ignore a UNC working directory", () => {
  setCwd("//server/share/dir");
  expect(resolve(String.raw`C:\foo`, "bar")).toBe("C:/foo/bar");
  expect(resolve("/")).toBe("/");
  expect(resolve("/x", "..", "y")).toBe("/y");
  expect(resolve("a", "/x")).toBe("/x");
  expect(resolve("\\x")).toBe("/x");
});

// ---------------------------------------------------------------------------
// boundary-7: a UNC argument ignores a non-UNC working directory
// ---------------------------------------------------------------------------

// Extends "[boundary-7] a UNC argument ignores a posix working directory": other working directories.
it("[boundary-7] a UNC argument ignores empty, drive and other UNC working directories", () => {
  setCwd("");
  expect(resolve("//server/share")).toBe("//server/share");
  setCwd(String.raw`D:\data`);
  expect(resolve("//server/share", "a")).toBe("//server/share/a");
  setCwd("//other/x");
  expect(resolve(String.raw`\\server\share\f`)).toBe("//server/share/f");
});

// ---------------------------------------------------------------------------
// boundary-8: a relative "//." segment against a non-UNC working directory gets no prefix
// (Outcomes have no "//" prefix, so they are the same as before the change.)
// ---------------------------------------------------------------------------

// Extends "[boundary-8] a relative //. segment against a non-UNC working directory gets no prefix".
it("[boundary-8] relative //. segments against posix and drive working directories get no prefix", () => {
  setCwd("/home/user");
  expect(resolve("//./x")).toBe("/home/user/x");
  setCwd(String.raw`D:\work`);
  expect(resolve(String.raw`\\.\c:\temp`, "f")).toBe("D:/work/c:/temp/f");
});

// Shortcut: set the UNC flag on any UNC segment seen during the walk and never clear it.
it("[boundary-8] a relative //. segment after an absolute non-UNC argument gets no prefix", () => {
  expect(resolve("/foo", "//./x")).toBe("/foo/x");
  expect(resolve(String.raw`C:\foo`, String.raw`\\.\x`)).toBe("C:/foo/x");
});

// With an empty working directory the walk ends at "a", which is not UNC.
it("[boundary-8] a relative //. segment that does not end the walk gets no prefix", () => {
  setCwd("");
  expect(resolve("a", "//./b")).toBe("a/b");
});

// ---------------------------------------------------------------------------
// unhappy-1: with an empty working directory, a relative "//." segment ends the walk
// ---------------------------------------------------------------------------

// Extends "[unhappy-1] with an empty working directory a relative //. segment ends the walk and gets //".
it("[unhappy-1] with an empty working directory longer //. segments end the walk and get //", () => {
  setCwd("");
  expect(resolve("//./a/b/c", "../d")).toBe("//a/b/d");
  expect(resolve(String.raw`\\.\x\y`)).toBe("//x/y");
  expect(resolve("//./a", "b")).toBe("//a/b");
});

// Extends "[unhappy-1] with an empty working directory a //. segment that normalizes to nothing gives //".
// The walk ends at a relative segment, so ".." above it is kept.
it("[unhappy-1] with an empty working directory .. above a //. segment is kept after //", () => {
  setCwd("");
  expect(resolve("//./a", "../..")).toBe("//..");
  expect(resolve("//..", "..")).toBe("//../..");
});

it("[unhappy-1] with an empty working directory the first of several //. segments ends the walk", () => {
  setCwd("");
  expect(resolve("//./a", "//./b")).toBe("//a/b");
  expect(resolve("//./a", "", NULL, UNDEFINED)).toBe("//a");
});

// ---------------------------------------------------------------------------
// unhappy-2: the empty working directory fallback is unchanged without UNC segments
// (Outcomes have no "//" prefix, so they are the same as before the change.)
// ---------------------------------------------------------------------------

// Extends "[unhappy-2] with an empty working directory and no UNC segments, . and ./ fall back to .".
it("[unhappy-2] with an empty working directory, other segments that cancel out fall back to .", () => {
  setCwd("");
  expect(resolve("a", "..")).toBe(".");
  expect(resolve()).toBe(".");
  expect(resolve("./a/b", "../..")).toBe(".");
});

// Extends "[unhappy-2] with an empty working directory and no UNC segments, .. segments are kept".
it("[unhappy-2] with an empty working directory, relative segments stay relative", () => {
  setCwd("");
  expect(resolve("..", "..", "..")).toBe("../../..");
  expect(resolve("a", "b")).toBe("a/b");
  expect(resolve(String.raw`a\b`, String.raw`..\..\..\c`)).toBe("../c");
});

// ---------------------------------------------------------------------------
// boundary-9: resolve differs from normalize on a "//." path
// ---------------------------------------------------------------------------

// Extends "[boundary-9] resolve drops the . of a //. path where normalize keeps it": other paths.
it("[boundary-9] resolve drops the . of other //. paths where normalize keeps it", () => {
  setCwd("");
  expect(resolve("//./x/y")).toBe("//x/y");
  expect(normalize("//./x/y")).toBe("//./x/y");
  expect(resolve(String.raw`\\.\pipe\name`)).toBe("//pipe/name");
  expect(normalize(String.raw`\\.\pipe\name`)).toBe("//./pipe/name");
});

// ---------------------------------------------------------------------------
// happy-8: existing resolve results stay as they are
// (Outcomes have no "//" prefix, so they are the same as before the change.)
// ---------------------------------------------------------------------------

// Extends "[happy-8] existing posix resolve results stay as they are".
it("[happy-8] other posix resolve results stay as they are", () => {
  expect(resolve("/a/b/c", "../../d")).toBe("/a/d");
  expect(resolve("/foo", "bar", "/baz", "qux")).toBe("/baz/qux");
  expect(resolve(String.raw`\foo\..\..\x`)).toBe("/x");
});

// Extends "[happy-8] existing resolve results against the working directory stay as they are".
it("[happy-8] other resolve results against the working directory stay as they are", () => {
  expect(resolve("foo")).toBe("C:/Windows/path/only/foo");
  expect(resolve()).toBe("C:/Windows/path/only");
  setCwd("/home/user");
  expect(resolve("a", "../b")).toBe("/home/user/b");
  expect(resolve()).toBe("/home/user");
});
