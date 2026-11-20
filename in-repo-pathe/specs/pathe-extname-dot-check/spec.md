# extname: handle inputs ending with a dot (#203)

`extname` in `src/_path.ts` finds the extension with the regular expression
`_EXTNAME_RE = /.(\.[^./]+)$/` after running `normalizeWindowsPath` on the input.
Because the regex needs at least one character after the final dot, a path that
ends in a dot, such as `file.`, currently returns `""`. Node's `path.extname`
returns `"."` there. This change makes `extname` return `"."` when the input ends
in a dot that comes after another character, and keeps `".."` returning `""`.
`parse` gets its `ext` and `name` from `extname(basename(p))`, so it changes the
same way.

## Interface

The change keeps the exports' names and signatures. Nothing is added to or
removed from the exports of `src/_path.ts`.

- `export const extname: typeof path.extname` — `(p: string) => string`. Its
  behaviour changes as the rules below describe.
- `export const parse: typeof path.parse` — `(p: string) => path.ParsedPath`. Its
  `ext` is still `extname(base)` and its `name` is still
  `base.slice(0, base.length - ext.length)`, so it follows the new `extname`.
  Nothing else in it changes.
- The private constant `_EXTNAME_RE` changes to `/.(\.[^./]+|\.)$/`, and
  `extname` returns `""` straight away when its argument is exactly `".."`. Both
  are internal and not exported.
- These exports keep their behaviour: `sep`, `normalize`, `join`, `resolve`,
  `normalizeString`, `isAbsolute`, `toNamespacedPath`, `relative`, `dirname`,
  `format`, `basename`, `matchesGlob`. `normalizeWindowsPath` in
  `src/_internal.ts` also keeps its behaviour.
- `posix.extname`, `win32.extname` and the default export from `src/index.ts`
  pass through to the same `extname` and behave the same way.
- `extname` stays pure and synchronous, with no state shared between calls. The
  regex has no `g` flag, so one call cannot change the result of the next.
- `extname` never throws for a string argument. It returns `""` when it finds no
  extension.

```gherkin
Feature: extname handles inputs that end with a dot

  Background:
    Given "extname" and "parse" are imported from "src/_path.ts" (re-exported by "src/index.ts")

  Rule: Extensions that do not end in a dot keep their current result

    @happy
    Scenario Outline: extname keeps returning the last dot-led extension
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input                       | output  |
        | "/temp/myfile.html"         | ".html" |
        | "./myfile.html"             | ".html" |
        | "./myfile.tar.gz"           | ".gz"   |
        | "./myfile.tar.gz.br"        | ".br"   |
        | "foo.123"                   | ".123"  |
        | "..foo"                     | ".foo"  |
        | "C:\\temp\\myfile.html"     | ".html" |
        | "\\temp\\myfile.html"       | ".html" |
        | ".\\myfile.html"            | ".html" |

    @boundary
    Scenario Outline: extname keeps returning an empty string where there is no extension
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input   | output |
        | ""      | ""     |
        | ".foo"  | ""     |
        | "./"    | ""     |
        | "a.b/c" | ""     |
        | "file"  | ""     |

  Rule: A final dot that comes after another character is the extension "."

    @happy
    Scenario Outline: A name that ends in one dot has the extension "."
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input         | output |
        | "file."       | "."    |
        | "dir/file."   | "."    |
        | "/temp/file." | "."    |
        | "file.txt."   | "."    |

    @boundary
    Scenario Outline: Two or more trailing dots still give the extension "."
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input    | output |
        | "file.." | "."    |
        | "a.b.."  | "."    |
        | "..."    | "."    |

    @boundary
    Scenario Outline: A dotfile that ends in a dot has the extension "."
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input       | output |
        | ".file."    | "."    |
        | "foo/.bar." | "."    |

    @happy
    Scenario: parse splits a trailing dot into ext and leaves the rest as name
      When I call parse with "dir/file."
      Then it returns:
        | root | dir   | base    | ext | name   |
        | ""   | "dir" | "file." | "." | "file" |

  Rule: The exact input "." returns an empty string

    @boundary
    Scenario: A lone dot has no extension
      When I call extname with "."
      Then it returns ""

  Rule: The exact input ".." returns an empty string, before any normalisation

    @boundary
    Scenario: A lone double dot has no extension
      When I call extname with ".."
      Then it returns ""

    @boundary
    Scenario: parse of a path whose base is ".." has an empty ext
      When I call parse with "/home/.."
      Then it returns:
        | root | dir     | base | ext | name |
        | "/"  | "/home" | ".." | ""  | ".." |

  Rule: A last segment of ".." that follows a separator gives "."; only the exact input ".." gives ""

    @boundary
    Scenario Outline: ".." after a separator follows the trailing-dot rule
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input    | output |
        | "foo/.." | "."    |
        | "a/b/.." | "."    |
        | "/.."    | "."    |
        | "a\\.."  | "."    |

  Rule: A last segment of "." that follows a separator gives "."; only the exact input "." gives ""

    @boundary
    Scenario Outline: A "." segment after a separator follows the trailing-dot rule
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input   | output |
        | "foo/." | "."    |
        | "/."    | "."    |
        | "./."   | "."    |

    @boundary
    Scenario: parse of a path whose base is "." has an empty ext
      When I call parse with "foo/."
      Then it returns:
        | root | dir   | base | ext | name |
        | ""   | "foo" | "."  | ""  | "."  |

  Rule: A trailing separator is not removed, so a dot before it is not an extension

    @unhappy
    Scenario Outline: A path that ends in a separator returns an empty string
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input         | output |
        | "file./"      | ""     |
        | "dir/file./"  | ""     |
        | "file.\\"     | ""     |
        | "file.txt/"   | ""     |

  Rule: Backslash paths are normalised first and then follow the same trailing-dot rule

    @happy
    Scenario Outline: Windows paths that end in a dot have the extension "."
      When I call extname with <input>
      Then it returns <output>

      Examples:
        | input             | output |
        | "a\\file."        | "."    |
        | "C:\\temp\\file." | "."    |
        | ".\\file."        | "."    |

    @happy
    Scenario: The posix and win32 namespaces give the same result
      When I call posix.extname with "file." and win32.extname with "file."
      Then both return "."
```

