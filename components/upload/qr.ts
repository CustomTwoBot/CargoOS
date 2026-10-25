// A QR code encoder (ISO/IEC 18004, Model 2) for the phone link on /bills/new. No dependency: byte mode,
// error correction level M, versions 1–10 picked by length, Reed–Solomon over GF(256), all eight masks
// scored with the standard penalty rules, then format and version information. Pure: text in, modules out.
// Checked module-for-module against segno (qr.fixtures.json, see qr.test.ts).

/** Per version (index = version): EC codewords per block, and the data codewords of each block, level M. */
const BLOCKS_M: readonly { ec: number; data: readonly number[] }[] = [
  { ec: 0, data: [] },
  { ec: 10, data: [16] },
  { ec: 16, data: [28] },
  { ec: 26, data: [44] },
  { ec: 18, data: [32, 32] },
  { ec: 24, data: [43, 43] },
  { ec: 16, data: [27, 27, 27, 27] },
  { ec: 18, data: [31, 31, 31, 31] },
  { ec: 22, data: [38, 38, 39, 39] },
  { ec: 22, data: [36, 36, 36, 37, 37] },
  { ec: 26, data: [43, 43, 43, 43, 44] },
];

/** Alignment pattern centres per version (index = version). */
const ALIGNMENT: readonly (readonly number[])[] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

export const MAX_VERSION = 10;

export type QrMatrix = {
  version: number;
  mask: number;
  size: number;
  /** modules[row][col], true = dark. No quiet zone. */
  modules: boolean[][];
};

// ---- GF(256) and Reed–Solomon -------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Coefficients of ∏(x − αⁱ), i < degree, highest power first (leading 1 dropped). */
function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g.slice(1);
}

/** The EC codewords of one block: the remainder of data·x^degree divided by the generator. */
export function reedSolomon(data: readonly number[], degree: number): number[] {
  const gen = generator(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) rem[i] ^= mul(gen[i], factor);
  }
  return rem;
}

// ---- data codewords ------------------------------------------------------

const dataCapacity = (version: number) => BLOCKS_M[version].data.reduce((a, b) => a + b, 0);
const countBits = (version: number) => (version < 10 ? 8 : 16);

/** The smallest version (1–10) that holds this many bytes at level M, or undefined when none does. */
export function pickVersion(byteLength: number): number | undefined {
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (4 + countBits(v) + 8 * byteLength <= dataCapacity(v) * 8) return v;
  }
  return undefined;
}

function dataCodewords(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const put = (value: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, countBits(version));
  bytes.forEach((b) => put(b, 8));
  const capacity = dataCapacity(version) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) words.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; words.length < capacity / 8; pad ^= 0xec ^ 0x11) words.push(pad);
  return words;
}

/** Data blocks interleaved, then their EC blocks interleaved. */
function finalMessage(words: number[], version: number): number[] {
  const { ec, data } = BLOCKS_M[version];
  const blocks: number[][] = [];
  let at = 0;
  for (const n of data) { blocks.push(words.slice(at, at + n)); at += n; }
  const ecBlocks = blocks.map((b) => reedSolomon(b, ec));
  const out: number[] = [];
  const longest = Math.max(...data);
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ec; i++) for (const b of ecBlocks) out.push(b[i]);
  return out;
}

// ---- matrix --------------------------------------------------------------

type Grid = { size: number; dark: Uint8Array; fn: Uint8Array };

function emptyGrid(version: number): Grid {
  const size = version * 4 + 17;
  return { size, dark: new Uint8Array(size * size), fn: new Uint8Array(size * size) };
}
const setFn = (g: Grid, row: number, col: number, dark: boolean) => {
  g.dark[row * g.size + col] = dark ? 1 : 0;
  g.fn[row * g.size + col] = 1;
};

function drawFunctionPatterns(g: Grid, version: number) {
  const { size } = g;
  // Timing patterns.
  for (let i = 0; i < size; i++) { setFn(g, 6, i, i % 2 === 0); setFn(g, i, 6, i % 2 === 0); }
  // Finder patterns with their separators.
  for (const [r0, c0] of [[3, 3], [3, size - 4], [size - 4, 3]]) {
    for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
      const r = r0 + dr, c = c0 + dc;
      if (r < 0 || r >= size || c < 0 || c >= size) continue;
      const d = Math.max(Math.abs(dr), Math.abs(dc));
      setFn(g, r, c, d !== 2 && d !== 4);
    }
  }
  // Alignment patterns, except where they would overlap a finder.
  const pos = ALIGNMENT[version];
  const last = pos.length - 1;
  pos.forEach((r, i) => pos.forEach((c, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      setFn(g, r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }));
  // Format areas and the dark module are reserved light while the masks are scored.
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) { setFn(g, 8, i, false); setFn(g, i, 8, false); }
  }
  for (let i = 0; i < 8; i++) { setFn(g, 8, size - 1 - i, false); setFn(g, size - 1 - i, 8, false); }
  // Version areas (version 7 and up).
  if (version >= 7) {
    for (let i = 0; i < 6; i++) for (let k = 0; k < 3; k++) {
      setFn(g, i, size - 11 + k, false);
      setFn(g, size - 11 + k, i, false);
    }
  }
}

/** The codeword bits in two-module columns, right to left, alternately up and down, skipping the timing column. */
function placeData(g: Grid, codewords: number[]) {
  const { size } = g;
  const total = codewords.length * 8;
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upwards = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++) {
      const row = upwards ? size - 1 - v : v;
      for (let z = 0; z < 2; z++) {
        const col = right - z;
        const at = row * size + col;
        if (g.fn[at]) continue;
        // Remainder bits stay light.
        if (bit < total) g.dark[at] = (codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1;
        bit++;
      }
    }
  }
}

