# Read a Jira ticket's spec and fingerprint it

Ticket #27 adds `packages/jira/src/spec.ts`. It turns the `fields` of one Jira
issue (summary, description, issue type, updated) into a `JiraIssueSpec`. The
spec carries the description as plain text, flattened from Atlassian Document
Format (ADF) or taken from a plain string, plus a `specHash` that fingerprints
the summary and description. The platform stores only the hash. A later re-read
whose hash differs means the ticket changed after it was priced. Like
`mapping.ts`, the module is defensive: input of a missing or wrong type becomes
a default and never makes the call throw. Every behaviour below can be checked
by calling `toIssueSpec`, `specHash` and `SPEC_FIELDS` directly, with no
network, clock or file system.

Notation used in the scenarios: table cells marked *(JSON)* are JSON literals,
so `"a\tb"` is the three characters `a`, TAB, `b`, and `"\n"` is a line feed.
`"x" × 20000` means the string made of 20,000 `x` characters. In the depth
rule, the description document (the root) is at depth 0 and every node in a
`content` array is one deeper than the node that holds it.

```gherkin
Feature: Read a Jira issue's spec and fingerprint it
  toIssueSpec(key, fields) builds a JiraIssueSpec from a raw issue's fields.
  specHash(summary, descriptionText) gives a stable SHA-256 fingerprint of the pair.
  SPEC_FIELDS lists the Jira fields a spec read requests.

  Rule: SPEC_FIELDS lists exactly the four fields a spec needs, in a fixed order

    @happy
    Scenario: SPEC_FIELDS is summary, description, issuetype, updated
      When SPEC_FIELDS is read
      Then it equals ["summary", "description", "issuetype", "updated"]

    @happy
    Scenario: ISSUE_FIELDS keeps its behaviour and still omits the description
      When ISSUE_FIELDS from mapping.ts is read
      Then it equals ["summary", "status", "assignee", "priority", "issuetype", "labels", "created", "updated", "duedate", "parent", "project"]
      And it does not contain "description"

  Rule: specHash is the lowercase hex SHA-256 of the normalised summary, a U+0000 character, and the normalised description, encoded as UTF-8

    @happy
    Scenario Outline: Known inputs give known digests
      When specHash(<summary>, <descriptionText>) is awaited
      Then it resolves to "<digest>"

      Examples:
        | summary (JSON) | descriptionText (JSON)  | digest                                                           |
        | "Fix login"    | "Users can sign in."    | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "Fix login"    | "Users can sign in!"    | 9ba38dc958e4a1832554dbc2936804134d46ac0f5f293418ae0d9254bf45dc5b |
        | "Fix login"    | "Users can\nsign in."   | 1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb |
        | "Fix login"    | ""                      | 84047eac0cb2f4449e8697ff60678c27258b6e6bd061b6ecde086731d22676be |
        | ""             | "Fix login"             | 426a102db604005a62f8debd08c8f7e0acce47499320d961ced3d317e0a40880 |
        | ""             | ""                      | 6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d |

    @boundary
    Scenario: The digest is always 64 lowercase hex characters
      When specHash("Fix login", "Users can sign in.") is awaited
      Then the result matches /^[0-9a-f]{64}$/

    @boundary
    Scenario: The separator keeps text from moving between summary and description
      When specHash("Fix login", "") and specHash("", "Fix login") are awaited
      Then the two results differ

    @happy
    Scenario: The same input gives the same digest on every call
      When specHash("Fix login", "Users can sign in.") is awaited twice
      Then both results are "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"

  Rule: Before hashing, each part has its line endings unified to "\n", trailing whitespace removed from every line, and whitespace trimmed from both ends; nothing else is normalised

    @boundary
    Scenario Outline: Changes to line endings and outer whitespace leave the hash unchanged
      When specHash(<summary>, <descriptionText>) is awaited
      Then it resolves to "<digest>"

      Examples:
        | summary (JSON)    | descriptionText (JSON)              | digest                                                           |
        | "Fix login   "    | "Users can sign in."                | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "  Fix login"     | "Users can sign in."                | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "Fix login"       | "\n\nUsers can sign in.\r\n\r\n"    | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "Fix login"       | "Users can sign in.\t "             | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "Fix login"       | "Users can\r\nsign in."             | 1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb |
        | "Fix login"       | "Users can\rsign in."               | 1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb |
        | "Fix login"       | "Users can  \t\nsign in."           | 1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb |

    @unhappy
    Scenario Outline: Changes to the words, internal spacing or indentation change the hash
      When specHash(<summary>, <descriptionText>) is awaited
      Then the result is not "<unchanged digest>"

      Examples:
        | summary (JSON) | descriptionText (JSON)   | unchanged digest                                                 |
        | "Fix  login"   | "Users can sign in."     | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "fix login"    | "Users can sign in."     | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "Fix login"    | "Users  can sign in."    | a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34 |
        | "Fix login"    | "Users can\n  sign in."  | 1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb |
        | "Fix login"    | "Users can\n\nsign in."  | 1775f846f59d73728027dc86487e3c6f7cc9cc9ed2336983be0157fc360ba7cb |

    @boundary
    Scenario: Unicode is not normalised before hashing
      When specHash("café", "") with "é" as U+00E9 and specHash("café", "") with "e" followed by U+0301 are awaited
      Then the two results differ

  Rule: toIssueSpec copies the key, and reads summary, issue type and updated with a default when the value is missing or not a string

    @happy
    Scenario: A complete payload maps field by field
      When toIssueSpec is awaited with key "PROJ-1" and fields:
        """
        {
          "summary": "Fix login",
          "description": {"type": "doc", "version": 1, "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Users can sign in."}]}
          ]},
          "issuetype": {"name": "Bug"},
          "updated": "2026-11-01T10:00:00.000+0000"
        }
        """
      Then the result deep-equals:
        """
        {
          "key": "PROJ-1",
          "summary": "Fix login",
          "descriptionText": "Users can sign in.",
          "issueType": "Bug",
          "updated": "2026-11-01T10:00:00.000+0000",
          "specHash": "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"
        }
        """
      And the result has exactly the own properties key, summary, descriptionText, issueType, updated and specHash

    @boundary
    Scenario Outline: The key is returned as given and is not validated
      When toIssueSpec is awaited with key <key> and fields {}
      Then key is <key>

      Examples:
        | key (JSON) |
        | "PROJ-1"   |
        | "10001"    |
        | ""         |
        | " proj-1 " |

    @unhappy
    Scenario Outline: A missing or non-string summary becomes an empty string
      When toIssueSpec is awaited with key "PROJ-1" and fields <fields>
      Then summary is ""

      Examples:
        | fields (JSON)        |
        | {}                   |
        | {"summary": null}    |
        | {"summary": 42}      |
        | {"summary": ["Fix"]} |

    @boundary
    Scenario: A string summary is returned untrimmed, and only the hash sees it normalised
      When toIssueSpec is awaited with key "PROJ-1" and fields {"summary": "  Fix login  "}
      Then summary is "  Fix login  "
      And specHash is "84047eac0cb2f4449e8697ff60678c27258b6e6bd061b6ecde086731d22676be"

    @unhappy
    Scenario Outline: A missing, null or non-string issue type name becomes "Task"
      When toIssueSpec is awaited with key "PROJ-1" and fields <fields>
      Then issueType is "Task"

      Examples:
        | fields (JSON)                 |
        | {}                            |
        | {"issuetype": null}           |
        | {"issuetype": {}}             |
        | {"issuetype": {"name": null}} |
        | {"issuetype": {"name": 3}}    |

    @boundary
    Scenario: An empty-string issue type name is kept as it is
      When toIssueSpec is awaited with key "PROJ-1" and fields {"issuetype": {"name": ""}}
      Then issueType is ""

    @unhappy
    Scenario Outline: A missing or non-string updated becomes null
      When toIssueSpec is awaited with key "PROJ-1" and fields <fields>
      Then updated is null

      Examples:
        | fields (JSON)                 |
        | {}                            |
        | {"updated": null}             |
        | {"updated": 1700000000000}    |

    @boundary
    Scenario Outline: Any string updated is passed through without parsing
      When toIssueSpec is awaited with key "PROJ-1" and fields {"updated": <updated>}
      Then updated is <updated>

      Examples:
        | updated (JSON)                 |
        | "2026-11-01T10:00:00.000+0000" |
        | "not a date"                   |
        | ""                             |

    @unhappy
    Scenario: Empty fields (the client passes {} when the response has no fields object) give an empty spec
      When toIssueSpec is awaited with key "PROJ-1" and fields {}
      Then the result deep-equals:
        """
        {
          "key": "PROJ-1",
          "summary": "",
          "descriptionText": "",
          "issueType": "Task",
          "updated": null,
          "specHash": "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d"
        }
        """

    @unhappy
    Scenario: Values of the wrong type everywhere still resolve and never reject
      When toIssueSpec is awaited with key "PROJ-1" and fields:
        """
        {"summary": {}, "description": 42, "issuetype": {"name": []}, "updated": false}
        """
      Then the promise resolves
      And summary is "", descriptionText is "", issueType is "Task" and updated is null

  Rule: specHash in the result is specHash(summary, descriptionText) of the returned summary and descriptionText

    @happy
    Scenario: The result's hash matches a direct call on its own fields
      Given spec is toIssueSpec("PROJ-1", {"summary": "Fix login", "description": "Users  can sign in."}) awaited
      Then spec.descriptionText is "Users can sign in."
      And spec.specHash equals specHash(spec.summary, spec.descriptionText) awaited
      And spec.specHash is "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"

    @happy
    Scenario: The same spec from a plain-string description and from ADF hashes the same
      Given the description "Users can sign in." as a plain string
      And the description {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Users can sign in."}]}]}
      When toIssueSpec("PROJ-1", {"summary": "Fix login", "description": <each>}) is awaited for both
      Then both specHash values are "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"

  Rule: A description that is not a string or an object gives an empty descriptionText, and reading one never throws

    @unhappy
    Scenario Outline: Null, missing and unrecognised descriptions become ""
      When toIssueSpec is awaited with key "PROJ-1" and fields <fields>
      Then descriptionText is ""

      Examples:
        | fields (JSON)                                    |
        | {}                                               |
        | {"description": null}                            |
        | {"description": 42}                              |
        | {"description": true}                            |
        | {"description": []}                              |
        | {"description": {}}                              |
        | {"description": {"type": "doc"}}                 |
        | {"description": {"type": "doc", "content": "x"}} |

  Rule: A plain-string description keeps its line feeds, has each run of other whitespace replaced by one space, and is trimmed at both ends

    @happy
    Scenario Outline: Plain-string descriptions are tidied
      When toIssueSpec is awaited with key "PROJ-1" and fields {"description": <description>}
      Then descriptionText is <descriptionText>

      Examples:
        | description (JSON)          | descriptionText (JSON)  |
        | "Users can sign in."        | "Users can sign in."    |
        | "Users  can\tsign   in."    | "Users can sign in."    |
        | "  Users can sign in.  "    | "Users can sign in."    |
        | "Line one\nLine two"        | "Line one\nLine two"    |
        | "Line one\n\nLine two"      | "Line one\n\nLine two"  |
        | "Line one  \n  Line two"    | "Line one \n Line two"  |
        | "Line one\r\nLine two"      | "Line one \nLine two"   |
        | "\n  Line one\n"            | "Line one"              |
        | "   "                       | ""                      |
        | ""                          | ""                      |

  Rule: An ADF description is rendered block by block as Markdown-like text, with blocks joined by one blank line ("\n\n"); trailing whitespace is removed from each block and blocks that end up empty are dropped

    @happy
    Scenario: Paragraphs become blocks separated by a blank line
      When the description is:
        """
        {"type": "doc", "version": 1, "content": [
          {"type": "paragraph", "content": [{"type": "text", "text": "Users can sign in."}]},
          {"type": "paragraph", "content": []},
          {"type": "paragraph", "content": [{"type": "text", "text": "With SSO.   "}]}
        ]}
        """
      Then descriptionText is "Users can sign in.\n\nWith SSO."

    @happy
    Scenario: Text runs in a paragraph are joined as they are, ignoring marks and keeping their spacing
      When the description is a doc with one paragraph holding the text nodes "Sign in  with ", "SSO" (with marks [{"type": "strong"}]) and "."
      Then descriptionText is "Sign in  with SSO."

    @happy
    Scenario: A hard break becomes a line feed inside its block
      When the description is a doc with one paragraph holding text "Line one", {"type": "hardBreak"} and text "Line two"
      Then descriptionText is "Line one\nLine two"

    @happy
    Scenario Outline: Inline references contribute their label
      When the description is a doc with one paragraph holding text "Ask ", then <node>, then text " now"
      Then descriptionText is <descriptionText>

      Examples:
        | node (JSON)                                                                   | descriptionText (JSON)                                         |
        | {"type": "mention", "attrs": {"id": "1", "text": "@Ada"}}                     | "Ask @Ada now"                                                 |
        | {"type": "mention", "attrs": {"id": "1"}}                                     | "Ask @unknown now"                                             |
        | {"type": "emoji", "attrs": {"shortName": ":tada:"}}                           | "Ask :tada: now"                                               |
        | {"type": "emoji", "attrs": {}}                                                | "Ask  now"                                                     |
        | {"type": "inlineCard", "attrs": {"url": "https://acme.atlassian.net/browse/PROJ-2"}} | "Ask https://acme.atlassian.net/browse/PROJ-2 now"     |
        | {"type": "inlineCard", "attrs": {}}                                           | "Ask  now"                                                     |
        | {"type": "date", "attrs": {"timestamp": "1700000000000"}}                     | "Ask 1700000000000 now"                                        |
        | {"type": "date"}                                                              | "Ask  now"                                                     |
        | {"type": "status", "content": [{"type": "text", "text": "DONE"}]}             | "Ask DONE now"                                                 |

    @happy
    Scenario: A block card at block level contributes nothing
      When the description is:
        """
        {"type": "doc", "content": [
          {"type": "paragraph", "content": [{"type": "text", "text": "See:"}]},
          {"type": "blockCard", "attrs": {"url": "https://acme.atlassian.net/browse/PROJ-2"}}
        ]}
        """
      Then descriptionText is "See:"

    @boundary
    Scenario Outline: Headings get one "#" per level, clamped to 1 through 6
      When the description is a doc with one heading with attrs <attrs> holding text "Goal"
      Then descriptionText is <descriptionText>

      Examples:
        | attrs (JSON)     | descriptionText (JSON) |
        | {"level": 1}     | "# Goal"               |
        | {"level": 2}     | "## Goal"              |
        | {"level": 6}     | "###### Goal"          |
        | {"level": 9}     | "###### Goal"          |
        | {"level": 0}     | "# Goal"               |
        | {"level": "3"}   | "### Goal"             |
        | {"level": "x"}   | "# Goal"               |
        | {}               | "# Goal"               |

    @boundary
    Scenario: A heading with no text is dropped
      When the description is a doc with a heading {"level": 2} with no content, then a paragraph "Body"
      Then descriptionText is "Body"

    @happy
    Scenario: Bullet list items are "- " blocks; an item's later blocks are indented two spaces
      When the description is:
        """
        {"type": "doc", "content": [{"type": "bulletList", "content": [
          {"type": "listItem", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "First"}]},
            {"type": "bulletList", "content": [
              {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Nested"}]}]}
            ]}
          ]},
          {"type": "listItem", "content": [
            {"type": "paragraph", "content": [{"type": "text", "text": "Second"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "continued"}]}
          ]}
        ]}]}
        """
      Then descriptionText is "- First\n\n  - Nested\n\n- Second\n\n  continued"

    @boundary
    Scenario Outline: Ordered list items are numbered from attrs.order, or from 1
      When the description is a doc with an orderedList with attrs <attrs> holding list items "Alpha" and "Beta"
      Then descriptionText is <descriptionText>

      Examples:
        | attrs (JSON)     | descriptionText (JSON)   |
        | {}               | "1. Alpha\n\n2. Beta"    |
        | {"order": 1}     | "1. Alpha\n\n2. Beta"    |
        | {"order": 3}     | "3. Alpha\n\n4. Beta"    |
        | {"order": "x"}   | "1. Alpha\n\n2. Beta"    |

    @happy
    Scenario: Task items become checkboxes, ticked only when state is "DONE"
      When the description is:
        """
        {"type": "doc", "content": [{"type": "taskList", "content": [
          {"type": "taskItem", "attrs": {"localId": "a", "state": "DONE"}, "content": [{"type": "text", "text": "Write tests"}]},
          {"type": "taskItem", "attrs": {"localId": "b", "state": "TODO"}, "content": [{"type": "text", "text": "Ship"}]},
          {"type": "taskItem", "content": [{"type": "text", "text": "Announce"}]}
        ]}]}
        """
      Then descriptionText is "- [x] Write tests\n\n- [ ] Ship\n\n- [ ] Announce"

    @happy
    Scenario: Table rows become pipe-separated blocks; a cell's blocks are joined by one space
      When the description is:
        """
        {"type": "doc", "content": [{"type": "table", "content": [
          {"type": "tableRow", "content": [
            {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Field"}]}]},
            {"type": "tableHeader", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Value"}]}]}
          ]},
          {"type": "tableRow", "content": [
            {"type": "tableCell", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Owner"}]}]},
            {"type": "tableCell", "content": [
              {"type": "paragraph", "content": [{"type": "text", "text": "Ada"}]},
              {"type": "paragraph", "content": [{"type": "text", "text": "Lovelace"}]}
            ]}
          ]}
        ]}]}
        """
      Then descriptionText is "| Field | Value |\n\n| Owner | Ada Lovelace |"

    @happy
    Scenario Outline: Code blocks are fenced, with the language when it is a string
      When the description is a doc with a codeBlock with attrs <attrs> holding text "const a = 1;"
      Then descriptionText is <descriptionText>

      Examples:
        | attrs (JSON)             | descriptionText (JSON)               |
        | {"language": "ts"}       | "```ts\nconst a = 1;\n```"           |
        | {}                       | "```\nconst a = 1;\n```"             |
        | {"language": 5}          | "```\nconst a = 1;\n```"             |

    @happy
    Scenario: A quote prefixes each of its blocks with "> " and joins them with single line feeds
      When the description is a doc with a blockquote holding the paragraphs "First" and "Second"
      Then descriptionText is "> First\n> Second"

    @happy
    Scenario: A rule becomes "---"
      When the description is a doc with paragraph "Above", {"type": "rule"} and paragraph "Below"
      Then descriptionText is "Above\n\n---\n\nBelow"

    @happy
    Scenario Outline: Media becomes a placeholder naming how many items it holds
      When the description is a doc with <node>
      Then descriptionText is <descriptionText>

      Examples:
        | node (JSON)                                                                                                     | descriptionText (JSON) |
        | {"type": "mediaSingle", "content": [{"type": "media", "attrs": {"id": "m1"}}]}                                  | "[media]"              |
        | {"type": "mediaGroup", "content": [{"type": "media"}, {"type": "media"}, {"type": "media"}]}                    | "[media x3]"           |
        | {"type": "mediaGroup", "content": []}                                                                           | "[media x0]"           |

  Rule: An unknown block-level node never throws: it contributes its own non-empty "text" as a block, otherwise the blocks of its children; non-object children are skipped

    @unhappy
    Scenario Outline: Unknown and container nodes are read through
      When the description is a doc with <node>
      Then descriptionText is <descriptionText>

      Examples:
        | node (JSON)                                                                                              | descriptionText (JSON) |
        | {"type": "panel", "attrs": {"panelType": "info"}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Note"}]}]} | "Note" |
        | {"type": "futureThing", "text": "Hello"}                                                                 | "Hello"                |
        | {"type": "futureThing", "text": "", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Child"}]}]} | "Child" |
        | {"type": "futureThing"}                                                                                  | ""                     |
        | {"text": "No type"}                                                                                      | "No type"              |

    @unhappy
    Scenario: Children that are not objects are skipped
      When the description is:
        """
        {"type": "doc", "content": [42, null, "stray", true,
          {"type": "paragraph", "content": [null, {"type": "text", "text": "Kept"}]}
        ]}
        """
      Then descriptionText is "Kept"

  Rule: Text in a paragraph is read when its text node is at depth 49 or less; deeper text is dropped silently

    @boundary
    Scenario Outline: The deepest paragraph text that is read sits at depth 49
      Given a doc (depth 0) holding <panels> nested "panel" nodes, the innermost holding a paragraph that holds the text node "Deep"
      And so the text node is at depth <depth>
      When the description is that document
      Then descriptionText is <descriptionText>

      Examples:
        | panels | depth | descriptionText (JSON) |
        | 10     | 12    | "Deep"                 |
        | 47     | 49    | "Deep"                 |
        | 48     | 50    | ""                     |
        | 5000   | 5002  | ""                     |

    @unhappy
    Scenario: Shallow content survives next to a branch that is too deep
      Given a doc holding a paragraph "Shallow", then a chain of 60 nested "panel" nodes ending in a paragraph "Deep"
      When the description is that document
      Then the promise resolves
      And descriptionText is "Shallow"

  Rule: descriptionText is capped at 20,000 UTF-16 code units; longer text keeps its first 20,000 and gets "\n[truncated]" appended, and the hash is taken from the capped text

    @boundary
    Scenario Outline: The cap applies after tidying, to strings and to ADF alike
      When toIssueSpec is awaited with key "PROJ-1" and fields {"description": <description>}
      Then descriptionText is <descriptionText>

      Examples:
        | description                                                        | descriptionText                     |
        | "a" × 20000                                                        | "a" × 20000                         |
        | "a" × 20001                                                        | "a" × 20000 + "\n[truncated]"       |
        | "a" × 20000 + "   "                                                | "a" × 20000                         |
        | a doc with one paragraph holding text "b" × 25000                  | "b" × 20000 + "\n[truncated]"       |
        | a doc with paragraphs "a" × 10000 and "b" × 10000                  | "a" × 10000 + "\n\n" + "b" × 9998 + "\n[truncated]" |

    @boundary
    Scenario: The cap counts UTF-16 code units and may split a surrogate pair
      When toIssueSpec is awaited with key "PROJ-1" and fields {"description": "a" × 19999 + "😀"}
      Then descriptionText is "a" × 19999 + "\uD83D" + "\n[truncated]"

    @boundary
    Scenario: Edits beyond the cap do not change the hash
      Given description one is "a" × 20000 + "first ending"
      And description two is "a" × 20000 + "second ending"
      When toIssueSpec("PROJ-1", {"summary": "Fix login", "description": <each>}) is awaited for both
      Then both results have the same descriptionText and the same specHash

  Rule: Calls share no state, so overlapping calls give the same results as calls made one after another

    @concurrency
    Scenario: Overlapping specHash calls each resolve to their own digest
      When specHash("Fix login", "Users can sign in.") and specHash("Fix login", "Users can sign in!") are started together and awaited with Promise.all
      Then the results are, in order, "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34" and "9ba38dc958e4a1832554dbc2936804134d46ac0f5f293418ae0d9254bf45dc5b"

    @concurrency
    Scenario: Overlapping toIssueSpec calls do not mix their fields
      When toIssueSpec("PROJ-1", {"summary": "Fix login", "description": "Users can sign in."}) and toIssueSpec("PROJ-2", {}) are started together and awaited with Promise.all
      Then the first result has key "PROJ-1", summary "Fix login" and specHash "a29544debc8f75cc790c38222eab73d433d92ab8f93bd766e924977c14437d34"
      And the second result has key "PROJ-2", summary "" and specHash "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d"
      And neither fields object was modified
```

