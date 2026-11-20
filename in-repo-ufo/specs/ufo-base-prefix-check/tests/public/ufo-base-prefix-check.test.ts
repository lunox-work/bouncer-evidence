import { expect, test } from "vitest";
import { withBase, withoutBase } from "../src/utils";

// ---------------------------------------------------------------------------
// @happy scenarios
// ---------------------------------------------------------------------------

test("[happy-1] withBase leaves an input already under the base unchanged", () => {
  expect(withBase("/admin/users", "/admin")).toBe("/admin/users");
  expect(withBase("/admin/users", "/admin/")).toBe("/admin/users");
  expect(withBase("/admin?x=1", "/admin")).toBe("/admin?x=1");
  expect(withBase("/admin?x=1", "/admin/")).toBe("/admin?x=1");
  expect(withBase("/admin/#top", "/admin")).toBe("/admin/#top");
  expect(withBase("/a/b/c", "/a/b")).toBe("/a/b/c");
});

test("[happy-1] withBase treats a bare trailing / or ? right after the base as a boundary", () => {
  expect(withBase("/admin/", "/admin")).toBe("/admin/");
  expect(withBase("/admin?", "/admin")).toBe("/admin?");
});

test("[happy-2] withoutBase strips a base followed by / or ?", () => {
  expect(withoutBase("/admin/users", "/admin")).toBe("/users");
  expect(withoutBase("/admin/users", "/admin/")).toBe("/users");
  expect(withoutBase("/admin?x=1", "/admin")).toBe("/?x=1");
  expect(withoutBase("/admin?x=1", "/admin/")).toBe("/?x=1");
  expect(withoutBase("/api?test", "/api")).toBe("/?test");
  expect(withoutBase("/admin/#top", "/admin")).toBe("/#top");
  expect(withoutBase("/a/b/c", "/a/b")).toBe("/c");
});

test("[happy-2] withoutBase strips a base followed only by a bare / or ?", () => {
  expect(withoutBase("/admin/", "/admin")).toBe("/");
  expect(withoutBase("/admin?", "/admin")).toBe("/?");
});

test("[happy-3] withBase keeps its existing joining and protocol results", () => {
  expect(withBase("/bar", "/foo")).toBe("/foo/bar");
  expect(withBase("/foo/bar", "/baz")).toBe("/baz/foo/bar");
  expect(withBase("https://test.com", "/base/")).toBe("https://test.com");
  expect(withBase("https://test.com", "/")).toBe("https://test.com");
});

test("[happy-3] withBase keeps its existing results for empty bases and empty or root inputs", () => {
  expect(withBase("/", "/")).toBe("/");
  expect(withBase("", "/foo")).toBe("/foo");
  expect(withBase("/", "/foo/")).toBe("/foo");
  expect(withBase("/x", "/")).toBe("/x");
  expect(withBase("/x", "")).toBe("/x");
});

test("[happy-4] withoutBase keeps its existing non-matching and protocol results", () => {
  expect(withoutBase("/bar", "/foo")).toBe("/bar");
  expect(withoutBase("https://test.com", "/base/")).toBe("https://test.com");
  expect(withoutBase("https://test.com", "/")).toBe("https://test.com");
});

test("[happy-4] withoutBase keeps its existing results for empty bases and empty or root inputs", () => {
  expect(withoutBase("/", "/")).toBe("/");
  expect(withoutBase("/", "/foo")).toBe("/");
  expect(withoutBase("/", "/foo/")).toBe("/");
  expect(withoutBase("", "/foo")).toBe("");
  expect(withoutBase("/test/", "/")).toBe("/test/");
  expect(withoutBase("/?test", "/")).toBe("/?test");
  expect(withoutBase("/x", "")).toBe("/x");
});

// ---------------------------------------------------------------------------
// @boundary scenarios
// ---------------------------------------------------------------------------

test("[boundary-1] withBase returns an input equal to the base unchanged", () => {
  expect(withBase("/admin", "/admin")).toBe("/admin");
});

test("[boundary-1] withBase returns an input equal to the base with its trailing slash removed unchanged", () => {
  expect(withBase("/admin", "/admin/")).toBe("/admin");
  expect(withBase("/base", "/base/")).toBe("/base");
});

