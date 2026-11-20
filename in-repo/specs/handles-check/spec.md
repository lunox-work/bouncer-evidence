# Handle rules in `packages/core`

Organizations (#24) get public handles, as users already do. Today the handle
rules live privately in `packages/db/src/emails.ts`: `setUsername` trims,
lowercases and validates a typed handle, and `toHandleBase` derives a stem
from an email address. This change adds a new, dependency-free module
`packages/core/src/handle.ts` that owns those rules, so users and
organizations, the API and the web form all share one definition. The module
holds only pure, synchronous functions over strings. It has no state, no I/O
and no clock. Because the functions are synchronous, calls cannot overlap, so
there are no `@concurrency` scenarios. `packages/db` is not changed by this
spec.

## Exports of `packages/core/src/handle.ts`

```ts
export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

export type HandleProblem = "length" | "charset";

export interface HandleRejected {
    readonly status: "invalid";
    readonly problem: HandleProblem;
    readonly reason: string;
}

export type HandleCheck = {
    readonly status: "ok";
} | HandleRejected;

export function toHandleCase(raw: string): string;
export function checkHandle(handle: string): HandleCheck;

export type NormalizedHandle = {
    readonly status: "ok";
    readonly handle: string;
    readonly display: string;
} | HandleRejected;

export function normalizeHandle(raw: string): NormalizedHandle;
export function isValidHandle(raw: string): boolean;
export function toHandleStem(text: string): string;
export function handleStemFromEmail(email: string): string;
```

The module has no other exports. Its helpers (the character pattern and a
linear-time hyphen trim) stay private. `packages/core/src/index.ts` adds
`export * from "./handle.js";`, so the package entry exposes every name above.
Everything `index.ts` already exports keeps its behaviour unchanged:
`Todo`, `TITLE_MAX_LENGTH`, `TODO_FILTERS`, `TodoFilter`, `isTodoFilter`,
`InvalidTitleError`, `normalizeTitle`, `isValidTitle`, `toggle`, `rename`,
`matchesFilter`, `filterTodos`, `TodoCounts` and `countTodos`.

Notation in the scenarios: a quoted value is a JavaScript string literal, so
`"\t"`, `"\n"`, `" "` and `"K"` are escapes. `"x" * 31` means the
string `"x"` repeated 31 times. "Length" always means `String.prototype.length`,
which counts UTF-16 code units.

The two rejection reasons are fixed strings:

| problem   | reason                                                     |
| --------- | ---------------------------------------------------------- |
| `length`  | `Must be between 3 and 30 characters.`                     |
| `charset` | `Can use letters, numbers, hyphens and underscores only.`  |

```gherkin
Feature: Handle rules
  Handles are the public names of users and organizations. They are stored
  lowercase, are 3 to 30 characters of a-z, 0-9, "-" and "_", and can be
  derived from free text or an email address.

  Background:
    Given the exports of "packages/core/src/handle.ts"

  Rule: The length bounds are the constants 3 and 30, both inclusive

    @happy
    Scenario: The constants have the ticket's values
      Then HANDLE_MIN_LENGTH is 3
      And HANDLE_MAX_LENGTH is 30

    @boundary
    Scenario: Lengths at and just past each bound
      When checkHandle is called with each handle
      Then the result is
        | handle     | result                                      |
        | "ab"       | { status: "invalid", problem: "length", ... } |
        | "abc"      | { status: "ok" }                            |
        | "x" * 30   | { status: "ok" }                            |
        | "x" * 31   | { status: "invalid", problem: "length", ... } |
        | ""         | { status: "invalid", problem: "length", ... } |

  Rule: toHandleCase trims the ends with String.prototype.trim and lowercases with toLowerCase, and changes nothing else

    @happy
    Scenario: Surrounding whitespace is removed and letters are lowercased
      When toHandleCase is called with "  FeverSoul  "
      Then it returns "feversoul"

    @boundary
    Scenario: Every kind of whitespace that trim removes is removed, and inner characters are kept
      When toHandleCase is called with each raw value
      Then it returns
        | raw               | returns       |
        | " Dana\t"    | "dana"        |
        | "\n Ada \r\n"     | "ada"         |
        | "Fever Soul"      | "fever soul"  |
        | "Rivers.Dana"     | "rivers.dana" |
        | "ÀBC"             | "àbc"         |
        | "   "             | ""            |
        | ""                | ""            |

    @boundary
    Scenario: Lowercasing is locale-independent Unicode lowercasing and may change the length
      When toHandleCase is called with "İ"
      Then it returns "i̇"
      And the result has length 2

    @boundary
    Scenario: toHandleCase is idempotent
      When toHandleCase is called with the result of toHandleCase("  ÀBc-D_9 ")
      Then it returns "àbc-d_9"

  Rule: checkHandle validates its argument exactly as given and never trims or lowercases it

    @happy
    Scenario: A lowercase handle of allowed characters is accepted
      When checkHandle is called with each handle
      Then each result deep-equals { status: "ok" }, with no other properties
        | handle      |
        | "feversoul" |
        | "a-b_c9"    |
        | "123"       |
        | "dana2"     |

    @unhappy
    Scenario: Uppercase or padded input is not normalized
      When checkHandle is called with each handle
      Then the result is
        | handle        | problem   |
        | "FeverSoul"   | charset   |
        | " abc"        | charset   |
        | "abc "        | charset   |
        | "  ab  "      | charset   |
        | " a "         | charset   |
        | " a"          | length    |

  Rule: Only a-z, 0-9, "-" and "_" are allowed, matched against /^[a-z0-9_-]+$/ with no flags

    @unhappy
    Scenario: Any other character is a charset problem
      When checkHandle is called with each handle
      Then the result deep-equals { status: "invalid", problem: "charset", reason: "Can use letters, numbers, hyphens and underscores only." }
        | handle       |
        | "has space"  |
        | "has/slash"  |
        | "has@at"     |
        | "has.dot"    |
        | "ab!"        |
        | "ééé"        |
        | "abc\n"      |
        | "a b"   |

  Rule: A hyphen or underscore may appear anywhere, including first, last and repeated

    @boundary
    Scenario: Separators at the edges or in runs are accepted
      When checkHandle is called with each handle
      Then each result is { status: "ok" }
        | handle    |
        | "---"     |
        | "___"     |
        | "-abc-"   |
        | "_abc_"   |
        | "a--b"    |
        | "-user"   |

  Rule: No handle is reserved; any handle that meets the length and charset rules is accepted

    @boundary
    Scenario: Names a route might use are still valid handles
      When checkHandle is called with each handle
      Then each result is { status: "ok" }
        | handle     |
        | "admin"    |
        | "api"      |
        | "settings" |
        | "new"      |

  Rule: Length is counted in UTF-16 code units and is checked before the charset, so only one problem is reported, and it is "length" whenever the length is out of range

    @unhappy
    Scenario: A handle that breaks both rules reports length
      When checkHandle is called with each handle
      Then the result deep-equals { status: "invalid", problem: "length", reason: "Must be between 3 and 30 characters." }
        | handle         |
        | "a!"           |
        | "x" * 30 + "!" |
        | "😀"            |
        | "  "           |

    @boundary
    Scenario: Code units, not code points, decide the length
      # "a😀" is 2 code points but 3 code units, so it passes the length check
      When checkHandle is called with "a😀"
      Then the result deep-equals { status: "invalid", problem: "charset", reason: "Can use letters, numbers, hyphens and underscores only." }

  Rule: A rejection is exactly { status, problem, reason }, and reason is the fixed English sentence for its problem

    @unhappy
    Scenario: Each problem carries its own reason and nothing else
      When checkHandle is called with each handle
      Then the result deep-equals the expected object, with no other properties
        | handle   | expected                                                                                                   |
        | "ab"     | { status: "invalid", problem: "length", reason: "Must be between 3 and 30 characters." }                    |
        | "has.dot"| { status: "invalid", problem: "charset", reason: "Can use letters, numbers, hyphens and underscores only." } |

  Rule: normalizeHandle applies toHandleCase, then checkHandle; on success handle is the lowercased form and display is the trimmed input with its original casing

    @happy
    Scenario: A typed handle is stored lowercase and keeps its casing for display
      When normalizeHandle is called with "  FeverSoul  "
      Then the result deep-equals { status: "ok", handle: "feversoul", display: "FeverSoul" }, with no other properties

    @happy
    Scenario: Several accepted inputs
      When normalizeHandle is called with each raw value
      Then the result is status "ok" with
        | raw             | handle      | display     |
        | "feversoul"     | "feversoul" | "feversoul" |
        | "\tA-b_C9\n"    | "a-b_c9"    | "A-b_C9"    |
        | "X" * 30        | "x" * 30    | "X" * 30    |
        | "  abc  "       | "abc"       | "abc"       |

    @boundary
    Scenario: Lowercasing happens before the charset check
      # U+212A KELVIN SIGN lowercases to ASCII "k"
      When normalizeHandle is called with "Kim"
      Then the result deep-equals { status: "ok", handle: "kim", display: "Kim" }

    @boundary
    Scenario: Whitespace outside the handle does not count toward the length
      When normalizeHandle is called with "  " + "x" * 30 + "  "
      Then the result has status "ok" and handle "x" * 30

    @unhappy
    Scenario: A rejection is the same object checkHandle gives for the normalized text
      When normalizeHandle is called with each raw value
      Then the result deep-equals checkHandle(toHandleCase(raw)), which is
        | raw            | expected                                                                                                   |
        | "   "          | { status: "invalid", problem: "length", reason: "Must be between 3 and 30 characters." }                    |
        | " ab "         | { status: "invalid", problem: "length", reason: "Must be between 3 and 30 characters." }                    |
        | "X" * 31       | { status: "invalid", problem: "length", reason: "Must be between 3 and 30 characters." }                    |
        | "Fever Soul"   | { status: "invalid", problem: "charset", reason: "Can use letters, numbers, hyphens and underscores only." } |
        | "İstanbul"     | { status: "invalid", problem: "charset", reason: "Can use letters, numbers, hyphens and underscores only." } |
      And the result has no handle or display property

  Rule: isValidHandle(raw) is true exactly when normalizeHandle(raw).status is "ok"

    @happy
    Scenario: Inputs normalizeHandle accepts are valid, even though checkHandle rejects some as given
      When isValidHandle is called with each raw value
      Then it returns true
        | raw             |
        | "feversoul"     |
        | "FeverSoul"     |
        | "  abc  "       |
        | "a-b_c9"        |
        | "x" * 30        |

    @unhappy
    Scenario: Inputs normalizeHandle rejects are invalid
      When isValidHandle is called with each raw value
      Then it returns false
        | raw           |
        | ""            |
        | "   "         |
        | "ab"          |
        | "x" * 31      |
        | "has.dot"     |
        | "Fever Soul"  |

  Rule: toHandleStem lowercases, replaces each run of disallowed characters with one hyphen, trims hyphens (only hyphens) from both ends, truncates to 30, and pads a result shorter than 3 with "-user"

    @happy
    Scenario: Free text becomes a stem
      When toHandleStem is called with each text
      Then it returns
        | text                     | returns            |
        | "Acme Corp"              | "acme-corp"        |
        | "rivers.dana+work"       | "rivers-dana-work" |
        | "dana"                   | "dana"             |
        | "dana😀rivers"            | "dana-rivers"      |
        | "Ünïcødé Ltd."           | "n-c-d-ltd"        |

    @boundary
    Scenario: Runs of disallowed characters collapse, existing hyphens are kept
      When toHandleStem is called with each text
      Then it returns
        | text               | returns        |
        | "a..b"             | "a-b"          |
        | "a.-b"             | "a--b"         |
        | "--dana--rivers--" | "dana--rivers" |
        | "  Acme  "         | "acme"         |
        | "_acme_"           | "_acme_"       |

    @boundary
    Scenario: A stem shorter than 3 after trimming gets the literal suffix "-user"
      When toHandleStem is called with each text
      Then it returns
        | text              | returns   |
        | "jo"              | "jo-user" |
        | "J"               | "j-user"  |
        | "__"              | "__-user" |
        | ""                | "-user"   |
        | "   "             | "-user"   |
        | "!!!"             | "-user"   |
        | "-" * 200         | "-user"   |

    @boundary
    Scenario: A very long run of hyphens is handled
      When toHandleStem is called with "-" * 100000
      Then it returns "-user"

    @boundary
    Scenario: A stem longer than 30 is cut at 30 after trimming, and the cut may leave a trailing hyphen
      When toHandleStem is called with each text
      Then it returns
        | text               | returns            |
        | "x" * 40           | "x" * 30           |
        | "x" * 30           | "x" * 30           |
        | "a" * 29 + "-b"    | "a" * 29 + "-"     |
        | "-" * 5 + "x" * 30 | "x" * 30           |

    @happy
    Scenario: Every stem passes checkHandle unchanged
      When toHandleStem is called with each text
      Then checkHandle of the result is { status: "ok" }
        | text               |
        | ""                 |
        | "Rivers.Dana"      |
        | "a" * 29 + "-b"    |
        | "x" * 60           |
        | "😀"                |

  Rule: handleStemFromEmail is toHandleStem of the text before the first "@", or of the whole string when there is no "@"

    @happy
    Scenario: The local part becomes the stem
      When handleStemFromEmail is called with each email
      Then it returns
        | email                           | returns            |
        | "dana@example.test"             | "dana"             |
        | "rivers.dana+work@example.test" | "rivers-dana-work" |
        | "Rivers.Dana@example.test"      | "rivers-dana"      |
        | " Dana.Rivers@example.test"     | "dana-rivers"      |

    @boundary
    Scenario: Short or long local parts follow the stem rules
      When handleStemFromEmail is called with each email
      Then it returns
        | email                          | returns   |
        | "jo@example.test"              | "jo-user" |
        | "x" * 60 + "@example.test"     | "x" * 30  |
        | "-" * 200 + "@example.test"    | "-user"   |

    @unhappy
    Scenario: Malformed addresses are not rejected
      When handleStemFromEmail is called with each email
      Then it returns
        | email            | returns       |
        | "@example.test"  | "-user"       |
        | "a@b@c"          | "a-user"      |
        | "no-at-sign"     | "no-at-sign"  |
        | ""               | "-user"       |

  Rule: No export throws for any string input, and results depend only on the argument

    @unhappy
    Scenario: Hostile input returns a value instead of throwing
      When each function is called with "\u0000\uD800 @@ ￿"
      Then toHandleCase returns "\u0000\uD800 @@ ￿"
      And checkHandle returns { status: "invalid", problem: "charset", reason: "Can use letters, numbers, hyphens and underscores only." }
      And normalizeHandle returns the same object as checkHandle
      And isValidHandle returns false
      And toHandleStem returns "-user"
      And handleStemFromEmail returns "-user"

    @boundary
    Scenario: Earlier calls do not affect later ones
      Given checkHandle has been called with "x" * 31
      And normalizeHandle has been called with "  FeverSoul  "
      When checkHandle is called with "abc"
      Then it returns { status: "ok" }
      And a second call normalizeHandle("  FeverSoul  ") deep-equals the first

  Rule: The package entry re-exports the handle module

    @happy
    Scenario: The handle exports are reachable from the core index
      When "packages/core/src/index.ts" is imported
      Then it exports HANDLE_MIN_LENGTH, HANDLE_MAX_LENGTH, toHandleCase, checkHandle, normalizeHandle, isValidHandle, toHandleStem and handleStemFromEmail
      And each is the same value as the export of the same name from "packages/core/src/handle.ts"
      And normalizeTitle("  buy milk  ") still returns "buy milk"
```

## Decided:

- Length is counted in UTF-16 code units on the trimmed, lowercased string, with an inclusive range of 3 to 30.
  Ticket: "export const HANDLE_MIN_LENGTH = 3;"
  Instead: Count code points or graphemes, or check length on the raw untrimmed input.
- Only lowercase a-z, digits, hyphen and underscore are allowed, tested after lowercasing.
  Ticket: silent.
  Instead: Allow dots or Unicode letters, or forbid underscores.
- A handle may start or end with a hyphen or underscore and may repeat them, so `---` and `-abc-` are valid. checkHandle tests only length and character class.
  Ticket: silent.
  Instead: Reject leading or trailing separators and repeated hyphens.
- Length is checked before the charset, so a short or long handle with bad characters reports `length`, and only one problem is ever reported.
  Ticket: "export type HandleProblem = "length" | "charset";"
  Instead: Check charset first, or report every problem.
- checkHandle does not normalize. Uppercase input fails with `charset`, and whitespace-padded input fails `charset`, or `length` when out of range, with the whitespace counted.
  Ticket: "export function checkHandle(handle: string): HandleCheck;"
  Instead: Trim and lowercase inside checkHandle before validating.
- normalizeHandle trims the input. `handle` is the lowercased form, and `display` is the trimmed text with its original casing.
  Ticket: "export function normalizeHandle(raw: string): NormalizedHandle;"
  Instead: Reject surrounding whitespace instead of trimming it, or set display equal to the lowercased handle.
- toHandleCase only trims the ends and calls `toLowerCase()`. Inner characters are left alone, and lowercasing is locale-independent Unicode lowercasing.
  Ticket: "export function toHandleCase(raw: string): string;"
  Instead: Also replace spaces with hyphens, or strip diacritics.
- Rejection reasons are fixed English sentences: `Must be between 3 and 30 characters.` and `Can use letters, numbers, hyphens and underscores only.`
  Ticket: silent.
  Instead: Return error codes only, leaving the wording to callers or i18n.
- toHandleStem lowercases, replaces each run of disallowed characters with a single hyphen, trims edge hyphens and keeps hyphens in the middle.
  Ticket: silent.
  Instead: Drop disallowed characters, or use underscores.
- A stem shorter than the minimum, including empty text, gets the literal `-user` appended, so empty text gives `-user` and `jo` gives `jo-user`.
  Ticket: silent.
  Instead: Return an empty string or a fixed default such as `user`, or throw.
- A stem longer than the maximum is truncated to 30 characters after the hyphen trim, which can leave a trailing hyphen at the cut.
  Ticket: silent.
  Instead: Trim hyphens again after truncating, or reject or throw.
- handleStemFromEmail uses the text before the first `@`. Without an `@` it uses the whole string, an empty local part becomes `-user`, and plus-tags are kept and turned into hyphens.
  Ticket: silent.
  Instead: Use the text before the last `@`, strip `+tag` suffixes, or reject malformed emails.
- isValidHandle normalizes first and is true exactly when normalizeHandle returns `ok`, so `"FeverSoul"` and `"  abc  "` are valid.
  Ticket: "export function isValidHandle(raw: string): boolean;"
  Instead: Validate the input as given, agreeing with checkHandle.
- "Trim" means `String.prototype.trim`, which also removes tabs, newlines, NBSP and other Unicode whitespace.
  Ticket: "export function toHandleCase(raw: string): string;"
  Instead: Trim only ASCII spaces.
- No handle is reserved. `admin`, `api`, `settings` and `new` are valid.
  Ticket: silent.
  Instead: Reject a reserved-name list so handles cannot shadow routes.
- A rejection is exactly `{ status, problem, reason }`, a success from checkHandle is exactly `{ status: "ok" }`, and normalizeHandle's rejection equals `checkHandle(toHandleCase(raw))`.
  Ticket: "export interface HandleRejected {"
  Instead: Include the normalized handle or the offending characters in the rejection.
- toHandleStem trims only hyphens from the ends. Edge underscores are kept, so `__` gives `__-user`.
  Ticket: silent.
  Instead: Trim underscores from the ends as well.
- No export throws for any string input. Bad input is reported through the `invalid` result or repaired into a stem.
  Ticket: silent.
  Instead: Throw an `InvalidHandleError`, as normalizeTitle throws `InvalidTitleError`.
- `packages/core/src/index.ts` re-exports everything in `handle.ts`, so the package entry exposes the handle rules.
  Ticket: "In `packages/core/src/handle.ts`:"
  Instead: Leave index.ts unchanged, so the module is reachable only by its path.
