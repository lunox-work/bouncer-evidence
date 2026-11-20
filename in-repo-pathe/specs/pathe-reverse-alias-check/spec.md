# Reverse alias resolution: `reverseResolveAlias`

`src/utils.ts` (published as `pathe/utils`) already has `resolveAlias(path, aliases)`,
which turns an aliased path such as `@/foo` into a real path such as `/root/foo`.
This change adds the reverse. `reverseResolveAlias(path, aliases)` takes a real
path and returns every aliased form of it that the alias map allows, most
specific first. It uses the same normalisation and segment-boundary rules as
`resolveAlias`. The function is synchronous and pure. It touches no file
system, clock or global state.

## Interface

New export in `src/utils.ts`:

```ts
export function reverseResolveAlias(
  path: string,
  aliases: Record<string, string>,
): string[];
```

- `path`: the real path to turn back into alias form. It may use `\` or `/` separators.
- `aliases`: the same alias map `resolveAlias` takes. Keys are aliases (for example `"@"`) and values are their targets (for example `"/root"`).
- Returns a new array of aliased paths. It may be empty.

No other export is added. Helpers stay private (`hasTrailingSlash`,
`_compareAliases`, `normalizedAliasSymbol`, `pathSeparators`). The existing
exports `normalizeAliases`, `resolveAlias` and `filename` keep their behaviour
unchanged. `src/index.ts` does not re-export the new function.

## Definitions used below

- **normalised path**: `path` after the same Windows normalisation that `resolveAlias` uses. Every `\` becomes `/`, and a leading drive letter followed by `/` is upper-cased (`c:\src` becomes `C:/src`).
- **normalised aliases**: the result of `normalizeAliases(aliases)`. Entries are ordered with keys that have more `/`-separated segments first, and insertion order is kept among equal counts. Alias values are resolved against each other: with `{"@": "/root", "bingpot": "@/bingpot/index.ts"}`, the value of `bingpot` becomes `/root/bingpot/index.ts`.
- **target**: the value of a normalised alias entry. **trimmed target**: the target with one trailing `/` or `\` removed, if it has one.
- An entry **matches** when both of these hold:
  1. the normalised path starts with the full target, compared case-sensitively, character by character; and
  2. the character of the normalised path at index `trimmed target.length` is `/` or `\`, or that index is at or past the end of the path.
- The **remainder** is the normalised path with its first `target.length` characters removed. The full target length is used, including any trailing slash.
- The **result** of a matching entry is `join(key, remainder)`, using pathe's `join` from `src/path.ts`.

```gherkin
Feature: reverseResolveAlias turns a real path back into its aliased forms

  Rule: A path below an alias target yields the alias key joined with the rest of the path

    @happy
    Scenario: Single alias, path below its target
      Given the aliases {"@": "/root"}
      When reverseResolveAlias("/root/foo", aliases) is called
      Then the result is ["@/foo"]

    @happy
    Scenario: Reverse of resolveAlias for a simple alias
      Given the aliases {"@": "/root"}
      And resolveAlias("@/foo", aliases) returns "/root/foo"
      When reverseResolveAlias("/root/foo", aliases) is called
      Then the result contains "@/foo"

    @happy
    Scenario Outline: Alias keys that end in a slash
      Given the aliases <aliases>
      When reverseResolveAlias(<path>, aliases) is called
      Then the result is <result>

      Examples:
        | aliases            | path       | result     |
        | {"~/": "/src"}     | "/src/foo" | ["~/foo"]  |
        | {"~": "/"}         | "/root/a"  | ["~/root/a"] |

  Rule: An exact match on a target counts and yields the alias key on its own

    @boundary
    Scenario Outline: Path equal to a target, with or without a trailing slash
      Given the aliases {"@": "/root"}
      When reverseResolveAlias(<path>, aliases) is called
      Then the result is <result>

      Examples:
        | path     | result  |
        | "/root"  | ["@"]   |
        | "/root/" | ["@/"]  |

  Rule: The target must end at a path-segment boundary; a plain string prefix is not enough

    @unhappy
    Scenario: Target is only a string prefix of a path segment
      Given the aliases {"@": "/root"}
      When reverseResolveAlias("/rootfoo/a", aliases) is called
      Then the result is []

  Rule: Every matching alias is returned, sorted by result length, longest first

    @happy
    Scenario: Two aliases match and the longer result comes first, even from the less specific alias
      Given the aliases {"@": "/root", "@src": "/root/src"}
      When reverseResolveAlias("/root/src/a.ts", aliases) is called
      Then the result is ["@/src/a.ts", "@src/a.ts"]

    @happy
    Scenario: Exact match and prefix match together
      Given the aliases {"@": "/root", "#": "/root/a"}
      When reverseResolveAlias("/root/a", aliases) is called
      Then the result is ["@/a", "#"]

    @happy
    Scenario: Alias values are resolved against each other before matching
      Given the aliases {"@": "/root", "bingpot": "@/bingpot/index.ts"}
      When reverseResolveAlias("/root/bingpot/index.ts", aliases) is called
      Then the result is ["@/bingpot/index.ts", "bingpot"]

    @boundary
    Scenario Outline: Results of equal length keep the order of the normalised aliases
      Given the aliases <aliases>
      When reverseResolveAlias("/x/f", aliases) is called
      Then the result is <result>

      Examples:
        | aliases                    | result               |
        | {"@a": "/x", "@b": "/x"}   | ["@a/f", "@b/f"]     |
        | {"@b": "/x", "@a": "/x"}   | ["@b/f", "@a/f"]     |
        | {"abc": "/x", "a/b": "/x"} | ["a/b/f", "abc/f"]   |

    @boundary
    Scenario: Identical results from different aliases are both kept
      Given the aliases {"~": "/src", "~/": "/src"}
      When reverseResolveAlias("/src/a", aliases) is called
      Then the result is ["~/a", "~/a"]

  Rule: When nothing matches the result is an empty array, never the input path and never an error

    @unhappy
    Scenario Outline: No alias matches
      Given the aliases <aliases>
      When reverseResolveAlias(<path>, aliases) is called
      Then the result is []
      And no error is thrown

      Examples:
        | aliases          | path        |
        | {"@": "/root"}   | "/other/a"  |
        | {}               | "/root/a"   |
        | {"@": "/root"}   | ""          |

  Rule: The input path is Windows-normalised; alias values are not backslash-converted

    @happy
    Scenario Outline: Backslash and lower-case drive-letter input paths match forward-slash targets
      Given the aliases <aliases>
      When reverseResolveAlias(<path>, aliases) is called
      Then the result is <result>

      Examples:
        | aliases            | path            | result        |
        | {"~win": "C:/src"} | "C:\\src\\a.ts" | ["~win/a.ts"] |
        | {"~win": "C:/src"} | "c:\\src\\a.ts" | ["~win/a.ts"] |
        | {"@": "/root"}     | "/root\\a"      | ["@/a"]       |

    @unhappy
    Scenario: A target written with backslashes does not match
      Given the aliases {"~win": "C:\\src"}
      When reverseResolveAlias("C:/src/a.ts", aliases) is called
      Then the result is []

  Rule: Results are built with pathe's join, so they come out normalised

    @boundary
    Scenario Outline: Duplicate slashes and dot segments collapse; a trailing slash is kept
      Given the aliases {"@": "/root"}
      When reverseResolveAlias(<path>, aliases) is called
      Then the result is <result>

      Examples:
        | path               | result      |
        | "/root//a"         | ["@/a"]     |
        | "/root/a/./b/../c" | ["@/a/c"]   |
        | "/root/dir/"       | ["@/dir/"]  |

  Rule: A target with a trailing slash is trimmed only for the boundary check; the remainder starts after the full target

    @boundary
    Scenario Outline: Target "/src/"
      Given the aliases {"@x": "/src/"}
      When reverseResolveAlias(<path>, aliases) is called
      Then the result is <result>

      Examples:
        | path       | result     |
        | "/src/foo" | ["@x/foo"] |
        | "/src/"    | ["@x"]     |
        | "/src"     | []         |
        | "/srcx/a"  | []         |

  Rule: Matching is case-sensitive

    @unhappy
    Scenario: Different letter case does not match
      Given the aliases {"@": "/root"}
      When reverseResolveAlias("/Root/a", aliases) is called
      Then the result is []

  Rule: The aliases argument is not modified

    @boundary
    Scenario: Aliases object is unchanged after the call
      Given the aliases {"@b": "/x", "@a": "/x"}
      When reverseResolveAlias("/x/y", aliases) is called
      Then aliases still deep-equals {"@b": "/x", "@a": "/x"}
      And Object.keys(aliases) is still ["@b", "@a"]
