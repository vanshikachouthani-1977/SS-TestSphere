const { db } = require('../database');

// Import all downstream agents
const AppUnderstandingAgent = require('./agents/AppUnderstandingAgent');
const VisualTestingAgent = require('./agents/VisualTestingAgent');
const OCRTestingAgent = require('./agents/OCRTestingAgent');
const FunctionalUIAgent = require('./agents/FunctionalUIAgent');
const UserFlowAgent = require('./agents/UserFlowAgent');
const BackendAPIAgent = require('./agents/BackendAPIAgent');
const DBValidationAgent = require('./agents/DBValidationAgent');
const CodeAnalysisAgent = require('./agents/CodeAnalysisAgent');
const AITestGenAgent = require('./agents/AITestGenAgent');
const SecurityTestingAgent = require('./agents/SecurityTestingAgent');
const PerformanceTestingAgent = require('./agents/PerformanceTestingAgent');
const ReqCoverageAgent = require('./agents/ReqCoverageAgent');
const RCAAgent = require('./agents/RCAAgent');
const ReportGenAgent = require('./agents/ReportGenAgent');

class Orchestrator {
  constructor() {
    this.agentNames = [
      'AppUnderstandingAgent',
      'VisualTestingAgent',
      'OCRTestingAgent',
      'FunctionalUIAgent',
      'UserFlowAgent',
      'BackendAPIAgent',
      'DBValidationAgent',
      'CodeAnalysisAgent',
      'AITestGenAgent',
      'SecurityTestingAgent',
      'PerformanceTestingAgent',
      'ReqCoverageAgent',
      'RCAAgent',
      'ReportGenAgent'
    ];
  }

