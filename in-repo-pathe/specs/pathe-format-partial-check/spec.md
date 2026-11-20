# `format` accepts partial path objects

`format(pathObject)` in `src/_path.ts` builds a path string from the fields of a
`path.FormatInputPathObject` (`root`, `dir`, `base`, `name`, `ext`). Every field
of that type is optional, but today the base segment is computed as
`p.base ?? p.name + p.ext`, so a call that leaves out `name` or `ext` produces
the literal text `"undefined"` (e.g. `format({ name: "file" })` returns
`"fileundefined"`). Issue #198 asks that calls with only some of the fields
work. This change fixes how the base segment is derived from `name` and `ext`
and leaves the rest of `format` as it is.

## Interface

`src/_path.ts` keeps all its exports with the same names and signatures. The
only changed export is:

```ts
import type path from "node:path";

export const format: typeof path.format;
// i.e. (pathObject: path.FormatInputPathObject) => string
// where FormatInputPathObject = {
//   root?: string; dir?: string; base?: string; name?: string; ext?: string;
// }
```

`format` is also reachable as `posix.format`, `win32.format` and the default
export's `format` through `src/index.ts`. They are the same function and behave
the same way.

There are no new exports, types or constants. All other exports of
`src/_path.ts` (`sep`, `normalize`, `join`, `resolve`, `normalizeString`,
`isAbsolute`, `toNamespacedPath`, `extname`, `relative`, `dirname`,
`basename`, `parse`, `matchesGlob`) keep their current behaviour.

