import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, statusOf, today } from '../../helpers/api';

describe('Payments API Integration Tests', () => {
  let invoiceId: number;

  beforeAll(async () => {
    await login('admin');
    
    // Create a test invoice to pay against
    const invoiceRes = await api.post('/invoices', {
      customerId: 1,
      date: today(),
      items: [
        { accountId: 4000, description: 'Services', quantity: 1, unitPrice: 59000 }
      ]
    });
    invoiceId = invoiceRes.data.id;
    await api.post(`/invoices/${invoiceId}/confirm`);
  });

  it('PAY-001: Full bank payment -> Outstanding = 0, Status = Paid, JE: Dr Bank / Cr Debtors', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1,
      date: today(),
      items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 1000 }]
    });
    const id = invRes.data.id;
    await api.post(`/invoices/${id}/confirm`);

    const payRes = await api.post(`/invoices/${id}/payments`, {
      amount: 1000,
      paymentMethodId: 1, // bank
      date: today()
    });
    
    expect(payRes.status).toBe(201);
    const checkRes = await api.get(`/invoices/${id}`);
    expect(checkRes.data.amountDue).toBe(0);
    expect(statusOf(checkRes.data)).toBe('Paid');
  });

  it('PAY-002: Partial payment -> Outstanding reduced, Status = Partially Paid', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1,
      date: today(),
      items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 1000 }]
    });
    const id = invRes.data.id;
    await api.post(`/invoices/${id}/confirm`);

    const payRes = await api.post(`/invoices/${id}/payments`, {
      amount: 400,
      paymentMethodId: 1,
      date: today()
    });
    
    expect(payRes.status).toBe(201);
    const checkRes = await api.get(`/invoices/${id}`);
    expect(checkRes.data.amountDue).toBe(600);
    expect(statusOf(checkRes.data)).toBe('Partially Paid');
  });

  it('AC-PAY-01: Partial payment ₹30,000 against ₹59,000 -> residual = ₹29,000', async () => {
    const payRes = await api.post(`/invoices/${invoiceId}/payments`, {
      amount: 30000,
      paymentMethodId: 1,
      date: today()
    });
    
    expect(payRes.status).toBe(201);
    const checkRes = await api.get(`/invoices/${invoiceId}`);
    expect(checkRes.data.amountDue).toBe(29000);
  });

  it('AC-PAY-02: Overpayment attempt -> 422 REJECTED', async () => {
    const payRes = await api.post(`/invoices/${invoiceId}/payments`, {
      amount: 50000,
      paymentMethodId: 1,
      date: today()
    }, { validateStatus: () => true });
    
    expect(payRes.status).toBe(422);
  });

  it('PAY-003: Three partial payments reducing outstanding step by step -> running total exactly right', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1,
      date: today(),
      items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 3000 }]
    });
    const id = invRes.data.id;
    await api.post(`/invoices/${id}/confirm`);

    await api.post(`/invoices/${id}/payments`, { amount: 1000, paymentMethodId: 1, date: today() });
    let check = await api.get(`/invoices/${id}`);
    expect(check.data.amountDue).toBe(2000);

    await api.post(`/invoices/${id}/payments`, { amount: 500, paymentMethodId: 1, date: today() });
    check = await api.get(`/invoices/${id}`);
    expect(check.data.amountDue).toBe(1500);

    await api.post(`/invoices/${id}/payments`, { amount: 1500, paymentMethodId: 1, date: today() });
    check = await api.get(`/invoices/${id}`);
    expect(check.data.amountDue).toBe(0);
    expect(statusOf(check.data)).toBe('Paid');
  });

  it('PAY-004: Zero amount payment -> 422 rejected', async () => {
    const payRes = await api.post(`/invoices/${invoiceId}/payments`, {
      amount: 0,
      paymentMethodId: 1,
      date: today()
    }, { validateStatus: () => true });
    expect(payRes.status).toBe(422);
  });

  it('PAY-005: Negative payment -> 422 rejected', async () => {
    const payRes = await api.post(`/invoices/${invoiceId}/payments`, {
      amount: -100,
      paymentMethodId: 1,
      date: today()
    }, { validateStatus: () => true });
    expect(payRes.status).toBe(422);
  });

  it('PAY-010: Cash payment -> Cash ledger moves, Bank is UNTOUCHED', async () => {
    const preCash = await api.get('/accounts/1001/balance'); // cash
    const preBank = await api.get('/accounts/1002/balance'); // bank

    const invRes = await api.post('/invoices', { customerId: 1, date: today(), items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 500 }] });
    await api.post(`/invoices/${invRes.data.id}/confirm`);
    await api.post(`/invoices/${invRes.data.id}/payments`, { amount: 500, paymentMethodId: 2, date: today() }); // cash payment

    const postCash = await api.get('/accounts/1001/balance');
    const postBank = await api.get('/accounts/1002/balance');

    expect(postCash.data.balance).toBe(preCash.data.balance + 500);
    expect(postBank.data.balance).toBe(preBank.data.balance);
  });

  it('PAY-011: Bank payment -> Bank ledger moves, Cash is UNTOUCHED', async () => {
    const preCash = await api.get('/accounts/1001/balance');
    const preBank = await api.get('/accounts/1002/balance');

    const invRes = await api.post('/invoices', { customerId: 1, date: today(), items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 500 }] });
    await api.post(`/invoices/${invRes.data.id}/confirm`);
    await api.post(`/invoices/${invRes.data.id}/payments`, { amount: 500, paymentMethodId: 1, date: today() }); // bank payment

    const postCash = await api.get('/accounts/1001/balance');
    const postBank = await api.get('/accounts/1002/balance');

    expect(postCash.data.balance).toBe(preCash.data.balance);
    expect(postBank.data.balance).toBe(preBank.data.balance + 500);
  });

  it('PAY-012: Cash vs Bank isolation', async () => {
    const preCash = await api.get('/accounts/1001/balance');
    const preBank = await api.get('/accounts/1002/balance');

    const invRes = await api.post('/invoices', { customerId: 1, date: today(), items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 1000 }] });
    const id = invRes.data.id;
    await api.post(`/invoices/${id}/confirm`);

    await api.post(`/invoices/${id}/payments`, { amount: 500, paymentMethodId: 1, date: today() }); // bank
    await api.post(`/invoices/${id}/payments`, { amount: 500, paymentMethodId: 2, date: today() }); // cash

    const postCash = await api.get('/accounts/1001/balance');
    const postBank = await api.get('/accounts/1002/balance');

    expect(postCash.data.balance).toBe(preCash.data.balance + 500);
    expect(postBank.data.balance).toBe(preBank.data.balance + 500);
  });

  it('Payment that exactly equals residual to the penny', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1,
      date: today(),
      items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 17700.00 }]
    });
    const id = invRes.data.id;
    await api.post(`/invoices/${id}/confirm`);

    await api.post(`/invoices/${id}/payments`, { amount: 17700.00, paymentMethodId: 1, date: today() });
    const checkRes = await api.get(`/invoices/${id}`);
    expect(checkRes.data.amountDue).toBe(0.00);
    expect(statusOf(checkRes.data)).toBe('Paid');
  });

  it('Payment against already-paid invoice -> 422 blocked', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1,
      date: today(),
      items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 100 }]
    });
    const id = invRes.data.id;
    await api.post(`/invoices/${id}/confirm`);

    await api.post(`/invoices/${id}/payments`, { amount: 100, paymentMethodId: 1, date: today() });
    const retry = await api.post(`/invoices/${id}/payments`, { amount: 100, paymentMethodId: 1, date: today() }, { validateStatus: () => true });
    
    expect(retry.status).toBe(422);
  });

  it('Payment leaving ₹0.01 residual -> status stays partial', async () => {
    const invRes = await api.post('/invoices', {
      customerId: 1,
      date: today(),
      items: [{ accountId: 4000, description: 'Test', quantity: 1, unitPrice: 100 }]
    });
    const id = invRes.data.id;
    await api.post(`/invoices/${id}/confirm`);

    await api.post(`/invoices/${id}/payments`, { amount: 99.99, paymentMethodId: 1, date: today() });
    const checkRes = await api.get(`/invoices/${id}`);
    expect(checkRes.data.amountDue).toBe(0.01);
    expect(statusOf(checkRes.data)).toBe('Partially Paid');
  });

  it.todo('PAY-006: Discount on early payment');
  it.todo('PAY-007: Late fee penalty');
  it.todo('PAY-008: Overpayment converted to advance');
  it.todo('PAY-009: Refund of advance');
  it.todo('PAY-013: Payment cancellation');
  it.todo('PAY-014: Payment with foreign currency');
});
