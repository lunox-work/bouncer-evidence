# resolve keeps the UNC prefix

`resolve` in `src/_path.ts` currently drops the leading double slash of a UNC
path: `resolve("\\\\server\\share\\file")` returns `"/server/share/file"`, while
`normalize` and `join` already return `"//server/share/file"`. After this change
`resolve` puts the `//` prefix back when the base segment is a UNC path. The base
segment is the segment where the right-to-left walk stops (the last absolute
argument, or `process.cwd()` if no argument is absolute).

**Interface.** The change adds, removes and renames no exports. The signature
stays as it is:

```ts
export const resolve: typeof path.resolve; // (...paths: string[]) => string
```

The private constant `_UNC_REGEX = /^[/\\]{2}/` (two leading slashes or
backslashes, in any mix) is reused without changes. It is not exported. Only
`resolve` changes behaviour directly. `relative` and `format` call `resolve`, so
they change only where `resolve` now returns a `//` prefix (see the last Rule).
`normalize`, `join`, `isAbsolute`, `normalizeString`, `dirname`, `basename`,
`extname`, `parse`, `toNamespacedPath`, `matchesGlob`, `sep`, `delimiter`, `posix`
and `win32` keep their current behaviour. If `resolve` returns no `//` prefix for
an input, it returns exactly what it returned before.

`resolve` stays synchronous and keeps no state between calls, so overlapping
calls cannot affect each other. No scenario covers concurrency.