## Decided:

- `extname` returns `"."` for a name that ends in one dot, such as `"file."`, which matches Node's `path.extname`.
  - Ticket: "handle inputs ending with dot (#203)"
  - Instead: Return an empty string, treating a trailing dot as no extension.
- `extname("..")` returns `""` through a check for that exact string.
  - Ticket: silent.
  - Instead: Let the regex decide, which would return `"."`, or return an empty string through a more general rule.
- `extname(".")` returns `""` because the regex needs a character before the trailing dot and `"."` has none.
  - Ticket: silent.
  - Instead: Return `"."`, or add an explicit check for it as is done for `".."`.
- A path whose last segment is `".."` after a separator (`"foo/.."`, `"a/b/.."`, `"/.."`) returns `"."`. Only the exact string `".."` returns `""`.
  - Ticket: silent.
  - Instead: Return an empty string for any path whose last segment is `".."`.
- A dotfile with a trailing dot (`".file."`, `"foo/.bar."`) returns `"."`.
  - Ticket: silent.
  - Instead: Return an empty string, since the leading dot marks a dotfile.
- A name with two or more trailing dots (`"file.."`, `"..."`) returns `"."`.
  - Ticket: silent.
  - Instead: Return an empty string, or return `".."` if the extension is read as everything after the first dot.
- A path that ends in a separator after a dot (`"file./"`) returns `""`, because the trailing separator is not removed.
  - Ticket: silent.
  - Instead: Ignore the trailing separator and return `"."`, as Node does.
- Backslash Windows paths go through `normalizeWindowsPath` and then follow the same trailing-dot rule (`"a\\file."` gives `"."`). The `".."` check runs on the raw input.
  - Ticket: silent.
  - Instead: Treat Windows paths separately, or run the `".."` check after normalisation.
- A path whose last segment is `"."` after a separator (`"foo/."`, `"/."`, `"./."`) returns `"."` through the trailing-dot rule, the same as `"foo/.."`. Only the exact string `"."` returns `""`. `parse("foo/.")` still has `ext: ""`, because its base is the exact string `"."`.
  - Ticket: silent.
  - Instead: Return `""`, as before this change and as Node does.
