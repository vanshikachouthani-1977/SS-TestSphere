/**
 * Utility helper to make requests to the Gemini API
 */
const fs = require('fs');

async function callGemini(contents, jsonMode = false, systemInstruction = null) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }

  // Format contents to match Gemini API structure if they are in role/content format
  let formattedContents = [];
  if (Array.isArray(contents)) {
    contents.forEach(msg => {
      // If messages are in openai format: { role, content }
      if (msg.role && msg.content) {
        // System prompt is handled separately in Gemini
        if (msg.role === 'system') {
          systemInstruction = msg.content;
          return;
        }
        
        // Handle content as text string or array (vision)
        if (typeof msg.content === 'string') {
          formattedContents.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
          });
        } else if (Array.isArray(msg.content)) {
          // Vision/multimodal payload
          const parts = [];
          msg.content.forEach(part => {
            if (part.type === 'text') {
              parts.push({ text: part.text });
            } else if (part.type === 'image_url' && part.image_url.url.startsWith('data:')) {
              // Extract base64 details
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

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: Status ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
    throw new Error('Gemini API returned an empty response candidate list.');
  }

  const content = data.candidates[0].content.parts[0].text;
  
  if (jsonMode) {
    try {
      return JSON.parse(content);
    } catch (err) {
      console.error('Failed to parse JSON response from Gemini:', content);
      throw new Error('Gemini returned invalid JSON: ' + err.message);
    }
  }

  return content;
}

module.exports = {
  callGemini
};
