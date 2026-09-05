'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Square, CornerDownLeft, AlertCircle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { Modal } from '@/components/ui/Modal'
import { api, ApiError } from '@/lib/api'
import { isSpeechSupported, listenOnce, speak, cancelSpeech } from '@/lib/speech'

const EXAMPLES = [
  'Open the balance sheet for financial year 2025-2026',
  'Show profit and loss for last month',
  'How can I make a new sales invoice?',
  'Show unpaid invoices',
  'What can you do?',
]

/**
 * Voice/chat navigation.
 *
 * The assistant can only ever open a screen: the server matches speech against
 * a fixed allowlist of routes and returns one, so a misheard command opens the
 * wrong screen at worst. Some of those routes are blank "new document" forms —
 * opening one saves nothing, the user still fills it in and presses save. The
 * assistant never states a figure either; every number comes from the screen
 * itself, fetched normally from the database.
 */
export function VoiceAssistant({ open, onClose }) {
  const router = useRouter()
  const [phase, setPhase] = useState('idle') // idle | listening | thinking | done
  const [transcript, setTranscript] = useState('')
  const [typed, setTyped] = useState('')
  // Kept across opens so repeat use reads like a conversation. Session-only —
  // nothing here is persisted.
  const [history, setHistory] = useState([]) // { you, reply, tone }
  const sessionRef = useRef(null)
  const supported = isSpeechSupported()

  const reset = useCallback(() => {
    sessionRef.current?.abort()
    sessionRef.current = null
    cancelSpeech()
    setPhase('idle')
    setTranscript('')
    setTyped('')
  }, [])

  useEffect(() => {
    if (!open) reset()
  }, [open, reset])

  useEffect(() => () => { sessionRef.current?.abort(); cancelSpeech() }, [])

  const interpret = useCallback(async (text) => {
    const command = text.trim()
    if (!command) return
    setTranscript(command)
    setPhase('thinking')
    try {
      const res = await api.post('/voice/interpret', { transcript: command })

      if (!res.ok) {
        setPhase('idle')
        setTranscript('')
        setHistory((h) => [...h, { you: command, reply: res.clarify, tone: 'error' }])
        speak(res.clarify)
        return
      }

      // HELP and similar answer in the panel without navigating.
      if (!res.route) {
        setPhase('idle')
        setTranscript('')
        setHistory((h) => [...h, { you: command, reply: res.answer, tone: 'info' }])
        return
      }

      setPhase('done')
      setTranscript('')
      setHistory((h) => [...h, { you: command, reply: res.spoken, tone: 'info' }])
      speak(res.spoken)

      const query = new URLSearchParams(
        Object.entries(res.params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ).toString()
      router.push(query ? `${res.route}?${query}` : res.route)
      onClose()
    } catch (err) {
      setPhase('idle')
      setTranscript('')
      const text = err instanceof ApiError ? err.message : 'Could not reach the assistant.'
      setHistory((h) => [...h, { you: command, reply: text, tone: 'error' }])
    }
  }, [router, onClose])

  const startListening = useCallback(() => {
    setTranscript('')
    setPhase('listening')
    sessionRef.current = listenOnce({
      onInterim: setTranscript,
      onResult: (text) => interpret(text),
      onError: (text) => { setPhase('idle'); setHistory((h) => [...h, { you: '🎤', reply: text, tone: 'error' }]) },
      onEnd: () => { sessionRef.current = null; setPhase((p) => (p === 'listening' ? 'idle' : p)) },
    })
  }, [interpret])

  const stopListening = useCallback(() => {
    sessionRef.current?.abort()
    sessionRef.current = null
    setPhase('idle')
  }, [])

  const busy = phase === 'thinking'

  return (
    <Modal open={open} onClose={onClose} title="Voice Assistant" size="md">
      <div className="space-y-4">
        <p className="text-xs text-ink-muted">
          Ask for a screen or how to do something — the assistant opens it for you. It never saves or changes anything itself.
        </p>

        {supported ? (
          <div className="flex flex-col items-center gap-3 rounded border border-line bg-surface-subtle py-6">
            <button
              type="button"
              onClick={phase === 'listening' ? stopListening : startListening}
              disabled={busy}
              className={clsx(
                'flex h-16 w-16 items-center justify-center rounded-full transition-colors duration-150 disabled:opacity-50',
                phase === 'listening'
                  ? 'bg-state-overdue text-ink-invert animate-pulse'
                  : 'bg-brand text-ink-invert hover:bg-brand-hover',
              )}
              aria-label={phase === 'listening' ? 'Stop listening' : 'Start listening'}
            >
              {busy ? <Loader2 size={22} className="animate-spin" />
                : phase === 'listening' ? <Square size={20} />
                : <Mic size={22} />}
            </button>
            <p className="text-xs text-ink-muted">
              {phase === 'listening' ? 'Listening — speak now'
                : busy ? 'Working out which screen you want…'
                : 'Tap to speak'}
            </p>
            {transcript && <p className="px-4 text-center text-sm text-ink">&ldquo;{transcript}&rdquo;</p>}
          </div>
        ) : (
          <p className="rounded border border-line bg-surface-subtle px-3 py-2 text-xs text-ink-muted">
            This browser has no speech recognition (Firefox doesn&rsquo;t support it). Type your request instead.
          </p>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); interpret(typed); setTyped('') }}
          className="flex items-center gap-2"
        >
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="…or type a request"
            className="field-input flex-1"
            disabled={busy}
          />
          <button type="submit" className="btn-secondary btn-sm" disabled={busy || !typed.trim()}>
            <CornerDownLeft size={13} /> Go
          </button>
        </form>

        {history.length > 0 && (
          <div className="max-h-56 space-y-2 overflow-y-auto rounded border border-line p-2">
            {history.map((turn, i) => (
              <div key={i} className="space-y-1">
                <p className="text-right text-xs text-ink-muted">{turn.you}</p>
                <div
                  className={clsx(
                    'flex items-start gap-2 rounded px-2.5 py-1.5 text-sm',
                    turn.tone === 'error'
                      ? 'bg-state-overdue/5 text-state-overdue'
                      : 'bg-brand-light text-ink',
                  )}
                >
                  {turn.tone === 'error' && <AlertCircle size={13} className="mt-0.5 shrink-0" />}
                  <span className="whitespace-pre-line">{turn.reply}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase text-ink-muted">Try saying</p>
          <ul className="space-y-1">
            {EXAMPLES.map((ex) => (
              <li key={ex}>
                <button
                  type="button"
                  onClick={() => interpret(ex)}
                  disabled={busy}
                  className="text-left text-xs text-secondary hover:underline disabled:opacity-50"
                >
                  {ex}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  )
}