  /**
   * Log orchestrator-level execution logs to Firestore
   */
  async log(runId, level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[Orchestrator] [${level.toUpperCase()}] ${message}`);
    try {
      await db.collection('runs').doc(runId).collection('logs').add({
        timestamp,
        agent: 'Orchestrator',
        level,
        message
      });
    } catch (err) {
      console.error('Failed to write Orchestrator log to Firestore:', err.message);
    }
  }

  /**
   * Execute the multi-agent QA verification pipeline
   */
  async run(inputs, customRunId = null) {
    const runId = customRunId || ('run_' + Date.now());
    const runRef = db.collection('runs').doc(runId);
    
    // Initialize initial state in Firestore
    const agentStates = {};
    for (const name of this.agentNames) {
      agentStates[name] = {
        status: 'PENDING',
        startedAt: null,
        completedAt: null,
        error: null,
        output: null
      };
    }

    await runRef.set({
      id: runId,
      status: 'IN_PROGRESS',
      inputs,
      startedAt: new Date().toISOString(),
      completedAt: null,
      agentStates,
      report: null
    });

    await this.log(runId, 'info', `Initialized run ${runId} with inputs: ${JSON.stringify(inputs)}`);

    try {
      // Step 1: Run Application Understanding Agent
      await this.log(runId, 'info', 'Step 1: Running Application Understanding Agent...');
      const appUnderstanding = new AppUnderstandingAgent(runId);
      const appUnderstandingContext = await appUnderstanding.run({
        userStories: inputs.userStories
      });

      // Step 2: Fork into UI and Backend/Logic branches in parallel
      await this.log(runId, 'info', 'Step 2: Forking execution into parallel UI and Backend validation branches...');

      // UI Branch definition
      const runUIBranch = async () => {
        await this.log(runId, 'info', 'UI Branch: Starting UI parallel agents (Visual, OCR, Functional, User-Flow)...');
        
        const visualAgent = new VisualTestingAgent(runId);
        const ocrAgent = new OCRTestingAgent(runId);
        const functionalAgent = new FunctionalUIAgent(runId);
        const userFlowAgent = new UserFlowAgent(runId);

        const uiResults = await Promise.all([
          visualAgent.run(appUnderstandingContext),
          ocrAgent.run(appUnderstandingContext),
          functionalAgent.run(appUnderstandingContext),
          userFlowAgent.run(appUnderstandingContext)
        ]);

        return { uiResults };
      };

      // Backend/Logic Branch definition
      const runBackendBranch = async () => {
        await this.log(runId, 'info', 'Backend Branch: Starting Backend/Logic parallel agents (API, DB, CodeAnalysis, AITestGen)...');
        
        const apiAgent = new BackendAPIAgent(runId);
        const dbAgent = new DBValidationAgent(runId);
        const codeAgent = new CodeAnalysisAgent(runId);
        const aiTestAgent = new AITestGenAgent(runId);

        const backendResults = await Promise.all([
          apiAgent.run(appUnderstandingContext),
          dbAgent.run(appUnderstandingContext),
          codeAgent.run(appUnderstandingContext),
          aiTestAgent.run(appUnderstandingContext)
        ]);

        await this.log(runId, 'info', 'Backend Branch: Backend parallel agents complete. Starting Performance Agent...');
        const performanceAgent = new PerformanceTestingAgent(runId);
        const performanceResult = await performanceAgent.run({
          appUnderstandingContext,
          backendResults: {
            api: backendResults[0],
            db: backendResults[1],
            codeAnalysis: backendResults[2],
            aiTestGen: backendResults[3]
          }
        });

        await this.log(runId, 'info', 'Backend Branch: Starting Security Agent...');
        const securityAgent = new SecurityTestingAgent(runId);
        const securityResult = await securityAgent.run({
          appUnderstandingContext
        });

        return { backendResults, performanceResult, securityResult };
      };

      // Check branch flags and set skipped states in Firestore
      const skippedAgentStates = {};
      const timestamp = new Date().toISOString();

      if (inputs.runUI === false) {
        const uiAgents = ['VisualTestingAgent', 'OCRTestingAgent', 'FunctionalUIAgent', 'UserFlowAgent'];
        uiAgents.forEach(name => {
          skippedAgentStates[`agentStates.${name}.status`] = 'SKIPPED';
          skippedAgentStates[`agentStates.${name}.completedAt`] = timestamp;
        });
      }

      if (inputs.runBackend === false) {
        const backendAgents = ['BackendAPIAgent', 'DBValidationAgent', 'CodeAnalysisAgent', 'AITestGenAgent', 'PerformanceTestingAgent', 'SecurityTestingAgent'];
        backendAgents.forEach(name => {
          skippedAgentStates[`agentStates.${name}.status`] = 'SKIPPED';
          skippedAgentStates[`agentStates.${name}.completedAt`] = timestamp;
        });
      }

      if (Object.keys(skippedAgentStates).length > 0) {
        await runRef.update(skippedAgentStates);
      }

      // Execute branches conditionally in parallel
      const uiPromise = inputs.runUI !== false 
        ? runUIBranch() 
        : (async () => {
            await this.log(runId, 'info', 'UI Validation Branch: Skipped by user configuration.');
            return null;
          })();

      const backendPromise = inputs.runBackend !== false 
        ? runBackendBranch() 
        : (async () => {
            await this.log(runId, 'info', 'Backend/Logic Validation Branch: Skipped by user configuration.');
            return null;
          })();

      const [uiBranchOut, backendBranchOut] = await Promise.all([
        uiPromise,
        backendPromise
      ]);

      await this.log(runId, 'info', 'Step 3: UI and Backend validation branches complete. Merging results...');

      // Step 3: Requirement Coverage Agent
      await this.log(runId, 'info', 'Step 4: Running Requirement Coverage Agent...');
      const reqCoverageAgent = new ReqCoverageAgent(runId);
      const reqCoverageResult = await reqCoverageAgent.run({
        appUnderstandingContext,
        uiBranchOut,
        backendBranchOut
      });

      // Step 4: Root-Cause Analysis (RCA) Agent
      await this.log(runId, 'info', 'Step 5: Running Root-Cause Analysis (RCA) Agent...');
      const rcaAgent = new RCAAgent(runId);
      const rcaResult = await rcaAgent.run({
        reqCoverageResult,
        uiBranchOut,
        backendBranchOut
      });

      // Step 5: Report Generation Agent (Marks status as COMPLETED)
      await this.log(runId, 'info', 'Step 6: Running Report-Generation Agent to finalize consolidated QA report...');
      const reportGenAgent = new ReportGenAgent(runId);
      const finalReport = await reportGenAgent.run({
        inputs,
        appUnderstandingContext,
        uiBranchOut,
        backendBranchOut,
        reqCoverageResult,
        rcaResult
      });

      await this.log(runId, 'info', `Run ${runId} execution completed successfully.`);
      return { runId, finalReport };

    } catch (error) {
      await this.log(runId, 'error', `Pipeline execution failed: ${error.stack || error.message}`);
      await runRef.update({
        status: 'FAILED',
        completedAt: new Date().toISOString()
      });
      throw error;
    }
  }
}

module.exports = Orchestrator;
