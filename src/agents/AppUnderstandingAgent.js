const BaseAgent = require('./BaseAgent');
const { scanWorkspace, readCodeFiles } = require('../utils/scanner');
const { callGroq } = require('../utils/groq');

class AppUnderstandingAgent extends BaseAgent {
  constructor(runId) {
    super('AppUnderstandingAgent', runId);
  }

  async execute(sharedContext) {
    await this.log('info', 'Scanning workspace directory and reading configuration files...');
    
    const files = scanWorkspace();
    const codeFiles = readCodeFiles();
    
    await this.log('info', `Found ${files.length} non-ignored files. Sending to Groq for architectural analysis...`);

    const fileListStr = files.map(f => `- ${f.relPath} (${(f.size / 1024).toFixed(2)} KB)`).join('\n');
    
    let packageJsonContent = codeFiles['package.json'] || 'No package.json found';

    const messages = [
      {
        role: 'system',
        content: `You are the Application Understanding Agent of SS TestSphere. 
Your task is to analyze the codebase structure and config file contents, and extract:
1. The web framework/runtime.
2. The database engines used.
3. The authentication methods used.
4. Active REST/GraphQL API endpoints.
5. A brief summary of the application architecture.

You must respond with a JSON object structured exactly as follows:
{
  "framework": "string",
  "database": "string",
  "auth": "string",
  "apis": [
    { "path": "string", "method": "string" }
  ],
  "architectureSummary": "string"
}`
      },
      {
        role: 'user',
        content: `Here is the list of files in the workspace:
${fileListStr}

Here is the package.json content:
${packageJsonContent}

Please analyze and return the architectural context object.`
      }
    ];

    try {
      const responseJson = await callGroq(messages, true);
      
      const context = {
        framework: responseJson.framework || 'Unknown',
        database: responseJson.database || 'Unknown',
        auth: responseJson.auth || 'Unknown',
        apis: responseJson.apis || [],
        architectureSummary: responseJson.architectureSummary || '',
        userStories: sharedContext.userStories || [],
        timestamp: new Date().toISOString()
      };

      await this.log('info', `Analysis complete. Identified framework: ${context.framework}, DB: ${context.database}.`);
      return context;
    } catch (error) {
      await this.log('error', `Failed to get dynamic analysis from Gemini: ${error.message}. Using fallback metadata.`);
      return {
        framework: 'Node.js (Express)',
        database: 'Firestore',
        auth: 'Firebase Auth',
        apis: [
          { path: '/api/v1/auth/login', method: 'POST' },
          { path: '/api/v1/users/register', method: 'POST' }
        ],
        architectureSummary: 'A Node.js backend project with Firebase integrations.',
        userStories: sharedContext.userStories || [],
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = AppUnderstandingAgent;
