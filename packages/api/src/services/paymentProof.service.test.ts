import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createTestDb } from '../test-helpers/db';
import { __setDbForTesting } from '../utils/db';
import { __setStoreRootForTesting, resolveStoredPath } from './fileStore';
import {
  createPaymentProof, listProofsForInvoice, getClientProof, getStaffProof,
  acceptPaymentProof, rejectPaymentProof, countPendingProofs,
} from './paymentProof.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);

let db: Database.Database;
let root: string;

const invoiceStatus = (id: string) =>
  (db.prepare('SELECT status FROM invoices WHERE id = ?').get(id) as { status: string }).status;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-proofs-'));
  __setStoreRootForTesting(root);
  db = createTestDb();
  __setDbForTesting(db);
  db.prepare("INSERT INTO users (id, email) VALUES ('u1', 'staff@example.com')").run();
  db.prepare("INSERT INTO users (id, email) VALUES ('u2', 'other@example.com')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c1', 'u1', 'Acme')").run();
  db.prepare("INSERT INTO clients (id, user_id, name) VALUES ('c2', 'u1', 'Rival')").run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
              VALUES ('i1', 'INV-0001', 'u1', 'c1', '[]', 100, 'sent')`).run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
              VALUES ('i2', 'INV-0002', 'u1', 'c2', '[]', 200, 'sent')`).run();
  db.prepare(`INSERT INTO invoices (id, invoice_number, user_id, client_id, items, total, status)
              VALUES ('i-draft', 'INV-0003', 'u1', 'c1', '[]', 50, 'draft')`).run();
});
afterEach(() => {
  __setDbForTesting(null);
  db.close();
  __setStoreRootForTesting(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('createPaymentProof', () => {
  it('records the proof and moves the invoice into the queue', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG, originalName: 'receipt.png' }, { amount: 100, note: ' paid via bank ' });
    expect(proof.status).toBe('pending');
    expect(proof.amount).toBe(100);
    expect(proof.note).toBe('paid via bank');
    expect(proof.original_name).toBe('receipt.png');
    expect(invoiceStatus('i1')).toBe('awaiting_verification');
  });

  it('never marks the invoice paid on upload', () => {
    // Otherwise any client clears their own balance with any file.
    createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(invoiceStatus('i1')).not.toBe('paid');
  });

  it('refuses another client invoice', () => {
    expect(() => createPaymentProof('c1', 'i2', 'cu1', { buffer: PNG })).toThrow(/Invoice not found/);
    expect(invoiceStatus('i2')).toBe('sent');
  });

  it('refuses an invoice that is not awaiting payment', () => {
    expect(() => createPaymentProof('c1', 'i-draft', 'cu1', { buffer: PNG })).toThrow(/not awaiting payment/);
  });

  it('leaves no row and no status change when the file is rejected', () => {
    expect(() => createPaymentProof('c1', 'i1', 'cu1', { buffer: Buffer.from('<?php ?>') })).toThrow();
    expect(listProofsForInvoice('i1')).toHaveLength(0);
    expect(invoiceStatus('i1')).toBe('sent');
  });

  it('rejects a negative amount', () => {
    expect(() => createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG }, { amount: -5 })).toThrow(/positive number/);
  });

  it('accepts a second proof while one is still pending', () => {
    createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(listProofsForInvoice('i1')).toHaveLength(2);
  });
});

describe('reading a proof', () => {
  it('refuses another client proof by id', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(getClientProof('c2', proof.id)).toBeUndefined();
    expect(getClientProof('c1', proof.id)).toBeDefined();
  });

  it('refuses a proof on another staff user invoice', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(getStaffProof('u2', proof.id)).toBeUndefined();
    expect(getStaffProof('u1', proof.id)).toBeDefined();
  });
});

describe('acceptPaymentProof', () => {
  it('marks the invoice paid', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    const reviewed = acceptPaymentProof('u1', proof.id);
    expect(reviewed.status).toBe('accepted');
    expect(reviewed.reviewed_by).toBe('u1');
    expect(invoiceStatus('i1')).toBe('paid');
  });

  it('closes every other pending proof on the settled invoice', () => {
    const first = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    acceptPaymentProof('u1', first.id);
    expect(listProofsForInvoice('i1').every((p) => p.status === 'accepted')).toBe(true);
  });

  it('refuses a proof belonging to another staff user', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(() => acceptPaymentProof('u2', proof.id)).toThrow(/not found/);
    expect(invoiceStatus('i1')).toBe('awaiting_verification');
  });

  it('refuses to review the same proof twice', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    acceptPaymentProof('u1', proof.id);
    expect(() => acceptPaymentProof('u1', proof.id)).toThrow(/already accepted/);
  });
});

describe('rejectPaymentProof', () => {
  it('returns the invoice to sent with a reason recorded', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    const reviewed = rejectPaymentProof('u1', proof.id, '  wrong amount  ');
    expect(reviewed.status).toBe('rejected');
    expect(reviewed.reject_reason).toBe('wrong amount');
    expect(invoiceStatus('i1')).toBe('sent');
  });

  it('keeps the invoice in the queue while another proof is undecided', () => {
    const first = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    rejectPaymentProof('u1', first.id, 'unreadable');
    expect(invoiceStatus('i1')).toBe('awaiting_verification');
  });

  it('demands a reason', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(() => rejectPaymentProof('u1', proof.id, '   ')).toThrow(/why it was rejected/);
    expect(invoiceStatus('i1')).toBe('awaiting_verification');
  });

  it('does not resurrect an invoice that was settled another way', () => {
    // Staff marked it paid by hand while a proof sat pending; rejecting that
    // stale proof must not drag the invoice back to sent.
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    db.prepare("UPDATE invoices SET status = 'paid' WHERE id = 'i1'").run();
    rejectPaymentProof('u1', proof.id, 'duplicate');
    expect(invoiceStatus('i1')).toBe('paid');
  });
});

describe('countPendingProofs', () => {
  it('counts only proofs on the staff user own invoices', () => {
    createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(countPendingProofs('u1')).toBe(1);
    expect(countPendingProofs('u2')).toBe(0);
  });

  it('stops counting once reviewed', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    acceptPaymentProof('u1', proof.id);
    expect(countPendingProofs('u1')).toBe(0);
  });
});

describe('the stored file', () => {
  it('lands in the proofs directory and holds the uploaded bytes', () => {
    const proof = createPaymentProof('c1', 'i1', 'cu1', { buffer: PNG });
    expect(proof.storage_path.startsWith('proofs/')).toBe(true);
    expect(fs.readFileSync(resolveStoredPath(proof.storage_path)).equals(PNG)).toBe(true);
  });
});
