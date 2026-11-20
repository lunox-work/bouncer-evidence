# Add `filterQuery` utility

Ticket #287 adds `filterQuery` to `src/utils.ts`, next to `withQuery` and `getQuery`. It takes a URL or path string and a predicate. The predicate is called with each query parameter's key and value, and `filterQuery` returns the URL with only the parameters the predicate kept. It uses the module's existing helpers: `parseURL` / `stringifyParsedURL` from `src/parse.ts`, and `parseQuery` / `stringifyQuery` from `src/query.ts`. So the predicate sees the same decoded data that `getQuery` returns, and the rebuilt query is encoded the way `withQuery` encodes it.

## Interface

New export from `src/utils.ts`, also re-exported from the package entry `src/index.ts` through its existing `export * from "./utils"`:

```ts
export function filterQuery(
  input: string,
  predicate: (key: string, value: string | string[]) => boolean,
): string;
```

- `input`: a full URL, a protocol-relative URL, a host-less path, or an empty string. It is parsed the way `parseURL(input)` parses it.
- `predicate`: called once for each distinct key of `parseQuery(parseURL(input).search)`, i.e. once for each key of `getQuery(input)`, with exactly two arguments, `(key, value)`. `value` is a `string` for a key that appears once and a `string[]` for a key that appears more than once. The type is the value type of `ParsedQuery`.
- Returns a `string`.

No new types or constants. Every existing export keeps its behaviour, including `withQuery`, `getQuery`, `parseQuery`, `stringifyQuery`, `parseURL` and `stringifyParsedURL`.

