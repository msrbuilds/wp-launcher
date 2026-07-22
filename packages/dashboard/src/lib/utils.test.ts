import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('drops falsy values', () => {
    expect(cn('a', false && 'b', undefined, 'c')).toBe('a c');
  });

  it('lets a later tailwind class win over an earlier conflicting one', () => {
    expect(cn('p-2', 'p-6')).toBe('p-6');
    expect(cn('text-muted-foreground', 'text-foreground')).toBe('text-foreground');
  });

  it('keeps non-conflicting utilities', () => {
    expect(cn('rounded-xl border', 'p-6')).toBe('rounded-xl border p-6');
  });
});
