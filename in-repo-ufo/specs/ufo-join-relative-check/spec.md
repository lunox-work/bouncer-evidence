# `joinURL` becomes a plain join; `joinRelativeURL` resolves `./` and `../` (#220)

`src/utils.ts` exports `joinURL`, which today splits every argument on `/`,
drops empty and `.` pieces, resolves `..` against earlier pieces, and puts back
a leading `/` or `./` and a trailing `/`. This change moves that resolving
behaviour, unchanged, into a new export `joinRelativeURL`. `joinURL` gets a
named `base` parameter and becomes a simple join: it puts exactly one `/`
between the accumulated URL and each further segment, and never resolves `..`.
Both functions are pure and synchronous. They read no state and keep none, so
overlapping calls cannot affect each other and no concurrency rules apply.

## Interface

Exported from `src/utils.ts` (and so from `src/index.ts` / the `ufo` package
entry, which re-exports `./utils`):

```ts
export function joinURL(base: string, ...input: string[]): string;

export function joinRelativeURL(..._input: string[]): string;
```

- `joinURL(base, ...input)`: **changed behaviour** (see Rules 1–7). The old
  resolving behaviour is not kept under this name.
- `joinRelativeURL(..._input)`: **new**. Behaves exactly as `joinURL(..._input)`
  did before this change (see Rules 8–11).
- No new types or constants are exported. The leading-slash regular expression
  the change adds is module-private and is not part of the interface.
- `withBase(input, base)` still calls `joinURL(withoutTrailingSlash(base), input)`,
  so it inherits the new `joinURL` behaviour for `input`s that contain `..`
  (Rule 12). Its other behaviour is unchanged.
- Every other export of `src/utils.ts` keeps its current behaviour, including
  `isNonEmptyURL`, `isEmptyURL`, `withTrailingSlash`, `withoutTrailingSlash`,
  `withLeadingSlash`, `withoutLeadingSlash`, `cleanDoubleSlashes`,
  `withoutBase`, `resolveURL`, `isRelative` and `hasProtocol`.

In the tables below, `args` is the argument list exactly as passed, written as
JavaScript literals. `undefined` and `null` are passed through a cast
(`as string`), as the existing `test/join.test.ts` already does.

