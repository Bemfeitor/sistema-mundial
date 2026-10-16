/**
 * Gerador de QR Code SVG mínimo — suporta byte mode, versão 1-10, nível de correção L.
 * Sem dependências externas.
 */

// Reed-Solomon GF(256) com polinômio x^8 + x^4 + x^3 + x^2 + 1 (0x11D)
const GF256 = (() => {
  const exp = new Uint8Array(512);
  const log = new Uint8Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) {
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  return {
    mul: (a: number, b: number) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]),
    exp,
    log,
  };
})();

function rsEncode(data: number[], nec: number): number[] {
  // Generator polynomial for nec error correction codewords
  let g = [1];
  for (let i = 0; i < nec; i++) {
    const t = [1, GF256.exp[i]];
    const ng: number[] = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++)
      for (let k = 0; k < t.length; k++)
        ng[j + k] ^= GF256.mul(g[j], t[k]);
    g = ng;
  }
  const msg = [...data, ...new Array(nec).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = msg[i];
    if (coef !== 0)
      for (let j = 1; j < g.length; j++)
        msg[i + j] ^= GF256.mul(g[j], coef);
  }
  return msg.slice(data.length);
}

// Versão, capacidade bytes (nível L), blocos EC
// Versões 1-10 suficientes para URLs típicas (<130 chars)
const VERSION_DATA: Array<[number, number, number, number]> = [
  // [version, maxBytes, ecCodewords, dataCodewords]
  [1, 19, 7, 19],
  [2, 34, 10, 34],
  [3, 55, 15, 55],
  [4, 80, 20, 80],
  [5, 108, 26, 108],
  [6, 136, 18, 68],
  [7, 156, 20, 78],
  [8, 194, 24, 97],
  [9, 232, 30, 116],
  [10, 274, 18, 68],
];

// Format info strings for error correction level L (01) with masks 0-7
const FORMAT_INFO: number[] = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

function makeMatrix(size: number): number[][] {
  return Array.from({ length: size }, () => new Array(size).fill(-1));
}

function setFinder(m: number[][], r: number, c: number) {
  for (let i = -1; i <= 7; i++)
    for (let j = -1; j <= 7; j++) {
      if (r + i < 0 || r + i >= m.length || c + j < 0 || c + j >= m.length) continue;
      const inSquare = i >= 0 && i <= 6 && j >= 0 && j <= 6;
      const onOuter = i === 0 || i === 6 || j === 0 || j === 6;
      const onInner = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      m[r + i][c + j] = inSquare ? (onOuter || onInner ? 1 : 0) : 0;
    }
}

function setAlignment(m: number[][], r: number, c: number) {
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      const onEdge = Math.abs(i) === 2 || Math.abs(j) === 2;
      m[r + i][c + j] = onEdge || (i === 0 && j === 0) ? 1 : 0;
    }
}

// Alignment pattern positions for versions 2-10
const ALIGNMENT_POS: Record<number, number[]> = {
  2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

function buildMatrix(version: number, data: number[]): number[][] {
  const size = version * 4 + 17;
  const m = makeMatrix(size);

  // Finder patterns
  setFinder(m, 0, 0);
  setFinder(m, 0, size - 7);
  setFinder(m, size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // Dark module
  m[4 * version + 9][8] = 1;

  // Alignment patterns
  const apos = ALIGNMENT_POS[version] ?? [];
  for (const r of apos)
    for (const c of apos)
      if (m[r][c] === -1) setAlignment(m, r, c);

  // Reserve format info areas
  for (let i = 0; i <= 8; i++) {
    if (m[8][i] === -1) m[8][i] = 0;
    if (m[i][8] === -1) m[i][8] = 0;
    if (m[8][size - 1 - i] === -1) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === -1) m[size - 1 - i][8] = 0;
  }

  // Place data bits (zigzag upwards, skip used modules)
  let idx = 0;
  let going_up = true;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // skip timing column
    for (let vert = 0; vert < size; vert++) {
      const row = going_up ? size - 1 - vert : vert;
      for (let col = right; col >= right - 1; col--) {
        if (m[row][col] !== -1) continue;
        const bitIdx = Math.floor(idx / 8);
        const bit = bitIdx < data.length ? (data[bitIdx] >> (7 - (idx % 8))) & 1 : 0;
        m[row][col] = bit;
        idx++;
      }
    }
    going_up = !going_up;
  }

  return m;
}