## Interface

New file `packages/jira/src/spec.ts`, using the ticket's interface as given:

```ts
export interface JiraIssueSpec {
    readonly key: string;
    readonly summary: string;
    readonly descriptionText: string;
    readonly issueType: string;
    readonly updated: string | null;
    readonly specHash: string;
}

export const SPEC_FIELDS: readonly string[]; // ["summary", "description", "issuetype", "updated"]

export async function specHash(summary: string, descriptionText: string): Promise<string>;

export async function toIssueSpec(key: string, fields: {
    summary?: unknown;
    description?: unknown;
    issuetype?: { name?: unknown } | null;
    updated?: unknown;
}): Promise<JiraIssueSpec>;
```

The change also touches these files. They are listed for completeness, and
the scenarios above test them only through `spec.ts`:

- New file `packages/jira/src/adf.ts` exports
  `adfToText(document: unknown): string`. `toIssueSpec` uses it to build
  `descriptionText`, so every description rule above holds for
  `adfToText(fields.description)`.
- `packages/jira/src/client.ts` gains the method
  `JiraClient.issueSpec(keyOrId: string): Promise<JiraIssueSpec>`. It requests
  `SPEC_FIELDS` and returns `toIssueSpec(issue.key, issue.fields ?? {})`.
- `packages/jira/src/index.ts` also re-exports `adfToText`, `SPEC_FIELDS`,
  `specHash`, `toIssueSpec`, the type `JiraIssueSpec`, and
  `stripTrailingSlashes` from `url.ts`.

