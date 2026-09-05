import { test, expect } from '@playwright/test'

/**
 * Part 15 — Critical Smoke Test Suite
 * Fastest signal that the build is usable.
 *
 * These are API-level tests (no browser), run via Playwright's test runner
 * for consistent reporting. They hit the backend directly on port 4000.
 */

const BASE = process.env.API_URL || 'http://localhost:4000'

async function api(path: string, opts: { method?: string; body?: any; token?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body ? { body: JSON.stringify(opts.body) } : {}),
  })
  const text = await res.text()
  let json: any = null
  try { json = JSON.parse(text) } catch {}
  return { status: res.status, ...json }
}

async function login(email: string, password = 'demo123'): Promise<string> {
  const r = await api('/auth/login', { method: 'POST', body: { email, password } })
  if (!r.token) throw new Error(`Login failed for ${email}: ${r.message}`)
  return r.token
}

const RUN = Date.now()

test.describe('Part 15 — Smoke Tests (API-level)', () => {
  let adminToken: string

  test.beforeAll(async () => {
    adminToken = await login('admin@urbanfurniture.com')
  })

  test('Smoke-1: Create one Contact, one Product, one CoA account, one Journal — all 201', async () => {
    const contact = await api('/contacts', {
      method: 'POST', token: adminToken,
      body: { name: `Smoke Contact ${RUN}`, type: 'customer' },
    })
    expect(contact.status).toBe(201)
    expect(contact.id).toBeDefined()

    const product = await api('/products', {
      method: 'POST', token: adminToken,
      body: { name: `Smoke Product ${RUN}`, type: 'goods', salesPrice: 3000, cost: 1800 },
    })
    expect(product.status).toBe(201)
    expect(product.id).toBeDefined()

    const account = await api('/accounts', {
      method: 'POST', token: adminToken,
      body: { code: `S${RUN}`.slice(0, 8), name: `Smoke Account ${RUN}`, type: 'asset' },
    })
    expect(account.status).toBe(201)
    expect(account.id).toBeDefined()

    const journal = await api('/journals', {
      method: 'POST', token: adminToken,
      body: { code: `SK${String(RUN).slice(-4)}`, name: `Smoke Journal ${RUN}`, type: 'miscellaneous' },
    })
    expect(journal.status).toBe(201)
    expect(journal.id).toBeDefined()
  })

  test('Smoke-2: PO → confirm → bill → post bill → register payment → Outstanding = 0', async () => {
    // Use existing seeded vendor and product from the seed data
    const { rows: vendors } = await api('/contacts?q=Azure', { token: adminToken })
    const { rows: products } = await api('/products?q=Bar Stool', { token: adminToken })
    const { rows: journals } = await api('/journals', { token: adminToken })
    const bankJournal = journals.find((j: any) => j.type === 'bank')

    const today = new Date().toISOString().slice(0, 10)

    // 1. Create PO
    const po = await api('/purchase-orders', {
      method: 'POST', token: adminToken,
      body: {
        vendorId: vendors[0].id, orderDate: today,
        lines: [{ productId: products[0].id, quantity: 5, unitPrice: 1800 }],
      },
    })
    expect(po.status).toBe(201)

    // 2. Confirm PO — should NOT create journal entry
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', token: adminToken })

    // 3. Create bill from PO
    const bill = await api(`/purchase-orders/${po.id}/create-bill`, {
      method: 'POST', token: adminToken,
    })
    expect(bill.status).toBe(201)
    expect(bill.state).toBe('draft')

    // 4. Post the bill — creates JE + receives stock
    const posted = await api(`/bills/${bill.id}/post`, { method: 'POST', token: adminToken })
    expect(posted.status).toBe(200)
    expect(posted.state).toBe('posted')
    expect(posted.journalEntryId).toBeTruthy()

    // 5. Register payment for full amount
    const payment = await api(`/bills/${bill.id}/register-payment`, {
      method: 'POST', token: adminToken,
      body: { journalId: bankJournal.id, paymentDate: today, amount: Number(posted.total) },
    })
    expect(payment.status).toBe(201)

    // 6. Verify outstanding cleared
    const settled = await api(`/bills/${bill.id}`, { token: adminToken })
    expect(Number(settled.amountResidual)).toBe(0)
    expect(settled.settleState).toBe('paid')
  })

  test('Smoke-3: Invoice → post → register payment → Outstanding = 0', async () => {
    const { rows: customers } = await api('/contacts?q=Meera', { token: adminToken })
    const { rows: products } = await api('/products?q=Bar Stool', { token: adminToken })
    const { rows: journals } = await api('/journals', { token: adminToken })
    const bankJournal = journals.find((j: any) => j.type === 'bank')

    const today = new Date().toISOString().slice(0, 10)

    // 1. Create invoice
    const inv = await api('/invoices', {
      method: 'POST', token: adminToken,
      body: {
        customerId: customers[0].id, invoiceDate: today, dueDate: today,
        lines: [{ productId: products[0].id, quantity: 3, unitPrice: 2900 }],
      },
    })
    expect(inv.status).toBe(201)

    // 2. Post the invoice
    const posted = await api(`/invoices/${inv.id}/post`, { method: 'POST', token: adminToken })
    expect(posted.journalEntryId).toBeTruthy()
    expect(posted.cogsEntryId).toBeTruthy() // Dual JE: revenue + COGS

    // 3. Register full payment
    const fullAmount = Number(posted.total)
    const payment = await api(`/invoices/${inv.id}/register-payment`, {
      method: 'POST', token: adminToken,
      body: { journalId: bankJournal.id, paymentDate: today, amount: fullAmount },
    })
    expect(payment.status).toBe(201)

    // 4. Verify settled
    const settled = await api(`/invoices/${inv.id}`, { token: adminToken })
    expect(Number(settled.amountResidual)).toBe(0)
    expect(settled.settleState).toBe('paid')
  })

  test('Smoke-4: Reports render without error — BS, P&L, Budget all return 200', async () => {
    const bs = await api('/reports/balance-sheet', { token: adminToken })
    expect(bs.status).toBe(200)
    expect(bs.balanced).toBe(true) // Balance sheet must ALWAYS balance

    const pl = await api('/reports/profit-loss', { token: adminToken })
    expect(pl.status).toBe(200)

    const budget = await api('/reports/budget', { token: adminToken })
    expect(budget.status).toBe(200)

    // Bonus: Trial Balance should be balanced too
    const tb = await api('/reports/trial-balance', { token: adminToken })
    expect(tb.status).toBe(200)
    expect(tb.balanced).toBe(true)
  })

  test('Smoke-5: Login as all four roles — each returns a token and correct role', async () => {
    const roles = [
      { email: 'admin@urbanfurniture.com', expectedRole: 'admin' },
      { email: 'accountant@urbanfurniture.com', expectedRole: 'invoicing_user' },
      { email: 'viewer@urbanfurniture.com', expectedRole: 'viewer' },
      { email: 'nimesh@example.com', expectedRole: 'contact' },
    ]

    for (const r of roles) {
      const auth = await api('/auth/login', {
        method: 'POST',
        body: { email: r.email, password: 'demo123' },
      })
      expect(auth.status).toBe(200)
      expect(auth.token).toBeDefined()
      expect(auth.user.role).toBe(r.expectedRole)
    }
  })

  test('Smoke-6: Unbalanced journal entry is rejected with 422', async () => {
    const { rows: journals } = await api('/journals', { token: adminToken })
    const { rows: accounts } = await api('/accounts?pageSize=200', { token: adminToken })
    const misc = journals.find((j: any) => j.type === 'miscellaneous')
    const acc = (code: string) => accounts.find((a: any) => a.code === code)

    const today = new Date().toISOString().slice(0, 10)

    const entry = await api('/journal-entries', {
      method: 'POST', token: adminToken,
      body: {
        journalId: misc.id, date: today,
        narration: 'Smoke test — should fail',
        items: [
          { accountId: acc('5100')!.id, debit: 100, credit: 0 },
          { accountId: acc('2000')!.id, debit: 0, credit: 90 }, // Imbalanced by 10
        ],
      },
    })
    expect(entry.status).toBe(422)
  })
})
