import { describe, it, expect } from 'vitest';
import { needsAdminForBlueprintRequest } from './blueprintGuard';

describe('needsAdminForBlueprintRequest', () => {
  it('leaves plain reads public — the launch page and demo portal are anonymous', () => {
    expect(needsAdminForBlueprintRequest('GET', {})).toBe(false);
    expect(needsAdminForBlueprintRequest('GET', { full: 'false' })).toBe(false);
  });

  /**
   * `?full=true` returns the unsanitized blueprint: docker config, plugin lists
   * and demo.admin_email, all of which sanitizeBlueprint strips for anonymous
   * callers. Serving that without auth defeats the sanitizer entirely.
   */
  it('requires admin for the full payload', () => {
    expect(needsAdminForBlueprintRequest('GET', { full: 'true' })).toBe(true);
  });

  it('requires admin for every write', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(needsAdminForBlueprintRequest(method, {})).toBe(true);
    }
  });

  it('is not fooled by a repeated query parameter', () => {
    // Express parses ?full=true&full=x into an array; anything containing the
    // full payload request must still be gated.
    expect(needsAdminForBlueprintRequest('GET', { full: ['true', 'x'] })).toBe(true);
  });
});
