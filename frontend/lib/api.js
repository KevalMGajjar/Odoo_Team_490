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

/**
 * Idempotency keys for money-moving POSTs.
 *
 * The client already blocks double-clicks, but that can't help when the
 * request succeeds and the *response* is lost — the user retries and posts a
 * second document for the same money. Sending a stable key lets the server
 * recognise the retry and replay the original result.
 *
 * The key combines a nonce with a hash of the body, so editing the form
 * produces a new key (a genuinely different request) while retrying an
 * unchanged one reuses it. The nonce rotates after each success so a
 * deliberate second identical document is still possible.
 */
let idempotencyNonce = cryptoRandom()

function cryptoRandom() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function idempotencyKeyFor(body) {
  const json = JSON.stringify(body ?? {})
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return `${idempotencyNonce}:${json.length}`
  }
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))
  const hex = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${idempotencyNonce}:${hex}`
}

async function request(path, { method = 'GET', body, rawBody, headers, idempotent = false, ...rest } = {}) {
  const idempotencyHeader = idempotent ? { 'Idempotency-Key': await idempotencyKeyFor(body) } : {}
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...idempotencyHeader,
      ...headers,
    },
    ...(rawBody ? { body: rawBody } : body ? { body: JSON.stringify(body) } : {}),
    ...rest,
  })

  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payload = isJson ? await res.json().catch(() => null) : await res.text()

  if (!res.ok) {
    const message = (isJson && payload?.message) || res.statusText || 'Request failed'
    throw new ApiError(message, res.status, isJson ? payload?.errors : undefined)
  }

  // A fresh nonce after success means the next deliberate create is treated as
  // a new request rather than deduplicated against this one.
  if (idempotent) idempotencyNonce = cryptoRandom()

  return payload
}

export const api = {
  get: (path, params) => request(withQuery(path, params)),
  post: (path, body, opts = {}) => request(path, { method: 'POST', body, ...opts }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  /** Multipart upload. No Content-Type header — the browser must set the
   *  multipart boundary itself, and providing one breaks the parse. */
  upload: (path, formData) => request(path, { method: 'POST', rawBody: formData }),
  del: (path) => request(path, { method: 'DELETE' }),
  /** Raw text/CSV download — used by report export buttons. */
  raw: async (path, params) => {
    const res = await fetch(`${BASE}${withQuery(path, params)}`, { credentials: 'include' })
    if (!res.ok) throw new ApiError('Export failed', res.status)
    return res.blob()
  },
}

/**
 * Absolute URL for a stored file.
 *
 * The API returns file paths rooted at the backend (`/files/ab/cd/….jpg`), and
 * the backend is a different origin from this app in every environment, so a
 * bare `<img src>` would ask Next.js for a file it doesn't have.
 *
 * Records created before the file store still hold a `data:` URI; those, and
 * any already-absolute URL, are passed straight through.
 */
export function assetUrl(value) {
  if (!value) return value
  if (/^(data:|blob:|https?:)/.test(value)) return value
  return `${BASE}${value.startsWith('/') ? '' : '/'}${value}`
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
