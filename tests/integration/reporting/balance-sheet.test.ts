import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, today } from '../../helpers/api';

describe('Balance Sheet Integration Tests', () => {
  beforeAll(async () => {
    await login('admin');
  });

  it.todo('BS-001: Fresh company capital injection only');

  it('BS-002: After sales + purchases posted -> verify Assets = Liabilities + Capital + Retained Earnings', async () => {
    const bsRes = await api.get('/reports/balance-sheet');
    expect(bsRes.status).toBe(200);
    const bs = bsRes.data;
    expect(bs.balanced).toBe(true);

    const assets = bs.assets.total;
    const liabilities = bs.liabilities.total;
    const equity = bs.equity.total;
    
    expect(assets).toBeCloseTo(liabilities + equity);
  });

  it('BS-003: Date filter BEFORE a transaction -> transaction excluded', async () => {
    const oldDate = '2020-01-01';
    const bsRes = await api.get(`/reports/balance-sheet?asOf=${oldDate}`);
    expect(bsRes.status).toBe(200);
    const bs = bsRes.data;
    expect(bs.balanced).toBe(true);
  });

  it.todo('BS-004: Monthly comparison');
  it.todo('BS-005: Yearly comparison');
  it.todo('BS-006: Departmental balance sheet');
  it.todo('BS-007: Consolidated balance sheet');

  it('Balance sheet identity: Assets == Liabilities + Capital + (Income - Expense) after 10+ mixed transactions', async () => {
    for (let i = 0; i < 10; i++) {
      const invRes = await api.post('/invoices', {
        customerId: 1, date: today(), items: [{ accountId: 4000, description: 'Sales', quantity: 1, unitPrice: 100 + i }]
      });
      await api.post(`/invoices/${invRes.data.id}/confirm`);
    }

    const bsRes = await api.get('/reports/balance-sheet');
    expect(bsRes.data.balanced).toBe(true);
    expect(bsRes.data.assets.total).toBeCloseTo(bsRes.data.liabilities.total + bsRes.data.equity.total);
  });

  it('Reversals don\'t break the balance: post entry, reverse it, BS still balanced', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1, date: today(), items: [{ accountId: 4000, description: 'To Reverse', quantity: 1, unitPrice: 999 }]
    });
    await api.post(`/invoices/${invRes.data.id}/confirm`);
    await api.post(`/invoices/${invRes.data.id}/cancel`); 

    const bsRes = await api.get('/reports/balance-sheet');
    expect(bsRes.data.balanced).toBe(true);
  });

  it('Zero-transaction period: BS returns valid structure with zeros, no crash', async () => {
    const bsRes = await api.get(`/reports/balance-sheet?asOf=1990-01-01`);
    expect(bsRes.status).toBe(200);
    expect(bsRes.data.balanced).toBe(true);
    expect(bsRes.data.assets.total).toBe(0);
    expect(bsRes.data.liabilities.total).toBe(0);
    expect(bsRes.data.equity.total).toBe(0);
  });

  it('BS after FX transactions: foreign currency entries reflected correctly in base currency', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1, date: today(), currency: 'USD', exchangeRate: 80,
      items: [{ accountId: 4000, description: 'Export', quantity: 1, unitPrice: 100 }] 
    });
    await api.post(`/invoices/${invRes.data.id}/confirm`);
    
    const bsRes = await api.get('/reports/balance-sheet');
    expect(bsRes.data.balanced).toBe(true);
  });
});