```gherkin
Feature: joinURL joins segments literally; joinRelativeURL joins and resolves ./ and ../

  Background:
    Given "joinURL" and "joinRelativeURL" are imported from "src/utils.ts"

  # ---------------------------------------------------------------------------
  # joinURL
  # ---------------------------------------------------------------------------

  Rule: 1. joinURL puts exactly one "/" between the accumulated URL and each further segment
    The accumulated URL gets a "/" appended only when it does not already end in "/".
    Then the segment is appended, with one leading "./" or "/" removed if it has one.

    @happy
    Scenario: Segments are joined with single slashes
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args                       | result         |
        | "a", "b"                   | "a/b"          |
        | "a", "/b", "/c"            | "a/b/c"        |
        | "a/", "b"                  | "a/b"          |
        | "a/", "/b"                 | "a/b"          |
        | "a", "b/", "c"             | "a/b/c"        |
        | "a", "b/", "/c"            | "a/b/c"        |
        | "./", "a"                  | "./a"          |
        | "./a", "./b"               | "./a/b"        |
        | "/", "/b"                  | "/b"           |
        | "/", "./foo"               | "/foo"         |
        | "/", "./foo", "bar"        | "/foo/bar"     |
        | "http://x.com", "a", "b"   | "http://x.com/a/b" |

    @happy
    Scenario: A base alone is returned unchanged
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args   | result |
        | "/a"   | "/a"   |
        | "/"    | "/"    |
        | "a/"   | "a/"   |
        | ""     | ""     |

  Rule: 2. joinURL treats a falsy base as "" (Decided 1)
    A base of "", undefined or null does not throw. The URL starts empty, so the
    first segment that survives Rule 3 becomes the URL as written (Rule 5).

    @boundary
    Scenario: Falsy base
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args                 | result |
        | undefined            | ""     |
        | undefined, "./"      | "./"   |
        | null, "b"            | "b"    |
        | "", "/b", "c"        | "/b/c" |

  Rule: 3. joinURL drops every segment after the base that is "", undefined, null or exactly "/" (Decided 2)
    The filter is isNonEmptyURL. The base is never filtered, so a base of "/" is kept.
    A segment of "//" or "./" is not dropped; Rule 4 applies to it.

    @boundary
    Scenario: Empty and bare-slash segments are skipped
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args                  | result |
        | "a", "", "/", "b"     | "a/b"  |
        | "a", "b", "", "c"     | "a/b/c"|
        | "a/", "/"             | "a/"   |
        | "/", ""               | "/"    |
        | "/", "/", "a"         | "/a"   |
        | "", "/"               | ""     |
        | "", "", "/b"          | "/b"   |
        | "a", undefined, "b"   | "a/b"  |

  Rule: 4. joinURL removes only one leading "./" or "/" from a segment joined to a non-empty URL (Decided 3)
    Further leading slashes stay. A segment that is only "./" leaves the URL with a trailing "/".
    "." alone is not stripped.

    @boundary
    Scenario: Only a single leading "./" or "/" is stripped
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args           | result   |
        | "a", "//b"     | "a//b"   |
        | "a", ".//b"    | "a//b"   |
        | "a", "//"      | "a//"    |
        | "a", "./"      | "a/"     |
        | "/", "./"      | "/"      |
        | "./", "./b"    | "./b"    |
        | "a", "."       | "a/."    |

  Rule: 5. joinURL uses the first segment as written while the accumulated URL is still "" (Decided 5)
    No leading "./" or "/" is removed from it. Later segments follow Rule 4.

    @boundary
    Scenario: First segment after an empty base keeps its prefix
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args               | result   |
        | "", "/b"           | "/b"     |
        | "", "./a"          | "./a"    |
        | "", "./a", "./b"   | "./a/b"  |

  Rule: 6. joinURL does not resolve ".." and appends such segments literally (Decided 4)

    @unhappy
    Scenario: ".." pieces are kept as written
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args                 | result         |
        | "/a", "../b"         | "/a/../b"      |
        | "a", "../b"          | "a/../b"       |
        | "a", "..", "b"       | "a/../b"       |
        | "/a/b/c", "../../d"  | "/a/b/c/../../d" |

  Rule: 7. joinURL keeps the last segment's trailing slash and adds or removes none (Decided 7)

    @boundary
    Scenario: Trailing slash follows the last segment
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args              | result    |
        | "a", "b", "c/"    | "a/b/c/"  |
        | "a", "/b/"        | "a/b/"    |
        | "/", "./foo/"     | "/foo/"   |
        | "a/", "b"         | "a/b"     |

  Rule: 7a. joinURL adds the joining "/" at the very end of the accumulated string, even after a query or hash (Decided 6)
    The URL is not parsed; withTrailingSlash is applied without respecting query or fragment.

    @unhappy
    Scenario: The joining slash lands after a query or hash in the base
      When joinURL is called with <args>
      Then it returns <result>

      Examples:
        | args                     | result                 |
        | "http://x.com?q=1", "a"  | "http://x.com?q=1/a"   |
        | "/a#h", "b"              | "/a#h/b"               |

  # ---------------------------------------------------------------------------
  # joinRelativeURL
  # ---------------------------------------------------------------------------

  Rule: 8. joinRelativeURL returns what joinURL returned before this change (Decided 10)
    Each input is split on "/". Empty pieces and "." are dropped. ".." removes the previous
    piece, and pieces left with nowhere to go become leading "../". The pieces are joined with "/".
    When no "../" prefix is needed, a leading "/" or "./" on the first kept input is restored.
    A trailing "/" on the last kept input is restored.

    @happy
    Scenario: Resolving "./" and "../"
      When joinRelativeURL is called with <args>
      Then it returns <result>

      Examples:
        | args                       | result     |
        | "/a", "../b", "./c"        | "/b/c"     |
        | "/a", "../b"               | "/b"       |
        | "/a/b/c", "../../d"        | "/a/d"     |
        | "/a", "../../d"            | "/d"       |
        | "/a", ".././../d"          | "/d"       |
        | "/a/b", "../../../d"       | "/d"       |
        | "../a", "../b"             | "b"        |
        | "../a", "./../b"           | "b"        |
        | "../a/", "../b"            | "b"        |

    @boundary
    Scenario: More ".." than pieces produces a leading "../" prefix
      When joinRelativeURL is called with <args>
      Then it returns <result>

      Examples:
        | args                       | result      |
        | "/a", "../../../d"         | "../d"      |
        | "../a", "./../../b"        | "../b"      |
        | "../a", "../../../b"       | "../../b"   |
        | "../a", "../../../../b"    | "../../../b"|

    @happy
    Scenario: Plain joins, slashes and prefixes
      When joinRelativeURL is called with <args>
      Then it returns <result>

      Examples:
        | args                    | result     |
        | "/a"                    | "/a"       |
        | "a", "b"                | "a/b"      |
        | "a", "b/", "c"          | "a/b/c"    |
        | "a", "b/", "/c"         | "a/b/c"    |
        | "./", "a"               | "./a"      |
        | "./a", "./b"            | "./a/b"    |
        | "/", "/b"               | "/b"       |
        | "/", "./"               | "/"        |
        | "/", "./foo"            | "/foo"     |
        | "/", "./foo/"           | "/foo/"    |
        | "/", "./foo", "bar"     | "/foo/bar" |
        | "a", "b", "c/"          | "a/b/c/"   |
        | ".", "a"                | "a"        |
        | "a", "."                | "a"        |

  Rule: 9. joinRelativeURL drops only falsy inputs before deciding prefixes and trailing slash (Decided 8)
    "", undefined and null are removed. A bare "/" is kept as an input, so it can supply
    the leading "/" when it comes first and the trailing "/" when it comes last.

    @boundary
    Scenario: Falsy inputs are skipped and "/" still counts
      When joinRelativeURL is called with <args>
      Then it returns <result>

      Examples:
        | args               | result |
        | undefined, "./"    | "./"   |
        | "", "a", ""        | "a"    |
        | "", "/a"           | "/a"   |
        | "/"                | "/"    |
        | "/", "a"           | "/a"   |
        | "a", "/"           | "a/"   |
        | "a", "/", "b"      | "a/b"  |

  Rule: 10. joinRelativeURL with no arguments returns "" and does not throw (Decided 9)

    @boundary
    Scenario: No arguments
      When joinRelativeURL is called with no arguments
      Then it returns ""

  Rule: 11. joinRelativeURL treats every input as a plain "/"-separated path, with no handling for protocols, queries or hashes (Decided 13)
    A "//" after a protocol collapses like any other empty piece. "?" and "#" are ordinary characters.

    @unhappy
    Scenario: Protocol and query are not special
      When joinRelativeURL is called with <args>
      Then it returns <result>

      Examples:
        | args                         | result          |
        | "http://x.com/a", "../b"     | "http:/x.com/b" |
        | "a?q=1", "b"                 | "a?q=1/b"       |

  # ---------------------------------------------------------------------------
  # Existing callers
  # ---------------------------------------------------------------------------

  Rule: 12. withBase follows the new joinURL, so ".." in its input is no longer resolved (Decided 11, Decided 12)

    @boundary
    Scenario: withBase joins without resolving
      When withBase is called with input <input> and base <base>
      Then it returns <result>

      Examples:
        | input    | base     | result        |
        | "/a"     | "/b"     | "/b/a"        |
        | "a"      | "/b/"    | "/b/a"        |
        | "../a"   | "/base"  | "/base/../a"  |
```

