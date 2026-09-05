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

  // One indexed branch per column per operator, UNION'd — not a single WHERE
  // with everything OR'd together. Both return the same rows; only this one
  // uses the indexes.
  //
  // Postgres estimates trigram selectivity badly: for a 50k-row table it
  // predicted 1718 matches where there was 1, decided six bitmap scans were
  // dearer than reading the table, and sequentially scanned. Measured at 50k
  // rows: 462ms for the OR, 12ms for this. Forcing enable_seqscan=off gets the
  // same speed from the OR, which is how we know the estimate is the problem —
  // but that is a per-query hint that would apply to the rest of the plan too.
  // UNION gets there by leaving the planner no worse option.
  //
  // Bare columns, not COALESCE(col, ''): an index on `name` cannot serve a
  // predicate on `COALESCE(name, '')`, and wrapping it cost the index (166ms
  // vs 7ms on one column). It is not needed here either — NULL <% 'x' is NULL,
  // which a WHERE treats as no match, which is what we want. The scoring
  // expression below still coalesces, because there NULL would sort first.
  const branches = cols.flatMap((c) => [
    `SELECT id FROM ${tbl} WHERE $1 <% ${c}`,
    `SELECT id FROM ${tbl} WHERE ${c} ILIKE '%' || $1 || '%'`,
  ])

  const scores = cols.map((c) => `word_similarity($1, COALESCE(t.${c}, ''))`)
  const score = scores.length > 1 ? `GREATEST(${scores.join(', ')})` : scores[0]

  const sql = `
    WITH matches AS (
      ${branches.join('\n      UNION\n      ')}
    )
    SELECT t.id
    FROM ${tbl} t
    JOIN matches m ON m.id = t.id
    ORDER BY ${score} DESC, t.id
    LIMIT $2
  `

  // `<%` takes its cutoff from a session setting rather than an argument, and
  // SET LOCAL only affects the connection that ran it — which under a pool
  // means it has to share a transaction with the query. Two local statements,
  // no network call between them: the one shape a transaction is for. Contrast
  // mailer.js, where an SMTP round trip inside one was the bug.
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL pg_trgm.word_similarity_threshold = ${THRESHOLD}`)
    return tx.$queryRawUnsafe(sql, query, limit)
  })
  return rows.map((r) => r.id)
}
