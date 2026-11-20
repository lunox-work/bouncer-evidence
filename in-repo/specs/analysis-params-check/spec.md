# Analysis domain rules: statuses, error codes, artifact kinds, lease expiry and canonical JSON

Ticket #68 adds analysis of repository snapshots by a private Graphify worker.
The parts of that feature that belong to `packages/core` are pure domain rules.
They live in a new, dependency-free module, `packages/core/src/analysis.ts`,
which `packages/core/src/index.ts` re-exports. The module covers the
vocabulary an analysis run is described in (statuses, error codes, artifact
kinds, the pinned tool version), the parameters an analysis takes, what happens
to an analysis whose worker lease expired, and a canonical JSON form so that
equal parameters always give the same cache key. Nothing here touches a
database, the network, the clock or the file system. Every function is
synchronous and pure.

## Exports of `packages/core/src/analysis.ts`

```ts
export const ANALYSIS_STATUSES = [
    "queued",
    "running",
    "succeeded",
    "failed",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_ERROR_CODES = [
    "too_large",
    "too_many_files",
    "source_unavailable",
    "tool_failed",
    "tool_timeout",
    "upload_failed",
    "worker_lost",
    "cancelled",
] as const;

export type AnalysisErrorCode = (typeof ANALYSIS_ERROR_CODES)[number];

export const ARTIFACT_KINDS = [
    "graph_json",
    "graph_html",
    "report_md",
    "wiki_page",
    "manifest",
    "other",
] as const;

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

export const GRAPHIFY_TOOL_VERSION = "graphifyy@0.4.18+driver-1";

export interface AnalysisParams {
    readonly deadlineMinutes: number;
}

export function expiredAnalysis(attempt: number, maxAttempts: number): {
    status: "queued" | "failed";
    attempt: number;
};

export function canonicalJson(value: unknown): string;
```

- The module exports exactly these names and nothing else at runtime. The
  runtime exports are the four constants and the two functions.
  `AnalysisStatus`, `AnalysisErrorCode`, `ArtifactKind` and `AnalysisParams`
  are types only.
- `packages/core/src/index.ts` gains `export * from "./analysis.js";`, so
  every export above can also be imported from `../src/index.js`.
- Every existing export of `packages/core` keeps its current behaviour,
  unchanged. That covers `handle.ts`, `bounty.ts`, `selection/`, `pricing/`
  and `repo/`. No existing export is renamed, and none collides with a new
  name.

## Reference behaviour

`expiredAnalysis(attempt, maxAttempts)`:

- If `attempt < maxAttempts`, it returns `{ status: "queued", attempt: attempt + 1 }`.
- Otherwise it returns `{ status: "failed", attempt }`, with `attempt`
  unchanged.
- It does not validate or coerce its inputs. The comparison and the `+ 1` are
  plain JavaScript number operations on the values passed in.
- It returns a new object with exactly the keys `status` and `attempt`.

`canonicalJson(value)` gives a JSON text with no whitespace between tokens:

- `null`, a string, a number or a boolean is written exactly as
  `JSON.stringify(value)` writes it. So `NaN`, `Infinity` and `-Infinity`
  become `null`, `-0` becomes `0`, and strings are escaped as
  `JSON.stringify` escapes them.
- A bigint, at any depth, throws the `TypeError` that `JSON.stringify` throws.
- `undefined`, a function or a symbol, at any depth (top level, object
  property value or array element), throws an `Error` whose message is
  exactly `Cache parameters must be JSON values.`
- An array (`Array.isArray`) becomes `[` + its elements, each passed through
  `canonicalJson`, in index order from `0` to `length - 1`, joined by `,` +
  `]`. A hole in a sparse array is skipped, not read as `undefined`: it
  writes nothing between its commas, so `[1, , 3]` becomes `[1,,3]`.
