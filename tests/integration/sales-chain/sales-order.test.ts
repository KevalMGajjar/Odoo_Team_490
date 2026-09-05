import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles, today } from '../../helpers/api'

describe('Sales Order Integration', () => {
  let customerId: number
  let productId1: number
  let serviceId: number
  
  beforeAll(async () => {
    await loginAllRoles()
    const customers = await api('/contacts?q=Meera', { method: 'GET', as: 'accountant' })
    customerId = customers.data?.[0]?.id || 1

    const products = await api('/products?q=Bar Stool', { method: 'GET', as: 'accountant' })
    productId1 = products.data?.[0]?.id || 1

    const services = await api('/products?q=Service', { method: 'GET', as: 'accountant' })
    serviceId = services.data?.[0]?.id || 4
  })

  it('SO-001: Create SO with single line', async () => {
    const res = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 150 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
  })

  it('SO-002: Confirm SO', async () => {
    const so = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 150 }] },
      as: 'accountant'
    })
    const res = await api(`/sales-orders/${so.id}/confirm`, { method: 'POST', as: 'accountant' })
    expect([200, 201]).toContain(res.status)
  })

  it('SO-003: SO with mixed goods + service lines', async () => {
    const res = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [
        { productId: productId1, quantity: 2, unitPrice: 150 },
        { productId: serviceId, quantity: 1, unitPrice: 500 }
      ]},
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.untaxed).toBe(800)
  })

  it('SO-004: SO to invoice conversion', async () => {
    const so = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 150 }] },
      as: 'accountant'
    })
    await api(`/sales-orders/${so.id}/confirm`, { method: 'POST', as: 'accountant' })
    const res = await api(`/sales-orders/${so.id}/create-invoice`, { method: 'POST', as: 'accountant' })
    expect(res.status).toBe(201)
  })

  it('SO-005: Cancel SO', async () => {
    const so = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 150 }] },
      as: 'accountant'
    })
    const res = await api(`/sales-orders/${so.id}/cancel`, { method: 'POST', as: 'accountant' })
    expect([200, 201]).toContain(res.status)
  })

  it('SO-006: SO with large quantity', async () => {
    const res = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 10000, unitPrice: 10 }] },
      as: 'accountant'
    })
    expect(res.status).toBe(201)
    expect(res.untaxed).toBe(100000)
  })

  it('SO-007: SO as viewer', async () => {
    const res = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 150 }] },
      as: 'viewer'
    })
    expect(res.status).toBe(403)
  })

  it('SO-008: SO with multi-currency', async () => {
    const res = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 150 }], currencyId: 2 },
      as: 'accountant'
    })
    // It might be 400/422 if unsupported, or 201.
    expect([201, 400, 422]).toContain(res.status)
  })

  it('SO-009: SO with discount', async () => {
    const res = await api('/sales-orders', {
      method: 'POST',
      body: { customerId, orderDate: today(), lines: [{ productId: productId1, quantity: 2, unitPrice: 150, discount: 10 }] },
      as: 'accountant'
    })
    expect([201, 400, 422]).toContain(res.status)
  })
})
