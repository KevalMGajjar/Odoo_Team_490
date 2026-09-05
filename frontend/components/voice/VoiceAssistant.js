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
  'Show unpaid invoices',
  'Bills from Kishan Auto Parts',
  'Open the budget report for this quarter',
]

/**
 * Read-only voice navigation.
 *
 * The assistant can only ever open a screen: the server matches speech against
 * a fixed allowlist of view routes and returns one of them, so a misheard
 * command opens the wrong report at worst — it can never create or change a
 * record, and it never states a figure. Every number the user reads comes from
 * the screen itself, fetched normally from the database.
 */
export function VoiceAssistant({ open, onClose }) {
  const router = useRouter()
  const [phase, setPhase] = useState('idle') // idle | listening | thinking | done
  const [transcript, setTranscript] = useState('')
  const [message, setMessage] = useState(null) // { tone: 'error'|'info', text }
  const [typed, setTyped] = useState('')
  const sessionRef = useRef(null)
  const supported = isSpeechSupported()

  const reset = useCallback(() => {
    sessionRef.current?.abort()
    sessionRef.current = null
    cancelSpeech()
    setPhase('idle')
    setTranscript('')
    setMessage(null)
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
    setMessage(null)
    try {
      const res = await api.post('/voice/interpret', { transcript: command })
      if (!res.ok) {
        setPhase('idle')
        setMessage({ tone: 'error', text: res.clarify })
        speak(res.clarify)
        return
      }
      setPhase('done')
      setMessage({ tone: 'info', text: res.spoken })
      speak(res.spoken)

      const query = new URLSearchParams(
        Object.entries(res.params ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
      ).toString()
      router.push(query ? `${res.route}?${query}` : res.route)
      onClose()
    } catch (err) {
      setPhase('idle')
      const text = err instanceof ApiError ? err.message : 'Could not reach the assistant.'
      setMessage({ tone: 'error', text })
    }
  }, [router, onClose])

  const startListening = useCallback(() => {
    setMessage(null)
    setTranscript('')
    setPhase('listening')
    sessionRef.current = listenOnce({
      onInterim: setTranscript,
      onResult: (text) => interpret(text),
      onError: (text) => { setPhase('idle'); setMessage({ tone: 'error', text }) },
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
          Ask to see something — the assistant opens the screen. It can only view data, never create or change records.
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

        {message && (
          <div
            className={clsx(
              'flex items-start gap-2 rounded border px-3 py-2 text-sm',
              message.tone === 'error'
                ? 'border-state-overdue/30 bg-state-overdue/5 text-state-overdue'
                : 'border-state-info/30 bg-state-info/5 text-state-info',
            )}
          >
            {message.tone === 'error' && <AlertCircle size={14} className="mt-0.5 shrink-0" />}
            <span>{message.text}</span>
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
