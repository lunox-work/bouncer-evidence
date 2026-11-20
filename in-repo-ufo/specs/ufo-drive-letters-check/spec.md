# parseURL: only normalize Windows drive letters for the `file:` protocol

`parseURL` in `src/parse.ts` currently removes the `/` in front of a Windows
drive letter (`/C:` → `C:`) in the part after the host for every URL that
has a protocol or starts with `//`. So `http://host/C:/x` gets the pathname
`C:/x`, and `stringifyParsedURL` then turns it back into `http://hostC:/x`.
After this change the slash is removed only when the protocol written in the
parsed string is exactly `file:`. Every other input keeps its slash.
Nothing else in `parseURL` changes.

**Interface.** No export is added, removed or renamed, and no signature
changes. `src/parse.ts` keeps exporting:

- `parseURL(input = "", defaultProto?: string): ParsedURL` (behaviour changes as specified below)
- `parsePath(input = ""): ParsedURL` (unchanged)
- `parseAuth(input = ""): ParsedAuth` (unchanged)
- `parseHost(input = ""): ParsedHost` (unchanged)
- `stringifyParsedURL(parsed: Partial<ParsedURL>): string` (unchanged)
- `parseFilename(input = "", { strict }): string | undefined` (code unchanged; it calls `parseURL`, so it sees the new pathnames)
- `interface ParsedURL`, `interface ParsedAuth`, `interface ParsedHost` (unchanged)

The other helpers in `src/utils.ts` that call `parseURL` (`withQuery`,
`getQuery`, `normalizeURL`, `resolveURL`, `withProtocol`, `withoutProtocol`,
`withoutFragment`, `cleanDoubleSlashes`, and so on) are not edited. They
pick up the new behaviour only through `parseURL`. `parseURL` stays
synchronous and pure, with no shared state, so calls cannot overlap and no
concurrency behaviour needs specifying. It never throws for any string
input.

**Normalization rule (precise).** `parseURL` splits off the protocol and
host as it does today. Call the text after the host, before it is split
into `pathname`/`search`/`hash`, the *rest*. When the captured protocol is
exactly the string `file:`, compared case-sensitively against the input as
written, the first `/` in the *rest* that is directly followed by one ASCII
letter (`A`–`Z` or `a`–`z`) and a `:` is removed. This is the existing
unanchored, non-global pattern `/\/(?=[A-Za-z]:)/`. The *rest* is then split
by `parsePath` as before. For any other captured protocol, including the
empty protocol of a protocol-relative input, the *rest* goes to `parsePath`
untouched.