- Any other object becomes `{` + one `"key":value` pair per own enumerable
  string key (`Object.keys`), joined by `,` + `}`. The key is written as
  `JSON.stringify(key)` writes it. The value is `canonicalJson` of the
  property value. Keys are sorted by UTF-16 code unit, the order of
  `Array.prototype.sort()` with no comparator (the same order as `compare`
  in `repo/tree.ts`). Symbol keys, non-enumerable keys, inherited properties
  and `toJSON` methods on the prototype are ignored. So `Date`, `Map` and
  `Set` instances become `{}`. An own enumerable `toJSON` property whose
  value is a function is an ordinary property with a function value, so it
  throws.
- There is no cycle detection. A cyclic value recurses until the engine
  throws a `RangeError`.
- The input is never mutated.

```gherkin
Feature: Analysis domain rules in packages/core/src/analysis.ts

  Rule: The vocabulary constants list exactly the ticket's values, in the ticket's order

    @happy
    Scenario: ANALYSIS_STATUSES lists the four statuses in order
      When ANALYSIS_STATUSES is read
      Then it deep-equals ["queued", "running", "succeeded", "failed"]

    @happy
    Scenario: ANALYSIS_ERROR_CODES lists the eight error codes in order
      When ANALYSIS_ERROR_CODES is read
      Then it deep-equals:
        | index | code               |
        | 0     | too_large          |
        | 1     | too_many_files     |
        | 2     | source_unavailable |
        | 3     | tool_failed        |
        | 4     | tool_timeout       |
        | 5     | upload_failed      |
        | 6     | worker_lost        |
        | 7     | cancelled          |
      And its length is 8

    @happy
    Scenario: ARTIFACT_KINDS lists the six artifact kinds in order
      When ARTIFACT_KINDS is read
      Then it deep-equals ["graph_json", "graph_html", "report_md", "wiki_page", "manifest", "other"]

    @happy
    Scenario: GRAPHIFY_TOOL_VERSION pins the Graphify driver
      When GRAPHIFY_TOOL_VERSION is read
      Then it is exactly the string "graphifyy@0.4.18+driver-1"

    @boundary
    Scenario: The constant arrays are plain arrays, not frozen, like the bounty constants
      When Object.isFrozen is called on ANALYSIS_STATUSES, ANALYSIS_ERROR_CODES and ARTIFACT_KINDS
      Then each answer is false
      And each value is an Array

    @happy
    Scenario: The analysis exports are re-exported from the package index
      When ANALYSIS_STATUSES, ANALYSIS_ERROR_CODES, ARTIFACT_KINDS, GRAPHIFY_TOOL_VERSION, expiredAnalysis and canonicalJson are imported from "../src/index.js"
      Then each is the same value as the one imported from "../src/analysis.js"

  Rule: AnalysisParams is a type with one readonly number and no runtime validation, bounds or default

    @happy
    Scenario: A params object with a deadline serializes as given
      Given params of type AnalysisParams equal to { deadlineMinutes: 30 }
      When canonicalJson(params) is called
      Then the result is '{"deadlineMinutes":30}'

    @unhappy
    Scenario Outline: Nothing in the seam rejects an out-of-range deadline
      Given params of type AnalysisParams equal to { deadlineMinutes: <minutes> }
      When canonicalJson(params) is called
      Then no error is thrown
      And the result is '<json>'

      Examples:
        | minutes  | json                       |
        | 0        | {"deadlineMinutes":0}      |
        | -5       | {"deadlineMinutes":-5}     |
        | 2.5      | {"deadlineMinutes":2.5}    |
        | NaN      | {"deadlineMinutes":null}   |
        | Infinity | {"deadlineMinutes":null}   |

  Rule: An expired analysis is re-queued with the next attempt number while attempt < maxAttempts

    @happy
    Scenario Outline: Re-queue below the limit
      When expiredAnalysis(<attempt>, <maxAttempts>) is called
      Then the result deep-equals { status: "queued", attempt: <next> }

      Examples:
        | attempt | maxAttempts | next |
        | 1       | 3           | 2    |
        | 2       | 3           | 3    |
        | 1       | 2           | 2    |
        | 0       | 1           | 1    |

    @happy
    Scenario: A three-attempt analysis walks through its attempts and then fails
      Given maxAttempts is 3
      When expiredAnalysis is called with attempt 1, then with the returned attempt, then again with the returned attempt
      Then the results are, in order:
        | status | attempt |
        | queued | 2       |
        | queued | 3       |
        | failed | 3       |

  Rule: An expired analysis fails, keeping its attempt number, once attempt >= maxAttempts

    @boundary
    Scenario: Exactly maxAttempts attempts used fails, it is not retried
      When expiredAnalysis(3, 3) is called
      Then the result deep-equals { status: "failed", attempt: 3 }

    @boundary
    Scenario: More attempts than allowed also fails, with the attempt unchanged
      When expiredAnalysis(5, 3) is called
      Then the result deep-equals { status: "failed", attempt: 5 }

    @happy
    Scenario: The result has exactly the keys status and attempt
      When expiredAnalysis(1, 3) is called
      Then Object.keys of the result deep-equals ["status", "attempt"]

    @boundary
    Scenario: Each call returns a new object
      When expiredAnalysis(1, 3) is called twice
      Then the two results deep-equal each other
      And they are not the same object

  Rule: expiredAnalysis does not validate its inputs; it compares and increments them as given

    @unhappy
    Scenario Outline: Unusual inputs are neither rejected nor clamped
      When expiredAnalysis(<attempt>, <maxAttempts>) is called
      Then no error is thrown
      And the result deep-equals { status: "<status>", attempt: <result> }

      Examples:
        | attempt | maxAttempts | status | result |
        | 1       | 0           | failed | 1      |
        | 0       | 0           | failed | 0      |
        | -1      | 0           | queued | 0      |
        | 1       | -2          | failed | 1      |
        | 1.5     | 2           | queued | 2.5    |
        | 2       | 2.5         | queued | 3      |
        | 1       | NaN         | failed | 1      |
        | NaN     | 3           | failed | NaN    |
        | 1       | Infinity    | queued | 2      |

  Rule: canonicalJson writes JSON primitives exactly as JSON.stringify does

    @happy
    Scenario Outline: Primitives
      When canonicalJson(<value>) is called
      Then the result is the string <json>

      Examples:
        | value          | json             |
        | null           | 'null'           |
        | true           | 'true'           |
        | false          | 'false'          |
        | 0              | '0'              |
        | -0             | '0'              |
        | 42             | '42'             |
        | 0.1            | '0.1'            |
        | 1e21           | '1e+21'          |
        | "abc"          | '"abc"'          |
        | ""             | '""'             |
        | 'a"b'          | '"a\\"b"'        |
        | "line\nbreak"  | '"line\\nbreak"' |

    @boundary
    Scenario Outline: Non-finite numbers become null
      When canonicalJson(<value>) is called
      Then the result is 'null'

      Examples:
        | value     |
        | NaN       |
        | Infinity  |
        | -Infinity |

    @unhappy
    Scenario Outline: A bigint throws JSON.stringify's TypeError at any depth
      When canonicalJson(<value>) is called
      Then a TypeError is thrown

      Examples:
        | value       |
        | 1n          |
        | { a: 1n }   |
        | [1n]        |

  Rule: canonicalJson sorts object keys by UTF-16 code unit at every level and writes no whitespace

    @happy
    Scenario: Key order in the input does not change the output
      When canonicalJson({ b: 1, a: 2 }) is called
      And canonicalJson({ a: 2, b: 1 }) is called
      Then both results are '{"a":2,"b":1}'

    @happy
    Scenario: Nested objects are sorted too, including objects inside arrays
      When canonicalJson({ z: { y: 1, x: [ { b: true, a: null } ] }, a: "s" }) is called
      Then the result is '{"a":"s","z":{"x":[{"a":null,"b":true}],"y":1}}'

    @boundary
    Scenario: Empty containers
      When canonicalJson({}) and canonicalJson([]) are called
      Then the results are '{}' and '[]'

    @boundary
    Scenario Outline: Keys sort by UTF-16 code unit, not by number, locale or code point
      When canonicalJson(<value>) is called
      Then the result is '<json>'

      Examples:
        | value                          | json                         |
        | { a: 1, B: 2 }                 | {"B":2,"a":1}                |
        | { "2": "two", "10": "ten" }    | {"10":"ten","2":"two"}       |
        | { "ｚ": 1, "😀": 2 }           | {"😀":2,"ｚ":1}              |
        | { "é": 1, "z": 2 }             | {"z":2,"é":1}                |

    @boundary
    Scenario: Keys are escaped as JSON strings
      When canonicalJson({ 'q"k': 1 }) is called
      Then the result is '{"q\\"k":1}'

    @happy
    Scenario: The input object is not mutated
      Given input = { b: 1, a: { d: 2, c: 3 } }
      When canonicalJson(input) is called
      Then Object.keys(input) still deep-equals ["b", "a"]
      And Object.keys(input.a) still deep-equals ["d", "c"]

  Rule: canonicalJson keeps array element order

    @happy
    Scenario: Arrays are not sorted
      When canonicalJson([3, 1, 2]) is called
      Then the result is '[3,1,2]'
      And canonicalJson([1, 2, 3]) is '[1,2,3]', a different string

    @happy
    Scenario: Mixed arrays canonicalize each element in place
      When canonicalJson([{ b: 1, a: 2 }, "x", null, [false]]) is called
      Then the result is '[{"a":2,"b":1},"x",null,[false]]'

  Rule: undefined, functions and symbols are not JSON values and throw wherever they appear

    @unhappy
    Scenario Outline: A non-JSON value throws an Error with a fixed message
      When canonicalJson(<value>) is called
      Then an Error is thrown whose message is exactly "Cache parameters must be JSON values."

      Examples:
        | value                       | where                  |
        | undefined                   | top level              |
        | () => 1                     | top level              |
        | Symbol("s")                 | top level              |
        | { a: 1, b: undefined }      | object property        |
        | { nested: { f() {} } }      | nested object property |
        | { s: Symbol("s") }          | object property        |
        | [1, undefined]              | array element          |
        | [() => 1]                   | array element          |
        | [Symbol("s")]               | array element          |
        | { toJSON: () => "x" }       | own toJSON property    |

    @unhappy
    Scenario: An undefined property is not dropped the way JSON.stringify drops it
      Given JSON.stringify({ a: 1, b: undefined }) is '{"a":1}'
      When canonicalJson({ a: 1, b: undefined }) is called
      Then it throws rather than returning '{"a":1}'

  Rule: A hole in a sparse array writes nothing between its commas

    @boundary
    Scenario Outline: Sparse array holes are skipped, not read as undefined
      When canonicalJson(<value>) is called
      Then no error is thrown
      And the result is '<json>'

      Examples:
        | value          | json       |
        | [1, , 3]       | [1,,3]     |
        | [1, , ]        | [1,]       |
        | new Array(2)   | [,]        |
        | { a: [ , 1] }  | {"a":[,1]} |

  Rule: Any non-array object is read as a record of its own enumerable string keys

    @boundary
    Scenario Outline: Non-plain objects
      When canonicalJson(<value>) is called
      Then the result is '<json>'

      Examples:
        | value                                   | json      |
        | new Date(0)                             | {}        |
        | new Map([["a", 1]])                     | {}        |
        | new Set([1])                            | {}        |
        | new (class { x = 1; toJSON() { return "t"; } })() | {"x":1} |
        | Object.create({ inherited: 1 })         | {}        |

    @boundary
    Scenario: Symbol keys and non-enumerable keys are left out
      Given input = { a: 1, [Symbol("s")]: 2 }
      And a non-enumerable property "hidden" with value 3 defined on input
      When canonicalJson(input) is called
      Then the result is '{"a":1}'

  Rule: canonicalJson does not detect cycles

    @unhappy
    Scenario: A cyclic value overflows the stack
      Given input = { a: 1 } with input.self = input
      When canonicalJson(input) is called
      Then a RangeError is thrown

  Rule: Every function is pure and synchronous

    @happy
    Scenario: Repeated calls with equal inputs give equal results
      When canonicalJson({ deadlineMinutes: 30 }) is called twice
      Then both results are '{"deadlineMinutes":30}'
      And expiredAnalysis(2, 3) called twice gives { status: "queued", attempt: 3 } both times
```

