const { db } = require('../../database');

class BaseAgent {
  constructor(name, runId) {
    this.name = name;
    this.runId = runId;
    this.runRef = db.collection('runs').doc(runId);
  }

  /**
   * Log an event message to both console and the runs/{runId}/logs subcollection in Firestore.
   */
  async log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${this.name}] [${level.toUpperCase()}] ${message}`);
    
    try {
      await this.runRef.collection('logs').add({
        timestamp,
        agent: this.name,
        level,
        message
      });
    } catch (error) {
      console.error(`Failed to write log to Firestore for agent ${this.name}:`, error.message);
    }
  }

  /**
   * Update the status and fields of this agent's state in the run document.
   */
  async updateState(status, extraData = {}) {
    const timestamp = new Date().toISOString();
    const updatePayload = {};
    
    updatePayload[`agentStates.${this.name}.status`] = status;
    if (status === 'RUNNING') {
      updatePayload[`agentStates.${this.name}.startedAt`] = timestamp;
    } else if (status === 'COMPLETED' || status === 'FAILED') {
      updatePayload[`agentStates.${this.name}.completedAt`] = timestamp;
    }

    for (const [key, val] of Object.entries(extraData)) {
      updatePayload[`agentStates.${this.name}.${key}`] = val;
    }

    try {
      await this.runRef.update(updatePayload);
    } catch (error) {
      console.error(`Failed to update state for agent ${this.name}:`, error.message);
    }
  }

  /**
   * Entry point executed by the Orchestrator. Handles state transition updates automatically.
   */
  async run(sharedContext) {
    await this.updateState('RUNNING');
    await this.log('info', 'Started execution.');
    
    try {
      const output = await this.execute(sharedContext);
      await this.updateState('COMPLETED', { output, error: null });
      await this.log('info', 'Completed execution successfully.');
      return output;
    } catch (error) {
      await this.updateState('FAILED', { error: error.message });
      await this.log('error', `Execution failed: ${error.stack || error.message}`);
      throw error;
    }
  }

  /**
   * Abstract method: Subclasses must implement their business logic here.
   */
  async execute(sharedContext) {
    throw new Error('execute() must be implemented by child agent classes');
  }
}

module.exports = BaseAgent;