const MASKS: readonly ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(g: Grid, mask: number): Uint8Array {
  const out = g.dark.slice();
  const fn = MASKS[mask];
  for (let r = 0; r < g.size; r++) for (let c = 0; c < g.size; c++) {
    const at = r * g.size + c;
    if (!g.fn[at] && fn(r, c)) out[at] ^= 1;
  }
  return out;
}

const FINDER_LIKE = [1, 0, 1, 1, 1, 0, 1];

/** N3: each 1:1:3:1:1 run with four light modules (or the edge) on one side scores 40. */
function finderLikePenalty(seq: Uint8Array | number[]): number {
  const n = seq.length;
  const find = (from: number) => {
    for (let i = from; i + 7 <= n; i++) {
      let ok = true;
      for (let k = 0; k < 7 && ok; k++) ok = seq[i + k] === FINDER_LIKE[k];
      if (ok) return i;
    }
    return -1;
  };
  const anyDark = (from: number, to: number) => {
    for (let i = Math.max(from, 0); i < Math.min(to, n); i++) if (seq[i]) return true;
    return false;
  };
  let score = 0;
  let idx = find(0);
  while (idx !== -1) {
    let next = idx + 7;
    if (!anyDark(idx - 4, idx) || !anyDark(next, next + 4)) score += 40;
    else next = idx + 4;
    idx = find(next);
  }
  return score;
}

/** The penalty of a masked symbol (ISO/IEC 18004 7.8.3): runs, 2×2 blocks, finder-like runs, dark balance. */
export function penalty(m: Uint8Array, size: number): number {
  let n1 = 0, n2 = 0, n3 = 0, dark = 0;
  const row = new Uint8Array(size);
  const col = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    let rowRun = 0, colRun = 0, rowPrev = -1, colPrev = -1;
    for (let j = 0; j < size; j++) {
      const r = m[i * size + j];
      const c = m[j * size + i];
      row[j] = r; col[j] = c;
      dark += r;
      if (r === rowPrev) rowRun++; else { if (rowRun >= 5) n1 += rowRun - 2; rowRun = 1; }
      if (c === colPrev) colRun++; else { if (colRun >= 5) n1 += colRun - 2; colRun = 1; }
      if (i > 0 && j > 0 && r === rowPrev && r === m[(i - 1) * size + j] && r === m[(i - 1) * size + j - 1]) n2 += 3;
      rowPrev = r; colPrev = c;
    }
    if (rowRun >= 5) n1 += rowRun - 2;
    if (colRun >= 5) n1 += colRun - 2;
    n3 += finderLikePenalty(row) + finderLikePenalty(col);
  }
  const n4 = 10 * Math.floor(Math.abs((dark / (size * size)) * 100 - 50) / 5);
  return n1 + n2 + n3 + n4;
}

/** BCH remainder of `value` shifted by the generator's degree. */
function bch(value: number, poly: number, degree: number): number {
  let r = value << degree;
  for (let i = 31 - Math.clz32(r); i >= degree; i--) if ((r >>> i) & 1) r ^= poly << (i - degree);
  return r;
}

function drawFormatAndVersion(m: Uint8Array, size: number, version: number, mask: number) {
  const set = (row: number, col: number, on: boolean) => { m[row * size + col] = on ? 1 : 0; };
  // Level M is 00.
  const data = (0b00 << 3) | mask;
  const bits = ((data << 10) | bch(data, 0x537, 10)) ^ 0x5412;
  const bit = (i: number) => ((bits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(i, 8, bit(i));
  set(7, 8, bit(6));
  set(8, 8, bit(7));
  set(8, 7, bit(8));
  for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) set(size - 15 + i, 8, bit(i));
  set(size - 8, 8, true);
  if (version >= 7) {
    const v = (version << 12) | bch(version, 0x1f25, 12);
    for (let i = 0; i < 18; i++) {
      const on = ((v >>> i) & 1) === 1;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      set(b, a, on);
      set(a, b, on);
    }
  }
}

/**
 * Encodes `text` (UTF-8, byte mode, level M). The version is the smallest that fits; the mask is the one with
 * the lowest penalty unless `opts.mask` forces one. Throws when the text needs more than version 10.
 */
export function encodeQr(text: string, opts: { mask?: number; version?: number } = {}): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  const fits = pickVersion(bytes.length);
  if (fits === undefined) throw new RangeError(`Text too long for a version ${MAX_VERSION} QR code (${bytes.length} bytes)`);
  const version = opts.version !== undefined && opts.version >= fits && opts.version <= MAX_VERSION ? opts.version : fits;
  const g = emptyGrid(version);
  drawFunctionPatterns(g, version);
  placeData(g, finalMessage(dataCodewords(bytes, version), version));

  let mask = opts.mask ?? -1;
  let masked: Uint8Array | undefined;
  if (mask >= 0 && mask < 8) masked = applyMask(g, mask);
  else {
    let best = Infinity;
    for (let k = 0; k < 8; k++) {
      const candidate = applyMask(g, k);
      const score = penalty(candidate, g.size);
      if (score < best) { best = score; mask = k; masked = candidate; }
    }
  }
  const m = masked!;
  drawFormatAndVersion(m, g.size, version, mask);
  const modules: boolean[][] = [];
  for (let r = 0; r < g.size; r++) modules.push(Array.from(m.subarray(r * g.size, (r + 1) * g.size), (v) => v === 1));
  return { version, mask, size: g.size, modules };
}