## Decided:

- When an expired analysis has used exactly maxAttempts attempts, it fails. It re-queues only while `attempt < maxAttempts`.
  - Ticket: "export function expiredAnalysis(attempt: number, maxAttempts: number): {
    status: "queued" | "failed";
    attempt: number;
};"
  - Instead: Treat maxAttempts as the number of retries allowed after the first run, so `attempt <= maxAttempts` would still re-queue.
- A re-queued expired analysis carries `attempt + 1`.
  - Ticket: silent.
  - Instead: Keep the attempt number unchanged and let the next claim of the lease increment it.
- A failed expired analysis carries its attempt number unchanged.
  - Ticket: silent.
  - Instead: Increment the attempt number on failure too, or return no attempt.
- expiredAnalysis does no validation. A maxAttempts of 0 fails at once, a negative maxAttempts fails for any attempt ≥ it, non-integers are compared and incremented as given, and NaN in either argument fails.
  - Ticket: silent.
  - Instead: Throw on invalid attempt or maxAttempts, or clamp them to a minimum of 1.
- canonicalJson sorts object keys with the default string sort (UTF-16 code unit order) at every nesting level.
  - Ticket: silent.
  - Instead: Sort by Unicode code point or with a locale-aware comparison.
- canonicalJson keeps array element order and canonicalizes each element.
  - Ticket: silent.
  - Instead: Sort array elements as well, so the output does not depend on element order.
