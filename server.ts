import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 80;

// Increase limit to accommodate large base64 images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());

const HISTORY_DIR = path.join(__dirname, 'history');
const HISTORY_INDEX_FILE = path.join(HISTORY_DIR, 'history.json');

// Ensure history directory and index file exist
if (!fs.existsSync(HISTORY_DIR)) {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
}
if (!fs.existsSync(HISTORY_INDEX_FILE)) {
  fs.writeFileSync(HISTORY_INDEX_FILE, JSON.stringify([]));
}

function getHistoryIndex() {
  try {
    const data = fs.readFileSync(HISTORY_INDEX_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveHistoryIndex(indexData: any) {
  fs.writeFileSync(HISTORY_INDEX_FILE, JSON.stringify(indexData, null, 2));
}

// IP Limiter logic for OpenRouter
const USAGE_DIR = path.join(__dirname, 'usage');
const USAGE_FILE = path.join(USAGE_DIR, 'limits.json');
const MAX_REQUESTS_PER_DAY = 5;

if (!fs.existsSync(USAGE_DIR)) {
  fs.mkdirSync(USAGE_DIR, { recursive: true });
}
if (!fs.existsSync(USAGE_FILE)) {
  fs.writeFileSync(USAGE_FILE, JSON.stringify({}));
}

function checkAndIncrementLimit(ip: string): boolean {
  try {
    const data = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8'));
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    if (!data[ip]) data[ip] = {};
    if (!data[ip][today]) data[ip][today] = 0;
    
    if (data[ip][today] >= MAX_REQUESTS_PER_DAY) {
      return false;
    }
    
    data[ip][today]++;
    fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    return true; // fail open if tracking breaks
  }
}

// GET list of sessions
app.get('/api/history', (req, res) => {
  const index = getHistoryIndex();
  res.json(index);
});

// GET config
app.get('/api/config', (req, res) => {
  res.json({
    DEFAULT_OPENROUTER_MODEL: process.env.DEFAULT_OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-preview-02-05:free'
  });
});

// GET specific session data
app.get('/api/history/:id', (req, res) => {
  const { id } = req.params;
  const sessionDir = path.join(HISTORY_DIR, id);
  const sessionFile = path.join(sessionDir, 'session_data.json');
  
  if (fs.existsSync(sessionFile)) {
    try {
      const data = fs.readFileSync(sessionFile, 'utf-8');
      res.json(JSON.parse(data));
    } catch (err) {
      res.status(500).json({ error: 'Failed to read session data' });
    }
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// POST save/update a session
app.post('/api/history', (req, res) => {
  const session = req.body;
  if (!session || !session.id) {
    return res.status(400).json({ error: 'Invalid session data' });
  }

  const { id, title, date, messages, finalPrompt } = session;
  const sessionDir = path.join(HISTORY_DIR, id);
  
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  // Save full session data
  const sessionFile = path.join(sessionDir, 'session_data.json');
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));

  // Save prompt specifically for easy reading
  if (finalPrompt) {
    fs.writeFileSync(path.join(sessionDir, 'prompt.md'), finalPrompt);
  }

  // Save chat history
  if (messages && Array.isArray(messages)) {
    const chatHistory = messages.map((m: any) => `**${m.role === 'user' ? 'User' : 'Assistant'}**:\n${m.content || '[Image/Options]'}`).join('\n\n---\n\n');
    fs.writeFileSync(path.join(sessionDir, 'chat_history.md'), chatHistory);
  }

  // Update history index
  const index = getHistoryIndex();
  const existingIdx = index.findIndex((s: any) => s.id === id);
  const indexEntry = { id, title, date, finalPrompt }; // Exclude heavy messages for index
  
  if (existingIdx >= 0) {
    index[existingIdx] = indexEntry;
  } else {
    index.unshift(indexEntry);
  }
  saveHistoryIndex(index);

  res.json({ success: true, session: indexEntry });
});

// DELETE a session
app.delete('/api/history/:id', (req, res) => {
  const { id } = req.params;
  const sessionDir = path.join(HISTORY_DIR, id);
  
  if (fs.existsSync(sessionDir)) {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  }

  const index = getHistoryIndex();
  const newIndex = index.filter((s: any) => s.id !== id);
  saveHistoryIndex(newIndex);

  res.json({ success: true });
});

// POST OpenRouter Chat
app.post('/api/chat/openrouter', async (req, res) => {
  const { messages, model, customApiKey, masterCode } = req.body;
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  let apiKeyToUse = customApiKey;

  if (!apiKeyToUse) {
    // If no custom key, check master code
    if (masterCode && masterCode === process.env.MASTER_CODE) {
      apiKeyToUse = process.env.OPENROUTER_API_KEY;
    } else {
      // If no master code, check limits
      const isAllowed = checkAndIncrementLimit(clientIp);
      if (!isAllowed) {
        return res.status(429).json({ error: 'LIMIT_REACHED' });
      }
      apiKeyToUse = process.env.OPENROUTER_API_KEY;
    }
  }

  if (!apiKeyToUse) {
    return res.status(500).json({ error: 'Server is missing OpenRouter API Key.' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyToUse}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://promptsmith.app',
        'X-Title': 'Promptsmith'
      },
      body: JSON.stringify({
        model: model || process.env.DEFAULT_OPENROUTER_MODEL || 'google/gemini-2.0-flash-lite-preview-02-05:free',
        messages: messages
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: 'OpenRouter API Error', details: errText });
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const DIST_DIR = path.join(__dirname, 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(DIST_DIR, 'index.html'));
    }
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running at http://0.0.0.0:${PORT}`);
});
