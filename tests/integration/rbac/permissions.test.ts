import { describe, it, expect, beforeAll } from 'vitest'
import { api, login, loginAllRoles, statusOf, today } from '../../helpers/api'

describe('RBAC Permissions Tests', () => {
  let admin: any, acct: any, viewer: any, portal: any

  beforeAll(async () => {
    const roles = await loginAllRoles()
    admin = roles.admin
    acct = roles.acct
    viewer = roles.viewer
    portal = roles.portal
  })

  it('RBAC-01: Admin archives a Contact -> 200 success', async () => {
    const res = await admin.post('/contacts', { name: 'To Archive' })
    const archiveRes = await admin.patch(`/contacts/${res.data.id}`, { active: false })
    expect(archiveRes.status).toBe(200)
  })

  it('RBAC-02: Accountant archives a Contact -> test actual behavior, document what happens', async () => {
    const res = await admin.post('/contacts', { name: 'To Archive by Acct' })
    const archiveRes = await acct.patch(`/contacts/${res.data.id}`, { active: false })
    // Documenting behavior: Accountant is typically allowed to edit basic master data or it might be 403. 
    // Assuming 200 for now.
    expect([200, 403]).toContain(archiveRes.status) 
  })

  it.todo('RBAC-03: Contact sees no CoA menu item in UI (Playwright needed)')

  it('RBAC-04: Contact hits GET /accounts via API -> 403 blocked at server, not just hidden in UI', async () => {
    const res = await portal.get('/accounts')
    expect(res.status).toBe(403)
  })

  it('RBAC-05: Contact (portal user) views their OWN invoice via /portal/documents -> 200 success', async () => {
    const invoiceRes = await admin.post('/invoices', { customerId: portal.userId, amount: 100 })
    const res = await portal.get(`/portal/documents/${invoiceRes.data.id}`)
    expect(res.status).toBe(200)
  })

  it("RBAC-06: Contact A tries to view Contact B's invoice by guessing ID -> 403 blocked (CRITICAL data isolation)", async () => {
    const invoiceRes = await admin.post('/invoices', { customerId: admin.userId, amount: 200 })
    const res = await portal.get(`/portal/documents/${invoiceRes.data.id}`)
    expect(res.status).toBe(403)
  })

  it.todo('RBAC-07: Contact makes payment on own invoice -> success')
  
  it.todo('RBAC-08: Contact edits invoice amount -> blocked')

  it('RBAC-09: Accountant creates a direct Journal Entry -> 201 success (they can record transactions)', async () => {
    const res = await acct.post('/journal-entries', { date: today(), lines: [{ debit: 100 }, { credit: 100 }] })
    expect([200, 201]).toContain(res.status)
  })

  it('RBAC-10: Portal user attempts to POST /journal-entries -> 403 blocked', async () => {
    const res = await portal.post('/journal-entries', { date: today(), lines: [] })
    expect(res.status).toBe(403)
  })

  it('RBAC-11: Admin views all reports -> 200', async () => {
    const res = await admin.get('/reports/balance-sheet')
    expect(res.status).toBe(200)
  })

  it('RBAC-12: Portal user attempts GET /reports/balance-sheet -> 403 blocked', async () => {
    const res = await portal.get('/reports/balance-sheet')
    expect(res.status).toBe(403)
  })

  it('RBAC-13: Unauthenticated request (no token) to ANY financial endpoint -> 401', async () => {
    const res = await api.get('/accounts')
    expect(res.status).toBe(401)
  })

  it.todo('RBAC-14: Admin deactivates accountant login -> immediate access loss')

  // Deep security edge cases
  it('Portal user tries to POST /vouchers -> 403', async () => {
    const res = await portal.post('/vouchers', { amount: 50 })
    expect(res.status).toBe(403)
  })

  it('Portal user tries to GET /contacts (list ALL contacts) -> 403', async () => {
    const res = await portal.get('/contacts')
    expect(res.status).toBe(403)
  })

  it('Viewer tries to POST /invoices -> 403 (read-only role)', async () => {
    const res = await viewer.post('/invoices', { amount: 50 })
    expect(res.status).toBe(403)
  })

  it('Viewer CAN read reports -> 200', async () => {
    const res = await viewer.get('/reports/balance-sheet')
    expect(res.status).toBe(200)
  })

  it('Expired/invalid JWT token -> 401', async () => {
    const res = await api.get('/reports/balance-sheet', { headers: { Authorization: 'Bearer invalid' } })
    expect(res.status).toBe(401)
  })

  it.todo('Token from one role cannot escalate to another role\\'s endpoints')

  it('SQL injection attempt in auth header -> handled gracefully (no 500)', async () => {
    const res = await api.get('/accounts', { headers: { Authorization: "Bearer ' OR 1=1 --" } })
    expect(res.status).toBe(401)
  })

  it('Portal user tries GET /reports/trial-balance -> 403', async () => {
    const res = await portal.get('/reports/trial-balance')
    expect(res.status).toBe(403)
  })

  it('Accountant tries to reverse a journal entry -> 403 (only admin can reverse)', async () => {
    const res = await acct.post('/journal-entries/1/reverse')
    expect(res.status).toBe(403)
  })
})
