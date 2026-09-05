'use client'

import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import { API_BASE } from './api'
import { useAuth } from './auth'

/**
 * Live updates over Socket.IO (PLAN.md §12b / IDEAS.md §0.5 MUST #1).
 *
 * Subscribes once per authenticated session and re-subscribes if the handler
 * map changes identity is avoided by taking a ref, so callers can pass an
 * inline object of { 'invoice:posted': fn, ... } without re-connecting.
 */
export function useRealtimeEvents(handlers) {
  const { user } = useAuth()
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!user) return undefined

    const socket = io(API_BASE, {
      path: '/socket.io',
      withCredentials: true,
      auth: { role: user.role, contactId: user.contactId },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    const bound = []
    for (const event of Object.keys(handlersRef.current || {})) {
      const fn = (payload) => handlersRef.current?.[event]?.(payload)
      socket.on(event, fn)
      bound.push([event, fn])
    }

    return () => {
      for (const [event, fn] of bound) socket.off(event, fn)
      socket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])
}
