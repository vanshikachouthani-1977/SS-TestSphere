const BaseAgent = require('./BaseAgent');
const { callGroq } = require('../utils/groq');

class RCAAgent extends BaseAgent {
  constructor(runId) {
    super('RCAAgent', runId);
  }

  async execute(sharedContext) {
    await this.log('info', 'Correlating frontend, backend, and database test logs for root-cause analysis...');
    
    // Extract upstream branch outputs safely
    const uiBranchOut = sharedContext.uiBranchOut || {};
    const backendBranchOut = sharedContext.backendBranchOut || {};

    const codeAnalysis = backendBranchOut.backendResults ? backendBranchOut.backendResults[2] : {};
    const dbValidation = backendBranchOut.backendResults ? backendBranchOut.backendResults[1] : {};
    const securityTesting = backendBranchOut.securityResult || {};
    
    const warnings = [
      ...(codeAnalysis.warningsList || []),
      ...(securityTesting.vulnerabilities || []).map(v => ({ severity: v.severity, message: `Security [${v.severity}]: ${v.file} - ${v.description}` })),
      ...(dbValidation.errors || []).map(e => ({ severity: 'error', message: `Database: ${e}` }))
    ];

    if (warnings.length === 0) {
      await this.log('info', 'RCA cross-layer correlation finished. No regression failure anomalies detected.');
      return { detectedAnomalies: 0, rootCauses: [], remediations: [] };
    }

    await this.log('info', `Found ${warnings.length} warning(s)/error(s). Sending to Gemini for correlation and remediation generation...`);

    const messages = [
      {
        role: 'system',
        content: `You are the Root-Cause Analysis (RCA) Agent in SS TestSphere. 
Your task is to analyze a list of warnings, lint messages, database issues, or security findings in the codebase, and:
1. Explain the root causes of the issues.
2. Group related issues together.
3. Recommend specific remediation steps.

You must respond with a JSON object structured exactly as follows:
{
  "detectedAnomalies": number,
  "rootCauses": [
    { "issue": "string", "reason": "string" }
  ],
  "remediations": [ "string" ]
}`
      },
      {
        role: 'user',
        content: `Here are the warning logs collected from testing:\n\n${JSON.stringify(warnings, null, 2)}`
      }
    ];

    try {
      const responseJson = await callGroq(messages, true);
      await this.log('info', `RCA scan finished. Identified ${responseJson.detectedAnomalies} anomaly classes.`);
      return responseJson;
    } catch (error) {
      await this.log('error', `Failed to correlate root causes via Gemini: ${error.message}`);
      return {
        detectedAnomalies: warnings.length,
        rootCauses: warnings.map(w => ({ issue: w.message || 'Warning', reason: 'Failed static verification check.' })),
        remediations: ['Fix all linter and security warnings.']
      };
    }
  }
}

module.exports = RCAAgent;
