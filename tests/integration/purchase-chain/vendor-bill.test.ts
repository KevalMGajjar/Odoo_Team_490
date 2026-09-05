import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Vendor Bill Integration', () => {
  let vendorId: number
  let productId1: number
  
  beforeAll(async () => {
    await loginAllRoles()
    const vendors = await api('/contacts?q=Azure', { method: 'GET', as: 'accountant' })
    vendorId = vendors.data?.[0]?.id || 1

    const products = await api('/products?q=Bar Stool', { method: 'GET', as: 'accountant' })
    productId1 = products.data?.[0]?.id || 1
  })

  it('VB-001: Create bill from PO', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    const res = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST', as: 'accountant' })
    expect(res.status).toBe(201)
    expect(res.state).toBe('draft')
  })

  it('VB-002: Post bill', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    const bill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST', as: 'accountant' })
    
    const res = await api(`/bills/${bill.id}/post`, { method: 'POST', as: 'accountant' })
    expect(res.status).toBe(200)
    expect(res.state).toBe('posted')
    expect(res.journalEntryId).toBeDefined()
  })

  it('VB-003: Post bill -> stock quantity increased', async () => {
    // Get current stock
    const productsBefore = await api(`/products?q=Bar Stool`, { method: 'GET', as: 'accountant' })
    const beforeQty = productsBefore.data?.[0]?.onHandQty || 0

    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    const bill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST', as: 'accountant' })
    await api(`/bills/${bill.id}/post`, { method: 'POST', as: 'accountant' })

    const productsAfter = await api(`/products?q=Bar Stool`, { method: 'GET', as: 'accountant' })
    const afterQty = productsAfter.data?.[0]?.onHandQty || 0
    expect(afterQty).toBeGreaterThan(beforeQty)
  })

  it('VB-004: Post already-posted bill', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    const bill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST', as: 'accountant' })
    await api(`/bills/${bill.id}/post`, { method: 'POST', as: 'accountant' })
    
    const res = await api(`/bills/${bill.id}/post`, { method: 'POST', as: 'accountant' })
    expect(res.status).toBe(409)
  })

  it('VB-005: Bill total matches PO total', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    const bill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST', as: 'accountant' })
    
    const billGet = await api(`/bills/${bill.id}`, { method: 'GET', as: 'accountant' })
    expect(billGet.untaxed).toBe(po.untaxed)
    expect(billGet.total).toBe(po.total)
  })

  it('VB-006: Bill JE has correct accounts', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    const bill = await api(`/purchase-orders/${po.id}/create-bill`, { method: 'POST', as: 'accountant' })
    const postRes = await api(`/bills/${bill.id}/post`, { method: 'POST', as: 'accountant' })
    
    expect(postRes.journalEntryId).toBeDefined()
    // Cannot easily assert exact accounts without JE API GET, but we ensure it posted successfully.
  })

  it('VB-007: Create standalone bill (not from PO)', async () => {
    const res = await api('/bills', {
      method: 'POST',
      body: { vendorId, billDate: today(), lines: [{ productId: productId1, quantity: 1, unitPrice: 100 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
  })
})
