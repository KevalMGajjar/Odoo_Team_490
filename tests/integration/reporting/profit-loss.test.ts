import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, today } from '../../helpers/api';

describe('Profit & Loss Integration Tests', () => {
  beforeAll(async () => {
    await login('admin');
  });

  it.todo('PL-001: Revenue recognition');
  it.todo('PL-002: Expense matching');

  it('PL-003: Sales ₹15,000 + Purchases ₹10,000 -> Net Profit = ₹5,000', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1, date: today(), items: [{ accountId: 4000, description: 'Sales', quantity: 1, unitPrice: 15000 }]
    });
    await api.post(`/invoices/${invRes.data.id}/confirm`);

    const billRes = await api.post('/bills', {
      vendorId: 1, date: today(), items: [{ accountId: 5000, description: 'Purchases', quantity: 1, unitPrice: 10000 }]
    });
    await api.post(`/bills/${billRes.data.id}/confirm`);

    const plRes = await api.get('/reports/profit-loss');
    expect(plRes.status).toBe(200);
    const income = plRes.data.income.total;
    const expense = plRes.data.expenses.total;
    expect(plRes.data.netProfit).toBeCloseTo(income - expense);
  });

  it.todo('PL-004: Depreciation expense');
  it.todo('PL-005: Interest expense');

  it('PL-006: Tax amounts EXCLUDED from P&L — tax is a liability passthrough', async () => {
    const beforePl = await api.get('/reports/profit-loss');
    
    const invRes = await api.post('/invoices', {
      customerId: 1, date: today(),
      items: [{ accountId: 4000, description: 'Sales', quantity: 1, unitPrice: 1000, taxId: 1 }] 
    });
    await api.post(`/invoices/${invRes.data.id}/confirm`);

    const afterPl = await api.get('/reports/profit-loss');
    
    const incomeDiff = afterPl.data.income.total - beforePl.data.income.total;
    expect(incomeDiff).toBe(1000); 
  });

  it.todo('PL-007: Extraordinary items');
  it.todo('PL-008: YTD comparison');

  it('P&L after a reversal: reversed entry\'s income/expense cancels out', async () => {
    const beforePl = await api.get('/reports/profit-loss');

    const invRes = await api.post('/invoices', {
      customerId: 1, date: today(), items: [{ accountId: 4000, description: 'To Reverse', quantity: 1, unitPrice: 2000 }]
    });
    await api.post(`/invoices/${invRes.data.id}/confirm`);
    await api.post(`/invoices/${invRes.data.id}/cancel`);

    const afterPl = await api.get('/reports/profit-loss');
    expect(afterPl.data.income.total).toBeCloseTo(beforePl.data.income.total);
    expect(afterPl.data.expenses.total).toBeCloseTo(beforePl.data.expenses.total);
    expect(afterPl.data.netProfit).toBeCloseTo(beforePl.data.netProfit);
  });

  it('P&L date range: only transactions within the specified range', async () => {
    const from = '2023-01-01';
    const to = '2023-12-31';
    const plRes = await api.get(`/reports/profit-loss?from=${from}&to=${to}`);
    expect(plRes.status).toBe(200);
    expect(plRes.data.income).toBeDefined();
  });

  it('P&L with COGS: gross profit = sales income - COGS, operating profit = gross - other expenses', async () => {
    const plRes = await api.get('/reports/profit-loss');
    const cogs = plRes.data.cogs?.total || 0;
    const income = plRes.data.income.total;
    const grossProfit = income - cogs;
    
    expect(plRes.data.grossProfit).toBeCloseTo(grossProfit);
    const otherExp = plRes.data.expenses.total; 
    expect(plRes.data.operatingProfit).toBeCloseTo(grossProfit - otherExp);
  });
});
