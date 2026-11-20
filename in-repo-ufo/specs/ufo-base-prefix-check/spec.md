# withBase / withoutBase: match the base only at a path boundary

`withBase(input, base)` and `withoutBase(input, base)` in `src/utils.ts` decide
whether `input` already carries `base` with a plain `input.startsWith(base)`
check, after taking one trailing `/` off `base`. Because of this, `/admin-dashboard`
counts as being under base `/admin`. `withBase` then leaves it as it is, and
`withoutBase` cuts it down to `/-dashboard` (issue #313). After this change, a
base prefix counts only when the character right after it in `input` is a
boundary: end of string, `/` or `?`. If the prefix is not followed by a
boundary, `input` is treated as unrelated to the base. `withBase` joins it onto
the base, and `withoutBase` returns it unchanged.

## Interface

The exports from `src/utils.ts` (re-exported unchanged by `src/index.ts`) keep
their names and signatures:

```ts
export function withBase(input: string, base: string): string;
export function withoutBase(input: string, base: string): string;
```

The change adds no exports, types or constants. Every other export of
`src/utils.ts` keeps its current behaviour. This includes `joinURL`,
`withoutTrailingSlash`, `withTrailingSlash`, `hasTrailingSlash`, `hasProtocol`,
`isEmptyURL` and `isNonEmptyURL`.

The following parts of `withBase` and `withoutBase` stay as they are:

- If `base` is `""` or `"/"` (`isEmptyURL(base)`), both return `input` unchanged.
- If `hasProtocol(input)` is true, `withBase` returns `input` unchanged.
- The *normalized base* is `withoutTrailingSlash(base)`. This removes exactly one
  trailing `/`.
- Matching is a case-sensitive `input.startsWith(normalizedBase)` on the raw
  strings. Neither the input nor the base is decoded or otherwise normalized.
- When `withBase` adds the base, it returns `joinURL(normalizedBase, input)`.
- When `withoutBase` strips the base, it returns the rest of `input`, with a `/`
  added in front if the rest does not already start with `/`.

Definition. `input` **has the base** if both of these are true:

1. `input.startsWith(normalizedBase)`.
2. The character `input[normalizedBase.length]` is a boundary: it does not exist
   (`input === normalizedBase`), or it is `/`, or it is `?`. All other characters,
   including `#`, `-`, `.`, `;`, `:`, `&`, `\`, `%` and letters, are not boundaries.

Neither function throws for any pair of strings. Both are synchronous and pure,
so calls that overlap cannot affect each other.

```gherkin
Feature: Base prefix matching in withBase and withoutBase
  The base counts as present only when it is followed by end of string, "/" or "?"

  Rule: withBase returns the input unchanged when the input has the base

    @happy
    Scenario Outline: input already under the base is not prefixed again
      When withBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input        | base     | result       |
        | /admin/users | /admin   | /admin/users |
        | /admin/users | /admin/  | /admin/users |
        | /admin/      | /admin   | /admin/      |
        | /admin?x=1   | /admin   | /admin?x=1   |
        | /admin?x=1   | /admin/  | /admin?x=1   |
        | /admin?      | /admin   | /admin?      |
        | /admin/#top  | /admin   | /admin/#top  |
        | /a/b/c       | /a/b     | /a/b/c       |

    @boundary
    Scenario Outline: input equal to the normalized base is returned unchanged
      When withBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input  | base    | result |
        | /admin | /admin  | /admin |
        | /admin | /admin/ | /admin |
        | /base  | /base/  | /base  |

  Rule: withBase joins the base onto an input that only shares a string prefix with it

    @unhappy
    Scenario Outline: a prefix followed by a non-boundary character is not the base
      When withBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input              | base    | result                   |
        | /admin-dashboard   | /admin  | /admin/admin-dashboard   |
        | /admin-dashboard   | /admin/ | /admin/admin-dashboard   |
        | /adminx            | /admin  | /admin/adminx            |
        | /admin-dashboard?x | /admin  | /admin/admin-dashboard?x |
        | /a/bc              | /a/b    | /a/b/a/bc                |
        | /base/a-b          | /base/a | /base/a/base/a-b         |

    @unhappy
    Scenario Outline: "#" directly after the base is not a boundary
      When withBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input      | base   | result           |
        | /admin#top | /admin | /admin/admin#top |

    @unhappy
    Scenario Outline: punctuation that is not "/" or "?" is not a boundary
      When withBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input       | base   | result             |
        | /admin.json | /admin | /admin/admin.json  |
        | /admin;x    | /admin | /admin/admin;x     |
        | /admin:x    | /admin | /admin/admin:x     |
        | /admin&x    | /admin | /admin/admin&x     |
        | /admin\\x   | /admin | /admin/admin\\x    |
        | /admin%2Fx  | /admin | /admin/admin%2Fx   |

    @unhappy
    Scenario: the comparison is case-sensitive
      When withBase is called with input "/Admin/x" and base "/admin"
      Then the result is "/admin/Admin/x"

  Rule: withoutBase strips the base only when the input has the base

    @happy
    Scenario Outline: base followed by a boundary is stripped
      When withoutBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input        | base    | result |
        | /admin/users | /admin  | /users |
        | /admin/users | /admin/ | /users |
        | /admin/      | /admin  | /      |
        | /admin?x=1   | /admin  | /?x=1  |
        | /admin?x=1   | /admin/ | /?x=1  |
        | /api?test    | /api    | /?test |
        | /admin?      | /admin  | /?     |
        | /admin/#top  | /admin  | /#top  |
        | /a/b/c       | /a/b    | /c     |

    @boundary
    Scenario Outline: input equal to the normalized base becomes "/"
      When withoutBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input   | base      | result |
        | /admin  | /admin    | /      |
        | /admin  | /admin/   | /      |
        | /base/a | /base/a/  | /      |

    @boundary
    Scenario: the remainder is not normalized further
      When withoutBase is called with input "/admin//x" and base "/admin"
      Then the result is "//x"

  Rule: withoutBase returns the input unchanged when it only shares a string prefix with the base

    @unhappy
    Scenario Outline: a prefix followed by a non-boundary character is left in place
      When withoutBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input              | base    | result             |
        | /admin-dashboard   | /admin  | /admin-dashboard   |
        | /admin-dashboard   | /admin/ | /admin-dashboard   |
        | /adminx            | /admin  | /adminx            |
        | /admin-dashboard?x | /admin  | /admin-dashboard?x |
        | /a/bc              | /a/b    | /a/bc              |
        | /base/a-b          | /base/a | /base/a-b          |

    @unhappy
    Scenario: "#" directly after the base is not a boundary
      When withoutBase is called with input "/admin#top" and base "/admin"
      Then the result is "/admin#top"

    @unhappy
    Scenario Outline: punctuation that is not "/" or "?" is not a boundary
      When withoutBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input       | base   | result      |
        | /admin.json | /admin | /admin.json |
        | /admin;x    | /admin | /admin;x    |
        | /admin:x    | /admin | /admin:x    |
        | /admin&x    | /admin | /admin&x    |
        | /admin\\x   | /admin | /admin\\x   |
        | /admin%2Fx  | /admin | /admin%2Fx  |

    @unhappy
    Scenario: the comparison is case-sensitive
      When withoutBase is called with input "/Admin/x" and base "/admin"
      Then the result is "/Admin/x"

  Rule: Only one trailing slash is removed from the base before the boundary check

    @boundary
    Scenario Outline: a base ending in "//" keeps one "/" in the prefix it must match
      When <fn> is called with input "<input>" and base "/admin//"
      Then the result is "<result>"

      Examples:
        | fn          | input     | result         |
        | withBase    | /admin//x | /admin//x      |
        | withBase    | /admin/x  | /admin/admin/x |
        | withoutBase | /admin//x | /x             |
        | withoutBase | /admin/x  | /admin/x       |

  Rule: Existing early returns and non-matching behaviour are unchanged

    @happy
    Scenario Outline: withBase keeps its existing results
      When withBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input            | base   | result           |
        | /                | /      | /                |
        |                  | /foo   | /foo             |
        | /                | /foo/  | /foo             |
        | /bar             | /foo   | /foo/bar         |
        | /foo/bar         | /baz   | /baz/foo/bar     |
        | /x               | /      | /x               |
        | /x               |        | /x               |
        | https://test.com | /base/ | https://test.com |
        | https://test.com | /      | https://test.com |

    @happy
    Scenario Outline: withoutBase keeps its existing results
      When withoutBase is called with input "<input>" and base "<base>"
      Then the result is "<result>"

      Examples:
        | input            | base   | result           |
        | /                | /      | /                |
        | /                | /foo   | /                |
        | /                | /foo/  | /                |
        |                  | /foo   |                  |
        | /bar             | /foo   | /bar             |
        | /test/           | /      | /test/           |
        | /?test           | /      | /?test           |
        | /x               |        | /x               |
        | https://test.com | /base/ | https://test.com |
        | https://test.com | /      | https://test.com |

    @boundary
    Scenario Outline: a base without a leading slash uses the same boundary rule
      When <fn> is called with input "<input>" and base "admin"
      Then the result is "<result>"

      Examples:
        | fn          | input           | result                |
        | withBase    | admin/x         | admin/x               |
        | withBase    | admin-dashboard | admin/admin-dashboard |
        | withoutBase | admin/x         | /x                    |
        | withoutBase | admin-dashboard | admin-dashboard       |

  Rule: Neither function throws, and results do not depend on call order

    @unhappy
    Scenario Outline: no pair of strings raises an error
      When <fn> is called with input "<input>" and base "<base>"
      Then no error is thrown
      And the result is "<result>"

      Examples:
        | fn          | input  | base   | result        |
        | withBase    | #      | /admin | /admin/#      |
        | withoutBase | #      | /admin | #             |
        | withBase    | ?      | /admin | /admin/?      |
        | withoutBase | /admin | /admin | /             |

    @concurrency
    Scenario: interleaved calls with different bases give the same results as isolated calls
      Given the calls are made in this order:
        | fn          | input            | base   |
        | withBase    | /admin-dashboard | /admin |
        | withoutBase | /admin/users     | /admin |
        | withBase    | /admin-dashboard | /other |
        | withoutBase | /admin-dashboard | /admin |
      Then the results, in order, are:
        | result                 |
        | /admin/admin-dashboard |
        | /users                 |
        | /other/admin-dashboard |
        | /admin-dashboard       |
```

Decided:

- Characters that count as a boundary after the base in `withBase`: only end of string, `/` or `?`. `#` is not a boundary, so `/admin#top` is joined onto the base again.
  Ticket: silent.
  Instead: Also accept `#` as a boundary, so `/base#hash` counts as having the base.
- `withoutBase` with `#` right after the base: the input is left unchanged, so `/admin#top` stays `/admin#top`.
  Ticket: silent.
  Instead: Treat `#` as a boundary and strip the base, giving `/#x`.
- `withBase` with an input that only looks like it has the base (`/admin-dashboard` with base `/admin`): the base and input are joined, giving `/admin/admin-dashboard`.
  Ticket: silent.
  Instead: Return the input unchanged and treat it as an unrelated path.
- `withoutBase` with an input that only shares a string prefix with the base: the input is returned unchanged.
  Ticket: silent.
  Instead: Strip the prefix anyway, which is the previous behaviour.
- Trailing slash on the base: it is removed (with `withoutTrailingSlash`) before the next character of the input is checked against the boundary set.
  Ticket: silent.
  Instead: Keep the base's trailing slash and require it to match the input literally.
- Case sensitivity: the comparison stays case-sensitive, so `/Admin/x` does not match base `/admin`.
  Ticket: silent.
  Instead: Compare case-insensitively.
- Input exactly equal to the normalized base: `withBase` returns it unchanged, and `withoutBase` returns `/`.
  Ticket: silent.
  Instead: Treat an exact match differently, for example by returning an empty string.
- Segment rule or character allowlist: a fixed allowlist of next characters (end, `/`, `?`). `.`, `;`, `:`, `&` and the like are not boundaries, so `/admin.json` does not have base `/admin`.
  Ticket: silent.
  Instead: Parse the input into path segments and compare whole segments.
- Backslash and percent-encoded slash after the base: `\` and `%2F` are not boundaries. The input is not decoded or slash-normalized before the check.
  Ticket: silent.
  Instead: Treat `\` and `%2F`/`%2f` as `/`, as WHATWG URL parsing does for special schemes.
- Base with more than one trailing slash: only one `/` is removed, so base `/admin//` matches `/admin//x` but not `/admin/x`.
  Ticket: silent.
  Instead: Strip all trailing slashes from the base before matching.
- Remainder after stripping in `withoutBase`: it is returned as it is, apart from adding a leading `/`. `/admin//x` with base `/admin` gives `//x`.
  Ticket: silent.
  Instead: Collapse repeated leading slashes in the remainder, giving `/x`.
- Rejected inputs: no pair of strings makes either function throw. Inputs that don't match are joined (`withBase`) or returned unchanged (`withoutBase`).
  Ticket: silent.
  Instead: Throw a `TypeError` for inputs that share a prefix with the base but are not under it.
- Overlapping calls: both functions are pure and keep no shared state, so the order of calls never changes a result.
  Ticket: silent.
  Instead: Cache the normalized base between calls.
