import { expect, test } from "vitest";
import { joinRelativeURL } from "../../src/utils";

// `undefined` / `null` passed through a cast, as test/join.test.ts does.
const UNDEF = undefined as unknown as string;
const NULL = null as unknown as string;

type Row = { args: string[]; out: string };

function checkJoinRelativeURL(rows: Row[]) {
  for (const { args, out } of rows) {
    expect(joinRelativeURL(...args), JSON.stringify(args)).toBe(out);
  }
}

// Extends "[happy-3] joinRelativeURL resolves ./ and ../":
// longer paths, ".." as its own input, ".." inside a single input.
test("[happy-3] joinRelativeURL resolves .. across longer paths and separate inputs", () => {
  checkJoinRelativeURL([
    { args: ["/a/b/c/d", "../../e", "./f"], out: "/a/b/e/f" },
    { args: ["a/b", "../c"], out: "a/c" },
    { args: ["./a/b", "../c"], out: "./a/c" },
    { args: ["/a", "b", "..", "c"], out: "/a/c" },
    { args: ["a", "b/../c"], out: "a/c" },
    { args: ["/a/./b/../c"], out: "/a/c" },
  ]);
});

// Extends "[happy-3] joinRelativeURL resolves ./ and ../":
// the trailing slash of the last input survives resolution.
test("[happy-3] joinRelativeURL restores the trailing slash after resolving ..", () => {
  checkJoinRelativeURL([
    { args: ["a/b/c", "..", "..", "d/"], out: "a/d/" },
    { args: ["/a/b/", "../"], out: "/a/" },
  ]);
});

// Extends "[happy-3] joinRelativeURL keeps the leading slash when .. climbs past the root of an absolute path":
// the climb is spread over several inputs and the net depth ends at zero or above.
test("[happy-3] joinRelativeURL keeps the leading slash when the net depth stays non-negative", () => {
  checkJoinRelativeURL([
    { args: ["/a/b", "..", "..", "..", "d"], out: "/d" },
    { args: ["/a/b/c", "../../../../x/y"], out: "/x/y" },
    { args: ["a", "../../b"], out: "b" },
    { args: ["./a", "../../b"], out: "./b" },
  ]);
});

// Extends "[happy-3] joinRelativeURL resolves ./ and ../" ("../a", "../b" -> "b"):
// a leading ".." with nothing before it is dropped when later pieces raise the depth.
test("[happy-3] joinRelativeURL drops a leading .. once later pieces make the depth non-negative", () => {
  checkJoinRelativeURL([
    { args: ["../a", "b"], out: "a/b" },
    { args: ["..", "a"], out: "a" },
  ]);
});

// Extends "[boundary-6] joinRelativeURL turns one surplus .. into a leading ../":
// single-input climbs, absolute inputs, a trailing slash.
test("[boundary-6] joinRelativeURL gives a ../ prefix for a net depth of -1 from other inputs", () => {
  checkJoinRelativeURL([
    { args: ["a", "../../../b"], out: "../b" },
    { args: ["../../a"], out: "../a" },
    { args: ["..", "..", "x"], out: "../x" },
    { args: ["/x/y", "../../../../z"], out: "../z" },
    { args: ["a/b", "../../../../c/"], out: "../c/" },
  ]);
});

// Extends "[boundary-6] joinRelativeURL turns several surplus .. into repeated ../":
// deeper net depths and an absolute first input.
test("[boundary-6] joinRelativeURL repeats ../ once per unit of negative net depth", () => {
  checkJoinRelativeURL([
    { args: ["a", "../../../../b"], out: "../../b" },
    { args: ["/a", "../../../../d"], out: "../../d" },
    { args: ["../../../a"], out: "../../a" },
    { args: ["a", "..", "..", "..", "..", "b"], out: "../../b" },
  ]);
});

// Extends "[boundary-6] joinRelativeURL turns one surplus .. into a leading ../":
// no pieces remain after the climb, so the result is only the prefix.
test("[boundary-6] joinRelativeURL returns only the ../ prefix when nothing follows the climb", () => {
  checkJoinRelativeURL([
    { args: ["a", "../.."], out: "../" },
    { args: ["a", "../../"], out: "../" },
    { args: ["../"], out: "../" },
    { args: ["/a/b", "..", "c", "..", "..", ".."], out: "../" },
  ]);
});

