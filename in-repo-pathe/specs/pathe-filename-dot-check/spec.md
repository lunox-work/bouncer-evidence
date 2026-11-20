# `filename` handles dotfiles and files without an extension

`pathe/utils` exports `filename(path)`, which returns the name of the last path
segment without its extension. It currently uses a regular expression that
returns the wrong result for names that begin with a period (`.gitignore`) and
for files that have no extension when a directory name contains a dot
(`/a.b/README` returns `"a"`). This change (issue #185) replaces that logic. The
only file that changes is `src/utils.ts`.

## Interface

The change keeps the exports' names and signatures. `src/utils.ts` exports:

```ts
export function filename(path: string): string | undefined;
export function normalizeAliases(_aliases: Record<string, string>): Record<string, string>;
export function resolveAlias(path: string, aliases: Record<string, string>): string;
```

- `filename` is the only export whose behaviour changes. It is pure and
  synchronous. It does not normalise or resolve the path or touch the file
  system. It returns either a `string` or `undefined`, and never throws for a
  string argument.
- `normalizeAliases` and `resolveAlias` keep their current behaviour. All the
  existing `alias` tests in `test/utils.spec.ts` still pass unchanged.
- The change adds no new exports. The module-level constants it uses are
  private. Nothing exported from `src/index.ts` or `src/path.ts` changes, so
  `test/index.spec.ts` still passes unchanged.
- The existing `filename` cases in `test/utils.spec.ts` keep their results.

## Algorithm (normative)

1. Split `path` on every `/` and every `\`, whatever the platform. The
   **basename** is the last piece, which may be empty.
2. If the basename is the empty string, return `undefined`.
3. Let `i` be the index of the **last** `.` in the basename.
4. If there is no `.` (`i === -1`), or the only candidate dot is the first
   character (`i === 0`), return the whole basename.
5. Otherwise return `basename.slice(0, i)`.

```gherkin
Feature: filename extracts the name of the last path segment without its extension

  Background:
    Given `filename` is imported from "src/utils"

  Rule: The result comes from the last segment after splitting on both "/" and "\"

    @happy
    Scenario Outline: Directories are removed for POSIX and Windows paths
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path                      | result   |
        | "/temp/myfile.html"       | "myfile" |
        | "./myfile.html"           | "myfile" |
        | "C:\\temp\\myfile.html"   | "myfile" |
        | "\\temp\\myfile.html"     | "myfile" |
        | ".\\myfile.html"          | "myfile" |

    @happy
    Scenario: A plain name with an extension
      When I call filename("test.html")
      Then the result is "test"

    @boundary
    Scenario: Mixed separators are all treated as separators
      When I call filename("C:/temp\\sub/report.pdf")
      Then the result is "report"

    @boundary
    Scenario Outline: A dot in a directory name does not affect the result
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path                     | result   |
        | "/a.b/README"            | "README" |
        | "C:\\my.dir\\README"     | "README" |
        | "/home/.config/app.json" | "app"    |

  Rule: An empty last segment gives undefined

    @boundary
    Scenario Outline: A trailing separator or an empty path gives undefined
      When I call filename(<path>)
      Then the result is undefined

      Examples:
        | path           |
        | ""             |
        | "foo/"         |
        | "/"            |
        | "C:\\temp\\"   |
        | "foo\\bar/"    |

    @unhappy
    Scenario: The segment before a trailing separator is not used
      When I call filename("/temp/foo/")
      Then the result is undefined
      And the result is not "foo"

  Rule: A name with no dot is returned unchanged

    @happy
    Scenario Outline: Files without an extension
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path               | result     |
        | "README"           | "README"   |
        | "/usr/bin/node"    | "node"     |
        | "C:\\bin\\Makefile" | "Makefile" |

  Rule: A leading dot is part of the name and is never an extension separator

    @happy
    Scenario Outline: Dotfiles with no further dot are returned whole
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path                 | result       |
        | ".gitignore"         | ".gitignore" |
        | "/home/user/.bashrc" | ".bashrc"    |
        | "C:\\repo\\.env"     | ".env"       |

    @boundary
    Scenario Outline: A dotfile with another dot loses only its last extension
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path                  | result     |
        | ".config.json"        | ".config"  |
        | "/proj/.eslintrc.cjs" | ".eslintrc" |
        | ".env.local"          | ".env"     |

  Rule: Only the text after the last dot is removed

    @boundary
    Scenario Outline: Names with several dots
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path                   | result         |
        | "archive.tar.gz"       | "archive.tar"  |
        | "/dist/index.min.js"   | "index.min"    |
        | "types.d.ts"           | "types.d"      |

    @boundary
    Scenario Outline: A trailing dot is removed as an empty extension
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path         | result |
        | "file."      | "file" |
        | "/tmp/file." | "file" |

  Rule: The special segments "." and ".." follow the same dot rules and both give "."

    @boundary
    Scenario Outline: Current and parent directory segments
      When I call filename(<path>)
      Then the result is <result>

      Examples:
        | path      | result |
        | "."       | "."    |
        | ".."      | "."    |
        | "foo/."   | "."    |
        | "foo/.."  | "."    |
        | "C:\\.."  | "."    |

  Rule: The other exports of src/utils keep their behaviour

    @happy
    Scenario: resolveAlias is unchanged
      Given aliases { "~": "/root", "~assets": "/root/some/dir" }
      When I call resolveAlias("~assets/smth.jpg", aliases)
      Then the result is "/root/some/dir/smth.jpg"

    @happy
    Scenario: normalizeAliases is unchanged
      When I call normalizeAliases({ "@": "/root", "bingpot": "@/bingpot/index.ts" })
      Then the result is { "@": "/root", "bingpot": "/root/bingpot/index.ts" }
```

## Decided:

- If the path ends in a separator (the last segment is empty), the result is `undefined`. `filename` does not fall back to the segment before it (`"foo/"` → `undefined`).
  - Ticket: silent.
  - Instead: Ignore the trailing slash and return the last non-empty segment (`"foo"`).
- The empty string `""` gives `undefined`.
  - Ticket: silent.
  - Instead: Return an empty string `""`.
- A dotfile such as `".gitignore"` returns its whole basename (`".gitignore"`). A leading dot is part of the name, not an extension separator.
  - Ticket: "handle files beginning with a period"
  - Instead: Return `""` (treating it as an empty name with extension `gitignore`), as some libraries do.
- A name with several dots loses only its last extension (`"archive.tar.gz"` → `"archive.tar"`).
  - Ticket: silent.
  - Instead: Strip everything from the first dot after the start of the name, giving `"archive"`.
- A name ending in a dot loses that dot (`"file."` → `"file"`).
  - Ticket: silent.
  - Instead: Keep the trailing dot, since no extension follows it (`"file."`).
- A dot-prefixed name with a further extension loses its last extension (`".config.json"` → `".config"`).
  - Ticket: "handle files beginning with a period"
  - Instead: Return `".config.json"` unchanged, or return `""` if the dot-prefixed name is treated as all extension.
- A file with no dot, such as `"README"`, returns its basename unchanged.
  - Ticket: "without ext"
  - Instead: Return `undefined`, or an empty string.
- The special segments get no special treatment. `"."` is a leading dot and is returned whole (`"."`); in `".."` the last dot is the second character, so the text before it is returned (`".."` → `"."`).
  - Ticket: silent.
  - Instead: Return `".."` unchanged, or return `undefined` or an empty string, since they are not real filenames.
- Both `/` and `\` are path separators on every platform.
  - Ticket: silent.
  - Instead: Split only on `/`, as POSIX paths do.
- A dot in a directory segment never affects the result. Only the last segment is looked at (`"/a.b/README"` → `"README"`).
  - Ticket: "handle files beginning with a period or without ext"
  - Instead: Keep the old regex behaviour, where a dot earlier in the path could be read as the extension separator (`"/a.b/README"` → `"a"`).
