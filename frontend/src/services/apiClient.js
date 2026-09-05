// ============================================
// API Client — Backend Communication
// ============================================
// Sends transcribed text to the backend for LLM processing.
// DATA FLOW: Frontend → POST /api/voice/process → Backend → Gemini → JSON → Frontend

const API_BASE = "/api/voice";
const REQUEST_TIMEOUT = 60000; // 60 seconds (allows time for model fallback retries)

/**
 * Send transcribed text to the backend for intent extraction.
 *
 * @param {string} transcript - The transcribed speech text
 * @param {object|null} context - Previous conversation context (for multi-turn)
 * @returns {Promise<object>} Structured extraction result
 *
 * Response shape:
 * {
 *   success: true,
 *   result: {
 *     intent: "CREATE_CONTACT",
 *     confidence: 0.95,
 *     data: { name: "Rahul Sharma", type: "Vendor", ... },
 *     missing_fields: [],
 *     follow_up_question: ""
 *   }
 * }
 */
export async function processVoiceInput(transcript, context = null, abortSignal = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  // If the user aborts, abort our internal controller too
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      controller.abort();
    });
  }

  try {
    const response = await fetch(`${API_BASE}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ transcript, context }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error || `Server error: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Unknown error occurred");
    }

    return data.result;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === "AbortError") {
      if (abortSignal && abortSignal.aborted) {
        throw new Error("Request cancelled by user.");
      }
      throw new Error(
        "Request timed out. The server took too long to respond. Please try again."
      );
    }

    if (error.message === "Failed to fetch") {
      throw new Error(
        "Cannot connect to the server. Make sure the backend is running on port 3000."
      );
    }

    throw error;
  }
}

/**
 * Check if the backend API is reachable.
 * @returns {Promise<boolean>}
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    const data = await response.json();
    return data.success === true;
  } catch {
    return false;
  }
}
