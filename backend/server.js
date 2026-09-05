// ============================================
// Express Server — AI Voice Assistant Backend
// ============================================
// This server acts as a thin proxy between the browser frontend
// and the Google Gemini API. It keeps the API key secure on the
// server side and handles intent extraction requests.
//
// Endpoints:
// POST /api/voice/process  → Process transcribed speech
// GET  /api/voice/health   → Health check

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const voiceRoutes = require("./routes/voice");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ─────────────────────────────────────────
app.use("/api/voice", voiceRoutes);

// Root route
app.get("/", (req, res) => {
  res.json({
    name: "Urban Furniture AI Voice Assistant — Backend API",
    version: "1.0.0",
    endpoints: {
      process: "POST /api/voice/process",
      health: "GET /api/voice/health",
    },
  });
});

// ── Error Handling ─────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Server Error]", err.stack);
  res.status(500).json({
    success: false,
    error: "Internal server error",
  });
});

// ── Start Server ───────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎙️  AI Voice Assistant Backend running on http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/voice/process`);
  console.log(`💚 Health check: http://localhost:${PORT}/api/voice/health`);

  // Verify Gemini API key is configured
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "your_gemini_api_key_here") {
    console.warn("\n⚠️  WARNING: GEMINI_API_KEY is not set!");
    console.warn("   Get your free key at: https://aistudio.google.com/");
    console.warn("   Then add it to backend/.env file\n");
  } else {
    console.log(`🔑 Gemini API key: configured ✓\n`);
  }
});
