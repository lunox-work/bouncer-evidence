# Source context for bounties: Jira fields and repository documents

A bounty can be synced with its sources as context: its Jira issue's fields
beyond its text, and its repository's own documents (never code), read at the
newest snapshot and cut to fixed caps. Each sync that finds new content is
that source's next version, and every step that is shown the context records
the versions it used. This spec covers the new, dependency-free module
`packages/core/src/sources.ts`. It decides which repository files count as
documents and in what order they are chosen, how their text is cut, which
Jira fields a model sees and in what shape, how both are rendered into one
prompt section, and when a step is behind on a source's context. Storage,
HTTP routes, the web page and migration 0056 are out of scope. Every export
is a pure, synchronous function or a constant. None of them reads a clock,
the network or the file system, none throws on the inputs described here,
and none mutates its arguments.

## Exports of `packages/core/src/sources.ts`

The interface stands as the ticket gives it. The values the ticket left open
are filled in here:

```ts
import type { StageDrift } from "./stages.js";

export const CONTEXT_SOURCES = ["jira", "github"] as const;
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

export interface JiraIssueLinkContext {
    readonly type: string;
    readonly direction: "inward" | "outward";
    readonly key: string | null;
    readonly done: boolean;
}

export interface JiraContext {
    readonly key: string;
    readonly issueType: string | null;
    readonly status: string | null;
    readonly statusCategory: string | null;
    readonly priority: string | null;
    readonly labels: readonly string[];
    readonly components: readonly string[];
    readonly fixVersions: readonly string[];
    readonly parentKey: string | null;
    readonly dueDate: string | null;
    readonly storyPoints: number | null;
    readonly originalEstimateSeconds: number | null;
    readonly remainingEstimateSeconds: number | null;
    readonly votes: number | null;
    readonly watchers: number | null;
    readonly subtaskCount: number;
    readonly links: readonly JiraIssueLinkContext[];
    readonly updated: string | null;
}

export interface GithubContextDocument {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
    readonly truncated: boolean;
}

export interface GithubContext {
    readonly fullName: string;
    readonly branch: string;
    readonly commitSha: string;
    readonly documents: readonly GithubContextDocument[];
    readonly omitted: number;
}

export interface ContextVersions {
    readonly jira: number | null;
    readonly github: number | null;
}

export const NO_CONTEXT: ContextVersions = { jira: null, github: null };

export const CONTEXT_DOCUMENTS_MAX = 12;
export const CONTEXT_DOCUMENT_BYTES_MAX = 256 * 1024; // 262144
export const CONTEXT_DOCUMENT_CHARS = 12000;
export const CONTEXT_TOTAL_CHARS = 48000;

export function contextKeywords(title: string): string[];

export function contextDocuments(files: readonly {
    readonly path: string;
    readonly size: number;
}[], keywords: readonly string[] = []): {
    readonly paths: string[];
    readonly omitted: number;
};

export function keptDocuments(documents: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
}[]): {
    readonly documents: GithubContextDocument[];
    readonly omitted: number;
};

export function jiraContextFields(context: JiraContext): Record<string, unknown>;

export function renderSourceContext(context: {
    readonly jira: JiraContext | null;
    readonly github: GithubContext | null;
}): string;

export function contextDrift(current: ContextVersions, used: ContextVersions): {
    readonly jira: StageDrift | null;
    readonly github: StageDrift | null;
};
```

`StageDrift` is the existing type from `packages/core/src/stages.ts`
(`{ uses: number | null; current: number }`). `packages/core/src/index.ts`
adds `export * from "./sources.js";`. No new name collides with an existing
export.

These existing exports keep their behaviour: everything in `stages.ts`
(`stageDrift`, `overviewVersionOf`, `overviewApproved`), `bounty.ts`
(`bountySpecHash`, `normalizeSpecText`, `clampBountyTitle`, `BOUNTY_LIMITS`,
`BOUNTY_ORIGINS`, `BOUNTY_SPEC_HASH_VERSION`), `repo/tree.ts` (`extensionOf`,
`moduleOf`, `normalizePath`), `repo/stack.ts` (`stackManifests` and
`STACK_MANIFEST_BYTES_MAX`, whose skipped-directory list `sources.ts` reuses
without changing), `handle.ts` and `analysis.ts`, except that
`STARTER_TOOL_VERSION` becomes `"sandbox_starter@3"`.

