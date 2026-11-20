# Identicon: a default avatar computed from an account id

Every user and organization gets a default avatar without anyone uploading one
and without storing anything. The avatar is a 5x5 grid, mirrored left to right,
plus a hue, and both come only from the account id. The function goes in a new
module, `packages/shared/src/identicon.ts`, and is re-exported from the
package entry point `packages/shared/src/index.ts`. Its output sets what every
existing account looks like, and a change cannot be migrated or rolled back.
That makes the algorithm below a frozen contract: the golden vectors pin it
exactly, and any change that alters even one cell or hue for any seed breaks
the contract. Rendering (SVG path, viewBox `-1 -1 7 7`, oklch tokens, Radix
`delayMs`), the web app's `initials()` removal and the choice of seed per row
(`userId`, the viewer's own id) all happen outside this package and are out of
scope here.

## Exports

New module `packages/shared/src/identicon.ts`, exactly as the ticket gives it:

```ts
export interface Identicon {
    readonly cells: readonly boolean[];
    readonly hue: number;
}

export function identicon(seed: string): Identicon;
```

The module exports nothing else: no hash helper, no constants. Both names are
also reachable from the package entry point: `packages/shared/src/index.ts`
adds `export * from "./identicon.js";` next to its existing re-exports of
`./build-info.js` and `./jira.js`.

All existing exports of `packages/shared` keep their current behaviour
unchanged: everything in `index.ts` (`handleSchema`, the organization, member
and invitation schemas, and their types), everything in `build-info.ts`, and
everything in `jira.ts`.

## Algorithm (normative)

1. **Bytes.** Encode `seed` as UTF-8 exactly as `new TextEncoder().encode(seed)`
   does. Do not normalize, trim or change case. A lone surrogate becomes
   U+FFFD (`EF BF BD`).
2. **Hash.** Run 32-bit FNV-1a over those bytes. Start from offset basis
   `h = 0x811c9dc5`. For each byte `b`: `h = h ^ b`, then
   `h = Math.imul(h, 0x01000193)`. Read the result as unsigned (`h >>> 0`).
   Apply no finalizer or avalanche step.
3. **Cells.** `cells` is a flat, row-major array of 25 booleans: index
   `row * 5 + column`, with row and column each in 0..4. For row 0..4 and
   column 0..2, the cell is on when bit `row * 3 + column` of `h` is 1, that
   is `((h >>> (row * 3 + column)) & 1) === 1`. This uses bits 0..14. Column 3
   copies column 1 and column 4 copies column 0, so
   `cells[row*5 + 4 - c] === cells[row*5 + c]`.
4. **Never blank.** If the previous step leaves all 25 cells off (bits 0..14
   of `h` are all 0), set the centre cell, index 12 (row 2, column 2), to on.
   Nothing changes in any other case.
5. **Hue.** `hue = (h >>> 15) % 360`. This is an integer from 0 to 359, taken
   from the 17 high bits.

Notation used below: a grid is written as five row strings, row 0 first. In
each string `#` is `true` and `.` is `false`, column 0 at the left. For
example, `#.#.#` means `[true, false, true, false, true]`. The hash column is
there to help the implementer only. It is not part of the observable contract.

```gherkin
Feature: identicon() derives a mirrored 5x5 grid and a hue from a seed

  Background:
    Given "identicon" and "Identicon" are imported from "packages/shared/src/identicon.ts"
    And a grid is written as five row strings, "#" meaning true and "." meaning false

  Rule: The result is a plain object with exactly 25 boolean cells and an integer hue in 0..359

    @happy
    Scenario: The result has exactly the two fields of Identicon
      When identicon("usr_01HZY3K7Q8") is called
      Then the result's own enumerable keys are exactly "cells" and "hue"
      And "cells" is an Array of length 25 whose every element is a boolean
      And "hue" is an integer with 0 <= hue <= 359

  Rule: Golden vectors pin the exact output for four seeds

    @happy
    Scenario Outline: A pinned seed always yields its pinned face
      When identicon(<seed>) is called
      Then the cells are, row 0 to row 4, <r0> <r1> <r2> <r3> <r4>
      And the hue is <hue>

      Examples:
        | seed             | hash (FNV-1a) | r0      | r1      | r2      | r3      | r4      | hue |
        | ""               | 0x811c9dc5    | "#.#.#" | "....." | "#####" | ".###." | "#...#" | 225 |
        | "a"              | 0xe40c292c    | "..#.." | "#.#.#" | "..#.." | "..#.." | ".#.#." | 120 |
        | "usr_01HZY3K7Q8" | 0x97ece1e4    | "..#.." | "..#.." | "#####" | "....." | ".###." | 25  |
        | "org_7f3a9c1"    | 0xbeac0fea    | ".#.#." | "#.#.#" | "#####" | "#####" | "....." | 64  |

    @happy
    Scenario: The cells array for the golden seed "" is row-major
      When identicon("") is called
      Then cells deep-equals
        | index 0-4   | true,  false, true,  false, true  |
        | index 5-9   | false, false, false, false, false |
        | index 10-14 | true,  true,  true,  true,  true  |
        | index 15-19 | false, true,  true,  true,  false |
        | index 20-24 | true,  false, false, false, true  |

  Rule: Bit row*3+column of the hash decides each cell in columns 0-2, and columns 3-4 mirror columns 1-0

    @happy
    Scenario: The low 15 bits of the hash map row by row onto columns 0-2
      # hash("") = 0x811c9dc5; bits 14..0 = 001110111000101
      When identicon("") is called
      Then row 0 columns 0,1,2 are true,false,true   (bits 0,1,2 = 1,0,1)
      And row 1 columns 0,1,2 are false,false,false  (bits 3,4,5 = 0,0,0)
      And row 2 columns 0,1,2 are true,true,true     (bits 6,7,8 = 1,1,1)
      And row 3 columns 0,1,2 are false,true,true    (bits 9,10,11 = 0,1,1)
      And row 4 columns 0,1,2 are true,false,false   (bits 12,13,14 = 1,0,0)

    @happy
    Scenario Outline: Every row is a palindrome
      When identicon(<seed>) is called
      Then for every row r in 0..4, cells[r*5+3] equals cells[r*5+1]
      And for every row r in 0..4, cells[r*5+4] equals cells[r*5+0]

      Examples:
        | seed             |
        | ""               |
        | "a"              |
        | "usr_01HZY3K7Q8" |
        | "org_7f3a9c1"    |
        | "Alice"          |
        | "😀"             |

    @boundary
    Scenario: All 15 low bits set fills every cell
      # hash("seed-53536") = 0x9d84ffff
      When identicon("seed-53536") is called
      Then all 25 cells are true
      And the hue is 9

  Rule: The hue is (hash >>> 15) mod 360, an integer from 0 to 359

    @boundary
    Scenario Outline: The hue reaches both ends of its range
      When identicon(<seed>) is called
      Then the hue is <hue>
      And the cells are, row 0 to row 4, <r0> <r1> <r2> <r3> <r4>

      Examples:
        | seed       | hash (FNV-1a) | hue | r0      | r1      | r2      | r3      | r4      |
        | "seed-72"  | 0x594c77ba    | 0   | ".#.#." | "#####" | ".###." | "##.##" | "#####" |
        | "seed-704" | 0x0d5b97e0    | 359 | "....." | "..#.." | "#####" | "##.##" | "#...#" |

  Rule: A hash that fills no cells gets the centre cell (index 12) forced on; otherwise the grid is untouched

    @boundary
    Scenario Outline: An empty grid becomes a single centre dot
      When identicon(<seed>) is called
      Then the cells are, row 0 to row 4, "....." "....." "..#.." "....." "....."
      And cells[12] is true and every other cell is false
      And the hue is <hue>

      Examples:
        | seed         | hash (FNV-1a) | hue |
        | "seed-14378" | 0xeedf8000    | 263 |
        | "seed-52655" | 0x44410000    | 26  |

    @boundary
    Scenario: A non-empty grid with the centre off keeps the centre off
      # hash(" alice") = 0x2bf7a829; bit 8 is 0
      When identicon(" alice") is called
      Then the cells are, row 0 to row 4, "#...#" "#.#.#" "....." "..#.." ".#.#."
      And cells[12] is false
      And the hue is 191

  Rule: The seed is hashed verbatim as UTF-8, with no trimming, case folding or normalization, and no seed is rejected

    @boundary
    Scenario: The empty seed is accepted and does not throw
      When identicon("") is called
      Then it does not throw
      And the hue is 225

    @boundary
    Scenario Outline: Case and surrounding whitespace change the face
      When identicon(<seed>) is called
      Then the cells are, row 0 to row 4, <r0> <r1> <r2> <r3> <r4>
      And the hue is <hue>

      Examples:
        | seed     | r0      | r1      | r2      | r3      | r4      | hue |
        | "alice"  | "#####" | "..#.." | "#####" | "#...#" | "#...#" | 68  |
        | "Alice"  | "#####" | "....." | ".###." | ".#.#." | "....." | 291 |
        | "ALICE"  | "#####" | "....." | ".#.#." | "..#.." | "#...#" | 47  |
        | " alice" | "#...#" | "#.#.#" | "....." | "..#.." | ".#.#." | 191 |
        | "alice " | "#.#.#" | "....." | "#...#" | "#...#" | ".#.#." | 138 |

    @boundary
    Scenario Outline: Non-ASCII seeds hash their UTF-8 bytes, with NFC and NFD forms kept distinct
      When identicon(<seed>) is called
      Then the cells are, row 0 to row 4, <r0> <r1> <r2> <r3> <r4>
      And the hue is <hue>

      Examples:
        | seed           | utf-8 bytes       | r0      | r1      | r2      | r3      | r4      | hue |
        | "é"       | c3 a9             | "#...#" | "....." | "##.##" | "..#.." | ".###." | 195 |
        | "é"      | 65 cc 81          | "#####" | "##.##" | "..#.." | "##.##" | "..#.." | 151 |
        | "\u{1F600}"    | f0 9f 98 80       | "....." | "#...#" | "....." | "##.##" | "#...#" | 157 |

    @unhappy
    Scenario: A lone surrogate is hashed as U+FFFD and does not throw
      When identicon("\ud83d") is called
      Then it does not throw
      And the result deep-equals identicon("�")
      And the cells are, row 0 to row 4, ".#.#." "#...#" "#...#" ".###." "#...#"
      And the hue is 239

    @boundary
    Scenario: A very long seed is accepted with no length limit
      When identicon("a" repeated 10000 times) is called
      Then it does not throw
      And the cells are, row 0 to row 4, "#.#.#" ".#.#." "..#.." "#####" ".#.#."
      And the hue is 197

  Rule: Each call is pure and returns a fresh, unfrozen object and array; no state is shared between calls

    @happy
    Scenario: Repeated calls are deep-equal but not the same objects
      When identicon("org_7f3a9c1") is called twice
      Then the two results are deep-equal
      And the two results are different objects
      And the two "cells" arrays are different arrays

    @boundary
    Scenario: The returned object and array are not frozen at runtime
      When identicon("a") is called
      Then Object.isFrozen(result) is false
      And Object.isFrozen(result.cells) is false

    @boundary
    Scenario: Mutating a returned result does not affect later calls
      Given result = identicon("a")
      When result.cells[0] is set to true and result.cells.length is set to 0
      Then identicon("a") still has cells "..#.." "#.#.#" "..#.." "..#.." ".#.#."
      And identicon("a") still has hue 120

    @concurrency
    Scenario: Interleaved calls give the same results as isolated calls
      # identicon is synchronous and keeps no cache or module state, so calls cannot overlap
      Given first = identicon("a")
      When identicon(""), identicon("seed-14378") and identicon("usr_01HZY3K7Q8") are called in that order
      And again = identicon("a") is called
      Then again deep-equals first
      And Promise.all over identicon called inside 100 microtasks alternating "a" and "" resolves
        to results where every "a" result deep-equals first and every "" result has hue 225

  Rule: The shared package entry point re-exports identicon

    @happy
    Scenario: identicon is reachable from packages/shared/src/index.ts
      When "identicon" is imported from "packages/shared/src/index.ts"
      Then it is the same function as "identicon" from "packages/shared/src/identicon.ts"
      And calling it with "a" gives hue 120

  Rule: Existing exports of packages/shared are unchanged

    @happy
    Scenario: Build-info exports behave as before
      When formatVersion is called with version "1.4.2", gitShortSha "7f3a9c1" and dirty false
      Then it returns "1.4.2+7f3a9c1"
      And the existing tests in packages/shared/test pass unmodified
```

## Decided:

- Which hash turns the seed into bits: 32-bit FNV-1a over the seed's UTF-8 bytes, with no finalizer.
  - Ticket: "a 5x5 mirrored grid and a hue, both a pure function of the account id"
  - Instead: A stronger hash such as murmur3 with fmix32, or a cryptographic digest like SHA-256.
- Which hash bits fill which cells, and in what order: the low 15 bits, bit `row*3+column` for the 3 drawn columns, row-major.
  - Ticket: silent.
  - Instead: Use the high bits, or fill column-major, or take bits in a different order.
- Which side is drawn and which side is mirrored: columns 0-2 come from the hash; column 3 copies column 1 and column 4 copies column 0.
  - Ticket: "a 5x5 mirrored grid"
  - Instead: Mirror across the vertical axis in the other direction, or mirror about a different axis.
- How the hue comes from the hash: `(hash >>> 15) % 360`, an integer from 0 to 359 taken from the 17 leftover bits.
  - Ticket: "a hue, both a pure function of the account id"
  - Instead: Take the hash modulo 360 directly, scale it as a fraction of 360 to get a non-integer hue, or use a second independent hash.
- What happens when the hash fills no cells: the centre cell (index 12) is forced on, so the avatar is never blank. No other grid is changed.
  - Ticket: silent.
  - Instead: Leave the grid empty, or rehash with a salt, or fill a different cell.
- What an empty-string seed produces: it is accepted and gives the identicon of the FNV offset basis (`0x811c9dc5`, hue 225). It does not throw.
  - Ticket: silent.
  - Instead: Throw an error, or return a fixed placeholder avatar.
- How non-ASCII or unusual seeds are encoded: UTF-8 via `TextEncoder`, hashed byte by byte, with no Unicode normalization. A lone surrogate is encoded as U+FFFD.
  - Ticket: silent.
  - Instead: Hash UTF-16 code units via charCodeAt, or normalize the string (NFC) first.
- Whether the seed is case-sensitive or trimmed: the seed is used verbatim, so case or whitespace differences give different avatars.
  - Ticket: silent.
  - Instead: Trim or lowercase the seed before hashing.
- Shape and mutability of the returned cells: each call returns a fresh plain mutable array of 25 booleans, row-major, inside a fresh object with exactly `cells` and `hue`. The type is readonly, but nothing is frozen at runtime.
  - Ticket: "readonly cells: readonly boolean[];"
  - Instead: Freeze the returned object and array, or return a flat bitmask or a nested 5x5 array.
- Whether identicon is exported from the package entry point: `index.ts` re-exports everything from `./identicon.js`.
  - Ticket: "`identicon()` lives in packages/shared"
  - Instead: Expose it only through a subpath import such as @pkg/shared/identicon.
- Maximum seed length: there is none. Any string, including a 10,000-character one, is hashed in full.
  - Ticket: silent.
  - Instead: Reject or truncate seeds above a length cap such as 256 characters.
- Runtime type checking of `seed`: there is none. The parameter is typed `string`, as with `formatVersion` and the other exports in this package. What happens with a non-string argument is outside the contract and must not be tested.
  - Ticket: silent.
  - Instead: Throw a `TypeError` when `seed` is not a string.
- What happens when calls overlap: `identicon` is synchronous and keeps no cache or module-level state, so calls cannot overlap, and results do not depend on call order or interleaving.
  - Ticket: silent.
  - Instead: Memoize results per seed in a module-level cache (which would hand out shared, mutable arrays).
- Which golden seeds pin the contract: `""`, `"a"`, `"usr_01HZY3K7Q8"` and `"org_7f3a9c1"`, with the cells and hues in the golden-vector table.
  - Ticket: "Golden vectors pin four seeds"
  - Instead: Pin real production account ids, or pin only the hash values instead of the full cells and hue.
