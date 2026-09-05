import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles } from '../../helpers/api'

describe('Master Data - Journals', () => {
  beforeAll(async () => {
    await loginAllRoles()
  })

  let jrnCode = `MSC${Math.floor(Math.random() * 1000)}`

  it('JRN-001: Create miscellaneous journal', async () => {
    const res = await api('/journals', {
      method: 'POST',
      body: { code: jrnCode, name: `Misc Journal ${Date.now()}`, type: 'miscellaneous' },
      as: 'admin'
    })
    expect(res.status).toBe(201)
  })

  it('JRN-002: Create bank journal', async () => {
    const code = `BNK${Math.floor(Math.random() * 1000)}`
    const res = await api('/journals', {
      method: 'POST',
      body: { code, name: `Bank Journal ${Date.now()}`, type: 'bank' },
      as: 'admin'
    })
    expect(res.status).toBe(201)
  })

  it('JRN-003: Create journal with duplicate code', async () => {
    const res = await api('/journals', {
      method: 'POST',
      body: { code: jrnCode, name: `Duplicate Misc`, type: 'miscellaneous' },
      as: 'admin'
    })
    expect(res.status).toBe(422)
  })

  it('JRN-004: List journals returns all types', async () => {
    const res = await api('/journals', { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(Array.isArray(res.rows)).toBe(true)
  })

  it('JRN-005: Archive journal', async () => {
    const code = `ARC${Math.floor(Math.random() * 1000)}`
    const jrn = await api('/journals', {
      method: 'POST',
      body: { code, name: `To Archive`, type: 'sales' },
      as: 'admin'
    })
    
    const res = await api(`/journals/${jrn.id}`, {
      method: 'PATCH',
      body: { active: false },
      as: 'admin'
    })
    expect(res.status).toBe(200)
  })
})