`repo/stack.ts` gains `export function inSkippedDirectory(path: string): boolean`,
true when a directory segment of the path is one of its skipped directories.
In `stages.ts`, `BountyStages` gains an optional `context?: ContextVersions`
on `overview`, `bounty` and `sandbox`.

In `packages/core/src/sandbox/approved-task.ts`, a new exported interface
`ApprovedTaskContext` is added and `ApprovedTaskSnapshot` gains one optional
member. `APPROVED_TASK_SCHEMA_VERSION` stays `3` and `approvedTaskReadiness`
keeps its behaviour:

```ts
export interface ApprovedTaskContext {
    readonly jira: { readonly version: number; readonly content: JiraContext } | null;
    readonly github: { readonly version: number; readonly content: GithubContext } | null;
}

readonly context?: ApprovedTaskContext;
```

## Terms used below

- **File name**: the path's last `/`-separated segment. **Directory
  segments**: every segment before it.
- **Extension**: what `extensionOf(path)` from `repo/tree.ts` returns
  (lower-cased, without the dot, `"(none)"` when there is none).
- **Stem**: the file name, lower-cased, up to but not including its last
  `.`. `CODE_OF_CONDUCT.md` has the stem `code_of_conduct`.
  `CHANGELOG.old.md` has the stem `changelog.old`.
- **Depth**: the number of `/`-separated segments in the path.
  `README.md` has depth 1 and `docs/a.md` has depth 2.
- **Path order**: plain UTF-16 code-unit comparison (`a < b`), as
  `stackManifests` uses, not `localeCompare`.
- **Characters**: UTF-16 code units (`String.prototype.length`).

