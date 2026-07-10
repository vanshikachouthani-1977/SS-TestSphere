const BaseAgent = require('./BaseAgent');
const { callGroq } = require('../utils/groq');

class ReportGenAgent extends BaseAgent {
  constructor(runId) {
    super('ReportGenAgent', runId);
  }

  async execute(sharedContext) {
    await this.log('info', 'Compiling and summarizing multi-agent execution reports...');
    
    const uiBranchOut = sharedContext.uiBranchOut || {};
    const backendBranchOut = sharedContext.backendBranchOut || {};

    const codeAnalysis = backendBranchOut.backendResults ? backendBranchOut.backendResults[2] : {};
    const dbValidation = backendBranchOut.backendResults ? backendBranchOut.backendResults[1] : {};
    const securityTesting = backendBranchOut.securityResult || {};
    const visualTesting = uiBranchOut.uiResults ? uiBranchOut.uiResults[0] : {};
    const rcaResult = sharedContext.rcaResult || {};

    let qualityScore = 100;
    const defects = [];
    const scoreDeductions = [];

    // Compile Code Analysis warnings/errors
    if (codeAnalysis.warningsList && codeAnalysis.warningsList.length > 0) {
      const deduction = codeAnalysis.warningsList.length * 2;
      qualityScore -= deduction;
      scoreDeductions.push({
        module: 'Backend & Code Verification (Linter)',
        deduction,
        reason: `Found ${codeAnalysis.warningsList.length} code linter violations (deducted 2% per violation).`
      });
      for (const warn of codeAnalysis.warningsList) {
        defects.push({
          type: 'lint',
          file: warn.file,
          severity: warn.severity,
          message: warn.message
        });
      }
    }

    // Compile Security vulnerabilities
    if (securityTesting.vulnerabilities && securityTesting.vulnerabilities.length > 0) {
      const deduction = securityTesting.vulnerabilities.length * 10;
      qualityScore -= deduction;
      scoreDeductions.push({
        module: 'Backend & Code Verification (Security Audit)',
        deduction,
        reason: `Found ${securityTesting.vulnerabilities.length} code security vulnerability findings (deducted 10% per finding).`
      });
      for (const vuln of securityTesting.vulnerabilities) {
        defects.push({
          type: 'security',
          file: vuln.file,
          severity: vuln.severity,
          message: vuln.description
        });
      }
    }

    // Compile Database errors
    if (dbValidation.errors && dbValidation.errors.length > 0) {
      const deduction = dbValidation.errors.length * 20;
      qualityScore -= deduction;
      scoreDeductions.push({
        module: 'Backend & Code Verification (Database Health)',
        deduction,
        reason: `Found ${dbValidation.errors.length} database connection/operation failures (deducted 20% per failure).`
      });
      for (const err of dbValidation.errors) {
        defects.push({
          type: 'database',
          file: 'Firestore Connection',
          severity: 'error',
          message: err
        });
      }
    }
    // Compile Visual mismatches using the severity weighting engine
    if (visualTesting.similarityScore !== undefined && visualTesting.similarityScore < 100) {
      const deduction = 100 - visualTesting.similarityScore;
      qualityScore -= deduction;
      
      const reasons = [];
      if (visualTesting.isFundamentalMismatch) {
        reasons.push('Fundamental Mismatch: images do not represent the same page (flat 70% deduction).');
      } else if (visualTesting.mismatches && visualTesting.mismatches.length > 0) {
        // Group counts by severity
        const counts = {};
        visualTesting.mismatches.forEach(m => {
          counts[m.severity] = (counts[m.severity] || 0) + 1;
        });
        const detailsStr = Object.entries(counts).map(([sev, cnt]) => `${cnt} ${sev}`).join(', ');
        reasons.push(`Detected visual mismatches (${detailsStr}) calculated using severity weighting.`);
      }

      scoreDeductions.push({
        module: 'UI Verification (Visual Similarity)',
        deduction,
        reason: reasons.join(' ') || 'Visual similarity score below 100%.'
      });

      if (visualTesting.isFundamentalMismatch) {
        defects.push({
          type: 'visual',
          file: 'Figma Mockup Comparison',
          severity: 'Critical',
          message: 'Fundamental Mismatch: The live app page implementation is completely different from the expected Figma mockup design.'
        });
      }

      if (visualTesting.mismatches) {
        for (const mis of visualTesting.mismatches) {
          defects.push({
            type: 'visual',
            file: mis.file || 'Figma Mockup Comparison',
            severity: mis.severity || 'medium',
            message: mis.message
          });
        }
      }
    }
    if (qualityScore < 0) qualityScore = 0;

    const hasHighVuln = defects.some(d => d.type === 'security' && d.severity === 'high');
    const deploymentRecommendation = (qualityScore >= 85 && !hasHighVuln) ? 'GO' : 'NO_GO';

    await this.log('info', `Computed local metrics: Quality Score: ${qualityScore}%, Defects: ${defects.length}`);

    const runSnap = await this.runRef.get();
    const runData = runSnap.data();
    const inputs = runData ? runData.inputs : {};

    const summaryPrompt = `You are the Report-Generation Agent in SS TestSphere. 
Given the following test run summary metrics, compile a premium 1-2 sentence executive summary explaining the quality of the project.
Make sure to mention in the summary if any testing branches were skipped (UI Verification Skipped: ${inputs.runUI === false}, Backend/Code Verification Skipped: ${inputs.runBackend === false}).

Metrics:
- Quality Score: ${qualityScore}%
- Recommendation: ${deploymentRecommendation}
- Defect Count: ${defects.length}
- Defects Details: ${JSON.stringify(defects, null, 2)}
- RCA Remediations Suggested: ${JSON.stringify(rcaResult.remediations || [], null, 2)}`;

    let summaryText = `All parallel and secondary testing stages completed. The application attained a quality score of ${qualityScore}%.`;
    try {
      summaryText = await callGroq([
        { role: 'system', content: 'You write concise, executive summaries for software build reports.' },
        { role: 'user', content: summaryPrompt }
      ], false);
    } catch (error) {
      await this.log('error', `Failed to generate dynamic summary from Gemini: ${error.message}`);
    }

    const output = {
      qualityScore,
      deploymentRecommendation,
      summary: summaryText.trim(),
      defectsCount: defects.length,
      defects,
      scoreDeductions,
      reqCoverage: sharedContext.reqCoverageResult || { coveragePercentage: 100, storiesStatus: {} }
    };

    // Write the report details to the main runs document
    await this.runRef.update({
      report: output,
      completedAt: new Date().toISOString(),
      status: 'COMPLETED'
    });

    await this.log('info', `Consolidated report created. Final Quality Score: ${output.qualityScore}%. Recommendation: ${output.deploymentRecommendation}`);
    return output;
  }
}

module.exports = ReportGenAgent;
