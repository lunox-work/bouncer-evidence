import { expect, test } from "vitest";
import { joinURL } from "../../src/utils";

// `undefined` / `null` passed through a cast, as test/join.test.ts does.
const UNDEF = undefined as unknown as string;
const NULL = null as unknown as string;

type Row = { args: string[]; out: string };

function checkJoinURL(rows: Row[]) {
  for (const { args, out } of rows) {
    const [base, ...input] = args;
    expect(joinURL(base, ...input), JSON.stringify(args)).toBe(out);
  }
}

// Extends "[happy-1] joinURL joins segments with single slashes":
// more segments, a protocol base with a trailing slash, mixed prefixes.
test("[happy-1] joinURL joins many mixed segments onto a protocol base", () => {
  checkJoinURL([
    {
      args: ["https://example.com", "api", "/v1/", "./users", "42"],
      out: "https://example.com/api/v1/users/42",
    },
    { args: ["http://x.com/", "/a/", "b"], out: "http://x.com/a/b" },
    { args: ["a", "b", "c", "d", "e", "f"], out: "a/b/c/d/e/f" },
    { args: ["f", "e", "d"], out: "f/e/d" },
  ]);
});

// Extends "[happy-1] joinURL joins segments with single slashes":
// the content of each segment past its first prefix is appended literally,
// so inner "//" and "." pieces are not normalized.
test("[happy-1] joinURL keeps the inner content of segments as written", () => {
  checkJoinURL([
    { args: ["a//b", "c"], out: "a//b/c" },
    { args: ["a/./b", "c"], out: "a/./b/c" },
    { args: ["a", "b//c"], out: "a/b//c" },
    { args: ["a", "b/./c"], out: "a/b/./c" },
  ]);
});

// Extends "[happy-1] joinURL does not double the slash when both sides carry one":
// a base ending in several slashes gets no extra slash appended.
test("[happy-1] joinURL appends no slash when the accumulated URL already ends in one", () => {
  checkJoinURL([
    { args: ["a//", "b"], out: "a//b" },
    { args: ["a//", "/b"], out: "a//b" },
    { args: ["http://x.com/", "./a"], out: "http://x.com/a" },
    { args: ["/", "/a/", "/b"], out: "/a/b" },
  ]);
});

// Extends "[happy-2] joinURL returns a base alone unchanged":
// bases the old resolving join would have rewritten.
test("[happy-2] joinURL returns a base alone unchanged even when it has .., . or doubled slashes", () => {
  checkJoinURL([
    { args: ["a//"], out: "a//" },
    { args: ["//"], out: "//" },
    { args: ["http://x.com/"], out: "http://x.com/" },
    { args: ["./a/../b"], out: "./a/../b" },
    { args: ["../a"], out: "../a" },
    { args: ["."], out: "." },
    { args: ["/a/./b/"], out: "/a/./b/" },
  ]);
});

// Extends "[boundary-1] joinURL treats an undefined or null base as empty":
// the first kept segment is used as written, even with "//" or "../".
test("[boundary-1] joinURL with a falsy base uses the first segment exactly as written", () => {
  checkJoinURL([
    { args: [NULL], out: "" },
    { args: [UNDEF, "//b"], out: "//b" },
    { args: [NULL, "../a"], out: "../a" },
    { args: [UNDEF, "./x/", "y"], out: "./x/y" },
  ]);
});

// Extends "[boundary-1] joinURL with an empty-string base keeps the first segment as written":
// a dropped "/" right after a falsy base does not seed the URL with "/".
test("[boundary-1] joinURL with a falsy base does not take a leading slash from a skipped / segment", () => {
  checkJoinURL([
    { args: [UNDEF, "/", "a"], out: "a" },
    { args: [NULL, "/", "/", "b"], out: "b" },
    { args: ["", "/", "a", "b"], out: "a/b" },
  ]);
});

// Extends "[boundary-2] joinURL skips empty, undefined and bare-slash segments":
// null segments, runs of skipped segments, and a trailing "/" segment.
test("[boundary-2] joinURL skips null and runs of skipped segments", () => {
  checkJoinURL([
    { args: ["a", NULL, "", UNDEF, "/", "b"], out: "a/b" },
    { args: ["a", "/", "/", "/"], out: "a" },
    { args: ["a//", "/"], out: "a//" },
    { args: [UNDEF, "/"], out: "" },
    { args: ["/", "/"], out: "/" },
  ]);
});

// Extends "[boundary-2] joinURL never filters the base, and only skipped segments leave it as is":
// a bare "/" as the last segment is skipped, so it adds no trailing slash.
test("[boundary-2] joinURL adds no trailing slash for a final bare / segment", () => {
  checkJoinURL([
    { args: ["a", "b", "/"], out: "a/b" },
    { args: ["/a", "b", "/", ""], out: "/a/b" },
  ]);
});

// Extends "[boundary-2] joinURL skips empty, undefined and bare-slash segments":
// "//" and "./" are not dropped by the filter.
test("[boundary-2] joinURL keeps // and ./ segments past the filter", () => {
  checkJoinURL([
    { args: ["a", "//", "b"], out: "a//b" },
    { args: ["a", "./", "b"], out: "a/b" },
    { args: ["", "./", "a"], out: "./a" },
  ]);
});

