// ============================================
// VoiceAssistant Component — Main Orchestrator
// ============================================
// This is the central component that wires everything together:
//
// DATA FLOW:
// 1. User clicks mic → SpeechRecognition captures audio → transcript text
// 2. Transcript sent to backend → POST /api/voice/process
// 3. Backend calls Gemini API → structured JSON (intent + entities)
// 4. If missing fields → TTS asks follow-up question → goto step 1
// 5. If complete → show ConfirmationModal with editable form
// 6. User reviews, edits, clicks "Confirm & Save"
// 7. Data logged (you'll wire this to your actual DB later)

import { SpeechRecognitionManager } from "../services/speechRecognition.js";
import { SpeechSynthesisManager } from "../services/speechSynthesis.js";
import { ConversationContextManager } from "../services/conversationContext.js";
import { processVoiceInput, checkHealth } from "../services/apiClient.js";
import { MicButton } from "./MicButton.js";
import { ConversationPanel } from "./ConversationPanel.js";
import { ConfirmationModal } from "./ConfirmationModal.js";

export class VoiceAssistant {
  /**
   * @param {HTMLElement} container - Root DOM element to render the entire assistant into
   */
  constructor(container) {
    this.container = container;

    // Initialize services
    this.speechRecognition = new SpeechRecognitionManager();
    this.speechSynthesis = new SpeechSynthesisManager();
    this.conversationContext = new ConversationContextManager();
    this.confirmationModal = new ConfirmationModal({
      onConfirm: (intent, data) => this._handleConfirmSave(intent, data),
      onCancel: () => this._handleCancel(),
    });

    // State
    this._isProcessing = false;

    // Build UI
    this._render();
    this._setupSpeechCallbacks();
    this._checkBackendHealth();
  }

  /**
   * Build the full UI layout
   */
  _render() {
    this.container.innerHTML = "";

    // ── Header ──
    const header = document.createElement("header");
    header.className = "app-header";
    header.innerHTML = `
      <div class="app-header__icon">🎙️</div>
      <h1 class="app-header__title">AI Voice Assistant</h1>
      <p class="app-header__subtitle">Urban Furniture Accounting System — Speak to create records</p>
    `;
    this.container.appendChild(header);

    // ── Main Content Card ──
    const card = document.createElement("div");
    card.className = "glass-card";

    // Conversation Panel area
    const conversationContainer = document.createElement("div");
    conversationContainer.id = "conversation-container";
    this.conversationPanel = new ConversationPanel(conversationContainer, {
      onHintClick: (hint) => this._processText(hint),
    });

    // Mic Button area
    const micContainer = document.createElement("div");
    micContainer.id = "mic-container";
    this.micButton = new MicButton(micContainer, {
      speechSupported: this.speechRecognition.isSupported,
      onToggle: (listening) => this._handleMicToggle(listening),
      onTextSubmit: (text) => this._processText(text),
      onCancelProcessing: () => this.abortProcessing(),
    });

    // Wire language toggle to speech recognition
    this.micButton.onLanguageChange = (lang) => {
      if (this.speechRecognition.recognition) {
        this.speechRecognition.recognition.lang = lang;
        console.log(`[VoiceAssistant] Speech language changed to: ${lang}`);
      }
    };

    card.appendChild(conversationContainer);
    card.appendChild(micContainer);
    this.container.appendChild(card);

    // ── Toast Container ──
    this._toastContainer = document.createElement("div");
    this._toastContainer.className = "toast-container";
    document.body.appendChild(this._toastContainer);
  }

  /**
   * Setup callbacks from the speech recognition service
   */
  _setupSpeechCallbacks() {
    const sr = this.speechRecognition;

    // Show interim (live) results as user speaks
    sr.onInterim = (text) => {
      this.conversationPanel.showInterim(text);
    };

    // Handle final speech result
    sr.onResult = (transcript) => {
      this.micButton.setState("idle");
      this._processText(transcript);
    };

    // Handle errors
    sr.onError = (errorMessage) => {
      this.micButton.setState("idle");
      this.conversationPanel.addMessage("assistant", errorMessage);
      this._showToast(errorMessage, "error");
    };

    // Handle recognition ending (e.g., timeout)
    sr.onEnd = () => {
      if (this.micButton.state === "listening") {
        this.micButton.setState("idle");
      }
    };
  }

  /**
   * Handle mic button toggle
   */
  _handleMicToggle(listening) {
    if (listening) {
      // Stop TTS if it's speaking (so mic doesn't pick up the assistant's voice)
      this.speechSynthesis.stop();
      this.speechRecognition.start();
    } else {
      this.speechRecognition.stop();
    }
  }

  /**
   * Abort the current API processing request
   */
  abortProcessing() {
    if (this._abortController) {
      this._abortController.abort();
    }
  }

