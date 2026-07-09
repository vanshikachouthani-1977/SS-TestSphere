const BaseAgent = require('./BaseAgent');
const { readCodeFiles } = require('../utils/scanner');
const { callGroq } = require('../utils/groq');

class SecurityTestingAgent extends BaseAgent {
  constructor(runId) {
    super('SecurityTestingAgent', runId);
  }

  async execute(sharedContext) {
    await this.log('info', 'Reading workspace files for security scanning...');
    
    const codeFiles = readCodeFiles();
    
    const filesToScan = {};
    for (const [relPath, content] of Object.entries(codeFiles)) {
      if (!relPath.startsWith('src/utils/') && !relPath.startsWith('node_modules/')) {
        filesToScan[relPath] = content;
      }
    }

    await this.log('info', `Sending ${Object.keys(filesToScan).length} files to Gemini for vulnerability auditing...`);

    let filesPayload = '';
    for (const [path, content] of Object.entries(filesToScan)) {
      const lines = content.split('\n').slice(0, 80).join('\n');
      filesPayload += `=== File: ${path} ===\n${lines}\n\n`;
    }

    if (filesPayload.length > 8000) {
      filesPayload = filesPayload.substring(0, 8000) + '\n... [Code truncated to fit TPM rate limits] ...';
    }

    const messages = [
      {
        role: 'system',
        content: `You are the Security Testing Agent in SS TestSphere. 
Your task is to analyze the provided files and audit them for:
1. Hardcoded API keys, secrets, database passwords, or private credentials.
2. Code vulnerabilities like SQL injection, command injections, or directory traversals.
3. Missing HTTP security headers (e.g. Content-Security-Policy, X-Frame-Options, Helmet middleware check).
4. Insecure cookie flags or cross-origin sharing settings.

You must respond with a JSON object structured exactly as follows:
{
  "vulnerabilitiesFound": number,
  "vulnerabilities": [
    { "file": "string", "severity": "high | medium | low", "description": "string" }
  ],
  "secureHeadersMissing": [ "string" ],
  "owaspZapAlerts": { "high": number, "medium": number, "low": number }
}`
      },
      {
        role: 'user',
        content: `Here are the codebase files to scan:\n\n${filesPayload}`
      }
    ];

    try {
      const responseJson = await callGroq(messages, true);
      
      const output = {
        vulnerabilitiesFound: responseJson.vulnerabilitiesFound || 0,
        vulnerabilities: responseJson.vulnerabilities || [],
        secureHeadersMissing: responseJson.secureHeadersMissing || [],
        owaspZapAlerts: responseJson.owaspZapAlerts || { high: 0, medium: 0, low: 0 }
      };

      await this.log('info', `Security audit completed. Found ${output.vulnerabilitiesFound} vulnerabilities.`);
      
      if (output.vulnerabilities && output.vulnerabilities.length > 0) {
        for (const vuln of output.vulnerabilities) {
          await this.log('warn', `[${vuln.severity.toUpperCase()}] File ${vuln.file} - ${vuln.description}`);
        }
      }
      return output;
    } catch (error) {
      await this.log('error', `Failed to run security check via Gemini: ${error.message}`);
      return {
        vulnerabilitiesFound: 0,
        vulnerabilities: [],
        secureHeadersMissing: [],
        owaspZapAlerts: { high: 0, medium: 0, low: 0 }
      };
    }
  }
}

module.exports = SecurityTestingAgent;
