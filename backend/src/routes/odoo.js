import express from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyJWT, adminOnly } from '../middleware/auth.js'
import { serviceUnavailable, notFound } from '../lib/errors.js'
import { odooPing } from '../services/odooClient.js'
import { syncAllMasters, syncJournalEntry, fetchOdooTrialBalance } from '../services/odooSync.js'

/**
 * Manual-trigger Odoo mirroring. Deliberately NOT automatic on every post —
 * a hackathon demo is more convincing (and more debuggable) when "sync to
 * Odoo" is a visible, explainable action rather than invisible background
 * plumbing. Admin only: this is an integration control surface, not part of
 * day-to-day data entry.
 */

const router = express.Router()

function requireErpEnabled(req, res, next) {
  if (process.env.ERP_ENABLED !== 'true') return next(serviceUnavailable('Odoo integration is disabled (ERP_ENABLED=false)'))
  next()
}

router.get('/status', verifyJWT, adminOnly, requireErpEnabled, async (req, res, next) => {
  try {
    const ping = await odooPing()
    const [unsynced, failed, synced] = await Promise.all([
      prisma.journalEntry.count({ where: { state: 'posted', odooSyncStatus: 'not_synced' } }),
      prisma.journalEntry.count({ where: { odooSyncStatus: 'failed' } }),
      prisma.journalEntry.count({ where: { odooSyncStatus: 'synced' } }),
    ])
    res.json({ ...ping, counts: { unsynced, failed, synced } })
  } catch (err) { next(err) }
})

router.post('/sync-masters', verifyJWT, adminOnly, requireErpEnabled, async (req, res, next) => {
  try {
    const counts = await syncAllMasters()
    res.json({ ok: true, counts })
  } catch (err) { next(err) }
})

router.post('/sync-entry/:id', verifyJWT, adminOnly, requireErpEnabled, async (req, res, next) => {
  try {
    const entry = await prisma.journalEntry.findUnique({ where: { id: req.params.id } })
    if (!entry) return next(notFound('Journal entry'))
    const result = await syncJournalEntry(entry.id)
    res.json({ ok: true, ...result })
  } catch (err) { next(err) }
})

/** Bulk-sync every posted entry that isn't already synced. Stops on nothing — partial failures are recorded per-row, not thrown. */
router.post('/sync-all-entries', verifyJWT, adminOnly, requireErpEnabled, async (req, res, next) => {
  try {
    const pending = await prisma.journalEntry.findMany({
      where: { state: 'posted', odooSyncStatus: { in: ['not_synced', 'failed'] } },
      select: { id: true, number: true },
    })

    const results = []
    for (const e of pending) {
      try {
        const r = await syncJournalEntry(e.id)
        results.push({ id: e.id, number: e.number, ok: true, odooMoveId: r.odooMoveId })
      } catch (err) {
        results.push({ id: e.id, number: e.number, ok: false, error: err.message })
      }
    }

    res.json({ ok: true, total: pending.length, succeeded: results.filter((r) => r.ok).length, results })
  } catch (err) { next(err) }
})

router.get('/entries', verifyJWT, adminOnly, requireErpEnabled, async (req, res, next) => {
  try {
    const rows = await prisma.journalEntry.findMany({
      where: { state: 'posted' },
      select: {
        id: true, number: true, date: true, narration: true,
        odooSyncStatus: true, odooMoveId: true, odooSyncedAt: true, odooSyncError: true,
      },
      orderBy: { date: 'desc' },
      take: 200,
    })
    res.json({ rows })
  } catch (err) { next(err) }
})

/** Odoo's own trial balance, pulled live — the demo payoff: shown side-by-side with ours to the paisa. */
router.get('/trial-balance', verifyJWT, adminOnly, requireErpEnabled, async (req, res, next) => {
  try {
    const rows = await fetchOdooTrialBalance()
    res.json({ rows })
  } catch (err) { next(err) }
})

export default router
