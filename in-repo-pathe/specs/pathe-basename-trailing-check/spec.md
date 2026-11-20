# basename ignores trailing separators

`basename` in `src/path.ts` (re-exported unchanged from `src/index.ts`) takes
the last segment after splitting the path on `/`, once backslashes have been
turned into `/` by `normalizeWindowsPath`. When a path ends in a separator,
such as `/temp/dir/`, that last segment is empty, so `basename` returns `""`
where Node's `path.basename` returns `"dir"`. Issue #180 asks for trailing
separators to be ignored. After the change, `basename` returns the last
**non-empty** segment of the normalized path, and then strips `extension` from
it the same way it does today. `parse` calls `basename` for its `base`, so
`parse` picks up the same fix.

## Interface

No export is added, removed or renamed, and no signature changes.

| Export (from `src/path.ts`) | Signature | Behaviour |
|---|---|---|
| `basename` | `typeof path.basename`, i.e. `(p: string, extension?: string) => string` | **Changed**, as specified below |
| `parse` | `typeof path.parse`, i.e. `(p: string) => path.ParsedPath` | **Changed only through `basename`**: `base` is `basename(p)`, `ext` is `extname(base)`, and `name` is `base` minus `ext`. `root` and `dir` are computed as before. |
| `sep`, `delimiter`, `normalize`, `join`, `resolve`, `normalizeString`, `isAbsolute`, `toNamespacedPath`, `extname`, `relative`, `dirname`, `format` | unchanged | unchanged |

`normalizeWindowsPath` (`src/_internal.ts`) and everything in `src/utils.ts`
are unchanged. The change adds no new exported constant or type. `basename` is
pure and synchronous: it does not read `process.cwd()`, the clock or the file
system, so it gives the same result whether or not `process.cwd` is mocked to
a Windows path, as `runTest` in `test/index.spec.ts` does. Calls cannot
overlap, so there are no `@concurrency` scenarios.

## Algorithm (normative)

