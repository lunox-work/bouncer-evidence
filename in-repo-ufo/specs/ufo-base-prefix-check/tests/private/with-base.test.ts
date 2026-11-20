import { expect, test } from "vitest";
import { withBase } from "../../src/utils";

type Row = [input: string, base: string, result: string];

function check(rows: Row[]) {
  for (const [input, base, result] of rows) {
    expect(withBase(input, base), `withBase(${JSON.stringify(input)}, ${JSON.stringify(base)})`).toBe(result);
  }
}

// Characters that are not boundaries (punctuation and symbols).
const PUNCTUATION = [
  "!", "@", "=", "+", ",", "$", "*", "'", "(", ")", "~", "|", "^", "[", "]",
  "{", "}", "<", ">", '"', "`", "%", ".", ";", ":", "&", "\\",
];

// ---------------------------------------------------------------------------
// @happy
// ---------------------------------------------------------------------------

// Extends public "[happy-1] withBase leaves an input already under the base unchanged":
// deeper bases, longer inputs, query and fragment combinations.
test("[happy-1] withBase leaves inputs under deeper bases and with longer tails unchanged", () => {
  check([
    ["/a/b/c/d/e", "/a/b/c", "/a/b/c/d/e"],
    ["/a/b/c/d/e", "/a/b/c/", "/a/b/c/d/e"],
    ["/api/v1/users?id=1", "/api/v1", "/api/v1/users?id=1"],
    ["/admin/?x=1#y", "/admin", "/admin/?x=1#y"],
    ["/admin?a=1&b=2#frag", "/admin", "/admin?a=1&b=2#frag"],
    ["/admin/users/", "/admin/", "/admin/users/"],
    ["/admin/#top", "/admin/", "/admin/#top"],
  ]);
});

// Extends public "[happy-1] withBase treats a bare trailing / or ? right after the base as a boundary":
// the raw base (with its trailing slash) as input, and a bare ? after a base with a trailing slash.
test("[happy-1] withBase leaves an input equal to the raw base with its trailing slash unchanged", () => {
  check([
    ["/admin/", "/admin/", "/admin/"],
    ["/api/v1?", "/api/v1/", "/api/v1?"],
    ["/a/b/", "/a/b/", "/a/b/"],
  ]);
});

// Shortcut: checking for a non-boundary character anywhere after the base instead of
// only the one right after it.
test("[happy-1] withBase ignores non-boundary characters that come after the boundary", () => {
  check([
    ["/admin/-dashboard", "/admin", "/admin/-dashboard"],
    ["/admin?-x", "/admin", "/admin?-x"],
    ["/admin/admin-dashboard", "/admin", "/admin/admin-dashboard"],
    ["/admin/x.json", "/admin", "/admin/x.json"],
    ["/admin?a#b", "/admin", "/admin?a#b"],
  ]);
});

test("[happy-1] withBase is idempotent once a non-boundary input has been joined", () => {
  const once = withBase("/admin-dashboard", "/admin");
  expect(withBase(once, "/admin")).toBe("/admin/admin-dashboard");
  expect(withBase(withBase("/adminx", "/admin/"), "/admin/")).toBe("/admin/adminx");
});

// Shortcut: building a RegExp from the base without escaping it.
test("[happy-1] withBase matches bases containing regex metacharacters literally", () => {
  check([
    ["/a.b/c", "/a.b", "/a.b/c"],
    ["/v[1]/x", "/v[1]", "/v[1]/x"],
    ["/a+b?x", "/a+b", "/a+b?x"],
    ["/(x)/y", "/(x)/", "/(x)/y"],
    ["/a*b/c", "/a*b", "/a*b/c"],
    ["/$x/y", "/$x", "/$x/y"],
    ["/a|b/c", "/a|b", "/a|b/c"],
    ["/a^b?", "/a^b", "/a^b?"],
  ]);
});

