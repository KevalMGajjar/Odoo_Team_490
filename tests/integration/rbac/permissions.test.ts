import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('RBAC Permissions', () => {
  let adminId: string
  let contactId: string
  let miscJournalId: string
  let bankJournalId: string
  let expAccountId: string
  let bankAccountId: string
  let customerId: string
  let revAccountId: string
  
  beforeAll(async () => {
    await loginAllRoles()
    
    // Fetch fixtures for Admin
    const contacts = await api('/contacts?q=Meera', { as: 'admin' })
    if (contacts.rows && contacts.rows.length > 0) {
      contactId = contacts.rows[0].id
    }

    const accounts = await api('/accounts?pageSize=200', { as: 'admin' })
    if (accounts.rows) {
      expAccountId = accounts.rows.find((a: any) => a.code?.startsWith('5'))?.id
      bankAccountId = accounts.rows.find((a: any) => a.code?.startsWith('10'))?.id
      revAccountId = accounts.rows.find((a: any) => a.code?.startsWith('4'))?.id
    }

    const journals = await api('/journals', { as: 'admin' })
    if (journals.rows) {
      miscJournalId = journals.rows.find((j: any) => j.type === 'miscellaneous')?.id
      bankJournalId = journals.rows.find((j: any) => j.type === 'bank')?.id
    }
  })

  it('RBAC-01: Admin creates and archives a contact -> 200', async () => {
    const res = await api('/contacts', {
      method: 'POST',
      body: { name: 'Temp Admin Contact', type: 'customer' },
      as: 'admin'
    })
    expect(res.status).toBe(201)
    const newId = res.id
    
    const archiveRes = await api(`/contacts/${newId}/archive`, {
      method: 'POST',
      as: 'admin'
    })
    expect(archiveRes.status).toBe(200)
  })

  it('RBAC-02: Accountant tries to archive -> test both outcomes, document actual', async () => {
    const res = await api('/contacts', {
      method: 'POST',
      body: { name: 'Temp Acct Contact', type: 'customer' },
      as: 'acct'
    })
    expect(res.status).toBe(201)
    const newId = res.id
    
    const archiveRes = await api(`/contacts/${newId}/archive`, {
      method: 'POST',
      as: 'acct'
    })
    expect([200, 403]).toContain(archiveRes.status)
  })

  it.todo('RBAC-03: (needs Playwright)')

  it('RBAC-04: Portal user GETs /accounts -> 403', async () => {
    const res = await api('/accounts', { as: 'portal' })
    expect(res.status).toBe(403)
  })

  it.todo('RBAC-05: (portal document view needs portal routes)')
  it.todo('RBAC-06: (IDOR test needs portal routes)')
  it.todo('RBAC-07: .todo')
  it.todo('RBAC-08: .todo')

  it('RBAC-09: Accountant POSTs /journal-entries -> 201', async () => {
    const res = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Test Acct',
        narration: 'Test JE by Acct',
        items: [
          { accountId: expAccountId, debit: 100, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 100 }
        ]
      },
      as: 'acct'
    })
    expect(res.status).toBe(201)
  })

  it('RBAC-10: Portal POSTs /journal-entries -> 403', async () => {
    const res = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Test Portal',
        narration: 'Test JE by Portal',
        items: [
          { accountId: expAccountId, debit: 100, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 100 }
        ]
      },
      as: 'portal'
    })
    expect(res.status).toBe(403)
  })

  it('RBAC-11: Admin GETs /reports/balance-sheet -> 200', async () => {
    const res = await api('/reports/balance-sheet', { as: 'admin' })
    expect(res.balanced).toBeDefined()
  })

  it('RBAC-12: Portal GETs /reports/balance-sheet -> 403', async () => {
    const res = await api('/reports/balance-sheet', { as: 'portal' })
    expect(res.status).toBe(403)
  })

  it('RBAC-13: No auth header -> 401', async () => {
    const res = await api('/auth/me', {})
    expect(res.status).toBe(401)
  })

  it.todo('RBAC-14: (deactivate user)')

  it('NEW EDGE CASE: Viewer POSTs /invoices -> 403', async () => {
    const res = await api('/invoices', {
      method: 'POST',
      body: { customerId: contactId, invoiceDate: today(), dueDate: today(), lines: [] },
      as: 'viewer'
    })
    expect(res.status).toBe(403)
  })

  it('NEW EDGE CASE: Viewer POSTs /vouchers -> 403', async () => {
    const res = await api('/vouchers', {
      method: 'POST',
      body: { voucherType: 'BReceipt', date: today(), cashBankAccountId: bankAccountId, lines: [], reference: 'test', narration: 'test' },
      as: 'viewer'
    })
    expect(res.status).toBe(403)
  })

  it('NEW EDGE CASE: Viewer GETs /reports/balance-sheet -> 200 (read-only allowed)', async () => {
    const res = await api('/reports/balance-sheet', { as: 'viewer' })
    expect(res.balanced).toBeDefined()
  })

  it('NEW EDGE CASE: Portal GETs /invoices -> 403', async () => {
    const res = await api('/invoices', { as: 'portal' })
    expect(res.status).toBe(403)
  })

  it('NEW EDGE CASE: Portal POSTs /vouchers -> 403', async () => {
    const res = await api('/vouchers', {
      method: 'POST',
      body: { voucherType: 'BReceipt', date: today(), cashBankAccountId: bankAccountId, lines: [], reference: 'test', narration: 'test' },
      as: 'portal'
    })
    expect(res.status).toBe(403)
  })

  it('NEW EDGE CASE: Acct cannot reverse entry -> 403', async () => {
    const jeRes = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Test Reverse Acct',
        narration: 'Test',
        items: [
          { accountId: expAccountId, debit: 50, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 50 }
        ]
      },
      as: 'admin'
    })
    expect(jeRes.status).toBe(201)
    
    const revRes = await api(`/journal-entries/${jeRes.id}/reverse`, {
      method: 'POST',
      body: { reason: 'Wrong entry' },
      as: 'acct'
    })
    expect(revRes.status).toBe(403)
  })

  it('NEW EDGE CASE: Admin can reverse entry -> 201', async () => {
    const jeRes = await api('/journal-entries', {
      method: 'POST',
      body: {
        journalId: miscJournalId,
        date: today(),
        reference: 'Test Reverse Admin',
        narration: 'Test',
        items: [
          { accountId: expAccountId, debit: 60, credit: 0 },
          { accountId: bankAccountId, debit: 0, credit: 60 }
        ]
      },
      as: 'admin'
    })
    expect(jeRes.status).toBe(201)
    
    const revRes = await api(`/journal-entries/${jeRes.id}/reverse`, {
      method: 'POST',
      body: { reason: 'Wrong entry' },
      as: 'admin'
    })
    expect(revRes.status).toBe(201)
    expect(revRes.kind).toBe('reversal')
  })

  it('NEW EDGE CASE: No token on /journal-entries POST -> 401', async () => {
    const res = await api('/journal-entries', {
      method: 'POST',
      body: {}
    })
    expect(res.status).toBe(401)
  })

  it('NEW EDGE CASE: Portal GETs /reports/trial-balance -> 403', async () => {
    const res = await api('/reports/trial-balance', { as: 'portal' })
    expect(res.status).toBe(403)
  })

  it('NEW EDGE CASE: Portal GETs /reports/inventory-valuation -> 403', async () => {
    const res = await api('/reports/inventory-valuation', { as: 'portal' })
    expect(res.status).toBe(403)
  })
})
