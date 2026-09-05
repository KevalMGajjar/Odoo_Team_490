import express from 'express'
import { prisma } from '../lib/prisma.js'
import { verifyJWT } from '../middleware/auth.js'
import { badRequest } from '../lib/errors.js'
import {
  trialBalance, profitAndLoss, balanceSheet, inventoryValuation,
  budgetReport, generalLedger, dashboardSummary,
} from '../services/reports.js'
import { listTransactions } from '../services/voucher.js'

/**
 * Reporting API.
 *
 * Read-only, so every internal role — including `viewer`, used by the companion
 * app — may call these. Portal contacts may not: these are whole-business
 * figures.
 *
 * Add `?format=csv` to any report for a download.
 */

const router = express.Router()

const parseDate = (value, label) => {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw badRequest(`${label} is not a valid date`)
  return d
}

/** Default window: start of the current Indian financial year → today. */
const defaultWindow = () => {
  const now = new Date()
  const fyStartYear = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1
  return { from: new Date(Date.UTC(fyStartYear, 3, 1)), to: now }
}

const internalOnly = (req, res, next) =>
  req.user?.role === 'user'
    ? res.status(403).json({ message: 'Reports are not available to portal users' })
    : next()

// ─────────────────────────── CSV ───────────────────────────
const csvCell = (v) => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' && typeof v.toString === 'function' ? v.toString() : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const sendCsv = (res, filename, columns, rows) => {
  const head = columns.map((c) => csvCell(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(',')).join('\n')
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.send(`${head}\n${body}\n`)
}

// ─────────────────────── trial balance ───────────────────────
router.get('/trial-balance', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const asOf = parseDate(req.query.asOf, 'asOf') ?? new Date()
    const report = await trialBalance(prisma, { asOf })

    if (req.query.format === 'csv') {
      return sendCsv(res, `trial-balance-${report.asOf.toISOString().slice(0, 10)}.csv`, [
        { header: 'Code', value: (r) => r.code },
        { header: 'Account', value: (r) => r.name },
        { header: 'Type', value: (r) => r.type },
        { header: 'Debit', value: (r) => r.debit },
        { header: 'Credit', value: (r) => r.credit },
      ], report.rows)
    }
    res.json(report)
  } catch (err) { next(err) }
})

// ───────────────────────── profit & loss ─────────────────────────
router.get('/profit-loss', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const w = defaultWindow()
    const from = parseDate(req.query.from, 'from') ?? w.from
    const to = parseDate(req.query.to, 'to') ?? w.to
    if (from > to) throw badRequest('"from" must be on or before "to"')

    const report = await profitAndLoss(prisma, { from, to })

    if (req.query.format === 'csv') {
      const rows = [
        ...report.income.map((r) => ({ ...r, section: 'Income' })),
        ...report.expense.map((r) => ({ ...r, section: 'Expense' })),
        ...report.otherExpense.map((r) => ({ ...r, section: 'Other Expense' })),
      ]
      return sendCsv(res, 'profit-and-loss.csv', [
        { header: 'Section', value: (r) => r.section },
        { header: 'Code', value: (r) => r.code },
        { header: 'Account', value: (r) => r.name },
        { header: 'Amount', value: (r) => r.balance },
      ], rows)
    }
    res.json(report)
  } catch (err) { next(err) }
})

// ───────────────────────── balance sheet ─────────────────────────
router.get('/balance-sheet', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const asOf = parseDate(req.query.asOf, 'asOf') ?? new Date()
    const report = await balanceSheet(prisma, { asOf })

    if (req.query.format === 'csv') {
      const rows = [
        ...report.assets.map((r) => ({ ...r, section: 'Assets' })),
        ...report.bank.map((r) => ({ ...r, section: 'Bank' })),
        ...report.cash.map((r) => ({ ...r, section: 'Cash' })),
        ...report.liabilities.map((r) => ({ ...r, section: 'Liabilities' })),
        ...report.capital.map((r) => ({ ...r, section: 'Capital' })),
        { section: 'Capital', code: '', name: 'Current Period Earnings', balance: report.currentEarnings },
      ]
      return sendCsv(res, `balance-sheet-${report.asOf.toISOString().slice(0, 10)}.csv`, [
        { header: 'Section', value: (r) => r.section },
        { header: 'Code', value: (r) => r.code },
        { header: 'Account', value: (r) => r.name },
        { header: 'Balance', value: (r) => r.balance },
      ], rows)
    }
    res.json(report)
  } catch (err) { next(err) }
})

