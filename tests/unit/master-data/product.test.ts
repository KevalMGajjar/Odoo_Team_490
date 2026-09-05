import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles } from '../../helpers/api'

describe('Master Data - Products', () => {
  beforeAll(async () => {
    await loginAllRoles()
  })

  let createdId: string

  it('PRD-001: Create goods product with all fields', async () => {
    const res = await api('/products', {
      method: 'POST',
      body: {
        name: `Goods Product ${Date.now()}`,
        type: 'goods',
        salesPrice: 100.0,
        cost: 50.0,
        gstRate: 18,
        trackInventory: true
      },
      as: 'admin'
    })
    expect(res.status).toBe(201)
    expect(res.id).toBeDefined()
    createdId = res.id
  })

  it('PRD-002: Create service product (trackInventory=false)', async () => {
    const res = await api('/products', {
      method: 'POST',
      body: {
        name: `Service Product ${Date.now()}`,
        type: 'service',
        salesPrice: 200.0,
        cost: 0.0,
        gstRate: 5,
        trackInventory: false
      },
      as: 'admin'
    })
    expect(res.status).toBe(201)
  })

  it('PRD-003: Read product by ID', async () => {
    const res = await api(`/products/${createdId}`, { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.id).toBe(createdId)
  })

  it('PRD-004: Update product name', async () => {
    const newName = `Updated Product ${Date.now()}`
    const res = await api(`/products/${createdId}`, { method: 'PATCH', body: { name: newName }, as: 'admin' })
    expect(res.status).toBe(200)
    
    const check = await api(`/products/${createdId}`, { method: 'GET', as: 'admin' })
    expect(check.name).toBe(newName)
  })

  it('PRD-005: Update product price', async () => {
    const res = await api(`/products/${createdId}`, { method: 'PATCH', body: { salesPrice: 150.0 }, as: 'admin' })
    expect(res.status).toBe(200)
  })

  it('PRD-006: Update product GST rate', async () => {
    const res = await api(`/products/${createdId}`, { method: 'PATCH', body: { gstRate: 28 }, as: 'admin' })
    expect(res.status).toBe(200)
  })

  it('PRD-007: Archive product', async () => {
    const prod = await api('/products', { method: 'POST', body: { name: `To Archive ${Date.now()}` }, as: 'admin' })
    const res = await api(`/products/${prod.id}`, { method: 'PATCH', body: { active: false }, as: 'admin' })
    expect(res.status).toBe(200)
  })

  it('PRD-008: Create product with zero cost', async () => {
    const res = await api('/products', { method: 'POST', body: { name: `Zero Cost ${Date.now()}`, type: 'service', cost: 0 }, as: 'admin' })
    expect(res.status).toBe(201)
  })

  it('PRD-009: Create product with negative price', async () => {
    const res = await api('/products', { method: 'POST', body: { name: `Negative Price ${Date.now()}`, salesPrice: -10 }, as: 'admin' })
    expect(res.status).toBe(422)
  })

  it('PRD-010: Create product without name', async () => {
    const res = await api('/products', { method: 'POST', body: { salesPrice: 10 }, as: 'admin' })
    expect(res.status).toBe(422)
  })

  it('PRD-011: List products with search', async () => {
    const name = `SearchProd ${Date.now()}`
    await api('/products', { method: 'POST', body: { name }, as: 'admin' })
    const res = await api(`/products?q=${encodeURIComponent(name)}`, { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.rows.some((r: any) => r.name === name)).toBe(true)
  })

  it('PRD-012: Product with all tax rate presets (0%, 5%, 12%, 18%, 28%)', async () => {
    for (const rate of [0, 5, 12, 18, 28]) {
      const res = await api('/products', { method: 'POST', body: { name: `Tax ${rate}% ${Date.now()}`, gstRate: rate }, as: 'admin' })
      expect(res.status).toBe(201)
    }
  })

  it('PRD-013: Create product as viewer', async () => {
    const res = await api('/products', { method: 'POST', body: { name: 'Viewer Prod' }, as: 'viewer' })
    expect(res.status).toBe(403)
  })

  it('PRD-014: Product onHandQty starts at 0 for new tracked products', async () => {
    const res = await api('/products', { method: 'POST', body: { name: `Tracked ${Date.now()}`, type: 'goods', trackInventory: true }, as: 'admin' })
    expect(res.status).toBe(201)
    
    const check = await api(`/products/${res.id}`, { method: 'GET', as: 'admin' })
    expect(check.onHandQty || 0).toBe(0)
  })
})
