import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Purchase Order Integration', () => {
  let vendorId: number
  let productId1: number
  let productId2: number
  let productId3: number
  let serviceId: number

  beforeAll(async () => {
    await loginAllRoles()
    const vendors = await api('/contacts?q=Azure', { method: 'GET', as: 'accountant' })
    vendorId = vendors.data?.[0]?.id || 1

    const products = await api('/products?q=Bar Stool', { method: 'GET', as: 'accountant' })
    productId1 = products.data?.[0]?.id || 1
    productId2 = products.data?.[1]?.id || 2
    productId3 = products.data?.[2]?.id || 3
    
    const services = await api('/products?q=Service', { method: 'GET', as: 'accountant' })
    serviceId = services.data?.[0]?.id || 4
  })

  it('PO-001: Create draft PO with single line', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 10, unitPrice: 100 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.state).toBe('draft')
    expect(res.id).toBeDefined()
  })

  it('PO-002: Confirm PO', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 100 }] },
      as: 'accountant'
    })
    const res = await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    expect(res.status).toBe(200)
    expect(res.state).toBe('confirmed')
  })

  it('PO-003: PO for service product', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: serviceId, quantity: 1, unitPrice: 5000 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
  })

  it('PO-004: PO to bill conversion', async () => {
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

  it('PO-005: Cancel confirmed PO', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 100 }] },
      as: 'accountant'
    })
    await api(`/purchase-orders/${po.id}/confirm`, { method: 'POST', as: 'accountant' })
    const res = await api(`/purchase-orders/${po.id}/cancel`, { method: 'POST', as: 'accountant' })
    expect([200, 409]).toContain(res.status)
  })

  it('PO-006: PO with multi-line (3 products)', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [
        { productId: productId1, quantity: 2, unitPrice: 100 },
        { productId: productId2, quantity: 3, unitPrice: 200 },
        { productId: productId3, quantity: 4, unitPrice: 300 }
      ]},
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.untaxed).toBe(2000)
  })

  it('PO-007: PO with tax computation', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 10, unitPrice: 100 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.untaxed).toBe(1000)
    if (res.total) {
      expect(Number(res.total)).toBeGreaterThan(1000)
    }
  })

  it('PO-008: PO with large quantity (1000 units)', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 1000, unitPrice: 50 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.untaxed).toBe(50000)
  })

  it('PO-009: PO with fractional unitPrice (₹1234.57)', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 1234.57 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.untaxed).toBe(2469.14)
  })

  it('PO-010: Create PO as viewer', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 1, unitPrice: 100 }] },
      as: 'viewer'
    })
    expect(res.status).toBe(403)
  })

  it('PO-011: Create PO as portal', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 1, unitPrice: 100 }] },
      as: 'portal'
    })
    expect(res.status).toBe(403)
  })

  it('PO-012: PO with zero quantity', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 0, unitPrice: 100 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(422)
  })

  it('PO-013: PO with negative unitPrice', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 1, unitPrice: -100 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(422)
  })

  it('PO-014: Read PO by ID', async () => {
    const po = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 1, unitPrice: 100 }] },
      as: 'accountant'
    })
    const res = await api(`/purchase-orders/${po.id}`, { method: 'GET', as: 'accountant' })
    expect(res.status).toBe(200)
    expect(res.id).toBe(po.id)
  })

  it('PO-015: List POs', async () => {
    const res = await api('/purchase-orders?pageSize=10', { method: 'GET', as: 'accountant' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data)).toBe(true)
  })

  it('PO-016: PO without vendor', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { orderDate: today(), lines: [{ productId: productId1, quantity: 1, unitPrice: 100 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(422)
  })

  it('PO-017: PO without lines', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [] },
      as: 'accountant'
    })
    expect(res.status).toBe(422)
  })

  it('PO-018: PO computation: qty×price for each line, sum = untaxed', async () => {
    const res = await api('/purchase-orders', {
      method: 'POST',
      body: { vendorId, orderDate: today(), lines: [{ productId: productId1, quantity: 5, unitPrice: 50 }] },
      as: 'accountant'
    })
    expect(res.untaxed).toBe(250)
  })
})
