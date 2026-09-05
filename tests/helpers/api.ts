/**
 * HTTP client for integration tests.
 *
 * Wraps `fetch` with automatic auth-token injection, JSON parsing,
 * and money-aware assertions. Mirrors the pattern from verify-api.js.
 */

const BASE = process.env.API_URL || 'http://localhost:4000'

const tokens: Record<string, string> = {}

export interface ApiResponse {
  status: number
  [key: string]: any
}

export interface RawApiResponse {
  status: number
  text: string
  json: any
}

/**
 * Make an API request. Automatically attaches the auth token for the given role.
 */
export async function api(
  path: string,
  opts: {
    method?: string
    body?: any
    as?: string | null
    raw?: boolean
  } = {},
): Promise<any> {
  const { method = 'GET', body, as = 'admin', raw = false } = opts
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (as && tokens[as]) headers.Authorization = `Bearer ${tokens[as]}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch { /* csv/html */ }

  if (raw) return { status: res.status, text, json } as RawApiResponse
  return { status: res.status, ...json } as ApiResponse
}

/**
 * Return only the HTTP status code.
 */
export async function statusOf(path: string, opts?: Parameters<typeof api>[1]): Promise<number> {
  const r = await api(path, { ...opts, raw: true }) as RawApiResponse
  return r.status
}

/**
 * Log in as a named role. Stores the bearer token for subsequent requests.
 */
export async function login(role: string, email: string, password: string = 'demo123'): Promise<any> {
  const r = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
    as: null,
  })
  if (!r.token) throw new Error(`login failed for ${email}: ${r.message}`)
  tokens[role] = r.token
  return r.user
}

/**
 * Log in all four standard roles (admin, accountant, viewer, portal).
 * Call once in a beforeAll() block.
 */
export async function loginAllRoles(): Promise<void> {
  await login('admin', process.env.ADMIN_EMAIL || 'admin@urbanfurniture.com')
  await login('acct', process.env.ACCOUNTANT_EMAIL || 'accountant@urbanfurniture.com')
  await login('viewer', process.env.VIEWER_EMAIL || 'viewer@urbanfurniture.com')
  await login('portal', process.env.PORTAL_EMAIL || 'nimesh@example.com')
}

/**
 * Get the current token for a role (useful for Playwright tests that need raw headers).
 */
export function tokenFor(role: string): string | undefined {
  return tokens[role]
}

/**
 * Today's date as YYYY-MM-DD string.
 */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
