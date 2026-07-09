const { compareImageVectors } = require('./src/utils/imageEmbedding');

(async () => {
  console.log('Loading model and comparing images... this may take a minute on first run.');
  
  try {
    const similarity = await compareImageVectors(
      './test-images/mockup.png',
      './test-images/actual-different-app.png'
    );
    
    console.log('Similarity score:', similarity);
  } catch (err) {
    console.error('Error running embedding comparison:', err);
  }
})();