- canonicalJson throws `Error("Cache parameters must be JSON values.")` for an undefined, function or symbol value at the top level.
  - Ticket: silent.
  - Instead: Return the string "null", or return undefined.
- canonicalJson throws that same Error for an undefined, function or symbol object property value, instead of dropping the key.
  - Ticket: silent.
  - Instead: Omit the key, as JSON.stringify does.
- canonicalJson throws that same Error for an undefined, function or symbol array element, instead of writing null.
  - Ticket: silent.
  - Instead: Write "null" for the element, as JSON.stringify does.
- canonicalJson reads any non-array object as a record of its own enumerable keys. A Date, Map or Set becomes "{}" and a prototype toJSON is ignored. NaN and ±Infinity become "null", and a bigint throws a TypeError.
  - Ticket: silent.
  - Instead: Honor toJSON, so a Date serializes as an ISO string, or reject non-plain objects.
- canonicalJson does no cycle detection, so a cyclic value throws the engine's RangeError.
  - Ticket: silent.
  - Instead: Detect cycles and throw a descriptive error.
- AnalysisParams.deadlineMinutes is a bare readonly number with no validator, bounds or default.
  - Ticket: "export interface AnalysisParams {
    readonly deadlineMinutes: number;
}"
  - Instead: Add a validator, or a constant default and maximum, that rejects non-positive or non-integer values.
- A hole in a sparse array is skipped and writes nothing between its commas, so `canonicalJson([1, , 3])` is `"[1,,3]"`, `canonicalJson(new Array(2))` is `"[,]"`, and no error is thrown.
  - Ticket: silent.
  - Instead: Throw the same Error as for undefined, or write "null" for the hole, as JSON.stringify does.
- An own enumerable `toJSON` function property is a function-valued property, so canonicalJson throws the same Error.
  - Ticket: silent.
  - Instead: Call it and serialize its result, as JSON.stringify does.
- The new exports are re-exported from `packages/core/src/index.ts`.
  - Ticket: silent.
  - Instead: Keep them importable only from `packages/core/src/analysis.ts`.
- ANALYSIS_STATUSES, ANALYSIS_ERROR_CODES and ARTIFACT_KINDS are plain `as const` arrays and are not frozen at runtime, like the bounty constants.
  - Ticket: silent.
  - Instead: `Object.freeze` them so they cannot be changed at runtime.