```gherkin
Feature: parseURL normalizes Windows drive letters only for file: URLs

  Background:
    Given "parseURL", "parseFilename" and "stringifyParsedURL" are imported from "src/index.ts"
    And a parseURL result is compared on its string-keyed properties only, as in test/parse.test.ts (JSON round-trip drops the protocolRelative symbol)

  Rule: For a "file:" protocol the slash before a drive letter is removed

    @happy
    Scenario: Existing file URL with an uppercase drive letter
      When parseURL is called with "file:///C:/home/user"
      Then the result equals:
        | protocol | auth | host | pathname     | search | hash |
        | file:    |      |      | C:/home/user |        |      |

    @happy
    Scenario Outline: Drive letters of either case, with search and hash, are normalized
      When parseURL is called with "<input>"
      Then the result has protocol "file:", host "<host>", pathname "<pathname>", search "<search>" and hash "<hash>"

      Examples:
        | input                  | host | pathname | search | hash |
        | file:///C:/home/user   |      | C:/home/user |    |      |
        | file:///c:/x           |      | c:/x     |        |      |
        | file:///C:/foo?x=1#h   |      | C:/foo   | ?x=1   | #h   |
        | file:///C:             |      | C:       |        |      |
        | file:///C:/            |      | C:/      |        |      |
        | file://host/C:/x       | host | C:/x     |        |      |

    @boundary
    Scenario: Leading whitespace before the file protocol does not stop normalization
      When parseURL is called with "  file:///C:/x" (two leading spaces)
      Then the result has protocol "file:", host "" and pathname "C:/x"

    @happy
    Scenario: Backslashes are turned into slashes before the drive letter is normalized
      # Literal characters: "file:", three backslashes, "C:", one backslash, "foo"
      When parseURL is called with "file:\\\C:\foo"
      Then the result has protocol "file:", host "" and pathname "C:/foo"

    @happy
    Scenario: A file URL without a drive letter keeps its path
      When parseURL is called with "file:///home/user"
      Then the result has protocol "file:", host "" and pathname "/home/user"

    @boundary
    Scenario Outline: Only one ASCII letter followed by ":" counts as a drive letter
      When parseURL is called with "<input>"
      Then the result has protocol "file:" and pathname "<pathname>"

      Examples:
        | input            | pathname |
        | file:///1:/foo   | /1:/foo  |
        | file:///CD:/foo  | /CD:/foo |
        | file:///C\|/foo  | /C\|/foo |

  Rule: The protocol check is case-sensitive against the input as written

    @boundary
    Scenario Outline: An uppercase or mixed-case FILE protocol is not normalized, though the output protocol is still lowercased
      When parseURL is called with "<input>"
      Then the result equals:
        | protocol | auth | host | pathname | search | hash |
        | file:    |      |      | /C:/foo  |        |      |

      Examples:
        | input           |
        | FILE:///C:/foo  |
        | File:///C:/foo  |

  Rule: Inputs with no protocol are not normalized

    @boundary
    Scenario: A protocol-relative input with an empty host keeps the slash
      When parseURL is called with "///C:/foo"
      Then the result equals:
        | protocol | auth | host | pathname | search | hash |
        |          |      |      | /C:/foo  |        |      |

    @boundary
    Scenario: A protocol-relative input whose host is the drive letter is split as a host
      When parseURL is called with "//C:/foo"
      Then the result equals:
        | protocol | auth | host | pathname | search | hash |
        |          |      | C:   | /foo     |        |      |

    @boundary
    Scenario Outline: Inputs without "//" are parsed as plain paths and keep their text
      When parseURL is called with "<input>"
      Then the result equals pathname "<pathname>", search "" and hash "" with no other string-keyed properties

      Examples:
        | input    | pathname |
        | /C:/foo  | /C:/foo  |
        | C:/foo   | C:/foo   |

  Rule: defaultProto matters only by becoming part of the parsed string

    # parseURL keeps prepending defaultProto to an input that has no protocol and
    # parsing the joined string. Only the protocol written in that joined string
    # is checked. defaultProto is not consulted separately.

    @boundary
    Scenario Outline: The protocol written into the joined string decides
      When parseURL is called with input "<input>" and defaultProto "<defaultProto>"
      Then the result has protocol "<protocol>", host "<host>" and pathname "<pathname>"

      Examples:
        | input     | defaultProto | protocol | host | pathname |
        | /C:/foo   | file://      | file:    |      | C:/foo   |
        | C:/foo    | file://      | file:    | C:   | /foo     |
        | /C:/foo   | http://      | http:    |      | /C:/foo  |
        | host/C:/x | http://      | http:    | host | /C:/x    |

    @boundary
    Scenario: defaultProto is ignored when the input already has a protocol
      When parseURL is called with input "http://host/C:/x" and defaultProto "file://"
      Then the result has protocol "http:", host "host" and pathname "/C:/x"

  Rule: Any protocol other than "file:" leaves the path untouched

    @unhappy
    Scenario Outline: Drive-letter-like paths under other protocols keep the leading slash
      When parseURL is called with "<input>"
      Then the result has protocol "<protocol>", host "<host>", pathname "<pathname>", search "<search>" and hash "<hash>"

      Examples:
        | input                      | protocol | host      | pathname    | search    | hash |
        | http://host/C:/x           | http:    | host      | /C:/x       |           |      |
        | https://host/C:/x          | https:   | host      | /C:/x       |           |      |
        | ftp://host/C:/x            | ftp:     | host      | /C:/x       |           |      |
        | s3://bucket/C:/x           | s3:      | bucket    | /C:/x       |           |      |
        | http://host/foo/D:/bar     | http:    | host      | /foo/D:/bar |           |      |
        | http://localhost/C:/x?y#z  | http:    | localhost | /C:/x       | ?y        | #z   |
        | http://host/?q=/C:/x       | http:    | host      | /           | ?q=/C:/x  |      |

    @unhappy
    Scenario: A non-file URL with a drive-letter path round-trips through stringifyParsedURL
      When stringifyParsedURL is called with the result of parseURL("http://host/C:/x")
      Then it returns "http://host/C:/x"

    @unhappy
    Scenario: parseFilename on a non-file URL with a drive-letter path
      When parseFilename is called with "http://host/C:/x.txt" and { strict: false }
      Then it returns "x.txt"

  Rule: For "file:" the existing unanchored, single-match pattern is kept

    @boundary
    Scenario Outline: The first "/" before a letter and ":" anywhere in the rest is removed, and only that one
      When parseURL is called with "<input>"
      Then the result has protocol "file:", pathname "<pathname>", search "<search>" and hash "<hash>"

      Examples:
        | input                | pathname    | search  | hash  |
        | file:///foo/D:/bar   | /fooD:/bar  |         |       |
        | file:///home/C:      | /homeC:     |         |       |
        | file:///C:/a/D:/b    | C:/a/D:/b   |         |       |
        | file:///?q=/C:/x     | /           | ?q=C:/x |       |
        | file:///#/C:/x       | /           |         | #C:/x |

  Rule: stringifyParsedURL is unchanged and does not put the removed slash back

    @boundary
    Scenario: A normalized file URL stringifies with two slashes
      When stringifyParsedURL is called with the result of parseURL("file:///C:/foo")
      Then it returns "file://C:/foo"

  Rule: Special script protocols are unaffected

    @boundary
    Scenario: A blob URL wrapping a file URL keeps its text as the pathname
      When parseURL is called with "blob:file:///C:/x"
      Then the result equals:
        | protocol | auth | host | href              | pathname     | search | hash |
        | blob:    |      |      | blob:file:///C:/x | file:///C:/x |        |      |
```

