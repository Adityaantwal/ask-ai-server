const express    = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
require('dotenv').config();

const app    = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SECRET_KEY = process.env.SECRET_KEY || 'changeme123';
const PORT       = process.env.PORT || 3000;

app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  const key = req.headers['x-secret-key'];
  if (key !== SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Health check (no auth needed)
app.get('/ping', (req, res) => res.send('OK'));

// Main ask endpoint — streams response back
app.post('/ask', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = client.messages.stream({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system:     `You are a concise programming assistant used from a terminal.
- Always give working code with minimal explanation.
- Use the language the user implies or asks for.
- Keep answers short and direct — no fluff.
- For code questions: code first, brief explanation after.
- Use plain text only, no markdown headers.`,
      messages: [{ role: 'user', content: prompt }],
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    stream.on('finalMessage', () => {
      res.write('data: [DONE]\n\n');
      res.end();
    });

    stream.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ text: `\n[Error]: ${err.message}` })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    });

  } catch (err) {
    res.write(`data: ${JSON.stringify({ text: `[Error]: ${err.message}` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n[stealth-ai] Server running on port ${PORT}`);
  console.log(`[stealth-ai] Secret key: ${SECRET_KEY}\n`);
});
