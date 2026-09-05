import { conflict } from '../lib/errors.js'

/**
 * Gapless per-year document numbering: INV/2026/0001, BILL/2026/0007.
 *
 * Allocation happens inside the caller's transaction via an atomic upsert
 * (INSERT .. ON CONFLICT DO UPDATE at the database level), so two concurrent
 * posts can never receive the same number.
 *
 * `next` always means "the number to allocate NEXT time":
 *   create → next: 2, allocated = 1
 *   update → increment, allocated = returned.next - 1
 * Both branches therefore reduce to `returned.next - 1`.
 */
export async function nextNumber(tx, { code, prefix, date = new Date(), pad = 4 }) {
  const year = new Date(date).getUTCFullYear()

  const seq = await tx.sequence.upsert({
    where: { code_year: { code, year } },
    create: { code, prefix, year, next: 2 },
    update: { next: { increment: 1 } },
    select: { next: true },
  })

  const allocated = seq.next - 1
  if (allocated < 1) throw conflict(`Sequence ${code}/${year} is corrupt`)

  return `${prefix}/${year}/${String(allocated).padStart(pad, '0')}`
}

/** Read the next number without consuming it (for UI previews only). */
export async function peekNumber(tx, { code, prefix, date = new Date(), pad = 4 }) {
  const year = new Date(date).getUTCFullYear()
  const seq = await tx.sequence.findUnique({
    where: { code_year: { code, year } },
    select: { next: true },
  })
  const n = seq ? seq.next : 1
  return `${prefix}/${year}/${String(n).padStart(pad, '0')}`
}
