# Native ticket rules in `packages/core/src/ticket.ts`

Tickets can now be written on the platform ("manual" origin) as well as read
from Jira. The rules every surface needs to agree on for a ticket — its
origins, field limits, default issue type, title clamping, the spec
fingerprint and its version, and the key a ticket is shown under — move into
one new module, `packages/core/src/ticket.ts`, so each has one definition.
The fingerprint is the one `packages/jira/src/spec.ts` already computes as
`pricingSpecHash`: `ticketSpecHash` computes it in core with byte-identical
output. `TICKET_SPEC_HASH_VERSION` has the same value as the private
`SPEC_HASH_VERSION = 1` in `apps/api/src/bounty/executor.ts`. This change
adds the module only: `packages/jira`, `apps/api` and
`packages/core/src/index.ts` are not edited. The module is dependency-free like the
rest of `packages/core`: hashing uses `crypto.subtle` (no `node:crypto`), and
nothing touches a clock, network, database or file system.

## Exports of `packages/core/src/ticket.ts`

```ts
export const TICKET_ORIGINS = ["manual", "jira"] as const;
export type TicketOrigin = (typeof TICKET_ORIGINS)[number];

export const TICKET_LIMITS = {
  title: 255,
  description: 20_000,
  issueType: 64,
  priority: 64,
  labels: 20,
  label: 64,
} as const;

export const DEFAULT_ISSUE_TYPE = "Task";

export function clampTicketTitle(title: string): string;

export interface TicketContent {
  readonly title: string;
  readonly description: string;
  readonly issueType: string;
  readonly priority: string | null;
  readonly labels: readonly string[];
  readonly components: readonly string[];
  readonly inputTruncated: boolean;
}

export const TICKET_SPEC_HASH_VERSION = 1;

export async function ticketSpecHash(
  title: string,
  description: string,
  issueType: string,
): Promise<string>;

export function normalizeSpecText(value: string): string;

export function ticketKey(ticket: {
  readonly number: number;
  readonly jiraKey?: string | null | undefined;
}): string;
```

- The names are imported from `packages/core/src/ticket.ts` itself;
  `packages/core/src/index.ts` does not re-export them.
- `TICKET_LIMITS` counts characters as UTF-16 code units (`String#length`);
  `labels` is the maximum number of labels and `label` the maximum length of
  one label. It has exactly these six keys; components have no limit here.
- `TicketContent` is a type only; `inputTruncated` is true when length or
  depth limits dropped part of the input the content was read from, as in
  `JiraIssueSpec.inputTruncated`. `priority` is `null` when the ticket has none.
- The functions do no runtime type checking. Behaviour for arguments that
  are not of the declared types is not specified and not tested.
- Unchanged: every existing export of `packages/core` keeps its behaviour.
  `specHash`, `pricingSpecHash`, `toIssueSpec` and `SPEC_FIELDS` in
  `packages/jira` keep their outputs; `pricingSpecHash(a, b, c)` returns
  exactly `ticketSpecHash(a, b, c)`.

