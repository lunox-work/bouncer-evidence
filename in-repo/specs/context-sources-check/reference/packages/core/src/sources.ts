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

import { inSkippedDirectory, type StackFile } from "./repo/stack.js";
import { extensionOf } from "./repo/tree.js";
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
export function contextKeywords(title: string): string[] {
  const keywords: string[] = [];
  for (const word of title.toLowerCase().split(/[^a-z0-9]+/)) {
    if (word.length >= 4 && !keywords.includes(word)) keywords.push(word);
  }
  return keywords;
}

/** The extensions of the files that can be documents: Markdown only. */
const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  "md",
  "mdx",
  "markdown",
]);

/** Stems of boilerplate documents, left out wherever they sit. */
const BOILERPLATE_STEMS: ReadonlySet<string> = new Set([
  "changelog",
  "changes",
  "history",
  "license",
  "licence",
  "copying",
  "code_of_conduct",
  "security",
  "notice",
  "authors",
  "contributors",
  "codeowners",
]);

/** Stems of the root documents that guide work on the repository. */
const GUIDE_STEMS: ReadonlySet<string> = new Set([
  "contributing",
  "architecture",
  "design",
  "development",
  "agents",
  "claude",
  "conventions",
  "overview",
]);

/** Directory names, lowercased, whose documents rank as docs. */
const DOCS_DIRECTORIES: ReadonlySet<string> = new Set([
  "docs",
  "doc",
  "documentation",
  "adr",
  "adrs",
]);

/** The score a keyword takes off, and the lowest a boost can bring one to. */
const KEYWORD_BOOST = 3;
const BOOSTED_SCORE_MIN = 1;

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** A file name lowercased, up to but not including its last dot. */
function stemOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot === -1 ? lower : lower.slice(0, dot);
}

/** Whether a listed file can be a document at all. */
function isCandidate(file: StackFile): boolean {
  if (file.size <= 0 || file.size > CONTEXT_DOCUMENT_BYTES_MAX) return false;
  if (!DOCUMENT_EXTENSIONS.has(extensionOf(file.path))) return false;
  const segments = file.path.split("/");
  const name = segments[segments.length - 1] ?? "";
  if (BOILERPLATE_STEMS.has(stemOf(name))) return false;
  if (inSkippedDirectory(file.path)) return false;
  return !segments.slice(0, -1).includes(".github");
}

/** A candidate's score: its tier's, less any keyword boost. */
function scoreOf(path: string, keywords: readonly string[]): number {
  const segments = path.split("/");
  const depth = segments.length;
  const stem = stemOf(segments[depth - 1] ?? "");
  if (depth === 1 && stem === "readme") return 0;
  const score =
    depth === 1 && GUIDE_STEMS.has(stem)
      ? 2
      : segments
            .slice(0, -1)
            .some((segment) => DOCS_DIRECTORIES.has(segment.toLowerCase()))
        ? 4
        : stem === "readme"
          ? 6
          : 8;
  const lower = path.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword))
    ? Math.max(BOOSTED_SCORE_MIN, score - KEYWORD_BOOST)
    : score;
}

/**
 * Which repository files are documents, ranked by tier, keyword boost,
 * depth, then path order: the first CONTEXT_DOCUMENTS_MAX paths, and the
 * number of candidates left after them.
 */
export function contextDocuments(
  files: readonly StackFile[],
  keywords: readonly string[] = [],
): {
  readonly paths: string[];
  readonly omitted: number;
} {
  const ranked = files
    .filter(isCandidate)
    .map(({ path }) => ({
      path,
      score: scoreOf(path, keywords),
      depth: path.split("/").length,
    }))
    .sort(
      (a, b) =>
        a.score - b.score || a.depth - b.depth || compare(a.path, b.path),
    )
    .map(({ path }) => path);
  return {
    paths: ranked.slice(0, CONTEXT_DOCUMENTS_MAX),
    omitted: Math.max(0, ranked.length - CONTEXT_DOCUMENTS_MAX),
  };
}