```gherkin
Feature: filterQuery keeps only the query parameters a predicate accepts

  Rule: An entry is kept when the predicate returns true and dropped when it returns false

    @happy
    Scenario: Dropping one parameter by key
      Given the input "/foo?bar=1&baz=2"
      And the predicate (key) => key !== "bar"
      When filterQuery is called
      Then the result is "/foo?baz=2"

    @happy
    Scenario Outline: Keeping or dropping parameters
      Given the input "<input>"
      And the predicate <predicate>
      When filterQuery is called
      Then the result is "<output>"

      Examples:
        | input                            | predicate                 | output                       |
        | /foo?bar=1&baz=2                 | () => true                | /foo?bar=1&baz=2             |
        | /foo?a=1&b=2&c=3                 | (key) => key !== "b"      | /foo?a=1&c=3                 |
        | http://foo.com/foo?a=1&b=2#hash  | (key) => key === "a"      | http://foo.com/foo?a=1#hash  |
        | //foo.com/p?a=1&b=2              | (key) => key === "b"      | //foo.com/p?b=2              |
        | foo.com/foo?a=1                  | () => true                | foo.com/foo?a=1              |
        | /foo/?a=1&b=2                    | (key) => key === "a"      | /foo/?a=1                    |

    @happy
    Scenario: The predicate can decide on the value
      Given the input "/foo?x=1&y=2"
      And the predicate (key, value) => value === "2"
      When filterQuery is called
      Then the result is "/foo?y=2"

  Rule: If the input contains no "?" at all, it is returned exactly as given and the predicate is never called

    @boundary
    Scenario Outline: Input without "?"
      Given the input "<input>"
      And a predicate that records its calls and returns false
      When filterQuery is called
      Then the result is "<input>"
      And the predicate was called 0 times

      Examples:
        | input                    |
        |                          |
        | /foo                     |
        | http://foo.com/foo#hash  |
        | HTTP://Foo.com/a         |

  Rule: Any input that contains "?" is parsed by parseURL and rebuilt by stringifyParsedURL, even if the predicate keeps everything

    @boundary
    Scenario: The URL is normalized once it contains "?"
      Given the input "HTTP://Foo.com/a?x=1"
      And the predicate () => true
      When filterQuery is called
      Then the result is "http://Foo.com/a?x=1"

  Rule: Only the query that parseURL finds counts as a query; a "?" inside the hash is part of the hash and is passed through unchanged

    @boundary
    Scenario Outline: A "?" that is not a query
      Given the input "<input>"
      And a predicate that records its calls and returns <returns>
      When filterQuery is called
      Then the result is "<output>"
      And the predicate was called with <calls>

      Examples:
        | input          | returns | output         | calls       |
        | /foo#a?b=1     | true    | /foo#a?b=1     | nothing     |
        | /foo#a?b       | false   | /foo#a?b       | nothing     |
        | /foo?a=1#?b=2  | true    | /foo?a=1#?b=2  | ("a", "1")  |

  Rule: If no parameter is left, the result has no "?"; the path, host and hash are kept

    @boundary
    Scenario Outline: Every parameter dropped, or no parameters to begin with
      Given the input "<input>"
      And the predicate <predicate>
      When filterQuery is called
      Then the result is "<output>"

      Examples:
        | input                        | predicate     | output                   |
        | /foo?bar=1&baz=2             | () => false   | /foo                     |
        | http://foo.com/foo?a=1#hash  | () => false   | http://foo.com/foo#hash  |
        | /foo?                        | () => true    | /foo                     |
        | ?                            | () => true    |                          |
        | /foo?#h                      | () => true    | /foo#h                   |

  Rule: The predicate receives decoded keys and values, exactly as parseQuery / getQuery produce them

    @happy
    Scenario Outline: Decoded arguments
      Given the input "<input>"
      And a predicate that records its calls and returns true
      When filterQuery is called
      Then the predicate was called exactly once, with key <key> and value <value>

      Examples:
        | input                         | key        | value        |
        | /foo?email=some%20email.com   | "email"    | "some email.com" |
        | /foo?email=some+email.com     | "email"    | "some email.com" |
        | /foo?k%20y=%E5%A5%BD          | "k y"      | "好"          |
        | /foo?a=1%2B2                  | "a"        | "1+2"        |
        | /foo?a=x%26y                  | "a"        | "x&y"        |
        | /foo?a=b=c                    | "a"        | "b=c"        |

  Rule: A repeated key is grouped into one string[] in order of appearance; the predicate is called once for that key and keeps or drops all its occurrences together

    @happy
    Scenario: A repeated key arrives as an array
      Given the input "/foo?a=1&a=2&b=3"
      And a predicate that records its calls and returns true
      When filterQuery is called
      Then the predicate calls are, in order:
        | key | value       |
        | a   | ["1", "2"]  |
        | b   | "3"         |
      And the result is "/foo?a=1&a=2&b=3"

    @happy
    Scenario Outline: Keeping or dropping a repeated key as a whole
      Given the input "<input>"
      And the predicate <predicate>
      When filterQuery is called
      Then the result is "<output>"

      Examples:
        | input              | predicate                            | output        |
        | /foo?a=1&a=2&b=3   | (key) => key === "a"                 | /foo?a=1&a=2  |
        | /foo?a=1&a=2&b=3   | (key) => key !== "a"                 | /foo?b=3      |
        | /foo?a=1&a=2&b=3   | (key, value) => Array.isArray(value) | /foo?a=1&a=2  |

  Rule: A parameter with an empty value or no "=" is passed to the predicate with the value ""; it is never skipped

    @boundary
    Scenario Outline: Parameters without a value
      Given the input "<input>"
      And a predicate that records its calls and returns true
      When filterQuery is called
      Then the predicate calls are <calls>
      And the result is "<output>"

      Examples:
        | input            | calls                         | output           |
        | /foo?test        | ("test", "")                  | /foo?test        |
        | /foo?test&x=     | ("test", ""), ("x", "")       | /foo?test&x      |
        | /foo?a=1&a=      | ("a", ["1", ""])              | /foo?a=1&a=      |

    @boundary
    Scenario: The predicate can select the valueless parameters
      Given the input "/foo?x=&y&z=1"
      And the predicate (key, value) => value === ""
      When filterQuery is called
      Then the result is "/foo?x&y"

  Rule: The kept parameters are re-encoded with stringifyQuery, not copied from the input text

    @boundary
    Scenario Outline: Encoding is normalized
      Given the input "<input>"
      And the predicate () => true
      When filterQuery is called
      Then the result is "<output>"

      Examples:
        | input                         | output                     |
        | /foo?email=some%20email.com   | /foo?email=some+email.com  |
        | /foo?k%20y=%E5%A5%BD          | /foo?k+y=%E5%A5%BD         |
        | /foo?a=%7B%22x%22%3A1%7D      | /foo?a=%7B%22x%22:1%7D     |
        | /foo?a=1%2B2                  | /foo?a=1%2B2               |
        | /foo?a=x%26y&b                | /foo?a=x%26y&b             |
        | /foo?a=1&&b=2                 | /foo?a=1&b=2               |
        | /foo?x=                       | /foo?x                     |

  Rule: Kept parameters and predicate calls follow the key order of the parsed query object: integer-like keys first in ascending numeric order, then the other keys in order of first appearance; all occurrences of a repeated key sit at the place where it first appeared

    @boundary
    Scenario Outline: Output order
      Given the input "<input>"
      And the predicate () => true
      When filterQuery is called
      Then the result is "<output>"

      Examples:
        | input                | output               |
        | /foo?c=3&a=1&b=2     | /foo?c=3&a=1&b=2     |
        | /foo?a=1&b=2&a=3     | /foo?a=1&a=3&b=2     |
        | /foo?2=b&1=a         | /foo?1=a&2=b         |

    @boundary
    Scenario: Predicate call order matches output order
      Given the input "/foo?b=x&2=y&1=z"
      And a predicate that records its calls and returns true
      When filterQuery is called
      Then the predicate receives the keys in the order "1", "2", "b"

  Rule: The keys "__proto__" and "constructor" are never passed to the predicate and are always removed

    @unhappy
    Scenario Outline: Prototype-polluting keys
      Given the input "<input>"
      And a predicate that records its calls and returns true
      When filterQuery is called
      Then the result is "<output>"
      And the predicate calls are <calls>

      Examples:
        | input                  | output    | calls        |
        | /foo?__proto__=1&x=2   | /foo?x=2  | ("x", "2")   |
        | /foo?constructor=1     | /foo      | nothing      |

  Rule: If the predicate throws, filterQuery calls it no further and rethrows the same error

    @unhappy
    Scenario: A throwing predicate
      Given the input "/foo?a=1&b=2"
      And a predicate that throws new Error("boom") when key is "a"
      When filterQuery is called
      Then it throws the same Error with message "boom"
      And the predicate was called once
```

