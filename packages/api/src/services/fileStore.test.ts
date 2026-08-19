import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  detectFileType, storeFile, readStoredFile, deleteStoredFile, resolveStoredPath,
  safeDownloadName, MAX_FILE_BYTES, __setStoreRootForTesting,
} from './fileStore';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PDF = Buffer.from('%PDF-1.7\n%anything');
const WEBP = Buffer.concat([
  Buffer.from('RIFF'), Buffer.from([0x1a, 0x00, 0x00, 0x00]), Buffer.from('WEBPVP8 '),
]);

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'wpl-filestore-'));
  __setStoreRootForTesting(root);
});
afterEach(() => {
  __setStoreRootForTesting(null);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('detectFileType', () => {
  it('recognises every accepted format', () => {
    expect(detectFileType(PNG)?.mime).toBe('image/png');
    expect(detectFileType(JPEG)?.mime).toBe('image/jpeg');
    expect(detectFileType(PDF)?.mime).toBe('application/pdf');
    expect(detectFileType(WEBP)?.mime).toBe('image/webp');
  });

  it('rejects a RIFF container that is not WebP', () => {
    // A .wav is RIFF too. Matching only the first four bytes would accept it.
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WAVEfmt ')]);
    expect(detectFileType(wav)).toBeNull();
  });

  it('rejects a file whose contents are not one of the accepted formats', () => {
    expect(detectFileType(Buffer.from('<html><script>alert(1)</script>'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ\x90\x00'))).toBeNull(); // a Windows executable
  });

  it('does not read past the end of a short buffer', () => {
    expect(detectFileType(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(detectFileType(Buffer.alloc(0))).toBeNull();
  });
});

describe('storeFile', () => {
  it('writes the bytes and reports what to record', () => {
    const stored = storeFile('proofs', PNG);
    expect(stored.mime).toBe('image/png');
    expect(stored.sizeBytes).toBe(PNG.length);
    expect(stored.storagePath.startsWith('proofs/')).toBe(true);
    expect(readStoredFile(stored.storagePath).equals(PNG)).toBe(true);
  });

  it('names the file itself rather than trusting the uploader', () => {
    // Two uploads of identical bytes must not collide, and nothing the
    // uploader controls reaches the path.
    const a = storeFile('proofs', PNG);
    const b = storeFile('proofs', PNG);
    expect(a.storagePath).not.toBe(b.storagePath);
  });

  it('rejects a disguised file by its contents, not its extension', () => {
    // The whole point of magic-byte validation: this is what a client would
    // upload as "receipt.png".
    expect(() => storeFile('proofs', Buffer.from('<?php system($_GET[0]); ?>')))
      .toThrow(/PNG, JPEG, WebP and PDF/);
  });

  it('rejects an empty file', () => {
    expect(() => storeFile('proofs', Buffer.alloc(0))).toThrow(/empty/);
  });

  it('rejects a file over the size cap', () => {
    const huge = Buffer.concat([PNG, Buffer.alloc(MAX_FILE_BYTES)]);
    expect(() => storeFile('proofs', huge)).toThrow(/5 MB or smaller/);
  });

  it('keeps kinds in separate directories', () => {
    expect(storeFile('attachments', PDF).storagePath.startsWith('attachments/')).toBe(true);
  });
});

describe('resolveStoredPath', () => {
  it('refuses a path that escapes the store', () => {
    expect(() => resolveStoredPath('../../wp-launcher.db')).toThrow(/outside the file store/);
    expect(() => resolveStoredPath('proofs/../../secrets')).toThrow(/outside the file store/);
  });

  it('refuses an absolute path', () => {
    const elsewhere = path.resolve(os.tmpdir(), 'not-the-store', 'x.png');
    expect(() => resolveStoredPath(elsewhere)).toThrow(/outside the file store/);
  });

  it('allows an ordinary stored path', () => {
    expect(resolveStoredPath('proofs/abc.png')).toBe(path.resolve(root, 'proofs', 'abc.png'));
  });
});

describe('deleteStoredFile', () => {
  it('removes the file', () => {
    const stored = storeFile('proofs', PNG);
    deleteStoredFile(stored.storagePath);
    expect(fs.existsSync(resolveStoredPath(stored.storagePath))).toBe(false);
  });

  it('is silent when the file is already gone', () => {
    expect(() => deleteStoredFile('proofs/never-existed.png')).not.toThrow();
  });
});

describe('safeDownloadName', () => {
  it('strips a path so a name cannot suggest a directory', () => {
    expect(safeDownloadName('../../etc/passwd')).toBe('passwd');
  });

  it('strips quotes and newlines that would break out of the header', () => {
    expect(safeDownloadName('a"; x=1\r\nSet-Cookie: y=2')).toBe('a; x=1Set-Cookie: y=2');
  });

  it('falls back when nothing usable is left', () => {
    expect(safeDownloadName('')).toBe('download');
    expect(safeDownloadName(null)).toBe('download');
    expect(safeDownloadName('"""')).toBe('download');
  });
});
