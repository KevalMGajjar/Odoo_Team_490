'use client'

import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

const VARIANTS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

/**
 * The one Button every screen uses. Variant classes come from globals.css's
 * component layer, not ad-hoc Tailwind per call site — UI.md §8's discipline:
 * "nothing gets styled ad hoc."
 */
export function Button({
  variant = 'secondary',
  size,
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...rest
}) {
  return (
    <button
      className={clsx(VARIANTS[variant] ?? VARIANTS.secondary, size === 'sm' && 'btn-sm', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  )
}