```gherkin
Feature: Source context for bounties
  A bounty's Jira fields and repository documents are chosen, cut, rendered
  and versioned by pure functions in packages/core/src/sources.ts.

  Rule: The module declares its sources, caps and empty versions

    @happy
    Scenario: Constants hold the decided values
      Then CONTEXT_SOURCES deep-equals ["jira", "github"] in that order
      And NO_CONTEXT deep-equals { jira: null, github: null }
      And CONTEXT_DOCUMENTS_MAX is 12
      And CONTEXT_DOCUMENT_BYTES_MAX is 262144
      And CONTEXT_DOCUMENT_CHARS is 12000
      And CONTEXT_TOTAL_CHARS is 48000

  Rule: Title keywords are lowercased ASCII words of 4 or more characters, unique, in first-seen order
    contextKeywords lowercases the title and splits it on every run of
    characters outside [a-z0-9]. Letters outside ASCII, underscores and
    hyphens are separators. It keeps pieces of length 4 or more and drops
    repeats, keeping the first one. There is no stopword list.

    @happy
    Scenario Outline: Keywords drawn from a title
      When contextKeywords is called with <title>
      Then it returns <keywords>

      Examples:
        | title                                 | keywords                       |
        | "Fix the Login flow for OAuth2 login" | ["login", "flow", "oauth2"]    |
        | "2024 roadmap"                        | ["2024", "roadmap"]            |
        | "Café-menu README_update"             | ["menu", "readme", "update"]   |
        | "Add with-from this"                  | ["with", "from", "this"]       |

    @boundary
    Scenario Outline: Titles that give no keywords
      When contextKeywords is called with <title>
      Then it returns []

      Examples:
        | title       |
        | ""          |
        | "API bug"   |
        | "  --- !! " |

  Rule: Only Markdown files count as repository documents
    A file is a candidate only if its extension is "md", "mdx" or "markdown",
    in any letter case. Plain text, reStructuredText, AsciiDoc and files
    with no extension, including a bare README, never count. Files that are
    not candidates are not counted as omitted.

    @happy
    Scenario: Markdown files of every accepted extension are candidates
      Given the files
        | path                 | size |
        | README.MD            | 10   |
        | docs/guide.mdx       | 10   |
        | docs/notes.markdown  | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["README.MD", "docs/guide.mdx", "docs/notes.markdown"]
      And omitted is 0

    @unhappy
    Scenario: Code and non-Markdown text are never documents
      Given the files
        | path           | size |
        | README         | 10   |
        | README.txt     | 10   |
        | docs/guide.rst | 10   |
        | docs/a.adoc    | 10   |
        | src/main.ts    | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is []
      And omitted is 0

  Rule: Boilerplate documents are left out by stem, anywhere in the tree
    A Markdown file whose stem is one of changelog, changes, history,
    license, licence, copying, code_of_conduct, security, notice, authors,
    contributors or codeowners is not a candidate, in whatever directory it
    sits. The stem must match exactly: hyphens are not read as underscores.
    These files are not counted as omitted.

    @unhappy
    Scenario: Boilerplate stems are dropped wherever they are
      Given the files
        | path                    | size |
        | README.md               | 10   |
        | CHANGELOG.md            | 10   |
        | LICENSE.md              | 10   |
        | Licence.markdown        | 10   |
        | CODE_OF_CONDUCT.md      | 10   |
        | docs/security.md        | 10   |
        | packages/a/HISTORY.md   | 10   |
        | CONTRIBUTORS.md         | 10   |
        | AUTHORS.md              | 10   |
        | NOTICE.md               | 10   |
        | COPYING.md              | 10   |
        | CHANGES.md              | 10   |
        | CODEOWNERS.md           | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["README.md"]
      And omitted is 0

    @boundary
    Scenario: Near-boilerplate names are kept
      Given the files
        | path                 | size |
        | code-of-conduct.md   | 10   |
        | CHANGELOG.old.md     | 10   |
        | docs/licensing.md    | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["docs/licensing.md", "CHANGELOG.old.md", "code-of-conduct.md"]

  Rule: Documents under skipped or .github directories are not read
    A file is not a candidate when any of its directory segments (not its
    file name) is exactly, with letter case as given, one of node_modules,
    bower_components, vendor, third_party, Pods, .venv, venv, dist, build,
    out, target, fixtures, __fixtures__, testdata, examples, example (the
    list repo/stack.ts skips) or .github. These files are not counted as
    omitted.

    @unhappy
    Scenario: Skipped directories hide their documents
      Given the files
        | path                                   | size |
        | node_modules/pkg/README.md             | 10   |
        | vendor/lib/guide.md                    | 10   |
        | docs/examples/intro.md                 | 10   |
        | build/notes.md                         | 10   |
        | test/fixtures/sample.md                | 10   |
        | .github/PULL_REQUEST_TEMPLATE.md       | 10   |
        | .github/ISSUE_TEMPLATE/bug.md          | 10   |
        | packages/web/.github/CONTRIBUTING.md   | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is []
      And omitted is 0

    @boundary
    Scenario: Only directory segments are checked, and case must match
      Given the files
        | path                 | size |
        | docs/examples.md     | 10   |
        | Vendor/guide.md      | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["docs/examples.md", "Vendor/guide.md"]

  Rule: Empty files and files over CONTEXT_DOCUMENT_BYTES_MAX are not candidates and not omitted
    A file whose size is 0 or less, or greater than 262144, is skipped and
    does not count in omitted. A file of exactly 262144 bytes is a candidate.

    @boundary
    Scenario Outline: Size decides whether a Markdown file is a candidate
      Given the single file "docs/a.md" of size <size>
      When contextDocuments is called with it and no keywords
      Then paths is <paths>
      And omitted is 0

      Examples:
        | size   | paths         |
        | 0      | []            |
        | -1     | []            |
        | 1      | ["docs/a.md"] |
        | 262144 | ["docs/a.md"] |
        | 262145 | []            |

  Rule: Candidates are ranked by tier, keyword boost, depth, then path
    Each candidate gets a score from its tier, checked in this order, first
    match wins:
      tier 0, score 0: root README (depth 1, stem "readme")
      tier 1, score 2: a root guide (depth 1, stem one of contributing, architecture, design, development, agents, claude, conventions, overview)
      tier 2, score 4: a docs document (a directory segment that is "docs", "doc", "documentation", "adr" or "adrs" in any case)
      tier 3, score 6: a module README (stem "readme", not root, not in a docs directory)
      tier 4, score 8: every other candidate, including any other root document
    A candidate whose lowercased path contains any keyword as a substring
    has 3 taken off its score, never going below 1, unless it is the root
    README, which stays at 0. A path that matches several keywords is
    boosted once. Keywords are matched as given and are not lowercased; an
    empty-string keyword is contained in every path. Candidates sort by
    score ascending, then depth ascending, then path order. paths lists them
    in that order, one entry per listed file, so a path listed twice appears
    twice.

    @happy
    Scenario: Tiers order documents when no keywords are given
      Given the files
        | path                     | size |
        | packages/auth/notes.md   | 10   |
        | packages/auth/README.md  | 10   |
        | docs/setup.md            | 10   |
        | docs/limit.md            | 10   |
        | CONTRIBUTING.md          | 10   |
        | README.md                | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["README.md", "CONTRIBUTING.md", "docs/limit.md", "docs/setup.md", "packages/auth/README.md", "packages/auth/notes.md"]
      And omitted is 0

    @happy
    Scenario: A keyword moves a document up about one and a half tiers
      Given the same files as the previous scenario
      When contextDocuments is called with them and keywords ["auth"]
      Then paths is ["README.md", "CONTRIBUTING.md", "packages/auth/README.md", "docs/limit.md", "docs/setup.md", "packages/auth/notes.md"]

    @boundary
    Scenario: A boosted document never passes the root README
      Given the files
        | path           | size |
        | docs/setup.md  | 10   |
        | SETUP.md       | 10   |
        | README.md      | 10   |
      When contextDocuments is called with them and keywords ["setup"]
      Then paths is ["README.md", "docs/setup.md", "SETUP.md"]

    @boundary
    Scenario: Docs directories in any case and at any depth outrank module READMEs
      Given the files
        | path                      | size |
        | src/README.md             | 10   |
        | packages/web/docs/api.md  | 10   |
        | Docs/Intro.md             | 10   |
        | docs/README.md            | 10   |
        | documentation/x.md        | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["Docs/Intro.md", "docs/README.md", "documentation/x.md", "packages/web/docs/api.md", "src/README.md"]

    @boundary
    Scenario: Ties fall to the shallower path, then path order
      Given the files
        | path               | size |
        | guides/deep/x.md   | 10   |
        | guides/y.md        | 10   |
        | readme.markdown    | 10   |
        | README.md          | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["README.md", "readme.markdown", "guides/y.md", "guides/deep/x.md"]

    @boundary
    Scenario: Root documents that are not guides rank with every other document
      Given the files
        | path               | size |
        | NOTES.md           | 10   |
        | ARCHITECTURE.md    | 10   |
        | docs/adr/0001.md   | 10   |
        | adrs/0002.md       | 10   |
        | src/README.md      | 10   |
      When contextDocuments is called with them and no keywords
      Then paths is ["ARCHITECTURE.md", "adrs/0002.md", "docs/adr/0001.md", "src/README.md", "NOTES.md"]

    @boundary
    Scenario: Uppercase keywords give no boost and an empty keyword does not reorder
      Given the files
        | path                     | size |
        | packages/auth/notes.md   | 10   |
        | docs/setup.md            | 10   |
      When contextDocuments is called with them and keywords ["", "AUTH"]
      Then paths is ["docs/setup.md", "packages/auth/notes.md"]

    @boundary
    Scenario: Input order does not change the result
      Given the files of "Tiers order documents when no keywords are given" in reverse order
      When contextDocuments is called with them and no keywords
      Then the result deep-equals the result of that scenario

    @boundary
    Scenario: A repeated entry takes a place each time it is listed
      Given the files of "Tiers order documents when no keywords are given" with "README.md" listed twice
      When contextDocuments is called with them and no keywords
      Then paths is ["README.md", "README.md", "CONTRIBUTING.md", "docs/limit.md", "docs/setup.md", "packages/auth/README.md", "packages/auth/notes.md"]
      And omitted is 0

  Rule: At most CONTEXT_DOCUMENTS_MAX paths are chosen and the rest are counted as omitted
    paths holds the first 12 ranked candidates. omitted is the number of
    candidates left after them. Files that never became candidates are not
    counted.

    @boundary
    Scenario Outline: The cap on chosen documents
      Given <count> files "docs/a01.md", "docs/a02.md", … each of size 10
      And the files "src/main.ts" of size 10 and "CHANGELOG.md" of size 10
      When contextDocuments is called with them and no keywords
      Then paths is the first <chosen> of "docs/a01.md", "docs/a02.md", … in that order
      And omitted is <omitted>

      Examples:
        | count | chosen | omitted |
        | 0     | 0      | 0       |
        | 11    | 11     | 0       |
        | 12    | 12     | 0       |
        | 13    | 12     | 1       |
        | 15    | 12     | 3       |

  Rule: Kept documents have normalized line endings, are trimmed, and are cut to the per-document and total caps
    keptDocuments takes documents in the order given and keeps that order.
    It does not cap their number. For each one it turns CRLF and lone CR into
    LF, then trims leading and trailing whitespace (String.prototype.trim).
    A document that is empty after this is dropped and counted in omitted.
    Otherwise room = CONTEXT_TOTAL_CHARS minus the characters already kept.
    If room is 0, the document is dropped and counted in omitted. If not, it
    is cut to exactly min(CONTEXT_DOCUMENT_CHARS, room) code units, even
    when that splits a surrogate pair. truncated is true exactly when the
    text was cut. path and bytes are copied as given, and bytes is not
    recomputed. The kept length, after any cut, counts against the total.
    omitted counts only documents this call dropped.

    @happy
    Scenario: Line endings are normalized and the text trimmed
      Given the document { path: "README.md", bytes: 41, text: "  Line one\r\nLine two\rLine three\n\n" }
      When keptDocuments is called with it
      Then documents is [{ path: "README.md", bytes: 41, text: "Line one\nLine two\nLine three", truncated: false }]
      And omitted is 0

    @unhappy
    Scenario: A blank document is dropped and counted
      Given the documents
        | path      | bytes | text            |
        | blank.md  | 6     | "  \r\n\t "     |
        | real.md   | 3     | "abc"           |
      When keptDocuments is called with them
      Then documents is [{ path: "real.md", bytes: 3, text: "abc", truncated: false }]
      And omitted is 1

    @boundary
    Scenario Outline: The per-document cap
      Given one document "docs/a.md" whose text is <length> "x" characters
      When keptDocuments is called with it
      Then its kept text is <kept> "x" characters
      And truncated is <truncated>

      Examples:
        | length | kept  | truncated |
        | 1      | 1     | false     |
        | 12000  | 12000 | false     |
        | 12001  | 12000 | true      |
        | 30000  | 12000 | true      |

    @boundary
    Scenario: Whitespace trimmed away does not count against the cap
      Given one document whose text is 3 spaces, then 12000 "x", then 3 spaces
      When keptDocuments is called with it
      Then its kept text is 12000 "x" characters
      And truncated is false

    @boundary
    Scenario: The total cap cuts the document that reaches it and drops the rest
      Given the documents in this order, each text made of "x"
        | path   | text length |
        | a.md   | 12000       |
        | b.md   | 12000       |
        | c.md   | 12000       |
        | d.md   | 11000       |
        | e.md   | 5000        |
        | f.md   | 1           |
      When keptDocuments is called with them
      Then documents holds a.md, b.md, c.md, d.md and e.md in that order
      And their kept lengths are 12000, 12000, 12000, 11000 and 1000
      And their truncated flags are false, false, false, false and true
      And omitted is 1

    @boundary
    Scenario: Four full documents fill the total exactly
      Given five documents of 12000 "x" characters each
      When keptDocuments is called with them
      Then the first four are kept whole with truncated false
      And the fifth is dropped
      And omitted is 1

    @boundary
    Scenario: A cut falls at the code-unit count, even inside a surrogate pair
      Given one document whose text is 11999 "x", then "😀", then "tail"
      When keptDocuments is called with it
      Then its kept text is 11999 "x" characters followed by "\uD83D", 12000 characters in all
      And truncated is true

    @boundary
    Scenario: No documents
      When keptDocuments is called with []
      Then it returns { documents: [], omitted: 0 }

  Rule: Jira fields are shown without keys, unset values or empty lists, in a fixed order
    jiraContextFields returns a new object whose own keys appear in this
    order, each only when present:
      issueType, status, priority             when not null
      labels, components, fixVersions         when non-empty, as the context's own arrays
      dueDate, storyPoints                    when not null
      originalEstimateHours                   when originalEstimateSeconds is not null
      remainingEstimateHours                  when remainingEstimateSeconds is not null
      votes, watchers                         when not null
      subtasks: subtaskCount                  when subtaskCount is not 0
      hasParent: true                         when parentKey is not null (never false)
      links                                   when non-empty: each a new { type, direction, done } in the given order
    key, statusCategory, parentKey, updated and each link's key are never
    present.
    Only null counts as unset: "" and 0 are shown as given. Hours are
    seconds / 3600 rounded half up to one decimal: Math.round(seconds / 360) / 10.

    @happy
    Scenario: A fully populated issue
      Given the JiraContext
        """
        { key: "PAY-12", issueType: "Bug", status: "In Progress",
          statusCategory: "indeterminate", priority: "High",
          labels: ["backend", "payments"], components: ["API"],
          fixVersions: ["2.4.0"], parentKey: "PAY-1", dueDate: "2026-12-01",
          storyPoints: 5, originalEstimateSeconds: 5400,
          remainingEstimateSeconds: 1800, votes: 3, watchers: 7,
          subtaskCount: 2,
          links: [{ type: "Blocks", direction: "outward", key: "PAY-13", done: false },
                  { type: "Relates", direction: "inward", key: null, done: true }],
          updated: "2026-11-18T09:30:00.000Z" }
        """
      When jiraContextFields is called with it
      Then it deep-equals
        """
        { issueType: "Bug", status: "In Progress", priority: "High",
          labels: ["backend", "payments"], components: ["API"],
          fixVersions: ["2.4.0"], dueDate: "2026-12-01",
          storyPoints: 5, originalEstimateHours: 1.5, remainingEstimateHours: 0.5,
          votes: 3, watchers: 7, subtasks: 2, hasParent: true,
          links: [{ type: "Blocks", direction: "outward", done: false },
                  { type: "Relates", direction: "inward", done: true }] }
        """
      And Object.keys of the result is ["issueType", "status", "priority", "labels", "components", "fixVersions", "dueDate", "storyPoints", "originalEstimateHours", "remainingEstimateHours", "votes", "watchers", "subtasks", "hasParent", "links"]
      And the result contains neither "PAY-12", "PAY-1", "PAY-13", "indeterminate" nor "2026-11-18T09:30:00.000Z" anywhere

    @boundary
    Scenario: An issue with nothing set gives an empty object
      Given a JiraContext with key "PAY-9", every nullable field null, every list empty and subtaskCount 0
      When jiraContextFields is called with it
      Then it deep-equals {}

    @boundary
    Scenario: Zero and empty-string values are shown, a zero subtask count is not
      Given a JiraContext with key "PAY-9", status "", storyPoints 0, originalEstimateSeconds 0, votes 0, subtaskCount 0 and every other field null or empty
      When jiraContextFields is called with it
      Then it deep-equals { status: "", storyPoints: 0, originalEstimateHours: 0, votes: 0 }

    @boundary
    Scenario Outline: Estimates are converted to hours rounded to 0.1
      Given a JiraContext whose originalEstimateSeconds is <seconds> and otherwise empty
      When jiraContextFields is called with it
      Then originalEstimateHours is <hours>

      Examples:
        | seconds | hours |
        | 3600    | 1     |
        | 5400    | 1.5   |
        | 4500    | 1.3   |
        | 180     | 0.1   |
        | 179     | 0     |
        | 36000   | 10    |

    @boundary
    Scenario: The returned label, component and version arrays are the context's own
      Given a JiraContext with labels ["ui"]
      When jiraContextFields is called with it
      Then the returned labels is the very array held in the context's labels

  Rule: Source context renders as a Jira section then a documents section, without keys, names or commits
    renderSourceContext returns the sections that apply, joined by "\n\n",
    Jira first, with no leading or trailing newline:
      Jira section, whenever jira is not null, even if its fields are {}:
        "Jira fields:\n" + JSON.stringify(jiraContextFields(jira)), compact on one line
      Documents section, only when github is not null and has at least one document:
        "Repository documents:", then for each document in order
        "\n\n--- " + path + (" (cut short)" when truncated is true) + " ---\n" + text
    Document text is rendered as stored. fullName, branch, commitSha and
    omitted are never rendered. With no section the result is "".

    @boundary
    Scenario Outline: Nothing to render
      When renderSourceContext is called with { jira: null, github: <github> }
      Then it returns ""

      Examples:
        | github                                                                          |
        | null                                                                            |
        | { fullName: "acme/pay", branch: "main", commitSha: "abc123", documents: [], omitted: 4 } |

    @boundary
    Scenario: A Jira context with no fields set still renders its section
      Given a JiraContext with key "PAY-9" and nothing else set
      When renderSourceContext is called with { jira: it, github: null }
      Then it returns "Jira fields:\n{}"

    @happy
    Scenario: Both sources render, Jira first
      Given a JiraContext with key "PAY-12", issueType "Bug", labels ["ui"], a link { type: "Blocks", direction: "outward", key: "PAY-13", done: false } and nothing else set
      And the GithubContext
        """
        { fullName: "acme/pay", branch: "main", commitSha: "abc123", omitted: 2,
          documents: [
            { path: "README.md", bytes: 5, text: "Hello", truncated: false },
            { path: "docs/a.md", bytes: 90000, text: "Part", truncated: true } ] }
        """
      When renderSourceContext is called with both
      Then it returns exactly
        """
        Jira fields:
        {"issueType":"Bug","labels":["ui"],"links":[{"type":"Blocks","direction":"outward","done":false}]}

        Repository documents:

        --- README.md ---
        Hello

        --- docs/a.md (cut short) ---
        Part
        """
      And the result contains none of "PAY-12", "PAY-13", "acme/pay", "main", "abc123"

    @happy
    Scenario: Documents alone
      Given a GithubContext with one document { path: "README.md", bytes: 5, text: "Hello", truncated: false }
      When renderSourceContext is called with { jira: null, github: it }
      Then it returns "Repository documents:\n\n--- README.md ---\nHello"

  Rule: A step is behind on a source only when the overview holds a newer version of it than the step used
    For each source independently: when current[source] is not null and
    used[source] is null or less than current[source], the result is
    { uses: used[source], current: current[source] }. Otherwise it is null.
    So a source with no overview context is never behind, and a step on a
    newer version than the overview is not behind.

    @happy
    Scenario Outline: Drift per source
      When contextDrift is called with current { jira: <current>, github: null } and used { jira: <used>, github: null }
      Then jira is <drift>
      And github is null

      Examples:
        | current | used | drift                       |
        | 3       | 3    | null                        |
        | 3       | 2    | { uses: 2, current: 3 }     |
        | 3       | null | { uses: null, current: 3 }  |
        | null    | 2    | null                        |
        | null    | null | null                        |
        | 2       | 3    | null                        |

    @happy
    Scenario: Sources are judged independently
      When contextDrift is called with current { jira: 2, github: 5 } and used { jira: 2, github: 4 }
      Then it deep-equals { jira: null, github: { uses: 4, current: 5 } }

    @boundary
    Scenario: A step made before any context was kept
      When contextDrift is called with current { jira: 1, github: null } and used NO_CONTEXT
      Then it deep-equals { jira: { uses: null, current: 1 }, github: null }

  Rule: Approved-task snapshots carry context optionally and stay at schema version 3
    ApprovedTaskSnapshot gains an optional context member of type
    ApprovedTaskContext, { jira: { version, content: JiraContext } | null;
    github: { version, content: GithubContext } | null }.
    Snapshots without it stay valid. APPROVED_TASK_SCHEMA_VERSION stays 3,
    and approvedTaskReadiness ignores context.

    @boundary
    Scenario: Context does not change readiness or the schema version
      Given a ready version-3 snapshot without context
      And the same snapshot with context { jira: null, github: null }
      When approvedTaskReadiness is called with each
      Then both return { ready: true, reasons: [] }
      And APPROVED_TASK_SCHEMA_VERSION is 3
```

