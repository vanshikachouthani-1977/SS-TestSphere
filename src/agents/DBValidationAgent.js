const BaseAgent = require('./BaseAgent');
const { db } = require('../../database');

class DBValidationAgent extends BaseAgent {
  constructor(runId) {
    super('DBValidationAgent', runId);
  }

  async execute(sharedContext) {
    await this.log('info', 'Performing integrity checks on transactional databases...');
    
    const testDocId = 'agent_db_test_' + Date.now();
    const testRef = db.collection('_connection_test_').doc(testDocId);
    
    try {
      await this.log('info', `Attempting write assertion to Firestore collection '_connection_test_/${testDocId}'...`);
      await testRef.set({
        agent: 'DBValidationAgent',
        runId: this.runId,
        timestamp: new Date().toISOString(),
        verified: true
      });
      await this.log('info', '✓ Write assertion successful.');

      await this.log('info', 'Attempting read assertion...');
      const snapshot = await testRef.get();
      if (!snapshot.exists) {
        throw new Error('Read verification failed: document not found.');
      }
      await this.log('info', '✓ Read assertion successful.');

      await this.log('info', 'Cleaning up assertion document...');
      await testRef.delete();
      await this.log('info', '✓ Cleanup successful.');

      return {
        recordsWrittenVerified: 1,
        connectionState: 'HEALTHY',
        databaseEngine: sharedContext.database || 'Firestore',
        errors: []
      };
    } catch (err) {
      await this.log('error', `Database assertion failed: ${err.message}`);
      return {
        recordsWrittenVerified: 0,
        connectionState: 'UNHEALTHY',
        databaseEngine: sharedContext.database || 'Firestore',
        errors: [err.message]
      };
    }
  }
}

module.exports = DBValidationAgent;
