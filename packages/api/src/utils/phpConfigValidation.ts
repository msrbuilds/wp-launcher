import { ValidationError } from './errors.js';

const MEMORY_REGEX = /^(-1|0|\d+[MmGgKk])$/;
const NUMERIC_REGEX = /^\d+$/;
const DISPLAY_ERRORS_REGEX = /^(On|Off|0|1)$/i;
const XDEBUG_MODE_REGEX = /^(off|develop|debug|profile|trace|coverage)(,(off|develop|debug|profile|trace|coverage))*$/;

const ALLOWED_EXTENSIONS = new Set([
  'redis', 'xdebug', 'sockets', 'calendar', 'pcntl', 'ldap', 'gettext',
]);

interface PhpConfigInput {
  memoryLimit?: string;
  uploadMaxFilesize?: string;
  postMaxSize?: string;
  maxExecutionTime?: string;
  maxInputVars?: string;
  displayErrors?: string;
  extensions?: string;
  xdebugMode?: string;
}

export function validatePhpConfig(body: PhpConfigInput): void {
  if (body.memoryLimit !== undefined && !MEMORY_REGEX.test(body.memoryLimit)) {
    throw new ValidationError('Invalid memoryLimit: must be a number followed by M, G, or K (e.g. 256M)');
  }
  if (body.uploadMaxFilesize !== undefined && !MEMORY_REGEX.test(body.uploadMaxFilesize)) {
    throw new ValidationError('Invalid uploadMaxFilesize: must be a number followed by M, G, or K (e.g. 64M)');
  }
  if (body.postMaxSize !== undefined && !MEMORY_REGEX.test(body.postMaxSize)) {
    throw new ValidationError('Invalid postMaxSize: must be a number followed by M, G, or K (e.g. 64M)');
  }
  if (body.maxExecutionTime !== undefined && !NUMERIC_REGEX.test(body.maxExecutionTime)) {
    throw new ValidationError('Invalid maxExecutionTime: must be a positive integer (e.g. 300)');
  }
  if (body.maxInputVars !== undefined && !NUMERIC_REGEX.test(body.maxInputVars)) {
    throw new ValidationError('Invalid maxInputVars: must be a positive integer (e.g. 3000)');
  }
  if (body.displayErrors !== undefined && !DISPLAY_ERRORS_REGEX.test(body.displayErrors)) {
    throw new ValidationError('Invalid displayErrors: must be On, Off, 0, or 1');
  }
  if (body.extensions !== undefined) {
    const exts = body.extensions.split(',').map((e: string) => e.trim()).filter(Boolean);
    for (const ext of exts) {
      if (!ALLOWED_EXTENSIONS.has(ext.toLowerCase())) {
        throw new ValidationError(`Invalid extension '${ext}': allowed extensions are ${[...ALLOWED_EXTENSIONS].join(', ')}`);
      }
    }
  }
  if (body.xdebugMode !== undefined && !XDEBUG_MODE_REGEX.test(body.xdebugMode)) {
    throw new ValidationError('Invalid xdebugMode: must be a comma-separated list of off, develop, debug, profile, trace, coverage');
  }
}
