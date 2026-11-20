# Add `withoutHost` utility

`src/utils.ts` holds ufo's string-in, string-out URL helpers (`withoutProtocol`,
`withoutFragment`, `withoutBase`, …). Each one parses its input with
`parseURL` from `src/parse.ts` and returns a string. Ticket #212 adds
`withoutHost`. It removes the "origin" part of a URL (protocol, auth, host and
port) and returns what is left: the path, the query string and the fragment.
Like its neighbours, it is a pure synchronous function. It reads no clock,
network or file system, and it never throws for a string input.

## Interface

Added export in `src/utils.ts`, re-exported from the package entry
`src/index.ts` through its existing `export * from "./utils"`:

```ts
export function withoutHost(input: string);
```

- The signature is the one the ticket gives, with no return type annotation.
  The inferred return type is `string`. A type test
  `expectTypeOf(withoutHost("")).toEqualTypeOf<string>()` passes.
- The result is `P + S + H`, where `{ pathname, search, hash } = parseURL(input)`
  (no `defaultProto`), `P` is `pathname`, or `"/"` when `pathname` is `""`,
  `S` is `search` and `H` is `hash`, each exactly as `parseURL` returns it.
- No other export is added. No type, constant or option object is added.

Existing exports keep their behaviour unchanged. That covers every other
function in `src/utils.ts` (including `withoutProtocol`, `withoutFragment`,
`withoutBase`, `hasProtocol`), plus `parseURL`, `parsePath` and
`stringifyParsedURL` in `src/parse.ts`, and `toASCII` in `src/punycode.ts`.

```gherkin
Feature: withoutHost removes the protocol, auth, host and port from a URL
  As a developer using ufo
  I want to turn a full URL into the path, query and fragment it points at
  So that I can work with a host-independent location

  Background:
    Given "withoutHost" is imported from "src/utils.ts"

  Rule: Only the pathname, search and hash are kept; protocol, auth, host and port are dropped

    @happy
    Scenario: The ticket's example URL loses its origin
      When I call withoutHost with "http://example.com/foo?q=123#bar"
      Then the result is "/foo?q=123#bar"

    @happy
    Scenario: Auth, port and protocol all go along with the host
      When I call withoutHost with each input
      Then the result is the expected output
        | input                                          | output        |
        | https://user:pass@example.com:8080/a/b/?x=1#y | /a/b/?x=1#y   |
        | ftp://h/x/                                     | /x/           |
        | file:///home/u                                 | /home/u       |
        | HTTP://A.COM/Foo                               | /Foo          |

    @happy
    Scenario: withoutHost is re-exported from the package entry
      Given "withoutHost" is imported from "src/index.ts"
      When I call withoutHost with "https://example.com/foo"
      Then the result is "/foo"

  Rule: An empty pathname becomes "/", and the query and fragment follow it

    @boundary
    Scenario: A URL with only a host gives "/"
      When I call withoutHost with each input
      Then the result is the expected output
        | input                | output |
        | http://example.com   | /      |
        | http://example.com/  | /      |

    @boundary
    Scenario: The query and fragment are kept after the "/" fallback
      When I call withoutHost with each input
      Then the result is the expected output
        | input               | output   |
        | http://a.com?x=1#h  | /?x=1#h  |
        | http://a.com?x=1    | /?x=1    |
        | http://a.com#h      | /#h      |

    @boundary
    Scenario: An empty string gives "/"
      When I call withoutHost with ""
      Then the result is "/"

  Rule: Input with no host is taken as a path and returned unchanged, apart from the "/" fallback

    @happy
    Scenario: Paths without a protocol pass through
      When I call withoutHost with each input
      Then the result is the expected output
        | input             | output            |
        | /foo?x=1          | /foo?x=1          |
        | /                 | /                 |
        | foo/bar           | foo/bar           |
        | example.com/foo   | example.com/foo   |

    @boundary
    Scenario: A relative path is not given a leading slash
      When I call withoutHost with "foo/bar"
      Then the result is "foo/bar"

    @boundary
    Scenario: Query-only or fragment-only input gets the "/" fallback
      When I call withoutHost with each input
      Then the result is the expected output
        | input | output |
        | ?x=1  | /?x=1  |
        | #h    | /#h    |

    @unhappy
    Scenario: Input that is not an absolute URL is not rejected
      When I call withoutHost with "foo/bar"
      Then no error is thrown
      And the result is "foo/bar"

  Rule: A protocol-relative URL is parsed as parseURL parses it, so its host is removed

    @boundary
    Scenario: The host is removed from a protocol-relative URL
      When I call withoutHost with each input
      Then the result is the expected output
        | input               | output |
        | //example.com/foo   | /foo   |
        | //example.com       | /      |

  Rule: The search and hash are copied exactly as parsed, with no encoding, decoding or normalisation

    @happy
    Scenario: Percent-encoding is kept as it is
      When I call withoutHost with "http://a.com/foo%20bar?q=a%20b#x%20y"
      Then the result is "/foo%20bar?q=a%20b#x%20y"

    @boundary
    Scenario: Unencoded characters are not encoded
      When I call withoutHost with "http://a.com/foo bar?q=a b#c d"
      Then the result is "/foo bar?q=a b#c d"

    @boundary
    Scenario: An empty "?" or "#" is kept
      When I call withoutHost with each input
      Then the result is the expected output
        | input               | output  |
        | http://a.com/foo?   | /foo?   |
        | http://a.com/foo#   | /foo#   |

    @boundary
    Scenario: Repeated slashes in the path are not cleaned up
      When I call withoutHost with "http://a.com//foo"
      Then the result is "//foo"

  Rule: Input is interpreted exactly as parseURL interprets it, including its whitespace, backslash and special-protocol handling

    @boundary
    Scenario: Leading whitespace and backslashes are handled as parseURL handles them
      When I call withoutHost with each input
      Then the result is the expected output
        | input                | output |
        | "  http://a.com/foo" | /foo   |
        | http:\\a.com\foo     | /foo   |

    @unhappy
    Scenario: A script-protocol URL gives what follows the protocol
      When I call withoutHost with "javascript:alert(1)"
      Then no error is thrown
      And the result is "alert(1)"

    @unhappy
    Scenario: A protocol with no "//" and no path gives "/"
      When I call withoutHost with "mailto:a@b.com"
      Then no error is thrown
      And the result is "/"
```

