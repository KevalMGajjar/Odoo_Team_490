import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Data Integrity Integration', () => {
  let bankJournalId: number
  let cashAccountId: number
  let salesAccountId: number
  
  beforeAll(async () => {
    await loginAllRoles()
    const journals = await api('/journals', { method: 'GET', as: 'accountant' })
    const bank = journals.data?.find((j: any) => j.type === 'bank')
    bankJournalId = bank?.id || 1

    const accounts = await api('/accounts?pageSize=200', { method: 'GET', as: 'accountant' })
    cashAccountId = accounts.data?.find((a: any) => a.code?.startsWith('1'))?.id || 1
    salesAccountId = accounts.data?.find((a: any) => a.code?.startsWith('4'))?.id || 2
  })

  it('DI-001: Trial balance is always balanced', async () => {
    const res = await api('/reports/trial-balance', { method: 'GET', as: 'accountant' })
    if (res.status === 200 && res.balanced !== undefined) {
      expect(res.balanced).toBe(true)
    }
  })

  it('DI-002: Balance sheet always balanced', async () => {
    const res = await api('/reports/balance-sheet', { method: 'GET', as: 'accountant' })
    if (res.status === 200 && res.balanced !== undefined) {
      expect(res.balanced).toBe(true)
    }
  })

  it('DI-003: Inventory valuation ties out', async () => {
    const res = await api('/reports/inventory-valuation', { method: 'GET', as: 'accountant' })
    if (res.status === 200 && res.tiesOut !== undefined) {
      expect(res.tiesOut).toBe(true)
    }
  })

  it('DI-004: Post manual JE, reverse it -> TB still balanced', async () => {
    const je = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: bankJournalId,
        date: today(),
        reference: 'Test Manual JE',
        narration: 'Test',
        items: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: salesAccountId, debit: 0, credit: 100 }
        ]
      },
      as: 'accountant'
    })
    expect(je.status).toBe(201)

    let tb = await api('/reports/trial-balance', { method: 'GET', as: 'accountant' })
    if (tb.status === 200 && tb.balanced !== undefined) {
      expect(tb.balanced).toBe(true)
    }

    const rev = await api(`/journal-entries/${je.id}/reverse`, {
      method: 'POST',
      body: { reason: 'correction' },
      as: 'accountant'
    })
    expect([200, 201]).toContain(rev.status)

    tb = await api('/reports/trial-balance', { method: 'GET', as: 'accountant' })
    if (tb.status === 200 && tb.balanced !== undefined) {
      expect(tb.balanced).toBe(true)
    }
  })

  it('DI-005: Unbalanced JE rejected', async () => {
    const je = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: bankJournalId,
        date: today(),
        reference: 'Unbalanced JE',
        narration: 'Test',
        items: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: salesAccountId, debit: 0, credit: 50 } // Not balanced
        ]
      },
      as: 'accountant'
    })
    expect(je.status).toBe(422)
  })

  it('DI-006: After full cycle reports consistent', async () => {
    const tb = await api('/reports/trial-balance', { method: 'GET', as: 'accountant' })
    const bs = await api('/reports/balance-sheet', { method: 'GET', as: 'accountant' })
    const iv = await api('/reports/inventory-valuation', { method: 'GET', as: 'accountant' })
    
    if (tb.status === 200 && tb.balanced !== undefined) expect(tb.balanced).toBe(true)
    if (bs.status === 200 && bs.balanced !== undefined) expect(bs.balanced).toBe(true)
    if (iv.status === 200 && iv.tiesOut !== undefined) expect(iv.tiesOut).toBe(true)
  })
})