test("[boundary-2] withoutBase turns an input equal to the base into /", () => {
  expect(withoutBase("/admin", "/admin")).toBe("/");
});

test("[boundary-2] withoutBase turns an input equal to the base with its trailing slash removed into /", () => {
  expect(withoutBase("/admin", "/admin/")).toBe("/");
  expect(withoutBase("/base/a", "/base/a/")).toBe("/");
});

test("[boundary-3] withoutBase does not collapse a doubled slash in the remainder", () => {
  expect(withoutBase("/admin//x", "/admin")).toBe("//x");
});

test("[boundary-3] withoutBase does not collapse a doubled slash in the remainder when the base has a trailing slash", () => {
  expect(withoutBase("/admin//x", "/admin/")).toBe("//x");
});

test("[boundary-4] a base ending in // matches an input that keeps one / of it", () => {
  expect(withBase("/admin//x", "/admin//")).toBe("/admin//x");
  expect(withoutBase("/admin//x", "/admin//")).toBe("/x");
});

test("[boundary-4] a base ending in // does not match an input with a single / after the name", () => {
  expect(withBase("/admin/x", "/admin//")).toBe("/admin/admin/x");
  expect(withoutBase("/admin/x", "/admin//")).toBe("/admin/x");
});

test("[boundary-5] a base without a leading slash matches when followed by /", () => {
  expect(withBase("admin/x", "admin")).toBe("admin/x");
  expect(withoutBase("admin/x", "admin")).toBe("/x");
});

test("[boundary-5] a base without a leading slash does not match when followed by a non-boundary character", () => {
  expect(withBase("admin-dashboard", "admin")).toBe("admin/admin-dashboard");
  expect(withoutBase("admin-dashboard", "admin")).toBe("admin-dashboard");
});

// ---------------------------------------------------------------------------
// @unhappy scenarios
// ---------------------------------------------------------------------------

test("[unhappy-1] withBase joins the base onto an input that only shares a string prefix", () => {
  expect(withBase("/admin-dashboard", "/admin")).toBe("/admin/admin-dashboard");
  expect(withBase("/admin-dashboard", "/admin/")).toBe(
    "/admin/admin-dashboard",
  );
  expect(withBase("/admin-dashboard?x", "/admin")).toBe(
    "/admin/admin-dashboard?x",
  );
  expect(withBase("/a/bc", "/a/b")).toBe("/a/b/a/bc");
  expect(withBase("/base/a-b", "/base/a")).toBe("/base/a/base/a-b");
});

test("[unhappy-1] withBase joins the base onto an input extended by a single letter", () => {
  expect(withBase("/adminx", "/admin")).toBe("/admin/adminx");
});

test("[unhappy-2] withBase does not treat # right after the base as a boundary", () => {
  expect(withBase("/admin#top", "/admin")).toBe("/admin/admin#top");
});

test("[unhappy-2] withBase does not treat # right after a base with a trailing slash as a boundary", () => {
  expect(withBase("/admin#top", "/admin/")).toBe("/admin/admin#top");
});

test("[unhappy-3] withBase does not treat . ; : & after the base as boundaries", () => {
  expect(withBase("/admin.json", "/admin")).toBe("/admin/admin.json");
  expect(withBase("/admin;x", "/admin")).toBe("/admin/admin;x");
  expect(withBase("/admin:x", "/admin")).toBe("/admin/admin:x");
  expect(withBase("/admin&x", "/admin")).toBe("/admin/admin&x");
});

test("[unhappy-3] withBase does not treat a backslash or an encoded slash after the base as boundaries", () => {
  expect(withBase("/admin\\x", "/admin")).toBe("/admin/admin\\x");
  expect(withBase("/admin%2Fx", "/admin")).toBe("/admin/admin%2Fx");
});

test("[unhappy-4] withBase compares the base case-sensitively", () => {
  expect(withBase("/Admin/x", "/admin")).toBe("/admin/Admin/x");
});

test("[unhappy-4] withBase compares case-sensitively even when the input equals the base apart from case", () => {
  expect(withBase("/Admin", "/admin")).toBe("/admin/Admin");
});

