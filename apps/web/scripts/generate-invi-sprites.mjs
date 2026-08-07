import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(
  scriptDirectory,
  "../../../Logo/invi-character-concept-e-sealed-letter-keeper.png",
);
const outputPath = resolve(scriptDirectory, "../public/brand/invi-character-sprites.webp");

const frameSize = 384;
const frameInset = 20;

// These are the five authored poses on the selected Concept E sheet. Keep their order aligned with
// InviMascot.module.css: neutral, alert, thinking, success, resting.
const poses = [
  { height: 610, left: 300, top: 130, width: 660 },
  { height: 370, left: 40, top: 790, width: 310 },
  { height: 370, left: 350, top: 790, width: 285 },
  { height: 380, left: 600, top: 785, width: 340 },
  { height: 370, left: 930, top: 790, width: 290 },
];

function colorDistance(red, green, blue, background) {
  const redDifference = red - background.red;
  const greenDifference = green - background.green;
  const blueDifference = blue - background.blue;
  return Math.sqrt(
    redDifference * redDifference +
      greenDifference * greenDifference +
      blueDifference * blueDifference,
  );
}

function sampleBackground(data, width, height) {
  const samples = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 80));

  for (let x = 0; x < width; x += stride) {
    samples.push((x + 2 * width) * 4, (x + (height - 3) * width) * 4);
  }

  for (let y = 0; y < height; y += stride) {
    samples.push((2 + y * width) * 4, (width - 3 + y * width) * 4);
  }

  const totals = samples.reduce(
    (sum, offset) => ({
      blue: sum.blue + data[offset + 2],
      green: sum.green + data[offset + 1],
      red: sum.red + data[offset],
    }),
    { blue: 0, green: 0, red: 0 },
  );

  return {
    blue: totals.blue / samples.length,
    green: totals.green / samples.length,
    red: totals.red / samples.length,
  };
}

function removeConnectedBackground(data, width, height) {
  const background = sampleBackground(data, width, height);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const canRemove = (pixelIndex) => {
    const offset = pixelIndex * 4;
    return (
      data[offset] > 218 &&
      data[offset + 1] > 212 &&
      data[offset + 2] > 202 &&
      colorDistance(data[offset], data[offset + 1], data[offset + 2], background) < 42
    );
  };

  const enqueue = (pixelIndex) => {
    if (visited[pixelIndex] || !canRemove(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[tail] = pixelIndex;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue(x + (height - 1) * width);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(width - 1 + y * width);
  }

  while (head < tail) {
    const pixelIndex = queue[head];
    head += 1;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (x > 0) enqueue(pixelIndex - 1);
    if (x + 1 < width) enqueue(pixelIndex + 1);
    if (y > 0) enqueue(pixelIndex - width);
    if (y + 1 < height) enqueue(pixelIndex + width);
  }

  for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    if (visited[pixelIndex]) data[pixelIndex * 4 + 3] = 0;
  }

  return data;
}

async function extractPose(extract) {
  const { data, info } = await sharp(sourcePath)
    .extract(extract)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const isolated = removeConnectedBackground(data, info.width, info.height);

  return sharp(isolated, {
    raw: { channels: 4, height: info.height, width: info.width },
  })
    .trim({ background: { alpha: 0, b: 0, g: 0, r: 0 } })
    .resize({
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      fit: "contain",
      height: frameSize - frameInset * 2,
      kernel: sharp.kernel.lanczos3,
      width: frameSize - frameInset * 2,
    })
    .extend({
      background: { alpha: 0, b: 0, g: 0, r: 0 },
      bottom: frameInset,
      left: frameInset,
      right: frameInset,
      top: frameInset,
    })
    .png()
    .toBuffer();
}

const frames = await Promise.all(poses.map(extractPose));
const composites = frames.map((input, index) => ({ input, left: index * frameSize, top: 0 }));

await mkdir(dirname(outputPath), { recursive: true });
await sharp({
  create: {
    background: { alpha: 0, b: 0, g: 0, r: 0 },
    channels: 4,
    height: frameSize,
    width: frameSize * frames.length,
  },
})
  .composite(composites)
  .webp({ effort: 6, lossless: true })
  .toFile(outputPath);

const metadata = await sharp(outputPath).metadata();
console.log(
  JSON.stringify({
    format: metadata.format,
    frames: frames.length,
    hasAlpha: metadata.hasAlpha,
    height: metadata.height,
    outputPath,
    sourcePath,
    width: metadata.width,
  }),
);