// Extends "[happy-4] joinRelativeURL joins plain segments and restores prefixes and trailing slash":
// more inputs, collapsed doubled slashes, trailing slash on every input.
test("[happy-4] joinRelativeURL joins many inputs and collapses repeated slashes", () => {
  checkJoinRelativeURL([
    { args: ["a", "b", "c", "d"], out: "a/b/c/d" },
    { args: ["a//b", "c"], out: "a/b/c" },
    { args: ["/a/", "/b/", "/c/"], out: "/a/b/c/" },
    { args: ["//a", "b"], out: "/a/b" },
    { args: ["./a/", "b"], out: "./a/b" },
    { args: ["./", "/a"], out: "./a" },
    { args: ["/", "a/"], out: "/a/" },
  ]);
});

// Extends "[happy-4] joinRelativeURL drops bare . pieces and collapses a ./ after the root":
// "." pieces inside inputs and runs of "." inputs.
test("[happy-4] joinRelativeURL drops . pieces inside inputs and runs of . inputs", () => {
  checkJoinRelativeURL([
    { args: ["a", "./b/./c"], out: "a/b/c" },
    { args: ["a", ".", ".", "b"], out: "a/b" },
    { args: ["./", "./"], out: "./" },
    { args: ["/a", "./"], out: "/a/" },
  ]);
});

// Extends "[boundary-7] joinRelativeURL skips falsy inputs":
// null, falsy inputs at both ends and in the middle.
test("[boundary-7] joinRelativeURL skips null and falsy inputs anywhere in the list", () => {
  checkJoinRelativeURL([
    { args: [NULL, "/a", UNDEF], out: "/a" },
    { args: ["", "./a", "", "b/", ""], out: "./a/b/" },
    { args: ["", "./", ""], out: "./" },
    { args: [UNDEF], out: "" },
    { args: ["", NULL, UNDEF], out: "" },
  ]);
});

// Extends "[boundary-7] joinRelativeURL keeps a bare / input for the leading and trailing slash":
// "/" at both ends, "/" after a falsy first input, "/" twice.
test("[boundary-7] joinRelativeURL counts a bare / at either end even around falsy inputs", () => {
  checkJoinRelativeURL([
    { args: ["/", "", "a", "/"], out: "/a/" },
    { args: ["a", "b", "/"], out: "a/b/" },
    { args: [NULL, "/"], out: "/" },
    { args: ["/", "/"], out: "/" },
    { args: ["", "/", "a"], out: "/a" },
  ]);
});

// Extends "[boundary-7] joinRelativeURL skips falsy inputs":
// a "." input is not falsy, so it stays in the list and decides the
// leading prefix (when first) and the trailing slash (when last).
test("[boundary-7] joinRelativeURL keeps a . input when choosing the prefix and trailing slash", () => {
  checkJoinRelativeURL([
    { args: [".", "/a"], out: "a" },
    { args: ["a/", "."], out: "a" },
  ]);
});

// Extends "[boundary-8] joinRelativeURL with no arguments returns an empty string":
// spreading an empty array, called repeatedly.
test("[boundary-8] joinRelativeURL called with an empty spread returns an empty string every time", () => {
  const none: string[] = [];
  expect(joinRelativeURL(...none)).toBe("");
  expect(joinRelativeURL(...none)).toBe("");
  expect(joinRelativeURL()).toBe("");
});

// Extends "[unhappy-3] joinRelativeURL collapses a protocol's // like any empty piece":
// https, a protocol base with no path, a protocol-relative URL.
test("[unhappy-3] joinRelativeURL collapses // in other protocol and protocol-relative inputs", () => {
  checkJoinRelativeURL([
    { args: ["https://x.com/a/b", "../../c"], out: "https:/x.com/c" },
    { args: ["http://x.com", "a"], out: "http:/x.com/a" },
    { args: ["//cdn.com/a", "b"], out: "/cdn.com/a/b" },
  ]);
});

// Extends "[unhappy-3] joinRelativeURL treats ? as an ordinary character":
// "#" too, and a "?" piece popped by "..".
test("[unhappy-3] joinRelativeURL treats ? and # as ordinary characters when resolving", () => {
  checkJoinRelativeURL([
    { args: ["a#h", "b"], out: "a#h/b" },
    { args: ["a?q=1/b", "../c"], out: "a?q=1/c" },
    { args: ["http://x.com/a?q=1#h", "../b"], out: "http:/x.com/b" },
    { args: ["a", "b?x=../c"], out: "a/b?x=../c" },
  ]);
});
