/**
 * Database helpers for test suites.
 *
 * Strategy:
 * ─────────
 * The existing verify-* suites use a brilliant rollback-transaction pattern:
 * they wrap the entire test in `prisma.$transaction()` and deliberately throw
 * at the end to roll back, leaving the DB untouched.
 *
 * For the NEW cross-cutting suite:
 *  • Unit tests:    Import service functions directly. Where DB is needed,
 *                   use the same rollback-transaction pattern.
 *  • Integration:   Hit the API via HTTP (like verify-api.js). Use a separate
 *                   test database (urban_furniture_test) with `npm run seed`.
 *  • E2E:           Same test DB as integration; Playwright drives the browser.
 *
 * This file provides the Prisma client for unit tests that need direct DB access,
 * and seed/reset utilities for integration tests.
 */

import { resolve } from 'path'

/**
 * Dynamically import the backend's Prisma client.
 * This avoids bundling issues and reuses the exact same client the app uses.
 */
export async function getPrisma() {
  const mod = await import(resolve(process.cwd(), 'backend/src/lib/prisma.js'))
  return mod.prisma
}

/**
 * Run a test function inside a Prisma interactive transaction that is always
 * rolled back at the end. This is the same isolation pattern used by
 * verify-ledger.js, verify-voucher.js, and verify-documents.js.
 *
 * Usage:
 *   await withRollback(async (tx) => {
 *     const acc = await tx.chartOfAccount.create({ data: { ... } })
 *     // ... assertions ...
 *   })
 *   // DB is left exactly as it was found
 */
export async function withRollback<T>(
  fn: (tx: any) => Promise<T>,
  opts: { timeout?: number; maxWait?: number } = {},
): Promise<void> {
  const prisma = await getPrisma()

  class Rollback extends Error {
    constructor() { super('deliberate rollback') }
  }

  try {
    await prisma.$transaction(
      async (tx: any) => {
        await fn(tx)
        throw new Rollback()
      },
      {
        timeout: opts.timeout ?? 60_000,
        maxWait: opts.maxWait ?? 10_000,
      },
    )
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }
}

/**
 * Money helpers — re-export from the backend to avoid duplication.
 */
export async function getMoneyHelpers() {
  const mod = await import(resolve(process.cwd(), 'backend/src/lib/money.js'))
  return { D: mod.D, money: mod.money, qty: mod.qty, cost: mod.cost }
}
