import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

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

// GET list of sessions
app.get('/api/history', (req, res) => {
  const index = getHistoryIndex();
  res.json(index);
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
