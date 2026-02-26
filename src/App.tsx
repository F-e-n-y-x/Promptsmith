import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, Sparkles, Copy, CheckCircle2, Paperclip, X, Settings } from 'lucide-react';
import Markdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Message = {
  id: string;
  role: 'user' | 'model';
  content: string;
  image?: string;
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [finalPrompt, setFinalPrompt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [provider, setProvider] = useState<'google' | 'ollama'>('google');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');
  const [ollamaModel, setOllamaModel] = useState('');
  const [ollamaModelsList, setOllamaModelsList] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [selectedImage, setSelectedImage] = useState<{ dataUrl: string, mimeType: string, base64Data: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initialize AI
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Initialize chat
    chatRef.current = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: `You are an expert prompt engineer and editorial assistant. Your goal is to help the user craft the perfect prompt for an AI model. 
When the user provides an initial idea, you should enter a 'plan mode' where you ask 1-3 clarifying questions to refine the prompt. 
Keep your tone professional, minimalist, and editorial. 
Once you have enough information, provide the final, highly optimized prompt. 
IMPORTANT: When you provide the final prompt, wrap it in a markdown code block with the language 'prompt' (e.g., \`\`\`prompt\nYour prompt here\n\`\`\`). This allows the UI to extract and display it beautifully. Do not use the 'prompt' language block for anything else.`,
      },
    });
    
    // Initial greeting
    setMessages([
      {
        id: '1',
        role: 'model',
        content: "I am your editorial assistant. What kind of prompt would you like to craft today? Share your initial idea, and we will refine it together.",
      }
    ]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    if (provider === 'ollama' && isSettingsOpen) {
      setIsLoadingModels(true);
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
        })
        .finally(() => {
          setIsLoadingModels(false);
        });
    }
  }, [provider, isSettingsOpen, ollamaUrl]);

  const extractPrompt = (text: string) => {
    const promptRegex = /```prompt\n([\s\S]*?)\n```/;
    const match = text.match(promptRegex);
    if (match && match[1]) {
      setFinalPrompt(match[1].trim());
      // Return text without the prompt block
      return text.replace(promptRegex, '').trim();
    }
    return text;
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;

    const userMsg = input.trim();
    const currentImage = selectedImage;
    
    setInput('');
    setSelectedImage(null);
    
    const newUserMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: userMsg,
      image: currentImage?.dataUrl
    };
    
    setMessages(prev => [...prev, newUserMessage]);
    
    setIsLoading(true);

    try {
      let rawText = '';

      if (provider === 'google') {
        let messagePayload: any = userMsg;
        
        if (currentImage) {
          messagePayload = [];
          if (userMsg) {
            messagePayload.push({ text: userMsg });
          } else {
            messagePayload.push({ text: "Please analyze this image and help me craft a prompt based on it." });
          }
          messagePayload.push({
            inlineData: {
              mimeType: currentImage.mimeType,
              data: currentImage.base64Data
            }
          });
        }

        const response = await chatRef.current.sendMessage({ message: messagePayload });
        rawText = response.text || '';
      } else {
        // Ollama logic
        const systemInstruction = `You are an expert prompt engineer and editorial assistant. Your goal is to help the user craft the perfect prompt for an AI model. 
When the user provides an initial idea, you should enter a 'plan mode' where you ask 1-3 clarifying questions to refine the prompt. 
Keep your tone professional, minimalist, and editorial. 
Once you have enough information, provide the final, highly optimized prompt. 
IMPORTANT: When you provide the final prompt, wrap it in a markdown code block with the language 'prompt' (e.g., \`\`\`prompt\nYour prompt here\n\`\`\`). This allows the UI to extract and display it beautifully. Do not use the 'prompt' language block for anything else.`;

        const ollamaMessages = [
          { role: 'system', content: systemInstruction },
          ...messages.map(m => ({
            role: m.role === 'model' ? 'assistant' : 'user',
            content: m.content,
            images: m.image ? [m.image.split(',')[1]] : undefined
          })),
          {
            role: 'user',
            content: userMsg || "Please analyze this image and help me craft a prompt based on it.",
            images: currentImage ? [currentImage.base64Data] : undefined
          }
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
      }

      const cleanText = extractPrompt(rawText);
      
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: cleanText 
      }]);
    } catch (error: any) {
      console.error('Error sending message:', error);
      
      let errorMessage = "An error occurred while processing your request. Please try again.";
      
      if (provider === 'ollama' && error.message === 'Failed to fetch') {
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

  return (
    <main className="flex h-screen w-full bg-[#F7F7F5] text-[#0F0F0F] font-serif overflow-hidden">
      {/* Left Pane: Chat */}
      <section className="flex flex-col w-full lg:w-1/2 h-full border-r border-[#E2E2DE] relative">
        {/* Header */}
        <header className="px-8 py-6 border-b border-[#E2E2DE] flex items-center justify-between bg-[#F7F7F5]/80 backdrop-blur-sm z-10 absolute top-0 w-full">
          <h1 className="text-2xl font-light tracking-wide uppercase">Promptsmith</h1>
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
        <div className="flex-1 overflow-y-auto px-8 pt-24 pb-32">
          <div className="max-w-xl mx-auto space-y-12">
            {messages.map((msg) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={msg.id}
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
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
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
                    <img src={selectedImage.dataUrl} alt="Preview" className="h-24 w-auto rounded-md border border-[#E2E2DE] shadow-sm object-cover" />
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
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 text-[#555] hover:text-[#0F0F0F] transition-colors"
                disabled={isLoading}
              >
                <Paperclip size={18} strokeWidth={1.5} />
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
        </div>
      </section>

      {/* Right Pane: Final Prompt */}
      <section className="hidden lg:flex flex-col w-1/2 h-full bg-[#121212] text-[#F7F7F5] relative">
        <header className="px-12 py-8 flex justify-between items-center z-10">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#888] font-mono flex items-center gap-2">
            <Sparkles size={12} />
            Final Output
          </div>
          <AnimatePresence>
            {finalPrompt && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={handleCopy}
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] font-mono border border-[#F7F7F5]/30 rounded-full px-4 py-2 hover:bg-[#F7F7F5] hover:text-[#0F0F0F] transition-colors"
              >
                {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy Prompt'}
              </motion.button>
            )}
          </AnimatePresence>
        </header>

        <div className="flex-1 flex items-center justify-center p-12 z-10 overflow-y-auto">
          <AnimatePresence mode="wait">
            {finalPrompt ? (
              <motion.div
                key="prompt"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                className="w-full max-w-2xl"
              >
                <div className="font-mono text-sm leading-relaxed text-[#D4D4D0] whitespace-pre-wrap">
                  {finalPrompt}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center max-w-md"
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
        
        {/* Decorative elements */}
        <div className="absolute bottom-12 left-12 text-[10px] font-mono text-[#555] uppercase tracking-widest rotate-180" style={{ writingMode: 'vertical-rl' }}>
          Promptsmith v1.0
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
                  <div className="flex gap-8">
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
                  </div>
                </div>

                <AnimatePresence>
                  {provider === 'ollama' && (
                    <motion.div 
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
                      
                      <div className="pt-2">
                        <p className="text-xs font-mono text-[#888] leading-relaxed">
                          Note: To use Ollama from this web app, you must start it with CORS enabled:
                          <br/>
                          <code className="bg-[#E2E2DE]/50 px-1 py-0.5 rounded text-[#0F0F0F] mt-1 inline-block">OLLAMA_ORIGINS="*" ollama serve</code>
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
    </main>
  );
}
