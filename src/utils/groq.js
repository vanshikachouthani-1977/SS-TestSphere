/**
 * Utility helper to make requests to the Gemini API (aliased as callGroq for backward compatibility)
 */
async function callGroq(messages, jsonMode = false, model = 'gemini-2.5-flash') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in environment variables.');
  }

  // Convert {role, content} messages into a single prompt or Gemini's `contents` format.
  let systemInstruction = null;
  const contents = [];

  messages.forEach(msg => {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
      return;
    }

    const parts = [];
    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
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
    }

    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: parts
    });
  });

  const payload = {
    contents: contents,
    generationConfig: {
      temperature: 0.2,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {})
    }
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: Status ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
    throw new Error('Gemini API returned an empty candidate list.');
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
  callGroq
};
