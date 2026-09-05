import { api } from '@/lib/api'

/**
 * Matches OCR-extracted text against existing masters so the review modal
 * can show a "matched" tick instead of forcing a re-entry of a vendor or
 * product that's already in the system. Reuses the same case-insensitive
 * substring search every SearchSelect already calls (`?q=`) rather than
 * shipping a separate fuzzy-matching library — progressively shortening the
 * query compensates for the substring search returning nothing on a full,
 * slightly-off OCR string.
 */

function tokenOverlapScore(a, b) {
  const ta = new Set(a.toLowerCase().split(/\s+/).filter((t) => t.length > 1))
  const tb = new Set(b.toLowerCase().split(/\s+/).filter((t) => t.length > 1))
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return shared / Math.max(ta.size, tb.size)
}

async function bestMatch(path, name, extraParams) {
  if (!name) return null
  const tokens = name.split(/\s+/).filter(Boolean)
  const candidateQueries = [name, tokens.slice(0, 2).join(' '), tokens[0]].filter(Boolean)

  const seen = new Map()
  for (const q of candidateQueries) {
    if (!q || q.length < 2) continue
    try {
      const res = await api.get(path, { q, pageSize: 10, ...extraParams })
      for (const row of res.rows ?? []) seen.set(row.id, row)
    } catch {
      // best-effort — a failed lookup just means "no match", never blocks the scan
    }
    if (seen.size > 0) break
  }

  let best = null
  let bestScore = 0
  for (const row of seen.values()) {
    const score = tokenOverlapScore(name, row.name)
    if (score > bestScore) { bestScore = score; best = row }
  }

  return best && bestScore >= 0.3 ? { record: best, score: bestScore } : null
}

/** @returns {Promise<{record: object, score: number} | null>} */
export function matchContact(vendorName) {
  return bestMatch('/contacts', vendorName)
}

/** @returns {Promise<{record: object, score: number} | null>} */
export function matchProduct(description) {
  return bestMatch('/products', description)
}