`format` is a pure, synchronous function. It never throws for an object whose
fields are each a `string` or `undefined`. The scenarios below give a `root`
only when it is absolute (`/` or a drive root like `C:\`). How `format`
behaves with a relative `root` depends on `process.cwd()`. This change does not
touch that case and this spec does not cover it.

## Behaviour

```gherkin
Feature: format builds a path from a partial path object
  The path is built from three segments, in this order: root, dir and the base
  segment. The base segment is `base` when `base` is not undefined. Otherwise
  it is `name` followed by the normalised extension. Empty segments are
  dropped. If `root` is non-empty, the remaining segments go through `resolve`.
  If not, they are joined with "/". The result is then passed through
  Windows-path normalisation (backslashes become "/", and a drive letter is
  upper-cased).

  Rule: A missing name counts as the empty string

    @happy
    Scenario: Only an extension is given
      When I call format with { ext: ".txt" }
      Then the result is ".txt"

    @happy
    Scenario: Directory and extension without a name
      When I call format with { dir: "/home/user", ext: ".txt" }
      Then the result is "/home/user/.txt"

    @boundary
    Scenario: Name explicitly undefined
      When I call format with { dir: "dist", name: undefined, ext: "txt" }
      Then the result is "dist/.txt"

  Rule: A missing or empty ext adds nothing to the name

    @happy
    Scenario Outline: Name without a usable extension
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                                | output            |
        | { name: "file" }                     | "file"            |
        | { name: "file", ext: undefined }     | "file"            |
        | { name: "file", ext: "" }            | "file"            |
        | { dir: "/home/user", name: "file" }  | "/home/user/file" |
        | { root: "/", name: "file" }          | "/file"           |

    @boundary
    Scenario: Name that itself starts with a dot
      When I call format with { name: ".bashrc" }
      Then the result is ".bashrc"

  Rule: An ext without a leading dot gets one; an ext with a leading dot is used as given

    @happy
    Scenario Outline: Extension dot handling
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                                    | output           |
        | { name: "file", ext: "txt" }             | "file.txt"       |
        | { name: "file", ext: ".txt" }            | "file.txt"       |
        | { ext: "txt" }                           | ".txt"           |
        | { root: "/", ext: "txt" }                | "/.txt"          |
        | { dir: "/home/user", ext: "txt" }        | "/home/user/.txt"|
        | { name: "archive.tar", ext: "gz" }       | "archive.tar.gz" |
        | { name: "file", ext: ".tar.gz" }         | "file.tar.gz"    |

    @boundary
    Scenario Outline: Only one leading dot is checked; the rest of ext is kept verbatim
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                           | output      |
        | { name: "file", ext: "." }      | "file."     |
        | { name: "file", ext: "..txt" }  | "file..txt" |

  Rule: base wins over name and ext whenever base is not undefined

    @happy
    Scenario Outline: base given together with name or ext
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                                          | output     |
        | { base: "a.md", name: "file", ext: ".txt" }    | "a.md"     |
        | { base: "a.md", ext: "txt" }                   | "a.md"     |
        | { name: "file", base: "file.txt" }             | "file.txt" |
        | { root: "/", base: "file.txt", ext: "ignored" }| "/file.txt"|

    @boundary
    Scenario: base explicitly undefined falls back to name and ext
      When I call format with { base: undefined, name: "f", ext: "md" }
      Then the result is "f.md"

  Rule: An empty-string base still wins, so name and ext are ignored and the base segment is dropped

    @boundary
    Scenario Outline: Empty base
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                                                    | output       |
        | { base: "" }                                             | ""           |
        | { base: "", name: "file", ext: ".txt" }                  | ""           |
        | { dir: "/home/user", base: "", name: "file", ext: ".txt" }| "/home/user" |

  Rule: Empty segments are dropped; with nothing left the result is the empty string

    @boundary
    Scenario Outline: Nothing to format
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                  | output |
        | {}                     | ""     |
        | { name: "", ext: "" }  | ""     |
        | { root: "", dir: "" }  | ""     |

    @boundary
    Scenario Outline: Only one non-empty segment
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                    | output       |
        | { dir: "/home/user" }    | "/home/user" |
        | { root: "/" }            | "/"          |
        | { root: "/", dir: "/" }  | "/"          |

  Rule: With a non-empty root the segments are resolved; without a root they are joined with "/" verbatim

    @happy
    Scenario Outline: Root given, segments resolved and normalised
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                                                       | output                    |
        | { root: "/", name: "file", ext: ".txt" }                    | "/file.txt"               |
        | { root: "/", dir: "/home/user", name: "file", ext: "txt" }  | "/home/user/file.txt"     |
        | { root: "/ignored", dir: "/home/user/dir", base: "file.txt" }| "/home/user/dir/file.txt" |
        | { root: "/", dir: "/home/user/../x", base: "f.txt" }        | "/home/x/f.txt"           |
        | { root: "C:\\", dir: "C:\\path", name: "file", ext: "txt" } | "C:/path/file.txt"        |

    @happy
    Scenario Outline: No root, segments joined with "/" and not normalised
      When I call format with <input>
      Then the result is <output>

      Examples:
        | input                                       | output                  |
        | { name: "file", ext: ".txt" }               | "file.txt"              |
        | { dir: "/home/user/../x", base: "f.txt" }   | "/home/user/../x/f.txt" |
        | { dir: "C:\\path\\dir", base: "file.txt" }  | "C:/path/dir/file.txt"  |
        | { dir: "a\\b", base: "f.txt" }              | "a/b/f.txt"             |

    @boundary
    Scenario: No root and a dir with a trailing separator keeps both separators
      When I call format with { dir: "dist/", base: "a.js" }
      Then the result is "dist//a.js"

    @boundary
    Scenario: No root and only a dir with a trailing separator
      When I call format with { dir: "dist/" }
      Then the result is "dist/"
```

## Decided:

- A missing `name` counts as `""`, so the base segment is just the normalised extension, or it is empty and dropped.
  - Ticket: "allow calls with partial arguments (#198)"
  - Instead: Skip the base segment entirely, or throw an error.
- An `ext` without a leading `.` gets one prepended (`"txt"` → `".txt"`). An `ext` that already starts with `.` is used verbatim, including `"."` and `"..txt"`.
  - Ticket: silent.
  - Instead: Append `ext` verbatim, as Node's path.format does for the no-dot case, which Node also normalizes by adding a dot.
- An `ext` that is `undefined` or `""` adds nothing to the name.
  - Ticket: silent.
  - Instead: Append the value as is, which gives the string 'undefined' with the old code.
- `base` is used whenever it is not `undefined`, and `name` and `ext` are then ignored.
  - Ticket: silent.
  - Instead: Combine them or let `name` plus `ext` override `base`.
- An empty-string `base` still counts as given. It wins over `name`/`ext` and is then dropped as an empty segment.
  - Ticket: silent.
  - Instead: Treat an empty `base` as missing and fall back to `name` plus `ext`.
- When every field is empty or missing, the result is `""`, with no root, no `"."` and no error.
  - Ticket: silent.
  - Instead: Return '.' or throw an error.
- Joining is unchanged. With a non-empty `root`, the segments go through `resolve`, which normalises the path and lets an absolute `dir` replace `root`. Without a `root`, the segments are joined with `"/"`.
  - Ticket: silent.
  - Instead: Join with a separator without resolving, as Node's format does.
- Without a `root`, a `dir` that ends in `/` is joined verbatim, which gives a doubled separator (`"dist//a.js"`).
  - Ticket: silent.
  - Instead: Skip the separator when `dir` already ends with one, as Node's format does.
- A relative `root` is out of scope. Its result depends on `process.cwd()`, and this change neither specifies nor alters it.
  - Ticket: silent.
  - Instead: Specify it as resolved against the current working directory, or treat it as a literal prefix.
