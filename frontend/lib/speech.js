'use client'

/**
 * Web Speech API wrappers for the voice assistant.
 *
 * Adapted from the ai-voice-assistant branch, trimmed to what a short
 * navigation command needs: `continuous = false` lets the browser decide when
 * the speaker has finished, so the hand-rolled silence timer and auto-restart
 * loop that version carried are unnecessary here.
 *
 * Speech recognition in Chrome/Edge streams audio to the browser vendor for
 * transcription — that is the browser's own behaviour, not something this app
 * sends anywhere. Firefox has no support at all, which is why every entry
 * point has a typed fallback.
 */

export function isSpeechSupported() {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Listen for one utterance.
 *
 * @returns a handle with `.abort()`; callbacks report interim text, the final
 *          transcript, errors, and the end of the session.
 */
export function listenOnce({ onInterim, onResult, onError, onEnd, lang = 'en-IN' } = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!SpeechRecognition) {
    onError?.('Speech recognition is not supported in this browser. Type your request instead.')
    onEnd?.()
    return { abort: () => {} }
  }

  const rec = new SpeechRecognition()
  rec.lang = lang
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1

  let finalText = ''
  let aborted = false

  rec.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) finalText += result[0].transcript
      else interim += result[0].transcript
    }
    if (interim) onInterim?.(finalText + interim)
  }

  rec.onerror = (event) => {
    if (aborted || event.error === 'aborted') return
    const messages = {
      'not-allowed': 'Microphone access was denied. Allow it in your browser settings to use voice.',
      'no-speech': "I didn't hear anything. Try again.",
      'audio-capture': 'No microphone found. Connect one, or type your request instead.',
      network: 'Speech recognition needs an internet connection.',
    }
    onError?.(messages[event.error] ?? `Speech recognition error: ${event.error}`)
  }

  rec.onend = () => {
    if (!aborted) {
      const text = finalText.trim()
      if (text) onResult?.(text)
    }
    onEnd?.()
  }

  try {
    rec.start()
  } catch {
    onError?.('Could not start the microphone.')
    onEnd?.()
  }

  return {
    abort: () => {
      aborted = true
      try { rec.abort() } catch { /* already stopped */ }
    },
  }
}

/** Speak a short confirmation. Silently does nothing where unsupported. */
export function speak(text) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return
  try {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    const voices = window.speechSynthesis.getVoices()
    const preferred =
      voices.find((v) => v.lang === 'en-IN') ||
      voices.find((v) => v.lang?.startsWith('en')) ||
      null
    if (preferred) utterance.voice = preferred
    utterance.rate = 1.05
    window.speechSynthesis.speak(utterance)
  } catch {
    // TTS is a nicety — never let it break navigation
  }
}

export function cancelSpeech() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  try { window.speechSynthesis.cancel() } catch { /* no-op */ }
}
