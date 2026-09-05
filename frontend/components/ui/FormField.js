'use client'

import clsx from 'clsx'

/**
 * Label above input, inline error below — Odoo-style, per UI.md §1/§6.
 * Errors come from the API's `errors[{field,message}]` shape (ApiError in
 * lib/api.js), never a generic toast for a field-level problem.
 */
export function FormField({ label, error, required, hint, className, children }) {
  return (
    <div className={className}>
      {label && (
        <label className="field-label">
          {label}
          {required && <span className="text-state-overdue"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="field-error">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export function TextInput({ error, className, ...rest }) {
  return (
    <input
      className={clsx('field-input', className)}
      aria-invalid={Boolean(error)}
      {...rest}
    />
  )
}

export function TextArea({ error, className, rows = 3, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={clsx('field-input resize-none', className)}
      aria-invalid={Boolean(error)}
      {...rest}
    />
  )
}

export function Select({ error, className, children, ...rest }) {
  return (
    <select className={clsx('field-input pr-8', className)} aria-invalid={Boolean(error)} {...rest}>
      {children}
    </select>
  )
}
