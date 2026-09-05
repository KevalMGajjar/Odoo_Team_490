import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles } from '../../helpers/api'

describe('Master Data - Contacts', () => {
  beforeAll(async () => {
    await loginAllRoles()
  })

  let createdId: string

  it('CON-001: Create customer contact with all fields', async () => {
    const res = await api('/contacts', {
      method: 'POST',
      body: {
        name: `Customer ${Date.now()}`,
        type: 'customer',
        email: `cust_${Date.now()}@test.com`,
        phone: '555-0001',
        street: '123 Main St',
        city: 'Metropolis',
        state: 'NY',
        zip: '10001',
        country: 'USA'
      },
      as: 'admin'
    })
    expect(res.status).toBe(201)
    expect(res.id).toBeDefined()
    createdId = res.id
  })

  it('CON-002: Create vendor contact', async () => {
    const res = await api('/contacts', {
      method: 'POST',
      body: {
        name: `Vendor ${Date.now()}`,
        type: 'vendor',
        email: `vend_${Date.now()}@test.com`,
        phone: '555-0002'
      },
      as: 'admin'
    })
    expect(res.status).toBe(201)
  })

  it('CON-003: Create contact with minimum required fields (just name)', async () => {
    const res = await api('/contacts', {
      method: 'POST',
      body: { name: `MinContact ${Date.now()}` },
      as: 'admin'
    })
    expect(res.status).toBe(201)
  })

  it('CON-004: Read contact by ID', async () => {
    const res = await api(`/contacts/${createdId}`, { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.id).toBe(createdId)
  })

  it('CON-005: Update contact name', async () => {
    const newName = `Updated Customer ${Date.now()}`
    const res = await api(`/contacts/${createdId}`, {
      method: 'PATCH',
      body: { name: newName },
      as: 'admin'
    })
    expect(res.status).toBe(200)
    
    const check = await api(`/contacts/${createdId}`, { method: 'GET', as: 'admin' })
    expect(check.name).toBe(newName)
  })

  it('CON-006: Update contact email', async () => {
    const res = await api(`/contacts/${createdId}`, {
      method: 'PATCH',
      body: { email: `updated_${Date.now()}@test.com` },
      as: 'admin'
    })
    expect(res.status).toBe(200)
  })

  it('CON-007: Update contact phone', async () => {
    const res = await api(`/contacts/${createdId}`, {
      method: 'PATCH',
      body: { phone: '999-9999' },
      as: 'admin'
    })
    expect(res.status).toBe(200)
  })

  it('CON-008: Archive (soft-delete) contact', async () => {
    const contact = await api('/contacts', {
      method: 'POST',
      body: { name: `ToArchive ${Date.now()}` },
      as: 'admin'
    })
    
    const res = await api(`/contacts/${contact.id}`, {
      method: 'PATCH',
      body: { active: false },
      as: 'admin'
    })
    expect(res.status).toBe(200)
    
    const check = await api(`/contacts/${contact.id}`, { method: 'GET', as: 'admin' })
    expect(check.active).toBe(false)
  })

  it('CON-009: List contacts', async () => {
    const res = await api('/contacts', { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.rows)).toBe(true)
    expect(typeof res.total).toBe('number')
  })

  it('CON-010: Search contacts by name (q=)', async () => {
    const name = `Searchable ${Date.now()}`
    await api('/contacts', { method: 'POST', body: { name }, as: 'admin' })
    
    const res = await api(`/contacts?q=${encodeURIComponent(name)}`, { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.rows.length).toBeGreaterThan(0)
    expect(res.rows[0].name).toBe(name)
  })

  it('CON-011: Create contact with duplicate email', async () => {
    const email = `dup_${Date.now()}@test.com`
    await api('/contacts', { method: 'POST', body: { name: 'First', email }, as: 'admin' })
    const res = await api('/contacts', { method: 'POST', body: { name: 'Second', email }, as: 'admin' })
    expect([201, 422]).toContain(res.status)
  })

  it('CON-012: Create contact with empty name', async () => {
    const res = await api('/contacts', { method: 'POST', body: { name: '' }, as: 'admin' })
    expect(res.status).toBe(422)
  })

  it('CON-013: Create contact with very long name (500 chars)', async () => {
    const longName = 'A'.repeat(500)
    const res = await api('/contacts', { method: 'POST', body: { name: longName }, as: 'admin' })
    expect([201, 422]).toContain(res.status)
  })

  it('CON-014: Create contact with special characters in name', async () => {
    const res = await api('/contacts', { method: 'POST', body: { name: `Name !@#$%^&*() ${Date.now()}` }, as: 'admin' })
    expect(res.status).toBe(201)
  })

  it('CON-015: Create contact with email validation (invalid email)', async () => {
    const res = await api('/contacts', { method: 'POST', body: { name: 'Invalid Email', email: 'not-an-email' }, as: 'admin' })
    expect(res.status).toBe(422)
  })

  it('CON-016: Update non-existent contact', async () => {
    const res = await api('/contacts/999999999', { method: 'PATCH', body: { name: 'Ghost' }, as: 'admin' })
    expect(res.status).toBe(404)
  })

  it('CON-017: Delete/archive non-existent contact', async () => {
    const res = await api('/contacts/999999999', { method: 'DELETE', as: 'admin' })
    expect([404, 200, 204]).toContain(res.status)
  })

  it('CON-018: Create contact as viewer role', async () => {
    const res = await api('/contacts', { method: 'POST', body: { name: 'Viewer Try' }, as: 'viewer' })
    expect(res.status).toBe(403)
  })

  it('CON-019: Create contact as portal role', async () => {
    const res = await api('/contacts', { method: 'POST', body: { name: 'Portal Try' }, as: 'portal' })
    expect(res.status).toBe(403)
  })

  it('CON-020: Read contact as accountant', async () => {
    const res = await api(`/contacts/${createdId}`, { method: 'GET', as: 'accountant' })
    expect(res.status).toBe(200)
  })

  it('CON-021: List contacts with pagination (page=1, pageSize=5)', async () => {
    const res = await api('/contacts?page=1&pageSize=5', { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.rows.length).toBeLessThanOrEqual(5)
  })

  it('CON-022: Create both customer and vendor, list with type filter', async () => {
    await api('/contacts', { method: 'POST', body: { name: `F_Cust ${Date.now()}`, type: 'customer' }, as: 'admin' })
    await api('/contacts', { method: 'POST', body: { name: `F_Vend ${Date.now()}`, type: 'vendor' }, as: 'admin' })
    const res = await api('/contacts?type=customer', { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.rows.every((r: any) => r.type === 'customer' || !r.type)).toBe(true)
  })

  it('CON-023: Update contact type from customer to vendor', async () => {
    const contact = await api('/contacts', { method: 'POST', body: { name: `Switch ${Date.now()}`, type: 'customer' }, as: 'admin' })
    const res = await api(`/contacts/${contact.id}`, { method: 'PATCH', body: { type: 'vendor' }, as: 'admin' })
    expect(res.status).toBe(200)
  })

  it('CON-024: Contact with all optional fields', async () => {
    const res = await api('/contacts', {
      method: 'POST',
      body: {
        name: `AllOpt ${Date.now()}`,
        type: 'customer',
        email: 'opt@test.com',
        phone: '123',
        street: '1',
        city: '2',
        state: '3',
        zip: '4',
        country: '5',
        website: 'http://test.com',
        taxId: 'TAX123'
      },
      as: 'admin'
    })
    expect(res.status).toBe(201)
  })

  it('CON-025: Verify created contact appears in search results immediately', async () => {
    const name = `Immediate ${Date.now()}`
    await api('/contacts', { method: 'POST', body: { name }, as: 'admin' })
    const res = await api(`/contacts?q=${encodeURIComponent(name)}`, { method: 'GET', as: 'admin' })
    expect(res.rows.some((r: any) => r.name === name)).toBe(true)
  })
})
