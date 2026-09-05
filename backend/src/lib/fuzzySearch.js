import { prisma } from './prisma.js'

/**
 * Trigram search over a table, ranked by closeness.
 *
 * `word_similarity` rather than `similarity`: the latter compares whole
 * strings, so "kishn" against "Kishan Auto Parts" scores 0.20 and is missed
 * entirely, while word_similarity compares against the best-matching word and
 * scores 0.67. For multi-word names — which is most of them — that is the
 * difference between the feature working and not.
 *
 * The threshold was chosen against real data rather than picked: 0.2 is the
 * lowest value that still catches "prayush" → "Priyanshu" (it scores exactly
 * 0.25) while nonsense like "zzzz" and "xyzq" still returns nothing.
 *
 * ILIKE is OR'd in so an exact substring always matches even when the
 * trigram score is low, which matters for very short queries.
 */
const THRESHOLD = 0.2

/** Identifiers come from our own route config, never from a request, but they
 *  are interpolated into SQL — so they are validated rather than trusted. */
const ident = (name) => {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`)
  return `"${name}"`
}

/**
 * IDs matching `query`, best match first.
 *
 * Returns ids rather than rows so the caller keeps its own `include`/`select`
 * and permission filters — this only decides *which* rows and in what order.
 */
export async function fuzzySearchIds({ table, columns, query, limit = 200 }) {
  const tbl = ident(table)
  const cols = columns.map(ident)

  const scores = cols.map((c) => `word_similarity($1, COALESCE(${c}, ''))`)
  const score = scores.length > 1 ? `GREATEST(${scores.join(', ')})` : scores[0]
  const ilike = cols.map((c) => `COALESCE(${c}, '') ILIKE '%' || $1 || '%'`).join(' OR ')

  const sql = `
    SELECT id
    FROM ${tbl}
    WHERE (${ilike}) OR ${score} >= $2
    ORDER BY ${score} DESC, id
    LIMIT $3
  `
  const rows = await prisma.$queryRawUnsafe(sql, query, THRESHOLD, limit)
  return rows.map((r) => r.id)
}
