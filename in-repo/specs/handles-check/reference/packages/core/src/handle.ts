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

/** The only characters a handle may contain, tested after lowercasing. */
const HANDLE_PATTERN = /^[a-z0-9_-]+$/;

/** A run of characters a handle may not contain. */
const DISALLOWED_RUN = /[^a-z0-9_-]+/g;

const LENGTH_REASON = `Must be between ${HANDLE_MIN_LENGTH} and ${HANDLE_MAX_LENGTH} characters.`;
const CHARSET_REASON =
  "Can use letters, numbers, hyphens and underscores only.";

/** Appended to a stem shorter than the minimum so it is still a valid handle. */
const SHORT_STEM_SUFFIX = "-user";

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
  return raw.trim().toLowerCase();
}

/**
 * Validates `handle` exactly as given, never trimming or lowercasing it.
 * Length is checked before the charset, so a handle out of range reports
 * `length`.
 */
export function checkHandle(handle: string): HandleCheck {
  if (
    handle.length < HANDLE_MIN_LENGTH ||
    handle.length > HANDLE_MAX_LENGTH
  ) {
    return { status: "invalid", problem: "length", reason: LENGTH_REASON };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return { status: "invalid", problem: "charset", reason: CHARSET_REASON };
  }
  return { status: "ok" };
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
  const display = raw.trim();
  const handle = toHandleCase(raw);
  const check = checkHandle(handle);
  if (check.status !== "ok") {
    return check;
  }
  return { status: "ok", handle, display };
}

/** True exactly when `normalizeHandle(raw).status` is `"ok"`. */
export function isValidHandle(raw: string): boolean {
  return normalizeHandle(raw).status === "ok";
}

/**
 * Derives a handle from free text: lowercases, replaces each run of
 * disallowed characters with one hyphen, trims hyphens (only hyphens) from
 * both ends, truncates to 30, and pads a result shorter than 3 with "-user".
 */
export function toHandleStem(text: string): string {
  const stem = trimHyphens(
    text.toLowerCase().replace(DISALLOWED_RUN, "-"),
  ).slice(0, HANDLE_MAX_LENGTH);
  // Pad a too-short stem: "jo" must still produce a valid handle.
  return stem.length >= HANDLE_MIN_LENGTH
    ? stem
    : `${stem}${SHORT_STEM_SUFFIX}`;
}

/**
 * {@link toHandleStem} of the text before the first "@", or of the whole
 * string when there is no "@". Malformed addresses are not rejected.
 */
export function handleStemFromEmail(email: string): string {
  const at = email.indexOf("@");
  return toHandleStem(at === -1 ? email : email.slice(0, at));
}


/**
 * Strips leading and trailing hyphens in linear time. Do not simplify to
 * `replace(/^-+|-+$/g, "")`: that is quadratic on a long run of hyphens, and
 * the input is truncated only after this runs.
 */
function trimHyphens(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "-") {
    start += 1;
  }
  while (end > start && value[end - 1] === "-") {
    end -= 1;
  }
  return value.slice(start, end);
}
