// Regenerates the small test images used by the 003 end-to-end tests.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** A solid-colour RGB PNG of the given size. */
export function png(width, height, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3).fill(Buffer.from([r, g, b]))]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(here, 'screenshot.png'), png(120, 80, [62, 99, 221]));
  // Minimal JPEG (SOI + APP0 + EOI) is enough for format detection; browsers may not decode it.
  writeFileSync(join(here, 'photo.jpg'), Buffer.from('ffd8ffe000104a46494600010100000100010000ffd9', 'hex'));
  // 1x1 two-frame GIF.
  writeFileSync(
    join(here, 'anim.gif'),
    Buffer.from(
      '474946383961010001008000000000ffffff21ff0b4e45545343415045322e300301000000' +
        '21f904000a0000002c00000000010001000002024401003b',
      'hex',
    ),
  );
  writeFileSync(join(here, 'diagram.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#3e63dd"/></svg>\n');
  writeFileSync(join(here, 'fake.png'), Buffer.concat([Buffer.from('MZ'), Buffer.alloc(256, 7)]));
  writeFileSync(join(here, 'notes.txt'), 'Not an image.\n');
}