```gherkin
Feature: Native ticket rules
  The rules for a ticket's origin, limits, title, spec fingerprint and key,
  defined once in packages/core/src/ticket.ts.

  Rule: The constants have fixed values

    @happy
    Scenario: Origins, default type and hash version
      When I read the constants exported by "packages/core/src/ticket.ts"
      Then TICKET_ORIGINS deep-equals ["manual", "jira"], in that order
      And DEFAULT_ISSUE_TYPE is "Task"
      And TICKET_SPEC_HASH_VERSION is 1

    @happy
    Scenario: The ticket limits
      When I read TICKET_LIMITS
      Then it deep-equals exactly these entries and no others
        | key         | value |
        | title       | 255   |
        | description | 20000 |
        | issueType   | 64    |
        | priority    | 64    |
        | labels      | 20    |
        | label       | 64    |

  Rule: clampTicketTitle returns a title of at most TICKET_LIMITS.title (255) UTF-16 code units, and drops a lone high surrogate left at the end; otherwise a title that fits is unchanged

    @happy
    Scenario Outline: Titles that fit are returned exactly as given
      When I call clampTicketTitle(<title>)
      Then the result is identical to <title>

      Examples:
        | title                             | note                               |
        | "Add CSV export"                  | ordinary title                     |
        | ""                                | empty is allowed, not rejected     |
        | "  Add CSV export  "              | no trimming                        |
        | "Add   CSV\texport"               | no inner whitespace collapsing     |
        | "a" repeated 255 times            | exactly at the limit               |
        | "a" repeated 253 times + "😀"     | complete pair at the limit kept    |

    @boundary
    Scenario Outline: A trailing lone high surrogate is dropped even when the title fits
      When I call clampTicketTitle(<title>)
      Then the result is <result>

      Examples:
        | title                             | result                 |
        | "a" repeated 254 times + "\uD83D" | "a" repeated 254 times |
        | "ab\uD83D"                        | "ab"                   |
        | "\uD83D"                          | ""                     |

    @boundary
    Scenario Outline: Titles over the limit are cut to the first 255 code units
      When I call clampTicketTitle(<title>)
      Then the result is <result>
      And the result's length is <length>

      Examples:
        | title                                     | result                              | length |
        | "a" repeated 256 times                    | "a" repeated 255 times              | 255    |
        | "a" repeated 300 times                    | "a" repeated 255 times              | 255    |
        | 10 spaces + "a" repeated 300 times        | 10 spaces + "a" repeated 245 times  | 255    |
        | "a" repeated 254 times + "  b"            | "a" repeated 254 times + " "        | 255    |
        | "a" repeated 253 times + "😀" + "b"       | "a" repeated 253 times + "😀"       | 255    |

    @boundary
    Scenario: A cut that would split a surrogate pair drops the lone high surrogate
      Given a title of "a" repeated 254 times followed by "😀" (length 256 code units)
      When I call clampTicketTitle with it
      Then the result is "a" repeated 254 times
      And the result's length is 254
      And no ellipsis or other text is appended

  Rule: normalizeSpecText unifies line endings, trims each line's end and trims the whole text, and changes nothing else

    @happy
    Scenario Outline: Normalizing spec text
      When I call normalizeSpecText(<input>)
      Then the result is <output>

      Examples:
        | input                         | output             | note                                      |
        | "Adds CSV."                   | "Adds CSV."        | already normal                            |
        | "a\r\nb"                      | "a\nb"             | CRLF becomes LF                           |
        | "a\rb"                        | "a\nb"             | lone CR becomes LF                        |
        | "a  \nb\t"                    | "a\nb"             | trailing spaces and tabs per line removed |
        | "  a  \r\n  b\t\r\r\nc  "     | "a\n  b\n\nc"      | leading indent kept after the first line  |
        | "\n\n  Title\n\n"             | "Title"            | whole text trimmed at both ends           |
        | "a\n\n\nb"                    | "a\n\n\nb"         | inner blank lines kept                    |
        | "a    b"                      | "a    b"           | inner spaces not collapsed                |
        | "Café" with "é"         | unchanged          | no Unicode normalization                  |
        | "Title"                       | "Title"            | case kept                                 |

    @boundary
    Scenario Outline: Empty and blank text normalize to the empty string
      When I call normalizeSpecText(<input>)
      Then the result is ""

      Examples:
        | input        |
        | ""           |
        | "   "        |
        | "\r\n\t\n "  |

    @boundary
    Scenario: Normalizing is idempotent
      Given the text "  a  \r\n  b\t\r\r\nc  "
      When I call normalizeSpecText on the result of normalizeSpecText of it
      Then the result is "a\n  b\n\nc"

  Rule: ticketSpecHash is the SHA-256 of JSON.stringify([normalizeSpecText(title), normalizeSpecText(description), normalizeSpecText(issueType)]), UTF-8 encoded, as 64 lowercase hex characters

    @happy
    Scenario Outline: Known fingerprints
      When I await ticketSpecHash(<title>, <description>, <issueType>)
      Then the result is <hash>

      Examples:
        | title        | description     | issueType | hash                                                             |
        | "Title"      | "Description"   | "Story"   | 412c518dd58be9028f3217a5290f893d8af0077953903a8ccaf6f2fb79f853ea |
        | "Title"      | "Description"   | "Bug"     | 7eb97fbde6a96dc9fc204b244410d928f6403c3ffd663240b97f1fb63efda9d7 |
        | "Add export" | "Adds CSV."     | "Story"   | 3b83fc961d8b052c4ebb2269255f29a3e901b27eb21f7452ea5f9ac5c5d77444 |
        | "A"          | "B"             | "Task"    | 94df515b9e448e7e65fc04e923fd2407d34b2b4b0176f7b9dd5695d858c83cd1 |
        | "AB"         | ""              | "Task"    | 478479f083fafe1c06010d88cf8b7eef432a9f2636bee89865269585ae1244ee |

    @happy
    Scenario: Whitespace and line-ending noise does not change the fingerprint
      When I await ticketSpecHash("Title  ", "Description\r\n", "Story")
      Then the result is "412c518dd58be9028f3217a5290f893d8af0077953903a8ccaf6f2fb79f853ea"
      And it equals ticketSpecHash("Title", "Description", "Story")

    @happy
    Scenario: The fingerprint is case-sensitive in every field
      When I await ticketSpecHash("Title", "Description", "story")
      Then the result is "bb94137540cd9b69a86b24148004fd4c6568d336f7fb439cb04bce579c8c036d"
      And it differs from ticketSpecHash("Title", "Description", "Story")
      And ticketSpecHash("title", "Description", "Story") differs from ticketSpecHash("Title", "Description", "Story")
      And ticketSpecHash("Title", "description", "Story") differs from ticketSpecHash("Title", "Description", "Story")

    @boundary
    Scenario: Moving text between fields changes the fingerprint
      When I await ticketSpecHash("A", "B", "Task") and ticketSpecHash("AB", "", "Task")
      Then the two results differ
      And ticketSpecHash("A\",\"B", "", "Task") differs from ticketSpecHash("A", "B", "Task")

    @boundary
    Scenario: Empty fields are hashed as they are
      When I await ticketSpecHash("", "", "")
      Then the result is "799c55d702efedb7750db18b36386fc3a3f4be7dddcfb649adeb41a3ed0da228"
      And the promise does not reject
      And the result differs from ticketSpecHash("", "", "Task")

    @boundary
    Scenario: The output is always 64 lowercase hex characters
      When I await ticketSpecHash("Ünïcødé 😀", "line\nline", DEFAULT_ISSUE_TYPE)
      Then the result matches /^[0-9a-f]{64}$/

    @happy
    Scenario: Only title, description and issue type feed the fingerprint
      Given two TicketContent values that share title "Title", description "Description" and issueType "Story"
      And differ in priority ("High" vs null), labels (["a"] vs []), components (["api"] vs []) and inputTruncated (true vs false)
      When I await ticketSpecHash(content.title, content.description, content.issueType) for each
      Then both results are "412c518dd58be9028f3217a5290f893d8af0077953903a8ccaf6f2fb79f853ea"

    @concurrency
    Scenario: Overlapping calls resolve independently
      When I start ticketSpecHash("Title", "Description", "Story"), ticketSpecHash("Title", "Description", "Bug") and ticketSpecHash("Title", "Description", "Story") without awaiting between them
      And I await all three with Promise.all
      Then the results are, in call order:
        | hash                                                             |
        | 412c518dd58be9028f3217a5290f893d8af0077953903a8ccaf6f2fb79f853ea |
        | 7eb97fbde6a96dc9fc204b244410d928f6403c3ffd663240b97f1fb63efda9d7 |
        | 412c518dd58be9028f3217a5290f893d8af0077953903a8ccaf6f2fb79f853ea |

  Rule: ticketKey returns jiraKey unless it is null or undefined, and otherwise "T-" followed by the number in decimal

    @happy
    Scenario Outline: Keys for native and Jira tickets
      When I call ticketKey(<ticket>)
      Then the result is <key>

      Examples:
        | ticket                                 | key       |
        | { number: 12 }                         | "T-12"    |
        | { number: 12, jiraKey: undefined }     | "T-12"    |
        | { number: 12, jiraKey: null }          | "T-12"    |
        | { number: 12, jiraKey: "PROJ-7" }      | "PROJ-7"  |
        | { number: 1 }                          | "T-1"     |
        | { number: 1000 }                       | "T-1000"  |

    @boundary
    Scenario Outline: An empty or blank jiraKey is still the key
      When I call ticketKey(<ticket>)
      Then the result is <key>

      Examples:
        | ticket                            | key   |
        | { number: 12, jiraKey: "" }       | ""    |
        | { number: 12, jiraKey: "  " }     | "  "  |

    @boundary
    Scenario Outline: The number is formatted without padding or validation
      When I call ticketKey(<ticket>)
      Then the result is <key>
      And no error is thrown

      Examples:
        | ticket          | key      |
        | { number: 0 }   | "T-0"    |
        | { number: 7 }   | "T-7"    |
        | { number: -3 }  | "T--3"   |
        | { number: 2.5 } | "T-2.5"  |
```