// Shortcut: splitting the input at the first "?" or parsing segments instead of
// checking the character right after the raw base.
test("[happy-1] withBase treats / or ? after a base that itself contains a query as a boundary", () => {
  check([
    ["/api?v=1?x", "/api?v=1", "/api?v=1?x"],
    ["/api?v=1/x", "/api?v=1", "/api?v=1/x"],
  ]);
});

test("[happy-1] withBase leaves inputs under a long base unchanged", () => {
  const base = "/" + Array.from({ length: 60 }, (_, i) => `s${i}`).join("/");
  check([
    [base + "/tail", base, base + "/tail"],
    [base + "?q=1", base + "/", base + "?q=1"],
  ]);
});

test("[happy-1] withBase matches a percent-encoded base only against the same raw encoding", () => {
  check([
    ["/a%20b/x", "/a%20b", "/a%20b/x"],
    ["/caf%C3%A9?x", "/caf%C3%A9", "/caf%C3%A9?x"],
  ]);
});

// ---------------------------------------------------------------------------
// @boundary
// ---------------------------------------------------------------------------

// Extends public "[boundary-1] ..." tests: other bases equal to the input after one trailing slash is removed.
test("[boundary-1] withBase returns inputs equal to other normalized bases unchanged", () => {
  check([
    ["/a/b/c", "/a/b/c/", "/a/b/c"],
    ["/a/b/c", "/a/b/c", "/a/b/c"],
    ["admin", "admin/", "admin"],
    ["/x", "/x/", "/x"],
    ["/admin//", "/admin///", "/admin//"],
    ["/a.b", "/a.b/", "/a.b"],
  ]);
});

// Shortcut: normalizing the base with query/fragment awareness, or cutting the
// query off the base before comparing.
test("[boundary-1] withBase returns an input equal to a base that contains a query unchanged", () => {
  check([
    ["/api?v=1", "/api?v=1", "/api?v=1"],
    ["/admin/?v", "/admin/?v", "/admin/?v"],
  ]);
});

test("[boundary-1] withBase returns an input equal to a long base unchanged", () => {
  const base = "/" + Array.from({ length: 80 }, (_, i) => `p${i}`).join("/");
  check([
    [base, base, base],
    [base, base + "/", base],
  ]);
});

// ---------------------------------------------------------------------------
// @unhappy
// ---------------------------------------------------------------------------

// Extends public "[unhappy-1] withBase joins the base onto an input that only shares a string prefix":
// letters, digits, underscore and repeated base text.
test("[unhappy-1] withBase joins the base onto inputs whose prefix is followed by letters, digits or underscore", () => {
  check([
    ["/admin0", "/admin", "/admin/admin0"],
    ["/admin_", "/admin", "/admin/admin_"],
    ["/adminA", "/admin/", "/admin/adminA"],
    ["/admins/x", "/admin", "/admin/admins/x"],
    ["/adminadmin", "/admin", "/admin/adminadmin"],
    ["/admin-x/admin/y", "/admin", "/admin/admin-x/admin/y"],
    ["/admin-x?y/z", "/admin/", "/admin/admin-x?y/z"],
  ]);
});

// Extends public "[unhappy-1] withBase joins the base onto an input extended by a single letter":
// deeper bases.
test("[unhappy-1] withBase joins a deep base onto an input that extends its last segment", () => {
  check([
    ["/api/v1x/users", "/api/v1", "/api/v1/api/v1x/users"],
    ["/api/v10", "/api/v1/", "/api/v1/api/v10"],
    ["/a/b/c/de", "/a/b/c/d", "/a/b/c/d/a/b/c/de"],
  ]);
});

test("[unhappy-1] withBase joins a long base onto an input that extends its last segment", () => {
  const base = "/" + Array.from({ length: 50 }, (_, i) => `seg${i}`).join("/");
  check([[base + "x/y", base, base + "/" + base.slice(1) + "x/y"]]);
});

