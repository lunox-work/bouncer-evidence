import { expect, test } from "vitest";
import { joinRelativeURL, joinURL, withBase } from "../src/utils";

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

function checkJoinRelativeURL(rows: Row[]) {
  for (const { args, out } of rows) {
    expect(joinRelativeURL(...args), JSON.stringify(args)).toBe(out);
  }
}

// ---------------------------------------------------------------------------
// joinURL
// ---------------------------------------------------------------------------

test("[happy-1] joinURL joins segments with single slashes", () => {
  checkJoinURL([
    { args: ["a", "b"], out: "a/b" },
    { args: ["a", "/b", "/c"], out: "a/b/c" },
    { args: ["a/", "b"], out: "a/b" },
    { args: ["a", "b/", "c"], out: "a/b/c" },
    { args: ["a", "b/", "/c"], out: "a/b/c" },
    { args: ["./", "a"], out: "./a" },
    { args: ["./a", "./b"], out: "./a/b" },
    { args: ["/", "./foo", "bar"], out: "/foo/bar" },
    { args: ["http://x.com", "a", "b"], out: "http://x.com/a/b" },
  ]);
});

test("[happy-1] joinURL does not double the slash when both sides carry one", () => {
  checkJoinURL([
    { args: ["a/", "/b"], out: "a/b" },
    { args: ["/", "/b"], out: "/b" },
    { args: ["/", "./foo"], out: "/foo" },
  ]);
});

test("[happy-2] joinURL returns a base alone unchanged", () => {
  checkJoinURL([
    { args: ["/a"], out: "/a" },
    { args: ["a/"], out: "a/" },
  ]);
});

test("[happy-2] joinURL returns a bare-slash or empty base alone unchanged", () => {
  checkJoinURL([
    { args: ["/"], out: "/" },
    { args: [""], out: "" },
  ]);
});

test("[boundary-1] joinURL treats an undefined or null base as empty", () => {
  checkJoinURL([
    { args: [UNDEF], out: "" },
    { args: [UNDEF, "./"], out: "./" },
    { args: [NULL, "b"], out: "b" },
  ]);
});

test("[boundary-1] joinURL with an empty-string base keeps the first segment as written", () => {
  checkJoinURL([{ args: ["", "/b", "c"], out: "/b/c" }]);
});

test("[boundary-2] joinURL skips empty, undefined and bare-slash segments", () => {
  checkJoinURL([
    { args: ["a", "", "/", "b"], out: "a/b" },
    { args: ["a", "b", "", "c"], out: "a/b/c" },
    { args: ["a", UNDEF, "b"], out: "a/b" },
    { args: ["/", "/", "a"], out: "/a" },
    { args: ["", "", "/b"], out: "/b" },
  ]);
});

test("[boundary-2] joinURL never filters the base, and only skipped segments leave it as is", () => {
  checkJoinURL([
    { args: ["a/", "/"], out: "a/" },
    { args: ["/", ""], out: "/" },
    { args: ["", "/"], out: "" },
  ]);
});

test("[boundary-3] joinURL strips only one leading slash or ./ from a segment", () => {
  checkJoinURL([
    { args: ["a", "//b"], out: "a//b" },
    { args: ["a", ".//b"], out: "a//b" },
    { args: ["a", "//"], out: "a//" },
    { args: ["./", "./b"], out: "./b" },
  ]);
});

test("[boundary-3] joinURL leaves a trailing slash for a ./ segment and does not strip a bare dot", () => {
  checkJoinURL([
    { args: ["a", "./"], out: "a/" },
    { args: ["/", "./"], out: "/" },
    { args: ["a", "."], out: "a/." },
  ]);
});

test("[boundary-4] joinURL keeps the prefix of the first segment after an empty base", () => {
  checkJoinURL([
    { args: ["", "/b"], out: "/b" },
    { args: ["", "./a"], out: "./a" },
  ]);
});

test("[boundary-4] joinURL strips the prefix of later segments after an empty base", () => {
  checkJoinURL([{ args: ["", "./a", "./b"], out: "./a/b" }]);
});

test("[unhappy-1] joinURL appends .. segments literally", () => {
  checkJoinURL([
    { args: ["/a", "../b"], out: "/a/../b" },
    { args: ["a", "../b"], out: "a/../b" },
    { args: ["a", "..", "b"], out: "a/../b" },
  ]);
});

test("[unhappy-1] joinURL does not resolve multiple .. pieces", () => {
  checkJoinURL([{ args: ["/a/b/c", "../../d"], out: "/a/b/c/../../d" }]);
});

test("[boundary-5] joinURL keeps the last segment's trailing slash", () => {
  checkJoinURL([
    { args: ["a", "b", "c/"], out: "a/b/c/" },
    { args: ["a", "/b/"], out: "a/b/" },
    { args: ["/", "./foo/"], out: "/foo/" },
  ]);
});

