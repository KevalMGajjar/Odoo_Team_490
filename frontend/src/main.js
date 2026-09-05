// ============================================
// App Entry Point
// ============================================
// Initializes the AI Voice Assistant module.
// This is the single entry point — import this file to
// plug the assistant into any page.

import { VoiceAssistant } from "./components/VoiceAssistant.js";

// ── Initialize the app when DOM is ready ──
document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.getElementById("app");

  if (!appContainer) {
    console.error('[AI Voice Assistant] No #app element found in the DOM.');
    return;
  }

  // Create and mount the voice assistant
  const assistant = new VoiceAssistant(appContainer);

  // Expose to window for debugging (remove in production)
  window.__voiceAssistant = assistant;

  console.log("🎙️ AI Voice Assistant initialized");
});
