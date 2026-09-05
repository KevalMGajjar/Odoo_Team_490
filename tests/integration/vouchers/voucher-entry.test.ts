import { describe, it, expect, beforeAll } from 'vitest';
import { api, login, today } from '../../helpers/api';

describe('Voucher Entry Integration Tests', () => {
  beforeAll(async () => {
    await login('admin');
  });

  it('Bank Receipt: post receipt, verify party row positive / bank row negative, nets to zero', async () => {
    const voucherRes = await api.post('/vouchers', {
      type: 'BANK_RECEIPT',
      date: today(),
      partyId: 1, 
      bankAccountId: 1002, 
      amount: 5000,
      reference: 'BR-001'
    });
    expect(voucherRes.status).toBe(201);
    
    const jeRes = await api.get(`/vouchers/${voucherRes.data.id}/journal-entries`);
    const lines = jeRes.data.lines;
    
    const bankLine = lines.find((l: any) => l.accountId === 1002);
    const partyLine = lines.find((l: any) => l.accountId !== 1002);
    
    expect(bankLine.debit).toBe(5000);
    expect(bankLine.credit).toBe(0);
    expect(partyLine.debit).toBe(0);
    expect(partyLine.credit).toBe(5000);
    
    const net = lines.reduce((acc: number, l: any) => acc + (l.debit - l.credit), 0);
    expect(net).toBe(0);
  });

  it('Cash Receipt: same pattern but with cash account', async () => {
    const voucherRes = await api.post('/vouchers', {
      type: 'CASH_RECEIPT',
      date: today(),
      partyId: 1, 
      cashAccountId: 1001, 
      amount: 1500,
      reference: 'CR-001'
    });
    expect(voucherRes.status).toBe(201);
    
    const jeRes = await api.get(`/vouchers/${voucherRes.data.id}/journal-entries`);
    const lines = jeRes.data.lines;
    
    const cashLine = lines.find((l: any) => l.accountId === 1001);
    const partyLine = lines.find((l: any) => l.accountId !== 1001);
    
    expect(cashLine.debit).toBe(1500);
    expect(partyLine.credit).toBe(1500);
    
    const net = lines.reduce((acc: number, l: any) => acc + (l.debit - l.credit), 0);
    expect(net).toBe(0);
  });

  it('Validation: zero amount rejected', async () => {
    const voucherRes = await api.post('/vouchers', {
      type: 'BANK_RECEIPT',
      date: today(),
      partyId: 1,
      bankAccountId: 1002,
      amount: 0
    }, { validateStatus: () => true });
    
    expect(voucherRes.status).toBe(422);
  });

  it('Validation: party=bank account rejected', async () => {
    const voucherRes = await api.post('/vouchers', {
      type: 'BANK_RECEIPT',
      date: today(),
      partyId: 1002, 
      bankAccountId: 1002,
      amount: 1000
    }, { validateStatus: () => true });
    
    expect(voucherRes.status).toBe(422);
  });

  it('Validation: non-cash-bank on bank side rejected', async () => {
    const voucherRes = await api.post('/vouchers', {
      type: 'BANK_RECEIPT',
      date: today(),
      partyId: 1,
      bankAccountId: 4000, 
      amount: 1000
    }, { validateStatus: () => true });
    
    expect(voucherRes.status).toBe(422);
  });

  it.todo('Bank Payment');
  it.todo('Cash Payment');
  it.todo('Journal Voucher');
  it.todo('Multi-line receipt');
  it.todo('Numbering sequentially');
  it.todo('Remembered default accounts');
});
