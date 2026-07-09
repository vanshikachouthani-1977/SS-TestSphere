const { db } = require('./database');

async function testConnection() {
  console.log('Testing Firestore database connection...');
  const testCollection = '_connection_test_';
  const testDocId = 'test_doc_' + Date.now();
  const testDocRef = db.collection(testCollection).doc(testDocId);

  try {
    // 1. Write dummy document
    console.log(`Writing test document to collection: "${testCollection}" with ID: "${testDocId}"...`);
    await testDocRef.set({
      message: 'Connection test successful',
      timestamp: new Date().toISOString(),
      status: 'ok'
    });
    console.log('✓ Write operation successful.');

    // 2. Read the document back
    console.log('Reading test document back...');
    const docSnapshot = await testDocRef.get();
    if (!docSnapshot.exists) {
      throw new Error('Test document not found after write!');
    }
    console.log('✓ Read operation successful. Document content:', docSnapshot.data());

    // 3. Delete the document (clean up)
    console.log('Cleaning up: deleting test document...');
    await testDocRef.delete();
    console.log('✓ Cleanup/Delete operation successful.');

    console.log('\n=============================================');
    console.log('SUCCESS: Connected to Firestore database successfully!');
    console.log('=============================================');
  } catch (error) {
    console.error('\n=============================================');
    console.error('FAILURE: Could not verify connection to Firestore database.');
    console.error('Error Details:', error.message);
    console.error('=============================================');
    process.exit(1);
  }
}

testConnection();