```

## Decided:

- A path exactly equal to a target matches and yields `join(key, "")`, e.g. `"/root"` with `{"@": "/root"}` gives `["@"]`.
  - Ticket: silent.
  - Instead: require a real `/` after the target so exact matches are excluded, or special-case equality and return the key as is.
- The target must end at a segment boundary: the next character must be `/` or `\`, or the path must end there. `/root` does not match `/rootfoo/a`.
  - Ticket: silent.
  - Instead: use a plain `startsWith` prefix match and let `/a` match `/ab/c`.
- Results are sorted by the length of the result string, longest first, not by the length of the matched target. Ties keep the order of the normalised aliases: more `/` segments in the key first, then insertion order.
  - Ticket: silent.
  - Instead: sort by the length of the matched alias value, or keep the insertion order of the aliases object.
- When no alias matches, the result is `[]`.
  - Ticket: silent.
  - Instead: return `[path]` (the original path), or throw.
- Every matching alias contributes a result. All of them are returned in one array.
  - Ticket: silent.
  - Instead: return only the single most specific match.
- The input path is normalised with `normalizeWindowsPath`. The alias map is normalised with `normalizeAliases`, which orders the entries and resolves their values against each other, before comparing.
  - Ticket: silent.
  - Instead: compare the raw strings with no normalisation.
- Backslashes in alias values are not converted, so `{"~win": "C:\\src"}` never matches. This is the same as `resolveAlias`, which does not convert alias keys either.
  - Ticket: silent.
  - Instead: also run each alias value through `normalizeWindowsPath` before comparing.
- The remainder is combined with the key using `join(key, remainder)`, so results are normalised: duplicate slashes collapse, `.` and `..` resolve, and a trailing slash is kept.
  - Ticket: silent.
  - Instead: concatenate the key and the remainder as plain strings, keeping the original form.
- A trailing slash on a target is stripped only for the boundary check. The remainder is sliced after the full target, slash included, so `"/src"` does not match `{"@x": "/src/"}` and `"/src/"` gives `["@x"]`.
  - Ticket: silent.
  - Instead: treat the target with and without a trailing slash the same, or reject such aliases.
- Matching is case-sensitive, using `startsWith`.
  - Ticket: silent.
  - Instead: compare case-insensitively, as Windows paths often are.
- If two aliases produce the same string, both copies are kept. Results are not de-duplicated.
  - Ticket: silent.
  - Instead: de-duplicate the result array.
- The `aliases` argument is not mutated. Normalisation works on a copy, and the keys keep their order.
  - Ticket: silent.
  - Instead: normalise the caller's object in place, as some alias helpers do.