Decided:

- Repository documents are only `.md`, `.mdx` and `.markdown` files, in any letter case.
  Ticket: "its repository's own documents (README, guides and docs, never code)"
  Instead: Also accept .txt, .rst and .adoc, or extensionless README files.
- Boilerplate stems (changelog, changes, history, license, licence, copying, code_of_conduct, security, notice, authors, contributors, codeowners) are dropped anywhere in the tree.
  Ticket: silent.
  Instead: Keep changelogs and security policies, or use a shorter exclusion list.
- Documents under the skipped directories of `repo/stack.ts` or under `.github` are not read.
  Ticket: silent.
  Instead: Include .github docs such as issue templates and PR templates, or include examples.
- Files of 0 bytes or over 262144 bytes are skipped and not counted as omitted. A document blank after trimming is dropped and counted.
  Ticket: "cut to fixed caps"
  Instead: Read large files and truncate them. Count the too-large files as omitted.
- Documents are ranked by tier (root README, root guides named contributing, architecture, design, development, agents, claude, conventions or overview, docs, module READMEs, rest) with a keyword boost of 3 score points (1.5 tiers), floored at 1 so the root README stays first. Ties go to depth, then path order. Other root documents rank in the last tier (`NOTES.md` after `src/README.md`).
  Ticket: silent.
  Instead: Sort alphabetically or by size, or by path depth only, with no keyword boost.