Decided:
- The predicate keeps an entry when it returns `true` and drops it when it returns `false`.
    Ticket: silent.
    Instead: Treat a true return as 'remove this param'.
- If the input contains no "?", it is returned unchanged without being parsed, and the predicate is not called.
    Ticket: silent.
    Instead: Parse and re-stringify the URL, which could normalize it.
- The predicate receives decoded keys and values, as `parseQuery` / `getQuery` produce them.
    Ticket: silent.
    Instead: Pass raw, still-encoded key/value strings.
- A repeated key is grouped into one `string[]`, and the predicate is called once for that key and keeps or drops all its occurrences together.
    Ticket: silent.
    Instead: Call the predicate once per occurrence with a single string value, and filter each occurrence separately.
- If every parameter is dropped, search is set to the stringified empty query, so the result has no "?". Path, host and hash stay.
    Ticket: silent.
    Instead: Explicitly strip the '?' so the result is the bare path.
- The kept parameters are rebuilt with `stringifyQuery` from the parsed object, so their encoding is normalized and their order follows the object's key order (integer-like keys first).
    Ticket: silent.
    Instead: Filter the original query string segments and keep the survivors untouched.
- Whether there is a query is decided first by a plain `includes("?")` check and then by `parseURL`. A "?" only in the hash, or a bare "?", leaves no parameters, but the input is still re-stringified.
    Ticket: silent.
    Instead: Rely on the parsed search value being empty rather than checking the raw string.
- A parameter with an empty value or no "=" is passed to the predicate with the value `""`. If kept, a single empty value is written as `key` and an empty item in an array as `key=`.
    Ticket: silent.
    Instead: Skip valueless params or give them a different value such as undefined or true.
- The predicate is called in the parsed object's key order, which is the same order as the output.
    Ticket: silent.
    Instead: Call the predicate in the order the parameters first appear in the input string.
- The keys `__proto__` and `constructor` are always removed and never passed to the predicate, as `parseQuery` already does.
    Ticket: silent.
    Instead: Pass them to the predicate and keep them when it returns true.
- An error thrown by the predicate propagates unchanged, and later keys are not visited.
    Ticket: silent.
    Instead: Catch the error and treat that entry as dropped, or kept.
