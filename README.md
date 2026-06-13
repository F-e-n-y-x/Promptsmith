# Promptsmith

Promptsmith is a minimalist, editorial-style prompt refinement tool. It acts as an expert prompt engineer, engaging you in a "Plan Mode" chat to ask clarifying questions about your initial ideas, and then automatically crafts and extracts a highly optimized prompt for your AI workflows.

## ✨ Features

- **Editorial Aesthetic:** A beautiful, distraction-free split-pane interface featuring classic serif typography (Cormorant Garamond) paired with precise monospace accents (JetBrains Mono).
- **Plan Mode Chat:** An interactive assistant that helps refine your ideas through targeted questions before generating the final prompt.
- **Multimodal Support:** Upload sketches, screenshots, or reference images alongside your text to provide visual context to the AI.
- **Auto-Extraction:** The final optimized prompt is automatically detected and beautifully presented in a dedicated output pane with a one-click copy button.
- **Tri-Provider AI Support:** 
  - **Google Gemini:** Powered by the Gemini 3 Flash Preview model for lightning-fast, high-quality reasoning.
  - **Ollama (Local):** Full support for running local, private models via Ollama.
  - **Pollinations AI:** Access to various top-tier models (GPT-4o, Claude, DeepSeek) through Pollinations.
- **Persistent Local History:** Your sessions, images, and prompts are securely saved to a local `history` folder on your hard drive, bypassing browser limits.
- **Docker Ready:** Includes a lightweight, multi-architecture Dockerfile for easy deployment.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- A Google Gemini API Key (if using Gemini)
- [Ollama](https://ollama.com/) (if using local models)

### Installation

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Set up your environment variables:
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY="your_api_key_here"
   ```

3. Start the development server (this automatically starts both the React frontend and the Express backend for file saving):
   ```bash
   npm run dev
   ```

## 🦙 Using Ollama (Local Models)

To use local models, you must start your Ollama server with Cross-Origin Resource Sharing (CORS) enabled, otherwise, the web browser will block the connection.

1. Quit the Ollama app if it is currently running in your system tray/menu bar.
2. Open your terminal and start Ollama with the following command:

**Mac/Linux:**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**Windows (Command Prompt):**
```cmd
set OLLAMA_ORIGINS="*" && ollama serve
```

3. Open the Settings modal in Promptsmith (gear icon), select "Ollama", and choose your model from the auto-detected dropdown list.

## 🐳 Docker Deployment

Promptsmith includes a multi-stage Dockerfile that builds the static assets and serves them using a lightweight Nginx container.

```bash
# Build the image
docker build -t promptsmith .

# Run the container
docker run -p 8080:80 promptsmith
```

## 🛠️ Tech Stack

- **Framework:** React 19 + Vite + Express (Backend)
- **Styling:** Tailwind CSS v4
- **Animation:** Motion (Framer Motion)
- **Icons:** Lucide React
- **Markdown:** React Markdown
- **AI SDK:** `@google/genai`
- **History Storage:** Node.js `fs` module