// ─────────────────────── inventory valuation ───────────────────────
router.get('/inventory-valuation', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const asOf = parseDate(req.query.asOf, 'asOf') ?? new Date()
    const report = await inventoryValuation(prisma, { asOf })

    if (req.query.format === 'csv') {
      return sendCsv(res, 'inventory-valuation.csv', [
        { header: 'Product', value: (r) => r.name },
        { header: 'Category', value: (r) => r.category },
        { header: 'Quantity', value: (r) => r.quantity },
        { header: 'Unit Cost', value: (r) => r.unitCost },
        { header: 'Value', value: (r) => r.value },
      ], report.rows)
    }
    res.json(report)
  } catch (err) { next(err) }
})

// ───────────────────────── budget report ─────────────────────────
router.get('/budget', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const report = await budgetReport(prisma, {
      from: parseDate(req.query.from, 'from'),
      to: parseDate(req.query.to, 'to'),
    })

    if (req.query.format === 'csv') {
      return sendCsv(res, 'budget-report.csv', [
        { header: 'Budget', value: (r) => r.name },
        { header: 'Analytic Account', value: (r) => r.analyticAccount },
        { header: 'Planned', value: (r) => r.planned },
        { header: 'Actual', value: (r) => r.actual },
        { header: 'Variance', value: (r) => r.variance },
        { header: 'Achievement %', value: (r) => r.achievementPct },
      ], report.rows)
    }
    res.json(report)
  } catch (err) { next(err) }
})

// ───────────────────────── general ledger ─────────────────────────
router.get('/general-ledger', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const report = await generalLedger(prisma, {
      accountId: req.query.accountId || null,
      partnerId: req.query.partnerId || null,
      analyticAccountId: req.query.analyticAccountId || null,
      from: parseDate(req.query.from, 'from'),
      to: parseDate(req.query.to, 'to'),
      limit: Number(req.query.limit) || 500,
    })

    if (req.query.format === 'csv') {
      return sendCsv(res, 'general-ledger.csv', [
        { header: 'Date', value: (r) => r.date.toISOString().slice(0, 10) },
        { header: 'Entry', value: (r) => r.entryNumber },
        { header: 'Journal', value: (r) => r.journal },
        { header: 'Account', value: (r) => `${r.account.code} ${r.account.name}` },
        { header: 'Partner', value: (r) => r.partner?.name },
        { header: 'Narration', value: (r) => r.narration },
        { header: 'Debit', value: (r) => r.debit },
        { header: 'Credit', value: (r) => r.credit },
        { header: 'Balance', value: (r) => r.runningBalance },
      ], report.rows)
    }
    res.json(report)
  } catch (err) { next(err) }
})

// ──────────────────────────── dashboard ────────────────────────────
router.get('/dashboard', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    res.json(await dashboardSummary(prisma, {
      asOf: parseDate(req.query.asOf, 'asOf') ?? new Date(),
    }))
  } catch (err) { next(err) }
})

// ───────────── transactions (the flat voucher projection) ─────────────
router.get('/transactions', verifyJWT, internalOnly, async (req, res, next) => {
  try {
    const rows = await listTransactions(prisma, {
      voucherType: req.query.voucherType || null,
      fiscalYear: req.query.fiscalYear || null,
      from: parseDate(req.query.from, 'from'),
      to: parseDate(req.query.to, 'to'),
      accountId: req.query.accountId || null,
      limit: Number(req.query.limit) || 200,
    })

    if (req.query.format === 'csv') {
      return sendCsv(res, 'transactions.csv', [
        { header: 'date', value: (r) => new Date(r.date).toISOString().slice(0, 10) },
        { header: 'voucher_no', value: (r) => r.voucher_no },
        { header: 'voucher_type', value: (r) => r.voucher_type },
        { header: 'accountid', value: (r) => r.accountid },
        { header: 'account_name', value: (r) => r.account_name },
        { header: 'amount', value: (r) => r.amount },
        { header: 'reference', value: (r) => r.reference },
        { header: 'narration', value: (r) => r.narration },
      ], rows)
    }
    res.json({ rows, total: rows.length })
  } catch (err) { next(err) }
})

export default router
