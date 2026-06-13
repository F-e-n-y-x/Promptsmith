import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, Sparkles, Copy, CheckCircle2, ImagePlus, X, Settings, Library, Plus, Download, Trash2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import JSZip from 'jszip';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  rawText?: string;
  image?: string;
  mcq?: {
    question: string;
    options: string[];
  };
  mcqAnswered?: boolean;
};

type Session = {
  id: string;
  date: string;
  title: string;
  messages: Message[];
  finalPrompt: string | null;
};

const MCQForm = React.memo(({ mcq, onsubmit, disabled }: { mcq: any, onsubmit: (ans: string) => void, disabled: boolean }) => {
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState('');
  const [isOtherSelected, setIsOtherSelected] = useState(false);

  const handleSubmit = () => {
    const answers = [...selected];
    if (isOtherSelected && otherText.trim()) {
      answers.push(otherText.trim());
    }
    onsubmit(answers.join(', '));
  };

  return (
    <div className="mt-6 p-6 border border-[#E2E2DE] rounded-lg bg-[#F7F7F5]/50 shadow-sm">
      <p className="font-serif font-medium mb-4 text-[#0F0F0F]">{mcq.question}</p>
      <div className="space-y-3">
        {mcq.options.map((opt: string) => (
          <label key={opt} className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input 
                type="checkbox" 
                className="peer appearance-none w-4 h-4 border border-[#0F0F0F] rounded-sm checked:bg-[#0F0F0F] transition-colors disabled:opacity-50 cursor-pointer"
                checked={selected.includes(opt)} 
                onChange={(e) => {
                  if (e.target.checked) setSelected([...selected, opt]);
                  else setSelected(selected.filter(x => x !== opt));
                }} 
                disabled={disabled} 
              />
              <CheckCircle2 size={12} className="absolute text-[#F7F7F5] opacity-0 peer-checked:opacity-100 pointer-events-none" />
            </div>
            <span className="font-serif text-[15px] group-hover:text-[#0F0F0F] text-[#333] transition-colors">{opt}</span>
          </label>
        ))}
        <label className="flex items-start gap-3 cursor-pointer group">
          <div className="relative flex items-center justify-center mt-0.5">
            <input 
              type="checkbox" 
              className="peer appearance-none w-4 h-4 border border-[#0F0F0F] rounded-sm checked:bg-[#0F0F0F] transition-colors disabled:opacity-50 cursor-pointer"
              checked={isOtherSelected} 
              onChange={(e) => setIsOtherSelected(e.target.checked)} 
              disabled={disabled} 
            />
            <CheckCircle2 size={12} className="absolute text-[#F7F7F5] opacity-0 peer-checked:opacity-100 pointer-events-none" />
          </div>
          <span className="font-serif text-[15px] group-hover:text-[#0F0F0F] text-[#333] transition-colors">Other:</span>
        </label>
        {isOtherSelected && (
          <div className="pl-7">
            <input 
              type="text" 
              className="w-full p-2 text-[15px] font-serif italic border-b border-[#E2E2DE] bg-transparent focus:outline-none focus:border-[#0F0F0F] transition-colors" 
              value={otherText} 
              onChange={e => setOtherText(e.target.value)} 
              disabled={disabled} 
              placeholder="Please specify..." 
            />
          </div>
        )}
      </div>
      {!disabled && (
        <button 
          onClick={handleSubmit} 
          disabled={selected.length === 0 && (!isOtherSelected || !otherText.trim())} 
          className="mt-6 px-6 py-2.5 bg-[#0F0F0F] text-[#F7F7F5] text-[10px] uppercase tracking-[0.2em] font-mono hover:bg-[#333] disabled:opacity-30 transition-all"
        >
          Submit Selection
        </button>
      )}
    </div>
  );
});