  /**
   * Process text input (from either speech or text fallback)
   * This is the main data flow entry point.
   */
  async _processText(transcript) {
    if (this._isProcessing || !transcript.trim()) return;

    this._isProcessing = true;
    this._abortController = new AbortController();
    
    this.micButton.setState("processing");
    this.micButton.setInputDisabled(true);

    // Add user's message to conversation
    this.conversationPanel.addMessage("user", transcript);
    this.conversationContext.addMessage("user", transcript);

    try {
      // Get context for multi-turn (null if first turn)
      const context = this.conversationContext.getContextForBackend();

      // ── Call backend → Gemini API ──
      const result = await processVoiceInput(transcript, context, this._abortController.signal);

      console.log("[VoiceAssistant] LLM Result:", result);

      // Update conversation context with the response
      this.conversationContext.updateFromResponse(result);

      // ── Handle the result based on intent ──

      if (result.intent === "UNKNOWN") {
        // Unknown intent — ask to rephrase
        const message =
          result.follow_up_question ||
          "Sorry, I didn't understand that. Could you rephrase?";
        this.conversationPanel.addMessage("assistant", message);
        this.conversationContext.addMessage("assistant", message);
        await this.speechSynthesis.speak(message);
        this.conversationContext.reset();
      } else if (
        result.missing_fields &&
        result.missing_fields.length > 0 &&
        result.follow_up_question &&
        !this.conversationContext.isMaxTurnsReached
      ) {
        // Missing fields — ask follow-up question
        const question = result.follow_up_question;
        this.conversationPanel.addMessage("assistant", question, {
          intent: result.intent,
        });
        this.conversationContext.addMessage("assistant", question);

        // Speak the follow-up question via TTS
        await this.speechSynthesis.speak(question);

        // Auto-start listening again for the user's answer
        if (this.speechRecognition.isSupported) {
          setTimeout(() => {
            this.micButton.setState("listening");
            this.speechRecognition.start();
          }, 500); // Small delay after TTS finishes
        }
      } else {
        // All fields captured (or max turns reached) — show confirmation modal
        const confirmMessage =
          "I've captured the details. Please review and confirm:";
        this.conversationPanel.addMessage("assistant", confirmMessage, {
          intent: result.intent,
          confidence: result.confidence,
        });
        this.conversationContext.addMessage("assistant", confirmMessage);

        // Show the confirmation modal with extracted data
        this.confirmationModal.show(
          result.intent,
          this.conversationContext.collectedData,
          result.confidence
        );
      }
    } catch (error) {
      console.error("[VoiceAssistant] Error:", error);
      
      if (error.message === "Request cancelled by user.") {
        this.conversationPanel.addMessage("assistant", "Request cancelled.");
      } else {
        const errorMessage = error.message || "Something went wrong. Please try again.";
        this.conversationPanel.addMessage("assistant", `❌ ${errorMessage}`);
        this._showToast(errorMessage, "error");
      }
      this.conversationContext.reset();
    } finally {
      this._isProcessing = false;
      this._abortController = null;
      this.micButton.setState("idle");
      this.micButton.setInputDisabled(false);
    }
  }

  /**
   * Handle "Confirm & Save" from the confirmation modal
   * For now, this logs the data. You'll wire it to your actual API later.
   */
  _handleConfirmSave(intent, data) {
    console.log("═══════════════════════════════════════");
    console.log("✅ CONFIRMED & SAVED");
    console.log("Intent:", intent);
    console.log("Data:", JSON.stringify(data, null, 2));
    console.log("═══════════════════════════════════════");

    // Show success message
    const intentLabels = {
      CREATE_CONTACT: "Contact",
      CREATE_PRODUCT: "Product",
      CREATE_PURCHASE_ORDER: "Purchase Order",
      CREATE_SALES_ORDER: "Sales Order",
      RECORD_PAYMENT: "Payment",
      GENERATE_INVOICE: "Invoice",
    };
    const label = intentLabels[intent] || "Record";
    const message = `✅ ${label} saved successfully!`;

    this.conversationPanel.addMessage("assistant", message);
    this._showToast(message, "success");
    this.speechSynthesis.speak(`${label} has been saved successfully.`);

    // Reset conversation for next command
    this.conversationContext.reset();
  }

  /**
   * Handle cancel from the confirmation modal
   */
  _handleCancel() {
    // Don't reset context — user might want to try again
    console.log("[VoiceAssistant] Confirmation cancelled");
  }

  /**
   * Check if the backend API is reachable on startup
   */
  async _checkBackendHealth() {
    const healthy = await checkHealth();
    if (!healthy) {
      this.conversationPanel.addMessage(
        "assistant",
        "⚠️ Cannot connect to the backend server. Make sure it's running:\n\ncd backend && npm start"
      );
      this._showToast(
        "Backend not reachable. Start with: cd backend && npm start",
        "error"
      );
    }
  }

  /**
   * Show a toast notification
   */
  _showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;

    const icons = { success: "✅", error: "❌", info: "ℹ️" };
    toast.textContent = `${icons[type] || ""} ${message}`;

    this._toastContainer.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      toast.classList.add("toast--exit");
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}