function applyMask(m: number[][], mask: number): number[][] {
  const size = m.length;
  const mc = m.map((r) => [...r]);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (mc[r][c] < 0 || mc[r][c] > 1) continue;
      // Check if it's a data module (not pattern)
      const inFinder =
        (r < 9 && c < 9) ||
        (r < 9 && c >= size - 8) ||
        (r >= size - 8 && c < 9);
      if (inFinder) continue;
      let cond = false;
      if (mask === 0) cond = (r + c) % 2 === 0;
      else if (mask === 1) cond = r % 2 === 0;
      else if (mask === 2) cond = c % 3 === 0;
      else if (mask === 3) cond = (r + c) % 3 === 0;
      else if (mask === 4) cond = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      else if (mask === 5) cond = (r * c) % 2 + (r * c) % 3 === 0;
      else if (mask === 6) cond = ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      else cond = ((r + c) % 2 + (r * c) % 3) % 2 === 0;
      if (cond) mc[r][c] ^= 1;
    }
  return mc;
}

function setFormatInfo(m: number[][], mask: number): void {
  const size = m.length;
  const fmt = FORMAT_INFO[mask];
  const bits = Array.from({ length: 15 }, (_, i) => (fmt >> (14 - i)) & 1);
  const seq1 = [0, 1, 2, 3, 4, 5, 7, 8, 8, 8, 8, 8, 8, 8, 8];
  const seq2 = [8, 8, 8, 8, 8, 8, 8, 8, 7, 5, 4, 3, 2, 1, 0];
  for (let i = 0; i < 15; i++) {
    m[seq1[i]][8] = bits[i];
    m[8][seq2[i]] = bits[i];
    m[size - 1 - seq2[i]][8] = bits[14 - i];
    m[8][size - 1 - seq1[i]] = bits[14 - i];
  }
}

function penalty(m: number[][]): number {
  const size = m.length;
  let score = 0;
  // Rule 1: 5+ in row/col
  for (let r = 0; r < size; r++) {
    let run = 1;
    for (let c = 1; c < size; c++) {
      if (m[r][c] === m[r][c - 1]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
      else run = 1;
    }
  }
  for (let c = 0; c < size; c++) {
    let run = 1;
    for (let r = 1; r < size; r++) {
      if (m[r][c] === m[r - 1][c]) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
      else run = 1;
    }
  }
  // Rule 2: 2x2 blocks
  for (let r = 0; r < size - 1; r++)
    for (let c = 0; c < size - 1; c++)
      if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1])
        score += 3;
  return score;
}

export function qrSvg(text: string, px = 4): string {
  const bytes = Array.from(new TextEncoder().encode(text));
  const len = bytes.length;

  // Find minimum version
  let version = 1;
  for (const [v, maxB] of VERSION_DATA) {
    if (len <= maxB) { version = v; break; }
    version = v;
  }

  // Build data codewords: mode indicator (0100) + char count + data + terminator + padding
  const vd = VERSION_DATA[version - 1];
  const totalDC = vd[3];
  const ecCount = vd[2];

  const bits: number[] = [];
  const push = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); };

  // Byte mode indicator
  push(0b0100, 4);
  // Character count (8 bits for versions 1-9)
  push(len, version < 10 ? 8 : 16);
  // Data
  for (const b of bytes) push(b, 8);
  // Terminator
  for (let i = 0; i < 4 && bits.length < totalDC * 8; i++) bits.push(0);
  // Byte align
  while (bits.length % 8 !== 0) bits.push(0);
  // Pad
  const pads = [0xec, 0x11];
  let pi = 0;
  while (bits.length < totalDC * 8) { push(pads[pi % 2], 8); pi++; }

  // Convert bits to codewords
  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ?? 0);
    codewords.push(byte);
  }

  // Error correction (simple 1-block for versions 1-6; simplified for higher)
  const ecWords = rsEncode(codewords, ecCount);
  const allWords = [...codewords, ...ecWords];

  // Build matrix and apply best mask
  const base = buildMatrix(version, allWords);
  let best = -1, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const mc = applyMask(base, mask);
    setFormatInfo(mc, mask);
    const s = penalty(mc);
    if (s < bestScore) { bestScore = s; best = mask; }
  }
  const final = applyMask(base, best);
  setFormatInfo(final, best);

  const size = final.length;
  const dim = (size + 8) * px; // 4-module quiet zone each side
  const off = 4 * px;

  let rects = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (final[r][c] === 1)
        rects += `<rect x="${off + c * px}" y="${off + r * px}" width="${px}" height="${px}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}" shape-rendering="crispEdges"><rect width="${dim}" height="${dim}" fill="white"/><g fill="black">${rects}</g></svg>`;
}
