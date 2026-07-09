const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');
const sharp = require('sharp');

async function compareStructuralSimilarity(imagePathA, imagePathB) {
  const targetWidth = 800;
  const targetHeight = 1000;

  const bufferA = await sharp(imagePathA).resize(targetWidth, targetHeight, { fit: 'fill' }).png().toBuffer();
  const bufferB = await sharp(imagePathB).resize(targetWidth, targetHeight, { fit: 'fill' }).png().toBuffer();

  const imgA = PNG.sync.read(bufferA);
  const imgB = PNG.sync.read(bufferB);

  const diff = new PNG({ width: targetWidth, height: targetHeight });
  const numDiffPixels = pixelmatch(
    imgA.data, imgB.data, diff.data, targetWidth, targetHeight, { threshold: 0.1 }
  );

  const totalPixels = targetWidth * targetHeight;
  const structuralSimilarity = 1 - (numDiffPixels / totalPixels);

  return structuralSimilarity;
}

module.exports = { compareStructuralSimilarity };
