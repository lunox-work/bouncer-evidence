/**
 * A bounty's sources as context: its Jira issue's fields beyond its text,
 * and its repository's own documents (never code), read at the newest
 * snapshot and cut to fixed caps. Each sync that finds new content is that
 * source's next version, and every step shown the context records the
 * versions it used.
 *
 * Decided here: which repository files count as documents and in what order
 * they are chosen, how their text is cut, which Jira fields a model sees and
 * in what shape, how both are rendered into one prompt section, and when a
 * step is behind on a source's context.
 *
 * Every export is a pure, synchronous function or a constant: none reads a
 * clock, the network or the file system, none throws on the inputs
 * described, and none mutates its arguments.
 */

import type { StackFile } from "./repo/stack.js";
import type { StageDrift } from "./stages.js";

/** The sources a bounty can be synced with as context, in order. */
export const CONTEXT_SOURCES = ["jira", "github"] as const;
/** One of the context sources. */
export type ContextSource = (typeof CONTEXT_SOURCES)[number];

/** One link of a Jira issue: its type, direction, the linked key and whether it is done. */
export interface JiraIssueLinkContext {
  readonly type: string;
  readonly direction: "inward" | "outward";
  readonly key: string | null;
  readonly done: boolean;
}

/** A Jira issue's fields beyond its text, as read at a sync. */
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
  /** The revision the context was read at; never shown. */
  readonly updated: string | null;
}

/** A kept repository document: its path, byte size, kept text and whether it was cut. */
export interface GithubContextDocument {
  readonly path: string;
  readonly bytes: number;
  readonly text: string;
  readonly truncated: boolean;
}

/** A repository's documents, read at one commit of a branch. */
export interface GithubContext {
  readonly fullName: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly documents: readonly GithubContextDocument[];
  readonly omitted: number;
}

/** The version of each source's context a step used, or null for none. */
export interface ContextVersions {
  readonly jira: number | null;
  readonly github: number | null;
}

/** The versions of a step that used no context. */
export const NO_CONTEXT: ContextVersions = { jira: null, github: null };

/** The most repository documents chosen. */
export const CONTEXT_DOCUMENTS_MAX = 12;
/** A Markdown file larger than this is not a candidate. */
export const CONTEXT_DOCUMENT_BYTES_MAX = 256 * 1024; // 262144
/** The most characters one document keeps. */
export const CONTEXT_DOCUMENT_CHARS = 12000;
/** The most characters all kept documents hold together. */
export const CONTEXT_TOTAL_CHARS = 48000;

/**
 * A title's keywords: its lowercased ASCII words of 4 or more characters,
 * unique, in first-seen order. Every character outside [a-z0-9] separates.
 */
export function contextKeywords(_title: string): string[] {
  throw new Error("not implemented");
}

/**
 * Which repository files are documents, ranked by tier, keyword boost,
 * depth, then path order: the first CONTEXT_DOCUMENTS_MAX paths, and the
 * number of candidates left after them.
 */
export function contextDocuments(
  _files: readonly StackFile[],
  _keywords: readonly string[] = [],
): {
  readonly paths: string[];
  readonly omitted: number;
} {
  throw new Error("not implemented");
}

/**
 * Documents with line endings normalized to LF, trimmed, and cut to the
 * per-document and total caps, in the order given; omitted counts the
 * documents this call dropped.
 */
export function keptDocuments(
  _documents: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
  }[],
): {
  readonly documents: GithubContextDocument[];
  readonly omitted: number;
} {
  throw new Error("not implemented");
}

/**
 * The Jira fields a model sees, in a fixed order, without keys, unset values
 * or empty lists.
 */
export function jiraContextFields(_context: JiraContext): Record<string, unknown> {
  throw new Error("not implemented");
}

/**
 * The source context as one prompt section: a Jira section then a documents
 * section, without keys, names or commits; "" when neither applies.
 */
export function renderSourceContext(_context: {
  readonly jira: JiraContext | null;
  readonly github: GithubContext | null;
}): string {
  throw new Error("not implemented");
}

/**
 * For each source, whether a step is behind: only when the overview holds a
 * newer version of it than the step used, or the step used none.
 */
export function contextDrift(
  _current: ContextVersions,
  _used: ContextVersions,
): {
  readonly jira: StageDrift | null;
  readonly github: StageDrift | null;
} {
  throw new Error("not implemented");
}