Decided:

1. A falsy `base` given to `joinURL` (`""`, `undefined`, `null`) is treated as `""`. The first segment that is kept then becomes the URL as written (Rule 2).
   Ticket: silent.
   Instead: Throw an error, or skip the empty base and still normalize the first segment.
2. `joinURL` drops each segment after the base that fails `isNonEmptyURL`: `""`, `undefined`, `null` and exactly `"/"`. The base itself is never filtered (Rule 3).
   Ticket: silent.
   Instead: Skip only empty strings, or keep `"/"` so it adds a trailing slash.
3. `joinURL` strips one leading `"./"` or `"/"` from a segment and joins it with exactly one slash. Further leading slashes are kept (Rule 4).
   Ticket: silent.
   Instead: Keep the segment as written, or strip all repeated leading slashes.
4. `joinURL` does not resolve `..`. It appends such segments literally (Rule 6).
   Ticket: silent.
   Instead: Resolve `..` by dropping the previous path segment.
5. While the accumulated URL is still `""`, `joinURL` uses the segment as written, without stripping a leading `"./"` or `"/"` (Rule 5).
   Ticket: silent.
   Instead: Apply the same leading-slash stripping to every segment.
6. The joining slash comes from `withTrailingSlash(url)` (without query/fragment respect) followed by concatenation. When the base has a query or hash, the slash lands after it (Rule 7a).
   Ticket: silent.
   Instead: Insert the slash only into the path part, ahead of any query or hash.
7. `joinURL` keeps the last segment's trailing slash as written and adds or removes none (Rule 7).
   Ticket: silent.
   Instead: Normalize the result so it either always or never ends in a slash.
8. `joinRelativeURL` drops only falsy inputs before choosing the prefix and trailing slash. A bare `"/"` stays in the input list (Rule 9).
   Ticket: silent.
   Instead: Also skip `"/"` and `"."` segments, or throw on empty input.
9. `joinRelativeURL()` with no arguments follows the old `joinURL` path and returns `""` (Rule 10).
   Ticket: silent.
   Instead: Return `""` through an explicit early return, or throw.
10. `joinRelativeURL` resolves `./` and `../` exactly as the old `joinURL` did, e.g. `joinRelativeURL("/a", "../b", "./c")` → `"/b/c"` (Rule 8).
   Ticket: silent.
   Instead: Join literally and leave `..` alone, as `joinURL` now does.
11. The new `joinURL` replaces the old behaviour under that name. The old resolving logic moves to `joinRelativeURL`, and `joinURL` becomes a simple join (Rules 1–7).
   Ticket: silent.
   Instead: Leave `joinURL`'s behaviour alone and add `joinRelativeURL` as a separate function.
12. `withBase` keeps calling `joinURL`, so an `input` containing `..` is no longer resolved against the base (Rule 12).
   Ticket: silent.
   Instead: Switch `withBase` to `joinRelativeURL` so its old resolving behaviour is kept.
13. `joinRelativeURL` has no protocol, query or hash awareness. A protocol's `//` collapses to `/` and `?`/`#` are ordinary characters, as in the old `joinURL` (Rule 11).
   Ticket: silent.
   Instead: Keep the protocol and host intact and resolve `..` only within the path.
