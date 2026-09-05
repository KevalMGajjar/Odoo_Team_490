'use client'

import { useState } from 'react'
import clsx from 'clsx'

/** Tab strip at the bottom of a form sheet — UI.md §5.3. */
export function Notebook({ tabs, defaultTab }) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key)
  const tab = tabs.find((t) => t.key === active)

  return (
    <div className="mt-6">
      <div className="flex gap-4 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={clsx(
              'relative pb-2 text-sm transition-colors duration-150',
              active === t.key ? 'font-medium text-brand' : 'text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {active === t.key && <span className="absolute inset-x-0 -bottom-px h-[2px] bg-brand" />}
          </button>
        ))}
      </div>
      <div className="pt-4">{tab?.content}</div>
    </div>
  )
}