// Shortcut: dropping the query from the base or splitting the input at "?" first.
test("[unhappy-1] withBase joins a base that contains a query onto an input that extends that query", () => {
  check([
    ["/api?v=1&x", "/api?v=1", "/api?v=1/api?v=1&x"],
    ["/api?v=10", "/api?v=1", "/api?v=1/api?v=10"],
  ]);
});

test("[unhappy-1] withBase treats non-ASCII, whitespace and control characters after the base as non-boundaries", () => {
  check([
    ["/überx", "/über", "/über/überx"],
    ["/😀😀", "/😀", "/😀/😀😀"],
    ["/adminé", "/admin", "/admin/adminé"],
    ["/admin x", "/admin", "/admin/admin x"],
    ["/admin\tx", "/admin", "/admin/admin\tx"],
    ["/admin\nx", "/admin", "/admin/admin\nx"],
    ["/admin\u0000", "/admin", "/admin/admin\u0000"],
    ["/admin／x", "/admin", "/admin/admin／x"],
  ]);
});

// Extends public "[unhappy-2] ..." tests: other inputs with "#" right after the base.
test("[unhappy-2] withBase joins the base onto inputs with # right after the base followed by more text", () => {
  check([
    ["/admin#", "/admin", "/admin/admin#"],
    ["/admin#/x", "/admin", "/admin/admin#/x"],
    ["/admin#?x", "/admin", "/admin/admin#?x"],
    ["/admin##", "/admin", "/admin/admin##"],
    ["/a/b#c", "/a/b/", "/a/b/a/b#c"],
    ["admin#x", "admin", "admin/admin#x"],
  ]);
});

// Shortcut: stripping every trailing slash from the base, or accepting "#" after "/".
test("[unhappy-2] withBase does not treat # after a base ending in // as a boundary", () => {
  check([["/admin/#x", "/admin//", "/admin/admin/#x"]]);
});

// Extends public "[unhappy-3] ..." tests: all other punctuation, with both base forms.
test("[unhappy-3] withBase joins the base when any other punctuation follows it", () => {
  for (const c of PUNCTUATION) {
    check([
      [`/admin${c}x`, "/admin", `/admin/admin${c}x`],
      [`/admin${c}x`, "/admin/", `/admin/admin${c}x`],
      [`/admin${c}`, "/admin", `/admin/admin${c}`],
    ]);
  }
});

// Shortcut: decoding the input, or treating encoded / ? \ # as boundaries.
test("[unhappy-3] withBase does not decode encoded slashes, question marks, backslashes or hashes after the base", () => {
  check([
    ["/admin%2fx", "/admin", "/admin/admin%2fx"],
    ["/admin%3Fx", "/admin", "/admin/admin%3Fx"],
    ["/admin%3fx", "/admin", "/admin/admin%3fx"],
    ["/admin%5Cx", "/admin", "/admin/admin%5Cx"],
    ["/admin%23x", "/admin", "/admin/admin%23x"],
    ["/admin%2F", "/admin/", "/admin/admin%2F"],
  ]);
});

test("[unhappy-3] withBase does not treat dot segments after the base as boundaries", () => {
  check([
    ["/admin..", "/admin", "/admin/admin.."],
    ["/admin./x", "/admin", "/admin/admin./x"],
    ["/admin.json?x=1", "/admin", "/admin/admin.json?x=1"],
  ]);
});

// Extends public "[unhappy-4] ..." tests: other case variants, including the base's case differing.
test("[unhappy-4] withBase compares other case variants case-sensitively", () => {
  check([
    ["/ADMIN/x", "/admin", "/admin/ADMIN/x"],
    ["/admin/x", "/Admin", "/Admin/admin/x"],
    ["/aDmIn?x", "/admin/", "/admin/aDmIn?x"],
    ["/Admin/", "/admin", "/admin/Admin/"],
    ["/ÜBER/x", "/über", "/über/ÜBER/x"],
    ["/API", "/api/", "/api/API"],
  ]);
});
