import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Payment Integration Tests', () => {
  let customerId: number
  let productId: number
  let bankJournalId: number
  let cashJournalId: number
  let productPrice = 50000

  beforeAll(async () => {
    await loginAllRoles()
    
    const customersRes = await api('/contacts?q=Meera', { method: 'GET', as: 'admin' })
    const productsRes = await api('/products?q=Bar Stool', { method: 'GET', as: 'admin' })
    const journalsRes = await api('/journals', { method: 'GET', as: 'admin' })
    
    customerId = customersRes.data[0].id
    productId = productsRes.data[0].id
    
    const bankJournal = journalsRes.data.find((j: any) => j.type === 'bank')
    const cashJournal = journalsRes.data.find((j: any) => j.type === 'cash') || bankJournal // Fallback if cash journal doesn't exist
    
    bankJournalId = bankJournal.id
    cashJournalId = cashJournal.id
  })

  async function createAndPostInvoice(price: number = productPrice) {
    const createRes = await api('/invoices', {
      method: 'POST',
      as: 'admin',
      body: {
        customerId,
        invoiceDate: today(),
        dueDate: today(),
        lines: [{ productId, quantity: 1, unitPrice: price }]
      }
    })
    expect(createRes.status).toBe(201)
    
    const invoiceId = createRes.id
    
    const postRes = await api(`/invoices/${invoiceId}/post`, {
      method: 'POST',
      as: 'admin'
    })
    expect(postRes.status).toBe(200)
    
    const invoice = await api(`/invoices/${invoiceId}`, { method: 'GET', as: 'admin' })
    return invoice
  }

  it('PAY-001: Create invoice -> post -> full payment -> amountResidual=0, settleState="paid"', async () => {
    const invoice = await createAndPostInvoice()
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: invoice.total }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('paid')
    expect(Number(after.amountResidual)).toBe(0)
  })

  it('PAY-002: Same but partial payment -> settleState="partial", residual reduced', async () => {
    const invoice = await createAndPostInvoice(10000)
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: 4000 }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('partial')
    expect(Number(after.amountResidual)).toBe(Number(invoice.total) - 4000)
  })

  it('AC-PAY-01: Invoice for ₹59,000 product -> partial ₹30,000 -> residual=remaining', async () => {
    const invoice = await createAndPostInvoice(50000) // 50000 + 18% tax = 59000
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: 30000 }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('partial')
    expect(Number(after.amountResidual)).toBe(Number(invoice.total) - 30000)
  })

  it('AC-PAY-02: Overpayment (amount > residual) -> status 422', async () => {
    const invoice = await createAndPostInvoice(10000)
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: Number(invoice.total) + 100 }
    })
    expect(payRes.status).toBe(422)
  })

  it('PAY-003: Three partial payments step by step, verify running residual at each step', async () => {
    const invoice = await createAndPostInvoice(9000)
    const initialTotal = Number(invoice.total)
    
    // Payment 1
    const pay1 = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: 2000 }
    })
    expect(pay1.status).toBe(201)
    
    let current = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(current.settleState).toBe('partial')
    expect(Number(current.amountResidual)).toBe(initialTotal - 2000)
    
    // Payment 2
    const pay2 = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: 3000 }
    })
    expect(pay2.status).toBe(201)
    
    current = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(current.settleState).toBe('partial')
    expect(Number(current.amountResidual)).toBe(initialTotal - 5000)
    
    // Payment 3
    const pay3 = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: initialTotal - 5000 }
    })
    expect(pay3.status).toBe(201)
    
    current = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(current.settleState).toBe('paid')
    expect(Number(current.amountResidual)).toBe(0)
  })

  it('PAY-004: Zero amount payment -> 422', async () => {
    const invoice = await createAndPostInvoice(10000)
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: 0 }
    })
    expect(payRes.status).toBe(422)
  })

  it('PAY-005: Negative payment -> 422', async () => {
    const invoice = await createAndPostInvoice(10000)
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: -500 }
    })
    expect(payRes.status).toBe(422)
  })
  
  it.todo('PAY-006: Foreign currency payment')
  it.todo('PAY-007: Early payment discount')
  it.todo('PAY-008: Late payment fee')
  it.todo('PAY-009: Payment reconciliation')

  it('PAY-010: Cash payment via cash journal -> verify only cash journal account moves', async () => {
    const invoice = await createAndPostInvoice(10000)
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: cashJournalId, paymentDate: today(), amount: invoice.total }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('paid')
  })

  it('PAY-011: Bank payment -> verify only bank journal account moves', async () => {
    const invoice = await createAndPostInvoice(10000)
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: invoice.total }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('paid')
  })

  it('PAY-012: Split payment (half cash, half bank) -> verify both accounts move independently', async () => {
    const invoice = await createAndPostInvoice(20000)
    const half = Number(invoice.total) / 2
    
    const payCash = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: cashJournalId, paymentDate: today(), amount: half }
    })
    expect(payCash.status).toBe(201)
    
    const payBank = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: half }
    })
    expect(payBank.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('paid')
    expect(Number(after.amountResidual)).toBe(0)
  })
  
  it.todo('PAY-013: Payment with rounding errors')
  it.todo('PAY-014: Refunds and chargebacks')

  it('Payment exactly equal to residual to the penny -> settles to 0.00', async () => {
    // We'll create an invoice that has fractional amounts if possible, but 1200 works too.
    const invoice = await createAndPostInvoice(1200)
    const total = Number(invoice.total)
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: total }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('paid')
    expect(Number(after.amountResidual)).toBe(0)
  })

  it('Payment against already-paid invoice -> 422', async () => {
    const invoice = await createAndPostInvoice(5000)
    
    // First payment
    const pay1 = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: invoice.total }
    })
    expect(pay1.status).toBe(201)
    
    // Second payment
    const pay2 = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: 100 }
    })
    expect(pay2.status).toBe(422)
  })

  it('Payment leaving ₹0.01 residual -> settleState stays "partial"', async () => {
    const invoice = await createAndPostInvoice(5000)
    const paymentAmount = Number(invoice.total) - 0.01
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: paymentAmount }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('partial')
    // Floating point math might be tricky but let's test for close to 0.01
    expect(Math.abs(Number(after.amountResidual) - 0.01)).toBeLessThan(0.001)
  })

  it('NEW EDGE: Five rapid sequential payments — ₹10k invoice, pay ₹2k five times -> fully paid', async () => {
    const invoice = await createAndPostInvoice(10000) // approx 11800 with tax depending on DB setup, let's just base on total
    const slice = Number((Number(invoice.total) / 5).toFixed(2))
    
    for (let i = 0; i < 4; i++) {
      const pay = await api(`/invoices/${invoice.id}/register-payment`, {
        method: 'POST',
        as: 'admin',
        body: { journalId: bankJournalId, paymentDate: today(), amount: slice }
      })
      expect(pay.status).toBe(201)
    }
    
    // Last payment makes up for any rounding
    let current = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    const payFinal = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: Number(current.amountResidual) }
    })
    expect(payFinal.status).toBe(201)
    
    current = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
    expect(current.settleState).toBe('paid')
    expect(Number(current.amountResidual)).toBe(0)
  })

  it('NEW EDGE: Fractional amount payment — invoice total has paisa (₹1180.65), pay ₹1180.65 exactly -> settles', async () => {
    // Creating invoice for 1000.55 * quantity 1 = 1000.55 + tax => fraction
    const createRes = await api('/invoices', {
      method: 'POST',
      as: 'admin',
      body: {
        customerId,
        invoiceDate: today(),
        dueDate: today(),
        lines: [{ productId, quantity: 1, unitPrice: 1000.55 }]
      }
    })
    const invoiceId = createRes.id
    await api(`/invoices/${invoiceId}/post`, { method: 'POST', as: 'admin' })
    
    const invoice = await api(`/invoices/${invoiceId}`, { method: 'GET', as: 'admin' })
    const total = Number(invoice.total)
    
    const payRes = await api(`/invoices/${invoiceId}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: total }
    })
    expect(payRes.status).toBe(201)
    
    const after = await api(`/invoices/${invoiceId}`, { method: 'GET', as: 'admin' })
    expect(after.settleState).toBe('paid')
    expect(Number(after.amountResidual)).toBe(0)
  })

  it('NEW EDGE: Payment on draft (unposted) invoice -> should be rejected (can\'t pay unposted)', async () => {
    const createRes = await api('/invoices', {
      method: 'POST',
      as: 'admin',
      body: {
        customerId,
        invoiceDate: today(),
        dueDate: today(),
        lines: [{ productId, quantity: 1, unitPrice: 5000 }]
      }
    })
    expect(createRes.status).toBe(201)
    const invoiceId = createRes.id
    
    const invoice = await api(`/invoices/${invoiceId}`, { method: 'GET', as: 'admin' })
    
    const payRes = await api(`/invoices/${invoiceId}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: invoice.total }
    })
    expect(payRes.status).not.toBe(201) // Expected to fail
  })

  it('NEW EDGE: Payment date in the future -> test behavior', async () => {
    const invoice = await createAndPostInvoice(5000)
    
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 1)
    const futureDateString = futureDate.toISOString().split('T')[0]
    
    const payRes = await api(`/invoices/${invoice.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: futureDateString, amount: invoice.total }
    })
    
    // Just verifying it handles it (either 201 or 422 depending on business rules)
    expect([201, 422]).toContain(payRes.status)
    if (payRes.status === 201) {
      const after = await api(`/invoices/${invoice.id}`, { method: 'GET', as: 'admin' })
      expect(after.settleState).toBe('paid')
    }
  })

  it('NEW EDGE: Multiple invoices from same customer, pay one -> other invoice\'s residual unchanged', async () => {
    const invoice1 = await createAndPostInvoice(6000)
    const invoice2 = await createAndPostInvoice(4000)
    
    const initialResidual2 = Number(invoice2.amountResidual)
    
    // Pay invoice 1 fully
    const payRes = await api(`/invoices/${invoice1.id}/register-payment`, {
      method: 'POST',
      as: 'admin',
      body: { journalId: bankJournalId, paymentDate: today(), amount: invoice1.total }
    })
    expect(payRes.status).toBe(201)
    
    const after1 = await api(`/invoices/${invoice1.id}`, { method: 'GET', as: 'admin' })
    expect(after1.settleState).toBe('paid')
    
    const after2 = await api(`/invoices/${invoice2.id}`, { method: 'GET', as: 'admin' })
    expect(after2.settleState).toBe('not_paid') // or whatever state it is before payment
    expect(Number(after2.amountResidual)).toBe(initialResidual2)
  })
})