const MessageItem = React.memo(({ msg, onMCQSubmit }: { msg: Message, onMCQSubmit: (ans: string) => void }) => {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex flex-col",
        msg.role === 'user' ? "items-end" : "items-start"
      )}
    >
      <div className={cn(
        "text-[10px] uppercase tracking-[0.15em] mb-2 font-mono text-[#555]",
        msg.role === 'user' ? "text-right" : "text-left"
      )}>
        {msg.role === 'user' ? 'Author' : 'Assistant'}
      </div>
      <div className={cn(
        "text-lg leading-relaxed",
        msg.role === 'user' 
          ? "font-serif italic text-right max-w-[85%]" 
          : "font-serif text-left markdown-body"
      )}>
        {msg.role === 'user' ? (
          <div className="flex flex-col items-end gap-3">
            {msg.image && (
              <img src={msg.image} alt="User upload" className="max-w-xs rounded-md border border-[#E2E2DE] shadow-sm object-cover" />
            )}
            {msg.content && <p>{msg.content}</p>}
          </div>
        ) : (
          <div className="markdown-body">
            {msg.content && <Markdown>{msg.content}</Markdown>}
            {msg.mcq && (
              <MCQForm 
                mcq={msg.mcq} 
                disabled={msg.mcqAnswered || false} 
                onsubmit={onMCQSubmit} 
              />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

const ChatInput = React.memo(({ onSend, isLoading }: { onSend: (msg: string, img: any) => void, isLoading: boolean }) => {
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ dataUrl: string, mimeType: string, base64Data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;
    onSend(input.trim(), selectedImage);
    setInput('');
    setSelectedImage(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        setSelectedImage({
          dataUrl,
          mimeType: match[1],
          base64Data: match[2]
        });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto relative">
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute bottom-full mb-4 left-0"
          >
            <div className="relative inline-block">
              <img src={selectedImage.dataUrl} alt="Preview" className="h-20 w-auto max-w-[200px] object-contain bg-[#E2E2DE]/20 rounded-md border border-[#E2E2DE] shadow-sm" />
              <button 
                type="button"
                onClick={() => setSelectedImage(null)}
                className="absolute -top-2 -right-2 bg-[#0F0F0F] text-[#F7F7F5] rounded-full p-1 hover:scale-110 transition-transform"
              >
                <X size={12} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="relative flex items-center border-b border-[#0F0F0F] focus-within:border-b-2 transition-all">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 m-1.5 bg-[#E2E2DE]/40 rounded-md text-[#555] hover:text-[#0F0F0F] hover:bg-[#E2E2DE] transition-colors"
          disabled={isLoading}
        >
          <ImagePlus size={20} strokeWidth={1.5} />
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your idea or upload a sketch..."
          className="w-full bg-transparent py-4 px-2 text-lg font-serif italic placeholder:text-[#555] focus:outline-none"
          disabled={isLoading}
        />
        <button 
          type="submit"
          disabled={(!input.trim() && !selectedImage) || isLoading}
          className="p-3 text-[#0F0F0F] disabled:opacity-30 transition-opacity"
        >
          <Send size={18} strokeWidth={1.5} />
        </button>
      </div>
    </form>
  );
});

const MarkdownStyles = () => (
  <style dangerouslySetInnerHTML={{__html: `
    .markdown-body pre {
      white-space: pre-wrap !important;
      word-wrap: break-word !important;
      overflow-x: hidden !important;
      background-color: rgba(226, 226, 222, 0.4);
      padding: 1rem;
      border-radius: 0.5rem;
    }
    .markdown-body code {
      white-space: pre-wrap !important;
      word-break: break-word !important;
    }
    .markdown-body p, .markdown-body li {
      word-wrap: break-word !important;
    }
  `}} />
);

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<'openrouter' | 'google' | 'ollama' | 'pollinations'>(
    () => (localStorage.getItem('promptsmith_provider') as 'openrouter' | 'google' | 'ollama' | 'pollinations') || 'openrouter'
  );
  const [masterCode, setMasterCode] = useState(
    () => localStorage.getItem('promptsmith_masterCode') || ''
  );
  const [openrouterApiKey, setOpenrouterApiKey] = useState(
    () => localStorage.getItem('promptsmith_openrouterApiKey') || ''
  );
  const [openrouterModel, setOpenrouterModel] = useState(() => {
    const saved = localStorage.getItem('promptsmith_openrouterModel');
    // If it's the old hardcoded default, reset it so it uses the server default
    if (saved === 'google/gemini-2.0-flash-lite-preview-02-05:free' || saved === 'openai/gpt-4o-mini') {
      return '';
    }
    return saved || '';
  });
  
  const [serverDefaultModel, setServerDefaultModel] = useState('Loading...');
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [freeModels, setFreeModels] = useState<{id: string, name: string}[]>([]);
  const [isLoadingOpenRouterModels, setIsLoadingOpenRouterModels] = useState(false);
  const [pollinationsModel, setPollinationsModel] = useState(
    () => localStorage.getItem('promptsmith_pollinationsModel') || 'openai'
  );
  const [pollinationsApiKey, setPollinationsApiKey] = useState(
    () => localStorage.getItem('promptsmith_pollinationsApiKey') || ''
  );
  const [geminiApiKey, setGeminiApiKey] = useState(
    () => localStorage.getItem('promptsmith_geminiApiKey') || ''
  );
  const [ollamaUrl, setOllamaUrl] = useState(
    () => localStorage.getItem('promptsmith_ollamaUrl') || 'http://127.0.0.1:11434'
  );
  const [ollamaModel, setOllamaModel] = useState(
    () => localStorage.getItem('promptsmith_ollamaModel') || ''
  );
  const [ollamaModelsList, setOllamaModelsList] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isPollinationsDropdownOpen, setIsPollinationsDropdownOpen] = useState(false);
  const [ollamaError, setOllamaError] = useState<string | null>(null);
  
  const [sessionId, setSessionId] = useState(() => Date.now().toString());
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  
  const [selectedImage, setSelectedImage] = useState<{ dataUrl: string, mimeType: string, base64Data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const SYSTEM_INSTRUCTION = `You are an elite Prompt Engineer and AI Whisperer. Your objective is to transform the user's raw ideas into highly detailed, robust, and professional prompts.

CORE BEHAVIOR:
- GREETINGS: If the user simply says "hi", "hello", or similar short greetings without any specific idea or task, respond naturally and professionally. Ask them what they would like to create today. DO NOT generate a prompt or MCQ for simple greetings.
- PROMPT GENERATION: When the user provides an idea, task, or request, follow this CRITICAL WORKFLOW:
  1. ANALYZE & SEARCH: Analyze the request. Use Google Search (if available) to find the latest best practices if the topic is technical or time-sensitive.
  2. GENERATE PROMPT: Create a comprehensive, highly detailed prompt. Include Context, Role, Instructions, Tone, and Output Format. Wrap it in a \`\`\`prompt code block.
  3. REFINE (MCQ): After the prompt block, ask a refinement question in a \`\`\`mcq code block (JSON format with "question" and "options").
  4. ITERATE: Always output the FULL updated prompt in a \`\`\`prompt block after any refinement.`;

  useEffect(() => {
    const saved = localStorage.getItem('promptsmith_sessions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          Promise.all(parsed.map(s => 
            fetch('/api/history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(s)
            })
          )).then(() => {
            localStorage.removeItem('promptsmith_sessions');
            loadHistoryIndex();
          });
          return;
        }
      } catch (e) {}
    }
    loadHistoryIndex();
  }, []);

  const loadHistoryIndex = () => {
    fetch('/api/history')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSessions(data);
        }
      })
      .catch(err => console.error('Failed to load history', err));
  };

  useEffect(() => {
    if (messages.length > 1) {
      const title = messages.find(m => m.role === 'user')?.content?.substring(0, 30) || 'New Prompt';
      const currentSession: Session = {
        id: sessionId,
        date: new Date().toISOString(),
        title,
        messages,
        finalPrompt
      };
      
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSession)
      }).then(res => res.json()).then(data => {
        if (data.success && data.session) {
          setSessions(prev => {
            const existingIdx = prev.findIndex(s => s.id === sessionId);
            const newSessions = [...prev];
            if (existingIdx >= 0) {
              newSessions[existingIdx] = data.session;
            } else {
              newSessions.unshift(data.session);
            }
            return newSessions;
          });
        }
      }).catch(err => console.error('Failed to save session', err));
    }
  }, [messages, finalPrompt, sessionId]);

  useEffect(() => {
    // Fetch free models from OpenRouter when provider is openrouter
    const fetchModels = async () => {
      if (provider !== 'openrouter') return;
      if (freeModels.length > 0) return;
      
      setIsLoadingOpenRouterModels(true);
      try {
        const res = await fetch('https://openrouter.ai/api/v1/models');
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        
        // Filter for truly free models based on pricing
        const filtered = data.data.filter((model: any) => {
          return model.pricing && 
                 Number(model.pricing.prompt) === 0 && 
                 Number(model.pricing.completion) === 0;
        });
        
        setFreeModels(filtered);
      } catch (err) {
        console.error('Error fetching OpenRouter models:', err);
      } finally {
        setIsLoadingOpenRouterModels(false);
      }
    };
    
    fetchModels();
  }, [provider]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const data = await res.json();
          setServerDefaultModel(data.DEFAULT_OPENROUTER_MODEL);
        }
      } catch (err) {
        console.error('Failed to fetch config', err);
      }
    };
    fetchConfig();
  }, []);

  const verifyMasterCode = async () => {
    if (!masterCode) return;
    setVerificationStatus('loading');
    try {
      const res = await fetch('/api/verify-master-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: masterCode })
      });
      const data = await res.json();
      if (data.valid) {
        setVerificationStatus('success');
        setTimeout(() => setVerificationStatus('idle'), 3000);
      } else {
        setVerificationStatus('error');
        setTimeout(() => setVerificationStatus('idle'), 3000);
      }
    } catch (err) {
      console.error('Failed to verify master code', err);
      setVerificationStatus('error');
      setTimeout(() => setVerificationStatus('idle'), 3000);
    }
  };

  useEffect(() => {
    localStorage.setItem('promptsmith_provider', provider);
    localStorage.setItem('promptsmith_geminiApiKey', geminiApiKey);
    localStorage.setItem('promptsmith_ollamaUrl', ollamaUrl);
    localStorage.setItem('promptsmith_ollamaModel', ollamaModel);
    localStorage.setItem('promptsmith_pollinationsModel', pollinationsModel);
    localStorage.setItem('promptsmith_pollinationsApiKey', pollinationsApiKey);
    localStorage.setItem('promptsmith_openrouterApiKey', openrouterApiKey);
    localStorage.setItem('promptsmith_openrouterModel', openrouterModel);
    localStorage.setItem('promptsmith_masterCode', masterCode);
  }, [provider, geminiApiKey, ollamaUrl, ollamaModel, pollinationsModel, pollinationsApiKey, openrouterApiKey, openrouterModel, masterCode]);

  useEffect(() => {
    // Initial greeting
    if (messages.length === 0) {
      setMessages([
        {
          id: '1',
          role: 'model',
          content: "I am your editorial assistant. Share your initial idea or upload an image, and I will instantly draft an optimized prompt and provide options to refine it.",
        }
      ]);
    }
  }, [messages.length]);

  useEffect(() => {
    // Only scroll if there's actually a message to scroll to
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages.length, isLoading]);

  useEffect(() => {
    if (provider === 'ollama' && isSettingsOpen) {
      setIsLoadingModels(true);
      setOllamaError(null);
      fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`)
        .then(res => res.json())
        .then(data => {
          if (data.models && Array.isArray(data.models)) {
            // Deduplicate model names just in case the API returns duplicates
            const models = Array.from(new Set(data.models.map((m: any) => m.name))) as string[];
            setOllamaModelsList(models);
            if (models.length > 0 && !models.includes(ollamaModel)) {
              setOllamaModel(models[0]);
            }
          }
        })
        .catch(err => {
          console.error("Failed to fetch Ollama models:", err);
          setOllamaModelsList([]);
          setOllamaError("Could not connect to Ollama. Make sure it's running with OLLAMA_ORIGINS=\"*\"");
        })
        .finally(() => {
          setIsLoadingModels(false);
        });
    }
  }, [provider, isSettingsOpen, ollamaUrl]);

  const startNewSession = () => {
    setSessionId(Date.now().toString());
    setMessages([{
      id: '1',
      role: 'model',
      content: "I am your editorial assistant. Share your initial idea or upload an image, and I will instantly draft an optimized prompt and provide options to refine it.",
    }]);
    setFinalPrompt(null);
    setIsLibraryOpen(false);
  };

  const loadSession = async (session: Session) => {
    try {
      const res = await fetch(`/api/history/${session.id}`);
      if (res.ok) {
        const fullSession = await res.json();
        setSessionId(fullSession.id);
        setMessages(fullSession.messages || []);
        setFinalPrompt(fullSession.finalPrompt);
        setIsLibraryOpen(false);
      }
    } catch (err) {
      console.error('Failed to load full session', err);
    }
  };

  const exportSession = async (session: Session) => {
    try {
      const res = await fetch(`/api/history/${session.id}`);
      let fullSession = session;
      if (res.ok) {
        fullSession = await res.json();
      }

      const zip = new JSZip();
      
      // Format date as DD-MM-YYYY
      const dateObj = new Date(fullSession.date);
      const day = String(dateObj.getDate()).padStart(2, '0');
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const year = dateObj.getFullYear();
      const dateStr = `${day}-${month}-${year}`;
      
      const safeTitle = fullSession.title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
      const folderName = `${dateStr}_${safeTitle}`;
      
      const folder = zip.folder(folderName);
      if (!folder) return;

      folder.file("session_data.json", JSON.stringify(fullSession, null, 2));
      folder.file("final_prompt.md", fullSession.finalPrompt || "No prompt generated yet.");
      
      const chatHistory = (fullSession.messages || []).map(m => `**${m.role === 'user' ? 'User' : 'Assistant'}**:\n${m.content || '[Image/Options]'}`).join('\n\n---\n\n');
      folder.file("chat_history.md", chatHistory);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folderName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export session", error);
    }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this session?')) {
      try {
        await fetch(`/api/history/${id}`, { method: 'DELETE' });
        setSessions(prev => prev.filter(s => s.id !== id));
        if (sessionId === id) {
          startNewSession();
        }
      } catch (err) {
        console.error('Failed to delete session', err);
      }
    }
  };

  const cleanTextAndExtract = (rawText: string) => {
    let text = rawText;
    let prompt = null;
    let mcq = null;

    // More forgiving regex to catch variations in markdown code blocks
    const promptRegex = /```prompt\s*\n([\s\S]*?)```/;
    const promptMatch = text.match(promptRegex);
    if (promptMatch && promptMatch[1]) {
      prompt = promptMatch[1].trim();
      text = text.replace(promptRegex, '').trim();
    }

    const mcqRegex = /```mcq\s*\n([\s\S]*?)```/;
    const mcqMatch = text.match(mcqRegex);
    if (mcqMatch && mcqMatch[1]) {
      try {
        mcq = JSON.parse(mcqMatch[1].trim());
        text = text.replace(mcqRegex, '').trim();
      } catch (e) {
        console.error("Failed to parse MCQ JSON", e);
      }
    }

    return { text, prompt, mcq };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
      if (match) {
        setSelectedImage({
          dataUrl,
          mimeType: match[1],
          base64Data: match[2]
        });
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  const handleMCQSubmit = React.useCallback((ans: string) => {
    sendMessage(`I select: ${ans}`);
  }, [messages, provider, geminiApiKey, ollamaModel, pollinationsModel]);
  const sendMessage = async (userMsg: string, currentImage: any = null) => {
    if ((!userMsg.trim() && !currentImage) || isLoading) return;
    
    const newUserMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: userMsg,
      image: currentImage?.dataUrl
    };
    
    // Mark previous MCQ as answered
    const updatedMessages = messages.map(m => m.mcq ? { ...m, mcqAnswered: true } : m);
    updatedMessages.push(newUserMessage);
    
    setMessages(updatedMessages);
    setIsLoading(true);

    try {
      let rawText = '';

      if (provider === 'google') {
        const apiKeyToUse = geminiApiKey || process.env.GEMINI_API_KEY;
        if (!apiKeyToUse) {
          throw new Error('Missing Gemini API Key');
        }
        
        const ai = new GoogleGenAI({ apiKey: apiKeyToUse });
        
        const contents = updatedMessages.filter(m => m.id !== '1').map(m => {
          const parts: any[] = [];
          if (m.image) {
            const mimeType = m.image.match(/^data:(.*?);base64,/)?.[1] || 'image/jpeg';
            const base64Data = m.image.split(',')[1];
            parts.push({ inlineData: { mimeType, data: base64Data } });
          }
          if (m.rawText || m.content) {
            parts.push({ text: m.rawText || m.content });
          } else if (m.image) {
            parts.push({ text: "Analyze this image." });
          }
          return { role: m.role, parts };
        });

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: contents,
          config: { 
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{ googleSearch: {} }]
          }
        });
        rawText = response.text || '';
      } else if (provider === 'openrouter') {
        const openrouterMessages = [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          ...updatedMessages.filter(m => m.id !== '1').map(m => {
            const contentArray: any[] = [];
            if (m.rawText || m.content) {
              contentArray.push({ type: "text", text: m.rawText || m.content });
            } else if (m.image) {
              contentArray.push({ type: "text", text: "Analyze this image." });
            }
            if (m.image) {
              contentArray.push({ type: "image_url", image_url: { url: m.image } });
            }
            return {
              role: m.role === 'model' ? 'assistant' : 'user',
              content: contentArray
            };
          })
        ];

        const res = await fetch('/api/chat/openrouter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: openrouterModel,
            messages: openrouterMessages,
            customApiKey: openrouterApiKey,
            masterCode: masterCode
          })
        });

        if (res.status === 429) {
          throw new Error('LIMIT_REACHED');
        }

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          // If a text-only model is used but image is provided, OpenRouter typically throws a 400 with a specific modality error
          if (res.status === 400 && errData.error?.message?.toLowerCase().includes('image')) {
            throw new Error('MODEL_IMAGE_ERROR');
          }
          throw new Error(errData.error?.message || 'OpenRouter API error');
        }
        
        const data = await res.json();
        rawText = data.choices?.[0]?.message?.content || '';
      } else if (provider === 'ollama') {
        // Ollama logic
        const ollamaMessages = [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          ...updatedMessages.filter(m => m.id !== '1').map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.rawText || m.content || "Analyze this image.",
            images: m.image ? [m.image.split(',')[1]] : undefined
          }))
        ];

        const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages: ollamaMessages,
            stream: false
          })
        });

        if (!res.ok) throw new Error('Ollama API error');
        const data = await res.json();
        rawText = data.message?.content || '';
      } else if (provider === 'pollinations') {
        const pollinationsMessages = [
          { role: 'system', content: SYSTEM_INSTRUCTION },
          ...updatedMessages.filter(m => m.id !== '1').map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.rawText || m.content || (m.image ? "Analyze this image." : "")
          }))
        ];

        const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(pollinationsApiKey ? { 'Authorization': `Bearer ${pollinationsApiKey}` } : {})
          },
          body: JSON.stringify({
            messages: pollinationsMessages,
            model: pollinationsModel,
            seed: Math.floor(Math.random() * 1000000)
          })
        });

        if (!res.ok) throw new Error('Pollinations API error');
        const data = await res.json();
        rawText = data.choices?.[0]?.message?.content || '';
      }

      const { text: cleanText, prompt, mcq } = cleanTextAndExtract(rawText);
      if (prompt) setFinalPrompt(prompt);
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: cleanText,
        rawText: rawText,
        mcq: mcq
      }]);
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      let errorMessage = "An error occurred while processing your request. Please try again.";
      
      if (error.message === 'LIMIT_REACHED') {
        errorMessage = "⏳ **Usage Limit Reached!**\n\nYou've hit the public usage limit. Please open **Settings** (gear icon) and enter the **Master Code** or your own **OpenRouter API Key** to continue.";
      } else if (error.message === 'MODEL_IMAGE_ERROR') {
        errorMessage = "🖼️ **Image Not Supported**\n\nThe OpenRouter model you selected does not support image analysis. Please select a multimodal model (like a Gemini model) from the Settings, or remove the uploaded image and try again.";
      } else if (error.message === 'Missing Gemini API Key') {
        errorMessage = "🚨 **Missing API Key**\n\nPlease open Settings (gear icon) and enter your Google Gemini API Key to continue.";
      } else if (provider === 'ollama' && error.message === 'Failed to fetch') {
        errorMessage = "🚨 **Connection Error**\n\nCould not connect to Ollama. This usually happens for two reasons:\n\n1. **Ollama is not running.** Please start the Ollama app on your computer.\n2. **CORS is not enabled.** Because this is a web app, your browser blocks connections to local servers for security. You must restart Ollama from your terminal with CORS enabled:\n\n`OLLAMA_ORIGINS=\"*\" ollama serve`\n\n*(If you are on Windows, use Command Prompt and run: `set OLLAMA_ORIGINS=\"*\" && ollama serve`)*";
      }
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: errorMessage 
      }]);
    } finally {
      setIsLoading(false);
    }
  };



  const handleCopy = () => {
    if (finalPrompt) {
      navigator.clipboard.writeText(finalPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportPrompt = async () => {
    if (!finalPrompt) return;
    try {
      const zip = new JSZip();
      
      // 1. The Markdown File
      zip.file("prompt.md", finalPrompt);
      
      // 2. Extract Variables for a JSON template
      // Matches [Variable] or {{Variable}}
      const varRegex = /\[([^\]]+)\]|\{\{([^}]+)\}\}/g;
      const matches = [...finalPrompt.matchAll(varRegex)];
      const variables: Record<string, string> = {};
      matches.forEach(m => {
        const varName = m[1] || m[2];
        if (varName && varName.length < 40 && !varName.includes('\n')) {
          variables[varName] = "FILL_THIS_IN";
        }
      });
      
      if (Object.keys(variables).length > 0) {
        zip.file("variables.json", JSON.stringify(variables, null, 2));
      }
      
      // 3. API Payload Example
      const apiPayload = {
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a helpful AI assistant."
          },
          {
            role: "user",
            content: finalPrompt
          }
        ],
        temperature: 0.7
      };
      zip.file("api_payload.json", JSON.stringify(apiPayload, null, 2));
      
      // 4. README
      const readme = `# Promptsmith Export\n\nThis package contains your optimized prompt and integration files.\n\n## Files Included:\n- **prompt.md**: The raw markdown prompt. Copy and paste this into ChatGPT, Claude, or Gemini.\n- **api_payload.json**: A ready-to-use JSON payload for integrating this prompt into custom apps via API.\n${Object.keys(variables).length > 0 ? '- **variables.json**: A template of the variables detected in your prompt. Fill these in programmatically before sending to the AI.\n' : ''}`;
      zip.file("README.md", readme);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Promptsmith_Pack_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export prompt pack", error);
    }
  };

  return (
    <main className="flex h-screen w-full bg-[#F7F7F5] text-[#0F0F0F] font-serif overflow-hidden">
      <MarkdownStyles />
      {/* Left Pane: Chat */}
      <section className="flex flex-col w-full lg:w-1/2 h-full border-r border-[#E2E2DE] relative bg-[#F7F7F5]">
        {/* Header */}
        <header className="px-8 py-6 border-b border-[#E2E2DE] flex items-center justify-between bg-[#F7F7F5] z-20 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsLibraryOpen(true)} className="text-[#555] hover:text-[#0F0F0F] transition-colors flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono">
              <Library size={16} />
              Library
            </button>
            <button onClick={startNewSession} className="text-[#555] hover:text-[#0F0F0F] transition-colors flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono ml-4">
              <Plus size={16} />
              New
            </button>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#555] font-mono">
              Plan Mode
            </div>
            <button onClick={() => setIsSettingsOpen(true)} className="text-[#555] hover:text-[#0F0F0F] transition-colors">
              <Settings size={16} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 pt-8 pb-40">
          <div className="max-w-xl mx-auto space-y-12">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <MessageItem 
                  key={msg.id} 
                  msg={msg} 
                  onMCQSubmit={handleMCQSubmit}
                />
              ))}
            </AnimatePresence>
            {isLoading && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-start"
              >
                <div className="text-[10px] uppercase tracking-[0.15em] mb-2 font-mono text-[#555]">
                  Assistant
                </div>
                <div className="flex space-x-1 items-center h-6">
                  <div className="w-1.5 h-1.5 bg-[#0F0F0F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 bg-[#0F0F0F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 bg-[#0F0F0F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="absolute bottom-0 w-full p-8 pt-12 bg-gradient-to-t from-[#F7F7F5] from-70% to-[#F7F7F5]/0">
          <ChatInput onSend={sendMessage} isLoading={isLoading} />
        </div>
      </section>

      {/* Right Pane: Final Prompt */}
      <section className="hidden lg:flex flex-col w-1/2 h-full bg-[#121212] text-[#F7F7F5] relative">
        <header className="px-12 py-8 flex justify-between items-center z-10 shrink-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#888] font-mono flex items-center gap-2">
            <Sparkles size={12} />
            Final Output
          </div>
          <AnimatePresence>
            {finalPrompt && (
              <div className="flex items-center gap-3">
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleCopy}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-mono border border-[#F7F7F5]/30 rounded-full px-4 py-2 hover:bg-[#F7F7F5] hover:text-[#0F0F0F] transition-colors"
                >
                  {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </motion.button>
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleExportPrompt}
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-mono border border-[#F7F7F5]/30 rounded-full px-4 py-2 hover:bg-[#F7F7F5] hover:text-[#0F0F0F] transition-colors"
                  title="Download Prompt Pack (.md, .json)"
                >
                  <Download size={14} />
                  Export Pack
                </motion.button>
              </div>
            )}
          </AnimatePresence>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Decorative sidebar */}
          <div className="w-16 shrink-0 flex flex-col justify-end pb-12 items-center z-10">
            <div className="text-[10px] font-mono text-[#555] uppercase tracking-widest rotate-180 pointer-events-none select-none" style={{ writingMode: 'vertical-rl' }}>
              Promptsmith v1.0
            </div>
          </div>
          
          {/* Main prompt content */}
          <div className="flex-1 p-8 pt-0 pr-12 overflow-y-auto overflow-x-hidden flex flex-col w-full">
            <div className="m-auto w-full max-w-2xl">
              <AnimatePresence mode="wait">
                {finalPrompt ? (
                  <motion.div
                    key="prompt"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full"
                  >
                    <div className="font-mono text-sm leading-relaxed text-[#D4D4D0] whitespace-pre-wrap break-words overflow-wrap-anywhere">
                      {finalPrompt}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center max-w-md mx-auto"
                  >
                    <h2 className="text-4xl font-light mb-6 opacity-50">The Canvas is Empty</h2>
                    <p className="font-mono text-xs text-[#888] uppercase tracking-widest leading-loose">
                      Refine your idea in the chat. <br/>
                      Your optimized prompt will appear here.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>
      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#0F0F0F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#F7F7F5] border border-[#E2E2DE] shadow-2xl p-10 max-w-md w-full relative"
            >
              <button 
                onClick={() => setIsSettingsOpen(false)}
                className="absolute top-6 right-6 text-[#555] hover:text-[#0F0F0F] transition-colors"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
              
              <div className="mb-8">
                <h2 className="text-2xl font-light tracking-wide uppercase">Settings</h2>
                <div className="w-8 h-[1px] bg-[#0F0F0F] mt-4"></div>
              </div>
              
              <div className="space-y-8">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-4">AI Provider</label>
                  <div className="flex flex-wrap gap-4 sm:gap-6">
                    <button 
                      onClick={() => setProvider('openrouter')}
                      className={cn(
                        "font-serif text-xl transition-all duration-300 relative pb-1",
                        provider === 'openrouter' ? "text-[#0F0F0F]" : "text-[#888] hover:text-[#555]"
                      )}
                    >
                      OpenRouter
                      {provider === 'openrouter' && (
                        <motion.div layoutId="provider-underline" className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#0F0F0F]" />
                      )}
                    </button>
                    <button 
                      onClick={() => setProvider('google')}
                      className={cn(
                        "font-serif text-xl transition-all duration-300 relative pb-1",
                        provider === 'google' ? "text-[#0F0F0F]" : "text-[#888] hover:text-[#555]"
                      )}
                    >
                      Google Gemini
                      {provider === 'google' && (
                        <motion.div layoutId="provider-underline" className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#0F0F0F]" />
                      )}
                    </button>
                    <button 
                      onClick={() => setProvider('ollama')}
                      className={cn(
                        "font-serif text-xl transition-all duration-300 relative pb-1",
                        provider === 'ollama' ? "text-[#0F0F0F]" : "text-[#888] hover:text-[#555]"
                      )}
                    >
                      Ollama
                      {provider === 'ollama' && (
                        <motion.div layoutId="provider-underline" className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#0F0F0F]" />
                      )}
                    </button>
                    <button 
                      onClick={() => setProvider('pollinations')}
                      className={cn(
                        "font-serif text-xl transition-all duration-300 relative pb-1",
                        provider === 'pollinations' ? "text-[#0F0F0F]" : "text-[#888] hover:text-[#555]"
                      )}
                    >
                      Pollinations
                      {provider === 'pollinations' && (
                        <motion.div layoutId="provider-underline" className="absolute bottom-0 left-0 right-0 h-[1px] bg-[#0F0F0F]" />
                      )}
                    </button>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {provider === 'openrouter' && (
                    <motion.div 
                      key="openrouter-settings"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-visible"
                    >
                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Master Code</label>
                        <div className="flex items-end gap-4 border-b border-[#E2E2DE] pb-2">
                          <input 
                            type="password" 
                            value={masterCode}
                            onChange={(e) => setMasterCode(e.target.value)}
                            placeholder="Bypass limit code..."
                            className="flex-1 bg-transparent font-serif text-lg focus:outline-none focus:border-[#0F0F0F] transition-colors"
                          />
                          <button 
                            onClick={verifyMasterCode}
                            disabled={verificationStatus === 'loading'}
                            className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider bg-[#0F0F0F] text-[#F7F7F5] hover:bg-[#333] transition-colors disabled:opacity-50"
                          >
                            {verificationStatus === 'loading' ? 'Checking...' : 'Verify'}
                          </button>
                        </div>
                        {verificationStatus === 'success' && (
                          <motion.p initial={{opacity:0, y:-5}} animate={{opacity:1, y:0}} className="text-xs font-mono text-green-600 mt-2 flex items-center gap-1">
                            <Sparkles size={12} /> Master Code Verified! Limits unlocked.
                          </motion.p>
                        )}
                        {verificationStatus === 'error' && (
                          <motion.p initial={{opacity:0, y:-5}} animate={{opacity:1, y:0}} className="text-xs font-mono text-red-500 mt-2 flex items-center gap-1">
                            <X size={12} /> Invalid code. Please try again.
                          </motion.p>
                        )}
                        {verificationStatus === 'idle' && (
                          <p className="text-xs font-mono text-[#888] mt-2">
                            Enter the master code to bypass the public usage limit.
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Custom API Key</label>
                        <input 
                          type="password" 
                          value={openrouterApiKey}
                          onChange={(e) => setOpenrouterApiKey(e.target.value)}
                          placeholder="sk-or-v1-..."
                          className="w-full bg-transparent border-b border-[#E2E2DE] py-2 font-serif text-lg focus:outline-none focus:border-[#0F0F0F] transition-colors"
                        />
                        <p className="text-xs font-mono text-[#888] mt-2">
                          Provide your own API key to bypass limits completely.
                        </p>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Model (Free Models Only)</label>
                        {isLoadingOpenRouterModels ? (
                          <div className="text-sm font-mono text-[#888] py-2 animate-pulse">Loading free models from OpenRouter...</div>
                        ) : (
                          <select 
                            value={openrouterModel}
                            onChange={(e) => setOpenrouterModel(e.target.value)}
                            className="w-full bg-transparent border-b border-[#E2E2DE] py-2 font-serif text-lg focus:outline-none focus:border-[#0F0F0F] transition-colors appearance-none cursor-pointer"
                          >
                            <option value="">Server Default ({serverDefaultModel})</option>
                            {freeModels.length > 0 && freeModels.map((model) => (
                              <option key={model.id} value={model.id}>{model.name}</option>
                            ))}
                          </select>
                        )}
                        <p className="text-xs font-mono text-[#888] mt-2">
                          Automatically populated with 100% free models. Some models do not support images.
                        </p>
                      </div>
                    </motion.div>
                  )}
                  {provider === 'google' && (
                    <motion.div 
                      key="google-settings"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-visible"
                    >
                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Gemini API Key</label>
                        <input 
                          type="password" 
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full bg-transparent border-b border-[#E2E2DE] py-2 font-serif text-lg focus:outline-none focus:border-[#0F0F0F] transition-colors"
                        />
                        <p className="text-xs font-mono text-[#888] mt-2">
                          Stored locally in your browser. Leave blank if using a hosted environment variable.
                        </p>
                      </div>
                    </motion.div>
                  )}
                  {provider === 'ollama' && (
                    <motion.div 
                      key="ollama-settings"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-visible"
                    >
                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Ollama URL</label>
                        <input 
                          type="text" 
                          value={ollamaUrl}
                          onChange={(e) => setOllamaUrl(e.target.value)}
                          className="w-full bg-transparent border-b border-[#E2E2DE] py-2 font-serif text-lg focus:outline-none focus:border-[#0F0F0F] transition-colors"
                        />
                      </div>
                      <div className="relative">
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Model Name</label>
                        
                        <div className="relative">
                          <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="w-full bg-transparent border-b border-[#E2E2DE] py-2 font-serif text-lg text-left focus:outline-none focus:border-[#0F0F0F] transition-colors flex justify-between items-center"
                          >
                            <span className={!ollamaModel ? "text-[#888] italic" : ""}>
                              {isLoadingModels ? "Detecting models..." : (ollamaModel || (ollamaModelsList.length === 0 ? "No models found" : "Select a model"))}
                            </span>
                            <motion.div animate={{ rotate: isDropdownOpen ? 180 : 0 }} className="text-[#555]">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </motion.div>
                          </button>
                          
                          <AnimatePresence>
                            {isDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 5 }}
                                className="absolute top-full left-0 w-full mt-1 bg-[#F7F7F5] border border-[#E2E2DE] shadow-lg z-50 max-h-48 overflow-y-auto"
                              >
                                {ollamaModelsList.length > 0 ? (
                                  ollamaModelsList.map((model, index) => (
                                    <button
                                      key={`${model}-${index}`}
                                      onClick={() => {
                                        setOllamaModel(model);
                                        setIsDropdownOpen(false);
                                      }}
                                      className="w-full text-left px-4 py-3 font-serif text-lg hover:bg-[#E2E2DE]/30 transition-colors border-b border-[#E2E2DE]/50 last:border-0"
                                    >
                                      {model}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-4 py-3 font-serif text-lg text-[#888] italic">
                                    {isLoadingModels ? "Loading..." : "No models detected"}
                                  </div>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      
                      {ollamaError && (
                        <div className="pt-2 text-red-600 text-sm font-mono bg-red-50 p-3 rounded border border-red-200">
                          {ollamaError}
                        </div>
                      )}
                      
                      <div className="pt-2">
                        <p className="text-xs font-mono text-[#888] leading-relaxed">
                          Note: To use Ollama from this web app, you must start it with CORS enabled:
                          <br/>
                          <code className="bg-[#E2E2DE]/50 px-1 py-0.5 rounded text-[#0F0F0F] mt-1 inline-block">OLLAMA_ORIGINS="*" ollama serve</code>
                        </p>
                      </div>
                    </motion.div>
                  )}
                  {provider === 'pollinations' && (
                    <motion.div 
                      key="pollinations-settings"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-visible"
                    >
                      <div className="relative">
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Model</label>
                        
                        <div className="relative">
                          <button
                            onClick={() => setIsPollinationsDropdownOpen(!isPollinationsDropdownOpen)}
                            className="w-full bg-transparent border-b border-[#E2E2DE] py-2 font-serif text-lg text-left focus:outline-none focus:border-[#0F0F0F] transition-colors flex justify-between items-center"
                          >
                            <span>{pollinationsModel}</span>
                            <motion.div animate={{ rotate: isPollinationsDropdownOpen ? 180 : 0 }} className="text-[#555]">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                            </motion.div>
                          </button>
                          
                          <AnimatePresence>
                            {isPollinationsDropdownOpen && (
                              <motion.div
                                initial={{ opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 5 }}
                                className="absolute top-full left-0 w-full mt-1 bg-[#F7F7F5] border border-[#E2E2DE] shadow-lg z-50 max-h-48 overflow-y-auto"
                              >
                                {[
                                  'openai', 'openai-fast', 'openai-large', 
                                  'mistral', 'qwen-coder', 'gemini', 
                                  'gemini-fast', 'claude', 'deepseek', 
                                  'grok', 'perplexity-reasoning'
                                ].map((model) => (
                                  <button
                                    key={model}
                                    onClick={() => {
                                      setPollinationsModel(model);
                                      setIsPollinationsDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-3 font-serif text-lg hover:bg-[#E2E2DE]/30 transition-colors border-b border-[#E2E2DE]/50 last:border-0"
                                  >
                                    {model}
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-[0.15em] font-mono text-[#555] mb-2">Pollinations API Key</label>
                        <input 
                          type="password" 
                          value={pollinationsApiKey}
                          onChange={(e) => setPollinationsApiKey(e.target.value)}
                          placeholder="pk_..."
                          className="w-full bg-transparent border-b border-[#E2E2DE] py-2 font-serif text-lg focus:outline-none focus:border-[#0F0F0F] transition-colors"
                        />
                        <p className="text-xs font-mono text-[#888] mt-2">
                          Obtain at <a href="https://enter.pollinations.ai" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#0F0F0F]">enter.pollinations.ai</a>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <div className="mt-10 flex justify-end">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="bg-[#0F0F0F] text-[#F7F7F5] px-8 py-3 font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-[#333] transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Library Modal */}
      <AnimatePresence>
        {isLibraryOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#0F0F0F]/20 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="bg-[#F7F7F5] border border-[#E2E2DE] shadow-2xl p-10 max-w-2xl w-full relative max-h-[80vh] flex flex-col"
            >
              <button 
                onClick={() => setIsLibraryOpen(false)}
                className="absolute top-6 right-6 text-[#555] hover:text-[#0F0F0F] transition-colors"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
              
              <div className="mb-8 shrink-0">
                <h2 className="text-2xl font-light tracking-wide uppercase">Library</h2>
                <div className="w-8 h-[1px] bg-[#0F0F0F] mt-4"></div>
              </div>
              
              <div className="overflow-y-auto flex-1 pr-4 space-y-4">
                {sessions.length === 0 ? (
                  <p className="text-[#888] font-serif italic">No saved sessions yet.</p>
                ) : (
                  sessions.map(session => (
                    <div key={session.id} className="border border-[#E2E2DE] p-4 flex justify-between items-center hover:bg-[#E2E2DE]/20 transition-colors group">
                      <div>
                        <h3 className="font-serif text-lg text-[#0F0F0F]">{session.title}</h3>
                        <p className="text-[10px] font-mono text-[#888] uppercase tracking-widest mt-1">
                          {new Date(session.date).toLocaleDateString()} {new Date(session.date).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => exportSession(session)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-[#555] hover:text-[#0F0F0F] hover:bg-[#E2E2DE] rounded transition-all"
                          title="Export Session"
                        >
                          <Download size={16} />
                        </button>
                        <button 
                          onClick={(e) => deleteSession(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-[#555] hover:text-red-600 hover:bg-red-50 rounded transition-all"
                          title="Delete Session"
                        >
                          <Trash2 size={16} />
                        </button>
                        <button 
                          onClick={() => loadSession(session)}
                          className="opacity-0 group-hover:opacity-100 px-4 py-2 bg-[#0F0F0F] text-[#F7F7F5] text-[10px] uppercase tracking-[0.2em] font-mono transition-all"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
