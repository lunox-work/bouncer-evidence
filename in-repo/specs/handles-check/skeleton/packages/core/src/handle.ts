/**
 * Handle rules: the public names of users and organizations. They are stored
 * lowercase, are 3 to 30 characters of a-z, 0-9, "-" and "_", and can be
 * derived from free text or an email address.
 *
 * Pure, synchronous functions over strings: no state, no I/O, no clock, and
 * no export throws for any string input.
 */

/** Shortest allowed handle, inclusive, in UTF-16 code units. */
export const HANDLE_MIN_LENGTH = 3;

/** Longest allowed handle, inclusive, in UTF-16 code units. */
export const HANDLE_MAX_LENGTH = 30;

/** Which rule a rejected handle broke; only one is ever reported. */
export type HandleProblem = "length" | "charset";

/**
 * A rejection: exactly `{ status, problem, reason }`, where `reason` is the
 * fixed English sentence for `problem`.
 */
export interface HandleRejected {
  readonly status: "invalid";
  readonly problem: HandleProblem;
  readonly reason: string;
}

/** The result of {@link checkHandle}: exactly `{ status: "ok" }`, or a rejection. */
export type HandleCheck =
  | {
      readonly status: "ok";
    }
  | HandleRejected;

/**
 * Trims the ends with `String.prototype.trim` and lowercases with
 * `toLowerCase`, and changes nothing else.
 */
export function toHandleCase(raw: string): string {
  throw new Error("not implemented");
}

/**
 * Validates `handle` exactly as given, never trimming or lowercasing it.
 * Length is checked before the charset, so a handle out of range reports
 * `length`.
 */
export function checkHandle(handle: string): HandleCheck {
  throw new Error("not implemented");
}

/**
 * The result of {@link normalizeHandle}: on success `handle` is the lowercased
 * form and `display` is the trimmed input with its original casing.
 */
export type NormalizedHandle =
  | {
      readonly status: "ok";
      readonly handle: string;
      readonly display: string;
    }
  | HandleRejected;

/**
 * Applies {@link toHandleCase}, then {@link checkHandle}. A rejection is the
 * same object `checkHandle(toHandleCase(raw))` gives.
 */
export function normalizeHandle(raw: string): NormalizedHandle {
  throw new Error("not implemented");
}

/** True exactly when `normalizeHandle(raw).status` is `"ok"`. */
export function isValidHandle(raw: string): boolean {
  throw new Error("not implemented");
}

/**
 * Derives a handle from free text: lowercases, replaces each run of
 * disallowed characters with one hyphen, trims hyphens (only hyphens) from
 * both ends, truncates to 30, and pads a result shorter than 3 with "-user".
 */
export function toHandleStem(text: string): string {
  throw new Error("not implemented");
}

/**
 * {@link toHandleStem} of the text before the first "@", or of the whole
 * string when there is no "@". Malformed addresses are not rejected.
 */
export function handleStemFromEmail(email: string): string {
  throw new Error("not implemented");
}
