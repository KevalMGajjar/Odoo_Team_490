import { describe, it, expect, beforeAll } from 'vitest'
import { api, loginAllRoles } from '../../helpers/api'

describe('Master Data - Chart of Accounts', () => {
  beforeAll(async () => {
    await loginAllRoles()
  })

  let assetCode = `100${Math.floor(Math.random() * 10000)}`

  it('COA-001: Create asset account', async () => {
    const res = await api('/accounts', {
      method: 'POST',
      body: { code: assetCode, name: `Asset Acct ${Date.now()}`, type: 'asset' },
      as: 'admin'
    })
    expect(res.status).toBe(201)
  })

  it('COA-002: Create liability account', async () => {
    const code = `200${Math.floor(Math.random() * 10000)}`
    const res = await api('/accounts', { method: 'POST', body: { code, name: `Liab Acct ${Date.now()}`, type: 'liability' }, as: 'admin' })
    expect(res.status).toBe(201)
  })

  it('COA-003: Create income account', async () => {
    const code = `400${Math.floor(Math.random() * 10000)}`
    const res = await api('/accounts', { method: 'POST', body: { code, name: `Inc Acct ${Date.now()}`, type: 'income' }, as: 'admin' })
    expect(res.status).toBe(201)
  })

  it('COA-004: Create expense account', async () => {
    const code = `500${Math.floor(Math.random() * 10000)}`
    const res = await api('/accounts', { method: 'POST', body: { code, name: `Exp Acct ${Date.now()}`, type: 'expense' }, as: 'admin' })
    expect(res.status).toBe(201)
  })

  it('COA-005: Create account with duplicate code', async () => {
    const res = await api('/accounts', { method: 'POST', body: { code: assetCode, name: `Dup Code`, type: 'asset' }, as: 'admin' })
    expect(res.status).toBe(422)
  })

  it('COA-006: Read account by ID', async () => {
    const code = `600${Math.floor(Math.random() * 10000)}`
    const acct = await api('/accounts', { method: 'POST', body: { code, name: `Read Acct`, type: 'asset' }, as: 'admin' })
    const res = await api(`/accounts/${acct.id}`, { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.code).toBe(code)
  })

  it('COA-007: List accounts with type filter', async () => {
    const code = `700${Math.floor(Math.random() * 10000)}`
    await api('/accounts', { method: 'POST', body: { code, name: 'Filter Me', type: 'equity' }, as: 'admin' })
    const res = await api('/accounts?type=equity', { method: 'GET', as: 'admin' })
    expect(res.status).toBe(200)
    expect(res.rows.every((r: any) => r.type === 'equity')).toBe(true)
  })

  it('COA-008: Portal user cannot access /accounts', async () => {
    const res = await api('/accounts', { method: 'GET', as: 'portal' })
    expect(res.status).toBe(403)
  })
})
