# 🎙️ AI Voice Assistant — Urban Furniture Accounting System

A self-contained voice assistant module that lets you speak naturally to create contacts, products, purchase orders, sales orders, record payments, and generate invoices — instead of filling forms manually.

## ✨ Features

- **🎤 Voice Input** — Speak commands using Web Speech API (works in Chrome)
- **🤖 AI Extraction** — Google Gemini extracts intent + entities from natural speech
- **💬 Multi-turn Conversations** — Asks follow-up questions for missing fields
- **🔊 Text-to-Speech** — Assistant speaks follow-up questions aloud
- **✅ Confirmation Modal** — Review & edit before saving (accounting accuracy!)
- **⌨️ Text Fallback** — Type commands when speech isn't available (Firefox, etc.)
- **🎨 Premium Dark UI** — Glassmorphism, gradients, animations

## 🚀 Quick Start

### 1. Get a Free Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click **"Get API Key"** → **"Create API Key"**
4. Copy the key

### 2. Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env and paste your GEMINI_API_KEY
npm install
npm start
```

The backend will run on `http://localhost:3000`

### 3. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will open at `http://localhost:5173`

## 📡 Data Flow

```
🎤 Mic Click → Web Speech API → Transcript Text
                                       ↓
                          POST /api/voice/process
                                       ↓
                        Backend → Gemini API (gemini-2.0-flash)
                                       ↓
                          Structured JSON Response
                          { intent, data, missing_fields }
                                       ↓
                    ┌──────────────────┴──────────────────┐
                    ↓                                      ↓
            Missing Fields?                         All Fields Complete
                    ↓                                      ↓
         TTS speaks follow-up              Confirmation Modal (editable)
         question, auto-starts mic                     ↓
         for next response                    User reviews & confirms
                                                       ↓
                                              ✅ Save (console.log for now)
```

## 🗣️ Example Commands

| Say this... | Intent |
|-------------|--------|
| "Add a new vendor named Rahul Sharma, mobile 9876543210, from Ahmedabad" | CREATE_CONTACT |
| "Create product Wooden Office Chair, price 8500, GST 18 percent" | CREATE_PRODUCT |
| "Purchase order for vendor Rahul, 50 chairs at 5500 each" | CREATE_PURCHASE_ORDER |
| "Sales order for customer Neha, 10 tables at 12000" | CREATE_SALES_ORDER |
| "Received payment of 50000 from Neha via UPI" | RECORD_PAYMENT |
| "Generate invoice for Mehta Enterprises, 5 tables at 25000 with 18% GST" | GENERATE_INVOICE |

## 🔌 Integration Guide

When you're ready to integrate with your existing app:

1. **Replace the save handler** in `VoiceAssistant.js` → `_handleConfirmSave()` 
   — Currently logs to console, replace with your actual API call
2. **Import the module** into your existing app by including the `VoiceAssistant` component
3. **Backend** can be merged with your existing Express server

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vite + Vanilla JS + CSS |
| Backend | Node.js + Express |
| LLM | Google Gemini API (gemini-2.0-flash, FREE) |
| Speech-to-Text | Web Speech API |
| Text-to-Speech | Web SpeechSynthesis API |

## 📁 Project Structure

```
ai-voice-assistant/
├── backend/
│   ├── .env.example          ← Your Gemini API key goes here
│   ├── package.json
│   ├── server.js             ← Express server
│   ├── routes/voice.js       ← /api/voice/process endpoint
│   ├── services/llmService.js ← Gemini API integration
│   └── prompts/systemPrompt.js ← Few-shot extraction prompt
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js        ← Proxy /api to backend
│   └── src/
│       ├── main.js           ← Entry point
│       ├── styles/index.css  ← Design system
│       ├── components/
│       │   ├── VoiceAssistant.js    ← Main orchestrator
│       │   ├── MicButton.js         ← Mic + waveform + fallback
│       │   ├── ConversationPanel.js ← Chat UI
│       │   └── ConfirmationModal.js ← Review & confirm form
│       └── services/
│           ├── speechRecognition.js ← Web Speech API wrapper
│           ├── speechSynthesis.js   ← TTS wrapper
│           ├── apiClient.js         ← Backend API calls
│           └── conversationContext.js ← Multi-turn state
│
└── README.md
```

## ⚠️ Browser Compatibility

| Browser | Voice Input | Text Input |
|---------|:-----------:|:----------:|
| Chrome  | ✅ Full     | ✅         |
| Edge    | ⚠️ Partial  | ✅         |
| Safari  | ⚠️ Partial  | ✅         |
| Firefox | ❌ None     | ✅         |

The module auto-detects support and shows a text input fallback for unsupported browsers.
