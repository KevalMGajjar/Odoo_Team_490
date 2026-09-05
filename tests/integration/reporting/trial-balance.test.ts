import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Trial Balance Report', () => {
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

  it('TB-01: GET /reports/trial-balance -> balanced=true, Σdebit === Σcredit', async () => {
    const res = await api('/reports/trial-balance', { as: 'admin' })
    expect(res.balanced).toBe(true)
    expect(res.totals.debit).toBeDefined()
    expect(res.totals.credit).toBeDefined()
    expect(res.totals.debit).toEqual(res.totals.credit)
  })

  it('TB-02: After posting a manual JE -> TB still balanced', async () => {
    const jeRes = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Test TB entry',
        narration: 'Test',
        items: [
          { accountId: expAccountId, debit: 500, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 500 }
        ]
      },
      as: 'admin'
    })
    expect(jeRes.status).toBe(201)

    const res = await api('/reports/trial-balance', { as: 'admin' })
    expect(res.balanced).toBe(true)
    expect(res.totals.debit).toEqual(res.totals.credit)
  })

  it('TB-03: After rejected unbalanced entry -> TB still balanced (nothing persisted)', async () => {
    const jeRes = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Bad TB entry',
        narration: 'Test unbalanced',
        items: [
          { accountId: expAccountId, debit: 500, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 400 } // Unbalanced
        ]
      },
      as: 'admin'
    })
    // Expect failure
    expect(jeRes.status).not.toBe(201)

    const res = await api('/reports/trial-balance', { as: 'admin' })
    expect(res.balanced).toBe(true)
    expect(res.totals.debit).toEqual(res.totals.credit)
  })

  it('NEW: TB CSV export -> starts with "Code,Account,Type,Debit,Credit"', async () => {
    const csv = await api('/reports/trial-balance?format=csv', { as: 'admin' })
    expect(typeof csv).toBe('string')
    expect(csv.trim().startsWith('Code,Account,Type,Debit,Credit')).toBe(true)
  })

  it('NEW: TB totals are exact — debit and credit are equal numeric strings', async () => {
    const res = await api('/reports/trial-balance', { as: 'admin' })
    expect(typeof res.totals.debit).toBe('string')
    expect(typeof res.totals.credit).toBe('string')
    expect(res.totals.debit).toEqual(res.totals.credit)
  })
})
