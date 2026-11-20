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
export function identicon(seed: string): Identicon {
  // 32-bit FNV-1a over the UTF-8 bytes; TextEncoder turns a lone surrogate
  // into U+FFFD. No finalizer: the golden vectors pin the raw hash.
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(seed)) {
    h = Math.imul(h ^ byte, 0x01000193);
  }
  h >>>= 0;

  // Bit `row * 3 + column` draws columns 0-2; columns 3 and 4 mirror 1 and 0.
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      const drawn = column < 3 ? column : 4 - column;
      cells.push(((h >>> (row * 3 + drawn)) & 1) === 1);
    }
  }
  // Never blank: an empty grid (bits 0-14 all clear) gets the centre dot.
  if ((h & 0x7fff) === 0) {
    cells[12] = true;
  }

  return { cells, hue: (h >>> 15) % 360 };
}