- Keywords are lowercased title words of 4 or more characters, unique, matched as substrings of the lowercased path.
  Ticket: silent.
  Instead: Use a stopword list or a 3-character minimum. Match whole path segments only.
- Text is normalized to LF, trimmed, and cut to 12000 characters or the room left of 48000, whichever is smaller. A document with no room left is dropped and counted.
  Ticket: "cut to fixed caps"
  Instead: Keep the text as written and untrimmed. Cut at a line or paragraph boundary, or split the budget evenly.
- Jira fields shown leave out unset values, empty lists, the issue key, statusCategory, the parent key and link keys. The parent is shown as hasParent, subtasks as a count, and estimates as hours rounded to 0.1.
  Ticket: "its Jira issue's fields beyond its text (type, status, priority, labels, components, releases, story points, estimates, demand and links)"
  Instead: Show every field, including null ones and the issue keys, and give estimates in raw seconds.
- The Jira key, link keys and repository name are not rendered. Documents show only their paths.
  Ticket: silent.
  Instead: Include the issue key and repository full name in the prompt text.
- A Jira section renders whenever Jira context exists, even as `{}`. No documents section renders for zero documents, and no context gives "".
  Ticket: silent.
  Instead: Skip the Jira section when no fields are set.
- A step is behind only when the overview holds a newer version of the source than the step used, or the step used none.
  Ticket: silent.
  Instead: Treat any difference in version as drift. Treat a step that used context the overview no longer holds as drift.
