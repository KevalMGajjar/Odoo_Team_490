import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Balance Sheet Report', () => {
  let miscJournalId: string
  let expAccountId: string
  let bankAccountId: string
  
  beforeAll(async () => {
    await loginAllRoles()

    const accounts = await api('/accounts?pageSize=200', { as: 'admin' })
    if (accounts.rows) {
      expAccountId = accounts.rows.find((a: any) => a.code?.startsWith('5'))?.id
      bankAccountId = accounts.rows.find((a: any) => a.code?.startsWith('10'))?.id
    }

    const journals = await api('/journals', { as: 'admin' })
    if (journals.rows) {
      miscJournalId = journals.rows.find((j: any) => j.type === 'miscellaneous')?.id
    }
  })

  it.todo('BS-001: .todo')

  it('BS-002: GET /reports/balance-sheet -> balanced=true, assets ≈ liabilitiesAndEquity', async () => {
    const res = await api('/reports/balance-sheet', { as: 'admin' })
    expect(res.balanced).toBe(true)
    expect(res.totals.assets).toBeDefined()
    expect(res.totals.liabilitiesAndEquity).toBeDefined()
    expect(res.totals.assets).toEqual(res.totals.liabilitiesAndEquity)
  })

  it('BS-003: GET /reports/balance-sheet?asOf=2020-01-01 -> still balanced (historical date)', async () => {
    const res = await api('/reports/balance-sheet?asOf=2020-01-01', { as: 'admin' })
    expect(res.balanced).toBe(true)
    expect(res.totals.assets).toEqual(res.totals.liabilitiesAndEquity)
  })

  it('BS: After posting a manual entry and reversing it -> BS still balanced', async () => {
    const jeRes = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Test BS entry',
        narration: 'Test',
        items: [
          { accountId: expAccountId, debit: 1000, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 1000 }
        ]
      },
      as: 'admin'
    })
    expect(jeRes.status).toBe(201)
    
    let bs = await api('/reports/balance-sheet', { as: 'admin' })
    expect(bs.balanced).toBe(true)
    
    const revRes = await api(`/journal-entries/${jeRes.id}/reverse`, {
      method: 'POST',
      body: { reason: 'Test reversal' },
      as: 'admin'
    })
    expect(revRes.status).toBe(201)

    bs = await api('/reports/balance-sheet', { as: 'admin' })
    expect(bs.balanced).toBe(true)
  })

  it('BS: TB CSV export starts with correct header', async () => {
    const res = await api('/reports/trial-balance?format=csv', { as: 'admin' })
    expect(typeof res).toBe('string')
    expect(res).toMatch(/^Code,Account,Type,Debit,Credit/)
  })

  it('NEW: Inventory valuation ties out -> GET /reports/inventory-valuation, assert tiesOut=true', async () => {
    const res = await api('/reports/inventory-valuation', { as: 'admin' })
    expect(res.tiesOut).toBe(true)
    expect(res.totals.value).toBeDefined()
    expect(res.totals.ledgerBalance).toBeDefined()
  })

  it.todo('BS-004: .todo')
  it.todo('BS-005: .todo')
  it.todo('BS-006: .todo')
  it.todo('BS-007: .todo')
})