// Extends "[boundary-3] joinURL strips only one leading slash or ./ from a segment":
// longer runs of slashes, "/./" and "././" prefixes.
test("[boundary-3] joinURL strips exactly one leading prefix from longer runs", () => {
  checkJoinURL([
    { args: ["a", "///b"], out: "a///b" },
    { args: ["a", "/./b"], out: "a/./b" },
    { args: ["a", "././b"], out: "a/./b" },
    { args: ["a/", "//b"], out: "a//b" },
    { args: ["a", ".//"], out: "a//" },
    { args: ["a/", "./"], out: "a/" },
  ]);
});

// Extends "[boundary-3] joinURL leaves a trailing slash for a ./ segment and does not strip a bare dot":
// dot-led segments that are not "./" keep every character.
test("[boundary-3] joinURL does not strip dots that are not part of a leading ./", () => {
  checkJoinURL([
    { args: ["a", ".", "b"], out: "a/./b" },
    { args: ["a", "./."], out: "a/." },
    { args: ["a", ".b"], out: "a/.b" },
    { args: ["a", ".../b"], out: "a/.../b" },
    { args: ["a", "./", "./b"], out: "a/b" },
  ]);
});

// Extends "[boundary-4] joinURL keeps the prefix of the first segment after an empty base":
// "//" and "../" prefixes, and the first segment after skipped ones.
test("[boundary-4] joinURL keeps any prefix of the first segment while the URL is still empty", () => {
  checkJoinURL([
    { args: ["", "//b"], out: "//b" },
    { args: ["", "../a", "./b"], out: "../a/b" },
    { args: ["", "", "/", "./a", "b"], out: "./a/b" },
    { args: ["", ".", "a"], out: "./a" },
  ]);
});

// Extends "[boundary-4] joinURL strips the prefix of later segments after an empty base":
// several later segments, each with a prefix.
test("[boundary-4] joinURL strips the prefix of every later segment after an empty base", () => {
  checkJoinURL([
    { args: ["", "", "./a", "/b", "./c"], out: "./a/b/c" },
    { args: [UNDEF, "./a/", "/b"], out: "./a/b" },
    { args: ["", "./", "./a"], out: "./a" },
    { args: [NULL, "/x", "//y"], out: "/x//y" },
  ]);
});

// Extends "[unhappy-1] joinURL appends .. segments literally":
// leading "..", ".." inside a segment, "./../".
test("[unhappy-1] joinURL keeps .. at the start, inside and after ./ in segments", () => {
  checkJoinURL([
    { args: ["..", "a"], out: "../a" },
    { args: ["a", "b/..", "c"], out: "a/b/../c" },
    { args: ["a", "./../b"], out: "a/../b" },
    { args: ["/a/", "../../"], out: "/a/../../" },
  ]);
});

// Extends "[unhappy-1] joinURL does not resolve multiple .. pieces":
// more ".." segments than path pieces.
test("[unhappy-1] joinURL keeps more .. segments than there are pieces", () => {
  checkJoinURL([
    { args: ["/a/b", "..", "..", ".."], out: "/a/b/../../.." },
    { args: ["/a", "../../../d"], out: "/a/../../../d" },
    { args: ["../a", "../../../../b"], out: "../a/../../../../b" },
  ]);
});

// Extends "[boundary-5] joinURL keeps the last segment's trailing slash":
// doubled trailing slashes, several trailing-slashed segments, protocol base.
test("[boundary-5] joinURL keeps a doubled trailing slash and every earlier trailing slash", () => {
  checkJoinURL([
    { args: ["a", "b//"], out: "a/b//" },
    { args: ["/", "./foo/", "bar/"], out: "/foo/bar/" },
    { args: ["http://x.com/", "a/"], out: "http://x.com/a/" },
    { args: ["a", "b//", "/"], out: "a/b//" },
  ]);
});

// Extends "[boundary-5] joinURL adds no trailing slash when the last segment has none":
// earlier segments end in "/" but the last does not.
test("[boundary-5] joinURL adds no trailing slash after earlier slashed segments", () => {
  checkJoinURL([
    { args: ["a/", "b/", "c"], out: "a/b/c" },
    { args: ["http://x.com/", "a/", "b"], out: "http://x.com/a/b" },
  ]);
});

// Extends "[unhappy-2] joinURL puts the joining slash after a query in the base":
// a longer query and several segments.
test("[unhappy-2] joinURL appends every segment after the query of the base", () => {
  checkJoinURL([
    {
      args: ["http://x.com/p?q=1&r=2", "a", "b"],
      out: "http://x.com/p?q=1&r=2/a/b",
    },
    { args: ["/p?x=1", "../b"], out: "/p?x=1/../b" },
  ]);
});

// Extends "[unhappy-2] joinURL puts the joining slash after a hash in the base":
// a hash on a protocol URL, and a hash that already ends in "/".
test("[unhappy-2] joinURL appends after the hash of a protocol base", () => {
  checkJoinURL([
    { args: ["https://x.com#frag", "a"], out: "https://x.com#frag/a" },
    { args: ["http://x.com/a#h/", "/b"], out: "http://x.com/a#h/b" },
  ]);
});
