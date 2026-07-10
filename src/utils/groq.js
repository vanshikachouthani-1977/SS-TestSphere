const { callGemini } = require('./gemini');

/**
 * Utility helper to make requests to the Vertex AI API (aliased as callGroq for backward compatibility)
 */
async function callGroq(messages, jsonMode = false, model = 'gemini-2.5-flash') {
  return callGemini(messages, jsonMode);
}

module.exports = {
  callGroq
};