## Decided:

- The `file:` protocol check is case-sensitive against the protocol as written, so `FILE:///C:/foo` keeps pathname `/C:/foo`. The returned `protocol` is still lowercased (`file:`).
  - Ticket: "only normalize windows drive letters with `file://` protocol"
  - Instead: Lowercase the protocol before comparing, so `FILE://` is normalized the same as `file://`.
- Inputs with no protocol are not normalized: `///C:/foo` keeps pathname `/C:/foo`, `//C:/foo` stays host `C:` + pathname `/foo`, and bare `C:/foo` / `/C:/foo` come back from `parsePath` unchanged.
  - Ticket: "only normalize windows drive letters with `file://` protocol"
  - Instead: Also normalize when there is no protocol, or when a default protocol of `file:` is supplied.
- `defaultProto` is not checked on its own. Only the protocol captured from the parsed string counts. Because the existing code prepends `defaultProto` to a protocol-less input before parsing, `parseURL("/C:/foo", "file://")` gives `C:/foo`, and `parseURL("/C:/foo", "http://")` gives `/C:/foo`.
  - Ticket: silent.
  - Instead: Use the effective protocol (input protocol or `defaultProto`) for the check.
- The existing unanchored regex is kept: the first `/` before a letter and `:` anywhere in the rest is removed (`file:///foo/D:/bar` → `/fooD:/bar`).
  - Ticket: silent.
  - Instead: Anchor the regex to the start of the path (`^\/(?=[A-Za-z]:)`).
- Every protocol other than exactly `file:` (`http:`, `https:`, `ftp:`, `s3:`, and so on) leaves the path untouched (`http://host/C:/x` → `/C:/x`).
  - Ticket: silent.
  - Instead: Keep the leading slash only for known non-file protocols and handle the rest differently, or treat other local-like protocols the same as `file:`.
- The removal runs on the whole text after the host, before it is split, so for a `file:` URL a `/X:` in the search or hash can be the one removed (`file:///?q=/C:/x` → search `?q=C:/x`).
  - Ticket: silent.
  - Instead: Apply the removal to the parsed `pathname` only, leaving `search` and `hash` as written.
- Only the first match is removed (non-global): `file:///C:/a/D:/b` → `C:/a/D:/b`.
  - Ticket: silent.
  - Instead: Remove the slash before every drive-letter-like segment.
- A drive letter is exactly one ASCII letter followed by `:`. Digits (`1:`), two letters (`CD:`) and the legacy `C|` form are not normalized.
  - Ticket: silent.
  - Instead: Also accept the WHATWG legacy `C|` drive form, or non-ASCII letters.
- A `file:` URL with a non-empty host is still normalized (`file://host/C:/x` → host `host`, pathname `C:/x`).
  - Ticket: silent.
  - Instead: Normalize only when the `file:` host is empty, as WHATWG does for drive letters.
- `stringifyParsedURL` is not changed, so a normalized file URL stringifies with two slashes (`file:///C:/foo` → `file://C:/foo`).
  - Ticket: silent.
  - Instead: Have `stringifyParsedURL` put back a `/` before a drive-letter pathname for `file:` URLs.
- Nothing is rejected: `parseURL` never throws, and inputs that do not qualify are returned as parsed, without normalization.
  - Ticket: silent.
  - Instead: Throw or return an error marker for malformed drive-letter file URLs.
