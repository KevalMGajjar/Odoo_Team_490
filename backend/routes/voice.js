// ============================================
// Voice Processing Route
// ============================================
// POST /api/voice/process
//
// Receives transcribed text from the frontend,
// calls the LLM service for intent extraction,
// and returns structured JSON.
//
// DATA FLOW:
// Frontend → POST { transcript, context } → LLM Service → Gemini API → Structured JSON → Frontend

const express = require("express");
const router = express.Router();
const { extractIntent } = require("../services/llmService");

/**
 * POST /api/voice/process
 *
 * Request body:
 * {
 *   "transcript": "Add a new vendor named Rahul Sharma...",
 *   "context": {                          // optional, for multi-turn
 *     "currentIntent": "CREATE_CONTACT",
 *     "collectedData": { ... },
 *     "missingFields": ["email"],
 *     "lastFollowUp": "What's the email?"
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "intent": "CREATE_CONTACT",
 *     "confidence": 0.95,
 *     "data": { "name": "Rahul Sharma", "type": "Vendor", ... },
 *     "missing_fields": [],
 *     "follow_up_question": ""
 *   }
 * }
 */
router.post("/process", async (req, res) => {
  try {
    const { transcript, context } = req.body;

    // Validate input
    if (!transcript || typeof transcript !== "string" || transcript.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "Transcript is required and must be a non-empty string.",
      });
    }

    // Limit transcript length to prevent abuse
    if (transcript.length > 2000) {
      return res.status(400).json({
        success: false,
        error: "Transcript is too long. Please keep your input under 2000 characters.",
      });
    }

    console.log(`[Voice Route] Processing transcript: "${transcript.substring(0, 100)}..."`);
    if (context) {
      console.log(`[Voice Route] With context: intent=${context.currentIntent}, turn=${context.turnCount || 1}`);
    }

    // Call the LLM service for intent extraction
    const result = await extractIntent(transcript, context);

    // Return the structured result
    return res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[Voice Route] Error:", error);
    return res.status(500).json({
      success: false,
      error: "An error occurred while processing your voice input. Please try again.",
    });
  }
});

/**
 * GET /api/voice/health
 * Health check endpoint
 */
router.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Voice assistant API is running",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
