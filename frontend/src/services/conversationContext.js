// ============================================
// Conversation Context Manager
// ============================================
// Manages multi-turn conversation state so that:
// 1. If the LLM detects missing fields, we ask a follow-up question
// 2. The user's next response is merged with the accumulated data
// 3. This continues until all required fields are filled or user cancels
// 4. Max 5 turns to prevent infinite loops

const MAX_TURNS = 5;

export class ConversationContextManager {
  constructor() {
    this.reset();
  }

  /**
   * Reset conversation state (start fresh)
   */
  reset() {
    this.currentIntent = null;
    this.collectedData = {};
    this.missingFields = [];
    this.lastFollowUp = "";
    this.turnCount = 0;
    this.history = []; // Array of { role: 'user'|'assistant', text: string, timestamp: Date }
  }

  /**
   * Check if we're in the middle of a multi-turn conversation
   */
  get isActive() {
    return this.currentIntent !== null && this.currentIntent !== "UNKNOWN";
  }

  /**
   * Check if we've exceeded the maximum number of turns
   */
  get isMaxTurnsReached() {
    return this.turnCount >= MAX_TURNS;
  }

  /**
   * Update context with a new LLM response.
   * Call this after every LLM extraction call.
   *
   * @param {object} result - LLM extraction result { intent, confidence, data, missing_fields, follow_up_question }
   */
  updateFromResponse(result) {
    this.turnCount++;

    // Set or keep the intent
    if (!this.currentIntent || this.currentIntent === "UNKNOWN") {
      this.currentIntent = result.intent;
    }

    // Merge new data with existing collected data
    if (result.data) {
      this.collectedData = this._mergeData(this.collectedData, result.data);
    }

    // Update missing fields
    this.missingFields = result.missing_fields || [];

    // Store follow-up question
    this.lastFollowUp = result.follow_up_question || "";
  }

  /**
   * Add a message to conversation history
   *
   * @param {'user'|'assistant'} role
   * @param {string} text
   */
  addMessage(role, text) {
    this.history.push({
      role,
      text,
      timestamp: new Date(),
    });
  }

  /**
   * Check if there are missing fields that need follow-up
   */
  get hasMissingFields() {
    return this.missingFields.length > 0 && this.lastFollowUp !== "";
  }

  /**
   * Get the context object to send to the backend for multi-turn support
   */
  getContextForBackend() {
    if (!this.isActive) return null;

    return {
      currentIntent: this.currentIntent,
      collectedData: this.collectedData,
      missingFields: this.missingFields,
      lastFollowUp: this.lastFollowUp,
      turnCount: this.turnCount,
    };
  }

  /**
   * Deep merge two data objects.
   * New values override old values, but empty strings don't override existing data.
   */
  _mergeData(existing, incoming) {
    const merged = { ...existing };

    for (const [key, value] of Object.entries(incoming)) {
      if (key === "items" && Array.isArray(value)) {
        // For line items, use the incoming items (LLM should return the full updated list)
        merged.items = value;
      } else if (value !== "" && value !== null && value !== undefined) {
        // Only override if the new value is non-empty
        merged[key] = value;
      } else if (!(key in merged)) {
        // Set empty value if key doesn't exist yet
        merged[key] = value;
      }
    }

    return merged;
  }
}
