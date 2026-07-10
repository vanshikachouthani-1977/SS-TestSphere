const { GoogleAuth } = require('google-auth-library');

let authInstance = null;

async function getVertexTokenAndProject() {
  if (!authInstance) {
    authInstance = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
  }
  const client = await authInstance.getClient();
  const projectId = await authInstance.getProjectId();
  const tokenResponse = await client.getAccessToken();
  return {
    projectId,
    token: tokenResponse.token
  };
}

async function callGemini(contents, jsonMode = false, systemInstruction = null) {
  // Format contents to match Gemini API structure if they are in role/content format
  let formattedContents = [];
  if (Array.isArray(contents)) {
    contents.forEach(msg => {
      if (msg.role && msg.content) {
        if (msg.role === 'system') {
          systemInstruction = msg.content;
          return;
        }
        
        if (typeof msg.content === 'string') {
          formattedContents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        } else if (Array.isArray(msg.content)) {
          const parts = [];
          msg.content.forEach(part => {
            if (part.type === 'text') {
              parts.push({ text: part.text });
            } else if (part.type === 'image_url' && part.image_url.url.startsWith('data:')) {
              const dataUrl = part.image_url.url;
              const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
              if (matches && matches.length === 3) {
                parts.push({
                  inlineData: {
                    mimeType: matches[1],
                    data: matches[2]
                  }
                });
              }
            }
          });
          formattedContents.push({
            role: 'user',
            parts: parts
          });
        }
      } else {
        formattedContents.push(msg);
      }
    });
  } else {
    formattedContents = contents;
  }

  const payload = {
    contents: formattedContents,
    generationConfig: {
      temperature: 0.2
    }
  };

  if (jsonMode) {
    payload.generationConfig.responseMimeType = 'application/json';
  }

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  // Obtain ADC Token and GCP Project ID
  const { projectId, token } = await getVertexTokenAndProject();
  const region = 'us-central1';
  const modelName = 'gemini-2.5-flash';

  const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/${modelName}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vertex AI error: Status ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
    throw new Error('Vertex AI returned an empty response candidate list.');
  }

  const content = data.candidates[0].content.parts[0].text;
  
  if (jsonMode) {
    try {
      return JSON.parse(content);
    } catch (err) {
      console.error('Failed to parse JSON response from Vertex AI:', content);
      throw new Error('Vertex AI returned invalid JSON: ' + err.message);
    }
  }

  return content;
}

module.exports = {
  callGemini
};
