'use client'

/**
 * Fetch wrapper for the Urban Furniture API.
 *
 * - Sends the httpOnly session cookie (`credentials: 'include'`).
 * - Every response is parsed once; on failure the thrown error carries
 *   `.status` and `.errors` (the per-field validation array) so callers can
 *   render messages inline under the offending field, exactly like the
 *   backend's own error contract (PLAN.md §9).
 * - Money crosses the wire as a string — never parsed into a float here.
 *   Components format for display via lib/format.js and never recompute a
 *   total the server didn't send.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errors = errors ?? []
  }
  /** Message for a specific field, if the server flagged one. */
  fieldError(field) {
    return this.errors.find((e) => e.field === field)?.message
  }

  /**
   * All server errors as `{ field: message }`, joining every message for the
   * same field.
   *
   * A weak password can break several rules at once, and the old
   * `Object.fromEntries(...)` kept only the last one — so you fixed the
   * missing special character, resubmitted, and only then learned it also
   * needed an uppercase letter.
   */
  fieldErrorMap() {
    const map = {}
    for (const { field, message } of this.errors) {
      map[field] = map[field] ? `${map[field]}. ${message}` : message
    }
    return map
  }
}

async function request(path, { method = 'GET', body, headers, ...rest } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...rest,
  })

  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await res.json().catch(() => null) : await res.text()

  if (!res.ok) {
    const message = (isJson && payload?.message) || res.statusText || 'Request failed'
    throw new ApiError(message, res.status, isJson ? payload?.errors : undefined)
  }

  return payload
}

export const api = {
  get: (path, params) => request(withQuery(path, params)),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
  /** Raw text/CSV download — used by report export buttons. */
  raw: async (path, params) => {
    const res = await fetch(`${BASE}${withQuery(path, params)}`, { credentials: 'include' })
    if (!res.ok) throw new ApiError('Export failed', res.status)
    return res.blob()
  },
}

function withQuery(path, params) {
  if (!params) return path
  const clean = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  )
  const qs = new URLSearchParams(clean).toString()
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path
}

export { BASE as API_BASE }
