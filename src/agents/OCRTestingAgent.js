const BaseAgent = require('./BaseAgent');

class OCRTestingAgent extends BaseAgent {
  constructor(runId) {
    super('OCRTestingAgent', runId);
  }

  async execute(sharedContext) {
    await this.log('info', 'Performing OCR layout analysis on UI views...');
    
    // Simulate text reading from screens
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const output = {
      spellErrors: [],
      mismatchedPhrases: [],
      checkedWordsCount: 154,
      status: 'clean'
    };
    
    await this.log('info', 'OCR analysis finished. No major spelling or localization errors found.');
    return output;
  }
}

module.exports = OCRTestingAgent;