In the table that holds `"  http://a.com/foo"`, the quotes only mark the two
leading spaces. The input is the 19-character string with no quotes. The
backslash row is the JavaScript string `"http:\\\\a.com\\foo"`, which is
`http:`, then two backslashes, `a.com`, one backslash and `foo`.

Decided:

- An empty pathname falls back to `"/"`, so `"http://example.com"` gives `"/"`.
  - Ticket: silent.
  - Instead: Return an empty string (or only the search and hash) when there is no path.
- Protocol, auth, host and port are all dropped. Only pathname, search and hash are returned.
  - Ticket: silent.
  - Instead: Keep the protocol, or strip only the hostname and leave the port and auth.
- Input with no host (for example `"/foo?x=1"`) is parsed as a path and returned unchanged. `"/"` is added only when the path is empty, and nothing is thrown.
  - Ticket: silent.
  - Instead: Return the input as is, or throw on input that is not an absolute URL.
- An empty string input returns `"/"`.
  - Ticket: silent.
  - Instead: Return an empty string.
- A protocol-relative URL goes through `parseURL` with no special handling. `parseURL` treats `//host` as having a host, so `"//example.com/foo"` gives `"/foo"`.
  - Ticket: silent.
  - Instead: Explicitly treat `"//host"` as having a host and strip it.
- When the path is empty, the query and fragment are kept after the `"/"` fallback, so `"http://a.com?x=1#h"` gives `"/?x=1#h"`.
  - Ticket: silent.
  - Instead: Return `"?x=1#h"` with no leading slash.
- `search` and `hash` are concatenated as parsed, with no re-encoding or normalisation.
  - Ticket: silent.
  - Instead: Re-stringify or normalise the query and fragment.
- The return type is left inferred, and it comes out as `string`.
  - Ticket: "export function withoutHost(input: string);"
  - Instead: Declare an explicit `: string` return type, as the neighbouring functions do.
- Repeated slashes and letter case in the path are kept, so `"http://a.com//foo"` gives `"//foo"`.
  - Ticket: silent.
  - Instead: Collapse repeated slashes (as `cleanDoubleSlashes` does) so that the result cannot read as a protocol-relative URL.
- Script-protocol and other non-`//` protocol inputs follow `parseURL`: `"javascript:alert(1)"` gives `"alert(1)"` and `"mailto:a@b.com"` gives `"/"`.
  - Ticket: silent.
  - Instead: Return such inputs unchanged, or return `"/"` for every input that has a protocol but no host.
- Leading whitespace and backslashes in an input with a protocol are handled as `parseURL` handles them (whitespace is skipped, and `\` is read as `/`).
  - Ticket: silent.
  - Instead: Take the input literally, without trimming whitespace or reading backslashes as slashes.
- A `withoutHost` call never throws for a string input. Input that cannot be parsed as a URL is not rejected.
  - Ticket: silent.
  - Instead: Throw a `TypeError` for input that is not an absolute URL, as the WHATWG `URL` constructor does.