Decided:

- `ticketKey` returns an empty-string `jiraKey` as the key, because it checks only for null and undefined. It does not fall back to the T-number.
  - Ticket: silent.
  - Instead: Treat an empty or blank `jiraKey` as missing and fall back to `T-<number>`.
- The native ticket key is `T-` followed by the number in decimal.
  - Ticket: silent.
  - Instead: Use a different prefix or padded numbers, such as `TKT-0012` or `#12`.
- Before hashing, text is normalized like this: CRLF, CR and LF all become LF, trailing whitespace is trimmed from each line, and the whole string is trimmed at both ends. Leading whitespace on each line is kept.
  - Ticket: silent.
  - Instead: Only convert line endings, or also collapse inner whitespace, or apply Unicode NFC normalization.
- The hash is case-sensitive in title, description and issueType. Text is hashed as written.
  - Ticket: silent.
  - Instead: Lowercase the issue type (or all fields) before hashing.
- Only title, description and issueType feed the hash, as a JSON array of the three normalized strings. Priority, labels and components are left out.
  - Ticket: "pricingSpecHash is ticketSpecHash itself"
  - Instead: Include priority, labels and components in the hash, or join the fields with a delimiter instead of JSON.
- The hash is the SHA-256 digest as 64 lowercase hex characters.
  - Ticket: silent.
  - Instead: Return base64 or base64url, or a truncated digest.