These existing exports keep their behaviour: `ISSUE_FIELDS` (still without
`description`), `toIssueDto`, `toBoardDto`, `toSprintDto`,
`stripTrailingSlashes`, and every other `JiraClient` method,
credential export and OAuth export.

## Decided:

1. A missing or non-string summary becomes `""`.
   - Ticket: silent.
   - Instead: Throw an error, or return null or undefined for the summary.
2. A missing, null or non-string issue type name becomes `"Task"`.
   - Ticket: silent.
   - Instead: Use an empty string or "Unknown", or throw.
3. A missing or non-string `updated` becomes `null`.
   - Ticket: silent.
   - Instead: Throw, or use an empty string.
4. A null, missing or unrecognised description gives `descriptionText` `""`, and reading one never throws.
   - Ticket: silent.
   - Instead: Throw an error, or return null.
5. A plain-string description keeps its line feeds, has each run of other whitespace (spaces, tabs, `\r`) replaced by one space, and is trimmed.
   - Ticket: silent.
   - Instead: Return the string unchanged, or treat it as unsupported.
6. `descriptionText` is capped at 20,000 characters and gets `"\n[truncated]"` appended past that. The hash is taken from the capped text, so edits past the cap do not change it.
   - Ticket: silent.
   - Instead: No cap, or a cap with no marker, or hash the full text.
