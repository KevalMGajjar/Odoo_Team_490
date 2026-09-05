'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api, ApiError } from './api'
import { derivePassword } from './password'

const AuthContext = createContext(null)

/**
 * Session provider. The httpOnly cookie is the source of truth; this context
 * just mirrors `/auth/me` into React state so components can read
 * `user.role` for role-gated UI (PLAN.md §8 role matrix) without every screen
 * re-fetching it.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.get('/auth/me')
      setUser(user)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /**
   * Step one of sign-in.
   *
   * Resolves either to `{ user }` — the account skipped the second factor and
   * is now signed in — or to `{ challenge }`, meaning a code was emailed and
   * `verifyLogin` has to finish the job. Callers branch on which key is set.
   */
  const login = useCallback(async (loginId, password) => {
    // The typed password never leaves the browser — only its PBKDF2 derivation.
    const derived = await derivePassword(loginId, password)
    const res = await api.post('/auth/login', { loginId, password: derived })
    if (res.challengeId) return { challenge: res }
    setUser(res.user)
    return { user: res.user }
  }, [])

  /** Step two: redeem the emailed code for a session. */
  const verifyLogin = useCallback(async (challengeId, otp) => {
    const { user } = await api.post('/auth/login/verify', { challengeId, otp })
    setUser(user)
    return user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLogin, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

/** Role helpers — mirrors the server-side matrix in PLAN.md §8. UI hides;
 *  the API is what actually enforces these, so this is convenience only. */
export const canWrite = (role) => role === 'admin' || role === 'accountant'
export const canModify = (role) => role === 'admin'
export const isPortal = (role) => role === 'user'
export const isInternal = (role) => role && role !== 'user'

export { ApiError }
