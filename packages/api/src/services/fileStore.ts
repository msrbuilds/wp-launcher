import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { ValidationError } from '../utils/errors';

/**
 * The one place uploaded files are validated, written and read.
 *
 * Shared by payment proofs and card attachments: both accept a small set of
 * document formats from someone we do not fully trust, and both must be served
 * through an authenticated route rather than a guessable public URL.
 */

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** The kinds of file we store, each in its own directory. */
export type FileKind = 'proofs' | 'attachments';

export interface StoredFile {
  /** Relative to the store root, so the data directory can move. */
  storagePath: string;
  mime: string;
  sizeBytes: number;
}

interface Signature {
  mime: string;
  ext: string;
  /** Byte prefix that identifies the format. */
  magic: number[];
  /** A second prefix at an offset, for container formats like WebP. */
  at?: { offset: number; bytes: number[] };
}

/**
 * Accepted formats, identified by their leading bytes.
 *
 * The declared Content-Type is supplied by whoever uploads and is therefore
 * not evidence of anything. A .png that is really an HTML document would be
 * served back as an image only until a browser sniffed it.
 */
const SIGNATURES: Signature[] = [
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  {
    mime: 'image/webp',
    ext: 'webp',
    magic: [0x52, 0x49, 0x46, 0x46], // "RIFF"
    at: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // "WEBP"
  },
];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((byte, i) => buf[offset + i] === byte);
}

/**
 * Identify a buffer by its contents, or return null if it is not a format we
 * accept. Callers must treat null as a rejection — never fall back to the
 * declared type.
 */
export function detectFileType(buf: Buffer): { mime: string; ext: string } | null {
  for (const sig of SIGNATURES) {
    if (!startsWith(buf, sig.magic)) continue;
    if (sig.at && !startsWith(buf, sig.at.bytes, sig.at.offset)) continue;
    return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

let rootOverride: string | null = null;

/** Test seam, mirroring `__setDbForTesting`. Pass null to restore. */
export function __setStoreRootForTesting(dir: string | null): void {
  rootOverride = dir;
}

/**
 * Under `data/`, never the checkout: platforms that re-clone on redeploy
 * (Dokploy) would otherwise delete every payment document on the next deploy.
 */
export function storeRoot(): string {
  return rootOverride ?? path.join(config.dataDir, 'uploads');
}

/**
 * Resolve a stored path against the root, refusing anything that escapes it.
 *
 * The path comes from a database row rather than a request, but a traversal
 * that ever got written would otherwise turn an authenticated download into a
 * read of any file the API can see.
 */
export function resolveStoredPath(storagePath: string): string {
  const root = path.resolve(storeRoot());
  const resolved = path.resolve(root, storagePath);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ValidationError('Refusing to read outside the file store');
  }
  return resolved;
}

/**
 * Validate and write a file, returning what the caller should record.
 *
 * The stored name is random: the uploader's filename is kept in the database
 * for display only, so it can never decide where bytes land or what they are
 * called on disk.
 */
export function storeFile(kind: FileKind, buf: Buffer): StoredFile {
  if (!buf || buf.length === 0) throw new ValidationError('The file is empty');
  if (buf.length > MAX_FILE_BYTES) {
    throw new ValidationError(`Files must be ${Math.floor(MAX_FILE_BYTES / (1024 * 1024))} MB or smaller`);
  }
  const type = detectFileType(buf);
  if (!type) throw new ValidationError('Only PNG, JPEG, WebP and PDF files are accepted');

  const relative = path.posix.join(kind, `${crypto.randomUUID()}.${type.ext}`);
  const target = resolveStoredPath(relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buf);

  return { storagePath: relative, mime: type.mime, sizeBytes: buf.length };
}

export function readStoredFile(storagePath: string): Buffer {
  return fs.readFileSync(resolveStoredPath(storagePath));
}

/** Best-effort: a row deleted with its file already gone is not an error. */
export function deleteStoredFile(storagePath: string): void {
  try {
    fs.unlinkSync(resolveStoredPath(storagePath));
  } catch {
    /* already gone */
  }
}

/**
 * A filename safe to put in a Content-Disposition header.
 *
 * Quotes, newlines and path separators are stripped rather than escaped: the
 * name is cosmetic, and a header-splitting attempt should not survive in any
 * form.
 */
export function safeDownloadName(original: string | null | undefined, fallback = 'download'): string {
  const base = path.basename(String(original ?? '')).replace(/["\\\r\n]/g, '').trim();
  return base || fallback;
}