7. ADF renders as Markdown-like text: `#` headings, `- ` and `1. ` list markers, `- [x]` / `- [ ]` checkboxes, pipe-separated table rows, fenced code, `> ` quotes, `---` rules and `[media]` / `[media xN]` placeholders. Each block, list item, task item and table row is its own block, and blocks are joined with blank lines.
   - Ticket: silent.
   - Instead: Flatten everything to plain text with no markers, joined by single newlines.
8. An unknown ADF node never throws: it contributes its own non-empty `text`, otherwise its children. Non-object children are skipped.
   - Ticket: silent.
   - Instead: Skip unknown nodes, or throw.
9. Text in a paragraph is read when its text node is at depth 49 or less (the root is depth 0, and each `content` level adds one). Deeper text is dropped silently.
   - Ticket: silent.
   - Instead: No depth limit, or throw on excessive nesting.
10. Before hashing, line endings become `\n`, trailing whitespace is removed from each line, and each part is trimmed at both ends. Leading indentation, internal spaces, blank-line counts and case still change the hash.
    - Ticket: silent.
    - Instead: Hash the raw text, or collapse all whitespace.
11. `specHash` is the SHA-256 (via `crypto.subtle`) of `summary + "\u0000" + descriptionText`, both normalised and UTF-8 encoded, returned as 64 lowercase hex characters.
    - Ticket: silent.
    - Instead: Another hash such as SHA-1, MD5 or a non-crypto hash, base64 output, or JSON-encoding the pair.
