// The QR encoder against segno (qr.fixtures.json: segno 1.6.6, level M, byte mode, boost_error=False).
// Every module must match, with segno's own mask choice and with each mask forced.
import { describe, expect, it } from "vitest";
import fixtures from "./qr.fixtures.json";
import { encodeQr, pickVersion, reedSolomon } from "./qr";

const rows = (m: boolean[][]) => m.map((r) => r.map((v) => (v ? "1" : "0")).join(""));

describe("encodeQr matches segno", () => {
  for (const c of fixtures.cases) {
    it(`"${c.text.slice(0, 40)}${c.text.length > 40 ? "…" : ""}" (version ${c.version}, mask ${c.mask})`, () => {
      const qr = encodeQr(c.text);
      expect(qr.version).toBe(c.version);
      expect(qr.mask).toBe(c.mask);
      expect(qr.size).toBe(c.version * 4 + 17);
      expect(rows(qr.modules)).toEqual(c.matrix);
    });
  }

  for (const c of fixtures.forcedMasks) {
    it(`"${c.text}" with mask ${c.mask} forced`, () => {
      expect(rows(encodeQr(c.text, { mask: c.mask }).modules)).toEqual(c.matrix);
    });
  }
});

describe("encodeQr structure", () => {
  it("draws the three finder patterns with light separators", () => {
    const { modules: m, size } = encodeQr("https://cargoos.app/upload/abc123");
    const finder = ["1111111", "1000001", "1011101", "1011101", "1011101", "1000001", "1111111"];
    for (const [r0, c0] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      expect(finder.map((_, r) => m[r0 + r].slice(c0, c0 + 7).map((v) => (v ? "1" : "0")).join(""))).toEqual(finder);
    }
    // Separators: the row under the top-left finder and the column right of it are light.
    expect(m[7].slice(0, 8).some(Boolean)).toBe(false);
    expect(m.slice(0, 8).map((r) => r[7]).some(Boolean)).toBe(false);
    // The dark module.
    expect(m[size - 8][8]).toBe(true);
  });

  it("alternates the timing patterns", () => {
    const { modules: m, size } = encodeQr("HELLO");
    for (let i = 8; i < size - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
  });

  it("picks the smallest version and refuses text past version 10", () => {
    expect(pickVersion(14)).toBe(1);
    expect(pickVersion(15)).toBe(2);
    expect(pickVersion(213)).toBe(10);
    expect(pickVersion(214)).toBeUndefined();
    expect(() => encodeQr("x".repeat(214))).toThrow(RangeError);
  });

  it("computes Reed–Solomon codewords (ISO/IEC 18004 annex I example, version 1-M)", () => {
    // "01234567" in numeric mode, 1-M: data and EC codewords from the standard's worked example.
    const data = [0x10, 0x20, 0x0c, 0x56, 0x61, 0x80, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11];
    expect(reedSolomon(data, 10)).toEqual([0xa5, 0x24, 0xd4, 0xc1, 0xed, 0x36, 0xc7, 0x87, 0x2c, 0x55]);
  });
});
