import { expect, test } from "vitest";
import { withBase, withoutBase } from "../../src/utils";

type Fn = (input: string, base: string) => string;
type Call = [fn: Fn, input: string, base: string, result: string];

function name(fn: Fn) {
  return fn === withBase ? "withBase" : "withoutBase";
}

function check(rows: Call[]) {
  for (const [fn, input, base, result] of rows) {
    expect(fn(input, base), `${name(fn)}(${JSON.stringify(input)}, ${JSON.stringify(base)})`).toBe(result);
  }
}

// ---------------------------------------------------------------------------
// @happy (existing behaviour)
// ---------------------------------------------------------------------------

// Extends public "[happy-3] withBase keeps its existing joining and protocol results":
// other unrelated inputs, bases containing regex metacharacters, protocol URLs.
test("[happy-3] withBase still joins the base onto other unrelated inputs", () => {
  check([
    [withBase, "/bar/", "/foo/", "/foo/bar/"],
    [withBase, "bar", "/foo", "/foo/bar"],
    [withBase, "/x/admin/y", "/admin", "/admin/x/admin/y"],
    [withBase, "/adm", "/admin", "/admin/adm"],
    [withBase, "/axb/c", "/a.b", "/a.b/axb/c"],
    [withBase, "/aaa/x", "/a+", "/a+/aaa/x"],
    [withBase, "/x/y", "/(x)", "/(x)/x/y"],
    [withBase, "/v1/x", "/v[1]", "/v[1]/v1/x"],
    [withBase, "/a b/x", "/a%20b", "/a%20b/a b/x"],
  ]);
});

// Shortcut: running the boundary check before the protocol early return.
test("[happy-3] withBase still returns protocol inputs unchanged even when they share a prefix with the base", () => {
  check([
    [withBase, "http://x.com/admin-dashboard", "/admin", "http://x.com/admin-dashboard"],
    [withBase, "ftp://h/a", "/a/", "ftp://h/a"],
    [withBase, "https://a.com-evil", "https://a.com", "https://a.com-evil"],
    [withBase, "https://a.com.evil/x", "https://a.com/", "https://a.com.evil/x"],
  ]);
});

// Extends public "[happy-3] withBase keeps its existing results for empty bases and empty or root inputs".
test("[happy-3] withBase still returns the input unchanged for an empty base, even before a non-boundary", () => {
  check([
    [withBase, "", "/", ""],
    [withBase, "", "", ""],
    [withBase, "/admin-x", "/", "/admin-x"],
    [withBase, "/admin-x", "", "/admin-x"],
    [withBase, "#top", "", "#top"],
  ]);
});

// Extends public "[happy-4] withoutBase keeps its existing non-matching and protocol results".
test("[happy-4] withoutBase still leaves other unrelated inputs unchanged", () => {
  check([
    [withoutBase, "/bar/baz", "/foo/", "/bar/baz"],
    [withoutBase, "/x/admin/y", "/admin", "/x/admin/y"],
    [withoutBase, "/adm", "/admin", "/adm"],
    [withoutBase, "/axb/c", "/a.b", "/axb/c"],
    [withoutBase, "/aaa/x", "/a+", "/aaa/x"],
    [withoutBase, "/x/y", "/(x)", "/x/y"],
    [withoutBase, "/v1/x", "/v[1]", "/v1/x"],
    [withoutBase, "/a b/x", "/a%20b", "/a b/x"],
    [withoutBase, "http://x.com/a", "/a", "http://x.com/a"],
  ]);
});

// Extends public "[happy-4] withoutBase keeps its existing results for empty bases and empty or root inputs".
test("[happy-4] withoutBase still returns the input unchanged for an empty base, even before a non-boundary", () => {
  check([
    [withoutBase, "", "/", ""],
    [withoutBase, "", "", ""],
    [withoutBase, "/admin-x", "/", "/admin-x"],
    [withoutBase, "/admin-x", "", "/admin-x"],
    [withoutBase, "#top", "/", "#top"],
  ]);
});

// ---------------------------------------------------------------------------
// @boundary
// ---------------------------------------------------------------------------