- Approved-task snapshots get an optional `context` (`ApprovedTaskContext`, each source's version with its content) and stay at schema version 3.
  Ticket: "a sandbox version freezes it into its approved task"
  Instead: Bump the schema to version 4 with a required context, or migrate old snapshots.
- Keyword splitting treats every character outside ASCII `[a-z0-9]` as a separator, including accented letters and underscores.
  Ticket: silent.
  Instead: Split on Unicode letter and digit classes, so `café` stays one word.
- Docs directories are any directory segment named `docs`, `doc`, `documentation`, `adr` or `adrs`, in any case. `docs/README.md` ranks as a docs document, not a module README.
  Ticket: silent.
  Instead: Only a top-level `docs/` directory counts.
- Skipped-directory names match case-sensitively and only against directory segments, not the file name.
  Ticket: silent.
  Instead: Match case-insensitively, or against every path segment.
- Boilerplate stems must match exactly (`code-of-conduct.md` and `CHANGELOG.old.md` are kept).
  Ticket: silent.
  Instead: Normalize hyphens to underscores and match on the first dot-separated part.
- Every listed entry is counted, so a repeated path takes two slots. Input order does not affect the result.
  Ticket: silent.
  Instead: Rank repeated paths once.
- A character cut falls at exactly the code-unit count, even when it splits a surrogate pair.
  Ticket: "cut to fixed caps"
  Instead: Drop a dangling high surrogate, as `clampBountyTitle` does.
- `keptDocuments` caps only characters, not the number of documents, which `contextDocuments` already caps.
  Ticket: "cut to fixed caps"
  Instead: Also drop documents past CONTEXT_DOCUMENTS_MAX in `keptDocuments`.
- Jira output keys are `issueType, status, priority, labels, components, fixVersions, dueDate, storyPoints, originalEstimateHours, remainingEstimateHours, votes, watchers, subtasks, hasParent, links`, in that order. The label, component and version arrays are the context's own, not copies.
  Ticket: "its Jira issue's fields beyond its text (type, status, priority, labels, components, releases, story points, estimates, demand and links)"
  Instead: Keep the interface's own field names, including `parentKey` and the `…Seconds` estimates.
- `updated` is never shown: it is the revision the context was read at, not a field the ticket lists.
  Ticket: "its Jira issue's fields beyond its text (type, status, priority, labels, components, releases, story points, estimates, demand and links)"
  Instead: Show `updated` when set.
- Only null counts as unset (`""` and `0` are shown), except that a subtask count of 0 is left out like an empty list.
  Ticket: silent.
  Instead: Treat empty strings as unset too, and show `subtasks: 0`.
- Hours round half up via `Math.round(seconds / 360) / 10`.
  Ticket: silent.
  Instead: Round half to even, or truncate.
- The rendered format uses `Jira fields:` with compact one-line JSON, `Repository documents:` with a `--- path ---` line per document, and ` (cut short)` inside that line for cut text. omitted, branch and commit are not rendered.
  Ticket: silent.
  Instead: Render Jira fields as a plain list, and add a line saying how many documents were left out.
