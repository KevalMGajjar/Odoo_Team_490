// ============================================
// MicButton Component
// ============================================
// Renders the microphone button with 3 states:
// - idle: ready to listen (gradient blue/purple)
// - listening: actively recording (pulsing red with rings)
// - processing: waiting for LLM response (amber shimmer)
//
// Also includes:
// - Waveform visualizer (Web Audio API + Canvas)
// - Text input fallback for unsupported browsers
// - Browser compatibility detection

export class MicButton {
  /**
   * @param {HTMLElement} container - DOM element to render into
   * @param {object} options
   * @param {boolean} options.speechSupported - Whether Web Speech API is available
   * @param {function} options.onToggle - Called when mic is toggled (start/stop)
   * @param {function} options.onTextSubmit - Called when text is submitted (fallback mode)
   */
  constructor(container, options = {}) {
    this.container = container;
    this.speechSupported = options.speechSupported !== false;
    this.onToggle = options.onToggle || (() => {});
    this.onTextSubmit = options.onTextSubmit || (() => {});
    this.onCancelProcessing = options.onCancelProcessing || (() => {});

    this.state = "idle"; // idle | listening | processing
    this._audioContext = null;
    this._analyser = null;
    this._animationFrame = null;
    this._stream = null;

    this.render();
  }