// Extends public "[boundary-4] ..." tests: three trailing slashes, a ? after the kept slash,
// an exact match, and deeper bases.
test("[boundary-4] a base ending in /// keeps two / in the prefix it must match", () => {
  check([
    [withBase, "/admin///x", "/admin///", "/admin///x"],
    [withBase, "/admin//x", "/admin///", "/admin//admin//x"],
    [withoutBase, "/admin///x", "/admin///", "/x"],
    [withoutBase, "/admin//x", "/admin///", "/admin//x"],
  ]);
});

test("[boundary-4] a base ending in // matches when ? or end of string follows the kept /", () => {
  check([
    [withBase, "/admin/?x", "/admin//", "/admin/?x"],
    [withoutBase, "/admin/?x", "/admin//", "/?x"],
    [withBase, "/admin/", "/admin//", "/admin/"],
    [withoutBase, "/admin/", "/admin//", "/"],
  ]);
});

test("[boundary-4] a base ending in // does not match its name without the kept /", () => {
  check([
    [withBase, "/admin", "/admin//", "/admin/admin"],
    [withoutBase, "/admin", "/admin//", "/admin"],
    [withBase, "/admin/-x", "/admin//", "/admin/admin/-x"],
    [withoutBase, "/admin/-x", "/admin//", "/admin/-x"],
  ]);
});

test("[boundary-4] a deeper base ending in // keeps one / in the prefix it must match", () => {
  check([
    [withoutBase, "/a/b//c/d", "/a/b//", "/c/d"],
    [withBase, "/a/b//c/d", "/a/b//", "/a/b//c/d"],
    [withoutBase, "/a/b/c/d", "/a/b//", "/a/b/c/d"],
    [withBase, "/a/b/c/d", "/a/b//", "/a/b/a/b/c/d"],
  ]);
});

// Extends public "[boundary-5] ..." tests: ?, exact match, other non-boundaries, deeper bases.
test("[boundary-5] a base without a leading slash matches when followed by ? or end of string", () => {
  check([
    [withBase, "admin?x", "admin", "admin?x"],
    [withoutBase, "admin?x", "admin", "/?x"],
    [withBase, "admin", "admin", "admin"],
    [withoutBase, "admin", "admin", "/"],
    [withBase, "a/b/c", "a/b/", "a/b/c"],
    [withoutBase, "a/b/c", "a/b", "/c"],
  ]);
});

test("[boundary-5] a base without a leading slash does not match before other non-boundary characters", () => {
  check([
    [withBase, "admin.json", "admin", "admin/admin.json"],
    [withoutBase, "admin.json", "admin", "admin.json"],
    [withBase, "admins/x", "admin", "admin/admins/x"],
    [withoutBase, "admins/x", "admin", "admins/x"],
    [withBase, "a/bc", "a/b", "a/b/a/bc"],
    [withoutBase, "a/bc", "a/b", "a/bc"],
    [withBase, "admin#x", "admin", "admin/admin#x"],
    [withoutBase, "admin#x", "admin", "admin#x"],
    [withoutBase, "admin:x", "admin", "admin:x"],
    [withBase, "admin-x", "admin/", "admin/admin-x"],
    [withoutBase, "admin-x", "admin/", "admin-x"],
  ]);
});

test("[boundary-5] a base without a leading slash does not match an input with a leading slash or other case", () => {
  check([
    [withBase, "/admin/x", "admin", "admin/admin/x"],
    [withoutBase, "/admin/x", "admin", "/admin/x"],
    [withBase, "Admin/x", "admin", "admin/Admin/x"],
    [withoutBase, "Admin/x", "admin", "Admin/x"],
  ]);
});

// ---------------------------------------------------------------------------
// @unhappy
// ---------------------------------------------------------------------------

// Extends public "[unhappy-9] neither function throws for inputs made of a single non-path character".
test("[unhappy-9] neither function throws for the remaining single-character examples", () => {
  expect(() => withoutBase("?", "/admin")).not.toThrow();
  check([
    [withoutBase, "?", "/admin", "?"],
    [withBase, "#", "/admin/", "/admin/#"],
    [withoutBase, "#", "/admin/", "#"],
    [withBase, "?", "/admin/", "/admin/?"],
  ]);
});

