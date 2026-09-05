'use client'

import { useEffect, useState } from 'react'

const KEY = 'uf.theme' // 'light' | 'dark' | undefined (system)

export function useTheme() {
  const [theme, setThemeState] = useState(undefined)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY)
      if (saved === 'light' || saved === 'dark') applyTheme(saved)
      setThemeState(saved || undefined)
    } catch {
      /* ignore */
    }
  }, [])

  const setTheme = (next) => {
    setThemeState(next)
    try {
      if (next) localStorage.setItem(KEY, next)
      else localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    applyTheme(next)
  }

  const toggle = () => {
    const current = theme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggle }
}

function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'dark') root.setAttribute('data-theme', 'dark')
  else if (theme === 'light') root.setAttribute('data-theme', 'light')
  else root.removeAttribute('data-theme')
}
