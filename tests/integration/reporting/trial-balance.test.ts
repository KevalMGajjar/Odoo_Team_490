import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, today } from '../../helpers/api';

describe('Trial Balance Integration Tests', () => {
  beforeAll(async () => {
    await login('admin');
  });

  it('TB-01: GET /reports/trial-balance -> assert balanced === true, Σdebit === Σcredit', async () => {
    const tbRes = await api.get('/reports/trial-balance');
    expect(tbRes.status).toBe(200);
    expect(tbRes.data.balanced).toBe(true);
    expect(tbRes.data.totalDebit).toBeCloseTo(tbRes.data.totalCredit);
  });

  it('TB-02: After 50+ transactions -> still balanced', async () => {
    for (let i = 0; i < 50; i++) {
      const invRes = await api.post('/invoices', {
        customerId: 1, date: today(), items: [{ accountId: 4000, description: 'Batch', quantity: 1, unitPrice: 10 + i }]
      });
      await api.post(`/invoices/${invRes.data.id}/confirm`);
    }

    const tbRes = await api.get('/reports/trial-balance');
    expect(tbRes.data.balanced).toBe(true);
    expect(tbRes.data.totalDebit).toBeCloseTo(tbRes.data.totalCredit);
  });

  it('TB-03: After a rejected unbalanced entry attempt -> TB still balanced', async () => {
    const jeRes = await api.post('/journals/entries', {
      date: today(),
      lines: [
        { accountId: 1000, debit: 100, credit: 0 },
        { accountId: 4000, debit: 0, credit: 90 } 
      ]
    }, { validateStatus: () => true });
    
    expect(jeRes.status).toBe(422); 

    const tbRes = await api.get('/reports/trial-balance');
    expect(tbRes.data.balanced).toBe(true);
    expect(tbRes.data.totalDebit).toBeCloseTo(tbRes.data.totalCredit);
  });
});
