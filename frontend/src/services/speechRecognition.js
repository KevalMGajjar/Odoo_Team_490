// ============================================
// Speech Recognition Manager
// ============================================
// Wraps the Web Speech API (SpeechRecognition) with:
// - Browser compatibility detection
// - Start/stop/abort controls
// - Interim + final result callbacks
// - Auto-restart on unexpected endings
// - Fallback detection for unsupported browsers

export class SpeechRecognitionManager {
  constructor() {
    // Detect browser support (Chrome uses webkit prefix)
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    this.isSupported = !!SpeechRecognition;
    this.isListening = false;
    this.recognition = null;
    this._shouldRestart = false;

    // Callbacks (set by the consumer)
    this.onResult = null; // (transcript: string) => void — final result
    this.onInterim = null; // (transcript: string) => void — interim/live result
    this.onError = null; // (error: string) => void
    this.onEnd = null; // () => void — recognition ended
    this.onStart = null; // () => void — recognition started

    if (this.isSupported) {
      this.recognition = new SpeechRecognition();
      this._configure();
    }
  }

  /**
   * Configure the SpeechRecognition instance
   */
  _configure() {
    const rec = this.recognition;

    // Language: Indian English
    rec.lang = "en-IN";

    // Continuous mode: keep listening until manually stopped
    // We use a 5s silence debounce to decide when the user is "done"
    rec.continuous = true;

    // Show interim results as the user speaks
    rec.interimResults = true;

    // Return multiple alternative transcriptions (we use the best one)
    rec.maxAlternatives = 1;

    // ── Debounce state ──
    this._accumulatedTranscript = "";
    this._silenceTimer = null;
    this._SILENCE_DELAY_MS = 5000; // 5 seconds of silence before sending

    // ── Event Handlers ──

    rec.onstart = () => {
      this.isListening = true;
      this._accumulatedTranscript = "";
      if (this.onStart) this.onStart();
    };

    rec.onresult = (event) => {
      let interimTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;

        if (result.isFinal) {
          // Accumulate final chunks (user may still be speaking)
          this._accumulatedTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      // Show interim results for live display
      if (interimTranscript && this.onInterim) {
        this.onInterim(this._accumulatedTranscript + interimTranscript);
      }

      // Reset the silence timer every time we get a result
      // (user is still actively speaking)
      this._resetSilenceTimer();
    };

    rec.onerror = (event) => {
      console.error("[SpeechRecognition] Error:", event.error);

      let errorMessage = "";
      switch (event.error) {
        case "not-allowed":
          errorMessage =
            "Microphone access denied. Please allow microphone access in your browser settings.";
          break;
        case "no-speech":
          errorMessage = "No speech detected. Please try again.";
          break;
        case "audio-capture":
          errorMessage =
            "No microphone found. Please connect a microphone and try again.";
          break;
        case "network":
          errorMessage =
            "Network error. Speech recognition requires an internet connection.";
          break;
        case "aborted":
          // User manually stopped — not a real error
          return;
        default:
          errorMessage = `Speech recognition error: ${event.error}`;
      }

      this.isListening = false;
      if (this.onError) this.onError(errorMessage);
    };

    rec.onend = () => {
      this.isListening = false;

      // Auto-restart if we want continuous listening but recognition stopped
      if (this._shouldRestart) {
        this._shouldRestart = false;
        try {
          rec.start();
        } catch (e) {
          // Ignore if already started
        }
        return;
      }

      if (this.onEnd) this.onEnd();
    };
  }
  /**
   * Start listening for speech
   */
  start() {
    if (!this.isSupported) {
      if (this.onError)
        this.onError("Speech recognition is not supported in this browser.");
      return false;
    }

    if (this.isListening) {
      return true; // Already listening
    }

    try {
      this._accumulatedTranscript = "";
      this.recognition.start();
      return true;
    } catch (error) {
      console.error("[SpeechRecognition] Start error:", error);
      if (this.onError) this.onError("Failed to start speech recognition.");
      return false;
    }
  }

  /**
   * Stop listening (waits for any pending result)
   */
  stop() {
    if (!this.isSupported || !this.isListening) return;

    try {
      this._shouldRestart = false;
      this._clearSilenceTimer();
      // Flush whatever we have accumulated so far
      this._flushTranscript();
      this.recognition.stop();
    } catch (error) {
      console.error("[SpeechRecognition] Stop error:", error);
    }
  }

  /**
   * Abort listening immediately (discards pending results)
   */
  abort() {
    if (!this.isSupported || !this.isListening) return;

    try {
      this._shouldRestart = false;
      this._clearSilenceTimer();
      this._accumulatedTranscript = "";
      this.recognition.abort();
    } catch (error) {
      console.error("[SpeechRecognition] Abort error:", error);
    }
  }

  // ── Silence debounce helpers ──

  /**
   * Reset the 5-second silence timer.
   * Called every time a speech result comes in.
   * When the user stops speaking for 5s, it flushes the transcript and stops listening.
   */
  _resetSilenceTimer() {
    this._clearSilenceTimer();

    this._silenceTimer = setTimeout(() => {
      console.log("[SpeechRecognition] 5s silence detected — flushing transcript");
      this._flushTranscript();
      // Stop recognition after sending
      try {
        this.recognition.stop();
      } catch (e) {
        // ignore
      }
    }, this._SILENCE_DELAY_MS);
  }

  /**
   * Clear the silence timer
   */
  _clearSilenceTimer() {
    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }
  }

  /**
   * Flush the accumulated transcript to the onResult callback
   */
  _flushTranscript() {
    const transcript = this._accumulatedTranscript.trim();
    this._accumulatedTranscript = "";

    if (transcript && this.onResult) {
      this.onResult(transcript);
    }
  }
}
