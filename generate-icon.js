const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_IMAGE = path.join(__dirname, 'icon.png');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function writePngTargets(image, size, targets) {
  const png = await image
    .clone()
    .resize(size, size, {
      fit: 'cover',
      position: 'centre',
    })
    .png()
    .toBuffer();

  for (const target of targets) {
    await fs.promises.writeFile(target, png);
  }
}

async function createIcon() {
  if (!fs.existsSync(SOURCE_IMAGE)) {
    throw new Error(`Source image not found: ${SOURCE_IMAGE}`);
  }

  const image = sharp(SOURCE_IMAGE);
  const rootDir = __dirname;
  const iconDir = path.join(rootDir, 'icon');
  const iconsetDir = path.join(rootDir, 'icon.iconset');
  const rendererDir = path.join(rootDir, 'src', 'renderer');

  ensureDir(iconDir);
  ensureDir(iconsetDir);
  ensureDir(rendererDir);

  const pngSizes = [16, 32, 64, 128, 256, 512];
  for (const size of pngSizes) {
    await writePngTargets(image, size, [path.join(iconDir, `${size}x${size}.png`)]);
    console.log(`Generated icon/${size}x${size}.png`);
  }

  const iconsetMap = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];

  for (const [size, filename] of iconsetMap) {
    await writePngTargets(image, size, [path.join(iconsetDir, filename)]);
  }

  await writePngTargets(image, 512, [
    path.join(rootDir, 'icon.png'),
    path.join(rendererDir, 'icon.png'),
  ]);

  console.log(`Generated all icon assets from ${SOURCE_IMAGE}`);
}

createIcon().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