test("[boundary-5] joinURL adds no trailing slash when the last segment has none", () => {
  checkJoinURL([{ args: ["a/", "b"], out: "a/b" }]);
});

test("[unhappy-2] joinURL puts the joining slash after a query in the base", () => {
  checkJoinURL([{ args: ["http://x.com?q=1", "a"], out: "http://x.com?q=1/a" }]);
});

test("[unhappy-2] joinURL puts the joining slash after a hash in the base", () => {
  checkJoinURL([{ args: ["/a#h", "b"], out: "/a#h/b" }]);
});

// ---------------------------------------------------------------------------
// joinRelativeURL
// ---------------------------------------------------------------------------

test("[happy-3] joinRelativeURL resolves ./ and ../", () => {
  checkJoinRelativeURL([
    { args: ["/a", "../b", "./c"], out: "/b/c" },
    { args: ["/a", "../b"], out: "/b" },
    { args: ["/a/b/c", "../../d"], out: "/a/d" },
    { args: ["/a", ".././../d"], out: "/d" },
    { args: ["../a", "../b"], out: "b" },
    { args: ["../a", "./../b"], out: "b" },
    { args: ["../a/", "../b"], out: "b" },
  ]);
});

test("[happy-3] joinRelativeURL keeps the leading slash when .. climbs past the root of an absolute path", () => {
  checkJoinRelativeURL([
    { args: ["/a", "../../d"], out: "/d" },
    { args: ["/a/b", "../../../d"], out: "/d" },
  ]);
});

test("[boundary-6] joinRelativeURL turns one surplus .. into a leading ../", () => {
  checkJoinRelativeURL([
    { args: ["/a", "../../../d"], out: "../d" },
    { args: ["../a", "./../../b"], out: "../b" },
  ]);
});

test("[boundary-6] joinRelativeURL turns several surplus .. into repeated ../", () => {
  checkJoinRelativeURL([
    { args: ["../a", "../../../b"], out: "../../b" },
    { args: ["../a", "../../../../b"], out: "../../../b" },
  ]);
});

test("[happy-4] joinRelativeURL joins plain segments and restores prefixes and trailing slash", () => {
  checkJoinRelativeURL([
    { args: ["/a"], out: "/a" },
    { args: ["a", "b"], out: "a/b" },
    { args: ["a", "b/", "c"], out: "a/b/c" },
    { args: ["a", "b/", "/c"], out: "a/b/c" },
    { args: ["./", "a"], out: "./a" },
    { args: ["./a", "./b"], out: "./a/b" },
    { args: ["/", "/b"], out: "/b" },
    { args: ["/", "./foo"], out: "/foo" },
    { args: ["/", "./foo/"], out: "/foo/" },
    { args: ["/", "./foo", "bar"], out: "/foo/bar" },
    { args: ["a", "b", "c/"], out: "a/b/c/" },
  ]);
});

test("[happy-4] joinRelativeURL drops bare . pieces and collapses a ./ after the root", () => {
  checkJoinRelativeURL([
    { args: ["/", "./"], out: "/" },
    { args: [".", "a"], out: "a" },
    { args: ["a", "."], out: "a" },
  ]);
});

test("[boundary-7] joinRelativeURL skips falsy inputs", () => {
  checkJoinRelativeURL([
    { args: [UNDEF, "./"], out: "./" },
    { args: ["", "a", ""], out: "a" },
    { args: ["", "/a"], out: "/a" },
  ]);
});

test("[boundary-7] joinRelativeURL keeps a bare / input for the leading and trailing slash", () => {
  checkJoinRelativeURL([
    { args: ["/"], out: "/" },
    { args: ["/", "a"], out: "/a" },
    { args: ["a", "/"], out: "a/" },
    { args: ["a", "/", "b"], out: "a/b" },
  ]);
});

test("[boundary-8] joinRelativeURL with no arguments returns an empty string", () => {
  expect(joinRelativeURL()).toBe("");
});

test("[boundary-8] joinRelativeURL with no arguments does not throw", () => {
  expect(() => joinRelativeURL()).not.toThrow();
});

test("[unhappy-3] joinRelativeURL collapses a protocol's // like any empty piece", () => {
  checkJoinRelativeURL([
    { args: ["http://x.com/a", "../b"], out: "http:/x.com/b" },
  ]);
});

test("[unhappy-3] joinRelativeURL treats ? as an ordinary character", () => {
  checkJoinRelativeURL([{ args: ["a?q=1", "b"], out: "a?q=1/b" }]);
});

// ---------------------------------------------------------------------------
// Existing callers
// ---------------------------------------------------------------------------

test("[boundary-9] withBase joins input onto base with a single slash", () => {
  expect(withBase("/a", "/b")).toBe("/b/a");
  expect(withBase("a", "/b/")).toBe("/b/a");
});

test("[boundary-9] withBase no longer resolves .. in its input", () => {
  expect(withBase("../a", "/base")).toBe("/base/../a");
});
