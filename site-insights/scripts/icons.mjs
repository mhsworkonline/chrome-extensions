import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync('logo1.svg');
for (const size of [16, 32, 48, 128]) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
