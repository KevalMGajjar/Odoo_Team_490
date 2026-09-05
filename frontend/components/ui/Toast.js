'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import clsx from 'clsx'
import { useMounted } from '@/lib/useMounted'

const ToastContext = createContext(null)

const ICON = { success: CheckCircle2, error: XCircle, info: Info }
const TONE = {
  success: 'border-state-paid/30 text-state-paid',
  error: 'border-state-overdue/30 text-state-overdue',
  info: 'border-state-info/30 text-state-info',
}

/**
 * Toast is reserved for whole-request failures / confirmations — field-level
 * validation renders inline under the field instead (UI.md §6).
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const mounted = useMounted()

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((message, { type = 'info', duration = 4000 } = {}) => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    if (duration) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2" style={{ maxWidth: 360 }}>
            {toasts.map((t) => {
              const Icon = ICON[t.type] ?? Info
              return (
                <div
                  key={t.id}
                  className={clsx(
                    'flex items-start gap-2 rounded border bg-surface-sheet px-3 py-2.5 text-sm shadow-pop',
                    TONE[t.type] ?? TONE.info,
                  )}
                  role="status"
                >
                  <Icon size={16} className="mt-0.5 shrink-0" />
                  <span className="flex-1 text-ink">{t.message}</span>
                  <button onClick={() => dismiss(t.id)} className="text-ink-faint hover:text-ink">
                    <X size={14} />
                  </button>
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