  render() {
    this.container.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "mic-container";

    if (this.speechSupported) {
      // ── Mic Button with Pulse Rings ──
      const btnWrapper = document.createElement("div");
      btnWrapper.style.position = "relative";
      btnWrapper.style.display = "inline-flex";
      btnWrapper.style.alignItems = "center";
      btnWrapper.style.justifyContent = "center";

      this._button = document.createElement("button");
      this._button.className = "mic-button";
      this._button.id = "mic-toggle-button";
      this._button.setAttribute("aria-label", "Toggle voice recording");
      this._button.innerHTML = "🎤";
      this._button.addEventListener("click", () => this._handleToggle());

      // Add pulse rings
      for (let i = 0; i < 3; i++) {
        const ring = document.createElement("div");
        ring.className = "mic-pulse-ring";
        btnWrapper.appendChild(ring);
      }

      btnWrapper.appendChild(this._button);
      wrapper.appendChild(btnWrapper);

      // ── Stop & Send Button (visible only while listening) ──
      this._stopBtn = document.createElement("button");
      this._stopBtn.className = "stop-send-button";
      this._stopBtn.id = "stop-send-button";
      this._stopBtn.innerHTML = "⏹ Stop & Send";
      this._stopBtn.style.display = "none";
      this._stopBtn.addEventListener("click", () => {
        if (this.state === "listening") {
          this.setState("idle");
          this.onToggle(false); // This triggers speechRecognition.stop() which flushes the transcript
        } else if (this.state === "processing") {
          this.setState("idle");
          this.onCancelProcessing(); // Aborts the fetch request
        }
      });
      wrapper.appendChild(this._stopBtn);

      // ── Waveform Visualizer ──
      const waveContainer = document.createElement("div");
      waveContainer.className = "waveform-container";
      this._waveContainer = waveContainer;

      const canvas = document.createElement("canvas");
      canvas.className = "waveform-canvas";
      canvas.width = 600;
      canvas.height = 60;
      this._canvas = canvas;
      waveContainer.appendChild(canvas);
      wrapper.appendChild(waveContainer);

      // ── Status Text ──
      this._statusText = document.createElement("div");
      this._statusText.className = "mic-status";
      this._statusText.textContent = "Click the mic to start speaking";
      wrapper.appendChild(this._statusText);

      // ── Language Toggle (English / Hindi) ──
      const langToggle = document.createElement("div");
      langToggle.className = "language-toggle";

      const langLabel = document.createElement("span");
      langLabel.className = "language-toggle__label";
      langLabel.textContent = "Language:";

      const enBtn = document.createElement("button");
      enBtn.className = "language-toggle__btn language-toggle__btn--active";
      enBtn.textContent = "English";
      enBtn.dataset.lang = "en-IN";

      const hiBtn = document.createElement("button");
      hiBtn.className = "language-toggle__btn";
      hiBtn.textContent = "हिंदी";
      hiBtn.dataset.lang = "hi-IN";

      this._currentLang = "en-IN";

      const setLang = (lang, activeBtn, inactiveBtn) => {
        this._currentLang = lang;
        activeBtn.classList.add("language-toggle__btn--active");
        inactiveBtn.classList.remove("language-toggle__btn--active");
        if (this.onLanguageChange) this.onLanguageChange(lang);
      };

      enBtn.addEventListener("click", () => setLang("en-IN", enBtn, hiBtn));
      hiBtn.addEventListener("click", () => setLang("hi-IN", hiBtn, enBtn));

      langToggle.appendChild(langLabel);
      langToggle.appendChild(enBtn);
      langToggle.appendChild(hiBtn);
      wrapper.appendChild(langToggle);
    } else {
      // ── Browser Warning ──
      const warning = document.createElement("div");
      warning.className = "browser-warning";
      warning.innerHTML =
        '⚠️ <span>Speech recognition is not supported in your browser. Use Chrome for voice input, or type your request below.</span>';
      wrapper.appendChild(warning);
    }

    // ── Text Input Fallback (always available) ──
    const textContainer = document.createElement("div");
    textContainer.className = "text-input-container";

    this._textInput = document.createElement("input");
    this._textInput.type = "text";
    this._textInput.className = "text-input";
    this._textInput.id = "text-input-fallback";
    this._textInput.placeholder = this.speechSupported
      ? "Or type your request here..."
      : 'Type your request (e.g., "Add vendor Rahul Sharma")';
    this._textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && this._textInput.value.trim()) {
        this._submitText();
      }
    });

    const sendBtn = document.createElement("button");
    sendBtn.className = "text-send-button";
    sendBtn.id = "text-send-button";
    sendBtn.textContent = "Send";
    sendBtn.addEventListener("click", () => this._submitText());
    this._sendBtn = sendBtn;

    textContainer.appendChild(this._textInput);
    textContainer.appendChild(sendBtn);
    wrapper.appendChild(textContainer);

    this.container.appendChild(wrapper);
  }

  /**
   * Handle mic button toggle
   */
  _handleToggle() {
    if (this.state === "processing") return; // Don't toggle while processing

    if (this.state === "idle") {
      this.setState("listening");
      this.onToggle(true);
    } else if (this.state === "listening") {
      this.setState("idle");
      this.onToggle(false);
    }
  }

  /**
   * Submit text from the fallback input
   */
  _submitText() {
    const text = this._textInput.value.trim();
    if (!text) return;

    this._textInput.value = "";
    this.onTextSubmit(text);
  }

  /**
   * Set the visual state of the mic button
   * @param {'idle'|'listening'|'processing'} state
   */
  setState(state) {
    this.state = state;

    if (!this._button) return;

    // Remove all state classes
    this._button.classList.remove(
      "mic-button--listening",
      "mic-button--processing"
    );
    this._statusText.classList.remove(
      "mic-status--listening",
      "mic-status--processing"
    );

    switch (state) {
      case "listening":
        this._button.classList.add("mic-button--listening");
        this._button.innerHTML = "🎤";
        this._statusText.textContent = "Listening... Speak now (auto-sends after 5s silence)";
        this._statusText.classList.add("mic-status--listening");
        this._waveContainer.classList.add("waveform-container--active");
        if (this._stopBtn) {
          this._stopBtn.style.display = "inline-flex";
          this._stopBtn.innerHTML = "⏹ Stop & Send";
        }
        this._startWaveform();
        break;

      case "processing":
        this._button.classList.add("mic-button--processing");
        this._button.innerHTML = "⏳";
        this._statusText.textContent = "Processing your request...";
        this._statusText.classList.add("mic-status--processing");
        this._waveContainer.classList.remove("waveform-container--active");
        if (this._stopBtn) {
          this._stopBtn.style.display = "inline-flex";
          this._stopBtn.innerHTML = "⏹ Cancel";
        }
        this._stopWaveform();
        break;

      case "idle":
      default:
        this._button.innerHTML = "🎤";
        this._statusText.textContent = "Click the mic to start speaking";
        this._waveContainer.classList.remove("waveform-container--active");
        if (this._stopBtn) this._stopBtn.style.display = "none";
        this._stopWaveform();
        break;
    }
  }

  /**
   * Disable/enable the text input
   */
  setInputDisabled(disabled) {
    if (this._textInput) this._textInput.disabled = disabled;
    if (this._sendBtn) this._sendBtn.disabled = disabled;
  }

  /**
   * Start the waveform visualizer using Web Audio API
   */
  async _startWaveform() {
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this._audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const source = this._audioContext.createMediaStreamSource(this._stream);
      this._analyser = this._audioContext.createAnalyser();
      this._analyser.fftSize = 256;
      source.connect(this._analyser);

      this._drawWaveform();
    } catch (error) {
      console.warn("[MicButton] Could not start waveform:", error.message);
    }
  }

  /**
   * Draw the waveform on the canvas
   */
  _drawWaveform() {
    if (!this._analyser || !this._canvas) return;

    const canvas = this._canvas;
    const ctx = canvas.getContext("2d");
    const analyser = this._analyser;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      this._animationFrame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      const centerY = canvas.height / 2;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * centerY * 0.9;

        // Gradient colors matching the theme
        const gradient = ctx.createLinearGradient(
          x,
          centerY - barHeight,
          x,
          centerY + barHeight
        );
        gradient.addColorStop(0, "rgba(244, 63, 94, 0.8)");
        gradient.addColorStop(0.5, "rgba(251, 191, 36, 0.6)");
        gradient.addColorStop(1, "rgba(244, 63, 94, 0.8)");

        ctx.fillStyle = gradient;
        ctx.fillRect(x, centerY - barHeight, barWidth - 1, barHeight * 2);

        x += barWidth;
      }
    };

    draw();
  }

  /**
   * Stop the waveform visualizer
   */
  _stopWaveform() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }

    if (this._audioContext) {
      this._audioContext.close().catch(() => {});
      this._audioContext = null;
    }

    if (this._stream) {
      this._stream.getTracks().forEach((track) => track.stop());
      this._stream = null;
    }

    this._analyser = null;

    // Clear the canvas
    if (this._canvas) {
      const ctx = this._canvas.getContext("2d");
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
  }
}