12. An issue with no `fields` object is read as `toIssueSpec(key, {})`: empty summary and description, issue type `"Task"`, `updated` null.
    - Ticket: silent.
    - Instead: Throw an error.
13. The key is returned exactly as given and is not validated (`""` is accepted).
    - Ticket: silent.
    - Instead: Reject an empty or malformed issue key.
14. The returned `summary` is the raw string, untrimmed. Normalisation happens only inside the hash.
    - Ticket: silent.
    - Instead: Return the summary trimmed or whitespace-normalised.
15. An empty-string issue type name is kept as `""`. Only non-strings fall back to `"Task"`.
    - Ticket: silent.
    - Instead: Treat an empty name like a missing one and use `"Task"`.
16. Any string `updated` is passed through without parsing or validation.
    - Ticket: silent.
    - Instead: Parse it as an ISO date and return null when it is not one.
17. Text is not Unicode-normalised before hashing, so NFC and NFD spellings hash differently.
    - Ticket: silent.
    - Instead: Normalise both parts to NFC before hashing.
18. The 20,000 cap counts UTF-16 code units and may split a surrogate pair.
    - Ticket: silent.
    - Instead: Count code points and never split a character.
19. ADF text nodes keep their spacing as written. Only plain-string descriptions have whitespace runs collapsed.
    - Ticket: silent.
    - Instead: Collapse whitespace in ADF text the same way as in plain strings.
20. Missing or invalid ADF attributes fall back: heading level clamps to 1–6 (non-numeric is 1), list numbering starts at `attrs.order` or 1, a mention without a label is `@unknown`, and an emoji, card or date without its attribute contributes `""`.
    - Ticket: silent.
    - Instead: Drop the node, or throw, when an attribute is missing or invalid.
21. A `blockCard` at block level is treated as an unknown node. It has no text or children, so it contributes nothing. Its URL appears only when the card is inside a paragraph.
    - Ticket: silent.
    - Instead: Make a block-level card its own block holding its URL.
22. The result has exactly the six `JiraIssueSpec` properties, the `fields` argument is not modified, and calls share no state, so overlapping calls give the same results as sequential ones.
    - Ticket: silent.
    - Instead: Pass extra raw fields through on the result, or cache results across calls.
