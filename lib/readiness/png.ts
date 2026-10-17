/**
 * Minimal PNG encoder (8-bit RGB, no interlace) used to serve the drawn readiness fixtures as real
 * image files, so the browser sends them through exactly the same decode-and-analyse path as an
 * uploaded photo. Server-only: it uses node:zlib.
 */

import { deflateSync } from "node:zlib";

import type { PixelGrid } from "./contracts";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encodes RGBA pixels as an opaque RGB PNG. The alpha channel is dropped. */
export function encodePng(grid: PixelGrid): Buffer {
  const { width, height, data } = grid;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);

  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 1; // filter type 1 (Sub): each byte minus the same channel of the pixel to its left
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const left = x > 0 ? data[i - 4 + c] : 0;
        raw[o++] = (data[i + c] - left) & 0xff;
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB
  header[10] = 0; // compression
  header[11] = 0; // filter method
  header[12] = 0; // no interlace

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}