1. `normalized = normalizeWindowsPath(p)`: every `\` becomes `/`, and a
   leading drive letter is upper-cased only when a separator follows it
   (`c:\` becomes `C:/`, while a bare `c:` stays `c:`).
2. `segments = normalized.split("/")`.
3. `lastSegment` is the last element of `segments` that is not `""`, or `""`
   when there is none. No other processing is done: `.`, `..` and whitespace
   segments count as non-empty and are not resolved or trimmed.
4. If `extension` is truthy (not `undefined` and not `""`) and
   `lastSegment.endsWith(extension)` (case-sensitive), return
   `lastSegment.slice(0, -extension.length)`. Otherwise return `lastSegment`.

```gherkin
Feature: basename ignores trailing separators
  basename(p, extension?) returns the last non-empty segment of p, after
  backslashes have been normalized to "/", with extension removed from its
  end when it matches.

  Background:
    Given "basename" and "parse" are imported from "src/path.ts"

  Rule: Existing results for paths without a trailing separator are unchanged

    @happy
    Scenario Outline: Paths that end in a name keep their current result
      When basename is called with p "<p>" and extension <extension>
      Then the result is "<result>"

      Examples:
        | p                       | extension   | result      |
        | /temp/myfile.html       | undefined   | myfile.html |
        | ./myfile.html           | undefined   | myfile.html |
        | ./myfile.html           | ".html"     | myfile      |
        | ./undefined             | undefined   | undefined   |
        | C:\temp\myfile.html     | undefined   | myfile.html |
        | \temp\myfile.html       | undefined   | myfile.html |
        | .\myfile.html           | ".html"     | myfile      |
        | myfile.html             | undefined   | myfile.html |
        | a//b                    | undefined   | b           |

  Rule: Any number of trailing separators is ignored

    @happy
    Scenario: A single trailing slash is ignored
      When basename is called with p "/temp/dir/"
      Then the result is "dir"

    @boundary
    Scenario Outline: Several trailing slashes are all ignored
      When basename is called with p "<p>"
      Then the result is "<result>"

      Examples:
        | p             | result |
        | a/b//         | b      |
        | a/b///        | b      |
        | /temp/dir//// | dir    |
        | dir/          | dir    |
        | dir//         | dir    |

    @boundary
    Scenario Outline: The last non-empty segment is returned as it is, not resolved or trimmed
      When basename is called with p "<p>"
      Then the result is "<result>"

      Examples:
        | p        | result |
        | a/./     | .      |
        | a/../    | ..     |
        | ./       | .      |
        | ../      | ..     |
        | a/ /     | " "    |

  Rule: Backslashes count as separators, including trailing ones

    @happy
    Scenario Outline: Trailing backslashes are ignored like trailing slashes
      When basename is called with p "<p>"
      Then the result is "<result>"

      Examples:
        | p                  | result |
        | C:\temp\dir\       | dir    |
        | C:\temp\dir\\\     | dir    |
        | \temp\dir\         | dir    |
        | .\dir\             | dir    |
        | a\b/\/             | b      |
        | \\server\share\    | share  |

    @boundary
    Scenario Outline: A drive root returns the drive, not an empty string
      When basename is called with p "<p>"
      Then the result is "<result>"

      Examples:
        | p     | result |
        | C:\   | C:     |
        | c:\   | C:     |
        | C:/   | C:     |
        | C:    | C:     |

  Rule: A path with no non-empty segment gives an empty string

    @boundary
    Scenario Outline: Empty and root-only paths return ""
      When basename is called with p "<p>"
      Then the result is ""

      Examples:
        | p    |
        |      |
        | /    |
        | ///  |
        | \    |
        | \\\  |

    @boundary
    Scenario Outline: An extension has no effect when there is no non-empty segment
      When basename is called with p "<p>" and extension "<extension>"
      Then the result is ""

      Examples:
        | p    | extension |
        |      | .js       |
        | /    | .js       |
        | ///  | .js       |
        | \\   | .html     |

  Rule: The extension is stripped from the last non-empty segment

    @happy
    Scenario Outline: The extension is removed even when the path ends in a separator
      When basename is called with p "<p>" and extension "<extension>"
      Then the result is "<result>"

      Examples:
        | p                       | extension | result |
        | a/b.js/                 | .js       | b      |
        | a/b.js///               | .js       | b      |
        | C:\temp\myfile.html\    | .html     | myfile |
        | .\myfile.html\\         | .html     | myfile |

    @boundary
    Scenario Outline: An extension equal to the whole segment is stripped to ""
      When basename is called with p "<p>" and extension "<extension>"
      Then the result is ""

      Examples:
        | p        | extension |
        | a/.js/   | .js       |
        | a/.js    | .js       |
        | .js      | .js       |
        | a/b.js/  | b.js      |

    @unhappy
    Scenario Outline: An extension that does not end the segment leaves it unchanged
      When basename is called with p "<p>" and extension "<extension>"
      Then the result is "<result>"

      Examples:
        | p             | extension | result      |
        | a/b.js/       | .ts       | b.js        |
        | a/b.JS/       | .js       | b.JS        |
        | a/b/          | xb        | b           |
        | a/myfile.html | .htm      | myfile.html |

    @boundary
    Scenario Outline: An empty or undefined extension strips nothing
      When basename is called with p "<p>" and extension <extension>
      Then the result is "<result>"

      Examples:
        | p        | extension | result |
        | a/b.js/  | ""        | b.js   |
        | a/b.js/  | undefined | b.js   |

    @boundary
    Scenario: An extension without a leading dot is matched as a plain suffix
      When basename is called with p "a/myfile.html/" and extension "html"
      Then the result is "myfile."

  Rule: parse takes its base, ext and name from the fixed basename

    @happy
    Scenario: parse on a path with a trailing slash
      When parse is called with p "/home/user/dir/"
      Then the result deep-equals:
        | root | /          |
        | dir  | /home/user |
        | base | dir        |
        | ext  |            |
        | name | dir        |

    @happy
    Scenario: parse on a Windows path with a trailing backslash and an extension
      When parse is called with p "C:\path\file.txt\"
      Then the result deep-equals:
        | root | C:      |
        | dir  | C:/path |
        | base | file.txt |
        | ext  | .txt    |
        | name | file    |

    @happy
    Scenario: parse on paths without a trailing separator is unchanged
      When parse is called with p "/home/user/dir/file.txt"
      Then the result deep-equals:
        | root | /              |
        | dir  | /home/user/dir |
        | base | file.txt       |
        | ext  | .txt           |
        | name | file           |
