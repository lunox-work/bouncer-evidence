/**
 * The default avatar every user and organization gets without anyone
 * uploading one and without storing anything: a 5x5 grid, mirrored left to
 * right, plus a hue, both computed only from the account id.
 *
 * A frozen contract: its output sets what every existing account looks like,
 * so the golden vectors pin it exactly. Rendering happens outside this
 * package.
 */

/**
 * A computed avatar: 25 row-major cells (index `row * 5 + column`, `true` is
 * on) and an integer hue from 0 to 359.
 */
export interface Identicon {
  readonly cells: readonly boolean[];
  readonly hue: number;
}

/**
 * The identicon for `seed`, the account id, hashed verbatim as UTF-8 with
 * 32-bit FNV-1a. Pure: each call returns a fresh object, and no seed is
 * rejected.
 */
export function identicon(_seed: string): Identicon {
  throw new Error("not implemented");
}
