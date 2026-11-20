import { expect, test } from "vitest";
import { withoutBase } from "../../src/utils";

type Row = [input: string, base: string, result: string];

function check(rows: Row[]) {
  for (const [input, base, result] of rows) {
    expect(withoutBase(input, base), `withoutBase(${JSON.stringify(input)}, ${JSON.stringify(base)})`).toBe(result);
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

// Extends public "[happy-2] withoutBase strips a base followed by / or ?":
// deeper bases, longer tails, query and fragment combinations.
test("[happy-2] withoutBase strips deeper bases and keeps longer tails as they are", () => {
  check([
    ["/a/b/c/d/e", "/a/b/c", "/d/e"],
    ["/a/b/c/d/e", "/a/b/c/", "/d/e"],
    ["/api/v1/users?id=1", "/api/v1", "/users?id=1"],
    ["/admin/?x=1#y", "/admin", "/?x=1#y"],
    ["/admin?a=1&b=2#frag", "/admin", "/?a=1&b=2#frag"],
    ["/admin/users/", "/admin/", "/users/"],
    ["/admin/#top", "/admin/", "/#top"],
  ]);
});

// Extends public "[happy-2] withoutBase strips a base followed only by a bare / or ?":
// the raw base with its trailing slash as input, and a bare ? after a base with a trailing slash.
test("[happy-2] withoutBase strips an input equal to the raw base with its trailing slash down to /", () => {
  check([
    ["/admin/", "/admin/", "/"],
    ["/api/v1?", "/api/v1/", "/?"],
    ["/a/b/", "/a/b/", "/"],
  ]);
});

// Shortcut: checking for a non-boundary character anywhere after the base.
test("[happy-2] withoutBase keeps non-boundary characters that come after the boundary", () => {
  check([
    ["/admin/-dashboard", "/admin", "/-dashboard"],
    ["/admin?-x", "/admin", "/?-x"],
    ["/admin/admin-dashboard", "/admin", "/admin-dashboard"],
    ["/admin/x.json", "/admin", "/x.json"],
    ["/admin?a#b", "/admin", "/?a#b"],
  ]);
});

// Shortcut: building a RegExp from the base without escaping it.
test("[happy-2] withoutBase strips bases containing regex metacharacters literally", () => {
  check([
    ["/a.b/c", "/a.b", "/c"],
    ["/v[1]/x", "/v[1]", "/x"],
    ["/a+b?x", "/a+b", "/?x"],
    ["/(x)/y", "/(x)/", "/y"],
    ["/a*b/c", "/a*b", "/c"],
    ["/$x/y", "/$x", "/y"],
    ["/a|b/c", "/a|b", "/c"],
  ]);
});

test("[happy-2] withoutBase strips a base that itself contains a query when / or ? follows it", () => {
  check([
    ["/api?v=1?x", "/api?v=1", "/?x"],
    ["/api?v=1/x", "/api?v=1", "/x"],
  ]);
});

test("[happy-2] withoutBase strips a base that carries a protocol when / or ? follows it", () => {
  check([
    ["https://a.com/x", "https://a.com", "/x"],
    ["https://a.com?q", "https://a.com/", "/?q"],
  ]);
});

test("[happy-2] withoutBase strips a long base", () => {
  const base = "/" + Array.from({ length: 60 }, (_, i) => `s${i}`).join("/");
  check([
    [base + "/tail/more", base, "/tail/more"],
    [base + "?q=1", base + "/", "/?q=1"],
  ]);
});

test("[happy-2] withoutBase strips a percent-encoded base only when the raw encoding matches", () => {
  check([
    ["/a%20b/x", "/a%20b", "/x"],
    ["/caf%C3%A9?x", "/caf%C3%A9", "/?x"],
  ]);
});

// ---------------------------------------------------------------------------
// @boundary
// ---------------------------------------------------------------------------

// Extends public "[boundary-2] ..." tests: other bases equal to the input after one trailing slash is removed.
test("[boundary-2] withoutBase turns inputs equal to other normalized bases into /", () => {
  check([
    ["/a/b/c", "/a/b/c/", "/"],
    ["/a/b/c", "/a/b/c", "/"],
    ["admin", "admin/", "/"],
    ["admin", "admin", "/"],
    ["/x", "/x/", "/"],
    ["/admin//", "/admin///", "/"],
    ["/a.b", "/a.b/", "/"],
  ]);
});

test("[boundary-2] withoutBase turns an input equal to a base that contains a query or protocol into /", () => {
  check([
    ["/api?v=1", "/api?v=1", "/"],
    ["/admin/?v", "/admin/?v", "/"],
    ["https://a.com", "https://a.com/", "/"],
  ]);
});

test("[boundary-2] withoutBase turns an input equal to a long base into /", () => {
  const base = "/" + Array.from({ length: 80 }, (_, i) => `p${i}`).join("/");
  check([
    [base, base, "/"],
    [base, base + "/", "/"],
  ]);
});

// Extends public "[boundary-3] ..." tests: other remainders that must not be normalized.
test("[boundary-3] withoutBase returns other remainders without normalizing them", () => {
  check([
    ["/admin///x", "/admin", "///x"],
    ["/admin//", "/admin", "//"],
    ["/admin/./x", "/admin", "/./x"],
    ["/admin/../x", "/admin", "/../x"],
    ["/admin/x/", "/admin", "/x/"],
    ["/admin/x//y", "/admin/", "/x//y"],
    ["/admin?a=1&b=%2F", "/admin", "/?a=1&b=%2F"],
    ["/admin/a%20b", "/admin", "/a%20b"],
    ["/admin/A/B", "/admin", "/A/B"],
    ["/admin?/x", "/admin", "/?/x"],
    ["/admin/#", "/admin", "/#"],
  ]);
});

// ---------------------------------------------------------------------------
// @unhappy
// ---------------------------------------------------------------------------

// Extends public "[unhappy-5] withoutBase leaves an input that only shares a string prefix unchanged":
// letters, digits, underscore and repeated base text.
test("[unhappy-5] withoutBase leaves inputs whose prefix is followed by letters, digits or underscore unchanged", () => {
  check([
    ["/admin0", "/admin", "/admin0"],
    ["/admin_", "/admin", "/admin_"],
    ["/adminA", "/admin/", "/adminA"],
    ["/admins/x", "/admin", "/admins/x"],
    ["/adminadmin", "/admin", "/adminadmin"],
    ["/admin-x/admin/y", "/admin", "/admin-x/admin/y"],
    ["/admin-x?y/z", "/admin/", "/admin-x?y/z"],
  ]);
});

// Extends public "[unhappy-5] withoutBase leaves an input extended by a single letter unchanged":
// deeper and longer bases.
test("[unhappy-5] withoutBase leaves an input that extends the last segment of a deep base unchanged", () => {
  const long = "/" + Array.from({ length: 50 }, (_, i) => `seg${i}`).join("/");
  check([
    ["/api/v1x/users", "/api/v1", "/api/v1x/users"],
    ["/api/v10", "/api/v1/", "/api/v10"],
    ["/a/b/c/de", "/a/b/c/d", "/a/b/c/de"],
    [long + "x/y", long, long + "x/y"],
  ]);
});

test("[unhappy-5] withoutBase leaves an input that extends the query of a base unchanged", () => {
  check([
    ["/api?v=1&x", "/api?v=1", "/api?v=1&x"],
    ["/api?v=10", "/api?v=1", "/api?v=10"],
  ]);
});

// Shortcut: a plain prefix check on protocol URLs strips "https://a.com" from a different host.
test("[unhappy-5] withoutBase leaves a URL whose host only shares a string prefix with the base unchanged", () => {
  check([
    ["https://a.com.evil/x", "https://a.com", "https://a.com.evil/x"],
    ["https://a.com-evil", "https://a.com/", "https://a.com-evil"],
    ["https://a.comx?y", "https://a.com", "https://a.comx?y"],
  ]);
});

test("[unhappy-5] withoutBase leaves inputs with non-ASCII, whitespace or control characters after the base unchanged", () => {
  check([
    ["/überx", "/über", "/überx"],
    ["/😀😀", "/😀", "/😀😀"],
    ["/adminé", "/admin", "/adminé"],
    ["/admin x", "/admin", "/admin x"],
    ["/admin\tx", "/admin", "/admin\tx"],
    ["/admin\nx", "/admin", "/admin\nx"],
    ["/admin\u0000", "/admin", "/admin\u0000"],
    ["/admin／x", "/admin", "/admin／x"],
  ]);
});

// Extends public "[unhappy-6] ..." tests: other inputs with "#" right after the base.
test("[unhappy-6] withoutBase leaves inputs with # right after the base followed by more text unchanged", () => {
  check([
    ["/admin#", "/admin", "/admin#"],
    ["/admin#/x", "/admin", "/admin#/x"],
    ["/admin#?x", "/admin", "/admin#?x"],
    ["/admin##", "/admin", "/admin##"],
    ["/a/b#c", "/a/b/", "/a/b#c"],
    ["admin#x", "admin", "admin#x"],
    ["https://a.com#x", "https://a.com", "https://a.com#x"],
  ]);
});

// Shortcut: stripping every trailing slash from the base, or accepting "#" after "/".
test("[unhappy-6] withoutBase does not treat # after a base ending in // as a boundary", () => {
  check([["/admin/#x", "/admin//", "/admin/#x"]]);
});

// Extends public "[unhappy-7] ..." tests: all other punctuation, with both base forms.
test("[unhappy-7] withoutBase leaves the input unchanged when any other punctuation follows the base", () => {
  for (const c of PUNCTUATION) {
    check([
      [`/admin${c}x`, "/admin", `/admin${c}x`],
      [`/admin${c}x`, "/admin/", `/admin${c}x`],
      [`/admin${c}`, "/admin", `/admin${c}`],
    ]);
  }
});

// Shortcut: decoding the input, or treating encoded / ? \ # as boundaries.
test("[unhappy-7] withoutBase does not decode encoded slashes, question marks, backslashes or hashes after the base", () => {
  check([
    ["/admin%2fx", "/admin", "/admin%2fx"],
    ["/admin%3Fx", "/admin", "/admin%3Fx"],
    ["/admin%3fx", "/admin", "/admin%3fx"],
    ["/admin%5Cx", "/admin", "/admin%5Cx"],
    ["/admin%23x", "/admin", "/admin%23x"],
    ["/admin%2F", "/admin/", "/admin%2F"],
  ]);
});

test("[unhappy-7] withoutBase does not treat dot segments after the base as boundaries", () => {
  check([
    ["/admin..", "/admin", "/admin.."],
    ["/admin./x", "/admin", "/admin./x"],
    ["/admin.json?x=1", "/admin", "/admin.json?x=1"],
  ]);
});

// Extends public "[unhappy-8] ..." tests: other case variants, including the base's case differing.
test("[unhappy-8] withoutBase compares other case variants case-sensitively", () => {
  check([
    ["/ADMIN/x", "/admin", "/ADMIN/x"],
    ["/admin/x", "/Admin", "/admin/x"],
    ["/aDmIn?x", "/admin/", "/aDmIn?x"],
    ["/Admin/", "/admin", "/Admin/"],
    ["/ÜBER/x", "/über", "/ÜBER/x"],
    ["/API", "/api/", "/API"],
  ]);
});
