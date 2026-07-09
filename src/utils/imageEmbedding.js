const { pipeline, RawImage } = require('@xenova/transformers');

let embedderInstance = null;

/**
 * Loads the CLIP model once and reuses it (avoids reloading on every call)
 */
async function getEmbedder() {
  if (!embedderInstance) {
    embedderInstance = await pipeline(
      'image-feature-extraction',
      'Xenova/clip-vit-base-patch32'
    );
  }
  return embedderInstance;
}

/**
 * Generates a vector embedding for a single image
 */
async function getImageEmbedding(imagePath) {
  const embedder = await getEmbedder();
  const image = await RawImage.read(imagePath);
  const output = await embedder(image, { pooling: 'mean', normalize: true });
  return output.data;
}

/**
 * Computes cosine similarity between two embedding vectors
 */
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Main function: compares two images and returns similarity score
 */
async function compareImageVectors(imagePathA, imagePathB) {
  const [embeddingA, embeddingB] = await Promise.all([
    getImageEmbedding(imagePathA),
    getImageEmbedding(imagePathB)
  ]);

  const similarity = cosineSimilarity(embeddingA, embeddingB);
  return similarity;
}

const fs = require('fs');
const path = require('path');
const os = require('os');

function saveBase64ToTempFile(base64Data, prefix) {
  const cleanBase64 = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');
  const tempPath = path.join(os.tmpdir(), `${prefix}_${Date.now()}.png`);
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
}

module.exports = {
  getImageEmbedding,
  cosineSimilarity,
  compareImageVectors,
  saveBase64ToTempFile
};
