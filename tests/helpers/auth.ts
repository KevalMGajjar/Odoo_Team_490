/**
 * Auth helpers for integration and e2e tests.
 *
 * Provides role-based login utilities and token management
 * for the three application roles: Admin, Accountant (Invoicing User), Contact (Portal).
 */

import { api, login, tokenFor } from './api'

export { login, tokenFor }

/**
 * Role definitions matching the backend's Role enum.
 */
export const ROLES = {
  ADMIN: {
    role: 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@urbanfurniture.com',
    label: 'Admin (full access)',
  },
  ACCOUNTANT: {
    role: 'acct',
    email: process.env.ACCOUNTANT_EMAIL || 'accountant@urbanfurniture.com',
    label: 'Invoicing User (create master data, record transactions)',
  },
  VIEWER: {
    role: 'viewer',
    email: process.env.VIEWER_EMAIL || 'viewer@urbanfurniture.com',
    label: 'Read-only Viewer',
  },
  PORTAL: {
    role: 'portal',
    email: process.env.PORTAL_EMAIL || 'nimesh@example.com',
    label: 'Contact Portal (see own invoices only)',
  },
} as const

/**
 * Ensures a specific role is logged in. Idempotent — won't re-login if already authenticated.
 */
export async function ensureLoggedIn(roleDef: typeof ROLES[keyof typeof ROLES]): Promise<void> {
  if (!tokenFor(roleDef.role)) {
    await login(roleDef.role, roleDef.email)
  }
}