**Notation.** The scenarios write inputs as raw strings, like TypeScript's
`String.raw`: `\` is one literal backslash. `undefined` and `null` stand for those
JavaScript values passed as arguments. Tests stub the working directory by
replacing `process.cwd` with a function that returns a fixed string, as
`test/index.spec.ts` already does. Scenarios with an absolute argument return
the same result under any working directory.

```gherkin
Feature: resolve preserves the UNC prefix of its base segment

  Background:
    Given "resolve" is imported from "src/_path.ts"
    And unless a scenario says otherwise, process.cwd returns "C:\Windows\path\only"

  Rule: When the base segment matches _UNC_REGEX, the result is "//" followed by the normalized remainder

    @happy
    Scenario Outline: A single UNC argument keeps its prefix
      When resolve is called with <input>
      Then it returns <output>

      Examples:
        | input                     | output                    |
        | "\\server\share"          | "//server/share"          |
        | "//server/share"          | "//server/share"          |
        | "\\server\share\file"     | "//server/share/file"     |
        | "//server/share/file"     | "//server/share/file"     |
        | "\\server/share/file"     | "//server/share/file"     |
        | "//server"                | "//server"                |
        | "//server//share///x/"    | "//server/share/x"        |
        | "//server/share/./a/../b" | "//server/share/b"        |

    @boundary
    Scenario: A trailing separator after a UNC path is dropped
      When resolve is called with "//server/share/"
      Then it returns "//server/share"

    @boundary
    Scenario Outline: An empty normalized remainder gives a bare "//"
      When resolve is called with <arguments>
      Then it returns "//"

      Examples:
        | arguments                  |
        | "//"                       |
        | "\\"                       |
        | "//server/share", "../.."  |

  Rule: The result always uses forward slashes, including the prefix, whatever separators the input used

    @happy
    Scenario Outline: Backslash and mixed UNC inputs come back with "//"
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments                       | output                  |
        | "\\server\share\file", "..\path" | "//server/share/path"   |
        | "\\server/share/file", "../path" | "//server/share/path"   |
        | "//server\share\file", "..\path" | "//server/share/path"   |

  Rule: Relative segments after a UNC base are resolved under that base, and the prefix stays

    @happy
    Scenario Outline: Relative segments join onto a UNC base
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments                                     | output                  |
        | "\\server\share\file", "..\path"              | "//server/share/path"   |
        | "//server/share/file", "../path"              | "//server/share/path"   |
        | "//server/share/a", "b", "../c"               | "//server/share/a/c"    |
        | "//server/share", "./a/./b"                   | "//server/share/a/b"    |

    @boundary
    Scenario: Empty, undefined and null segments after a UNC base are skipped
      When resolve is called with "//server/share", "", undefined, null, "x"
      Then it returns "//server/share/x"

  Rule: ".." can climb above the share and the server; the UNC root is not clamped

    @boundary
    Scenario Outline: ".." removes share and server components
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments                     | output       |
        | "//server/share", ".."        | "//server"   |
        | "//server/share/..", "x"      | "//server/x" |
        | "//server/share", "../../.."  | "//"         |

  Rule: UNC status comes from the base segment only, never from the joined string

    @happy
    Scenario Outline: A later absolute non-UNC segment drops the prefix
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments                    | output      |
        | "//server/share", "/tmp/file" | "/tmp/file" |
        | "//server/share", "C:\foo"    | "C:/foo"    |
        | "\\server\share", "\tmp"      | "/tmp"      |

    @happy
    Scenario Outline: A UNC segment after earlier absolute segments becomes the base and keeps the prefix
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments                                | output                |
        | "/foo", "//server/share", "x"            | "//server/share/x"    |
        | "C:\foo", "\\server\share", "x"          | "//server/share/x"    |
        | "//server/share", "\\other\s2", "f"      | "//other/s2/f"        |

    @boundary
    Scenario Outline: A "/" root joined to a relative segment is not UNC, although the joined string starts with "//"
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments          | output         |
        | "/", "foo"         | "/foo"         |
        | "/", "/path"       | "/path"        |
        | "\", "foo\bar"     | "/foo/bar"     |

  Rule: Three or more leading separators also match _UNC_REGEX and give a "//" prefix

    @boundary
    Scenario Outline: Extra leading separators collapse to exactly "//"
      When resolve is called with <input>
      Then it returns <output>

      Examples:
        | input       | output   |
        | "///a"      | "//a"    |
        | "\\\a\\b"   | "//a/b"  |

  Rule: The UNC test applies to whichever segment ends the walk, including process.cwd and relative "//." segments

    @happy
    Scenario Outline: A UNC working directory gives a UNC result for relative arguments
      Given process.cwd returns <cwd>
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | cwd                     | arguments  | output                  |
        | "\\server\share\dir"    | "a"        | "//server/share/dir/a"  |
        | "//server/share/dir"    | "a"        | "//server/share/dir/a"  |
        | "//server/share/dir"    | "..", "x"  | "//server/share/x"      |
        | "//server/share/dir"    | (none)     | "//server/share/dir"    |
        | "//server/share"        | "//./x"    | "//server/share/x"      |

    @happy
    Scenario: An absolute non-UNC argument ignores a UNC working directory
      Given process.cwd returns "//server/share/dir"
      When resolve is called with "/x"
      Then it returns "/x"

    @boundary
    Scenario: A UNC argument ignores a non-UNC working directory
      Given process.cwd returns "C:\Windows\path\only"
      When resolve is called with "//server/share"
      Then it returns "//server/share"

    @boundary
    Scenario: A relative "//." segment resolved against a non-UNC working directory gets no prefix
      Given process.cwd returns "C:\Windows\path\only"
      When resolve is called with "\\.\c:\temp\file", "..\path"
      Then it returns "C:/Windows/path/only/c:/temp/path"

    @unhappy
    Scenario Outline: With an empty working directory, a relative "//." segment ends the walk and still gets "//"
      Given process.cwd returns ""
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments                      | output            |
        | "//./c:/temp/file", "../path"  | "//c:/temp/path"  |
        | "//./a", ".."                  | "//"              |
        | "//."                          | "//"              |
        | "//.."                         | "//.."            |

    @unhappy
    Scenario: The existing fallback for an empty working directory is unchanged without UNC segments
      Given process.cwd returns ""
      When resolve is called with ".", "./"
      Then it returns "."
      And resolve called with "..", ".." returns "../.."

  Rule: The "//." device prefix is not kept by resolve; the "." component is normalized away

    @boundary
    Scenario: resolve differs from normalize on a "//." path
      Given process.cwd returns ""
      When resolve is called with "\\.\c:\temp\file", "..\path"
      Then it returns "//c:/temp/path"
      And normalize called with "\\.\c:\temp\file\..\path" still returns "//./c:/temp/path"

  Rule: Results without a UNC base are unchanged

    @happy
    Scenario Outline: Existing resolve results stay as they are
      When resolve is called with <arguments>
      Then it returns <output>

      Examples:
        | arguments                                        | output                    |
        | "/", "/path"                                     | "/path"                   |
        | "/foo/bar", "./baz"                              | "/foo/bar/baz"            |
        | "/foo/bar", "..", ".", "./baz"                   | "/foo/baz"                |
        | "/foo/bar", "/tmp/file/"                         | "/tmp/file"               |
        | "C:\foo\bar", ".\baz"                            | "C:/foo/bar/baz"          |
        | "\foo\bar", "\tmp\file\"                         | "/tmp/file"               |
        | "C:\Windows\path\only", "../../reports"          | "C:/Windows/reports"      |
        | "wwwroot", "static_files\png\", "..\gif\image.gif" | "C:/Windows/path/only/wwwroot/static_files/gif/image.gif" |

  Rule: relative and format follow the new resolve result

    @happy
    Scenario: format with a UNC root keeps the prefix
      When format is called with { root: "//server/share", base: "f.txt" }
      Then it returns "//server/share/f.txt"
      And format called with { root: "\\server\share\", dir: "\\server\share\d", base: "f.txt" } returns "//server/share/d/f.txt"

    @happy
    Scenario Outline: relative between UNC paths
      When relative is called with <from> and <to>
      Then it returns <output>

      Examples:
        | from               | to                    | output         |
        | "//server/share/a" | "//server/share/b/c"  | "../b/c"       |
        | "//server/share/a" | "//server/other"      | "../../other"  |
```

Decided:

1. An empty normalized remainder after a UNC base returns a bare `//` (e.g. `//`, `\\`, `//server/share` + `../..`).
   Ticket: silent.
   Instead: Keep the server and share as the root, or fall back to `/`.
2. UNC detection tests each segment against the existing `_UNC_REGEX` (`/^[/\\]{2}/`), the same check `normalize` uses.
   Ticket: "fix(resolve): preserve UNC prefix (#245) (#246)"
   Instead: Write a new, stricter UNC check that requires a server and a share, or test the joined path.
3. Relative segments after a UNC base are resolved under it, and the `//` prefix stays.
   Ticket: silent.
   Instead: Keep the prefix only when the UNC path is the sole argument.
4. A later absolute non-UNC segment becomes the base and drops the UNC prefix (`//server/share`, `/tmp/file` → `/tmp/file`).
   Ticket: silent.
   Instead: Carry the UNC prefix over, or treat it like a Windows drive-root change.
5. UNC status comes from the base segment, not from the final joined string (`/`, `foo` → `/foo`).
   Ticket: silent.
   Instead: Check whether the final joined string starts with `//` or `\\`.
6. The UNC check runs on the segment as given to the loop, so `\\`, `//` and mixed separators all count as UNC.
   Ticket: silent.
   Instead: Convert backslashes to `/` first, then test.
7. The UNC check applies to whichever segment ends the walk, including `process.cwd()` and relative `//.` segments; the segment need not be absolute.
   Ticket: silent.
   Instead: Only set the UNC flag when `isAbsolute(path)` is true.
8. The UNC result always uses forward slashes, starting with `//`.
   Ticket: silent.
   Instead: Return `\\` backslashes, as node's win32 resolve does.
9. A UNC result returns `//` + remainder straight away, skipping the `/` prefix branch and the `"."` fallback for an empty result.
   Ticket: silent.
   Instead: Fold the UNC prefix into the existing absolute-path branch.
10. `..` can climb above the share and the server (`//server/share`, `..` → `//server`); the UNC root is not clamped.
    Ticket: silent.
    Instead: Treat `//server/share` as an unremovable root, as node's `path.win32.resolve` does.
11. Three or more leading separators count as UNC and collapse to exactly `//` (`///a` → `//a`, where it used to be `/a`).
    Ticket: silent.
    Instead: Treat exactly two leading separators as UNC and collapse three or more to `/`, as POSIX resolve does.
12. `resolve` does not keep the `//./` device prefix; the `.` is normalized away (`//c:/temp/path`), unlike `normalize`.
    Ticket: silent.
    Instead: Return `//./…` to match `normalize`'s device-namespace output.
13. A trailing separator after a UNC path is dropped (`//server/share/` → `//server/share`), as `resolve` already does for other paths.
    Ticket: silent.
    Instead: Keep the trailing separator, as `normalize` does.
14. `format` and `relative` get the change through `resolve`: `format` with a UNC root now returns a `//` prefix.
    Ticket: silent.
    Instead: Leave `format` and `relative` output as before by having them strip the restored prefix.
