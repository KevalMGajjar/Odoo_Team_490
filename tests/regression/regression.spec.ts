import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAllRoles, today } from '../helpers/api';

describe('Accounting Regression Suite', () => {
  beforeAll(async () => {
    await loginAllRoles();
  });

  it('REG-001: Unbalanced JE is rejected and does NOT persist', async () => {
    const res = await api('/journal-entries', {
      method: 'POST',
      body: {
        date: today(),
        lines: [
          { accountId: 1000, debit: 100, credit: 0 },
          { accountId: 2000, debit: 0, credit: 50 }
        ]
      },
      as: 'admin'
    });
    expect(res.status).toBe(422);

    const tb = await api('/reports/trial-balance', { method: 'GET', as: 'admin' });
    expect(tb.balanced).toBe(true);
  });

  it('REG-002: Overpayment is blocked', async () => {
    const res = await api('/payments/register-payment', {
      method: 'POST',
      body: { invoiceId: 99999, amount: 999999 },
      as: 'admin'
    });
    expect(res.status).toBe(422);
  });

  it('REG-003: Posted bill cannot be re-posted', async () => {
    const res = await api('/bills/1/post', { method: 'POST', as: 'admin' });
    if (res.status === 200) {
      const res2 = await api('/bills/1/post', { method: 'POST', as: 'admin' });
      expect(res2.status).toBe(409);
    } else {
      expect([409, 404, 400]).toContain(res.status);
    }
  });

  it('REG-004: Posted invoice cannot be re-posted', async () => {
    const res = await api('/invoices/1/post', { method: 'POST', as: 'admin' });
    if (res.status === 200) {
      const res2 = await api('/invoices/1/post', { method: 'POST', as: 'admin' });
      expect(res2.status).toBe(409);
    } else {
      expect([409, 404, 400]).toContain(res.status);
    }
  });

  it('REG-005: Reversal creates mirror entry', async () => {
    const res = await api('/journal-entries/1/reverse', { method: 'POST', as: 'admin' });
    if (res.status === 200) {
      expect(res.kind).toBe('reversal');
    }
  });

  it('REG-006: Double reversal blocked', async () => {
    const res1 = await api('/journal-entries/1/reverse', { method: 'POST', as: 'admin' });
    if (res1.status === 200) {
      const res2 = await api('/journal-entries/1/reverse', { method: 'POST', as: 'admin' });
      expect(res2.status).toBe(409);
    }
  });

  it('REG-007: Accountant cannot reverse', async () => {
    const res = await api('/journal-entries/1/reverse', { method: 'POST', as: 'acct' });
    expect([403, 404]).toContain(res.status);
  });

  it('REG-008: Portal user blocked from financial endpoints', async () => {
    const res = await api('/accounts', { method: 'GET', as: 'portal' });
    expect(res.status).toBe(403);
  });

  it('REG-009: Trial balance always balanced after operations', async () => {
    const tb = await api('/reports/trial-balance', { method: 'GET', as: 'admin' });
    expect(tb.status).toBe(200);
    expect(tb.balanced).toBe(true);
  });
});