/**
 * Documents with line endings normalized to LF, trimmed, and cut to the
 * per-document and total caps, in the order given; omitted counts the
 * documents this call dropped.
 */
export function keptDocuments(
  documents: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly text: string;
  }[],
): {
  readonly documents: GithubContextDocument[];
  readonly omitted: number;
} {
  const kept: GithubContextDocument[] = [];
  let omitted = 0;
  let total = 0;
  for (const { path, bytes, text } of documents) {
    const normalized = text.replace(/\r\n?/g, "\n").trim();
    const room = CONTEXT_TOTAL_CHARS - total;
    if (normalized === "" || room <= 0) {
      omitted += 1;
      continue;
    }
    const cut = normalized.slice(0, Math.min(CONTEXT_DOCUMENT_CHARS, room));
    total += cut.length;
    kept.push({
      path,
      bytes,
      text: cut,
      truncated: cut.length < normalized.length,
    });
  }
  return { documents: kept, omitted };
}

/** Seconds as hours, rounded half up to one decimal. */
const hoursOf = (seconds: number) => Math.round(seconds / 360) / 10;

/**
 * The Jira fields a model sees, in a fixed order, without keys, unset values
 * or empty lists.
 */
export function jiraContextFields(
  context: JiraContext,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  if (context.issueType !== null) fields.issueType = context.issueType;
  if (context.status !== null) fields.status = context.status;
  if (context.priority !== null) fields.priority = context.priority;
  if (context.labels.length > 0) fields.labels = context.labels;
  if (context.components.length > 0) fields.components = context.components;
  if (context.fixVersions.length > 0) fields.fixVersions = context.fixVersions;
  if (context.dueDate !== null) fields.dueDate = context.dueDate;
  if (context.storyPoints !== null) fields.storyPoints = context.storyPoints;
  if (context.originalEstimateSeconds !== null)
    fields.originalEstimateHours = hoursOf(context.originalEstimateSeconds);
  if (context.remainingEstimateSeconds !== null)
    fields.remainingEstimateHours = hoursOf(context.remainingEstimateSeconds);
  if (context.votes !== null) fields.votes = context.votes;
  if (context.watchers !== null) fields.watchers = context.watchers;
  if (context.subtaskCount !== 0) fields.subtasks = context.subtaskCount;
  if (context.parentKey !== null) fields.hasParent = true;
  if (context.links.length > 0)
    fields.links = context.links.map(({ type, direction, done }) => ({
      type,
      direction,
      done,
    }));
  return fields;
}

/**
 * The source context as one prompt section: a Jira section then a documents
 * section, without keys, names or commits; "" when neither applies.
 */
export function renderSourceContext(context: {
  readonly jira: JiraContext | null;
  readonly github: GithubContext | null;
}): string {
  const sections: string[] = [];
  if (context.jira !== null)
    sections.push(
      `Jira fields:\n${JSON.stringify(jiraContextFields(context.jira))}`,
    );
  if (context.github !== null && context.github.documents.length > 0)
    sections.push(
      "Repository documents:" +
        context.github.documents
          .map(
            ({ path, text, truncated }) =>
              `\n\n--- ${path}${truncated ? " (cut short)" : ""} ---\n${text}`,
          )
          .join(""),
    );
  return sections.join("\n\n");
}

/** Whether a step that used one version of a source is behind the current one. */
function sourceDrift(
  current: number | null,
  used: number | null,
): StageDrift | null {
  return current !== null && (used === null || used < current)
    ? { uses: used, current }
    : null;
}

/**
 * For each source, whether a step is behind: only when the overview holds a
 * newer version of it than the step used, or the step used none.
 */
export function contextDrift(
  current: ContextVersions,
  used: ContextVersions,
): {
  readonly jira: StageDrift | null;
  readonly github: StageDrift | null;
} {
  return {
    jira: sourceDrift(current.jira, used.jira),
    github: sourceDrift(current.github, used.github),
  };
}