test("[unhappy-9] neither function throws for unusual bases and gives the boundary-rule results", () => {
  check([
    [withBase, "?", "?", "?"],
    [withoutBase, "?", "?", "/"],
    [withBase, "?x", "?", "?/?x"],
    [withoutBase, "?x", "?", "?x"],
    [withoutBase, "??", "?", "/?"],
    [withBase, "#", "#", "#"],
    [withoutBase, "#", "#", "/"],
    [withBase, "#a", "#", "#/#a"],
    [withoutBase, "#a", "#", "#a"],
    [withBase, "/x", "//", "/x"],
    [withoutBase, "/x", "//", "/x"],
    [withBase, "//x", "//", "//x"],
    [withoutBase, "//x", "//", "/x"],
    [withoutBase, "", "/admin", ""],
    [withBase, "", "/admin/", "/admin"],
  ]);
});

const STRINGS = [
  "", "/", "//", "///", "?", "#", "\\", "%", "%2F", " ", "\u0000", "😀", "\uD800",
  "/admin", "/admin/", "/admin//", "admin", "/admin-x", "/admin#", "/admin?",
  "/Admin", "https://a.com", "//a.com", "javascript:alert(1)", "data:,x",
  "/a/b/c?d=e#f", "?x=1", "#top", "./x", "../x", ".", "..",
];

test("[unhappy-9] neither function throws for any pair from a grid of unusual strings", () => {
  for (const input of STRINGS) {
    for (const base of STRINGS) {
      for (const fn of [withBase, withoutBase]) {
        let result: unknown;
        expect(() => {
          result = fn(input, base);
        }, `${name(fn)}(${JSON.stringify(input)}, ${JSON.stringify(base)})`).not.toThrow();
        expect(typeof result).toBe("string");
      }
    }
  }
});

// ---------------------------------------------------------------------------
// @concurrency
// ---------------------------------------------------------------------------

const CALLS: Call[] = [
  [withBase, "/admin-dashboard", "/admin", "/admin/admin-dashboard"],
  [withoutBase, "/admin/users", "/admin", "/users"],
  [withBase, "/admin-dashboard", "/other", "/other/admin-dashboard"],
  [withoutBase, "/admin-dashboard", "/admin", "/admin-dashboard"],
  [withBase, "/other/x", "/other/", "/other/x"],
  [withoutBase, "/other/x", "/other/", "/x"],
  [withBase, "/admin/users", "/admin/", "/admin/users"],
  [withoutBase, "/admin//x", "/admin//", "/x"],
  [withBase, "/admin/x", "/admin//", "/admin/admin/x"],
  [withoutBase, "/admin/x", "/admin//", "/admin/x"],
  [withBase, "/otherx", "/other", "/other/otherx"],
  [withoutBase, "/other", "/other/", "/"],
  [withBase, "admin-dashboard", "admin", "admin/admin-dashboard"],
  [withoutBase, "admin/x", "admin", "/x"],
];

// Extends public "[concurrency-1] ..." tests: more calls and bases, starting with a different base.
test("[concurrency-1] a longer interleaving with several bases gives the isolated results", () => {
  check(CALLS);
});

// Shortcut: caching the normalized base from the first or last call.
test("[concurrency-1] a fixed permutation of the longer interleaving gives the isolated results", () => {
  const order = [11, 3, 8, 0, 13, 5, 2, 9, 6, 12, 1, 10, 4, 7];
  check(order.map((i) => CALLS[i]));
  check([...CALLS].reverse());
});

test("[concurrency-1] calls with alternating bases on the same input give the isolated results", () => {
  const rows: Call[] = [];
  for (let i = 0; i < 20; i++) {
    rows.push(
      [withoutBase, "/admin/x", "/admin", "/x"],
      [withoutBase, "/admin/x", "/admin/x", "/"],
      [withoutBase, "/admin/x", "/adm", "/admin/x"],
      [withBase, "/admin/x", "/adm", "/adm/admin/x"],
      [withBase, "/admin/x", "/admin", "/admin/x"],
    );
  }
  check(rows);
});

test("[concurrency-1] overlapping asynchronous callers get the isolated results", async () => {
  const results = await Promise.all(
    CALLS.map(async ([fn, input, base]) => {
      await Promise.resolve();
      const first = fn(input, base);
      await Promise.resolve();
      return [first, fn(input, base)];
    }),
  );
  expect(results).toEqual(CALLS.map(([, , , r]) => [r, r]));
});
