import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Customer Invoice Integration', () => {
  let customerId: number
  let productId1: number
  let bankJournalId: number
  
  beforeAll(async () => {
    await loginAllRoles()
    const customers = await api('/contacts?q=Meera', { method: 'GET', as: 'accountant' })
    customerId = customers.data?.[0]?.id || 1

    const products = await api('/products?q=Bar Stool', { method: 'GET', as: 'accountant' })
    productId1 = products.data?.[0]?.id || 1

    const journals = await api('/journals', { method: 'GET', as: 'accountant' })
    const bank = journals.data?.find((j: any) => j.type === 'bank')
    bankJournalId = bank?.id || 1
  })

  it('INV-001: Create standalone invoice', async () => {
    const res = await api('/invoices', {
      method: 'POST',
      body: { customerId, invoiceDate: today(), dueDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 200 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.id).toBeDefined()
  })

  it('INV-002: Post invoice', async () => {
    const inv = await api('/invoices', {
      method: 'POST',
      body: { customerId, invoiceDate: today(), dueDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 200 }] },
      as: 'accountant'
    })
    const res = await api(`/invoices/${inv.id}/post`, { method: 'POST', as: 'accountant' })
    expect(res.status).toBe(200)
    expect(res.journalEntryId).toBeDefined()
    // cogsEntryId might be defined or null depending on setup
    expect(res.settleState).toBeDefined()
  })

  it('INV-003: Cancel/reverse posted invoice', async () => {
    const inv = await api('/invoices', {
      method: 'POST',
      body: { customerId, invoiceDate: today(), dueDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 200 }] },
      as: 'accountant'
    })
    await api(`/invoices/${inv.id}/post`, { method: 'POST', as: 'accountant' })
    const res = await api(`/invoices/${inv.id}/cancel`, { method: 'POST', as: 'accountant' })
    expect([200, 201]).toContain(res.status)
  })

  it('INV-004: Invoice total computation', async () => {
    const res = await api('/invoices', {
      method: 'POST',
      body: { customerId, invoiceDate: today(), dueDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.untaxed).toBe(500)
  })

  it('INV-005: Invoice aging settleState', async () => {
    const inv = await api('/invoices', {
      method: 'POST',
      body: { customerId, invoiceDate: today(), dueDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 200 }] },
      as: 'accountant'
    })
    const postRes = await api(`/invoices/${inv.id}/post`, { method: 'POST', as: 'accountant' })
    expect(postRes.settleState).toBe('not_paid')
  })
})
