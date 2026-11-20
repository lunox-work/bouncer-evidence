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

import { adfToText } from "./adf.js";

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
  const input = `${normaliseForHash(summary)}\u0000${normaliseForHash(descriptionText)}`;
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(new Uint8Array(digest));
}

/**
 * What the hash sees of one part: line endings unified to `\n`, trailing
 * whitespace removed from every line, and both ends trimmed. Nothing else —
 * indentation, internal spacing, blank-line counts, case and Unicode form all
 * still change the hash, because they can change what the ticket asks for.
 */
function normaliseForHash(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
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
  const summary = typeof fields.summary === "string" ? fields.summary : "";
  const descriptionText = adfToText(fields.description);
  const issueTypeName: unknown =
    fields.issuetype !== null && typeof fields.issuetype === "object"
      ? fields.issuetype.name
      : undefined;
  return {
    key,
    summary,
    descriptionText,
    issueType: typeof issueTypeName === "string" ? issueTypeName : "Task",
    updated: typeof fields.updated === "string" ? fields.updated : null,
    specHash: await specHash(summary, descriptionText),
  };
}
