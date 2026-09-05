// ============================================
// Speech Synthesis Manager (Text-to-Speech)
// ============================================
// Uses the Web Speech API SpeechSynthesis to speak
// follow-up questions and confirmations aloud.

export class SpeechSynthesisManager {
  constructor() {
    this.isSupported = "speechSynthesis" in window;
    this.isSpeaking = false;
    this._preferredVoice = null;

    if (this.isSupported) {
      // Load voices (may be async in some browsers)
      this._loadVoices();
      // Some browsers fire voiceschanged when voices become available
      window.speechSynthesis.onvoiceschanged = () => this._loadVoices();
    }
  }

  /**
   * Load and select the best voice.
   * Prefers Indian English, falls back to any English voice.
   */
  _loadVoices() {
    const voices = window.speechSynthesis.getVoices();

    // Try to find an Indian English voice first
    this._preferredVoice =
      voices.find(
        (v) => v.lang === "en-IN" && (v.localService || v.name.includes("Google"))
      ) ||
      voices.find((v) => v.lang === "en-IN") ||
      voices.find(
        (v) => v.lang.startsWith("en") && v.name.includes("Google")
      ) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      voices[0] || null;
  }

  /**
   * Speak the given text aloud.
   * Returns a Promise that resolves when speaking is done.
   *
   * @param {string} text - Text to speak
   * @param {object} options - Optional settings { rate, pitch, volume }
   */
  speak(text, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isSupported) {
        console.warn("[TTS] SpeechSynthesis not supported");
        resolve();
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);

      // Apply settings
      utterance.rate = options.rate || 0.95; // Slightly slower for clarity
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 0.9;

      if (this._preferredVoice) {
        utterance.voice = this._preferredVoice;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        resolve();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        console.error("[TTS] Error:", event.error);
        resolve(); // Don't reject — TTS failure shouldn't break the flow
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stop speaking immediately.
   */
  stop() {
    if (this.isSupported) {
      window.speechSynthesis.cancel();
      this.isSpeaking = false;
    }
  }
}
