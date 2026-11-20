/**
 * Native ticket rules: the rules every surface needs to agree on for a
 * ticket — its origins, field limits, default issue type, title clamping, the
 * spec fingerprint and its version, and the key a ticket is shown under — so
 * each has one definition.
 *
 * Imported by its own path; `index.ts` does not re-export it. Dependency-free
 * like the rest of this package: hashing uses `crypto.subtle`, and nothing
 * touches a clock, network, database or file system.
 */

/** Where a ticket came from: written on the platform, or read from Jira. */
export const TICKET_ORIGINS = ["manual", "jira"] as const;
export type TicketOrigin = (typeof TICKET_ORIGINS)[number];

/**
 * Field limits, in UTF-16 code units (`String#length`). `labels` is the
 * maximum number of labels and `label` the maximum length of one label.
 */
export const TICKET_LIMITS = {
  title: 255,
  description: 20_000,
  issueType: 64,
  priority: 64,
  labels: 20,
  label: 64,
} as const;

/** The default issue type of a ticket. */
export const DEFAULT_ISSUE_TYPE = "Task";

/**
 * A title of at most `TICKET_LIMITS.title` UTF-16 code units: cut to the
 * first 255, with a lone high surrogate left at the end dropped. A title that
 * fits is otherwise returned unchanged.
 */
export function clampTicketTitle(title: string): string {
  const cut = title.slice(0, TICKET_LIMITS.title);
  // Nothing follows the last code unit, so a high surrogate there is lone.
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/** The content of a ticket. */
export interface TicketContent {
  readonly title: string;
  readonly description: string;
  readonly issueType: string;
  /** `null` when the ticket has none. */
  readonly priority: string | null;
  readonly labels: readonly string[];
  readonly components: readonly string[];
  /**
   * True when length or depth limits dropped part of the input the content
   * was read from, as in `JiraIssueSpec.inputTruncated`.
   */
  readonly inputTruncated: boolean;
}

/** The version of the spec fingerprint computed by {@link ticketSpecHash}. */
export const TICKET_SPEC_HASH_VERSION = 1;

/**
 * The spec fingerprint: the SHA-256 of `JSON.stringify` of the three
 * {@link normalizeSpecText}-normalized fields, UTF-8 encoded, as 64 lowercase
 * hex characters. Byte-identical to `pricingSpecHash` in `packages/jira`.
 */
export async function ticketSpecHash(
  title: string,
  description: string,
  issueType: string,
): Promise<string> {
  const canonical = JSON.stringify([
    normalizeSpecText(title),
    normalizeSpecText(description),
    normalizeSpecText(issueType),
  ]);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Spec text as hashed: line endings unified to LF, each line's end trimmed
 * and the whole text trimmed; nothing else changed.
 */
export function normalizeSpecText(value: string): string {
  return value
    .split(/\r\n|\r|\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * The key a ticket is shown under: `jiraKey` unless it is null or undefined,
 * and otherwise `"T-"` followed by the number in decimal.
 */
export function ticketKey(ticket: {
  readonly number: number;
  readonly jiraKey?: string | null | undefined;
}): string {
  return ticket.jiraKey ?? `T-${String(ticket.number)}`;
}
