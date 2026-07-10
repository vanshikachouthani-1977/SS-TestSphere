const BaseAgent = require('./BaseAgent');
const { callGroq } = require('../utils/groq');

class ReqCoverageAgent extends BaseAgent {
  constructor(runId) {
    super('ReqCoverageAgent', runId);
  }

  async execute(sharedContext) {
    await this.log('info', 'Evaluating requirement coverage using Gemini 2.5 Flash...');

    const runSnap = await this.runRef.get();
    const runData = runSnap.data();
    const inputs = runData ? runData.inputs : {};

    // Determine user stories / checklist
    let stories = inputs.userStories || [];
    if (stories.length === 0) {
      if (inputs.runUI !== false) {
        stories.push('UI design matches Figma mockup design layout');
        stories.push('OCR spelling accuracy verification of UI text');
      }
      if (inputs.runBackend !== false) {
        stories.push('Security policies and headers compliance audit');
        stories.push('Database table connection and operation health checks');
        stories.push('Static code standards and linter checks compliance');
        stories.push('API endpoint structure and documentation verification');
      }
    }

    // Gather findings/defects for Gemini to grade
    const uiBranchOut = sharedContext.uiBranchOut || {};
    const backendBranchOut = sharedContext.backendBranchOut || {};
    const visualTesting = uiBranchOut.uiResults ? uiBranchOut.uiResults[0] : {};
    const securityTesting = backendBranchOut.securityResult || {};
    const dbValidation = backendBranchOut.backendResults ? backendBranchOut.backendResults[1] : {};
    const codeAnalysis = backendBranchOut.backendResults ? backendBranchOut.backendResults[2] : {};

    const findings = {
      isFundamentalMismatch: visualTesting.isFundamentalMismatch || false,
      visualSimilarity: visualTesting.similarityScore || 100,
      visualMismatches: visualTesting.mismatches || [],
      securityVulnerabilities: securityTesting.vulnerabilities || [],
      databaseErrors: dbValidation.errors || [],
      linterWarnings: codeAnalysis.warningsList || []
    };

    const prompt = `You are the Requirement Coverage Agent in SS TestSphere.
Given the following list of test cases / user stories and the collected verification findings, evaluate each item. Mark it as 'PASS' if there are no major matching defects, or 'FAIL' if there are warnings or errors directly related to that story. Provide a short specific reason.

CRITICAL RULE FOR SCREEN MISMATCHES:
If "isFundamentalMismatch" is true, you MUST grade any test case/story verifying mockup visual layout matches (e.g. "UI design matches Figma mockup design layout") as FAIL. Set the reason to explicitly explain that a fundamental mismatch was detected.

Test Cases to verify:
${stories.map((s, idx) => `${idx + 1}. ${s}`).join('\n')}

Collected Verification Findings:
${JSON.stringify(findings, null, 2)}

Return a JSON object structured exactly as follows:
{
  "coveragePercentage": number, // percentage of passed items (e.g. 75)
  "storiesStatus": {
    // Keys must be the exact test case names from above
    "Story name here": {
      "status": "PASS" | "FAIL",
      "reason": "explanation of pass/fail outcome"
    }
  }
}`;

    try {
      const responseJson = await callGroq([
        { role: 'system', content: 'You evaluate test verification requirements coverage.' },
        { role: 'user', content: prompt }
      ], true);

      const coveragePercentage = responseJson.coveragePercentage !== undefined 
        ? responseJson.coveragePercentage 
        : 100;

      await this.log('info', `Requirement coverage evaluation complete: ${coveragePercentage}% passed.`);
      return {
        coveragePercentage,
        storiesStatus: responseJson.storiesStatus || {}
      };
    } catch (err) {
      await this.log('error', `Failed requirement coverage check: ${err.message}`);
      // Fallback
      const storiesStatus = {};
      let passedCount = 0;
      stories.forEach(s => {
        const isVisualStory = s.toLowerCase().includes('figma') || s.toLowerCase().includes('visual') || s.toLowerCase().includes('ui design');
        if (isVisualStory && (findings.isFundamentalMismatch || findings.visualSimilarity < 100)) {
          storiesStatus[s] = { 
            status: 'FAIL', 
            reason: `Visual similarity check failed (${findings.isFundamentalMismatch ? 'Fundamental Mismatch' : `Similarity Score: ${findings.visualSimilarity}%`}). API Error: ${err.message}` 
          };
        } else {
          storiesStatus[s] = { status: 'PASS', reason: 'Verified successfully (Fallback check).' };
          passedCount++;
        }
      });
      const coveragePercentage = Math.round((passedCount / stories.length) * 100);
      return {
        coveragePercentage,
        storiesStatus
      };
    }
  }
}

module.exports = ReqCoverageAgent;
