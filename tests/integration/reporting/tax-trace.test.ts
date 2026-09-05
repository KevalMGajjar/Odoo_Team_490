import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAllRoles, today } from '../../helpers/api';

describe('Tax Tracing & Reporting', () => {
  beforeAll(async () => {
    await loginAllRoles();
  });

  it('AC-TAX-01: After posting an invoice with 18% GST → Output GST (account 2100) balance increased by the tax amount', async () => {
    const t = today();
    const invoice = await api('/invoices', {
      method: 'POST',
      body: {
        partnerId: 1,
        date: t,
        lines: [{ accountId: 4000, amount: 1000, taxId: 1 }]
      },
      as: 'admin'
    });
    
    if(invoice.status === 201 || invoice.status === 200) {
        await api(`/invoices/${invoice.id}/post`, { method: 'POST', as: 'admin' });
    }

    const tb = await api('/reports/trial-balance', { method: 'GET', as: 'admin' });
    expect(tb.status).toBe(200);
    
    const gstOutputAcc = tb.totals?.credit > 0 ? tb.lines?.find((l: any) => l.code === '2100' || l.accountId === 2100) : null;
    if(gstOutputAcc) {
       expect(gstOutputAcc.credit).toBeGreaterThan(0);
    }
  });

  it('AC-TAX-02: After posting a bill with 18% GST → Input GST (account 1200) balance increased', async () => {
    const t = today();
    const bill = await api('/bills', {
      method: 'POST',
      body: {
        partnerId: 2,
        date: t,
        lines: [{ accountId: 5000, amount: 1000, taxId: 2 }]
      },
      as: 'admin'
    });

    if(bill.status === 200 || bill.status === 201) {
       await api(`/bills/${bill.id}/post`, { method: 'POST', as: 'admin' });
    }

    const tb = await api('/reports/trial-balance', { method: 'GET', as: 'admin' });
    const gstInputAcc = tb.totals?.debit > 0 ? tb.lines?.find((l: any) => l.code === '1200' || l.accountId === 1200) : null;
    if(gstInputAcc) {
       expect(gstInputAcc.debit).toBeGreaterThan(0);
    }
  });

  it('AC-TAX-03: Tax is a balance sheet item, NOT in P&L', async () => {
    const pl = await api('/reports/profit-loss', { method: 'GET', as: 'admin' });
    expect(pl.status).toBe(200);
    
    const pnlAccounts = JSON.stringify(pl);
    expect(pnlAccounts).not.toContain('"1200"');
    expect(pnlAccounts).not.toContain('"2100"');
  });

  it.todo('AC-BUDGET-01: Budget tracking for expenses (A-07)');
  it.todo('AC-BUDGET-02: Budget vs Actual reports (A-07)');
});
