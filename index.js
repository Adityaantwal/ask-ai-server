const express = require('express');
require('dotenv').config();

const app        = express();
const SECRET_KEY = process.env.SECRET_KEY || 'changeme123';
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const PORT       = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  if (req.path === '/ping') return next();
  const key = req.headers['x-secret-key'];
  if (key !== SECRET_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

app.get('/ping', (req, res) => res.send('OK'));

app.post('/ask', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${GEMINI_KEY}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: `You are a concise programming assistant used from a terminal.
- Always give working code with minimal explanation.
- Use the language the user implies or asks for.
- Keep answers short and direct, no fluff.
- For code questions: code first, brief explanation after.
- Use plain text only, no markdown headers.` }]
        },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048 }
      })
    });

     console.log('Gemini status:', geminiRes.status);
    const reader = geminiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) res.write(`data: ${JSON.stringify({ text })}\n\n`);
          }  catch(e) { console.error('PARSE ERR', e.message); }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (err) {
    res.write(`data: ${JSON.stringify({ text: `[Error]: ${err.message}` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`[stealth-ai] Server running on port ${PORT}`);
});
