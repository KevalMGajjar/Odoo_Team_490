import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Profit & Loss Report', () => {
  let miscJournalId: string
  let expAccountId: string
  let revAccountId: string
  let bankAccountId: string
  
  beforeAll(async () => {
    await loginAllRoles()

    const accounts = await api('/accounts?pageSize=200', { as: 'admin' })
    if (accounts.rows) {
      expAccountId = accounts.rows.find((a: any) => a.code?.startsWith('5'))?.id
      revAccountId = accounts.rows.find((a: any) => a.code?.startsWith('4'))?.id
      bankAccountId = accounts.rows.find((a: any) => a.code?.startsWith('10'))?.id
    }

    const journals = await api('/journals', { as: 'admin' })
    if (journals.rows) {
      miscJournalId = journals.rows.find((j: any) => j.type === 'miscellaneous')?.id
    }
  })

  it('PL-001: GET /reports/profit-loss -> status 200, has income/expense sections', async () => {
    const res = await api('/reports/profit-loss', { as: 'admin' })
    expect(res.income).toBeDefined()
    expect(res.expenses).toBeDefined()
    expect(res.netProfit).toBeDefined()
  })

  it('PL-003: After sales + purchases -> net profit = income - expenses', async () => {
    // Post income
    await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Sales',
        narration: 'Test sales',
        items: [
          { accountId: bankAccountId, debit: 1500, credit: 0 },
          { accountId: revAccountId, debit: 0, credit: 1500 }
        ]
      },
      as: 'admin'
    })
    
    // Post expense
    await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Expense',
        narration: 'Test expense',
        items: [
          { accountId: expAccountId, debit: 800, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 800 }
        ]
      },
      as: 'admin'
    })

    const res = await api('/reports/profit-loss', { as: 'admin' })
    expect(res.netProfit).toBeDefined()

    const incomeVal = parseFloat(res.income?.total) || 0
    const expenseVal = parseFloat(res.expenses?.total) || 0
    const net = parseFloat(res.netProfit) || 0
    
    // Allow small delta for floating point math
    expect(Math.abs((incomeVal - expenseVal) - net)).toBeLessThan(0.01)
  })

  it('PL-006: Tax amounts NOT in P&L (GST is a balance sheet item, not income/expense)', async () => {
    const res = await api('/reports/profit-loss', { as: 'admin' })
    
    const checkNoTax = (items: any[]) => {
      if (!items) return
      for (const item of items) {
        if (item.name) {
          expect(item.name.toLowerCase()).not.toContain('gst')
          expect(item.name.toLowerCase()).not.toContain('tax')
        }
      }
    }
    
    checkNoTax(res.income?.items)
    checkNoTax(res.expenses?.items)
  })

  it.todo('PL-002: .todo')
  it.todo('PL-004: .todo')
  it.todo('PL-005: .todo')
  it.todo('PL-007: .todo')
})