- The ticket limits are: title 255, description 20,000, issueType 64, priority 64, labels 20 and label 64. Components have no limit.
  - Ticket: "export const TICKET_LIMITS = …;"
  - Instead: Use other bounds, such as a 10,000-character description or 10 labels. Limits could also be left off some fields.
- A title over the limit is cut to 255 UTF-16 code units. If the cut leaves a lone high surrogate at the end, it is dropped. No ellipsis is added and whitespace is not trimmed.
  - Ticket: silent.
  - Instead: Cut by code points or graphemes, trim whitespace after the cut, or add an ellipsis.
- The title limit counts UTF-16 code units (`String#length` / `slice`), so an emoji counts as 2.
  - Ticket: silent.
  - Instead: Count Unicode code points, so an emoji counts as 1.
- `clampTicketTitle` keeps leading and trailing whitespace as given. A title of 255 code units or fewer is returned unchanged, unless it ends in a lone high surrogate: that is dropped at any length, so `"ab\uD83D"` becomes `"ab"` and `"\uD83D"` becomes `""`.
  - Ticket: silent.
  - Instead: Trim the title first, and perhaps collapse inner whitespace, or return a title that fits unchanged even when it ends in a lone surrogate.
- Empty title, description or issueType values are hashed as they are. Nothing throws, and `DEFAULT_ISSUE_TYPE` is not substituted for an empty issueType.
  - Ticket: silent.
  - Instead: Throw on empty input, or use `DEFAULT_ISSUE_TYPE` when the issue type is empty.
- The origins are `manual` and `jira`, as a readonly tuple in that order. `TICKET_SPEC_HASH_VERSION` is fixed at 1.
  - Ticket: "export const TICKET_ORIGINS = ["manual", "jira"] as const;"
  - Instead: Add other origin values, or name the native origin something else, such as `native`.
- The `TICKET_LIMITS` keys are `title`, `description`, `issueType`, `priority`, `labels` (a count) and `label` (the length of one label). Lengths are counted in UTF-16 code units.
  - Ticket: "export const TICKET_LIMITS = …;"
  - Instead: Use `…Max` / `…Chars` key names (for example `titleChars`, `labelsMax`), as `FIXTURE_LIMITS` does.
- `ticketKey` does not check the number: 0, negative and non-integer numbers are formatted with `String(number)` and nothing throws.
  - Ticket: silent.
  - Instead: Throw a `RangeError` unless the number is a positive integer.
- The functions do no runtime type checks, and nothing is specified for arguments that are not of the declared types.
  - Ticket: silent.
  - Instead: Throw a `TypeError` for non-string text or a non-number `number`.
- The module is exported only by its own path, `packages/core/src/ticket.ts`. `index.ts` is unchanged and does not re-export it.
  - Ticket: silent.
  - Instead: Add `export * from "./ticket.js";` to `packages/core/src/index.ts`, so the names can be imported from the package root.
- Overlapping `ticketSpecHash` calls share no state, and each resolves to its own input's hash.
  - Ticket: silent.
  - Instead: Cache digests by input, or serialize calls through one queue.
