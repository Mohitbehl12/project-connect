// Duplicate-photo detection with a difference hash (dHash): shrink to 9×8 grey pixels and record, for each row,
// whether each pixel is brighter than the next. Re-saved, resized or lightly edited copies of a picture give the
// same or a very close hash. It is not a face template and can't identify a person — it only says two images look alike.

/** 16 hex chars from 72 grey pixels (9 wide × 8 high, row by row). */
export function dhashFromGrey(px: ArrayLike<number>): string {
  if (px.length < 72) throw new Error("dhash needs 9×8 grey pixels");
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let col = 0; col < 8; col++) byte = (byte << 1) | (px[row * 9 + col] > px[row * 9 + col + 1] ? 1 : 0);
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Number of differing bits between two hashes. */
export function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 16; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Four 16-bit bands. Two hashes within 3 bits of each other always share at least one band, so the database
 * only has to look at photos with a matching band (pigeonhole), not every photo.
 */
export const bands = (h: string) => [h.slice(0, 4), h.slice(4, 8), h.slice(8, 12), h.slice(12, 16)];

/** At or under this many differing bits, two photos are treated as the same picture. */
export const SAME_PHOTO_BITS = 3;