```

Notes on reading the tables:

- Backslashes in `p` are literal characters, as in `String.raw` in the
  existing tests. For example, `C:\temp\dir\` is the 12-character string
  `C:\temp\dir\`.
- An empty `p` cell means the empty string `""`. `" "` means a single space.
- `undefined` means the argument is passed as `undefined` (or left out).
  `""` means the empty string.

## Decided:

- Every trailing separator is ignored, not just one: the result is the last non-empty segment, so `a/b//` gives `b`.
  - Ticket: "ignore trailing seperator (#180)"
  - Instead: Strip only a single trailing separator.
- An empty string `p` returns `""`.
  - Ticket: silent.
  - Instead: Throw, or return `'.'`.
- A root-only path (`/`, `///`, `\`) returns `""`, because every segment is empty.
  - Ticket: silent.
  - Instead: Return `'/'` (the root), or the original input.
- Trailing backslashes are ignored too, because backslashes are normalized to `/` first.
  - Ticket: "ignore trailing seperator (#180)"
  - Instead: Strip only `'/'` and leave backslash handling to the platform.
- With a trailing separator, the extension is still stripped from the last non-empty segment: `basename('a/b.js/', '.js')` gives `b`.
  - Ticket: silent.
  - Instead: Leave the extension alone when a trailing separator is present.
- An extension equal to the whole last segment is stripped, leaving `""`: `basename('a/.js/', '.js')` gives `""`.
  - Ticket: silent.
  - Instead: Return the segment unchanged when the extension equals the whole name, as Node does.
- When no segment is non-empty, the result is `""` whatever the extension, because the extension check on `""` has no effect.
  - Ticket: silent.
  - Instead: Return early before the extension logic.
- A drive root (`C:\`, `c:\`, `C:/`) returns the drive with its letter upper-cased (`C:`), because the drive is the last non-empty segment. A bare drive with no separator keeps its case (`c:` gives `c:`).
  - Ticket: silent.
  - Instead: Return `""`, as Node's `path.win32.basename('C:\\')` does.
- The last non-empty segment is returned as it is: `.`, `..` and whitespace-only segments are not resolved, skipped or trimmed (`a/../` gives `..`).
  - Ticket: silent.
  - Instead: Normalize the path (resolve `.` and `..`) before taking the last segment.
- The extension match is a case-sensitive plain suffix, as before. An extension without a dot is matched literally (`'html'` on `myfile.html` gives `myfile.`), and an empty or `undefined` extension strips nothing.
  - Ticket: silent.
  - Instead: Match extensions case-insensitively, or only when they begin with `.`.
- `parse` picks up the fix through `basename`: for `/home/user/dir/`, `base` and `name` are `dir`, and `root` and `dir` are computed as before.
  - Ticket: silent.
  - Instead: Keep `parse` on the old last-segment logic, so `base` stays `""` for a trailing separator.
- No input validation is added. `p` is typed `string`, and the spec covers only string inputs, so tests must not pass non-strings.
  - Ticket: silent.
  - Instead: Throw a `TypeError` for non-string `p`, as Node does.
