import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles } from '../../helpers/api'

describe('Master Data - Analytic Accounts', () => {
  beforeAll(async () => {
    await loginAllRoles()
  })

  let createdId: string

  it('ANA-001: Create analytic account', async () => {
    const res = await api('/analytic-accounts', {
      method: 'POST',
      body: { name: `Project Alpha ${Date.now()}` },
      as: 'admin'
    })
    expect(res.status).toBe(201)
    expect(res.id).toBeDefined()
    createdId = res.id
  })

  it('ANA-002: Read analytic account', async () => {
    const res = await api(`/analytic-accounts/${createdId}`, { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.id).toBe(createdId)
  })

  it('ANA-003: List analytic accounts', async () => {
    const res = await api('/analytic-accounts', { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.rows.length).toBeGreaterThan(0)
  })

  it('ANA-004: Update analytic account name', async () => {
    const newName = `Project Beta ${Date.now()}`
    const res = await api(`/analytic-accounts/${createdId}`, {
      method: 'PATCH',
      body: { name: newName },
      as: 'admin'
    })
    expect(res.status).toBe(200)
    
    const check = await api(`/analytic-accounts/${createdId}`, { method: 'GET', as: 'admin' })
    expect(check.name).toBe(newName)
  })

  it.todo('ANA-007: Gap note - ensure analytic account balances are updated correctly (Not implemented yet)')
})
