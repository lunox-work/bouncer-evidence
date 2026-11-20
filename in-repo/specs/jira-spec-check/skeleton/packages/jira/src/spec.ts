/**
 * A Jira ticket's spec and its fingerprint. Turns the `fields` of one issue
 * (summary, description, issue type, updated) into a `JiraIssueSpec`, with the
 * description as plain text and a `specHash` over summary and description.
 * The platform stores only the hash; a later re-read whose hash differs means
 * the ticket changed after it was priced.
 *
 * Like `mapping.ts`, everything is defensive: input of a missing or wrong type
 * becomes a default and never makes a call throw.
 */

/** One issue's spec: key, raw summary, description as plain text, issue type, updated and the fingerprint. */
export interface JiraIssueSpec {
  readonly key: string;
  readonly summary: string;
  readonly descriptionText: string;
  readonly issueType: string;
  readonly updated: string | null;
  readonly specHash: string;
}

/** The Jira fields a spec read requests, in a fixed order. */
export const SPEC_FIELDS: readonly string[] = [
  "summary",
  "description",
  "issuetype",
  "updated",
];

/**
 * A stable fingerprint of the pair: the lowercase hex SHA-256 of the
 * normalised summary, a U+0000 character, and the normalised description,
 * encoded as UTF-8.
 */
export async function specHash(
  summary: string,
  descriptionText: string,
): Promise<string> {
  throw new Error("not implemented");
}

/**
 * Builds a `JiraIssueSpec` from a raw issue's fields. Missing or wrong-typed
 * values become defaults; the promise never rejects.
 */
export async function toIssueSpec(
  key: string,
  fields: {
    summary?: unknown;
    description?: unknown;
    issuetype?: { name?: unknown } | null;
    updated?: unknown;
  },
): Promise<JiraIssueSpec> {
  throw new Error("not implemented");
}
