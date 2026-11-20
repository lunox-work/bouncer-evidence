# parseQuery returns an object without Object.prototype

`parseQuery` in `src/query.ts` builds its result in a plain `{}` literal. Because that
object inherits from `Object.prototype`, query keys that match inherited members
(`toString`, `hasOwnProperty`, `valueOf`, ...) are treated as already present: `?toString=a`
gives `{ toString: [Function, "a"] }`. Today the code also skips the keys `__proto__` and
`constructor` to stop prototype pollution. This change (#286) builds the result from a
private constructor whose `prototype` is `Object.create(null)`. The result then has no
inherited members, so every decoded key other than `__proto__` and `constructor` becomes an
ordinary own property. The `__proto__`/`constructor` skip in `parseQuery` and the JSDoc
`@note` about it are kept. Nothing else in the parsing changes: the leading `?`, the `&`
splitting, decoding, and how repeated keys are merged into arrays all stay the same.

**Interface (`src/query.ts`).** The names and signatures of the exports stay the same:

```ts
export type QueryValue = string | number | undefined | null | boolean | Array<QueryValue> | Record<string, any>;
export type QueryObject = Record<string, QueryValue | QueryValue[]>;
export type ParsedQuery = Record<string, string | string[]>;

export function parseQuery<T extends ParsedQuery = ParsedQuery>(parametersString?: string): T; // default ""
export function encodeQueryItem(key: string, value: QueryValue | QueryValue[]): string;
export function stringifyQuery(query: QueryObject): string;
```

The change adds a module-private constant `EmptyObject`, typed `{ new (): any }`. It is not
exported, and tests must not import it. Only the runtime shape of the object `parseQuery`
returns changes. `encodeQueryItem` and `stringifyQuery` behave as before, and the types
`QueryValue`, `QueryObject` and `ParsedQuery` stay the same. Callers in other files
(`getQuery`, `withQuery`, `normalizeURL`, `$URL`) are not edited. `getQuery` and
`$URL.query` hand back the `parseQuery` result unchanged.

```gherkin
Feature: parseQuery builds its result on a null-prototype object

  Background:
    Given "parseQuery" is imported from "src/query.ts"
    And "proto(x)" means "Object.getPrototypeOf(x)"

  Rule: The result is created with "new EmptyObject()": its prototype is one shared object whose own prototype is null
    The result's prototype is not null. That prototype has no properties, and its own
    prototype is null. Every call returns a new result object, and all results share
    that same prototype object.

    @happy
    Scenario: The prototype chain of a result is result -> empty prototype -> null
      When I call parseQuery("a=1")
      Then proto(result) is not null
      And Object.getOwnPropertyNames(proto(result)) is []
      And proto(proto(result)) is null

    @boundary
    Scenario: Separate calls return distinct objects that share one prototype
      Given r1 = parseQuery("a=1")
      And r2 = parseQuery("a=1")
      Then r1 is not the same object as r2
      And proto(r1) is the same object as proto(r2)
      When I set r1.b = "2"
      Then r2.b is undefined

    @boundary
    Scenario Outline: An empty or key-less query still returns an empty null-prototype object
      When I call parseQuery(<input>)
      Then Object.keys(result) is []
      And proto(proto(result)) is null

      Examples:
        | input     |
        | (omitted) |
        | ""        |
        | "?"       |
        | "&&"      |

  Rule: The result has no Object.prototype members
    The result is not "instanceof Object". It has no inherited "hasOwnProperty",
    "toString", "valueOf" or "constructor". Calls that need them throw. The static
    helpers on "Object" still work on the result.

    @happy
    Scenario: Inherited members are absent
      When I call parseQuery("a=1")
      Then "result instanceof Object" is false
      And result.hasOwnProperty is undefined
      And result.toString is undefined
      And result.valueOf is undefined
      And result.constructor is undefined

    @unhappy
    Scenario: Calling an inherited member or converting to a string throws TypeError
      Given result = parseQuery("a=1")
      Then calling result.hasOwnProperty("a") throws a TypeError
      And String(result) throws a TypeError
      And the template literal `${result}` throws a TypeError

    @happy
    Scenario: Static Object helpers and JSON work on the result
      Given result = parseQuery("a=1&b=2&b=3")
      Then Object.keys(result) is ["a", "b"]
      And Object.prototype.hasOwnProperty.call(result, "a") is true
      And Object.hasOwn(result, "b") is true
      And JSON.stringify(result) is '{"a":"1","b":["2","3"]}'
      And result deep-equals { a: "1", b: ["2", "3"] } under toEqual

  Rule: A "__proto__" key is still skipped and never changes the prototype
    The existing skip of keys that decode to exactly "__proto__" is kept. Such a pair adds
    nothing to the result, and the result's prototype chain is unchanged. Object.prototype
    is never changed. A key that only contains "__proto__" is kept as a normal key.

    @unhappy
    Scenario Outline: A __proto__ key is skipped and pollutes nothing
      When I call parseQuery(<input>)
      Then Object.keys(result) is <keys>
      And Object.hasOwn(result, "__proto__") is false
      And proto(proto(result)) is still null
      And ({}).polluted is undefined
      And Object.prototype has no own property "polluted"

      Examples:
        | input                         | keys                    |
        | "__proto__=x"                 | []                      |
        | "?__proto__=x&__proto__=y"    | []                      |
        | "%5F%5Fproto%5F%5F=x"         | []                      |
        | "__proto__"                   | []                      |
        | "__proto__[polluted]=1"       | ["__proto__[polluted]"] |
        | "a=1&__proto__=polluted&b=2"  | ["a", "b"]              |

    @happy
    Scenario: A key that only contains __proto__ is an own value
      When I call parseQuery("__proto__[polluted]=1")
      Then result deep-equals { "__proto__[polluted]": "1" } under toEqual

  Rule: Keys named like Object.prototype members are plain own values, and duplicates are merged only after the query has set them
    "constructor" is still skipped, as before. Because nothing is inherited, the duplicate check
    ("object[key] === undefined") sees a key as present only after an earlier pair in
    the same query set it. Repeated keys merge into an array in input order, as for any
    other key.

    @happy
    Scenario Outline: Built-in member names parse like any other key
      When I call parseQuery(<input>)
      Then result deep-equals <output> under toEqual
      And Object.keys(result) is <keys>

      Examples:
        | input                                | output                                | keys                 |
        | "constructor=1"                      | {}                                    | []                   |
        | "toString=a"                         | { toString: "a" }                     | ["toString"]         |
        | "toString=a&toString=b"              | { toString: ["a", "b"] }              | ["toString"]         |
        | "hasOwnProperty=1"                   | { hasOwnProperty: "1" }               | ["hasOwnProperty"]   |
        | "valueOf=1&valueOf=2&valueOf=3"      | { valueOf: ["1", "2", "3"] }          | ["valueOf"]          |
        | "constructor=a&x=1&constructor=b"    | { x: "1" }                            | ["x"]                |

  Rule: All other parsing stays as it was
    Keys keep the order they first appear in. Repeated keys merge into arrays in input
    order. A key with no "=" gets "". Keys and values are decoded with "+" read as a space.

    @happy
    Scenario Outline: Existing parsing results are unchanged
      When I call parseQuery(<input>)
      Then result deep-equals <output> under toEqual

      Examples:
        | input                              | output                                |
        | "?test=123&unicode=%E5%A5%BD"      | { test: "123", unicode: "好" }        |
        | "param=3&param="                   | { param: ["3", ""] }                  |
        | "param=&param=2&param=3"           | { param: ["", "2", "3"] }             |
        | "a=1&b=2&a=3&a=4"                  | { a: ["1", "3", "4"], b: "2" }        |
        | "a"                                | { a: "" }                             |
        | "key+with+space=spaced+value"      | { "key with space": "spaced value" }  |

  Rule: The other exports keep their behaviour and accept a parseQuery result
    stringifyQuery reads keys with Object.keys, so a null-prototype result passes
    through it like any object. Skipped "__proto__" and "constructor" pairs do not come back.

    @happy
    Scenario Outline: stringifyQuery round-trips a parseQuery result
      When I call stringifyQuery(parseQuery(<input>))
      Then the result is <output>

      Examples:
        | input                   | output                  |
        | "a=1&b=2&b=3"           | "a=1&b=2&b=3"           |
        | "__proto__=x"           | ""                      |
        | "constructor=1&a=2"     | "a=2"                   |
        | ""                      | ""                      |

    @happy
    Scenario: encodeQueryItem is unchanged
      When I call encodeQueryItem("param", ["3", ""])
      Then the result is "param=3&param="

  Rule: The declared return type stays ParsedQuery or the caller's T
    The type does not say that Object.prototype is missing. It is checked with
    expectTypeOf under "vitest --typecheck".

    @happy
    Scenario: Return types are unchanged
      Then the type of parseQuery("a=1") is exactly ParsedQuery
      And the type of parseQuery<{ foo: string }>("foo=bar") is exactly { foo: string }
```

Decided:
- The result is built with `new EmptyObject()`, a private constructor whose prototype is `Object.create(null)`, so its prototype is a shared empty object whose own prototype is null. It is not `Object.create(null)` directly.
  Ticket: "use object with null prototype"
  Instead: Call `Object.create(null)` directly, so the result has no prototype at all.
- The result does not pass `instanceof Object`. It has no `hasOwnProperty`, `toString`, `valueOf` or `constructor`, and calling them or using `String(result)` throws a TypeError.
  Ticket: silent.
  Instead: Keep a normal `{}` and guard against `__proto__` keys by skipping them or defining them as own properties.
- A key that decodes to `__proto__` (literal or percent-encoded) is still skipped: `parseQuery("__proto__=x")` is `{}` with no own `__proto__`. The existing skip and its JSDoc `@note` are kept. `"__proto__[polluted]=1"` gives `{ "__proto__[polluted]": "1" }`.
  Ticket: silent.
  Instead: Remove the skip and store `__proto__` as an ordinary own property, since the null prototype already prevents pollution.
- Keys such as `toString`, `valueOf` and `hasOwnProperty` are plain own values. A repeat is merged into an array only if the query already set that key. The existing skip of `constructor` is kept: `parseQuery("constructor=a&x=1&constructor=b")` is `{ x: "1" }`.
  Ticket: silent.
  Instead: Keep Object.prototype inheritance and use an own-property check (hasOwnProperty) when merging duplicate keys.
- Only the object created inside `parseQuery` changes. No other function is edited, and `getQuery`/`$URL.query` just pass the result through.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: Also apply null-prototype objects in other places that build query or param objects.
- The declared return type stays `ParsedQuery` (or the caller's `T`), with no type-level sign that Object.prototype is missing.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: Change the return type to reflect the null prototype, such as `Record<string, ...>` without Object methods.
- All results share one prototype object (`proto(r1) === proto(r2)`), and each call still returns a new result object.
  Ticket: silent.
  Instead: Give each result its own null prototype, or none, so no object is shared between calls.
- Leading `?`, `&` splitting, decoding, key order and the array merging of repeated keys stay as they were.
  Ticket: "The change keeps the exports' names and signatures."
  Instead: Use the change to also normalise parsing (e.g. drop empty keys, or always return arrays for repeated keys).