test("[unhappy-5] withoutBase leaves an input that only shares a string prefix unchanged", () => {
  expect(withoutBase("/admin-dashboard", "/admin")).toBe("/admin-dashboard");
  expect(withoutBase("/admin-dashboard", "/admin/")).toBe("/admin-dashboard");
  expect(withoutBase("/admin-dashboard?x", "/admin")).toBe(
    "/admin-dashboard?x",
  );
  expect(withoutBase("/a/bc", "/a/b")).toBe("/a/bc");
  expect(withoutBase("/base/a-b", "/base/a")).toBe("/base/a-b");
});

test("[unhappy-5] withoutBase leaves an input extended by a single letter unchanged", () => {
  expect(withoutBase("/adminx", "/admin")).toBe("/adminx");
});

test("[unhappy-6] withoutBase does not treat # right after the base as a boundary", () => {
  expect(withoutBase("/admin#top", "/admin")).toBe("/admin#top");
});

test("[unhappy-6] withoutBase does not treat # right after a base with a trailing slash as a boundary", () => {
  expect(withoutBase("/admin#", "/admin/")).toBe("/admin#");
});

test("[unhappy-7] withoutBase does not treat . ; : & after the base as boundaries", () => {
  expect(withoutBase("/admin.json", "/admin")).toBe("/admin.json");
  expect(withoutBase("/admin;x", "/admin")).toBe("/admin;x");
  expect(withoutBase("/admin:x", "/admin")).toBe("/admin:x");
  expect(withoutBase("/admin&x", "/admin")).toBe("/admin&x");
});

test("[unhappy-7] withoutBase does not treat a backslash or an encoded slash after the base as boundaries", () => {
  expect(withoutBase("/admin\\x", "/admin")).toBe("/admin\\x");
  expect(withoutBase("/admin%2Fx", "/admin")).toBe("/admin%2Fx");
});

test("[unhappy-8] withoutBase compares the base case-sensitively", () => {
  expect(withoutBase("/Admin/x", "/admin")).toBe("/Admin/x");
});

test("[unhappy-8] withoutBase compares case-sensitively when the input equals the base apart from case", () => {
  expect(withoutBase("/Admin", "/admin")).toBe("/Admin");
});

test("[unhappy-9] neither function throws for inputs made of a single non-path character", () => {
  expect(() => withBase("#", "/admin")).not.toThrow();
  expect(withBase("#", "/admin")).toBe("/admin/#");
  expect(() => withoutBase("#", "/admin")).not.toThrow();
  expect(withoutBase("#", "/admin")).toBe("#");
  expect(() => withBase("?", "/admin")).not.toThrow();
  expect(withBase("?", "/admin")).toBe("/admin/?");
});

test("[unhappy-9] withoutBase does not throw when the input is exactly the base", () => {
  expect(() => withoutBase("/admin", "/admin")).not.toThrow();
  expect(withoutBase("/admin", "/admin")).toBe("/");
});

// ---------------------------------------------------------------------------
// @concurrency scenarios
// ---------------------------------------------------------------------------

test("[concurrency-1] interleaved calls with different bases give the isolated results", () => {
  const results = [
    withBase("/admin-dashboard", "/admin"),
    withoutBase("/admin/users", "/admin"),
    withBase("/admin-dashboard", "/other"),
    withoutBase("/admin-dashboard", "/admin"),
  ];
  expect(results).toEqual([
    "/admin/admin-dashboard",
    "/users",
    "/other/admin-dashboard",
    "/admin-dashboard",
  ]);
});

test("[concurrency-1] repeating and reversing the interleaved calls does not change any result", () => {
  const calls: Array<[(i: string, b: string) => string, string, string]> = [
    [withBase, "/admin-dashboard", "/admin"],
    [withoutBase, "/admin/users", "/admin"],
    [withBase, "/admin-dashboard", "/other"],
    [withoutBase, "/admin-dashboard", "/admin"],
  ];
  const expected = [
    "/admin/admin-dashboard",
    "/users",
    "/other/admin-dashboard",
    "/admin-dashboard",
  ];
  const reversed = [...calls].reverse().map(([fn, i, b]) => fn(i, b));
  expect(reversed).toEqual([...expected].reverse());
  const again = calls.map(([fn, i, b]) => fn(i, b));
  expect(again).toEqual(expected);
});
